/* American Corner PWA: cache the public shell only. Never cache account/API/grades/files. */
const CACHE='american-corner-public-v1';
const SHELL=['/','/offline.html','/app.css','/app.js','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png','/icons/apple-touch-icon.png','/icons/favicon.svg'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
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
 if(!SHELL.includes(url.pathname))return;
 event.respondWith(fetch(req).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)))}
  return response;
 }).catch(()=>caches.match(req)));
});
