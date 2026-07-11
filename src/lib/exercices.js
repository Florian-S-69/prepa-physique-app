// Référentiel d'exercices — couche de mapping entre la base publique free-exercise-db
// (`data/exercises.json`, 873 exercices, domaine public — veille/05) et la taxonomie du moteur.
//
// Module PUR : il ne lit aucun fichier. Le tableau brut est chargé UNE FOIS par le CLI
// (ou par les tests) et injecté via `chargerReferentiel`.
//
// Pourquoi une couche explicite plutôt qu'un classement automatique des 873 exercices :
// le dataset n'a AUCUNE notion de « pattern moteur » (squat / hinge / poussée horizontale…),
// qui est la brique du moteur. Le déduire par heuristique (force + muscles + mots-clés du nom)
// produirait des erreurs silencieuses — inacceptable sur un produit de santé (philosophy §3).
// On déclare donc, pour chaque SLOT du programme, la liste ORDONNÉE des exercices du dataset
// qui le remplissent ; le premier compatible avec le matériel et le niveau gagne. Tout le
// reste (muscles, niveau, matériel, mécanique, instructions) vient du dataset, pas de nous.
//
// Arbitrages assumés (budget serré, cf. JOURNAL-moteur 2026-07-11) :
//  1. Table de slots > classifieur : ~20 slots × 3-4 candidats, testé, extensible d'une ligne.
//  2. `equipment: null` (77 exercices du dataset) = donnée MANQUANTE, pas « sans matériel ».
//     Corrigée explicitement pour les seuls candidats utilisés (EQUIPEMENT_CORRIGE) ; un
//     candidat à `null` non corrigé fait échouer les tests.
//  3. Niveau : `expert` n'est prescrit qu'à un pratiquant `avance`. `beginner`/`intermediate`
//     sont ouverts à tous — le dataset classe `intermediate` des exercices standards
//     (soulevé de terre roumain…) ; sur-filtrer viderait le catalogue.

// --- Taxonomie muscles : 17 groupes du dataset → muscles du moteur (français) -------------
export const MUSCLE_MOTEUR = {
  quadriceps: "quadriceps",
  hamstrings: "ischios",
  glutes: "fessiers",
  calves: "mollets",
  chest: "pectoraux",
  shoulders: "épaules",
  triceps: "triceps",
  biceps: "biceps",
  lats: "dos",
  "middle back": "dos",
  "lower back": "lombaires",
  traps: "trapèzes",
  forearms: "avant-bras",
  abdominals: "core",
  neck: "cou",
  adductors: "adducteurs",
  abductors: "abducteurs",
};

// Muscles accessoires : jamais alertés sur le volume (ils ne sont pas des cibles
// d'hypertrophie pilotées par le programme, ils accompagnent les composés).
export const MUSCLES_ACCESSOIRES = [
  "core", "mollets", "lombaires", "trapèzes", "avant-bras", "cou", "adducteurs", "abducteurs",
];

// --- Matériel : profils du moteur → valeurs `equipment` du dataset ------------------------
// « salle_complete » = tout. « halteres » = home-gym réaliste (haltères/kettlebells/élastiques
// + poids du corps). « poids_du_corps » = rien d'autre que le corps (une barre de traction /
// un rebord de table comptent comme `body only`, convention du dataset lui-même : `Pullups`
// y est classé `body only`).
export const PROFILS_MATERIEL = {
  salle_complete: [
    "body only", "barbell", "dumbbell", "machine", "cable", "kettlebells", "bands",
    "e-z curl bar", "exercise ball", "medicine ball", "foam roll", "other",
  ],
  halteres: ["body only", "dumbbell", "kettlebells", "bands", "exercise ball", "medicine ball"],
  poids_du_corps: ["body only"],
};

// `equipment: null` dans le dataset = non renseigné. Correction explicite pour les candidats
// utilisés (et eux seuls). Cf. `Inverted_Row` : rangé `body only`, comme `Pullups`.
export const EQUIPEMENT_CORRIGE = {
  Inverted_Row: "body only",
  Bodyweight_Walking_Lunge: "body only",
  "Floor_Glute-Ham_Raise": "body only",
};

const NIVEAU_DATASET = { beginner: 1, intermediate: 2, expert: 3 };
const PLAFOND_NIVEAU = { debutant: 2, intermediaire: 2, avance: 3 };

// --- Noms français (couche produit ; le dataset est en anglais) ---------------------------
// Le nom est la clé utilisée par le journal et `charges_reference` → il est stable et lisible.
// `id` reste porté dans la sortie : traçabilité vers le dataset (instructions, images).
const NOMS = {
  Barbell_Squat: "Squat barre",
  Dumbbell_Squat: "Squat haltères",
  Goblet_Squat: "Squat gobelet",
  Bodyweight_Squat: "Squat au poids du corps",
  Leg_Press: "Presse à cuisses",
  Hack_Squat: "Hack squat",
  "Squats_-_With_Bands": "Squat avec élastiques",
  Freehand_Jump_Squat: "Squat sauté",
  Barbell_Walking_Lunge: "Fentes marchées barre",
  Dumbbell_Lunges: "Fentes haltères",
  Split_Squat_with_Dumbbells: "Split squat haltères",
  Bodyweight_Walking_Lunge: "Fentes marchées au poids du corps",
  // ⚠️ Deux mouvements DISTINCTS, à ne jamais confondre (deux patterns, deux fonctions) :
  //  - Barbell_Deadlift  = soulevé de terre CONVENTIONNEL : charnière de hanche LOURDE, départ
  //    au sol, moteur principal = érecteurs/chaîne postérieure. C'est le mouvement le plus lourd
  //    de la salle, et la pièce maîtresse d'un objectif de FORCE (veille/09 §1).
  //  - Romanian_Deadlift = soulevé de terre ROUMAIN : charnière ischio-dominante, départ debout,
  //    pas de repose au sol, charges bien plus légères. C'est un ACCESSOIRE, pas un substitut.
  Barbell_Deadlift: "Soulevé de terre",
  Trap_Bar_Deadlift: "Soulevé de terre trap bar",
  Sumo_Deadlift: "Soulevé de terre sumo",
  Romanian_Deadlift: "Soulevé de terre roumain",
  "Stiff-Legged_Dumbbell_Deadlift": "Soulevé de terre jambes tendues haltères",
  Natural_Glute_Ham_Raise: "Glute-ham raise naturel",
  Single_Leg_Glute_Bridge: "Pont fessier unilatéral",
  Lying_Leg_Curls: "Leg curl allongé",
  Seated_Leg_Curl: "Leg curl assis",
  Ball_Leg_Curl: "Leg curl au swiss ball",
  "Floor_Glute-Ham_Raise": "Glute-ham raise au sol",
  "Barbell_Bench_Press_-_Medium_Grip": "Développé couché barre",
  Dumbbell_Bench_Press: "Développé couché haltères",
  "Bench_Press_-_With_Bands": "Développé couché avec élastiques",
  Pushups: "Pompes",
  // Variantes à trajectoire GUIDÉE / prise NEUTRE : elles ne servent pas la composition
  // normale des séances (elles ne sont candidates d'aucun slot), mais la SUBSTITUTION par
  // limitation (limitations.js) — même pattern, moins de demande de stabilisation d'épaule
  // (veille/09 §4 : alternative par douleur AU SEIN du même pattern).
  Smith_Machine_Bench_Press: "Développé couché à la Smith",
  Dumbbell_Bench_Press_with_Neutral_Grip: "Développé couché haltères prise neutre",
  Smith_Machine_Incline_Bench_Press: "Développé incliné à la Smith",
  "Barbell_Incline_Bench_Press_-_Medium_Grip": "Développé incliné barre",
  Hammer_Grip_Incline_DB_Bench_Press: "Développé incliné haltères (prise neutre)",
  "Push-Ups_With_Feet_Elevated": "Pompes pieds surélevés",
  Parallel_Bar_Dip: "Dips aux barres parallèles",
  "Dips_-_Triceps_Version": "Dips (version triceps)",
  Bench_Dips: "Dips sur banc",
  Standing_Military_Press: "Développé militaire",
  Seated_Dumbbell_Press: "Développé haltères assis",
  "Shoulder_Press_-_With_Bands": "Développé épaules avec élastiques",
  "Handstand_Push-Ups": "Pompes en équilibre (handstand push-up)",
  Side_Lateral_Raise: "Élévations latérales",
  "Lateral_Raise_-_With_Bands": "Élévations latérales avec élastiques",
  Cable_Seated_Lateral_Raise: "Élévations latérales à la poulie",
  Bent_Over_Barbell_Row: "Rowing barre",
  "Bent_Over_Two-Dumbbell_Row": "Rowing haltères",
  Inverted_Row: "Rowing inversé",
  "One-Arm_Dumbbell_Row": "Rowing haltère unilatéral",
  Seated_Cable_Rows: "Rowing à la poulie basse",
  Suspended_Row: "Rowing en suspension (sangles)",
  Pullups: "Tractions",
  "Wide-Grip_Lat_Pulldown": "Tirage vertical prise large",
  "Chin-Up": "Tractions supination",
  "Band_Assisted_Pull-Up": "Tractions assistées par élastique",
  Barbell_Curl: "Curl biceps barre",
  Dumbbell_Bicep_Curl: "Curl biceps haltères",
  Standing_Biceps_Cable_Curl: "Curl biceps à la poulie",
  Triceps_Pushdown: "Extension triceps poulie",
  Standing_Dumbbell_Triceps_Extension: "Extension triceps haltère (nuque)",
  Standing_Towel_Triceps_Extension: "Extension triceps avec serviette",
  Standing_Calf_Raises: "Mollets debout (machine)",
  Standing_Barbell_Calf_Raise: "Mollets debout barre",
  Standing_Dumbbell_Calf_Raise: "Mollets debout haltères",
  "Calf_Raises_-_With_Bands": "Mollets avec élastiques",
  Plank: "Gainage (planche)",
  Pallof_Press: "Pallof press",
  Standing_Cable_Wood_Chop: "Wood chop à la poulie",
  Russian_Twist: "Russian twist",
};

/**
 * SLOTS — l'unité de composition du programme. Un slot = une intention motrice
 * (« la poussée verticale lourde de la séance »), pas un exercice figé.
 * `candidats` : ids du dataset, ORDONNÉS du plus souhaitable au plus dégradé.
 * `consigne` : le « pourquoi » coaching (veille/09) — au niveau du pattern, donc valable
 *              quelle que soit la variante retenue. Les instructions détaillées de la
 *              variante exacte, elles, viennent du dataset.
 * `charge_lombaire` : le slot charge lourdement le rachis/les érecteurs sous barre (veille/09 §1 :
 *              le hinge repose sur le « gainage lombaire »). Sert au garde-fou d'interférence :
 *              soulevé de terre + roumain + squat lourd s'additionnent sur le MÊME maillon, qui
 *              récupère plus lentement que les jambes (fatigue accumulée, veille/02 §5).
 * `variantes_tolerees` : exercices du dataset qui remplissent le MÊME slot mais ne sont jamais
 *              choisis par la composition normale — ils n'existent que comme SUBSTITUTS quand une
 *              limitation physique rend la variante par défaut mal tolérée (limitations.js,
 *              veille/09 §4 : « alternatives par contrainte — matériel, DOULEUR, niveau — au sein
 *              du même pattern »). Ils sont enregistrés dans le référentiel (nom FR, muscle
 *              principal) exactement comme les candidats : le journal doit pouvoir les logguer.
 */
export const SLOTS = {
  squat_principal: {
    pattern: "squat",
    charge_lombaire: true,
    consigne: "Profondeur max contrôlée, genoux dans l'axe des orteils",
    candidats: ["Barbell_Squat", "Dumbbell_Squat", "Goblet_Squat", "Bodyweight_Squat"],
  },
  squat_machine: {
    pattern: "squat",
    consigne: "Amplitude complète sans décoller le bassin",
    candidats: ["Leg_Press", "Hack_Squat", "Squats_-_With_Bands", "Freehand_Jump_Squat"],
  },
  squat_unilateral: {
    pattern: "squat",
    consigne: "Grand pas, tibia vertical, descente contrôlée",
    candidats: ["Barbell_Walking_Lunge", "Dumbbell_Lunges", "Split_Squat_with_Dumbbells", "Bodyweight_Walking_Lunge"],
  },
  // Charnière de hanche LOURDE — le soulevé de terre conventionnel (départ au sol).
  // Slot distinct de `hinge_principal` (roumain, ischio-dominant, debout) : ce sont deux
  // exercices, deux fonctions. Sans ce slot, un objectif de FORCE se retrouvait sans son
  // mouvement le plus lourd — le trou corrigé le 2026-07-11.
  hinge_lourd: {
    pattern: "hinge",
    charge_lombaire: true,
    consigne: "Barre au contact des tibias, dos neutre GAINÉ, pousser le sol — jamais de dos rond sous charge ; technique avant charge (veille/02 §6)",
    candidats: ["Barbell_Deadlift", "Trap_Bar_Deadlift", "Sumo_Deadlift"],
  },
  hinge_principal: {
    pattern: "hinge",
    charge_lombaire: true,
    consigne: "Dos neutre, barre au contact, étirement des ischios en bas",
    candidats: ["Romanian_Deadlift", "Stiff-Legged_Dumbbell_Deadlift", "Natural_Glute_Ham_Raise"],
  },
  hinge_fessiers: {
    pattern: "hinge",
    consigne: "Extension complète de hanche, pause 1 s en haut",
    candidats: ["Single_Leg_Glute_Bridge"],
  },
  hinge_ischios: {
    pattern: "hinge",
    consigne: "Excentrique lent (3 s), pointes de pieds vers soi",
    candidats: ["Lying_Leg_Curls", "Seated_Leg_Curl", "Ball_Leg_Curl", "Floor_Glute-Ham_Raise"],
  },
  push_h_principal: {
    pattern: "push_h",
    consigne: "Omoplates serrées, barre au sternum, amplitude complète",
    candidats: ["Barbell_Bench_Press_-_Medium_Grip", "Dumbbell_Bench_Press", "Bench_Press_-_With_Bands", "Pushups"],
    variantes_tolerees: ["Smith_Machine_Bench_Press", "Dumbbell_Bench_Press_with_Neutral_Grip"],
  },
  push_h_incline: {
    pattern: "push_h",
    consigne: "30–45°, descente profonde (étirement du pectoral)",
    candidats: ["Barbell_Incline_Bench_Press_-_Medium_Grip", "Hammer_Grip_Incline_DB_Bench_Press", "Push-Ups_With_Feet_Elevated"],
    variantes_tolerees: ["Smith_Machine_Incline_Bench_Press"],
  },
  push_h_dips: {
    pattern: "push_h",
    consigne: "Buste légèrement penché, descendre coudes à 90°+",
    candidats: ["Parallel_Bar_Dip", "Dips_-_Triceps_Version", "Bench_Dips"],
  },
  push_v_principal: {
    pattern: "push_v",
    consigne: "Gainage fort, barre au-dessus de la nuque en fin de répétition",
    candidats: ["Standing_Military_Press", "Seated_Dumbbell_Press", "Shoulder_Press_-_With_Bands", "Handstand_Push-Ups"],
  },
  push_v_lateral: {
    pattern: "push_v",
    consigne: "Léger buste penché, monter par les coudes, pas d'élan",
    candidats: ["Side_Lateral_Raise", "Lateral_Raise_-_With_Bands", "Cable_Seated_Lateral_Raise"],
  },
  pull_h_principal: {
    pattern: "pull_h",
    consigne: "Buste ~45°, tirer vers le nombril, pas de triche lombaire",
    candidats: ["Bent_Over_Barbell_Row", "Bent_Over_Two-Dumbbell_Row", "Inverted_Row"],
  },
  pull_h_unilateral: {
    pattern: "pull_h",
    consigne: "Grande amplitude, étirement complet en bas",
    candidats: ["One-Arm_Dumbbell_Row", "Seated_Cable_Rows", "Suspended_Row"],
  },
  pull_v_principal: {
    pattern: "pull_v",
    consigne: "Départ bras tendus (étirement), poitrine vers la barre",
    candidats: ["Pullups", "Wide-Grip_Lat_Pulldown", "Chin-Up", "Band_Assisted_Pull-Up"],
  },
  iso_biceps: {
    pattern: "isolation",
    consigne: "Coudes fixes, extension complète en bas",
    candidats: ["Barbell_Curl", "Dumbbell_Bicep_Curl", "Standing_Biceps_Cable_Curl"],
  },
  iso_triceps: {
    pattern: "isolation",
    consigne: "Coudes fixes, verrouiller l'extension",
    candidats: ["Triceps_Pushdown", "Standing_Dumbbell_Triceps_Extension", "Standing_Towel_Triceps_Extension"],
  },
  iso_mollets: {
    pattern: "isolation",
    consigne: "Pause en bas (étirement), monter haut",
    candidats: ["Standing_Calf_Raises", "Standing_Barbell_Calf_Raise", "Standing_Dumbbell_Calf_Raise", "Calf_Raises_-_With_Bands"],
  },
  core_iso: {
    pattern: "core",
    consigne: "Bassin rétroversé, ne pas laisser les hanches tomber",
    candidats: ["Plank"],
  },
  core_antirot: {
    pattern: "core",
    consigne: "Résister à la rotation, bras tendus devant",
    candidats: ["Pallof_Press", "Standing_Cable_Wood_Chop", "Russian_Twist"],
  },
};

// --- Trous CONNUS du dataset -------------------------------------------------------------
// Constatés sur les 873 exercices, pas supposés. Ils ne sont pas comblés par une donnée
// inventée : le slot reste VIDE, le programme le signale, et on chiffre ce qui le débloque.
// Le cas emblématique : au poids du corps, la seule poussée verticale du dataset est le
// handstand push-up, classé `expert` — le prescrire à un débutant serait dangereux.
export const TROUS_CONNUS = {
  hinge_lourd: {
    halteres:
      "Soulevé de terre conventionnel : impossible sans barre chargée — au-delà de ~40 kg, aucun " +
      "haltère/kettlebell du référentiel ne charge la charnière de hanche au niveau requis. Le " +
      "soulevé de terre roumain (slot « hinge_principal ») couvre le pattern à charge plus légère, " +
      "mais ce n'est PAS le même exercice : il ne remplace pas le conventionnel sur un objectif de force.",
    poids_du_corps:
      "Soulevé de terre conventionnel : aucune variante au poids du corps dans le référentiel (le " +
      "mouvement se définit par la charge externe soulevée du sol).",
  },
  push_v_principal: {
    poids_du_corps:
      "Poussée verticale : le seul exercice au poids du corps du référentiel est le handstand " +
      "push-up (niveau expert) — non prescrit en dessous du niveau avancé. Les épaules restent " +
      "sollicitées en secondaire par les pompes et les dips (comptage fractionnaire, veille/02 §7).",
  },
  push_v_lateral: {
    poids_du_corps: "Élévations latérales : aucune variante au poids du corps dans le référentiel (il faut une résistance externe).",
  },
  iso_biceps: {
    poids_du_corps: "Isolation biceps : aucune variante au poids du corps dans le référentiel (les tractions supination restent le meilleur substitut, en composé).",
  },
  iso_mollets: {
    poids_du_corps: "Mollets : aucune variante au poids du corps dans le référentiel (la version lestée/machine seule y figure).",
  },
  pull_h_unilateral: {
    poids_du_corps: "Tirage horizontal unilatéral : aucune variante au poids du corps dans le référentiel (le rowing inversé, bilatéral, couvre le pattern).",
  },
};

// Ce qui débloque concrètement les trous ci-dessus — contrainte produit : budget serré.
// ⚠️ Ne PAS surpromettre (philosophy §2) : les élastiques ne débloquent PAS le soulevé de terre
// conventionnel, qui exige une barre chargée. On dit exactement ce qui est débloqué, et ce qui
// ne l'est pas.
export const RECOMMANDATION_MATERIEL = {
  poids_du_corps:
    "Une paire d'élastiques de résistance (~20–30 €) remplit la poussée verticale, les élévations " +
    "latérales, le curl biceps et les mollets : passer `materiel` à « halteres » les rendra " +
    "automatiquement disponibles. En revanche le **soulevé de terre conventionnel** restera hors " +
    "de portée : il exige une barre chargée (salle ou barre + disques).",
  halteres:
    "Le **soulevé de terre conventionnel** exige une barre chargée : il reste hors de portée avec " +
    "des haltères seuls. Passer `materiel` à « salle_complete » (ou acquérir barre + disques) le " +
    "débloque — c'est le mouvement le plus lourd d'un objectif de force.",
};

// --- Normalisation d'un exercice du dataset ----------------------------------------------

function equipementDe(brut) {
  return brut.equipment ?? EQUIPEMENT_CORRIGE[brut.id] ?? null;
}

// Libellés lisibles des patterns (le rendu s'adresse à un humain, pas à un dev).
export const LIBELLES_PATTERN = {
  squat: "squat",
  hinge: "charnière de hanche",
  push_h: "poussée horizontale",
  push_v: "poussée verticale",
  pull_h: "tirage horizontal",
  pull_v: "tirage vertical",
  isolation: "isolation",
  core: "gainage",
};

// Muscles réellement chargés comme synergistes par chaque pattern moteur.
//
// POURQUOI ce filtre. Le comptage fractionnaire du moteur (moteur principal = 1 série,
// contribution indirecte = 0,5) était calibré sur l'ancien catalogue interne, qui listait
// 1 à 2 synergistes par exercice. `secondaryMuscles` du dataset en liste jusqu'à 5, **par
// ordre alphabétique** — l'ordre ne porte donc AUCUNE hiérarchie, et tout créditer à 0,5
// gonfle mécaniquement le volume (mesuré : 20 séries pondérées/sem pour les épaules sur un
// upper/lower 4 j, hors fourchette, alors que le programme ne contient que 5 séries d'épaules
// directes). Cas d'école : le rowing barre liste `shoulders` en secondaire — c'est le
// deltoïde POSTÉRIEUR ; l'imputer au même budget « épaules » que le développé militaire est
// faux, et le dataset ne distingue pas les trois faisceaux.
//
// Règle retenue : un muscle secondaire n'est crédité que s'il est un synergiste du PATTERN.
// Le muscle principal, lui, compte toujours. veille/02 §1 (« séries dures par groupe
// musculaire ») — on reste au plus près de l'unité de la source.
export const MUSCLES_DU_PATTERN = {
  squat: ["quadriceps", "fessiers", "ischios", "mollets", "lombaires"],
  hinge: ["ischios", "fessiers", "lombaires"],
  push_h: ["pectoraux", "épaules", "triceps"],
  push_v: ["épaules", "triceps"],
  pull_h: ["dos", "biceps", "trapèzes"],
  pull_v: ["dos", "biceps"],
  isolation: [], // isolation : le moteur principal, rien d'autre
  core: [],
};

function musclesDe(brut, pattern) {
  const principaux = [...new Set(brut.primaryMuscles.map((m) => MUSCLE_MOTEUR[m]).filter(Boolean))];
  const synergistes = MUSCLES_DU_PATTERN[pattern] ?? [];
  const secondaires = [...new Set(brut.secondaryMuscles.map((m) => MUSCLE_MOTEUR[m]).filter(Boolean))]
    .filter((m) => synergistes.includes(m) && !principaux.includes(m));
  // muscles[0] = moteur principal (pondération 1) ; les suivants comptent 0,5
  // (comptage fractionnaire, cf. volumeParMuscle).
  return [...principaux, ...secondaires];
}

/**
 * 🔴 Exercices qui remplissent un slot marqué `charge_lombaire` **sans charger le rachis**.
 *
 * `charge_lombaire` est déclaré au niveau du **SLOT** (l'intention motrice), mais c'est en réalité
 * une propriété de l'**EXERCICE** : le squat barre charge les érecteurs du rachis, la **presse à
 * cuisses** — dos plaqué, rachis soutenu, charge déportée sur le chariot — **ne les charge pas**.
 * Sans cette table, le substitut hérite du flag de son slot d'origine, et le moteur compte comme
 * « charge lombaire » un exercice qui n'en est pas une.
 *
 * ⚠️ Ce n'est pas un détail comptable : c'est ce flag qui pilote le **filet de cohérence lombaire**
 * (limitations.js) — le garde-fou qui interdit de prescrire, sur un bas du dos ACTIF, un exercice
 * que le moteur déclare lui-même charger le maillon en cause.
 *
 * Table **EXPLICITE**, comme `SLOTS` et `EQUIPEMENT_CORRIGE`, et pour la même raison : sur un
 * produit de santé, une déduction par heuristique est une erreur silencieuse en puissance.
 */
export const RACHIS_DECHARGE = new Set([
  "Leg_Press", // dos plaqué contre le dossier : le rachis ne porte pas la charge
  "Hack_Squat", // idem — chariot guidé, dos soutenu
]);

function normaliserExercice(brut, slot, nomSlot) {
  return {
    id: brut.id,
    nom: NOMS[brut.id] ?? brut.name,
    nom_source: brut.name,
    slot: nomSlot,
    pattern: slot.pattern,
    type: brut.mechanic === "isolation" ? "isolation" : "compose",
    muscles: musclesDe(brut, slot.pattern),
    niveau_dataset: brut.level,
    equipement: equipementDe(brut),
    consigne: slot.consigne,
    // Le flag du SLOT, corrigé par l'EXERCICE : un rachis déchargé ne charge pas le rachis,
    // même quand il occupe un slot qui, lui, le fait d'habitude.
    charge_lombaire: slot.charge_lombaire === true && !RACHIS_DECHARGE.has(brut.id),
    instructions: brut.instructions ?? [],
  };
}

// --- Rapprochement de noms : PROPOSER, jamais DÉCIDER ------------------------------------
//
// Une charge de référence saisie par l'utilisateur est associée à un exercice par son NOM.
// Un nom qui ne tombe pas juste (« Développé couché » pour « Développé couché barre ») doit
// être SIGNALÉ avec une suggestion — surtout pas rattaché en douce par ressemblance :
// une mauvaise association ferait démarrer l'utilisateur sur une charge FAUSSE (philosophy §3,
// la sécurité prime). D'où : on calcule des candidats, on les affiche, et le moteur
// n'applique la charge que sur une correspondance EXACTE du nom.

/** Casse/accents/ponctuation neutralisés — « Élévations latérales » → « elevations laterales ». */
export function normaliserNom(nom) {
  return String(nom ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Distance de Levenshtein (itérative, 2 lignes — pas de dépendance, coût négligeable). */
function distance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cour = [i];
    for (let j = 1; j <= b.length; j++) {
      cour[j] = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prec = cour;
  }
  return prec[b.length];
}

/**
 * Noms du référentiel manifestement proches de `nom` — à AFFICHER à l'utilisateur, jamais à
 * appliquer automatiquement. Retenus : une variante dont le nom saisi est un préfixe/segment
 * (« Soulevé de terre » ⊂ « Soulevé de terre roumain »), ou une faute de frappe/accent proche
 * (Levenshtein ≤ ~1/3 de la longueur). Trié du plus probable au moins probable.
 */
export function suggererNoms(nom, nomsConnus, max = 3) {
  const cible = normaliserNom(nom);
  if (!cible) return [];
  const notes = [];
  for (const candidat of nomsConnus) {
    const c = normaliserNom(candidat);
    if (!c) continue;
    // Identique une fois accents/casse/ponctuation neutralisés (« souleve de terre » vs
    // « Soulevé de terre ») : c'est LA suggestion la plus sûre — on la met en tête. On ne
    // l'applique pas pour autant : le moteur n'associe que sur un nom EXACT (philosophy §3).
    if (c === cible) {
      notes.push({ candidat, score: -2000 });
      continue;
    }
    const motsCible = cible.split(" ");
    const motsCandidat = c.split(" ");
    const d = distance(cible, c);

    // (a) VARIANTE manifeste : tous les mots saisis se retrouvent dans le candidat.
    //     « curl halteres » ⊂ « curl biceps halteres » → c'est bien la même famille, précisée.
    const variante = motsCible.every((m) => motsCandidat.includes(m));

    // (b) FAUTE DE FRAPPE dans la même famille de mouvement. Le premier mot est le nom du
    //     mouvement en français (« Curl », « Squat », « Développé », « Soulevé »…) : il porte
    //     l'identité de l'exercice. Sans ce garde-fou, la seule distance d'édition suggérait
    //     « Squat haltères » pour « Curl haltères » — proche à la lettre près, absurde au sens.
    const memeFamille = distance(motsCible[0], motsCandidat[0]) <= 2;
    const seuil = Math.max(2, Math.floor(Math.max(cible.length, c.length) / 3));

    if (variante) notes.push({ candidat, score: d - 1000 });
    else if (memeFamille && d <= seuil) notes.push({ candidat, score: d });
  }
  return notes
    .sort((x, y) => x.score - y.score || x.candidat.localeCompare(y.candidat))
    .slice(0, max)
    .map((n) => n.candidat);
}

/**
 * Charge le référentiel une bonne fois pour toutes à partir du tableau brut du dataset.
 * Aucune I/O ici : l'appelant (CLI, tests) lit le fichier et injecte.
 */
/** Tous les ids d'un slot : composition normale + variantes de substitution par limitation. */
export function idsDuSlot(slot) {
  return [...slot.candidats, ...(slot.variantes_tolerees ?? [])];
}

/** Ids compatibles avec le matériel ET le niveau, dans l'ordre. Ne comble JAMAIS de force. */
function compatibles(parId, ids, materiel, niveau) {
  const equipements = PROFILS_MATERIEL[materiel];
  if (!equipements) return [];
  const plafond = PLAFOND_NIVEAU[niveau] ?? 2;
  return (ids ?? [])
    .map((id) => parId.get(id))
    .filter((b) => b && equipements.includes(equipementDe(b)) && NIVEAU_DATASET[b.level] <= plafond);
}

export function chargerReferentiel(exercicesBruts) {
  if (!Array.isArray(exercicesBruts) || !exercicesBruts.length) {
    throw new Error("Référentiel d'exercices vide : data/exercises.json attendu (tableau free-exercise-db).");
  }
  const parId = new Map(exercicesBruts.map((e) => [e.id, e]));

  // Toute la table de mapping doit s'ancrer dans le dataset : un id inconnu (typo, exercice
  // retiré d'une version future) doit exploser tout de suite, pas produire un trou silencieux.
  const inconnus = Object.values(SLOTS)
    .flatMap(idsDuSlot)
    .filter((id) => !parId.has(id));
  if (inconnus.length) {
    throw new Error(`Référentiel : id(s) absent(s) du dataset — ${inconnus.join(", ")}.`);
  }

  // nom (français) → muscle moteur principal, sur TOUS les exercices de la table — candidats ET
  // variantes tolérées (pas seulement ceux du programme courant) : le journal peut loguer
  // n'importe lequel, y compris un substitut posé par une limitation.
  const musclePrincipal = {};
  // nom (français) → PATTERN moteur. Même besoin que `musclePrincipal`, pour un autre
  // consommateur : le placement (placement.js) doit savoir si un exercice LOGGUÉ relève du squat
  // ou de la charnière (= jambes lourdes), et le journal ne loggue qu'un nom.
  const pattern = {};
  // nom → « compose » | « isolation ». Sans lui, le placement prendrait un **leg curl** pour une
  // séance de jambes lourdes (même pattern `hinge` que le soulevé de terre) — un faux positif qui
  // déplacerait des séances pour rien.
  const typeExercice = {};
  for (const [nomSlot, slot] of Object.entries(SLOTS)) {
    for (const id of idsDuSlot(slot)) {
      const e = normaliserExercice(parId.get(id), slot, nomSlot);
      musclePrincipal[e.nom] = e.muscles[0];
      pattern[e.nom] = e.pattern;
      typeExercice[e.nom] = e.type;
    }
  }

  return {
    taille: exercicesBruts.length,
    parId,
    musclePrincipal,
    pattern,
    typeExercice,
    /**
     * Résout un SUBSTITUT pour un slot : premier id de `candidats` compatible avec le matériel
     * et le niveau, normalisé avec le pattern et la consigne DU SLOT (l'équivalence
     * fonctionnelle est garantie par le pattern — veille/09 §4). null si aucun n'est
     * compatible : le moteur ne fabrique rien, il le dit (limitations.js).
     */
    substituer: (nomSlot, candidats, materiel, niveau) => {
      const slot = SLOTS[nomSlot];
      if (!slot) return null;
      const dispos = compatibles(parId, candidats, materiel, niveau);
      if (!dispos.length) return null;
      const exo = normaliserExercice(dispos[0], slot, nomSlot);
      exo.alternative = dispos[1] ? (NOMS[dispos[1].id] ?? dispos[1].name) : "pas d'autre variante tolérée avec ce matériel";
      return exo;
    },
    // Tous les noms (français) que le moteur sait reconnaître : le vocabulaire FERMÉ dans lequel
    // une clé de `charges_reference` doit tomber. Sert à distinguer « nom inconnu » (donnée
    // inexploitable → alerte + suggestion) de « exercice connu mais absent du programme du
    // jour » (donnée valide, simplement pas utilisée par ce split/matériel).
    noms: Object.keys(musclePrincipal).sort((a, b) => a.localeCompare(b)),
    catalogue: (materiel, niveau) => construireCatalogue(parId, materiel, niveau),
  };
}

/**
 * Résout chaque slot pour un matériel et un niveau donnés : le premier candidat disponible
 * gagne, le suivant devient l'« alternative » affichée. Un slot sans candidat n'est PAS
 * comblé par un exercice hors matériel ou hors niveau : il est déclaré manquant, avec son
 * pourquoi (TROUS_CONNUS) — mieux vaut un trou explicite qu'une prescription dangereuse.
 */
export function construireCatalogue(parId, materiel, niveau) {
  if (!PROFILS_MATERIEL[materiel]) {
    throw new Error(`Matériel « ${materiel} » inconnu : attendu ${Object.keys(PROFILS_MATERIEL).join(" | ")}.`);
  }

  const slots = {};
  const manquants = [];
  for (const [nomSlot, slot] of Object.entries(SLOTS)) {
    // Composition NORMALE : seuls les `candidats`. Les `variantes_tolerees` ne sont jamais
    // choisies ici — elles n'existent que sur substitution par limitation (limitations.js).
    const dispos = compatibles(parId, slot.candidats, materiel, niveau);

    if (!dispos.length) {
      slots[nomSlot] = null;
      manquants.push({
        slot: nomSlot,
        pattern: slot.pattern,
        pourquoi:
          TROUS_CONNUS[nomSlot]?.[materiel] ??
          `Aucun exercice du référentiel ne remplit « ${nomSlot} » avec le matériel « ${materiel} » à ce niveau.`,
      });
      continue;
    }
    const exo = normaliserExercice(dispos[0], slot, nomSlot);
    exo.alternative = dispos[1] ? (NOMS[dispos[1].id] ?? dispos[1].name) : "pas d'alternative avec ce matériel";
    slots[nomSlot] = exo;
  }

  return {
    materiel,
    niveau,
    slots,
    manquants,
    recommandation_materiel: manquants.length ? RECOMMANDATION_MATERIEL[materiel] ?? null : null,
  };
}
