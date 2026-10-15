/* American Corner PWA: cache the public shell only. Never cache account/API/grades/files. */
const CACHE='american-corner-public-v16-1-mobile-restore';
const SHELL=['/','/offline.html','/app.css?v=16-1-mobile-restore','/app.js?v=16-opening-logo','/launch.js?v=16-1-mobile-restore','/i18n.js?v=16-opening-logo','/build.js?v=16-1-mobile-restore','/manifest.webmanifest','/chef.webmanifest','/brand/official-logo.webp?v=13-brand','/icons/icon-192.png?v=13-brand','/icons/icon-512.png?v=13-brand','/icons/maskable-512.png?v=13-brand','/icons/apple-touch-icon.png?v=13-brand','/icons/favicon.svg?v=13-brand'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>{
  // A first installation can activate at once; an upgrade waits for explicit consent.
  if(!self.registration.active)return self.skipWaiting();
 }));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('american-corner-public-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).then(response=>response.ok?response:caches.match('/offline.html')).catch(()=>caches.match('/offline.html')));
  return;
 }
 if(!SHELL.some(item=>new URL(item,self.location.origin).pathname===url.pathname))return;
 event.respondWith(fetch(req).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)))}
  return response;
 }).catch(()=>caches.match(req).then(r=>r||caches.match(url.pathname))));
});

/* Web Push uses the platform's default notification sound; a web app cannot force audio. */
async function setUnreadBadge(value){
 try{const count=Math.max(0,Number(value)||0);if(count&&self.navigator.setAppBadge)await self.navigator.setAppBadge(count);
 else if(!count&&self.navigator.clearAppBadge)await self.navigator.clearAppBadge()}catch{/* Badging is not implemented or denied on this device. */}
}
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let message={};try{message=event.data?.json()||{}}catch{}
  const id=Number(message.id),unread=Math.max(0,Number(message.unread)||0);
  await setUnreadBadge(unread);
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows)client.postMessage({type:'AC_PUSH_COUNT',unread});
  // Always show a visible notification: iOS requires this for background Web Push.
  await self.registration.showNotification(String(message.title||'American Corner').slice(0,100),{
   body:String(message.body||'Nouvelle information disponible.').slice(0,180),
   icon:'/icons/icon-192.png?v=13-brand',badge:'/icons/icon-192.png?v=13-brand',
   tag:Number.isSafeInteger(id)&&id>0?'ac-notification-'+id:'ac-information',renotify:false,
   data:{id:Number.isSafeInteger(id)&&id>0?id:null,area:message.area==='chef'?'chef':'public'}
  });
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const id=event.notification.data?.id;
 const prefix=event.notification.data?.area==='chef'?'/chef':'/';
 const target=self.location.origin+prefix+'#notifications'+(Number.isSafeInteger(id)&&id>0?'/'+id:'');
 event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){if(new URL(client.url).origin===self.location.origin){try{await client.navigate(target);return await client.focus()}catch{/* Open a fresh PWA window if navigation was blocked. */}}}
  return self.clients.openWindow(target)
 })());
});
self.addEventListener('message',event=>{if(event.data?.type==='AC_BADGE_COUNT')event.waitUntil(setUnreadBadge(event.data.unread));if(event.data?.type==='AC_SKIP_WAITING')event.waitUntil(self.skipWaiting())});
