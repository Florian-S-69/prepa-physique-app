// ANGLES MORTS — « ce que le moteur ne sait pas de TOI, et qu'il te dit »
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// POURQUOI CE MODULE EXISTE
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Le moteur a été construit et vérifié sur **DEUX humains** : deux hommes de 27 ans. Son
// **architecture** est générique — aucune ligne de code ne les nomme, et les tests en sont
// délibérément découplés. Mais **« architecture générique » ≠ « validé sur d'autres humains »**,
// et ces deux-là ne sont pas tout le monde.
//
// 🔴 **Ce que la batterie adverse a trouvé le 2026-07-11 (et c'est le défaut le plus SOURNOIS du
// moteur — plus qu'un plantage, qui au moins se voit).**
//
// On a servi à une **femme de 29 ans** un programme de musculation complet **et** une cible de
// **1 623 kcal/j en déficit**. Le mot « femme » n'apparaissait **nulle part** dans les deux
// documents — sauf dans son propre nom. La seule source chiffrée qu'on lui citait disait
// littéralement, dans le texte affiché : *« 40 **hommes** entraînés »*. Chaque nombre était servi
// avec une colonne « Pourquoi » et un aplomb total.
//
// **Le moteur ne mentait pas. Il se taisait — ce qui, sur un produit de santé, revient au même :
// l'utilisateur ne peut pas corriger ce qu'on ne lui dit pas.**
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// LA DOCTRINE — et elle est étroite exprès
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Ce module **n'ajoute AUCUNE règle de programmation**. Il ne baisse pas un volume, ne rallonge pas
// une récupération, n'invente pas un coefficient. **Il DÉCLARE.**
//
// C'est délibéré, et c'est l'ADR 0006 : **mieux vaut refuser que d'inventer.** Fabriquer une
// « périodisation menstruelle » ou un « −20 % de volume après 60 ans » ferait *paraître* le moteur
// plus générique tout en le rendant **faux** — et un faux qui rassure est pire qu'un trou avoué.
//
// ⚠️ **Ne pas confondre avec la TIÉDEUR.** Le moteur ne dit pas « ça dépend ». Il dit exactement :
// **où** il lit la donnée, **ce qu'il n'en fait pas**, **ce qu'il refuse d'inventer**, et **ce que
// ça te coûte**. Un aveu précis est une information ; un hedge est du bruit.
//
// Module **PUR** : aucune I/O, aucune dépendance.

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LE FAIT BRUT, VÉRIFIABLE PAR GREP (et c'est le but)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Les SEULS endroits du moteur où `profil.sexe` est lu. Vérifié par `grep -rn "sexe" src/`, et
 * **verrouillé par un test** (`tests/adversaires.test.js`) : si un module se met à lire le sexe
 * sans le déclarer ici, la suite échoue. L'aveu ne peut pas se périmer en silence.
 */
export const OU_LE_SEXE_EST_LU = [
  {
    ou: "nutrition.js → `bmrMifflin`",
    quoi: "la constante de Mifflin-St Jeor (**+5** pour un homme, **−161** pour une femme). **Le seul usage physiologiquement fondé** (veille/21 §6.2).",
  },
  {
    ou: "red-s.js → orientation fer",
    quoi:
      "une **orientation** (jamais une prescription) : femme + course + fatigue persistante **déclarée** → *« parles-en à un médecin »* " +
      "(veille/21 §6.4 — jusqu'à 60 % de carence martiale chez les athlètes féminines). **Aucun complément n'est prescrit.**",
  },
  {
    ou: "personne.js → validation",
    quoi: "le refus d'un sexe non géré par Mifflin-St Jeor.",
  },
];

/**
 * 🔴 **CE QUI A DISPARU DE CETTE LISTE LE 2026-07-11 — et pourquoi c'est la correction la plus
 * importante que ce moteur ait connue.**
 *
 * Il y avait ici une quatrième entrée : `nutrition.js → PLANCHER_KCAL` — *« le plancher calorique de
 * sécurité sous lequel le moteur refuse de prescrire (1 500 kcal / 1 200 kcal) »*.
 *
 * **Ces deux chiffres étaient inventés et faussement sourcés** (à `veille/04 §5`, qui est la section
 * « Compléments alimentaires »). Ils venaient d'une **guideline d'obésité**. **Et le garde-fou ne
 * gardait rien** : la grandeur qui gouverne le RED-S est la **disponibilité énergétique**, que le
 * moteur ne calculait jamais — aux deux planchers, elle tombe à **~55 % du seuil d'alerte** pendant
 * que le moteur affichait « conforme » (veille/21 §7.1).
 *
 * > **Le sexe n'entrait dans une décision de SÉCURITÉ qu'à un seul endroit — et il la rendait MOINS
 * > sûre** (le plancher le plus bas allait aux femmes, la population la plus exposée).
 * > ⚠️ **Et le défaut n'était pas « sexiste » : il était STRUCTUREL.** Il cassait **aussi** pour les
 * > deux personas masculins sur lesquels ce moteur a été construit. **Il a fallu regarder le produit
 * > avec les yeux d'une utilisatrice pour voir un bug qui les concernait depuis le premier jour.**
 */
export const PLANCHER_KCAL_RETIRE_LE = "2026-07-11";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LES 9 REFUS (veille/21 §10.2) — ce que le moteur ne fera PAS, même si on le lui demande
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ Un refus n'est pas un trou : c'est une **décision**. Trois d'entre eux sont **implémentés**
// (R2, R3, R4 : ils lèvent une erreur) ; les six autres sont des **interdits de conception** — le
// moteur ne les implémente pas **parce qu'il refuse de les implémenter**, et la liste existe pour
// qu'on ne les ajoute pas « par gentillesse » dans six mois.

export const REFUS = [
  {
    code: "R1_PERIODISATION_CYCLE",
    quoi: "Périodiser l'entraînement selon le cycle menstruel — ni le proposer, ni le calculer, ni le stocker.",
    pourquoi:
      "Effet groupé **ES = −0,06**, intervalle de confiance **traversant zéro** : l'effet est **trivial**. La revue-parapluie " +
      "écrit noir sur blanc que ce **« n'est pas une approche evidence-based »** (Colenso-Semple 2023). La méta que le marché " +
      "brandit porte sur de l'**isométrique**, avec **68 % d'études de qualité faible**. **C'est un piège marketing, et le " +
      "meilleur produit pour une femme n'est pas un produit rose : c'est le même moteur, avec des garde-fous qui marchent.**",
    statut: "interdit de conception",
    base: "veille/21 §3",
  },
  {
    code: "R2_GROSSESSE_POST_PARTUM",
    quoi: "Prescrire pendant la grossesse ou le post-partum.",
    pourquoi:
      "Ces populations relèvent d'un cadre clinique (contre-indications absolues et relatives, questionnaire de dépistage validé, " +
      "suivi obstétrical) que le moteur **n'a pas et ne peut pas avoir**. ⚠️ **Refuser de prescrire n'est PAS décourager de bouger** : " +
      "l'activité physique **est recommandée** pendant et après la grossesse. Le moteur le dit, et renvoie aux guidelines.",
    statut: "IMPLÉMENTÉ (personne.js — refus à la normalisation)",
    base: "veille/21 §7.3",
  },
  {
    code: "R3_DE_SOUS_SEUIL",
    quoi: "Creuser un déficit quand la disponibilité énergétique estimée passe sous ~30 kcal/kg de masse maigre/j.",
    pourquoi: "C'est le frein RED-S. Il remplace le plancher calorique inventé — et il mord sur **les deux sexes**.",
    statut: "IMPLÉMENTÉ (red-s.js — quand les données existent ; AVEU explicite sinon)",
    base: "veille/21 §6.3 & §7.1",
  },
  {
    code: "R4_AMENORRHEE",
    quoi: "Prescrire un déficit sur une aménorrhée déclarée.",
    pourquoi: "Signal fréquent, jamais anodin, **jamais à interpréter par un moteur**. Il s'arrête et il oriente.",
    statut: "IMPLÉMENTÉ (red-s.js)",
    base: "veille/21 §6.3 & §7.4",
  },
  {
    code: "R5_SURRISQUE_LCA",
    quoi: "Afficher un sur-risque de rupture du LCA à une coureuse ou à une pratiquante de musculation.",
    pourquoi: "**Non significatif hors sports de pivot.** Une peur chiffrée hors périmètre est une faute, pas une précaution.",
    statut: "interdit de conception",
    base: "veille/21 §8",
  },
  {
    code: "R6_AVANTAGE_ULTRA",
    quoi: "Afficher que « les femmes ont un avantage en endurance longue ».",
    pourquoi: "**C'est FAUX** — l'écart reste de ~22 % sur ultra (Sitko 2025). Un mythe flatteur reste un mythe.",
    statut: "interdit de conception",
    base: "veille/21 §4.2",
  },
  {
    code: "R7_FER",
    quoi: "Prescrire du fer, ou tout complément correcteur d'une carence.",
    pourquoi:
      "Une carence se **dose** (prise de sang) et se **traite médicalement** ; la supplémentation à l'aveugle expose à une " +
      "**surcharge**. Le moteur **oriente** vers un médecin — il ne prescrit pas.",
    statut: "interdit de conception (l'orientation, elle, est implémentée dans red-s.js)",
    base: "veille/21 §6.4",
  },
  {
    code: "R8_DIAGNOSTIC_TCA",
    quoi: "Diagnostiquer un trouble du comportement alimentaire (EAT-26, SCOFF…).",
    pourquoi:
      "Ce sont des **outils cliniques**. Un moteur qui « détecte un TCA » **diagnostique** : hors périmètre, et dangereux. " +
      "Ce qu'il doit faire : **ne jamais être l'instrument du trouble** — ne pas creuser le déficit, ne pas le laisser durer, " +
      "ne pas récompenser la restriction, **et refuser d'aller plus bas**.",
    statut: "interdit de conception",
    base: "veille/21 §7.2",
  },
  {
    code: "R9_VDOT_SEXE",
    quoi: "Appliquer un facteur correctif sexué au VDOT.",
    pourquoi: "**Il n'existe pas.** Voir `NON_SOURCE_VDOT_SEXE` — le moteur l'avoue au lieu de l'inventer.",
    statut: "interdit de conception",
    base: "veille/21 §4.1",
  },
];

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LES 5 AVEUX (veille/21 §10.3) — ce que le moteur ne SAIT PAS, et qu'il dit
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const NON_SOURCE_VDOT_SEXE =
  "🕳️ **`NON_SOURCE_VDOT_SEXE`** — Tes allures sont dérivées d'un modèle (VDOT/Daniels) calibré sur des cohortes " +
  "**historiquement masculines**. Une différence de **durabilité** entre sexes est documentée (les femmes ralentissent " +
  "**moins** sur marathon), mais **aucune étude ne quantifie une correction**. **Le moteur n'en invente pas** — et c'est " +
  "un **vide de science certifié**, pas une paresse : aucun cycle de veille ne pourra le combler tant que l'étude n'est pas faite.";

export const NON_SOURCE_RECUP_SEXE =
  "🕳️ **`NON_SOURCE_RECUP_SEXE`** — La récupération à 24–72 h et les protocoles de sommeil te sont appliqués **à " +
  "l'identique** : **aucune donnée sexuée ne les contredit, aucune ne les valide** spécifiquement.";

export const NON_SOURCE_DESCENTE_SEXE =
  "🕳️ **`NON_SOURCE_DESCENTE_SEXE`** — Les données de descente et de dénivelé viennent de cohortes **mixtes ou " +
  "masculines**. **Rien de sexué.** Le moteur te les applique tel quel, et il le dit.";

export const NON_SOURCE_CONTRACEPTION_NON_ORALE =
  "🕳️ **`NON_SOURCE_CONTRACEPTION_NON_ORALE`** — Toutes les études disponibles portent sur la **pilule**. **DIU hormonal, " +
  "implant, patch : inconnus.** Zéro étude.";

export const ESTIMATION_MASSE_MAIGRE =
  "🕳️ **`ESTIMATION_MASSE_MAIGRE`** — La disponibilité énergétique repose sur une masse maigre **estimée**, jamais mesurée. " +
  "Le seuil de 30 kcal/kg MM/j est un **signal**, pas un diagnostic : il vient de **29 femmes sédentaires suivies 5 jours** " +
  "(Loucks 2003), et le **consensus CIO 2023 a lui-même abandonné le seuil unique**. On l'utilise faute de mieux, **et on le dit**.";

export const NON_SOURCE = [
  NON_SOURCE_VDOT_SEXE,
  NON_SOURCE_RECUP_SEXE,
  NON_SOURCE_DESCENTE_SEXE,
  NON_SOURCE_CONTRACEPTION_NON_ORALE,
  ESTIMATION_MASSE_MAIGRE,
];

/** Idem pour l'âge : lu pour le BMR, et pour refuser les mineurs. Rien d'autre. */
export const OU_L_AGE_EST_LU = [
  { ou: "nutrition.js → `bmrMifflin`", quoi: "le terme **−5 × âge** du métabolisme de base." },
  { ou: "personne.js → validation", quoi: "le refus des **mineurs** (< 18 ans)." },
];

/**
 * Ce que le moteur REFUSE d'inventer sur la physiologie féminine — et **pourquoi ce refus est la
 * bonne réponse**, pas une paresse.
 *
 * Source : `docs/veille/14-audit-completude.md` §P2 (« Physiologie féminine / cycle menstruel »),
 * qui **déclare le trou** et **anticipe son verdict** : les méta-analyses récentes concluent que la
 * **phase du cycle a un effet trivial / non concluant** sur la force et les adaptations (études de
 * faible qualité). → Vendre une « périodisation menstruelle » serait un **piège marketing**,
 * symétrique du cas MEV/MRV. Amorces citées par la veille : Colenso-Semple et al., *Front. Sports
 * Act. Living* 2023 (`PMC10076834`, « no influence ») ; McNulty/Niering (`PMC10818650`).
 */
export const REFUS_PERIODISATION_CYCLE =
  "🚫 **Le moteur ne te proposera PAS de « périodisation menstruelle »** (adapter les charges ou le volume à la phase " +
  "du cycle). Ce n'est pas un oubli, c'est un **refus** — et depuis le cycle de veille 21, il n'est plus une intuition, " +
  "il est **démontré** : l'effet groupé de la phase du cycle sur la performance est **trivial ou non concluant**, avec un " +
  "intervalle qui **traverse zéro** (**ES −0,06 [−0,16 ; 0,04]**, 78 études), et la revue-parapluie écrit que ce **« n'est " +
  "pas une approche evidence-based »** (veille/21 §3). 🔴 **La méta que le marché brandit** pour te vendre cette " +
  "fonctionnalité mesure de l'**isométrique**, sur **68 % d'études de qualité faible** — sur la force **dynamique**, celle " +
  "qui te concerne, il ne reste **rien** (veille/21 §3.5). Un produit qui te vendrait ça te vendrait une **fonctionnalité " +
  "qui sonne juste et ne marche pas** — exactement ce que ce moteur refuse de faire. **Si tu observes, TOI, un effet sur " +
  "tes séances : ta donnée vaut mieux que sa moyenne. Logue-la.**";

// ─────────────────────────────────────────────────────────────────────────────────────────────

function angleSexeFeminin(persona) {
  const consequences = [
    "✅ **La bonne nouvelle d'abord, parce qu'elle est la plus importante : sur l'ENTRAÎNEMENT, il n'y a rien à changer — et " +
      "c'est maintenant VÉRIFIÉ, plus supposé.** Hypertrophie : **aucune différence** à protocole identique. Force du bas du " +
      "corps : **identique**. Protéines : **1,60 vs 1,61 g/kg — p = 0,94** (comparaison directe hommes/femmes, Williamson 2023). " +
      "**Volume, RIR, fréquence, progression : la veille ne justifie aucune variante féminine** (veille/21 §2 & §6.1). " +
      "**Tu n'as pas besoin d'un second moteur. Tu as besoin que celui-ci ait des garde-fous qui marchent.**",
    "🔬 **Un endroit où on SAIT que le sexe change quelque chose — et où le moteur ne change rien.** veille/11 §2 : " +
      "l'**interférence** force ↔ endurance sur la **force du bas du corps** touche **surtout les hommes**, et **peu ou pas " +
      "les femmes**. Les règles hybrides du moteur (séparer salle et course de 6 h, pas de course dure 24–48 h après des " +
      "jambes lourdes) sont calibrées sur la population où l'effet est **le plus fort**. **Le moteur te les applique quand " +
      "même** — c'est un choix **conservateur** et **assumé** : elles te coûtent de la souplesse d'organisation, elles ne te " +
      "coûtent pas de sécurité. Mais elles sont **probablement trop strictes pour toi**, et tu as le droit de le savoir.",
    NON_SOURCE_RECUP_SEXE,
    NON_SOURCE_CONTRACEPTION_NON_ORALE,
  ];

  if (persona.running) consequences.push(NON_SOURCE_VDOT_SEXE, NON_SOURCE_DESCENTE_SEXE);

  return {
    code: "SEXE_FEMININ_NON_MODELISE",
    titre: "Ce que le moteur fait — et ne fait pas — de ton sexe",
    gravite: "structurel",
    fait:
      "**Ton sexe n'entre dans ce moteur qu'à deux endroits, et il te les nomme** : la constante de Mifflin-St Jeor " +
      "(**−161 kcal** sur ton métabolisme de base — le seul usage physiologiquement fondé) et une **orientation médicale** " +
      "(fatigue persistante + course → bilan martial). **Nulle part ailleurs** : ni dans la musculation, ni dans la course, " +
      "ni dans le placement des séances, ni dans la progression. **Et la veille dit que c'est la BONNE réponse** — sauf pour " +
      "un garde-fou, qui vient d'être réparé (voir ci-dessous).",
    consequences,
    refus: REFUS_PERIODISATION_CYCLE,
    source:
      "docs/veille/21-physiologie-feminine.md — le cycle qui a **vérifié** ce qui n'avait jamais été que **supposé**, " +
      "et qui a trouvé **un bug de sécurité qui touchait aussi les hommes** (§7.1).",
    aveu:
      "🔴 **Le bug le plus grave que ce moteur ait eu ne concernait pas les femmes : il concernait TOUT LE MONDE.** Il refusait " +
      "de prescrire sous **1 200 kcal (femme) / 1 500 kcal (homme)**, en appelant ça un « plancher de sécurité » — **deux chiffres " +
      "tirés d'une recommandation clinique pour l'OBÉSITÉ**, faussement sourcés à une section de la veille qui parle de compléments " +
      "alimentaires. **Le garde-fou ne gardait rien** (le vrai risque, le RED-S, dépend de la disponibilité énergétique, qu'il ne " +
      "calculait pas) — **et il accordait le seuil le plus bas aux femmes.** Il a été **retiré**. " +
      "**Il a fallu regarder ce produit avec les yeux d'une utilisatrice pour voir un défaut qui blessait ses deux concepteurs " +
      "depuis le premier jour.** C'est, très exactement, pourquoi ce bloc existe.",
  };
}

const AGE_SENIOR = 60;

function angleAgeSenior(persona) {
  return {
    code: "AGE_SENIOR_NON_MODELISE",
    titre: `Le moteur ne modélise PAS l'âge (tu as ${persona.profil.age} ans)`,
    gravite: "structurel",
    fait:
      "**Ton âge est lu à UN SEUL endroit : le terme « −5 × âge » du métabolisme de base** (et le refus des mineurs). " +
      "**Nulle part ailleurs.** Tes fourchettes de volume, tes RIR, ta progression de charge, ta progression de volume de " +
      "course, ton VDOT, tes temps de récupération : **exactement les mêmes que pour quelqu'un de 27 ans.**",
    consequences: [
      "Les bases de preuves du moteur (veille/02 pour la muscu, veille/03 pour la course) reposent sur des cohortes de " +
        "**jeunes adultes entraînés**. Le moteur te les applique **par défaut**, pas par démonstration.",
      "⚠️ **Ce que le moteur ne sait donc PAS te dire** : si ta récupération demande plus de temps, si ton volume " +
        "cible devrait être différent, ce que la **sarcopénie** ou la **densité osseuse** changent à ta programmation. " +
        "**Il n'a AUCUNE source là-dessus** — la veille ne couvre pas la population senior.",
      "🚫 **Et il n'inventera pas de chiffre pour faire prudent.** Un « −20 % de volume après 60 ans » ou un « +1 jour de " +
        "récupération » aurait l'air sérieux et serait **fabriqué**. Le moteur ne fabrique pas (ADR 0006 : mieux vaut " +
        "refuser qu'inventer). **Il te dit qu'il ne sait pas, et c'est tout ce qu'il peut faire d'honnête.**",
    ],
    refus: null,
    source: "Aucune — **et c'est précisément le problème** : la veille ne traite pas la population senior. Trou **non déclaré** avant ce run.",
    aveu:
      "**Le bon réflexe ici n'est pas de me faire confiance : c'est de faire valider cette progression par un professionnel** " +
      "qui, lui, connaît la population à laquelle tu appartiens. Le moteur reste utile pour la **structure** (patterns, " +
      "progressivité, échauffement, garde-fous de douleur) — il ne l'est pas pour le **dosage**.",
  };
}

/**
 * Les angles morts du moteur **pour CETTE personne**. Pur, sans effet de bord.
 *
 * Renvoie `[]` quand il n'y en a pas — ce qui, aujourd'hui, ne veut dire qu'une chose : la personne
 * ressemble aux deux humains sur lesquels le moteur a été construit. **Ce n'est pas un brevet de
 * généricité, et le tableau vide ne doit pas être lu comme tel.**
 */
export function anglesMorts(persona) {
  const morts = [];
  if (persona?.profil?.sexe === "femme") morts.push(angleSexeFeminin(persona));
  if (Number(persona?.profil?.age) >= AGE_SENIOR) morts.push(angleAgeSenior(persona));
  return morts;
}

export { AGE_SENIOR };
