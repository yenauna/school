let weekStart = startOfWeek(new Date());
let editingLesson = null;
let editingEventId = null;
let calendarSubjects = [];
let slotClickTimer = null;
let editingBulkSlot = null;
let bulkInputValues = {};

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function visibleWeeks() {
  return Array.from({ length: 4 }, (_, i) => addDays(weekStart, i * 7));
}

function weekDates(start = weekStart) {
  return Array.from({ length: 5 }, (_, i) => addDays(start, i));
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

function bulkSlotId(dayIndex, period, classNo) {
  return `${dayIndex}-${period}-${classNo}`;
}

function eachDateInRange(startDate, endDate) {
  const dates = [];
  const cursor = new Date(startDate);
  const end = new Date(endDate);
  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function markConflicts() {
  $$('.slot').forEach(slot => slot.classList.remove('conflict'));
  const groups = new Map();
  $$('.slot').forEach(slot => {
    const code = slot.dataset.subject || slot.textContent.trim();
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

function renderBulkInputGrid(periodCount, classCount) {
  const grid = $('#bulkInputGrid');
  if (!grid) return;
  document.documentElement.style.setProperty('--bulk-class-count', classCount);
  const weekdays = ['월', '화', '수', '목', '금'];
  let html = '<div class="cell head">교시</div>' + weekdays.map(day => `<div class="cell head">${day}</div>`).join('');
  for (const p of periodRows(periodCount)) {
    html += `<div class="cell period-head">${periodLabel(p, periodCount)}</div>`;
    for (let dayIndex = 0; dayIndex < weekdays.length; dayIndex += 1) {
      const slots = p === 0 || p === periodCount + 1 ? '' : `<div class="daybox bulk-daybox">${Array.from({ length: classCount }, (_, i) => {
        const classNo = i + 1;
        const key = bulkSlotId(dayIndex, p, classNo);
        const code = bulkInputValues[key] || '';
        const color = calendarSubjects.find(subject => subject.code === code)?.color || '#fff';
        return `<button type="button" class="slot bulk-slot" data-bulk-key="${key}" data-day-index="${dayIndex}" data-period="${p}" data-class-no="${classNo}" data-subject="${esc(code)}" style="background:${color}">${esc(code)}</button>`;
      }).join('')}</div>`;
      html += `<div class="cell">${slots}</div>`;
    }
  }
  grid.innerHTML = html;
}

async function openBulkInputDialog() {
  const settings = await getAppSettings();
  const periodCount = Number(settings.period_count) || 6;
  const classCount = Number(settings.class_count) || 6;
  calendarSubjects = await getSubjects();
  bulkInputValues = {};
  $('#bulkInputForm').reset();
  $('[name="start_date"]', $('#bulkInputForm')).value = iso(weekStart);
  $('[name="end_date"]', $('#bulkInputForm')).value = iso(addDays(weekStart, 4));
  renderBulkInputGrid(periodCount, classCount);
  $('#lessonDialog')?.close();
  $('#memoDialog')?.close();
  $('#eventDialog')?.close();
  $('#bulkInputDialog').showModal();
}

function openBulkLessonDialog(slot) {
  editingBulkSlot = slot;
  editingLesson = null;
  const buttons = [
    `<button type="button" class="lesson-choice delete-choice" data-subject-code="">삭제</button>`,
    ...calendarSubjects.map(subject => `<button type="button" class="lesson-choice" data-subject-code="${esc(subject.code)}" style="background:${esc(subject.color || '#fff')}"><b>${esc(subject.code)}</b><span>${esc(subject.label || '')}</span></button>`)
  ];
  $('#lessonSubjectButtons').innerHTML = buttons.join('');
  $('#lessonDialog').showModal();
}

async function applyBulkInput(form) {
  const data = formData(form);
  if (!data.start_date || !data.end_date) return;
  if (data.start_date > data.end_date) {
    alert('끝 날짜는 시작 날짜 이후로 설정해 주세요.');
    return;
  }
  const rows = [];
  for (const date of eachDateInRange(data.start_date, data.end_date)) {
    const dayIndex = date.getDay() - 1;
    if (dayIndex < 0 || dayIndex > 4) continue;
    const dateText = iso(date);
    Object.entries(bulkInputValues).forEach(([key, subjectCode]) => {
      if (!subjectCode) return;
      const [slotDayIndex, period, classNo] = key.split('-').map(Number);
      if (slotDayIndex !== dayIndex) return;
      rows.push({ id: slotId(dateText, period, classNo), date: dateText, period, class_no: classNo, subject_code: subjectCode.trim(), memo: '' });
    });
  }
  if (rows.length) await upsertRows('timetables', rows);
  $('#bulkInputDialog').close();
  await renderCalendar();
}

async function renderCalendar() {
  const grid = $('#calendarGrid');
  if (!grid) return;
  const settings = await getAppSettings();
  const periodCount = Number(settings.period_count) || 6;
  const classCount = Number(settings.class_count) || 6;
  const subjects = await getSubjects();
  calendarSubjects = subjects;
  renderEventPeriodButtons(periodCount, Number($('[name="period"]', $('#eventForm'))?.value) || periodCount + 1);
  const events = await selectRows('events');
  const timetables = await selectRows('timetables');
  document.documentElement.style.setProperty('--class-count', classCount);
  $('#weekPicker').value = iso(weekStart);
  let html = '';
  visibleWeeks().forEach((week, index) => {
    const dates = weekDates(week);
    const weekTitle = `${ymd(iso(dates[0]))} ~ ${ymd(iso(dates[4]))}`;
    html += `<div class="cell week-title">${index === 0 ? '이번 주' : `${index + 1}주차`} · ${weekTitle}</div>`;
    html += '<div class="cell head">교시</div>' + dates.map(d => `<div class="cell head">${ymd(iso(d))}</div>`).join('');
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
          return `<button type="button" class="slot${memo ? ' has-memo' : ''}" data-date="${date}" data-period="${p}" data-class-no="${classNo}" data-subject="${esc(code)}" data-memo="${esc(memo)}" style="background:${color}" title="${esc(memo)}">${esc(code)}</button>`;
        }).join('')}</div>`;
        html += `<div class="cell">${slots}${dayEvents.map(e => `<button type="button" class="event-strip" data-event-id="${esc(e.id)}">${esc(hm(e.event_time))} ${esc(e.title)}</button>`).join('')}</div>`;
      }
    }
  });
  grid.innerHTML = html;
  markConflicts();
}

async function saveLessonRow(slot, subjectCode, memo = slot.dataset.memo || '') {
  const row = { id: slotId(slot.dataset.date, slot.dataset.period, slot.dataset.classNo), date: slot.dataset.date, period: Number(slot.dataset.period), class_no: Number(slot.dataset.classNo), subject_code: subjectCode.trim(), memo: memo.trim() };
  if (row.subject_code) await upsertRows('timetables', [row]);
  else await deleteRow('timetables', row.id);
  await renderCalendar();
}

function openLessonDialog(slot) {
  editingLesson = slot;
  const buttons = [
    `<button type="button" class="lesson-choice delete-choice" data-subject-code="">삭제</button>`,
    ...calendarSubjects.map(subject => `<button type="button" class="lesson-choice" data-subject-code="${esc(subject.code)}" style="background:${esc(subject.color || '#fff')}"><b>${esc(subject.code)}</b><span>${esc(subject.label || '')}</span></button>`)
  ];
  $('#lessonSubjectButtons').innerHTML = buttons.join('');
  $('#eventDialog')?.close();
  $('#memoDialog')?.close();
  $('#lessonDialog').showModal();
}

function openMemoDialog(slot) {
  editingLesson = slot;
  $('#memoText').value = slot.dataset.memo || '';
  $('#lessonDialog')?.close();
  $('#eventDialog')?.close();
  $('#memoDialog').showModal();
  $('#memoText').focus();
}

async function saveMemoAndClose() {
  if (!editingLesson) return;
  await saveLessonRow(editingLesson, editingLesson.dataset.subject || editingLesson.textContent.trim(), $('#memoText').value);
  $('#memoDialog').close();
  editingLesson = null;
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

function closeOnBackdrop(dialog, beforeClose) {
  dialog?.addEventListener('click', async e => {
    if (e.target !== dialog) return;
    if (beforeClose) await beforeClose();
    else dialog.close();
  });
}

$('#prevWeek')?.addEventListener('click', () => { weekStart.setDate(weekStart.getDate() -28); renderCalendar(); });
$('#nextWeek')?.addEventListener('click', () => { weekStart.setDate(weekStart.getDate() +28); renderCalendar(); });
$('#weekPicker')?.addEventListener('change', e => { weekStart = startOfWeek(new Date(e.target.value)); renderCalendar(); });
$('#addEventBtn')?.addEventListener('click', () => openEventDialog());
$('#bulkInputBtn')?.addEventListener('click', () => openBulkInputDialog());
$('#closeBulkInputDialog')?.addEventListener('click', () => $('#bulkInputDialog').close());
$('#closeDialog')?.addEventListener('click', () => $('#eventDialog').close());
$('#calendarGrid')?.addEventListener('click', e => {
  const slot = e.target.closest('.slot');
  const eventStrip = e.target.closest('.event-strip');
  if (eventStrip) openEventDialog(eventStrip.dataset.eventId);
  if (slot) {
    clearTimeout(slotClickTimer);
    slotClickTimer = setTimeout(() => openLessonDialog(slot), 220);
  }
});
$('#calendarGrid')?.addEventListener('dblclick', e => {
  const slot = e.target.closest('.slot');
  if (!slot) return;
  clearTimeout(slotClickTimer);
  openMemoDialog(slot);
});
$('#lessonSubjectButtons')?.addEventListener('click', async e => {
  const button = e.target.closest('[data-subject-code]');
  if (!button) return;
  if (editingBulkSlot) {
    const code = button.dataset.subjectCode || '';
    bulkInputValues[editingBulkSlot.dataset.bulkKey] = code;
    editingBulkSlot.dataset.subject = code;
    editingBulkSlot.textContent = code;
    editingBulkSlot.style.background = calendarSubjects.find(subject => subject.code === code)?.color || '#fff';
    $('#lessonDialog').close();
    editingBulkSlot = null;
    return;
  }
  if (!editingLesson) return;
  await saveLessonRow(editingLesson, button.dataset.subjectCode, editingLesson.dataset.memo || '');
  $('#lessonDialog').close();
  editingLesson = null;
});
$('#bulkInputGrid')?.addEventListener('click', e => {
  const slot = e.target.closest('.bulk-slot');
  if (!slot) return;
  openBulkLessonDialog(slot);
});
$('#bulkInputForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  await applyBulkInput(e.currentTarget);
});
$('.event-period-buttons')?.addEventListener('click', e => {
  const button = e.target.closest('[data-event-period]');
  if (!button) return;
  $('[name="period"]', $('#eventForm')).value = button.dataset.eventPeriod;
  $$('.event-period-buttons button').forEach(btn => btn.classList.toggle('active', btn === button));
});
$('#eventForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const row = formData(e.currentTarget);
  if (editingEventId) row.id = editingEventId;
  await upsertRows('events', [row]);
  editingEventId = null;
  $('#eventDialog').close();
  await renderCalendar();
});
closeOnBackdrop($('#lessonDialog'));
closeOnBackdrop($('#eventDialog'));
closeOnBackdrop($('#bulkInputDialog'));
closeOnBackdrop($('#memoDialog'), saveMemoAndClose);
$('#memoDialog')?.addEventListener('cancel', async e => {
  e.preventDefault();
  await saveMemoAndClose();
});

async function refreshCalendar() {
  try {
    await renderCalendar();
  } catch (error) {
    console.error('달력을 불러오지 못했습니다.', error);
    const grid = $('#calendarGrid');
    if (grid) grid.innerHTML = `<section class="card error-card"><h2>달력을 불러오지 못했습니다</h2><p>${escapeHtml(error.message || error)}</p></section>`;
  }
}

refreshCalendar();
