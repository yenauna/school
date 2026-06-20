const db = window.supabase && SUPABASE_URL ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];
const iso = d => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const today = () => iso(new Date());
const ymd = s => s ? new Date(s).toLocaleDateString('ko-KR') : '';
const hm = s => s ? String(s).slice(0,5) : '';
async function selectRows(table, order='created_at') { if(!db) return JSON.parse(localStorage.getItem(table)||'[]'); const {data,error}=await db.from(table).select('*').order(order,{ascending:true}); if(error) throw error; return data||[]; }
async function insertRow(table, row) { if(!db){ const rows=JSON.parse(localStorage.getItem(table)||'[]'); rows.push({...row,id:crypto.randomUUID(),created_at:new Date().toISOString()}); localStorage.setItem(table,JSON.stringify(rows)); return; } const {error}=await db.from(table).insert(row); if(error) throw error; }
async function deleteRow(table, id) { if(!db){ const rows=JSON.parse(localStorage.getItem(table)||'[]').filter(r=>r.id!==id); localStorage.setItem(table,JSON.stringify(rows)); return; } const {error}=await db.from(table).delete().eq('id',id); if(error) throw error; }
async function updateRow(table, id, row) { if(!db){ const rows=JSON.parse(localStorage.getItem(table)||'[]'); const i=rows.findIndex(r=>r.id===id); if(i>=0) rows[i]={...rows[i],...row}; localStorage.setItem(table,JSON.stringify(rows)); return; } const {error}=await db.from(table).update(row).eq('id',id); if(error) throw error; }
async function upsertRows(table, rows) { if(!db){ const old=JSON.parse(localStorage.getItem(table)||'[]'); rows.forEach(r=>{ const i=old.findIndex(o=>o.id===r.id); i>=0?old[i]=r:old.push({...r,id:r.id||crypto.randomUUID(),created_at:new Date().toISOString()}); }); localStorage.setItem(table,JSON.stringify(old)); return; } const {error}=await db.from(table).upsert(rows); if(error) throw error; }
async function getAppSettings(){ const rows=await selectRows('app_settings'); return Object.assign({class_count:6,period_count:6}, rows[0]||{}); }
async function getSubjects(){ const rows=await selectRows('subject_rules'); if(rows.length) return rows; return [{code:'E',label:'영어교과',color:'#ffffff',conflict_group:true},{code:'과2',label:'과학2실',color:'#c7d2fe',conflict_group:true},{code:'도',label:'도덕',color:'#86efac',conflict_group:false},{code:'국L',label:'도서관',color:'#f0abfc',conflict_group:true},{code:'체',label:'체육관/운동장',color:'#fde047',conflict_group:true},{code:'컴2',label:'컴퓨터 2실',color:'#fca5a5',conflict_group:true},{code:'실',label:'실과',color:'#fdba74',conflict_group:false},{code:'보',label:'보건',color:'#fef08a',conflict_group:false},{code:'예',label:'예술강사',color:'#22c55e',conflict_group:true},{code:'상',label:'상담수업',color:'#67e8f9',conflict_group:true}]; }
function formData(form){ return Object.fromEntries(new FormData(form).entries()); }
function escapeHtml(value){ return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[char])); }
function paintBySubject(el, subjects){ const v=el.textContent.trim(); const hit=subjects.find(s=>s.code===v); el.style.background=hit?.color||''; }
