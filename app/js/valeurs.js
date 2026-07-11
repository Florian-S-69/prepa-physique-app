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
  return exo.charge_a_confirmer
    ? { niveau: 'est', texte: estimeKg(exo.charge_depart_kg) }
    : { niveau: 'mes', texte: mesureKg(exo.charge_depart_kg) };
}
