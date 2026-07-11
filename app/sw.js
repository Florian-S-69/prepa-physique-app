/**
 * sw.js — service worker : l'app s'ouvre SANS RÉSEAU.
 *
 * Ce n'est pas un confort : c'est une app de salle de sport. Sous-sol, 3G morte,
 * mode avion. Si l'app ne s'ouvre pas hors ligne, elle ne sert à rien.
 *
 * ── Le piège du SW (docs/veille/16-faisabilite-pwa.md §3.5) ──────────────
 * Le cache qui sert éternellement une vieille version. Parade ici :
 *   1. `CACHE` est VERSIONNÉ → bump `VERSION` à chaque déploiement ;
 *   2. pas de `skipWaiting()` automatique — le nouveau SW attend, l'app affiche
 *      « nouvelle version disponible », et c'est l'utilisateur qui décide ;
 *   3. `activate` purge tous les caches d'une autre version.
 *
 * ⚠️ Rappel : l'enregistrement du SW et son cache font partie du stockage purgé par
 * l'ITP en onglet Safari. Encore une raison d'exiger l'installation (install.js).
 *
 * Portée : `/app/`. Un SW intercepte toutes les sous-ressources des pages qu'il
 * contrôle — y compris hors de sa portée (`../design/*.css`), qui n'est qu'une
 * portée de CONTRÔLE DE PAGES, pas d'interception d'URL.
 */

const VERSION = 'v4';
const CACHE = `pp-shell-${VERSION}`;

/** Le shell : tout ce qu'il faut pour que l'app démarre hors ligne. */
const SHELL = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/db.js',
  './js/storage.js',
  './js/backup.js',
  './js/timer.js',
  './js/install.js',
  './js/ui.js',
  './js/moteur.js',
  './js/programme.js',
  './js/valeurs.js',
  './js/amorce.js',
  './fonts/fonts.css',
  './fonts/hanken-grotesk-latin.woff2',
  './fonts/hanken-grotesk-latin-ext.woff2',
  './fonts/jetbrains-mono-latin.woff2',
  './fonts/jetbrains-mono-latin-ext.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',

  // Le design system, point de vérité unique — on ne le duplique pas, on le cache.
  '../design/tokens.css',
  '../design/states.css',

  // 🔴 LE MOTEUR. On le cache, on ne le copie pas : `src/lib/` reste la source
  // unique de vérité, et c'est ce même fichier que les 129 tests couvrent.
  // Le SW intercepte les URL hors de sa portée (`/app/`) — la portée limite les
  // PAGES contrôlées, pas les URL interceptées. Vérifié à l'incrément 1.
  '../src/lib/personne.js',
  '../src/lib/exercices.js',
  '../src/lib/muscu.js',
  '../src/lib/limitations.js',
  // Arrivés avec le merge du 2026-07-11. Un module de moteur absent d'ici, c'est une
  // app qui marche en ligne et qui MEURT en salle : `import` échoue, aucun programme.
  // C'est précisément le hors-ligne qui casserait — le seul moment où elle sert.
  '../src/lib/echauffement.js',
  '../src/lib/placement.js',
  '../src/lib/denivele.js',
  '../src/lib/cadence.js',

  // Les données. `exercises.json` (848 Ko, free-exercise-db, domaine public) est
  // le référentiel : sans lui, pas de programme. Il est gros MAIS téléchargé une
  // seule fois, puis servi depuis le cache — donc en salle, en sous-sol, hors ligne.
  '../data/exercises.json',

  // ⛔ Le persona de développement n'est PAS précaché : ce sont des données de
  //    santé réelles, et ce n'est qu'une amorce — lue une seule fois puis
  //    recopiée dans IndexedDB. À partir du 2e démarrage l'app n'en a plus
  //    besoin. Dans l'app PUBLIÉE il n'existe pas du tout : le build remplace
  //    `js/amorce.js` par un stub `null` (voir tools/manifeste.mjs).
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      // `addAll` est atomique : si UN fichier manque, l'install échoue et l'ancien SW
      // reste en place. C'est ce qu'on veut — mieux vaut l'ancienne version qu'un
      // shell à trous.
      cache.addAll(SHELL),
    ),
  );
  // Pas de skipWaiting() ici : voir l'en-tête.
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const noms = await caches.keys();
      await Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/** L'app demande explicitement à passer à la nouvelle version. */
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'VERSION') e.source?.postMessage({ type: 'VERSION', version: VERSION });
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // rien de tiers : l'app est autonome

  // ⛔ Les personas ne rentrent PAS dans le cache. Ce sont des données de santé
  // réelles, et ce n'est qu'une amorce : elle est lue UNE fois puis vit dans
  // IndexedDB. La cacher en ferait une deuxième copie, dans un stockage qu'on
  // n'a aucune raison de peupler. Sans ce garde-fou, le stale-while-revalidate
  // ci-dessous l'avalerait silencieusement.
  if (url.pathname.includes('/data/personas/')) return;

  // Navigation : on sert TOUJOURS le shell depuis le cache (réseau = 0 attente en salle).
  if (request.mode === 'navigate') {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match('./index.html')) ?? (await fetch(request));
      })(),
    );
    return;
  }

  // Sous-ressources : cache d'abord, revalidation en arrière-plan (stale-while-revalidate).
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const enCache = await cache.match(request);

      const reseau = fetch(request)
        .then((rep) => {
          if (rep.ok && rep.type === 'basic') cache.put(request, rep.clone());
          return rep;
        })
        .catch(() => null);

      if (enCache) {
        e.waitUntil(reseau); // on rafraîchit sans faire attendre l'utilisateur
        return enCache;
      }
      const rep = await reseau;
      if (rep) return rep;
      return new Response('Hors ligne, et cette ressource n’est pas en cache.', {
        status: 504,
        statusText: 'Hors ligne',
      });
    })(),
  );
});
