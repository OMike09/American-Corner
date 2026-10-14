'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),net=require('node:net'),{spawn}=require('node:child_process');
const ROOT=require('node:path').resolve(__dirname,'..'),url=process.env.AC_TEST_PG_ACCOUNTS_URL;
async function freePort(){return new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n))})})}
async function start(data){const n=await freePort(),env={...process.env,DATABASE_URL:url,AC_DATA:data,AC_DEMO:'0',AC_ADMIN_EMAIL:'chief@pg-accounts.test',AC_ADMIN_PASSWORD:'StrongAccounts2026!',PORT:String(n)};const child=spawn(process.execPath,['server.js'],{cwd:ROOT,env,stdio:['ignore','pipe','pipe']});let logs='';child.stderr.on('data',x=>logs+=x);child.stdout.on('data',x=>logs+=x);const base=`http://127.0.0.1:${n}`;for(let i=0;i<150;i++){try{if((await fetch(base+'/healthz')).ok)return {child,base}}catch{}await new Promise(r=>setTimeout(r,80))}child.kill();throw Error(logs)}
async function stop(s){s.child.kill();await new Promise(r=>s.child.once('exit',r))}
class Client{constructor(base){this.base=base;this.cookie='';this.csrf=''}async call(method,url,data){const headers={};if(this.cookie)headers.Cookie=this.cookie;if(this.csrf)headers['X-CSRF-Token']=this.csrf;let body;if(data){body=JSON.stringify(data);headers['Content-Type']='application/json'}const r=await fetch(this.base+url,{method,headers,body});const cookie=r.headers.get('set-cookie');if(cookie)this.cookie=cookie.split(';')[0];const result=await r.json();if(result.csrf)this.csrf=result.csrf;return [r.status,result]}}
async function expect(c,m,u,d,status=200){const [code,result]=await c.call(m,u,d);assert.equal(code,status,`${m} ${u} ${JSON.stringify(result)}`);return result}
test('PostgreSQL: new accounts, password confirmation, track lifecycle, pending approval and restart',{skip:!url},async()=>{
 const data=fs.mkdtempSync(require('node:path').join(os.tmpdir(),'ac-pg-account-')),data2=fs.mkdtempSync(require('node:path').join(os.tmpdir(),'ac-pg-account-next-'));
 const legacyFile=require('node:path').join(data,'american_corner.sqlite3'),legacy=new (require('better-sqlite3'))(legacyFile);legacy.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT NOT NULL); INSERT INTO users(id,email) VALUES (77,'pg-account@example.test')`);legacy.close();
 const legacyHash=fs.readFileSync(legacyFile).toString('base64');let service=await start(data);
 try{let chief=new Client(service.base),applicant=new Client(service.base),intruder=new Client(service.base);await expect(chief,'POST','/api/chef/login',{email:'chief@pg-accounts.test',password:'StrongAccounts2026!'});
 const year=(await expect(intruder,'GET','/api/meta')).years[0].id;
 await expect(intruder,'POST','/api/login',{email:'pg-account@example.test',password:'OldPassword2026!'},401);
 await expect(intruder,'POST','/api/tracks',{name:'Intrusion',levels:['Licence']},401);
 const track=(await expect(chief,'POST','/api/tracks',{name:'Linguistique appliquée',description:'Formation test',levels:['Licence'],teacher_ids:[]})).id;
 await expect(applicant,'POST','/api/register',{name:'Compte PostgreSQL',email:'pg-account@example.test',identifier:'PG-ACCOUNT',password:'Pass2026strong!',password_confirm:'Mismatch1234',level:'Licence 2',track:'Linguistique appliquée',year_id:year,kind:'etudiant'},400);
 await expect(applicant,'POST','/api/register',{name:'Compte PostgreSQL',email:'pg-account@example.test',identifier:'PG-ACCOUNT',password:'Pass2026strong!',password_confirm:'Pass2026strong!',level:'Licence 2',track:'Linguistique appliquée',year_id:year,kind:'etudiant',roles:['chef']},202);
 await expect(chief,'DELETE',`/api/tracks/${track}`,undefined,409);
 await expect(chief,'PATCH',`/api/tracks/${track}`,{name:'Linguistique confirmée',status:'active'});
 const pending=(await expect(chief,'GET','/api/users')).items.find(x=>x.email==='pg-account@example.test');assert.equal(pending.status,'pending');assert.equal(pending.track,'Linguistique confirmée');assert.deepEqual(pending.roles.map(r=>r.name),['etudiant']);
 await expect(chief,'PATCH',`/api/tracks/${track}`,{status:'archived'});assert(!(await expect(intruder,'GET','/api/meta')).tracks.some(x=>x.id===track));
 await expect(chief,'PATCH',`/api/tracks/${track}`,{status:'active'});
 assert.equal(fs.readFileSync(legacyFile).toString('base64'),legacyHash,'l’ancienne SQLite n’est pas modifiée');
 await stop(service);const {createPostgres}=require('../postgres-adapter'),db=createPostgres(url);try{const stored=db.query('SELECT id,email,status,password FROM users WHERE email=$1',['pg-account@example.test']).rows[0];assert.equal(stored.id,pending.id);assert.equal(stored.status,'pending');assert.match(stored.password,/^pbkdf2_sha256\$/);assert.notEqual(stored.password,'Pass2026strong!')}finally{db.close()}
 service=await start(data2);chief=new Client(service.base);await expect(chief,'POST','/api/chef/login',{email:'chief@pg-accounts.test',password:'StrongAccounts2026!'});assert((await expect(chief,'GET','/api/users')).items.some(x=>x.id===pending.id&&x.status==='pending'));
 await expect(chief,'PATCH',`/api/users/${pending.id}`,{status:'active'});const active=new Client(service.base);assert.equal((await expect(active,'POST','/api/login',{email:'pg-account@example.test',password:'Pass2026strong!'})).user.id,pending.id);await expect(active,'PATCH',`/api/users/${pending.id}`,{roles:['chef']},403);
 }finally{if(service.child.exitCode===null)await stop(service);fs.rmSync(data,{recursive:true,force:true});fs.rmSync(data2,{recursive:true,force:true})}
});
test('production never silently stores accounts in SQLite without DATABASE_URL',()=>{
 const data=fs.mkdtempSync(require('node:path').join(os.tmpdir(),'ac-no-pg-'));
 try{const env={...process.env,AC_DATA:data,AC_DEMO:'0',NODE_ENV:'production',AC_ALLOW_SQLITE:'1'};delete env.DATABASE_URL;
  const result=require('node:child_process').spawnSync(process.execPath,['server.js'],{cwd:ROOT,env,timeout:10000,encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/DATABASE_URL requis/);assert.equal(fs.existsSync(require('node:path').join(data,'american_corner.sqlite3')),false);
 }finally{fs.rmSync(data,{recursive:true,force:true})}
});
