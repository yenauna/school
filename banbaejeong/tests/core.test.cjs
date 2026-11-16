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
 assert.deepEqual(plain(C.DEFAULT_TAGS),['특수','학습','생활']);
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
