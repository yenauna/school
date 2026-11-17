// Actual Chromium controls and pointer dragging; Supabase is replaced before app startup.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'bbj-g5-'));
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  sessionStorage.setItem('banbaejeong.cloud','2026');window.fakeServer={state:{},revision:1};
  window.__bbjTransport=(path,body,cb)=>setTimeout(()=>{if(path==='banbaejeong_save'){fakeServer.state=JSON.parse(JSON.stringify(body.p_state));fakeServer.revision++;}cb(null,{state:fakeServer.state,revision:fakeServer.revision});},5);
 });
 try{
 await page.goto(process.env.BBJ_URL||'http://127.0.0.1:4193/banbaejeong/');await page.waitForFunction(()=>window.__bbj&&__bbj.cloud.entered());
 await page.evaluate(()=>{
  const s=__bbj.state();s.students=Array.from({length:108},(_,i)=>({id:i+1,name:'분포학생'+i,no:String(i%18+1),g5:Math.floor(i/18)+1+'반',g4:'',gender:i%2?'여':'남',tags:[],w:{},fixed:i===2?1:null}));
  s.classes=Array.from({length:6},(_,k)=>({name:['가반','나반','다반','라반','마반','바반'][k],total:18,special:k<2}));s.classCount=6;s.nextId=109;s.useY3=false;s.pairs=[];s.requiredGroups=[[5,6]];s.wishGroups=[];s.result=null;__bbj.renderAll();
 });
 await page.click('#btnRun');await page.waitForFunction(()=>!!__bbj.state().result);
 assert.equal(await page.locator('.g5-warning').count(),0);
 assert.deepEqual(await page.evaluate(()=>__bbj.state().result.report.problems),[]);
 // A balanced, deterministic starting layout makes the manual missing-cell case reproducible.
 await page.evaluate(()=>{const s=__bbj.state();s.result.assign=s.students.map((_,i)=>Math.floor(i/2)%6);__bbj.renderAll();});
 const labels=await page.locator('#verdict .v').allTextContents();assert.equal(labels.length,9);
 await page.locator('.stu[data-id="25"]').dragTo(page.locator('.col[data-k="3"] .colhead'));
 await page.locator('.stu[data-id="55"]').dragTo(page.locator('.col[data-k="0"] .colhead'));
 assert.deepEqual(await page.evaluate(()=>__bbj.state().result.report.problems),[]);
 assert.equal(await page.locator('.col[data-k="0"] .g5-warning').innerText(),'5-2 남 0');
 assert.equal(await page.locator('.col[data-k="0"].quota-bad').count(),1);
 assert.equal(await page.locator('.col[data-k="3"] .g5-warning').count(),0);
 assert.deepEqual(await page.locator('#verdict .v').allTextContents(),labels);
 assert.doesNotMatch(await page.locator('#verdict').innerText(),/5-2|5학년|분포/);
 assert.equal(await page.locator('.g5-warning.soft').count(),0);
 assert.deepEqual(await page.locator('#verdict .v').evaluateAll(es=>es.map(e=>e.classList.contains('ok'))),Array(9).fill(true));
 await page.screenshot({path:path.join(artifacts,'g5-male-missing-desktop.png')});
 const before=await page.evaluate(()=>__bbj.state().result.assign.slice());
 await page.click('#btnRepair');await page.waitForFunction(()=>!document.querySelector('#btnRepair').disabled);
 const after=await page.evaluate(()=>__bbj.state().result.assign.slice());assert.equal(after.filter((k,i)=>k!==before[i]).length,2);
 assert.equal(await page.locator('.g5-warning,.col.quota-bad').count(),0);
 assert.equal(after[2],1);assert.equal(after[4],after[5]);
 assert.deepEqual(await page.evaluate(()=>__bbj.state().result.report.problems),[]);
 await page.click('#btnUndo');assert.deepEqual(await page.evaluate(()=>__bbj.state().result.assign),before);
 await page.setViewportSize({width:412,height:900});await page.locator('.col[data-k="0"]').scrollIntoViewIfNeeded();
 assert.equal(await page.locator('.col[data-k="0"] .g5-warning').innerText(),'5-2 남 0');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:path.join(artifacts,'g5-male-missing-mobile.png')});
 assert.deepEqual(errors,[]);console.log('PASS Chromium: automatic old-class/sex coverage, real manual drag produces red class-only 5-2 남 0, nine unchanged green top pills, minimal two-student repair, fixed/group preservation and undo. Screenshots: '+artifacts);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
