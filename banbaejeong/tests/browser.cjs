// Run a local static server, then: node banbaejeong/tests/browser.cjs
// Requires Playwright and Chromium; all Supabase calls use an isolated fake server.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const artifacts = require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'bbj-browser-'));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1600,height:1000}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.fakeServer={state:{},revision:1,calls:[]};
  window.__bbjTransport=(path,body,cb)=>{
   fakeServer.calls.push({path,body});
   setTimeout(()=>{
    if(body.p_passcode!=='2026') return cb({code:'PASSCODE_MISMATCH'});
    if(path==='banbaejeong_save') {fakeServer.state=JSON.parse(JSON.stringify(body.p_state));fakeServer.revision++;}
    cb(null,{state:fakeServer.state,revision:fakeServer.revision});
   },5);
  };
 });
 try {
 await page.goto(process.env.BBJ_URL||'http://127.0.0.1:4173/banbaejeong/');
 await page.fill('#lockPass','wrong');await page.click('#lockEnter');
 await page.waitForFunction(()=>document.querySelector('#lockMsg').textContent.includes('맞지'));
 await page.fill('#lockPass','2026');await page.click('#lockEnter');
 await page.waitForFunction(()=>window.__bbj.cloud.entered());
 assert.deepEqual(await page.locator('#tagTable .managed-tag').allTextContents().then(a=>a.map(t=>t.trim())),['특수 ×','학습 ×','생활 ×','학부모 ×']);
 assert.equal(await page.locator('#pairBulk,#wishBulk,#tagTable input[type=number]').count(),0);
 assert.match(await page.locator('#cardClasses').innerText(),/특수학생은 통합학급으로 체크한 반에만 배정됩니다\./);
 await page.click('#btnSample');
 await page.evaluate(()=>{
  const S=__bbj.state();S.pairs=[];S.wishGroups=[];S.deduct=0;S.useY3=false;
  S.tags=['특수','학습','생활','추가태그'].map(name=>({name,weight:99,max:1}));
  S.students=Array.from({length:114},(_,i)=>({id:i+1,name:i<2?'김민준':`${['하','가','나','다','라','마'][i%6]}학생${String(i).padStart(3,'0')}`,no:Math.floor(i/6)+1,g4:'',g5:`${i%6+1}반`,gender:i%2?'여':'남',tags:[],w:{},fixed:null}));
  Object.assign(S.students[0],{tags:['특수'],w:{특수:5}});
  Object.assign(S.students[1],{tags:['학습','생활'],w:{학습:2,생활:1}});
  Object.assign(S.students[2],{tags:['추가태그'],w:{추가태그:1}});
  S.classes.forEach((c,i)=>{c.total=19;c.male=i%2?9:10;c.female=19-c.male});S.nextId=115;S.result=null;
  __bbj.renderAll();
 });
 // New stars always start at one even if a deleted tag was previously set higher.
 const toggle=page.locator('[data-act="toggle-tag"][data-id="4"][data-tag="학습"]');
 await toggle.click(); assert.equal(await page.evaluate(()=>__bbj.state().students[3].w.학습),1);
 await page.locator('[data-act="tag-mul"][data-id="4"][data-tag="학습"]').selectOption('5');
 await toggle.click();await toggle.click();assert.equal(await page.evaluate(()=>__bbj.state().students[3].w.학습),1);
 await toggle.click();
 // Roster options and typed totals enforce the five-star limit.
 await toggle.click();
 assert.deepEqual(await page.locator('[data-act="tag-mul"][data-id="4"][data-tag="학습"] option').evaluateAll(es=>es.map(e=>e.value)),['1','2','3','4','5']);
 const score=page.locator('[data-scope="student"][data-id="4"][data-field="score"]');
 await score.fill('99');await score.blur();
 assert.equal(await page.evaluate(()=>__bbj.state().students[3].score),5);
 await toggle.click();assert.equal(await page.evaluate(()=>__bbj.state().students[3].tags.length),0);
 await page.click('#btnAddPair');
 for(let j=0;j<6;j++){
  if(j>=2)await page.locator('#pairTable [data-act="group-add"]').click();
  await page.locator(`#pairTable [data-act="pick-student"][data-j="${j}"]`).click();
  if(j===0){
   await page.fill('#pickerSearch','김민준');assert.equal(await page.locator('#pickerStudents button').count(),2);
   assert.match(await page.locator('#pickerStudents').innerText(),/5-1 김민준 \(1번\)/);
   assert.match(await page.locator('#pickerStudents').innerText(),/5-2 김민준 \(1번\)/);
   await page.locator('[data-act="picker-class"][data-class="2"]').click();assert.equal(await page.locator('#pickerStudents button').count(),1);
   await page.locator('[data-act="picker-class"][data-class=""]').click();
  }
  await page.fill('#pickerSearch','');await page.locator(`#pickerStudents [data-id="${j+1}"]`).click();
 }
 assert.deepEqual(await page.evaluate(()=>__bbj.state().pairs[0]),[1,2,3,4,5,6]);
 await page.click('#btnAddWish');
 for(let j=0;j<2;j++) {await page.locator(`#wishTable [data-act="pick-student"][data-j="${j}"]`).click();await page.locator(`#pickerStudents [data-id="${j+8}"]`).click();}
 await page.click('#btnAddPair');await page.click('#btnAddPair');
 const grid=await page.locator('#pairTable .group-card').evaluateAll(es=>es.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})));
 assert.equal(grid[0].y,grid[1].y);assert.ok(grid[1].x>grid[0].x);
 await page.locator('#pairTable [data-act="pick-student"]').first().click();
 assert.equal(await page.evaluate(()=>__bbj.cloud.pollBlocked()),true);
 await page.screenshot({path:path.join(artifacts,'picker.png'),fullPage:false});
 await page.keyboard.press('Escape');
 await page.click('#btnRun');await page.waitForFunction(()=>!!__bbj.state().result);
 assert.equal(await page.evaluate(()=>new Set(__bbj.state().result.assign.slice(0,6)).size),6);
 assert.equal(await page.locator('.col').count(),6);
 const ys=await page.locator('.chiplist').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().y));
 assert.ok(Math.max(...ys)-Math.min(...ys)<1);
 assert.match(await page.locator('.tagsum').allTextContents().then(t=>t.join(' ')),/특수5/);
 assert.match(await page.locator('.tagsum').allTextContents().then(t=>t.join(' ')),/학습·생활3/);
 assert.equal(await page.locator('.stu .l2,.stu .st').count(),0);
 assert.equal(await page.locator('.stu[data-id="1"] .tag-on').innerText(),'특수5');
 const colors=await page.locator('.tag-on').evaluateAll(es=>[...new Set(es.map(e=>getComputedStyle(e).backgroundColor))]);assert.equal(colors.length,4);
 const checkOrder=async(mode)=>assert.equal(await page.evaluate(mode=>[...document.querySelectorAll('.col')].every(col=>{
  const st=__bbj.state(),members=[...col.querySelectorAll('.stu')].map(e=>st.students.find(s=>s.id===Number(e.dataset.id)));
  return members.every((s,i)=>i===0||(mode==='origin'?(Number(members[i-1].g5.replace('반',''))-Number(s.g5.replace('반',''))||Number(members[i-1].no)-Number(s.no))<=0:(members[i-1].gender===s.gender?members[i-1].name.localeCompare(s.name,'ko')<=0:members[i-1].gender==='남')));
 }),mode),true);
 await checkOrder('gender');assert.ok(await page.locator('.gendivider').count()>0);
 await page.locator('[data-sort="origin"]').click();await checkOrder('origin');assert.equal(await page.locator('.gendivider').count(),0);
 await page.locator('[data-sort="gender"]').click();await checkOrder('gender');
 await page.locator('#classCards').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(artifacts,'results.png')});
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 const pinnedWarning=await page.locator('#problemPanel').boundingBox();
 assert.ok(pinnedWarning.y>=0&&pinnedWarning.y<120,JSON.stringify(pinnedWarning));
 await page.screenshot({path:path.join(artifacts,'sticky-long-board.png')});
 // Wide monitor containers and all six combinations of sort/layout modes.
 const viewBaseline=await page.evaluate(()=>({assign:__bbj.state().result.assign.slice(),problems:__bbj.state().result.report.problems.slice()}));
 for(const width of [1280,1920,2560]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(30);
  const widths=await page.locator('header,.stepsbar,.tabs,main').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().width));
  widths.forEach(w=>assert.ok(Math.abs(w-Math.min(1760,width*.96))<2,`${width}: ${w}`));
  const rows=await page.locator('.col').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().y));
  assert.ok(Math.max(...rows)-Math.min(...rows)<1,`six classes should stay in one row at ${width}`);
 }
 await page.setViewportSize({width:1920,height:1100});
 for(const sort of ['gender','origin'])for(const layout of ['one','two','sex']){
  await page.locator(`[data-sort="${sort}"]`).click();
  await page.locator(`[data-layout="${layout}"]`).click();
  assert.equal(await page.locator(`#resultLayout [data-layout="${layout}"]`).getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#classCards .stu').count(),114);
  assert.deepEqual(await page.evaluate(()=>__bbj.state().result.assign),viewBaseline.assign);
  assert.deepEqual(await page.evaluate(()=>__bbj.state().result.report.problems),viewBaseline.problems);
  assert.equal(await page.evaluate(({sort,layout})=>[...document.querySelectorAll('.col')].every(col=>{
   const st=__bbj.state();
   const ordered=es=>es.every((e,i)=>{if(!i)return true;const a=st.students.find(s=>s.id===Number(es[i-1].dataset.id)),b=st.students.find(s=>s.id===Number(e.dataset.id));return sort==='origin'?(parseInt(a.g5)-parseInt(b.g5)||Number(a.no)-Number(b.no))<=0:a.name.localeCompare(b.name,'ko')<=0});
   if(layout==='one')return new Set([...col.querySelectorAll('.stu')].map(e=>Math.round(e.getBoundingClientRect().x))).size===1;
   const boys=[...col.querySelectorAll('.boys .stu')],girls=[...col.querySelectorAll('.girls .stu')];
   if(!ordered(boys)||!ordered(girls)||boys.some(e=>!e.classList.contains('m'))||girls.some(e=>!e.classList.contains('f')))return false;
   if(layout==='two'){
    for(const list of [boys,girls]){
     const rects=list.map(e=>e.getBoundingClientRect());
     if(rects.length>1&&Math.abs(rects[0].y-rects[1].y)>1)return false;
     if(rects.length>2&&rects[2].y<=rects[0].y)return false;
    }
    if(boys.length&&girls.length){
     const lastBoy=Math.max(...boys.map(e=>e.getBoundingClientRect().bottom)),firstGirl=girls[0].getBoundingClientRect();
     if(firstGirl.y<lastBoy||Math.abs(firstGirl.x-boys[0].getBoundingClientRect().x)>1)return false;
    }
    return true;
   }
   if(boys.length&&girls.length){
    const a=boys[0].getBoundingClientRect(),b=girls[0].getBoundingClientRect();
    if(a.x>=b.x||Math.abs(a.y-b.y)>1)return false;
   }
   return [boys,girls].every(list=>new Set(list.map(e=>Math.round(e.getBoundingClientRect().x))).size<=1);
  }),{sort,layout}),true,`${sort}/${layout}`);
  const starts=await page.locator('.chiplist').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().y));
  assert.ok(Math.max(...starts)-Math.min(...starts)<1);
  await page.locator('#classCards').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(artifacts,`wide-${sort}-${layout}.png`)});
 }
 for(const width of [1280,768,412])for(const layout of ['one','two','sex']){
  await page.setViewportSize({width,height:900});await page.locator(`[data-layout="${layout}"]`).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${layout} overflow at ${width}`);
 }
 await page.setViewportSize({width:1600,height:1000});
 await page.locator('[data-layout="one"]').click();await page.locator('[data-sort="gender"]').click();

 for(const width of [1280,768,412]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(50);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`page overflow at ${width}`);
 }
 await page.setViewportSize({width:1600,height:1000});
 await page.evaluate(()=>{document.activeElement.blur();__bbj.cloud.flush(false)});
 await page.waitForFunction(()=>!__bbj.cloud.pending());
 assert.ok(await page.evaluate(()=>fakeServer.calls.some(c=>c.path==='banbaejeong_save'&&c.body.p_passcode==='2026')));
 assert.equal(await page.evaluate(()=>__bbj.cloud.pollMs()),10000);
 await page.evaluate(()=>{fakeServer.state=JSON.parse(JSON.stringify(__bbj.state()));fakeServer.state.students[0].name='새로고침확인';fakeServer.revision++;__bbj.cloud.poll()});
 await page.waitForFunction(()=>__bbj.state().students[0].name==='새로고침확인');
 // Legacy shared data keeps two-member pairs and converts tag weights exactly once.
 await page.evaluate(()=>{
  fakeServer.state=JSON.parse(JSON.stringify(__bbj.state()));delete fakeServer.state.starVersion;delete fakeServer.state.tagDefaultsVersion;
  fakeServer.state.tags=[{name:'통합학급',weight:3,max:1},{name:'학습',weight:2}];
  fakeServer.state.students[0].tags=['통합학급'];fakeServer.state.students[0].w={'통합학급':2};fakeServer.state.students[0].score=null;
  fakeServer.state.pairs=[[1,2]];fakeServer.revision++;__bbj.cloud.load();
 });
 await page.waitForFunction(()=>__bbj.state().students[0].w.특수===5 && __bbj.state().pairs.length===1 && __bbj.state().pairs[0].length===2);
 assert.deepEqual(await page.evaluate(()=>__bbj.state().pairs),[[1,2]]);
 assert.ok(await page.evaluate(()=>__bbj.state().tags.some(t=>t.name==='학부모')));
 await page.evaluate(()=>{fakeServer.state=JSON.parse(JSON.stringify(__bbj.state()));fakeServer.revision++;__bbj.cloud.load()});
 await page.waitForTimeout(30);
 assert.equal(await page.evaluate(()=>__bbj.state().students[0].w.특수),5);
 // Both modal modes use 1..5 options, cap typed totals and clear to zero when untagged.
 await page.locator('.col[data-k="0"] [data-act="add-class-student"]').click();
 await page.fill('#addStuName','모달추가확인');
 const modalTag=page.locator('#addStuTags [data-tag="학습"][data-act="toggle-tag"]');
 await modalTag.click();
 assert.deepEqual(await page.locator('#addStuTags select option').evaluateAll(es=>es.map(e=>e.value)),['1','2','3','4','5']);
 await page.fill('#addStuScore','100');assert.equal(await page.inputValue('#addStuScore'),'5');
 await modalTag.click();assert.equal(await page.inputValue('#addStuScore'),'0');
 await modalTag.click();await page.locator('#addStuTags select').selectOption('5');
 await page.click('#addStuApply');
 assert.equal(await page.evaluate(()=>__bbj.state().students.find(s=>s.name==='모달추가확인').w.학습),5);
 const beforeEdit=await page.evaluate(()=>JSON.stringify(__bbj.state().students.find(s=>s.name==='모달추가확인')));
 await page.locator('.stu button.nm').filter({hasText:'모달추가확인'}).click();
 await page.locator('#addStuTags select').selectOption('2');await page.click('#addStuCancel');
 assert.equal(await page.evaluate(()=>JSON.stringify(__bbj.state().students.find(s=>s.name==='모달추가확인'))),beforeEdit);
 await page.locator('.stu button.nm').filter({hasText:'모달추가확인'}).click();
 assert.equal(await page.locator('#addStuTitle').innerText(),'학생 수정');
 await page.fill('#addStuScore','9');assert.equal(await page.inputValue('#addStuScore'),'5');
 await page.screenshot({path:path.join(artifacts,'edit-five-star-limit.png')});
 await page.click('#addStuApply');
 // Class total/gender editing, special-class toggles and deduction changes stay exact.
 await page.locator('.tab[data-tab="setup"]').click();
 await page.evaluate(()=>{
  const st=__bbj.state();
  st.students=Array.from({length:108},(_,i)=>({id:i+1,name:'목표검증'+i,gender:i%2?'여':'남',g4:'',g5:(i%6+1)+'반',tags:[],w:{},fixed:null}));
  st.classes=Array.from({length:6},(_,i)=>({name:['가반','나반','다반','라반','마반','바반'][i],special:i<2,total:0,male:0,female:0}));
  st.deduct=2;st.useY3=false;st.pairs=[];st.wishGroups=[];st.result=null;__bbj.renderAll();
 });
 const field=(k,f)=>page.locator(`#classTable input[data-k="${k}"][data-field="${f}"]`);
 const assertSums=async()=>{
  assert.deepEqual(await page.evaluate(()=>__bbj.state().classes.reduce((a,c)=>{if(c.total!==c.male+c.female)throw Error('row mismatch');return [a[0]+c.total,a[1]+c.male,a[2]+c.female]},[0,0,0])),[108,54,54]);
  assert.deepEqual((await page.locator('#classTable tfoot td').allTextContents()).slice(2),['108','54','54']);
 };
 const runExact=async()=>{
  const targets=await page.evaluate(()=>__bbj.state().classes.map(c=>[c.total,c.male,c.female]));
  await page.click('#btnRun');await page.waitForFunction(()=>!!__bbj.state().result);
  assert.deepEqual(await page.evaluate(()=>__bbj.state().result.report.per.map(p=>[p.count,p.male,p.female])),targets);
  await page.locator('.tab[data-tab="setup"]').click();
 };
 await page.click('#btnAutoTargets');await assertSums();
 await page.locator('#cardClasses').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(artifacts,'class-targets-108.png')});
 assert.deepEqual(await page.evaluate(()=>__bbj.state().classes.map(c=>c.total)),[17,17,19,19,18,18]);
 await runExact();
 await field(2,'special').check();await assertSums();
 await page.fill('#deduct','');assert.equal(await page.inputValue('#deduct'),'');
 await page.locator('#deduct').pressSequentially('3');assert.equal(await page.inputValue('#deduct'),'3');await assertSums();
 await page.click('#btnAutoTargets');await runExact();
 const male0=Number(await field(0,'male').inputValue()),male1=Number(await field(1,'male').inputValue());
 const female0=Number(await field(0,'female').inputValue());
 await field(0,'male').fill(String(male0+1));
 assert.equal(Number(await field(0,'total').inputValue()),male0+1+female0); // before blur/change
 assert.equal(await page.evaluate(()=>__bbj.state().classes[0].total),male0+1+female0);
 await field(1,'male').fill(String(male1-1));await assertSums();
 const f0=Number(await field(0,'female').inputValue()),f1=Number(await field(1,'female').inputValue());
 await field(0,'female').fill(String(f0+1));await field(1,'female').fill(String(f1-1));await assertSums();
 await runExact();
 const before=await page.evaluate(()=>({...__bbj.state().classes[0]}));
 await field(0,'total').fill(String(before.total+2));
 const changed=await page.evaluate(()=>({...__bbj.state().classes[0]}));
 assert.equal(changed.male,Math.round((before.total+2)*before.male/(before.male+before.female)));
 assert.equal(changed.total,changed.male+changed.female);
 const other=await page.evaluate(()=>({...__bbj.state().classes[1]}));
 await field(1,'male').fill(String(other.male-(changed.male-before.male)));
 await field(1,'female').fill(String(other.female-(changed.female-before.female)));
 await assertSums();await runExact();
 // A globally impossible manual split must be rejected rather than approximated.
 const m=Number(await field(0,'male').inputValue()),f=Number(await field(0,'female').inputValue());
 await field(0,'male').fill(String(m+1));await field(0,'female').fill(String(f-1));
 await page.click('#btnRun');
 assert.equal(await page.evaluate(()=>__bbj.state().result),null);
 assert.match(await page.locator('#banner').innerText(),/남녀 목표 합계가 명단과 다릅니다/);
 await page.click('#btnAutoTargets');await assertSums();
 await page.evaluate(()=>{const st=__bbj.state();st.students.filter(s=>s.gender==='남').slice(0,st.classes[0].male+1).forEach(s=>s.fixed=0)});
 await page.click('#btnRun');assert.match(await page.locator('#banner').innerText(),/고정 학생이 총원 또는 남녀 목표보다/);
 await page.evaluate(()=>__bbj.state().students.forEach(s=>s.fixed=null));
 await runExact();
 // All warning reasons are expanded at the top, including students and class names.
 await page.evaluate(()=>{
  const st=__bbj.state();
  st.students=[
   {id:1,name:'분리갑',gender:'남',tags:['특수'],w:{특수:5},fixed:1,g4:'1반',g5:'1반'},
   {id:2,name:'분리을',gender:'남',tags:[],g4:'1반',g5:'1반'},
   {id:3,name:'연속갑',gender:'남',tags:[],g4:'2반',g5:'2반'},
   {id:4,name:'연속을',gender:'남',tags:[],g4:'2반',g5:'2반'}
  ];
  st.classes=[{name:'가반',total:2,male:1,female:1,special:false},{name:'나반',total:2,male:1,female:1,special:true}];
  st.useY3=true;st.pairs=[[1,2]];st.wishGroups=[];
  st.result={assign:[0,0,0,0],ids:[1,2,3,4],moves:0,ms:0};__bbj.renderAll();
 });
 await page.locator('.tab[data-tab="result"]').click();
 assert.equal(await page.locator('#problems li').count(),6);
 const details=await page.locator('#problemPanel').innerText();
 for(const text of ['경고 6건','분리갑','분리을','연속갑','연속을','가반','나반','통합학급 미지정','반드시 이 반 위반'])assert.ok(details.includes(text),text);
 assert.doesNotMatch(details,/평균|힘든 점수|남학생|고른 분포/);
 assert.equal(await page.locator('#problemPanel').isVisible(),true);
 assert.equal(await page.locator('#scoreBar.warn').count(),0);
 await page.locator('#resultCard').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(artifacts,'warning-details.png')});
 console.log('Screenshots:',artifacts);
 // New layout, required groups, transfer students, duplicate names and multi-step undo.
 await page.locator('.tab[data-tab="setup"]').click();
 assert.deepEqual(await page.locator('#tab-setup > .card, #tab-setup > details').evaluateAll(es=>es.map(e=>e.id)),['cardRoster','cardConditions','cardClasses','backupPanel']);
 assert.deepEqual(await page.locator('#cardRoster .roster-inputs button').evaluateAll(es=>es.map(e=>e.id)),['btnUpload','btnPaste','btnAddStudent','btnTemplate','btnSample','btnClearStudents']);
 const oldCount=await page.evaluate(()=>__bbj.state().students.length);
 await page.click('#btnAddStudent');assert.equal(await page.evaluate(()=>__bbj.state().students.length),oldCount+1);
 await page.evaluate(()=>{
  const st=__bbj.state();st.students=Array.from({length:12},(_,i)=>({id:i+1,no:i+1,name:'새기능학생'+i,gender:i%2?'여':'남',g4:'',g5:(i%6+1)+'반',tags:[],w:{},fixed:null}));
  st.students[4].name=st.students[6].name='김민준';st.students[4].fixed=0;
  st.students[8].name='김서연';st.students[9].name='이서연';
  for(const i of [4,6]){st.students[i].tags=['특수'];st.students[i].w={특수:5}}
  for(const i of [7,8]){st.students[i].tags=['학습'];st.students[i].w={학습:5}}
  st.tags=['특수','학습','생활','학부모'].map(name=>({name,weight:1,max:null}));
  st.classes=Array.from({length:3},(_,i)=>({name:['가반','나반','다반'][i],total:4,male:2,female:2,special:i<2}));
  st.pairs=[];st.requiredGroups=[];st.wishGroups=[];st.nextId=13;st.result=null;st.deduct=0;st.useY3=false;__bbj.renderAll();
 });
 await page.fill('#newTagName','추가태그');await page.click('#btnAddTag');
 assert.equal(await page.locator('#tagTable .managed-tag').count(),5);
 await page.locator('#tagTable .managed-tag').filter({hasText:'추가태그'}).locator('button').click();
 assert.equal(await page.locator('#tagTable .managed-tag').count(),4);
 assert.equal(await page.locator('#tagTable table,#tagTable input,#tagTable th').count(),0);
 assert.match(await page.locator('#similarNamesSetup').innerText(),/성 제외 이름이 같은 학생이 있어요: 5-3 김서연, 5-4 이서연/);
 await page.click('#btnAddRequired');
 for(let j=0;j<3;j++){
  if(j===2)await page.locator('#requiredTable [data-act="group-add"]').click();
  await page.locator(`#requiredTable [data-act="pick-student"][data-j="${j}"]`).click();
  await page.locator(`#pickerStudents [data-id="${j+1}"]`).click();
 }
 assert.deepEqual(await page.evaluate(()=>__bbj.state().requiredGroups),[[1,2,3]]);
 for(const id of [7,8,9]){
  await page.click('#btnAddTransfer');await page.fill('#pickerSearch',id===7?'김민준':'');
  await page.locator(`#pickerStudents [data-id="${id}"]`).click();
 }
 assert.equal(await page.locator('#transferList .group-card').count(),3);
 assert.equal(await page.locator('#transferList [data-act="group-add"]').count(),0);
 await page.locator('#cardConditions').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(artifacts,'required-transfer-conditions.png'),fullPage:true});
 await page.click('#btnRun');await page.waitForFunction(()=>!!__bbj.state().result);
 const original=await page.evaluate(()=>({assign:__bbj.state().result.assign.slice(),classes:__bbj.state().classes.map(c=>[c.total,c.male,c.female]),nextId:__bbj.state().nextId}));
 assert.equal(new Set(original.assign.slice(0,3)).size,1);
 assert.notEqual(original.assign[4],original.assign[6]);
 assert.equal(new Set([6,7,8].map(i=>original.assign[i])).size,3);
 assert.equal(await page.evaluate(()=>__bbj.state().result.report.verdict.scoreTotal),5);
 assert.deepEqual(await page.evaluate(()=>__bbj.state().result.report.problems),[]);
 assert.equal(await page.locator('.stu .transfer-badge').count(),3);
 for(const id of [7,8,9])assert.equal(await page.locator(`.stu[data-id="${id}"] .tag-on`).count(),0);
 assert.equal((await page.locator('.tagsum .student-summary').allTextContents()).join(' '),'특수5');
 assert.equal(await page.locator('#summaryCard,#summaryBody,#scoreBarWrap,#scoreBar').count(),0);
 for(const id of ['btnBarCSV','btnCopyTSV','btnPrint','btnUndo'])assert.equal(await page.locator(`.actionbar #${id}`).count(),1);
 assert.match(await page.locator('#similarNamesResult').innerText(),/김서연.*이서연/);
 assert.equal(await page.locator('#btnUndo').isDisabled(),true);
 // Real browser drag dispatches the app's drag/drop handlers and creates warnings immediately.
 await page.locator('.stu[data-id="7"]').dragTo(page.locator('.col[data-k="0"]'));
 assert.match(await page.locator('#problems').innerText(),/동명이인 자동 분리 위반/);
 assert.match(await page.locator('#problems').innerText(),/특수학생 중복 배정/);
 const nextClass=(original.assign[0]+1)%3;
 await page.locator('.stu[data-id="1"]').dragTo(page.locator(`.col[data-k="${nextClass}"]`));
 assert.match(await page.locator('#problems').innerText(),/필수 희망 조합 분리/);
 await page.locator('#classCards').scrollIntoViewIfNeeded();
 const warningBox=await page.locator('#problemPanel').boundingBox();
 await page.screenshot({path:path.join(artifacts,'warning-position-check.png')});
 assert.ok(warningBox.y>=0&&warningBox.y+warningBox.height<940,JSON.stringify(warningBox));
 await page.screenshot({path:path.join(artifacts,'sticky-drag-warnings.png')});
 await page.click('#btnUndo');assert.equal(await page.evaluate(()=>__bbj.state().result.assign[0]),original.assign[0]);
 await page.click('#btnUndo');assert.deepEqual(await page.evaluate(()=>__bbj.state().result.assign),original.assign);
 assert.equal(await page.locator('#btnUndo').isDisabled(),true);
 await page.locator('.col[data-k="0"] [data-act="add-class-student"]').click();
 await page.fill('#addStuName','되돌릴학생');await page.click('#addStuApply');
 assert.equal(await page.evaluate(()=>__bbj.state().students.length),13);
 await page.click('#btnUndo');
 assert.equal(await page.evaluate(()=>__bbj.state().students.length),12);
 assert.equal(await page.evaluate(()=>__bbj.state().nextId),original.nextId);
 assert.deepEqual(await page.evaluate(()=>__bbj.state().classes.map(c=>[c.total,c.male,c.female])),original.classes);
 assert.deepEqual(await page.evaluate(()=>__bbj.state().result.assign),original.assign);
 // A transfer special student moved into an unchecked class is still a special violation.
 for(const layout of ['two','sex']){
  await page.locator(`[data-layout="${layout}"]`).click();
  await page.locator('.stu[data-id="7"]').dragTo(page.locator('.col[data-k="2"]'));
  assert.match(await page.locator('#problems').innerText(),/통합학급 미지정.*김민준/);
  await page.click('#btnUndo');
  assert.deepEqual(await page.evaluate(()=>__bbj.state().result.assign),original.assign);
  assert.equal(await page.locator(`.chiplist.layout-${layout}`).count(),3);
 }
 await page.locator('[data-layout="one"]').click();
 await page.evaluate(()=>{document.activeElement.blur();__bbj.cloud.flush(false)});
 await page.waitForFunction(()=>!__bbj.cloud.pending());
 assert.deepEqual(await page.evaluate(()=>fakeServer.state.requiredGroups),[[1,2,3]]);
 assert.equal(await page.evaluate(()=>fakeServer.state.students.filter(s=>s.transfer).length),3);
 await page.evaluate(()=>{fakeServer.revision++;__bbj.cloud.load()});
 await page.waitForFunction(()=>__bbj.cloud.revision()===fakeServer.revision);
 assert.deepEqual(await page.evaluate(()=>__bbj.state().requiredGroups),[[1,2,3]]);
 assert.equal(await page.evaluate(()=>__bbj.state().students[6].w.특수),5);
 assert.equal(await page.evaluate(()=>__bbj.state().result.report.verdict.scoreTotal),5);
 await page.click('[data-step="2"]');
 await page.waitForFunction(()=>{const r=document.querySelector('#cardConditions').getBoundingClientRect();return r.y>=0&&r.y<150});
 await page.click('[data-step="1"]');
 await page.waitForFunction(()=>{const r=document.querySelector('#cardRoster').getBoundingClientRect();return r.y>=0&&r.y<150});
 await page.screenshot({path:path.join(artifacts,'roster-toolbar-tags.png')});
 await page.click('[data-step="3"]');
 await page.waitForFunction(()=>!document.querySelector('#tab-result').hidden);
 await page.click('[data-step="4"]');
 await page.waitForFunction(()=>document.activeElement.id==='btnBarCSV');
 for(const width of [1280,768,412]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(30);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`new result overflow at ${width}`);
  await page.locator('.tab[data-tab="setup"]').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`new setup overflow at ${width}`);
  await page.locator('.tab[data-tab="result"]').click();
 }

 assert.deepEqual(errors,[]);
 console.log('PASS Chromium: wide monitors and all sort/layout combinations, required/recommended groups, duplicate and similar names, transfer exclusion/distribution, drag warnings, multi-step undo, new layout/navigation, exact automatic/manual class and gender quotas, deduction/check toggles, infeasible-target validation, five-star roster/add/edit limits, expanded important warnings, authentication, tags/stars, six-member separation, duplicate-name picker/search/classes, card grid, aligned compact results, both sorts, student summaries, inline badges/palette, responsive viewports, save/load and polling');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
