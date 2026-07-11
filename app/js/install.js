/**
 * install.js — détection de plateforme et d'installation.
 *
 * 🔴 Contrainte NON NÉGOCIABLE n°1 (docs/veille/16-faisabilite-pwa.md §6) :
 *   l'app DOIT être installée sur l'écran d'accueil.
 *
 * Pourquoi ce n'est pas cosmétique — source primaire WebKit (2020-03-24,
 * « Full Third-Party Cookie Blocking and More ») : après 7 jours d'usage de Safari
 * sans interaction avec le site, l'ITP supprime TOUT le stockage inscriptible par
 * script (IndexedDB, localStorage, Cache, enregistrement du service worker).
 * L'exception, littérale : « Web applications added to the home screen are not part
 * of Safari and thus have their own counter of days of use. […] We do not expect the
 * first-party in such a web application to have its website data deleted. »
 *
 * → En onglet Safari : les séances peuvent disparaître.
 * → Installée : elles ne disparaissent pas toutes seules.
 * L'installation débloque aussi persist() (heuristique WebKit) et le Wake Lock.
 */

/** @returns {'ios-safari'|'ios-autre'|'android'|'desktop'} */
export function detecterPlateforme() {
  const ua = navigator.userAgent;
  // iPadOS 13+ se fait passer pour un Mac : on le démasque par le tactile.
  const estIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (estIOS) {
    // Sur iOS, TOUS les navigateurs sont WebKit, mais seul Safari peut installer une
    // PWA (MDN, « Making PWAs installable »). Chrome/Edge/Firefox iOS : impossible.
    const estAutreNavigateur = /CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(ua);
    return estAutreNavigateur ? 'ios-autre' : 'ios-safari';
  }
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/**
 * L'app tourne-t-elle en mode installé (standalone) ?
 * `navigator.standalone` est le legacy iOS ; `display-mode` est le standard.
 */
export function estInstallee() {
  const standalone =
    globalThis.matchMedia?.('(display-mode: standalone)').matches ||
    globalThis.matchMedia?.('(display-mode: fullscreen)').matches ||
    navigator.standalone === true;
  return Boolean(standalone);
}

/**
 * Le risque d'effacement automatique est-il DOCUMENTÉ pour cette plateforme ?
 * iOS : oui (règle des 7 jours de l'ITP en onglet Safari).
 * Chrome/Firefox : éviction seulement sous pression disque (LRU), et persist() peut
 * être accordé sans installation. Le risque est réel mais nettement plus faible.
 * → C'est ce qui justifie une porte BLOQUANTE sur iOS, et une porte avec issue ailleurs.
 */
export const risqueEffacementAuto = () => detecterPlateforme().startsWith('ios');

// ══════════════════════════════════════════════════════════════════════════
// 🔴 DEUX PLATEFORMES, DEUX RÉGIMES — et l'app ne doit pas raconter iOS à
//    quelqu'un qui est sur Android.
// ══════════════════════════════════════════════════════════════════════════
//
// Toute l'architecture de cette app a été pensée contre WebKit. Résultat : ses
// textes parlaient d'iOS, de Safari et de « quelques jours sans usage » — À TOUT
// LE MONDE. Un utilisateur Android lisait « c'est une limite d'iOS » sur un
// téléphone qui n'est pas un iPhone, et « installe-la depuis Safari » sur un
// téléphone qui n'a pas Safari. Ce n'est pas un détail de copie : c'est une app
// qui a l'air cassée, ou qui a l'air de ne pas être pour lui.
//
// ── Ce qui est VRAI, plateforme par plateforme ──────────────────────────────
//
// iOS / WebKit : purge par INACTIVITÉ. 7 jours d'usage de Safari sans visiter le
//   site → tout le stockage scriptable est supprimé (WebKit, 2020-03-24).
//   L'installation sur l'écran d'accueil en exempte. C'est une règle de temps.
//
// Android / Chrome : AUCUNE purge par inactivité. Le Storage Standard ne définit
//   qu'une ÉVICTION SOUS PRESSION DE STOCKAGE : quand le disque se remplit, le
//   navigateur évince les origines `best-effort`, la moins récemment utilisée
//   d'abord. Une origine `persistent` n'est PAS évincée. C'est une règle de PLACE.
//   → La menace n'est donc pas « tu n'as pas ouvert l'app depuis 8 jours »,
//     c'est « ton téléphone est plein ». Et un téléphone plein, ça arrive.
//
// ⚠️ Ce que ça change pour l'utilisateur : sur Android, le danger ne se voit pas
//    venir. Sur iOS, il suffit d'ouvrir l'app pour remettre le compteur à zéro ;
//    sur Android, on ne peut RIEN faire à part obtenir `persist()`. D'où le fait
//    qu'on insiste au moins autant, et pas moins.
//
// Sources : WebKit « Full Third-Party Cookie Blocking and More » (2020-03-24) ·
//           Storage Standard (WHATWG) §« Storage pressure », §« Persistence ».

/**
 * Le régime de stockage de CETTE plateforme, et les textes qui vont avec.
 * Un seul endroit décide de ce qu'on raconte — sinon les écrans divergent.
 *
 * @returns {{
 *   purgeParInactivite: boolean, evictionSousPression: boolean,
 *   menaceNonInstallee: string, commentInstaller: string,
 *   noteNonProtege: string, sansWakeLock: string,
 * }}
 */
export function regimeStockage() {
  const p = detecterPlateforme();

  if (p === 'ios-safari' || p === 'ios-autre') {
    return {
      purgeParInactivite: true,
      evictionSousPression: true,
      menaceNonInstallee:
        "Le revers : <b>tant que l'app n'est pas installée sur ton écran d'accueil, ton iPhone peut " +
        "effacer tes séances tout seul</b> s'il ne la voit pas pendant quelques jours. " +
        "Une fois installée, il ne le fait plus.",
      commentInstaller:
        "Sur iPhone, une app non installée <b>perd ses données</b> après quelques jours sans usage. " +
        "Installe-la depuis Safari : Partager → « Sur l'écran d'accueil ».",
      noteNonProtege:
        "Le navigateur <b>peut effacer tes séances</b> s'il manque de place, ou si tu n'ouvres pas " +
        "l'app pendant quelques jours.",
      sansWakeLock:
        "<b>Garde l'app ouverte pendant le repos.</b> Ton iPhone ne permet pas de garder l'écran " +
        "allumé (il faut iOS 18.4 ou plus). Le chrono reste juste, mais il ne sonnera pas écran éteint.",
    };
  }

  if (p === 'android') {
    return {
      purgeParInactivite: false, // 🔴 la règle des 7 jours N'EXISTE PAS ici
      evictionSousPression: true,
      menaceNonInstallee:
        "Le revers : <b>Android peut effacer tes séances quand la mémoire du téléphone devient " +
        "pleine</b>. Il ne prévient pas, et il commence par les sites qu'il juge les moins " +
        "importants. <b>Installer l'app est ce qui lui dit de ne pas y toucher.</b>",
      commentInstaller:
        "Sur Android, une app non installée peut <b>perdre ses données quand le téléphone manque " +
        "de place</b>. Installe-la depuis le menu <b>⋮</b> de Chrome → « Installer l'application ». " +
        "C'est ce qui débloque la protection du stockage.",
      noteNonProtege:
        "Le navigateur <b>peut effacer tes séances quand ton téléphone manque de place</b>. " +
        "Ce n'est pas une question de temps : tu peux ouvrir l'app tous les jours et les perdre " +
        "quand même. Installe l'app, puis protège le stockage.",
      sansWakeLock:
        "<b>Garde l'app ouverte pendant le repos.</b> Ton téléphone ne permet pas de garder l'écran " +
        "allumé. Le chrono reste juste, mais il ne sonnera pas écran éteint.",
    };
  }

  return {
    purgeParInactivite: false,
    evictionSousPression: true,
    menaceNonInstallee:
      "Le revers : <b>tant que l'app n'est pas installée, le navigateur peut effacer tes séances</b> " +
      "s'il manque de place sur le disque. Une fois installée, il ne le fait plus.",
    commentInstaller:
      "Sur ordinateur, le navigateur peut effacer les données d'un site quand le disque se remplit. " +
      "Installe l'app depuis la barre d'adresse, ou exporte régulièrement.",
    noteNonProtege:
      "Le navigateur <b>peut effacer tes séances</b> s'il manque de place sur le disque.",
    sansWakeLock:
      "<b>Garde l'app ouverte pendant le repos.</b> Ce navigateur ne permet pas de garder l'écran " +
      "allumé. Le chrono reste juste, mais il ne sonnera pas écran éteint.",
  };
}

/**
 * Capture `beforeinstallprompt` (Chrome/Edge/Android — n'existe PAS sur iOS).
 * Doit être appelé le plus tôt possible : l'événement se déclenche au chargement.
 */
let promptDiffere = null;
const abonnes = new Set();

export function surveillerInstallabilite(callback) {
  abonnes.add(callback);
  callback(Boolean(promptDiffere));
  return () => abonnes.delete(callback);
}

globalThis.addEventListener?.('beforeinstallprompt', (e) => {
  e.preventDefault(); // on déclenchera le prompt nous-mêmes, depuis notre bouton
  promptDiffere = e;
  for (const cb of abonnes) cb(true);
});

globalThis.addEventListener?.('appinstalled', () => {
  promptDiffere = null;
  for (const cb of abonnes) cb(false);
});

/** L'installation native est-elle proposable (Chrome/Android/desktop) ? */
export const promptInstallDisponible = () => Boolean(promptDiffere);

/**
 * Déclenche le prompt natif d'installation. À appeler sur un geste utilisateur.
 * @returns {Promise<'accepted'|'dismissed'|'indisponible'>}
 */
export async function declencherInstall() {
  if (!promptDiffere) return 'indisponible';
  const evt = promptDiffere;
  promptDiffere = null;
  for (const cb of abonnes) cb(false);
  evt.prompt();
  const { outcome } = await evt.userChoice;
  return outcome;
}
