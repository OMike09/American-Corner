'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process'),Database=require('better-sqlite3');
const ROOT=path.resolve(__dirname,'..');
async function start(){const data=fs.mkdtempSync(path.join(os.tmpdir(),'ac-password6-')),port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});const env={...process.env,AC_DEMO:'1',AC_DATA:data,PORT:String(port)};delete env.DATABASE_URL;const child=spawn(process.execPath,['server.js'],{cwd:ROOT,env,stdio:['ignore','pipe','pipe']});let logs='';child.stderr.on('data',b=>logs+=b);child.stdout.on('data',b=>logs+=b);const base=`http://127.0.0.1:${port}`;for(let i=0;i<130;i++){try{if((await fetch(base+'/healthz')).ok)return {data,child,base}}catch{}await new Promise(r=>setTimeout(r,60))}child.kill();throw Error(logs)}
class Client{constructor(base){this.base=base;this.cookie='';this.csrf=''}async call(m,u,data){const h={'Content-Type':'application/json'};if(this.cookie)h.Cookie=this.cookie;if(this.csrf)h['X-CSRF-Token']=this.csrf;const r=await fetch(this.base+u,{method:m,headers:h,body:data===undefined?undefined:JSON.stringify(data)});const cookie=r.headers.get('set-cookie');if(cookie)this.cookie=cookie.split(';')[0];const result=await r.json();if(result.csrf)this.csrf=result.csrf;return [r.status,result]}}
async function expected(c,m,u,d,status=200){const [code,result]=await c.call(m,u,d);assert.equal(code,status,`${m} ${u} ${JSON.stringify(result)}`);return result}
test('six characters enforced on server, confirmation mismatch, leading zero login and salted hash; old long password still logs in',async()=>{
 const s=await start();try{const guest=new Client(s.base),admin=new Client(s.base),login=new Client(s.base),year=(await expected(guest,'GET','/api/meta')).years[0].id;
 const base={name:'Six Digit Test',email:'six@example.test',identifier:'SIX-001',level:'Licence 1',track:'',year_id:year,kind:'etudiant'};
 for(const pwd of ['12345','0123456','']){const d=await expected(guest,'POST','/api/register',{...base,password:pwd,password_confirm:pwd},400);assert.equal(d.error,'Le mot de passe doit contenir exactement 6 caractères.')}
 assert.equal((await expected(guest,'POST','/api/register',{...base,password:'012345',password_confirm:'012346'},400)).error,'Les mots de passe ne correspondent pas.');
 const accepted=await expected(guest,'POST','/api/register',{...base,password:'012345',password_confirm:'012345'},202);assert.equal(accepted.pending,true);
 await expected(admin,'POST','/api/chef/login',{email:'admin@american-corner.test',password:'DemoAdmin2026!'});const u=(await expected(admin,'GET','/api/users')).items.find(x=>x.email===base.email);assert(u);await expected(admin,'PATCH',`/api/users/${u.id}`,{status:'active'});
 assert.equal((await expected(login,'POST','/api/login',{email:base.email,password:'012345'})).user.id,u.id);
 assert.equal((await expected(login,'POST','/api/password/change',{current:'012345',password:'12345',password_confirm:'12345'},400)).error,'Le mot de passe doit contenir exactement 6 caractères.');
 assert.equal((await expected(login,'POST','/api/password/change',{current:'012345',password:'654321',password_confirm:'123456'},400)).error,'Les mots de passe ne correspondent pas.');
 await expected(login,'POST','/api/password/change',{current:'012345',password:'000001',password_confirm:'000001'});
 assert.equal((await expected(new Client(s.base),'POST','/api/login',{email:base.email,password:'000001'})).user.id,u.id);
 const reset=await expected(guest,'POST','/api/password/forgot',{email:base.email});const token=reset.demo_reset_link.split('#reset/')[1];assert(token);
 assert.equal((await expected(guest,'POST','/api/password/reset',{token,password:'1234567',password_confirm:'1234567'},400)).error,'Le mot de passe doit contenir exactement 6 caractères.');
 await expected(guest,'POST','/api/password/reset',{token,password:'000000',password_confirm:'000000'});
 assert.equal((await expected(new Client(s.base),'POST','/api/login',{email:base.email,password:'000000'})).user.id,u.id);
 await new Promise(resolve=>{s.child.kill();s.child.once('exit',resolve)});const db=new Database(path.join(s.data,'american_corner.sqlite3'),{readonly:true});try{const stored=db.prepare('SELECT password FROM users WHERE id=?').get(u.id).password;assert.match(stored,/^pbkdf2_sha256\$310000\$/);assert(!stored.includes('000000'));assert(!stored.includes('012345'))}finally{db.close()}
 }finally{if(s.child.exitCode===null&&!s.child.killed){s.child.kill();await new Promise(r=>s.child.once('exit',r))}fs.rmSync(s.data,{recursive:true,force:true})}
});
