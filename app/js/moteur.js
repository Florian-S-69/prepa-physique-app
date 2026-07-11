/**
 * moteur.js — LE PONT. L'app rencontre le moteur.
 *
 * ── La règle qui gouverne ce fichier ────────────────────────────────────
 * `src/lib/*.js` est la SOURCE UNIQUE DE VÉRITÉ. On l'IMPORTE, on ne le
 * copie pas, on ne le « porte » pas, on ne le réécrit pas. Un moteur copié,
 * c'est deux moteurs qui divergeront — et celui du navigateur serait le
 * mauvais, celui que 129 tests ne couvrent pas.
 *
 * Ça marche sans build, sans bundler, sans import map : les 10 modules du
 * moteur sont des **modules ES natifs**, sans aucune dépendance et sans
 * aucun builtin Node (vérifié : `grep -n "node:" src/lib/*.js` ne renvoie
 * rien). Le navigateur les charge tels quels, par chemin relatif.
 * Le seul code Node du projet est `src/cli.js` — et on ne l'importe pas.
 *
 * ⚠️ Conséquence de déploiement, à ne pas perdre de vue : l'app a besoin de
 *    `/src/lib/` et de `/data/exercises.json` à côté d'elle. La parade est
 *    `tools/manifeste.mjs` (liste blanche) + `tools/garde.mjs` (échec du build).
 *    Voir docs/DEPLOIEMENT.md. RIEN n'est déployé : c'est la décision D1.
 *
 * ── Ce que ce module expose ─────────────────────────────────────────────
 *   chargerPersona()      lit le persona depuis IndexedDB (amorce si vide)
 *   chargerReferentielEx()  charge le référentiel d'exercices (mémoïsé)
 *   genererProgramme()    persona (IndexedDB) → programme, DANS LE NAVIGATEUR
 *
 * ── 🔴 L'APP PUBLIÉE N'A PAS DE PROFIL ──────────────────────────────────
 * En développement, le premier démarrage amorce un persona depuis le dépôt
 * (`amorce.js`). **Ce module-là n'est jamais publié** : dans `dist/`, le build
 * le remplace par un stub `AMORCE = null`.
 *
 * Donc, en production, `chargerPersona()` ne trouve **rien** — et ce n'est
 * **pas une erreur** : c'est un utilisateur neuf. Il crée son profil
 * (onboarding, à venir) ou l'importe (écran Données, qui existe déjà).
 * `chargerPersona()` renvoie alors `persona: null`, et `genererProgramme()`
 * renvoie `null`. L'écran affiche un état vide, pas un écran d'erreur.
 */

import { normaliserPersona } from '../../src/lib/personne.js';
import { chargerReferentiel } from '../../src/lib/exercices.js';
import { genererProgrammeMuscu } from '../../src/lib/muscu.js';
import { AMORCE } from './amorce.js';
import { lireMeta, ecrireMeta } from './db.js';

/** Clé du persona dans le magasin `meta`. */
export const CLE_PERSONA = 'persona';

/**
 * Y a-t-il un profil de démonstration à amorcer ? Faux dans toute app publiée.
 * L'UI s'en sert pour ne pas proposer un bouton qui ne peut rien faire.
 */
export const amorceDisponible = () => AMORCE !== null;

/** Le référentiel d'exercices (free-exercise-db, domaine public — lui est publiable). */
const EXERCICES = new URL('../../data/exercises.json', import.meta.url);

async function lireJSON(url) {
  const rep = await fetch(url);
  if (!rep.ok) throw new Error(`${url.pathname.split('/').pop()} introuvable (HTTP ${rep.status}).`);
  return rep.json();
}

// ── Persona ───────────────────────────────────────────────────────────

/**
 * Lit le persona **depuis IndexedDB**. S'il n'y est pas et qu'une amorce de
 * développement existe, l'amorce puis l'écrit en base : à partir du 2e
 * démarrage, l'app est autonome (elle fonctionne hors ligne même si le fichier
 * d'amorce a disparu).
 *
 * 🔴 Sans amorce (= **toute app publiée**), renvoie `persona: null`. **Ce n'est
 * pas une erreur** : c'est un utilisateur qui n'a pas encore de profil. Le seul
 * cas d'erreur ici serait une base illisible ou un persona corrompu — et
 * celui-là, on le laisse remonter.
 *
 * @returns {Promise<{brut: object|null, persona: object|null, amorce: boolean}>}
 *          `brut` = tel qu'il est en base ; `persona` = normalisé (ce que le
 *          moteur consomme).
 */
export async function chargerPersona() {
  let brut = await lireMeta(CLE_PERSONA, null);
  let amorce = false;

  if (!brut) {
    if (!AMORCE) return { brut: null, persona: null, amorce: false };
    brut = await lireJSON(AMORCE);
    await ecrireMeta(CLE_PERSONA, brut);
    amorce = true;
  }

  // normaliserPersona est PURE : elle ne mute pas ce qu'on lui donne.
  return { brut, persona: normaliserPersona(brut), amorce };
}

/** Réécrit le persona en base (import, onboarding à venir). */
export const enregistrerPersona = (brut) => ecrireMeta(CLE_PERSONA, brut);

/** Efface le persona : le prochain démarrage ré-amorcera depuis le dépôt. */
export const reamorcerPersona = () => ecrireMeta(CLE_PERSONA, null);

// ── Référentiel d'exercices ───────────────────────────────────────────

let referentielPromise = null;

/**
 * 873 exercices (848 Ko). Mémoïsé : chargé une fois par session, servi par le
 * service worker ensuite — donc hors ligne, donc en salle.
 */
export function chargerReferentielEx() {
  referentielPromise ??= lireJSON(EXERCICES).then(chargerReferentiel);
  return referentielPromise;
}

// ── Génération ────────────────────────────────────────────────────────

/**
 * Le geste central : le persona sort d'IndexedDB, le moteur tourne DANS LE
 * NAVIGATEUR, le programme en sort.
 *
 * 🔴 Renvoie `null` s'il n'y a **pas de profil** — cas normal d'une app publiée,
 * pas un cas d'erreur. On lit le persona AVANT le référentiel : un visiteur sans
 * profil n'a aucune raison d'attendre 848 Ko d'exercices pour qu'on lui dise
 * qu'il n'a pas de profil.
 *
 * @returns {Promise<{persona, brut, programme, amorce}|null>}
 */
export async function genererProgramme() {
  const { brut, persona, amorce } = await chargerPersona();
  if (!persona) return null;

  if (!persona.muscu) {
    throw new Error(`${persona.nom} n'a pas de bloc « muscu » : le moteur n'a rien à programmer.`);
  }

  const referentiel = await chargerReferentielEx();
  return { persona, brut, amorce, programme: genererProgrammeMuscu(persona, referentiel) };
}
