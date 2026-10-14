'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),{spawn,execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
async function freePort(){return new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})})}
async function start(demo=true,extraEnv={}){const data=fs.mkdtempSync(path.join(os.tmpdir(),'ac-node-test-')),port=await freePort();const env={...process.env,AC_DEMO:demo?'1':'0',AC_DATA:data,NODE_ENV:'test',AC_ALLOW_SQLITE:'1',PORT:String(port),AC_ADMIN_EMAIL:'chef@example.org',AC_ADMIN_PASSWORD:'RenderStrong2026!',...extraEnv};const child=spawn(process.execPath,['server.js'],{cwd:ROOT,env,stdio:['ignore','pipe','pipe']});let logs='';child.stderr.on('data',b=>logs+=b.toString());child.stdout.on('data',b=>logs+=b.toString());const base=`http://127.0.0.1:${port}`;for(let i=0;i<70;i++){try{const r=await fetch(base+'/healthz');if(r.ok)return {data,child,base,env}}catch{}await new Promise(r=>setTimeout(r,75))}child.kill();throw Error('Server failed to start: '+logs)}
class Client{constructor(base){this.base=base;this.cookie='';this.csrf=''}async call(method,url,data,options={}){const headers={...(options.headers||{})};if(this.cookie)headers.Cookie=this.cookie;if(this.csrf&&!options.omitCsrf)headers['X-CSRF-Token']=this.csrf;let body=options.raw;if(data!==undefined){headers['Content-Type']='application/json';body=JSON.stringify(data)}const r=await fetch(this.base+url,{method,headers,body,redirect:'manual'});const cookie=r.headers.get('set-cookie');if(cookie)this.cookie=cookie.split(';')[0];const buf=Buffer.from(await r.arrayBuffer());let result;try{result=JSON.parse(buf.toString())}catch{result=buf}if(result?.csrf)this.csrf=result.csrf;return [r.status,result]}async login(email,password){return this.call('POST','/api/login',{email,password})}}
async function expect(c,m,url,data,status=200,options={}){const [code,result]=await c.call(m,url,data,options);assert.equal(code,status,`${m} ${url}: ${JSON.stringify(result)}`);return result}
async function stop(service){service.child.kill();await new Promise(resolve=>service.child.once('exit',resolve))}
test('Render Node.js bootstrap and health check',async()=>{const s=await start(false);try{const c=new Client(s.base);assert.deepEqual(await expect(c,'GET','/healthz'),{status:'ok'});assert.equal((await expect(c,'GET','/api/meta')).demo,false);await expect(c,'POST','/api/chef/login',{email:'chef@example.org',password:'RenderStrong2026!'})}finally{await stop(s);fs.rmSync(s.data,{recursive:true,force:true})}});
test('role boundaries, grades, uploads, requests and backup survive real HTTP requests',async()=>{const s=await start(true);try{
 const guest=new Client(s.base),admin=new Client(s.base),teacher=new Client(s.base),student=new Client(s.base),other=new Client(s.base);
 const meta=await expect(guest,'GET','/api/meta'),year=meta.years[0].id;
 await expect(guest,'GET','/api/users',undefined,401);
 const registration=await expect(guest,'POST','/api/register',{name:'Test Etudiant',email:'test@example.org',identifier:'ETU-TEST',password:'TestPassword123',password_confirm:'TestPassword123',level:'Licence 2',track:'Études anglophones',year_id:year,kind:'etudiant',roles:['chef'],status:'active'},202);
 assert.equal(registration.pending,true);assert.equal((await expect(guest,'GET','/api/me')).pending,true);
 await expect(guest,'GET','/api/dashboard',undefined,401);
 const waiting=new Client(s.base);assert.equal((await expect(waiting,'POST','/api/login',{email:'test@example.org',password:'TestPassword123'},202)).pending,true);
 assert.equal((await expect(waiting,'GET','/api/me')).pending,true);await expect(waiting,'GET','/api/results',undefined,401);
 await expect(admin,'POST','/api/chef/login',{email:'chef@example.org',password:'RenderStrong2026!'});
 const enrolled=(await expect(admin,'GET','/api/users')).items.find(x=>x.email==='test@example.org');assert.equal(enrolled.status,'pending');assert.deepEqual(enrolled.roles.map(x=>x.name),['etudiant']);
 await expect(admin,'PATCH',`/api/users/${enrolled.id}`,{status:'active'},403,{omitCsrf:true});
 await expect(admin,'PATCH',`/api/users/${enrolled.id}`,{status:'active',roles:['etudiant']});
 const activated=await expect(guest,'GET','/api/me');assert.equal(activated.user.id,enrolled.id);assert.equal(activated.pending,false);
 assert.equal((await expect(waiting,'GET','/api/me')).user.id,enrolled.id);
 await expect(guest,'GET','/api/dashboard');
 await expect(student,'POST','/api/login',{email:'test@example.org',password:'TestPassword123'});
 assert((await expect(student,'GET','/api/notifications')).items.some(x=>x.title==='Compte validé'));
 await expect(student,'PATCH',`/api/users/${enrolled.id}`,{roles:['chef']},403);
 await expect(teacher,'POST','/api/login',{email:'enseignant@american-corner.test',password:'DemoUser2026!'});
 const course=(await expect(admin,'POST','/api/courses',{title:'Linguistique générale',code:'ANG201',level:'Licence 2',track:'Études anglophones',semester:1,year_id:year,teacher_id:3})).id;
 await expect(admin,'POST',`/api/courses/${course}/enrollments`,{student_ids:[enrolled.id]});
 const roster=(await expect(teacher,'GET',`/api/courses/${course}/students`)).items;assert(roster.some(x=>x.id===enrolled.id));await expect(student,'GET',`/api/courses/${course}/students`,undefined,403);
 await expect(teacher,'POST','/api/results',{course_id:course,student_id:enrolled.id,score:14.5});const result=(await expect(admin,'GET','/api/results')).items[0];assert.equal((await expect(student,'GET','/api/results')).items.length,0);
 await expect(admin,'PATCH',`/api/results/${result.id}`,{status:'published'},400);
 await expect(admin,'PATCH',`/api/results/${result.id}`,{status:'validated'});await expect(admin,'PATCH',`/api/results/${result.id}`,{status:'published'});
 assert.equal((await expect(student,'GET','/api/results')).items[0].score,undefined);assert.equal((await expect(student,'GET',`/api/results/${result.id}`)).score,14.5);
 await expect(other,'POST','/api/login',{email:'etudiant@american-corner.test',password:'DemoUser2026!'});assert.equal((await expect(other,'GET','/api/results')).items.length,0);
 await expect(admin,'PATCH',`/api/results/${result.id}`,{score:15},400);await expect(admin,'PATCH',`/api/results/${result.id}`,{score:15,reason:'Erreur de transcription'});assert.equal((await expect(student,'GET','/api/results')).items.length,0);
 await expect(admin,'POST','/api/users',{name:'Étudiante L1',email:'l1extra@example.org',identifier:'L1-TEST',password:'TestPassword123',role:'etudiant',level:'Licence 1',year_id:year});
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
test('one-click approval opens an existing pending session immediately; rejection never does',async()=>{
 const s=await start(false);
 try{
  const admin=new Client(s.base),candidate=new Client(s.base),rejected=new Client(s.base),signedOut=new Client(s.base);
  const year=(await expect(admin,'GET','/api/meta')).years[0].id;
  await expect(admin,'POST','/api/chef/login',{email:'chef@example.org',password:'RenderStrong2026!'});
  async function register(c,mail){await expect(c,'POST','/api/register',{name:'Compte Test',email:mail,identifier:mail,password:'TestPassword123',password_confirm:'TestPassword123',level:'Licence 2',track:'Études anglophones',year_id:year,kind:'etudiant'},202);return (await expect(admin,'GET','/api/users')).items.find(x=>x.email===mail).id}
  const id=await register(candidate,'approved@example.org');
  assert.equal((await expect(candidate,'GET','/api/me')).pending,true);
  await expect(admin,'PATCH',`/api/users/${id}`,{status:'active'});
  assert.equal((await expect(candidate,'GET','/api/me')).user.id,id);
  await expect(candidate,'GET','/api/dashboard');
  const fresh=new Client(s.base);assert.equal((await expect(fresh,'POST','/api/login',{email:'approved@example.org',password:'TestPassword123'})).user.id,id);
  const rejectId=await register(rejected,'rejected@example.org');
  await expect(admin,'PATCH',`/api/users/${rejectId}`,{status:'rejected',reason:'Inscription non vérifiée'});
  assert.deepEqual(await expect(rejected,'GET','/api/me'),{user:null,csrf:null,pending:false});
  await expect(rejected,'GET','/api/dashboard',undefined,401);
  const signedOutId=await register(signedOut,'signedout@example.org');
  await expect(signedOut,'POST','/api/logout');
  await expect(admin,'PATCH',`/api/users/${signedOutId}`,{status:'active'});
  assert.equal((await expect(signedOut,'GET','/api/me')).user,null);
 }finally{await stop(s);fs.rmSync(s.data,{recursive:true,force:true})}
});
test('PWA manifest, install icons and service worker serve safely without caching private APIs',async()=>{
 const s=await start(false);
 try{
  const manifestResponse=await fetch(s.base+'/manifest.webmanifest');assert.equal(manifestResponse.status,200);assert.match(manifestResponse.headers.get('content-type'),/manifest\+json/);
  const manifest=await manifestResponse.json();assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');
  assert(manifest.icons.some(icon=>icon.sizes==='192x192'));assert(manifest.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='maskable'));
  for(const icon of manifest.icons){const response=await fetch(s.base+icon.src);assert.equal(response.status,200,icon.src);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),Number(icon.sizes.split('x')[0]))}
  const page=await(await fetch(s.base+'/')).text();assert.match(page,/rel="manifest"/);assert.match(page,/apple-touch-icon/);
  const swResponse=await fetch(s.base+'/sw.js');assert.equal(swResponse.status,200);assert.equal(swResponse.headers.get('service-worker-allowed'),'/');const sw=await swResponse.text();assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/);assert(!/SHELL=\[[^\]]*\/api\//.test(sw));
  assert.equal((await fetch(s.base+'/offline.html')).status,200);
 }finally{await stop(s);fs.rmSync(s.data,{recursive:true,force:true})}
});
test('scoped sharing: teacher course, multi-target read receipts, delivery and reminders',async()=>{
 const s=await start(true);
 try{
  const admin=new Client(s.base),teacher=new Client(s.base),student=new Client(s.base),outsider=new Client(s.base);
  await expect(admin,'POST','/api/chef/login',{email:'chef@example.org',password:'RenderStrong2026!'});
  await expect(teacher,'POST','/api/login',{email:'enseignant@american-corner.test',password:'DemoUser2026!'});
  const year=(await expect(admin,'GET','/api/meta')).years[0].id;
  const studentId=(await expect(admin,'POST','/api/users',{name:'L3 English',email:'l3a@example.org',identifier:'L3A',password:'TestPassword123',role:'etudiant',level:'Licence 3',track:'Linguistique',year_id:year})).id;
  const outsiderId=(await expect(admin,'POST','/api/users',{name:'L3 Other Track',email:'l3b@example.org',identifier:'L3B',password:'TestPassword123',role:'etudiant',level:'Licence 3',track:'Littérature',year_id:year})).id;
  await expect(student,'POST','/api/login',{email:'l3a@example.org',password:'TestPassword123'});
  await expect(outsider,'POST','/api/login',{email:'l3b@example.org',password:'TestPassword123'});
  const courseId=(await expect(admin,'POST','/api/courses',{title:'Linguistique L3',code:'LING-3',level:'Licence 3',track:'Linguistique',semester:1,year_id:year,teacher_id:3})).id;
  await expect(admin,'POST',`/api/courses/${courseId}/enrollments`,{student_ids:[studentId]});
  const opts=(await expect(teacher,'GET','/api/share/options')).items;
  assert(opts.some(x=>x.type==='course'&&x.id===String(courseId)));
  assert(opts.some(x=>x.type==='level'&&x.id==='Licence 3'));
  assert(opts.some(x=>x.type==='person'&&x.id===String(studentId)));
  assert(!opts.some(x=>x.type==='person'&&x.id===String(outsiderId)));
  await expect(teacher,'POST','/api/announcements',{title:'Wrong recipient',body:'No access',category:'Information pédagogique',targets:[{type:'person',id:outsiderId}],publish:true},403);
  const post=await expect(teacher,'POST','/api/announcements',{title:'Cours de linguistique',body:'Lire le document avant jeudi.',category:'Information pédagogique',targets:[{type:'course',id:courseId},{type:'level',id:'Licence 3'}],requires_ack:true,publish:true});
  assert.equal(post.status,'published');const id=post.id;
  assert((await expect(student,'GET','/api/announcements')).items.some(x=>x.id===id));
  assert(!(await expect(outsider,'GET','/api/announcements')).items.some(x=>x.id===id));
  await expect(outsider,'GET',`/api/announcements/${id}`,undefined,403);
  const stats0=await expect(teacher,'GET',`/api/share/announcement/${id}/stats`);assert.equal(stats0.total,1);assert.equal(stats0.viewed,0);assert.equal(stats0.notification_sent,1);assert.equal(stats0.notification_received,0);
  await expect(student,'GET','/api/announcements');assert.equal((await expect(teacher,'GET',`/api/share/announcement/${id}/stats`)).viewed,0);
  const notices=(await expect(student,'GET','/api/notifications')).items.filter(x=>x.entity_id===id);assert.equal(notices.length,1);
  await expect(student,'POST','/api/notifications/received',{ids:[notices[0].id]});
  const afterDelivery=await expect(teacher,'GET',`/api/share/announcement/${id}/stats`);assert.equal(afterDelivery.notification_received,1);assert.equal(afterDelivery.viewed,0);
  await expect(student,'GET',`/api/announcements/${id}`);await expect(student,'GET',`/api/announcements/${id}`);
  const stats1=await expect(teacher,'GET',`/api/share/announcement/${id}/stats`);assert.equal(stats1.viewed,1);assert.equal(stats1.unique_views,1);assert.equal(stats1.total_opens,2);assert.equal(stats1.percent,100);assert.equal(stats1.recipients[0].level,'Licence 3');assert(stats1.recipients[0].roles.includes('etudiant'));assert(stats1.last_viewed_at);assert.equal(stats1.acknowledged,0);assert.equal(stats1.recipients[0].name,'L3 English');assert(stats1.recipients[0].first_viewed_at);assert(stats1.recipients[0].last_viewed_at);
  await expect(student,'GET',`/api/share/announcement/${id}/stats`,undefined,403);assert.equal((await expect(teacher,'GET','/api/publications/tracking')).items.find(x=>x.id===id&&x.type==='announcement').percent,100);await expect(student,'GET','/api/publications/tracking');assert(!(await expect(student,'GET','/api/publications/tracking')).items.some(x=>x.id===id));
  const reminder=await expect(teacher,'POST',`/api/share/announcement/${id}/remind`,{mode:'unacknowledged'});assert.equal(reminder.count,1);
  assert.equal((await expect(teacher,'POST',`/api/share/announcement/${id}/remind`,{mode:'unacknowledged'})).count,0);
  assert.equal((await expect(teacher,'POST',`/api/share/announcement/${id}/remind`,{mode:'unread'})).count,0);
  await expect(student,'POST',`/api/share/announcement/${id}/ack`);
  assert.equal((await expect(teacher,'GET',`/api/share/announcement/${id}/stats`)).acknowledged,1);
  assert.equal((await expect(teacher,'POST',`/api/share/announcement/${id}/remind`,{mode:'unacknowledged'})).count,0);
  assert.equal((await expect(outsider,'GET','/api/communications')).received.length,0);
  const history=(await expect(teacher,'GET',`/api/share/announcement/${id}/history`)).items;assert(history.some(x=>x.action==='acknowledge'));
  const document=await expect(teacher,'POST','/api/documents/upload?title=L3Guide&category=Support&filename=guide.txt&targets='+encodeURIComponent(JSON.stringify([{type:'course',id:courseId}]))+'&requires_ack=true',undefined,200,{raw:Buffer.from('Study guide'),headers:{'Content-Type':'text/plain'}});
  await expect(outsider,'GET',`/api/documents/${document.id}/file`,undefined,403);
  const docStats0=await expect(teacher,'GET',`/api/share/document/${document.id}/stats`);assert.equal(docStats0.viewed,0);
  assert.equal((await expect(student,'GET',`/api/documents/${document.id}/file`)).toString(),'Study guide');
  assert.equal((await expect(teacher,'GET',`/api/share/document/${document.id}/stats`)).viewed,0);
  await expect(student,'GET',`/api/documents/${document.id}`);
  await expect(student,'POST',`/api/share/document/${document.id}/ack`);
  const docStats=await expect(teacher,'GET',`/api/share/document/${document.id}/stats`);assert.equal(docStats.viewed,1);assert.equal(docStats.recipients[0].download_count,1);assert.equal(docStats.acknowledged,1);
 }finally{await stop(s);fs.rmSync(s.data,{recursive:true,force:true})}
});
test('chief, level manager, secretariat, delegate, Master and PhD respect sharing scopes',async()=>{
 const s=await start(true);
 try{
  const admin=new Client(s.base),teacher=new Client(s.base),manager=new Client(s.base),secretary=new Client(s.base),delegate=new Client(s.base),master=new Client(s.base),phd=new Client(s.base);
  await expect(admin,'POST','/api/chef/login',{email:'chef@example.org',password:'RenderStrong2026!'});
  await expect(teacher,'POST','/api/login',{email:'enseignant@american-corner.test',password:'DemoUser2026!'});
  const year=(await expect(admin,'GET','/api/meta')).years[0].id;
  const create=async(name,email,role,level)=> (await expect(admin,'POST','/api/users',{name,email,identifier:email,password:'TestPassword123',role,level,track:'Linguistique',year_id:year})).id;
  const managerId=await create('Responsable L2','manager@example.org','responsable_niveau','Licence 2');
  await create('Secrétaire','secretary@example.org','secretariat','');
  await create('Délégué L2','delegate@example.org','delegue','Licence 2');
  const masterId=await create('Étudiant Master','master@example.org','etudiant','Master 1');
  const phdId=await create('Doctorant','phd@example.org','etudiant','Doctorat');
  await expect(manager,'POST','/api/login',{email:'manager@example.org',password:'TestPassword123'});
  await expect(secretary,'POST','/api/login',{email:'secretary@example.org',password:'TestPassword123'});
  await expect(delegate,'POST','/api/login',{email:'delegate@example.org',password:'TestPassword123'});
  await expect(master,'POST','/api/login',{email:'master@example.org',password:'TestPassword123'});
  await expect(phd,'POST','/api/login',{email:'phd@example.org',password:'TestPassword123'});
  assert(!(await expect(manager,'GET','/api/share/options')).items.some(x=>x.type==='all'));
  assert((await expect(manager,'GET','/api/share/options')).items.some(x=>x.type==='level'&&x.id==='Licence 2'));
  await expect(manager,'POST','/api/announcements',{title:'Hors périmètre',body:'Non',targets:[{type:'level',id:'Licence 3'}],publish:true},403);
  const levelPost=await expect(manager,'POST','/api/announcements',{title:'Convocation L2',body:'Réunion',category:'Convocation',targets:[{type:'level',id:'Licence 2'}],requires_ack:true,publish:true});assert.equal(levelPost.status,'pending');
  await expect(admin,'PATCH',`/api/announcements/${levelPost.id}`,{status:'published'});
  assert((await expect(admin,'GET',`/api/share/announcement/${levelPost.id}/stats`)).total>0);
  await expect(delegate,'POST','/api/announcements',{title:'À tous',body:'Interdit',targets:[{type:'all',id:'*'}],publish:true},403);
  const secretaryPost=await expect(secretary,'POST','/api/announcements',{title:'Démarches administratives',body:'Information',category:'Information administrative',targets:[{type:'students',id:'*'}],publish:true});assert.equal(secretaryPost.status,'pending');
  await expect(teacher,'POST','/api/announcements',{title:'Département entier',body:'Interdit',category:'Annonce officielle',targets:[{type:'all',id:'*'}],publish:true},403);
  const global=await expect(admin,'POST','/api/announcements',{title:'Annonce générale',body:'Bienvenue',category:'Annonce officielle',targets:[{type:'all',id:'*'}],publish:true});assert.equal(global.status,'published');
  assert((await expect(phd,'GET','/api/announcements')).items.some(x=>x.id===global.id));
  const group=await expect(admin,'POST','/api/share/groups',{name:'Recherche anglophone',kind:'research',level:'Master 1',members:[masterId,phdId]});
  const masterOptions=(await expect(master,'GET','/api/share/options')).items;assert(masterOptions.some(x=>x.type==='group'&&x.id===String(group.id)));assert(!masterOptions.some(x=>x.type==='all'));
  const scientific=await expect(master,'POST','/api/announcements',{title:'Article de recherche',body:'Lien bibliographique',category:'Recherche scientifique',targets:[{type:'group',id:group.id}],publish:true});assert.equal(scientific.status,'published');
  assert((await expect(phd,'GET','/api/communications')).received.some(x=>x.id===scientific.id&&x.type==='announcement'));
  await expect(master,'POST','/api/announcements',{title:'Fausse décision',body:'Non',category:'Annonce officielle',targets:[{type:'group',id:group.id}],publish:true},403);
  assert.equal((await expect(manager,'GET','/api/announcements')).items.some(x=>x.id===scientific.id),false);
  const history=await expect(admin,'GET',`/api/share/announcement/${levelPost.id}/history`);assert(history.items.some(x=>x.action==='publish'));
  await expect(phd,'GET',`/api/share/announcement/${levelPost.id}/stats`,undefined,403);
  assert(managerId>0);
 }finally{await stop(s);fs.rmSync(s.data,{recursive:true,force:true})}
});
test('result consultation tracking shows names/dates but never grades to scope-only managers',async()=>{
 const s=await start(true);
 try{
  const admin=new Client(s.base),teacher=new Client(s.base),student=new Client(s.base),other=new Client(s.base),manager=new Client(s.base);
  await expect(admin,'POST','/api/chef/login',{email:'chef@example.org',password:'RenderStrong2026!'});
  await expect(teacher,'POST','/api/login',{email:'enseignant@american-corner.test',password:'DemoUser2026!'});
  await expect(student,'POST','/api/login',{email:'etudiant@american-corner.test',password:'DemoUser2026!'});
  const year=(await expect(admin,'GET','/api/meta')).years[0].id;
  const otherId=(await expect(admin,'POST','/api/users',{name:'Deuxième L2',email:'second@example.org',identifier:'L2-2',password:'TestPassword123',role:'etudiant',level:'Licence 2',track:'Études anglophones',year_id:year})).id;
  await expect(other,'POST','/api/login',{email:'second@example.org',password:'TestPassword123'});
  const managerId=(await expect(admin,'POST','/api/users',{name:'Responsable L2',email:'manager@example.org',identifier:'R-L2',password:'TestPassword123',role:'responsable_niveau',level:'Licence 2',year_id:year})).id;
  await expect(manager,'POST','/api/login',{email:'manager@example.org',password:'TestPassword123'});
  const course=(await expect(admin,'POST','/api/courses',{title:'Méthodologie L2',code:'METH-L2',level:'Licence 2',track:'Études anglophones',semester:1,year_id:year,teacher_id:3})).id;
  await expect(admin,'POST',`/api/courses/${course}/enrollments`,{student_ids:[2,otherId]});
  const first=(await expect(teacher,'POST','/api/results',{course_id:course,student_id:2,score:12})).id;
  const second=(await expect(teacher,'POST','/api/results',{course_id:course,student_id:otherId,score:17})).id;
  for(const id of [first,second]){await expect(admin,'PATCH',`/api/results/${id}`,{status:'validated'});await expect(admin,'PATCH',`/api/results/${id}`,{status:'published'})}
  assert.equal((await expect(teacher,'GET',`/api/results/consultations?course_id=${course}`)).items.filter(x=>x.first_viewed_at).length,0);
  await expect(other,'GET',`/api/results/${first}`,undefined,403);
  assert.equal((await expect(student,'GET','/api/results')).items.find(x=>x.id===first).score,undefined);
  assert.equal((await expect(teacher,'GET',`/api/results/consultations?course_id=${course}`)).items.filter(x=>x.first_viewed_at).length,0);
  assert.equal((await expect(student,'GET',`/api/results/${first}`)).score,12);await expect(student,'GET',`/api/results/${first}`);
  const tracking=await expect(teacher,'GET',`/api/results/consultations?course_id=${course}`);
  assert.equal(tracking.items.length,2);assert.equal(tracking.items.filter(x=>x.first_viewed_at).length,1);assert.equal(tracking.items.find(x=>x.result_id===first).view_count,2);assert(!('score' in tracking.items[0]));
  await expect(other,'GET',`/api/results/consultations?course_id=${course}`,undefined,403);
  await expect(manager,'GET',`/api/results/consultations?course_id=${course}`,undefined,403);
  const role=(await expect(admin,'GET','/api/roles')).items.find(x=>x.name==='responsable_niveau');const permissions=JSON.parse(role.permissions);permissions.push('results.consultations.level');
  await expect(admin,'PATCH',`/api/roles/${role.id}`,{permissions});
  await expect(manager,'POST','/api/login',{email:'manager@example.org',password:'TestPassword123'});
  const managerTracking=await expect(manager,'GET',`/api/results/consultations?course_id=${course}`);assert.equal(managerTracking.items.length,2);assert(!('score' in managerTracking.items[0]));
  await expect(manager,'GET','/api/results');assert.equal((await expect(manager,'GET','/api/results')).items.length,0);
  await expect(admin,'PATCH',`/api/results/${first}`,{score:13,reason:'Correction officielle'});
  assert.equal((await expect(teacher,'GET',`/api/results/consultations?course_id=${course}`)).items.filter(x=>x.first_viewed_at).length,0);
  assert(managerId>0);
 }finally{await stop(s);fs.rmSync(s.data,{recursive:true,force:true})}
});
test('calendar events use the same scoped recipients, view tracking and withdrawal',async()=>{
 const s=await start(true);try{
  const admin=new Client(s.base),student=new Client(s.base),other=new Client(s.base);
  await expect(admin,'POST','/api/chef/login',{email:'chef@example.org',password:'RenderStrong2026!'});
  await expect(student,'POST','/api/login',{email:'etudiant@american-corner.test',password:'DemoUser2026!'});
  const year=(await expect(admin,'GET','/api/meta')).years[0].id;
  await expect(admin,'POST','/api/users',{name:'Étudiant L1',email:'l1@example.org',identifier:'L1',password:'TestPassword123',role:'etudiant',level:'Licence 1',year_id:year});
  await expect(other,'POST','/api/login',{email:'l1@example.org',password:'TestPassword123'});
  const event=await expect(admin,'POST','/api/events',{title:'Soutenance L2',description:'Salle réservée aux Licence 2. Instruction détaillée.',kind:'Soutenance',starts_at:'2026-12-10T10:00',place:'Salle 1',targets:[{type:'level',id:'Licence 2'}],requires_ack:true});
  assert((await expect(student,'GET','/api/events')).items.some(x=>x.id===event.id));assert(!(await expect(other,'GET','/api/events')).items.some(x=>x.id===event.id));
  await expect(other,'GET',`/api/events/${event.id}`,undefined,403);
  assert.equal((await expect(admin,'GET',`/api/share/event/${event.id}/stats`)).viewed,0);
  await expect(student,'GET',`/api/events/${event.id}`);
  await expect(student,'POST',`/api/share/event/${event.id}/ack`);
  assert.equal((await expect(admin,'GET',`/api/share/event/${event.id}/stats`)).acknowledged,1);
  await expect(admin,'PATCH',`/api/events/${event.id}`,{status:'withdrawn'});
  await expect(student,'GET',`/api/events/${event.id}`,undefined,403);
 }finally{await stop(s);fs.rmSync(s.data,{recursive:true,force:true})}
});
test('removing a course enrollment revokes protected content and prevents reminders',async()=>{
 const s=await start(true);try{
  const admin=new Client(s.base),teacher=new Client(s.base),student=new Client(s.base),other=new Client(s.base);
  await expect(admin,'POST','/api/chef/login',{email:'chef@example.org',password:'RenderStrong2026!'});
  await expect(teacher,'POST','/api/login',{email:'enseignant@american-corner.test',password:'DemoUser2026!'});
  await expect(student,'POST','/api/login',{email:'etudiant@american-corner.test',password:'DemoUser2026!'});
  const year=(await expect(admin,'GET','/api/meta')).years[0].id;
  const id=(await expect(admin,'POST','/api/users',{name:'Autre L2',email:'otherl2@example.org',identifier:'L2-OTHER',password:'TestPassword123',role:'etudiant',level:'Licence 2',track:'Études anglophones',year_id:year})).id;
  await expect(other,'POST','/api/login',{email:'otherl2@example.org',password:'TestPassword123'});
  const course=(await expect(admin,'POST','/api/courses',{title:'TD anglais',code:'TD-L2',level:'Licence 2',track:'Études anglophones',semester:1,year_id:year,teacher_id:3})).id;
  await expect(admin,'POST',`/api/courses/${course}/enrollments`,{student_ids:[2,id]});
  const post=await expect(teacher,'POST','/api/announcements',{title:'TD confidentiel',body:'Texte du TD',category:'Information pédagogique',targets:[{type:'course',id:course}],publish:true});
  assert.equal((await expect(teacher,'GET',`/api/share/announcement/${post.id}/stats`)).total,2);
  await expect(admin,'POST',`/api/courses/${course}/enrollments`,{student_ids:[2]});
  await expect(other,'GET',`/api/announcements/${post.id}`,undefined,403);
  assert(!(await expect(other,'GET','/api/communications')).received.some(x=>x.id===post.id));
  assert.equal((await expect(teacher,'GET',`/api/share/announcement/${post.id}/stats`)).total,1);
  assert.equal((await expect(teacher,'POST',`/api/share/announcement/${post.id}/remind`,{mode:'unread'})).count,1);
  assert(!(await expect(other,'GET','/api/notifications')).items.some(x=>x.entity_id===post.id));
  assert((await expect(student,'GET','/api/announcements')).items.some(x=>x.id===post.id));
 }finally{await stop(s);fs.rmSync(s.data,{recursive:true,force:true})}
});
test('notifications count, direct link, read state and protected result payloads',async()=>{
 const s=await start(true);try{
  const admin=new Client(s.base),student=new Client(s.base),other=new Client(s.base);
  await expect(admin,'POST','/api/chef/login',{email:'chef@example.org',password:'RenderStrong2026!'});
  await expect(student,'POST','/api/login',{email:'etudiant@american-corner.test',password:'DemoUser2026!'});
  await expect(other,'POST','/api/login',{email:'enseignant@american-corner.test',password:'DemoUser2026!'});
  const before=(await expect(student,'GET','/api/notifications/count')).unread;
  const post=await expect(admin,'POST','/api/announcements',{title:'Annonce de service',body:'Ouvrez cette publication.',category:'Information pédagogique',targets:[{type:'person',id:2}],publish:true});
  const list=await expect(student,'GET','/api/notifications'),n=list.items.find(x=>x.entity_id===post.id);assert(n);
  assert.equal((await expect(student,'GET','/api/notifications/count')).unread,before+1);
  assert.equal((await expect(student,'GET',`/api/notifications/${n.id}`)).entity_type,'announcement');
  await expect(other,'GET',`/api/notifications/${n.id}`,undefined,404);
  await expect(student,'POST','/api/notifications/received',{ids:[n.id]});
  assert.equal((await expect(admin,'GET',`/api/share/announcement/${post.id}/stats`)).viewed,0);
  assert.equal((await expect(student,'POST',`/api/notifications/${n.id}/read`)).unread,before);
  assert.equal((await expect(admin,'GET',`/api/share/announcement/${post.id}/stats`)).viewed,0);
  await expect(student,'GET',`/api/announcements/${post.id}`);
  assert.equal((await expect(admin,'GET',`/api/share/announcement/${post.id}/stats`)).viewed,1);
  await expect(student,'GET',`/api/announcements/${post.id}`);await expect(student,'GET',`/api/notifications/${n.id}`);
  const unique=await expect(admin,'GET',`/api/share/announcement/${post.id}/stats`);assert.equal(unique.viewed,1);assert.equal(unique.unique_views,1);assert.equal(unique.total_opens,2);
  assert.equal((await expect(admin,'GET','/api/announcements')).items.find(x=>x.id===post.id).views,1);
  assert.equal((await expect(student,'GET','/api/announcements')).items.find(x=>x.id===post.id).views,undefined);
  await expect(admin,'PATCH',`/api/announcements/${post.id}`,{status:'withdrawn'});
  await expect(student,'GET',`/api/notifications/${n.id}`,undefined,404);
  assert.equal((await expect(student,'GET','/api/notifications/count')).unread,before);
 }finally{await stop(s);fs.rmSync(s.data,{recursive:true,force:true})}
});
test('configured VAPID subscription endpoints require login, CSRF, trusted push hosts, and preferences',async()=>{
 const webpush=require('web-push'),keys=webpush.generateVAPIDKeys();const s=await start(true,{AC_VAPID_PUBLIC_KEY:keys.publicKey,AC_VAPID_PRIVATE_KEY:keys.privateKey,AC_VAPID_SUBJECT:'mailto:contact@example.org'});
 try{const guest=new Client(s.base),student=new Client(s.base),teacher=new Client(s.base);
  await expect(guest,'GET','/api/push/status',undefined,401);
  await expect(student,'POST','/api/login',{email:'etudiant@american-corner.test',password:'DemoUser2026!'});
  await expect(teacher,'POST','/api/login',{email:'enseignant@american-corner.test',password:'DemoUser2026!'});
  const config=await expect(student,'GET','/api/push/status');assert.equal(config.configured,true);assert.equal(config.public_key,keys.publicKey);assert(!('private_key' in config));
  const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test-'+Date.now(),keys:{p256dh:'A'.repeat(88),auth:'B'.repeat(22)}};
  await expect(student,'POST','/api/push/subscriptions',{...sub,endpoint:'https://127.0.0.1/internal'},400);
  await expect(student,'POST','/api/push/subscriptions',sub,403,{omitCsrf:true});
  await expect(student,'POST','/api/push/subscriptions',sub);
  assert.equal((await expect(student,'GET','/api/push/status')).devices,1);
  await expect(teacher,'DELETE','/api/push/subscriptions',{endpoint:sub.endpoint});
  assert.equal((await expect(student,'GET','/api/push/status')).devices,1);
  await expect(student,'PATCH','/api/push/preferences',{enabled:false});assert.equal((await expect(student,'GET','/api/push/status')).enabled,false);
  await expect(student,'POST','/api/push/test',{},400);
  await expect(student,'DELETE','/api/push/subscriptions',{endpoint:sub.endpoint});assert.equal((await expect(student,'GET','/api/push/status')).devices,0);
  await expect(student,'POST','/api/push/subscriptions',sub);await expect(student,'POST','/api/logout',{});await expect(student,'POST','/api/login',{email:'etudiant@american-corner.test',password:'DemoUser2026!'});assert.equal((await expect(student,'GET','/api/push/status')).devices,0);
 }finally{await stop(s);fs.rmSync(s.data,{recursive:true,force:true})}
});
test('separate unlinked chief entrance rejects standard accounts and excludes chiefs from public login',async()=>{
 const s=await start(true);try{
  const visitor=new Client(s.base),chief=new Client(s.base),student=new Client(s.base);
  const publicHtml=String(await expect(visitor,'GET','/'));
  assert.match(publicHtml,/manifest\.webmanifest/);assert.doesNotMatch(publicHtml,/chef\.webmanifest|\/chef/);
  const chiefHtml=String(await expect(visitor,'GET','/chef'));
  assert.match(chiefHtml,/chef\.webmanifest/);assert.match(chiefHtml,/noindex/);
  const manifest=await expect(visitor,'GET','/chef.webmanifest');assert.equal(manifest.start_url,'/chef');assert.equal(manifest.id,'/chef');
  await expect(student,'POST','/api/chef/login',{email:'etudiant@american-corner.test',password:'DemoUser2026!'},401);
  await expect(chief,'POST','/api/login',{email:'chef@example.org',password:'RenderStrong2026!'},401);
  assert.equal((await expect(chief,'GET','/api/me')).user,null);
  await expect(chief,'POST','/api/chef/login',{email:'chef@example.org',password:'RenderStrong2026!'});
  assert((await expect(chief,'GET','/api/me')).user.roles.some(r=>r.name==='chef'));
  await expect(student,'POST','/api/login',{email:'etudiant@american-corner.test',password:'DemoUser2026!'});
  await expect(student,'GET','/api/users',undefined,403);
  const reset=await expect(visitor,'POST','/api/password/forgot',{email:'chef@example.org'});
  assert.match(reset.demo_reset_link,/\/chef#reset\//);
 }finally{await stop(s);fs.rmSync(s.data,{recursive:true,force:true})}
});

test('canonical custom domain is used in reset links for public users and chief',async()=>{
 const s=await start(true,{AC_BASE_URL:'https://amer-corner.oymiketech.com'});try{const visitor=new Client(s.base);
  const publicLink=await expect(visitor,'POST','/api/password/forgot',{email:'etudiant@american-corner.test'});
  assert.match(publicLink.demo_reset_link,/^https:\/\/amer-corner\.oymiketech\.com\/#reset\//);
  const chiefLink=await expect(visitor,'POST','/api/password/forgot',{email:'chef@example.org'});
  assert.match(chiefLink.demo_reset_link,/^https:\/\/amer-corner\.oymiketech\.com\/chef#reset\//);
 }finally{await stop(s);fs.rmSync(s.data,{recursive:true,force:true})}
});
