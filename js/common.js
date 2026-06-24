const db = window.supabase && SUPABASE_URL ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];
const iso = d => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const today = () => iso(new Date());
const ymd = s => s ? new Date(s).toLocaleDateString('ko-KR') : '';
const hm = s => {
  if (!s) return '';
  const value = String(s);
  const timePart = value.includes('T') ? value.split('T')[1] : value;
  return timePart.slice(0, 5);
};

function readLocalRows(table) {
  try {
    const rows = JSON.parse(localStorage.getItem(table) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error(`${table} localStorage 데이터를 읽을 수 없습니다.`, error);
    return [];
  }
}

function writeLocalRows(table, rows) {
  localStorage.setItem(table, JSON.stringify(rows));
}

function normalizeSupabaseError(error) {
  return `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase();
}

function isMissingOrderColumnError(error, order = 'created_at') {
  const message = normalizeSupabaseError(error);
  return message.includes(order) && (message.includes('column') || message.includes('schema cache') || message.includes('does not exist'));
}

async function selectRows(table, order='created_at') {
  if (!db) {
    const rows = readLocalRows(table);
    return order ? rows.sort((a, b) => String(a[order] || '').localeCompare(String(b[order] || ''))) : rows;
  }

  let query = db.from(table).select('*');
  if (order) query = query.order(order, { ascending: true });
  let { data, error } = await query;

  if (error && order && isMissingOrderColumnError(error, order)) {
    ({ data, error } = await db.from(table).select('*'));
  }
  if (error) throw error;
  return data || [];
}

async function insertRow(table, row) {
  if(!db){ const rows=readLocalRows(table); rows.push({...row,id:crypto.randomUUID(),created_at:new Date().toISOString()}); writeLocalRows(table,rows); return; }
  const {error}=await db.from(table).insert(row); if(error) throw error;
}
async function deleteRow(table, id) { if(!db){ const rows=readLocalRows(table).filter(r=>r.id!==id); writeLocalRows(table,rows); return; } const {error}=await db.from(table).delete().eq('id',id); if(error) throw error; }
async function updateRow(table, id, row) { if(!db){ const rows=readLocalRows(table); const i=rows.findIndex(r=>r.id===id); if(i>=0) rows[i]={...rows[i],...row}; writeLocalRows(table,rows); return; } const {error}=await db.from(table).update(row).eq('id',id); if(error) throw error; }
async function upsertRows(table, rows) { if(!db){ const old=readLocalRows(table); rows.forEach(r=>{ const i=old.findIndex(o=>o.id===r.id); i>=0?old[i]={...old[i],...r}:old.push({...r,id:r.id||crypto.randomUUID(),created_at:new Date().toISOString()}); }); writeLocalRows(table,old); return; } const {error}=await db.from(table).upsert(rows); if(error) throw error; }
async function getAppSettings(){ const rows=await selectRows('app_settings'); return Object.assign({class_count:6,period_count:6}, rows[0]||{}); }
async function getSubjects(){ return selectRows('subject_rules', 'sort_order'); }function formData(form){ return Object.fromEntries(new FormData(form).entries()); }
function escapeHtml(value){ return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }function paintBySubject(el, subjects){ const v=el.textContent.trim(); const hit=subjects.find(s=>s.code===v); el.style.background=hit?.color||''; }
