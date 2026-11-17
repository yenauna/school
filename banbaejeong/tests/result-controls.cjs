// All RPCs are isolated from production data.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'bbj-result-'));
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  sessionStorage.setItem('banbaejeong.cloud','2026');window.fakeServer={state:{},revision:1};
  window.__bbjTransport=(path,body,cb)=>setTimeout(()=>{
   if(path==='banbaejeong_save'){fakeServer.state=JSON.parse(JSON.stringify(body.p_state));fakeServer.revision++;}
   cb(null,{state:fakeServer.state,revision:fakeServer.revision});
  },5);
 });
 try{
 await page.goto(process.env.BBJ_URL||'http://127.0.0.1:4188/banbaejeong/');
 await page.waitForFunction(()=>window.__bbj&&__bbj.cloud.entered());
 await page.evaluate(()=>{
  const s=__bbj.state();s.students=Array.from({length:8},(_,i)=>({id:i+1,name:'학생'+(i+1),no:i+1,gender:i%2?'여':'남',g4:'',g5:'1반',tags:[],w:{},fixed:i===0?0:null}));
  [5,5,3,0,5,5,5,0].forEach((score,i)=>{if(score){s.students[i].tags=['학습'];s.students[i].w={학습:score};}});
  s.classes=[{name:'가반',total:4,special:false},{name:'나반',total:4,special:false}];s.classCount=2;s.useY3=false;s.pairs=[];s.requiredGroups=[[2,3],[3,4]];s.wishGroups=[];
  s.result={assign:[0,0,0,0,1,1,1,1],ids:s.students.map(s=>s.id),moves:0};s.scoreThreshold=2;__bbj.renderAll();
 });
 assert.equal(await page.evaluate(()=>{
  const base=JSON.parse(JSON.stringify(__bbj.state())),local=JSON.parse(JSON.stringify(base)),remote=JSON.parse(JSON.stringify(base));
  local.students[0].name='메타데이터 수정';remote.result.assign=[1,0,0,0,0,1,1,1];
  const merged=__bbj.cloud.merge(base,local,remote);
  delete base.result.ids;delete local.result.ids;delete remote.result.ids;
  const legacy=__bbj.cloud.merge(base,local,remote);
  return merged.students[0].name==='메타데이터 수정'&&JSON.stringify(merged.result.assign)===JSON.stringify(remote.result.assign)&&JSON.stringify(legacy.result.assign)===JSON.stringify(remote.result.assign);
 }),true);
 await page.locator('[data-tab=result]').click();
 assert.equal(await page.locator('[data-layout=sex]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('[data-check=gender]').count(),0);assert.equal(await page.locator('[data-check=count]').innerText(),'인원');
 assert.match(await page.locator('[data-check=score]').getAttribute('class'),/bad/);
 assert.match(await page.locator('[data-details=score]').innerText(),/가반 13점/);assert.match(await page.locator('[data-details=score]').innerText(),/나반 15점/);
 await page.fill('#scoreGap','3');assert.match(await page.locator('[data-check=score]').getAttribute('class'),/ok/);
 await page.evaluate(()=>document.activeElement.blur());await page.waitForFunction(()=>!__bbj.cloud.pending());
 assert.equal(await page.evaluate(()=>fakeServer.state.scoreThreshold),3);
 await page.evaluate(()=>__bbj.cloud.load());await page.waitForFunction(()=>document.querySelector('#scoreGap').value==='3');
 await page.fill('#scoreGap','2');await page.locator('#resultMeta').evaluate(e=>document.activeElement.blur());
 // A locked student cannot move through either the drag handler or direct move API.
 assert.equal(await page.locator('.stu[data-id="1"]').getAttribute('draggable'),'false');
 await page.evaluate(()=>__bbj.move(1,1));assert.equal(await page.evaluate(()=>__bbj.state().result.assign[0]),0);
 assert.match(await page.locator('#toast').innerText(),/고정 학생은 이름을 눌러/);
 async function editFixed(id,value){await page.locator(`.stu[data-id="${id}"] .nm`).click();await page.selectOption('#addStuFixed',value);await page.click('#addStuApply');}
 await editFixed(1,'1');assert.equal(await page.evaluate(()=>__bbj.state().result.assign[0]),1);
 assert.equal(await page.locator('.col[data-k="1"] .stu[data-id="1"]').count(),1);
 await page.click('#btnUndo');assert.equal(await page.evaluate(()=>__bbj.state().students[0].fixed),0);assert.equal(await page.evaluate(()=>__bbj.state().result.assign[0]),0);
 await editFixed(1,'');assert.equal(await page.locator('.stu[data-id="1"].locked').count(),0);
 await page.locator('.stu[data-id="1"]').dragTo(page.locator('.col[data-k="1"]'));assert.equal(await page.evaluate(()=>__bbj.state().result.assign[0]),1);
 await page.click('#btnUndo');await page.click('#btnUndo');
 const original=await page.evaluate(()=>__bbj.state().result.assign.slice());
 await page.locator('.stu[data-id="2"]').dragTo(page.locator('.col[data-k="1"]'));
 assert.match(await page.locator('#comboMoveText').innerText(),/학생3, 학생4/);
 await page.screenshot({path:path.join(artifacts,'required-move-confirm.png')});
 await page.click('#comboMoveNo');assert.deepEqual(await page.evaluate(()=>__bbj.state().result.assign),original);
 await page.locator('.stu[data-id="2"]').dragTo(page.locator('.col[data-k="1"]'));await page.click('#comboMoveYes');
 assert.deepEqual(await page.evaluate(()=>__bbj.state().result.assign.slice(1,4)),[1,1,1]);
 await page.click('#btnUndo');assert.deepEqual(await page.evaluate(()=>__bbj.state().result.assign),original);
 await editFixed(2,'1');await page.click('#comboMoveNo');assert.equal(await page.evaluate(()=>__bbj.state().students[1].fixed),null);
 assert.deepEqual(await page.evaluate(()=>__bbj.state().result.assign),original);
 await editFixed(2,'1');await page.click('#comboMoveYes');assert.deepEqual(await page.evaluate(()=>__bbj.state().result.assign.slice(1,4)),[1,1,1]);
 await page.click('#btnUndo');assert.equal(await page.evaluate(()=>__bbj.state().students[1].fixed),null);assert.deepEqual(await page.evaluate(()=>__bbj.state().result.assign),original);
 // Personnel total violations are red and immediately readable in both locations.
 await page.evaluate(()=>{const s=__bbj.state();s.classes[0].total=6;__bbj.renderAll();});
 assert.match(await page.locator('[data-details=count]').innerText(),/가반 2명 부족 \(남1 여1\)/);
 assert.equal(await page.locator('.col[data-k="0"] .class-notes').innerText(),'2명 부족 (남1 여1)');
 assert.match(await page.locator('[data-check=count]').getAttribute('class'),/bad/);
 await page.screenshot({path:path.join(artifacts,'score-personnel-desktop.png')});
 // Gender-only imbalances are advisory and use the same single population pill.
 await page.evaluate(()=>{const s=__bbj.state();s.classes[0].total=4;s.students[1].gender='남';s.students[4].gender='여';__bbj.renderAll();});
 assert.match(await page.locator('[data-check=count]').getAttribute('class'),/warn/);
 assert.match(await page.locator('.col[data-k="1"] .class-notes').innerText(),/남자 부족/);
 await page.setViewportSize({width:412,height:900});await page.locator('[data-check=count]').click();
 assert.equal(await page.locator('#referencePopup').isVisible(),true);
 await page.screenshot({path:path.join(artifacts,'score-personnel-mobile.png')});
 for(const viewport of [{width:412,height:900},{width:740,height:360}]){
  await page.setViewportSize(viewport);await page.locator('[data-tab=setup]').click();
  assert.ok((await page.locator('.actionbar').boundingBox()).height<=40);
 }
 assert.deepEqual(errors,[]);console.log('PASS Chromium: drag locks, immediate fixed-class moves, transitive group confirmation/cancel/undo, persisted score threshold, red extrema, population notes and slim portrait/landscape bar. Screenshots: '+artifacts);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
