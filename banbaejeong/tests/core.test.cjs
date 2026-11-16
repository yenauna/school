const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const context = vm.createContext({});
vm.runInContext(html.split('/*__CORE_START__*/')[1].split('/*__CORE_END__*/')[0], context);
const C = context.CORE;
const plain = value => JSON.parse(JSON.stringify(value));
const roster = n => Array.from({ length:n }, (_,i) => ({ id:i+1,name:`학생${i}`,gender:i%2?'여':'남',tags:[],g4:'',g5:`${i%6+1}반`,no:i+1 }));
const classes = n => Array.from({length:n}, (_,i)=>({ name:`${i+1}반`,total:2,male:1,female:1 }));
test('default and legacy tag names distinguish student tags from class options',()=>{
 assert.deepEqual(plain(C.DEFAULT_TAGS),['특수','학습','생활','학부모']);
 for(const name of ['특수','특수반','통합학급']) assert.equal(C.tagName(name),'특수');
});
test('individual stars, default one, manual total and five-star limit',()=>{
 const s={tags:['학습','생활'],w:{학습:2,생활:1}};
 assert.equal(C.studentScore(s),3);
 assert.equal(C.studentScore({tags:['특수']}),1);
 assert.equal(C.studentScore({...s,score:1}),2);
 assert.equal(C.studentScore({...s,score:6}),5);
 assert.equal(C.starsOf({tags:['특수'],score:6},'특수'),5);
 assert.equal(C.studentScore(s,{tagWeights:{학습:3,생활:2}}),5);
});
test('separation groups expand into all unique pairs and retain two-member support',()=>{
 const st=roster(8);
 assert.equal(C.buildLinks(st,[[0,1,2,3,4,5]],{threeYear:false}).length,15);
 assert.equal(C.buildLinks(st,[[0,1],[0,1,2],[null,3]],{threeYear:false}).length,3);
});
test('six-member separation is assigned to six different classes',()=>{
 const st=roster(12),cls=classes(6),opts={threeYear:false,seed:42,restarts:8,iters:3000};
 const result=C.assign(st,cls,[[0,1,2,3,4,5]],opts);
 assert.equal(new Set(result.assign.slice(0,6)).size,6);
 const report=C.evaluate(st,cls,[[0,1,2,3,4,5]],result.assign,opts);
 assert.equal(report.sepViol.length,0);
 assert.ok(report.per.every(p=>p.count===2));
});
test('impossible groups and conflicts in any member generate pairwise warnings',()=>{
 const st=roster(6), cls=classes(3);
 const report=C.evaluate(st,cls,[[0,1,2,3,4]], [0,1,2,0,1,2],{threeYear:false});
 assert.equal(report.sepViol.length,2);
 assert.ok(report.problems.length>0);
});
test('individual star totals balance and special pinning/wishes remain supported',()=>{
 const st=roster(12),cls=classes(3).map(c=>({...c,total:4,male:2,female:2}));
 st.slice(0,3).forEach(s=>{s.tags=['특수'];s.w={특수:6}});
 const opts={threeYear:false,pinned:{특수:[0,1,2]},wishGroups:[[8,9]],seed:15,restarts:16,iters:4000};
 const result=C.assign(st,cls,[],opts),rep=C.evaluate(st,cls,[],result.assign,opts);
 assert.deepEqual(plain(rep.per.map(p=>p.score)),[5,5,5]);
 assert.equal(rep.wishGroups[0].ok,true);
 const pinned=C.assign(st,cls,[],{...opts,pinned:{특수:[0,1]}});
 assert.ok(pinned.assign.slice(0,3).every(k=>k===0||k===1));
});
test('CSV export API and core markers remain compatible',()=>{
 const st=roster(2);const csv=C.csv(st,classes(2),[0,1]);
 assert.match(csv,/5학년 반/); assert.match(csv,/학생0/);
 assert.match(html,/var POLL_MS = 10000/);
 assert.match(html,/'banbaejeong_load'/); assert.match(html,/'banbaejeong_save'/);
 assert.doesNotMatch(html,/pairBulk|wishBulk/);
});

test('loaded, imported, manual and automatic personal scores cannot exceed five',()=>{
 for (const st of [
  {tags:['특수'],w:{특수:50}},
  {tags:['학습','생활'],w:{학습:5,생활:5}},
  {tags:['생활'],score:99,w:{}},
  {tags:[],score:99,w:{생활:8}}
 ]) {
  C.normalizeStars(st);
  assert.ok(C.studentScore(st)<=5);
  assert.ok(Object.values(st.w).every(v=>v>=1&&v<=5));
 }
 assert.equal(C.studentScore({tags:[],score:5}),0);
});
test('score differences, gender imbalance and ordinary tag clustering produce no warnings',()=>{
 const st=roster(4),cls=classes(2).map(c=>({...c,male:0,female:2}));
 st.forEach(s=>s.gender='남');
 st.slice(0,2).forEach(s=>{s.tags=['학습'];s.w={학습:5}});
 const rep=C.evaluate(st,cls,[],[0,0,1,1],{threeYear:false});
 assert.equal(rep.verdict.scoreSpread,10);
 assert.ok(rep.genderBad.length>0);
 assert.deepEqual(plain(rep.problems),[]);
 assert.equal(rep.tagBad.length,0);
});
test('only important violations are warnings, with student and actual/required class names',()=>{
 const st=roster(4),cls=classes(2);
 Object.assign(st[0],{name:'분리갑',tags:['특수'],fixed:1,g4:'1반',g5:'1반'});
 Object.assign(st[1],{name:'분리을',g4:'1반',g5:'1반'});
 Object.assign(st[2],{name:'연속갑',g4:'2반',g5:'2반'});
 Object.assign(st[3],{name:'연속을',g4:'2반',g5:'2반'});
 const rep=C.evaluate(st,cls,[[0,1]],[0,0,0,0],{threeYear:true});
 assert.equal(rep.problems.length,6);
 const messages=rep.problems.join(' ');
 assert.match(messages,/분리갑.*분리을.*1반/);
 assert.match(messages,/연속갑.*연속을.*1반/);
 assert.match(messages,/통합학급 미지정: 분리갑.*1반/);
 assert.match(messages,/반드시 이 반 위반: 분리갑.*지정 반 2반.*배정 반 1반/);
 assert.match(messages,/1반 인원이 4명.*목표는 2명/);
 assert.match(messages,/2반 인원이 0명.*목표는 2명/);
 assert.doesNotMatch(messages,/힘든 점수|평균|남학생|고른 분포/);
});

test('108 students: deduction applies once to total and every total/gender sum is exact',()=>{
 const st=roster(108), cls=classes(6).map((c,i)=>({...c,special:i<2}));
 const t=C.autoTargets(st,cls,2);
 assert.deepEqual(plain(t.total),[17,17,19,19,18,18]);
 assert.equal(t.total.reduce((a,b)=>a+b),108);
 assert.equal(t.male.reduce((a,b)=>a+b),54);
 assert.equal(t.female.reduce((a,b)=>a+b),54);
 t.total.forEach((n,i)=>{assert.equal(n,t.male[i]+t.female[i]);assert.ok(Math.abs(t.male[i]-t.female[i])<=1)});
});
test('automatic targets conserve all counts for odd, skewed, tiny, all/no-special rosters',()=>{
 for(const n of [0,1,5,17,53,108,113]) for(const k of [2,3,6,12]) for(const specialCount of [0,1,k]) for(const deduction of [0,2,6]) {
  const st=roster(n);st.forEach((s,i)=>s.gender=i<Math.floor(n*0.7)?'남':'여');
  const cls=classes(k).map((c,i)=>({...c,special:i<specialCount}));
  const t=C.autoTargets(st,cls,deduction),sum=a=>a.reduce((a,b)=>a+b,0);
  assert.equal(sum(t.total),n);assert.equal(sum(t.male),Math.floor(n*0.7));assert.equal(sum(t.female),n-Math.floor(n*0.7));
  t.total.forEach((v,i)=>{assert.equal(v,t.male[i]+t.female[i]);assert.ok(Number.isInteger(v)&&t.male[i]>=0&&t.female[i]>=0)});
  const adjusted=t.total.map((v,i)=>v+(cls[i].special?deduction:0));
  if(t.total.every(v=>v>0))assert.ok(Math.max(...adjusted)-Math.min(...adjusted)<=1);
 }
});
test('row edits synchronize immediately in both directions and preserve ratio',()=>{
 const c={total:18,male:10,female:8};
 C.syncClass(c,'male',11);assert.deepEqual(c,{total:19,male:11,female:8});
 C.syncClass(c,'female',9);assert.deepEqual(c,{total:20,male:11,female:9});
 C.syncClass(c,'total',24);assert.deepEqual(c,{total:24,male:13,female:11});
 C.syncClass(c,'male',-3);assert.equal(c.male,0);assert.equal(c.total,c.male+c.female);
 C.syncClass(c,'total','');assert.deepEqual(c,{total:0,male:0,female:0});
 C.syncClass(c,'total',19);assert.deepEqual(c,{total:19,male:10,female:9});
});
test('allocation exactly matches every class and gender quota, even with strong competing constraints',()=>{
 const st=roster(108),cls=classes(6).map((c,i)=>({...c,special:i<2}));
 const t=C.autoTargets(st,cls,2);cls.forEach((c,i)=>Object.assign(c,{total:t.total[i],male:t.male[i],female:t.female[i]}));
 st[0].tags=['특수'];st[0].w={특수:5};st[1].fixed=1;
 for(const seed of [1,42,2026]) {
  const opts={threeYear:false,pinned:{특수:[0,1]},seed,restarts:4,iters:2000,wishGroups:[[0,2,4,6]]};
  const result=C.assign(st,cls,[[0,1,2,3,4,5]],opts),rep=C.evaluate(st,cls,[],result.assign,opts);
  rep.per.forEach((p,i)=>{assert.equal(p.count,cls[i].total);assert.equal(p.male,cls[i].male);assert.equal(p.female,cls[i].female)});
  assert.equal(result.assign[1],1);
 }
});

test('required wishes merge transitively, duplicate names split, and special capacity is respected',()=>{
 const st=roster(12),cls=classes(3).map((c,i)=>({...c,total:4,male:2,female:2,special:i<2}));
 st[4].name=st[6].name='김민준';st[4].fixed=0;
 for(const i of [4,6]){st[i].tags=['특수'];st[i].w={특수:5}}
 for(const i of [6,7,8]){st[i].transfer=true;st[i].tags=i===6?['특수']:['학습'];st[i].w={[st[i].tags[0]]:5}}
 const opts={seed:42,threeYear:false,requiredGroups:[[0,1],[1,2]],pinned:{특수:[0,1]},restarts:4,iters:3000};
 const result=C.assign(st,cls,[],opts),rep=C.evaluate(st,cls,[],result.assign,opts);
 assert.equal(result.assign[0],result.assign[1]);assert.equal(result.assign[1],result.assign[2]);
 assert.notEqual(result.assign[4],result.assign[6]);assert.equal(result.assign[4],0);
 assert.equal(new Set([6,7,8].map(i=>result.assign[i])).size,3);
 assert.equal(rep.verdict.scoreTotal,5);assert.equal(C.studentScore(st[6]),0);
 assert.equal(C.starsOf(st[6],'특수'),0);
 assert.deepEqual(plain(rep.problems),[]);
 rep.per.forEach(p=>{assert.equal(p.count,4);assert.equal(p.male,2);assert.equal(p.female,2);assert.ok((p.tags.특수||0)<=1)});
});
test('manual duplicate-name collisions and split required groups always produce detailed warnings',()=>{
 const st=roster(4),cls=classes(2);st[0].name=st[1].name='김민준';
 const rep=C.evaluate(st,cls,[],[0,0,0,1],{threeYear:false,requiredGroups:[[2,3]],wishGroups:[[0,3]]});
 assert.equal(rep.duplicateViol.length,1);assert.equal(rep.requiredViol.length,1);
 assert.match(rep.problems.join(' '),/동명이인 자동 분리 위반.*김민준.*1반/);
 assert.match(rep.problems.join(' '),/필수 희망 조합 분리.*학생2.*1반.*학생3.*2반/);
 assert.doesNotMatch(rep.problems.join(' '),/추천/);
});
test('special students in unchecked classes and overlaps in checked classes are both warnings',()=>{
 const st=roster(4),cls=classes(2);cls[0].special=true;
 st.slice(0,3).forEach(s=>{s.tags=['특수']});
 const rep=C.evaluate(st,cls,[],[0,0,1,1],{threeYear:false});
 assert.match(rep.problems.join(' '),/특수학생 중복 배정: 1반.*학생0.*학생1/);
 assert.match(rep.problems.join(' '),/통합학급 미지정: 학생2.*2반/);
});
test('transfer score exclusion preserves saved personal stars and removes them from score summaries',()=>{
 const st=roster(4),cls=classes(2);
 Object.assign(st[0],{transfer:true,tags:['학습'],w:{학습:5},score:5});
 C.normalizeStars(st[0]);assert.equal(st[0].w.학습,5);
 const rep=C.evaluate(st,cls,[],[0,0,1,1],{threeYear:false});
 assert.equal(rep.verdict.scoreTotal,0);assert.equal(rep.per[0].tagScore.학습,0);
 st[0].transfer=false;assert.equal(C.studentScore(st[0]),5);
});

test('required twins stay together even when the previous-class rule conflicts, and the conflict is warned',()=>{
 const st=roster(8),cls=classes(2).map(c=>({...c,total:4,male:2,female:2}));
 st[0].g4=st[1].g4='1반';st[0].g5=st[1].g5='1반';
 const opts={seed:14,threeYear:true,requiredGroups:[[0,1]],restarts:2,iters:1000};
 const res=C.assign(st,cls,[],opts),rep=C.evaluate(st,cls,[],res.assign,opts);
 assert.equal(res.assign[0],res.assign[1]);assert.equal(rep.requiredViol.length,0);
 assert.match(rep.problems.join(' '),/3년 연속 같은 반/);
});
test('matching given names and missed recommended groups are not hard warnings',()=>{
 const st=roster(4),cls=classes(2);st[0].name='김서연';st[1].name='이서연';
 const opts={threeYear:false,wishGroups:[[0,3]]};
 assert.equal(C.buildLinks(st,[],opts).length,0);
 const rep=C.evaluate(st,cls,[],[0,0,1,1],opts);
 assert.deepEqual(plain(rep.problems),[]);assert.equal(rep.wishGroups[0].ok,false);
});

test('when special capacity is impossible, mandatory wishes stay together if quota-feasible and other violations are warned',()=>{
 const st=roster(8),cls=classes(2).map((c,i)=>({...c,total:4,male:2,female:2,special:i===0}));
 for(const i of [2,4,6])st[i].tags=['특수'];
 const opts={seed:22,threeYear:false,requiredGroups:[[0,1]],pinned:{특수:[0]},restarts:2,iters:500};
 const result=C.assign(st,cls,[],opts),rep=C.evaluate(st,cls,[],result.assign,opts);
 assert.equal(result.assign[0],result.assign[1]);assert.equal(rep.requiredViol.length,0);
 assert.ok(rep.problems.some(p=>p.includes('특수')||p.includes('통합학급')));
 rep.per.forEach(p=>{assert.equal(p.count,4);assert.equal(p.male,2);assert.equal(p.female,2)});
});

test('demo roster contains exactly five disjoint different-surname given-name pairs and no full-name duplicates',()=>{
 const sample=C.virtualRoster(),again=C.virtualRoster();
 assert.equal(sample.students.length,108);
 assert.deepEqual(plain(sample),plain(again));
 assert.equal(new Set(sample.students.map(s=>s.name)).size,sample.students.length);
 const groups=new Map();
 sample.students.forEach(s=>{const given=s.name.slice(1);if(!groups.has(given))groups.set(given,[]);groups.get(given).push(s)});
 const repeated=[...groups.values()].filter(g=>g.length>1);
 assert.equal(repeated.length,5);
 assert.equal(repeated.reduce((n,g)=>n+g.length*(g.length-1)/2,0),5);
 repeated.forEach(g=>{assert.equal(g.length,2);assert.notEqual(g[0].name[0],g[1].name[0]);assert.notEqual(g[0].g5,g[1].g5)});
});
