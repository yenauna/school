function reservationEsc(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}

function reservationPeriodLabel(period) {
  return `${period}교시`;
}

async function getReservationData() {
  const [settings, resources, reservations] = await Promise.all([
    getAppSettings(),
    selectRows('resources'),
    selectRows('reservations')
  ]);
  return {
    periodCount: Number(settings.period_count) || 6,
    resources,
    reservations
  };
}

function renderResourceOptions(resources) {
  const select = $('select[name="resource_id"]', $('#reservationForm'));
  if (!select) return;
  select.innerHTML = resources.map(resource => (
    `<option value="${reservationEsc(resource.id)}">${reservationEsc(resource.name)}${resource.type ? ` (${reservationEsc(resource.type)})` : ''}</option>`
  )).join('');
  select.disabled = resources.length === 0;
}

function renderPeriodOptions(periodCount) {
  const select = $('select[name="period"]', $('#reservationForm'));
  if (!select) return;
  select.innerHTML = Array.from({ length: periodCount }, (_, i) => {
    const period = i + 1;
    return `<option value="${period}">${reservationPeriodLabel(period)}</option>`;
  }).join('');
}

function renderResourceList(resources) {
  const list = $('#resourceList');
  if (!list) return;
  list.innerHTML = resources.map(resource => (
    `<span class="resource-chip"><b>${reservationEsc(resource.name)}</b>${resource.type ? ` ${reservationEsc(resource.type)}` : ''}<button class="secondary" data-delete-resource="${reservationEsc(resource.id)}" type="button">×</button></span>`
  )).join('') || '<p class="muted">등록된 예약 자원이 없습니다.</p>';
}

function renderReservationList(resources, reservations) {
  const list = $('#reservationList');
  if (!list) return;
  const resourceById = new Map(resources.map(resource => [String(resource.id), resource]));
  list.innerHTML = reservations.map(reservation => {
    const resource = resourceById.get(String(reservation.resource_id));
    return `<article class="mini-item">
      <b>${reservationEsc(resource?.name || '삭제된 자원')}</b>
      <div class="muted">${reservationEsc(reservation.reserved_date)} · ${reservationPeriodLabel(reservation.period)}${reservation.class_name ? ` · ${reservationEsc(reservation.class_name)}` : ''}</div>
      ${reservation.memo ? `<p>${reservationEsc(reservation.memo)}</p>` : ''}
      <button class="secondary" data-delete-reservation="${reservationEsc(reservation.id)}" type="button">삭제</button>
    </article>`;
  }).join('') || '<p class="muted">등록된 예약이 없습니다.</p>';
}

async function renderReservations() {
  const { periodCount, resources, reservations } = await getReservationData();
  renderPeriodOptions(periodCount);
  renderResourceOptions(resources);
  renderResourceList(resources);
  renderReservationList(resources, reservations);
}

$('#resourceForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const data = formData(e.currentTarget);
  await insertRow('resources', {
    name: data.name.trim(),
    type: data.type || ''
  });
  e.currentTarget.reset();
  await renderReservations();
});

$('#reservationForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const data = formData(e.currentTarget);
  const reservations = await selectRows('reservations');
  const hasConflict = reservations.some(reservation => (
    String(reservation.resource_id) === String(data.resource_id)
    && reservation.reserved_date === data.reserved_date
    && Number(reservation.period) === Number(data.period)
  ));
  if (hasConflict) {
    alert('이미 같은 자원, 날짜, 교시에 예약이 있습니다.');
    return;
  }
  await insertRow('reservations', {
    resource_id: data.resource_id,
    reserved_date: data.reserved_date,
    period: Number(data.period),
    class_name: data.class_name.trim(),
    memo: data.memo.trim()
  });
  e.currentTarget.reset();
  await renderReservations();
});

$('#resourceList')?.addEventListener('click', async e => {
  const id = e.target.dataset.deleteResource;
  if (!id) return;
  const reservations = await selectRows('reservations');
  await Promise.all(reservations.filter(reservation => String(reservation.resource_id) === String(id)).map(reservation => deleteRow('reservations', reservation.id)));
  await deleteRow('resources', id);
  await renderReservations();
});

$('#reservationList')?.addEventListener('click', async e => {
  const id = e.target.dataset.deleteReservation;
  if (!id) return;
  await deleteRow('reservations', id);
  await renderReservations();
});

renderReservations();
