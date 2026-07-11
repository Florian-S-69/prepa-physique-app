// ═══════════════════════════════════════════════════════════════════════════════════════════════
// PERFORMANCES — l'HISTORIQUE, et sa RÉCONCILIATION
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 **LE DÉFAUT DE CONCEPTION QUE CE MODULE RÉPARE.** Jusqu'ici, `running.temps_reference`
// n'acceptait **qu'UNE seule** performance. Tout le plan en dérivait : VDOT, allures, chrono
// projeté, correction marathon. **Un coureur réel en a plusieurs — et elles se CONTREDISENT.**
//
// Le cas qui l'a mis à nu (la personne B, 2026-07-12) :
//
// | Perf | Ce qu'elle dit | Ce que le moteur en faisait |
// |---|---|---|
// | 10 km en 50:00, effort **NON maximal** | « je vaux **au moins** ça sur 10 km » | il le prenait pour une **mesure** |
// | semi en 2h00 (sa **meilleure** course longue) | « voilà mon endurance réelle » | **il ne le voyait pas** |
// | 30 km en 3h20, **sortie d'entraînement** | « j'ai déjà couvert 30 km » | **il ne le voyait pas** |
//
// **Et le fait le plus informatif du dossier lui échappait entièrement :** son 10 km **prédit** un
// semi en ~1h50 (équivalence VDOT). Il a couru **2h00**. Il est **~8 % plus lent que sa vitesse ne
// le prédit** → son point faible est l'**ENDURANCE**, pas la vitesse. Et le marathon est
// **exactement** le test de ce qui lui manque.
//
// **Ce raisonnement était fait à la main. C'est le travail du MOTEUR.** Il est ici.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA DOCTRINE — on ne prend pas la meilleure, on ne fait pas la moyenne, on EXPLIQUE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// 1. **Chaque perf a son VDOT implicite** (Daniels — `vdot.js`, veille/03 §2). Ils **divergent**.
//    La divergence n'est pas un bruit à lisser : **c'est le signal.**
//
// 2. **Toutes les perfs ne sont pas des mesures.** Trois statuts, trois traitements :
//    • **Sortie d'ENTRAÎNEMENT** → **PAS une performance.** C'est une preuve de **capacité de
//      VOLUME**, pas de vitesse. Poids **ZÉRO** dans l'estimation du VDOT. (Le 30 km de la personne B à
//      6:40/km est son allure d'endurance fondamentale : en tirer un VDOT donnerait 30,8 — un
//      chiffre absurde, et le moteur le refuse.)
//    • **Effort NON maximal** → une **borne INFÉRIEURE**, pas une mesure. « Je vaux **au moins**
//      ça. » Elle ne peut donc pas servir d'estimateur ponctuel — mais elle **renforce** le
//      diagnostic de profil (voir §4).
//    • **Course officielle à effort maximal (ou inconnu)** → une **mesure**. C'est elle qui pèse.
//
// 3. **La pondération est HONNÊTE, et sa part sourcée est nommée.** Deux facteurs :
//    • **La distance la plus proche de l'objectif est le meilleur prédicteur** — 🟢 **SOURCÉ**
//      (veille/03 §2, veille/12 §4 : pour un marathon, « privilégier un **semi récent** », « ne PAS
//      verrouiller l'allure M sur un VDOT issu d'un 5–10 K »).
//      ⚠️ **Le brief interne citait `veille/12 §8` — c'est FAUX** : §8 est l'**affûtage**. Vérifié
//      dans le corpus, corrigé ici. C'est exactement la vérification que `tests/citations.test.js`
//      impose, et elle a resservi.
//    • **Une perf récente > une perf ancienne** — la veille dit « récent », elle ne donne **aucune
//      demi-vie**. Le moteur en choisit une, et le **DIT** (`@chiffre-derive`).
//
// 4. **LE PROFIL — la fonctionnalité qui vaut le plus.** Confronter le VDOT d'une perf COURTE au
//    temps RÉEL d'une perf LONGUE :
//    • la longue est **plus lente** que la courte ne le prédit → **déficit d'ENDURANCE** ;
//    • la longue est **plus rapide** que prévu → **déficit de VITESSE** ;
//    • cohérentes → profil **équilibré**.
//    **Et ça CHANGE LE PLAN** (`running.js`) : un déficit d'endurance appelle du **volume et de
//    l'allure facile**, pas du fractionné. L'inverse pour un déficit de vitesse.
//
// 5. **L'ÉVOLUTION — et le silence.** Avec plusieurs perfs datées on peut voir une trajectoire.
//    ⚠️ **Avec 2–3 points, on ne trace pas une courbe.** Le moteur **refuse** de conclure sous
//    3 mesures exploitables, et même à 3 il dit que c'est une **impression, pas une mesure**.
//
// ⚠️ **RIEGEL n'est PAS utilisé ici, et c'est délibéré.** Son exposant 1,06 est une **convention
// empirique** largement répandue — **pas une loi**, et il **ne figure nulle part dans le corpus de
// veille** (`veille/03 §2` ne le nomme que pour dire que « VDOT/Riegel » **surestime** le marathon
// des coureurs lents). Le moteur a mieux, et c'est **sourcé** : l'équivalence **VDOT de Daniels**,
// déjà implémentée et déjà testée. On l'utilise. On n'importe pas un exposant non sourcé pour faire
// savant. *(Écart pratique sur le cas de la personne B : Riegel et Daniels prédisent tous deux ~1h50 sur le
// semi depuis son 10 km — la conclusion ne dépend pas du choix.)*

import { estimerVdot, tempsPredit, parseTemps } from "./vdot.js";

const JOUR_MS = 24 * 3600 * 1000;

export const TYPES = ["course", "entrainement", "test"];
export const EFFORTS = ["maximal", "non_maximal", "inconnu"];

const TYPE_DEFAUT = "course";
const EFFORT_DEFAUT = "inconnu";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LES POIDS — ce qui est sourcé, et ce qui ne l'est pas
// ─────────────────────────────────────────────────────────────────────────────────────────────

// Demi-vie de la « fraîcheur » d'une performance, en jours.
// @chiffre-derive ⚠️ **AUCUNE demi-vie n'est sourcée.** La veille dit « privilégier un semi
// **récent** » (veille/03 §2, veille/12 §4) — elle ne chiffre **jamais** à quelle vitesse une perf
// se périme. 365 jours est une **décision d'ingénierie**, prise parce qu'une saison complète
// d'entraînement change réellement le niveau d'un coureur, et **arrondie vers la prudence** (une
// demi-vie longue dévalue LENTEMENT : le moteur préfère garder une vieille perf au poids plutôt que
// de l'effacer sur un chiffre qu'il a inventé). Elle est **déclarée dans la sortie** : l'utilisateur
// voit le poids que chaque perf a reçu, et pourquoi.
const DEMI_VIE_JOURS = 365;

// Facteur appliqué quand l'effort n'est pas déclaré maximal.
// @chiffre-derive Aucune source ne chiffre la décote d'une course dont on ignore si elle a été
// courue à fond. C'est un **choix d'ingénierie** : une course officielle non qualifiée reste une
// mesure (on ne la jette pas), mais elle vaut moins qu'un effort dont on SAIT qu'il était maximal.
// 0,75 = « les trois quarts d'une mesure certaine ». Déclaré, pas sourcé.
const FACTEUR_EFFORT_INCONNU = 0.75;

// Seuil au-delà duquel un écart de prédiction cesse d'être du BRUIT et devient un TRAIT.
// @chiffre-derive 🔴 **TRANSFERT ASSUMÉ — à lire avant de me faire confiance.** Aucune source du
// corpus ne dit à partir de quel écart une divergence entre distances mérite le nom de « déficit ».
// Le seul ordre de grandeur disponible est l'**erreur du meilleur prédicteur connu du corpus** :
// **MAE 5,67 %** pour le modèle fondé sur un semi récent (Oficial-Casado et al., *Frontiers in
// Physiology* 2026 — veille/03 §2). On en fait un **plancher de significativité** : **sous ~6 %,
// l'écart observé est indiscernable de l'erreur de l'instrument**, et le nommer « déficit » serait
// **fabriquer un diagnostic à partir du bruit**. ⚠️ **Ce n'est PAS l'usage que la veille fait de ce
// nombre** — c'est un transfert, et il est **DÉCLARÉ**. (Le défaut `PLANCHER_KCAL` était le même
// geste, **non déclaré**. La différence tient entière dans ces trois lignes.)
const SEUIL_DIVERGENCE_PCT = 6;

// Nombre minimal de mesures exploitables pour oser prononcer le mot « tendance ».
// @chiffre-derive Pur bon sens statistique, aucun rapport avec veille/03 §2 (cité pour l'instrument,
// pas pour ce seuil) : **deux points définissent toujours une droite** — ils ne démontrent aucune
// tendance. Trois est le **minimum absolu** pour qu'un écart puisse contredire le précédent. Et même
// à trois, le moteur qualifie le résultat d'**impression, pas de mesure** (voir `trajectoire`).
const MIN_POINTS_TENDANCE = 3;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// DATES — une date imprécise est une date imprécise, et le moteur le DIT
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * « 2026-02-16 » · « 2025-08 » · « 2025 » → { ms, precision, libelle }.
 * Une date partielle est ancrée au MILIEU de la période qu'elle désigne (c'est l'estimateur qui
 * minimise l'erreur maximale), et sa `precision` est **remontée** : un poids calculé sur « 2025 »
 * n'a pas la même valeur qu'un poids calculé sur « 2025-08-14 », et l'utilisateur doit le savoir.
 */
export function parseDatePerf(str) {
  if (!str) return { ms: null, precision: "absente", libelle: "date non fournie" };
  const s = String(str).trim();
  let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) {
    return { ms: Date.parse(`${s}T12:00:00Z`), precision: "jour", libelle: s };
  }
  if ((m = /^(\d{4})-(\d{2})$/.exec(s))) {
    // Milieu du mois.
    return { ms: Date.parse(`${s}-15T12:00:00Z`), precision: "mois", libelle: `${s} (mois seul)` };
  }
  if ((m = /^(\d{4})$/.exec(s))) {
    // Milieu de l'année.
    return { ms: Date.parse(`${s}-07-01T12:00:00Z`), precision: "annee", libelle: `${s} (année seule)` };
  }
  const brut = Date.parse(s);
  if (!Number.isNaN(brut)) return { ms: brut, precision: "jour", libelle: s };
  return { ms: null, precision: "illisible", libelle: `« ${s} » (date illisible)` };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// MIGRATION — `temps_reference` (singulier) ne casse pas, et ce qui est migré est DIT
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Clé d'identité d'une perf — sert au dédoublonnage lors de la migration et du recalage. */
function cle(p) {
  return `${p.distance_m}|${p.temps}|${p.date ?? ""}`;
}

/**
 * 🔁 **LA BOUCLE SE FERME ICI.** Un test chrono du journal **entre dans l'historique** au lieu
 * d'écraser une référence unique. Il ne remplace pas le passé : il **s'y ajoute**, et la
 * réconciliation le pondère comme les autres — sauf qu'il a **deux atouts décisifs** : il est
 * **frais** (poids de fraîcheur ≈ 1) et il est **maximal** (aucune décote d'effort). Il l'emporte
 * donc naturellement sur une vieille course à effort inconnu, **sans qu'aucune règle spéciale ne
 * soit écrite pour lui**. C'est la pondération qui fait le travail.
 *
 * 🎯 **Et il RAFFINE le diagnostic** : un déficit d'endurance jusque-là établi sur une perf courte
 * **non maximale** (donc une simple **borne inférieure**) devient, après le test, un écart
 * **MESURÉ**. Le plan se recale, et le profil aussi.
 */
export function testEnPerformance(t) {
  return {
    distance_m: t.distance_m,
    temps: t.temps,
    date: t.date ?? null,
    type: "test",
    // Un test chrono du plan EST un effort maximal — c'est sa raison d'être (« à effort de course »).
    // Mais si le journal déclare autre chose, on le respecte : le moteur ne réécrit pas le vécu.
    effort: t.effort ?? "maximal",
    ...(t.conditions ? { conditions: t.conditions } : {}),
    note: t.note ?? "Test chrono du plan — recale le VDOT et toutes les allures (veille/03 §6, veille/12 §8).",
  };
}

/** Ajoute une performance à l'historique, sans doublon (clé distance|temps|date). */
export function ajouterPerformance(perfs, perf) {
  const liste = (perfs ?? []).map((p) => ({ ...p }));
  if (liste.some((p) => cle(p) === cle(perf))) return liste;
  liste.push(perf);
  return liste;
}

/**
 * Migration RÉTROCOMPATIBLE de `running.temps_reference` (UNE perf) → `running.performances[]`
 * (un HISTORIQUE). Même doctrine que `migrerLimitations` (personne.js) : **on ne casse rien, on
 * n'avale rien — ce qui est migré est DIT.**
 *
 * `temps_reference` reste **lu**, reste **en place** (aucun persona existant ne casse), mais il
 * n'est plus la source de vérité : il devient **une entrée parmi d'autres** dans `performances[]`.
 *
 * @returns {{ performances: Array, migration: object|null }}
 */
export function migrerPerformances(r) {
  const declarees = Array.isArray(r?.performances) ? r.performances : [];
  const perfs = declarees.map((p) => ({ ...p }));
  const tr = r?.temps_reference;
  let migration = null;

  if (tr?.distance_m && tr?.temps) {
    const migree = {
      distance_m: tr.distance_m,
      temps: tr.temps,
      date: tr.date ?? null,
      type: tr.type ?? TYPE_DEFAUT,
      effort: tr.effort ?? EFFORT_DEFAUT,
      ...(tr.conditions ? { conditions: tr.conditions } : {}),
      ...(tr.note ? { note: tr.note } : {}),
      _migree_depuis: "running.temps_reference",
    };
    const deja = perfs.some((p) => cle(p) === cle(migree));
    if (!deja) perfs.push(migree);
    migration = {
      depuis: "running.temps_reference",
      vers: "running.performances[]",
      doublon: deja,
      message:
        "ℹ️ Ta performance de référence est déclarée dans **`running.temps_reference`** — un champ qui n'accepte " +
        "**qu'UNE seule** perf. C'est un **défaut de conception** : un coureur réel en a plusieurs, et **elles se " +
        "contredisent** — c'est justement cette contradiction qui est informative. Le moteur l'a **migrée** vers " +
        "**`running.performances[]`** (un historique) et la traite comme **une entrée parmi d'autres**. " +
        "Rien n'est perdu, l'ancien champ reste lu. **Ajoute-y tes autres courses** : chaque perf supplémentaire " +
        "rend le diagnostic plus juste — et c'est la **plus proche de ta distance objectif** qui pèse le plus " +
        "(veille/03 §2, veille/12 §4).",
    };
  }
  return { performances: perfs, migration };
}

/**
 * Valide et complète chaque performance. Une perf inexploitable n'est **jamais** silencieusement
 * ignorée : elle sort avec `exploitable: false` et **son motif**.
 */
export function validerPerformances(perfs) {
  const valides = [];
  const rejetees = [];
  for (const brut of perfs) {
    const p = { ...brut };
    const motifs = [];
    const dist = Number(p.distance_m);
    if (!Number.isFinite(dist) || dist <= 0) motifs.push("`distance_m` manquante ou non numérique");
    let tMin = null;
    if (!p.temps) motifs.push("`temps` manquant");
    else {
      try {
        tMin = parseTemps(p.temps);
        if (!Number.isFinite(tMin) || tMin <= 0) motifs.push(`\`temps\` invalide (« ${p.temps} »)`);
      } catch {
        motifs.push(`\`temps\` illisible (« ${p.temps} » — attendu « mm:ss » ou « h:mm:ss »)`);
      }
    }
    if (p.type != null && !TYPES.includes(p.type)) motifs.push(`\`type\` « ${p.type} » inconnu (attendu : ${TYPES.join(" | ")})`);
    if (p.effort != null && !EFFORTS.includes(p.effort)) motifs.push(`\`effort\` « ${p.effort} » inconnu (attendu : ${EFFORTS.join(" | ")})`);

    if (motifs.length) {
      rejetees.push({ ...p, exploitable: false, motifs });
      continue;
    }
    const d = parseDatePerf(p.date);
    valides.push({
      ...p,
      distance_m: dist,
      type: p.type ?? TYPE_DEFAUT,
      effort: p.effort ?? EFFORT_DEFAUT,
      temps_min: tMin,
      allure_min_par_km: tMin / (dist / 1000),
      // VDOT implicite — Daniels (veille/03 §2). Calculé pour TOUTES les perfs, y compris celles
      // qui ne serviront pas d'estimateur : c'est lui qui rend la DIVERGENCE visible.
      vdot_implicite: +estimerVdot(dist, p.temps).toFixed(1),
      date_ms: d.ms,
      date_precision: d.precision,
      date_libelle: d.libelle,
      exploitable: true,
    });
  }
  return { valides, rejetees };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LE RÔLE D'UNE PERF — la décision la plus importante du module
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Que **peut** dire cette performance ? Trois rôles, trois traitements — et la distinction est le
 * cœur du module (voir la doctrine §2 en tête de fichier).
 *
 * • `mesure`          → une course/test à effort maximal ou inconnu. **Elle estime le VDOT.**
 * • `borne_inferieure`→ un effort **NON maximal**. « Je vaux **au moins** ça. » **N'estime rien** :
 *                       en faire un estimateur, ce serait prendre un plancher pour une mesure.
 *                       Mais elle **renforce** le diagnostic de profil (§4).
 * • `capacite_volume` → une sortie d'**ENTRAÎNEMENT**. **Ce n'est pas une performance.** Elle prouve
 *                       qu'on a couvert la distance, pas à quelle vitesse on peut la courir.
 */
export function roleDe(p) {
  if (p.type === "entrainement") {
    return {
      role: "capacite_volume",
      estime: false,
      pourquoi:
        "**Sortie d'ENTRAÎNEMENT — ce n'est pas une performance.** Elle prouve une **capacité de VOLUME** " +
        "(« j'ai déjà couvert cette distance »), pas une **vitesse**. En tirer un VDOT reviendrait à confondre " +
        "l'allure d'endurance fondamentale avec l'allure de course : le chiffre serait faux, et **faux vers le bas**. " +
        "→ **Poids ZÉRO** dans l'estimation du VDOT. Elle reste affichée : c'est une **preuve de base longue**.",
    };
  }
  if (p.effort === "non_maximal") {
    return {
      role: "borne_inferieure",
      estime: false,
      pourquoi:
        "**Effort NON maximal → c'est une BORNE INFÉRIEURE, pas une mesure.** Elle dit « je vaux **au moins** ça " +
        "sur cette distance », elle ne dit pas « je vaux ça ». En faire un estimateur ponctuel du VDOT, ce serait " +
        "prendre un **plancher** pour une **mesure** — et **sous-estimer** le coureur. → **N'estime pas le VDOT.** " +
        "⚠️ **Mais elle n'est pas jetée** : elle **RENFORCE** le diagnostic de profil, parce que tout écart calculé " +
        "à partir d'elle est lui-même une **borne inférieure** (le vrai écart est **au moins** celui-là).",
    };
  }
  return {
    role: "mesure",
    estime: true,
    pourquoi:
      p.effort === "maximal"
        ? "Course/test à **effort maximal** : c'est une **mesure**. Elle estime le VDOT."
        : "Course/test, **effort non qualifié** : traitée comme une **mesure**, avec une décote (on ne sait pas si elle a été courue à fond). Déclare `effort` pour lever le doute.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LA PONDÉRATION
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Poids de PROXIMITÉ à la distance objectif — 🟢 **la partie SOURCÉE de la pondération.**
 *
 * **La règle** (veille/03 §2, veille/12 §4) : pour prédire un **marathon**, un **semi récent** est
 * un meilleur prédicteur qu'un **10 km** — « **ne PAS verrouiller l'allure M sur un VDOT issu d'un
 * 5–10 K** ; privilégier un **semi récent** ». La source la chiffre : l'erreur du VDOT grimpe de
 * ~1,1 % (élite sub-2h30) à **~10,4 %** (profil sub-5h00), tandis qu'un modèle fondé sur un semi
 * récent explique **85 %** de la variance (MAE **5,67 %**) et reste stable sur toute la gamme
 * (Oficial-Casado et al., *Frontiers in Physiology* 2026, DOI 10.3389/fphys.2025.1718298).
 *
 * @chiffre-derive ⚠️ **La RÈGLE est sourcée (veille/03 §2) ; la FORME de la courbe ne l'est pas.**
 * La veille donne un **ordre** (semi > 10 K pour le marathon), pas une **fonction de poids**. Le
 * moteur en choisit une — `1 / (1 + |ln(d_perf / d_objectif)|)` — et la **déclare** : sans
 * dimension, symétrique (une perf 2× trop courte et une 2× trop longue sont également décalées),
 * valant exactement 1 quand la distance de la perf **est** la distance objectif. Sur un marathon
 * elle donne **semi ≈ 0,59** contre **10 km ≈ 0,41** : le semi pèse ~44 % de plus — ce qui respecte
 * l'ordre imposé par la source. **C'est une décision d'ingénierie, pas un résultat scientifique.**
 */
export function poidsDistance(distance_m, objectif_m) {
  if (!objectif_m || !distance_m) return 1;
  return 1 / (1 + Math.abs(Math.log(distance_m / objectif_m)));
}

/** Poids de FRAÎCHEUR — décroissance exponentielle, demi-vie `DEMI_VIE_JOURS` (non sourcée, cf. ci-dessus). */
export function poidsFraicheur(date_ms, aujourdhui_ms) {
  if (date_ms == null) return 0.5; // date absente : on ne sait pas → décote franche, et c'est dit
  const jours = Math.max(0, (aujourdhui_ms - date_ms) / JOUR_MS);
  return Math.pow(0.5, jours / DEMI_VIE_JOURS);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 🎯 LE PROFIL — la fonctionnalité qui vaut le plus
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Confronte les performances **deux à deux** : le VDOT de la perf **courte** prédit un temps sur la
 * distance de la perf **longue** ; on le compare au temps **réellement couru**.
 *
 * • longue **plus lente** que prédit (écart **positif**) → **déficit d'ENDURANCE** : il s'écroule
 *   sur la distance. Le remède est du **volume** et de l'**allure facile**, pas du fractionné.
 * • longue **plus rapide** que prédit (écart **négatif**) → **déficit de VITESSE** : son moteur
 *   aérobie est en avance sur sa vitesse pure. Le remède est l'**intensité**.
 * • écart sous `SEUIL_DIVERGENCE_PCT` → **cohérent**, et le moteur **se tait**.
 *
 * ⚠️ Les sorties d'**entraînement** sont **exclues** des paires : comparer une allure d'endurance
 * fondamentale à une allure de course fabriquerait un « déficit d'endurance » chez tout le monde.
 *
 * 🔴 **La borne inférieure travaille ici.** Si la perf **courte** était un effort **non maximal**,
 * son VDOT est **sous-estimé** → le temps qu'elle prédit sur la distance longue est **trop lent** →
 * l'écart calculé est **plus PETIT que le vrai**. Conclusion : **le déficit d'endurance mesuré est
 * une BORNE INFÉRIEURE.** Le vrai est **au moins** celui-là. (Symétriquement, un déficit de
 * **vitesse** diagnostiqué depuis une courte non maximale est **fragile** — le moteur le dit et
 * refuse de conclure.)
 */
export function paires(perfsVitesse) {
  const out = [];
  const tri = [...perfsVitesse].sort((a, b) => a.distance_m - b.distance_m);
  for (let i = 0; i < tri.length; i++) {
    for (let j = i + 1; j < tri.length; j++) {
      const courte = tri[i];
      const longue = tri[j];
      if (courte.distance_m >= longue.distance_m) continue;
      const predit = tempsPredit(courte.vdot_implicite, longue.distance_m);
      const ecart_pct = +((longue.temps_min / predit - 1) * 100).toFixed(1);
      const sens = ecart_pct > SEUIL_DIVERGENCE_PCT ? "endurance" : ecart_pct < -SEUIL_DIVERGENCE_PCT ? "vitesse" : "coherent";
      // Le VDOT de la COURTE est sous-estimé si elle n'était pas maximale → l'écart l'est aussi.
      const borne_inferieure = courte.effort === "non_maximal";
      out.push({
        courte: { distance_m: courte.distance_m, temps: courte.temps, effort: courte.effort, vdot: courte.vdot_implicite },
        longue: { distance_m: longue.distance_m, temps: longue.temps, effort: longue.effort, vdot: longue.vdot_implicite },
        temps_predit_min: +predit.toFixed(1),
        temps_reel_min: +longue.temps_min.toFixed(1),
        ecart_pct,
        sens,
        borne_inferieure,
        // Une perf longue non maximale tire l'écart vers le HAUT sans que ce soit un déficit :
        // le moteur refuse alors de nommer un « déficit d'endurance » sur une longue non courue à fond.
        contaminee: longue.effort === "non_maximal",
      });
    }
  }
  return out;
}

/** Agrège les paires en un PROFIL nommé, avec ce qu'il change au plan. */
export function detecterProfil(pairesCalculees) {
  const utiles = pairesCalculees.filter((p) => !p.contaminee);
  if (!utiles.length) {
    const raison = pairesCalculees.length
      ? "Les seules paires disponibles reposent sur une performance **longue** courue à effort **non maximal** : " +
        "elle serait forcément « plus lente que prédit », et le moteur y lirait un déficit d'endurance **qui n'existe " +
        "peut-être pas**. **Il refuse de conclure sur un artefact.**"
      : "**Une seule distance de course exploitable** (ou aucune) : il n'y a **rien à confronter**. Le profil se " +
        "détecte en comparant une perf **courte** à une perf **longue** — il faut donc **au moins deux distances " +
        "différentes**, sur des **courses** (une sortie d'entraînement ne compte pas).";
    return { code: "indetermine", libelle: "Indéterminé", raison, paires: pairesCalculees, ecart_pct: null, borne_inferieure: false };
  }

  // La paire la PLUS informative : le plus grand écart absolu (c'est elle qui porte le signal).
  const dominante = [...utiles].sort((a, b) => Math.abs(b.ecart_pct) - Math.abs(a.ecart_pct))[0];
  const endurance = utiles.filter((p) => p.sens === "endurance");
  const vitesse = utiles.filter((p) => p.sens === "vitesse");

  if (endurance.length && !vitesse.length) {
    const bi = endurance.every((p) => p.borne_inferieure);
    return {
      code: "deficit_endurance",
      libelle: "Déficit d'ENDURANCE",
      ecart_pct: dominante.ecart_pct,
      borne_inferieure: bi,
      paires: pairesCalculees,
      raison:
        `Ta performance **longue** est **${dominante.ecart_pct} % plus lente** que ta performance **courte** ne la prédit ` +
        `(${(dominante.courte.distance_m / 1000).toFixed(dominante.courte.distance_m % 1000 ? 1 : 0)} km en ${dominante.courte.temps} → ` +
        `l'équivalence VDOT donne ≈ ${Math.round(dominante.temps_predit_min)} min sur ` +
        `${(dominante.longue.distance_m / 1000).toFixed(dominante.longue.distance_m % 1000 ? 1 : 0)} km ; tu as couru ` +
        `≈ ${Math.round(dominante.temps_reel_min)} min).\n\n` +
        `**Ce que ça veut dire : tu t'écroules sur la distance.** Ta **vitesse** n'est pas ton problème — ton problème est de ` +
        `la **tenir**. ` +
        (bi
          ? `🔴 **Et c'est une BORNE INFÉRIEURE** : ta perf courte a été courue à effort **NON maximal**, donc ton vrai VDOT ` +
            `sur cette distance est **plus haut**, donc le temps qu'elle prédit sur la longue est **plus rapide**, donc ` +
            `**l'écart réel est ENCORE PLUS GRAND que ${dominante.ecart_pct} %.** Le déficit est **au moins** celui-là.`
          : `Les deux perfs sont des courses exploitables : l'écart est mesuré, pas supposé.`),
      // 🔴 CE QUE ÇA CHANGE AU PLAN — encodé dans running.js, pas écrit en bas de page.
      consequence:
        "**Volume et allure facile**, pas du fractionné. Ce qui te manque n'est pas le **moteur aérobie** (ta vitesse le " +
        "prouve) mais la **capacité à le soutenir** : elle se construit en **temps passé en zone facile** et en **longues " +
        "sorties**, pas en séances VO₂max. → Le moteur **allonge ta phase de base** (E-dominante) et **n'oriente pas ta " +
        "séance de qualité vers l'intervalle**.",
    };
  }
  if (vitesse.length && !endurance.length) {
    const fragile = vitesse.some((p) => p.borne_inferieure);
    return {
      code: fragile ? "indetermine" : "deficit_vitesse",
      libelle: fragile ? "Indéterminé (diagnostic fragile)" : "Déficit de VITESSE",
      ecart_pct: dominante.ecart_pct,
      borne_inferieure: false,
      paires: pairesCalculees,
      raison: fragile
        ? "Ta perf longue est **plus rapide** que ta courte ne le prédit — **mais ta courte a été courue à effort NON " +
          "maximal**. C'est **exactement** ce qu'on attend d'une perf sous-maximale : elle sous-estime ta vitesse, donc " +
          "elle sous-prédit ta longue. **Le moteur refuse de nommer un « déficit de vitesse » sur cet artefact.** " +
          "→ **Cours un vrai test court à fond** (le test chrono du plan est là pour ça)."
        : `Ta performance **longue** est **${Math.abs(dominante.ecart_pct)} % plus RAPIDE** que ta performance **courte** ne la ` +
          `prédit. **Ton endurance est en avance sur ta vitesse pure** : tu tiens l'effort, mais tu n'as pas de plafond haut.`,
      consequence: fragile
        ? "Aucune conséquence sur le plan tant que le diagnostic n'est pas confirmé : le moteur **ne bouge rien** sur une hypothèse."
        : "**De l'intensité.** Ce qui te manque est le **plafond** (VO₂max / vitesse pure), pas la capacité à durer. → Le moteur " +
          "**raccourcit ta phase de base** et **oriente ta séance de qualité vers l'INTERVALLE (zone I)**.",
    };
  }
  if (endurance.length && vitesse.length) {
    return {
      code: "contradictoire",
      libelle: "Contradictoire",
      ecart_pct: dominante.ecart_pct,
      borne_inferieure: false,
      paires: pairesCalculees,
      raison:
        "Tes performances se contredisent **entre elles** : certaines paires disent « déficit d'endurance », d'autres " +
        "« déficit de vitesse ». Cela arrive quand une perf est **beaucoup plus ancienne** que les autres, ou quand une " +
        "course s'est mal passée (chaleur, blessure, départ trop rapide). **Le moteur ne tranche pas** — il ne choisira " +
        "pas la moitié de tes données qui l'arrange. → **Renseigne les `conditions` de chaque course**, et cours le test " +
        "chrono du plan : une mesure fraîche vaut mieux qu'un arbitrage.",
      consequence: "**Aucune** : le moteur ne modifie pas le plan sur un signal contradictoire.",
    };
  }
  return {
    code: "equilibre",
    libelle: "Équilibré",
    ecart_pct: dominante.ecart_pct,
    borne_inferieure: false,
    paires: pairesCalculees,
    raison:
      `Tes performances sont **cohérentes entre elles** (écart max **${dominante.ecart_pct} %**, sous le seuil de ` +
      `**${SEUIL_DIVERGENCE_PCT} %** en deçà duquel un écart n'est pas distinguable de l'erreur de l'instrument lui-même). ` +
      `**Ni déficit d'endurance, ni déficit de vitesse détecté** — et le moteur préfère se taire plutôt que de te trouver ` +
      `un défaut dans le bruit.`,
    consequence: "**Plan standard** : la structure n'est pas réorientée. Rien à corriger, c'est une bonne nouvelle.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LA TRAJECTOIRE — et le devoir de SE TAIRE
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Progresse-t-il, stagne-t-il, régresse-t-il ?
 *
 * ⚠️ **Avec 2–3 points, on ne trace pas une courbe.** Ce module a été écrit pour **résister à la
 * tentation** : le moteur **refuse** de prononcer le mot « tendance » sous `MIN_POINTS_TENDANCE`
 * mesures exploitables, et **même au-dessus** il qualifie le résultat d'**IMPRESSION, pas de
 * mesure** — parce qu'une tendance sur trois points étalés sur un an, avec des distances et des
 * conditions différentes, **n'en est pas une**.
 *
 * Ce qu'il compare : le **VDOT implicite** des perfs qui **estiment** (courses/tests, effort
 * maximal ou inconnu). Une perf non maximale ne peut **pas** faire partie d'une trajectoire :
 * une baisse de VDOT pourrait n'être qu'une baisse d'**engagement**.
 */
export function trajectoire(perfsEstimantes) {
  const points = perfsEstimantes
    .filter((p) => p.date_ms != null)
    .sort((a, b) => a.date_ms - b.date_ms);

  if (points.length < MIN_POINTS_TENDANCE) {
    return {
      statut: "indeterminable",
      points: points.length,
      minimum_requis: MIN_POINTS_TENDANCE,
      pourquoi:
        `**${points.length} mesure(s) exploitable(s) et datée(s)** — il en faut au moins **${MIN_POINTS_TENDANCE}** pour ` +
        `qu'une évolution ait un sens. **Deux points définissent toujours une droite** : ils ne démontrent **aucune** ` +
        `tendance. Le moteur **ne dira donc rien** de ta progression — et c'est volontaire : inventer une trajectoire à ` +
        `partir de trop peu de données serait exactement le genre de chiffre rassurant et faux que ce produit refuse.\n\n` +
        `ℹ️ Rappel : une sortie d'**entraînement** et un effort **non maximal** ne comptent **pas** comme mesures ` +
        `(une baisse de VDOT n'y serait peut-être qu'une baisse d'engagement).`,
    };
  }

  const premier = points[0];
  const dernier = points[points.length - 1];
  const delta = +(dernier.vdot_implicite - premier.vdot_implicite).toFixed(1);
  const mois = (dernier.date_ms - premier.date_ms) / (30.44 * JOUR_MS);
  // @chiffre-derive Le seuil « ±1 point de VDOT » n'est PAS dans la veille : c'est un seuil de
  // LECTURE DU BRUIT (à partir de quand un écart mérite un nom), choisi parce qu'un point de VDOT
  // vaut ~20–30 s sur un 10 km — sous cet écart, on lit de la météo, pas de la forme. Déclaré.
  const SEUIL_VDOT = 1;
  const sens = delta > SEUIL_VDOT ? "progression" : delta < -SEUIL_VDOT ? "regression" : "stagnation";

  return {
    statut: "impression",
    points: points.length,
    sens,
    delta_vdot: delta,
    duree_mois: +mois.toFixed(1),
    serie: points.map((p) => ({ date: p.date_libelle, distance_m: p.distance_m, temps: p.temps, vdot: p.vdot_implicite })),
    // 🔴 L'AVEU, et il fait partie du résultat — pas d'une note de bas de page.
    pourquoi:
      `Sur **${points.length} mesures** étalées sur **${mois.toFixed(1)} mois**, le VDOT implicite passe de ` +
      `**${premier.vdot_implicite}** à **${dernier.vdot_implicite}** (**${delta >= 0 ? "+" : ""}${delta}**) → **${sens}**.\n\n` +
      `⚠️ **C'est une IMPRESSION, pas une MESURE — et le moteur ne la survendra pas.** ${points.length} points, sur des ` +
      `**distances différentes**, dans des **conditions différentes**, étalés sur **${mois.toFixed(1)} mois** : c'est trop ` +
      `peu, trop hétérogène et trop espacé pour une courbe. Chaque point porte l'erreur de l'instrument (l'équivalence VDOT), ` +
      `la météo du jour, l'état de forme, le parcours. **Ne prends aucune décision d'entraînement sur cette ligne.** ` +
      `Ce qui la rendra fiable : des **tests répétés sur la MÊME distance**, à intervalles réguliers (le test chrono du plan ` +
      `est le premier).`,
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// LA RÉCONCILIATION — le point d'entrée
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Réconcilie un HISTORIQUE de performances contradictoires en :
 *   • un **VDOT retenu** (moyenne pondérée des seules perfs qui **mesurent**),
 *   • un **PROFIL** nommé (déficit d'endurance / de vitesse / équilibré) **qui change le plan**,
 *   • une **trajectoire** (ou un silence assumé),
 *   • et l'**explication** de chaque poids — auditable ligne par ligne.
 *
 * ⚠️ **Ne prend PAS la meilleure. Ne fait PAS la moyenne arithmétique. EXPLIQUE la divergence.**
 *
 * @param {Array} perfsBrutes           `running.performances[]` (déjà migré)
 * @param {object} opts
 * @param {number|null} opts.objectif_distance_m  distance de la course visée (pilote la pondération)
 * @param {Date}   opts.aujourdhui               date de référence pour la fraîcheur
 * @param {number|null} opts.vdot_secours        VDOT de repli si AUCUNE perf n'est exploitable
 */
export function reconcilier(perfsBrutes, { objectif_distance_m = null, aujourdhui = new Date(), vdot_secours = null } = {}) {
  const { valides, rejetees } = validerPerformances(perfsBrutes ?? []);
  const maintenant = aujourdhui instanceof Date ? aujourdhui.getTime() : new Date(aujourdhui).getTime();
  const avertissements = [];

  for (const r of rejetees) {
    avertissements.push(
      `⚠️ **Performance ignorée** (${r.distance_m ?? "?"} m / ${r.temps ?? "?"}) : ${r.motifs.join(" ; ")}. ` +
        `Le moteur **ne devine pas** une donnée manquante — corrige l'entrée dans \`running.performances[]\`.`
    );
  }

  // --- Rôle et poids de chaque perf ---
  const analysees = valides.map((p) => {
    const r = roleDe(p);
    const pd = poidsDistance(p.distance_m, objectif_distance_m);
    const pf = poidsFraicheur(p.date_ms, maintenant);
    const pe = p.effort === "maximal" ? 1 : p.effort === "inconnu" ? FACTEUR_EFFORT_INCONNU : 0;
    const poids = r.estime ? +(pd * pf * pe).toFixed(3) : 0;
    return {
      ...p,
      role: r.role,
      estime: r.estime,
      role_pourquoi: r.pourquoi,
      poids,
      poids_detail: {
        distance: +pd.toFixed(3),
        fraicheur: +pf.toFixed(3),
        effort: +pe.toFixed(3),
        age_jours: p.date_ms != null ? Math.round((maintenant - p.date_ms) / JOUR_MS) : null,
      },
    };
  });

  for (const p of analysees) {
    if (p.date_precision === "absente" || p.date_precision === "illisible") {
      avertissements.push(
        `⚠️ **${p.distance_m / 1000} km en ${p.temps} : ${p.date_libelle}.** L'ancienneté d'une perf **pèse** dans la ` +
          `réconciliation (une perf récente vaut mieux qu'une ancienne). Sans date, le moteur applique une **décote ` +
          `forfaitaire** — il ne suppose pas qu'elle est récente. **Date-la.**`
      );
    } else if (p.date_precision !== "jour") {
      avertissements.push(
        `ℹ️ **${p.distance_m / 1000} km en ${p.temps} : ${p.date_libelle}.** Date **imprécise** → ancrée au milieu de la ` +
          `période. Le poids de fraîcheur qui en découle est **approximatif**.`
      );
    }
  }

  // --- Le VDOT retenu : moyenne pondérée des seules perfs qui MESURENT ---
  const estimantes = analysees.filter((p) => p.estime && p.poids > 0);
  const bornes = analysees.filter((p) => p.role === "borne_inferieure");
  const volumes = analysees.filter((p) => p.role === "capacite_volume");

  let vdot = null;
  let retenue = null;
  let source_vdot = null;

  if (estimantes.length) {
    const total = estimantes.reduce((a, p) => a + p.poids, 0);
    vdot = estimantes.reduce((a, p) => a + p.vdot_implicite * p.poids, 0) / total;
    retenue = [...estimantes].sort((a, b) => b.poids - a.poids)[0];
    source_vdot = estimantes.length === 1 ? "mesure_unique" : "moyenne_ponderee";
  } else if (bornes.length) {
    // 🔴 Aucune mesure — QUE des efforts non maximaux. On prend la MEILLEURE borne inférieure et on
    // le dit très fort : ce VDOT est un **plancher**, le vrai est plus haut, et tout le plan
    // est donc calé **trop lentement**. Le test chrono du plan est là pour ça.
    retenue = [...bornes].sort((a, b) => b.vdot_implicite - a.vdot_implicite)[0];
    vdot = retenue.vdot_implicite;
    source_vdot = "borne_inferieure";
    avertissements.push(
      `🔴 **Aucune de tes performances n'est une MESURE** — la seule exploitable a été courue à effort **NON maximal**. ` +
        `Le moteur cale donc tout le plan sur une **BORNE INFÉRIEURE** (VDOT **≥ ${retenue.vdot_implicite}**), c'est-à-dire ` +
        `**trop lentement**, faute de mieux. ⚠️ **Ce n'est pas de la prudence, c'est une ignorance assumée.** ` +
        `→ **Le test chrono de la semaine 3 n'est pas optionnel** : c'est lui qui donnera au moteur sa première vraie mesure.`
    );
  } else if (volumes.length) {
    source_vdot = "aucune";
    avertissements.push(
      `🔴 **Tu n'as déclaré que des sorties d'ENTRAÎNEMENT.** Une sortie d'entraînement **n'est pas une performance** : ` +
        `elle prouve que tu as **couvert** la distance, pas à quelle **vitesse** tu peux la courir. En tirer un VDOT ` +
        `donnerait un chiffre **faux, et faux vers le bas** (ton allure d'endurance n'est pas ton allure de course). ` +
        `**Le moteur refuse de le faire.** → Il repart d'un VDOT supposé d'après ton niveau, et **le test chrono est ` +
        `indispensable** (veille/12 §8 renvoie au test ; l'équivalence est en veille/03 §2).`
    );
  } else {
    source_vdot = "aucune";
  }

  if (vdot == null && vdot_secours != null) {
    vdot = vdot_secours;
    source_vdot = "suppose_par_niveau";
  }

  // --- Le PROFIL — courses et tests seulement (pas les sorties d'entraînement) ---
  const perfsVitesse = analysees.filter((p) => p.type !== "entrainement");
  const pairesCalculees = paires(perfsVitesse);
  const profil = detecterProfil(pairesCalculees);

  // --- La TRAJECTOIRE (ou le silence) ---
  const traj = trajectoire(analysees.filter((p) => p.estime));

  // --- La DIVERGENCE, dite en toutes lettres ---
  const vdots = perfsVitesse.map((p) => p.vdot_implicite);
  const divergence =
    vdots.length >= 2
      ? {
          min: Math.min(...vdots),
          max: Math.max(...vdots),
          etendue: +(Math.max(...vdots) - Math.min(...vdots)).toFixed(1),
          pourquoi:
            "Chacune de tes performances implique un **VDOT différent**. **C'est normal, et ce n'est pas du bruit : " +
            "c'est le signal.** Le moteur **ne prend pas la meilleure** (ce serait te promettre un chrono que tu ne " +
            "tiendras pas) et **ne fait pas la moyenne** (ce serait effacer l'information). Il **pondère** — la distance " +
            "la plus proche de ton objectif pèse le plus (veille/03 §2, veille/12 §4) — et il **explique l'écart**.",
        }
      : null;

  // --- La preuve de capacité de VOLUME (les sorties d'entraînement, qui ne valent pas zéro) ---
  const capacite_volume = volumes.length
    ? {
        plus_longue_km: +(Math.max(...volumes.map((p) => p.distance_m)) / 1000).toFixed(1),
        perfs: volumes.map((p) => ({ distance_m: p.distance_m, temps: p.temps, date: p.date_libelle, allure_min_par_km: p.allure_min_par_km })),
        pourquoi:
          "Tes sorties d'**entraînement** ne disent **rien** de ta vitesse — mais elles disent quelque chose de **précieux** : " +
          "**tu as déjà couvert cette distance**. C'est une preuve de **base longue**, et le moteur la garde à ce titre " +
          "(elle n'entre **pas** dans le calcul du VDOT).",
      }
    : null;

  return {
    performances: analysees,
    rejetees,
    vdot: vdot != null ? +vdot.toFixed(1) : null,
    source_vdot,
    retenue: retenue
      ? { distance_m: retenue.distance_m, temps: retenue.temps, date: retenue.date_libelle, vdot: retenue.vdot_implicite, poids: retenue.poids, role: retenue.role }
      : null,
    // La distance qui a servi de référence — c'est elle qui pilote la CORRECTION MARATHON
    // conservatrice (`allureMarathonConservatrice`) : une référence longue (semi+) l'atténue,
    // parce que le VDOT y capte mieux la décroissance d'allure (veille/03 §2).
    distance_reference_m: retenue?.distance_m ?? null,
    divergence,
    profil,
    trajectoire: traj,
    capacite_volume,
    avertissements,
    seuil_divergence_pct: SEUIL_DIVERGENCE_PCT,
    demi_vie_jours: DEMI_VIE_JOURS,
  };
}
