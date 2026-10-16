'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3'),webpush=require('web-push');
const createPush=require('../push');
test('durable Web Push queue delivers one generic alert per notification; badges follow server unread counts',async()=>{
 const db=new Database(':memory:');db.pragma('foreign_keys=ON');db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,status TEXT NOT NULL);CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires_at TEXT NOT NULL);CREATE TABLE roles(id INTEGER PRIMARY KEY,name TEXT);CREATE TABLE user_roles(user_id INTEGER,role_id INTEGER);CREATE TABLE notifications(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,title TEXT,body TEXT,link TEXT,read_at TEXT,created_at TEXT,entity_type TEXT,entity_id INTEGER);CREATE TABLE notification_sound_preferences(user_id INTEGER PRIMARY KEY,sound TEXT,vibration INTEGER);INSERT INTO notification_sound_preferences VALUES(1,'none',0),(2,'doux',1);INSERT INTO users VALUES(1,'active'),(2,'active');INSERT INTO roles VALUES(1,'chef');INSERT INTO user_roles VALUES(2,1);INSERT INTO sessions VALUES('session-one',1,'2099-01-01T00:00:00.000Z'),('session-two',2,'2099-01-01T00:00:00.000Z');`);
 const one=(s,...a)=>db.prepare(s).get(...a),all=(s,...a)=>db.prepare(s).all(...a),run=(s,...a)=>db.prepare(s).run(...a),now=()=>new Date().toISOString(),routes=new Map(),sent=[];
 const keys=webpush.generateVAPIDKeys(),sender={setVapidDetails(){},async sendNotification(subscription,payload){sent.push({subscription,message:JSON.parse(payload)});return {statusCode:201}}};
 const push=createPush({db,one,all,run,now,fail:(m)=>{throw Error(m)},route:(method,path,fn)=>routes.set(method+' '+path,fn),sender,config:{AC_VAPID_PUBLIC_KEY:keys.publicKey,AC_VAPID_PRIVATE_KEY:keys.privateKey,AC_VAPID_SUBJECT:'mailto:contact@example.org'}});
 push.setVisibility(n=>n.entity_type!=='withdrawn');push.init();push.register();
 const endpoint='https://fcm.googleapis.com/fcm/send/unit-test',sub={endpoint,keys:{p256dh:'A'.repeat(88),auth:'B'.repeat(22)}};
 routes.get('post /api/push/subscriptions')({user:{id:1},session:{token_hash:'session-one'},body:sub});
 const first=run('INSERT INTO notifications(user_id,title,body,link,created_at,entity_type,entity_id) VALUES (?,?,?,?,?,?,?)',1,'Note 17/20','Confidentiel','results',now(),'result',42).lastInsertRowid;
 push.queue(first,1);push.queue(first,1);await push.flush();await push.flush();
 assert.equal(sent.length,1);assert.equal(sent[0].message.unread,1);assert.equal(sent[0].message.id,first);assert.equal(sent[0].message.sound,'none');assert(!JSON.stringify(sent[0]).includes('17/20'));assert.equal(one('SELECT status FROM push_deliveries WHERE notification_id=?',first).status,'sent');
 run('UPDATE notifications SET read_at=? WHERE id=?',now(),first);assert.equal(push.unreadCount(1),0);
 const second=run('INSERT INTO notifications(user_id,title,body,link,created_at) VALUES (?,?,?,?,?)',1,'Un test','Bonjour','notifications',now()).lastInsertRowid;push.queue(second,1);await push.flush();assert.equal(sent.length,2);assert.equal(sent[1].message.unread,1);
 db.exec(`CREATE TABLE share_targets(entity_type TEXT,entity_id INTEGER,targets_json TEXT);CREATE TABLE publication_media(announcement_id INTEGER,document_class TEXT);`);
 const publicId=run('INSERT INTO notifications(user_id,title,body,link,created_at,entity_type,entity_id) VALUES (?,?,?,?,?,?,?)',1,'Nouvelle communication','Réunion publique','communications',now(),'announcement',7).lastInsertRowid;
 run('INSERT INTO share_targets(entity_type,entity_id,targets_json) VALUES (?,?,?)','announcement',7,'[{"type":"all","id":"*"}]');push.queue(publicId,1);await push.flush();assert.equal(sent.at(-1).message.title,'Réunion publique');
 run('INSERT INTO publication_media(announcement_id,document_class) VALUES (?,?)',7,'results');const privateId=run('INSERT INTO notifications(user_id,title,body,link,created_at,entity_type,entity_id) VALUES (?,?,?,?,?,?,?)',1,'Nouvelle communication','Notes privées','communications',now(),'announcement',7).lastInsertRowid;push.queue(privateId,1);await push.flush();assert.equal(sent.at(-1).message.title,'Nouvelle information American Corner');

 routes.get('patch /api/push/preferences')({user:{id:1},body:{categories:{publications:true,results:false,other:true}}});
 const filtered=run('INSERT INTO notifications(user_id,title,body,link,created_at,entity_type,entity_id) VALUES (?,?,?,?,?,?,?)',1,'Autre résultat','Confidentiel','results',now(),'result',99).lastInsertRowid;push.queue(filtered,1);await push.flush();assert.equal(sent.length,4);
 routes.get('patch /api/push/preferences')({user:{id:1},body:{enabled:false}});
 const third=run('INSERT INTO notifications(user_id,title,body,link,created_at) VALUES (?,?,?,?,?)',1,'Sans alerte','Texte','notifications',now()).lastInsertRowid;push.queue(third,1);await push.flush();assert.equal(sent.length,4);
 routes.get('post /api/push/subscriptions')({user:{id:2},session:{token_hash:'session-two'},body:sub});assert.equal(one('SELECT user_id FROM push_subscriptions WHERE endpoint=?',endpoint).user_id,2);const chiefNotice=run('INSERT INTO notifications(user_id,title,body,link,created_at) VALUES (?,?,?,?,?)',2,'Test','Message','notifications',now()).lastInsertRowid;push.queue(chiefNotice,2);await push.flush();assert.equal(sent.at(-1).message.area,'chef');assert.equal(sent.at(-1).message.sound,'doux');assert.equal(sent.at(-1).message.vibration,true);
 assert.equal(push.endpointAllowed('https://127.0.0.1/internal'),false);assert.equal(push.endpointAllowed('https://evil.com/'),false);assert.equal(push.endpointAllowed('https://web.push.apple.com/v1/test'),true);
 db.close();
});
test('service worker uses Web Push in background, badge count and secure notification deep link',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),listeners={},shown=[],opened=[],badges=[],posted=[];
 const context={URL,Number,String,Promise,console,self:{location:{origin:'https://amer-corner.oymiketech.com'},navigator:{setAppBadge:async n=>badges.push(n),clearAppBadge:async()=>badges.push(0)},registration:{showNotification:async(t,o)=>shown.push({t,o})},clients:{matchAll:async()=>[{url:'https://amer-corner.oymiketech.com/',postMessage:x=>posted.push(x),navigate:async url=>opened.push(url),focus:async()=>true}],openWindow:async url=>opened.push(url)},addEventListener:(event,fn)=>{listeners[event]=fn}},caches:{open:async()=>({addAll:async()=>{}})},fetch:async()=>({ok:true}),setTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/sw.js'),'utf8'),context);
 let done;listeners.push({data:{json:()=>({id:23,unread:3,title:'Résultat disponible',body:'Ouvrez l’application.'})},waitUntil:p=>done=p});await done;
 assert.deepEqual(badges,[3]);assert.equal(shown.length,1);assert.equal(shown[0].o.data.id,23);assert.equal(posted[0].id,23);assert.equal(posted[0].unread,3);
 let clicked;listeners.notificationclick({notification:{data:{id:23},close(){}},waitUntil:p=>clicked=p});await clicked;assert.equal(opened[0],'https://amer-corner.oymiketech.com/#notifications/23');
 let chiefPush;listeners.push({data:{json:()=>({id:24,unread:1,area:'chef'})},waitUntil:p=>chiefPush=p});await chiefPush;listeners.notificationclick({notification:{data:shown.at(-1).o.data,close(){}},waitUntil:p=>clicked=p});await clicked;assert.equal(opened.at(-1),'https://amer-corner.oymiketech.com/chef#notifications/24');
 listeners.message({data:{type:'AC_BADGE_COUNT',unread:0},waitUntil:p=>done=p});await done;assert.equal(badges.at(-1),0);
});
