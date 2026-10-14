'use strict';
// One recipient resolver and one tracking ledger shared by announcements and documents.
module.exports=function createSharing({db,one,all,run,now,fail,has,roleNames,audit,notify}){
 function column(table,name,sql){if(!db.pragma(`table_info(${table})`).some(c=>c.name===name))db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${sql}`)}
 function init(){db.exec(`
  CREATE TABLE IF NOT EXISTS share_targets(entity_type TEXT NOT NULL,entity_id INTEGER NOT NULL,targets_json TEXT NOT NULL,requires_ack INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,PRIMARY KEY(entity_type,entity_id));
  CREATE TABLE IF NOT EXISTS share_recipients(entity_type TEXT NOT NULL,entity_id INTEGER NOT NULL,user_id INTEGER NOT NULL,notified_at TEXT,received_at TEXT,first_viewed_at TEXT,last_viewed_at TEXT,view_count INTEGER NOT NULL DEFAULT 0,ack_at TEXT,reminded_at TEXT,download_count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(entity_type,entity_id,user_id),FOREIGN KEY(user_id) REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS share_history(id INTEGER PRIMARY KEY,entity_type TEXT NOT NULL,entity_id INTEGER NOT NULL,actor_id INTEGER NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS groups(id INTEGER PRIMARY KEY,name TEXT NOT NULL,level TEXT DEFAULT '',track TEXT DEFAULT '',year_id INTEGER,kind TEXT NOT NULL DEFAULT 'academic',created_by INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS group_members(group_id INTEGER NOT NULL,user_id INTEGER NOT NULL,PRIMARY KEY(group_id,user_id),FOREIGN KEY(group_id) REFERENCES groups(id),FOREIGN KEY(user_id) REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS course_enrollments(course_id INTEGER NOT NULL,user_id INTEGER NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(course_id,user_id),FOREIGN KEY(course_id) REFERENCES courses(id),FOREIGN KEY(user_id) REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS result_views(result_id INTEGER NOT NULL,student_id INTEGER NOT NULL,first_viewed_at TEXT NOT NULL,last_viewed_at TEXT NOT NULL,view_count INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(result_id,student_id));
  CREATE INDEX IF NOT EXISTS share_recipient_user ON share_recipients(user_id,entity_type);
  CREATE INDEX IF NOT EXISTS group_member_user ON group_members(user_id);
 `);
 column('share_recipients','revoked_at','TEXT');column('notifications','entity_type','TEXT');column('notifications','entity_id','INTEGER');column('notifications','received_at','TEXT');column('documents','status',"TEXT NOT NULL DEFAULT 'published'");column('events','status',"TEXT NOT NULL DEFAULT 'published'");
 // One-time migration for older courses: inferred rosters are materialized and should be reviewed by the department.
 db.transaction(()=>{
  if(!one("SELECT 1 FROM settings WHERE key='course_enrollment_backfill_v1'")){
   for(const c of all('SELECT * FROM courses'))for(const u of all("SELECT DISTINCT x.id FROM users x JOIN user_roles ur ON ur.user_id=x.id JOIN roles r ON r.id=ur.role_id WHERE x.status='active' AND r.name='etudiant' AND x.level=? AND x.year_id=? AND (?='' OR x.track=?)",c.level,c.year_id,c.track,c.track))run('INSERT OR IGNORE INTO course_enrollments(course_id,user_id,created_at) VALUES (?,?,?)',c.id,u.id,now());
   run('INSERT INTO settings(key,value) VALUES (?,?)','course_enrollment_backfill_v1',now());
  }
  for(const type of ['announcement','document','event']){
   const table=type==='announcement'?'announcements':type==='document'?'documents':'events';
   for(const item of all(`SELECT * FROM ${table} WHERE status='published'`)){
    if(one('SELECT 1 FROM share_targets WHERE entity_type=? AND entity_id=?',type,item.id))continue;
    const targets=legacyTargets(item.audience,item.target);
    run('INSERT INTO share_targets(entity_type,entity_id,targets_json,requires_ack,created_at) VALUES (?,?,?,?,?)',type,item.id,JSON.stringify(targets),0,item.created_at);
    for(const id of resolve(targets,item.author_id||item.uploaded_by||item.owner_id))run('INSERT OR IGNORE INTO share_recipients(entity_type,entity_id,user_id) VALUES (?,?,?)',type,item.id,id);
   }
  }
 })();
 }
 const activeYear=()=>one('SELECT id FROM years WHERE active=1')?.id;
 function ownStudents(u){return new Set(all("SELECT DISTINCT s.id FROM users s JOIN course_enrollments ce ON ce.user_id=s.id JOIN courses c ON c.id=ce.course_id WHERE c.teacher_id=? AND s.status='active'",u.id).map(x=>x.id))}
 function options(u){
  const r=roleNames(u.id),admin=has(u,'users.manage'),secretary=r.has('secretariat'),librarian=r.has('bibliothecaire')||has(u,'documents.manage'),teacher=r.has('enseignant'),manager=r.has('responsable_niveau'),delegate=r.has('delegue')||has(u,'delegation.relay'),trackManager=r.has('responsable_parcours'),researcher=r.has('etudiant')&&(u.level?.startsWith('Master')||u.level==='Doctorat');
  const result=[],push=(type,id,label)=>result.push({type,id:String(id),label});
  if(librarian&&!admin)for(const [t,label] of [['all','Tout le département'],['students','Tous les étudiants'],['teachers','Enseignants']])push(t,'*',label);
  if(admin){for(const [t,label] of [['all','Tout le département'],['teachers','Tous les enseignants'],['students','Tous les étudiants'],['teachers_students','Enseignants et étudiants'],['admins','Responsables administratifs'],['level_managers','Responsables de niveaux'],['master','Étudiants de Master'],['doctorat','Doctorants'],['licence','Étudiants de Licence']])push(t,'*',label)}
  else if(secretary){for(const [t,label] of [['students','Tous les étudiants'],['teachers','Enseignants'],['admins','Responsables administratifs']])push(t,'*',label)}
  if(teacher)push('teachers','*','Enseignants');
  if(admin||secretary||librarian)for(const x of all('SELECT name FROM levels ORDER BY sort'))push('level',x.name,`Étudiants · ${x.name}`);
  else if(teacher)for(const x of all('SELECT DISTINCT level FROM courses WHERE teacher_id=? ORDER BY level',u.id))push('level',x.level,`Mes étudiants · ${x.level}`);
  else if((manager||delegate)&&u.level)push('level',u.level,`Étudiants · ${u.level}`);
  if(admin||secretary||librarian)for(const x of all('SELECT name FROM tracks ORDER BY name'))push('track',x.name,`Parcours · ${x.name}`);
  else if(trackManager&&u.track)push('track',u.track,`Parcours · ${u.track}`);
  if(admin)for(const x of all('SELECT name FROM roles ORDER BY name'))push('role',x.name,`Rôle · ${x.name}`);
  if(admin||teacher)for(const x of all('SELECT id,title,level FROM courses'+(admin?'':' WHERE teacher_id=?')+' ORDER BY id DESC',...(admin?[]:[u.id])))push('course',x.id,`Cours · ${x.title} (${x.level})`);
  const allowedStudents=teacher?ownStudents(u):new Set();
  for(const g of all('SELECT * FROM groups ORDER BY id DESC')){
   const memberIds=all('SELECT gm.user_id id FROM group_members gm JOIN users x ON x.id=gm.user_id WHERE gm.group_id=? AND x.status=?',g.id,'active').map(x=>x.id);
   if(admin||secretary||librarian||teacher&&memberIds.length>0&&memberIds.every(id=>allowedStudents.has(id))||(manager||delegate)&&g.level===u.level&&memberIds.every(id=>one('SELECT 1 FROM users WHERE id=? AND level=?',id,u.level))||trackManager&&g.track===u.track||researcher&&g.kind==='research'&&memberIds.includes(u.id))push('group',g.id,`Groupe · ${g.name}`);
  }
  let people=[];
  if(admin||secretary||librarian)people=all("SELECT id,name,identifier FROM users WHERE status='active' AND id<>? ORDER BY name LIMIT 500",u.id);
  else{
   const ids=new Set();
   if(teacher){for(const id of allowedStudents)ids.add(id);for(const x of all("SELECT x.id FROM users x JOIN user_roles ur ON ur.user_id=x.id JOIN roles r ON r.id=ur.role_id WHERE r.name='enseignant' AND x.status='active'"))ids.add(x.id)}
   if(manager||delegate)for(const x of all("SELECT id FROM users WHERE status='active' AND level=? AND year_id=?",u.level,activeYear()))ids.add(x.id);
   if(trackManager)for(const x of all("SELECT id FROM users WHERE status='active' AND track=? AND year_id=?",u.track,activeYear()))ids.add(x.id);
   if(manager||delegate)for(const x of all("SELECT x.id FROM users x JOIN user_roles ur ON ur.user_id=x.id JOIN roles r ON r.id=ur.role_id WHERE r.name='chef' AND x.status='active'"))ids.add(x.id);
   if(researcher){for(const x of all('SELECT supervisor_id id FROM research WHERE owner_id=? AND supervisor_id IS NOT NULL',u.id))ids.add(x.id);for(const x of all("SELECT gm2.user_id id FROM group_members gm JOIN groups g ON g.id=gm.group_id AND g.kind='research' JOIN group_members gm2 ON gm2.group_id=g.id WHERE gm.user_id=?",u.id))ids.add(x.id)}
   people=[...ids].filter(id=>id!==u.id).map(id=>one("SELECT id,name,identifier FROM users WHERE id=? AND status='active'",id)).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name,'fr')).slice(0,500);
  }
  for(const x of people)push('person',x.id,`Personne · ${x.name} (${x.identifier})`);
  return result;
 }
 function legacyTargets(a,t){const id=['all','students','teachers','licence','master','doctorat'].includes(a)?'*':String(t||'');return [{type:a||'all',id}]}
 function parseTargets(u,input,a,t){const targets=input===undefined?legacyTargets(a,t):input;
  if(!Array.isArray(targets)||!targets.length||targets.length>25)fail('Sélectionnez entre 1 et 25 destinataires.');
  const allowed=new Set(options(u).map(x=>`${x.type}:${x.id}`));const result=[],seen=new Set();
  for(const x of targets){if(!x||typeof x.type!=='string'||!['string','number'].includes(typeof x.id))fail('Destinataire invalide.');const type=x.type,id=String(x.id),key=`${type}:${id}`;if(!allowed.has(key))fail('Destinataire hors de votre périmètre.',403);if(!seen.has(key)){seen.add(key);result.push({type,id})}}
  return result;
 }
 function resolve(targets,actorId){const ids=new Set(),year=activeYear(),actor=one('SELECT * FROM users WHERE id=?',actorId),teacherRestricted=actor&&roleNames(actor.id).has('enseignant')&&!has(actor,'users.manage'),teacherIds=teacherRestricted?ownStudents(actor):null;const add=(sql,...args)=>{for(const x of all(sql,...args))ids.add(x.id)};
  for(const {type,id} of targets){
   const before=new Set(ids);
   if(type==='all')add("SELECT id FROM users WHERE status='active'");
   if(type==='students'||type==='licence'||type==='master'||type==='doctorat'){
    let filter=type==='licence'?" AND x.level LIKE 'Licence%'":type==='master'?" AND x.level LIKE 'Master%'":type==='doctorat'?" AND x.level='Doctorat'":'';
    add(`SELECT DISTINCT x.id FROM users x JOIN user_roles ur ON ur.user_id=x.id JOIN roles r ON r.id=ur.role_id WHERE x.status='active' AND r.name='etudiant'${filter}`);
   }
   if(type==='teachers'||type==='teachers_students')add(`SELECT DISTINCT x.id FROM users x JOIN user_roles ur ON ur.user_id=x.id JOIN roles r ON r.id=ur.role_id WHERE x.status='active' AND r.name IN (${type==='teachers'?'?':'?,?'})`,...(type==='teachers'?['enseignant']:['enseignant','etudiant']));
   if(type==='admins'||type==='level_managers'||type==='role')add(`SELECT DISTINCT x.id FROM users x JOIN user_roles ur ON ur.user_id=x.id JOIN roles r ON r.id=ur.role_id WHERE x.status='active' AND r.name IN (${type==='admins'?"'chef','secretariat','admin_secondaire'":type==='level_managers'?"'responsable_niveau'":'?'})`,...(type==='role'?[id]:[]));
   if(type==='level'||type==='track')add(`SELECT DISTINCT x.id FROM users x JOIN user_roles ur ON ur.user_id=x.id JOIN roles r ON r.id=ur.role_id WHERE x.status='active' AND r.name='etudiant' AND x.${type==='level'?'level':'track'}=? AND x.year_id=?`,id,year);
   if(type==='course')add("SELECT x.id FROM users x JOIN course_enrollments ce ON ce.user_id=x.id WHERE ce.course_id=? AND x.status='active'",Number(id))
   if(type==='group')add("SELECT x.id FROM users x JOIN group_members gm ON gm.user_id=x.id WHERE gm.group_id=? AND x.status='active'",Number(id));
   if(type==='person')add("SELECT id FROM users WHERE id=? AND status='active'",Number(id));
   if(type==='level'&&teacherRestricted)for(const uid of ids)if(!before.has(uid)&&!teacherIds.has(uid))ids.delete(uid);
  }
  ids.delete(actorId);return [...ids];
 }
 function track(type,id,actor,action,details={}){run('INSERT INTO share_history(entity_type,entity_id,actor_id,action,details,created_at) VALUES (?,?,?,?,?,?)',type,id,actor,action,JSON.stringify(details),now());audit(actor,'share.'+action,type,id,details)}
 function save(type,id,actor,targets,requiresAck){run('INSERT INTO share_targets(entity_type,entity_id,targets_json,requires_ack,created_at) VALUES (?,?,?,?,?)',type,id,JSON.stringify(targets),Number(!!requiresAck),now());track(type,id,actor,'create',{targets,requires_ack:!!requiresAck})}
 function publish(type,id,actor,title){const s=one('SELECT * FROM share_targets WHERE entity_type=? AND entity_id=?',type,id);if(!s)fail('Destinataires introuvables.');const recipients=resolve(JSON.parse(s.targets_json),actor);if(!recipients.length)fail('Aucun destinataire actif dans le public sélectionné.');for(const uid of recipients){
  run('INSERT OR IGNORE INTO share_recipients(entity_type,entity_id,user_id,notified_at) VALUES (?,?,?,?)',type,id,uid,now());
  // Existing recipients are not notified a second time on repeated approval.
  const rec=one('SELECT * FROM share_recipients WHERE entity_type=? AND entity_id=? AND user_id=?',type,id,uid);
  if(rec.notified_at&&!one('SELECT 1 FROM notifications WHERE user_id=? AND entity_type=? AND entity_id=?',uid,type,id))notify(uid,type==='document'?'Nouveau document':type==='event'?'Nouvel événement':'Nouvelle communication',title,'communications',type,id);
 }
 track(type,id,actor,'publish',{count:one('SELECT COUNT(*) n FROM share_recipients WHERE entity_type=? AND entity_id=?',type,id).n});
 }
 function info(type,id){if(!['announcement','document','event'].includes(type))fail('Type de publication invalide.',404);const x=one(`SELECT * FROM ${type==='announcement'?'announcements':type==='document'?'documents':'events'} WHERE id=?`,id);if(!x)fail('Publication introuvable.',404);return x}
 function owner(type,x){return type==='announcement'?x.author_id:type==='document'?x.uploaded_by:x.owner_id}
 function canSupervise(u){return has(u,'users.manage')||has(u,'communications.stats.all')}
 function canAccess(u,type,x){const supervisor=canSupervise(u)||type==='announcement'&&has(u,'announcements.publish')||type==='document'&&has(u,'documents.manage')||type==='event'&&has(u,'events.manage');const status=x.status||'published';if(status!=='published'||type==='announcement'&&x.expires_at&&x.expires_at<now().slice(0,10))return owner(type,x)===u.id||supervisor;return owner(type,x)===u.id||supervisor||!!one('SELECT 1 FROM share_recipients WHERE entity_type=? AND entity_id=? AND user_id=? AND revoked_at IS NULL',type,x.id,u.id)}
 function mayStats(u,type,x){return owner(type,x)===u.id||canSupervise(u)}
 function markView(u,type,x){if(!canAccess(u,type,x))fail('Accès refusé.',403);const rec=one('SELECT * FROM share_recipients WHERE entity_type=? AND entity_id=? AND user_id=? AND revoked_at IS NULL',type,x.id,u.id);if(rec){run('UPDATE share_recipients SET first_viewed_at=COALESCE(first_viewed_at,?),last_viewed_at=?,view_count=view_count+1 WHERE entity_type=? AND entity_id=? AND user_id=?',now(),now(),type,x.id,u.id)}return rec}
 function summary(type,id){const x=info(type,id),v=one(`SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN first_viewed_at IS NOT NULL THEN 1 ELSE 0 END),0) viewed,COALESCE(SUM(view_count),0) total_opens,MAX(last_viewed_at) last_viewed_at FROM share_recipients WHERE entity_type=? AND entity_id=? AND revoked_at IS NULL`,type,id),first=one('SELECT created_at FROM share_history WHERE entity_type=? AND entity_id=? AND action=? ORDER BY id LIMIT 1',type,id,'publish');return {...v,unique_views:v.viewed,percent:v.total?Math.round(v.viewed/v.total*100):0,published_at:first?.created_at||x.created_at}}
 function stats(type,id){const allRecipients=all('SELECT r.*,u.name,u.identifier FROM share_recipients r JOIN users u ON u.id=r.user_id WHERE r.entity_type=? AND r.entity_id=? ORDER BY u.name',type,id),rec=allRecipients.filter(x=>!x.revoked_at);const sum=summary(type,id);return {...sum,snapshot_total:allRecipients.length,revoked:allRecipients.length-rec.length,revoked_recipients:allRecipients.filter(x=>x.revoked_at).map(x=>({name:x.name,identifier:x.identifier,revoked_at:x.revoked_at})),total:rec.length,viewed:rec.filter(x=>x.first_viewed_at).length,unique_views:rec.filter(x=>x.first_viewed_at).length,unread:rec.filter(x=>!x.first_viewed_at).length,total_opens:rec.reduce((n,x)=>n+x.view_count,0),acknowledged:rec.filter(x=>x.ack_at).length,notification_sent:rec.filter(x=>x.notified_at).length,notification_received:rec.filter(x=>x.received_at).length,recipients:rec.map(x=>({id:x.user_id,name:x.name,identifier:x.identifier,roles:[...roleNames(x.user_id)],level:one('SELECT level FROM users WHERE id=?',x.user_id)?.level||'',track:one('SELECT track FROM users WHERE id=?',x.user_id)?.track||'',groups:all('SELECT g.name FROM groups g JOIN group_members gm ON gm.group_id=g.id WHERE gm.user_id=? ORDER BY g.name',x.user_id).map(g=>g.name),notified_at:x.notified_at,received_at:x.received_at,first_viewed_at:x.first_viewed_at,last_viewed_at:x.last_viewed_at,view_count:x.view_count,ack_at:x.ack_at,reminded_at:x.reminded_at,download_count:x.download_count}))}}
 function syncRecipientsForUser(uid){
  for(const r of all('SELECT r.*,s.targets_json FROM share_recipients r JOIN share_targets s ON s.entity_type=r.entity_type AND s.entity_id=r.entity_id WHERE r.user_id=?',uid)){
   const targets=JSON.parse(r.targets_json),x=info(r.entity_type,r.entity_id),author=one('SELECT * FROM users WHERE id=?',owner(r.entity_type,x));
   const scopeSensitive=targets.some(t=>t.type==='course'||t.type==='group'||t.type==='level'&&author&&roleNames(author.id).has('enseignant'));
   if(!scopeSensitive)continue;
   const eligible=resolve(targets,owner(r.entity_type,x)).includes(uid);
   if(!eligible&&!r.revoked_at)run('UPDATE share_recipients SET revoked_at=? WHERE entity_type=? AND entity_id=? AND user_id=?',now(),r.entity_type,r.entity_id,uid);
   if(eligible&&r.revoked_at)run('UPDATE share_recipients SET revoked_at=NULL WHERE entity_type=? AND entity_id=? AND user_id=?',r.entity_type,r.entity_id,uid);
  }
 }
 function registerRoutes(route){
  route('get','/api/publications/tracking',req=>{const u=req.user,supervise=canSupervise(u),rows=[];
   for(const [type,table,col] of [['announcement','announcements','author_id'],['document','documents','uploaded_by'],['event','events','owner_id']]){
    for(const x of all(`SELECT * FROM ${table} ${supervise?'':`WHERE ${col}=?`} ORDER BY id DESC LIMIT 200`,...(supervise?[]:[u.id]))){if(mayStats(u,type,x)&&['published','archived','withdrawn'].includes(x.status))rows.push({type,id:x.id,title:x.title,status:x.status,...summary(type,x.id)})}
   }
   // Official results are aggregated by course. This endpoint never returns a grade.
   for(const c of all(`SELECT c.id,c.title,c.created_at,c.teacher_id FROM courses c WHERE EXISTS(SELECT 1 FROM results r WHERE r.course_id=c.id AND r.status='published') ${has(u,'results.validate')?'':'AND c.teacher_id=?'} ORDER BY c.id DESC LIMIT 200`,...(has(u,'results.validate')?[]:[u.id]))){const v=one(`SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN v.first_viewed_at IS NOT NULL THEN 1 ELSE 0 END),0) viewed,COALESCE(SUM(v.view_count),0) total_opens,MAX(v.last_viewed_at) last_viewed_at,MIN(r.published_at) published_at FROM results r LEFT JOIN result_views v ON v.result_id=r.id AND v.student_id=r.student_id WHERE r.course_id=? AND r.status='published'`,c.id);rows.push({type:'result',id:c.id,title:'Résultats · '+c.title,status:'published',...v,unique_views:v.viewed,percent:v.total?Math.round(v.viewed/v.total*100):0})}
   return {total:rows.length,items:rows.sort((a,b)=>String(b.published_at||b.created_at||'').localeCompare(String(a.published_at||a.created_at||''))).slice(0,300)};
  });
  route('get','/api/share/options',req=>({items:options(req.user)}));
  route('get','/api/share/groups',req=>({items:all('SELECT * FROM groups ORDER BY id DESC').filter(g=>options(req.user).some(o=>o.type==='group'&&Number(o.id)===g.id)).map(g=>({...g,members:all('SELECT user_id FROM group_members WHERE group_id=?',g.id).map(x=>x.user_id)}))}));
  route('post','/api/share/groups',req=>{if(!has(req.user,'structure.manage'))fail('Accès refusé.',403);const d=req.body||{},members=d.members;if(!Array.isArray(members)||members.length>500||members.some(x=>!Number.isSafeInteger(Number(x))))fail('Membres invalides.');const id=run('INSERT INTO groups(name,level,track,year_id,kind,created_by) VALUES (?,?,?,?,?,?)',String(d.name||'').trim().slice(0,120),String(d.level||''),String(d.track||''),d.year_id||activeYear(),d.kind==='research'?'research':'academic',req.user.id).lastInsertRowid;for(const uid of new Set(members.map(Number))){if(!one("SELECT 1 FROM users WHERE id=? AND status='active'",uid))fail('Membre invalide.');run('INSERT INTO group_members(group_id,user_id) VALUES (?,?)',id,uid)}audit(req.user.id,'group.create','group',id,{members});return {id}});
  route('patch','/api/share/groups/:id',req=>{if(!has(req.user,'structure.manage'))fail('Accès refusé.',403);const id=Number(req.params.id),g=one('SELECT * FROM groups WHERE id=?',id),d=req.body||{};if(!g)fail('Groupe introuvable.',404);if(!Array.isArray(d.members)||d.members.length>500)fail('Membres invalides.');const previous=all('SELECT user_id FROM group_members WHERE group_id=?',id).map(x=>x.user_id);run('DELETE FROM group_members WHERE group_id=?',id);for(const uid of new Set(d.members.map(Number))){if(!Number.isSafeInteger(uid)||!one("SELECT 1 FROM users WHERE id=? AND status='active'",uid))fail('Membre invalide.');run('INSERT INTO group_members(group_id,user_id) VALUES (?,?)',id,uid)}run('UPDATE groups SET name=? WHERE id=?',String(d.name||g.name).trim().slice(0,120),id);for(const uid of new Set([...previous,...d.members.map(Number)]))syncRecipientsForUser(uid);audit(req.user.id,'group.update','group',id,{members:d.members});return {ok:true}});
  route('get','/api/share/:type/:id/stats',req=>{const type=req.params.type,id=Number(req.params.id),x=info(type,id);if(!mayStats(req.user,type,x))fail('Accès refusé.',403);return stats(type,id)});
  route('get','/api/share/:type/:id/history',req=>{const type=req.params.type,id=Number(req.params.id),x=info(type,id);if(!mayStats(req.user,type,x))fail('Accès refusé.',403);return {items:all('SELECT h.*,u.name actor_name FROM share_history h JOIN users u ON u.id=h.actor_id WHERE entity_type=? AND entity_id=? ORDER BY h.id DESC',type,id)}});
  route('post','/api/share/:type/:id/ack',req=>{const type=req.params.type,id=Number(req.params.id),x=info(type,id),s=one('SELECT * FROM share_targets WHERE entity_type=? AND entity_id=?',type,id);if(!s?.requires_ack)fail('Aucun accusé demandé.');if(!canAccess(req.user,type,x))fail('Accès refusé.',403);const r=one('SELECT * FROM share_recipients WHERE entity_type=? AND entity_id=? AND user_id=? AND revoked_at IS NULL',type,id,req.user.id);if(!r?.first_viewed_at)fail('Ouvrez d’abord la publication.');if(!r.ack_at){run('UPDATE share_recipients SET ack_at=? WHERE entity_type=? AND entity_id=? AND user_id=?',now(),type,id,req.user.id);track(type,id,req.user.id,'acknowledge')}return {ok:true}});
  route('post','/api/share/:type/:id/remind',req=>{const type=req.params.type,id=Number(req.params.id),x=info(type,id),s=one('SELECT * FROM share_targets WHERE entity_type=? AND entity_id=?',type,id);if(!mayStats(req.user,type,x))fail('Accès refusé.',403);if(x.status!=='published')fail('La publication n’est pas diffusée.',409);if(!s)fail('Publication sans suivi.',400);const mode=req.body?.mode||'unread';if(!['unread','unacknowledged'].includes(mode)||mode==='unacknowledged'&&!s.requires_ack)fail('Type de rappel invalide.');let count=0;for(const r of all('SELECT * FROM share_recipients WHERE entity_type=? AND entity_id=? AND revoked_at IS NULL',type,id)){if(mode==='unread'&&r.first_viewed_at||mode==='unacknowledged'&&r.ack_at)continue;if(r.reminded_at&&Date.now()-Date.parse(r.reminded_at)<3600000)continue;notify(r.user_id,'Rappel : information à consulter',x.title||'Document à consulter','communications',type,id);run('UPDATE share_recipients SET reminded_at=? WHERE entity_type=? AND entity_id=? AND user_id=?',now(),type,id,r.user_id);count++}track(type,id,req.user.id,'remind',{mode,count});return {count}});
  route('get','/api/communications',req=>{const u=req.user,received=all(`SELECT r.entity_type type,r.entity_id id,r.first_viewed_at,r.ack_at,r.notified_at,r.received_at,s.requires_ack,a.title,a.status FROM share_recipients r JOIN share_targets s ON s.entity_type=r.entity_type AND s.entity_id=r.entity_id JOIN announcements a ON r.entity_type='announcement' AND a.id=r.entity_id WHERE r.user_id=? AND r.revoked_at IS NULL AND a.status='published' UNION ALL SELECT r.entity_type type,r.entity_id id,r.first_viewed_at,r.ack_at,r.notified_at,r.received_at,s.requires_ack,d.title,d.status FROM share_recipients r JOIN share_targets s ON s.entity_type=r.entity_type AND s.entity_id=r.entity_id JOIN documents d ON r.entity_type='document' AND d.id=r.entity_id WHERE r.user_id=? AND r.revoked_at IS NULL AND d.status='published' UNION ALL SELECT r.entity_type type,r.entity_id id,r.first_viewed_at,r.ack_at,r.notified_at,r.received_at,s.requires_ack,e.title,e.status FROM share_recipients r JOIN share_targets s ON s.entity_type=r.entity_type AND s.entity_id=r.entity_id JOIN events e ON r.entity_type='event' AND e.id=r.entity_id WHERE r.user_id=? AND r.revoked_at IS NULL AND e.status='published'`,u.id,u.id,u.id);const own=[...all('SELECT id,title,status,created_at FROM announcements WHERE author_id=? ORDER BY id DESC',u.id).map(x=>({...x,type:'announcement',views:summary('announcement',x.id).viewed})),...all('SELECT id,title,status,created_at FROM documents WHERE uploaded_by=? ORDER BY id DESC',u.id).map(x=>({...x,type:'document',views:summary('document',x.id).viewed})),...all('SELECT id,title,status,created_at FROM events WHERE owner_id=? ORDER BY id DESC',u.id).map(x=>({...x,type:'event',views:summary('event',x.id).viewed}))].sort((a,b)=>b.created_at.localeCompare(a.created_at));return {received,own}});
 }
 return {init,options,parseTargets,legacyTargets,resolve,save,publish,info,canAccess,mayStats,markView,stats,summary,track,syncRecipientsForUser,registerRoutes};
};
