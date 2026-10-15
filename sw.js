'use strict';
const CACHE = 'attendance-pwa-v3-20261015';
const OFFLINE = ['./index.html','./app.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(OFFLINE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('attendance-pwa-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req=event.request;
  if(req.method!=='GET' || new URL(req.url).origin!==self.location.origin) return;
  event.respondWith(fetch(req).then(res=>{
    if(res.ok){const copy=res.clone(); event.waitUntil(caches.open(CACHE).then(c=>c.put(req,copy)));}
    return res;
  }).catch(()=>caches.match(req).then(res=>res||caches.match('./index.html'))));
});
