self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open("libermedia-v1").then(c=>c.addAll(["/","/static/style.css","/static/script.js"])));
});
self.addEventListener("fetch", (e)=>{
  e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request)));
});
