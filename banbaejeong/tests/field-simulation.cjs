// Six isolated browser sessions share a revision-checked mock RPC server.
// No request is sent to the production Supabase workspace.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const clone=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'bbj-field-')),errors=[],contexts=[],pages=[];
 const server={state:{},revision:1,reads:0,writes:0,conflicts:0,offline:false};
 const url=process.env.BBJ_URL||'http://127.0.0.1:4190/banbaejeong/';
 let delaySave=false,saveCaptured=false,releaseSave;
 try{
 for(let k=0;k<6;k++){
  const context=await browser.newContext({viewport:k<3?{width:1600,height:1000}:{width:412,height:900},hasTouch:k>=3,isMobile:k>=3});contexts.push(context);
  await context.addInitScript(()=>sessionStorage.setItem('banbaejeong.cloud','2026'));
  await context.route('**/*supabase.co/**',async route=>{
   const req=route.request(),body=req.postDataJSON(),method=req.url().split('/').pop();
   if(server.offline)return route.abort('internetdisconnected');
   if(body.p_passcode!=='2026')return route.fulfill({status:403,body:JSON.stringify({message:'PASSCODE_MISMATCH'})});
   if(method==='banbaejeong_load'){
    server.reads++;const row=clone({state:server.state,revision:server.revision});
    await new Promise(r=>setTimeout(r,20));return route.fulfill({json:row});
   }
   assert.equal(method,'banbaejeong_save');assert.notEqual(body.p_expected_revision,null);
   if(delaySave){saveCaptured=true;await new Promise(r=>releaseSave=r);delaySave=false;}
   await new Promise(r=>setTimeout(r,35));
   if(body.p_expected_revision!==server.revision){server.conflicts++;return route.fulfill({json:{conflict:true,revision:server.revision}});}
   server.state=clone(body.p_state);server.revision++;server.writes++;
   return route.fulfill({json:{revision:server.revision,state:server.state}});
  });
  const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 }
 await Promise.all(pages.map(p=>p.goto(url)));
 await Promise.all(pages.map(p=>p.waitForFunction(()=>window.__bbj&&__bbj.cloud.entered())));
 // Each teacher pastes only their own class and edits independent conditions.
 await Promise.all(pages.map(async(p,k)=>{
  const rows=['5학년 반\t번호\t이름\t성별\t태그\t점수'];
  for(let n=1;n<=18;n++)rows.push(`${k+1}반\t${n}\t${n===1&&k<2?'동명학생':`교사${k+1}학생${String(n).padStart(2,'0')}`}\t${n%2?'남':'여'}\t${n===2?'학습':''}\t${n===2?'2':''}`);
  await p.click('#btnPaste');await p.fill('#pasteText',rows.join('\n'));await p.click('#pasteApply');
  await p.evaluate(k=>{
   const s=__bbj.state();s.pairs=[[1,2]];s.pairModes=[k%2?'one':'all'];s.requiredGroups=[[3,4]];s.wishGroups=[[5,6]];
   s.students[17].transfer=true;s.tags.push({name:'교사태그'+k,weight:1,max:null});s.classes.forEach(c=>c.total=0);s.classes[k].total=18;__bbj.renderAll();
  },k);
 }));
 const beforeWrites=server.writes,beforeReads=server.reads;
 await pages[0].waitForTimeout(1200);assert.equal(server.writes,beforeWrites);assert.equal(server.reads,beforeReads);
 await Promise.all(pages.map(p=>p.click('#btnCloudSave')));
 await Promise.all(pages.map(p=>p.waitForFunction(()=>!__bbj.cloud.pending())));
 assert.equal(server.state.students.length,108);assert.equal(new Set(server.state.students.map(s=>s.id)).size,108);
 for(let k=1;k<=6;k++)assert.equal(server.state.students.filter(s=>s.g5===k+'반').length,18);
 for(const key of ['pairs','requiredGroups','wishGroups'])assert.equal(server.state[key].length,6,key);
 for(let k=0;k<6;k++)assert.ok(server.state.tags.some(t=>t.name==='교사태그'+k),'teacher tag lost');
 assert.equal(server.state.students.filter(s=>s.transfer).length,6);assert.ok(server.conflicts>=5);
 assert.ok(server.state.classes.every(c=>c.total===18));
 // Condition IDs must still refer to their own class after collision remapping.
 for(const key of ['pairs','requiredGroups','wishGroups'])for(const group of server.state[key])assert.equal(new Set(group.map(id=>server.state.students.find(s=>s.id===id).g5)).size,1);
 console.log('Six simultaneous saves: 108 students and 18 groups preserved; CAS conflicts/retries='+server.conflicts);
 await Promise.all(pages.map(p=>p.click('#btnCloudReload')));
 await Promise.all(pages.map(p=>p.waitForFunction(()=>__bbj.state().students.length===108)));
 // Run the real assignment engine on the six merged rosters and constraints.
 await pages[0].click('#btnRun');await pages[0].waitForFunction(()=>!!__bbj.state().result);await pages[0].waitForFunction(()=>!__bbj.cloud.pending());
 assert.equal(await pages[0].evaluate(()=>__bbj.state().result.report.problems.length),0);
 assert.equal(server.state.result.assign.length,108);
 await pages[0].locator('[data-tab=setup]').click();
 // Cross-browser field-level merge: two teachers edit different fields on the same student.
 const id=server.state.students[0].id;
 await pages[0].evaluate(id=>{__bbj.state().students.find(s=>s.id===id).name='공동수정학생';},id);
 await pages[1].evaluate(id=>{__bbj.state().students.find(s=>s.id===id).g4='2반';},id);
 await Promise.all([pages[0].click('#btnCloudSave'),pages[1].click('#btnCloudSave')]);
 await Promise.all([pages[0],pages[1]].map(p=>p.waitForFunction(()=>!__bbj.cloud.pending())));
 assert.equal(server.state.students.find(s=>s.id===id).name,'공동수정학생');assert.equal(server.state.students.find(s=>s.id===id).g4,'2반');assert.equal(server.state.result.assign.length,108,'metadata merge erased shared assignment');
 await pages[0].click('#btnCloudReload');await pages[0].waitForFunction(()=>!__bbj.cloud.inFlight());
 // Append imports must not discard a namesake in another old class.
 const csv='5학년 반,번호,이름,성별\n6반,19,동명학생,남';
 await pages[0].click('#btnUpload');await pages[0].setInputFiles('#fileInput',{name:'isolated.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await pages[0].check('[name=upMode][value=append]');await pages[0].click('#uploadApply');
 assert.equal(await pages[0].evaluate(()=>__bbj.state().students.length),109);
 await pages[0].click('#btnUpload');await pages[0].setInputFiles('#fileInput',{name:'isolated.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await pages[0].check('[name=upMode][value=append]');await pages[0].click('#uploadApply');
 assert.equal(await pages[0].evaluate(()=>__bbj.state().students.length),109);await pages[0].click('#uploadCancel');
 // Offline save must leave the local edit intact and retry successfully when online.
 server.offline=true;await pages[0].click('#btnCloudSave');await pages[0].waitForFunction(()=>!__bbj.cloud.inFlight());
 assert.equal(await pages[0].evaluate(()=>__bbj.state().students.length),109);assert.equal(server.state.students.length,108);
 server.offline=false;await pages[0].click('#btnCloudSave');await pages[0].waitForFunction(()=>!__bbj.cloud.pending());assert.equal(server.state.students.length,109);
 // Explicitly exercise input changes during a delayed save with ID collisions.
 const worker=pages[2];await worker.click('#btnCloudReload');await worker.waitForFunction(()=>__bbj.state().students.length===109);
 await worker.click('#btnAddStudent');let newId=await worker.evaluate(()=>__bbj.state().students.at(-1).id);
 await worker.locator(`[data-scope=student][data-id="${newId}"][data-field=name]`).fill('저장중추가');
 // Another teacher occupied the same numeric ID before this save.
 server.state.students.push({id:newId,name:'서버동시추가',no:'20',g5:'6반',gender:'여',tags:[],w:{},fixed:null});server.state.nextId=newId+1;server.revision++;
 delaySave=true;await worker.click('#btnCloudSave');while(!saveCaptured)await worker.waitForTimeout(10);
 await worker.locator(`[data-scope=student][data-id="${newId}"][data-field=name]`).fill('저장중이름수정');
 await worker.click('#btnAddStudent');await worker.locator('#studentTable [data-field=name]').last().fill('저장중두번째추가');
 releaseSave();await worker.waitForFunction(()=>!__bbj.cloud.inFlight());
 assert.equal(await worker.evaluate(()=>__bbj.state().students.filter(s=>['서버동시추가','저장중이름수정','저장중두번째추가'].includes(s.name)).length),3);
 await worker.click('#btnCloudSave');await worker.waitForFunction(()=>!__bbj.cloud.pending());
 assert.equal(server.state.students.length,112);assert.equal(new Set(server.state.students.map(s=>s.id)).size,112);
 // Establish a deterministic result for shared PC editing and mobile viewing.
 const fixture=clone(server.state);fixture.students=fixture.students.slice(0,108);fixture.students.forEach(s=>{s.fixed=null;s.tags=[];s.w={};s.g4='';s.transfer=false;});
 fixture.classes.forEach(c=>{c.total=18;c.special=false;});fixture.pairs=[];fixture.pairModes=[];fixture.requiredGroups=[];fixture.wishGroups=[];fixture.useY3=false;
 fixture.result={assign:fixture.students.map((_,i)=>Math.floor(i/18)),ids:fixture.students.map(s=>s.id),moves:0};
 server.state=fixture;server.revision++;
 const pc=pages[0],mobile=pages[3];
 await Promise.all([pc,mobile].map(p=>p.evaluate(()=>__bbj.cloud.load())));
 await Promise.all([pc,mobile].map(p=>p.waitForFunction(()=>!!__bbj.state().result)));
 await Promise.all([pc,mobile].map(p=>p.locator('[data-tab=result]').click()));
 await mobile.locator('.col[data-k="2"]').scrollIntoViewIfNeeded();
 const viewBefore=await mobile.evaluate(()=>{const el=[...document.querySelectorAll('.stu')].find(el=>el.getBoundingClientRect().top>=0&&el.getBoundingClientRect().top<innerHeight);return {id:el.dataset.id,top:el.getBoundingClientRect().top,y:scrollY};});
 const moveId=fixture.students[0].id;const started=Date.now();
 await pc.evaluate(id=>__bbj.move(id,1),moveId);await pc.waitForFunction(()=>!__bbj.cloud.pending());
 await mobile.waitForFunction(id=>__bbj.state().result.assign[__bbj.state().students.findIndex(s=>s.id===id)]===1,moveId);
 assert.ok(Date.now()-started<4000,'live update delayed');
 const viewAfter=await mobile.locator('.stu[data-id="'+viewBefore.id+'"]').boundingBox();console.log('Live update ms='+String(Date.now()-started)+'; viewer row shift px='+Math.abs(viewAfter.y-viewBefore.top).toFixed(3));
 assert.ok(Math.abs(viewAfter.y-viewBefore.top)<3,'mobile viewport jumped');
 const revisionBefore=await mobile.evaluate(()=>__bbj.cloud.revision());
 await mobile.evaluate(()=>__bbj.cloud.idle(61000));server.revision++;
 await mobile.waitForTimeout(1200);assert.equal(await mobile.evaluate(()=>__bbj.cloud.revision()),revisionBefore);
 await mobile.mouse.click(5,180);await mobile.waitForFunction(rev=>__bbj.cloud.revision()>rev,revisionBefore);
 // Touch drag from a visible class to a distant class via bottom-edge autoscroll.
 await mobile.evaluate(()=>scrollTo(0,0));await mobile.locator('.col[data-k="1"]').scrollIntoViewIfNeeded();
 await mobile.locator('[data-layout=sex]').click();
 await mobile.locator('.col[data-k="1"] .stu').first().scrollIntoViewIfNeeded();
 const chip=mobile.locator('.col[data-k="1"] .stu').first(),dragId=Number(await chip.getAttribute('data-id')),box=await chip.boundingBox();
 const cdp=await mobile.context().newCDPSession(mobile),x=Math.round(box.x+box.width/2),y=Math.round(box.y+box.height/2);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await mobile.waitForTimeout(300);
 assert.equal(await mobile.locator('.stu.drag-ghost').count(),1);
 const dragScroll=await mobile.evaluate(()=>scrollY);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:890}]});await mobile.waitForTimeout(1800);
 assert.ok(await mobile.evaluate(()=>scrollY)>dragScroll+500,'bottom-edge did not scroll');
 await mobile.screenshot({path:path.join(artifacts,'touch-bottom-autoscroll.png')});
 // Reposition just enough to expose class 4 and release inside it.
 await mobile.evaluate(()=>document.querySelector('.col[data-k="3"]').scrollIntoView({block:'center'}));
 const target=await mobile.locator('.col[data-k="3"]').boundingBox();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y:Math.round(Math.max(120,Math.min(760,target.y+80)))}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.equal(await mobile.evaluate(id=>__bbj.state().result.assign[__bbj.state().students.findIndex(s=>s.id===id)],dragId),3);
 assert.equal(await mobile.locator('.stu.drag-ghost').count(),0);
 await mobile.waitForFunction(()=>!__bbj.cloud.pending());
 // Top-edge scroll and touch cancellation must clean up without another move.
 const chip2=mobile.locator('.col[data-k="3"] .stu').first();await chip2.scrollIntoViewIfNeeded();const b2=await chip2.boundingBox();
 const beforeCancel=await mobile.evaluate(()=>__bbj.state().result.assign.slice());
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:Math.round(b2.x+20),y:Math.round(b2.y+10)}]});await mobile.waitForTimeout(300);
 const beforeTop=await mobile.evaluate(()=>scrollY);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y:5}]});await mobile.waitForTimeout(800);
 assert.ok(await mobile.evaluate(()=>scrollY)<beforeTop-200,'top-edge did not scroll');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await mobile.locator('.stu.drag-ghost').count(),0);assert.deepEqual(await mobile.evaluate(()=>__bbj.state().result.assign),beforeCancel);
 // Minimal repair operates on two affected students and is one-step undoable.
 await pc.evaluate(()=>{const s=__bbj.state();s.result.assign=s.students.map((_,i)=>Math.floor(i/18));s.pairs=[[s.students[0].id,s.students[1].id]];s.requiredGroups=[];s.students[2].fixed=0;__bbj.renderAll();});
 const original=await pc.evaluate(()=>__bbj.state().result.assign.slice());
 await pc.click('#btnRepair');await pc.waitForFunction(()=>!document.querySelector('#btnRepair').disabled);
 const repaired=await pc.evaluate(()=>({place:__bbj.state().result.assign,problems:__bbj.state().result.report.problems}));
 assert.ok((await pc.locator('.stu[data-id="'+fixture.students[2].id+'"]').boundingBox()).height<=31,'pin caused wrapped row');
 assert.equal(repaired.problems.length,0);assert.equal(repaired.place.filter((k,i)=>k!==original[i]).length,2);assert.equal(repaired.place[2],0);
 await pc.screenshot({path:path.join(artifacts,'minimal-repair-desktop.png')});
 await pc.click('#btnUndo');assert.deepEqual(await pc.evaluate(()=>__bbj.state().result.assign),original);
 assert.deepEqual(errors,[]);
 console.log('PASS field simulation: 6 concurrent teachers, 108 students/conditions, ID collision+edits during save, namesake imports, offline retry, shared PC/mobile live revision+stable viewport, idle/resume, real touch edge scrolling/cancel, minimal repair/undo. Mock RPC reads='+server.reads+', saves='+server.writes+', CAS retries='+server.conflicts+'. Screenshots: '+artifacts);
 }finally{await Promise.all(contexts.map(c=>c.close()));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
