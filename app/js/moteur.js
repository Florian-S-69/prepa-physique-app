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
 *   chargerJournal()      le magasin `seances` → le JOURNAL que le moteur sait lire
 *   genererProgramme()    persona + journal → programme ADAPTÉ, DANS LE NAVIGATEUR
 *
 * ── 🔴 LA BOUCLE ÉTAIT OUVERTE, ET C'ÉTAIT LE BUG ───────────────────────
 * `seance.js versEntreeJournal()` était écrite, testée, importée… et **jamais
 * appelée**. Les séances s'écrivaient dans le magasin `seances` et **le moteur ne
 * les lisait jamais** : `journal.js`, `adaptation.js` (double progression, deload)
 * et `charge.js` (la jauge unifiée sRPE) étaient publiés dans `dist/` et importés
 * par personne. Le programme était **régénéré à l'identique à chaque démarrage**,
 * à partir du seul persona. Noter son RPE huit semaines durant n'aurait **rien**
 * changé à ce qui était prescrit.
 *
 * Ce module referme la boucle — **sans migration de schéma**. Le magasin `seances`
 * contient déjà tout ce dont `journal.js` a besoin : le journal est **dérivé à la
 * LECTURE**. Aucun nouveau magasin, `DB_VERSION` intouchée. Une migration ratée
 * détruirait des semaines de RPE irremplaçables ; on n'en fait pas.
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
// 🔴 `journal.js` et `adaptation.js` (et `charge.js`, via elle) étaient publiés
// dans `dist/` et importés par PERSONNE. Voici leur premier appelant.
// 🏃 `ajouterSortie` rejoint la liste le 2026-07-12 : le journal savait recevoir une COURSE
//    depuis toujours — c'est l'app qui n'avait aucun moyen d'en produire une.
import { journalVide, ajouterSeanceMuscu, ajouterSortie } from '../../src/lib/journal.js';
import { programmeAdapteMuscu } from '../../src/lib/adaptation.js';
// La cible est validée par le MOTEUR, jamais par l'app : une seconde règle divergerait.
import { normaliserCible } from '../../src/lib/objectif.js';
import { versEntreeJournal } from './seance.js';
import { versEntreeSortie } from './course.js';
import { AMORCE } from './amorce.js';
import { lireMeta, ecrireMeta, lireTout, ecrire, supprimer, nouvelId } from './db.js';

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

/** Réécrit le persona en base (import, pesée, onboarding à venir). */
export const enregistrerPersona = (brut) => ecrireMeta(CLE_PERSONA, brut);

/** Efface le persona : le prochain démarrage ré-amorcera depuis le dépôt. */
export const reamorcerPersona = () => ecrireMeta(CLE_PERSONA, null);

// ── 🔴 LE POIDS DE CORPS — le seul chiffre du profil qu'on ouvre AUJOURD'HUI ──────────
//
// Hier, un poids de corps non modifiable était un trou **cosmétique**. Depuis que le tonnage
// compte le corps (tractions, dips — `seance.js PART_DU_CORPS`), il **porte une large part du
// chiffre affiché en gros**. Un poids faux fausse chaque séance Pull, **en silence** — et le
// « ? » du bilan promet que la valeur est **GELÉE à la date de la séance** : les séances
// passées **ne se répareraient jamais**.
//
//   lecture seule + porteur + gelé = un chiffre faux qu'on ne pourra plus jamais rendre juste.
//
// D'où l'ordre : **le poids doit devenir saisissable AVANT que l'historique ne se remplisse.**
//
// ⚠️ **PÉRIMÈTRE : le poids, et rien d'autre.** Pas l'écran « Moi », pas l'onboarding, pas le
// profil complet — c'est un autre chantier. **Un seul champ**, celui qui porte le chiffre de
// tête. Le plus petit geste qui rend le chiffre RÉPARABLE.
//
// ⚠️ **Une pesée modifie le FUTUR, pas le PASSÉ.** Le gel est VOLONTAIRE (`seance.js
// creerSeance`) : sans lui, chaque montée sur la balance réécrirait le tonnage de toutes les
// séances déjà loguées — le carnet raconterait une progression qui n'a pas eu lieu. On ne le
// casse pas ; on le DIT à l'écran.

/** Les bornes de la population que ce moteur accepte (`personne.js` refuse déjà les mineurs). */
export const POIDS_MIN_KG = 30;
export const POIDS_MAX_KG = 300;

/**
 * 🔴 `null` n'est pas `0`, et `""` n'est pas un poids.
 *
 * `Number(null) === 0` et `Number('') === 0` : sans ce garde-fou, un champ **vide** entrerait
 * en base comme **« 0 kg »** — et le tonnage des tractions tomberait à zéro sans un mot.
 * C'est exactement le poison que `seance.js exiger()` combat sur le RIR. Même règle, même
 * endroit : **à la porte d'entrée de la donnée.**
 *
 * @returns {number} le poids, arrondi à 100 g (la précision d'une balance de salle de bain —
 *                   ni plus, ni moins : afficher `84,37 kg` promettrait une exactitude fausse).
 */
export function validerPoidsCorps(valeur) {
  if (valeur == null || String(valeur).trim() === '') {
    throw new Error('Poids de corps : aucune valeur. « Je ne sais pas » n’est pas « zéro » — l’app n’écrit pas un chiffre que tu n’as pas donné.');
  }
  const n = Number(String(valeur).replace(',', '.').trim());
  if (!Number.isFinite(n)) {
    throw new Error(`Poids de corps invalide (« ${valeur} ») : un nombre est attendu.`);
  }
  if (n < POIDS_MIN_KG || n > POIDS_MAX_KG) {
    throw new Error(`Poids de corps hors bornes (« ${valeur} ») : attendu entre ${POIDS_MIN_KG} et ${POIDS_MAX_KG} kg.`);
  }
  return Math.round(n * 10) / 10;
}

/**
 * La pesée. Elle écrit dans le **persona** (`persona.profil.poids_kg`), là où le moteur la lit.
 *
 * 🔴 **Premier appel de production d'`enregistrerPersona()`** — exportée depuis le premier jour,
 * et appelée par personne.
 *
 * On réécrit le persona **BRUT**, jamais le normalisé : `normaliserPersona()` ajoute des
 * hypothèses dérivées (`persona.hypotheses`) qui n'ont rien à faire en base. Persister le
 * normalisé, c'est figer aujourd'hui des défauts que le moteur recalculerait demain.
 *
 * @returns {Promise<number>} le poids réellement écrit.
 */
export async function enregistrerPoidsCorps(valeur) {
  const poids = validerPoidsCorps(valeur);
  const brut = await lireMeta(CLE_PERSONA, null);
  if (!brut?.profil) {
    throw new Error("Aucun profil sur cet appareil : il n'y a pas de poids de corps à corriger.");
  }
  // Copie : on ne mute pas ce qu'on a lu (une écriture qui échoue ne doit rien laisser derrière).
  await enregistrerPersona({ ...brut, profil: { ...brut.profil, poids_kg: poids } });
  return poids;
}

// ── 🔴 LA CIBLE — le deuxième chiffre du profil que cette app sait recevoir ────────────
//
// > *« Je ne ressens pas la possibilité de rentrer mes charges, **ni de fixer un objectif**. »*
//
// La première moitié est réglée (charge/reps/RIR/RPE se saisissent). **Voici la seconde.**
//
// ⚠️ **On n'écrit PAS un champ que le moteur ne lit pas.** Ce projet a produit ce bug **deux
// fois** (`versEntreeJournal()` jamais appelée ; la séance finie prisonnière du pavé de note).
// La cible est lue par `adaptation.js programmeAdapteMuscu` — à chaque génération, avec les
// limitations sous la main pour pouvoir **REFUSER**. `tests/records.test.js` tombe si ça cesse.
//
// ⚠️ **La validation vit dans le MOTEUR** (`objectif.js normaliserCible`), pas ici. Une seconde
// validation dans l'app, ce serait deux règles qui divergeront — et celle du navigateur serait
// la mauvaise, celle que les tests ne couvrent pas. L'app appelle, elle ne re-décide pas.

/**
 * Écrit la cible dans le persona (`muscu.cible`), là où le moteur la lit.
 *
 * @param {{exercice: string, charge_kg: number|string, echeance: string}} brut
 * @returns {Promise<object>} la cible réellement écrite (normalisée par le moteur).
 */
export async function enregistrerCible(brut) {
  const { ok, cible, pourquoi } = normaliserCible(brut);
  if (!ok) throw new Error(pourquoi);

  const persona = await lireMeta(CLE_PERSONA, null);
  if (!persona?.muscu) {
    throw new Error("Aucun profil sur cet appareil : il n'y a pas de programme auquel fixer une cible.");
  }
  await enregistrerPersona({ ...persona, muscu: { ...persona.muscu, cible } });
  return cible;
}

/**
 * Retire la cible. **Un objectif atteint — ou abandonné — doit pouvoir partir** : un champ qu'on
 * ne peut plus vider est un champ qui ment jusqu'à la fin des temps.
 */
export async function effacerCible() {
  const persona = await lireMeta(CLE_PERSONA, null);
  if (!persona?.muscu) return;
  const { cible, ...muscu } = persona.muscu; // eslint-disable-line no-unused-vars
  await enregistrerPersona({ ...persona, muscu });
}

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

// ── Journal — DÉRIVÉ des séances loguées, à la LECTURE ────────────────

/**
 * Le magasin `seances` (fidélité pleine : chaque série, sa charge, son RIR, son
 * repos réel) → le **journal** que `src/lib/*` sait lire (agrégé par exercice).
 *
 * ⚠️ On ne stocke PAS le journal : on le **dérive**. Deux copies de la même
 * vérité, c'est une vérité qui divergera — et une migration IndexedDB de plus,
 * donc un risque de plus sur des données irremplaçables.
 *
 * 🔒 `journal.persona` porte l'identité du propriétaire : c'est ce champ que
 * `charge.js verifierProprietaireJournal()` exige pour garantir qu'on ne croise
 * jamais le journal d'un humain avec le persona d'un autre.
 *
 * 🔴 Une séance qui ne rentre pas ne disparaît pas en silence : elle est
 * **remontée** (`rejets`). Une donnée ignorée sans bruit, c'est exactement le bug
 * qu'on est en train de réparer.
 *
 * @returns {Promise<{journal: object, rejets: Array<{id, date, message}>}>}
 */
export async function chargerJournal(persona = null) {
  const enregistrements = (await lireTout('seances')) ?? [];
  enregistrements.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const journal = journalVide(persona?.id ?? persona?.nom ?? null);
  const rejets = [];

  for (const enr of enregistrements) {
    try {
      // `versEntreeJournal` était écrite, testée, importée — et jamais appelée.
      // Voici son seul appel de production. C'est la ligne qui ouvre le tiroir.
      ajouterSeanceMuscu(journal, versEntreeJournal(enr));
    } catch (e) {
      console.error(`[moteur] séance ${enr?.id} (${enr?.date}) refusée par le journal :`, e);
      rejets.push({ id: enr?.id ?? null, date: enr?.date ?? null, message: e.message });
    }
  }

  // 🏃 🔴 LES COURSES ENTRENT DANS LE MÊME JOURNAL. C'est **la** ligne qui rend le
  // différenciateur possible : `journal.sorties_course` est le tiroir que `charge.js` (la jauge
  // unifiée sRPE) et `placement.js` (le conflit jambes lourdes ↔ séance-clé) lisent depuis le
  // premier jour — et qui était **structurellement vide**, parce que rien ne pouvait le remplir.
  //
  // ⚠️ Pas de deuxième journal, pas de deuxième moteur : **le même objet**. Muscu et course
  // n'ont jamais été deux produits ; elles étaient deux listes du même journal, et l'app n'en
  // remplissait qu'une.
  const sorties = (await lireTout('sorties')) ?? [];
  sorties.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const s of sorties) {
    try {
      ajouterSortie(journal, s);
    } catch (e) {
      console.error(`[moteur] sortie ${s?.id} (${s?.date}) refusée par le journal :`, e);
      rejets.push({ id: s?.id ?? null, date: s?.date ?? null, message: e.message });
    }
  }

  return { journal, rejets };
}

// ── 🏃 LES COURSES — le magasin `sorties` ─────────────────────────────
//
// ⚠️ **On n'écrit PAS un champ que le moteur ne lit pas.** Ce projet a produit ce bug **trois
// fois**. Ici, la boucle est vérifiable en une ligne : `chargerJournal()` (juste au-dessus) verse
// chaque sortie dans `journal.sorties_course`, que `programmeAdapteMuscu()` passe à `chargesHebdo`
// (la jauge) et à `conflitsObserves` (le placement). **Un test tombe si cette chaîne se rompt.**

/** Les sorties enregistrées, les plus anciennes en premier. */
export async function chargerSorties() {
  const sorties = (await lireTout('sorties')) ?? [];
  return sorties.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/**
 * 🏃 **Loguer une course.** Le premier geste de course que cette app ait jamais su faire.
 *
 * 🔴 **La validation vit dans le MOTEUR**, pas ici : `ajouterSortie()` (src/lib/journal.js) borne
 * la distance, la durée, le RPE (Foster 0–10), n'accepte que les cinq zones E/M/T/I/R — et
 * **refuse `denivele_negatif_m: 0`** avec ses propres mots (« un zéro faux éteint le seul signal
 * de fatigue mesurable »). On l'appelle sur un journal JETABLE : s'il lève, rien n'est écrit ; s'il
 * passe, l'entrée qu'il a **normalisée** est celle qu'on persiste.
 *
 * Une seconde validation dans l'app, ce serait deux règles qui divergeront — et celle du navigateur
 * serait la mauvaise, celle que les tests du moteur ne couvrent pas.
 *
 * ⚠️ `rpe_seance` peut rester **`null`**, et c'est VOLONTAIRE. La sortie est le **produit** ; le RPE
 * est une **annotation**. Verrouiller l'enregistrement d'une course derrière une note facultative,
 * ce serait refaire, mot pour mot, le bug du carnet ([[philosophy]] règle 15). Le coût de ce trou
 * n'est pas caché pour autant : **sans RPE, la sortie ne porte aucune charge** — `charge.js` le dit,
 * `journal.donneesManquantes()` le signale, et l'écran l'écrit.
 *
 * @param {object} saisie  ce que le formulaire a produit (des chaînes)
 * @returns {Promise<object>} la sortie réellement écrite (normalisée par le moteur, + son `id`).
 */
export async function enregistrerSortie(saisie) {
  const entree = versEntreeSortie(saisie);

  // Le juge, c'est le moteur. Un journal jetable, uniquement pour lui poser la question.
  const jetable = journalVide(null);
  ajouterSortie(jetable, entree); // lève avec un message écrit pour un humain
  const normalisee = jetable.sorties_course[0];

  const sortie = { id: nouvelId(), ...normalisee };
  await ecrire('sorties', sortie);
  return sortie;
}

/** Retirer une course. Une donnée fausse empoisonne la jauge — elle doit pouvoir partir. */
export const supprimerSortie = (id) => supprimer('sorties', id);

// ── Génération ────────────────────────────────────────────────────────

/**
 * Le geste central : le persona ET LE JOURNAL sortent d'IndexedDB, le moteur
 * tourne DANS LE NAVIGATEUR, le programme **adapté** en sort.
 *
 * Toute la boucle vit dans `src/lib/adaptation.js programmeAdapteMuscu()` — une
 * fonction PURE, la même que celle que les tests exercent. Ici, on ne fait que
 * l'I/O : lire, appeler, rendre.
 *
 * ⚠️ Le persona recalé n'est **pas réécrit en base**. Il est **dérivé** à chaque
 * génération, depuis le journal — qui, lui, est la source de vérité durable. Rien
 * à migrer, rien à corrompre, et le résultat est le même : la charge prescrite
 * suit le réel.
 *
 * 🔴 Renvoie `null` s'il n'y a **pas de profil** — cas normal d'une app publiée,
 * pas un cas d'erreur. On lit le persona AVANT le référentiel : un visiteur sans
 * profil n'a aucune raison d'attendre 848 Ko d'exercices pour qu'on lui dise
 * qu'il n'a pas de profil.
 *
 * 🏃 Depuis le 2026-07-12, `charge` (la jauge unifiée sRPE : muscu **+** course, ADR 0006) et
 * `placement` (le conflit « jambes lourdes < 24–48 h avant une séance-clé ») sortent d'ici. Les
 * deux étaient calculés par le moteur et **jetés** par l'app.
 *
 * @returns {Promise<{persona, brut, programme, adaptation, charge, placement, cible, records, journal, rejets, amorce}|null>}
 */
export async function genererProgramme() {
  const { brut, persona, amorce } = await chargerPersona();
  if (!persona) return null;

  if (!persona.muscu) {
    // ⚠️ Ce message s'AFFICHE (écran d'erreur du programme) : il ne parle pas du moteur.
    throw new Error(`${persona.nom} n'a pas de bloc « muscu » : il n'y a rien à programmer.`);
  }

  const referentiel = await chargerReferentielEx();
  const { journal, rejets } = await chargerJournal(persona);

  const resultat = programmeAdapteMuscu(brut, journal, referentiel);
  return { ...resultat, amorce, journal, rejets };
}
