const CACHE_NAME="fanta-agente-v1.11";
const APP_SHELL=[
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install",event=>{
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL))
  )
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>
      Promise.all(
        keys
          .filter(key=>key.startsWith("fanta-agente-") && key!==CACHE_NAME)
          .map(key=>caches.delete(key))
      )
    ).then(()=>self.clients.claim())
  )
});

async function networkFirst(request){
  try{
    const response=await fetch(request);
    if(response && response.ok){
      const cache=await caches.open(CACHE_NAME);
      cache.put(request,response.clone());
    }
    return response
  }catch(err){
    const cached=await caches.match(request);
    if(cached)return cached;

    if(request.mode==="navigate"){
      return caches.match("./index.html")
    }

    throw err
  }
}

async function staleWhileRevalidate(request){
  const cache=await caches.open(CACHE_NAME);
  const cached=await cache.match(request);

  const networkPromise=fetch(request)
    .then(response=>{
      if(response && response.ok){
        cache.put(request,response.clone())
      }
      return response
    })
    .catch(()=>null);

  return cached || networkPromise
}

self.addEventListener("fetch",event=>{
  const request=event.request;

  if(request.method!=="GET")return;

  const url=new URL(request.url);
  const sameOrigin=url.origin===self.location.origin;

  if(request.mode==="navigate"){
    event.respondWith(networkFirst(request));
    return
  }

  if(
    sameOrigin &&
    (
      url.pathname.includes("/database/") ||
      url.pathname.includes("/backup/")
    )
  ){
    event.respondWith(networkFirst(request));
    return
  }

  if(sameOrigin){
    event.respondWith(staleWhileRevalidate(request));
    return
  }

  // CDN / risorse esterne: prova rete, poi cache runtime se disponibile.
  event.respondWith(
    caches.match(request).then(cached=>{
      const fetchPromise=fetch(request)
        .then(response=>{
          if(response && response.ok){
            caches.open(CACHE_NAME).then(cache=>cache.put(request,response.clone()))
          }
          return response
        })
        .catch(()=>cached);

      return cached || fetchPromise
    })
  )
});
