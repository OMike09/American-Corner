'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),{spawn,execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
async function freePort(){return new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})})}
async function start(demo=true){const data=fs.mkdtempSync(path.join(os.tmpdir(),'ac-node-test-')),port=await freePort();const env={...process.env,AC_DEMO:demo?'1':'0',AC_DATA:data,PORT:String(port),AC_ADMIN_EMAIL:'chef@example.org',AC_ADMIN_PASSWORD:'RenderStrong2026!'};const child=spawn(process.execPath,['server.js'],{cwd:ROOT,env,stdio:['ignore','pipe','pipe']});let logs='';child.stderr.on('data',b=>logs+=b.toString());child.stdout.on('data',b=>logs+=b.toString());const base=`http://127.0.0.1:${port}`;for(let i=0;i<70;i++){try{const r=await fetch(base+'/healthz');if(r.ok)return {data,child,base,env}}catch{}await new Promise(r=>setTimeout(r,75))}child.kill();throw Error('Server failed to start: '+logs)}
class Client{constructor(base){this.base=base;this.cookie='';this.csrf=''}async call(method,url,data,options={}){const headers={...(options.headers||{})};if(this.cookie)headers.Cookie=this.cookie;if(this.csrf&&!options.omitCsrf)headers['X-CSRF-Token']=this.csrf;let body=options.raw;if(data!==undefined){headers['Content-Type']='application/json';body=JSON.stringify(data)}const r=await fetch(this.base+url,{method,headers,body,redirect:'manual'});const cookie=r.headers.get('set-cookie');if(cookie)this.cookie=cookie.split(';')[0];const buf=Buffer.from(await r.arrayBuffer());let result;try{result=JSON.parse(buf.toString())}catch{result=buf}if(result?.csrf)this.csrf=result.csrf;return [r.status,result]}async login(email,password){return this.call('POST','/api/login',{email,password})}}
async function expect(c,m,url,data,status=200,options={}){const [code,result]=await c.call(m,url,data,options);assert.equal(code,status,`${m} ${url}: ${JSON.stringify(result)}`);return result}
async function stop(service){service.child.kill();await new Promise(resolve=>service.child.once('exit',resolve))}
test('Render Node.js bootstrap and health check',async()=>{const s=await start(false);try{const c=new Client(s.base);assert.deepEqual(await expect(c,'GET','/healthz'),{status:'ok'});assert.equal((await expect(c,'GET','/api/meta')).demo,false);await expect(c,'POST','/api/login',{email:'chef@example.org',password:'RenderStrong2026!'})}finally{await stop(s);fs.rmSync(s.data,{recursive:true,force:true})}});
test('role boundaries, grades, uploads, requests and backup survive real HTTP requests',async()=>{const s=await start(true);try{
 const guest=new Client(s.base),admin=new Client(s.base),teacher=new Client(s.base),student=new Client(s.base),other=new Client(s.base);
 const meta=await expect(guest,'GET','/api/meta'),year=meta.years[0].id;
 await expect(guest,'GET','/api/users',undefined,401);
 await expect(guest,'POST','/api/register',{name:'Test Etudiant',email:'test@example.org',identifier:'ETU-TEST',password:'TestPassword123',level:'Licence 2',track:'Études anglophones',year_id:year,kind:'etudiant',roles:['chef'],status:'active'});
 await expect(guest,'POST','/api/login',{email:'test@example.org',password:'TestPassword123'},403);
 await expect(admin,'POST','/api/login',{email:'chef@example.org',password:'RenderStrong2026!'});
 const enrolled=(await expect(admin,'GET','/api/users')).items.find(x=>x.email==='test@example.org');assert.equal(enrolled.status,'pending');assert.deepEqual(enrolled.roles.map(x=>x.name),['etudiant']);
 await expect(admin,'PATCH',`/api/users/${enrolled.id}`,{status:'active'},403,{omitCsrf:true});
 await expect(admin,'PATCH',`/api/users/${enrolled.id}`,{status:'active'});
 await expect(student,'POST','/api/login',{email:'test@example.org',password:'TestPassword123'});
 await expect(student,'PATCH',`/api/users/${enrolled.id}`,{roles:['chef']},403);
 await expect(teacher,'POST','/api/login',{email:'enseignant@american-corner.test',password:'DemoUser2026!'});
 const course=(await expect(admin,'POST','/api/courses',{title:'Linguistique générale',code:'ANG201',level:'Licence 2',track:'Études anglophones',semester:1,year_id:year,teacher_id:3})).id;
 const roster=(await expect(teacher,'GET',`/api/courses/${course}/students`)).items;assert(roster.some(x=>x.id===enrolled.id));await expect(student,'GET',`/api/courses/${course}/students`,undefined,403);
 await expect(teacher,'POST','/api/results',{course_id:course,student_id:enrolled.id,score:14.5});const result=(await expect(admin,'GET','/api/results')).items[0];assert.equal((await expect(student,'GET','/api/results')).items.length,0);
 await expect(admin,'PATCH',`/api/results/${result.id}`,{status:'published'},400);
 await expect(admin,'PATCH',`/api/results/${result.id}`,{status:'validated'});await expect(admin,'PATCH',`/api/results/${result.id}`,{status:'published'});
 assert.equal((await expect(student,'GET','/api/results')).items[0].score,14.5);
 await expect(other,'POST','/api/login',{email:'etudiant@american-corner.test',password:'DemoUser2026!'});assert.equal((await expect(other,'GET','/api/results')).items.length,0);
 await expect(admin,'PATCH',`/api/results/${result.id}`,{score:15},400);await expect(admin,'PATCH',`/api/results/${result.id}`,{score:15,reason:'Erreur de transcription'});assert.equal((await expect(student,'GET','/api/results')).items.length,0);
 await expect(admin,'POST','/api/announcements',{title:'Réunion L2',body:'Demain',category:'Information pédagogique',audience:'level',target:'Licence 2',publish:true});await expect(admin,'POST','/api/announcements',{title:'Réunion L1',body:'Autre niveau',category:'Information pédagogique',audience:'level',target:'Licence 1',publish:true});
 const titles=(await expect(student,'GET','/api/announcements')).items.map(x=>x.title);assert(titles.includes('Réunion L2'));assert(!titles.includes('Réunion L1'));
 await expect(teacher,'POST','/api/documents/upload?title=Invalid&category=Cours&filename=note.txt&audience=level&target=Licence%201',undefined,403,{raw:Buffer.from('Wrong scope'),headers:{'Content-Type':'text/plain'}});
 const doc=(await expect(teacher,'POST','/api/documents/upload?title=Guide&category=Cours&filename=note.txt&audience=level&target=Licence%202',undefined,200,{raw:Buffer.from('Learning text'),headers:{'Content-Type':'text/plain'}})).id;
 assert.equal((await expect(student,'GET',`/api/documents/${doc}/file`)).toString(),'Learning text');
 const request=await expect(student,'POST','/api/requests',{kind:'Vérification de résultats',subject:'Note',body:'Merci de vérifier ma note.'});await expect(admin,'PATCH',`/api/requests/${request.id}`,{status:'processing',note:'En cours'});assert.equal((await expect(student,'GET','/api/requests')).items[0].history.length,2);assert.equal((await expect(other,'GET','/api/requests')).items.length,0);
 await expect(admin,'PATCH',`/api/users/${enrolled.id}`,{status:'suspended',reason:'Test de suspension'});assert.equal((await expect(student,'GET','/api/me')).user,null);await expect(student,'GET','/api/results',undefined,401);
 assert((await expect(admin,'GET','/api/audit')).items.some(x=>x.action==='result.update'));
 const backup=(await expect(admin,'POST','/api/backups')).file;assert(fs.existsSync(path.join(s.data,backup)));execFileSync(process.execPath,['manage.js','verify',backup],{cwd:ROOT,env:s.env});
 await expect(admin,'POST','/api/logout');assert.equal((await expect(admin,'GET','/api/me')).user,null);
}finally{await stop(s);fs.rmSync(s.data,{recursive:true,force:true})}});
