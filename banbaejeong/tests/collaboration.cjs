// Isolated Supabase transport: never reads or writes the live workspace.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'bbj-collab-'));
 await page.addInitScript(()=>{
  window.fakeServer={state:{},revision:1,calls:[],conflict:false};
  window.__bbjTransport=(path,body,cb)=>{
   fakeServer.calls.push({path,body});
   setTimeout(()=>{
    if(body.p_passcode!=='2026')return cb({code:'PASSCODE_MISMATCH'});
    if(path==='banbaejeong_save'){
     if(fakeServer.conflict){fakeServer.conflict=false;fakeServer.state.students[1].name='동시저장';fakeServer.revision++;return cb(null,{conflict:true});}
     if(body.p_expected_revision!==null && body.p_expected_revision!==fakeServer.revision)return cb(null,{conflict:true});
     fakeServer.state=JSON.parse(JSON.stringify(body.p_state));fakeServer.revision++;
    }
    cb(null,{state:JSON.parse(JSON.stringify(fakeServer.state)),revision:fakeServer.revision});
   },10);
  };
 });
 try{
 await page.goto(process.env.BBJ_URL||'http://127.0.0.1:4185/banbaejeong/');
 await page.fill('#lockPass','2026');await page.click('#lockEnter');await page.waitForFunction(()=>__bbj.cloud.entered());
 await page.evaluate(()=>{
  const s=JSON.parse(JSON.stringify(__bbj.state()));s.students=Array.from({length:6},(_,i)=>({id:i+1,name:'학생'+i,no:i+1,g4:'',g5:(i%2+1)+'반',gender:i%2?'여':'남',tags:[],w:{},fixed:null}));
  s.classes=[{name:'가반',total:3,special:false},{name:'나반',total:3,special:false}];s.classCount=2;s.nextId=7;s.useY3=false;s.pairs=[[1,2,3]];s.pairModes=['one'];s.result=null;
  fakeServer.state=s;fakeServer.revision++;__bbj.cloud.load();
 });
 await page.waitForFunction(()=>__bbj.state().students.length===6);
 assert.equal(await page.locator('#pairTable .pair-divider').count(),1);
 await page.locator('#pairTable [data-mode=all]').click();assert.equal(await page.locator('#pairTable .pair-divider').count(),0);
 await page.locator('#pairTable [data-mode=one]').click();
 await page.locator('[data-scope=student][data-id="1"][data-field=name]').fill('내수정');await page.locator('#search').click();
 await page.waitForTimeout(1400);
 assert.equal(await page.evaluate(()=>fakeServer.calls.filter(c=>c.path==='banbaejeong_save').length),0);
 assert.equal(await page.evaluate(()=>__bbj.cloud.poll()),false);
 assert.equal(await page.evaluate(()=>fakeServer.calls.filter(c=>c.path==='banbaejeong_load').length),2);
 await page.evaluate(()=>{__bbj.state().requiredGroups=[[1,4]];fakeServer.state.wishGroups=[[4,5]];fakeServer.state.students[0].g4='3반';fakeServer.state.students[1].name='다른반수정';fakeServer.state.students.push({id:7,name:'다른반추가',no:4,g5:'2반',gender:'여',tags:[],w:{},fixed:null});fakeServer.revision++;});
 await page.click('#btnAddStudent');
 await page.locator('[data-scope=student][data-id="7"][data-field=name]').fill('내추가');await page.locator('#search').click();
 await page.click('#btnCloudReload');await page.waitForFunction(()=>__bbj.state().students.length===8);
 assert.deepEqual(await page.evaluate(()=>__bbj.state().students.map(s=>s.name).filter(n=>['내수정','다른반수정','다른반추가','내추가'].includes(n)).sort()),['내수정','내추가','다른반수정','다른반추가'].sort());
 assert.equal(await page.evaluate(()=>new Set(__bbj.state().students.map(s=>s.id)).size),8);
 assert.equal(await page.evaluate(()=>fakeServer.calls.filter(c=>c.path==='banbaejeong_save').length),0);
 await page.evaluate(()=>fakeServer.conflict=true);
 await page.click('#btnCloudSave');await page.waitForFunction(()=>!__bbj.cloud.pending());
 assert.equal(await page.evaluate(()=>fakeServer.state.students.find(s=>s.id===1).name),'내수정');
 assert.equal(await page.evaluate(()=>fakeServer.state.students.find(s=>s.id===2).name),'동시저장');
 assert.equal(await page.evaluate(()=>fakeServer.state.pairModes[0]),'one');
 assert.equal(await page.evaluate(()=>fakeServer.state.students.find(s=>s.id===1).g4),'3반');
 assert.deepEqual(await page.evaluate(()=>fakeServer.state.requiredGroups),[[1,4]]);
 assert.deepEqual(await page.evaluate(()=>fakeServer.state.wishGroups),[[4,5]]);
 assert.equal(await page.evaluate(()=>fakeServer.state.students.length),8);
 // Reload restores mode, then show a valid result without running the optimizer.
 await page.evaluate(()=>{
  fakeServer.state.result={assign:fakeServer.state.students.map((s,i)=>i%2),ids:fakeServer.state.students.map(s=>s.id)};
  fakeServer.state.classes.forEach(c=>c.total=4);fakeServer.revision++;__bbj.cloud.load();
 });
 await page.waitForFunction(()=>!!__bbj.state().result);
 await page.locator('[data-tab=result]').click();await page.evaluate(()=>document.activeElement.blur());
 assert.equal(await page.evaluate(()=>__bbj.cloud.pollMs()),1000);
 await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,value:true}));
 assert.equal(await page.evaluate(()=>__bbj.cloud.poll()),false);
 await page.evaluate(()=>delete document.hidden);
 await page.locator('.stu [data-act=edit-student]').first().click();assert.equal(await page.evaluate(()=>__bbj.cloud.poll()),false);await page.click('#addStuCancel');
 await page.evaluate(()=>{fakeServer.state.students[0].name='実時間';fakeServer.revision++;});
 await page.waitForFunction(()=>__bbj.state().students[0].name==='実時間');
 await page.evaluate(()=>__bbj.cloud.idle(61000));assert.equal(await page.evaluate(()=>__bbj.cloud.poll()),false);
 assert.match(await page.locator('#cloudStatus').innerText(),/잠시 멈춤/);
 await page.evaluate(()=>{fakeServer.state.students[0].name='재개확인';fakeServer.revision++;});
 await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>__bbj.state().students[0].name),'実時間');
 await page.mouse.click(10,180);await page.waitForFunction(()=>__bbj.state().students[0].name==='재개확인');
 await page.locator('.stu [data-act=edit-student]').first().click();
 assert.equal(await page.locator('#addStuFixed option').count(),3);
 await page.selectOption('#addStuFixed','0');await page.click('#addStuApply');
 await page.waitForFunction(()=>!__bbj.cloud.pending());
 assert.ok(await page.locator('.stu .kb.fix').count());
 assert.ok(await page.locator('.stu .kb.fix').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)<=9));
 // Modal/input focus blocks reads.
 await page.locator('.stu [data-act=edit-student]').first().click();assert.equal(await page.evaluate(()=>__bbj.cloud.poll()),false);await page.click('#addStuCancel');
 await page.screenshot({path:path.join(artifacts,'result-fixed.png')});
 await page.locator('[data-tab=setup]').click();await page.setViewportSize({width:412,height:900});
 await page.locator('#studentTable').scrollIntoViewIfNeeded();
 assert.ok(await page.locator('#studentTable tbody tr').first().evaluate(e=>e.getBoundingClientRect().height<65));
 assert.equal(await page.locator('#btnCloudReload').isVisible(),true);
 await page.screenshot({path:path.join(artifacts,'mobile-roster.png')});
 await page.locator('#studentTable [data-act=roster-edit]').first().click();
 await page.fill('#addStuG4','4반');await page.selectOption('#addStuFixed','1');await page.click('#addStuApply');await page.click('#comboMoveYes');
 assert.equal(await page.evaluate(()=>__bbj.state().students[0].g4),'4반');
 assert.equal(await page.evaluate(()=>__bbj.state().students[0].fixed),1);
 // Compact class rows and all four condition grids at desktop and phone widths.
 await page.evaluate(()=>{
  const s=__bbj.state();s.classes=Array.from({length:6},(_,k)=>({name:['가','나','다','라','마','바'][k]+'반',total:1,special:k<2}));s.classCount=6;s.result=null;
  s.pairs=[[1,2],[2,3],[3,4],[4,5]];s.pairModes=['one','all','all','all'];s.requiredGroups=[[1,2],[2,3],[3,4],[4,5]];s.wishGroups=[[1,2],[2,3],[3,4],[4,5]];
  s.students.forEach((st,i)=>st.transfer=i<4);__bbj.renderAll();
 });
 for(const width of [640,412,320]){
  await page.setViewportSize({width,height:900});
  const rows=await page.locator('#classTable tbody tr').evaluateAll(es=>es.map(e=>{
   const rect=key=>e.querySelector('[data-field='+key+']').getBoundingClientRect();
   const name=rect('name'),total=rect('total'),special=rect('special');
   return {height:e.getBoundingClientRect().height,sameLine:Math.max(name.top,total.top,special.top)-Math.min(name.top,total.top,special.top)<12,ordered:name.right<=total.left&&total.right<special.left};
  }));
  assert.equal(rows.length,6);rows.forEach(r=>assert.ok(r.height<=42&&r.sameLine&&r.ordered,JSON.stringify({width,r})));
  for(const selector of ['#pairTable','#requiredTable','#wishTable','#transferList']){
   const boxes=await page.locator(selector+' .group-card').evaluateAll(es=>es.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,overflow:e.scrollWidth>e.clientWidth+1})));
   assert.ok(boxes[0].x<boxes[1].x&&Math.abs(boxes[0].y-boxes[1].y)<1&&boxes[2].x===boxes[0].x,selector+' '+width);
   assert.ok(boxes.every(b=>!b.overflow),selector+' overflow '+width);
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#cardClasses').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(artifacts,'compact-classes-'+width+'.png')});
  await page.locator('#pairTable').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(artifacts,'compact-conditions-'+width+'.png')});
 }
 await page.locator('#classTable [data-field=total]').first().fill('5');await page.locator('#search').click();
 assert.equal(await page.evaluate(()=>__bbj.state().classes[0].total),5);
 await page.locator('#classTable .integration-choice').first().click();assert.equal(await page.evaluate(()=>__bbj.state().classes[0].special),false);
 await page.setViewportSize({width:1600,height:1000});
 for(const selector of ['#pairTable','#requiredTable','#wishTable','#transferList']){
  assert.ok(await page.locator(selector+' .group-card').first().evaluate(e=>e.getBoundingClientRect().width<240));
 }
 await page.locator('#pairTable').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'compact-conditions-desktop.png')});
 assert.deepEqual(errors,[]);
 console.log('PASS Chromium: explicit merge save, concurrent retry, unsaved update, colliding IDs, separation modes, live result polling, idle/resume, fixed class editor, compact mobile roster. Screenshots: '+artifacts);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
