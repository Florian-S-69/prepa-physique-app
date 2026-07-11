// RED-S — LE GARDE-FOU QUI COMPTE, ET L'AVEU QUAND IL NE PEUT PAS TOURNER
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// POURQUOI CE MODULE REMPLACE `PLANCHER_KCAL`
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 Le moteur refusait de prescrire sous `{ homme: 1500, femme: 1200 }` kcal, **en citant
// `veille/04 §5`**. Deux mensonges dans une seule ligne :
//
//   1. **`veille/04 §5` est la section « Compléments alimentaires ».** Elle ne contient aucun de
//      ces chiffres. La section des garde-fous est `veille/04 §9`, et elle dit seulement :
//      *« ne pas descendre sous des planchers caloriques dangereux »* — **sans aucun nombre**.
//      **Le moteur avait donc fabriqué les deux, et les avait sourcés à une section qui parle
//      d'autre chose.**
//   2. D'où venaient-ils vraiment : de la **2013 AHA/ACC/TOS Guideline** (Jensen, Ryan et al.,
//      _Circulation_ 2014), qui prescrit **1 200–1 500 kcal/j (femmes)** et **1 500–1 800
//      (hommes)** comme **CIBLE d'un régime hypocalorique** à des adultes **en obésité**, **sous
//      suivi médical**. **Ce n'est pas un plancher de sécurité pour un sportif à l'entraînement.
//      C'est une erreur de catégorie** (veille/21 §7.1).
//
// 🔴 **Et l'instrument était le mauvais.** La grandeur qui gouverne le RED-S n'est pas l'apport
// absolu, c'est la **DISPONIBILITÉ ÉNERGÉTIQUE** :
//
//     DE = (apport − dépense énergétique de l'exercice) / masse maigre    [kcal/kg MM/j]
//
// Aux deux planchers, la DE tombe à **~55 % du seuil d'alerte** pendant que le moteur affichait
// « conforme » (illustration arithmétique, veille/21 §7.1). **Le garde-fou ne gardait rien** — et
// il accordait le plancher **le plus bas** aux femmes, la population la plus exposée. Le défaut
// n'était pas « sexiste », il était **structurel** : il cassait aussi pour les deux personas
// masculins, depuis le premier jour.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// LA DOCTRINE DE CE MODULE : UN « JE NE SAIS PAS » EXPLICITE > UN GARDE-FOU QUI MENT
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Le moteur **ne mesure ni la masse maigre ni la dépense réelle de l'entraînement**. Il ne peut
// donc **pas** calculer la DE — sauf si l'utilisateur **déclare** ce qui manque.
//
//   • Données présentes  → la DE est calculée, et le seuil **sourcé** de 30 kcal/kg MM/j
//     (veille/21 §6.3) sert de **FREIN** : sous ce seuil, **refus de creuser le déficit**.
//   • Données absentes   → le moteur **AVOUE** qu'il ne surveille pas le RED-S, dit **exactement**
//     ce qui lui manque, et **n'affiche aucune fausse conformité**.
//
// ⚠️ **Ce qu'on ne fait PAS : remplacer un chiffre inventé par un autre chiffre inventé.**
// Le moteur **n'estime pas** la masse maigre depuis l'IMC (aucune formule sourcée dans le corpus),
// et **n'estime pas** la dépense d'exercice depuis le facteur d'activité (c'est un multiplicateur
// de TDEE, pas un coût d'entraînement séparable). Sous-estimer la dépense **surestimerait la DE**
// — l'erreur irait dans le sens **dangereux**. On s'abstient, et on le dit.
//
// Module **PUR** : aucune I/O, aucune dépendance.

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LES SEUILS — TOUS SOURCÉS, TOUS NUANCÉS
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @chiffre-de-la-veille veille/21 §6.3
 * Seuil d'ALERTE de disponibilité énergétique, en kcal/kg de masse maigre/jour.
 *
 * ⚠️ **Ce n'est pas un diagnostic, et il est ÉTROIT.** Il vient de Loucks & Thuma 2003 :
 * **29 femmes réglées SÉDENTAIRES**, DE fixée **5 jours**, **un seul marqueur** (pulsatilité de
 * LH). Le **consensus CIO 2023 a lui-même abandonné le seuil unique** au profit d'un **spectre**
 * « adaptable ↔ problématique ». On l'utilise **faute de mieux**, comme **frein**, jamais comme
 * frontière nette — et on le dit (anti-survente : on ne durcit pas un chiffre mou).
 */
export const SEUIL_DE_ALERTE_KCAL_KG_MM = 30;

/**
 * @chiffre-de-la-veille veille/21 §7.4
 * Perte de poids hebdomadaire (% du poids de corps) au-delà de laquelle le moteur **remonte les
 * calories** et ne propose **jamais** d'accélérer. Frein comportemental, pas un diagnostic.
 */
export const SEUIL_PERTE_HEBDO_PCT = 1;

/**
 * @chiffre-de-la-veille veille/21 §7.4
 * Durée (semaines) au-delà de laquelle un déficit continu appelle une **phase de maintien**.
 */
export const SEUIL_DEFICIT_SEMAINES = 12;

/** Les objectifs nutrition qui CREUSENT un déficit. Un frein RED-S ne mord que sur eux. */
const OBJECTIFS_EN_DEFICIT = new Set(["perte_de_gras"]);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 🔴 LA BORNE DE DERNIER RECOURS — ET POURQUOI CE N'EST **PAS** UN SEUIL DE SÉCURITÉ
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Retirer `PLANCHER_KCAL` sans rien mettre, c'est laisser le moteur prescrire **676 kcal/j** à une
// femme de 42 kg qui s'entraîne (cas réel de la suite de tests). **Inacceptable.** La veille le dit
// (§10.1) : *« garder un plancher absolu en filet de secours, mais le RÉ-ÉTIQUETER : ce n'est pas un
// seuil de sécurité, c'est une borne de dernier recours »*.
//
// **Mais on ne remplace pas un chiffre inventé par un autre chiffre inventé.** Alors on n'invente
// **aucun** nombre : la borne est le **métabolisme de base de la personne** (Mifflin-St Jeor,
// veille/04 §1) — une grandeur que le moteur **calcule déjà** et **cite déjà**.
//
// > **Ce n'est PAS un seuil de sécurité RED-S. C'est une INCOHÉRENCE ARITHMÉTIQUE.**
// > Une cible sous le BMR demande de manger moins que la dépense **au repos, entraînement non
// > compris**. Aucune science n'est nécessaire pour refuser ça — c'est de la soustraction.
//
// **Le moteur ne sait toujours pas où est le vrai plancher de sécurité** (la veille n'en donne
// **aucun**, et le bon instrument est la disponibilité énergétique). **Il sait seulement qu'il ne
// doit pas aller sous celui-ci.** Et il est **sexe-aveugle** par construction : le sexe n'entre que
// par la constante de Mifflin, seul usage physiologiquement fondé (veille/21 §6.2).
// **L'ancien plancher accordait le seuil le plus BAS aux femmes. Celui-ci ne peut pas.**

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LES DEUX ENTRÉES QUI MANQUENT — et le moteur ne les invente pas
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Masse maigre, **uniquement** si elle est déclarée ou dérivable d'une donnée déclarée.
 * `null` sinon — **aucune estimation depuis l'IMC** : le corpus n'en source aucune, et une masse
 * maigre surestimée **abaisserait** la DE calculée… tandis qu'une sous-estimée la **gonflerait**.
 * Sur un garde-fou de sécurité, un chiffre plausible mais faux est pire que pas de chiffre.
 */
export function masseMaigreKg(profil = {}) {
  if (Number.isFinite(profil.masse_maigre_kg) && profil.masse_maigre_kg > 0) {
    return { kg: +Number(profil.masse_maigre_kg).toFixed(1), origine: "`profil.masse_maigre_kg` (déclarée)" };
  }
  const pct = Number(profil.masse_grasse_pct);
  if (Number.isFinite(pct) && pct > 0 && pct < 100 && Number.isFinite(profil.poids_kg)) {
    return {
      kg: +(profil.poids_kg * (1 - pct / 100)).toFixed(1),
      origine: `dérivée de \`profil.masse_grasse_pct\` (${pct} %) × \`poids_kg\` — **estimation**, pas une mesure (DEXA/impédance : marges réelles)`,
    };
  }
  return null;
}

/**
 * Dépense énergétique de l'EXERCICE (kcal/j), **uniquement si déclarée**.
 *
 * ⚠️ Le moteur **refuse** de la dériver du `facteur_activite` : ce multiplicateur couvre **toute**
 * l'activité de la journée (déplacements, travail, NEAT), pas le seul coût de l'entraînement. En
 * extraire un « coût d'exercice » serait **fabriquer** — et l'erreur pousserait la DE vers le haut,
 * donc vers la **fausse conformité**. C'est exactement le défaut qu'on est en train de réparer.
 */
export function depenseExerciceKcalJ(persona) {
  const v = Number(persona?.nutrition?.depense_exercice_kcal_j);
  return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// L'ÉVALUATION
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Disponibilité énergétique pour une cible calorique donnée.
 * Retourne `{ calculable: false, manque: [...] }` **plutôt qu'un chiffre inventé**.
 */
export function disponibiliteEnergetique(persona, cible_kcal) {
  const mm = masseMaigreKg(persona?.profil);
  const depense = depenseExerciceKcalJ(persona);

  const manque = [];
  if (!mm) {
    manque.push(
      "**ta masse maigre** — ni `profil.masse_maigre_kg`, ni `profil.masse_grasse_pct` ne sont déclarés, et le moteur " +
        "**n'estime pas** une composition corporelle depuis l'IMC (aucune formule sourcée dans le corpus)"
    );
  }
  if (depense == null) {
    manque.push(
      "**la dépense énergétique de tes entraînements** — `nutrition.depense_exercice_kcal_j` n'est pas déclarée, et le " +
        "moteur **refuse** de la dériver du facteur d'activité (ce multiplicateur couvre toute la journée, pas le seul " +
        "entraînement : en extraire un coût d'exercice **surestimerait** ta disponibilité énergétique, donc **rassurerait à tort**)"
    );
  }
  if (manque.length) return { calculable: false, manque, masse_maigre: mm, depense_exercice_kcal_j: depense };

  const de = +((cible_kcal - depense) / mm.kg).toFixed(1);
  return {
    calculable: true,
    manque: [],
    masse_maigre: mm,
    depense_exercice_kcal_j: depense,
    de_kcal_kg_mm: de,
    seuil: SEUIL_DE_ALERTE_KCAL_KG_MM,
    sous_le_seuil: de < SEUIL_DE_ALERTE_KCAL_KG_MM,
  };
}

/**
 * Évalue le risque RED-S pour une cible calorique. **Fonction PURE.** Ne lève rien : c'est
 * l'appelant (`calculNutrition`) qui transforme un `refus` en refus de prescrire.
 *
 * Statuts :
 *  - `REFUS`                    → un frein sourcé a mordu. Le moteur **ne creuse pas** le déficit.
 *  - `SURVEILLANCE_IMPOSSIBLE`  → le moteur **ne peut pas** surveiller le RED-S. Il le **dit**.
 *  - `VIGILANCE`                → DE calculable et au-dessus du seuil, mais on rappelle la nuance.
 *  - `SANS_OBJET`               → aucun déficit prescrit : le frein n'a rien à freiner.
 */
export function evaluerRedS(persona, cible_kcal, bmr_kcal = null) {
  const objectif = persona?.nutrition?.objectif;
  const enDeficit = OBJECTIFS_EN_DEFICIT.has(objectif);
  const sEntraine = Boolean(persona?.muscu || persona?.running);
  const de = disponibiliteEnergetique(persona, cible_kcal);

  const freins = [];

  // 🔴 BORNE DE DERNIER RECOURS — incohérence arithmétique, pas seuil de sécurité (cf. ci-dessus).
  if (Number.isFinite(bmr_kcal) && cible_kcal < bmr_kcal) {
    freins.push({
      code: "SOUS_LE_METABOLISME_DE_BASE",
      refus: true,
      message:
        `🔴 **Cible de ${cible_kcal} kcal/j, sous ton métabolisme de base (${bmr_kcal} kcal/j) — le moteur ne prescrit pas ça.** ` +
        "Ce serait te demander de manger moins que ce que ton corps dépense **au repos, entraînement non compris**. " +
        "⚠️ **Ce n'est PAS un « seuil de sécurité » — le moteur n'en a plus, et il ne fera pas semblant d'en avoir un.** " +
        "C'est une **borne de dernier recours** : une **incohérence arithmétique**, pas un résultat de science. " +
        "**Où est le vrai plancher ? Le moteur ne le sait pas** — la veille n'en donne aucun, et le bon instrument est la " +
        "**disponibilité énergétique**, qu'il ne peut pas calculer sans ta masse maigre et ta dépense réelle. " +
        "**Il sait seulement qu'il ne doit pas aller sous celle-ci.** → Revois l'objectif à la hausse, et parles-en à un professionnel de santé.",
    });
  }

  // R4 (veille/21 §10.2) — aménorrhée DÉCLARÉE + déficit → aucun déficit. On n'interprète pas,
  // on ne diagnostique pas : on s'arrête et on oriente.
  if (persona?.profil?.amenorrhee && enDeficit) {
    freins.push({
      code: "AMENORRHEE_DECLAREE",
      refus: true,
      message:
        "🔴 **Aménorrhée déclarée + déficit calorique demandé → le moteur ne prescrit pas ce déficit** (veille/21 §7.4). " +
        "Un cycle absent chez une personne qui s'entraîne est un **signal fréquent et jamais anodin** — il peut être le " +
        "premier signe visible d'une **disponibilité énergétique basse** (RED-S). ⚠️ **Le moteur ne le diagnostique pas et " +
        "ne le nommera pas** : ce n'est ni son rôle ni sa compétence. **Il s'arrête, et il oriente vers un professionnel de santé.**",
    });
  }

  // R3 (veille/21 §10.2) — DE sous le seuil sourcé + déficit → refus de creuser.
  if (de.calculable && de.sous_le_seuil && enDeficit) {
    freins.push({
      code: "DE_SOUS_SEUIL",
      refus: true,
      message:
        `🔴 **Disponibilité énergétique estimée à ${de.de_kcal_kg_mm} kcal/kg de masse maigre/j, sous le seuil d'alerte de ` +
        `${SEUIL_DE_ALERTE_KCAL_KG_MM}** (veille/21 §6.3) — **le moteur refuse de creuser le déficit.** ` +
        `Calcul : (${cible_kcal} kcal − ${de.depense_exercice_kcal_j} kcal d'entraînement) / ${de.masse_maigre.kg} kg de masse maigre. ` +
        "⚠️ **Ce seuil est un SIGNAL, pas un diagnostic** : il vient de 29 femmes sédentaires suivies 5 jours (Loucks 2003), et " +
        "le consensus CIO 2023 a **lui-même abandonné le seuil unique** au profit d'un spectre. Le moteur le prend au sérieux " +
        "**parce qu'il est conservateur**, pas parce qu'il est net. **Remonte les calories, ou baisse la dépense — et parle-en à un professionnel.**",
    });
  }

  // Frein comportemental (veille/21 §7.4) — déficit qui dure. Pas un refus : une phase de maintien.
  const semaines = Number(persona?.nutrition?.deficit_depuis_semaines);
  if (enDeficit && Number.isFinite(semaines) && semaines > SEUIL_DEFICIT_SEMAINES) {
    freins.push({
      code: "DEFICIT_PROLONGE",
      refus: false,
      message:
        `🟠 **Déficit déclaré depuis ${semaines} semaines, au-delà des ~${SEUIL_DEFICIT_SEMAINES} semaines** au-delà desquelles ` +
        "la veille demande une **phase de maintien** (veille/21 §7.4). Le moteur **ne propose pas d'enchaîner** : passe à " +
        "`maintien` quelques semaines avant de relancer un déficit. **Un déficit qui dure n'est pas une preuve de sérieux : " +
        "c'est le terrain du RED-S.**",
    });
  }

  // Orientation FER (veille/21 §6.4 / §10.1) — femme + course + fatigue persistante DÉCLARÉE.
  // ⚠️ Aucune supplémentation prescrite (R7), aucun seuil de « volume élevé » inventé : le corpus
  // n'en source aucun, donc le moteur se contente de « tu cours ET tu déclares une fatigue qui dure ».
  if (persona?.profil?.sexe === "femme" && persona?.running?.course && persona?.profil?.fatigue_persistante) {
    freins.push({
      code: "ORIENTATION_FER",
      refus: false,
      message:
        "🟠 **Fatigue persistante déclarée + volume de course : parles-en à un médecin (bilan martial).** Jusqu'à **60 % des " +
        "athlètes féminines** présentent une carence en fer (ferritine < 40 µg/L), avec **−3 à −4 % d'endurance** (veille/21 §6.4). " +
        "🚫 **Le moteur ne te prescrit AUCUN complément en fer** — une carence se **dose** (prise de sang) et se **traite " +
        "médicalement** ; se supplémenter à l'aveugle expose à une **surcharge**. **C'est une orientation, pas une prescription.**",
    });
  }

  const refuse = freins.some((f) => f.refus);
  if (refuse) return { statut: "REFUS", freins, disponibilite: de, en_deficit: enDeficit };

  if (!enDeficit || !sEntraine) {
    return { statut: "SANS_OBJET", freins, disponibilite: de, en_deficit: enDeficit };
  }
  if (!de.calculable) {
    return { statut: "SURVEILLANCE_IMPOSSIBLE", freins, disponibilite: de, en_deficit: enDeficit };
  }
  return { statut: "VIGILANCE", freins, disponibilite: de, en_deficit: enDeficit };
}
