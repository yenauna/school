async function renderSettings() {
  const settings = await getAppSettings();
  const form = $('#settingForm');
  if (form) {
    form.class_count.value = settings.class_count;
    form.period_count.value = settings.period_count;
  }
}

function resetSubjectForm() {
  const form = $('#subjectForm');
  if (!form) return;
  form.reset();
  form.dataset.editingSubjectId = '';
  $('.subject-form-title') && ($('.subject-form-title').textContent = '색/겹침 단어');
  $('.subject-submit-button', form).textContent = '추가';
  $('#cancelSubjectEditBtn')?.classList.add('hidden');
}

async function renderSubjects() {
  const list = $('#subjectList');
  if (!list) return;
  const subjects = await selectRows('subject_rules');
  list.innerHTML = subjects.map(s => `<span class="legend-chip subject-chip"><span class="color-dot" style="background:${escapeHtml(s.color)}"></span><b>${escapeHtml(s.code)}</b> ${escapeHtml(s.label || '')} ${s.conflict_group ? '<small>겹침 제한</small>' : ''}<button class="secondary subject-edit-button" data-edit-subject="${escapeHtml(s.id)}" type="button">수정</button><button class="secondary subject-delete-button" data-delete-subject="${escapeHtml(s.id)}" type="button">삭제</button></span>`).join('') || '<p class="muted">등록된 과목이 없습니다. 과목을 추가해 주세요.</p>';
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
  const subject = { code: data.code, label: data.label, color: data.color, conflict_group: Boolean(data.conflict_group) };
  const editingSubjectId = e.currentTarget.dataset.editingSubjectId;
  if (editingSubjectId) {
    await updateRow('subject_rules', editingSubjectId, subject);
  } else {
    await insertRow('subject_rules', subject);
  }
  resetSubjectForm();
  await renderSubjects();
});

$('#cancelSubjectEditBtn')?.addEventListener('click', resetSubjectForm);

$('#subjectList')?.addEventListener('click', async e => {
  const deleteId = e.target.dataset.deleteSubject;
  if (deleteId) {
    await deleteRow('subject_rules', deleteId);
    resetSubjectForm();
    await renderSubjects();
    return;
  }

  const editId = e.target.dataset.editSubject;
  if (!editId) return;
  const subjects = await selectRows('subject_rules');
  const subject = subjects.find(s => s.id === editId);
  const form = $('#subjectForm');
  if (!subject || !form) return;
  form.dataset.editingSubjectId = subject.id;
  form.elements.code.value = subject.code || '';
  form.elements.label.value = subject.label || '';
  form.elements.color.value = subject.color || '#dbeafe';
  form.elements.conflict_group.checked = Boolean(subject.conflict_group);
  $('.subject-form-title') && ($('.subject-form-title').textContent = '색/겹침 단어 수정');
  $('.subject-submit-button', form).textContent = '수정 저장';
  $('#cancelSubjectEditBtn')?.classList.remove('hidden');
  form.elements.code.focus();
});

renderSettings();
renderSubjects();
