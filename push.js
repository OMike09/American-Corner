'use strict';
/** Web Push (VAPID), durable delivery queue. No private grade/document data in lock-screen payloads. */
const webpush=require('web-push');
module.exports=function createPush({db,one,all,run,now,fail,route,config=process.env,sender=webpush}){
 const publicKey=config.AC_VAPID_PUBLIC_KEY||'',privateKey=config.AC_VAPID_PRIVATE_KEY||'',subject=config.AC_VAPID_SUBJECT||'';
 let enabled=false,busy=false,timer=null;
 try{if(publicKey&&privateKey&&/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$|^https:\/\/[^\s/]+/.test(subject)){sender.setVapidDetails(subject,publicKey,privateKey);enabled=true}}catch(e){console.warn('Web Push désactivé : clés VAPID invalides.',e.message)}
 function init(){db.exec(`CREATE TABLE IF NOT EXISTS push_preferences(user_id INTEGER PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 1,publications_enabled INTEGER NOT NULL DEFAULT 1,results_enabled INTEGER NOT NULL DEFAULT 1,other_enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,last_test_at TEXT,FOREIGN KEY(user_id) REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS push_subscriptions(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,session_hash TEXT NOT NULL,endpoint TEXT UNIQUE NOT NULL,p256dh TEXT NOT NULL,auth TEXT NOT NULL,created_at TEXT NOT NULL,last_success_at TEXT,last_error TEXT,FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(session_hash) REFERENCES sessions(token_hash) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS push_deliveries(notification_id INTEGER NOT NULL,subscription_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT NOT NULL,sent_at TEXT,last_error TEXT,PRIMARY KEY(notification_id,subscription_id),FOREIGN KEY(notification_id) REFERENCES notifications(id),FOREIGN KEY(subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE);
 CREATE INDEX IF NOT EXISTS idx_push_queue ON push_deliveries(status,next_attempt_at);`);
  for(const name of ['publications_enabled','results_enabled','other_enabled'])if(!db.pragma('table_info(push_preferences)').some(c=>c.name===name))db.exec(`ALTER TABLE push_preferences ADD COLUMN ${name} INTEGER NOT NULL DEFAULT 1`);
  if(enabled){timer=setInterval(()=>{flush().catch(e=>console.warn('Push queue:',e.message))},30000);timer.unref();setTimeout(()=>flush().catch(()=>{}),1000).unref()}
 }
 function configured(){return enabled}
 function status(u){const pref=one('SELECT * FROM push_preferences WHERE user_id=?',u.id);return {configured:enabled,public_key:enabled?publicKey:null,enabled:pref?.enabled!==0,categories:{publications:pref?.publications_enabled!==0,results:pref?.results_enabled!==0,other:pref?.other_enabled!==0},devices:one('SELECT COUNT(*) n FROM push_subscriptions WHERE user_id=? AND session_hash IN (SELECT token_hash FROM sessions WHERE expires_at>?)',u.id,now()).n}}
 function category(type){return type==='result'?'results':['announcement','document','event'].includes(type)?'publications':'other'}
 function allowed(uid,type){const p=one('SELECT * FROM push_preferences WHERE user_id=?',uid),key=category(type)+'_enabled';return p?.enabled!==0&&p?.[key]!==0}
 function queue(notificationId,userId){const n=one('SELECT entity_type FROM notifications WHERE id=? AND user_id=?',notificationId,userId);if(!enabled||!n||!allowed(userId,n.entity_type))return;
  for(const s of all('SELECT s.id FROM push_subscriptions s JOIN sessions t ON t.token_hash=s.session_hash JOIN users u ON u.id=s.user_id WHERE s.user_id=? AND t.expires_at>? AND u.status=?',userId,now(),'active'))run('INSERT OR IGNORE INTO push_deliveries(notification_id,subscription_id,next_attempt_at) VALUES (?,?,?)',notificationId,s.id,now());
 }
 function endpointAllowed(endpoint){try{const u=new URL(endpoint);const host=u.hostname.toLowerCase();return endpoint.length<=2048&&u.protocol==='https:'&&(!u.port||u.port==='443')&&!u.username&&!u.password&&(host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||/^wns[0-9]*\.notify\.windows\.com$/.test(host))}catch{return false}}
 async function flush(){if(!enabled||busy)return;busy=true;try{
  // Mark each job as in-flight before awaiting outbound network. A crash leaves it retryable on restart.
  for(const job of all(`SELECT d.notification_id,d.subscription_id,d.attempts,n.user_id,n.title,n.body,n.entity_type,n.entity_id,n.link,s.endpoint,s.p256dh,s.auth,s.user_id subscribed_user,s.session_hash
   FROM push_deliveries d JOIN notifications n ON n.id=d.notification_id JOIN push_subscriptions s ON s.id=d.subscription_id JOIN sessions t ON t.token_hash=s.session_hash JOIN users u ON u.id=s.user_id
   LEFT JOIN push_preferences p ON p.user_id=n.user_id WHERE d.status='pending' AND d.next_attempt_at<=? AND n.user_id=s.user_id AND n.read_at IS NULL AND (p.enabled IS NULL OR p.enabled=1) AND t.expires_at>? AND u.status='active' ORDER BY d.next_attempt_at LIMIT 40`,now(),now())){
   const id=job.notification_id,sid=job.subscription_id;
   // Access may be revoked, the publication withdrawn, or a result corrected after queuing.
   const n=one('SELECT * FROM notifications WHERE id=?',id);
   if(!n||!isVisible(n)||!allowed(job.user_id,n.entity_type)) {run('UPDATE push_deliveries SET status=? WHERE notification_id=? AND subscription_id=?','cancelled',id,sid);continue}
   const unread=unreadCount(job.user_id);let sound={};try{sound=one('SELECT sound,vibration FROM notification_sound_preferences WHERE user_id=?',job.user_id)||{}}catch{/* Old isolated test fixtures have no preference table. */}
   let isPublicTitle=false;
   if(['announcement','event'].includes(job.entity_type))try{
    const scope=one('SELECT targets_json FROM share_targets WHERE entity_type=? AND entity_id=?',job.entity_type,job.entity_id);
    const targets=JSON.parse(scope?.targets_json||'[]');
    const restricted=job.entity_type==='announcement'&&one("SELECT 1 FROM publication_media WHERE announcement_id=? AND document_class IN ('student_list','results')",job.entity_id);
    isPublicTitle=targets.some(t=>t.type==='all')&&!restricted;
   }catch{/* Private titles stay generic if metadata is unavailable. */}
   const payload={id,unread,title:job.entity_type==='result'?'Résultat officiel disponible':isPublicTitle?job.body.slice(0,90):job.entity_type?'Nouvelle information American Corner':job.title,body:job.entity_type==='result'?'Ouvrez l’application pour consulter votre résultat.':job.entity_type?'Ouvrez l’application pour consulter cette publication.':job.body.slice(0,120),sound:sound.sound||'default',vibration:!!sound.vibration,url:'/#notifications/'+id,area:!!one("SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND r.name='chef'",job.user_id)?'chef':'public'};
   try{await sender.sendNotification({endpoint:job.endpoint,keys:{p256dh:job.p256dh,auth:job.auth}},JSON.stringify(payload),{TTL:86400,urgency:'normal',timeout:12000});run('UPDATE push_deliveries SET status=?,attempts=attempts+1,sent_at=?,last_error=NULL WHERE notification_id=? AND subscription_id=?','sent',now(),id,sid);run('UPDATE push_subscriptions SET last_success_at=?,last_error=NULL WHERE id=?',now(),sid)}
   catch(e){const code=Number(e.statusCode)||0,message=String(e.message||'Envoi impossible').slice(0,300);if(code===404||code===410){run('DELETE FROM push_subscriptions WHERE id=?',sid)}else{const attempts=job.attempts+1,stop=attempts>=5||code>=400&&code<500&&code!==429;run('UPDATE push_deliveries SET status=?,attempts=?,next_attempt_at=?,last_error=? WHERE notification_id=? AND subscription_id=?',stop?'failed':'pending',attempts,new Date(Date.now()+Math.min(3600000,2**attempts*30000)).toISOString(),message,id,sid);run('UPDATE push_subscriptions SET last_error=? WHERE id=?',message,sid)}}
  }
  // Discard jobs that are no longer eligible for delivery.
  run(`UPDATE push_deliveries SET status='cancelled' WHERE status='pending' AND (notification_id IN (SELECT id FROM notifications WHERE read_at IS NOT NULL) OR subscription_id NOT IN (SELECT s.id FROM push_subscriptions s JOIN sessions t ON t.token_hash=s.session_hash JOIN users u ON u.id=s.user_id WHERE t.expires_at>? AND u.status='active') OR notification_id IN (SELECT n.id FROM notifications n JOIN push_preferences p ON p.user_id=n.user_id WHERE p.enabled=0))`,now());
 }finally{busy=false}}
 // Callback supplied by server so the same access rules govern API, pushes, and the unread badge.
 let visible=()=>true;function setVisibility(fn){visible=fn}function isVisible(n){try{return visible(n)}catch{return false}}
 function unreadCount(uid){return all('SELECT * FROM notifications WHERE user_id=? AND read_at IS NULL',uid).filter(isVisible).length}
 function register(){
  route('get','/api/push/status',req=>status(req.user));
  route('post','/api/push/subscriptions',req=>{if(!enabled)fail('Push non configuré sur le serveur : clés VAPID manquantes.',503);const d=req.body||{},endpoint=d.endpoint,keys=d.keys;
   if(typeof endpoint!=='string'||!endpointAllowed(endpoint)||typeof keys?.p256dh!=='string'||typeof keys?.auth!=='string'||!/^[A-Za-z0-9_-]{50,150}$/.test(keys.p256dh)||!/^[A-Za-z0-9_-]{12,50}$/.test(keys.auth))fail('Abonnement push invalide.');
   run('INSERT INTO push_preferences(user_id,enabled,created_at,updated_at) VALUES (?,1,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=1,updated_at=excluded.updated_at',req.user.id,now(),now());
   const existing=one('SELECT id,user_id FROM push_subscriptions WHERE endpoint=?',endpoint);
   if(existing&&existing.user_id!==req.user.id)run('DELETE FROM push_subscriptions WHERE id=?',existing.id);
   run('INSERT INTO push_subscriptions(user_id,session_hash,endpoint,p256dh,auth,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,session_hash=excluded.session_hash,p256dh=excluded.p256dh,auth=excluded.auth',req.user.id,req.session.token_hash,endpoint,keys.p256dh,keys.auth,now());return {ok:true,configured:true}
  });
  route('delete','/api/push/subscriptions',req=>{const endpoint=req.body?.endpoint;if(typeof endpoint!=='string'||endpoint.length>2048)fail('Abonnement invalide.');run('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?',req.user.id,endpoint);return {ok:true}});
  route('patch','/api/push/preferences',req=>{const d=req.body||{},old=status(req.user),categories=d.categories||old.categories,active=d.enabled??old.enabled;
   if(typeof active!=='boolean'||!categories||['publications','results','other'].some(k=>typeof categories[k]!=='boolean'))fail('Préférence invalide.');
   run('INSERT INTO push_preferences(user_id,enabled,publications_enabled,results_enabled,other_enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,publications_enabled=excluded.publications_enabled,results_enabled=excluded.results_enabled,other_enabled=excluded.other_enabled,updated_at=excluded.updated_at',req.user.id,active?1:0,categories.publications?1:0,categories.results?1:0,categories.other?1:0,now(),now());
   for(const n of all('SELECT id,entity_type FROM notifications WHERE user_id=?',req.user.id))if(!allowed(req.user.id,n.entity_type))run("UPDATE push_deliveries SET status='cancelled' WHERE notification_id=? AND status='pending'",n.id);
   return status(req.user)
  });
  route('post','/api/push/test',req=>{if(!enabled)fail('Push non configuré.',503);const pref=one('SELECT last_test_at,enabled FROM push_preferences WHERE user_id=?',req.user.id);if(pref?.enabled===0||pref?.other_enabled===0)fail('Activez les autres alertes dans vos préférences avant le test.');if(pref?.last_test_at&&Date.now()-Date.parse(pref.last_test_at)<60000)fail('Attendez une minute avant un nouvel essai.',429);if(!one('SELECT 1 FROM push_subscriptions WHERE user_id=? AND session_hash=?',req.user.id,req.session.token_hash))fail('Activez les notifications sur cet appareil.');run('INSERT INTO push_preferences(user_id,enabled,created_at,updated_at,last_test_at) VALUES (?,1,?,?,?) ON CONFLICT(user_id) DO UPDATE SET last_test_at=excluded.last_test_at',req.user.id,now(),now(),now());const id=run('INSERT INTO notifications(user_id,title,body,link,created_at) VALUES (?,?,?,?,?)',req.user.id,'Test de notification','Votre appareil peut recevoir les alertes American Corner.','notifications',now()).lastInsertRowid;queue(id,req.user.id);return {id}});
 }
 return {init,register,queue,flush,status,unreadCount,setVisibility,endpointAllowed,configured};
};
