/**
 * timer.js — chronomètre de repos.
 *
 * 🔴 Contrainte NON NÉGOCIABLE n°4 (docs/veille/16-faisabilite-pwa.md §2 et §6).
 *
 * ── LA RÈGLE ────────────────────────────────────────────────────────────
 * Un chrono n'est JAMAIS un compteur qu'on décrémente. C'est un TIMESTAMP DE
 * DÉPART persisté, et le temps restant se RECALCULE à chaque affichage.
 *
 * Pourquoi : dès que la page passe en arrière-plan, iOS gèle le JS. Les timers
 * reposent sur le Mach absolute time, qui s'arrête quand le CPU dort (Apple Dev
 * Forums). Un `setInterval` qui décrémente une variable dérive puis s'arrête.
 * Un `Date.now() - debut` est juste au retour, même après 10 minutes d'écran éteint.
 *
 * ── CE QU'ON NE PROMET PAS ──────────────────────────────────────────────
 * ❌ Aucun bip écran éteint. C'est structurel, pas un manque de soin :
 *    - les notifications locales PROGRAMMÉES n'existent pas sur iOS
 *      (`TimestampTrigger` = proposition Chrome jamais standardisée, jamais
 *       implémentée par WebKit) ;
 *    - le Web Push exige un serveur (et on n'en a pas — c'est le choix produit) ;
 *    - l'audio en arrière-plan est cassé en PWA installée (bug WebKit 198277).
 *    → L'UI doit dire « garde l'app ouverte », et rien d'autre.
 *
 * ✅ Ce qu'on tient : l'affichage est TOUJOURS juste au retour dans l'app, et le
 *    bip sonne si l'app est au premier plan à la fin du repos.
 */

import { lireMeta, ecrireMeta } from './db.js';

const CLE_ETAT = 'chronoRepos';
/** Fenêtre pendant laquelle on considère avoir « assisté » à la fin du repos. */
const FENETRE_BIP_MS = 3000;

/** @type {{debut: number, duree: number} | null} — duree en secondes */
let etatCourant = null;
let dejaSignale = false;

/** Recharge l'état depuis IndexedDB (au démarrage de l'app, après un kill). */
export async function restaurerChrono() {
  const enr = await lireMeta(CLE_ETAT, null);
  if (enr && Number.isFinite(enr.debut) && Number.isFinite(enr.duree)) {
    etatCourant = enr;
    // Un chrono déjà expiré au démarrage : on ne bipera pas, on n'a rien vu passer.
    dejaSignale = restantMs() <= 0;
  }
  return lireChrono();
}

const restantMs = () =>
  etatCourant ? etatCourant.duree * 1000 - (Date.now() - etatCourant.debut) : 0;

/**
 * L'état courant, RECALCULÉ à l'instant présent. À appeler à chaque rendu,
 * à chaque `visibilitychange` et à chaque `pageshow`.
 * @returns {{actif: boolean, duree: number, restantMs: number, restantS: number,
 *            fini: boolean, depassementS: number}}
 */
export function lireChrono() {
  if (!etatCourant) {
    return { actif: false, duree: 0, restantMs: 0, restantS: 0, fini: false, depassementS: 0 };
  }
  const ms = restantMs();
  return {
    actif: true,
    duree: etatCourant.duree,
    restantMs: Math.max(0, ms),
    restantS: Math.max(0, Math.ceil(ms / 1000)),
    fini: ms <= 0,
    // Depuis combien de temps le repos est-il terminé (utile après un retour tardif).
    depassementS: ms < 0 ? Math.floor(-ms / 1000) : 0,
  };
}

/** Démarre un repos de `dureeS` secondes. À appeler sur un geste utilisateur. */
export async function demarrerChrono(dureeS) {
  etatCourant = { debut: Date.now(), duree: dureeS };
  dejaSignale = false;
  await ecrireMeta(CLE_ETAT, etatCourant);
  return lireChrono();
}

export async function arreterChrono() {
  etatCourant = null;
  dejaSignale = true;
  await ecrireMeta(CLE_ETAT, null);
}

/** Ajoute (ou retire, si négatif) des secondes au repos en cours. */
export async function ajusterChrono(deltaS) {
  if (!etatCourant) return lireChrono();
  etatCourant = { ...etatCourant, duree: Math.max(0, etatCourant.duree + deltaS) };
  if (restantMs() > 0) dejaSignale = false;
  await ecrireMeta(CLE_ETAT, etatCourant);
  return lireChrono();
}

/**
 * Faut-il signaler la fin du repos MAINTENANT ?
 * Vrai une seule fois, et seulement si on a réellement assisté à l'échéance —
 * revenir dans l'app 10 minutes après la fin ne doit pas déclencher un bip absurde.
 */
export function doitSignalerFin() {
  if (!etatCourant || dejaSignale) return false;
  const ms = restantMs();
  if (ms > 0) return false;
  dejaSignale = true;
  return -ms <= FENETRE_BIP_MS && document.visibilityState === 'visible';
}

export const formaterChrono = (secondes) => {
  const s = Math.max(0, Math.round(secondes));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ── Bip de fin (Web Audio) ───────────────────────────────────────────
// L'AudioContext doit être créé/repris sur un GESTE UTILISATEUR (iOS l'exige) :
// on l'amorce au démarrage du chrono, il est donc débloqué à l'échéance.

/** @type {AudioContext | null} */
let audio = null;

export function amorcerAudio() {
  const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AC) return;
  audio ??= new AC();
  if (audio.state === 'suspended') audio.resume();
}

/** Trois bips courts. Ne sonne que si l'app est au premier plan (cf. en-tête). */
export function bip() {
  if (!audio || audio.state !== 'running') return;
  const t0 = audio.currentTime;
  for (let i = 0; i < 3; i++) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    const debut = t0 + i * 0.22;
    // Enveloppe douce : un créneau brut produit un clic désagréable.
    gain.gain.setValueAtTime(0, debut);
    gain.gain.linearRampToValueAtTime(0.25, debut + 0.02);
    gain.gain.linearRampToValueAtTime(0, debut + 0.16);
    osc.connect(gain).connect(audio.destination);
    osc.start(debut);
    osc.stop(debut + 0.18);
  }
  // Absent sur iOS (aucun navigateur ne l'implémente) : bonus Android, sans garantie.
  navigator.vibrate?.([120, 80, 120]);
}

// ── Wake Lock — garder l'écran allumé pendant la séance ──────────────
// Screen Wake Lock : Safari iOS 16.4+ en onglet, et CORRIGÉ EN PWA INSTALLÉE
// seulement depuis iOS 18.4 (2025-03-31, bug WebKit 254545). En dessous : l'écran
// s'éteint pendant le repos. On dégrade proprement, on ne promet rien.

/** @type {WakeLockSentinel | null} */
let verrou = null;
let verrouSouhaite = false;

export const wakeLockSupporte = () => 'wakeLock' in navigator;

/** @returns {Promise<boolean>} le verrou est-il effectivement tenu ? */
export async function garderEcranAllume() {
  verrouSouhaite = true;
  if (!wakeLockSupporte()) return false;
  if (verrou && !verrou.released) return true;
  try {
    verrou = await navigator.wakeLock.request('screen');
    verrou.addEventListener('release', () => {
      verrou = null;
    });
    return true;
  } catch {
    // Refusé (batterie faible, onglet caché, iOS < 18.4 en standalone). Pas une erreur
    // fatale : le chrono reste juste, c'est l'écran qui s'éteindra.
    verrou = null;
    return false;
  }
}

export async function libererEcran() {
  verrouSouhaite = false;
  try {
    await verrou?.release();
  } catch {
    /* déjà relâché */
  }
  verrou = null;
}

/**
 * Le système relâche le verrou dès que la page est cachée : il faut le REDEMANDER
 * au retour, sinon l'écran s'éteint au milieu de la séance suivante.
 */
export function reprendreWakeLockSiBesoin() {
  if (verrouSouhaite && document.visibilityState === 'visible' && !verrou) {
    return garderEcranAllume();
  }
  return Promise.resolve(Boolean(verrou));
}

export const ecranVerrouille = () => Boolean(verrou && !verrou.released);
