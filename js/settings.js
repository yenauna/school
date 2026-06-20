async function renderSettings() {
  const settings = await getAppSettings();
  const form = $('#settingForm');
  if (form) {
    form.class_count.value = settings.class_count;
    form.period_count.value = settings.period_count;
  }
}

async function renderSubjects() {
  const list = $('#subjectList');
  if (!list) return;
  const subjects = await getSubjects();
  list.innerHTML = subjects.map(s => `<span class="legend-chip"><span class="color-dot" style="background:${s.color}"></span><b>${s.code}</b> ${s.label || ''} ${s.conflict_group ? '<small>겹침 제한</small>' : ''} ${s.id ? `<button class="secondary" data-delete-subject="${s.id}">×</button>` : ''}</span>`).join('');
}

$('#settingForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const data = formData(e.currentTarget);
  await upsertRows('app_settings', [{ id: 'default', class_count: Number(data.class_count), period_count: Number(data.period_count) }]);
  await renderSettings();
});

$('#subjectForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const data = formData(e.currentTarget);
  await insertRow('subject_rules', { code: data.code, label: data.label, color: data.color, conflict_group: Boolean(data.conflict_group) });
  e.currentTarget.reset();
  await renderSubjects();
});

$('#subjectList')?.addEventListener('click', async e => {
  const id = e.target.dataset.deleteSubject;
  if (!id) return;
  await deleteRow('subject_rules', id);
  await renderSubjects();
});

renderSettings();
renderSubjects();
