/**
 * Service worker.
 *
 * Fa DELIBERATAMENTE meno di quello che saprebbe fare.
 *
 * In cache va soltanto il guscio dell'applicazione: la pagina, l'icona, il
 * manifesto. Documenti, saldi, movimenti e risposte del database sono
 * `network-only` e `no-store`. La tentazione di mettere in cache le risposte
 * per far funzionare l'app senza rete e' forte ed e' esattamente cio' che non
 * si deve fare: significherebbe lasciare copie di dati finanziari sul
 * dispositivo, fuori dal controllo dell'uscita e della cancellazione.
 *
 * Conseguenza accettata: senza rete l'app si apre ma non mostra numeri.
 * E' il comportamento corretto, non una limitazione da aggirare.
 */

const GUSCIO = "conti-guscio-v1";
const BASE = new URL("./", self.registration.scope);
const STATICI = ["./", "./index.html", "./icona.svg", "./manifest.webmanifest", "./icona-180.png"]
  .map((p) => new URL(p, BASE).pathname);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(GUSCIO)
      .then((c) => c.addAll(["./", "./icona.svg", "./manifest.webmanifest"].map((p) => new URL(p, BASE).href)))
      .catch(() => { /* se un asset manca, l'app funziona lo stesso in rete */ }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((k) => Promise.all(k.filter((x) => x !== GUSCIO).map((x) => caches.delete(x))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Tutto cio' che non e' questa origine — il database, l'archivio dei
  // documenti — passa senza che il service worker lo tocchi.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  const statico = STATICI.includes(url.pathname);
  if (!statico) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  // Il guscio: prima la rete, cosi' gli aggiornamenti arrivano subito; la
  // copia in cache serve solo quando la rete non c'e'.
  event.respondWith(
    fetch(event.request)
      .then((risposta) => {
        if (risposta.ok) {
          const copia = risposta.clone();
          caches.open(GUSCIO).then((c) => c.put(event.request, copia)).catch(() => {});
        }
        return risposta;
      })
      .catch(() => caches.match(event.request).then((hit) => hit ?? Response.error())),
  );
});

/**
 * Interruttore di sicurezza all'uscita.
 * L'applicazione manda questo messaggio quando l'utente esce: si svuotano
 * Cache Storage e IndexedDB e il service worker si disattiva.
 */
self.addEventListener("message", (event) => {
  if (event.data !== "cp:logout") return;
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) await caches.delete(k);
      if (self.indexedDB?.databases) {
        for (const db of await self.indexedDB.databases()) {
          if (db.name) self.indexedDB.deleteDatabase(db.name);
        }
      }
      await self.registration.unregister();
    })(),
  );
});
