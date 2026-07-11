// Table des distances de course — extraite de `running.js` le 2026-07-12.
//
// **Pourquoi un module à part.** `personne.js` a besoin de la distance objectif **en mètres** pour
// pondérer les performances (la distance la plus proche de l'objectif est le meilleur prédicteur —
// veille/03 §2, veille/12 §4). Or `personne.js` → `running.js` → `limitations.js` → `personne.js`
// est un **cycle d'imports**. Plutôt que de dupliquer la table (philosophy §11 : « un fait dupliqué
// est un fait qui divergera »), on la sort dans un module **sans aucune dépendance**.
// `running.js` la **ré-exporte** : aucun appelant historique ne casse.

// Paramètres par distance. prep_sem : fourchette recommandée (veille/12 §2 pour le
// marathon ; proportionnel pour les autres). taper : coefficients des dernières
// semaines (réduire le volume, garder l'intensité — veille/03 §3).
// ls_plafond : longue sortie max (au-delà, coût de récup > bénéfice pour "finir").
// fin_M : seuil de longue (km) à partir duquel on finit à allure M (spécificité,
// veille/12 §3) — uniquement pertinent semi/marathon.
// @chiffre-derive Les distances officielles (21,0975 · 42,195 km) sont des FAITS, pas des claims de
// la veille. Les durées de prépa, plafonds de longue sortie et paliers sont des **paramètres
// d'outil** dérivés des principes de veille/12 §2–§3 (spécificité, progressivité), pas des nombres
// transcrits de la veille. La règle est sourcée ; la graduation est une décision d'ingénierie.
export const DISTANCES = {
  "5k": { km: 5, label: "5 km", prep_sem: [6, 10], min_sem: 3, taper: [0.5], ls_plafond: 12, fin_M: null, pas_ls: 1 },
  "10k": { km: 10, label: "10 km", prep_sem: [8, 12], min_sem: 4, taper: [0.5], ls_plafond: 16, fin_M: null, pas_ls: 1 },
  semi: { km: 21.0975, label: "semi-marathon", prep_sem: [10, 14], min_sem: 6, taper: [0.6, 0.35], ls_plafond: 20, fin_M: 14, pas_ls: 2 },
  marathon: { km: 42.195, label: "marathon", prep_sem: [16, 20], min_sem: 8, taper: [0.65, 0.5, 0.3], ls_plafond: 26, fin_M: 20, pas_ls: 2 },
};

/** Distance objectif en MÈTRES depuis son code (« marathon » → 42195), ou `null` si inconnu. */
export function distanceObjectifM(code) {
  const d = DISTANCES[code];
  return d ? Math.round(d.km * 1000) : null;
}
