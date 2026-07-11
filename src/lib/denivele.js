// DÉNIVELÉ — le D+ (et surtout le D−) deviennent des VARIABLES PLANIFIÉES.
//
// ── Le trou que ce module ferme ─────────────────────────────────────────────────────────────
// Le moteur savait qu'une sortie **a** du dénivelé (journal.js, placement.js). Il n'en **générait**
// aucun : `running.js` ne planifiait que des **kilomètres**. Or un plan de 40 km/sem sur le plat et
// un plan de 40 km/sem avec 1 500 m de D− **ne sont pas le même entraînement** — et le second peut
// blesser sans que rien ne l'annonce.
//
// ── La chaîne, et elle est la raison d'être de ce fichier ───────────────────────────────────
//   trail → dénivelé → **DESCENTE** → **EXCENTRIQUE** → dommages musculaires
// C'est **la DESCENTE** qui charge l'articulation, **pas la montée** (ADR 0006 §1.5). Un modèle de
// charge calculé sur l'ALLURE (le nôtre comme celui de TrainingPeaks) l'ignore **complètement**.
// Le D− est donc traité **explicitement** ici — jamais déduit en silence, jamais mis à `0` par défaut.
//
// ── ⚠️ CE QUE CE MODULE N'INVENTE PAS ───────────────────────────────────────────────────────
// **Aucun seuil de D+ n'est sourçable** (`NON_SOURCE_COURSE`, limitations.js). Ce module ne fabrique
// donc **aucune cible** : ni « 1 000 m/sem », ni « 30 m de D+ par km ». Il ne sait pas non plus ce
// qu'est « un plan trail » — **la veille n'en parle nulle part** (voir `NON_SOURCE_DENIVELE`).
// Ce qu'il fait, il le fait avec ce qui EST établi :
//   • un **point de départ MESURÉ** (le D+ que l'utilisateur encaisse déjà — il n'est jamais supposé) ;
//   • une **progression graduelle RELATIVE**, par **paliers**, avec le **même garde-fou** que le volume ;
//   • la **règle d'alternance** : on ne monte **jamais** le volume ET le dénivelé la même semaine.
//
// ── 📚 LA VEILLE A RÉPONDU (2026-07-11, `docs/veille/20-trail-denivele.md`) ─────────────────────
// Ce module avait été écrit **sans source sur le trail** : `veille/03`, `11` et `12` sont **route
// uniquement**, et le moteur l'avait dit (`NON_SOURCE_DENIVELE`). Il avait **demandé la veille**.
// **Elle a répondu.** Ce qu'elle change, et ce qu'elle ne change pas :
//
//   ✅ **Elle VALIDE** la décision la plus structurante du module — **aucune conversion D+ → km** —
//      et elle lui donne **la raison qui manquait** (`CONVERSION_DPLUS_KM`).
//   ✅ **Elle VALIDE** la séparation D+ / D− : ils chargent des tissus **OPPOSÉS** (Van Hooren 2024).
//   ✅ **Elle CERTIFIE le trou** de la progression du D+ : il n'y a **rien**, et il n'y aura rien.
//      Le transfert du ~10 %/sem **reste**, et **l'aveu reste avec lui** (`PAS_GRADUEL`).
//   🔴 **Elle IMPOSE d'AFFICHER** une limite qu'on aurait pu être tenté de rustiner en douce :
//      **notre charge d'endurance est structurellement AVEUGLE à la descente** (`AVEUGLEMENT_DESCENTE`).
//   🔴 **Elle INTERDIT** de chiffrer la peur : **aucune preuve épidémiologique** ne lie la descente à
//      une tendinopathie rotulienne (`INTERDITS_DENIVELE`).
//
// Module PUR : aucune I/O, aucune dépendance.

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 LE FAIT CENTRAL : LA DESCENTE EST MÉTABOLIQUEMENT BON MARCHÉ — ET C'EST ELLE QUI CASSE.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * **Minetti, Moia, Roi, Susta & Ferretti**, *J Appl Physiol* 2002;93(3):1039–1046 (n = 10, pentes
 * de −45 % à +45 %). **LA** courbe de référence du domaine — et la source du paradoxe qui structure
 * tout ce module : **courir en descente coûte DEUX FOIS MOINS cher qu'à plat.**
 */
// @chiffre-de-la-veille — vérifié : tous les nombres du code existent dans veille/20 §1.1.
export const COUT_MINETTI = {
  unite: "J·kg⁻¹·m⁻¹",
  plat: 3.4, // ± 0,24 — indépendant de la vitesse
  descente_20pct: 1.73, // ± 0,36 — le MINIMUM de la courbe : **−49 % vs le plat**
  montee_45pct: 18.93, // ± 1,74 — ×5,6 le plat
  source: "Minetti et al., *J Appl Physiol* 2002;93(3):1039–1046 (n = 10) — veille/20 §1.1",
};

/**
 * 🔴 **LA LIMITE STRUCTURELLE DE NOTRE MODÈLE DE CHARGE. À AFFICHER — JAMAIS À RUSTINER.**
 *
 * Notre charge d'endurance repose sur le **sRPE × durée** (ADR 0006) : de la **perception**, de
 * l'**allure**, de la **durée**. Or Minetti 2002 établit que la descente coûte **1,73 J·kg⁻¹·m⁻¹**
 * à −20 % contre **3,40 à plat** — **la moitié**. **Toute métrique fondée sur l'énergie, l'allure ou
 * la FC dit « facile » là où le muscle encaisse le plus.**
 *
 * ⚠️ **Ce n'est PAS un bug. C'est une PROPRIÉTÉ du modèle.** La tentation était de « corriger » la
 * charge par un coefficient de descente — c'est-à-dire d'**inventer une constante** : exactement le
 * `k` que l'ADR 0006 a supprimé, et exactement ce que la veille interdit (aucune conversion du D−
 * en charge n'existe, et §4.4 explique pourquoi il n'y en aura probablement **jamais** en unités
 * énergétiques). **Le moteur ne rustine pas. Il DIT.**
 */
export const AVEUGLEMENT_DESCENTE = {
  aveugle: true,
  quoi: "La charge d'endurance (sRPE × durée) **SOUS-ESTIME structurellement la descente**.",
  pourquoi:
    "🔴 **La descente est métaboliquement BON MARCHÉ — et c'est elle qui casse.** À **−20 % de pente**, " +
    "courir coûte **1,73 J·kg⁻¹·m⁻¹** contre **3,40 à plat** : **la moitié** (Minetti 2002, n = 10). " +
    "Le coût énergétique est donc un **très mauvais proxy** de la contrainte en descente — il dit " +
    "« facile » là où le muscle encaisse le plus. Notre charge repose sur le **RPE, l'allure et la " +
    "durée** : elle est **aveugle au dénivelé négatif**.",
  ce_que_le_moteur_ne_fait_pas:
    "⚠️ **Le moteur ne « corrige » PAS la charge avec un coefficient de descente.** Il faudrait une " +
    "constante **inventée** — précisément ce que l'ADR 0006 a supprimé, et ce que la veille dit " +
    "**introuvable** (aucune conversion du D− en charge n'existe, et il n'y en aura probablement " +
    "jamais en unités énergétiques). **Ce n'est pas un bug qu'on cache : c'est une propriété du " +
    "modèle qu'on affiche.**",
  consequence:
    "**Après une grosse sortie en descente, ta charge affichée est trop basse. Fie-toi à tes jambes, " +
    "pas au chiffre.** Le moteur préfère te dire qu'il ne sait pas plutôt que te donner un nombre faux.",
  source: "Minetti et al. 2002 (veille/20 §1.1) · veille/20 §9.1 règle 2 · ADR 0006",
};

/**
 * **Récupération après une grosse descente : des JOURS, pas des heures.**
 * C'est le fait qui remonte à l'**ADR 0006** (voir `FENETRE_DESCENTE` dans placement.js).
 */
// @chiffre-de-la-veille — vérifié dans veille/20 §2.1.
export const RECUP_DESCENTE = {
  jours: "3–4",
  mvic_24h: "84 ± 13 % de la ligne de base",
  rfd_tardive_24h: "63 ± 28 % de la ligne de base",
  encore_alteree_h: 72, // la vitesse de montée en force est ENCORE atteinte à 72 h
  resolu_h: 96,
  quoi:
    "🔴 **Une seule sortie de 30 min en descente laisse une trace neuromusculaire mesurable pendant " +
    "3 jours, et il faut ~4 jours pour tout effacer.** Force max volontaire à **84 %** à 24 h ; " +
    "**vitesse de montée en force à 63 %** à 24 h, **encore altérée à 72 h**, résolue à **96 h**.",
  source:
    "*Eur J Appl Physiol* 2024 (n = 10, 30 min à −20 %, PMC11129977) ; Bontemps et al., " +
    "*Sports Medicine* 2020;50(12):2083–2110 (récup 4–5 j) ; *Muscles* 2026;5(1):9 (CK : pic J+2/J+3, " +
    "retour à la base J+3–J+5) — veille/20 §2.1–2.3",
};

/**
 * **L'effet répété (RBE) — la meilleure nouvelle du dossier, et sa limite la plus dure.**
 * Réel, rapide (**1 séance** l'amorce), **borné** (~9 semaines). Et il protège **le MUSCLE**.
 */
// @chiffre-de-la-veille — vérifié dans veille/20 §2.5.
export const EFFET_REPETE = {
  amorce_seances: 1,
  extinction_semaines: 9,
  protege: "le MUSCLE (dommages, courbatures, perte de force)",
  ne_protege_pas: "le TENDON — et personne ne sait ce qu'il fait à un tendon rotulien latent",
  quoi:
    "**Une seule séance de descente suffit à amorcer la protection** (CK, myoglobine et courbatures " +
    "nettement plus bas au second passage). C'est **la stratégie que la littérature qualifie de « la " +
    "plus efficace »** contre le dommage induit par la descente. ⚠️ Elle **s'éteint vers 9 semaines** " +
    "sans nouvelle exposition.",
  a_ne_pas_relayer:
    "🔴 **« La protection dure jusqu'à 6 mois » : AUCUNE SOURCE PRIMAIRE.** Ce chiffre circule dans les " +
    "contenus de coaching trail ; c'est une extrapolation depuis l'excentrique isolé du **bras**. " +
    "**Le moteur dit « quelques semaines », jamais « 6 mois ».**",
  limite:
    "🔴 **Le RBE est un phénomène MUSCULAIRE.** Aucune de ces études ne mesure une réduction de " +
    "**BLESSURES**, et aucune ne concerne un **TENDON**. **Le transposer au tendon serait une " +
    "invention** — et le moteur ne dira JAMAIS « fais des descentes, ça protégera ton genou ».",
  source: "Bontemps et al., *Sports Medicine* 2020 ; Tallis et al., *Sports* 2024;12(6):169 — veille/20 §2.5, §6.3",
};

/**
 * 🔴 **Ce qui protège de la descente, ce n'est PAS le renforcement — c'est la SPÉCIFICITÉ.**
 * Le trail ne réhabilite pas le renfo comme outil de prévention. Cohérent avec Wu et al. 2024.
 */
export const SPECIFICITE_PROTEGE = {
  descentes_1x_sem: { ck: "182 ± 73 U/L", force_squat: "+4 ± 10 % (conservée)" },
  sans_descentes: { ck: "290 ± 192 U/L", force_squat: "−9,1 ± 16,8 % (perdue)" },
  renfo_2x_sem: "AUCUNE différence significative (p > 0,05) — ni sur la CK, ni sur la perte de force",
  quoi:
    "Chez **36 traileurs expérimentés** (5 km à −15 %) : ceux qui font des **répétitions de descente " +
    "≥ 1×/semaine** ont une **CK plus basse** (182 vs 290 U/L, d = 0,64) et **conservent leur force au " +
    "squat** (+4 % vs −9,1 %, d = 0,87). Ceux qui font du **renforcement ≥ 2×/semaine** : **aucune " +
    "différence**. **Descendre protège de la descente. Soulever de la fonte, non.**",
  limite:
    "⚠️ **ASSOCIATION, pas causalité.** Étude **exploratoire et observationnelle** : ceux qui " +
    "descendent souvent descendent peut-être aussi **mieux**. Les auteurs le disent. Et ça protège le " +
    "**MUSCLE**, **pas le TENDON**.",
  source:
    "Martinez-Navarro et al., *Sports* 2026;14(1):12 (n = 36) ; cohérent avec Wu et al., " +
    "*Sports Medicine* 2024 (le renfo ne réduit pas les blessures du coureur) — veille/20 §6",
};

/**
 * 🔴 **POURQUOI IL N'Y AURA JAMAIS DE « 100 m de D+ ≈ 1 km » DANS LE CALCUL DE CHARGE.**
 *
 * Le moteur avait pris cette décision **avant** d'avoir la source. **La veille la valide — et lui
 * donne la raison qu'il n'avait pas.** Elle est imparable :
 *
 *   **Toutes ces équivalences pricent le TEMPS de la MONTÉE. AUCUNE ne price le D−.**
 *   Or la descente est **métaboliquement bon marché** (−49 % de coût à −20 %) **tout en étant la
 *   source du dommage**. Le GAP de Strava fait pire : il **DÉCOTE** la descente.
 *
 *   → **Convertir le D+ en kilomètres reviendrait à SOUS-FACTURER EXACTEMENT LA PARTIE QUI BLESSE.**
 */
// @chiffre-de-la-veille — vérifié dans veille/20 §4.
export const CONVERSION_DPLUS_KM = {
  autorisee_dans_la_charge: false,
  conventions: [
    { nom: "Naismith", annee: 1892, ratio: "100 m D+ ≈ 830 m de plat", nature: "**règle de pouce de randonneur**" },
    { nom: "Scarf, *J Sports Sci* 2007;25(6):719–726", annee: 2007, ratio: "≈ 7,92 : 1", nature: "reformulation mathématique de Naismith, ajustée sur du **fell running**" },
    { nom: "GAP (Strava)", annee: null, ratio: "modèle **propriétaire**", nature: "**convention d'outil** (ex-Minetti, puis ajusté sur ~240 000 athlètes avec la FC comme proxy)" },
  ],
  pourquoi_interdite:
    "🔴 **« 100 m de D+ ≈ 1 km » est une CONVENTION DE 1892** (Naismith), pas une science — et elle ne " +
    "mesure **pas ce qu'on voudrait lui faire mesurer**. Toutes ces équivalences pricent le **TEMPS de " +
    "la MONTÉE** (choix d'itinéraire, prévision de chrono). **AUCUNE ne price le D−.** Or la descente " +
    "coûte **−49 % d'énergie** (Minetti 2002) **tout en étant ce qui casse** — et le GAP de Strava la " +
    "**décote** carrément. **Convertir le D+ en kilomètres reviendrait à sous-facturer exactement la " +
    "partie qui blesse.** Une équivalence en kilomètres est **structurellement incapable** de " +
    "représenter la contrainte de la descente. → **D+ et D− restent DEUX VARIABLES NOMMÉES ET SÉPARÉES.**",
  si_un_jour_affichee:
    "Si un affichage « ça vaut combien de km ? » est demandé un jour, il devra être étiqueté " +
    "**« convention de coach — Naismith 1892 / Scarf 2007 »**, jamais « science », et **ne jamais " +
    "alimenter le calcul de charge**.",
  source: "veille/20 §4 (Naismith 1892 · Scarf 2007 · GAP Strava) · §9.1 règle 3 · §9.3 interdit 1",
};

/**
 * 🔴 **TROIS INTERDITS PRODUIT** (veille/20 §9.3). Formulations **bannies** — et les tests le
 * vérifient : aucune sortie du moteur ne doit jamais les contenir.
 */
export const INTERDITS_DENIVELE = [
  "❌ **« 100 m de D+ ≈ 1 km »** dans un calcul de charge. → **Convention de coach** (Naismith, **1892**). Si un jour affichée, étiquetée comme telle et **hors du modèle de charge**.",
  "❌ **« Fais des descentes, ça protégera ton genou. »** → Le *repeated bout effect* protège le **MUSCLE**, **pas le TENDON**. Aucune étude ne mesure une réduction de **blessures**, et aucune ne concerne un tendon rotulien.",
  "❌ **« Le renforcement (même excentrique) te protégera de la descente. »** → **Faux pour le renfo générique** : chez 36 traileurs, renfo ≥ 2×/sem → **aucune différence**. Le seul signal concerne un **préconditionnement excentrique ciblé** — **une** étude, sur des **marqueurs**, pas sur des **blessures**.",
  "❌ **Chiffrer la peur** : « la descente augmente ton risque de tendinopathie rotulienne de ×N ». 🔴 **AUCUNE preuve épidémiologique** ne lie la descente à une tendinopathie rotulienne (c'est une maladie de **sauteurs** ; le tendon rotulien des traileurs **ne diffère pas** de celui des routiers). Plausibilité mécanique **forte**, preuve **absente**. **Ce chiffre n'existe pas — l'inventer serait exactement ce que ce projet refuse.**",
];

/**
 * Le garde-fou de progressivité, **SOURCÉ — mais sourcé POUR LE VOLUME** :
 * veille/03 §5 et veille/12 (« Montée de volume **graduelle** (~10 %/sem en garde-fou souple) »).
 * La source elle-même le qualifie de **souple** — l'ACWR dont il dérive est « fortement critiqué »
 * (revues systématiques 2025) et n'est « **jamais une vérité unique** ».
 *
 * ⚠️ **Ce même pas est appliqué au DÉNIVELÉ — et c'est une EXTRAPOLATION, pas une source.**
 * Le moteur avait deux choix : fabriquer un chiffre spécifique au D+ (interdit), ou **transférer le
 * garde-fou du volume** en le **déclarant**. Il transfère, et il le dit — dans le code, dans la
 * sortie (`convention`), et dans le document rendu. Un chiffre transféré et **avoué** n'est pas un
 * chiffre inventé et **caché**.
 *
 * 🕳️ **2026-07-11 — LA VEILLE A CHERCHÉ, ET ELLE CERTIFIE LE TROU.** Après recherche systématique
 * (veille/20 §5) : **AUCUNE source primaire n'établit une vitesse de progression du dénivelé.**
 * Bontemps 2020 le dit explicitement — les **relations dose-réponse ne sont PAS établies**, et la
 * revue se borne à recommander « un principe de progressivité », **sans aucun chiffre**. Les
 * « +10 % de D+/sem » qui circulent viennent **exclusivement de blogs de coachs**.
 * → **Le transfert reste. L'aveu reste avec lui. La veille ne peut pas faire mieux — et elle le dit.**
 * ⚠️ **Aggravant, et assumé** : le ~10 %/sem du **volume** est **lui-même** une convention. **On
 * transfère donc une convention.**
 */
// @chiffre-de-la-veille — 1,1 = le pas ~10 %/sem de veille/03 §5 & veille/20 §5, exprimé en facteur.
export const PAS_GRADUEL = 1.1;
export const PAS_GRADUEL_SOURCE =
  "veille/03 §5 & veille/12 — progression **graduelle** du volume (~10 %/sem, **garde-fou souple**, " +
  "dérivé d'un ACWR lui-même critiqué : signal, jamais vérité). 🕳️ **Transféré au D+ SANS SOURCE** : " +
  "veille/20 §5 a cherché et **certifie qu'il n'y a rien** — les relations dose-réponse du dénivelé " +
  "**ne sont pas établies** (Bontemps 2020)";

/**
 * ✅ **La règle d'alternance — ce que la veille PEUT offrir en compensation du trou ci-dessus.**
 * Elle ne découle pas d'un essai sur le dénivelé : elle découle du fait que **la descente laisse une
 * trace neuromusculaire de 3–4 jours** (`RECUP_DESCENTE`). Deux contraintes qui montent ensemble sur
 * une semaine de 7 jours ne laissent pas la place à cette récupération.
 * **C'est un RAISONNEMENT, pas une donnée — et il est étiqueté comme tel.**
 */
export const REGLE_ALTERNANCE_SOURCE =
  "Raisonnement (pas une donnée) : la descente laisse une trace neuromusculaire de **3–4 jours** " +
  "(veille/20 §2.2) — monter le volume **et** le dénivelé la même semaine ne laisse pas la place à " +
  "cette récupération. Le moteur l'avait encodée **avant** d'avoir la source ; la veille lui donne " +
  "son fondement.";

/** Récupération : −25 %, aligné sur la semaine de récupération du volume (running.js). */
const COEF_RECUP = 0.75;

/** Terrains DÉCLARÉS. Le moteur ne DEVINE jamais un terrain depuis un nombre de mètres. */
export const TERRAINS = {
  route: {
    libelle: "route (parcours roulant)",
    planifier_denivele: false,
    pourquoi: "Un plan route reste un plan route : le moteur n'y injecte **aucun** dénivelé.",
  },
  vallonne: {
    libelle: "vallonné (route/chemin avec du relief)",
    planifier_denivele: true,
    pourquoi: "Le relief est une **variable d'entraînement** : il se planifie et se construit, il ne se subit pas.",
  },
  trail: {
    libelle: "trail (sentier, dénivelé marqué)",
    planifier_denivele: true,
    pourquoi:
      "Le trail **est** du dénivelé — donc de la **DESCENTE**, donc de l'**EXCENTRIQUE**. C'est la variable " +
      "structurante du plan, au même titre que les kilomètres.",
  },
};

export const TERRAIN_DEFAUT = "route";

/**
 * ⚠️ Ce que la veille NE DIT PAS sur le dénivelé et le trail. On l'affiche — on ne le comble pas.
 *
 * 📚 **2026-07-11 — le premier point de cette liste a DISPARU, et c'est une bonne nouvelle.**
 * Il disait : « la spécificité TRAIL : la veille n'en dit RIEN ». Le moteur avait **demandé** cette
 * veille ; **elle a été écrite** (`docs/veille/20-trail-denivele.md`). Le trou de veille sur le trail
 * est **COMBLÉ**. Les six trous ci-dessous, eux, **restent** — et l'un d'eux est désormais **certifié
 * comme définitif** : la vitesse de progression du D+ **n'existe nulle part**, et la veille dit
 * explicitement qu'elle **ne peut pas faire mieux**. Un trou certifié est plus honnête qu'un trou
 * soupçonné.
 */
export const NON_SOURCE_DENIVELE = [
  "🕳️ **La vitesse de progression du D+ : IL N'Y A RIEN, et c'est CERTIFIÉ.** La veille a cherché (veille/20 §5) : **aucune source primaire** n'établit à quelle vitesse construire du dénivelé. Bontemps 2020 le dit lui-même — les **relations dose-réponse ne sont PAS établies** ; la revue recommande « un principe de progressivité », **sans aucun chiffre**. Les « +10 %/sem de D+ » qui circulent viennent **exclusivement de blogs de coachs**. → Le moteur **transfère** le garde-fou du **volume** (~10 %/sem) : c'est une **extrapolation ASSUMÉE**, pas une source. ⚠️ **Aggravant, et dit** : le ~10 %/sem du volume est **lui-même** une convention — **on transfère donc une convention**. Le moteur l'applique **une semaine sur deux** (alternance), donc plus lentement encore. **C'est la position la plus honnête disponible aujourd'hui.**",
  "**Un seuil de D+** (« au-delà de N mètres, c'est dangereux ») : **rien**, nulle part. Le moteur n'en fabrique aucun — il progresse en **paliers RELATIFS** à ce que tu encaisses **déjà**.",
  "**Un seuil de D+ définissant un terrain « vallonné » ou « trail »** : **rien**. Le terrain reste **DÉCLARÉ**, jamais deviné depuis un nombre de mètres.",
  "**Un ratio D+/km** (« 30 m de D+ par km de sortie ») : **rien**. La répartition du D+ dans la semaine est une **convention du moteur**, déclarée — tu peux la redistribuer.",
  "🔴 **Une conversion du D− en charge : rien — et il n'y en aura probablement JAMAIS** en unités énergétiques (veille/20 §4.4). Le D− **n'est PAS injecté** dans la charge d'endurance : il faudrait une constante inventée, exactement ce que l'ADR 0006 supprime. **Conséquence STRUCTURELLE à connaître : ta charge d'endurance SOUS-ESTIME la fatigue d'une sortie en descente** — parce que la descente coûte **−49 % d'énergie** (Minetti 2002) **tout en étant ce qui casse**. **Ce n'est pas un bug, c'est une propriété du modèle.** Le moteur préfère te le dire que te donner un chiffre faux.",
  "**Quand cesser la descente avant la course** : **rien** — l'affûtage n'a jamais été étudié en trail. Le moteur fait chuter le D+ avec le volume : c'est **cohérent**, ce n'est pas **démontré**. _(Seul repère indirect : la trace neuromusculaire dure 3–4 j.)_",
  "**Les allures VDOT en dénivelé** : elles sont calibrées sur le **PLAT**. Aucune équivalence allure↔pente n'existe — et le coût énergétique varie d'un facteur **5,6** entre le plat et +45 % (Minetti 2002). En côte et en descente, **cours à l'effort**, pas à l'allure.",
  "🔴 **L'effet de la descente sur une TENDINOPATHIE ROTULIENNE : AUCUNE PREUVE ÉPIDÉMIOLOGIQUE.** Plausibilité mécanique et clinique **forte** ; preuve **absente**. La tendinopathie rotulienne est une **maladie des sports de SAUT** (volley 24,8 %, basket 20,8 %), et le **tendon rotulien des traileurs ne diffère PAS** de celui des routiers (ni en épaisseur, ni en section, ni en corrélation au D+). **INTERDICTION PRODUIT : ne jamais chiffrer un sur-risque. Ce chiffre n'existe pas.**",
];

/**
 * Le plan de dénivelé, semaine par semaine.
 *
 * @param volumes  la sortie de `planifierVolumes` — chaque semaine porte `type` et `monte`
 *                 (`"volume"` | `"denivele"` | `null`). C'est `monte` qui encode **la règle** :
 *                 **jamais le volume ET le dénivelé la même semaine.**
 * @param depart_m le D+ hebdo **actuel et MESURÉ** de l'utilisateur. Il n'a **pas de défaut** :
 *                 sans lui, on ne planifie pas (cf. `raisonNonPlanifie`).
 * @param gel      une zone ACTIVE gèle le volume → elle gèle aussi le D+ (même doctrine que la
 *                 longue sortie : une demi-mesure sur une zone douloureuse est un mensonge).
 */
export function planifierDenivele(volumes, { depart_m, gel = false } = {}) {
  const semaines = [];
  let dplus = Math.round(depart_m);
  let pic = dplus;

  for (let i = 0; i < volumes.length; i++) {
    const v = volumes[i];
    if (v.type === "charge") {
      // Le D+ ne monte QUE les semaines qui lui sont réservées. Les semaines « volume », il est PLAT.
      if (i > 0 && !gel && v.monte === "denivele") dplus = Math.round(dplus * PAS_GRADUEL);
      semaines.push(dplus);
      pic = Math.max(pic, dplus);
    } else if (v.type === "recuperation") {
      // Le D+ redescend avec le volume : une semaine de récupération qui garderait tout le
      // dénivelé n'en serait pas une (la descente est ce qui abîme).
      semaines.push(Math.round(dplus * COEF_RECUP));
    } else {
      // Affûtage / semaine de course : le D+ suit les coefficients de l'affûtage du volume.
      // ⚠️ Cohérent, PAS démontré (cf. NON_SOURCE_DENIVELE) — et c'est dit.
      semaines.push(null); // rempli par l'appelant avec le coef de taper (il seul le connaît)
    }
  }
  return { semaines, pic, depart_m: Math.round(depart_m) };
}

/**
 * Répartit le D+ hebdomadaire sur les séances de la semaine.
 *
 * ⚠️ **Convention DÉCLARÉE, non sourcée** (aucun ratio D+/km n'existe dans la veille) :
 *   • proportionnellement aux **kilomètres** — un trailer ne fait pas ses footings sur piste ;
 *   • **SAUF la séance de qualité**, qui reste sur terrain roulant. Raison : les allures **T/I/R**
 *     sont dérivées du **VDOT**, qui est calibré sur le **PLAT**. Une « allure T » dans une côte
 *     n'a **aucun sens** — et la veille ne donne **aucune** équivalence allure↔pente. Plutôt que
 *     d'inventer cette équivalence, le moteur **garde au moins une séance par semaine où l'allure
 *     cible veut encore dire quelque chose**. C'est un choix d'ingénierie **assumé**, pas une source.
 *   • le **reliquat d'arrondi** va à la **longue sortie** — c'est la séance spécifique du trail.
 *
 * Le **D−** : sur une **boucle** (départ = arrivée), il **égale** le D+. C'est de la géométrie, pas
 * une hypothèse — et le moteur planifie des **boucles**. Le flag `boucle: true` le déclare, pour que
 * personne ne prenne cette égalité pour une mesure.
 * ⚠️ Et **jamais `0`** : quand il n'y a pas de dénivelé planifié, le champ est **absent**, pas nul.
 * Un zéro faux éteint le seul signal de fatigue mesurable dont dispose ce moteur.
 */
export function repartirDenivele(seances, denivele_m) {
  const dplus = Math.round(denivele_m ?? 0);
  if (!Number.isFinite(dplus) || dplus <= 0) return seances;

  const porteuses = seances.filter((s) => Number(s.km ?? 0) > 0 && s.type !== "qualite" && s.type !== "course");
  const totalKm = porteuses.reduce((n, s) => n + Number(s.km), 0);
  if (!porteuses.length || totalKm <= 0) return seances;

  let reste = dplus;
  const longue = porteuses.find((s) => s.type === "longue") ?? porteuses[porteuses.length - 1];
  for (const s of porteuses) {
    const part = s === longue ? 0 : Math.round((dplus * Number(s.km)) / totalKm);
    if (s !== longue && part > 0) {
      s.denivele_m = part;
      s.denivele_negatif_m = part; // boucle : D− = D+ (géométrie, pas hypothèse)
      s.denivele_boucle = true;
      reste -= part;
    }
  }
  if (reste > 0) {
    longue.denivele_m = (longue.denivele_m ?? 0) + reste;
    longue.denivele_negatif_m = longue.denivele_m;
    longue.denivele_boucle = true;
  }
  return seances;
}

/**
 * Le D− de la COURSE cible. ⚠️ Le point le plus délicat du module.
 *
 * Rappel des specs : `denivele_negatif_m` peut être **`null`**, mais **JAMAIS `0`** — un zéro faux
 * éteint le seul signal de fatigue mesurable. Le moteur applique la règle à lui-même : quand il ne
 * connaît pas le D− d'une course, il renvoie `null` **et il le DIT**. Il ne le déduit pas du D+ :
 * un parcours point-à-point (une descente de col, un trail linéaire) peut avoir 200 m de D+ et
 * 1 800 m de D− — et c'est **précisément** le parcours le plus dangereux pour un tendon rotulien.
 * Supposer « D− = D+ » sur une course serait donc l'erreur **exactement là où elle coûte le plus**.
 */
export function deniveleCourse(objectif = {}) {
  const dplus = objectif.denivele_m ?? null;
  const dmoins = objectif.denivele_negatif_m ?? null;
  return {
    denivele_m: dplus,
    denivele_negatif_m: dmoins,
    dmoins_inconnu: dplus != null && dmoins == null,
    // Le moteur NE remplit PAS le trou. Il le montre.
    pourquoi_pas_deduit:
      dplus != null && dmoins == null
        ? "⚠️ **Le D− de ta course est INCONNU, et le moteur ne le déduira pas du D+.** Sur une **boucle** ils " +
          "s'égalent ; sur un **point-à-point**, non — un parcours peut afficher 200 m de D+ et **1 800 m de D−**, " +
          "et c'est **exactement** le profil le plus agressif pour un tendon rotulien. **La descente est la " +
          "contrainte** (ADR 0006 §1.5) : la supposer serait se tromper là où ça coûte le plus. " +
          "Renseigne `running.objectif.denivele_negatif_m` — et **jamais `0` si tu ne sais pas** : mets `null`. " +
          "Un zéro faux éteint le seul signal de fatigue que ce moteur sait lire."
        : null,
  };
}

/**
 * Pourquoi le moteur ne planifie PAS de dénivelé — et il y a **quatre raisons distinctes**, qui
 * n'ont **rien** à voir entre elles. Les confondre serait laisser croire qu'un silence est une
 * validation.
 */
export function raisonNonPlanifie({ terrain, depart_m, eviter, zones = [] }) {
  if (eviter) {
    return {
      code: "limitation_active",
      retire: true,
      message:
        `⛰️🚫 **Aucun dénivelé dans ce plan** — **${zones.join(", ")}** est une limitation **ACTIVE**. ` +
        `**Et la raison est la DESCENTE, pas la montée** : elle est **EXCENTRIQUE** (ADR 0006 §1.5), elle produit des ` +
        `**dommages musculaires**, et c'est elle qui charge l'articulation. ` +
        `🔴 **Le coût est réel, et le moteur ne te le cache pas : si ta course a du dénivelé, ce plan ne t'y prépare PAS.** ` +
        `C'est un **choix de sécurité assumé**, pas une conclusion scientifique — aucune source ne chiffre le D+ « sûr » ` +
        `d'un genou douloureux, donc le moteur n'invente pas de chiffre. Fais examiner la zone : c'est ce qui rouvrira le ` +
        `dénivelé, pas un réglage de plan.`,
    };
  }
  if (!TERRAINS[terrain]?.planifier_denivele) {
    return {
      code: "terrain_route",
      retire: false,
      message: null, // Rien à signaler : un plan route reste un plan route. Ce n'est pas un manque.
    };
  }
  if (depart_m == null) {
    return {
      code: "depart_inconnu",
      retire: false,
      message:
        `⛰️⚠️ **Tu vises un terrain « ${TERRAINS[terrain].libelle} » — et le moteur ne planifie AUCUN dénivelé, ` +
        `parce qu'il ne sait pas ce que tu encaisses aujourd'hui.** Renseigne \`running.denivele_actuel_m_sem\` ` +
        `(le D+ que tu fais **déjà** par semaine). ` +
        `**Le moteur n'inventera pas ton point de départ** : aucun D+ « normal » n'existe, et **aucun seuil n'est sourcé** — ` +
        `un chiffre de départ fabriqué serait soit inutile, soit dangereux. ` +
        `🔴 **En attendant, ce plan est un plan de PLAT, et il ne te prépare pas à ta course.** Tu le sais maintenant.`,
    };
  }
  return null;
}
