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
 assert.deepEqual(await page.locator('#tagTable th').allTextContents(),['태그 이름','해당 학생 인원수','삭제']);
 assert.equal(await page.locator('#pairBulk,#wishBulk,#tagTable input[type=number]').count(),0);
 assert.match(await page.locator('#cardClasses').innerText(),/특수학생은 통합학급으로 체크한 반에만 배정됩니다\./);
 await page.click('#btnSample');
 await page.evaluate(()=>{
  const S=__bbj.state();S.pairs=[];S.wishGroups=[];S.deduct=0;S.useY3=false;
  S.tags=['특수','학습','생활','추가태그'].map(name=>({name,weight:99,max:1}));
  S.students=Array.from({length:114},(_,i)=>({id:i+1,name:i<2?'김민준':`${['하','가','나','다','라','마'][i%6]}학생${String(i).padStart(3,'0')}`,no:Math.floor(i/6)+1,g4:'',g5:`${i%6+1}반`,gender:i%2?'여':'남',tags:[],w:{},fixed:null}));
  Object.assign(S.students[0],{tags:['특수'],w:{특수:6}});
  Object.assign(S.students[1],{tags:['학습','생활'],w:{학습:2,생활:1}});
  Object.assign(S.students[2],{tags:['추가태그'],w:{추가태그:1}});
  S.classes.forEach(c=>{c.total=19;c.male=null;c.female=null});S.nextId=115;S.result=null;
  __bbj.renderAll();
 });
 // New stars always start at one even if a deleted tag was previously set higher.
 const toggle=page.locator('[data-act="toggle-tag"][data-id="4"][data-tag="학습"]');
 await toggle.click(); assert.equal(await page.evaluate(()=>__bbj.state().students[3].w.학습),1);
 await page.locator('[data-act="tag-mul"][data-id="4"][data-tag="학습"]').selectOption('5');
 await toggle.click();await toggle.click();assert.equal(await page.evaluate(()=>__bbj.state().students[3].w.학습),1);
 await toggle.click();
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
 assert.match(await page.locator('.tagsum').allTextContents().then(t=>t.join(' ')),/특수6/);
 assert.match(await page.locator('.tagsum').allTextContents().then(t=>t.join(' ')),/학습·생활3/);
 assert.equal(await page.locator('.stu .l2,.stu .st').count(),0);
 assert.equal(await page.locator('.stu[data-id="1"] .tag-on').innerText(),'특수6');
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
  fakeServer.state=JSON.parse(JSON.stringify(__bbj.state()));delete fakeServer.state.starVersion;
  fakeServer.state.tags=[{name:'통합학급',weight:3,max:1},{name:'학습',weight:2}];
  fakeServer.state.students[0].tags=['통합학급'];fakeServer.state.students[0].w={'통합학급':2};fakeServer.state.students[0].score=null;
  fakeServer.state.pairs=[[1,2]];fakeServer.revision++;__bbj.cloud.load();
 });
 await page.waitForFunction(()=>__bbj.state().students[0].w.특수===6);
 assert.deepEqual(await page.evaluate(()=>__bbj.state().pairs),[[1,2]]);
 await page.evaluate(()=>{fakeServer.state=JSON.parse(JSON.stringify(__bbj.state()));fakeServer.revision++;__bbj.cloud.load()});
 await page.waitForTimeout(30);
 assert.equal(await page.evaluate(()=>__bbj.state().students[0].w.특수),6);
 assert.deepEqual(errors,[]);
 console.log('PASS Chromium: authentication, tags/stars, six-member separation, duplicate-name picker/search/classes, card grid, aligned compact results, both sorts, student summaries, inline badges/palette, responsive viewports, save/load and polling');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
