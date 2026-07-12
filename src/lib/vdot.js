// Module VDOT — formules de Jack Daniels (docs/veille/03-science-running.md §2).
// VDOT estimé depuis un temps de course récent → allures E/M/T/I/R individualisées.

/** VO₂ demandé à une vitesse v (m/min) — régression de Daniels & Gilbert. */
function vo2AtVitesse(v) {
  return -4.6 + 0.182258 * v + 0.000104 * v * v;
}

/** Fraction de VO₂max soutenable pendant t minutes — Daniels & Gilbert. */
function fractionVo2max(tMin) {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
}

/** Vitesse (m/min) qui demande un VO₂ donné (inverse de la régression). */
function vitesseAtVo2(vo2) {
  const a = 0.000104, b = 0.182258, c = -(4.6 + vo2);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** "50:00" ou "3:45:00" → minutes décimales. */
export function parseTemps(str) {
  const parts = str.split(":").map(Number);
  if (parts.some(Number.isNaN)) throw new Error(`Temps invalide : ${str}`);
  const [h, m, s] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  return h * 60 + m + s / 60;
}

/** minutes décimales par km → "m:ss/km". */
export function formatAllure(minParKm) {
  const m = Math.floor(minParKm);
  const s = Math.round((minParKm - m) * 60);
  return s === 60 ? `${m + 1}:00/km` : `${m}:${String(s).padStart(2, "0")}/km`;
}

export function formatDuree(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = Math.floor(totalMin % 60);
  const s = Math.round((totalMin - Math.floor(totalMin)) * 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** VDOT depuis une perf (distance en m, temps "mm:ss" ou "h:mm:ss"). */
export function estimerVdot(distance_m, temps) {
  const tMin = parseTemps(temps);
  const v = distance_m / tMin;
  return vo2AtVitesse(v) / fractionVo2max(tMin);
}

// Zones d'entraînement en % du VDOT — Daniels, cf. veille/03 §2.
// @chiffre-derive ⚠️ **Sourçage PARTIEL, et le test des citations l'a attrapé (2026-07-11).**
// veille/03 §2 ne donne que **M 80–84 %, T 88–92 %, I 95–100 %** et « **R > 100 %** ».
// **La zone E (65–74 %) et la borne haute de R (108 %) n'y figurent PAS** : elles viennent des
// tables de Daniels, que le corpus **n'a pas transcrites**. Les valeurs sont réelles, la CITATION
// était trop large. On ne les invente pas — on dit d'où elles viennent, et on demande à la veille
// de transcrire les tables (remonté dans « POUR LE PROPRIÉTAIRE »).
// ⚠️ EXPORTÉE depuis le 2026-07-12 : l'app doit nommer les zones quand on logue une course
// (le journal n'accepte que E/M/T/I/R — `journal.js TYPES_SORTIE`). Une deuxième table de
// libellés dans `app/` serait une table qui divergera (philosophy §11).
export const ZONES = [
  { code: "E", nom: "Endurance fondamentale", basse: 0.65, haute: 0.74 },
  { code: "M", nom: "Allure marathon", basse: 0.8, haute: 0.84 },
  { code: "T", nom: "Seuil (tempo)", basse: 0.88, haute: 0.92 },
  { code: "I", nom: "Intervalle (VO₂max)", basse: 0.95, haute: 1.0 },
  { code: "R", nom: "Répétition (vitesse)", basse: 1.05, haute: 1.08 },
];

/** Allure (min/km) pour une fraction de VDOT donnée. */
export function allurePourFraction(vdot, fraction) {
  return 1000 / vitesseAtVo2(fraction * vdot);
}

/** Table des allures E/M/T/I/R pour un VDOT. */
export function alluresEntrainement(vdot) {
  return ZONES.map((z) => {
    const lente = allurePourFraction(vdot, z.basse);
    const rapide = allurePourFraction(vdot, z.haute);
    return { ...z, allure_min_par_km: { lente, rapide }, affichage: `${formatAllure(lente)} → ${formatAllure(rapide)}` };
  });
}

// Distance marathon (m) — référence pour la correction d'allure conservatrice.
const MARATHON_M = 42195;

/**
 * Allure marathon cible CONSERVATRICE (min/km).
 *
 * Pourquoi : le VDOT (équivalence Riegel/Daniels) suppose une économie de course et
 * une fraction d'utilisation de VO₂max stables quelle que soit la durée — hypothèse
 * fausse pour les coureurs lents / peu endurants, dont il SURESTIME l'allure marathon
 * (temps trop optimiste). L'erreur absolue du VDOT passe de ~1 % pour une élite
 * (sub-2h30) à ~10 % pour un profil sub-5h00 (Oficial-Casado et al., Frontiers in
 * Physiology 2026, DOI 10.3389/fphys.2025.1718298 ; veille/03 §2, veille/12 §4).
 *
 * Correction : facteur de sécurité qui CROÎT avec le temps marathon prédit, nul pour
 * l'élite (≤ 2h30 → VDOT fiable), ancré pour donner ~10 % à 5h00, plafonné à 12 %.
 * Atténué (× 0,3) si la référence est déjà une course longue (semi ou +), le VDOT
 * capturant alors mieux la décroissance d'allure (l'étude privilégie un semi récent,
 * MAE 5,67 %, à un 10 K pour prédire le marathon).
 *
 * @param {number} vdot
 * @param {number|null} refDistance_m  distance de la perf de référence (null si VDOT supposé)
 */
export function allureMarathonConservatrice(vdot, refDistance_m = null) {
  const SEUIL_ELITE_MIN = 150; // 2h30 : en deçà, VDOT fiable → aucune correction
  const PLAFOND_PCT = 12; // garde-fou : ne pas sur-corriger au-delà des données
  const predictionMin = tempsPredit(vdot, MARATHON_M);
  const allureVdot = allurePourFraction(vdot, 0.82); // médiane de la zone M (Daniels)

  // Pente ancrée sur les deux points de l'étude : 0 % à 2h30, ~10 % à 5h00.
  const pctPlein = Math.min(Math.max(0, (predictionMin - SEUIL_ELITE_MIN) * (10 / 150)), PLAFOND_PCT);
  const refEndurante = refDistance_m != null && refDistance_m >= 21000; // semi ou plus
  const pct = refEndurante ? pctPlein * 0.3 : pctPlein;

  const allureConservatrice = allureVdot * (1 + pct / 100);
  return {
    prediction_vdot_min: predictionMin,
    prediction_conservatrice_min: predictionMin * (1 + pct / 100),
    allure_vdot_min_par_km: allureVdot,
    allure_conservatrice_min_par_km: allureConservatrice,
    pct_correction: +pct.toFixed(1),
    ref_endurante: refEndurante,
    applique: pct > 0.05,
  };
}

/** Temps prédit sur une distance (m) au VDOT donné (bissection : VDOT implicite décroît avec t). */
export function tempsPredit(vdot, distance_m) {
  const vdotImplique = (tMin) => vo2AtVitesse(distance_m / tMin) / fractionVo2max(tMin);
  let bas = distance_m / vitesseAtVo2(1.1 * vdot);
  let haut = distance_m / vitesseAtVo2(0.5 * vdot);
  for (let i = 0; i < 60; i++) {
    const milieu = (bas + haut) / 2;
    if (vdotImplique(milieu) > vdot) bas = milieu;
    else haut = milieu;
  }
  return (bas + haut) / 2;
}
