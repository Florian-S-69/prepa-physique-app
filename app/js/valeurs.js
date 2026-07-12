/**
 * valeurs.js — la taxonomie MESURÉ · DÉRIVÉ · ESTIMÉ, côté données.
 *
 * Règle produit **non négociable** (docs/RECHERCHE-ux.md §6, philosophy.md
 * règles 2 et 4) : on n'affiche jamais un chiffre sans dire de quelle nature
 * il est. Un estimé peint comme un mesuré est un mensonge — c'est l'erreur
 * qui coûte à Strava et à Whoop la confiance de leurs utilisateurs.
 *
 *   MESURÉ  saisi ou capté, vérifiable      → précision pleine, DROIT à l'accent
 *   DÉRIVÉ  calcul déterministe sur du mesuré → précision pleine, PAS d'accent
 *   ESTIMÉ  sortie d'un modèle               → « ~ », ARRONDI GROSSIER,
 *                                              accent INTERDIT, « Pourquoi ? » OBLIGATOIRE
 *
 * ── Répartition des rôles ───────────────────────────────────────────────
 *   • le « ~ » et l'interdiction d'accent sont posés par la **CSS**
 *     (`.val--est::before`) : le JS ne peut pas les oublier ;
 *   • **l'arrondi grossier est ici** : la CSS ne sait pas arrondir.
 *
 * ── D'où vient le niveau ? Du moteur, pas d'un jugement de l'app ────────
 * `src/lib/limitations.js` marque lui-même les charges non mesurées
 * (`charge_a_confirmer`). L'app ne devine rien : elle **rend visible** ce que
 * le moteur sait déjà. C'est ce qui garantit que les deux ne divergeront pas.
 */

import { porteUneChargeExterne, estAuPoidsDuCorps } from './seance.js';

/** Les trois niveaux. Le libellé est celui montré à l'utilisateur. */
export const NIVEAUX = {
  mes: { classe: 'val--mes', libelle: 'Mesuré' },
  der: { classe: 'val--der', libelle: 'Dérivé' },
  est: { classe: 'val--est', libelle: 'Estimé' },
};

const NBSP = ' '; // insécable : « 90 kg » ne se coupe pas en fin de ligne

/**
 * « 12,5 » — virgule française, et pas de « ,0 » parasite.
 *
 * ⚠️ Les zéros de fin ne se retirent QUE dans la partie décimale. Une version
 * antérieure appliquait `/[.,]?0+$/` à toute la chaîne : elle transformait
 * « 90 kg » en « 9 kg » et « 180 kg » en « 18 kg ». Attrapé dans un vrai
 * navigateur, pas dans un test unitaire — d'où le garde-fou explicite ci-dessous.
 */
function nombre(v, decimales = 1) {
  const s = Number(v).toFixed(decimales);
  if (!s.includes('.')) return s; // entier : on n'y touche pas
  return s.replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}

// ── MESURÉ ────────────────────────────────────────────────────────────

/** Une charge que l'utilisateur a réellement saisie. Précision pleine : 72,5 kg. */
export const mesureKg = (kg) => `${nombre(kg)}${NBSP}kg`;

// ── LE POIDS DU CORPS — « 0 » n'est pas une charge, c'est une ABSENCE DE LEST ──
//
// 🔴 Le bug que ce vocabulaire supprime (observé le 2026-07-12, séance Pull) :
//    « ✓ Tractions — 3 séries · 0 kg », dans le carnet, en grand.
// L'utilisateur hisse ~84 kg de corps, 8 fois, 3 fois. Le carnet écrivait ZÉRO.
//
// L'erreur était de croire que `0` répondait à la question « quelle CHARGE ? ».
// Il ne répond qu'à « quel LEST ? ». Sur une traction, ce qui monte, c'est le corps —
// et l'app n'a pas le droit de l'appeler « rien ». Ces deux fonctions sont le SEUL
// endroit où l'app met des mots sur une charge sans charge externe.

/** Le mot, une fois pour toutes. Aucune autre formulation dans l'app. */
export const POIDS_DU_CORPS = 'poids du corps';

/** Contexte large (carnet, PRÉVU, bilan) : « poids du corps » · « poids du corps + 5 kg ». */
export const lestKg = (kg) => (!kg ? POIDS_DU_CORPS : `${POIDS_DU_CORPS} +${NBSP}${mesureKg(kg)}`);

/**
 * Grille étroite (colonne FAIT : ~120 px) : « corps » · « corps + 5 kg ».
 * ⚠️ Forme COURTE du même fait, jamais un fait différent — l'en-tête de l'exercice
 * porte déjà « poids du corps » en toutes lettres, la colonne n'a pas à le répéter.
 */
export const lestCourt = (kg) => (!kg ? 'corps' : `corps +${NBSP}${mesureKg(kg)}`);

/** Charge inconnue → « — ». **Jamais « 0 kg »** : un zéro a l'air d'une réponse. */
export const chargeOuTiret = (kg) => (kg == null ? '—' : mesureKg(kg));

/**
 * 🔴 LA SEULE PORTE par laquelle une charge de série peut atteindre l'écran.
 *
 * Elle existe pour qu'il n'y ait **aucun chemin** capable de réafficher « 0 kg » sur une
 * traction. L'écran n'a plus le droit d'appeler `mesureKg()` sur une charge de série : il
 * passe par ici, et ici on sait si l'exercice porte une charge externe.
 *
 * @param {boolean} court  colonne étroite (la grille) : « corps » plutôt que « poids du corps ».
 */
export const chargeDeSerie = (bloc, kg, court = false) =>
  estAuPoidsDuCorps(bloc)
    ? (court ? lestCourt(kg ?? 0) : lestKg(kg ?? 0))
    : chargeOuTiret(kg);

/**
 * 🔴 CE QU'UN EXERCICE FINI A SOULEVÉ — sa CHARGE, jamais son tonnage.
 *
 * Le récap affichait « Développé couché — 3 séries · **720 kg** ». Ce n'était pas la charge,
 * c'était Σ charge × reps — et **deux exercices à 60 et 40 kg affichaient tous deux 720**.
 * Collé au nom de l'exercice, en chasse fixe, un tonnage est **assez plausible pour être cru**.
 *
 * Le tonnage n'est pas supprimé : il passe derrière le tap, **étiqueté**. Ici, la charge.
 * @param {ReturnType<import('./seance.js').resumeBloc>} r
 */
export function chargeDuResume(r) {
  if (!r?.series) return null;
  const bas = r.charge_basse_kg;
  const haut = r.charge_haute_kg;
  if (r.au_poids_du_corps) {
    // Une rampe de LEST : « poids du corps → poids du corps + 5 kg » serait bavard.
    return bas === haut ? lestKg(haut) : `${lestKg(bas)} → ${lestKg(haut)}`;
  }
  // On ne moyenne pas une montée en charge : moyenner fabriquerait un chiffre que
  // personne n'a soulevé. On montre les deux bouts.
  return bas === haut ? mesureKg(haut) : `${nombre(bas)} → ${mesureKg(haut)}`;
}

// ── DÉRIVÉ ────────────────────────────────────────────────────────────

/** Un compte exact (Σ séries, nb d'exercices). Exact par construction. */
export const derive = (n, unite = '') => `${nombre(n, 0)}${unite ? NBSP + unite : ''}`;

// ── ESTIMÉ ────────────────────────────────────────────────────────────

/**
 * ⚠️ **La précision affichée est une déclaration de confiance** (P18).
 * Une charge estimée est arrondie **à 5 kg** : afficher « 82,5 kg » quand on
 * ne sait pas à 20 kg près, c'est prétendre savoir à l'hectogramme.
 *
 * ⚠️ Ne PAS préfixer « ~ » ici : la CSS le pose (`.val--est::before`). Le
 * faire aussi en JS le dupliquerait — et transformerait une contrainte en
 * simple convention.
 */
export const estimeKg = (kg) => `${nombre(Math.round(Number(kg) / 5) * 5, 0)}${NBSP}kg`;

/**
 * Le niveau d'une charge de départ, **lu sur les marqueurs du moteur**.
 * @returns {{niveau: 'mes'|'est'|null, texte: string|null}}
 *          `niveau: null` = pas de charge du tout (elle reste à établir).
 */
export function chargeDepart(exo) {
  if (exo.charge_depart_kg == null) return { niveau: null, texte: null };
  // 🔴 Sans charge externe (traction, gainage), le chiffre du moteur est un LEST.
  // Le rendre « 0 kg » écrirait que rien n'a été soulevé. C'est MESURÉ — c'est un fait,
  // pas une estimation : il n'y a pas de disque accroché, point.
  if (!porteUneChargeExterne(exo.equipement, exo.id ?? null)) {
    return { niveau: 'mes', texte: lestKg(exo.charge_depart_kg) };
  }
  return exo.charge_a_confirmer
    ? { niveau: 'est', texte: estimeKg(exo.charge_depart_kg) }
    : { niveau: 'mes', texte: mesureKg(exo.charge_depart_kg) };
}
