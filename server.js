'use strict';
/** American Corner: Node.js/Express API with persistent SQLite on AC_DATA (ephemeral on Render Free). */
const express=require('express');
const Database=require('better-sqlite3');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const nodemailer=require('nodemailer');
const ROOT=__dirname, DATA=path.resolve(process.env.AC_DATA||path.join(ROOT,'data'));
const UPLOADS=path.join(DATA,'uploads'), DB_PATH=path.join(DATA,'american_corner.sqlite3');
const DEMO=process.env.AC_DEMO==='1', PORT=Number(process.env.PORT||8000);
fs.mkdirSync(UPLOADS,{recursive:true});
const db=new Database(DB_PATH,{timeout:15000});db.pragma('foreign_keys = ON');db.pragma('journal_mode = WAL');db.pragma('busy_timeout = 15000');
const ROLES={chef:['users.manage','roles.manage','structure.manage','courses.manage','announcements.publish','announcements.create','events.manage','documents.manage','results.validate','results.enter','results.consultations.level','communications.stats.all','requests.manage','research.manage','audit.view','settings.manage','backups.manage'],secretariat:['announcements.create','documents.manage','requests.manage','events.manage'],enseignant:['announcements.create','documents.create','results.enter','research.supervise'],responsable_niveau:['announcements.create','events.manage','requests.view_scope'],responsable_parcours:['announcements.create','events.manage','research.supervise'],etudiant:[],delegue:['announcements.create'],bibliothecaire:['documents.manage'],ancien:['announcements.create'],admin_secondaire:['users.review','announcements.publish','requests.manage']};
const PERMISSIONS=[...new Set(Object.values(ROLES).flat())].sort();
const STATUSES=new Set(['pending','active','suspended','disabled','rejected']);
const MIMES={'application/pdf':'.pdf','image/png':'.png','image/jpeg':'.jpg','text/plain':'.txt','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'.docx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'.xlsx'};
const now=()=>new Date().toISOString(), day=()=>now().slice(0,10), hash=x=>crypto.createHash('sha256').update(x).digest('hex'), token=()=>crypto.randomBytes(32).toString('base64url');
const one=(sql,...args)=>db.prepare(sql).get(...args), all=(sql,...args)=>db.prepare(sql).all(...args), run=(sql,...args)=>db.prepare(sql).run(...args);
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status}}
function fail(message,status=400){throw new ApiError(message,status)}
function txt(x,label,max=240,required=true){if(typeof x!=='string')fail(`${label} invalide.`);x=x.trim();if(x.length>max||(required&&!x))fail(`${label} invalide.`);return x}
function email(x){x=txt(x,'Adresse e-mail',254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))fail('Adresse e-mail invalide.');return x}
function strong(p){if(typeof p!=='string'||p.length<10||p.length>128||!/[A-Za-z]/.test(p)||!/[0-9]/.test(p))fail('Mot de passe : 10 caractères minimum, avec lettres et chiffres.')}
function pwdHash(p){const salt=crypto.randomBytes(16),key=crypto.pbkdf2Sync(p,salt,310000,32,'sha256');return `pbkdf2_sha256$310000$${salt.toString('base64')}$${key.toString('base64')}`}
function pwdCheck(p,stored){try{const [_,n,s,k]=stored.split('$');const expected=Buffer.from(k,'base64'),actual=crypto.pbkdf2Sync(String(p),Buffer.from(s,'base64'),Number(n),expected.length,'sha256');return crypto.timingSafeEqual(actual,expected)}catch{return false}}
function issueSession(res,userId,pending=false,secure=false){
 const t=token(),csrf=token(),age=pending?24*3600000:7*86400000;
 run('INSERT INTO sessions(token_hash,user_id,csrf,expires_at,created_at) VALUES (?,?,?,?,?)',hash(t),userId,csrf,new Date(Date.now()+age).toISOString(),now());
 res.cookie('ac_session',t,{httpOnly:true,sameSite:'lax',secure,maxAge:age,path:'/'});
 return csrf;
}
function init(){db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,phone TEXT DEFAULT '',identifier TEXT NOT NULL,password TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',level TEXT DEFAULT '',track TEXT DEFAULT '',year_id INTEGER,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(year_id) REFERENCES years(id));
CREATE TABLE IF NOT EXISTS roles(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,permissions TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS user_roles(user_id INTEGER NOT NULL,role_id INTEGER NOT NULL,scope TEXT DEFAULT '',PRIMARY KEY(user_id,role_id,scope),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(role_id) REFERENCES roles(id));
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,csrf TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS login_events(id INTEGER PRIMARY KEY,user_id INTEGER,email TEXT,ip TEXT,success INTEGER,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reset_tokens(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires_at TEXT NOT NULL,used_at TEXT,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS years(id INTEGER PRIMARY KEY,label TEXT UNIQUE NOT NULL,active INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS levels(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,cycle TEXT NOT NULL,sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS tracks(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS courses(id INTEGER PRIMARY KEY,title TEXT NOT NULL,code TEXT NOT NULL,level TEXT NOT NULL,track TEXT DEFAULT '',semester INTEGER NOT NULL,year_id INTEGER NOT NULL,teacher_id INTEGER,created_at TEXT NOT NULL,FOREIGN KEY(year_id) REFERENCES years(id),FOREIGN KEY(teacher_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,category TEXT NOT NULL,audience TEXT NOT NULL,target TEXT DEFAULT '',status TEXT NOT NULL DEFAULT 'draft',author_id INTEGER NOT NULL,year_id INTEGER,expires_at TEXT DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(author_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,title TEXT NOT NULL,description TEXT DEFAULT '',kind TEXT NOT NULL,starts_at TEXT NOT NULL,ends_at TEXT DEFAULT '',place TEXT DEFAULT '',audience TEXT NOT NULL,target TEXT DEFAULT '',owner_id INTEGER NOT NULL,year_id INTEGER,created_at TEXT NOT NULL,FOREIGN KEY(owner_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS documents(id INTEGER PRIMARY KEY,title TEXT NOT NULL,category TEXT NOT NULL,author TEXT DEFAULT '',document_year TEXT DEFAULT '',level TEXT DEFAULT '',audience TEXT NOT NULL,target TEXT DEFAULT '',filename TEXT NOT NULL,storage_name TEXT UNIQUE NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,uploaded_by INTEGER NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(uploaded_by) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS results(id INTEGER PRIMARY KEY,course_id INTEGER NOT NULL,student_id INTEGER NOT NULL,score REAL NOT NULL,status TEXT NOT NULL DEFAULT 'draft',entered_by INTEGER NOT NULL,validated_by INTEGER,published_at TEXT,updated_at TEXT NOT NULL,UNIQUE(course_id,student_id),FOREIGN KEY(course_id) REFERENCES courses(id),FOREIGN KEY(student_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY,tracking TEXT UNIQUE NOT NULL,owner_id INTEGER NOT NULL,kind TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'received',assignee_id INTEGER,response TEXT DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,closed_at TEXT,FOREIGN KEY(owner_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS request_history(id INTEGER PRIMARY KEY,request_id INTEGER NOT NULL,actor_id INTEGER NOT NULL,status TEXT NOT NULL,note TEXT DEFAULT '',created_at TEXT NOT NULL,FOREIGN KEY(request_id) REFERENCES requests(id));
CREATE TABLE IF NOT EXISTS research(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL,supervisor_id INTEGER,title TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Sujet proposé',milestone TEXT NOT NULL DEFAULT 'Choix du sujet',notes TEXT DEFAULT '',updated_at TEXT NOT NULL,FOREIGN KEY(owner_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,link TEXT DEFAULT '',read_at TEXT,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor_id INTEGER,action TEXT NOT NULL,entity TEXT NOT NULL,entity_id INTEGER,details TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
`);
 db.transaction(()=>{
  for(const [name,permissions] of Object.entries(ROLES))run('INSERT OR IGNORE INTO roles(name,permissions) VALUES (?,?)',name,JSON.stringify(permissions));
  if(!one('SELECT id FROM years LIMIT 1'))run('INSERT INTO years(label,active) VALUES (?,1)','2026–2027');
  [['Licence 1','Licence'],['Licence 2','Licence'],['Licence 3','Licence'],['Master 1','Master'],['Master 2','Master'],['Doctorat','Doctorat']].forEach(([name,cycle],i)=>run('INSERT OR IGNORE INTO levels(name,cycle,sort) VALUES (?,?,?)',name,cycle,i));
  for(const name of ['Études anglophones','Linguistique','Littérature','Didactique','Traduction'])run('INSERT OR IGNORE INTO tracks(name) VALUES (?)',name);
  run('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)','platform_name','American Corner');
  const adminEmail=process.env.AC_ADMIN_EMAIL||(DEMO?'admin@american-corner.test':''),adminPassword=process.env.AC_ADMIN_PASSWORD||(DEMO?'DemoAdmin2026!':'');
  if(adminEmail&&adminPassword&&!one("SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.name='chef' LIMIT 1")){
   strong(adminPassword);const id=run('INSERT INTO users(name,email,identifier,password,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)','Chef de département',email(adminEmail),'ADMIN-001',pwdHash(adminPassword),'active',now(),now()).lastInsertRowid;
   run("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE name='chef'",id);
  }
  if(!DEMO&&!one("SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.name='chef' LIMIT 1"))throw Error('Premier démarrage : configurez AC_ADMIN_EMAIL et AC_ADMIN_PASSWORD dans Render.');
  if(DEMO&&!one("SELECT 1 FROM users WHERE email='etudiant@american-corner.test'")){
   const year=one('SELECT id FROM years WHERE active=1').id;
   for(const [name,mail,ident,role,level] of [['Awa Koné','etudiant@american-corner.test','ETU-2026-001','etudiant','Licence 2'],['Dr. Jean Kouassi','enseignant@american-corner.test','ENS-2026-001','enseignant','']]){
    const id=run('INSERT INTO users(name,email,identifier,password,status,level,track,year_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',name,mail,ident,pwdHash('DemoUser2026!'),'active',level,'Études anglophones',year,now(),now()).lastInsertRowid;
    run('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE name=?',id,role);
   }
  }
 })();
}
init();
function audit(actor,action,entity,id,details={}){run('INSERT INTO audit(actor_id,action,entity,entity_id,details,created_at) VALUES (?,?,?,?,?,?)',actor,action,entity,id,JSON.stringify(details),now())}
function roleRows(uid){return all('SELECT r.id,r.name,r.permissions,ur.scope FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?',uid)}
function roleNames(uid){return new Set(roleRows(uid).map(x=>x.name))}
function perms(uid){return new Set(roleRows(uid).flatMap(x=>JSON.parse(x.permissions)))}
function has(u,p){return !!u&&perms(u.id).has(p)}
function requireP(u,p){if(!has(u,p))fail('Accès refusé : autorisation insuffisante.',403)}
function publicUser(u){return {id:u.id,name:u.name,email:u.email,phone:u.phone,identifier:u.identifier,status:u.status,level:u.level,track:u.track,year_id:u.year_id,created_at:u.created_at,roles:roleRows(u.id).map(x=>({name:x.name,scope:x.scope})),permissions:[...perms(u.id)].sort()}}
function audienceOk(u,a,t){const r=roleNames(u.id);return a==='all'||a==='students'&&r.has('etudiant')||a==='teachers'&&r.has('enseignant')||a==='level'&&u.level===t||a==='track'&&u.track===t||a==='role'&&r.has(t)||a==='licence'&&u.level?.startsWith('Licence')||a==='master'&&u.level?.startsWith('Master')||a==='doctorat'&&u.level==='Doctorat'}
function checkAudience(a,t){if(!['all','students','teachers','level','track','role','licence','master','doctorat'].includes(a))fail('Public cible invalide.');if(['level','track','role'].includes(a)){if(!t)fail('Précisez le public ciblé.');const table={level:'levels',track:'tracks',role:'roles'}[a];if(!one(`SELECT 1 FROM ${table} WHERE name=?`,t))fail('Cible inconnue.')}}
function checkScope(u,a,t,resource){if(has(u,'announcements.publish')||has(u,'documents.manage')||has(u,'users.manage'))return;const r=roleNames(u.id);if(r.has('secretariat')&&['announcement','event'].includes(resource))return;if((r.has('responsable_niveau')||r.has('delegue'))&&a==='level'&&t&&t===u.level)return;if(r.has('responsable_parcours')&&a==='track'&&t&&t===u.track)return;if(r.has('ancien')&&resource==='announcement')return;if(r.has('enseignant')){if(a==='teachers')return;if(a==='level'&&one('SELECT 1 FROM courses WHERE teacher_id=? AND level=?',u.id,t))return}fail('Public hors de votre périmètre.',403)}
function notify(uid,title,body,link=''){run('INSERT INTO notifications(user_id,title,body,link,created_at) VALUES (?,?,?,?,?)',uid,title,body,link,now())}
function notifyAudience(a,t,title,body,link){for(const u of all("SELECT * FROM users WHERE status='active'"))if(audienceOk(u,a,t))notify(u.id,title,body,link)}
const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','same-origin');let csp="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self'; manifest-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'";if(!DEMO)csp+="; frame-ancestors 'self'";res.set('Content-Security-Policy',csp);next()});
app.get('/healthz',(req,res)=>{try{one('SELECT 1');res.json({status:'ok'})}catch{res.status(503).json({status:'unavailable'})}});
const STATIC_FILES={'/':'index.html','/app.css':'app.css','/app.js':'app.js','/manifest.webmanifest':'manifest.webmanifest','/sw.js':'sw.js','/offline.html':'offline.html','/icons/icon-192.png':'icons/icon-192.png','/icons/icon-512.png':'icons/icon-512.png','/icons/maskable-512.png':'icons/maskable-512.png','/icons/apple-touch-icon.png':'icons/apple-touch-icon.png','/icons/favicon.svg':'icons/favicon.svg'};
for(const [url,filename] of Object.entries(STATIC_FILES))app.get(url,(req,res)=>{
 res.set('Cache-Control','no-cache');
 if(filename==='manifest.webmanifest')res.type('application/manifest+json');
 if(filename==='sw.js'){res.type('application/javascript');res.set('Service-Worker-Allowed','/')}
 res.sendFile(path.join(ROOT,'static',filename));
});
app.use('/api/documents/upload',express.raw({type:()=>true,limit:'10mb'}));
app.use('/api',express.json({limit:'1mb'}));
app.use('/api',(req,res,next)=>{
 const m=/(?:^|;\s*)ac_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie||'');
 if(m){const s=one('SELECT * FROM sessions WHERE token_hash=?',hash(m[1]));if(s&&Date.parse(s.expires_at)>Date.now()){
  const u=one('SELECT * FROM users WHERE id=?',s.user_id);
  if(u&&['active','pending'].includes(u.status)){req.session=s;if(u.status==='active')req.user=u;else req.pendingUser=u}
 }}
 if(!['GET','HEAD','OPTIONS'].includes(req.method)){
  const origin=req.headers.origin;
  if(origin&&new URL(origin).host!==req.headers.host)return res.status(403).json({error:'Origine non autorisée.'});
  if(!['same-origin','none',undefined].includes(req.headers['sec-fetch-site']))return res.status(403).json({error:'Origine non autorisée.'});
  if(req.session&&req.headers['x-csrf-token']!==req.session.csrf)return res.status(403).json({error:'Jeton de sécurité invalide. Rechargez la page.'});
 }
 next();
});
function wrap(fn){return (req,res,next)=>{try{if(!req.user)fail('Veuillez vous connecter.',401);let result;if(['POST','PATCH','DELETE'].includes(req.method))result=db.transaction(()=>fn(req,res))();else result=fn(req,res);if(result!==undefined&&!res.headersSent)res.json(result)}catch(e){next(e)}}}
function publicRoute(fn){return (req,res,next)=>{try{const out=fn(req,res);if(out&&typeof out.then==='function')out.then(x=>{if(x!==undefined&&!res.headersSent)res.json(x)}).catch(next);else if(out!==undefined&&!res.headersSent)res.json(out)}catch(e){next(e)}}}
function route(method,p,fn){app[method](p,wrap(fn))}
const sharing=require('./sharing')({db,one,all,run,now,fail,has,roleNames,audit,notify});
sharing.init();sharing.registerRoutes(route);
const attempts=new Map();
app.get('/api/meta',publicRoute(()=>({name:one("SELECT value FROM settings WHERE key='platform_name'").value,demo:DEMO,years:all('SELECT * FROM years ORDER BY id DESC'),levels:all('SELECT * FROM levels ORDER BY sort'),tracks:all('SELECT * FROM tracks ORDER BY name')})));
app.get('/api/me',publicRoute(req=>({user:req.user?publicUser(req.user):null,csrf:req.session?.csrf||null,pending:!!req.pendingUser})));
app.post('/api/register',publicRoute((req,res)=>db.transaction(()=>{
 const d=req.body||{},kind=d.kind||'etudiant';strong(d.password);if(!['etudiant','ancien','enseignant'].includes(kind))fail('Ce statut nécessite une validation par le département.');
 const level=kind==='etudiant'?txt(d.level||'','Niveau',80):'';
 if(kind==='etudiant'&&!one('SELECT 1 FROM levels WHERE name=?',level))fail('Choisissez un niveau valide.');
 const year=one('SELECT id FROM years WHERE id=?',d.year_id);
 if(kind==='etudiant'&&!year)fail('Choisissez une année académique.');
 const id=run('INSERT INTO users(name,email,phone,identifier,password,status,level,track,year_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',txt(d.name||'','Nom',120),email(d.email||''),txt(d.phone||'','Téléphone',30,false),txt(d.identifier||'','Matricule / identifiant',60),pwdHash(d.password),'pending',level,txt(d.track||'','Parcours',100,false),year?.id||null,now(),now()).lastInsertRowid;
 run('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE name=?',id,kind);audit(id,'account.register','user',id);
 const csrf=issueSession(res,id,true,req.secure);res.status(202);
 return {pending:true,csrf,message:'Demande reçue. Votre espace s’ouvrira automatiquement dès la validation du compte.'};
})()));
app.post('/api/login',publicRoute((req,res)=>{
 const d=req.body||{},mail=email(d.email||''),ip=req.ip,key=ip+'|'+mail;
 let recent=(attempts.get(key)||[]).filter(x=>Date.now()-x<900000);attempts.set(key,recent);if(recent.length>=8)fail('Trop de tentatives. Réessayez dans 15 minutes.',429);
 const candidate=one('SELECT * FROM users WHERE email=?',mail),good=!!candidate&&pwdCheck(d.password,candidate.password);
 run('INSERT INTO login_events(user_id,email,ip,success,created_at) VALUES (?,?,?,?,?)',candidate?.id||null,mail,ip,Number(good),now());
 if(!good){recent.push(Date.now());fail('Identifiants incorrects.',401)}
 if(!['active','pending'].includes(candidate.status))fail('Compte non actif : contactez le département.',403);
 attempts.delete(key);
 const pending=candidate.status==='pending',csrf=issueSession(res,candidate.id,pending,req.secure);
 if(pending){res.status(202);return {pending:true,csrf,message:'Votre compte attend la validation du département. Cette page ouvrira votre espace automatiquement dès la validation.'}}
 return {user:publicUser(candidate),csrf};
}));
app.post('/api/password/forgot',publicRoute(async req=>{
 const mail=email((req.body||{}).email||''),u=one("SELECT id FROM users WHERE email=? AND status='active'",mail);
 const result={message:'Si ce compte existe, des instructions de réinitialisation ont été envoyées.'};
 if(u){const t=token();run('INSERT INTO reset_tokens(token_hash,user_id,expires_at,used_at) VALUES (?,?,?,NULL)',hash(t),u.id,new Date(Date.now()+30*60000).toISOString());
  const base=process.env.AC_BASE_URL||(DEMO?`${req.protocol}://${req.get('host')}`:'');const link=base.replace(/\/$/,'')+'/#reset/'+t;
  if(DEMO)result.demo_reset_link=link;
  else if(process.env.AC_SMTP_HOST&&base){const mailer=nodemailer.createTransport({host:process.env.AC_SMTP_HOST,port:Number(process.env.AC_SMTP_PORT||587),secure:process.env.AC_SMTP_PORT==='465',auth:{user:process.env.AC_SMTP_USER,pass:process.env.AC_SMTP_PASSWORD}});await mailer.sendMail({from:process.env.AC_SMTP_FROM||'noreply@american-corner.local',to:mail,subject:'American Corner — Réinitialisation',text:'Ce lien expire dans 30 minutes : '+link})}
 }
 return result;
}));
app.post('/api/password/reset',publicRoute(req=>db.transaction(()=>{
 const d=req.body||{};strong(d.password);const t=one('SELECT * FROM reset_tokens WHERE token_hash=? AND used_at IS NULL',hash(String(d.token||'')));
 if(!t||Date.parse(t.expires_at)<=Date.now())fail('Lien expiré ou invalide.');
 run('UPDATE users SET password=?,updated_at=? WHERE id=?',pwdHash(d.password),now(),t.user_id);run('UPDATE reset_tokens SET used_at=? WHERE user_id=?',now(),t.user_id);run('DELETE FROM sessions WHERE user_id=?',t.user_id);audit(t.user_id,'password.reset','user',t.user_id);return {message:'Mot de passe modifié. Connectez-vous.'};
})()));
app.post('/api/logout',publicRoute((req,res)=>db.transaction(()=>{
 if(req.session)run('DELETE FROM sessions WHERE token_hash=?',req.session.token_hash);
 res.clearCookie('ac_session',{path:'/'});return {ok:true};
})()));
route('patch','/api/profile',req=>{const u=req.user,d=req.body||{};run('UPDATE users SET name=?,phone=?,updated_at=? WHERE id=?',txt(d.name??u.name,'Nom',120),txt(d.phone??u.phone,'Téléphone',30,false),now(),u.id);audit(u.id,'profile.update','user',u.id);return {user:publicUser(one('SELECT * FROM users WHERE id=?',u.id))}});
route('post','/api/password/change',req=>{const d=req.body||{},u=req.user;if(!pwdCheck(d.current,u.password))fail('Mot de passe actuel incorrect.',403);strong(d.password);run('UPDATE users SET password=?,updated_at=? WHERE id=?',pwdHash(d.password),now(),u.id);run('DELETE FROM sessions WHERE user_id=? AND token_hash<>?',u.id,req.session.token_hash);audit(u.id,'password.change','user',u.id);return {ok:true}});
route('get','/api/login-events',req=>({items:all('SELECT ip,success,created_at FROM login_events WHERE user_id=? ORDER BY id DESC LIMIT 15',req.user.id)}));
route('get','/api/dashboard',req=>{const u=req.user,admin=has(u,'users.manage');return {users:admin?one('SELECT COUNT(*) n FROM users').n:null,pending:admin?one("SELECT COUNT(*) n FROM users WHERE status='pending'").n:null,open_requests:has(u,'requests.manage')?one("SELECT COUNT(*) n FROM requests WHERE status NOT IN ('treated','rejected')").n:one("SELECT COUNT(*) n FROM requests WHERE owner_id=? AND status NOT IN ('treated','rejected')",u.id).n,unread:one('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL',u.id).n,results_pending:has(u,'results.validate')?one("SELECT COUNT(*) n FROM results WHERE status='draft'").n:null,by_level:admin?all("SELECT level,COUNT(*) count FROM users WHERE status='active' AND level<>'' GROUP BY level"):[]}});
route('get','/api/users',req=>{if(!has(req.user,'users.manage')&&!has(req.user,'users.review'))fail('Accès refusé.',403);return {items:all('SELECT * FROM users ORDER BY created_at DESC LIMIT 300').map(publicUser)}});
route('post','/api/users',req=>{
 const u=req.user,d=req.body||{};requireP(u,'users.manage');strong(d.password);const r=txt(d.role||'','Rôle',80);if(!one('SELECT 1 FROM roles WHERE name=?',r))fail('Rôle inconnu.');
 const year=one('SELECT id FROM years WHERE id=?',d.year_id);
 const id=run('INSERT INTO users(name,email,identifier,password,status,level,track,year_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',txt(d.name||'','Nom',120),email(d.email||''),txt(d.identifier||'','Identifiant',60),pwdHash(d.password),'active',txt(d.level||'','Niveau',80,false),txt(d.track||'','Parcours',100,false),year?.id||null,now(),now()).lastInsertRowid;
 run('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE name=?',id,r);audit(u.id,'user.create','user',id,{role:r});return {id};
});
route('patch','/api/users/:id',req=>{
 const u=req.user,d=req.body||{},id=Number(req.params.id),target=one('SELECT * FROM users WHERE id=?',id);
 if(!has(u,'users.manage')&&!has(u,'users.review'))fail('Accès refusé.',403);if(!target)fail('Utilisateur introuvable.',404);
 const status=d.status||target.status,reason=txt(d.reason||'','Motif',400,false);
 if(!has(u,'users.manage')&&(target.status!=='pending'||!['active','rejected'].includes(status)||Object.keys(d).some(x=>!['status','reason'].includes(x))))fail('Validation limitée aux inscriptions en attente.',403);
 if(!STATUSES.has(status))fail('Statut invalide.');if(id===u.id&&status!=='active')fail('Impossible de désactiver votre propre compte.');
 if(['suspended','disabled','rejected'].includes(status)&&!reason)fail('Veuillez indiquer un motif.');
 let rolesChanged=false;
 if('roles' in d){
  const names=d.roles,valid=new Set(all('SELECT name FROM roles').map(x=>x.name));
  if(!Array.isArray(names)||!names.length||names.some(n=>!valid.has(n)))fail('Rôles invalides.');
  if(id===u.id&&!names.includes('chef'))fail('Vous ne pouvez pas retirer votre propre rôle chef.');
  const next=new Set(names),old=roleNames(id);
  rolesChanged=next.size!==old.size||[...next].some(n=>!old.has(n));
  if(rolesChanged){run('DELETE FROM user_roles WHERE user_id=?',id);for(const n of next)run('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE name=?',id,n)}
 }
 if('email' in d&&email(d.email)!==target.email)fail('Le changement d’adresse e-mail requiert une procédure dédiée.');
 run('UPDATE users SET name=?,status=?,level=?,track=?,updated_at=? WHERE id=?',txt(d.name??target.name,'Nom',120),status,txt(d.level??target.level,'Niveau',80,false),txt(d.track??target.track,'Parcours',100,false),now(),id);
 if(status!=='active'||rolesChanged)run('DELETE FROM sessions WHERE user_id=?',id);
 if(status==='active'&&(target.level!==d.level&&d.level!==undefined||target.track!==d.track&&d.track!==undefined))sharing.syncRecipientsForUser(id);
 if(target.status==='pending'&&status==='active')notify(id,'Compte validé','Votre compte est actif. Bienvenue sur American Corner.','dashboard');
 audit(u.id,'user.update','user',id,{status_before:target.status,status_after:status,roles_changed:rolesChanged,roles:d.roles,reason});return {ok:true};
});
route('get','/api/roles',()=>({items:all('SELECT * FROM roles ORDER BY name'),available_permissions:PERMISSIONS}));
route('post','/api/roles',req=>{requireP(req.user,'roles.manage');const d=req.body||{},name=txt(d.name||'','Rôle',60);if(!/^[a-z_]+$/.test(name))fail('Utilisez uniquement des lettres minuscules et des underscores.');if(!Array.isArray(d.permissions)||d.permissions.some(x=>!PERMISSIONS.includes(x)))fail('Permissions invalides.');const id=run('INSERT INTO roles(name,permissions) VALUES (?,?)',name,JSON.stringify(d.permissions)).lastInsertRowid;audit(req.user.id,'role.create','role',id,{permissions:d.permissions});return {id}});
route('patch','/api/roles/:id',req=>{requireP(req.user,'roles.manage');const id=Number(req.params.id),r=one('SELECT * FROM roles WHERE id=?',id),p=(req.body||{}).permissions;if(!r)fail('Rôle introuvable.',404);if(r.name==='chef')fail('Le rôle chef est protégé.',403);if(!Array.isArray(p)||p.some(x=>!PERMISSIONS.includes(x)))fail('Permissions invalides.');run('UPDATE roles SET permissions=? WHERE id=?',JSON.stringify([...new Set(p)].sort()),id);run('DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM user_roles WHERE role_id=?)',id);audit(req.user.id,'role.permissions','role',id,{before:JSON.parse(r.permissions),after:p});return {ok:true}});
route('get','/api/years',()=>({items:all('SELECT * FROM years ORDER BY id DESC')}));
route('post','/api/years',req=>{requireP(req.user,'structure.manage');const id=run('INSERT INTO years(label) VALUES (?)',txt((req.body||{}).label||'','Année',40)).lastInsertRowid;audit(req.user.id,'year.create','year',id);return {id}});
route('patch','/api/years/:id',req=>{requireP(req.user,'structure.manage');const id=Number(req.params.id),d=req.body||{};if(!one('SELECT id FROM years WHERE id=?',id))fail('Année introuvable.',404);if(d.active){run('UPDATE years SET active=0');run('UPDATE years SET active=1,archived=0 WHERE id=?',id)}else if('archived' in d)run('UPDATE years SET archived=? WHERE id=?',Number(!!d.archived),id);audit(req.user.id,'year.update','year',id,d);return {ok:true}});
route('post','/api/levels',req=>{requireP(req.user,'structure.manage');const d=req.body||{},id=run('INSERT INTO levels(name,cycle,sort) VALUES (?,?,?)',txt(d.name||'','Niveau',80),txt(d.cycle||'','Cycle',50),Number(d.sort||0)).lastInsertRowid;audit(req.user.id,'level.create','level',id);return {id}});
route('post','/api/tracks',req=>{requireP(req.user,'structure.manage');const id=run('INSERT INTO tracks(name) VALUES (?)',txt((req.body||{}).name||'','Parcours',100)).lastInsertRowid;audit(req.user.id,'track.create','track',id);return {id}});
route('get','/api/courses',req=>{const u=req.user,items=all('SELECT c.*,t.name teacher_name,y.label year_label FROM courses c LEFT JOIN users t ON t.id=c.teacher_id JOIN years y ON y.id=c.year_id ORDER BY c.id DESC LIMIT 300');return {items:items.filter(x=>has(u,'courses.manage')||x.teacher_id===u.id||roleNames(u.id).has('etudiant')&&x.level===u.level&&(!x.track||x.track===u.track)&&x.year_id===u.year_id)}});
route('get','/api/courses/:id/students',req=>{const c=one('SELECT * FROM courses WHERE id=?',Number(req.params.id)),u=req.user;if(!c)fail('Cours introuvable.',404);if(!has(u,'courses.manage')&&c.teacher_id!==u.id)fail('Accès refusé.',403);return {items:all("SELECT x.id,x.name,x.identifier,x.level,x.track FROM users x JOIN course_enrollments ce ON ce.user_id=x.id WHERE ce.course_id=? AND x.status='active' ORDER BY x.name",c.id)}});
route('get','/api/courses/:id/eligible',req=>{requireP(req.user,'courses.manage');const c=one('SELECT * FROM courses WHERE id=?',Number(req.params.id));if(!c)fail('Cours introuvable.',404);return {items:all("SELECT DISTINCT x.id,x.name,x.identifier FROM users x JOIN user_roles ur ON ur.user_id=x.id JOIN roles r ON r.id=ur.role_id WHERE x.status='active' AND r.name='etudiant' AND x.level=? AND x.year_id=? AND (?='' OR x.track=?) ORDER BY x.name",c.level,c.year_id,c.track,c.track),enrolled:all('SELECT user_id FROM course_enrollments WHERE course_id=?',c.id).map(x=>x.user_id)}});
route('post','/api/courses/:id/enrollments',req=>{requireP(req.user,'courses.manage');const c=one('SELECT * FROM courses WHERE id=?',Number(req.params.id)),ids=req.body?.student_ids;if(!c)fail('Cours introuvable.',404);if(!Array.isArray(ids)||ids.length>500||ids.some(x=>!Number.isSafeInteger(Number(x))))fail('Liste d’étudiants invalide.');const selected=new Set(ids.map(Number));for(const id of selected){const u=one('SELECT * FROM users WHERE id=?',id);if(!u||u.status!=='active'||!roleNames(id).has('etudiant')||u.level!==c.level||u.year_id!==c.year_id||c.track&&u.track!==c.track)fail('Étudiant hors du périmètre du cours.',403)}for(const x of all('SELECT student_id FROM results WHERE course_id=?',c.id))if(!selected.has(x.student_id))fail('Impossible de retirer un étudiant dont une note est conservée pour ce cours.',409);const previous=all('SELECT user_id FROM course_enrollments WHERE course_id=?',c.id).map(x=>x.user_id);run('DELETE FROM course_enrollments WHERE course_id=?',c.id);for(const id of selected)run('INSERT INTO course_enrollments(course_id,user_id,created_at) VALUES (?,?,?)',c.id,id,now());for(const id of new Set([...previous,...selected]))sharing.syncRecipientsForUser(id);audit(req.user.id,'course.enrollments','course',c.id,{students:[...selected]});return {count:selected.size}});
route('post','/api/courses',req=>{requireP(req.user,'courses.manage');const d=req.body||{},teacher=d.teacher_id||null,semester=Number(d.semester);if(teacher&&!one("SELECT 1 FROM users WHERE id=? AND status='active'",teacher))fail('Enseignant invalide.');if(![1,2].includes(semester))fail('Semestre invalide.');const id=run('INSERT INTO courses(title,code,level,track,semester,year_id,teacher_id,created_at) VALUES (?,?,?,?,?,?,?,?)',txt(d.title||'','Cours',140),txt(d.code||'','Code',40),txt(d.level||'','Niveau',80),txt(d.track||'','Parcours',100,false),semester,Number(d.year_id),teacher,now()).lastInsertRowid;audit(req.user.id,'course.create','course',id);return {id}});
route('get','/api/announcements',req=>{const u=req.user;return {items:all('SELECT a.*,x.name author_name FROM announcements a JOIN users x ON x.id=a.author_id ORDER BY a.id DESC LIMIT 250').filter(x=>sharing.canAccess(u,'announcement',x)).map(x=>({...x,body:x.author_id===u.id||has(u,'announcements.publish')||has(u,'users.manage')?x.body:x.body.slice(0,140)}))}});
route('get','/api/announcements/:id',req=>{const x=sharing.info('announcement',Number(req.params.id));sharing.markView(req.user,'announcement',x);const author=one('SELECT name FROM users WHERE id=?',x.author_id);const s=one('SELECT * FROM share_targets WHERE entity_type=? AND entity_id=?','announcement',x.id),rec=one('SELECT ack_at FROM share_recipients WHERE entity_type=? AND entity_id=? AND user_id=?','announcement',x.id,req.user.id);return {...x,author_name:author?.name,requires_ack:!!s?.requires_ack,ack_at:rec?.ack_at||null}});
route('post','/api/announcements',req=>{const u=req.user,d=req.body||{},researcher=roleNames(u.id).has('etudiant')&&(u.level?.startsWith('Master')||u.level==='Doctorat');if(!has(u,'announcements.create')&&!researcher)fail('Accès refusé.',403);
 const targets=sharing.parseTargets(u,d.targets,d.audience||'all',d.target||'');const category=txt(d.category||'Information générale','Catégorie',70);
 if(researcher&&!has(u,'announcements.create')&&!['Recherche scientifique','Séminaire','Article scientifique'].includes(category))fail('Seul le partage scientifique est autorisé.',403);
 const personal=targets.every(t=>['course','level','group','person','teachers'].includes(t.type));
 const direct=has(u,'announcements.publish')||roleNames(u.id).has('enseignant')&&personal&&['Information pédagogique','Support de cours','Devoir ou exercice','Emploi du temps'].includes(category)||researcher&&personal&&['Recherche scientifique','Séminaire','Article scientifique'].includes(category);
 const status=d.publish&&direct?'published':d.draft?'draft':'pending';const first=targets[0];
 const id=run('INSERT INTO announcements(title,body,category,audience,target,status,author_id,year_id,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',txt(d.title||'','Titre',180),txt(d.body||'','Contenu',10000),category,first.type,first.id,status,u.id,d.year_id||null,txt(d.expires_at||'','Expiration',30,false),now(),now()).lastInsertRowid;
 sharing.save('announcement',id,u.id,targets,d.requires_ack);
 if(status==='published')sharing.publish('announcement',id,u.id,d.title);return {id,status};
});
route('patch','/api/announcements/:id',req=>{const u=req.user,id=Number(req.params.id),x=sharing.info('announcement',id),d=req.body||{};let status=d.status||x.status;
 if(!['draft','pending','published','archived','withdrawn'].includes(status))fail('Statut invalide.');
 const own=x.author_id===u.id,supervisor=has(u,'users.manage')||has(u,'announcements.publish');if(!own&&!supervisor)fail('Accès refusé.',403);
 if(status==='published'&&x.status!=='published'){
  const s=one('SELECT * FROM share_targets WHERE entity_type=? AND entity_id=?','announcement',id);const targets=JSON.parse(s.targets_json);
  const author=one('SELECT * FROM users WHERE id=?',x.author_id),researcher=roleNames(author.id).has('etudiant')&&(author.level?.startsWith('Master')||author.level==='Doctorat');
  const direct=has(u,'announcements.publish')||own&&((roleNames(u.id).has('enseignant')&&targets.every(t=>['course','level','group','person','teachers'].includes(t.type))&&['Information pédagogique','Support de cours','Devoir ou exercice','Emploi du temps'].includes(x.category))||(researcher&&['Recherche scientifique','Séminaire','Article scientifique'].includes(x.category)));
  if(!direct)fail('Validation officielle requise.',403);
 }
 if(['archived','withdrawn'].includes(status)&&!own&&!supervisor)fail('Accès refusé.',403);
 const title=txt(d.title??x.title,'Titre',180),body=txt(d.body??x.body,'Contenu',10000);
 run('UPDATE announcements SET title=?,body=?,status=?,updated_at=? WHERE id=?',title,body,status,now(),id);
 if(status==='published'&&x.status!=='published')sharing.publish('announcement',id,x.author_id,title);
 sharing.track('announcement',id,u.id,'update',{old_status:x.status,status,title_changed:title!==x.title,body_changed:body!==x.body});return {ok:true};
});
route('get','/api/events',req=>({items:all('SELECT e.*,x.name owner_name FROM events e JOIN users x ON x.id=e.owner_id ORDER BY e.starts_at ASC LIMIT 300').filter(x=>sharing.canAccess(req.user,'event',x)).map(x=>({...x,description:x.owner_id===req.user.id||has(req.user,'events.manage')?x.description:x.description.slice(0,120)}))}));
route('get','/api/events/:id',req=>{const x=sharing.info('event',Number(req.params.id));sharing.markView(req.user,'event',x);const s=one('SELECT requires_ack FROM share_targets WHERE entity_type=? AND entity_id=?','event',x.id),rec=one('SELECT ack_at FROM share_recipients WHERE entity_type=? AND entity_id=? AND user_id=?','event',x.id,req.user.id);return {...x,requires_ack:!!s?.requires_ack,ack_at:rec?.ack_at||null}});
route('post','/api/events',req=>{const u=req.user,d=req.body||{};requireP(u,'events.manage');const targets=sharing.parseTargets(u,d.targets,d.audience||'all',d.target||''),first=targets[0],start=txt(d.starts_at||'','Date',40);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(start)||Number.isNaN(Date.parse(start)))fail('Date invalide.');const title=txt(d.title||'','Titre',150);
 const id=run('INSERT INTO events(title,description,kind,starts_at,ends_at,place,audience,target,owner_id,year_id,created_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',title,txt(d.description||'','Description',3000,false),txt(d.kind||'Événement','Type',60),start,txt(d.ends_at||'','Fin',40,false),txt(d.place||'','Lieu',140,false),first.type,first.id,u.id,d.year_id||null,now(),'published').lastInsertRowid;sharing.save('event',id,u.id,targets,d.requires_ack);sharing.publish('event',id,u.id,title);audit(u.id,'event.create','event',id);return {id}});
route('patch','/api/events/:id',req=>{const u=req.user,id=Number(req.params.id),x=sharing.info('event',id),d=req.body||{};if(x.owner_id!==u.id&&!has(u,'users.manage'))fail('Accès refusé.',403);const status=d.status||x.status;if(!['published','archived','withdrawn'].includes(status))fail('Statut invalide.');const title=txt(d.title??x.title,'Titre',150);run('UPDATE events SET title=?,description=?,starts_at=?,place=?,status=? WHERE id=?',title,txt(d.description??x.description,'Description',3000,false),txt(d.starts_at??x.starts_at,'Date',40),txt(d.place??x.place,'Lieu',140,false),status,id);sharing.track('event',id,u.id,'update',{old_status:x.status,status,title_changed:title!==x.title});return {ok:true}});
route('get','/api/documents',req=>{const u=req.user,q=String(req.query.q||'').toLowerCase(),category=String(req.query.category||'');return {items:all('SELECT id,title,category,author,document_year,level,audience,target,filename,mime,size,uploaded_by,created_at,status FROM documents ORDER BY id DESC LIMIT 300').filter(x=>sharing.canAccess(u,'document',x)&&(!q||[x.title,x.author,x.category,x.document_year].join(' ').toLowerCase().includes(q))&&(!category||category===x.category))}});
route('get','/api/documents/:id',req=>{const x=sharing.info('document',Number(req.params.id));sharing.markView(req.user,'document',x);const s=one('SELECT requires_ack FROM share_targets WHERE entity_type=? AND entity_id=?','document',x.id),rec=one('SELECT ack_at FROM share_recipients WHERE entity_type=? AND entity_id=? AND user_id=?','document',x.id,req.user.id);return {id:x.id,title:x.title,category:x.category,author:x.author,document_year:x.document_year,filename:x.filename,size:x.size,mime:x.mime,status:x.status,requires_ack:!!s?.requires_ack,ack_at:rec?.ack_at||null}});
route('post','/api/documents/upload',req=>{
 const u=req.user,q=req.query;if(!has(u,'documents.manage')&&!has(u,'documents.create'))fail('Accès refusé.',403);const content=req.body;if(!Buffer.isBuffer(content)||!content.length||content.length>10*1024*1024)fail('Fichier requis (10 Mo maximum).',413);
 const mime=String(req.headers['content-type']||'').split(';')[0],filename=path.basename(String(q.filename||''));if(!MIMES[mime]||!filename.toLowerCase().endsWith(MIMES[mime]))fail('Type de fichier non autorisé.');
 let supplied;if(q.targets!==undefined){try{supplied=JSON.parse(String(q.targets))}catch{fail('Destinataires invalides.')}}
 const targets=sharing.parseTargets(u,supplied,String(q.audience||'all'),String(q.target||''));const first=targets[0];
 if(mime==='application/pdf'&&!content.subarray(0,5).equals(Buffer.from('%PDF-')))fail('PDF invalide.');
 if(mime==='image/png'&&!content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail('PNG invalide.');
 if(mime==='image/jpeg'&&!content.subarray(0,2).equals(Buffer.from([255,216])))fail('JPEG invalide.');
 if((mime.includes('wordprocessingml')||mime.includes('spreadsheetml'))&&!content.subarray(0,2).equals(Buffer.from('PK')))fail('Document Office invalide.');
 const storage=crypto.randomBytes(24).toString('hex')+MIMES[mime];fs.writeFileSync(path.join(UPLOADS,storage),content,{flag:'wx'});
 try{const title=txt(String(q.title||''),'Titre',160),id=run('INSERT INTO documents(title,category,author,document_year,level,audience,target,filename,storage_name,mime,size,uploaded_by,created_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',title,txt(String(q.category||'Ressource'),'Catégorie',70),txt(String(q.author||''),'Auteur',120,false),txt(String(q.document_year||''),'Année',10,false),txt(String(q.level||''),'Niveau',80,false),first.type,first.id,filename,storage,mime,content.length,u.id,now(),'published').lastInsertRowid;sharing.save('document',id,u.id,targets,q.requires_ack==='true');sharing.publish('document',id,u.id,title);audit(u.id,'document.upload','document',id,{filename,size:content.length});return {id}}catch(e){fs.rmSync(path.join(UPLOADS,storage),{force:true});throw e}
});
route('patch','/api/documents/:id',req=>{const u=req.user,id=Number(req.params.id),x=sharing.info('document',id),d=req.body||{};if(x.uploaded_by!==u.id&&!has(u,'documents.manage'))fail('Accès refusé.',403);const status=d.status||x.status;if(!['published','archived','withdrawn'].includes(status))fail('Statut invalide.');const title=txt(d.title??x.title,'Titre',160);run('UPDATE documents SET title=?,status=? WHERE id=?',title,status,id);sharing.track('document',id,u.id,'update',{old_status:x.status,status,title_changed:title!==x.title});return {ok:true}});
route('get','/api/documents/:id/file',(req,res)=>{const u=req.user,doc=sharing.info('document',Number(req.params.id));if(!sharing.canAccess(u,'document',doc))fail('Accès refusé.',403);const f=path.join(UPLOADS,doc.storage_name);if(!fs.existsSync(f))fail('Fichier indisponible.',404);const rec=one('SELECT 1 FROM share_recipients WHERE entity_type=? AND entity_id=? AND user_id=?','document',doc.id,u.id);if(rec)run('UPDATE share_recipients SET download_count=download_count+1 WHERE entity_type=? AND entity_id=? AND user_id=?','document',doc.id,u.id);res.type(doc.mime);res.download(f,doc.filename)});
route('get','/api/results',req=>{const u=req.user,items=all('SELECT r.*,c.title course_title,c.code,c.level,c.semester,c.year_id,c.teacher_id,x.name student_name,x.identifier student_identifier,y.label year_label FROM results r JOIN courses c ON c.id=r.course_id JOIN users x ON x.id=r.student_id JOIN years y ON y.id=c.year_id ORDER BY r.id DESC LIMIT 300');return {items:items.filter(x=>has(u,'results.validate')||has(u,'results.enter')&&x.teacher_id===u.id||x.student_id===u.id&&x.status==='published')}});
route('post','/api/results/seen',req=>{const u=req.user,ids=req.body?.ids;if(!Array.isArray(ids)||ids.length>100||ids.some(id=>!Number.isSafeInteger(Number(id))))fail('Résultats invalides.');let count=0;for(const id of new Set(ids.map(Number))){const x=one('SELECT * FROM results WHERE id=?',id);if(!x||x.student_id!==u.id||x.status!=='published')fail('Accès refusé.',403);const old=one('SELECT * FROM result_views WHERE result_id=? AND student_id=?',id,u.id);if(old)run('UPDATE result_views SET last_viewed_at=?,view_count=view_count+1 WHERE result_id=? AND student_id=?',now(),id,u.id);else{run('INSERT INTO result_views(result_id,student_id,first_viewed_at,last_viewed_at) VALUES (?,?,?,?)',id,u.id,now(),now());audit(u.id,'result.view','result',id)}count++}return {count}});
route('get','/api/results/consultations',req=>{const u=req.user,course=one('SELECT * FROM courses WHERE id=?',Number(req.query.course_id));if(!course)fail('Cours introuvable.',404);if(!has(u,'results.validate')&&course.teacher_id!==u.id&&!(has(u,'results.consultations.level')&&u.level===course.level))fail('Accès refusé.',403);return {course:{id:course.id,title:course.title,level:course.level},items:all("SELECT r.id result_id,r.student_id,u.name student_name,u.identifier,v.first_viewed_at,v.last_viewed_at,v.view_count FROM results r JOIN users u ON u.id=r.student_id LEFT JOIN result_views v ON v.result_id=r.id AND v.student_id=r.student_id WHERE r.course_id=? AND r.status='published' ORDER BY u.name",course.id)}});
route('post','/api/results',req=>{const u=req.user,d=req.body||{};requireP(u,'results.enter');const course=one('SELECT * FROM courses WHERE id=?',d.course_id),student=one('SELECT * FROM users WHERE id=?',d.student_id);if(!course||!student)fail('Cours ou étudiant introuvable.');if(!has(u,'results.validate')&&course.teacher_id!==u.id)fail('Vous n’enseignez pas ce cours.',403);if(student.status!=='active'||!roleNames(student.id).has('etudiant'))fail('Compte étudiant actif requis.');if(student.level!==course.level||student.year_id!==course.year_id||course.track&&student.track!==course.track||!one('SELECT 1 FROM course_enrollments WHERE course_id=? AND user_id=?',course.id,student.id))fail('Étudiant non inscrit à ce cours.');const score=Number(d.score);if(!Number.isFinite(score)||score<0||score>20)fail('La note doit être comprise entre 0 et 20.');const old=one('SELECT * FROM results WHERE course_id=? AND student_id=?',course.id,student.id);if(old&&old.status!=='draft')fail('Note déjà validée : utilisez la procédure de correction.',403);let id;if(old){run('UPDATE results SET score=?,entered_by=?,updated_at=? WHERE id=?',score,u.id,now(),old.id);id=old.id}else id=run('INSERT INTO results(course_id,student_id,score,entered_by,updated_at) VALUES (?,?,?,?,?)',course.id,student.id,score,u.id,now()).lastInsertRowid;audit(u.id,'result.enter','result',id,{old_score:old?.score??null,new_score:score});return {id}});
route('patch','/api/results/:id',req=>{const u=req.user,d=req.body||{},id=Number(req.params.id);requireP(u,'results.validate');const old=one('SELECT * FROM results WHERE id=?',id);if(!old)fail('Note introuvable.',404);let status=d.status||old.status,score=old.score;const reason=txt(d.reason||'','Motif',400,false);if(!['draft','validated','published'].includes(status))fail('Statut invalide.');if(status==='published'&&!['validated','published'].includes(old.status))fail('Validez la note avant publication.');if(old.status==='published'&&(status!=='published'||'score' in d)&&!reason)fail('Motif de correction obligatoire.');if('score' in d){score=Number(d.score);if(!Number.isFinite(score)||score<0||score>20)fail('Note invalide.');if(score!==old.score&&old.status!=='draft')status='draft'}const previousViews=old.status==='published'&&status!=='published'?one('SELECT COUNT(*) n FROM result_views WHERE result_id=?',id).n:0;if(previousViews)run('DELETE FROM result_views WHERE result_id=?',id);run('UPDATE results SET score=?,status=?,validated_by=?,published_at=?,updated_at=? WHERE id=?',score,status,['validated','published'].includes(status)?u.id:null,status==='published'?now():null,now(),id);audit(u.id,'result.update','result',id,{old_score:old.score,new_score:score,old_status:old.status,status,reason,previous_views:previousViews});if(status==='published'&&old.status!=='published')notify(old.student_id,'Résultat publié','Un nouveau résultat officiel est disponible.','results');return {ok:true}});
route('get','/api/requests',req=>{const u=req.user;return {items:all('SELECT r.*,x.name owner_name FROM requests r JOIN users x ON x.id=r.owner_id ORDER BY r.id DESC LIMIT 300').filter(x=>x.owner_id===u.id||has(u,'requests.manage')).map(x=>({...x,history:all('SELECT h.*,u.name actor_name FROM request_history h JOIN users u ON u.id=h.actor_id WHERE request_id=? ORDER BY h.id',x.id)}))}});
route('post','/api/requests',req=>{const u=req.user,d=req.body||{},tracking='AC-'+day().replace(/-/g,'')+'-'+crypto.randomBytes(3).toString('hex').toUpperCase();const id=run('INSERT INTO requests(tracking,owner_id,kind,subject,body,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',tracking,u.id,txt(d.kind||'','Type',80),txt(d.subject||'','Objet',180),txt(d.body||'','Description',5000),now(),now()).lastInsertRowid;run('INSERT INTO request_history(request_id,actor_id,status,note,created_at) VALUES (?,?,?,?,?)',id,u.id,'received','Demande déposée',now());audit(u.id,'request.create','request',id);return {id,tracking}});
route('patch','/api/requests/:id',req=>{const u=req.user,d=req.body||{},id=Number(req.params.id);requireP(u,'requests.manage');const old=one('SELECT * FROM requests WHERE id=?',id);if(!old)fail('Demande introuvable.',404);const status=d.status,note=txt(d.note||'','Note',2000,false);if(!['received','processing','waiting','treated','rejected'].includes(status))fail('Statut invalide.');if(status==='rejected'&&!note)fail('Justification obligatoire.');run('UPDATE requests SET status=?,assignee_id=?,response=?,updated_at=?,closed_at=? WHERE id=?',status,u.id,note,now(),['treated','rejected'].includes(status)?now():null,id);run('INSERT INTO request_history(request_id,actor_id,status,note,created_at) VALUES (?,?,?,?,?)',id,u.id,status,note,now());notify(old.owner_id,'Mise à jour de votre demande',old.tracking,'requests');audit(u.id,'request.update','request',id,{status});return {ok:true}});
route('get','/api/research',req=>{const u=req.user;return {items:all('SELECT r.*,x.name owner_name,s.name supervisor_name FROM research r JOIN users x ON x.id=r.owner_id LEFT JOIN users s ON s.id=r.supervisor_id ORDER BY r.id DESC').filter(x=>x.owner_id===u.id||x.supervisor_id===u.id||has(u,'research.manage'))}});
route('post','/api/research',req=>{const u=req.user;if(!u.level?.startsWith('Master')&&u.level!=='Doctorat'&&!has(u,'research.manage'))fail('Réservé aux étudiants de Master et doctorants.',403);const kind=u.level==='Doctorat'?'Thèse':'Mémoire';const id=run('INSERT INTO research(owner_id,title,kind,updated_at) VALUES (?,?,?,?)',u.id,txt((req.body||{}).title||'','Sujet',250),kind,now()).lastInsertRowid;audit(u.id,'research.create','research',id);return {id}});
route('patch','/api/research/:id',req=>{const u=req.user,d=req.body||{},id=Number(req.params.id),old=one('SELECT * FROM research WHERE id=?',id);if(!old)fail('Projet introuvable.',404);if(![old.owner_id,old.supervisor_id].includes(u.id)&&!has(u,'research.manage'))fail('Accès refusé.',403);const status=txt(d.status||old.status,'Statut',80),milestone=txt(d.milestone||old.milestone,'Étape',80);if(old.owner_id===u.id&&(status!==old.status||milestone!==old.milestone||d.supervisor_id!=null))fail('La validation des étapes et l’encadrement sont réservés aux responsables.',403);const supervisor=has(u,'research.manage')?(d.supervisor_id||old.supervisor_id):old.supervisor_id;run('UPDATE research SET status=?,milestone=?,notes=?,supervisor_id=?,updated_at=? WHERE id=?',status,milestone,txt(d.notes??old.notes,'Notes',3000,false),supervisor,now(),id);audit(u.id,'research.update','research',id,{status,milestone});return {ok:true}});
route('get','/api/notifications',req=>({items:all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 60',req.user.id).filter(x=>{if(!x.entity_type)return true;try{const item=sharing.info(x.entity_type,x.entity_id);return item.status==='published'&&sharing.canAccess(req.user,x.entity_type,item)}catch{return false}})}));
route('post','/api/notifications/received',req=>{const ids=req.body?.ids;if(!Array.isArray(ids)||ids.length>100||ids.some(x=>!Number.isSafeInteger(Number(x))))fail('Notifications invalides.');let count=0;for(const id of new Set(ids.map(Number))){const x=one('SELECT * FROM notifications WHERE id=? AND user_id=?',id,req.user.id);if(!x)fail('Accès refusé.',403);if(x.entity_type){const item=sharing.info(x.entity_type,x.entity_id);if(item.status!=='published'||!sharing.canAccess(req.user,x.entity_type,item))fail('Accès refusé.',403)}if(!x.received_at){run('UPDATE notifications SET received_at=? WHERE id=?',now(),id);if(x.entity_type&&x.entity_id)run('UPDATE share_recipients SET received_at=COALESCE(received_at,?) WHERE entity_type=? AND entity_id=? AND user_id=?',now(),x.entity_type,x.entity_id,req.user.id)}count++}return {count}});
route('post','/api/notifications/read',req=>{run('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL',now(),req.user.id);return {ok:true}});
route('get','/api/audit',req=>{requireP(req.user,'audit.view');return {items:all('SELECT a.*,u.name actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 150')}});
route('patch','/api/settings',req=>{requireP(req.user,'settings.manage');const name=txt((req.body||{}).platform_name||'','Nom',90);run("UPDATE settings SET value=? WHERE key='platform_name'",name);audit(req.user.id,'settings.update','settings',1,{platform_name:name});return {ok:true}});
app.post('/api/backups',publicRoute(async req=>{if(!req.user)fail('Veuillez vous connecter.',401);requireP(req.user,'backups.manage');const filename='backup-'+new Date().toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15)+'.sqlite3';await db.backup(path.join(DATA,filename));audit(req.user.id,'backup.create','backup',null,{file:filename});return {file:filename}}));
app.use('/api',(req,res)=>res.status(404).json({error:'Route introuvable.'}));
app.use((err,req,res,next)=>{
 if(res.headersSent)return next(err);
 if(err instanceof ApiError)return res.status(err.status).json({error:err.message});
 if(err?.type==='entity.too.large')return res.status(413).json({error:'Requête trop volumineuse.'});
 if(err instanceof SyntaxError&&'body' in err)return res.status(400).json({error:'JSON invalide.'});
 if(err?.code?.startsWith?.('SQLITE_CONSTRAINT'))return res.status(409).json({error:'Opération impossible : données en conflit ou indisponibles.'});
 console.error(err);res.status(500).json({error:'Erreur interne. Veuillez réessayer.'});
});
if(require.main===module)app.listen(PORT,'0.0.0.0',()=>console.log(`American Corner on http://0.0.0.0:${PORT} (demo=${DEMO})`));
module.exports={app,db,DATA};
