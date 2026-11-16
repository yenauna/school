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
 assert.equal(await page.locator('.stepsbar,[data-step]').count(),0);
 assert.match(await page.locator('.tabs #stateBadge').innerText(),/연습용 가상 명단 108명/);
 assert.equal(await page.evaluate(()=>{
  const groups={};__bbj.state().students.forEach(s=>(groups[s.name.slice(1)]||(groups[s.name.slice(1)]=[])).push(s));
  const repeated=Object.values(groups).filter(g=>g.length>1);
  return repeated.length===5&&repeated.every(g=>g.length===2&&g[0].name[0]!==g[1].name[0]);
 }),true);
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
 assert.equal(await page.locator('[data-layout="sex"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>__bbj.state().resultLayout),'sex');
 assert.equal(await page.inputValue('#scoreGap'),'2');
 await page.locator('[data-layout="one"]').click();
 assert.equal(await page.evaluate(()=>__bbj.state().resultLayout),'one');
 await page.locator('[data-layout="sex"]').click();
 assert.equal(await page.evaluate(()=>__bbj.state().resultLayout),'sex');
 assert.equal(await page.locator('.actionbar').isVisible(),false);
 assert.equal(await page.locator('#resultCard .result-actions button').allTextContents().then(a=>a.join('|')),'다시 배정|경고만 최소 조정|표로 복사|인쇄|엑셀 내려받기');
 const order=await page.locator('.result-heading,.result-views,.result-signals,#boardCard').evaluateAll(es=>es.map(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom})));
 assert.equal(order.length,4);order.slice(1).forEach((r,i)=>assert.ok(r.top>=order[i].bottom-1));
 const toggleHeight=(await page.locator('#resultSort button').first().boundingBox()).height;
 const lampHeight=(await page.locator('#verdict .v').first().boundingBox()).height;
 assert.ok(toggleHeight<lampHeight);
 const undoRight=await page.locator('#btnUndo').boundingBox(),rowRight=await page.locator('.result-signals').boundingBox();
 assert.ok(Math.abs(undoRight.x+undoRight.width-rowRight.x-rowRight.width)<2);
 await page.locator('[data-layout="one"]').click();

 await page.evaluate(()=>{window.print=()=>{window.testPrinted=true};Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.testCopied=text}}})});
 await page.click('#btnPrint');assert.equal(await page.evaluate(()=>window.testPrinted),true);
 await page.click('#btnCopyTSV');assert.match(await page.evaluate(()=>window.testCopied),/^5학년 반\t번호\t이름/);
 const exportReady=page.waitForEvent('download');await page.click('#btnBarCSV');const exported=await exportReady;
 assert.match(exported.suggestedFilename(),/^반배정결과_.*\.csv$/);
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
 assert.equal(await page.locator('#problemPanel').isVisible(),false);
 assert.equal(await page.locator('#problems li').count(),0);
 assert.equal(await page.locator('#toast.show').count(),0);
 await page.screenshot({path:path.join(artifacts,'sticky-long-board.png')});
 // Wide monitor containers and all six combinations of sort/layout modes.
 const viewBaseline=await page.evaluate(()=>({assign:__bbj.state().result.assign.slice(),problems:__bbj.state().result.report.problems.slice()}));
 for(const width of [1280,1920,2560]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(30);
  const widths=await page.locator('header,.tabs,main').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().width));
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
 assert.equal(await page.evaluate(()=>__bbj.cloud.pollMs()),1000);
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
 // Totals only: no male/female targets, automatic gender balance, exact capacity.
 await page.locator('.tab[data-tab="setup"]').click();
 await page.evaluate(()=>{
  const st=__bbj.state();
  st.students=Array.from({length:108},(_,i)=>({id:i+1,name:'목표검증'+i,gender:i%2?'여':'남',g4:'',g5:(i%6+1)+'반',tags:[],w:{},fixed:null}));
  st.classes=Array.from({length:6},(_,i)=>({name:['가반','나반','다반','라반','마반','바반'][i],special:i<2,total:0,male:999,female:0}));
  st.deduct=2;st.useY3=false;st.pairs=[];st.requiredGroups=[];st.wishGroups=[];st.result=null;__bbj.renderAll();
 });
 const field=(k,f)=>page.locator(`#classTable input[data-k="${k}"][data-field="${f}"]`);
 assert.deepEqual(await page.locator('#classTable th').allTextContents(),['반','통합학급','목표 인원']);
 assert.equal(await page.locator('#classTable [data-field="male"],#classTable [data-field="female"]').count(),0);
 const assertSums=async()=>{
  assert.equal(await page.evaluate(()=>__bbj.state().classes.reduce((sum,c)=>sum+c.total,0)),108);
  assert.deepEqual((await page.locator('#classTable tfoot td').allTextContents()).slice(2),['108']);
 };
 const runExact=async()=>{
  const targets=await page.evaluate(()=>__bbj.state().classes.map(c=>c.total));
  await page.click('#btnRun');await page.waitForFunction(()=>!!__bbj.state().result);
  assert.deepEqual(await page.evaluate(()=>__bbj.state().result.report.per.map(p=>p.count)),targets);
  assert.equal(await page.evaluate(()=>__bbj.state().result.report.per.reduce((sum,p)=>sum+p.male,0)),54);
  assert.equal(await page.evaluate(()=>__bbj.state().result.report.per.every(p=>Math.abs(p.male-p.female)<=1)),true);
  await page.locator('.tab[data-tab="setup"]').click();
 };
 await page.click('#btnAutoTargets');await assertSums();
 await page.locator('#cardClasses').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(artifacts,'total-only-targets.png')});
 assert.deepEqual(await page.evaluate(()=>__bbj.state().classes.map(c=>c.total)),[17,17,19,19,18,18]);
 // Stale values in an old work file must not act as hidden gender constraints.
 await page.evaluate(()=>__bbj.state().classes.forEach(c=>{c.male=999;c.female=0}));
 await runExact();
 await field(2,'special').check();await assertSums();
 await page.fill('#deduct','');assert.equal(await page.inputValue('#deduct'),'');
 await page.locator('#deduct').pressSequentially('3');await assertSums();
 await page.click('#btnAutoTargets');await runExact();
 const totals=await page.evaluate(()=>__bbj.state().classes.map(c=>c.total));
 await field(0,'total').fill(String(totals[0]+2));await field(1,'total').fill(String(totals[1]-2));
 await assertSums();await runExact();
 await field(0,'total').fill(String(totals[0]+3));await page.click('#btnRun');
 assert.equal(await page.evaluate(()=>__bbj.state().result),null);
 assert.match(await page.locator('#banner').innerText(),/목표 인원 합계/);
 await page.click('#btnAutoTargets');await assertSums();
 await page.evaluate(()=>{const st=__bbj.state();st.students.slice(0,st.classes[0].total+1).forEach(s=>s.fixed=0)});
 await page.click('#btnRun');assert.match(await page.locator('#banner').innerText(),/고정 학생이 목표 총원보다/);
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
 assert.equal(await page.evaluate(()=>__bbj.state().result.report.problems.length),6);
 const details=(await page.locator('.signal-details,.class-notes').allTextContents()).join(' ');
 for(const text of ['분리갑','분리을','연속갑','연속을','가반','나반','통합×','2명 부족','2명 초과'])assert.ok(details.includes(text),text);
 assert.doesNotMatch(details,/평균|힘든 점수|남학생|고른 분포/);
 assert.ok(await page.locator('.signal-details.bad').count()>0);
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
 assert.equal(await page.locator('#givenNamesNotice').innerText(),'[권장] 성 제외 이름 같음 : 5-3 김서연, 5-4 이서연');
 assert.equal(await page.locator('#duplicateNamesNotice').innerText(),'[필수] 동명이인 : 5-1 김민준, 5-5 김민준');
 assert.equal(await page.locator('#cardConditions > :last-child').getAttribute('id'),'nameNotices');
 assert.equal(await page.locator('#specialCount').innerText(),"현재 '특수' 학생 2명");
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
 assert.equal(await page.locator('.required-heart').count(),3);
 assert.equal((await page.locator('.required-heart').evaluateAll(es=>[...new Set(es.map(e=>getComputedStyle(e).color))])).length,1);
 assert.notEqual(original.assign[4],original.assign[6]);
 assert.equal(new Set([6,7,8].map(i=>original.assign[i])).size,3);
 assert.equal(await page.evaluate(()=>__bbj.state().result.report.verdict.scoreTotal),5);
 assert.deepEqual(await page.evaluate(()=>__bbj.state().result.report.problems),[]);
 assert.equal(await page.locator('.stu .transfer-badge').count(),3);
 for(const id of [7,8,9])assert.equal(await page.locator(`.stu[data-id="${id}"] .tag-on`).count(),0);
 assert.equal((await page.locator('.tagsum .student-summary').allTextContents()).join(' '),'특수5');
 assert.equal(await page.locator('#summaryCard,#summaryBody,#scoreBarWrap,#scoreBar').count(),0);
 for(const id of ['btnBarCSV','btnCopyTSV','btnPrint'])assert.equal(await page.locator(`#resultActions #${id}`).count(),1);
 assert.equal(await page.locator('.result-signals #btnUndo').count(),1);
 assert.equal(await page.locator('.actionbar').isVisible(),false);
 assert.equal(await page.locator('#similarNamesSetup,#similarNamesResult,#tab-result #nameNotices').count(),0);
 assert.equal(await page.locator('#btnUndo').isDisabled(),true);
 // Real browser drag dispatches the app's drag/drop handlers and creates warnings immediately.
 await page.locator('.stu[data-id="7"]').dragTo(page.locator('.col[data-k="0"]'));
 assert.match(await page.locator('[data-details="duplicate"]').innerText(),/가반 김민준/);
 assert.match(await page.locator('[data-details="special"]').innerText(),/김민준.*중복/);
 assert.equal(await page.locator('.stu[data-id="5"].viol,.stu[data-id="7"].viol').count(),2);
 assert.ok(await page.locator('.col.quota-bad').count()>=2);
 const nextClass=(original.assign[0]+1)%3;
 await page.locator('.stu[data-id="1"]').dragTo(page.locator(`.col[data-k="${nextClass}"]`));
 assert.equal(await page.locator('#comboMoveModal').isVisible(),true);
 assert.match(await page.locator('#comboMoveText').innerText(),/^필수 조합 새기능학생1, 새기능학생2 학생도 함께 옮기겠습니까\?/);
 await page.click('#comboMoveNo');
 assert.equal(await page.locator('#comboMoveModal').isVisible(),false);
 assert.deepEqual(await page.evaluate(()=>__bbj.state().result.assign.slice(0,3)),original.assign.slice(0,3));
 await page.locator('.stu[data-id="1"]').dragTo(page.locator(`.col[data-k="${nextClass}"]`));
 await page.click('#comboMoveYes');
 assert.deepEqual(await page.evaluate(()=>__bbj.state().result.assign.slice(0,3)),[nextClass,nextClass,nextClass]);
 assert.match(await page.locator('[data-check="required"]').getAttribute('class'),/ok/);
 // A split required group still turns red when it comes from elsewhere (here: a server-style state).
 await page.evaluate(()=>{const st=__bbj.state();st.result.assign[1]=(st.result.assign[0]+1)%3;__bbj.renderAll()});
 assert.match(await page.locator('[data-details="required"]').innerText(),/새기능학생0/);
 await page.evaluate(()=>{const st=__bbj.state();st.result.assign[1]=st.result.assign[0];__bbj.renderAll()});
 assert.match(await page.locator('[data-check="required"]').getAttribute('class'),/ok/);
 await page.locator('#classCards').scrollIntoViewIfNeeded();
 const warningBox=await page.locator('.result-signals').boundingBox();
 await page.screenshot({path:path.join(artifacts,'warning-position-check.png')});
 assert.ok(warningBox.y>=0&&warningBox.y+warningBox.height<940,JSON.stringify(warningBox));
 await page.screenshot({path:path.join(artifacts,'sticky-drag-warnings.png')});
 await page.click('#btnUndo');assert.equal(await page.evaluate(()=>__bbj.state().result.assign[0]),original.assign[0]);
 await page.click('#btnUndo');assert.deepEqual(await page.evaluate(()=>__bbj.state().result.assign),original.assign);
 assert.equal(await page.locator('#btnUndo').isDisabled(),true);
 assert.equal(await page.locator('#problemPanel').isVisible(),false);
 assert.equal(await page.locator('#toast.show').count(),0);
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
  assert.match(await page.locator('[data-details="special"]').innerText(),/김민준.*통합×/);
  assert.equal(await page.locator('.stu[data-id="7"].viol').count(),1);
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
 assert.equal(await page.locator('.required-heart').count(),3);
 assert.equal(await page.evaluate(()=>__bbj.state().result.report.verdict.scoreTotal),5);
 await page.locator('.tab[data-tab="setup"]').click();
 assert.equal(await page.locator('.stepsbar,#stepGuide,[data-step]').count(),0);
 await page.locator('#cardRoster').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(artifacts,'roster-toolbar-tags.png')});
 await page.locator('.tab[data-tab="result"]').click();
 assert.equal(await page.locator('#problemPanel').isVisible(),false);
 assert.equal(await page.locator('#toast.show').count(),0);
 for(const width of [1280,768,412]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(30);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`new result overflow at ${width}`);
  await page.locator('.tab[data-tab="setup"]').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`new setup overflow at ${width}`);
  await page.locator('.tab[data-tab="result"]').click();
 }

 // Exactly seven short traffic lights; references never become hard warnings.
 await page.setViewportSize({width:1600,height:1000});
 await page.evaluate(()=>{
  const st=__bbj.state();
  st.students=['김철수','박철수','최유나','정하린'].map((name,i)=>({id:i+1,name,no:i+1,g4:'',g5:(i+1)+'반',gender:i%2?'여':'남',tags:[],w:{},fixed:null}));
  st.classes=[{name:'가반',total:2,male:1,female:1,special:true},{name:'나반',total:2,male:1,female:1,special:true}];
  st.pairs=[];st.requiredGroups=[];st.wishGroups=[[1,3]];st.useY3=false;
  st.result={assign:[0,0,1,1],ids:[1,2,3,4],moves:0,ms:0};__bbj.renderAll();
 });
 const shortLabels=['특수','동명이인','이름만 같음','3년 같은 반','필수 분리','필수 희망','추천 희망','별점','인원'];
 assert.deepEqual(await page.locator('#verdict .v').allTextContents(),shortLabels);
 assert.equal(await page.locator('#verdict .v.warn').count(),2);
 assert.equal(await page.locator('#verdict .v.bad').count(),0);
 assert.equal(await page.locator('#verdict [data-check="given"]').getAttribute('data-reference'),'가반 김철수·박철수');
 assert.equal(await page.locator('#verdict [data-check="recommended"]').getAttribute('data-reference'),'가반 김철수 / 나반 최유나');
 assert.equal(await page.locator('#problemPanel').isVisible(),false);
 assert.equal(await page.locator('#wishInfo').count(),0);
 assert.equal(await page.locator('.signal-details.warn').count(),0);
 assert.equal(await page.locator('[data-signal="given"] .signal-details').count(),0);
 assert.equal(await page.locator('#referencePopup').isVisible(),false);
 assert.equal(await page.locator('#problemPanel,#problems').count(),0);
 assert.equal(await page.locator('#toast.show').count(),0);
 await page.locator('#verdict [data-check="given"]').hover();
 assert.equal(await page.locator('#referencePopup').isVisible(),true);
 assert.equal(await page.locator('#referencePopup').innerText(),'가반 김철수·박철수');
 await page.locator('#resultCard').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(artifacts,'reference-hover-signals.png')});
 await page.mouse.move(0,0);assert.equal(await page.locator('#referencePopup').isVisible(),false);
 for(const width of [1280,768,412]){
  await page.setViewportSize({width,height:900});
  const tops=await page.locator('#verdict .v').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().y));
  assert.ok(Math.max(...tops)-Math.min(...tops)<1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 await page.setViewportSize({width:1600,height:1000});
 // All five required indicators turn red, with names/classes in each tooltip.
 await page.evaluate(()=>{
  const st=__bbj.state();st.students[2].name=st.students[3].name='홍길동';
  st.students[0].tags=st.students[1].tags=['특수'];st.classes[0].special=false;
  st.students[0].g4=st.students[1].g4='1반';st.students[0].g5=st.students[1].g5='1반';
  st.useY3=true;st.pairs=[[1,2]];st.requiredGroups=[[1,3]];__bbj.renderAll();
 });
 for(const key of ['special','duplicate','three-year','separate','required']){
  assert.match(await page.locator(`#verdict [data-check="${key}"]`).getAttribute('class'),/bad/);
  assert.match(await page.locator(`#verdict [data-check="${key}"]`).getAttribute('title'),/가반|나반/);
  assert.match(await page.locator(`#verdict [data-check="${key}"]`).getAttribute('title'),/김철수|박철수|홍길동/);
 }
 assert.equal(await page.locator('#verdict .v.warn').count(),2);
 assert.ok(await page.locator('.signal-details.bad').count()>0);
 await page.screenshot({path:path.join(artifacts,'seven-required-signals.png')});
 // Identical full names alone are a mandatory collision, not a different-surname reference.
 await page.evaluate(()=>{const st=__bbj.state();st.students[0].name=st.students[1].name='김철수';__bbj.renderAll()});
 assert.match(await page.locator('#verdict [data-check="given"]').getAttribute('class'),/ok/);
 assert.match(await page.locator('#verdict [data-check="duplicate"]').getAttribute('class'),/bad/);
 // With all constraints satisfied and reference names separated, all seven lights are green.
 await page.evaluate(()=>{
  const st=__bbj.state();['김철수','박철수','최유나','정하린'].forEach((name,i)=>Object.assign(st.students[i],{name,tags:[],g4:'',gender:i===0||i===3?'남':'여'}));
  st.classes[0].special=true;st.pairs=[];st.requiredGroups=[];st.useY3=false;
  st.result.assign=[0,1,0,1];__bbj.renderAll();
 });
 assert.equal(await page.locator('#verdict .v.ok').count(),9);
 assert.equal(await page.locator('.signal-details').count(),0);
 assert.equal(await page.locator('.col.quota-bad').count(),0);
 assert.equal(await page.locator('#problemPanel').isVisible(),false);
 assert.deepEqual(await page.locator('#verdict .v').allTextContents(),shortLabels);
 // Same-color hearts follow connected required groups in every layout.
 await page.setViewportSize({width:1600,height:1000});
 await page.evaluate(()=>{
  const st=__bbj.state();st.students=Array.from({length:8},(_,i)=>({id:i+1,name:'하트학생'+i,no:i+1,g4:'',g5:(i%6+1)+'반',gender:i%2?'여':'남',tags:[],w:{},fixed:null}));
  st.classes=[{name:'가반',total:4,special:false},{name:'나반',total:4,special:false}];
  st.requiredGroups=[[1,2],[2,3],[5,6]];st.pairs=[];st.wishGroups=[];st.useY3=false;
  st.result={assign:[0,0,0,0,1,1,1,1],ids:[1,2,3,4,5,6,7,8],moves:0,ms:0};__bbj.renderAll();
 });
 let heartColors;
 for(const layout of ['one','two','sex']){
  await page.locator(`[data-layout="${layout}"]`).click();
  assert.equal(await page.locator('.required-heart').count(),5);
  const colors=await page.locator('.required-heart').evaluateAll(es=>Object.fromEntries(es.map(e=>[e.closest('.stu').dataset.id,getComputedStyle(e).color])));
  assert.equal(colors['1'],colors['2']);assert.equal(colors['2'],colors['3']);assert.equal(colors['5'],colors['6']);assert.notEqual(colors['1'],colors['5']);
  if(heartColors)assert.deepEqual(colors,heartColors);else heartColors=colors;
  assert.equal(await page.locator('.stu[data-id="4"] .required-heart').count(),0);
  assert.equal(await page.locator('.required-heart').evaluateAll(es=>es.every(e=>e.textContent==='♥'&&e.previousElementSibling.classList.contains('nm'))),true);
 }
 await page.screenshot({path:path.join(artifacts,'required-group-hearts.png')});
 // All reference details remain hidden until hover/focus, including stars and proportional gender counts.
 await page.mouse.move(0,0);
 await page.evaluate(()=>{
  const st=__bbj.state();
  st.students=Array.from({length:30},(_,i)=>({id:i+1,name:'참고학생'+i,no:i+1,g4:'',g5:(i%6+1)+'반',gender:(i<10?i<8:i<20?i<15:i<22)?'남':'여',tags:(i<4||(i>=10&&i<12))?['학습']:[],w:{학습:5},fixed:null}));
  st.classes=['가반','나반','다반'].map(name=>({name,total:10,special:false}));st.requiredGroups=[];st.pairs=[];st.wishGroups=[];st.useY3=false;
  st.result={assign:st.students.map((_,i)=>Math.floor(i/10)),ids:st.students.map(s=>s.id),moves:0,ms:0};__bbj.renderAll();
 });
 assert.equal(await page.locator('.signal-details.warn').count(),0);
 assert.equal(await page.locator('#referencePopup').isVisible(),false);
 assert.match(await page.locator('[data-check="score"]').getAttribute('class'),/bad/);
 assert.equal(await page.locator('[data-signal="score"] .signal-details').innerText(),'다반 0점, 가반 20점');
 assert.match(await page.locator('[data-check="count"]').getAttribute('class'),/warn/);
 assert.deepEqual(await page.evaluate(()=>__bbj.state().result.report.problems),[]);
 assert.equal(await page.locator('.col.quota-bad').count(),0);
 const cells=await page.locator('.signal').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().width));
 assert.ok(Math.max(...cells)-Math.min(...cells)<1);
 // The star gap threshold re-judges immediately and is kept in the state.
 await page.fill('#scoreGap','25');await page.dispatchEvent('#scoreGap','change');
 assert.match(await page.locator('[data-check="score"]').getAttribute('class'),/ok/);
 assert.equal(await page.locator('[data-signal="score"] .signal-details').count(),0);
 assert.equal(await page.evaluate(()=>__bbj.state().scoreGap),25);
 await page.fill('#scoreGap','2');await page.dispatchEvent('#scoreGap','change');
 assert.match(await page.locator('[data-check="score"]').getAttribute('class'),/bad/);
 assert.equal(await page.evaluate(()=>__bbj.state().scoreGap),2);
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#scoreGapRow span')].map(s=>s.textContent).join(' ')),'별점 높은 반과 낮은 반이 점 이상 차이날 때부터 경고 표시');
 assert.equal(await page.inputValue('#scoreGap'),'2');
 await page.mouse.move(0,0);
 await page.locator('[data-check="count"]').hover();
 assert.equal(await page.locator('#referencePopup').isVisible(),true);
 assert.match(await page.locator('#referencePopup').innerText(),/가반 남자 많음/);
 assert.match(await page.locator('#referencePopup').innerText(),/다반 남자 부족/);
 const scoreBox=await page.locator('[data-check="count"]').boundingBox(),hoverBox=await page.locator('#referencePopup').boundingBox();
 assert.ok(hoverBox.y+hoverBox.height<=scoreBox.y);
 await page.screenshot({path:path.join(artifacts,'count-reference-hover.png')});
 await page.mouse.move(0,0);assert.equal(await page.locator('#referencePopup').isVisible(),false);
 await page.locator('[data-check="count"]').focus();
 assert.equal(await page.locator('#referencePopup').isVisible(),true);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#referencePopup').isVisible(),false);
 await page.setViewportSize({width:412,height:900});
 await page.locator('[data-check="count"]').hover();
 const smallTip=await page.locator('#referencePopup').boundingBox();assert.ok(smallTip.x>=0&&smallTip.x+smallTip.width<=412);
 await page.mouse.move(0,0);await page.locator('[data-check="count"]').blur();await page.keyboard.press('Escape');
 await page.locator('[data-check="count"]').click();
 assert.equal(await page.locator('#referencePopup').isVisible(),true);
 await page.mouse.move(0,0);assert.equal(await page.locator('#referencePopup').isVisible(),true);
 const clickedTip=await page.locator('#referencePopup').boundingBox();assert.ok(clickedTip.x>=0&&clickedTip.x+clickedTip.width<=412&&clickedTip.y>=0&&clickedTip.y+clickedTip.height<=900);
 await page.screenshot({path:path.join(artifacts,'count-mobile-click.png')});
 await page.locator('[data-check="count"]').click();assert.equal(await page.locator('#referencePopup').isVisible(),false);
 await page.locator('[data-check="count"]').click();assert.equal(await page.locator('#referencePopup').isVisible(),true);
 await page.mouse.click(5,180);assert.equal(await page.locator('#referencePopup').isVisible(),false);
 // A real touch-enabled Chromium context must open the portal by tapping, not synthetic hover.
 const touchState=await page.evaluate(()=>JSON.parse(JSON.stringify(__bbj.state())));
 const touchPage=await browser.newPage({viewport:{width:412,height:900},hasTouch:true,isMobile:true});
 await touchPage.addInitScript(state=>{
  sessionStorage.setItem('banbaejeong.cloud','2026');
  window.__bbjTransport=(path,body,cb)=>setTimeout(()=>cb(null,{state,revision:1}),5);
 },touchState);
 await touchPage.goto(process.env.BBJ_URL||'http://127.0.0.1:4173/banbaejeong/');
 await touchPage.waitForFunction(()=>window.__bbj&&__bbj.state().students.length===30);
 await touchPage.locator('[data-tab="result"]').tap();
 const touchPill=touchPage.locator('[data-check="count"]');
 await touchPill.tap();assert.equal(await touchPage.locator('#referencePopup').isVisible(),true);
 assert.match(await touchPage.locator('#referencePopup').innerText(),/가반 남자 많음/);
 assert.equal(await touchPage.locator('#referencePopup').evaluate(e=>{
  const r=e.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight&&!!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('#referencePopup');
 }),true);
 await touchPage.screenshot({path:path.join(artifacts,'gender-touch-popup.png')});
 await touchPill.tap();assert.equal(await touchPage.locator('#referencePopup').isVisible(),false);
 await touchPage.close();

 // Fixed students are locked against dragging; changing their fixed class moves them at once.
 await page.mouse.move(0,0);await page.setViewportSize({width:1600,height:1000});
 await page.evaluate(()=>{
  const st=__bbj.state();
  st.students=Array.from({length:6},(_,i)=>({id:i+1,name:'고정학생'+i,no:i+1,g4:'',g5:(i+1)+'반',gender:i%2?'여':'남',tags:[],w:{},fixed:null}));
  st.students[0].fixed=1;
  st.classes=[{name:'가반',total:3,male:2,female:1,special:false},{name:'나반',total:3,male:1,female:2,special:false}];
  st.requiredGroups=[];st.pairs=[];st.wishGroups=[];st.useY3=false;
  st.result={assign:[1,1,1,0,0,0],ids:[1,2,3,4,5,6],moves:0,ms:0};__bbj.renderAll();
 });
 await page.locator('.tab[data-tab="result"]').click();
 assert.equal(await page.locator('.stu[data-id="1"].locked').count(),1);
 await page.locator('.stu[data-id="1"]').dragTo(page.locator('.col[data-k="0"]'));
 assert.equal(await page.evaluate(()=>__bbj.state().result.assign[0]),1);
 assert.match(await page.locator('#toast').innerText(),/고정 학생은 이름을 눌러 고정 반을 바꾼 뒤 옮기세요\./);
 await page.waitForTimeout(60);
 await page.locator('.stu[data-id="2"]').dragTo(page.locator('.col[data-k="0"]'));
 assert.equal(await page.evaluate(()=>__bbj.state().result.assign[1]),0);
 await page.click('#btnUndo');
 assert.equal(await page.evaluate(()=>__bbj.state().result.assign[1]),1);
 await page.locator('.stu[data-id="1"] button.nm').click();
 await page.selectOption('#addStuFixed','0');await page.click('#addStuApply');
 assert.equal(await page.evaluate(()=>__bbj.state().result.assign[0]),0);
 assert.equal(await page.evaluate(()=>__bbj.state().students[0].fixed),0);
 assert.equal(await page.locator('.stu[data-id="1"].locked').count(),1);
 await page.locator('.stu[data-id="1"] button.nm').click();
 await page.selectOption('#addStuFixed','');await page.click('#addStuApply');
 assert.equal(await page.locator('.stu[data-id="1"].locked').count(),0);
 await page.locator('.stu[data-id="1"]').dragTo(page.locator('.col[data-k="1"]'));
 assert.equal(await page.evaluate(()=>__bbj.state().result.assign[0]),1);
 await page.click('#btnUndo');
 // A required-group member asks before the group is carried along.
 await page.evaluate(()=>{const st=__bbj.state();st.requiredGroups=[[1,2]];st.result.assign=[0,0,1,1,1,1];__bbj.renderAll()});
 await page.locator('.stu[data-id="1"]').dragTo(page.locator('.col[data-k="1"]'));
 assert.equal(await page.locator('#comboMoveModal').isVisible(),true);
 assert.match(await page.locator('#comboMoveText').innerText(),/필수 조합 고정학생1 학생도 함께 옮기겠습니까\?/);
 await page.click('#comboMoveNo');
 assert.deepEqual(await page.evaluate(()=>__bbj.state().result.assign.slice(0,2)),[0,0]);
 await page.locator('.stu[data-id="1"]').dragTo(page.locator('.col[data-k="1"]'));
 await page.click('#comboMoveYes');
 assert.deepEqual(await page.evaluate(()=>__bbj.state().result.assign.slice(0,2)),[1,1]);
 await page.click('#btnUndo');
 assert.deepEqual(await page.evaluate(()=>__bbj.state().result.assign.slice(0,2)),[0,0]);
 // Changing the fixed class into a class that would split a required group asks first; 아니오 also rolls the fixed value back.
 await page.evaluate(()=>{const st=__bbj.state();st.requiredGroups=[[1,2]];st.result.assign=[0,0,1,1,1,1];st.students[0].fixed=null;__bbj.renderAll()});
 await page.locator('.stu[data-id="1"] button.nm').click();
 await page.selectOption('#addStuFixed','1');await page.click('#addStuApply');
 assert.equal(await page.locator('#comboMoveModal').isVisible(),true);
 await page.click('#comboMoveNo');
 assert.equal(await page.evaluate(()=>__bbj.state().students[0].fixed),null);
 assert.equal(await page.evaluate(()=>__bbj.state().result.assign[0]),0);
 // The 인원 pill carries both the total and the gender imbalance, named inside class cards.
 await page.evaluate(()=>{
  const st=__bbj.state();
  st.students=Array.from({length:6},(_,i)=>({id:i+1,name:'인원학생'+i,no:i+1,g4:'',g5:(i+1)+'반',gender:i%2?'여':'남',tags:[],w:{},fixed:null}));
  st.classes=[{name:'가반',total:4,male:2,female:2,special:false},{name:'나반',total:2,male:1,female:1,special:false}];
  st.requiredGroups=[];st.pairs=[];st.wishGroups=[];st.useY3=false;
  st.result={assign:[0,0,1,1,1,1],ids:[1,2,3,4,5,6],moves:0,ms:0};__bbj.renderAll();
 });
 assert.equal(await page.locator('.col[data-k="0"] .class-notes').innerText(),'2명 부족 (남1 여1)');
 assert.equal(await page.locator('.col[data-k="1"] .class-notes').innerText(),'2명 초과 (남1 여1)');
 assert.equal(await page.locator('.col.quota-bad').count(),2);
 assert.match(await page.locator('[data-check="count"]').getAttribute('class'),/bad/);
 const countDetails=await page.locator('[data-signal="count"] .signal-details').innerText();
 assert.match(countDetails,/가반 2명 부족 \(남1 여1\)/);
 assert.match(countDetails,/나반 2명 초과 \(남1 여1\)/);
 await page.evaluate(()=>{
  const st=__bbj.state();
  st.students=Array.from({length:8},(_,i)=>({id:i+1,name:'성비학생'+i,no:i+1,g4:'',g5:(i%2+1)+'반',gender:i<4?'남':'여',tags:[],w:{},fixed:null}));
  st.classes=[{name:'가반',total:4,male:2,female:2,special:false},{name:'나반',total:4,male:2,female:2,special:false}];
  st.result={assign:[0,0,0,0,1,1,1,1],ids:[1,2,3,4,5,6,7,8],moves:0,ms:0};__bbj.renderAll();
 });
 assert.equal(await page.locator('.col[data-k="0"] .class-notes').innerText(),'남자 많음');
 assert.equal(await page.locator('.col[data-k="1"] .class-notes').innerText(),'남자 부족');
 assert.equal(await page.locator('.col.quota-bad').count(),0);
 assert.match(await page.locator('[data-check="count"]').getAttribute('class'),/warn/);
 // 한쪽 성만 모자라고 다른 성은 넘치는 반은 숫자 대신 말로 보여 준다.
 await page.evaluate(()=>{
  const st=__bbj.state();
  st.students=Array.from({length:16},(_,i)=>({id:i+1,name:'섬임학생'+i,no:i+1,g4:'',g5:(i%2+1)+'반',gender:i<6?'남':'여',tags:[],w:{},fixed:null}));
  st.classes=[{name:'가반',total:9,male:5,female:4,special:false},{name:'나반',total:7,male:4,female:3,special:false}];
  st.result={assign:st.students.map((s,i)=>[0,1,2,3,4,6,7,8].indexOf(i)>=0?0:1),ids:st.students.map(s=>s.id),moves:0,ms:0};__bbj.renderAll();
 });
 assert.equal(await page.locator('.col[data-k="0"] .class-notes').innerText(),'1명 부족 (여자 부족)');
 assert.equal(await page.locator('.col[data-k="1"] .class-notes').innerText(),'1명 초과 (여자 많음)');
 // The bottom bar stays thin on PC, phone and landscape phone; content keeps clear of it.
 await page.locator('.tab[data-tab="setup"]').click();
 for(const [w,h,limit] of [[1600,1000,50],[412,900,45],[900,420,40]]){
  await page.setViewportSize({width:w,height:h});await page.waitForTimeout(60);
  const bar=await page.locator('.actionbar').boundingBox();
  assert.ok(bar.height<=limit,`actionbar ${w}x${h} height ${bar.height}`);
  const pad=await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('main')).paddingBottom));
  assert.ok(pad>=bar.height,`main padding ${pad} < bar ${bar.height} at ${w}x${h}`);
 }
 await page.setViewportSize({width:1600,height:1000});await page.waitForTimeout(60);


 await page.mouse.move(0,0);await page.setViewportSize({width:1600,height:1000});
 // Grouped notices live only at the bottom of conditions; roster edits update them and the special count.
 await page.setViewportSize({width:1600,height:1000});
 await page.locator('.tab[data-tab="setup"]').click();
 await page.evaluate(()=>{
  const st=__bbj.state(),names=['홍길동','홍길동','손흥민','손흥민','김철수','박철수','이철수','이찬','박찬'];
  const grades=[1,3,4,5,2,4,5,1,3];
  st.students=names.map((name,i)=>({id:i+1,name,no:i+1,g4:'',g5:grades[i]+'반',gender:i%2?'여':'남',tags:i<4?['특수']:[],w:{},fixed:null}));
  st.tags=['특수','학습','생활','학부모'].map(name=>({name,weight:1,max:null}));
  st.requiredGroups=[];st.pairs=[];st.wishGroups=[];st.result=null;st.sample=false;st.nextId=10;__bbj.renderAll();
 });
 assert.equal(await page.locator('#duplicateNamesNotice').innerText(),'[필수] 동명이인 : 5-1 홍길동, 5-3 홍길동 / 5-4 손흥민, 5-5 손흥민');
 assert.equal(await page.locator('#givenNamesNotice').innerText(),'[권장] 성 제외 이름 같음 : 5-2 김철수, 5-4 박철수, 5-5 이철수 / 5-1 이찬, 5-3 박찬');
 assert.equal(await page.locator('#specialCount').innerText(),"현재 '특수' 학생 4명");
 assert.equal(await page.locator('#stateBadge').innerText(),'실제 명단 9명');
 assert.equal(await page.locator('.actionbar').isVisible(),true);
 await page.locator('#studentTable [data-act="toggle-tag"][data-id="1"][data-tag="특수"]').click();
 assert.equal(await page.locator('#specialCount').innerText(),"현재 '특수' 학생 3명");
 page.once('dialog',d=>d.accept());
 await page.locator('#tagTable .managed-tag').filter({hasText:'특수'}).locator('button').click();
 assert.equal(await page.locator('#specialCount').innerText(),"현재 '특수' 학생 0명");
 await page.locator('#nameNotices').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(artifacts,'grouped-name-notices.png')});
 await page.evaluate(()=>{__bbj.state().students=[];__bbj.renderAll()});
 assert.equal(await page.locator('#duplicateNamesNotice').innerText(),'[필수] 동명이인 : 없음');
 assert.equal(await page.locator('#givenNamesNotice').innerText(),'[권장] 성 제외 이름 같음 : 없음');
 assert.equal(await page.locator('#specialCount').innerText(),"현재 '특수' 학생 0명");
 assert.equal(await page.locator('#stateBadge').innerText(),'아직 명단이 없습니다');
 assert.deepEqual(errors,[]);
 console.log('PASS Chromium: fixed-student drag lock and fixed-class auto move, required-group companion dialog, adjustable star-gap threshold and 인원 pill with class notes, four-row compact result, hidden bottom bar, slim default male/female view, inline signal cards and special/quota outlines, bounded demo names and nine traffic-light tooltips/colors, wide monitors and all sort/layout combinations, required/recommended groups, duplicate and similar names, transfer exclusion/distribution, drag warnings, multi-step undo, compact header badge, grouped names/special counts, zero-warning panel/toast hiding, new layout, exact automatic/manual class and gender quotas, deduction/check toggles, infeasible-target validation, five-star roster/add/edit limits, expanded important warnings, authentication, tags/stars, six-member separation, duplicate-name picker/search/classes, card grid, aligned compact results, both sorts, student summaries, inline badges/palette, thin bottom bar on PC/phone/landscape, responsive viewports, save/load and polling');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
