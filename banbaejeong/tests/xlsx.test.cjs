const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),context=vm.createContext({});
vm.runInContext(html.split('/*__CORE_START__*/')[1].split('/*__CORE_END__*/')[0],context);const C=context.CORE;
function parse(bytes){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbj-xlsx-'));try{const file=path.join(dir,'result.xlsx');fs.writeFileSync(file,Buffer.from(bytes));const result=spawnSync('python3',[path.join(__dirname,'parse_xlsx.py'),file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
const cls=[{name:'가반'},{name:'나반'}];
test('personal tag sums 7..9 and more than five tags have no student-wide cap',()=>{
 for(const values of [[2,3,2],[3,3,2],[3,3,3]]){const s={tags:['학습','생활','폭력'],w:Object.fromEntries(['학습','생활','폭력'].map((t,i)=>[t,values[i]]))};C.normalizeStars(s);assert.equal(C.studentScore(s),values.reduce((a,b)=>a+b));}
 const s={tags:Array.from({length:8},(_,i)=>'태그'+i),w:{태그0:0,태그1:99,태그2:-2}};C.normalizeStars(s);assert.equal(s.tags.length,8);assert.equal(C.starsOf(s,'태그1'),3);assert.ok(Object.values(s.w).every(n=>n>=1&&n<=3));
 s.score=123;C.normalizeStars(s);assert.equal(C.studentScore(s),123);assert.equal(C.starsOf(s,'태그1'),3);
 s.tags=[];C.normalizeStars(s);assert.equal(C.studentScore(s),0);
});
test('stored ZIP and real Excel parser find two sheets with exact nine-column layouts and numeric totals',()=>{
 const students=[
  {id:1,name:'차하늘',g5:'6반',no:'10',gender:'여',g4:'2반',tags:['학습','생활','폭력'],w:{학습:2,생활:3,폭력:2},fixed:1},
  {id:2,name:'김하늘',g5:'1반',no:'10',gender:'남',g4:'1반',tags:[],w:{},fixed:null},
  {id:3,name:'이하늘',g5:'5-1',no:'2',gender:'여',g4:'3반',tags:['학습','생활','폭력'],w:{학습:3,생활:3,폭력:3},fixed:0},
  {id:4,name:'박하늘',g5:'2반',no:'01',gender:'남',g4:'',tags:['학습'],w:{학습:2},score:999,fixed:null},
  {id:5,name:'강하늘',g5:'1반',no:'2',gender:'남',g4:'',tags:[],w:{},fixed:0},
  {id:6,name:'김하늘',g5:'1반',no:'2',gender:'남',g4:'',tags:[],w:{},fixed:null}
 ];const place=[1,0,0,1,0,0],sheets=parse(C.xlsx(students,cls,place));
 assert.deepEqual(sheets.map(s=>s.name),['5학년 반 기준','6학년 반 기준']);
 assert.deepEqual(sheets[0].rows[0],['5학년 반','번호','이름','성별','배정 반','4학년 반','태그','별점','고정']);
 assert.deepEqual(sheets[1].rows[0],['배정 반','5학년 반','번호','이름','성별','4학년 반','태그','별점','고정']);
 assert.deepEqual(sheets[0].rows.slice(1).map(r=>r[2]),['강하늘','김하늘','이하늘','김하늘','박하늘','차하늘']);
 assert.deepEqual(sheets[1].rows.slice(1).map(r=>r[3]),['강하늘','김하늘','김하늘','이하늘','박하늘','차하늘']);
 for(const sheet of sheets){assert.ok(sheet.rows.every(r=>r.length===9));assert.ok(sheet.rows.slice(1).every(r=>typeof r[7]==='number'));}
 assert.equal(sheets[0].rows.at(-1)[7],7);assert.equal(sheets[0].rows.find(r=>r[2]==='이하늘')[7],9);assert.equal(sheets[0].rows.find(r=>r[2]==='박하늘')[7],999);
 assert.equal(sheets[0].rows.find(r=>r[2]==='박하늘')[1],'01');assert.equal(sheets[0].rows.at(-1)[8],'나반');
});
test('empty rosters and XML/formula-like Unicode text stay valid and literal',()=>{
 const empty=parse(C.xlsx([],[],[]));assert.ok(empty.every(s=>s.rows.length===1));
 const st=[{name:'=HYPERLINK("bad") & <학생> 😀\u0001',g5:'',no:'',gender:'여',tags:['<학습&>'],w:{'<학습&>':3}}];
 const sheets=parse(C.xlsx(st,cls,[0]));assert.equal(sheets[0].rows[1][2],'=HYPERLINK("bad") & <학생> 😀');assert.equal(sheets[0].rows[1][6],'<학습&>');assert.equal(sheets[0].rows[1][7],3);
});
