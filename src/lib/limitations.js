// Limitations physiques — le TROISIÈME état du moteur : ADAPTER.
//
// Jusqu'ici le moteur n'avait que deux états : prescrire en aveugle, ou REFUSER tout
// (`profil.pathologies` / `profil.tca` → erreur, renvoi vers un professionnel de santé).
// La vraie vie a besoin d'un état intermédiaire : une épaule douloureuse ne doit pas
// empêcher de programmer — elle doit CHANGER ce qu'on programme. Refuser tout, c'est
// laisser l'utilisateur s'entraîner quand même, sans filet : c'est pire.
//
// ⚠️ Ce module ne remplace PAS le refus sur `pathologies`/`tca` (pathologie médicale
// déclarée, TCA → professionnel de santé). Il s'y AJOUTE.
//
// Règles sourcées :
//   veille/02 §1 (volume = levier n°1), §3 (RIR : la FORCE est quasi insensible au RIR ;
//                s'éloigner de l'échec ne coûte quasi rien et épargne la fatigue),
//                §5 (deload / fatigue), §6 (échauffement, technique avant charge,
//                douleur articulaire aiguë ≠ courbature)
//   veille/09 §1 (patterns moteurs ; « push vertical → mobilité thoracique/épaule REQUISE » ;
//                ratio push/pull équilibré pour la SANTÉ D'ÉPAULE),
//            §4.3 (« Alternatives par contrainte — matériel, DOULEUR, niveau — AU SEIN DU
//                MÊME PATTERN : c'est le pattern qui garantit l'équivalence fonctionnelle »),
//            §5 (« étoffer une taxonomie d'alternatives par limitation » — c'est ce module)
//   veille/15 §3 (dette de sommeil ↔ risque de blessure : association réelle mais MODESTE,
//                OR ~1,34 — association ≠ causalité, on ne survend pas)
//
// ⚠️ AUCUN seuil chiffré non sourcé. Là où la veille ne donne pas de chiffre (charge
// tolérable d'un tendon, volume « sûr » sur une articulation douloureuse), on reste
// QUALITATIF et on le dit — on ne fabrique pas un nombre pour faire sérieux
// (philosophy §2 : ne jamais survendre un chiffre).
//
// Module PUR : aucune I/O. Le référentiel d'exercices est injecté.

import { normaliserNom } from "./exercices.js";
import { echauffementProgramme } from "./echauffement.js";
import { limitationsDe } from "./personne.js";
// 🔴 La doctrine du nudge de cadence (et la PURGE de ses deux chiffres survendus) vit dans un seul
// endroit : `cadence.js`. On l'importe — on ne la recopie pas (philosophy §11).
import { CADENCE_SOURCE, CADENCE_RETIRE, CADENCE_EN_DESCENTE } from "./cadence.js";

// --- Statuts ------------------------------------------------------------------------------
// Le statut pilote l'INTENSITÉ de l'adaptation, la zone pilote SA NATURE.
export const STATUTS = ["ACTIF", "ANTECEDENT", "LATENT", "RESOLU"];

export const LIBELLES_STATUT = {
  ACTIF: "ACTIVE (douleur/gêne présente aujourd'hui)",
  ANTECEDENT: "ANTÉCÉDENT (guéri, mais la cause est connue — ne pas la reproduire)",
  LATENT: "LATENT (présent, non bloquant — à surveiller)",
  RESOLU: "RÉSOLU (aucune restriction ; on maintient ce qui l'a résolu)",
};

// --- Zones connues → famille de règles -----------------------------------------------------
// Une zone inconnue n'est JAMAIS ignorée en silence : elle est remontée en alerte
// (même discipline que `charges_non_appliquees`) — le moteur dit franchement qu'il n'a
// RIEN adapté pour elle, plutôt que de laisser croire le contraire.
// `possessif` : le rendu s'adresse à un humain (« faire examiner TON ÉPAULE DROITE »), pas à un
// parseur. Un libellé nu produit du « symptôme de épaule droite » — on ne livre pas ça.
export const ZONES = {
  epaule_droite: { famille: "epaule", libelle: "épaule droite", possessif: "ton épaule droite" },
  epaule_gauche: { famille: "epaule", libelle: "épaule gauche", possessif: "ton épaule gauche" },
  epaule: { famille: "epaule", libelle: "épaule", possessif: "ton épaule" },
  epaules: { famille: "epaule", libelle: "épaules", possessif: "tes épaules" },
  biceps_avant_bras: { famille: "flechisseurs_coude", libelle: "biceps / avant-bras", possessif: "tes biceps / avant-bras" },
  coude: { famille: "flechisseurs_coude", libelle: "coude", possessif: "ton coude" },
  genou: { famille: "genou", libelle: "genou", possessif: "ton genou" },
  genou_droit: { famille: "genou", libelle: "genou droit", possessif: "ton genou droit" },
  genou_gauche: { famille: "genou", libelle: "genou gauche", possessif: "ton genou gauche" },
  genoux: { famille: "genou", libelle: "genoux", possessif: "tes genoux" },
  bas_du_dos: { famille: "lombaire", libelle: "bas du dos", possessif: "ton bas du dos" },
  lombaires: { famille: "lombaire", libelle: "lombaires", possessif: "tes lombaires" },
  // ── Zones du COUREUR ────────────────────────────────────────────────────────────────────
  // Elles manquaient, et leur absence n'était pas un détail : les zones ci-dessus sont taillées
  // pour la SALLE (épaule, coude, lombaire). Un coureur qui déclarait « hanche » ou « cheville »
  // tombait dans `zone_inconnue` — le moteur l'avertissait honnêtement qu'il n'avait rien adapté,
  // mais il n'adaptait effectivement RIEN. C'est réparé ici.
  hanche: { famille: "hanche", libelle: "hanche", possessif: "ta hanche" },
  hanches: { famille: "hanche", libelle: "hanches", possessif: "tes hanches" },
  cheville: { famille: "cheville", libelle: "cheville", possessif: "ta cheville" },
  chevilles: { famille: "cheville", libelle: "chevilles", possessif: "tes chevilles" },
  pied: { famille: "pied", libelle: "pied", possessif: "ton pied" },
  pieds: { famille: "pied", libelle: "pieds", possessif: "tes pieds" },
  tibia: { famille: "tibia", libelle: "tibia", possessif: "ton tibia" },
  tibias: { famille: "tibia", libelle: "tibias", possessif: "tes tibias" },
};

/**
 * RÈGLES par famille de zone × statut. Tout est explicite et testé — comme la table `SLOTS`,
 * et pour la même raison : sur un produit de santé, une règle déduite par heuristique est une
 * erreur silencieuse en puissance.
 *
 *  `patterns_en_cause`  — le pattern EST le geste qui fait mal (l'amplitude en cause).
 *                         Aucune « variante tolérée » ne peut l'éviter : substituer dans ce
 *                         pattern n'aurait aucun sens (veille/09 §4 raisonne à pattern
 *                         constant). → on RETIRE, et on le déclare.
 *  `patterns_impactes`  — le pattern TRAVERSE la zone sans être le geste en cause.
 *                         → on garde, on substitue vers une variante mieux tolérée quand elle
 *                         existe, on plafonne l'intensité (RIR), on surveille.
 *  `famille_mouvement`  — sert au croisement avec `progression.progresse` / `.stagne`
 *                         (hypothèse clinique, cf. `hypotheseClinique`).
 */
// @chiffre-de-la-veille — vérifié : les planchers de RIR du code existent dans les sections citées.
export const REGLES = {
  epaule: {
    libelle: "épaule",
    famille_mouvement: "push",
    patterns_en_cause: ["push_v"],
    patterns_impactes: ["push_h"],
    muscles: ["épaules"],
    ACTIF: {
      // Le développé au-dessus de la tête n'est PAS remplacé par une variante guidée : la
      // Smith change la TRAJECTOIRE, pas l'AMPLITUDE — or c'est l'amplitude au-dessus de la
      // tête qui est en cause (veille/09 §1 : « push vertical → mobilité d'épaule requise »).
      // Tout le pattern EST l'amplitude douloureuse : on refuse le mouvement, pas le programme.
      retraits: {
        push_v_principal:
          "Poussée au-dessus de la tête (développé militaire & co) RETIRÉE tant que l'épaule est ACTIVE. " +
          "veille/09 §1 classe la poussée verticale comme exigeant une MOBILITÉ d'épaule complète — " +
          "précisément ce qui est restreint et douloureux ici. Aucune variante du même pattern ne " +
          "l'évite (une machine guidée change la trajectoire, pas l'amplitude) : le moteur ne " +
          "substitue donc pas, il RETIRE. C'est un refus ciblé, pas un refus de programmer.",
      },
      // Poussée HORIZONTALE : le pattern traverse l'épaule (deltoïde antérieur synergiste)
      // sans être le geste en cause → on le garde, en variante à trajectoire guidée / prise
      // neutre quand le référentiel en a une (veille/09 §4 : alternative par DOULEUR au sein
      // du même pattern — c'est le pattern qui garantit l'équivalence fonctionnelle).
      substitutions: {
        push_h_principal: {
          candidats: ["Smith_Machine_Bench_Press", "Dumbbell_Bench_Press_with_Neutral_Grip"],
          pourquoi:
            "trajectoire guidée / prise neutre : moins de demande de STABILISATION à l'épaule qu'une " +
            "barre libre, à pattern identique (poussée horizontale). Substitution explicite et " +
            "RÉVERSIBLE — retour à la barre libre dès que l'épaule est examinée et indolore.",
        },
        push_h_incline: {
          candidats: ["Smith_Machine_Incline_Bench_Press", "Hammer_Grip_Incline_DB_Bench_Press"],
          pourquoi: "même raison que le développé principal : trajectoire guidée ou prise neutre, pattern inchangé.",
        },
      },
      // Élévations latérales : on ne les retire pas (l'épaule a besoin de travail), mais on
      // plafonne la charge sur la dernière charge tolérée et on borne l'amplitude au SANS-DOULEUR.
      plafonds: {
        push_v_lateral:
          "charge plafonnée à ta dernière charge tolérée, amplitude bornée à la zone SANS DOULEUR " +
          "(l'élévation haute est justement l'amplitude restreinte).",
      },
      // veille/02 §3 : la FORCE est quasi insensible au RIR, et l'hypertrophie plafonne au-delà
      // de ~1–2 RIR. S'éloigner de l'échec sur un pattern qui traverse une zone ACTIVE ne coûte
      // donc quasi RIEN en adaptation — et épargne la fatigue. Le RIR 0–2 (quasi-échec) est
      // interdit ici : c'est le meilleur rapport bénéfice/risque du moteur.
      rir_plancher: {
        valeur: 2,
        patterns: ["push_h", "push_v"],
        pourquoi:
          "pas de quasi-échec (RIR 0–2) sur un pattern qui traverse une zone ACTIVE : d'après " +
          "veille/02 §3, la force est QUASI INSENSIBLE au RIR et l'hypertrophie plafonne au-delà " +
          "de ~1–2 RIR — reculer de l'échec ne te coûte quasi rien et t'épargne la fatigue (et le risque).",
      },
      echauffement: [
        "**Avant TOUTE poussée** (et pas seulement le jour où « ça tire ») : 2 séries d'échauffement d'épaule à vide/léger — rotations externes, élévations légères, glissades au mur — puis montées en charge progressives sur le 1er exercice.",
        "Si une douleur apparaît à l'échauffement : la séance de poussée s'arrête là. Douleur articulaire aiguë ≠ courbature (veille/02 §6).",
      ],
      regles: [
        "**Ne pas empiler deux séances de poussée lourde sans récupération** : laisser **≥ 48 h** entre elles. Garde-fou de RÉCUPÉRATION (veille/02 §5), pas un chiffrage de risque — aucun seuil sourcé ne le permettrait.",
        "Le volume de poussée **ne monte pas** tant que l'épaule est ACTIVE. Le volume est le levier n°1 (veille/02 §1), mais on ne charge pas davantage un maillon douloureux : la progression passe par les **reps** et la **technique**, pas par l'échec ni par des séries en plus.",
        "Retirer la poussée verticale **améliore mécaniquement ton ratio push/pull** — et un ratio équilibré est justement ce que veille/09 §1 associe à la santé d'épaule. L'adaptation ne « casse » pas le programme, elle le rééquilibre.",
      ],
      surveiller: [
        "Craquement **douloureux** (≠ craquement indolore), douleur qui persiste > 48 h, ou perte de mobilité qui s'aggrave.",
        "Douleur nocturne ou au repos : signal à ne pas laisser traîner.",
      ],
      renvoi_pro: true,
    },
    ANTECEDENT: {
      rir_plancher: { valeur: 2, patterns: ["push_v", "push_h"], pourquoi: "on ne va pas chercher l'échec sur un pattern qui a déjà posé problème (veille/02 §3 : le coût d'y renoncer est quasi nul)." },
      echauffement: ["Échauffement d'épaule spécifique avant les séances de poussée (rotateurs, montées en charge progressives) — veille/02 §6."],
      regles: ["Reprise progressive de la poussée verticale : reps avant charge (double progression, veille/02 §4)."],
      surveiller: ["Retour de la douleur au même geste : re-passer la limitation en ACTIF dans le persona."],
      renvoi_pro: false,
    },
    LATENT: {
      echauffement: ["Échauffement d'épaule avant les séances de poussée (veille/02 §6)."],
      regles: ["Progression prudente sur la poussée : monter les reps avant la charge (veille/02 §4)."],
      surveiller: ["Douleur qui devient présente à chaque séance → passer la limitation en ACTIF."],
      renvoi_pro: false,
    },
    RESOLU: { info: "Aucune restriction. Maintenir ce qui l'a résolue (échauffement, volume de tirage, technique)." },
  },

  flechisseurs_coude: {
    libelle: "biceps / avant-bras (fléchisseurs du coude)",
    famille_mouvement: "pull",
    patterns_en_cause: [],
    patterns_impactes: ["isolation", "pull_h", "pull_v"],
    muscles: ["biceps", "avant-bras"],
    // ANTÉCÉDENT de tendinite causée par une charge trop lourde en isolation : la cause est
    // CONNUE, il suffit de ne pas la reproduire. On ne retire rien (le curl n'est pas coupable
    // en soi) — on plafonne la charge et on interdit la recherche d'échec sur l'isolation bras.
    ANTECEDENT: {
      plafonds: {
        iso_biceps:
          "charge PLAFONNÉE à ta dernière charge tolérée sans douleur. La progression se fait par les " +
          "REPS dans la fourchette (double progression, veille/02 §4), pas par la charge, tant que " +
          "les tendons ne se sont pas re-habitués.",
      },
      rir_plancher: {
        valeur: 3,
        slots: ["iso_biceps", "iso_triceps"],
        pourquoi:
          "**pas de recherche d'échec sur l'isolation bras** — c'est exactement ce qui a causé les " +
          "tendinites. Coût de ce recul : quasi nul (veille/02 §3, rendements décroissants au-delà " +
          "de ~1–2 RIR ; la force, elle, est insensible au RIR).",
      },
      regles: [
        "⚠️ **Aucun seuil de charge « sûr » n'existe dans la veille** pour un tendon : le moteur ne fabrique donc PAS de chiffre. Le plafond retenu est **TA** donnée (ta dernière charge tolérée), pas une valeur inventée (philosophy §2).",
        "Le levier ici n'est pas la charge mais le **contrôle** : excentrique lente, coudes fixes, pas d'élan (veille/09 §4).",
      ],
      surveiller: [
        "Douleur/tiraillement au tendon distal du biceps ou aux avant-bras **le lendemain** : réduire la charge, pas serrer les dents (veille/02 §6).",
        "Grip qui lâche en tirage lourd : signe que les avant-bras encaissent déjà beaucoup — le curl vient s'ajouter.",
      ],
      renvoi_pro: false,
    },
    ACTIF: {
      retraits: { iso_biceps: "Isolation biceps RETIRÉE tant que la zone est ACTIVE (douleur présente) : le tirage lourd sollicite déjà les fléchisseurs du coude en synergie — inutile d'y ajouter une charge directe." },
      rir_plancher: { valeur: 3, patterns: ["pull_h", "pull_v"], pourquoi: "les fléchisseurs du coude travaillent en synergie sur tout le tirage : on s'éloigne de l'échec tant que la zone est douloureuse (veille/02 §3)." },
      echauffement: ["Échauffement des avant-bras/coudes avant le tirage (séries légères, amplitude complète)."],
      regles: ["Pas de charge directe sur les fléchisseurs du coude tant que la douleur est présente."],
      surveiller: ["Douleur au repos ou à la préhension quotidienne : signal à ne pas laisser traîner."],
      renvoi_pro: true,
    },
    LATENT: {
      regles: ["Progression par les reps avant la charge sur l'isolation bras (veille/02 §4)."],
      surveiller: ["Retour du tiraillement au lendemain d'une séance de bras."],
      renvoi_pro: false,
    },
    RESOLU: { info: "Aucune restriction. Ne pas reproduire la cause (charge d'isolation trop lourde, recherche d'échec)." },
  },

  genou: {
    libelle: "genou",
    famille_mouvement: "squat",
    patterns_en_cause: [],
    patterns_impactes: ["squat"],
    muscles: ["quadriceps"],
    // LATENT = présent, non bloquant. On ne retire RIEN et on ne substitue RIEN : ce serait
    // sur-réagir (et priver l'utilisateur du pattern le plus utile pour ses jambes). On rend
    // la progression prudente et on met le volume genou sous surveillance.
    LATENT: {
      progression_prudente: {
        patterns: ["squat"],
        pourquoi:
          "progression par le **plus petit palier de charge disponible** (et par les reps d'abord) sur " +
          "le pattern squat : une tendinopathie latente se réveille sur une hausse brutale de charge, " +
          "pas sur un entraînement régulier. Aucun seuil chiffré n'est sourçable ici — c'est une règle " +
          "de PROGRESSIVITÉ (veille/02 §4 & §6), pas un plafond.",
      },
      regles: [
        "Le **volume genou** (pattern squat) est exposé dans le contrôle du volume ci-dessous : le surveiller comme une variable, pas le maximiser.",
        "Échauffement des genoux avant les séances de jambes (montées en charge progressives, amplitude complète — veille/02 §6).",
      ],
      surveiller: [
        "Douleur rotulienne qui **augmente séance après séance** (≠ douleur stable à l'échauffement qui disparaît) → réduire la charge et le volume genou.",
        "Douleur en descente d'escalier / accroupi prolongé le lendemain.",
      ],
      renvoi_pro: false,
    },
    ACTIF: {
      substitutions: {
        squat_principal: {
          candidats: ["Leg_Press", "Goblet_Squat"],
          pourquoi: "variante à charge axiale et amplitude plus faciles à borner, pattern squat conservé (veille/09 §4).",
        },
      },
      rir_plancher: { valeur: 2, patterns: ["squat"], pourquoi: "pas de quasi-échec sur un genou douloureux (veille/02 §3 : le coût de reculer de l'échec est quasi nul)." },
      echauffement: ["Échauffement des genoux avant toute séance de jambes : montées en charge progressives, amplitude complète, arrêt au premier signal douloureux."],
      regles: ["Amplitude bornée à la zone sans douleur ; le volume genou ne monte pas tant que la zone est ACTIVE."],
      surveiller: ["Gonflement, dérobement, blocage : arrêter et consulter."],
      renvoi_pro: true,
    },
    ANTECEDENT: {
      progression_prudente: { patterns: ["squat"], pourquoi: "reprise par les reps avant la charge sur le pattern squat (veille/02 §4)." },
      surveiller: ["Retour de la douleur rotulienne sur une hausse de charge : redescendre d'un palier."],
      renvoi_pro: false,
    },
    RESOLU: { info: "Aucune restriction. Maintenir la progressivité qui l'a résolue." },
  },

  lombaire: {
    libelle: "bas du dos",
    famille_mouvement: "hinge",
    // 🔴 2026-07-11 — `patterns_en_cause` était VIDE. Il ne pouvait pas l'être : sur un bas du dos,
    // la **charnière de hanche chargée EST le geste en cause** (veille/09 §1 : le hinge repose sur
    // le gainage lombaire). Le laisser vide revenait à dire « aucun mouvement n'est en cause » —
    // et c'est exactement ce que le moteur faisait : il retirait le soulevé de terre conventionnel,
    // puis prescrivait 7 séries/sem de **soulevé de terre roumain** et de **squat barre** à un
    // lombalgique aigu, en écrivant dans le MÊME document qu'ils « tirent tous sur le même maillon ».
    patterns_en_cause: ["hinge"],
    patterns_impactes: ["hinge", "squat"],
    muscles: ["lombaires"],
    // RÉSOLU : rien à restreindre. Mais la surveillance demandée (charge lombaire cumulée
    // SDT + squat) EXISTE DÉJÀ dans le moteur — `chargeLombaire()` (garde-fou d'interférence).
    // On y renvoie plutôt que de dupliquer une règle : un fait dupliqué est un fait qui divergera.
    RESOLU: {
      info:
        "Aucune restriction. La surveillance que tu attends — **charge lombaire cumulée (soulevé de terre + squat)** — " +
        "est déjà assurée par le garde-fou « 🦴 Charge lombaire » de ce programme (répartition sur des séances " +
        "différentes + règle d'espacement ≥ 48 h). Maintenir le renforcement lombaires/abdos qui l'a résolue.",
      regles: ["Maintenir le renforcement (gainage/anti-rotation : il est programmé) et la technique corrigée — c'est ce qui a résolu le problème."],
    },
    ACTIF: {
      // 🔴 LE TROU LE PLUS GRAVE TROUVÉ PAR LA BATTERIE ADVERSE (2026-07-11).
      // Le moteur retirait le soulevé de terre CONVENTIONNEL « parce que c'est le mouvement qui
      // charge le plus le maillon en cause »… et laissait debout **le soulevé de terre ROUMAIN**
      // (slot `hinge_principal`) et le **squat barre** (slot `squat_principal`) — que sa PROPRE
      // table `SLOTS` marque `charge_lombaire: true`, et que son PROPRE bloc « 🦴 Charge lombaire »
      // décrit comme tirant « sur le même maillon : les érecteurs du rachis ».
      // Résultat servi avec assurance à un lombalgique AIGU : **Squat barre 4×8–12 + Soulevé de
      // terre roumain 3×8–12**. Un programme qui se contredit lui-même dans le même document.
      // Les trois slots `charge_lombaire` sont désormais traités — aucun ne survit (voir aussi le
      // FILET DE COHÉRENCE LOMBAIRE en fin d'`appliquerLimitations`, qui rend la récidive impossible).
      retraits: {
        hinge_lourd:
          "Soulevé de terre conventionnel RETIRÉ tant que le bas du dos est ACTIF : c'est le mouvement qui charge le plus le maillon en cause.",
        hinge_principal:
          "Soulevé de terre roumain RETIRÉ tant que le bas du dos est ACTIF. **La charnière de hanche CHARGÉE est le geste en cause** (veille/09 §1 : le hinge repose sur le gainage lombaire) — et le roumain tire sur **exactement le même maillon** que le conventionnel : les **érecteurs du rachis**. Le moteur l'écrit lui-même dans son garde-fou « charge lombaire » ; le retirer n'est donc pas une précaution en plus, c'est la simple **cohérence** avec ce qu'il affirme. Aucune variante du pattern ne l'évite (la charge sur le rachis EST le pattern) : on RETIRE, on ne substitue pas. **La chaîne postérieure n'est pas abandonnée pour autant** — leg curl et pont fessier (rachis non chargé) restent au programme.",
      },
      // Le squat, lui, se SUBSTITUE : le pattern reste (les jambes ont besoin de travailler), seule
      // la charge sur le rachis disparaît. Presse à cuisses / hack squat = dos plaqué, rachis
      // soutenu (`RACHIS_DECHARGE`, exercices.js) — veille/09 §4 : alternative par DOULEUR au
      // sein du MÊME pattern, c'est le pattern qui garantit l'équivalence fonctionnelle.
      substitutions: {
        squat_principal: {
          candidats: ["Leg_Press", "Hack_Squat"],
          pourquoi:
            "Squat barre remplacé par une variante à **rachis DÉCHARGÉ** (dos plaqué, charge portée par le chariot, pas par les érecteurs) tant que le bas du dos est ACTIF. Le squat barre est marqué `charge_lombaire` par le moteur lui-même : le prescrire sur une lombalgie active contredisait son propre garde-fou. **Pattern squat conservé** (veille/09 §4) — tu gardes tes jambes, tu perds la charge axiale. Substitution **RÉVERSIBLE** : retour à la barre dès que le bas du dos est examiné et indolore.",
        },
        // ⚠️ La **barre sur le dos** reste une charge axiale, même en fente. Le slot n'est pas marqué
        // `charge_lombaire` (le filet ne le rattrape donc pas) — et je n'ai PAS changé ce flag :
        // il pilote aussi la COMPTABILITÉ du garde-fou d'interférence, et requalifier la fente en
        // « charge lombaire lourde » au même titre que le soulevé de terre serait une **affirmation
        // de taxonomie** que la veille ne tranche pas. → Je ne fabrique rien : je substitue vers la
        // variante **haltères** (charge tenue aux côtés, pas de bras de levier postérieur à contrer),
        // et je REMONTE la question ouverte au propriétaire plutôt que d'y répondre tout seul.
        squat_unilateral: {
          candidats: ["Dumbbell_Lunges", "Split_Squat_with_Dumbbells", "Bodyweight_Walking_Lunge"],
          pourquoi:
            "Fentes **barre** remplacées par la variante **haltères** tant que le bas du dos est ACTIF : une barre sur le dos reste une **charge axiale** sur le rachis, et il faut la contrer par un gainage lombaire soutenu — exactement ce qu'on cherche à épargner. Charge tenue **aux côtés** : le pattern (fente unilatérale) est **identique**, la contrainte sur les érecteurs est moindre (veille/09 §4). ⚠️ **Honnêteté** : ce slot n'est **pas** marqué `charge_lombaire` par le moteur, et la veille ne dit **pas** où placer la fente chargée sur cette échelle — c'est une substitution de **prudence**, pas une conclusion sourcée. Substitution **RÉVERSIBLE**.",
        },
      },
      rir_plancher: { valeur: 3, patterns: ["hinge", "squat"], pourquoi: "pas de quasi-échec sous charge axiale avec un bas du dos douloureux (veille/02 §3 & §6)." },
      echauffement: ["Échauffement du bas du dos et du gainage avant toute charge axiale (montées en charge progressives)."],
      regles: [
        "Douleur lombaire aiguë (≠ courbature) : arrêter le mouvement, ne pas « pousser à travers » (veille/02 §6).",
        "**Aucun exercice que le moteur MARQUE comme chargeant les érecteurs du rachis (`charge_lombaire`) ne reste au programme** tant que le bas du dos est ACTIF — c'est **vérifié mouvement par mouvement** (filet de cohérence), pas promis. Le travail de chaîne postérieure passe par le **leg curl** et le **pont fessier** (rachis non chargé). ⚠️ **Ce que cette garantie NE dit PAS** : elle porte sur ce que le moteur **sait** étiqueter. Un mouvement debout chargé (fente, port de charge) reste une contrainte axiale que le moteur ne chiffre pas — il substitue vers les variantes haltères par prudence, et il **te dit qu'il ne sait pas les classer**.",
        "⚠️ **Le moteur ne rééduque pas.** Une lombalgie **aiguë** n'est pas une contrainte de programmation : c'est un motif de consultation. Les adaptations ci-dessous sont de la **prudence**, pas un **traitement** (veille/18 §6.4).",
      ],
      surveiller: ["Douleur irradiant dans la jambe, engourdissement : arrêter et consulter sans attendre."],
      renvoi_pro: true,
    },
    ANTECEDENT: {
      rir_plancher: { valeur: 2, patterns: ["hinge"], pourquoi: "on ne cherche pas l'échec sur la charnière de hanche avec un antécédent lombaire (veille/02 §3)." },
      regles: ["Technique avant charge sur le soulevé de terre : c'est la cause classique (veille/02 §6, veille/09 §2)."],
      surveiller: ["Raideur lombaire qui persiste > 48 h : signal de fatigue → deload (veille/02 §5)."],
      renvoi_pro: false,
    },
    LATENT: {
      regles: ["Progressivité sur la charge axiale ; le garde-fou « charge lombaire » du programme s'applique."],
      surveiller: ["Douleur qui devient présente à chaque séance → passer la limitation en ACTIF."],
      renvoi_pro: false,
    },
  },

  // ── Zones du COUREUR, côté SALLE ──────────────────────────────────────────────────────────
  //
  // ⚠️ Discipline, ici plus qu'ailleurs : ces zones sont d'abord des zones de COURSE (c'est là que
  // vit leur vraie adaptation — `REGLES_COURSE`). Côté salle, la veille ne fournit **aucune** règle
  // spécifique à la hanche, à la cheville, au pied ou au tibia. On ne va donc PAS fabriquer des
  // retraits et des substitutions pour « faire riche » : on applique ce qui est réellement sourcé et
  // GÉNÉRIQUE à toute zone douloureuse — pas de quasi-échec (veille/02 §3), progression par les reps
  // avant la charge (§4), échauffement de la zone (§6) — et on renvoie vers un pro sur ACTIF.
  // Une règle inventée serait pire qu'une règle absente : elle donnerait l'illusion d'être couvert.

  hanche: {
    libelle: "hanche",
    famille_mouvement: "hinge",
    patterns_en_cause: [],
    patterns_impactes: ["squat", "hinge"],
    muscles: ["fessiers", "ischios"],
    ACTIF: {
      rir_plancher: { valeur: 2, patterns: ["squat", "hinge"], pourquoi: "pas de quasi-échec sur les patterns qui traversent une hanche douloureuse — la force est quasi insensible au RIR, reculer de l'échec ne coûte quasi rien (veille/02 §3)." },
      progression_prudente: { patterns: ["squat", "hinge"], pourquoi: "reps avant charge, plus petit palier disponible (veille/02 §4) : une zone douloureuse se réveille sur une hausse brutale." },
      echauffement: ["Échauffement de hanche avant toute séance de jambes (balancés de jambe, amplitude progressive — veille/02 §6)."],
      regles: [
        "Amplitude bornée à la zone **sans douleur** ; le volume jambes **ne monte pas** tant que la zone est ACTIVE (veille/02 §1 : le volume est le levier n°1, mais on ne charge pas davantage un maillon douloureux).",
        "⚠️ **La veille ne donne AUCUNE règle de salle spécifique à la hanche** : ce qui est appliqué ici est ce qui vaut pour **toute** zone douloureuse (RIR, progressivité, échauffement). L'adaptation qui compte vraiment pour cette zone est **côté course** — voir le bloc dédié.",
      ],
      surveiller: ["Douleur à l'aine ou à la fesse qui augmente séance après séance, blocage ou accrochage en flexion de hanche."],
      renvoi_pro: true,
    },
    ANTECEDENT: {
      rir_plancher: { valeur: 2, patterns: ["squat", "hinge"], pourquoi: "on ne cherche pas l'échec sur un pattern qui a déjà posé problème (veille/02 §3)." },
      progression_prudente: { patterns: ["squat", "hinge"], pourquoi: "reprise par les reps avant la charge (veille/02 §4)." },
      surveiller: ["Retour de la douleur sur une hausse de charge : redescendre d'un palier."],
      renvoi_pro: false,
    },
    LATENT: {
      progression_prudente: { patterns: ["squat", "hinge"], pourquoi: "progression par le plus petit palier disponible, reps d'abord (veille/02 §4). Aucun seuil chiffré n'est sourçable ici — c'est une règle de PROGRESSIVITÉ, pas un plafond." },
      regles: ["Échauffement de hanche avant les séances de jambes (veille/02 §6)."],
      surveiller: ["Douleur qui devient présente à chaque séance → passer la limitation en ACTIF."],
      renvoi_pro: false,
    },
    RESOLU: { info: "Aucune restriction. Maintenir la progressivité et l'échauffement qui l'ont résolue." },
  },

  cheville: {
    libelle: "cheville",
    famille_mouvement: "squat",
    patterns_en_cause: [],
    patterns_impactes: ["squat"],
    muscles: ["mollets"],
    ACTIF: {
      rir_plancher: { valeur: 2, patterns: ["squat"], slots: ["iso_mollets"], pourquoi: "pas de quasi-échec sur une cheville douloureuse (veille/02 §3 : le coût de reculer de l'échec est quasi nul)." },
      progression_prudente: { patterns: ["squat"], slots: ["iso_mollets"], pourquoi: "reps avant charge (veille/02 §4)." },
      echauffement: ["Échauffement de cheville avant les séances de jambes (genou au mur, talon au sol — la cheville **borne la profondeur du squat**, veille/09 §1)."],
      regles: [
        "**Profondeur du squat bornée à la zone sans douleur** : la cheville borne mécaniquement la descente (veille/09 §1). On réduit l'amplitude, on ne force pas dessus.",
        "⚠️ **Aucune règle de salle spécifique à la cheville dans la veille** : ce qui est appliqué ici est générique (RIR, progressivité, échauffement). L'adaptation qui compte est **côté course** — la cheville encaisse l'**impact**, pas la barre.",
      ],
      surveiller: ["Gonflement, dérobement, blocage : arrêter et consulter.", "Douleur qui persiste au réveil ou à la marche."],
      renvoi_pro: true,
    },
    ANTECEDENT: {
      progression_prudente: { patterns: ["squat"], pourquoi: "reprise par les reps avant la charge (veille/02 §4)." },
      surveiller: ["Retour de la douleur / instabilité (entorse à répétition) : re-passer la limitation en ACTIF."],
      renvoi_pro: false,
    },
    LATENT: {
      progression_prudente: { patterns: ["squat"], pourquoi: "progression prudente sur le squat (veille/02 §4)." },
      regles: ["Échauffement de cheville avant les séances de jambes (veille/02 §6)."],
      surveiller: ["Douleur qui devient présente à chaque séance → passer la limitation en ACTIF."],
      renvoi_pro: false,
    },
    RESOLU: { info: "Aucune restriction. Maintenir la mobilité de cheville (elle borne la profondeur du squat)." },
  },

  pied: {
    libelle: "pied",
    famille_mouvement: "squat",
    patterns_en_cause: [],
    patterns_impactes: ["squat", "hinge"],
    muscles: ["mollets"],
    ACTIF: {
      rir_plancher: { valeur: 2, patterns: ["squat", "hinge"], slots: ["iso_mollets"], pourquoi: "pas de quasi-échec en appui debout avec un pied douloureux (veille/02 §3)." },
      progression_prudente: { patterns: ["squat", "hinge"], pourquoi: "reps avant charge (veille/02 §4)." },
      echauffement: ["Échauffement du pied / de la cheville avant les séances en appui debout (veille/02 §6)."],
      regles: [
        "⚠️ **La veille ne dit RIEN de la salle pour le pied** : les règles appliquées ici sont génériques (RIR, progressivité, échauffement). **Le pied est une zone de COURSE** — c'est lui qui encaisse l'impact à chaque foulée. L'adaptation réelle est dans le bloc course.",
      ],
      surveiller: ["Douleur au talon ou sous la voûte aux **premiers pas du matin** : signal classique à ne pas laisser traîner (à faire examiner, pas à auto-diagnostiquer)."],
      renvoi_pro: true,
    },
    ANTECEDENT: {
      progression_prudente: { patterns: ["squat", "hinge"], pourquoi: "reprise par les reps avant la charge (veille/02 §4)." },
      surveiller: ["Retour de la douleur : re-passer la limitation en ACTIF."],
      renvoi_pro: false,
    },
    LATENT: {
      progression_prudente: { patterns: ["squat", "hinge"], pourquoi: "progression prudente en appui debout (veille/02 §4)." },
      surveiller: ["Douleur qui devient présente à chaque séance → passer la limitation en ACTIF."],
      renvoi_pro: false,
    },
    RESOLU: { info: "Aucune restriction." },
  },

  tibia: {
    libelle: "tibia",
    famille_mouvement: "squat",
    patterns_en_cause: [],
    patterns_impactes: [],
    muscles: [],
    // ⚠️ Le tibia est une zone de COURSE, pas de salle : ce qui le charge, c'est l'IMPACT RÉPÉTÉ
    // (le moteur ne programme aucune pliométrie), pas la barre. Toute l'adaptation utile est donc
    // côté course. Le dire, plutôt que d'inventer une règle de salle.
    // 🔴 Ce bloc affirmait que le tibia était « la zone où la veille est la PLUS forte », sur la foi
    // de Luedke 2016 (« ×6–7 sous 166 pas/min »). **Ce chiffre est PURGÉ** (veille/20 §8.2 : n = 68
    // lycéens, OR 6,67 [1,2–36,7], IC qui frôle 1). Ce qui reste sur le tibia est **biomécanique**
    // (Van Hooren 2024 : ↑ cadence → ↓ dommage cumulé au tibia) — solide, mais pas un risque chiffré.
    ACTIF: {
      regles: [
        "**Rien à adapter en salle** : le moteur ne programme **aucun saut ni pliométrie**, et la barre ne charge pas le tibia comme le fait l'**impact répété** de la course. Ce n'est **pas** un oubli — c'est un constat.",
        "⚠️ **Toute l'adaptation utile pour cette zone est côté COURSE** (cadence + charge graduelle). Voir le bloc course.",
      ],
      echauffement: ["Échauffement général avant les séances en appui debout (veille/02 §6)."],
      surveiller: ["Douleur tibiale qui apparaît **de plus en plus tôt** dans la sortie, ou qui persiste au repos : arrêter de courir et faire examiner (une fracture de fatigue ne se gère pas par un échauffement)."],
      renvoi_pro: true,
    },
    ANTECEDENT: {
      regles: ["La prévention utile est **côté course** (gestion de charge graduelle + cadence), pas en salle."],
      surveiller: ["Retour de la douleur tibiale à la reprise du volume de course : re-passer la limitation en ACTIF."],
      renvoi_pro: false,
    },
    LATENT: {
      regles: ["La prévention utile est **côté course** (voir le bloc course) : en salle, rien de spécifique n'est sourçable."],
      surveiller: ["Douleur qui devient présente à chaque sortie → passer la limitation en ACTIF."],
      renvoi_pro: false,
    },
    RESOLU: { info: "Aucune restriction. Ce qui l'a résolue (charge graduelle, cadence) se maintient côté course." },
  },
};

// ═════════════════════════════════════════════════════════════════════════════════════════════
// LA COURSE — le trou que ce module avait laissé béant
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ Jusqu'ici, `limitations` n'adaptait que la MUSCULATION. Un coureur qui déclarait un genou
// douloureux s'entendait dire — au mieux — que ses sorties ne seraient pas modifiées. Ce n'était
// pas un trou de confort : c'était un trou de SÉCURITÉ. Le moteur savait protéger une épaule en
// salle et laissait courir sur un genou sans rien dire. Et le trou était STRUCTUREL : le champ
// s'appelait `muscu.limitations` (il est désormais `limitations`, cf. personne.js).
//
// ── Ce que la course fait à une articulation, et ce que la veille permet RÉELLEMENT d'en dire ──
//
// 1. La course est un **impact répété**. Le meilleur levier dont dispose le moteur est la **CADENCE**
//    (+5 à 10 % au-dessus de la cadence spontanée, jamais brutal, **jamais à la baisse**).
//    🔴 **2026-07-11 — SA BASE A ÉTÉ CORRIGÉE, ET IL FAUT LE SAVOIR.** Le moteur l'appelait « le seul
//    levier SOURCÉ » en s'appuyant sur **deux chiffres qui ne disaient pas ce qu'on leur faisait
//    dire** (Chan 2018 « −62 % » : **erreur d'attribution** — l'intervention était un retour visuel du
//    taux de charge vertical, hors de notre portée technique ; Luedke 2016 « ×6–7 sous 166 spm » :
//    **OR 6,67 [1,2–36,7]**, et l'étude conclut que **la douleur antérieure du GENOU n'est PAS
//    influencée par la cadence**). **Les deux sont PURGÉS** (veille/20 §8). Le levier **survit** —
//    sa base est **BIOMÉCANIQUE** (Lenhart 2014 : +10 % de fréquence de pas → **−14 % de force de
//    pointe fémoro-patellaire** ; Van Hooren 2024 : ↑ cadence → ↓ dommage cumulé sur les 3 sites,
//    **y compris en descente**), **pas clinique**. Toute la doctrine est dans `cadence.js`.
//
// 2. Le **VOLUME** : le levier de prévention le mieux étayé côté course avec la cadence est la
//    **gestion de charge GRADUELLE** (veille/03 §5) — progression douce, alerte sur les hausses
//    brutales, l'ACWR comme SIGNAL et jamais comme vérité. Aucun seuil « sûr » n'existe.
//
// 3. Le **DÉNIVELÉ**, et c'est le cœur du sujet : **la DESCENTE est EXCENTRIQUE** (ADR 0006 §1.5) →
//    dommages musculaires. Elle est **métaboliquement BON MARCHÉ** (−49 % de coût à −20 % de pente,
//    Minetti 2002) **et c'est elle qui casse** : la charge d'endurance, fondée sur le RPE/l'allure,
//    en est **structurellement AVEUGLE** (`AVEUGLEMENT_DESCENTE`, denivele.js). Ce n'est **pas un
//    bug** : c'est une **propriété du modèle**, et elle est **affichée**.
//    ⚠️ **Aucun seuil de D+/D− n'est sourcé.** Le moteur n'en fabrique pas : il les traite comme un
//    **marqueur binaire de présence** d'excentrique (convention déclarée, `D_MOINS_NOTABLE_M`).
//
// 4. 🔴 **AUCUNE preuve épidémiologique ne lie la descente à une TENDINOPATHIE ROTULIENNE**
//    (veille/20 §3.2) : c'est une maladie des sports de **saut**, et le tendon rotulien des traileurs
//    **ne diffère pas** de celui des routiers. Plausibilité mécanique **forte**, preuve **absente**.
//    → **Le moteur est prudent avec la descente sur un genou — pour une raison MÉCANIQUE, jamais pour
//    un risque chiffré. Il n'écrira JAMAIS « ×N de risque ». Ce chiffre n'existe pas.**
//
// 5. ⚠️ Ce que la veille NE dit PAS — et que le moteur ne dira donc pas (philosophy §2) :
//    voir `NON_SOURCE_COURSE`. Le plus important : **le renforcement n'est PAS une garantie
//    anti-blessure chez le coureur** (Wu et al. 2024) — **et le trail n'est PAS une exception**
//    (36 traileurs : renfo ≥ 2×/sem → **aucune différence** sur la CK ni sur la perte de force).
//    **Ce qui protège de la descente, c'est la SPÉCIFICITÉ** — descendre. Et ça protège **le MUSCLE,
//    pas le TENDON**.
//
// 6. Le moteur **ne rééduque pas** : prudence, pas traitement (veille/18 §6.4).

/** Ce que la veille ne permet PAS d'affirmer sur la course. On le DIT, on ne comble pas. */
export const NON_SOURCE_COURSE = [
  "**La surface** (bitume, sentier, tapis, piste) : **aucune donnée** dans la veille. Le moteur **ne te dira pas** de « courir sur du souple » — ce serait une conviction, pas un fait.",
  "**Les chaussures** (drop, amorti, minimalisme) : **rien** dans la veille. Aucune recommandation.",
  "**Un seuil de dénivelé** au-delà duquel la descente « devient dangereuse » : **rien**. Le D+ et le D− sont traités comme des **marqueurs de présence** d'excentrique, pas comme un score.",
  "🔴 **Que la descente cause ou aggrave une TENDINOPATHIE ROTULIENNE : AUCUNE preuve épidémiologique** (veille/20 §3.2). Aucune étude prospective ne le montre. La tendinopathie rotulienne est une **maladie des sports de SAUT** (volley 24,8 %, basket 20,8 %) — chez le coureur de fond, le « genou du coureur » majoritaire est le **syndrome fémoro-patellaire**. Et le **tendon rotulien des traileurs ne diffère PAS** de celui des routiers (ni épaisseur, ni section, ni corrélation au D+ hebdo). **Plausibilité mécanique et clinique FORTE ; preuve ABSENTE.** → Le moteur reste prudent **pour une raison mécanique**, et il ne te collera **jamais** un « ×N de risque » : **ce chiffre n'existe pas, et l'inventer serait exactement ce que ce projet refuse.**",
  "🔴 **Le renforcement comme protection — et le trail n'est PAS une exception.** La méta-analyse dédiée aux coureurs (Wu et al., *Sports Medicine* 2024) **ne trouve PAS** de réduction significative des blessures. **Confirmé sur des traileurs** (Martinez-Navarro 2026, n = 36) : renfo **≥ 2×/semaine** → **AUCUNE différence** (p > 0,05) sur la CK, la LDH, la myoglobine **ni sur la perte de force** après une descente. **Ce qui protège de la descente, c'est la SPÉCIFICITÉ** : ceux qui font **≥ 1 séance de descente/semaine** ont une CK plus basse (**182 vs 290 U/L**) et **conservent leur force au squat** (+4 % vs −9 %). ⚠️ **Association, pas causalité** — et ça protège **le MUSCLE**, **pas le TENDON**.",
  "⛰️ **Une conversion du dénivelé en charge** : **rien**, et il n'y en aura probablement **jamais**. Conséquence **structurelle** à connaître : **ta charge d'endurance SOUS-ESTIME la fatigue d'une sortie en descente** (la descente coûte **−49 % d'énergie** à −20 % de pente — Minetti 2002 — **tout en étant ce qui casse**). **Ce n'est pas un bug, c'est une propriété du modèle**, et le moteur l'affiche plutôt que de la rustiner avec une constante inventée.",
  "🔴 **La fenêtre de récupération après une grosse DESCENTE** : **aucune source**. Nos 24–48 h de placement viennent de la **musculation** ; les données de descente parlent en **JOURS** (force max à 84 % à 24 h, vitesse de montée en force **encore altérée à 72 h**, résolue à 96 h). **Le moteur ne fabrique pas de « 72 h »** : il **détecte** le cas et te le **signale**. L'arbitrage sécurité ↔ entraînabilité te revient.",
  "**Une durée de retour à la normale** (« ton genou ira mieux dans N semaines ») : le moteur **ne pronostique pas**.",
];

/**
 * RÈGLES DE COURSE par famille de zone × statut.
 *
 * Symétrique de `REGLES` (la salle), et tenue avec la même discipline : table EXPLICITE, chaque
 * règle porte sa source, aucun chiffre fabriqué. Une famille absente de cette table **avertit**
 * (« je n'ai RIEN adapté pour ça côté course ») — elle n'est jamais ignorée en silence.
 *
 *  `sans_objet`  — la course ne charge pas cette zone de façon notable (épaule, coude). Ce n'est
 *                  PAS un trou : c'est un constat, et il est DIT (une absence silencieuse et une
 *                  absence assumée ne se valent pas).
 *  `jambes`      — la zone est traversée par la fatigue neuromusculaire du bas du corps → elle
 *                  interagit avec la contrainte de placement (placement.js).
 *  `cadence_nommee` — la source **BIOMÉCANIQUE** du nudge nomme-t-elle EXPLICITEMENT cette zone ?
 *                  🔴 **La table a CHANGÉ le 2026-07-11, et c'est un aveu.** L'ancienne réponse
 *                  (« tibia / genou / **hanche** : oui ») venait de Figueiredo 2025 — la **revue
 *                  secondaire** d'où provenaient les deux chiffres purgés (veille/20 §8). La vraie
 *                  source du levier, c'est **Van Hooren 2024**, et elle nomme **trois tissus** :
 *                  **fémoro-patellaire (genou)**, **tibia**, **tendon d'Achille** — ainsi que
 *                  **Lenhart 2014** (fémoro-patellaire). **La HANCHE n'est nommée par AUCUNE des
 *                  deux.** Elle passe donc en `hors_cible_source` : le levier lui est donné, l'effet
 *                  ne lui est **plus promis**. Cheville / pied : toujours non nommés.
 */
export const REGLES_COURSE = {
  epaule: {
    libelle: "épaule",
    sans_objet: true,
    pourquoi:
      "La course ne charge pas l'épaule de façon notable : **aucune adaptation de course n'est faite pour cette zone, " +
      "et ce n'est PAS un oubli**. Le moteur préfère te le dire que te laisser deviner.",
  },
  flechisseurs_coude: {
    libelle: "biceps / avant-bras (fléchisseurs du coude)",
    sans_objet: true,
    pourquoi:
      "La course ne charge pas les fléchisseurs du coude : **aucune adaptation de course, et ce n'est pas un oubli**.",
  },

  // ─────────────────────────────────────────────────────────────────────────── LE GENOU
  // La zone-phare, et le cas du propriétaire. Tendinopathie rotulienne + objectif TRAIL = dénivelé =
  // DESCENTE = excentrique. C'est exactement le scénario où le trou mordait.
  genou: {
    libelle: "genou",
    jambes: true,
    cadence_nommee: true,
    ACTIF: {
      volume: {
        gel: true,
        pourquoi:
          "**Le volume de course ne monte pas** tant que le genou est ACTIF. La course est un **impact répété** : " +
          "monter le volume sur une articulation qui fait déjà mal, c'est ajouter des cycles de charge là où ça " +
          "fait mal. Le levier de prévention le mieux étayé côté course est la **gestion de charge graduelle** " +
          "(veille/03 §5) — ici, « graduelle » veut dire **plate**. " +
          "⚠️ **Aucun seuil sourcé** ne dit à partir de quel volume un genou douloureux « casse » : le moteur ne " +
          "fabrique donc **aucun chiffre**. C'est un **choix de sécurité produit ASSUMÉ**, pas une conclusion " +
          "scientifique — et il a un **coût honnête** : si tu prépares une course, **ton objectif chrono passe au " +
          "second plan**. Le moteur préfère te le dire que te faire courir après un chrono sur un genou qui lâche.",
      },
      denivele: {
        eviter: true,
        pourquoi:
          "**Le dénivelé sort du plan tant que le genou est ACTIF — et la raison est la DESCENTE, pas la montée.** " +
          "La course en descente est **EXCENTRIQUE** (ADR 0006 §1.5) : elle produit des **dommages musculaires**, " +
          "et c'est elle qui charge le genou — **bien plus que le plat**. La montée, elle, est concentrique et " +
          "coûte du souffle, pas du tendon. C'est le point que **tous** les modèles de charge calculés sur " +
          "l'allure ratent : ils **ignorent complètement le dénivelé négatif**. " +
          "⚠️ **Aucun seuil de D+ n'est sourcé** : le moteur ne prétend pas savoir « à partir de combien de mètres ». " +
          "Il traite le D+ comme un **marqueur de présence** d'excentrique (convention déclarée du moteur).",
      },
      cadence: {
        requise: true,
        pourquoi:
          "**C'est LE levier** — le seul qui soit **gratuit, sans risque, réversible et mécaniquement fondé au genou**. " +
          "Une hausse **modérée (+5 à 10 %** au-dessus de ta cadence spontanée, **progressive, jamais brutale**) " +
          "raccourcit la foulée, abaisse le **pic de flexion du genou** et donc la **contrainte fémoro-patellaire** : " +
          "**−14 % de force de pointe fémoro-patellaire** pour **+10 % de fréquence de pas** (Lenhart et al., *MSSE* " +
          "2014). Van Hooren 2024 confirme la direction sur les **trois** sites (fémoro-patellaire, tibia, Achille), " +
          "**y compris en descente**. **On MONTE la cadence, on ne la baisse JAMAIS** (−10 % **aggrave**, Lu 2025). " +
          "🔴 **Honnêteté — et elle a coûté deux chiffres** : la base de ce levier est **BIOMÉCANIQUE**, pas " +
          "**clinique**. **Les deux chiffres CLINIQUES qui le décoraient ont été RETIRÉS** le 2026-07-11 : ils ne " +
          "disaient pas ce qu'on leur faisait dire (veille/20 §8). C'est le **meilleur levier disponible** — ce " +
          "n'est **pas** une garantie, et le moteur ne te vendra plus l'inverse.",
      },
      placement: {
        durcir: true,
        pourquoi:
          "Un genou **ACTIF** change la **nature** de la contrainte de placement, pas sa durée (voir placement.js) : " +
          "une séance de jambes lourdes avant une séance-clé de course n'est plus seulement une **perf gâchée**, " +
          "c'est de l'**excentrique empilé sur une articulation douloureuse**.",
      },
      regles: [
        "**On ne t'arrête PAS de courir.** Une limitation ACTIVE fait **adapter** le moteur, elle ne lui fait pas refuser de programmer — refuser, ce serait te laisser courir sans filet (c'est pire).",
        "**Douleur articulaire aiguë ≠ courbature** : si ça fait mal **pendant** la sortie, la sortie s'arrête là. On ne « pousse pas à travers » (veille/02 §6).",
        "Le moteur **ne rééduque pas** : ce sont des restrictions de **PRUDENCE**, pas un **TRAITEMENT** (veille/18 §6.4).",
      ],
      surveiller: [
        "Douleur rotulienne qui **augmente sortie après sortie** (≠ gêne qui s'échauffe et disparaît).",
        "Douleur **en descente d'escalier** le lendemain : c'est le même geste excentrique que la descente en course — c'est ton signal le plus lisible.",
        "Gonflement, dérobement, blocage : arrêter et consulter.",
      ],
      renvoi_pro: true,
    },
    LATENT: {
      // LATENT = présent, non bloquant. On ne SUPPRIME rien (ce serait sur-réagir, et le priver de
      // ce qu'il aime) : on rend la progression prudente, et on NOMME le risque qu'il ne voit pas.
      volume: {
        gel: false,
        progression_prudente: true,
        pourquoi:
          "Le volume **peut** monter (le genou est latent, pas bloquant), mais **graduellement** : c'est la **hausse " +
          "brutale** que la veille désigne, pas le volume en soi (veille/03 §5 — charge graduelle, l'ACWR comme " +
          "signal et jamais comme vérité). Aucun seuil chiffré n'est sourçable : règle de **progressivité**, pas plafond.",
      },
      denivele: {
        eviter: false,
        progressif: true,
        pourquoi:
          "🔴 **Le point aveugle, et il est pour toi.** Si tu cours en dénivelé (trail, sentiers, côtes) : **la " +
          "DESCENTE est EXCENTRIQUE**, elle produit des **dommages musculaires**, et c'est **elle** qui charge le " +
          "compartiment fémoro-patellaire — **pas la montée** (Van Hooren 2024 : la descente ↑ le dommage " +
          "fémoro-patellaire et ↓ celui du tibia et de l'Achille ; **la montée fait exactement l'inverse**). " +
          "Pire : la descente est **métaboliquement BON MARCHÉ** (−49 % de coût à −20 % de pente, Minetti 2002) — " +
          "**elle te dit « facile » là où ton muscle encaisse le plus.** " +
          "**Le D+ se construit comme le volume : graduellement, et séparément de lui.** Ne monte pas les deux la " +
          "même semaine. " +
          "⚠️ **Aucun chiffre n'est sourçable ici** — ni un seuil de D+, ni une progression en %. Le moteur reste " +
          "**qualitatif** plutôt que d'inventer un nombre pour faire sérieux. " +
          "🔴 **Et surtout : AUCUNE preuve épidémiologique ne relie la descente à une tendinopathie rotulienne** " +
          "(veille/20 §3.2). La chaîne mécanique est impeccable ; la preuve **n'existe pas**. **Le moteur ne te " +
          "donnera donc JAMAIS un « ×N de risque » — et il ne te dira jamais non plus « fais des descentes, ça " +
          "protégera ton genou » : le *repeated bout effect* protège le MUSCLE, pas le TENDON.**",
      },
      cadence: {
        requise: true,
        pourquoi:
          "**Mesure ta cadence.** C'est le levier **le mieux fondé mécaniquement au genou**, et il est **gratuit, " +
          "sans risque, réversible** : **−14 % de force de pointe fémoro-patellaire** pour **+10 % de fréquence de " +
          "pas** (Lenhart et al., *MSSE* 2014 — mécanisme : foulée raccourcie → ↓ pic de flexion du genou). " +
          "⛰️ **Et il vaut EN DESCENTE — il y est même PLUS pertinent** (Van Hooren 2024) : c'est là que la contrainte " +
          "fémoro-patellaire culmine, et c'est là que ta foulée **s'allonge spontanément** — le mauvais réflexe, " +
          "exactement celui que le nudge corrige. **On MONTE de +5 à 10 %. On ne baisse JAMAIS.** " +
          "🔴 **Honnêteté** : sa base est **BIOMÉCANIQUE**, pas **clinique** — les deux chiffres cliniques qui le " +
          "justifiaient ont été **retirés** parce qu'ils ne disaient pas ce qu'on leur faisait dire (veille/20 §8). " +
          "Il reste le **meilleur rapport bénéfice/coût de tout ton dossier**. Ce n'est pas une garantie.",
      },
      placement: {
        durcir: false,
        pourquoi:
          "Un genou **LATENT** ne durcit **pas** la fenêtre de placement 24–48 h : ce serait sur-réagir (même " +
          "logique que côté salle, où LATENT ne retire ni ne substitue rien). Il la rend simplement **plus " +
          "coûteuse à ignorer** — et le moteur te le rappelle quand un conflit apparaît.",
      },
      regles: [
        "**Ne monte pas le volume ET le dénivelé la même semaine.** Deux variables, deux progressions. _(Ce n'est pas une donnée, c'est un **raisonnement** : la descente laisse une trace neuromusculaire de **3–4 jours** — deux contraintes qui montent ensemble sur une semaine de 7 jours ne laissent pas la place à cette récupération.)_",
        "🔴 **Ne compte pas sur la salle pour protéger ton genou — et le trail n'est PAS une exception.** La méta-analyse dédiée aux coureurs ne trouve **aucune** réduction significative des blessures par le renforcement (Wu et al. 2024), et c'est **confirmé sur des traileurs** : renfo **≥ 2×/semaine** → **aucune différence** sur la CK ni sur la perte de force après une descente (Martinez-Navarro 2026, n = 36). **Ce qui protège de la descente, c'est la SPÉCIFICITÉ** — descendre. ⚠️ Et ça protège **le MUSCLE**, **pas le TENDON**.",
        "⏱️ **Compte en JOURS après une grosse descente, pas en heures.** Une sortie de 30 min à −20 % laisse une trace neuromusculaire **encore mesurable à 72 h** (vitesse de montée en force à **63 %** de la ligne de base à 24 h), résolue seulement à **96 h**. ⚠️ **Notre règle de placement (24–48 h) vient de la MUSCULATION** : elle t'autoriserait techniquement des jambes lourdes 48 h après une grosse descente. **Le moteur te le signale — il ne fabrique pas la bonne fenêtre, parce qu'aucune source ne la donne.**",
      ],
      surveiller: [
        "Douleur rotulienne qui **augmente sortie après sortie**, ou qui apparaît **de plus en plus tôt** dans la sortie.",
        "Douleur **en descente d'escalier** le lendemain d'une sortie vallonnée : c'est le signal de l'excentrique. C'est **le** signe à ne pas laisser passer. _(C'est aussi, littéralement, le test clinique de référence de la tendinopathie rotulienne — une observation clinique constante, pas une preuve épidémiologique.)_",
        "Genou qui gonfle après une sortie en descente → passer la limitation en **ACTIF** et faire examiner.",
      ],
      renvoi_pro: false,
    },
    ANTECEDENT: {
      volume: { gel: false, progression_prudente: true, pourquoi: "reprise **graduelle** du volume : la cause est connue, il s'agit de ne pas la reproduire (veille/03 §5)." },
      denivele: { eviter: false, progressif: true, pourquoi: "le dénivelé (donc la **descente excentrique**, ADR 0006 §1.5) se réintroduit **progressivement et séparément du volume** — c'est la composante qui charge le genou." },
      cadence: { requise: true, pourquoi: "le nudge de cadence reste le levier le mieux fondé mécaniquement au genou (**−14 % de force fémoro-patellaire** pour +10 % de fréquence de pas, Lenhart 2014 — base **biomécanique**, pas clinique)." },
      placement: { durcir: false, pourquoi: "un antécédent ne durcit pas la fenêtre 24–48 h ; il rend le conflit plus coûteux à ignorer." },
      surveiller: ["Retour de la douleur rotulienne sur une hausse de volume **ou de dénivelé** : redescendre, et ne pas monter les deux ensemble."],
      renvoi_pro: false,
    },
    RESOLU: {
      info: "Aucune restriction côté course. Maintenir ce qui l'a résolue : **charge graduelle** (veille/03 §5) et **cadence** (veille/20 §7).",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────── LA HANCHE
  // 🔴 LA HANCHE A ÉTÉ DÉGRADÉE LE 2026-07-11 — et c'est une correction, pas une régression.
  // Elle était marquée « nommée par la source ». **C'était Figueiredo 2025 qui la nommait** — la revue
  // secondaire d'où venaient les deux chiffres purgés. Les sources PRIMAIRES du levier (Lenhart 2014,
  // Van Hooren 2024) nomment le **fémoro-patellaire**, le **tibia** et le **tendon d'Achille**.
  // **Pas la hanche.** Le levier lui reste donné ; l'effet ne lui est plus **promis**.
  hanche: {
    libelle: "hanche",
    jambes: true,
    cadence_nommee: false, // 🔴 corrigé : aucune source PRIMAIRE du nudge ne nomme la hanche
    ACTIF: {
      volume: { gel: true, pourquoi: "le volume de course **ne monte pas** tant que la zone est ACTIVE : la course est un impact répété (veille/03 §5 — charge graduelle). **Aucun seuil sourcé** ; choix de sécurité assumé." },
      denivele: { eviter: true, pourquoi: "le dénivelé ajoute une composante **excentrique** (la descente, ADR 0006 §1.5) sur une chaîne déjà douloureuse. Il sort du plan tant que la zone est ACTIVE. Aucun seuil de D+ n'est sourcé." },
      cadence: {
        requise: true,
        hors_cible_source: true,
        pourquoi:
          "Une hausse modérée de cadence (+5–10 %) raccourcit la foulée et abaisse la charge par pas à tous les gradients (Lu 2025). " +
          "🔴 **Honnêteté — et c'est un changement** : les sources **primaires** du nudge (Lenhart 2014, Van Hooren 2024) nomment le " +
          "**fémoro-patellaire**, le **tibia** et le **tendon d'Achille** — **pas la hanche**. Le moteur affirmait le contraire, sur " +
          "la foi d'une **revue secondaire** dont deux chiffres viennent d'être invalidés (veille/20 §8). **On te donne le levier ; " +
          "on ne te promet plus un effet démontré sur ta zone.**",
      },
      placement: { durcir: true, pourquoi: "zone du bas du corps ACTIVE : un conflit de placement n'est plus une perf gâchée, c'est de la charge empilée sur une zone douloureuse." },
      regles: ["**Douleur aiguë ≠ courbature** : la sortie s'arrête là (veille/02 §6).", "Prudence, **pas traitement** : le moteur ne rééduque pas (veille/18 §6.4)."],
      surveiller: ["Douleur à l'aine ou à la fesse qui augmente sortie après sortie ; boiterie ; douleur nocturne."],
      renvoi_pro: true,
    },
    LATENT: {
      volume: { gel: false, progression_prudente: true, pourquoi: "progression **graduelle** du volume (veille/03 §5) ; aucun seuil chiffré n'est sourçable." },
      denivele: { eviter: false, progressif: true, pourquoi: "le D+ se construit **graduellement et séparément du volume** (la descente est excentrique, ADR 0006 §1.5)." },
      cadence: { requise: true, hors_cible_source: true, pourquoi: "hausse modérée de cadence → charge par pas abaissée à tous les gradients (Lu 2025). ⚠️ **Les sources primaires du nudge ne nomment PAS la hanche** (elles nomment fémoro-patellaire, tibia, Achille) : levier donné, effet **non promis** (veille/20 §8)." },
      placement: { durcir: false, pourquoi: "LATENT ne durcit pas la fenêtre 24–48 h (ce serait sur-réagir)." },
      surveiller: ["Douleur qui devient présente à chaque sortie → passer la limitation en ACTIF."],
      renvoi_pro: false,
    },
    ANTECEDENT: {
      volume: { gel: false, progression_prudente: true, pourquoi: "reprise graduelle du volume (veille/03 §5)." },
      cadence: { requise: true, hors_cible_source: true, pourquoi: "levier gratuit et sans risque. ⚠️ Cible **non nommée** par les sources primaires du nudge (veille/20 §8)." },
      placement: { durcir: false, pourquoi: "un antécédent ne durcit pas la fenêtre 24–48 h." },
      surveiller: ["Retour de la douleur sur une hausse de volume ou de dénivelé."],
      renvoi_pro: false,
    },
    RESOLU: { info: "Aucune restriction côté course. Maintenir la charge graduelle et la cadence." },
  },

  // ─────────────────────────────────────────────────────────────────────────── LE TIBIA
  // 🔴 Ce bloc disait « la zone la MIEUX étayée de tout le moteur », sur la foi de Luedke 2016
  // (« ×6–7 sous 166 pas/min »). **Ce chiffre est PURGÉ** : n = 68 lycéens, OR 6,67 [1,2–36,7] —
  // l'IC frôle 1 (veille/20 §8.2). Ce qui RESTE est **biomécanique** (Van Hooren 2024 : ↑ cadence
  // → ↓ dommage cumulé au **tibia**) : c'est solide, et c'est **une direction**, pas un risque chiffré.
  tibia: {
    libelle: "tibia",
    jambes: true,
    cadence_nommee: true, // Van Hooren 2024 nomme bien le TIBIA parmi ses trois sites
    ACTIF: {
      volume: { gel: true, pourquoi: "le volume **ne monte pas** : le tibia encaisse l'**impact répété**, et c'est exactement ce qu'on ne veut pas cumuler (veille/03 §5). ⚠️ Une douleur tibiale qui persiste au repos **ne se gère pas par un plan** — elle se fait examiner." },
      denivele: { eviter: true, pourquoi: "la descente ajoute des *loading rates* élevés à chaque foulée. Elle sort du plan tant que la zone est ACTIVE. Aucun seuil de D+ n'est sourcé." },
      cadence: {
        requise: true,
        pourquoi:
          "**Le tibia est l'un des trois sites que la source du nudge nomme explicitement** : ↑ cadence → ↓ **dommage " +
          "cumulé au tibia** (Van Hooren et al., *Scand J Med Sci Sports* 2024). Le nudge **+5–10 %** (progressif, jamais " +
          "brutal) raccourcit la foulée et abaisse les *loading rates* **sans coût métabolique**. " +
          "🔴 **Honnêteté — un chiffre a disparu d'ici** : le moteur annonçait un **facteur de risque tibial** associé " +
          "à une cadence basse. **C'est RETIRÉ** — petit échantillon d'adolescents, **intervalle de confiance qui frôle " +
          "1** (veille/20 §8.2). **La direction est établie ; l'ampleur ne l'est pas, et le moteur ne la chiffrera pas.**",
      },
      placement: { durcir: true, pourquoi: "zone du bas du corps ACTIVE : le conflit de placement devient un enjeu de sécurité, pas de performance." },
      regles: ["⚠️ **Une douleur tibiale qui apparaît de plus en plus tôt, ou qui persiste au repos, peut être une fracture de fatigue.** Le moteur **ne diagnostique pas** — mais il ne va pas faire semblant de ne pas savoir que ça se fait examiner **avant** de continuer à courir."],
      surveiller: ["Douleur tibiale localisée **sur un point précis** de l'os, ou qui persiste **au repos** : arrêter de courir et faire examiner.", "Douleur qui apparaît de plus en plus tôt dans la sortie."],
      renvoi_pro: true,
    },
    LATENT: {
      volume: { gel: false, progression_prudente: true, pourquoi: "progression graduelle du volume : c'est la hausse **brutale** qui est en cause, pas le volume en soi (veille/03 §5)." },
      denivele: { eviter: false, progressif: true, pourquoi: "le D+ se construit graduellement, séparément du volume. ⚠️ Note contre-intuitive : la **descente** ↓ la charge du tibia et ↑ celle du genou ; c'est la **MONTÉE** qui charge le tibia (Van Hooren 2024). Les deux ne se valent pas." },
      cadence: { requise: true, pourquoi: "le **tibia** est explicitement nommé par la source du nudge (Van Hooren 2024 : ↑ cadence → ↓ dommage cumulé au tibia). Levier gratuit. ⚠️ **Aucun risque chiffré** : le facteur de risque que le moteur affichait a été **retiré** (veille/20 §8.2)." },
      placement: { durcir: false, pourquoi: "LATENT ne durcit pas la fenêtre 24–48 h." },
      surveiller: ["Douleur qui devient présente à chaque sortie → passer la limitation en ACTIF."],
      renvoi_pro: false,
    },
    ANTECEDENT: {
      volume: { gel: false, progression_prudente: true, pourquoi: "reprise graduelle : une périostite/fracture de fatigue revient sur une hausse brutale (veille/03 §5)." },
      cadence: { requise: true, pourquoi: "levier gratuit, et le **tibia** est nommé par la source (Van Hooren 2024). ⚠️ **Pas de risque chiffré** — celui que le moteur affichait a été retiré (veille/20 §8.2)." },
      placement: { durcir: false, pourquoi: "un antécédent ne durcit pas la fenêtre 24–48 h." },
      surveiller: ["Retour de la douleur tibiale à la reprise du volume."],
      renvoi_pro: false,
    },
    RESOLU: { info: "Aucune restriction côté course. Maintenir la cadence et la charge graduelle — c'est ce qui l'a résolue." },
  },

  // ─────────────────────────────────────────────── CHEVILLE & PIED — le levier, sans la survente
  // ⚠️ Les sources PRIMAIRES du nudge (Lenhart 2014, Van Hooren 2024) nomment trois tissus :
  // **fémoro-patellaire**, **tibia**, **tendon d'Achille**. Elles ne nomment **ni l'articulation de la
  // cheville, ni le pied**. Mais elles mesurent la **charge par pas** et le **dommage cumulé** — la
  // variable d'IMPACT, celle qui traverse le pied et la cheville à chaque foulée — et elle baisse.
  // On donne donc le levier, en disant exactement ce qu'il est : un levier dont la cible n'est
  // **pas nommée par la source**.
  cheville: {
    libelle: "cheville",
    jambes: true,
    cadence_nommee: false,
    ACTIF: {
      volume: { gel: true, pourquoi: "le volume **ne monte pas** : la cheville encaisse l'impact à chaque foulée (veille/03 §5 — charge graduelle). Choix de sécurité assumé, aucun seuil sourcé." },
      denivele: { eviter: true, pourquoi: "le terrain accidenté et la descente ajoutent de l'instabilité et des *loading rates* élevés. Le dénivelé sort du plan tant que la zone est ACTIVE." },
      cadence: {
        requise: true,
        hors_cible_source: true,
        pourquoi:
          "Une hausse modérée de cadence (+5–10 %) abaisse la **charge par pas** et le **dommage cumulé** — la variable " +
          "d'**impact**, celle qui traverse ta cheville à chaque foulée (Van Hooren 2024, Lu 2025). " +
          "⚠️ **Honnêteté** : les sources nomment le **fémoro-patellaire**, le **tibia** et le **tendon d'Achille** — " +
          "pas l'**articulation** de la cheville. On te donne le levier parce que la variable qu'il abaisse est la " +
          "bonne ; on **ne te vend pas** un effet démontré sur ta zone.",
      },
      placement: { durcir: true, pourquoi: "zone du bas du corps ACTIVE : le conflit de placement devient un enjeu de sécurité." },
      regles: ["**Douleur aiguë ≠ courbature** : la sortie s'arrête là (veille/02 §6)."],
      surveiller: ["Gonflement, instabilité, dérobement : arrêter et consulter.", "Entorses à répétition : ce n'est pas de la malchance, ça s'examine."],
      renvoi_pro: true,
    },
    LATENT: {
      volume: { gel: false, progression_prudente: true, pourquoi: "progression graduelle du volume (veille/03 §5)." },
      denivele: { eviter: false, progressif: true, pourquoi: "le terrain accidenté se réintroduit graduellement (instabilité + impact), séparément du volume." },
      cadence: { requise: true, hors_cible_source: true, pourquoi: "la charge par pas baisse avec une hausse modérée de cadence (Van Hooren 2024, Lu 2025). ⚠️ Les sources nomment fémoro-patellaire, tibia et tendon d'Achille — **pas l'articulation de la cheville** : levier donné, effet non promis." },
      placement: { durcir: false, pourquoi: "LATENT ne durcit pas la fenêtre 24–48 h." },
      surveiller: ["Douleur ou instabilité qui devient présente à chaque sortie → passer la limitation en ACTIF."],
      renvoi_pro: false,
    },
    ANTECEDENT: {
      volume: { gel: false, progression_prudente: true, pourquoi: "reprise graduelle (veille/03 §5)." },
      cadence: { requise: true, hors_cible_source: true, pourquoi: "levier d'impact (charge par pas), cible **non nommée** par les sources primaires du nudge (veille/20 §7)." },
      placement: { durcir: false, pourquoi: "un antécédent ne durcit pas la fenêtre 24–48 h." },
      surveiller: ["Retour de l'instabilité sur terrain accidenté."],
      renvoi_pro: false,
    },
    RESOLU: { info: "Aucune restriction côté course." },
  },

  pied: {
    libelle: "pied",
    jambes: true,
    cadence_nommee: false,
    ACTIF: {
      volume: { gel: true, pourquoi: "le volume **ne monte pas** : le pied est le **premier point de contact** — il encaisse chaque foulée (veille/03 §5 — charge graduelle). Aucun seuil sourcé." },
      denivele: { eviter: true, pourquoi: "la descente augmente les *loading rates* à l'attaque du pied. Le dénivelé sort du plan tant que la zone est ACTIVE." },
      cadence: { requise: true, hors_cible_source: true, pourquoi: "une hausse modérée de cadence raccourcit la foulée et abaisse la **charge par pas** — la variable d'impact qui traverse le pied (Van Hooren 2024, Lu 2025). ⚠️ Les sources **ne nomment pas le pied** : levier donné, effet **non promis**." },
      placement: { durcir: true, pourquoi: "zone du bas du corps ACTIVE : le conflit de placement devient un enjeu de sécurité." },
      regles: [
        "**Douleur aiguë ≠ courbature** : la sortie s'arrête là (veille/02 §6).",
        "⚠️ **Aucune recommandation de chaussure ne sortira de ce moteur** : la veille n'a **rien** sur le drop, l'amorti ou le minimalisme. Ne pas avoir d'avis est plus honnête qu'en inventer un.",
      ],
      surveiller: ["Douleur au talon ou sous la voûte aux **premiers pas du matin** : signal classique — à faire examiner, pas à auto-diagnostiquer.", "Douleur sur un point précis d'un os du pied, qui persiste au repos : arrêter de courir et consulter."],
      renvoi_pro: true,
    },
    LATENT: {
      volume: { gel: false, progression_prudente: true, pourquoi: "progression graduelle du volume (veille/03 §5)." },
      denivele: { eviter: false, progressif: true, pourquoi: "le D+ se construit graduellement, séparément du volume." },
      cadence: { requise: true, hors_cible_source: true, pourquoi: "la charge par pas baisse avec la cadence (Van Hooren 2024, Lu 2025). ⚠️ Le pied n'est **pas nommé** par les sources." },
      placement: { durcir: false, pourquoi: "LATENT ne durcit pas la fenêtre 24–48 h." },
      surveiller: ["Douleur qui devient présente à chaque sortie → passer la limitation en ACTIF."],
      renvoi_pro: false,
    },
    ANTECEDENT: {
      volume: { gel: false, progression_prudente: true, pourquoi: "reprise graduelle (veille/03 §5)." },
      cadence: { requise: true, hors_cible_source: true, pourquoi: "levier d'impact ; cible **non nommée** par les sources primaires du nudge (veille/20 §7)." },
      placement: { durcir: false, pourquoi: "un antécédent ne durcit pas la fenêtre 24–48 h." },
      surveiller: ["Retour de la douleur à la reprise du volume."],
      renvoi_pro: false,
    },
    RESOLU: { info: "Aucune restriction côté course." },
  },

  // ─────────────────────────────────────────────────────────────────────── LE BAS DU DOS
  // ⚠️ Restreint À DESSEIN. La veille ne dit RIEN de spécifique sur l'effet de la course sur le bas
  // du dos — ni impact, ni posture, ni cadence (les sources du nudge nomment fémoro-patellaire, tibia
  // et tendon d'Achille — PAS le lombaire). On applique donc ce qui est GÉNÉRIQUE et sourcé (charge graduelle), on cite le
  // garde-fou d'interférence qui existe DÉJÀ (veille/11 §2), et on dit le reste : rien.
  lombaire: {
    libelle: "bas du dos",
    jambes: false, // le placement 24–48 h vise la fatigue NM des JAMBES, pas le rachis
    cadence_nommee: false,
    ACTIF: {
      volume: { gel: true, pourquoi: "le volume de course **ne monte pas** tant que le bas du dos est ACTIF (charge graduelle, veille/03 §5). Choix de sécurité assumé — **aucun seuil sourcé** n'existe." },
      cadence: { requise: false, pourquoi: "⚠️ Les sources du nudge (Lenhart 2014, Van Hooren 2024) nomment le **fémoro-patellaire**, le **tibia** et le **tendon d'Achille** — **pas le bas du dos**. Le moteur **ne te promet donc rien** de ce côté-là : ce serait une extrapolation, pas une source." },
      placement: {
        durcir: false,
        pourquoi:
          "La contrainte 24–48 h vise la **fatigue neuromusculaire des JAMBES** (veille/11 §2), pas le rachis — elle " +
          "n'est donc pas durcie ici. En revanche, le garde-fou **« 🦴 Charge lombaire »** du programme muscu porte " +
          "déjà la règle utile : *ne pas enchaîner une séance à charge lombaire lourde et une course dure dans les " +
          "24–48 h* (veille/11 §2). On y renvoie **plutôt que de la dupliquer** : un fait dupliqué est un fait qui divergera.",
      },
      regles: [
        "⚠️ **La veille ne contient AUCUNE donnée sur l'effet de la course sur le bas du dos.** Le moteur applique donc uniquement ce qui est **générique et sourcé** (charge graduelle) — et **il te le dit**, plutôt que de te laisser croire que ta course est « adaptée à ton dos ».",
        "**Douleur lombaire aiguë** (≠ courbature) : la sortie s'arrête là (veille/02 §6).",
      ],
      surveiller: ["Douleur qui **irradie dans la jambe**, engourdissement : arrêter et consulter **sans attendre**."],
      renvoi_pro: true,
    },
    ANTECEDENT: {
      volume: { gel: false, progression_prudente: true, pourquoi: "reprise graduelle du volume (veille/03 §5)." },
      placement: { durcir: false, pourquoi: "voir le garde-fou « charge lombaire » du programme (veille/11 §2) — il porte déjà la règle." },
      regles: ["⚠️ Rien de spécifique à la course n'est sourçable pour le bas du dos : le moteur reste sur le générique, et le dit."],
      surveiller: ["Raideur lombaire qui persiste > 48 h après une sortie longue."],
      renvoi_pro: false,
    },
    LATENT: {
      volume: { gel: false, progression_prudente: true, pourquoi: "progression graduelle du volume (veille/03 §5)." },
      placement: { durcir: false, pourquoi: "voir le garde-fou « charge lombaire » (veille/11 §2)." },
      regles: ["⚠️ Rien de spécifique à la course n'est sourçable pour le bas du dos."],
      surveiller: ["Douleur qui devient présente à chaque sortie → passer la limitation en ACTIF."],
      renvoi_pro: false,
    },
    RESOLU: { info: "Aucune restriction côté course." },
  },
};

// --- Outils purs ---------------------------------------------------------------------------

/**
 * Relève un RIR sous un plancher. « 0–2 » avec plancher 2 → « 2–3 ». Un RIR non numérique
 * (isométrie : « — ») est laissé tel quel.
 */
export function plancherRir(rir, plancher) {
  const m = String(rir ?? "").match(/^(\d+)\s*[–-]\s*(\d+)$/);
  if (!m) return rir;
  const bas = Number(m[1]);
  const haut = Number(m[2]);
  if (bas >= plancher) return rir;
  return `${plancher}–${Math.max(haut, plancher + 1)}`;
}

/** L'exercice est-il concerné par une règle exprimée en patterns et/ou en slots ? */
function concerne(exo, regle) {
  return (regle.patterns ?? []).includes(exo.pattern) || (regle.slots ?? []).includes(exo.slot);
}

// --- Hypothèse clinique : croiser `progression` et `limitations` -----------------------------
//
// Le moteur ne diagnostique pas. Mais quand l'utilisateur déclare STAGNER sur exactement la
// famille de mouvements que traverse sa limitation ACTIVE, et PROGRESSER sur les autres, c'est
// un signal que le moteur peut FORMULER — et qu'il serait malhonnête de taire.
//
// Le texte de `progression.progresse/stagne` est de la prose libre : on n'y cherche que des
// mots-clés de FAMILLE DE MOUVEMENT (pas de « parsing » de sens), et on ne conclut rien : on
// pose une hypothèse, à vérifier par un professionnel.
const MOTS_FAMILLE = {
  push: ["pouss", "develop", "press", "pec", "epaule", "dips", "pompe"],
  pull: ["tirage", "tire", "rowing", "traction", "dos", "biceps", "curl"],
  squat: ["squat", "jambe", "quadri", "fente", "presse"],
  hinge: ["souleve", "terre", "deadlift", "ischio", "fessier"],
};

const LIBELLE_FAMILLE = {
  push: "la poussée",
  pull: "le tirage",
  squat: "le squat / les jambes",
  hinge: "la charnière de hanche (soulevé de terre)",
};

// Normalisation partagee avec exercices.js (accents/casse/ponctuation neutralises) :
// un fait duplique est un fait qui divergera.
const normaliser = normaliserNom;

function famillesCitees(lignes) {
  const trouvees = new Set();
  for (const ligne of lignes ?? []) {
    const t = normaliser(ligne);
    for (const [famille, mots] of Object.entries(MOTS_FAMILLE)) {
      if (mots.some((m) => t.includes(m))) trouvees.add(famille);
    }
  }
  return trouvees;
}

/**
 * @returns null, ou une hypothèse à afficher — jamais un diagnostic.
 */
export function hypotheseClinique(progression, limitationsActives) {
  if (!progression || !limitationsActives?.length) return null;
  const stagne = famillesCitees(progression.stagne);
  const progresse = famillesCitees(progression.progresse);
  if (!stagne.size) return null;

  for (const lim of limitationsActives) {
    const famille = REGLES[lim.famille]?.famille_mouvement;
    if (!famille || !stagne.has(famille)) continue;
    // Le contraste se lit sur ce qui progresse SANS stagner par ailleurs : quelqu'un peut très
    // bien progresser sur UNE variante de poussée (guidée) tout en stagnant sur la poussée en
    // général — c'est justement le motif qui rend le signal intéressant, pas celui qui l'annule.
    const autres = [...progresse].filter((f) => !stagne.has(f)).map((f) => LIBELLE_FAMILLE[f]);
    return {
      zone: lim.zone,
      libelle_zone: lim.libelle,
      famille_stagnante: famille,
      message:
        `Tu déclares **stagner sur ${LIBELLE_FAMILLE[famille]}**${autres.length ? ` et **progresser sur ${autres.join(" et ")}**` : ""} — ` +
        `et ta limitation **ACTIVE** (${lim.libelle}) traverse précisément ${LIBELLE_FAMILLE[famille]}. ` +
        `**Hypothèse** (pas un diagnostic) : cette stagnation pourrait être un **symptôme** de ${lim.possessif}, ` +
        `pas un défaut de programmation. Si c'est le cas, aucune modification de séries/reps ne la débloquera — ` +
        `changer de split ou « pousser plus » ne ferait qu'ajouter de la charge sur la zone en cause. ` +
        `C'est une raison de plus de faire **examiner ${lim.possessif}** avant de re-charger ${LIBELLE_FAMILLE[famille]}.`,
      source: "Croisement `progression.stagne` × `muscu.limitations` — veille/09 §1 (le pattern est la bonne unité d'analyse).",
    };
  }
  return null;
}

// --- Charges ESTIMÉES et non mesurées -------------------------------------------------------
//
// `muscu.charges_actuelles_a_tester` liste les mouvements dont la charge est une ESTIMATION
// prudente, pas une mesure. Prescrire du lourd à RIR 0–2 sur une charge qu'on n'a pas mesurée,
// c'est prescrire dans le vide. Le moteur ne le fait pas en silence : il relève le RIR sur ces
// exercices et impose une séance de re-test avant de les charger.
//
// 🔴 CE RELÈVEMENT-LÀ ÉTAIT MUET — ET IL FAISAIT MENTIR LE MOTEUR (2026-07-12).
// Il s'applique APRÈS le plancher des limitations, et il n'écrivait RIEN dans `rir_ajustes`.
// L'exercice partait donc avec un RIR (« 3–4 ») que le rapport ne mentionnait nulle part, tandis
// que `rir_ajustes` continuait d'annoncer l'étape d'AVANT (« relevé de 0–2 à 2–3 ») comme si
// c'était le point d'arrivée. L'app affichait les deux — la puce et la feuille — **à un tap
// d'écart**. Ce n'était pas un défaut de rendu : le moteur se contredisait lui-même.
//
// La valeur finale (le plus haut plancher gagne) était JUSTE. C'est la TRAÇABILITÉ qui manquait.
// L'invariant, désormais tenu et testé : **pour tout exercice, le dernier `apres` de sa chaîne
// de `rir_ajustes` est le RIR qu'il porte.** Un chiffre affiché sans son pourquoi est un chiffre
// « au pif » — c'est exactement ce que le produit refuse d'être.
export function chargesNonMesurees(seances, aTester, referentiel) {
  const reconnues = [];
  const non_reconnues = [];
  const rir_ajustes = [];
  if (!aTester?.length) return { exercices: [], non_reconnues, rir_ajustes };

  const nomsConnus = referentiel?.noms ?? [];
  for (const ligne of aTester) {
    const t = normaliser(ligne);
    // On cherche le nom d'exercice connu le PLUS LONG contenu dans la ligne (« Squat barre »
    // dans « Squat barre libre — inconnu (repère : 90 kg × 10 à la Smith) »). Rien trouvé →
    // on le DIT, on ne l'avale pas.
    const trouve = nomsConnus
      .filter((n) => t.includes(normaliser(n)))
      .sort((a, b) => b.length - a.length)[0];
    if (trouve) reconnues.push({ nom: trouve, ligne });
    else non_reconnues.push({ ligne, message: `« ${ligne} » : aucun exercice du référentiel reconnu dans cette ligne de \`charges_actuelles_a_tester\` — le moteur n'a donc RIEN pu adapter pour elle. Vérifier le nom (il doit contenir le nom exact d'un exercice connu).` });
  }

  const touches = [];
  for (const s of seances) {
    for (const e of s.exercices) {
      // `substitue_depuis` : si l'exercice d'origine était « à tester », son remplaçant l'est
      // encore plus (charge inconnue ET mouvement nouveau) — la contrainte se transmet.
      const r = reconnues.find((x) => x.nom === e.nom || x.nom === e.substitue_depuis);
      if (!r) continue;
      e.charge_a_confirmer = true;
      // Pas de lourd à quasi-échec sur une charge non mesurée : plancher RIR 3 le temps du re-test.
      const avant = e.rir;
      e.rir = plancherRir(avant, 3);
      // Le relèvement se DÉCLARE, exercice par exercice, avec son pourquoi. Sans ça, la puce
      // affiche un RIR que rien n'explique — et la feuille en explique un autre.
      if (e.rir !== avant && !rir_ajustes.some((x) => x.exercice === e.nom)) {
        rir_ajustes.push({
          zone: null,
          motif: "charge_non_mesuree",
          exercice: e.nom,
          avant,
          apres: e.rir,
          pourquoi:
            `la charge de départ de « ${r.nom} » est une **estimation**, pas une mesure — ton profil ` +
            `la déclare **à re-tester**. Chercher le quasi-échec sur une charge que personne n'a ` +
            `vérifiée, c'est prescrire dans le vide : le moteur **recule de l'échec** le temps d'une ` +
            `séance de re-test, puis il repart de ce que tu auras **réellement soulevé**.`,
        });
      }
      if (!touches.includes(e.nom)) touches.push(e.nom);
    }
  }
  return { exercices: touches, non_reconnues, rir_ajustes };
}

// --- Cœur : appliquer les limitations à un programme ------------------------------------------

/**
 * Applique les limitations aux séances déjà composées (MUTE les séances : retraits,
 * substitutions, RIR, plafonds) et retourne un rapport structuré, destiné à être RENDU.
 *
 * ⚠️ Rien de silencieux. Chaque changement porte son « quoi » ET son « pourquoi », et toute
 * limitation que le moteur ne sait pas traiter est remontée dans `non_appliquees`.
 *
 * @param seances     séances composées (mutées)
 * @param persona     persona normalisé
 * @param referentiel référentiel injecté (exercices.js)
 */
/**
 * Validation d'une liste de limitations — PARTAGÉE par la salle et la course.
 *
 * ⚠️ Extraite exprès : si la course validait les zones de son côté, les deux tables divergeraient
 * un jour, et une zone « connue en salle / inconnue en course » passerait en silence. Un fait
 * dupliqué est un fait qui divergera (philosophy §11).
 *
 * Une limitation mal formée, une zone inconnue ou un statut inconnu ne sont JAMAIS ignorés en
 * silence : ils partent dans `non_appliquees` avec leur raison.
 */
export function validerLimitations(brutes) {
  const valides = [];
  const non_appliquees = [];
  for (const lim of brutes ?? []) {
    if (!lim?.zone) {
      non_appliquees.push({ zone: null, raison: "entree_malformee", message: "Limitation sans `zone` : entrée ignorée. Le moteur n'a RIEN adapté pour elle." });
      continue;
    }
    const zone = ZONES[lim.zone];
    if (!zone) {
      non_appliquees.push({
        zone: lim.zone,
        raison: "zone_inconnue",
        message:
          `Limitation « ${lim.zone} » : **zone inconnue du moteur** — AUCUNE adaptation n'a été faite pour elle, ` +
          `**ni en salle, ni en course**. Ne considère ce programme comme adapté à cette limitation ni d'un côté ni de l'autre. ` +
          `Zones connues : ${Object.keys(ZONES).join(", ")}.`,
      });
      continue;
    }
    if (!STATUTS.includes(lim.statut)) {
      non_appliquees.push({
        zone: lim.zone,
        raison: "statut_inconnu",
        message: `Limitation « ${lim.zone} » : statut « ${lim.statut ?? "absent"} » inconnu — AUCUNE adaptation appliquée. Attendu : ${STATUTS.join(" | ")}.`,
      });
      continue;
    }
    valides.push({ ...lim, famille: zone.famille, libelle: zone.libelle, possessif: zone.possessif });
  }
  return { valides, non_appliquees };
}

export function appliquerLimitations(seances, persona, referentiel) {
  const m = persona.muscu ?? {};
  // Source UNIQUE de vérité : `limitations` (racine), avec repli sur `muscu.limitations` (déprécié).
  const brutes = limitationsDe(persona);

  const traitees = [];
  const alertes = [];
  const substitutions = [];
  const retraits = [];
  const plafonds = [];
  const rir_ajustes = [];
  const progression_prudente = [];
  const renvois_pro = [];
  const regles = [];
  const surveiller = [];
  const consignes_echauffement = [];
  const ecartes = new Map(); // nom d'exercice → pourquoi (pour `charges_reference`)
  const patterns_sous_contrainte = new Set();
  const slots_sous_contrainte = new Set();
  const muscles_sous_contrainte = new Set();

  // 1) Validation — une limitation mal formée ou inconnue n'est JAMAIS ignorée en silence.
  const { valides, non_appliquees } = validerLimitations(brutes);
  for (const na of non_appliquees) alertes.push(na.message);

  // 2) Application, limitation par limitation.
  for (const lim of valides) {
    const famille = REGLES[lim.famille];
    const regle = famille[lim.statut];
    const actions = [];

    if (!regle) {
      // Famille connue mais rien de prévu pour ce statut : on le DIT (pas de silence).
      non_appliquees.push({
        zone: lim.zone,
        raison: "statut_sans_regle",
        message: `Limitation « ${lim.zone} » (${lim.statut}) : le moteur n'a pas de règle pour ce statut sur cette zone — aucune adaptation appliquée.`,
      });
      alertes.push(non_appliquees.at(-1).message);
      continue;
    }

    // Ce qui est « sous contrainte » n'est PAS toute la famille : c'est ce que la règle
    // restreint RÉELLEMENT pour ce statut (retraits, substitutions, plafonds, plancher de RIR).
    // Sinon un antécédent de tendinite du biceps bloquerait tout le volume de DOS — absurde.
    // Sert à interdire aux PRIORITÉS d'ajouter du volume sur une zone qu'on vient de ménager.
    if (lim.statut === "ACTIF" || lim.statut === "ANTECEDENT") {
      for (const p of regle.rir_plancher?.patterns ?? []) patterns_sous_contrainte.add(p);
      for (const sl of regle.rir_plancher?.slots ?? []) slots_sous_contrainte.add(sl);
      for (const sl of [...Object.keys(regle.retraits ?? {}), ...Object.keys(regle.substitutions ?? {}), ...Object.keys(regle.plafonds ?? {})]) {
        slots_sous_contrainte.add(sl);
      }
    }

    // --- Retraits : le moteur REFUSE un mouvement, pas le programme.
    for (const [slot, pourquoi] of Object.entries(regle.retraits ?? {})) {
      for (const s of seances) {
        const idx = s.exercices.findIndex((e) => e.slot === slot);
        if (idx === -1) continue;
        const [retire] = s.exercices.splice(idx, 1);
        retraits.push({ zone: lim.zone, seance: s.nom, exercice: retire.nom, pattern: retire.pattern, pourquoi });
        actions.push({ type: "retrait", quoi: `${retire.nom} (${s.nom})`, pourquoi });
        ecartes.set(retire.nom, `écarté par l'adaptation « ${lim.libelle} » (${lim.statut})`);
        // Le volume de CES muscles baisse mécaniquement — c'est VOULU. Le contrôle du volume
        // doit le dire, sinon il conseillera d'« ajouter un jour » pour combler un trou qu'on
        // a creusé exprès (le pire conseil possible sur une zone douloureuse).
        for (const mus of retire.muscles ?? []) muscles_sous_contrainte.add(mus);
      }
    }

    // --- Substitutions : au sein du MÊME pattern (veille/09 §4). Jamais en silence.
    for (const [slot, sub] of Object.entries(regle.substitutions ?? {})) {
      const remplacant = referentiel?.substituer?.(slot, sub.candidats, m.materiel, m.niveau);
      for (const s of seances) {
        const e = s.exercices.find((x) => x.slot === slot);
        if (!e) continue;
        if (!remplacant) {
          // Aucun candidat compatible avec CE matériel / CE niveau : on ne fabrique rien.
          alertes.push(
            `Limitation « ${lim.libelle} » : aucune variante mieux tolérée de « ${e.nom} » n'existe avec le matériel « ${m.materiel} ». ` +
              `L'exercice est CONSERVÉ tel quel — l'adaptation se limite au RIR et aux consignes. À exécuter strictement sans douleur.`
          );
          actions.push({ type: "substitution_impossible", quoi: e.nom, pourquoi: `aucun candidat compatible avec « ${m.materiel} »` });
          continue;
        }
        if (remplacant.id === e.id) continue;
        const ancien = e.nom;
        substitutions.push({ zone: lim.zone, seance: s.nom, avant: ancien, apres: remplacant.nom, pattern: e.pattern, pourquoi: sub.pourquoi });
        actions.push({ type: "substitution", quoi: `${ancien} → **${remplacant.nom}**`, pourquoi: sub.pourquoi });
        ecartes.set(ancien, `remplacé par « ${remplacant.nom} » — adaptation « ${lim.libelle} » (${lim.statut})`);
        // On remplace l'exercice EN CONSERVANT sa place, ses séries et sa prescription :
        // le pattern est identique, seule la variante change.
        Object.assign(e, remplacant, {
          series: e.series,
          superset: e.superset,
          prescription: e.prescription,
          reps: e.reps,
          rir: e.rir,
          repos: e.repos,
          substitue_depuis: ancien,
        });
      }
    }

    // --- Plafonds de charge : on ne dépasse pas la dernière charge tolérée.
    for (const [slot, pourquoi] of Object.entries(regle.plafonds ?? {})) {
      for (const s of seances) {
        const e = s.exercices.find((x) => x.slot === slot);
        if (!e) continue;
        e.plafond_charge = true;
        e.plafond_pourquoi = pourquoi;
        if (!plafonds.some((p) => p.exercice === e.nom)) {
          plafonds.push({ zone: lim.zone, exercice: e.nom, pourquoi });
          actions.push({ type: "plafond", quoi: e.nom, pourquoi });
        }
      }
    }

    // --- RIR : jamais de quasi-échec sur une zone contrainte (veille/02 §3).
    if (regle.rir_plancher) {
      const r = regle.rir_plancher;
      for (const s of seances) {
        for (const e of s.exercices) {
          if (!concerne(e, r)) continue;
          const avant = e.rir;
          e.rir = plancherRir(avant, r.valeur);
          if (e.rir !== avant && !rir_ajustes.some((x) => x.exercice === e.nom)) {
            rir_ajustes.push({ zone: lim.zone, exercice: e.nom, avant, apres: e.rir, pourquoi: r.pourquoi });
          }
        }
      }
      const touches = rir_ajustes.filter((x) => x.zone === lim.zone);
      if (touches.length) actions.push({ type: "rir", quoi: `RIR relevé sur ${touches.length} exercice(s) (plus de quasi-échec)`, pourquoi: r.pourquoi });
    }

    // --- Progression prudente (pas de plafond, une PROGRESSIVITÉ).
    if (regle.progression_prudente) {
      const pp = regle.progression_prudente;
      for (const s of seances) {
        for (const e of s.exercices) {
          if (concerne(e, pp)) e.progression_prudente = true;
        }
      }
      progression_prudente.push({ zone: lim.zone, patterns: pp.patterns ?? [], slots: pp.slots ?? [], pourquoi: pp.pourquoi });
      actions.push({ type: "progression", quoi: `progression prudente sur ${(pp.patterns ?? []).join(", ")}`, pourquoi: pp.pourquoi });
    }

    for (const c of regle.echauffement ?? []) if (!consignes_echauffement.includes(c)) consignes_echauffement.push(c);
    for (const r of regle.regles ?? []) if (!regles.includes(r)) regles.push(r);
    for (const sv of regle.surveiller ?? []) surveiller.push({ zone: lim.zone, libelle: lim.libelle, signal: sv });

    // Renvoi vers un professionnel : sans diagnostiquer, sans dramatiser. Le moteur dit ce
    // qu'il est, et surtout ce qu'il n'est PAS (même ton que le disclaimer non-médical).
    if (regle.renvoi_pro) {
      renvois_pro.push({
        zone: lim.zone,
        libelle: lim.libelle,
        message:
          `**${lim.libelle}** — limitation **ACTIVE**${lim.gravite ? ` (gravité déclarée : ${lim.gravite})` : ""}. Le moteur a adapté ton programme autour ` +
          `d'elle, et il continuera. Mais **il ne diagnostique pas, et il ne soigne pas** : une douleur présente aujourd'hui, ` +
          `**qui n'a jamais été examinée**, mérite de l'être — un médecin du sport ou un kiné mettra un nom dessus en une consultation. ` +
          `Ce n'est ni dramatique ni urgent : c'est simplement la seule chose qu'un programme, aussi bien adapté soit-il, ne peut pas faire à ta place.` +
          (lim.description ? ` _(Ce que tu as décrit : « ${lim.description} »)_` : ""),
      });
    }

    traitees.push({
      zone: lim.zone,
      libelle: lim.libelle,
      statut: lim.statut,
      libelle_statut: LIBELLES_STATUT[lim.statut],
      gravite: lim.gravite ?? null,
      description: lim.description ?? null,
      info: regle.info ?? null,
      actions,
    });
  }

  // 3) Échauffement — IMPOSÉ (et NON SKIPPABLE) dès qu'une limitation ACTIVE est là.
  // Le contenu est encodé dans `echauffement.js` (veille/18) : ici on ne fait que le déclencher
  // et lui passer les consignes SPÉCIFIQUES aux zones concernées.
  const actives = valides.filter((l) => l.statut === "ACTIF").map((l) => ({
    ...l,
    // Les patterns que la zone traverse — pour que l'échauffement d'une séance sache s'il doit
    // devenir non skippable (une séance Pull ne traverse pas l'épaule en poussée).
    patterns_famille: [...(REGLES[l.famille]?.patterns_en_cause ?? []), ...(REGLES[l.famille]?.patterns_impactes ?? [])],
  }));
  const statutEchauffement = m.echauffement?.statut ?? "INCONNU";
  const echauffement = echauffementProgramme(statutEchauffement, actives, consignes_echauffement, m, valides);
  if (echauffement.impose && statutEchauffement === "ABSENT") {
    alertes.push(
      `**Tu ne t'échauffes pas** (déclaré) alors que tu as ${actives.length} limitation(s) **ACTIVE(S)** : ` +
        `${actives.map((a) => a.libelle).join(", ")}. C'est la conjonction la plus risquée de ton dossier. ` +
        `L'échauffement est **imposé et NON SKIPPABLE** ici (veille/18 §9.1, règle 2) — c'est un choix de **sécurité** ` +
        `assumé, pas une conclusion scientifique : l'effet mesuré est **modeste** (≈ −16 % de risque relatif, et **extrapolé ` +
        `des sports collectifs**), mais il coûte **8 minutes** et il est gratuit.`
    );
  }
  // 🚑 Renvoi médical (veille/18 §6.5) — NON SKIPPABLE. Il ne se noie pas dans les alertes : il a
  // son propre bloc, en TÊTE du programme. Une douleur qui coche ces signaux ne se gère pas par un
  // échauffement — et surtout pas par une app.
  if (echauffement.renvoi_medical?.requis) {
    alertes.push(
      `🚑 **Renvoi vers un professionnel de santé** : ${echauffement.renvoi_medical.zones
        .map((z) => `${z.libelle} (${z.signaux.map((s) => s.code).join(", ")})`)
        .join(" · ")} — voir le bloc en tête de programme. **Aucun échauffement ne gère ces signaux.**`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 3 bis) 🔴 FILET DE COHÉRENCE LOMBAIRE — « le moteur ne prescrit pas ce qu'il dénonce »
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  //
  // Le moteur DÉCLARE, exercice par exercice, lequel charge les érecteurs du rachis
  // (`charge_lombaire`, exercices.js) — et il l'affiche dans son garde-fou « 🦴 Charge lombaire ».
  // Il ne peut donc PAS, sans se contredire, laisser un tel exercice au programme d'un bas du dos
  // **ACTIF**. C'est exactement ce qu'il faisait (squat barre + soulevé de terre roumain servis à
  // une lombalgie aiguë, cf. `REGLES.lombaire.ACTIF`).
  //
  // Les règles ci-dessus (retraits + substitution) traitent les 3 slots connus. **Ce filet ne les
  // remplace pas : il les GARANTIT.** Le jour où un slot `charge_lombaire` sera ajouté à `SLOTS`
  // sans qu'on pense à la lombalgie, il sera retiré ici — et le programme le dira. La récidive
  // n'est pas rendue improbable : elle est rendue **impossible**.
  const lombaireActive = valides.find((l) => l.famille === "lombaire" && l.statut === "ACTIF");
  if (lombaireActive) {
    for (const s of seances) {
      for (let i = s.exercices.length - 1; i >= 0; i--) {
        const e = s.exercices[i];
        if (!e.charge_lombaire) continue;
        s.exercices.splice(i, 1);
        const pourquoi =
          `**Filet de cohérence lombaire.** Le moteur marque « ${e.nom} » comme **chargeant les érecteurs du rachis** ` +
          `(\`charge_lombaire\`) — c'est lui-même qui l'affirme, dans le garde-fou « 🦴 Charge lombaire » de ce document. ` +
          `Le prescrire sur un **bas du dos ACTIF** reviendrait à recommander le mouvement qu'il dénonce, dans le même ` +
          `document. **Il ne le fait pas.** L'exercice est RETIRÉ. _(Si tu lis ceci, c'est qu'aucune règle nommée ne ` +
          `couvrait ce mouvement : le filet a rattrapé un trou de la table — signale-le.)_`;
        retraits.push({ zone: lombaireActive.zone, seance: s.nom, exercice: e.nom, pattern: e.pattern, pourquoi, filet: true });
        alertes.push(
          `🩹 **${e.nom}** retiré de « ${s.nom} » par le **filet de cohérence lombaire** : le moteur le déclare chargeant ` +
            `les érecteurs du rachis, et ton bas du dos est **ACTIF**. Il ne prescrit pas ce qu'il dénonce.`
        );
        ecartes.set(e.nom, `écarté par le filet de cohérence lombaire (bas du dos ACTIF)`);
        for (const mus of e.muscles ?? []) muscles_sous_contrainte.add(mus);
        const t = traitees.find((x) => x.zone === lombaireActive.zone);
        t?.actions.push({ type: "retrait", quoi: `${e.nom} (${s.nom})`, pourquoi });
      }
    }
  }

  // 4) Hypothèse clinique (données croisées, jamais un diagnostic).
  const hypothese = hypotheseClinique(persona.progression, actives);

  // 5) Charges estimées et non mesurées.
  // ⚠️ Ce relèvement s'applique APRÈS les planchers de limitation, et il peut donc remonter
  // encore le RIR d'un exercice déjà relevé. Ses ajustements REJOIGNENT `rir_ajustes` : c'est
  // ce qui garantit que la chaîne rapportée FINIT sur le RIR que l'exercice porte vraiment.
  const nonMesurees = chargesNonMesurees(seances, m.charges_actuelles_a_tester, referentiel);
  for (const nr of nonMesurees.non_reconnues) alertes.push(nr.message);
  rir_ajustes.push(...nonMesurees.rir_ajustes);

  return {
    limitations: traitees,
    non_appliquees,
    substitutions,
    retraits,
    plafonds,
    rir_ajustes,
    progression_prudente,
    regles,
    surveiller,
    renvois_pro,
    echauffement,
    // 🚑 Remonté au premier niveau : il doit être lisible sans fouiller (bloc NON SKIPPABLE).
    renvoi_medical: echauffement.renvoi_medical,
    // Les limitations ACTIVES enrichies de leurs patterns : `muscu.js` en a besoin pour décider,
    // séance par séance, si l'échauffement devient non skippable.
    actives,
    hypothese_clinique: hypothese,
    charges_non_mesurees: nonMesurees,
    patterns_sous_contrainte: [...patterns_sous_contrainte],
    slots_sous_contrainte: [...slots_sous_contrainte],
    muscles_sous_contrainte: [...muscles_sous_contrainte],
    ecartes,
    alertes,
    // La zone du BAS DU CORPS qui durcit la contrainte de placement (placement.js). Calculée ici
    // pour que muscu.js n'ait pas à re-dériver la règle : une seule table, une seule vérité.
    zone_jambes_active: zoneJambesActive(valides),
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// APPLIQUER LES LIMITATIONS À LA COURSE
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * La zone du BAS DU CORPS qui est ACTIVE, s'il y en a une — celle qui durcit le placement.
 * ⚠️ ACTIF **seulement**. Un genou LATENT ne durcit rien : ce serait sur-réagir, exactement comme
 * côté salle où LATENT ne retire ni ne substitue rien. La cohérence des deux côtés n'est pas une
 * coquetterie : c'est ce qui rend le moteur prévisible.
 */
export function zoneJambesActive(limitationsValides) {
  for (const lim of limitationsValides ?? []) {
    if (lim.statut !== "ACTIF") continue;
    const fam = REGLES_COURSE[lim.famille];
    if (fam?.jambes && fam[lim.statut]?.placement?.durcir) {
      return { zone: lim.zone, libelle: lim.libelle, possessif: lim.possessif, pourquoi: fam[lim.statut].placement.pourquoi };
    }
  }
  return null;
}

/** Le persona court-il ? (plan running, ou course déclarée côté hybride — le cas du propriétaire.) */
export function personaCourt(persona) {
  if (persona?.running?.objectif?.distance) return true;
  return Number(persona?.muscu?.hybride?.course_par_semaine ?? 0) > 0;
}

/**
 * Applique les limitations à la COURSE. Module PUR : aucune I/O, aucune dépendance injectée
 * (contrairement à la salle, la course n'a pas besoin d'un référentiel d'exercices).
 *
 * Ne MUTE rien : la course n'a pas d'« exercices » à retirer. Le rapport retourné porte des
 * CONTRAINTES que `running.js` applique au plan (volume gelé, dénivelé, cadence) et que
 * `placement.js` utilise pour durcir la fenêtre 24–48 h.
 *
 * ⚠️ Rien de silencieux : une zone sans règle de course est REMONTÉE (« je n'ai RIEN adapté »),
 * et une zone que la course ne concerne pas est déclarée « sans objet » — les deux ne se valent
 * pas, et le moteur ne les confond pas.
 */
export function appliquerLimitationsCourse(persona) {
  const court = personaCourt(persona);
  const { valides, non_appliquees } = validerLimitations(limitationsDe(persona));

  const traitees = [];
  const alertes = [];
  const regles = [];
  const surveiller = [];
  const renvois_pro = [];
  const zones_volume_gele = [];
  const zones_denivele_evite = [];
  const zones_denivele_progressif = [];
  const zones_volume_prudent = [];
  const zones_cadence = [];

  const contraintes = {
    volume: { gel: false, progression_prudente: false, zones: [], pourquoi: null },
    denivele: { eviter: false, progressif: false, zones: [], pourquoi: null },
    cadence: { requise: false, zones: [], pourquoi: null, hors_cible_source: false },
  };

  if (!court) {
    // Le persona ne court pas : il n'y a rien à adapter, et ce n'est pas un trou.
    return {
      court: false,
      limitations: [],
      non_appliquees: [],
      contraintes,
      zone_jambes_active: null,
      regles: [],
      surveiller: [],
      renvois_pro: [],
      non_source: NON_SOURCE_COURSE,
      alertes: [],
      cadence: null,
      source: "veille/03 §5 & §5 ter · veille/20 (trail & dénivelé) · veille/11 §2–3 · ADR 0006 §1.5",
    };
  }

  for (const lim of valides) {
    const famille = REGLES_COURSE[lim.famille];

    // (a) Famille absente de la table course : le moteur n'a RIEN adapté — il le crie.
    if (!famille) {
      non_appliquees.push({
        zone: lim.zone,
        raison: "course_sans_regle",
        message:
          `Limitation « ${lim.libelle} » : le moteur **n'a RIEN adapté pour la COURSE** sur cette zone (il n'a pas de ` +
          `règle de course pour elle). Ton programme de salle est adapté ; **tes sorties ne le sont pas**. Ne considère ` +
          `pas ta course comme protégée.`,
      });
      continue;
    }

    // (b) La course ne charge pas cette zone : c'est un CONSTAT, pas un oubli — et on le dit.
    if (famille.sans_objet) {
      traitees.push({ zone: lim.zone, libelle: lim.libelle, statut: lim.statut, libelle_statut: LIBELLES_STATUT[lim.statut], sans_objet: true, info: famille.pourquoi, actions: [] });
      continue;
    }

    const regle = famille[lim.statut];
    if (!regle) {
      non_appliquees.push({
        zone: lim.zone,
        raison: "course_statut_sans_regle",
        message: `Limitation « ${lim.libelle} » (${lim.statut}) : aucune règle de **course** pour ce statut sur cette zone — **rien n'a été adapté** côté sorties.`,
      });
      continue;
    }

    const actions = [];

    // --- VOLUME (veille/03 §5 : la charge graduelle est le levier de prévention le mieux étayé).
    // ⚠️ Le GEL l'emporte sur la simple prudence : la contrainte la plus forte gagne (une zone
    // ACTIVE ne se fait pas « diluer » par une zone LATENTE déclarée après elle).
    if (regle.volume?.gel) {
      if (!contraintes.volume.gel) contraintes.volume.pourquoi = regle.volume.pourquoi;
      contraintes.volume.gel = true;
      zones_volume_gele.push(lim.libelle);
      actions.push({ type: "volume", quoi: "**Volume de course GELÉ** (il ne monte plus)", pourquoi: regle.volume.pourquoi });
    } else if (regle.volume?.progression_prudente) {
      contraintes.volume.progression_prudente = true;
      if (!contraintes.volume.gel && !contraintes.volume.pourquoi) contraintes.volume.pourquoi = regle.volume.pourquoi;
      zones_volume_prudent.push(lim.libelle);
      actions.push({ type: "volume", quoi: "Progression du volume **prudente** (graduelle, jamais brutale)", pourquoi: regle.volume.pourquoi });
    }

    // --- DÉNIVELÉ : LA DESCENTE EST EXCENTRIQUE. C'est le point que le moteur ratait.
    if (regle.denivele?.eviter) {
      if (!contraintes.denivele.eviter) contraintes.denivele.pourquoi = regle.denivele.pourquoi;
      contraintes.denivele.eviter = true;
      zones_denivele_evite.push(lim.libelle);
      actions.push({ type: "denivele", quoi: "**Dénivelé retiré du plan** — c'est la **DESCENTE** qui est en cause (excentrique), pas la montée", pourquoi: regle.denivele.pourquoi });
    } else if (regle.denivele?.progressif) {
      contraintes.denivele.progressif = true;
      if (!contraintes.denivele.eviter && !contraintes.denivele.pourquoi) contraintes.denivele.pourquoi = regle.denivele.pourquoi;
      zones_denivele_progressif.push(lim.libelle);
      actions.push({ type: "denivele", quoi: "**Dénivelé à construire progressivement**, et **séparément du volume**", pourquoi: regle.denivele.pourquoi });
    }

    // --- CADENCE : le seul levier SOURCÉ qui abaisse la charge articulaire en course.
    if (regle.cadence?.requise) {
      if (!contraintes.cadence.requise) contraintes.cadence.pourquoi = regle.cadence.pourquoi;
      contraintes.cadence.requise = true;
      if (regle.cadence.hors_cible_source) contraintes.cadence.hors_cible_source = true;
      zones_cadence.push(lim.libelle);
      actions.push({ type: "cadence", quoi: "**Nudge de cadence : plus optionnel** (+5–10 %, progressif, jamais brutal)", pourquoi: regle.cadence.pourquoi });
    } else if (regle.cadence && regle.cadence.requise === false) {
      actions.push({ type: "cadence", quoi: "Cadence : **aucune promesse** pour cette zone", pourquoi: regle.cadence.pourquoi });
    }

    // --- PLACEMENT : durci ou non — la décision est TRANCHÉE, et elle est expliquée (voir placement.js).
    if (regle.placement) {
      actions.push({
        type: "placement",
        quoi: regle.placement.durcir
          ? "**Contrainte de placement DURCIE** (48 h n'est plus « acceptable »)"
          : "Contrainte de placement **inchangée** (24–48 h)",
        pourquoi: regle.placement.pourquoi,
      });
    }

    for (const r of regle.regles ?? []) if (!regles.includes(r)) regles.push(r);
    for (const sv of regle.surveiller ?? []) surveiller.push({ zone: lim.zone, libelle: lim.libelle, signal: sv });

    if (regle.renvoi_pro) {
      renvois_pro.push({
        zone: lim.zone,
        libelle: lim.libelle,
        message:
          `**${lim.libelle}** — limitation **ACTIVE**, et **tu cours**. Le moteur a adapté tes sorties autour d'elle ` +
          `(volume, dénivelé, cadence) — mais **la course est un impact répété** : c'est le pire terrain pour une zone ` +
          `qui fait déjà mal, et **aucun réglage de plan ne remplace un examen**. Le moteur **ne diagnostique pas et ne ` +
          `soigne pas** : ce sont des restrictions de **PRUDENCE**, pas un **TRAITEMENT**.`,
      });
    }

    traitees.push({
      zone: lim.zone,
      libelle: lim.libelle,
      statut: lim.statut,
      libelle_statut: LIBELLES_STATUT[lim.statut],
      gravite: lim.gravite ?? null,
      description: lim.description ?? null,
      info: regle.info ?? null,
      actions,
    });
  }

  contraintes.volume.zones = contraintes.volume.gel ? zones_volume_gele : zones_volume_prudent;
  contraintes.denivele.zones = contraintes.denivele.eviter ? zones_denivele_evite : zones_denivele_progressif;
  contraintes.cadence.zones = zones_cadence;

  for (const na of non_appliquees) alertes.push(na.message);

  // ── CADENCE : connue ou pas ? Le moteur n'invente aucune valeur, mais il refuse de laisser
  // passer le meilleur levier de son dossier sans le réclamer.
  // 🔴 La SOURCE est désormais celle du module `cadence.js` — **biomécanique**, sans les deux
  // chiffres cliniques survendus (Chan 2018, Luedke 2016) qui ont été purgés le 2026-07-11.
  const cadence_spm = persona?.running?.cadence_spm ?? null;
  const cadence = contraintes.cadence.requise
    ? {
        requise: true,
        connue: cadence_spm != null && Number.isFinite(Number(cadence_spm)) && Number(cadence_spm) > 0,
        valeur: cadence_spm ?? null,
        zones: zones_cadence,
        hors_cible_source: contraintes.cadence.hors_cible_source,
        base: "BIOMÉCANIQUE (la base clinique est faible — et elle est dite)",
        en_descente: CADENCE_EN_DESCENTE,
        retire: CADENCE_RETIRE,
        source: CADENCE_SOURCE,
      }
    : null;

  if (cadence?.requise && !cadence.connue) {
    alertes.push(
      `🎯 **Ta cadence de course est INCONNUE — et c'est le meilleur levier dont dispose le moteur pour réduire la ` +
        `charge sur ${zones_cadence.join(", ")} quand tu cours.** Une hausse **modérée** (+5–10 %, progressive, jamais ` +
        `brutale) raccourcit la foulée et abaisse la contrainte **fémoro-patellaire** : **−14 % de force de pointe** pour ` +
        `**+10 % de fréquence de pas** (Lenhart 2014). ⛰️ **Et elle vaut EN DESCENTE — elle y est même plus pertinente.** ` +
        `**Mesure-la** (montre, ou compte tes pas sur 30 s × 2) et renseigne \`running.cadence_spm\` : c'est **gratuit**, et ` +
        `c'est la meilleure chose que tu puisses faire pour cette zone. Sans elle, le moteur ne peut **pas** chiffrer ton nudge — ` +
        `et il n'inventera pas ta cadence. ⚠️ **Base BIOMÉCANIQUE, pas clinique** : les deux chiffres cliniques qui ` +
        `justifiaient ce levier ont été **retirés** (veille/20 §8) — le levier reste, ses béquilles sont tombées.`
    );
  }

  // Si des limitations existent et qu'AUCUNE n'a produit d'adaptation de course, le dire.
  if (valides.length && !traitees.some((t) => t.actions?.length)) {
    const sansObjet = traitees.every((t) => t.sans_objet);
    if (!sansObjet && !non_appliquees.length) {
      alertes.push("Aucune adaptation de course n'a été appliquée malgré des limitations déclarées — vérifie leurs statuts.");
    }
  }

  return {
    court: true,
    limitations: traitees,
    non_appliquees,
    contraintes,
    zone_jambes_active: zoneJambesActive(valides),
    cadence,
    regles,
    surveiller,
    renvois_pro,
    non_source: NON_SOURCE_COURSE,
    alertes,
    source: "veille/03 §5 (charge graduelle) & §5 ter (le renfo ne protège pas) · **veille/20** (la descente est la contrainte ; cadence : base biomécanique — §7–8) · veille/11 §2–3 (placement, calibré MUSCU) · ADR 0006 §1.5",
  };
}
