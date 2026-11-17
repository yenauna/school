// Isolated mock RPC only. Also checks Blob download with the browser network offline.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'bbj-stars-xlsx-'));
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  sessionStorage.setItem('banbaejeong.cloud','2026');window.fakeServer={state:{},revision:1};
  window.__bbjTransport=(path,body,cb)=>setTimeout(()=>{if(path==='banbaejeong_save'){fakeServer.state=JSON.parse(JSON.stringify(body.p_state));fakeServer.revision++;}cb(null,{state:fakeServer.state,revision:fakeServer.revision});},5);
 });
 try{
 await page.goto(process.env.BBJ_URL||'http://127.0.0.1:4192/banbaejeong/');
 await page.waitForFunction(()=>window.__bbj&&__bbj.cloud.entered());
 await page.evaluate(()=>{
  const s=__bbj.state();s.tags=['學習','학습','생활','폭력','특수','학부모','추가'].map(name=>({name,weight:99,max:null}));
  s.students=[{id:1,name:'가나다',g5:'2반',g4:'1반',no:'3',gender:'남',tags:['학습','생활','폭력'],w:{학습:2,생활:3,폭력:2},fixed:null},
   {id:2,name:'홍길동',g5:'1반',g4:'2반',no:'2',gender:'여',tags:['학습','생활','폭력'],w:{학습:3,생활:3,폭력:3},fixed:1}];
  s.classes=[{name:'가반',total:1,special:false},{name:'나반',total:1,special:true}];s.classCount=2;s.useY3=false;s.pairs=[];s.requiredGroups=[];s.wishGroups=[];s.nextId=3;s.result=null;__bbj.renderAll();
 });
 assert.equal(await page.locator('[data-row="1"] [data-field=score]').getAttribute('max'),null);
 assert.equal(await page.locator('#addStuScore').getAttribute('max'),null);
 assert.equal(await page.locator('[data-row="1"] .pts').getAttribute('data-score'),'7');
 assert.equal(await page.locator('[data-row="1"] [data-act=toggle-tag][data-tag=생활]').getAttribute('title'),'생활 ★3');
 const stars=page.locator('[data-row="1"] [data-act=tag-mul]');assert.deepEqual(await stars.first().locator('option').evaluateAll(es=>es.map(e=>e.value)),['1','2','3']);
 await page.locator('[data-row="1"] [data-field=score]').fill('123');await page.locator('#search').click();
 assert.equal(await page.evaluate(()=>__bbj.state().students[0].score),123);
 assert.deepEqual(await page.evaluate(()=>__bbj.state().students[0].w),{학습:2,생활:3,폭력:2});
 await page.locator('[data-row="1"] [data-field=score]').fill('');await page.locator('#search').click();
 for(const tag of ['學習','학부모','추가'])await page.locator(`[data-row="1"] [data-act=toggle-tag][data-tag="${tag}"]`).click();
 assert.equal(await page.evaluate(()=>__bbj.state().students[0].tags.length),6);
 assert.equal(await page.locator('[data-row="1"] .pts').getAttribute('data-score'),'10');
 // Return to the documented seven-star example and inspect the result/edit modal.
 for(const tag of ['學習','학부모','추가'])await page.locator(`[data-row="1"] [data-act=toggle-tag][data-tag="${tag}"]`).click();
 await page.evaluate(()=>{const s=__bbj.state();s.result={assign:[0,1],ids:[1,2],moves:0};__bbj.renderAll();});
 await page.locator('[data-tab=result]').click();
 assert.equal(await page.locator('.stu[data-id="1"]').getAttribute('data-score'),'7');assert.equal(await page.locator('.stu[data-id="2"]').getAttribute('data-score'),'9');
 assert.deepEqual(await page.locator('.stu[data-id="1"] .tag-on').allTextContents(),['학습2','생활3','폭력2']);
 await page.evaluate(()=>{document.querySelector('.stu[data-id="1"] .nm').click();document.querySelector('#addStuScore').focus();});
 await page.waitForTimeout(60);assert.equal(await page.evaluate(()=>document.activeElement.id),'addStuScore','delayed autofocus stole star input');assert.equal(await page.inputValue('#addStuScore'),'7');
 await page.fill('#addStuScore','999');assert.equal(await page.inputValue('#addStuScore'),'999');await page.click('#addStuApply');
 assert.equal(await page.locator('.stu[data-id="1"]').getAttribute('data-score'),'999');
 await page.locator('.stu[data-id="1"] .nm').click();await page.fill('#addStuScore','');assert.equal(await page.inputValue('#addStuScore'),'');await page.click('#addStuApply');

 assert.equal(await page.locator('.stu[data-id="1"]').getAttribute('data-score'),'7');
 await page.screenshot({path:path.join(artifacts,'seven-nine-stars-desktop.png')});
 await page.setViewportSize({width:412,height:900});
 await page.evaluate(()=>{const st=__bbj.state().students[0];st.tags=st.tags.concat(['學習','학부모','추가']);Object.assign(st.w,{學習:1,학부모:1,추가:1});__bbj.renderAll();});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'six tags overflow mobile result');
 await page.evaluate(()=>{const st=__bbj.state().students[0];st.tags=['학습','생활','폭력'];st.w={학습:2,생활:3,폭력:2};__bbj.renderAll();});
 await page.locator('.stu[data-id="1"] .nm').click();
 await page.screenshot({path:path.join(artifacts,'three-star-tags-mobile-modal.png')});await page.click('#addStuCancel');
 // Never allow a production request; the fake transport works even in offline mode.
 await page.context().setOffline(true);
 const ready=page.waitForEvent('download');await page.click('#btnBarCSV');const download=await ready;
 assert.match(download.suggestedFilename(),/^반배정결과_.*\.xlsx$/);
 const saved=path.join(artifacts,download.suggestedFilename());await download.saveAs(saved);
 const parsed=spawnSync('python3',[path.join(__dirname,'parse_xlsx.py'),saved],{encoding:'utf8'});assert.equal(parsed.status,0,parsed.stderr);
 const sheets=JSON.parse(parsed.stdout);assert.deepEqual(sheets.map(s=>s.name),['5학년 반 기준','6학년 반 기준']);
 assert.deepEqual(sheets[0].rows.slice(1).map(r=>r[2]),['홍길동','가나다']);assert.deepEqual(sheets[0].rows.slice(1).map(r=>r[7]),[9,7]);
 assert.deepEqual(sheets[1].rows.slice(1).map(r=>r[3]),['가나다','홍길동']);assert.equal(sheets[1].rows[2][8],'나반');
 await page.locator('[data-tab=setup]').click();await page.click('#btnUpload');await page.setInputFiles('#fileInput',saved);
 await page.waitForFunction(()=>!document.querySelector('#uploadApply').disabled);assert.match(await page.locator('#uploadPreview').innerText(),/2명/);
 assert.deepEqual(errors,[]);console.log('PASS Chromium: uncapped totals, >5 tags, tag values 1..3, 7/9-star rows and modal, manual override/clear, offline two-sheet XLSX parsed independently. Artifacts: '+artifacts);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
