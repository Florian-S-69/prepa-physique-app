// ÉCHAUFFEMENT — et RIEN de plus que ce que les sources autorisent à dire.
//
// Source unique : docs/veille/18-echauffement.md (cycle 25, 2026-07-11), §9 « implications
// produit pour l'agent moteur ». Ce module encode les 8 règles et respecte les 3 interdits.
//
// ── Pourquoi ce module est écrit sur ce ton ────────────────────────────────────────────────
// Le domaine de l'échauffement est SATURÉ de chiffres survendus (« ça divise le risque de
// blessure par deux », « les étirements statiques ruinent ta séance », « le protocole RAMP
// améliore tes perfs de X % »). Les trois sont faux ou non étayés. La veille est allée aux
// sources primaires ; ce module ne dit QUE ce qu'elles disent (philosophy §2).
//
// Les trois interdits, encodés (et verrouillés par des tests) :
//   ❌ « l'échauffement divise le risque de blessure par deux »
//   ❌ « le protocole RAMP améliore vos performances de X % »
//   ❌ « les étirements statiques ruinent votre séance »
//   ❌ « cet échauffement va soigner ton épaule »
//
// Module PUR : aucune I/O. Les séances (avec leurs charges RÉELLES) sont injectées.

import { normaliserNom } from "./exercices.js";
import { limitationsDe } from "./personne.js";

// ─────────────────────────────────────────────── Traçabilité : le niveau de preuve, item par item
//
// Règle 7 de veille/18 §9.1 : « chaque item d'échauffement porte sa SOURCE et son NIVEAU DE
// PREUVE. Le "pourquoi ?" de l'utilisateur doit renvoyer un niveau de preuve honnête. »
export const NIVEAUX_PREUVE = {
  demontre: { badge: "🟢 **Démontré**", note: "essai(s) contrôlé(s) ; l'effet est mesuré (et souvent modeste)" },
  plausible: { badge: "🟠 **Plausible**", note: "mécanisme ou EMG : un INDICE de ce qui est sollicité, PAS une preuve de bénéfice clinique" },
  convention: { badge: "🟡 **Convention**", note: "pratique de coach cohérente, mais NON testée — dit comme tel" },
};

// ─────────────────────────────────────────────── Ce que l'échauffement fait vraiment (chiffres honnêtes)

export const EFFET_BLESSURE = {
  rr: 0.843,
  ic95: [0.749, 0.949],
  reduction_pct: 16,
  population: "sports collectifs (football surtout), pas la musculation",
  source: "Okobi et al., *Cureus* 2022;14(6):e26123 — 20 ECR, 19 712 sujets, 2 855 blessures",
  texte:
    "**Blessures : RR 0,843 [0,749–0,949], soit ≈ −16 % de risque relatif.** Significatif, mais **MODESTE** " +
    "(Okobi et al., *Cureus* 2022;14(6):e26123 — 20 ECR, 19 712 sujets). ⚠️ **Ce chiffre ne vient PAS de la " +
    "musculation** : les méta-analyses portent sur les **sports collectifs**, avec des programmes structurés " +
    "type FIFA 11+ (15–20 min de force/équilibre/pliométrie) — pas « 8 min de vélo avant le développé couché ». " +
    "**À ce jour, aucun essai contrôlé ne teste l'effet de l'échauffement sur les blessures en musculation** ; " +
    "la revue la plus récente du domaine (Kawa et al., *Cureus* 2025;17(10):e94035) le recommande **par " +
    "extrapolation**. Ce n'est donc **pas « ton » risque** — c'est le meilleur ordre de grandeur disponible, " +
    "et il est **extrapolé**. On te le dit plutôt que de te vendre un chiffre rond.",
  preuve: "demontre",
};

export const EFFET_PERFORMANCE = {
  texte:
    "**Performance : effet cohérent, et modeste.** Fradkin et al. (*J Strength Cond Res* 2010;24(1):140-8) " +
    "trouvent la performance améliorée dans **79 % des critères examinés** — ⚠️ c'est un **décompte de " +
    "critères**, **pas** une taille d'effet : on ne peut pas en tirer « +79 % de perf », ni même un « +X % ». " +
    "Les effets aigus réellement mesurés sur les tests explosifs tournent autour de **d ≈ 0,4–0,5** " +
    "(≈ 2 cm de détente, ≈ 0,08 s sur 30 m). **Réel, utile, modeste** — et c'est **suffisant** pour " +
    "l'imposer, sans avoir besoin de le survendre.",
  preuve: "demontre",
};

// Le cadre RAMP : on s'en sert comme CHECKLIST, jamais comme d'une intervention prouvée.
export const CADRE_RAMP = {
  texte:
    "🔴 **RAMP n'est pas un protocole validé : c'est une GRILLE DE COACH.** Le cadre vient de Jeffreys " +
    "(*Professional Strength & Conditioning*, UKSCA, n° 6, 2007). Il n'existe **aucune méta-analyse de RAMP " +
    "en tant que tel**, et **une seule** étude le teste **comme un tout** : Girginer et al. (*Frontiers in " +
    "Physiology* 2025;16:1612611) — **n = 14** footballeurs, crossover, **effets aigus seulement**. " +
    "Le moteur s'en sert comme **structure** — une checklist qui évite d'oublier une phase — et **jamais** " +
    "comme d'une intervention supérieure démontrée. **Aucun gain de performance chiffré ne sera jamais " +
    "attribué à l'acronyme.** Ce sont les **composants** (montée en température, mobilité dynamique, " +
    "montée en intensité) qui sont étayés, pas la grille qui les range.",
  preuve: "convention",
};

// Étirements statiques : le débunk était LUI AUSSI survendu. On borne, on n'interdit pas.
export const ETIREMENTS = {
  duree_max_s: 30,
  texte:
    "**Étirements statiques : on BORNE, on n'interdit pas.** L'idée qu'ils **ruineraient** ta séance — que tu " +
    "as probablement lue partout — est **elle aussi survendue**. Warneke & Lohmann (*J Sport Health Sci* " +
    "2024;13(6):805-819 — méta-analyse multiniveaux, **83 études, 2 012 sujets**) : sous **60 s par muscle**, " +
    "l'effet sur la force est **trivial et NON significatif** (ES −0,13, **p = 0,20**) ; c'est **au-delà de " +
    "60 s** qu'il devient grand (ES −0,84). Et sur les tâches athlétiques (saut, sprint), l'effet est même " +
    "**légèrement positif**. Behm et al. (2016) ajoutent que l'effet **disparaît** quand l'étirement est " +
    "intégré dans un échauffement **complet** (suivi d'une phase dynamique et d'une montée en intensité).",
  regles: [
    "Maintiens **< 30 s par muscle** (marge sous le seuil de 60 s où l'effet apparaît).",
    "**Jamais en dernier** avant une série lourde : toujours suivis de la mobilité dynamique et des séries d'approche.",
    "Si l'objectif est la **souplesse**, l'idéal reste **après** la séance.",
    "⚠️ Ils ne **préviennent pas** les blessures non plus : ce n'est pas un argument, dans un sens comme dans l'autre.",
  ],
  preuve: "demontre",
};

// Séries d'approche : le SEUL point chiffré du dossier. Tout le reste du « ramping » est convention.
export const REGLE_SERIES_APPROCHE = {
  texte:
    "**Les séries d'approche sont LE vrai échauffement spécifique** — et le seul point **chiffré** du " +
    "dossier (Ribeiro et al., *IJERPH* 2020;17(18):6882 — crossover, 40 hommes entraînés) :\n" +
    "- **Poussée (développé)** : le protocole **progressif** gagne — **6 reps @ ~40 %** puis **6 reps @ ~80 %** " +
    "de la charge de travail (travail total 4 749,9 vs 4 631,8 J, p = 0,01).\n" +
    "- **Squat / jambes** : **UNE SEULE** série @ ~80 % suffit — en faire deux **accumule de la fatigue** sans " +
    "rien gagner (vitesse propulsive 0,71 vs 0,67 m/s, p = 0,02).\n" +
    "- Coût en fatigue : **négligeable** dans les deux cas.\n" +
    "- 🟡 **Le « ramping » classique à 5–6 paliers** (barre à vide → 50 % → 70 % → 85 % → 95 %) **n'est étayé " +
    "par AUCUNE donnée** : c'est une **pratique de coach**, cohérente et probablement sans danger, mais **non " +
    "testée**. Le moteur ne la fabrique pas.\n" +
    "- ⚠️ **Aucune donnée** non plus sur l'effet des séries d'approche sur les **blessures**.",
  preuve: "demontre",
};

// La « potentiation » du grand public, ce sont les séries d'approche — PAS un protocole PAPE
// (charges lourdes + longs repos). Les méta sur la PAPE sont tièdes, et 0–1 min de repos est
// même DÉLÉTÈRE (d = −0,33). veille/18 §3 & §9.2.
export const PAS_DE_PAPE =
  "⚠️ Le « P » de RAMP (*Potentiate*) n'est **pas** un protocole PAPE (charge lourde + 5 min de repos avant " +
  "le travail) : les méta-analyses sont **tièdes** sur la PAPE (effet petit, d ≈ 0,09–0,14, et **délétère** " +
  "à 0–1 min de repos, d = −0,33 — *Frontiers in Physiology* 2023;14:1202789). Pour toi, la potentiation, " +
  "**ce sont juste tes séries d'approche**.";

// ─────────────────────────────────────────────── Blocs par FAMILLE de pattern (règle 3 de §9.1)
//
// « L'échauffement est FONCTION DU PATTERN, pas de la séance : jour Push ⇒ bloc épaule ;
//   jour Legs ⇒ bloc hanche/cheville ; jour Pull ⇒ bloc scapulaire léger. »
//
// ⚠️ ZÉRO DÉPENDANCE AU MATÉRIEL (règle 8) : chaque bloc existe en version poids du corps.
// L'élastique est un BONUS, jamais un prérequis — et son argument est MÉCANIQUE, pas chiffré.

export const FAMILLES_ECHAUFFEMENT = {
  epaule: {
    libelle: "épaule (poussée)",
    patterns: ["push_h", "push_v"],
    mobilise: [
      {
        quoi: "Cercles de bras, petits → grands",
        combien: "2 × 10 (av. / arr.)",
        pourquoi: "amener l'épaule dans l'amplitude de la séance, **progressivement et SOUS le seuil de douleur**.",
        source: "cadre RAMP (Jeffreys 2007) — phase *Mobilise*",
        preuve: "convention",
      },
      {
        quoi: "Ouverture thoracique (*open book*) au sol",
        combien: "6 / côté",
        pourquoi:
          "la mobilité thoracique est **plausible** pour gagner de l'**amplitude** en poussée. ⚠️ Ce n'est **PAS** un " +
          "traitement de l'épaule : Barrett et al. (*Manual Therapy* 2016;26:38-46) montrent que la cyphose thoracique " +
          "**n'est pas** un contributeur important de la douleur d'épaule. On ne te vendra pas « débloque ton dos et " +
          "ton épaule ira mieux ».",
        source: "Barrett et al. 2016 (ce qu'on NE peut PAS en conclure)",
        preuve: "plausible",
      },
      {
        quoi: "*Wall slide* (glissé au mur)",
        combien: "2 × 8",
        pourquoi:
          "active le **dentelé antérieur** de façon **croissante avec l'angle d'élévation** → il complète le push-up plus " +
          "**au-dessus de 90°**, là où celui-ci décroche.",
        source: "Hardwick et al., *JOSPT* 2006;36(12):903-10 (EMG)",
        preuve: "plausible",
      },
    ],
    activate: [
      {
        quoi: "**Push-up plus** (pompe + protraction finale — genoux au sol si besoin)",
        combien: "2 × 8–10",
        pourquoi:
          "la **plus forte activation du dentelé antérieur** parmi les exercices classiques (surtout ≤ 90° d'élévation). " +
          "⚠️ C'est de l'**EMG** : ça dit ce qui est *sollicité*, pas que ça *prévient* quoi que ce soit.",
        source: "Hardwick et al., *JOSPT* 2006 (EMG)",
        preuve: "plausible",
      },
      {
        quoi: "*Scap push-up* (pompe scapulaire, coudes tendus)",
        combien: "1 × 10",
        pourquoi: "contrôle scapulaire, sans charge externe.",
        source: "cadre RAMP (Jeffreys 2007) — phase *Activate*",
        preuve: "convention",
      },
    ],
    // Bonus élastique : un ARGUMENT MÉCANIQUE, jamais un prérequis (§7.2).
    bonus_materiel: {
      equipements: ["bands"],
      quoi: "**Rotation externe résistée à l'élastique**",
      combien: "2 × 12, lent",
      pourquoi:
        "c'est le **seul** exercice de ce bloc qu'on **ne peut pas** faire à mains nues : on ne charge pas une rotation " +
        "externe sans résistance externe. Et l'exercice **résisté** est ce qu'utilisent les essais sur la douleur " +
        "d'épaule (Wu et al., *Front Bioeng Biotechnol* 2025 — 13 ECR, 690 patients : douleur SMD −0,31, effets **« non " +
        "prononcés »** face à un exercice conventionnel). **C'est un argument MÉCANIQUE, pas un chiffre** : personne n'a " +
        "montré que « les élastiques réduisent ton risque de X % ».",
      cout: "~25 €",
      source: "Wu et al., *Front Bioeng Biotechnol* 2025;13:1560597 — 13 ECR / 690 patients (c'est l'exercice RÉSISTÉ qui y est testé)",
      preuve: "plausible",
    },
  },

  scapulaire: {
    libelle: "scapulaire (tirage)",
    patterns: ["pull_h", "pull_v"],
    mobilise: [
      {
        quoi: "Cercles de bras + rotations d'épaules amples",
        combien: "2 × 10",
        pourquoi: "amener l'épaule dans l'amplitude du tirage, sans maintien long.",
        source: "cadre RAMP (Jeffreys 2007)",
        preuve: "convention",
      },
    ],
    activate: [
      {
        quoi: "Suspension / tirage à vide en **dépression scapulaire** (descendre les épaules sans plier les bras)",
        combien: "2 × 8, 2 s de tenue",
        pourquoi: "réveiller les stabilisateurs scapulaires avant de charger le tirage — bloc **léger** : le tirage n'est pas le pattern à risque ici.",
        source: "cadre RAMP (Jeffreys 2007) — phase *Activate*",
        preuve: "convention",
      },
    ],
    bonus_materiel: {
      equipements: ["bands"],
      quoi: "*Band pull-apart*",
      combien: "2 × 15",
      pourquoi: "charge graduée du haut du dos / rotateurs, impossible à mains nues. **Bonus, pas prérequis.**",
      cout: "~25 €",
      source: "veille/18 §7.2 (argument mécanique, aucun chiffre de réduction de risque n'existe)",
      preuve: "plausible",
    },
  },

  hanche_cheville: {
    libelle: "hanche / cheville (jambes)",
    patterns: ["squat", "hinge"],
    mobilise: [
      {
        quoi: "Balancés de jambe (avant/arrière, puis latéraux)",
        combien: "10 / côté / sens",
        pourquoi: "mobilité **dynamique** de la hanche dans l'amplitude de la séance — pas de maintien long avant du lourd.",
        source: "cadre RAMP (Jeffreys 2007) — phase *Mobilise*",
        preuve: "convention",
      },
      {
        quoi: "Mobilité de cheville (genou au mur, talon au sol)",
        combien: "8 / côté",
        pourquoi: "la cheville borne la profondeur du squat ; on ouvre l'amplitude avant de la charger.",
        source: "cadre RAMP (Jeffreys 2007)",
        preuve: "convention",
      },
    ],
    activate: [
      {
        quoi: "Squat au poids du corps, amplitude progressivement croissante",
        combien: "2 × 8",
        pourquoi: "répéter le pattern à vide avant de le charger : c'est la transition naturelle vers les séries d'approche.",
        source: "cadre RAMP (Jeffreys 2007) — phase *Activate*",
        preuve: "convention",
      },
      {
        quoi: "Pont fessier (au sol)",
        combien: "1 × 12",
        pourquoi: "réveiller l'extension de hanche avant le squat / la charnière.",
        source: "cadre RAMP (Jeffreys 2007)",
        preuve: "convention",
      },
    ],
  },
};

// Phase RAISE — universelle, valable pour toutes les séances.
export const PHASE_RAISE = {
  quoi: "Cardio léger **progressif** (vélo, rameur, corde, marche rapide) — de quoi **transpirer légèrement**",
  combien: "3–5 min",
  pourquoi:
    "élever température corporelle, fréquence cardiaque, débit sanguin et viscosité articulaire. C'est la brique la " +
    "mieux étayée de l'échauffement (effet **modeste** sur la performance, cf. Fradkin 2010).",
  source: "veille/18 §3 & §8.1",
  preuve: "demontre",
};

// ─────────────────────────────────────────────── SÉRIES D'APPROCHE, avec les CHARGES RÉELLES

/** Arrondi au palier de 2,5 kg (le plus petit disque courant). Jamais en dessous de 0. */
function arrondi2kg5(kg) {
  return Math.max(0, Math.round(kg / 2.5) * 2.5);
}

/** Patterns « jambes » : une SEULE série d'approche @ ~80 % suffit (Ribeiro 2020, squat). */
const PATTERNS_JAMBES = ["squat", "hinge"];

/**
 * Séries d'approche d'UN exercice, **avec ses charges réelles** (règle 4 de §9.1 : « affichées
 * comme des SÉRIES cochables, pas comme un conseil vague »).
 *
 * Deux protocoles, et deux seulement — ce sont les seuls mesurés (Ribeiro et al. 2020) :
 *   • poussée / tirage : 6 reps @ ~40 %  puis  6 reps @ ~80 % de la charge de travail ;
 *   • squat / charnière : 1 série de 6 reps @ ~80 % (deux séries accumulent de la fatigue).
 *
 * ⚠️ Sans charge de travail connue, le moteur **ne fabrique aucun pourcentage** : il le DIT.
 * ⚠️ Au poids du corps (charge 0), un pourcentage n'a pas de sens : on donne des reps faciles.
 */
export function seriesApproche(exo) {
  const charge = exo?.charge_depart_kg ?? exo?.charge_max_kg ?? null;
  const jambes = PATTERNS_JAMBES.includes(exo?.pattern);
  const base = { exercice: exo?.nom ?? null, pattern: exo?.pattern ?? null, protocole: jambes ? "squat" : "poussee", preuve: "demontre" };

  if (charge == null) {
    return {
      ...base,
      charge_connue: false,
      series: [],
      message:
        `**Charge de travail inconnue** pour « ${exo?.nom ?? "cet exercice"} » : le moteur ne peut donc pas calculer ` +
        `tes ~40 % / ~80 %, et **il n'invente pas de chiffre**. Applique le protocole sur la charge que tu prends ` +
        `aujourd'hui, puis logue-la (\`log … --ex=…\`) : les séries d'approche seront chiffrées dès le prochain \`gen\`.`,
    };
  }

  if (charge === 0) {
    return {
      ...base,
      charge_connue: true,
      charge_travail_kg: 0,
      series: [{ palier: "à vide", reps: 8, pourquoi: "au poids du corps, un pourcentage n'a pas de sens : on répète le mouvement facile (amplitude réduite ou appuis facilités) avant les séries effectives." }],
    };
  }

  const series = jambes
    ? [{ palier: "~80 %", pct: 80, charge_kg: arrondi2kg5(charge * 0.8), reps: 6 }]
    : [
        { palier: "~40 %", pct: 40, charge_kg: arrondi2kg5(charge * 0.4), reps: 6 },
        { palier: "~80 %", pct: 80, charge_kg: arrondi2kg5(charge * 0.8), reps: 6 },
      ];

  return {
    ...base,
    charge_connue: true,
    charge_travail_kg: charge,
    series,
    pourquoi: jambes
      ? "Squat / charnière : **une seule** série d'approche lourde suffit — en faire deux **accumule de la fatigue** sans rien gagner (Ribeiro 2020, protocole WU80 : meilleure vitesse propulsive sur les séries 2–3)."
      : "Poussée / tirage : le protocole **progressif** (40 % puis 80 %) est le meilleur — travail total supérieur et pic de vitesse atteint plus vite (Ribeiro 2020, développé couché).",
    // Une charge à re-tester : la montée en charge EST le re-test (elle ne s'y ajoute pas).
    re_test: exo?.charge_a_confirmer === true,
  };
}

// ─────────────────────────────────────────────── 🚑 DÉTECTEUR DE RENVOI MÉDICAL (non skippable)
//
// Règle 6 de §9.1 : « si l'utilisateur déclare l'un des signaux de la §6.5, afficher un écran de
// renvoi vers un professionnel, NON SKIPPABLE une première fois, et retirer de la génération toute
// prétention de "corriger" la douleur. »
//
// ⚠️ HONNÊTETÉ DE LA DÉTECTION. La `description` d'une limitation est de la **prose libre**. Le
// moteur n'y « comprend » rien : il y cherche des **mots-clés** de signal, exactement comme
// `hypotheseClinique` cherche des familles de mouvement. Conséquence, DÉCLARÉE dans la sortie :
// un signal réel qui n'est PAS écrit dans la description ne sera PAS détecté. D'où le champ
// structuré `signaux: [...]`, qui prime sur la détection textuelle quand il est fourni.

export const SIGNAUX_RENVOI = {
  restriction_amplitude: {
    libelle: "restriction d'amplitude (ne peut pas lever le bras complètement / normalement)",
    mots: ["restriction de mobilite", "restriction d amplitude", "mobilite restreinte", "mobilite reduite", "amplitude limitee", "amplitude restreinte", "perte de mobilite", "ne peut pas lever"],
  },
  craquements: {
    // ⚠️ Un craquement INDOLORE est fréquent et banal (§6.4) — le signaler seul serait alarmiste
    // et faux. Il ne devient un signal QU'associé à une douleur, une perte d'amplitude ou un
    // accrochage. Cette condition est encodée dans `detecterRenvoiMedical`, pas dans les mots.
    libelle: "craquements douloureux (≠ craquements indolores, qui sont banals)",
    mots: ["craquement", "craquements", "crepitement", "crepitements"],
    exige_contexte_douloureux: true,
  },
  douleur_nocturne_repos: {
    libelle: "douleur nocturne ou au repos",
    mots: ["douleur nocturne", "la nuit", "au repos", "reveille la nuit"],
  },
  faiblesse_blocage: {
    libelle: "faiblesse, accrochage ou blocage",
    mots: ["faiblesse", "accrochage", "blocage", "se bloque", "derobement", "derobe"],
  },
  traumatisme: {
    libelle: "traumatisme (chute, à-coup), déformation, gonflement",
    mots: ["chute", "traumatisme", "deformation", "gonflement", "a coup"],
  },
  douleur_persistante: {
    libelle: "douleur persistante (> 2–3 semaines) ou qui s'aggrave",
    mots: ["persistante", "persiste depuis", "depuis des mois", "depuis plusieurs mois", "s aggrave", "empire", "de pire en pire"],
  },
};

const MOTS_DOULEUR = ["douleur", "douloureu", "fait mal", "souffre"];
const MOTS_JAMAIS_EXAMINEE = ["jamais examinee", "jamais ete examinee", "jamais consulte", "jamais vue par", "non examinee", "jamais vu de medecin"];

// ⚠️ NÉGATION. Une détection par mots-clés est **aveugle à la négation** : « craquements audibles,
// **sans aucune douleur** » contient le mot « douleur » et déclencherait un renvoi médical — alors
// que la veille dit exactement l'inverse (§6.4 : un craquement INDOLORE est fréquent et banal).
// Envoyer quelqu'un chez le kiné pour un craquement banal, c'est de l'alarmisme — et l'alarmisme
// use la crédibilité de l'alerte qui, elle, compte vraiment.
// On ignore donc toute occurrence précédée d'une négation dans les ~12 caractères qui précèdent.
const NEGATIONS = ["sans", "aucun", "aucune", "pas de", "pas d", "plus de", "non", "ni"];

/** Le mot est-il présent AILLEURS que derrière une négation ? */
function contientHorsNegation(texte, mot) {
  let i = texte.indexOf(mot);
  while (i !== -1) {
    const avant = texte.slice(Math.max(0, i - 12), i);
    if (!NEGATIONS.some((n) => new RegExp(`\\b${n}\\b[^a-z0-9]*$`).test(avant))) return true;
    i = texte.indexOf(mot, i + 1);
  }
  return false;
}

const contientUn = (texte, mots) => mots.some((m) => contientHorsNegation(texte, m));

/**
 * Cherche les signaux de renvoi (§6.5) déclarés par l'utilisateur.
 *
 * @param limitations limitations VALIDÉES (zone connue, statut connu — cf. limitations.js)
 * @returns { requis, bloquant, zones[], message, avertissement_detection, source }
 */
export function detecterRenvoiMedical(limitations = []) {
  const zones = [];

  for (const lim of limitations) {
    // Une limitation déclarée EXAMINÉE ne déclenche pas l'écran : la seule sortie honnête de ce
    // détecteur, c'est d'aller consulter — et de le dire au moteur (`examinee: true`).
    if (lim?.examinee === true) continue;

    const texte = normaliserNom(lim?.description ?? "");
    const explicites = Array.isArray(lim?.signaux) ? lim.signaux : null;
    // Un statut ACTIF signifie « douleur/gêne présente aujourd'hui » — c'est le contexte douloureux
    // par définition. Sinon, on le cherche dans la prose, négations comprises.
    const contexteDouloureux = lim?.statut === "ACTIF" || contientUn(texte, MOTS_DOULEUR);

    const trouves = [];
    for (const [code, sig] of Object.entries(SIGNAUX_RENVOI)) {
      // Le champ structuré prime sur la prose : quand l'utilisateur (ou l'app) déclare ses
      // signaux, on ne devine plus.
      const declare = explicites ? explicites.includes(code) : contientUn(texte, sig.mots);
      if (!declare) continue;
      // Craquements : banals s'ils sont INDOLORES (§6.4). Ils ne comptent qu'associés à une douleur,
      // une perte d'amplitude ou un accrochage — sinon on alarme pour rien.
      if (sig.exige_contexte_douloureux && !contexteDouloureux && !trouves.some((t) => t.code === "restriction_amplitude" || t.code === "faiblesse_blocage")) continue;
      trouves.push({ code, libelle: sig.libelle });
    }
    if (!trouves.length) continue;

    zones.push({
      zone: lim.zone,
      libelle: lim.libelle ?? lim.zone,
      possessif: lim.possessif ?? `ta zone « ${lim.zone} »`,
      statut: lim.statut,
      signaux: trouves,
      jamais_examinee: MOTS_JAMAIS_EXAMINEE.some((m) => texte.includes(m)) || lim.examinee === false,
      description: lim.description ?? null,
    });
  }

  if (!zones.length) {
    return { requis: false, bloquant: false, zones: [], source: "veille/18 §6.5" };
  }

  const total = zones.reduce((n, z) => n + z.signaux.length, 0);
  return {
    requis: true,
    // Règle 6 : NON SKIPPABLE. Ce bloc s'affiche AVANT le programme, pas en pied de page.
    bloquant: true,
    zones,
    message:
      `Ce que tu as décrit coche **${total} signal(aux) de renvoi vers un professionnel** (kiné ou médecin du sport). ` +
      `**Aucun de ces signaux ne se gère par un échauffement** — ni par un élastique, ni par une app, **celle-ci comprise**. ` +
      `C'est la seule ligne de ce programme qui n'est pas négociable.`,
    ce_que_le_moteur_ne_fait_pas: [
      "Il **ne diagnostique pas** : il ne nommera aucune pathologie (« conflit sous-acromial », « tendinite de la coiffe »…).",
      "Il **n'interprète pas** tes craquements : indolores, ils sont fréquents et banals ; associés à une douleur ou à une perte d'amplitude, ils justifient un avis — et **ce tri n'est pas à l'app de le faire**.",
      "Il **ne prescrit aucune rééducation** (progressions excentriques ciblées, dosage douleur-guidé) : c'est un **acte de soin**, hors périmètre (veille/07).",
      "Il **ne promet aucune guérison**. Cet échauffement **ne va pas soigner ton épaule** — il prépare la séance, c'est tout.",
    ],
    ce_que_le_moteur_fait:
      "Il **adapte l'entraînement autour** de la zone : retraits ciblés, substitutions au sein du même pattern, RIR relevé, " +
      "plafonds de charge, amplitude bornée sous le seuil de douleur. Ce sont des **restrictions de PRUDENCE, pas un TRAITEMENT.**",
    avertissement_detection:
      "_Détection par **mots-clés** dans ce que tu as écrit — le moteur ne « comprend » pas ta description, il y cherche des " +
      "signaux connus. **Un signal réel que tu n'aurais pas écrit ne sera pas détecté** : renseigne alors `signaux: [...]` " +
      "explicitement dans ta limitation._",
    source: "veille/18 §6.5 (signaux de renvoi) & §6.4 (ce que le produit ne doit PAS faire)",
  };
}

// ─────────────────────────────────────────────── Restrictions de PRUDENCE (pas un traitement)

export const RESTRICTIONS_PRUDENCE = {
  epaule: [
    "Développé militaire **lourd**",
    "Dips **lestés**",
    "Tirage **nuque**",
    "Développé couché en **amplitude maximale, coudes très écartés**",
  ],
  texte:
    "Tant qu'une douleur est **active**, on évite les positions les plus exposantes et on **borne l'amplitude sous le " +
    "seuil de douleur**. ⚠️ **Ce sont des restrictions de PRUDENCE, pas un TRAITEMENT.** Le moteur **ne rééduque pas** : " +
    "il choisit de ne pas t'emmener là où ça fait mal, et c'est tout ce qu'il prétend faire.",
  source: "veille/18 §6.3 (ce que le produit PEUT faire) & §9.1 règle 5",
  preuve: "convention",
};

// ─────────────────────────────────────────────── Échauffement d'UNE séance (fonction du pattern)

const ORDRE_PHASES = ["raise", "mobilise", "activate", "potentiate"];

/**
 * Échauffement d'une séance donnée — construit à partir des **patterns réellement présents**
 * dans la séance et des **charges réelles** de ses exercices (règles 3 et 4 de §9.1).
 *
 * @param seance   séance composée (exercices avec `pattern`, `type`, `charge_depart_kg`…)
 * @param options  { materiel, equipements, limitationsActives }
 */
export function echauffementSeance(seance, { materiel = "salle_complete", equipements = [], limitationsActives = [] } = {}) {
  const exercices = seance?.exercices ?? [];
  const patterns = [...new Set(exercices.map((e) => e.pattern).filter(Boolean))];

  // Familles concernées par CETTE séance (jour Push ⇒ épaule ; jour Legs ⇒ hanche/cheville ;
  // jour Pull ⇒ scapulaire léger). Une séance mixte (full-body) en active plusieurs — c'est
  // normal, et c'est le prix d'une séance qui touche tout.
  const familles = Object.entries(FAMILLES_ECHAUFFEMENT)
    .filter(([, f]) => f.patterns.some((p) => patterns.includes(p)))
    .map(([code, f]) => ({ code, ...f }));

  // Une zone ACTIVE dont le pattern est dans la séance rend l'échauffement NON SKIPPABLE
  // (règle 2 de §9.1 — choix de SÉCURITÉ produit assumé, pas une conclusion scientifique).
  const zonesActivesConcernees = limitationsActives.filter((l) =>
    (l.patterns_famille ?? []).some((p) => patterns.includes(p))
  );

  const mobilise = familles.flatMap((f) => f.mobilise.map((i) => ({ ...i, famille: f.code })));
  const activate = familles.flatMap((f) => f.activate.map((i) => ({ ...i, famille: f.code })));

  // Bonus matériel : proposé UNIQUEMENT s'il est déjà dans le matériel déclaré. Jamais un
  // prérequis ; l'argument d'achat vit ailleurs (`suggestionMateriel`), et il est mécanique.
  const bonus = familles
    .map((f) => f.bonus_materiel)
    .filter((b) => b && b.equipements.some((e) => equipements.includes(e)))
    .map((b) => ({ ...b, bonus: true }));

  // Séries d'approche : le PREMIER composé de chaque pattern (les suivants du même pattern
  // n'en ont plus besoin — le pattern est déjà chaud, §5.3).
  const vus = new Set();
  const approches = [];
  const deja_chauds = [];
  for (const e of exercices) {
    if (e.type !== "compose") continue;
    if (vus.has(e.pattern)) {
      deja_chauds.push(e.nom);
      continue;
    }
    vus.add(e.pattern);
    approches.push(seriesApproche(e));
  }

  return {
    seance: seance?.nom ?? null,
    patterns,
    familles: familles.map((f) => ({ code: f.code, libelle: f.libelle })),
    duree_min: "8–12 min",
    non_skippable: zonesActivesConcernees.length > 0,
    pourquoi_non_skippable: zonesActivesConcernees.length
      ? `Cette séance traverse **${zonesActivesConcernees.map((l) => l.libelle).join(", ")}** — limitation **ACTIVE**. ` +
        `L'échauffement de la zone devient **obligatoire avant tout exercice de ce pattern**, et la séance ne démarre pas sans lui. ` +
        `⚠️ **C'est un choix de SÉCURITÉ produit assumé, pas une conclusion scientifique** (veille/18 §9.1, règle 2) — l'effet ` +
        `de l'échauffement est modeste, mais son coût est de 8 minutes.`
      : null,
    phases: [
      { code: "raise", nom: "R — Raise (mise en route)", duree: "3–5 min", items: [PHASE_RAISE] },
      { code: "mobilise", nom: "M — Mobilise (amplitude de la séance)", duree: "2–3 min", items: mobilise },
      { code: "activate", nom: "A — Activate (réveiller les stabilisateurs)", duree: "2–3 min", items: [...activate, ...bonus] },
      {
        code: "potentiate",
        nom: "P — Potentiate (séries d'approche, avec TES charges)",
        duree: "intégré aux séances",
        items: [],
        series_approche: approches,
      },
    ].filter((p) => p.code === "potentiate" || p.items.length),
    series_approche: approches,
    exercices_deja_chauds: deja_chauds,
    ordre: ORDRE_PHASES,
  };
}

// ─────────────────────────────────────────────── Le bloc DOCTRINE (une fois, en tête de programme)

/**
 * Échauffement au niveau du PROGRAMME : le constat, la doctrine, ce qui est démontré et ce qui
 * ne l'est pas, le renvoi médical, les étirements. Les protocoles chiffrés, eux, vivent
 * séance par séance (`echauffementSeance`) — c'est là que sont les charges réelles.
 *
 * @param statut  `muscu.echauffement.statut` — "ABSENT" | "IRREGULIER" | "PRESENT" | "INCONNU"
 * @param actives limitations ACTIVES validées
 * @param consignesZones consignes spécifiques héritées des règles de zone (limitations.js)
 * @param muscu   bloc muscu du persona (matériel, note d'échauffement)
 */
export function echauffementProgramme(statut, actives, consignesZones, muscu, toutesLimitations = []) {
  const impose = actives.length > 0;
  const renvoi = detecterRenvoiMedical(toutesLimitations.length ? toutesLimitations : actives);

  // Règle 1 : l'échauffement est TOUJOURS généré, jamais optionnel dans la structure de séance.
  // Il reste SKIPPABLE en temps normal (l'utilisateur est adulte) — mais le skip doit être
  // JOURNALISÉ : l'effet dépend de l'observance (veille/18 §2.1 & §9.1).
  const base = [
    "**3–5 min** de mise en route générale (vélo, rameur, corde, marche rapide — de quoi transpirer légèrement).",
    "**2–5 min** de mobilité **dynamique** des articulations de la séance (pas de maintien long) + activation de la zone.",
    "**Séries d'approche** sur le 1er exercice de chaque pattern : **6 reps @ ~40 % puis 6 reps @ ~80 %** de ta charge de travail en **poussée/tirage** ; **1 seule série @ ~80 %** au **squat / en jambes** (Ribeiro 2020). ⚙️ Le moteur les calcule avec **tes charges réelles** dans chaque séance ci-dessous.",
    `**Étirements statiques** : autorisés, **< ${ETIREMENTS.duree_max_s} s par muscle**, **jamais** juste avant une série lourde — idéalement **après** la séance. On **borne**, on n'**interdit** pas.`,
  ];

  return {
    impose,
    // Règle 2 : limitation ACTIVE ⇒ NON SKIPPABLE.
    skippable: !impose,
    non_skippable: impose,
    statut_declare: statut,
    // Le moteur ne moralise pas : il constate, il explique, il impose une fois — et il passe.
    constat:
      statut === "ABSENT"
        ? `Tu déclares **ne plus t'échauffer** (${muscu?.echauffement?.note ?? "statut ABSENT"}). Avec une limitation ACTIVE, c'est le premier changement à faire — avant tout réglage de séries ou de charge. **8 à 12 minutes**, dont **rien** n'exige de matériel.`
        : statut === "INCONNU"
          ? "Échauffement non renseigné dans le persona : le moteur applique le protocole par défaut ci-dessous."
          : null,
    consignes: [...base, ...(consignesZones ?? [])],
    duree_min: "8–12 min",
    pourquoi: impose
      ? "L'échauffement n'est pas une option ici : une limitation **ACTIVE** est déclarée. ⚠️ **C'est un choix de SÉCURITÉ produit, pas une conclusion scientifique** — l'effet mesuré de l'échauffement est **modeste** (voir ci-dessous), mais il coûte 8 minutes et il est **gratuit**."
      : "Garde-fou de base. Il reste **skippable** — tu es adulte. Mais **note-le quand tu le sautes** (`log … --echauffement=saute`) : l'effet de l'échauffement **dépend de l'observance**, et un protocole qu'on ne fait pas ne vaut rien.",
    // Ce qui est démontré, ce qui ne l'est pas — le « pourquoi ? » honnête (règle 7).
    honnetete: {
      cadre: CADRE_RAMP,
      blessure: EFFET_BLESSURE,
      performance: EFFET_PERFORMANCE,
      series_approche: REGLE_SERIES_APPROCHE,
      etirements: ETIREMENTS,
      pas_de_pape: PAS_DE_PAPE,
    },
    // Zéro dépendance au matériel (règle 8).
    sans_materiel: {
      suffit: true,
      texte:
        "**Rien de cet échauffement n'exige de matériel.** Le *push-up plus* et le *wall slide* couvrent l'activation " +
        "scapulaire (EMG : Hardwick et al., *JOSPT* 2006), et les séries d'approche font le reste. " +
        "Une paire d'**élastiques (~25 €)** débloque la **rotation externe résistée** — **impossible à mains nues** — et " +
        "c'est un **argument mécanique**, pas un chiffre : **personne n'a montré** que les élastiques réduisent le risque " +
        "de blessure de X %. **Bon achat, jamais un prérequis. Le moteur ne conditionne pas l'échauffement à un achat.**",
    },
    restrictions_prudence: impose ? RESTRICTIONS_PRUDENCE : null,
    renvoi_medical: renvoi,
    source: "veille/18 (échauffement, RAMP, étirements, séries d'approche, épaule) · veille/02 §6",
  };
}

// ─────────────────────────────────────────────── Observance (le skip journalisé sert à ça)

const STATUTS_ECHAUFFEMENT = ["fait", "partiel", "saute"];
export const STATUTS_ECHAUFFEMENT_JOURNAL = STATUTS_ECHAUFFEMENT;

/**
 * Observance réelle de l'échauffement, lue dans le journal (règle 1 : « la skippabilité doit être
 * JOURNALISÉE — elle nourrit l'explication et l'observance »).
 *
 * Pourquoi ça compte : l'effet de l'échauffement sur les blessures est **modulé par l'observance**
 * (IJERPH 2022;19(10):6336 — > 70 % d'observance : IRR 0,56 ; < 70 % : IRR 0,81). ⚠️ Ces chiffres
 * viennent des **sports collectifs chez des jeunes** : on ne les transpose PAS à la musculation, et
 * le moteur n'affiche **aucun chiffre de risque** ici. Ce qu'on en retient est **qualitatif** : un
 * protocole qu'on ne fait pas ne vaut rien — d'où le comptage.
 *
 * ⚠️ Un échauffement **sauté** alors qu'une limitation **ACTIVE** est déclarée = la règle
 * « non skippable » n'a pas été tenue. Le moteur le **dit**, sans moraliser, et une seule fois.
 */
export function observanceEchauffement(persona, journal) {
  const seances = journal?.seances_muscu ?? [];
  if (!seances.length) return null;

  // Résolveur PARTAGÉ (personne.js) : `limitations` (racine) avec repli sur `muscu.limitations`
  // (déprécié). Lire l'ancien champ en dur ici aurait rendu l'observance aveugle à une limitation
  // déclarée au bon endroit — le genre de divergence qu'une source unique existe pour empêcher.
  const actives = limitationsDe(persona).filter((l) => l?.statut === "ACTIF");
  const compte = { fait: 0, partiel: 0, saute: 0, non_renseigne: 0 };
  const violations = [];

  for (const s of seances) {
    const st = STATUTS_ECHAUFFEMENT.includes(s?.echauffement) ? s.echauffement : null;
    if (!st) {
      compte.non_renseigne++;
      continue;
    }
    compte[st]++;
    if (st === "saute" && actives.length) {
      violations.push({ date: s.date, seance: s.seance ?? "séance", zones: actives.map((l) => l.zone) });
    }
  }

  const renseignees = compte.fait + compte.partiel + compte.saute;
  const taux = renseignees ? Math.round(((compte.fait + 0.5 * compte.partiel) / renseignees) * 100) : null;

  return {
    seances: seances.length,
    renseignees,
    ...compte,
    taux_pct: taux,
    limitation_active: actives.length > 0,
    violations,
    pourquoi:
      renseignees === 0
        ? "**Échauffement non journalisé** (`--echauffement=fait|partiel|saute` au `log`). Ce n'est pas de la bureaucratie : l'effet de l'échauffement **dépend de l'observance**, donc un protocole dont on ne sait pas s'il est fait ne peut être ni évalué ni ajusté. Une case, une fois par séance."
        : `Échauffement fait sur **${compte.fait}/${renseignees}** séance(s) renseignée(s)${compte.partiel ? ` (+ ${compte.partiel} partielle(s))` : ""}${compte.saute ? `, **sauté ${compte.saute} fois**` : ""}. L'effet de l'échauffement est **modeste** — mais il est **conditionné à l'observance** : un protocole qu'on ne fait pas ne vaut rien.`,
    alerte: violations.length
      ? `**${violations.length} séance(s) avec échauffement SAUTÉ alors qu'une limitation ACTIVE est déclarée** ` +
        `(${[...new Set(violations.flatMap((v) => v.zones))].join(", ")}) : ${violations.map((v) => v.date).join(", ")}. ` +
        `La règle « limitation active ⇒ échauffement non skippable » n'a pas été tenue. Le moteur le constate — il ne moralise pas, ` +
        `et il ne le répétera pas. ⚠️ Rappel honnête : **l'échauffement ne réglera pas la zone** (l'effet est modeste, et extrapolé ` +
        `des sports collectifs). C'est un **examen** qu'il faut, pas 8 minutes de vélo. Les deux, en fait.`
      : null,
    source: "veille/18 §2.1 (observance modératrice) & §9.1 règle 1",
  };
}
