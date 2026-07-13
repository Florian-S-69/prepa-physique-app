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

const VERSION = 'v8';
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

  // 🔴 L'écran de séance. C'est LE moment où l'app sert : en salle, en sous-sol,
  // hors ligne. Un de ces deux modules absent du précache, et le geste central
  // du produit ne s'ouvre pas — exactement quand on en a besoin.
  './js/seance.js',
  './js/ecran-seance.js',

  // 🏃 La course. On logue une sortie de trail le dimanche, dans une vallée, sans réseau —
  // exactement le moment où le précache sert. `ecran-seance.js` les importe : absents du
  // shell, le module principal échoue à s'évaluer et l'accueil ne s'ouvre plus du tout.
  './js/course.js',
  './js/ecran-course.js',

  // 🔴 LE RPE DE SÉANCE — la question, l'échelle, le « pourquoi ». Il est importé par les DEUX
  // écrans (salle et route) : absent du shell, ni la séance ni la course ne s'ouvrent hors ligne.
  './js/rpe.js',
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
  // `motion.*` et `sheet.js` font monter la feuille (le « pourquoi » derrière un
  // tap) et donnent le retour de press sur iOS. Sans eux en cache, la feuille ne
  // s'ouvre plus hors ligne — et c'est là que TOUTE la transparence du produit vit.
  '../design/tokens.css',
  '../design/states.css',
  '../design/motion.css',
  '../design/motion.js',
  '../design/sheet.js',

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

  // `avis.js` : le moteur y rend ses décisions en DONNÉES (l'essentiel, le
  // pourquoi, la source — séparés). C'est ce que l'écran de séance affiche
  // derrière un tap. Absent du cache → pas d'écran de séance hors ligne.
  '../src/lib/avis.js',

  // ══════════════════════════════════════════════════════════════════════
  // 🔴 LES DOUZE MODULES QUI MANQUAIENT — L'OFFLINE NE TENAIT QUE PAR CHANCE
  // ══════════════════════════════════════════════════════════════════════
  //
  // Le jour où la boucle a été refermée (2026-07-12), `moteur.js` s'est mis à importer
  // `journal.js` et `adaptation.js` — qui tirent avec eux `charge.js`, `vdot.js`,
  // `running.js`, `records.js`, `objectif.js`, `performances.js`, `distances.js`,
  // `red-s.js`, `mode.js`, `angles-morts.js`. **Aucun n'a été ajouté ici.**
  //
  // Et rien ne l'a vu, parce que **le garde-fou ne regardait que dans un sens** : la règle
  // R7 vérifie que tout ce qui est DÉCLARÉ ici existe dans `dist/`. Elle ne vérifiait pas
  // que tout ce que l'app IMPORTE est déclaré ici. Une porte gardée d'un seul côté.
  //
  // Ce que ça coûtait : `cache.addAll` est **atomique** et il réussissait — sur un shell
  // à trous. L'app ne s'ouvrait hors ligne que si le `stale-while-revalidate` avait déjà
  // avalé ces douze fichiers lors d'un chargement ANTÉRIEUR **contrôlé par le SW**. Ça
  // finit par arriver, donc ça « marchait ». **Une garantie qui repose sur la chance n'est
  // pas une garantie** — et le jour où elle tombe, elle tombe en salle, en sous-sol, au
  // seul moment où l'app sert.
  //
  // → Le garde-fou manquant est désormais un TEST (`tests/build.test.js`) : la fermeture
  //   transitive des imports de `app/js/main.js` DOIT être incluse dans ce tableau.
  '../src/lib/journal.js',
  '../src/lib/adaptation.js',
  '../src/lib/charge.js',
  '../src/lib/vdot.js',
  '../src/lib/performances.js',
  '../src/lib/distances.js',
  '../src/lib/running.js',
  '../src/lib/red-s.js',
  '../src/lib/records.js',
  '../src/lib/objectif.js',
  '../src/lib/angles-morts.js',
  '../src/lib/mode.js',

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
