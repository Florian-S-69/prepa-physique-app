// Module nutrition — règles issues de docs/veille/04-nutrition-calories.md
// Estimations d'information générale, pas un avis médical/diététique.
//
// 🔴 **CE QUI A ÉTÉ RETIRÉ D'ICI LE 2026-07-11, ET POURQUOI.**
// `const PLANCHER_KCAL = { homme: 1500, femme: 1200 };` — un refus de prescrire sous ces seuils,
// **sourcé à `veille/04 §5`**. Or `veille/04 §5` est la section « **Compléments alimentaires** » :
// elle ne contient **aucun** de ces chiffres. Ils venaient en réalité d'une **guideline d'obésité**
// (AHA/ACC/TOS 2013), où ils sont la **cible d'un régime hypocalorique sous suivi médical** — pas
// un seuil de sécurité pour quelqu'un qui s'entraîne 6 fois par semaine. **Erreur de catégorie**,
// et **faux sourçage** (veille/21 §7.1).
// **Et l'instrument était le mauvais** : la grandeur qui gouverne le RED-S est la **disponibilité
// énergétique**, que ce module ne calculait jamais. Aux deux planchers, elle tombe à ~55 % du seuil
// d'alerte **pendant que le moteur affichait « conforme »**.
// → Remplacé par `red-s.js` : le moteur calcule la DE **s'il a les données**, et **AVOUE qu'il ne
// peut pas surveiller le RED-S** sinon. **Un « je ne sais pas » explicite vaut infiniment mieux
// qu'un garde-fou qui rassure à tort.**

import { evaluerRedS } from "./red-s.js";

const KCAL_PAR_G = { proteines: 4, glucides: 4, lipides: 9 };

/** BMR Mifflin-St Jeor (veille/04 §1). */
export function bmrMifflin({ sexe, age, taille_cm, poids_kg }) {
  const s = sexe === "femme" ? -161 : 5;
  return 10 * poids_kg + 6.25 * taille_cm - 5 * age + s;
}

/**
 * Objectif calorique selon le but (veille/04 §2).
 * Retourne { delta, libelle }.
 */
export function objectifCalorique(objectif) {
  switch (objectif) {
    case "prise_de_muscle":
      return { delta: 250, libelle: "lean bulk : surplus modéré +200 à +300 kcal/j" };
    case "perte_de_gras":
      return { delta: -400, libelle: "déficit modéré −300 à −500 kcal/j (préserver la masse maigre)" };
    case "maintien_prepa":
      return { delta: 0, libelle: "maintien — un coureur en prépa doit assez manger (veille/12 §5) ; surtout pas de déficit involontaire" };
    case "maintien":
      return { delta: 0, libelle: "maintien : ≈ TDEE" };
    case "recomposition":
    default:
      return { delta: 0, libelle: "recomposition : ≈ TDEE, protéines hautes + entraînement en force" };
  }
}

/**
 * Calcul complet BMR → TDEE → cible kcal → macros (veille/04).
 * Les protéines sont fixées en g/kg (1,6–2,2), les lipides en g/kg (plancher 0,6–0,8),
 * les glucides absorbent le reste (carburant de l'intensité).
 */
export function calculNutrition(persona) {
  const { profil, nutrition } = persona;
  const bmr = Math.round(bmrMifflin(profil));
  const tdee = Math.round(bmr * nutrition.facteur_activite);
  const { delta, libelle } = objectifCalorique(nutrition.objectif);
  const cible = tdee + delta;

  // --- RED-S : le garde-fou qui compte (veille/21 §7.1) -------------------------------------
  // ⚠️ Aucun plancher calorique absolu ici. Il n'y en a **plus**, et il n'y en a **pas de nouveau** :
  // `veille/04 §9` demande de « ne pas descendre sous des planchers caloriques dangereux » **sans
  // donner de nombre**, et le moteur **n'en invente pas**. Ce qu'il fait à la place : il évalue la
  // **disponibilité énergétique** s'il a les données, et il **dit qu'il ne la surveille pas** sinon.
  const red_s = evaluerRedS(persona, cible, bmr);
  if (red_s.statut === "REFUS") {
    const motifs = red_s.freins.filter((f) => f.refus).map((f) => f.message).join("\n\n");
    throw new Error(
      `Refus de prescrire ce déficit — un frein RED-S a mordu (veille/21 §7.4).\n\n${motifs}\n\n` +
        "Le moteur ne négocie pas ce refus : il n'a pas d'autre chiffre à te proposer, et il ne fera pas semblant d'en avoir un."
    );
  }

  const proteines_g = Math.round(nutrition.proteines_g_par_kg * profil.poids_kg);
  const lipides_g = Math.round(nutrition.lipides_g_par_kg * profil.poids_kg);
  const proteines_kcal = proteines_g * KCAL_PAR_G.proteines;
  const lipides_kcal = lipides_g * KCAL_PAR_G.lipides;
  const glucides_kcal = cible - proteines_kcal - lipides_kcal;
  if (glucides_kcal < 0) {
    throw new Error("Répartition impossible : protéines + lipides dépassent la cible calorique.");
  }
  const glucides_g = Math.round(glucides_kcal / KCAL_PAR_G.glucides);

  return {
    bmr,
    tdee,
    cible,
    red_s,
    objectif: { code: nutrition.objectif, libelle, delta },
    macros: {
      proteines: { g: proteines_g, kcal: proteines_kcal, g_par_kg: nutrition.proteines_g_par_kg },
      lipides: { g: lipides_g, kcal: lipides_kcal, g_par_kg: nutrition.lipides_g_par_kg },
      glucides: { g: glucides_g, kcal: glucides_kcal, g_par_kg: +(glucides_g / profil.poids_kg).toFixed(1) },
    },
  };
}
