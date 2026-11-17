const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),ctx=vm.createContext({});vm.runInContext(html.split('/*__CORE_START__*/')[1].split('/*__CORE_END__*/')[0],ctx);const C=ctx.CORE,plain=x=>JSON.parse(JSON.stringify(x));
function report(st,place,K){return {per:Array.from({length:K},(_,k)=>({k,name:['가반','나반','다반','라반','마반','바반'][k],members:st.map((_,i)=>place[i]===k?i:-1).filter(i=>i>=0)}))};}
function roster(){return Array.from({length:108},(_,i)=>({id:i+1,name:'학생'+i,no:String(i%18+1),g5:Math.floor(i/18)+1+'반',g4:i%6+1+'반',gender:i%2?'여':'남',tags:[],w:{},fixed:null}));}
function classes(){return Array.from({length:6},(_,k)=>({name:['가반','나반','다반','라반','마반','바반'][k],total:18,special:k<2}));}
test('g5Spread checks male AND female independently, normalizes keys without changing data',()=>{
 const st=[{g5:'2반',gender:'남'},{g5:'5-2',gender:'남'},{g5:'5학년 2반',gender:'남'},...Array.from({length:3},()=>({g5:'2',gender:'여'}))];
 const before=JSON.stringify(st),bad=plain(C.g5Spread(st,report(st,[0,0,1,0,1,2],3)));
 assert.deepEqual(bad,[{k:2,cls:'다반',g5:'5-2',gender:'남',count:0}]);assert.equal(JSON.stringify(st),before);
 assert.deepEqual(plain(C.g5Spread(st,report(st,[0,1,2,0,1,2],3))),[]);
});
test('only scarce sex groups allow zero, and their max-minus-min must stay at most one',()=>{
 const st=[{g5:'1반',gender:'남'},{g5:'1반',gender:'남'},...Array.from({length:3},()=>({g5:'1반',gender:'여'}))];
 assert.equal(C.g5Spread(st,report(st,[0,1,0,1,2],3)).length,0);
 assert.deepEqual(plain(C.g5Spread(st,report(st,[0,0,0,1,2],3))),[{k:0,cls:'가반',g5:'5-1',gender:'남',count:2}]);
 const femaleOnly=[{g5:'3반',gender:'여'}];assert.equal(C.g5Spread(femaleOnly,report(femaleOnly,[0],3)).length,0);
 assert.equal(C.g5Spread([{g5:'',gender:'남'}],report([{g5:'',gender:'남'}],[0],3)).length,0);
});
test('automatic assignment covers all six old classes for each gender under existing mandatory constraints',()=>{
 for(const seed of [1,17,42]){
  const st=roster(),cls=classes();cls[0].total=cls[1].total=17;cls[2].total=cls[3].total=19;
  st[0].fixed=0;st[0].tags=['특수'];st[18].tags=['특수'];st[0].name=st[18].name='김민준';
  if(seed===42){st[36].tags=['학습'];st[36].w={학습:3};st[36].score=1000;} // star balancing cannot buy a missing origin/sex cell
  const opts={autoGender:true,threeYear:true,requiredGroups:[[12,13]],seed,restarts:3,iters:2500},pairs=[[0,18,36,54,72,90]];
  const result=C.assign(st,cls,pairs,opts),rep=C.evaluate(st,cls,pairs,result.assign,opts);
  assert.deepEqual(plain(rep.problems),[]);assert.deepEqual(plain(C.g5Spread(st,rep)),[],'seed '+seed);
  assert.equal(result.assign[0],0);assert.equal(result.assign[12],result.assign[13]);
  rep.per.forEach(p=>assert.equal(p.count,cls[p.k].total));
 }
});
test('minimum repair fills a missing old-class male with just a two-student swap',()=>{
 const st=roster();st.forEach(s=>s.g4='');const cls=classes(),place=st.map((_,i)=>Math.floor(i/2)%6);[place[24],place[54]]=[place[54],place[24]];
 st[2].fixed=place[2];const opts={autoGender:true,threeYear:false,requiredGroups:[[4,5]],repairBudget:3000};
 // Required peers start in their correct shared class and must stay together.
 assert.equal(place[4],place[5]);const before=place.slice();
 assert.deepEqual(plain(C.g5Spread(st,C.evaluate(st,cls,[],place,opts))),[{k:0,cls:'가반',g5:'5-2',gender:'남',count:0}]);
 const result=C.repairMinimal(st,cls,[],place,opts),rep=C.evaluate(st,cls,[],result.assign,opts);
 assert.equal(result.changed.length,2);assert.equal(C.g5Spread(st,rep).length,0);assert.equal(rep.problems.length,0);
 assert.equal(result.assign[2],st[2].fixed);assert.equal(result.assign[4],result.assign[5]);assert.deepEqual(place,before);
});
test('fixed constraints take priority, but enough students with a missing class are never exempted',()=>{
 const st=Array.from({length:6},(_,i)=>({id:i+1,name:'고정'+i,g5:'1반',gender:i<2?'남':'여',tags:[],fixed:i<2?0:null}));
 const cls=[{name:'가반',total:3},{name:'나반',total:3}],opts={autoGender:true,threeYear:false,restarts:2,iters:300};
 const res=C.assign(st,cls,[],opts),rep=C.evaluate(st,cls,[],res.assign,opts);assert.equal(rep.problems.length,0);assert.equal(res.assign[0],0);assert.equal(res.assign[1],0);
 assert.deepEqual(plain(C.g5Spread(st,rep)),[{k:1,cls:'나반',g5:'5-1',gender:'남',count:0}]);
 const repaired=C.repairMinimal(st,cls,[],res.assign,opts);assert.equal(repaired.changed.length,0);
});
