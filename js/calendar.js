let weekStart = startOfWeek(new Date());
let editingLesson = null;
let editingEventId = null;
let calendarSubjects = [];

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}

function weekDates() {
  return Array.from({ length: 5 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });
}

function slotId(date, period, classNo) {
  return `${date}-${period}-${classNo}`;
}

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function periodLabel(period, periodCount) {
  if (Number(period) === 0) return '아침';
  if (Number(period) === periodCount + 1) return '방과후';
  return `${period}교시`;
}

function eventPeriodValue(event, periodCount) {
  const value = Number(event.period);
  return Number.isFinite(value) ? value : periodCount + 1;
}

function periodRows(periodCount) {
  return [0, ...Array.from({ length: periodCount }, (_, i) => i + 1), periodCount + 1];
}

function fillSubjectOptions(subjects) {
  const options = $('#subjectOptions');
  if (!options) return;
  options.innerHTML = subjects.map(s => `<option value="${esc(s.code)}">${esc(s.label || s.code)}</option>`).join('');
}

function markConflicts() {
  $$('.slot').forEach(slot => slot.classList.remove('conflict'));
  const groups = new Map();
  $$('.slot').forEach(slot => {
    const code = slot.textContent.trim();
    const subject = calendarSubjects.find(s => s.code === code);
    if (!code || !subject?.conflict_group) return;
    const key = `${slot.dataset.date}-${slot.dataset.period}-${code}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(slot);
  });
  groups.forEach(slots => {
    if (slots.length > 1) slots.forEach(slot => slot.classList.add('conflict'));
  });
}

function renderEventPeriodButtons(periodCount, selected = periodCount + 1) {
  const wrap = $('.event-period-buttons');
  if (!wrap) return;
  wrap.innerHTML = periodRows(periodCount).map(period => (
    `<button type="button" data-event-period="${period}" class="${Number(period) === Number(selected) ? 'active' : ''}">${periodLabel(period, periodCount)}</button>`
  )).join('');
}

async function renderCalendar() {
  const grid = $('#calendarGrid');
  if (!grid) return;
  const settings = await getAppSettings();
  const periodCount = Number(settings.period_count) || 6;
  const classCount = Number(settings.class_count) || 6;
  const subjects = await getSubjects();
  calendarSubjects = subjects;
  fillSubjectOptions(subjects);
  renderEventPeriodButtons(periodCount, Number($('[name="period"]', $('#eventForm'))?.value) || periodCount + 1);
  const events = await selectRows('events');
  const timetables = await selectRows('timetables');
  document.documentElement.style.setProperty('--class-count', classCount);
  $('#weekPicker').value = iso(weekStart);
  const dates = weekDates();
  let html = '<div class="cell head">교시</div>' + dates.map(d => `<div class="cell head">${ymd(iso(d))}</div>`).join('');
  for (const p of periodRows(periodCount)) {
    html += `<div class="cell period-head">${periodLabel(p, periodCount)}</div>`;
    for (const d of dates) {
      const date = iso(d);
      const dayEvents = events.filter(e => e.event_date === date && eventPeriodValue(e, periodCount) === p);
      const slots = p === 0 || p === periodCount + 1 ? '' : `<div class="daybox">${Array.from({ length: classCount }, (_, i) => {
      const classNo = i + 1;
        const saved = timetables.find(t => (t.date || t.lesson_date) === date && Number(t.period) === p && Number(t.class_no || t.classNo) === classNo);
        const code = saved?.subject_code || saved?.subjectCode || '';
        const memo = saved?.memo || '';
        const color = subjects.find(s => s.code === code)?.color || '#fff';
        return `<button type="button" class="slot" data-date="${date}" data-period="${p}" data-class-no="${classNo}" data-memo="${esc(memo)}" style="background:${color}">${esc(code)}</button>`;
      }).join('')}</div>`;
      html += `<div class="cell">${slots}${dayEvents.map(e => `<button type="button" class="event-strip" data-event-id="${esc(e.id)}">${esc(hm(e.event_time))} ${esc(e.title)}</button>`).join('')}</div>`;
    }
  }
  grid.innerHTML = html;
  markConflicts();
}

async function saveTimetable() {
  const rows = $$('.slot').map(el => ({ id: slotId(el.dataset.date, el.dataset.period, el.dataset.classNo), date: el.dataset.date, period: Number(el.dataset.period), class_no: Number(el.dataset.classNo), subject_code: el.textContent.trim(), memo: el.dataset.memo || '' })).filter(r => r.subject_code);
  await upsertRows('timetables', rows);
  await renderCalendar();
}

function openLessonDialog(slot) {
  editingLesson = slot;
  $('#lessonMeta').textContent = `${slot.dataset.date} · ${slot.dataset.period}교시 · ${slot.dataset.classNo}반`;
  $('#lessonSubject').value = slot.textContent.trim();
  $('#lessonMemo').value = slot.dataset.memo || '';
  $('#eventDialog')?.close();
  $('#lessonDialog').showModal();
}

async function saveLesson() {
  if (!editingLesson) return;
  const row = { id: slotId(editingLesson.dataset.date, editingLesson.dataset.period, editingLesson.dataset.classNo), date: editingLesson.dataset.date, period: Number(editingLesson.dataset.period), class_no: Number(editingLesson.dataset.classNo), subject_code: $('#lessonSubject').value.trim(), memo: $('#lessonMemo').value.trim() };
  if (row.subject_code) await upsertRows('timetables', [row]);
  else await deleteRow('timetables', row.id);
  $('#lessonDialog').close();
  editingLesson = null;
  await renderCalendar();
}

async function openEventDialog(eventId = '') {
  const settings = await getAppSettings();
  const periodCount = Number(settings.period_count) || 6;
  const events = eventId ? await selectRows('events') : [];
  const event = events.find(e => e.id === eventId);
  editingEventId = event?.id || null;
  $('#eventForm').reset();
  $('[name="event_date"]', $('#eventForm')).value = event?.event_date || today();
  $('[name="period"]', $('#eventForm')).value = eventPeriodValue(event || {}, periodCount);
  if (event) Object.entries(event).forEach(([key, value]) => { const input = $(`[name="${key}"]`, $('#eventForm')); if (input) input.value = value || ''; });
  renderEventPeriodButtons(periodCount, $('[name="period"]', $('#eventForm')).value);
  $('#eventDialog').showModal();
}


$('#prevWeek')?.addEventListener('click', () => { weekStart.setDate(weekStart.getDate() - 7); renderCalendar(); });
$('#nextWeek')?.addEventListener('click', () => { weekStart.setDate(weekStart.getDate() + 7); renderCalendar(); });
$('#weekPicker')?.addEventListener('change', e => { weekStart = startOfWeek(new Date(e.target.value)); renderCalendar(); });
$('#saveTimetable')?.addEventListener('click', saveTimetable);
$('#addEventBtn')?.addEventListener('click', () => openEventDialog());
$('#closeDialog')?.addEventListener('click', () => $('#eventDialog').close());
$('#calendarGrid')?.addEventListener('click', e => {
  const slot = e.target.closest('.slot');
  const eventStrip = e.target.closest('.event-strip');
  if (slot) openLessonDialog(slot);
  if (eventStrip) openEventDialog(eventStrip.dataset.eventId);
});
$('.event-period-buttons')?.addEventListener('click', e => {
  const button = e.target.closest('[data-event-period]');
  if (!button) return;
  $('[name="period"]', $('#eventForm')).value = button.dataset.eventPeriod;
  $$('.event-period-buttons button').forEach(btn => btn.classList.toggle('active', btn === button));
});
$('#lessonCancel')?.addEventListener('click', () => $('#lessonDialog').close());
$('#deleteLesson')?.addEventListener('click', async () => {
  if (!editingLesson) return;
  await deleteRow('timetables', slotId(editingLesson.dataset.date, editingLesson.dataset.period, editingLesson.dataset.classNo));
  $('#lessonDialog').close();
  editingLesson = null;
  await renderCalendar();
});
$('#lessonForm')?.addEventListener('submit', async e => { e.preventDefault(); await saveLesson(); });
$('#eventForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const row = formData(e.currentTarget);
  if (editingEventId) row.id = editingEventId;
  await upsertRows('events', [row]);
  editingEventId = null;
  $('#eventDialog').close();
  await renderCalendar();
});

renderCalendar();
