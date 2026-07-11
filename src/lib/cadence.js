// CADENCE — le nudge, et la CORRECTION du 2026-07-11.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 DEUX CHIFFRES ONT ÉTÉ RETIRÉS DE CE MOTEUR. IL FAUT SAVOIR POURQUOI.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Le moteur appelait la cadence « **le seul levier SOURCÉ** » et s'appuyait, pour le dire, sur deux
// chiffres repris de `veille/03 §5 bis` — eux-mêmes cités depuis une **revue secondaire**
// (Figueiredo et al., *Cureus* 2025). La veille est allée lire les **sources primaires**
// (`veille/20 §8`). **Aucune des deux ne dit ce qu'on lui faisait dire.**
//
//   ❌ « **−62 % de blessures** » — Chan et al., *Am J Sports Med* 2018;46(2):388–395.
//      **ERREUR D'ATTRIBUTION.** L'intervention n'était **PAS** une hausse de cadence : c'était un
//      **RETOUR VISUEL EN TEMPS RÉEL DU TAUX DE CHARGE VERTICAL** (« cours plus doucement »), qui
//      exige un **accéléromètre tibial** ou une plateforme de force. Les −62 % sont **réels** — pour
//      une **autre intervention**, que **notre produit ne peut pas reproduire**. (veille/20 §8.1)
//
//   ❌ « **×6–7 sous 166 pas/min** » — Luedke et al., *MSSE* 2016;48(7):1244–1250.
//      **n = 68 lycéens** ; blessure **tibiale** : **OR 6,67 [1,2 – 36,7]** — l'intervalle de
//      confiance **frôle 1**, le point estimé est quasi vide de précision. Et surtout :
//      🔴 **l'étude conclut que la DOULEUR ANTÉRIEURE DU GENOU n'est PAS influencée par la
//      cadence** — alors que le moteur en faisait son levier **GENOU**, sur une tendinopathie
//      rotulienne latente. **La seule étude clinique citée à l'appui disait le contraire.**
//      (veille/20 §8.2)
//
// Conséquence directe : les **seuils absolus** de cadence (166 « à risque », 178 « protecteur »)
// étaient des **artefacts de Luedke**. Ils ont disparu avec lui. Il ne reste **aucun seuil absolu
// sourcé** dans la littérature — le nudge est **RELATIF**, et il l'a toujours été.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// ✅ LE LEVIER SURVIT. SES BÉQUILLES TOMBENT. VOICI SUR QUOI IL REPOSE **VRAIMENT**.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
//   ✅ **BIOMÉCANIQUE — solide, répliquée, et c'est là toute sa base :**
//      • **Lenhart, Thelen, Wille, Chumanov & Heiderscheit**, *MSSE* 2014;46(3):557–564 :
//        **+10 % de fréquence de pas → −14 % de force de pointe FÉMORO-PATELLAIRE.**
//        Mécanisme : foulée raccourcie → ↓ pic de flexion du genou → ↓ moment extenseur.
//      • **Van Hooren, van Rengs & Meijer**, *Scand J Med Sci Sports* 2024;34(2):e14570 (n = 19,
//        pentes −6° à +6°) : **↑ cadence → ↓ dommage cumulé sur les TROIS sites** (fémoro-patellaire,
//        tibia, Achille) — **y compris EN DESCENTE**, là où la contrainte fémoro-patellaire culmine.
//        ⚠️ **Directions établies, AMPLITUDE non publiée.** Le moteur ne chiffre pas ce qu'il n'a pas.
//      • **Lu et al.**, *Front Bioeng Biotechnol* 2025 : **±5 % autour de la cadence spontanée**
//        minimise coût et impulsion de charge ; un écart plus grand — **et notamment −10 %** —
//        **AGGRAVE**. → **On MONTE la cadence. On ne la baisse JAMAIS.**
//
//   ⚠️ **CLINIQUE — FAIBLE, et c'est dit :** Bramah et al., *Am J Sports Med* 2019 — +10 % de cadence
//      chez des coureurs à douleur fémoro-patellaire : douleur 1,0/10 à 4 sem, 0,3/10 à 3 mois.
//      **MAIS n = 12, SÉRIE DE CAS, AUCUN groupe contrôle.** C'est un **signal**, pas une preuve.
//
//   ✅ **COÛT, RISQUE, RÉVERSIBILITÉ : NULS.** Gratuit, sans matériel, annulable en une sortie.
//
// → **Le nudge reste le meilleur levier du moteur.** Il n'est **plus** « le seul levier SOURCÉ » au
//   sens d'une **preuve clinique** : sa base est **BIOMÉCANIQUE**. Le moteur le dit désormais ainsi —
//   partout, et sans béquille. _Ce n'est pas une démolition : c'est le passage d'une justification
//   empruntée à une justification exacte._
//
// Module PUR : aucune I/O, aucune dépendance.

/** La fourchette du nudge. Relative, jamais absolue — et **jamais brutale**. */
export const NUDGE = { min_pct: 5, max_pct: 10, min: 1.05, max: 1.1 };

/**
 * 🟡 **CONVENTION DÉCLARÉE DU MOTEUR — non sourcée, et ce n'est pas un détail.**
 *
 * Il n'existe **AUCUN seuil absolu de cadence** dans la littérature depuis que Luedke 2016 est sorti
 * du dossier (voir l'en-tête). La science dit « **+5 à 10 % au-dessus de TA cadence spontanée** » —
 * elle ne dit **nulle part** « en dessous de N pas/min, tu es en danger ».
 *
 * Mais un moteur doit bien décider **quand** proposer le nudge. Il lui faut donc un seuil, et il n'y
 * en a pas de sourcé. Le moteur en **assume un** — 170 pas/min, l'ordre de grandeur d'une foulée
 * ample — et il le **déclare pour ce qu'il est : une convention d'outil, pas une donnée.**
 * Au-dessus, le moteur **ne pousse pas plus haut** : la source étaye une hausse **relative** depuis
 * une cadence **basse**, pas une course à la cadence maximale. Inventer une cible plus haute serait
 * fabriquer un chiffre.
 */
export const SEUIL_NUDGE_SPM = 170;
export const SEUIL_NUDGE_CONVENTION =
  "🟡 **Seuil de déclenchement : 170 pas/min — CONVENTION DÉCLARÉE du moteur, non sourcée.** " +
  "**Aucune source ne donne de seuil ABSOLU de cadence** : la science n'étaye qu'une hausse " +
  "**RELATIVE** (+5 à 10 % au-dessus de **ta** cadence spontanée). Le seuil que le moteur affichait " +
  "auparavant venait d'une étude **retirée du dossier** (voir ci-dessous). Il fallait bien décider " +
  "quand proposer le nudge : le moteur **assume** ce seuil, et il **le dit**.";

/** La source du nudge, **exacte**. Une seule chaîne, partagée (un fait dupliqué divergera). */
export const CADENCE_SOURCE =
  "veille/20 §7–8 — base **BIOMÉCANIQUE** : Lenhart et al., *MSSE* 2014;46(3):557–564 " +
  "(**+10 % de fréquence de pas → −14 % de force de pointe fémoro-patellaire**) ; Van Hooren et al., " +
  "*Scand J Med Sci Sports* 2024;34(2):e14570 (**↑ cadence → ↓ dommage cumulé sur les 3 sites, " +
  "y compris en DESCENTE** — directions établies, ampleur non publiée) ; Lu et al. 2025 " +
  "(**±5 % optimal, −10 % délétère**). Base **clinique : FAIBLE** (Bramah 2019 — n = 12, série de cas, " +
  "sans groupe contrôle)";

/**
 * 🔴 L'AVEU, VERSION PRODUIT — **et il ne contient AUCUN des deux chiffres purgés.**
 *
 * ⚠️ **Décision, et elle compte** : réimprimer « −62 % » ou « ×6–7 » dans le document que
 * l'utilisateur lit, **même pour les démentir**, c'est **les remettre en circulation**. Une capture
 * d'écran ne garde jamais le démenti. La transparence dit **QUE** deux chiffres sont tombés et
 * **POURQUOI** ; le détail chiffré vit dans le **journal d'ingénierie** (`docs/JOURNAL-moteur.md`)
 * et dans la **veille** (`veille/20 §8`), qui sont des registres, pas des supports produit.
 *
 * **On purge le chiffre. On garde l'aveu. On ne fait pas de la pédagogie avec un mensonge.**
 */
export const CADENCE_RETIRE = [
  "❌ **Un « pourcentage de blessures évitées » a été RETIRÉ** (2026-07-11) : il venait d'une étude dont l'intervention **n'était pas une hausse de cadence** — c'était un **retour visuel en temps réel du taux de charge vertical**, qui exige un **accéléromètre tibial**. **Notre produit ne peut pas la reproduire.** Le chiffre le plus impressionnant du dossier décrivait donc **quelque chose que nous ne faisons pas**.",
  "❌ **Un « facteur de risque » lié à une cadence basse a été RETIRÉ** : petit échantillon d'adolescents, **intervalle de confiance qui frôle 1** (le chiffre n'a quasi aucune précision) — et surtout, **cette étude conclut elle-même que la cadence n'influence PAS la douleur antérieure du genou**, alors que le moteur en faisait son levier **genou**.",
  "🔴 **Le moteur ne t'affichera JAMAIS un « ×N de risque » — ni pour ta cadence, ni pour ta descente.** Ces chiffres **n'existent pas**. Les inventer serait exactement ce que ce projet refuse (philosophy §2).",
  "✅ **Le levier, lui, SURVIT** — parce que sa base n'était pas là : elle est **BIOMÉCANIQUE** (Lenhart 2014, Van Hooren 2024, Lu 2025), solide et répliquée. **Ce ne sont pas ses fondations qui sont tombées : ce sont ses béquilles.** _(Détail complet : `docs/veille/20-trail-denivele.md` §8.)_",
];

/** Pourquoi le nudge vaut — et vaut **davantage** — en DESCENTE (veille/20 §7, règle 7). */
export const CADENCE_EN_DESCENTE =
  "⛰️ **En descente, le nudge est PLUS pertinent qu'à plat — pas moins.** C'est là que la contrainte " +
  "**fémoro-patellaire culmine** (Van Hooren 2024), et c'est là que la foulée **s'allonge " +
  "spontanément** (Vernillo 2017 : la fréquence de pas **baisse** en descente). **C'est exactement le " +
  "mauvais réflexe** — et c'est celui-là que le nudge corrige. **On MONTE la cadence de +5 à 10 %. On " +
  "ne la baisse JAMAIS** (−10 % **aggrave** la contrainte, Lu 2025).";

/**
 * Recommandation de cadence (pure). Ne fabrique **jamais** de donnée : sans cadence mesurée, statut
 * « inconnue » (le rendu invite à la mesurer, il n'invente pas une valeur).
 *
 * Sortie : nudge **+5 à 10 %** si la cadence est sous le seuil-convention ; sinon « adéquate », et
 * le moteur **ne pousse pas plus haut** (la source est relative, pas maximaliste).
 *
 * ⚠️ Ce que cette fonction ne renvoie **plus** : `risque_eleve` et `protectrice`. Les deux étaient
 * des artefacts de Luedke 2016 (seuils 166 / 178) — voir l'en-tête du module.
 */
export function recommandationCadence(cadence_spm) {
  if (cadence_spm == null || !Number.isFinite(Number(cadence_spm)) || Number(cadence_spm) <= 0) {
    return { statut: "inconnue", applique: false };
  }
  const c = Math.round(Number(cadence_spm));
  if (c >= SEUIL_NUDGE_SPM) {
    return { statut: "adequate", applique: false, cadence_actuelle: c, seuil_convention: SEUIL_NUDGE_SPM };
  }
  return {
    statut: "basse",
    applique: true,
    cadence_actuelle: c,
    cible_min: Math.round(c * NUDGE.min),
    cible_max: Math.round(c * NUDGE.max),
    seuil_convention: SEUIL_NUDGE_SPM,
  };
}
