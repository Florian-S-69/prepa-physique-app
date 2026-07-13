/**
 * course.js — LA COURSE ENTRE DANS L'APP. La logique, sans une ligne de DOM.
 *
 * ══════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'IL RÉPARE — l'app faisait la MOITIÉ de son sport
 * ══════════════════════════════════════════════════════════════════════
 * Le produit s'appelle « muscu **+ running** ». Le moteur sait générer un plan de course
 * (`src/lib/running.js`), calculer des allures (`vdot.js`), lire un dénivelé (`denivele.js`),
 * additionner une séance de squat et un 10 km dans la MÊME unité (`charge.js`, ADR 0006) et
 * dire qu'une séance de jambes tombe trop près d'une séance-clé (`placement.js`).
 *
 * Et l'app **ne savait recevoir aucune course.** Ni distance, ni durée, ni RPE. Le seul endroit
 * où le mot « course » apparaissait dans l'écran de séance était un **commentaire** :
 *
 *   > « C'est ce qui permettra d'**additionner** ta muscu et ta course — ce que ni Strava ni
 *   >   Hevy ne savent faire. »
 *
 * Écrit dans un commentaire que l'utilisateur ne verra jamais, dans une app incapable de
 * recevoir la donnée dont il parle. **Le moteur SAIT, l'app ne DEMANDE pas** — c'est la
 * quatrième fois que ce projet produit ce motif (`versEntreeJournal()` jamais appelée ; la
 * séance otage d'une note ; `record` inexistant). Ce module est le premier maillon du correctif.
 *
 * ══════════════════════════════════════════════════════════════════════
 * Ce qu'il est, et ce qu'il n'est PAS
 * ══════════════════════════════════════════════════════════════════════
 * Il est **PUR** : pas de DOM, pas d'IndexedDB. Donc testable sous Node — comme `seance.js`,
 * son pendant côté salle.
 *
 * ⚠️ **Il ne VALIDE rien.** La validation d'une sortie vit dans le MOTEUR
 * (`src/lib/journal.js ajouterSortie`) : bornes, types de zone autorisés, refus du `D− = 0`.
 * Une seconde validation ici, ce serait deux règles qui divergeront — et celle du navigateur
 * serait la mauvaise, celle que les tests du moteur ne couvrent pas. **L'app met en forme,
 * elle ne re-décide pas.** (Même parti pris que `moteur.js enregistrerCible`.)
 *
 * Ce qu'il fait, donc : traduire une SAISIE (des chaînes, venues de champs de formulaire) en
 * l'objet que le moteur sait lire — et **ne rien inventer en chemin**.
 */

// Les zones d'entraînement viennent du moteur (`vdot.js ZONES`) : ce sont EXACTEMENT les cinq
// types que `journal.js` accepte (`TYPES_SORTIE`). Une table de libellés recopiée ici serait une
// table qui divergera le jour où le moteur en ajoutera une sixième.
import { ZONES, formatAllure } from '../../src/lib/vdot.js';

/** Les zones proposables, dans l'ordre du moteur. `{ code, nom }` — rien d'autre n'est affiché. */
export const ZONES_COURSE = ZONES.map((z) => ({ code: z.code, nom: z.nom }));

/**
 * La zone par défaut du formulaire.
 *
 * ⚠️ **Ce n'est pas un choix de l'app : c'est le défaut du MOTEUR** (`journal.js ajouterSortie`,
 * `type = "E"`). Et il est défendable : le contrôle 80/20 veut que l'écrasante majorité du volume
 * soit couru en endurance fondamentale (`running.js`, veille/03 §1). Le sélecteur reste **à côté
 * du champ**, en un tap — on propose, on n'enferme pas.
 */
export const ZONE_DEFAUT = 'E';

/** Échelle de Foster (CR-10) — **la même qu'en muscu, et c'est tout le point** (ADR 0006). */
export const RPE_FOSTER = { min: 0, max: 10 };

// ══════════════════════════════════════════════════════════════════════
// 🔴 LA PORTE D'ENTRÉE — `null` n'est PAS `0`, et un champ vide n'est pas un zéro
// ══════════════════════════════════════════════════════════════════════
//
// `Number('') === 0` et `Number(null) === 0`. C'est le poison de ce projet, et il a déjà frappé
// **trois fois** : le RIR non déclaré qui entrait comme « échec musculaire » (`seance.js exiger`),
// le poids de corps vide qui entrait comme « 0 kg » (`moteur.js validerPoidsCorps`), et le « 0 kg »
// des tractions dans le carnet.
//
// 🔴 **Ici, il coûterait le signal le plus cher du moteur.** Un `denivele_negatif_m: 0` fabriqué à
// partir d'un champ vide **éteint le seul signal de fatigue mesurable** de tout le produit : la
// descente est EXCENTRIQUE, c'est ELLE la contrainte (ADR 0006 §1.5), et « je ne sais pas » n'est
// pas « il n'y en a pas ». Le journal du moteur **refuse explicitement** le zéro (`journal.js`
// l.109) — mais un refus qu'on n'atteint jamais parce qu'on a converti le vide en zéro avant de
// frapper à la porte, c'est un garde-fou qu'on a contourné soi-même.
//
// Donc : **un champ vide vaut `null`, et il traverse la fonction en `null`.**

/**
 * Une chaîne de champ → un nombre, ou `null`. **Jamais `0` par accident.**
 * La virgule française est admise (le clavier décimal d'iOS en produit).
 * @returns {number|null} `null` = « rien n'a été saisi ». Une saisie ILLISIBLE (« abc ») remonte
 *          telle quelle en `NaN` : c'est au moteur de la refuser avec ses mots, pas à l'app de la
 *          maquiller en `null` (« je n'ai rien dit » ≠ « j'ai dit n'importe quoi »).
 */
export function nombreOuNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  return Number(s.replace(',', '.'));
}

/**
 * 🔴 UNE DURÉE SE SAISIT EN **HEURES + MINUTES**. Le moteur, lui, compte en minutes.
 *
 * ── Le défaut ─────────────────────────────────────────────────────────────────
 *   > Un 30 km en **3 h 20**, c'est **200 minutes à taper**.
 *
 * Le champ unique « Durée (min) » ne demandait pas une durée : il demandait **une conversion**.
 * Et une conversion mentale faite au pouce, après trois heures de course, est une conversion
 * **fausse** — un « 20 » tapé à la place de « 200 » entre dans la jauge comme une sortie de
 * 20 minutes, **et rien ne le rattrape** : `20` est une durée parfaitement valide. **Le garde-fou
 * ne peut pas exister** ; c'est la SAISIE qu'il faut réparer.
 *
 * ── Pourquoi DEUX champs, et pas un champ qui accepterait « 3h20 » ─────────────
 * Parce qu'un champ libre est **ambigu, et l'ambiguïté se résout en silence** : `320` vaut-il
 * 320 minutes ou 3 h 20 ? Les deux se défendent, et le mauvais choix ne lève aucune erreur.
 * **Deux champs n'ont aucun cas ambigu**, et ils coûtent le même nombre de frappes (« 3 », « 20 »
 * contre « 200 »). Une sortie d'une heure ne demande même rien de plus : on laisse `h` vide.
 *
 * ⚠️ **Et `Number('') === 0`, le poison de ce fichier.** Les DEUX champs vides valent `null` —
 * « je n'ai rien saisi » — et surtout **pas** `0`. Un `0` traverserait le journal comme une durée
 * réelle : `charge = rpe × 0` = **une sortie qui ne pèse rien**, alors qu'elle a bien eu lieu.
 * Le moteur (`journal.js`) refuse une durée absente **avec ses mots** ; encore faut-il l'y laisser
 * arriver absente.
 *
 * @returns {number|null} minutes, ou `null` si RIEN n'a été saisi. Une saisie illisible remonte
 *          en `NaN` — c'est au moteur de la refuser, pas à l'app de la maquiller.
 */
export function dureeEnMinutes(heures, minutes) {
  const h = nombreOuNull(heures);
  const m = nombreOuNull(minutes);
  if (h == null && m == null) return null; // 🔴 rien saisi ≠ zéro
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * La SAISIE du formulaire → l'entrée que `src/lib/journal.js ajouterSortie()` sait lire.
 *
 * **Le moteur possède ce format ; l'app s'y plie.** (Exactement comme `seance.js
 * versEntreeJournal()` pour la muscu.) Rien n'est validé ici — `ajouterSortie` le fait, et il le
 * fait avec des messages déjà écrits pour un humain.
 *
 * ⚠️ `duree_h` est **facultatif** : absent, la fonction se comporte exactement comme avant
 * (`duree_min` seul). C'est ce qui permet au moteur et aux tests existants de ne rien changer.
 *
 * @param {object} saisie  des chaînes, telles que les champs les rendent
 * @returns {{date, km, duree_min, type, rpe_seance, denivele_m, denivele_negatif_m}}
 */
export function versEntreeSortie({ date, distance_km, duree_h, duree_min, type, rpe_seance, denivele_m, denivele_negatif_m }) {
  return {
    date: String(date ?? '').trim(),
    km: nombreOuNull(distance_km),
    // Le moteur ne connaît QUE des minutes. La conversion vit ici, une fois, et elle est testée.
    duree_min: dureeEnMinutes(duree_h, duree_min),
    type: String(type ?? ZONE_DEFAUT).trim().toUpperCase() || ZONE_DEFAUT,
    // 🔴 Ces trois-là restent `null` quand ils ne sont pas saisis. Voir le bloc ci-dessus.
    rpe_seance: nombreOuNull(rpe_seance),
    denivele_m: nombreOuNull(denivele_m),
    denivele_negatif_m: nombreOuNull(denivele_negatif_m),
  };
}

// ══════════════════════════════════════════════════════════════════════
// Ce qu'on AFFICHE d'une sortie — du DÉRIVÉ, jamais un modèle
// ══════════════════════════════════════════════════════════════════════

/**
 * L'allure, en minutes par kilomètre. **Une DIVISION**, rien de plus : c'est du DÉRIVÉ exact
 * (taxonomie `valeurs.js`), pas une estimation — donc pas de « ~ », pas d'arrondi grossier.
 * @returns {number|null} `null` s'il n'y a rien à diviser (on n'affiche pas « 0:00 /km »).
 */
export function allureMinParKm(km, duree_min) {
  const d = Number(duree_min);
  const k = Number(km);
  if (!Number.isFinite(d) || !Number.isFinite(k) || k <= 0 || d <= 0) return null;
  return d / k;
}

/**
 * « 5:14/km », ou « — ».
 *
 * ⚠️ Le formatage vient du moteur (`vdot.js formatAllure`) — **et il porte DÉJÀ son unité**.
 * Une première version ajoutait « /km » par-dessus : « **5:30/km /km** ». Attrapé par le test, pas
 * à l'écran, et c'est bien le seul endroit où on a eu de la chance. La leçon est celle de tout ce
 * fichier : **on ne recopie pas ce que le moteur sait faire — pas même une unité.**
 */
export function allureDite(km, duree_min) {
  const a = allureMinParKm(km, duree_min);
  return a == null ? '—' : formatAllure(a);
}

/**
 * « 3 h 20 » ou « 48 min ». Une durée saisie est MESURÉE : précision pleine.
 *
 * 🔴 **Elle disait « 3:20 » — exactement la forme d'une ALLURE.** Deux lignes plus bas, sur la
 * même carte, `allureDite` rend « **5:30/km** ». **La même forme `m:ss` portait deux unités
 * différentes** : chez un coureur, `m:ss` **est** une allure (c'est comme ça qu'on les écrit), et
 * « 1:05 » pour une sortie d'une heure cinq se lit sans effort comme **1:05 au kilomètre**.
 *
 * On écrit donc l'unité. **Un format ambigu n'est pas un détail de style : c'est un chiffre qui
 * ment à la lecture** — et il ment d'autant mieux qu'il est juste en base.
 */
export function dureeDite(duree_min) {
  const d = Number(duree_min);
  if (!Number.isFinite(d) || d <= 0) return '—';
  const total = Math.round(d);
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')}`;
}

/** « 12,4 km » — MESURÉ, précision pleine, virgule française. */
export function kmDit(km) {
  const k = Number(km);
  if (!Number.isFinite(k)) return '—';
  return `${String(Math.round(k * 100) / 100).replace('.', ',')} km`;
}

/** Le nom d'une zone, tel que le moteur la nomme. Un code inconnu ne devient pas un mensonge. */
export const nomZone = (code) => ZONES_COURSE.find((z) => z.code === code)?.nom ?? String(code ?? '—');

/**
 * 🔴 CE QU'UNE SORTIE A LAISSÉ DE CÔTÉ — pour que l'écran puisse le DÉCLARER.
 *
 * Trois trous possibles, et ils ne coûtent PAS la même chose :
 *   • `rpe_seance` manquant → **la sortie ne porte AUCUNE charge** (`charge.js chargeSortie` :
 *     pas d'imputation du RPE en course, ce serait recréer un « k »). Elle est dans le carnet,
 *     elle n'est pas dans la jauge. C'est le trou qui COMPTE.
 *   • `denivele_m` (D+) manquant → une décoration en moins.
 *   • `denivele_negatif_m` (D−) manquant → le moteur ne le déduira PAS du D+ (sur un point-à-point,
 *     200 m de D+ peuvent cacher 1 800 m de D−). Il le SIGNALE (`denivele.js`).
 *
 * @returns {{sans_rpe: boolean, sans_dmoins: boolean, sans_dplus: boolean}}
 */
export function trousDe(sortie) {
  return {
    sans_rpe: sortie?.rpe_seance == null,
    sans_dplus: sortie?.denivele_m == null,
    sans_dmoins: sortie?.denivele_negatif_m == null,
  };
}
