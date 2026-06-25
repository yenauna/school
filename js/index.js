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
    form.elements.time.value = notice.time ? String(notice.time).slice(0, 16) : '';
    form.elements.content.value = notice.content || '';
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
    return `<article class="notice-item info-item" data-info-id="${escapeHtml(info.id)}"><div class="notice-title-row"><div class="notice-title">${titleHtml}</div><div class="notice-actions"><button class="secondary notice-delete-button" data-delete-info="${escapeHtml(info.id)}" type="button">삭제</button></div></div>${info.content ? `<p class="notice-content">${escapeHtml(info.content)}</p>` : ''}</article>`;
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
  const notices = await selectRows('notices');
  list.innerHTML = notices.map(n => {
    const deadline = n.time ? `마감일: ${ymd(n.time)} ${hm(n.time)}` : '';
    const meta = [deadline, n.place].filter(Boolean).map(escapeHtml).join(' · ');
    return `<article class="notice-item" data-notice-id="${escapeHtml(n.id)}"><div class="notice-title-row"><div class="notice-title">${escapeHtml(n.title)}</div><div class="notice-actions"><button class="secondary notice-edit-button" data-edit-notice="${escapeHtml(n.id)}" type="button">수정</button><button class="secondary notice-delete-button" data-delete-notice="${escapeHtml(n.id)}" type="button">삭제</button></div></div><div class="muted">${meta}</div><p class="notice-content">${escapeHtml(n.content || '')}</p></article>`;
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

    if (!lessons.length) {
      timetable.innerHTML = '<p class="muted">오늘 수업시간표가 없습니다.</p>';
      return;
    }

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

    timetable.innerHTML = `<div class="today-timetable-grid" style="--today-class-count:${classCount}"><div class="today-timetable-corner">교시</div>${classHeaders}${rows}</div>`;
    timetable.innerHTML = lessons.map(l => `<span class="legend-chip"><span class="color-dot" style="background:${subjects.find(s => s.code === (l.subject_code || l.subjectCode))?.color || '#fff'}"></span>${l.class_no || l.classNo || ''}반 ${l.period}교시 ${l.subject_code || l.subjectCode || ''}</span>`).join('') || '<p class="muted">오늘 수업시간표가 없습니다.</p>';
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

window.addEventListener('hashchange', () => setActivePage(getInitialPage()));

$('#noticeForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const data = formData(e.currentTarget);
  const notice = { title: data.title, place: data.place, time: data.time || null, content: data.content || '' };
  const editingNoticeId = e.currentTarget.dataset.editingNoticeId;
  if (editingNoticeId) {
    await updateRow('notices', editingNoticeId, notice);
  } else {
    await insertRow('notices', notice);
  }
  e.currentTarget.reset();
  closeNoticeDialog();
  await renderNotices();
  await renderToday();
});

$('#noticeList')?.addEventListener('click', async e => {
  const deleteId = e.target.dataset.deleteNotice;
  if (deleteId) {
    await deleteRow('notices', deleteId);
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
  await insertRow('infos', {
    title: data.title,
    url: normalizeInfoUrl(data.url),
    content: data.content || ''
  });
  e.currentTarget.reset();
  await renderInfo();
});

$('#infoList')?.addEventListener('click', async e => {
  const deleteId = e.target.dataset.deleteInfo;
  if (!deleteId) return;
  await deleteRow('infos', deleteId);
  await renderInfo();
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
