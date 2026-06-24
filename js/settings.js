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
  const subjects = await getSubjects();
  list.innerHTML = subjects.map(s => `<span class="legend-chip subject-chip" draggable="true" data-subject-id="${escapeHtml(s.id)}" style="background:${escapeHtml(s.color || '#fff')}"><b>${escapeHtml(s.code)}</b> ${escapeHtml(s.label || '')} ${s.conflict_group ? '<small>겹침 제한</small>' : ''}<button class="secondary subject-edit-button" data-edit-subject="${escapeHtml(s.id)}" type="button">수정</button><button class="secondary subject-delete-button" data-delete-subject="${escapeHtml(s.id)}" type="button">삭제</button></span>`).join('') || '<p class="muted">등록된 과목이 없습니다. 과목을 추가해 주세요.</p>';
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
    const subjects = await getSubjects();
    await insertRow('subject_rules', { ...subject, sort_order: subjects.length });
  }
  resetSubjectForm();
  await renderSubjects();
});

$('#cancelSubjectEditBtn')?.addEventListener('click', resetSubjectForm);

let draggedSubjectId = '';

async function saveSubjectOrder() {
  const chips = $$('.subject-chip[data-subject-id]', $('#subjectList'));
  await Promise.all(chips.map((chip, index) => updateRow('subject_rules', chip.dataset.subjectId, { sort_order: index })));
  await renderSubjects();
}

$('#subjectList')?.addEventListener('dragstart', e => {
  const chip = e.target.closest('.subject-chip[data-subject-id]');
  if (!chip || e.target.closest('button')) return;
  draggedSubjectId = chip.dataset.subjectId;
  chip.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});

$('#subjectList')?.addEventListener('dragover', e => {
  const dragging = $('.subject-chip.dragging', $('#subjectList'));
  const target = e.target.closest('.subject-chip[data-subject-id]');
  if (!dragging || !target || target === dragging) return;
  e.preventDefault();
  const rect = target.getBoundingClientRect();
  target.parentNode.insertBefore(dragging, e.clientX < rect.left + rect.width / 2 ? target : target.nextSibling);
});

$('#subjectList')?.addEventListener('dragend', async e => {
  const chip = e.target.closest('.subject-chip[data-subject-id]');
  chip?.classList.remove('dragging');
  if (!draggedSubjectId) return;
  draggedSubjectId = '';
  await saveSubjectOrder();
});

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
  const subjects = await getSubjects();
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
