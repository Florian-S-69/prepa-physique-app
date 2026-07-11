/**
 * main.js — le câblage de la coquille.
 *
 * Ce que fait ce fichier, et rien d'autre :
 *   1. enregistre le service worker (offline) et gère la mise à jour ;
 *   2. tient la PORTE d'installation (contrainte n°1) ;
 *   3. rend l'écran « Mes données » : persist() + quota réel (contrainte n°2) ;
 *   4. branche l'export / import JSON + le rappel (contrainte n°3) ;
 *   5. fait vivre le chrono de repos par timestamps (contrainte n°4).
 *
 *   6. ✅ branche LE MOTEUR (`src/lib/*.js`) sur l'écran « Programme » — via
 *      js/moteur.js, qui l'IMPORTE (il ne le copie pas).
 *
 * ⛔ Ce qu'il ne fait PAS ENCORE : le **log de séance** (le geste des 6×/semaine).
 *    La piste design le refond — bouton d'action ancré, chrono armé au même tap.
 *    On l'intégrera après, pour ne pas construire sur une UI qui bouge.
 */

import { $, $$, afficherEcran, toast, formaterDate } from './ui.js';
import { ouvrirDB, lireMeta, ecrireMeta } from './db.js';
import { afficherProgramme } from './programme.js';
import { chargerPersona, reamorcerPersona, amorceDisponible } from './moteur.js';
import { demanderPersistance, estPersistant, estimerQuota, formaterOctets } from './storage.js';
import {
  detecterPlateforme,
  estInstallee,
  risqueEffacementAuto,
  regimeStockage,
  surveillerInstallabilite,
  declencherInstall,
} from './install.js';
import {
  exporterJSON,
  importerJSON,
  partagerExport,
  partageFichierDisponible,
  etatSauvegarde,
  libelleSauvegarde,
  SEUIL_RAPPEL_JOURS,
} from './backup.js';
import {
  restaurerChrono,
  lireChrono,
  demarrerChrono,
  arreterChrono,
  ajusterChrono,
  doitSignalerFin,
  formaterChrono,
  amorcerAudio,
  bip,
  garderEcranAllume,
  libererEcran,
  reprendreWakeLockSiBesoin,
  wakeLockSupporte,
  ecranVerrouille,
} from './timer.js';

const PLATEFORME = detecterPlateforme();
/** 🔴 Ce que le stockage de CETTE plateforme fait vraiment (iOS ≠ Android). */
const REGIME = regimeStockage();

// ══════════════════════════════════════════════════════════════════════
// 1. SERVICE WORKER — l'app doit s'ouvrir sans réseau
// ══════════════════════════════════════════════════════════════════════

async function enregistrerSW() {
  if (!('serviceWorker' in navigator)) {
    // Pas de SW (Safari en navigation privée, contexte non sécurisé…) : l'app marche
    // encore, mais pas hors ligne. On le dit plutôt que de faire semblant.
    banniere('offline-ko', 'info', "Ce navigateur ne permet pas le mode hors ligne. L'app aura besoin du réseau pour s'ouvrir.");
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });

    // Une nouvelle version est prête et attend : on ne l'impose pas, on la propose.
    const surNouvelle = (worker) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          proposerMiseAJour(reg);
        }
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) proposerMiseAJour(reg);
    surNouvelle(reg.installing);
    reg.addEventListener('updatefound', () => surNouvelle(reg.installing));

    // Le nouveau SW a pris la main → on recharge une seule fois.
    let recharge = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recharge) return;
      recharge = true;
      location.reload();
    });

    // Version affichée dans « Mes données » : c'est le SW qui fait foi.
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'VERSION') $('#txt-version').textContent = e.data.version;
    });
    navigator.serviceWorker.controller?.postMessage({ type: 'VERSION' });
  } catch (e) {
    banniere('offline-ko', 'erreur', `Le mode hors ligne n'a pas pu s'activer (${e.message}).`);
  }
}

function proposerMiseAJour(reg) {
  banniere(
    'maj',
    'info',
    '<b>Nouvelle version disponible.</b> Tes données ne bougent pas.',
    'Mettre à jour',
    () => reg.waiting?.postMessage({ type: 'SKIP_WAITING' }),
  );
}

// ── Bandeaux (haut d'écran, non bloquants) — `.banner` vient de states.css ──
function banniere(id, ton, htmlMessage, libelleAction, action) {
  const zone = $('#bannieres');
  zone.querySelector(`[data-banniere="${id}"]`)?.remove();

  const div = document.createElement('div');
  div.className = `banner${ton === 'erreur' ? ' banner--error' : ''}`;
  div.dataset.banniere = id;

  const icone = document.createElement('span');
  icone.className = 'banner-icon';
  icone.setAttribute('aria-hidden', 'true');
  icone.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>';

  const txt = document.createElement('span');
  txt.innerHTML = htmlMessage; // messages internes uniquement, jamais d'entrée utilisateur

  div.append(icone, txt);
  if (libelleAction && action) {
    const btn = document.createElement('button');
    btn.className = 'banner-action';
    btn.textContent = libelleAction;
    btn.addEventListener('click', action);
    div.append(btn);
  }
  zone.append(div);
}

const retirerBanniere = (id) => $(`[data-banniere="${id}"]`)?.remove();

// ══════════════════════════════════════════════════════════════════════
// 2. LA PORTE — installation obligatoire (contrainte n°1)
// ══════════════════════════════════════════════════════════════════════

const CLE_PORTE_FRANCHIE = 'porteFranchie';

async function tenirLaPorte() {
  if (estInstallee()) {
    await ecrireMeta('installeeLe', await lireMeta('installeeLe', new Date().toISOString()));
    ouvrirApp();
    return;
  }

  // 🔴 Sur iOS, la porte est SANS ISSUE : la purge des données y est documentée
  // (WebKit 2020-03-24). Ailleurs, l'éviction n'a lieu que sous pression disque et
  // persist() peut être accordé sans installation → une issue de secours est légitime,
  // à condition d'être explicite sur ce qu'elle coûte.
  const sansIssue = risqueEffacementAuto();
  if (!sansIssue && (await lireMeta(CLE_PORTE_FRANCHIE, false))) {
    ouvrirApp();
    avertirNonInstallee();
    return;
  }

  // 🔴 La menace n'est pas la même des deux côtés — on dit CELLE de son téléphone.
  //    Avant, la porte annonçait la règle des 7 jours d'iOS à un utilisateur Android :
  //    fausse chez lui, et elle passait sous silence la vraie (le téléphone plein).
  $('#porte-menace').innerHTML = REGIME.menaceNonInstallee;

  $('#etapes-ios').hidden = PLATEFORME !== 'ios-safari';
  $('#etapes-ios-autre').hidden = PLATEFORME !== 'ios-autre';
  $('#etapes-desktop').hidden = PLATEFORME !== 'desktop';
  $('#btn-continuer-quand-meme').hidden = sansIssue;
  $('#porte').hidden = false;

  // Android / desktop Chromium : on peut déclencher le vrai prompt d'installation.
  // iOS n'expose AUCUNE API pour ça — d'où les instructions manuelles ci-dessus.
  surveillerInstallabilite((dispo) => {
    if (PLATEFORME === 'ios-safari' || PLATEFORME === 'ios-autre') return;
    $('#btn-installer').hidden = !dispo;
    $('#etapes-android').hidden = !(PLATEFORME === 'android' && dispo);
    $('#etapes-android-manuel').hidden = !(PLATEFORME === 'android' && !dispo);
  });

  $('#btn-installer').addEventListener('click', async () => {
    const issue = await declencherInstall();
    if (issue === 'accepted') {
      toast("App installée. Ouvre-la depuis son icône pour continuer.", 'succes');
    } else if (issue === 'dismissed') {
      toast("Installation annulée. Tes données ne seront pas protégées.", 'erreur');
    }
  });

  $('#btn-verifier').addEventListener('click', () => {
    if (estInstallee()) {
      $('#porte').hidden = true;
      ouvrirApp();
    } else {
      toast(
        PLATEFORME.startsWith('ios')
          ? "Pas encore installée. Ouvre l'app depuis son icône sur l'écran d'accueil, pas depuis Safari."
          : "Pas encore installée. Ouvre l'app depuis son icône.",
        'erreur',
      );
    }
  });

  $('#btn-continuer-quand-meme').addEventListener('click', async () => {
    await ecrireMeta(CLE_PORTE_FRANCHIE, true);
    $('#porte').hidden = true;
    ouvrirApp();
    avertirNonInstallee();
  });

  // L'installation peut survenir pendant que la porte est affichée.
  globalThis.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
    if (e.matches) {
      $('#porte').hidden = true;
      ouvrirApp();
    }
  });
}

const avertirNonInstallee = () =>
  banniere(
    'non-installee',
    'erreur',
    "<b>App non installée.</b> Tes données peuvent être effacées par le navigateur. Exporte-les régulièrement.",
  );

// ══════════════════════════════════════════════════════════════════════
// 3. ÉCRAN « MES DONNÉES » — persist() + quota (contrainte n°2)
// ══════════════════════════════════════════════════════════════════════

async function rendreStockage() {
  const persistant = await estPersistant();
  const pastille = $('#pastille-persist');
  const txt = $('#txt-persist');
  const note = $('#note-persist');
  const btn = $('#btn-persist');

  if (persistant === null) {
    pastille.dataset.etat = 'ko';
    txt.textContent = 'Impossible à vérifier';
    note.textContent =
      "Ce navigateur n'expose pas l'état du stockage. Considère que tes données ne sont pas protégées : exporte-les.";
    btn.hidden = true;
  } else if (persistant) {
    pastille.dataset.etat = 'ok';
    txt.textContent = 'Protégé';
    note.innerHTML =
      "Le navigateur n'effacera pas tes séances tout seul. Il les effacera quand même si <b>tu</b> supprimes l'app ou les données de sites — d'où l'export.";
    btn.hidden = true;
    retirerBanniere('persist-ko');
  } else {
    pastille.dataset.etat = 'ko';
    txt.textContent = 'Non protégé';
    // 🔴 Sur Android, l'éviction ne vient PAS de l'inactivité mais de la place qui manque.
    // Dire « si tu n'ouvres pas l'app pendant un moment » y serait faux — et pire, ça
    // laisserait croire qu'ouvrir l'app suffit à se protéger. Ça ne suffit pas.
    note.innerHTML = REGIME.noteNonProtege;
    btn.hidden = false;
    banniere(
      'persist-ko',
      'erreur',
      '<b>Stockage non protégé.</b> Tes séances peuvent être effacées.',
      'Protéger',
      () => naviguer('donnees'), // `naviguer`, pas `afficherEcran` : sinon le retour d'Android ne ramène pas
    );
  }

  // persist() doit être demandé sur un GESTE UTILISATEUR (Firefox affiche un prompt).
  btn.onclick = async () => {
    const { accorde, raison } = await demanderPersistance();
    toast(raison, accorde ? 'succes' : 'erreur'); // on affiche le VRAI retour de l'API
    await rendreStockage();
  };

  // Installation — état réel, affiché sans fard.
  const installee = estInstallee();
  $('#pastille-install').dataset.etat = installee ? 'ok' : 'ko';
  $('#txt-install').textContent = installee ? "Installée sur l'écran d'accueil" : 'Ouverte dans le navigateur';
  // 🔴 Ce texte disait « Installe-la depuis Safari » — À TOUT LE MONDE. Sur un Android,
  // il envoyait l'utilisateur ouvrir un navigateur qui n'existe pas sur son téléphone.
  $('#note-install').innerHTML = installee
    ? "C'est ce qui permet au téléphone de garder tes données, et à l'écran de rester allumé pendant les repos."
    : REGIME.commentInstaller;
}

/**
 * Le profil que le moteur consomme. Il vit dans IndexedDB — pas dans le code, pas
 * dans un fichier. C'est ce qui permettra à l'onboarding de le remplacer sans
 * toucher une ligne de moteur.
 */
async function rendreProfil() {
  const pastille = $('#pastille-profil');
  const txt = $('#txt-profil');
  const note = $('#note-profil');

  try {
    const { persona, amorce } = await chargerPersona();

    // 🔴 Aucun profil : le cas NORMAL d'une app publiée (le persona de dev n'est
    // pas publié — voir amorce.js). Un utilisateur neuf n'est pas une anomalie :
    // pastille neutre, pas rouge, et on lui dit quoi faire.
    if (!persona) {
      pastille.dataset.etat = 'inconnu';
      txt.textContent = 'Aucun profil';
      note.innerHTML =
        'Le moteur a besoin de savoir qui tu es pour programmer quoi que ce soit. ' +
        '<b>Importe une sauvegarde</b> (ci-dessous) — ou attends l’onboarding, qui te posera les questions.';
      return;
    }

    const lim = persona.muscu?.limitations ?? [];
    const actives = lim.filter((l) => l.statut === 'ACTIF').length;

    pastille.dataset.etat = 'ok';
    txt.textContent = persona.nom;
    note.innerHTML =
      `${persona.profil.age} ans · ${persona.profil.poids_kg} kg · ${persona.muscu.niveau} · ` +
      `<b>${lim.length} limitation${lim.length > 1 ? 's' : ''} déclarée${lim.length > 1 ? 's' : ''}</b>` +
      `${actives ? ` (dont <b>${actives} ACTIVE${actives > 1 ? 'S' : ''}</b>)` : ''}.<br>` +
      (amorce
        ? "Ce profil vient d'être <b>amorcé depuis le dépôt</b> : il est maintenant dans ta base, sur cet appareil. "
        : 'Ce profil est lu <b>dans ta base</b>, sur cet appareil. ') +
      "L'onboarding le remplacera — le moteur, lui, ne changera pas.";
  } catch (e) {
    // Là, en revanche, quelque chose a VRAIMENT échoué (base illisible, persona
    // corrompu). On le dit comme une erreur, parce que c'en est une.
    pastille.dataset.etat = 'ko';
    txt.textContent = 'Profil illisible';
    note.textContent = e.message;
  }
}

async function rendreQuota() {
  const est = await estimerQuota();
  if (!est) {
    $('#quota-valeur').textContent = '—';
    $('#note-quota').textContent = "Ce navigateur ne dit pas combien de place il t'accorde.";
    return;
  }
  $('#quota-valeur').textContent = formaterOctets(est.utilise);
  $('#quota-sur').textContent = `sur ${formaterOctets(est.quota)} disponibles`;
  $('#quota-jauge').style.width = `${Math.max(0.5, Math.min(100, est.pct))}%`;
  const pct = est.pct.toFixed(est.pct < 1 ? 2 : 0).replace('.', ',');
  $('#note-quota').textContent =
    est.pct < 50
      ? `Tu utilises ${pct} % de ton quota. Une séance de muscu pèse 1 à 3 Ko : la place n'est pas un problème.`
      : `Tu utilises ${pct} % de ton quota. Pense à exporter et faire du ménage.`;
}

// ══════════════════════════════════════════════════════════════════════
// 4. EXPORT / IMPORT (contrainte n°3) — le seul backend, c'est l'utilisateur
// ══════════════════════════════════════════════════════════════════════

async function rendreSauvegarde() {
  const etat = await etatSauvegarde();
  const txt = $('#txt-sauvegarde');
  txt.textContent = libelleSauvegarde(etat);
  if (etat.date) txt.textContent += ` (${formaterDate(etat.date)})`;

  if (etat.aRappeler && !etat.jamais) {
    banniere(
      'sauvegarde',
      'info',
      `<b>${libelleSauvegarde(etat)}</b> Un export prend 3 secondes.`,
      'Exporter',
      () => {
        naviguer('donnees'); // idem : le retour doit ramener au programme
        $('#btn-export').click();
      },
    );
  } else {
    retirerBanniere('sauvegarde');
  }
}

function brancherSauvegarde() {
  $('#btn-export').addEventListener('click', async () => {
    try {
      const { nom, octets, lignes } = await exporterJSON();
      toast(`${nom} — ${lignes} entrée(s), ${formaterOctets(octets)}. Garde ce fichier ailleurs que sur ce téléphone.`, 'succes');
      await rendreSauvegarde();
      await rendreQuota();
    } catch (e) {
      toast(`L'export a échoué : ${e.message}`, 'erreur');
    }
  });

  // Web Share Level 2 (iOS 15+/Android) : envoyer l'export vers iCloud Drive, Mail…
  // C'est ce qui rend la sauvegarde réellement HORS de l'appareil.
  const btnPartager = $('#btn-partager');
  btnPartager.hidden = !partageFichierDisponible();
  btnPartager.addEventListener('click', async () => {
    try {
      await partagerExport();
      await rendreSauvegarde();
    } catch (e) {
      if (e.name !== 'AbortError') toast(`Le partage a échoué : ${e.message}`, 'erreur');
    }
  });

  const input = $('#input-import');
  $('#btn-import').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const fichier = input.files?.[0];
    input.value = ''; // réimporter le même fichier doit redéclencher `change`
    if (!fichier) return;

    if (!confirm("Importer REMPLACE toutes les données de l'app par celles du fichier.\n\nContinuer ?")) return;

    try {
      const { lignes } = await importerJSON(fichier, 'remplacer');
      toast(`${lignes} entrée(s) importée(s).`, 'succes');
      await rendreSauvegarde();
      await rendreQuota();

      // 🔴 L'import amène un PROFIL. Sur une app publiée, c'est le geste qui la
      // fait passer de « vide » à « utilisable » — l'écran Programme doit le
      // refléter TOUT DE SUITE. Sans ça, l'utilisateur importe, ne voit rien
      // changer, et croit que ça n'a pas marché.
      await rendreProfil();
      await afficherProgramme().catch(() => {}); // l'erreur est déjà rendue dans l'écran
    } catch (e) {
      toast(e.message, 'erreur'); // messages déjà écrits pour un humain (backup.js)
    }
  });
}

function brancherProfil() {
  // 🔴 « Recharger le profil de démo » n'a de sens QUE s'il y a une démo à
  // recharger. Dans l'app publiée, l'amorce est un stub `null` : le bouton ne
  // pourrait rien faire. Un bouton qui ne peut rien faire est un mensonge — on
  // le retire, on ne le laisse pas échouer.
  const btn = $('#btn-reamorcer');
  if (!amorceDisponible()) {
    btn.hidden = true;
    return;
  }

  btn.addEventListener('click', async () => {
    if (!confirm('Recharger le profil de démonstration depuis le dépôt ?\n\nTon profil actuel sera remplacé. Tes séances loguées ne bougent pas.')) return;
    try {
      await reamorcerPersona();
      await rendreProfil();
      await afficherProgramme();
      toast('Profil rechargé. Le programme a été régénéré.', 'succes');
    } catch (e) {
      toast(`Rechargement impossible : ${e.message}`, 'erreur');
    }
  });
}

// ══════════════════════════════════════════════════════════════════════
// 5. CHRONO DE REPOS (contrainte n°4) — timestamps, jamais un compteur
// ══════════════════════════════════════════════════════════════════════

let boucleChrono = null;

function rendreChrono() {
  const c = lireChrono();
  const carte = $('.chrono-carte');
  const valeur = $('#chrono-valeur');
  const etat = $('#chrono-etat');

  if (!c.actif) {
    carte.dataset.etat = 'repos';
    valeur.textContent = '0:00';
    etat.textContent = 'Choisis une durée';
    $('#chrono-jauge-fill').style.width = '0%';
    $('#chrono-controles').hidden = true;
    for (const b of $$('.chrono-preset')) b.setAttribute('aria-pressed', 'false');
    return;
  }

  $('#chrono-controles').hidden = false;

  if (c.fini) {
    carte.dataset.etat = 'fini';
    valeur.textContent = '0:00';
    etat.textContent =
      c.depassementS > 5 ? `Repos terminé il y a ${formaterChrono(c.depassementS)}` : 'Repos terminé — go';
    $('#chrono-jauge-fill').style.width = '100%';
  } else {
    carte.dataset.etat = 'court';
    valeur.textContent = formaterChrono(c.restantMs / 1000);
    etat.textContent = ecranVerrouille() ? "Écran maintenu allumé" : 'Repos en cours';
    $('#chrono-jauge-fill').style.width = `${(1 - c.restantMs / (c.duree * 1000)) * 100}%`;
  }

  // Fin du repos : bip UNIQUEMENT si on est là pour l'entendre (cf. timer.js).
  if (doitSignalerFin()) {
    bip();
    $('#chrono-annonce').textContent = 'Repos terminé.';
    libererEcran();
  }
}

function lancerBoucle() {
  arreterBoucle();
  rendreChrono();
  // 250 ms : assez fluide pour une seconde qui tourne, assez lent pour la batterie.
  // La boucle ne sert QU'À AFFICHER : la vérité est le timestamp (timer.js).
  boucleChrono = setInterval(rendreChrono, 250);
}

function arreterBoucle() {
  if (boucleChrono) clearInterval(boucleChrono);
  boucleChrono = null;
}

function brancherChrono() {
  for (const btn of $$('.chrono-preset')) {
    btn.addEventListener('click', async () => {
      const duree = Number(btn.dataset.duree);
      amorcerAudio(); // l'AudioContext doit naître d'un geste utilisateur (iOS)

      await demarrerChrono(duree);
      for (const b of $$('.chrono-preset')) b.setAttribute('aria-pressed', String(b === btn));
      $('#chrono-annonce').textContent = `Repos de ${formaterChrono(duree)} démarré.`;

      // Wake Lock : iOS ≥ 18.4 en PWA installée (bug WebKit 254545, corrigé le 2025-03-31).
      // Absent ou refusé → l'écran s'éteindra. On le dit, on ne le cache pas.
      const tenu = await garderEcranAllume();
      if (!tenu && wakeLockSupporte()) {
        toast("L'écran ne peut pas rester allumé maintenant. Le chrono reste juste.", 'info');
      }
      lancerBoucle();
    });
  }

  for (const btn of $$('[data-ajuste]')) {
    btn.addEventListener('click', async () => {
      await ajusterChrono(Number(btn.dataset.ajuste));
      rendreChrono();
    });
  }

  $('#btn-stop-chrono').addEventListener('click', async () => {
    await arreterChrono();
    await libererEcran();
    $('#chrono-annonce').textContent = 'Repos arrêté.';
    rendreChrono();
  });

  // Wake Lock absent : on explique pourquoi — et la raison n'est pas la même partout.
  // « il faut iOS 18.4 ou plus » n'a aucun sens sur un Android.
  if (!wakeLockSupporte()) {
    $('#txt-chrono-honnete').innerHTML = REGIME.sansWakeLock;
  }
}

// ══════════════════════════════════════════════════════════════════════
// Cycle de vie : le retour dans l'app est le moment de vérité
// ══════════════════════════════════════════════════════════════════════

function brancherCycleDeVie() {
  // 🔴 iOS gèle le JS en arrière-plan. Au retour, on RECALCULE tout depuis les
  // timestamps — c'est exactement ce que la contrainte n°4 exige.
  const auRetour = async () => {
    if (document.visibilityState !== 'visible') {
      arreterBoucle();
      return;
    }
    await reprendreWakeLockSiBesoin(); // le système relâche le verrou quand on part
    if (lireChrono().actif) lancerBoucle();
    else rendreChrono();
    rendreQuota();
  };

  document.addEventListener('visibilitychange', auRetour);
  // `pageshow` couvre le retour depuis le bfcache (Safari l'utilise massivement).
  globalThis.addEventListener('pageshow', auRetour);

  const majReseau = () => {
    $('#pastille-hors-ligne').hidden = navigator.onLine;
  };
  globalThis.addEventListener('online', majReseau);
  globalThis.addEventListener('offline', majReseau);
  majReseau();
}

// ══════════════════════════════════════════════════════════════════════
// 6. 🔴 LE BOUTON RETOUR D'ANDROID — le piège qu'un iPhone ne pouvait pas révéler
// ══════════════════════════════════════════════════════════════════════
//
// Un iPhone n'a PAS de bouton retour : une PWA installée n'en expose aucun. Toute
// cette navigation (3 onglets, un seul document, aucune entrée d'historique) a donc
// été écrite sans jamais rencontrer le problème — et elle a été vérifiée sur un
// Chrome de BUREAU, où le retour est un bouton qu'on ne touche jamais.
//
// Sur Android, le retour est SYSTÈME : bouton ou geste, il existe toujours, et c'est
// le premier réflexe de l'utilisateur. Face à une app qui n'empile aucune entrée
// d'historique, il ne remonte nulle part — **il ferme l'app**. Un utilisateur Android va de Programme
// à Repos, appuie sur retour pour revenir, et l'app disparaît.
//
// Rien n'est perdu (le chrono est un timestamp en base — contrainte n°4 — et il
// revient juste). Mais une app qui se ferme quand on lui demande « reviens en
// arrière » est une app cassée, et c'est le genre de chose qui fait abandonner
// dans la première semaine.
//
// La parade : chaque changement d'onglet EMPILE une entrée ; `popstate` la dépile et
// affiche l'écran correspondant. Sur l'écran racine, la pile est vide → le retour
// quitte l'app, ce qui est le comportement ATTENDU. On ne piège personne dans l'app :
// on lui rend la navigation qu'il croit déjà avoir.

const ECRAN_RACINE = 'seance';
let ecranCourant = ECRAN_RACINE;

/** Navigue ET empile — ce que fait un tap sur un onglet. */
function naviguer(vers) {
  if (vers === ecranCourant) return;
  history.pushState({ ecran: vers }, '');
  ecranCourant = vers;
  afficherEcran(vers);
}

function brancherNavigation() {
  for (const btn of $$('[data-vers]')) {
    btn.addEventListener('click', () => naviguer(btn.dataset.vers));
  }

  // Le retour d'Android — et le retour du navigateur, et le geste de retour.
  globalThis.addEventListener('popstate', (e) => {
    const vers = e.state?.ecran ?? ECRAN_RACINE;
    ecranCourant = vers;
    afficherEcran(vers); // on N'EMPILE PAS : on vient justement de dépiler
  });
}

// ══════════════════════════════════════════════════════════════════════
// Démarrage
// ══════════════════════════════════════════════════════════════════════

function ouvrirApp() {
  $('#app').hidden = false;
  // L'entrée de base porte l'écran racine, pour que `popstate` sache où revenir.
  // `replaceState` et pas `pushState` : on n'ajoute pas un cran de retour fantôme
  // au démarrage (sinon le premier retour ne ferait « rien », ce qui est pire).
  history.replaceState({ ecran: ECRAN_RACINE }, '');
  ecranCourant = ECRAN_RACINE;
  afficherEcran(ECRAN_RACINE);
}

async function demarrer() {
  enregistrerSW(); // en parallèle : l'offline ne doit pas retarder l'affichage

  try {
    await ouvrirDB();
  } catch (e) {
    // Sans base, l'app ne peut rien retenir. Le dire franchement plutôt que de
    // laisser l'utilisateur saisir des séances dans le vide.
    document.body.innerHTML = `
      <div class="porte" style="display:flex">
        <div class="porte-carte">
          <h1 class="porte-titre">Le stockage est inaccessible</h1>
          <p class="porte-pourquoi">${e.message}<br><br>
          Si tu es en <b>navigation privée</b>, ouvre l'app dans une fenêtre normale.</p>
        </div>
      </div>`;
    return;
  }

  brancherNavigation();
  brancherChrono();
  brancherSauvegarde();
  brancherProfil();
  brancherCycleDeVie();

  await restaurerChrono(); // un chrono lancé avant un kill de l'app doit revenir juste
  await tenirLaPorte();

  // 🔴 LE MOTEUR TOURNE ICI. On ne l'attend pas : le référentiel pèse 848 Ko et
  // l'app doit être utilisable pendant ce temps (l'écran affiche son squelette).
  // Une erreur du moteur ne doit JAMAIS emporter la coquille avec elle.
  afficherProgramme().catch(() => {}); // erreur déjà rendue dans l'écran (programme.js)

  await Promise.all([rendreStockage(), rendreQuota(), rendreSauvegarde(), rendreProfil()]);
  rendreChrono();
  if (lireChrono().actif) lancerBoucle();

  if ((await etatSauvegarde()).jamais) {
    $('#txt-sauvegarde').textContent = `Tu n'as jamais exporté tes données. Fais-le au moins tous les ${SEUIL_RAPPEL_JOURS} jours.`;
  }
}

demarrer();
