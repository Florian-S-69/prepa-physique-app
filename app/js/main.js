/**
 * main.js — le câblage de la coquille.
 *
 * Ce que fait ce fichier, et rien d'autre :
 *   1. enregistre le service worker (offline) et gère la mise à jour ;
 *   2. tient la PORTE d'installation (contrainte n°1) ;
 *   3. rend l'écran « Mes données » : persist() + quota réel (contrainte n°2) ;
 *   4. branche l'export / import JSON + le rappel (contrainte n°3) ;
 *   5. restaure le chrono de repos par timestamps au démarrage (contrainte n°4).
 *      ⛔ Il n'a plus d'ÉCRAN : l'onglet « Repos » a été retiré le 2026-07-12.
 *      « S'il y a déjà un chrono pour exécuter les exercices, l'onglet repos ne
 *      sert plus à rien. » Le chrono vit dans la barre d'action de la séance.
 *
 *   6. ✅ branche LE MOTEUR (`src/lib/*.js`) sur l'écran « Programme » — via
 *      js/moteur.js, qui l'IMPORTE (il ne le copie pas).
 *
 *   7. 🔴 branche L'ÉCRAN DE SÉANCE (js/ecran-seance.js) — **le geste des
 *      6×/semaine**. C'est là qu'on entre ses charges, qu'on valide ses séries,
 *      qu'on lance son repos sans quitter l'écran, et qu'on note son RPE.
 *      Avant lui, le magasin `seances` d'IndexedDB n'avait jamais reçu une
 *      seule ligne : l'app ne mémorisait RIEN de ce qui était fait.
 */

import { $, $$, afficherEcran, toast, formaterDate, brancherFeuille, ouvrirFeuille, blocPourquoi } from './ui.js';
import { initSeance, brancherSeance, activerSeance, reprendreSeance } from './ecran-seance.js';
import { ouvrirDB, lireMeta, ecrireMeta, ECHECS } from './db.js';
import { afficherProgramme } from './programme.js';
import {
  chargerPersona, reamorcerPersona, amorceDisponible, enregistrerPoidsCorps,
  enregistrerCible, effacerCible, genererProgramme,
} from './moteur.js';
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
// ⛔ Le chrono n'a plus d'écran à lui : il vit DANS la séance (ecran-seance.js).
// Ce qui reste ici est le strict nécessaire au CYCLE DE VIE — restaurer un repos
// armé avant qu'iOS ne tue l'app, et reprendre le Wake Lock au retour.
import { restaurerChrono, reprendreWakeLockSiBesoin } from './timer.js';

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
  const champPoids = $('#champ-poids');

  try {
    const { persona, amorce } = await chargerPersona();

    // 🔴 Aucun profil : le cas NORMAL d'une app publiée (le persona de dev n'est
    // pas publié — voir amorce.js). Un utilisateur neuf n'est pas une anomalie :
    // pastille neutre, pas rouge, et on lui dit quoi faire.
    if (!persona) {
      pastille.dataset.etat = 'inconnu';
      txt.textContent = 'Aucun profil';
      // ⚠️ « Le moteur a besoin de savoir qui tu es » — l'app parlait du moteur comme
      //    d'un personnage. Sans profil, il n'y a rien à programmer : c'est un ÉTAT.
      note.innerHTML =
        'Sans profil, rien à programmer. ' +
        '<b>Importe une sauvegarde</b> (ci-dessous) — ou attends l’onboarding, qui te posera les questions.';
      // Sans profil, il n'y a rien à peser : un champ qui ne peut rien écrire est un mensonge.
      champPoids.hidden = true;
      return;
    }

    // 🔴 Le poids de corps devient SAISISSABLE. Le champ est amorcé sur la valeur en base —
    // pas sur un placeholder : il corrige un chiffre, il n'en invente pas un.
    champPoids.hidden = false;
    $('#in-poids').value = String(persona.profil.poids_kg ?? '').replace('.', ',');

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
      // « — le moteur, lui, ne changera pas » rassurait sur une implémentation. Ça ne dit
      // rien à qui utilise l'app : c'est une note de développeur affichée à l'utilisateur.
      "L'onboarding le remplacera.";
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
      const resultat = await afficherProgramme().catch(() => null); // l'erreur est déjà rendue dans l'écran
      // ⚠️ …et l'écran de SÉANCE aussi. Il ne l'était pas : après un import, il
      // continuait d'afficher « pas de profil sur cet appareil » jusqu'au prochain
      // démarrage de l'app. L'import amène AUSSI les séances loguées : la séance
      // doit relire son historique, pas seulement son programme.
      await initSeance(resultat);
    } catch (e) {
      toast(e.message, 'erreur'); // messages déjà écrits pour un humain (backup.js)
    }
  });
}

/**
 * 🔴 LA PESÉE — le premier chiffre du profil que cette app sait recevoir.
 *
 * Avant lui, l'onglet Données n'avait **aucun champ de saisie** (un seul `<input>`, de type
 * `file`, caché, pour l'import). Le poids de corps s'affichait dans une phrase, en lecture
 * seule — et depuis que le tonnage compte le corps, il porte une large part du chiffre de
 * tête du bilan de séance.
 *
 * ⚠️ Après une pesée, le moteur doit **re-tourner** : le persona a changé, donc la séance à
 * venir aussi (elle gèlera le nouveau poids à son démarrage). C'est exactement le geste que
 * l'import fait déjà — on emprunte le même chemin, on n'en invente pas un deuxième.
 */
function brancherPoids() {
  const champ = $('#in-poids');
  const btn = $('#btn-poids');

  const peser = async () => {
    try {
      const poids = await enregistrerPoidsCorps(champ.value);
      await rendreProfil();
      // Le moteur relit le persona (donc le poids), et l'écran de séance avec lui.
      const resultat = await afficherProgramme().catch(() => null);
      await initSeance(resultat);
      toast(
        `Poids de corps : ${String(poids).replace('.', ',')} kg. Il comptera à partir de ta prochaine séance.`,
        'succes',
      );
    } catch (e) {
      toast(e.message, 'erreur'); // messages déjà écrits pour un humain (moteur.js)
    }
  };

  btn.addEventListener('click', peser);
  // Entrée valide : le clavier numérique d'iOS n'a pas de bouton « OK », mais un « Go ».
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); peser(); }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 🔴 LA CIBLE — « ni de fixer un objectif »
// ══════════════════════════════════════════════════════════════════════════════
//
// ⚠️ **Le TON.** Un champ vide affiche **`—`**, pas « le moteur ne connaît pas ton objectif ».
// L'app ne dit pas « je », ne pose pas de question. Mais **aucune vérité ne disparaît** : le
// *pourquoi* du moteur (refus, adaptation, progression non mesurable) est **rendu**, parce qu'il
// vient du moteur et qu'il est la raison d'être du produit (`philosophy.md` §4).
//
// ⚠️ **L'app n'écrit AUCUNE explication.** Toutes viennent de `objectif.js` (`cible.pourquoi`).
// Si elle en écrivait, le moteur et l'écran raconteraient deux histoires.

/**
 * L'état de la cible, tel que le MOTEUR l'a évalué. Rien n'est ré-interprété ici.
 * Exportée pour être **testable au DOM** : un test qui reconstruit la chaîne qu'il vérifie ne
 * teste que lui-même.
 */
export async function rendreCible() {
  const carte = $('#carte-cible');
  const pastille = $('#pastille-cible');
  const txt = $('#txt-cible');
  const note = $('#note-cible');
  const select = $('#in-cible-exo');
  const effacer = $('#btn-cible-effacer');

  const resultat = await genererProgramme().catch(() => null);
  if (!resultat) {
    carte.hidden = true; // pas de profil ⇒ rien à cibler. Un champ qui ne peut rien écrire ment.
    return;
  }
  carte.hidden = false;

  const { programme, cible, records } = resultat;

  // Les exercices proposables : ceux du programme, plus ceux que le carnet connaît déjà.
  // On ne propose pas de champ libre : une faute de frappe deviendrait une cible « inconnue »,
  // que le moteur refuserait — un refus mérité, mais évitable.
  const noms = [
    ...new Set([
      ...(programme.seances ?? []).flatMap((s) => (s.exercices ?? []).map((e) => e.nom)),
      ...(records ?? []).map((r) => r.nom),
    ]),
  ].sort((a, b) => a.localeCompare(b, 'fr'));

  select.replaceChildren();
  for (const nom of noms) {
    const o = document.createElement('option');
    o.value = nom;
    o.textContent = nom;
    select.append(o);
  }

  const pourquoi = $('#btn-cible-pourquoi');

  // Aucune cible : un ÉTAT, pas une phrase. Le `—` fait le travail.
  if (!cible) {
    pastille.dataset.etat = 'inconnu';
    txt.textContent = '—';
    note.textContent = 'Aucun objectif fixé.';
    effacer.hidden = true;
    pourquoi.hidden = true;
    $('#in-cible-kg').value = '';
    $('#in-cible-date').value = '';
    return;
  }

  effacer.hidden = false;
  $('#in-cible-exo').value = cible.exercice ?? '';
  $('#in-cible-kg').value = cible.charge_cible_kg != null ? String(cible.charge_cible_kg).replace('.', ',') : '';
  $('#in-cible-date').value = cible.echeance ?? '';

  pastille.dataset.etat = cible.statut === 'REFUSE' ? 'ko' : cible.statut === 'ADAPTE' ? 'attention' : 'ok';
  txt.textContent =
    cible.statut === 'REFUSE'
      ? 'Objectif refusé'
      // ⚠️ `formaterDate` attend une **Date**, pas une chaîne (elle appelle `toLocaleDateString`).
      //    L'échéance est une chaîne `AAAA-MM-JJ` : on la convertit, sinon l'écran plante.
      : `${cible.exercice} · ${cible.charge_cible_kg} kg · ${formaterDate(new Date(`${cible.echeance}T00:00:00`))}`;

  // 🔴 UNE LIGNE — l'ÉTAT. Le record est le dénominateur ; l'écart est ce qu'il reste.
  //    Un record au poids du corps se lit en REPS : le « 0 kg » ne peut pas sortir d'ici non plus.
  const r = cible.record;
  note.textContent =
    cible.statut === 'REFUSE'
      ? "Le moteur refuse cet objectif."
      : `Record ${!r ? '—' : r.au_poids_du_corps ? `${r.reps} reps` : `${String(r.charge_kg).replace('.', ',')} kg × ${r.reps}`}` +
        ` · Écart ${cible.ecart_kg == null ? '—' : `${cible.ecart_kg <= 0 ? '' : '+'}${String(cible.ecart_kg).replace('.', ',')} kg`}` +
        ` · Progression ${cible.progression ? `${cible.progression.delta_kg >= 0 ? '+' : ''}${String(cible.progression.delta_kg).replace('.', ',')} kg / ${String(cible.progression.semaines).replace('.', ',')} sem` : '—'}`;

  // 🔴 …et la VÉRITÉ derrière le tap. Elle n'est pas supprimée — elle est DÉPLACÉE.
  //    (Trois paragraphes de prose déversés au-dessus des champs : c'était un ARTICLE.)
  const raisons = cible.pourquoi ?? [];
  pourquoi.hidden = raisons.length === 0;
  pourquoi.onclick = () =>
    ouvrirFeuille({
      titre: cible.statut === 'REFUSE' ? 'Objectif refusé' : 'Ton objectif',
      sous: cible.echeance ? `Échéance : ${cible.echeance}` : null,
      corps: blocPourquoi(
        raisons.map((x) => ({
          label: cible.statut === 'REFUSE' ? 'Refus du moteur' : 'Ce que ça change',
          texte: String(x),
        })),
      ),
      fermer: 'Fermer',
    });
}

/**
 * 🔴 La cible s'ÉCRIT — et le moteur RE-TOURNE derrière, comme après une pesée.
 * Sans ça, on aurait un champ qui se remplit et un écran qui ne bouge pas : le bug de ce projet,
 * pour la troisième fois.
 */
function brancherCible() {
  const fixer = async () => {
    try {
      const cible = await enregistrerCible({
        exercice: $('#in-cible-exo').value,
        charge_kg: String($('#in-cible-kg').value).replace(',', '.'),
        echeance: $('#in-cible-date').value,
      });
      const resultat = await afficherProgramme().catch(() => null);
      await initSeance(resultat);
      await rendreCible();
      toast(`Objectif : ${cible.charge_kg} kg au ${cible.exercice.toLowerCase()}.`, 'succes');
    } catch (e) {
      toast(e.message, 'erreur'); // le message vient du moteur — il est déjà écrit pour un humain
    }
  };

  $('#btn-cible').addEventListener('click', fixer);
  $('#in-cible-kg').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); fixer(); }
  });

  $('#btn-cible-effacer').addEventListener('click', async () => {
    await effacerCible();
    const resultat = await afficherProgramme().catch(() => null);
    await initSeance(resultat);
    await rendreCible();
    toast('Objectif retiré.', 'succes');
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
// Cycle de vie : le retour dans l'app est le moment de vérité
// ══════════════════════════════════════════════════════════════════════

/**
 * 🔴 UNE ÉCRITURE QUI ÉCHOUE DOIT SE VOIR — sur l'écran, pas dans la console.
 *
 * `db.js` relance toujours l'erreur, et les appelants qui comptent (la validation
 * d'une série, l'enregistrement d'une séance) la rendent déjà en toast. Ce filet-ci
 * attrape **tout le reste** : les écritures qu'on a lancées sans `try`, et celles
 * qu'on ajoutera demain en oubliant d'en mettre un.
 *
 * Sans lui, le scénario est : il valide sa série, le quota est plein, l'écriture
 * échoue, **rien ne s'affiche**, il range la barre — et sa séance n'existe pas.
 */
function brancherEchecsDeBase() {
  ECHECS.addEventListener('echec', (e) => {
    const { erreur } = e.detail;
    banniere(
      'ecriture-ko',
      'erreur',
      "<b>Une écriture a échoué.</b> Ta dernière action n'est peut-être <b>pas enregistrée</b>. " +
        `Exporte tes données maintenant. <i>(${erreur?.name ?? 'Erreur'} : ${erreur?.message ?? 'cause inconnue'})</i>`,
      'Exporter',
      () => {
        naviguer('donnees');
        $('#btn-export').click();
      },
    );
  });
}

function brancherCycleDeVie() {
  // 🔴 iOS gèle le JS en arrière-plan. Au retour, on RECALCULE tout depuis les
  // timestamps — c'est exactement ce que la contrainte n°4 exige.
  const auRetour = async () => {
    if (document.visibilityState !== 'visible') return;
    await reprendreWakeLockSiBesoin(); // le système relâche le verrou quand on part
    reprendreSeance(); // la séance en cours recalcule son chrono depuis les timestamps
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
  if (vers === 'seance') activerSeance();
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
    if (vers === 'seance') activerSeance();
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

  brancherEchecsDeBase(); // AVANT tout le reste : la première écriture peut déjà échouer
  brancherNavigation();
  brancherFeuille(); // le glissé de la poignée (design/sheet.js)
  brancherSeance(); // le chrono de repos est DEDANS — il n'a plus d'onglet à lui
  brancherSauvegarde();
  brancherProfil();
  brancherPoids(); // le poids de corps est enfin SAISISSABLE — il porte le tonnage
  brancherCible(); // et l'objectif chiffré aussi — le moteur le LIT, il ne le stocke pas
  brancherCycleDeVie();

  await restaurerChrono(); // un chrono lancé avant un kill de l'app doit revenir juste
  await tenirLaPorte();

  // 🔴 LE MOTEUR TOURNE ICI. On ne l'attend pas : le référentiel pèse 848 Ko et
  // l'app doit être utilisable pendant ce temps (l'écran affiche son squelette).
  // Une erreur du moteur ne doit JAMAIS emporter la coquille avec elle.
  //
  // L'écran de séance consomme le MÊME résultat : on ne fait pas tourner le
  // moteur deux fois pour afficher deux vues du même programme.
  afficherProgramme()
    .then((resultat) => initSeance(resultat))
    .catch(() => initSeance(null)); // l'erreur est déjà rendue dans l'écran (programme.js)

  await Promise.all([rendreStockage(), rendreQuota(), rendreSauvegarde(), rendreProfil(), rendreCible()]);

  if ((await etatSauvegarde()).jamais) {
    $('#txt-sauvegarde').textContent = `Tu n'as jamais exporté tes données. Fais-le au moins tous les ${SEUIL_RAPPEL_JOURS} jours.`;
  }
}

demarrer();
