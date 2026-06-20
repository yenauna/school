function setActivePage(pageId) {
  $$('.page').forEach(page => page.classList.toggle('active', page.id === pageId));
  $$('nav button[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === pageId));
}

function showNoticeDialog() {
  const dialog = $('#noticeDialog');
  const form = $('#noticeForm');
  if (!dialog || !form) return;
  form.reset();
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

function getInitialPage() {
  const pageId = window.location.hash.replace('#', '');
  return $$('.page').some(page => page.id === pageId) ? pageId : 'main';
}

function showNoticeForm() {
  const form = $('#noticeForm');
  if (!form) return;
  form.classList.remove('hidden');
  $('input[name="title"]', form)?.focus();
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
    const deadline = n.time ? `마감일: ${ymd(n.time)} ${hm(n.time)}` : '마감일 없음';
    const meta = [deadline, n.place].filter(Boolean).join(' · ');
    return `<article class="notice-item"><div class="notice-title">${n.title}</div><div class="muted">${meta}</div><p>${n.content || ''}</p><button class="secondary" data-delete-notice="${n.id}">삭제</button></article>`;
  }).join('') || '<p class="muted">등록된 공지가 없습니다.</p>';}

async function renderToday() {
  const workList = $('#todayWorkList');
  const timetable = $('#todayTimetable');
  const subjects = await getSubjects();
  const now = today();
  if (workList) {
    const events = (await selectRows('events')).filter(e => e.event_date === now || e.date === now || (e.time || '').slice(0, 10) === now);
    workList.innerHTML = events.map(e => `<div class="mini-item"><b>${e.title}</b><div class="muted">${hm(e.event_time || e.time)} ${e.place || ''}</div></div>`).join('') || '<p class="muted">오늘 업무일정이 없습니다.</p>';
  }
  if (timetable) {
    const lessons = (await selectRows('timetables')).filter(t => t.date === now || t.lesson_date === now);
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

$('#showNoticeFormBtn')?.addEventListener('click', showNoticeDialog);
$('#closeNoticeDialogBtn')?.addEventListener('click', closeNoticeDialog);

window.addEventListener('hashchange', () => setActivePage(getInitialPage()));

$('#showNoticeFormBtn')?.addEventListener('click', showNoticeForm);

$('#noticeForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const data = formData(e.currentTarget);
  await insertRow('notices', { title: data.title, place: data.place, time: data.time || null, content: data.content });
  e.currentTarget.reset();
  closeNoticeDialog();
  await renderNotices();
  await renderToday();
});

$('#noticeList')?.addEventListener('click', async e => {
  const id = e.target.dataset.deleteNotice;
  if (!id) return;
  await deleteRow('notices', id);
  await renderNotices();
});

renderClassInfo();
renderNotices();
renderToday();
renderIndexControls();
setActivePage(getInitialPage());
