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
test('individual stars, default one, manual total and legacy explicit rule API',()=>{
 const s={tags:['학습','생활'],w:{학습:2,생활:1}};
 assert.equal(C.studentScore(s),3);
 assert.equal(C.studentScore({tags:['특수']}),1);
 assert.equal(C.studentScore({...s,score:1}),1);
 assert.equal(C.studentScore({...s,score:6}),6);
 assert.equal(C.starsOf({tags:['특수'],score:6},'특수'),6);
 assert.equal(C.studentScore(s,{tagWeights:{학습:3,생활:2}}),8);
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
 assert.deepEqual(plain(rep.per.map(p=>p.score)),[6,6,6]);
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
