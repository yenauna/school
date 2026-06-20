let weekStart = startOfWeek(new Date());

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}

function weekDates() {
  return Array.from({ length: 5 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });
}

async function renderCalendar() {
  const grid = $('#calendarGrid');
  if (!grid) return;
  const settings = await getAppSettings();
  const subjects = await getSubjects();
  const events = await selectRows('events');
  const timetables = await selectRows('timetables');
  document.documentElement.style.setProperty('--class-count', Number(settings.class_count) || 6);
  $('#weekPicker').value = iso(weekStart);
  const dates = weekDates();
  let html = '<div class="cell head">교시</div>' + dates.map(d => `<div class="cell head">${ymd(iso(d))}</div>`).join('');
  for (let p = 1; p <= (Number(settings.period_count) || 6); p++) {
    html += `<div class="cell period-head">${p}교시</div>`;
    for (const d of dates) {
      const date = iso(d);
      const dayEvents = events.filter(e => e.event_date === date && (!e.period || Number(e.period) === p));
      html += `<div class="cell"><div class="daybox">${Array.from({ length: Number(settings.class_count) || 6 }, (_, i) => {
        const classNo = i + 1;
        const saved = timetables.find(t => (t.date || t.lesson_date) === date && Number(t.period) === p && Number(t.class_no || t.classNo) === classNo);
        const code = saved?.subject_code || saved?.subjectCode || '';
        const color = subjects.find(s => s.code === code)?.color || '';
        return `<div class="slot" contenteditable="true" data-date="${date}" data-period="${p}" data-class-no="${classNo}" style="background:${color}">${code}</div>`;
      }).join('')}</div>${dayEvents.map(e => `<div class="event-strip">${hm(e.event_time)} ${e.title}</div>`).join('')}</div>`;
    }
  }
  grid.innerHTML = html;
}

async function saveTimetable() {
  const rows = $$('.slot').map(el => ({ id: `${el.dataset.date}-${el.dataset.period}-${el.dataset.classNo}`, date: el.dataset.date, period: Number(el.dataset.period), class_no: Number(el.dataset.classNo), subject_code: el.textContent.trim() })).filter(r => r.subject_code);
  await upsertRows('timetables', rows);
  await renderCalendar();
}

$('#prevWeek')?.addEventListener('click', () => { weekStart.setDate(weekStart.getDate() - 7); renderCalendar(); });
$('#nextWeek')?.addEventListener('click', () => { weekStart.setDate(weekStart.getDate() + 7); renderCalendar(); });
$('#weekPicker')?.addEventListener('change', e => { weekStart = startOfWeek(new Date(e.target.value)); renderCalendar(); });
$('#saveTimetable')?.addEventListener('click', saveTimetable);
$('#addEventBtn')?.addEventListener('click', () => { $('#eventForm').reset(); $('[name="event_date"]', $('#eventForm')).value = today(); $('#eventDialog').showModal(); });
$('#closeDialog')?.addEventListener('click', () => $('#eventDialog').close());
$('#eventForm')?.addEventListener('submit', async e => { e.preventDefault(); await insertRow('events', formData(e.currentTarget)); $('#eventDialog').close(); await renderCalendar(); });

renderCalendar();
