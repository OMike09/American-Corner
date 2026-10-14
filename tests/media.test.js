'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),testURL=process.env.AC_TEST_DATABASE_URL;
async function freePort(){return new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n))})})}
async function start(data,url){const n=await freePort(),env={...process.env,AC_DATA:data,AC_DEMO:'0',NODE_ENV:'test',AC_ALLOW_SQLITE:'1',AC_ADMIN_EMAIL:'chef@media.test',AC_ADMIN_PASSWORD:'MediaStrong2026!',PORT:String(n)};delete env.DATABASE_URL;if(url)env.DATABASE_URL=url;const child=spawn(process.execPath,['server.js'],{cwd:ROOT,env,stdio:['ignore','pipe','pipe']});let log='';child.stderr.on('data',x=>log+=x);child.stdout.on('data',x=>log+=x);const base=`http://127.0.0.1:${n}`;for(let i=0;i<120;i++){try{if((await fetch(base+'/healthz')).ok)return {child,base,env}}catch{}await new Promise(r=>setTimeout(r,75))}child.kill();throw Error(log)}
async function stop(s){s.child.kill();await new Promise(r=>s.child.once('exit',r))}
class Client{constructor(base){this.base=base;this.cookie='';this.csrf=''}async call(method,url,data,mime){const headers={};if(this.cookie)headers.Cookie=this.cookie;if(this.csrf)headers['X-CSRF-Token']=this.csrf;let body;if(Buffer.isBuffer(data)){body=data;headers['Content-Type']=mime}else if(data!==undefined){body=JSON.stringify(data);headers['Content-Type']='application/json'}const res=await fetch(this.base+url,{method,headers,body});if(res.headers.get('set-cookie'))this.cookie=res.headers.get('set-cookie').split(';')[0];let value=Buffer.from(await res.arrayBuffer());if(res.headers.get('content-type')?.includes('json')){value=JSON.parse(value.toString());if(value.csrf)this.csrf=value.csrf}return [res.status,value,res.headers]}}
async function expected(c,m,u,data,status=200,mime){const [code,result]=await c.call(m,u,data,mime);assert.equal(code,status,`${m} ${u}: ${JSON.stringify(result)}`);return result}
for(const backend of ['sqlite','postgres'])test(`publication media ACL, quotas, replacement, restart and backup (${backend})`,{skip:backend==='postgres'&&!testURL},async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'ac-media-test-')),other=fs.mkdtempSync(path.join(os.tmpdir(),'ac-media-restart-')),url=backend==='postgres'?testURL:null;let s=await start(data,url);
 try{const chief=new Client(s.base),student=new Client(s.base),outsider=new Client(s.base),visitor=new Client(s.base);
 await expected(chief,'POST','/api/chef/login',{email:'chef@media.test',password:'MediaStrong2026!'});
 const year=(await expected(visitor,'GET','/api/meta')).years[0].id;
 await expected(chief,'POST','/api/publication-categories',{name:'Atelier personnalisé'});assert((await expected(visitor,'GET','/api/meta')).categories.includes('Atelier personnalisé'));await expected(chief,'PATCH','/api/publication-categories',{name:'Atelier personnalisé',status:'archived'});await expected(chief,'POST','/api/announcements',{title:'Interdit',body:'Test',category:'Atelier personnalisé',draft:true},400);await expected(chief,'PATCH','/api/publication-categories',{name:'Atelier personnalisé',status:'active'});await expected(visitor,'POST','/api/publication-categories',{name:'Intrusion'},401);

 const allowed=(await expected(chief,'POST','/api/users',{name:'Media student',email:'media-student@example.test',identifier:'MEDIA-STUDENT',password:'TestPassword123',role:'etudiant',level:'Licence 1',track:'',year_id:year})).id;
 await expected(chief,'POST','/api/users',{name:'Other student',email:'other-media@example.test',identifier:'OTHER-MEDIA',password:'TestPassword123',role:'etudiant',level:'Licence 2',track:'',year_id:year});
 await expected(student,'POST','/api/login',{email:'media-student@example.test',password:'TestPassword123'});await expected(outsider,'POST','/api/login',{email:'other-media@example.test',password:'TestPassword123'});
 const id=(await expected(chief,'POST','/api/announcements',{title:'Image pour une personne',body:'Bonjour',category:'Information pédagogique',targets:[{type:'person',id:allowed}],draft:true})).id;
 const jpeg=Buffer.from('not a jpeg');await expected(chief,'POST',`/api/announcements/${id}/media`,jpeg,400,'image/jpeg');
 await expected(student,'POST',`/api/announcements/${id}/media`,jpeg,403,'image/jpeg');
 const png=await require('sharp')({create:{width:10,height:10,channels:3,background:'#2c5a81'}}).png().toBuffer();
 const media=await expected(chief,'POST',`/api/announcements/${id}/media`,png,200,'image/png');assert.equal(media.mime,'image/webp');
 await expected(chief,'PATCH',`/api/announcements/${id}`,{status:'published'});
 assert.equal((await expected(student,'GET',`/api/announcements/${id}`)).media.mime,'image/webp');
 assert.equal((await expected(student,'GET',`/api/announcements/${id}/media/file`)).subarray(0,4).toString('ascii'),'RIFF');
 await expected(outsider,'GET',`/api/announcements/${id}/media/file`,undefined,404);await expected(visitor,'GET',`/api/announcements/${id}/media/file`,undefined,401);
 await expected(chief,'PATCH',`/api/announcements/${id}/media`,{status:'hidden'});await expected(student,'GET',`/api/announcements/${id}/media/file`,undefined,404);
 await expected(chief,'PATCH',`/api/announcements/${id}/media`,{status:'published'});
 const original=await expected(student,'GET',`/api/announcements/${id}/media/file`);
 const png2=await require('sharp')({create:{width:20,height:20,channels:3,background:'#ed2311'}}).png().toBuffer();await expected(chief,'POST',`/api/announcements/${id}/media`,png2,200,'image/png');assert.notDeepEqual(await expected(student,'GET',`/api/announcements/${id}/media/file`),original);
 const video=fs.readFileSync(path.join(ROOT,'tests/fixture.mp4'));const second=(await expected(chief,'POST','/api/announcements',{title:'Vidéo',body:'Consulter',category:'Information pédagogique',targets:[{type:'person',id:allowed}],draft:true})).id;
 await expected(chief,'POST',`/api/announcements/${second}/media`,video,200,'video/mp4');await expected(chief,'PATCH',`/api/announcements/${second}`,{status:'published'});
 const [partStatus,part,headers]=await student.call('GET',`/api/announcements/${second}/media/file`,undefined);assert.equal(partStatus,200);assert.deepEqual(part,video);
 const r=await fetch(s.base+`/api/announcements/${second}/media/file`,{headers:{Cookie:student.cookie,Range:'bytes=0-9'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),`bytes 0-9/${video.length}`);
 await expected(chief,'PATCH','/api/controls',{video_limits:{chef:1,enseignant:2}});
 const third=(await expected(chief,'POST','/api/announcements',{title:'Quota',body:'Texte',category:'Information pédagogique',draft:true})).id;
 await expected(chief,'POST',`/api/announcements/${third}/media`,video,429,'video/mp4');
 if(backend==='postgres'){
  const {createPostgres}=require('../postgres-adapter'),{exportBackup}=require('../postgres-backup');const db=createPostgres(url);try{const list=db.query('SELECT storage_name FROM publication_media_history').rows;assert.equal(list.length,1);assert.equal(db.query('SELECT data FROM file_blobs WHERE storage_name=$1',[list[0].storage_name]).rows[0].data.length,original.length);const backup=path.join(data,'media.pg.json.gz');const result=exportBackup(db,backup);assert.equal(result.counts.publication_media,2);assert.equal(result.counts.publication_media_history,1)}finally{db.close()}
 }
 await stop(s);s=await start(backend==='postgres'?other:data,url);const chief2=new Client(s.base),student2=new Client(s.base);await expected(chief2,'POST','/api/chef/login',{email:'chef@media.test',password:'MediaStrong2026!'});await expected(student2,'POST','/api/login',{email:'media-student@example.test',password:'TestPassword123'});assert((await expected(chief2,'GET','/api/publication-categories')).items.some(x=>x.name==='Atelier personnalisé'&&x.status==='active'));assert.deepEqual(await expected(student2,'GET',`/api/announcements/${second}/media/file`),video);assert.notDeepEqual(await expected(student2,'GET',`/api/announcements/${id}/media/file`),original);
 }finally{if(s.child.exitCode===null)await stop(s);fs.rmSync(data,{recursive:true,force:true});fs.rmSync(other,{recursive:true,force:true})}
});
