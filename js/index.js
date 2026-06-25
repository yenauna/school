const NOTICE_CHECKLIST_STORAGE_KEY = 'noticeChecklistState';

function readNoticeChecklistState() {
  try {
    const state = JSON.parse(localStorage.getItem(NOTICE_CHECKLIST_STORAGE_KEY) || '{}');
    return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  } catch (error) {
    console.error('공지사항 체크리스트 상태를 읽을 수 없습니다.', error);
    return {};
  }
}

function writeNoticeChecklistState(state) {
  localStorage.setItem(NOTICE_CHECKLIST_STORAGE_KEY, JSON.stringify(state));
}

function noticeChecklistEntry(noticeId) {
  const state = readNoticeChecklistState();
  const entry = state[String(noticeId)] || {};
  return { enabled: Boolean(entry.enabled), completed: Array.isArray(entry.completed) ? entry.completed.map(Number) : [] };
}

function saveNoticeChecklistEntry(noticeId, entry) {
  const state = readNoticeChecklistState();
  state[String(noticeId)] = { enabled: Boolean(entry.enabled), completed: [...new Set((entry.completed || []).map(Number))].sort((a, b) => a - b) };
  writeNoticeChecklistState(state);
}

function removeNoticeChecklistEntry(noticeId) {
  const state = readNoticeChecklistState();
  delete state[String(noticeId)];
  writeNoticeChecklistState(state);
}

function renderNoticeChecklist(noticeId, classCount) {
  const entry = noticeChecklistEntry(noticeId);
  if (!entry.enabled) return '';
  const completed = new Set(entry.completed);
  const buttons = Array.from({ length: classCount }, (_, i) => {
    const classNo = i + 1;
    const isDone = completed.has(classNo);
    return `<button class="notice-check-button${isDone ? ' completed' : ''}" data-toggle-notice-check="${escapeHtml(noticeId)}" data-class-no="${classNo}" type="button" aria-pressed="${isDone}">${classNo}반</button>`;
  }).join('');
  return `<div class="notice-checklist" aria-label="공지사항 완료 체크리스트">${buttons}</div>`;
}

function splitNoticeDateTime(value) {
  const text = String(value || '');
  if (!text) return { date: '', time: '' };
  if (text.includes('T')) {
    const [date, time = ''] = text.split('T');
    return { date: date.slice(0, 10), time: time.slice(0, 5) };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { date: text, time: '' };
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return { date: text.slice(0, 10), time: '' };
  return { date: iso(parsed), time: hm(text) };
}

function combineNoticeDateTime(date, time) {
  const day = String(date || '').trim();
  const clock = String(time || '').trim();
  if (!day) return null;
  return clock ? `${day}T${clock}` : day;
}

function formatNoticeDeadline(value) {
  const { date, time } = splitNoticeDateTime(value);
  if (!date) return '';
  return `마감일: ${ymd(date)}${time ? ` ${time}` : ''}`;
}

function setActivePage(pageId) {
  $$('.page').forEach(page => page.classList.toggle('active', page.id === pageId));
  $$('nav button[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === pageId));
}

function showNoticeDialog(notice = null) {
  const dialog = $('#noticeDialog');
  const form = $('#noticeForm');
  if (!dialog || !form) return;
  form.reset();
  form.dataset.editingNoticeId = notice?.id || '';
  if (notice) {
    form.elements.title.value = notice.title || '';
    form.elements.place.value = notice.place || '';
    const dateTime = splitNoticeDateTime(notice.time);
    form.elements.date.value = dateTime.date;
    form.elements.time.value = dateTime.time;
    form.elements.content.value = notice.content || '';
    form.elements.checklist.checked = noticeChecklistEntry(notice.id).enabled;
  }
  $('.notice-dialog-title', form).textContent = notice ? '공지사항 수정' : '공지사항 추가';
  $('.notice-submit-button', form).textContent = notice ? '공지 수정' : '공지 추가';
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
  $('input[name="title"]', form)?.focus();
}

function closeNoticeDialog() {
  const dialog = $('#noticeDialog');
  if (!dialog) return;
  if (typeof dialog.close === 'function') {
    dialog.close();
  } else {
    dialog.removeAttribute('open');
  }
}

function normalizeInfoUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
}

function openDialog(dialog) {
  if (!dialog) return;
  if (dialog.parentElement !== document.body) {
    document.body.appendChild(dialog);
  }
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

function showInfoDialog(info = null) {
  const dialog = $('#infoDialog');
  const form = $('#infoForm');
  if (!dialog || !form) return;
  form.reset();
  form.dataset.editingInfoId = info?.id || '';
  if (info) {
    form.elements.title.value = info.title || '';
    form.elements.url.value = info.url || '';
    form.elements.content.value = info.content || '';
  }
  $('.info-dialog-title', form).textContent = info ? '정보 수정' : '정보 추가';
  $('.info-submit-button', form).textContent = info ? '정보 수정' : '정보 추가';
  openDialog(dialog);
  form.elements.title.focus();
}

function closeInfoDialog() {
  const dialog = $('#infoDialog');
  if (!dialog) return;
  if (typeof dialog.close === 'function') {
    dialog.close();
  } else {
    dialog.removeAttribute('open');
  }
}

function resetInfoForm() {
  const form = $('#infoForm');
  if (!form) return;
  form.reset();
  form.dataset.editingInfoId = '';
  $('.info-dialog-title', form).textContent = '정보 추가';
  $('.info-submit-button', form).textContent = '정보 추가';
}

async function renderInfo() {
  const list = $('#infoList');
  if (!list) return;
  const infos = await selectRows('infos');
  list.innerHTML = infos.map(info => {
    const url = normalizeInfoUrl(info.url);
    const title = escapeHtml(info.title);
    const titleHtml = url
      ? `<a class="info-title-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${title}</a>`
      : title;
  return `<article class="notice-item info-item" data-info-id="${escapeHtml(info.id)}"><div class="notice-title-row"><div class="notice-title">${titleHtml}</div><div class="notice-actions"><button class="secondary notice-edit-button" data-edit-info="${escapeHtml(info.id)}" type="button">수정</button><button class="secondary notice-delete-button" data-delete-info="${escapeHtml(info.id)}" type="button">삭제</button></div></div>${info.content ? `<p class="notice-content">${escapeHtml(info.content)}</p>` : ''}</article>`;
  }).join('') || '<p class="muted">등록된 정보가 없습니다.</p>';
}

function getInitialPage() {
  const pageId = window.location.hash.replace('#', '');
  return $$('.page').some(page => page.id === pageId) ? pageId : 'main';
}

function fillSelect(select, count, suffix = '') {
  if (!select) return;
  select.innerHTML = Array.from({ length: Number(count) || 0 }, (_, i) => `<option value="${i + 1}">${i + 1}${suffix}</option>`).join('');
}

async function renderClassInfo() {
  const table = $('#classInfoTable');
  if (!table) return;
  const settings = await getAppSettings();
  const rows = Array.from({ length: Number(settings.class_count) || 6 }, (_, i) => `<tr><td>${i + 1}반</td><td contenteditable="true">담임/연락처/특이사항 입력</td></tr>`).join('');
  table.innerHTML = `<thead><tr><th>학급</th><th>기본정보</th></tr></thead><tbody>${rows}</tbody>`;
}

async function renderNotices() {
  const list = $('#noticeList');
  if (!list) return;
  const settings = await getAppSettings();
  const classCount = Number(settings.class_count) || 6;
  const notices = await selectRows('notices');
  list.innerHTML = notices.map(n => {
    const deadline = formatNoticeDeadline(n.time);
    const meta = [deadline, n.place].filter(Boolean).map(escapeHtml).join(' · ');
    return `<article class="notice-item" data-notice-id="${escapeHtml(n.id)}"><div class="notice-title-row"><div class="notice-title">${escapeHtml(n.title)}</div><div class="notice-actions"><button class="secondary notice-edit-button" data-edit-notice="${escapeHtml(n.id)}" type="button">수정</button><button class="secondary notice-delete-button" data-delete-notice="${escapeHtml(n.id)}" type="button">삭제</button></div></div><div class="muted">${meta}</div><p class="notice-content">${escapeHtml(n.content || '')}</p>${renderNoticeChecklist(n.id, classCount)}</article>`;
  }).join('') || '<p class="muted">등록된 공지사항이 없습니다.</p>';
}

function lessonDateValue(lesson) {
  return String(lesson.date || lesson.lesson_date || lesson.lessonDate || '').slice(0, 10);
}

function lessonSubjectCode(lesson) {
  return lesson.subject_code || lesson.subjectCode || lesson.subject || '';
}

function lessonClassNo(lesson) {
  return lesson.class_no ?? lesson.classNo ?? lesson.class_number ?? lesson.classNumber ?? '';
}

async function renderToday() {
  const workList = $('#todayWorkList');
  const timetable = $('#todayTimetable');
  const subjects = await getSubjects();
  const now = today();
  if (workList) {
    const events = (await selectRows('events')).filter(e => e.event_date === now || e.date === now || (e.time || '').slice(0, 10) === now);
    workList.innerHTML = events.map(e => `<div class="mini-item"><b>${escapeHtml(e.title)}</b><div class="muted">${escapeHtml(hm(e.event_time || e.time))} ${escapeHtml(e.place || '')}</div></div>`).join('') || '<p class="muted">오늘 업무일정이 없습니다.</p>';
  }
  if (timetable) {
    const settings = await getAppSettings();
    const periodCount = Number(settings.period_count) || 6;
    const classCount = Number(settings.class_count) || 6;
    const lessons = (await selectRows('timetables'))
      .filter(lesson => lessonDateValue(lesson) === now && lessonSubjectCode(lesson));

    const lessonMap = new Map(lessons.map(lesson => [`${Number(lesson.period || 0)}-${Number(lessonClassNo(lesson) || 0)}`, lesson]));
    const classHeaders = Array.from({ length: classCount }, (_, i) => `<div class="today-timetable-head">${i + 1}반</div>`).join('');
    const rows = Array.from({ length: periodCount }, (_, periodIndex) => {
      const period = periodIndex + 1;
      const cells = Array.from({ length: classCount }, (_, classIndex) => {
        const classNo = classIndex + 1;
        const lesson = lessonMap.get(`${period}-${classNo}`);
        const subjectCode = lesson ? lessonSubjectCode(lesson) : '';
        const subject = subjects.find(s => s.code === subjectCode);
        const memo = lesson?.memo || '';
        return `<div class="today-timetable-slot${memo ? ' has-memo' : ''}" style="background:${escapeHtml(subject?.color || '#fff')}" title="${escapeHtml(memo)}">${escapeHtml(subjectCode)}</div>`;
      }).join('');
      return `<div class="today-timetable-period">${period}교시</div>${cells}`;
    }).join('');

    timetable.innerHTML = `<div class="today-timetable-grid" style="--today-class-count:${classCount}"><div class="today-timetable-corner">교시</div>${classHeaders}${rows}</div>${lessons.length ? '' : '<p class="muted today-timetable-empty">오늘 수업시간표가 없습니다.</p>'}`;
  }
}

async function renderIndexControls() {
  const settings = await getAppSettings();
  fillSelect($('select[name="period"]', $('#reservationForm')), settings.period_count, '교시');
}

$$('nav button[data-page]').forEach(button => button.addEventListener('click', () => {
  setActivePage(button.dataset.page);
  history.replaceState(null, '', button.dataset.page === 'main' ? window.location.pathname : `#${button.dataset.page}`);
}));

$('#showNoticeFormBtn')?.addEventListener('click', () => showNoticeDialog());
$('#closeNoticeDialogBtn')?.addEventListener('click', closeNoticeDialog);
$('#showInfoFormBtn')?.addEventListener('click', () => showInfoDialog());
$('#closeInfoDialogBtn')?.addEventListener('click', closeInfoDialog);

window.addEventListener('hashchange', () => setActivePage(getInitialPage()));

$('#noticeForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const data = formData(e.currentTarget);
  const notice = { title: data.title, place: data.place, time: combineNoticeDateTime(data.date, data.time), content: data.content || '' };
  const editingNoticeId = e.currentTarget.dataset.editingNoticeId;
  if (editingNoticeId) {
    await updateRow('notices', editingNoticeId, notice);
    const entry = noticeChecklistEntry(editingNoticeId);
    saveNoticeChecklistEntry(editingNoticeId, { ...entry, enabled: data.checklist === 'on' });
  } else {
    const insertedNotice = await insertRow('notices', notice);
    if (insertedNotice?.id) saveNoticeChecklistEntry(insertedNotice.id, { enabled: data.checklist === 'on', completed: [] });
  }
  e.currentTarget.reset();
  closeNoticeDialog();
  await renderNotices();
  await renderToday();
});

$('#noticeList')?.addEventListener('click', async e => {
  const checkButton = e.target.closest('[data-toggle-notice-check]');
  if (checkButton) {
    const noticeId = checkButton.dataset.toggleNoticeCheck;
    const classNo = Number(checkButton.dataset.classNo);
    const entry = noticeChecklistEntry(noticeId);
    const completed = new Set(entry.completed);
    completed.has(classNo) ? completed.delete(classNo) : completed.add(classNo);
    saveNoticeChecklistEntry(noticeId, { ...entry, completed: [...completed] });
    await renderNotices();
    return;
  }
  const deleteId = e.target.dataset.deleteNotice;
  if (deleteId) {
    await deleteRow('notices', deleteId);
    removeNoticeChecklistEntry(deleteId);
    await renderNotices();
    return;
  }

  const editId = e.target.dataset.editNotice;
  if (!editId) return;
  const notices = await selectRows('notices');
  const notice = notices.find(n => n.id === editId);
  if (notice) showNoticeDialog(notice);
});

$('#infoForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const data = formData(e.currentTarget);
  const info = {
    title: data.title,
    url: normalizeInfoUrl(data.url),
    content: data.content || ''
   };
  const editingInfoId = e.currentTarget.dataset.editingInfoId;
  if (editingInfoId) {
    await updateRow('infos', editingInfoId, info);
  } else {
    await insertRow('infos', info);
  }
  resetInfoForm();
  closeInfoDialog();
  await renderInfo();
});

$('#infoList')?.addEventListener('click', async e => {
  const deleteButton = e.target.closest('[data-delete-info]');
  const deleteId = deleteButton?.dataset.deleteInfo;
  if (deleteId) {
    await deleteRow('infos', deleteId);
    if ($('#infoForm')?.dataset.editingInfoId === deleteId) {
      resetInfoForm();
      closeInfoDialog();
    }
    await renderInfo();
    return;
  }

  const editButton = e.target.closest('[data-edit-info]');
  const editId = editButton?.dataset.editInfo;
  if (!editId) return;
  const infos = await selectRows('infos');
  const info = infos.find(item => item.id === editId);
  if (info) showInfoDialog(info);
});

async function initIndexPage() {
  try {
    await Promise.all([renderClassInfo(), renderNotices(), renderInfo(), renderToday(), renderIndexControls()]);
    setActivePage(getInitialPage());
  } catch (error) {
    console.error('메인 화면을 불러오지 못했습니다.', error);
    const main = $('#main');
    if (main) main.insertAdjacentHTML('afterbegin', `<section class="card error-card"><h2>화면을 불러오지 못했습니다</h2><p>${escapeHtml(error.message || error)}</p></section>`);
  }
}

initIndexPage();
