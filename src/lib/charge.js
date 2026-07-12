// CHARGE — « On additionne la CHARGE. On n'additionne pas la FATIGUE. »
//
// Décision : ADR 0006 (specs/adr/0006-charge-unifiee-force-endurance.md), validée par le propriétaire
// le 2026-07-11. Ce module en est l'implémentation. Il est PUR (aucune I/O).
//
// ── Ce qui a changé, et pourquoi ────────────────────────────────────────────────────────────
// 1. L'unité COMMUNE force ↔ endurance est le **sRPE × durée** de Foster (2001) :
//        load_au = rpe_seance (0–10) × duree_min          [muscu ET course, MÊME formule]
//    C'est la seule grandeur définie à l'identique pour un squat et pour un 10 km, et la seule
//    à avoir été comparée entre les deux filières (Sweet, Foster, McGuigan & Brice 2004, JSCR
//    18(4):796-802 — « generally comparable to aerobic training »). La conversion force→endurance
//    n'est PAS faite par une constante d'ingénieur : elle est faite par la PERCEPTION de l'athlète.
//    → La constante `k` de l'ancienne proposition (data-model §9.2, en réalité la convention
//      Joe Friel 2016) est SUPPRIMÉE. Aucun code ne la porte plus.
//
// 2. Les filières `force` et `endurance` restent **séparées et auditables**. On expose leurs
//    sous-totaux ET leur somme — additionner deux DOSES est légitime (comptabilité d'exposition,
//    Impellizzeri et al. 2023, Sports Med 53:1667-1679).
//
// 3. ⚠️ AUCUNE cible de « forme ». Aucun chiffre rond. Le modèle fitness-fatigue est
//    statistiquement réfuté : Marchal, Benazieb, Weldegebriel, Méline & Imbach 2025 (Scientific
//    Reports 15:3706, DOI 10.1038/s41598-025-88153-7) montrent en validation croisée que la
//    composante « fatigue » **n'améliore pas la prédiction** (ΔRMSE = 0,001 ; d = 0,022 ;
//    **p = 0,57**), et que fitness et fatigue sont mathématiquement indiscernables (Hellard et al.
//    2006 : paramètres corrélés à 0,91–0,99, « not reliable »). Les moyennes 42 j / 7 j ci-dessous
//    sont donc **conservées comme courbes DESCRIPTIVES, jamais comme cibles** — et elles restent
//    ce qu'elles ont toujours été : **cardiovasculaires**, pas musculaires (honnêteté d'intervals.icu).
//
// 4. Le volume-load pondéré RIR est **RÉTROGRADÉ** : il n'est plus une charge, il devient un
//    **estimateur du RPE manquant** (`estimerRPE`). Verdict académique sur le volume-load :
//    « theoretically incorrect » (Imbach, Perrey, Brioche & Candau 2025, Sports 13(1):13).
//    Toute valeur qui en sort est marquée **estimée**, jamais mesurée.
//
// ── ⚖️ NOS JAUGES PORTENT NOS NOMS (veille/19 §3.5) ─────────────────────────────────────────
// « TSS », « CTL », « ATL », « TSB », « NP » et « IF » sont des **marques déposées de
// Peaksware, LLC (TrainingPeaks)**. Les **citer** comme référence externe reste licite ; en faire
// **le nom de nos propres grandeurs** est une exposition juridique réelle si le produit sort.
// Le moteur nomme donc ses grandeurs lui-même — et il les nomme pour ce qu'elles SONT :
//
//   ┌─ notre nom ────────────────────┬─ ce que c'est LITTÉRALEMENT ──────────────┬─ ≈ chez TrainingPeaks ─┐
//   │ charge d'endurance (CE)        │ durée × intensité relative²               │ TSS™                   │
//   │ intensité relative             │ allure de la zone ÷ allure au seuil       │ IF™                    │
//   │ charge_42j                     │ moyenne exponentielle de la CE sur ~42 j  │ CTL™                   │
//   │ charge_7j                      │ moyenne exponentielle de la CE sur ~7 j   │ ATL™                   │
//   │ ecart_42j_7j                   │ charge_42j − charge_7j. Une SOUSTRACTION. │ TSB™                   │
//   └────────────────────────────────┴───────────────────────────────────────────┴────────────────────────┘
//
// ⚠️ Le nommage de la dernière ligne est DÉLIBÉRÉMENT ingrat. L'appeler « forme », « fraîcheur »
// ou « readiness » recréerait par la bande le **score de forme** que l'ADR 0006 a supprimé — sur
// un modèle dont la composante fatigue ne prédit rien. On l'appelle donc par ce qu'elle est :
// **l'écart entre deux moyennes mobiles**. On additionne la charge ; on n'additionne pas la fatigue.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 2026-07-11 — CETTE CHARGE EST AVEUGLE À LA DESCENTE. C'EST STRUCTUREL, ET C'EST AFFICHÉ.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// La veille trail (veille/20 §1.1) établit, via **Minetti 2002**, que **courir en descente coûte
// DEUX FOIS MOINS cher qu'à plat** (**1,73** J·kg⁻¹·m⁻¹ à −20 % contre **3,40** à plat) — **et que
// c'est pourtant elle qui casse.**
//
//   > **Toute métrique de charge fondée sur l'énergie, l'allure ou la FC SOUS-ESTIME
//   > structurellement la descente.** Notre sRPE × durée est moins mauvais (le RPE intègre en partie
//   > la douleur), mais **il n'est pas conçu pour ça non plus.**
//
// ⚠️ **Ce n'est PAS un bug — c'est une PROPRIÉTÉ du modèle.** La tentation était de rustiner : un
// coefficient de descente, un « facteur D− ». Ce serait **inventer une constante** — exactement le
// `k` que l'ADR 0006 a supprimé, et exactement ce que la veille déclare **introuvable** (§4.4 : il
// n'y aura probablement **jamais** de conversion du D− en unités énergétiques).
//
// **Le moteur ne rustine pas en douce. Il AFFICHE** (`AVEUGLEMENT_DESCENTE`, `chargesHebdo().limite_descente`)
// **et il POINTE les semaines concernées** (`descente_non_facturee`).

import { AVEUGLEMENT_DESCENTE } from "./denivele.js";
import { D_MOINS_NOTABLE_M } from "./placement.js";

export { AVEUGLEMENT_DESCENTE };

// ─────────────────────────────────────────────────────────── sRPE (Foster) — l'unité commune

/** Échelle de Foster (CR-10) : le RPE de séance est recueilli ~30 min APRÈS la séance. */
export const ECHELLE_FOSTER = { min: 0, max: 10, nom: "Foster CR-10 (RPE de séance, ~30 min après)" };

/** Nombre minimal de séances RPE-saisies + RIR-loggées pour calibrer l'estimateur `g`. */
const N_MIN_CALIBRATION = 3;

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 🔒 LE VERROU D'IDENTITÉ — « un paramètre calibré sur un humain ne sert JAMAIS à un autre »
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Le facteur `a` de `calibrerEstimateurRPE` (le **β** de la charge unifiée) est ajusté par moindres
// carrés **sur les séances d'UNE personne**. Il encode **sa** façon de traduire des RIR en RPE —
// sa tolérance à l'inconfort, son échelle intérieure. **Il ne transfère à personne.**
//
// 🔴 **Ce qu'on a trouvé le 2026-07-11 (batterie adverse).** Rien ne l'interdisait. Le journal porte
// pourtant un champ `persona`, et **aucun consommateur ne le lisait** :
//
//     node src/cli.js recaler data/personas/<personne-b>.json data/exemples/journal-<personne-a>-exemple.json
//     ✔ out/persona-<personne-b>-recale.json
//       Volume de départ (km/sem) : 30 -> 14
//
// Le moteur a **réécrit le persona de la personne B avec les données d'entraînement du propriétaire**, sans un
// mot, et a affiché une coche verte. Sur un persona muscu, le même chemin écrit les **charges de
// travail** d'un autre humain dans `charges_reference` — c'est-à-dire qu'il prescrit à un débutant
// le développé couché à 90 kg de quelqu'un d'autre. **C'est le pire défaut du moteur.**
//
// **Il n'est plus rendu improbable : il est rendu IMPOSSIBLE.** L'identité voyage désormais AVEC la
// calibration (`proprietaire`), et toute tentative de l'appliquer à un autre **lève une erreur** —
// pas un avertissement qu'on peut ignorer. Un moteur qui refuse est infiniment meilleur qu'un
// moteur qui contamine.

/**
 * Le journal appartient-il bien à cette personne ? **Refuse** dès que les deux identités sont
 * connues ET différentes. Un journal **non attribué** (`persona` absent) n'est pas refusé — il
 * est **signalé** : on ne peut pas prouver l'appartenance, donc on ne peut pas prouver la faute,
 * mais on ne fait pas semblant de savoir.
 */
export function verifierProprietaireJournal(persona, journal) {
  const idPersona = persona?.id ?? persona?.nom ?? null;
  const idJournal = journal?.persona ?? null;

  if (idPersona && idJournal && idPersona !== idJournal) {
    throw new Error(
      `🔒 REFUS — journal d'une AUTRE personne. Le persona est « ${idPersona} », le journal appartient à ` +
        `« ${idJournal} » (\`journal.persona\`). Le moteur **refuse** de croiser les deux, et ce refus n'est pas ` +
        `négociable : le facteur de calibration du RPE (le β de la charge unifiée) est ajusté sur la perception ` +
        `d'UN individu — il n'a aucun sens pour un autre. Et un recalage écrirait les **charges de travail réelles** ` +
        `d'« ${idJournal} » dans le persona d'« ${idPersona} » : prescrire à quelqu'un le développé couché d'un autre ` +
        `humain n'est pas une imprécision, c'est un danger. Vérifie tes fichiers.`
    );
  }

  return {
    ok: true,
    proprietaire: idJournal,
    attribue: idJournal != null,
    avertissement:
      idJournal == null
        ? `⚠️ **Journal non attribué** : il ne porte pas de champ \`persona\`, le moteur ne peut donc **pas vérifier** ` +
          `qu'il est bien celui d'« ${idPersona ?? "cet utilisateur"} ». Les valeurs calibrées (facteur de RPE, charges ` +
          `de référence) sont **personnelles et non transférables** — un journal mal attribué les contaminerait en ` +
          `silence. Ajoute \`"persona": "${idPersona ?? "<id>"}"\` à ton journal pour que le moteur puisse le garantir.`
        : null,
  };
}

/**
 * Charge d'une séance en unités arbitraires (AU) — la formule de Foster, à l'identique pour
 * la muscu et pour la course. Renvoie null si l'une des deux données manque : on ne fabrique
 * rien (ni RPE par défaut, ni durée par défaut).
 */
export function chargeSRPE(rpe, duree_min) {
  if (rpe == null || duree_min == null) return null;
  const r = Number(rpe);
  const d = Number(duree_min);
  if (!Number.isFinite(r) || !Number.isFinite(d) || d <= 0) return null;
  if (r < ECHELLE_FOSTER.min || r > ECHELLE_FOSTER.max) return null;
  return Math.round(r * d);
}

// ─────────────────────────────── `g` : l'ESTIMATEUR du RPE manquant (pas une charge)

/**
 * RPE de séance BRUT déduit des séries (ADR 0006 §Couche 1 : `g(volume-load, RIR, nb séries dures)`).
 *
 * Ancrage : l'échelle RIR ↔ RPE de Zourdos (RPE_série = 10 − RIR) est la convention standard de
 * la musculation autorégulée, déjà utilisée par le moteur (veille/02 §3). On agrège les séries
 * en pondérant par le **volume-load** de l'exercice (charge × reps) : une série dure de squat
 * pèse plus dans le ressenti global qu'une série dure d'élévations latérales.
 *
 * ⚠️ Ce n'est PAS une mesure. Trois limites, dites à voix haute :
 *   • le sRPE de séance SOUS-ESTIME l'intensité par rapport aux RPE série-par-série (Sweet 2004) —
 *     le brut sort donc trop HAUT, et c'est exactement ce que le facteur `a` corrige ;
 *   • le RPE dépend aussi du **temps de repos** à volume-load identique (Ratamess et al. 2012,
 *     PubMed 23033762 : RPE 6,5 à 1 min de repos vs 5,0 à 3 min) — la densité pollue le signal ;
 *   • le volume-load n'a **aucune unité physiologique** (Imbach 2025).
 * D'où : on ne s'en sert QUE pour imputer une donnée manquante, et on le déclare.
 */
export function rpeBrutDepuisSeries(exercices) {
  let poids = 0;
  let cumul = 0;
  let seriesDures = 0;
  for (const e of exercices ?? []) {
    if (e?.rir == null || !Array.isArray(e.reps) || !e.reps.length) continue;
    const rir = Number(e.rir);
    if (!Number.isFinite(rir)) continue;
    const reps = e.reps.reduce((a, b) => a + Number(b || 0), 0);
    // volume-load de l'exercice ; au poids du corps (charge 0) on retombe sur le nombre de reps
    // pour ne pas annuler la pondération.
    const vl = Math.max((Number(e.charge_kg) || 0) * reps, reps);
    const rpeSerie = Math.min(ECHELLE_FOSTER.max, Math.max(ECHELLE_FOSTER.min, 10 - rir));
    cumul += rpeSerie * vl;
    poids += vl;
    seriesDures += e.reps.length;
  }
  if (poids === 0) return null;
  return { rpe_brut: +(cumul / poids).toFixed(2), series: seriesDures };
}

/**
 * Calibre `g` sur les données de l'utilisateur — UN seul paramètre (`a`), ajusté par moindres
 * carrés sur les séances où il a À LA FOIS saisi son RPE et loggué ses RIR :
 *
 *     rpe_saisi ≈ a × rpe_brut          →   a = Σ(rpe_saisi · rpe_brut) / Σ(rpe_brut²)
 *
 * Un paramètre, pas cinq : Marchal 2025 montre qu'on n'identifie pas un modèle à 4–5 paramètres,
 * même avec beaucoup de données. On reste falsifiable : `n`, `a` et l'erreur absolue moyenne
 * sont renvoyés et AFFICHÉS. Sous N_MIN_CALIBRATION séances → `calibre: false`, `a = 1`, et la
 * sortie porte le badge « non calibré ».
 */
export function calibrerEstimateurRPE(seances, { proprietaire = null } = {}) {
  let num = 0;
  let den = 0;
  const points = [];
  for (const s of seances ?? []) {
    if (s?.rpe_seance == null) continue;
    const brut = rpeBrutDepuisSeries(s.exercices);
    if (!brut) continue;
    points.push({ saisi: Number(s.rpe_seance), brut: brut.rpe_brut });
    num += Number(s.rpe_seance) * brut.rpe_brut;
    den += brut.rpe_brut ** 2;
  }
  if (points.length < N_MIN_CALIBRATION || den === 0) {
    return {
      calibre: false,
      a: 1,
      // 🔒 Une calibration NON faite n'appartient à personne : `a = 1` est un neutre, pas un réglage.
      // Elle est donc librement applicable — il n'y a rien à contaminer.
      proprietaire: null,
      n: points.length,
      n_min: N_MIN_CALIBRATION,
      pourquoi:
        `Estimateur du RPE **NON calibré** (${points.length} séance(s) avec RPE saisi ET RIR loggués, ` +
        `il en faut ${N_MIN_CALIBRATION}) : le RPE déduit vaut « 10 − RIR » brut, ce qui SURESTIME le RPE de ` +
        `séance (Sweet 2004). À prendre avec des pincettes — et à corriger en saisissant ton RPE.`,
    };
  }
  const a = num / den;
  const erreur = points.reduce((acc, p) => acc + Math.abs(p.saisi - a * p.brut), 0) / points.length;
  return {
    calibre: true,
    a: +a.toFixed(3),
    // 🔒 LE VERROU. Le facteur porte le nom de celui sur qui il a été ajusté. `estimerRPE` refuse
    // de l'appliquer à quelqu'un d'autre. C'est ce qui rend la contamination IMPOSSIBLE plutôt
    // qu'improbable.
    proprietaire,
    n: points.length,
    n_min: N_MIN_CALIBRATION,
    erreur_moy_abs: +erreur.toFixed(2),
    pourquoi:
      `Estimateur du RPE **calibré sur ${proprietaire ? `les ${points.length} séances de « ${proprietaire} »` : `TES ${points.length} séances`}** ` +
      `où le RPE était saisi et les RIR loggués (facteur a = ${+a.toFixed(3)} appliqué à « 10 − RIR » pondéré par le ` +
      `volume-load ; erreur absolue moyenne ${+erreur.toFixed(2)} point de RPE). Reste une **imputation**, pas une mesure. ` +
      `🔒 **Ce facteur est PERSONNEL** : il encode une perception individuelle de l'effort et **ne transfère à personne d'autre** ` +
      `— le moteur refuse de l'appliquer à un autre utilisateur.`,
  };
}

/**
 * RPE estimé d'une séance muscu sans RPE saisi. null si même les RIR manquent (on n'invente pas).
 *
 * 🔒 `pour` : à QUI ce RPE est-il estimé. Si la calibration a été ajustée sur quelqu'un d'autre,
 * la fonction **lève** — elle ne « dégrade » pas en silence vers `a = 1`, parce qu'un calcul
 * silencieusement dégradé est exactement le genre de chose qu'on ne remarque jamais.
 */
export function estimerRPE(exercices, calibration = { calibre: false, a: 1 }, { pour = null } = {}) {
  const proprio = calibration?.proprietaire ?? null;
  if (calibration?.calibre && proprio && pour && proprio !== pour) {
    throw new Error(
      `🔒 REFUS — facteur de RPE calibré sur « ${proprio} », appliqué à « ${pour} ». Le β de la charge unifiée est ajusté ` +
        `sur la **perception d'un individu** (sa traduction personnelle des RIR en RPE) : il **ne transfère à personne**. ` +
        `Le moteur ne l'emprunte pas — il préfère ne pas estimer plutôt qu'estimer avec l'échelle intérieure de quelqu'un d'autre.`
    );
  }
  const brut = rpeBrutDepuisSeries(exercices);
  if (!brut) return null;
  const rpe = Math.min(ECHELLE_FOSTER.max, Math.max(ECHELLE_FOSTER.min, (calibration.a ?? 1) * brut.rpe_brut));
  return { rpe: +rpe.toFixed(1), rpe_brut: brut.rpe_brut, series_dures: brut.series, calibre: calibration.calibre === true, calibre_sur: proprio };
}

// ────────────────────────────────────────────── Charge d'une séance, filière par filière

/**
 * Charge sRPE d'une séance de MUSCU (filière `force`).
 * `dureeDefaut` : durée de séance déclarée dans le persona — c'est une donnée DÉCLARÉE, pas
 * mesurée : quand elle sert, la sortie le dit (`duree_source: "persona"`).
 */
export function chargeSeanceMuscu(seance, { calibration = { calibre: false, a: 1 }, dureeDefaut = null, pour = null } = {}) {
  const rpeSaisi = seance?.rpe_seance ?? null;
  const estimation = rpeSaisi == null ? estimerRPE(seance?.exercices, calibration, { pour }) : null;
  const rpe = rpeSaisi != null ? Number(rpeSaisi) : estimation?.rpe ?? null;

  const dureeSaisie = seance?.duree_min ?? null;
  const duree = dureeSaisie ?? dureeDefaut ?? null;

  const manque = [];
  if (rpe == null) manque.push("rpe_seance (et aucun RIR pour l'imputer)");
  if (duree == null) manque.push("duree_min");

  return {
    date: seance?.date ?? null,
    filiere: "force",
    seance: seance?.seance ?? null,
    rpe,
    rpe_source: rpeSaisi != null ? "saisi" : rpe != null ? "estime" : "indisponible",
    estimation, // null si le RPE était saisi
    duree_min: duree,
    duree_source: dureeSaisie != null ? "saisie" : duree != null ? "persona" : "indisponible",
    au: chargeSRPE(rpe, duree),
    estimee: rpeSaisi == null || dureeSaisie == null,
    manque,
  };
}

/** Charge sRPE d'une sortie de COURSE (filière `endurance`). Même formule, même unité. */
export function chargeSortie(sortie) {
  const rpeSaisi = sortie?.rpe_seance ?? null;
  const duree = sortie?.duree_min ?? null;
  const manque = [];
  if (rpeSaisi == null) manque.push("rpe_seance");
  if (duree == null) manque.push("duree_min");
  return {
    date: sortie?.date ?? null,
    filiere: "endurance",
    seance: sortie?.type ? `Sortie ${sortie.type}` : "Sortie",
    rpe: rpeSaisi != null ? Number(rpeSaisi) : null,
    // ⚠️ Pas d'imputation du RPE en course : le moteur pourrait le déduire de l'allure/zone, mais
    // ce serait recréer un « k » (une constante zone→RPE) — exactement ce que l'ADR supprime.
    // Sans RPE saisi, la sortie ne porte pas de charge sRPE, et on le DIT.
    rpe_source: rpeSaisi != null ? "saisi" : "indisponible",
    estimation: null,
    duree_min: duree,
    duree_source: duree != null ? "saisie" : "indisponible",
    au: chargeSRPE(rpeSaisi, duree),
    estimee: false,
    manque,
  };
}

// ───────────────────────────────────────────────── Comptabilité hebdomadaire (la « dose »)

const JOUR_MS = 24 * 3600 * 1000;

/**
 * Le lundi de la semaine d'une date (« AAAA-MM-JJ » → « AAAA-MM-JJ »).
 *
 * ⚠️ EXPORTÉE depuis le 2026-07-12 : c'est elle qui découpe `chargesHebdo().semaines`, et l'app doit
 * pouvoir retrouver LA semaine en cours dans cette liste. Recoder « le lundi d'une date » côté écran,
 * ce serait deux définitions de la semaine — et un jour, deux semaines différentes (philosophy §11).
 */
export function lundiDe(date) {
  const d = new Date(date + "T00:00:00Z");
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * JOUR_MS).toISOString().slice(0, 10);
}

/**
 * Charge sRPE par SÉANCE et par SEMAINE, filières séparées ET sommées.
 *
 * Ce qu'on additionne : des **doses** (« qu'est-ce que j'ai encaissé cette semaine »). C'est aussi
 * légitime qu'additionner des kilomètres (Impellizzeri 2023 : exposition → dose → réponse).
 * Ce qu'on n'additionne PAS : des **fatigues** — voir `src/lib/placement.js` pour le signal
 * neuromusculaire local, qui reste SÉPARÉ et n'est jamais fusionné dans un scalaire.
 *
 * `part_estimee_pct` : la proportion de la charge de la semaine qui repose sur une valeur
 * IMPUTÉE. Le produit assume son incertitude (philosophy §4) — cette part est affichée.
 */
export function chargesHebdo(journal, { dureeDefautMuscu = null, pour = null } = {}) {
  const seancesMuscu = journal?.seances_muscu ?? [];
  const sorties = journal?.sorties_course ?? [];
  // 🔒 La calibration naît AVEC l'identité de son propriétaire — celle que porte le journal.
  // `estimerRPE` refusera ensuite de l'appliquer à quelqu'un d'autre (verrou d'identité).
  const calibration = calibrerEstimateurRPE(seancesMuscu, { proprietaire: journal?.persona ?? pour ?? null });

  const detail = [
    ...seancesMuscu.map((s) => chargeSeanceMuscu(s, { calibration, dureeDefaut: dureeDefautMuscu, pour })),
    ...sorties.map((s) => chargeSortie(s)),
  ]
    .filter((c) => c.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const parSemaine = new Map();
  for (const c of detail) {
    const lundi = lundiDe(c.date);
    if (!parSemaine.has(lundi)) {
      parSemaine.set(lundi, { lundi, force_au: 0, endurance_au: 0, total_au: 0, au_estimee: 0, seances: 0, sans_charge: 0 });
    }
    const s = parSemaine.get(lundi);
    s.seances++;
    if (c.au == null) {
      s.sans_charge++;
      continue;
    }
    if (c.filiere === "force") s.force_au += c.au;
    else s.endurance_au += c.au;
    s.total_au += c.au;
    if (c.estimee) s.au_estimee += c.au;
  }

  const semaines = [...parSemaine.values()]
    .sort((a, b) => a.lundi.localeCompare(b.lundi))
    .map((s) => ({ ...s, part_estimee_pct: s.total_au ? Math.round((s.au_estimee / s.total_au) * 100) : 0 }));

  const sansCharge = detail.filter((c) => c.au == null);

  // ⛰️🔴 LES SORTIES QUE CETTE CHARGE SOUS-FACTURE. On ne corrige rien (il faudrait une constante
  // inventée) — on **POINTE**. Une limite affichée vaut mieux qu'une rustine silencieuse.
  const descente_non_facturee = sorties
    .filter((s) => {
      const dm = Number(s?.denivele_negatif_m);
      const dp = Number(s?.denivele_m);
      const valeur = Number.isFinite(dm) && dm > 0 ? dm : dp;
      return Number.isFinite(valeur) && valeur >= D_MOINS_NOTABLE_M;
    })
    .map((s) => {
      const dm = Number(s?.denivele_negatif_m);
      const mesure = Number.isFinite(dm) && dm > 0;
      return {
        date: s.date,
        km: s.km ?? null,
        denivele_m: s.denivele_m ?? null,
        denivele_negatif_m: mesure ? Math.round(dm) : null,
        d_moins_mesure: mesure,
        au: chargeSRPE(s?.rpe_seance ?? null, s?.duree_min ?? null),
        message:
          `⛰️ **${s.date} — ${s.km ?? "?"} km, ${mesure ? `${Math.round(dm)} m D−` : `${s.denivele_m} m D+ (D− non mesuré)`}.** ` +
          `**La charge affichée pour cette sortie est TROP BASSE, et le moteur le sait.** Courir en descente coûte ` +
          `**deux fois moins d'énergie** qu'à plat (Minetti 2002) **tout en étant ce qui abîme** : notre charge ` +
          `(sRPE × durée) **ne la voit pas**. ⚠️ Ce n'est pas un bug à corriger — il faudrait une **constante inventée**, ` +
          `et il n'en existe aucune. **Fie-toi à tes jambes, pas au chiffre.**`,
      };
    });

  return {
    unite: "AU (sRPE × durée, Foster 2001) — même unité pour la muscu et pour la course",
    calibration,
    detail,
    semaines,
    seances_sans_charge: sansCharge,
    // 🔴 LA LIMITE STRUCTURELLE, portée par la sortie elle-même. Elle ne se lit pas dans un doc :
    // elle voyage avec la donnée qu'elle qualifie.
    limite_descente: AVEUGLEMENT_DESCENTE,
    descente_non_facturee,
    pourquoi:
      "Charge = **ton RPE × la durée**. C'est **ta perception**, pas une mesure de laboratoire — mais c'est la " +
      "seule grandeur définie à l'identique pour un squat et pour un 10 km (Foster 2001 ; Sweet 2004 : " +
      "« generally comparable to aerobic training »). Les filières **force** et **endurance** sont gardées " +
      "SÉPARÉES et auditables ; leur somme est une **dose** (ce que tu as encaissé), pas une **fatigue** " +
      "(ce qu'il te reste) — ces deux-là ne s'additionnent pas de la même façon (ADR 0006).",
    hypothese_centrale:
      "🔴 **Hypothèse assumée, non démontrée** : que « RPE 8 » veuille dire la même chose en salle et en course. " +
      "Sweet 2004 l'appuie partiellement, et la nuance aussi. C'est l'hypothèse centrale du produit — on l'affiche.",
  };
}

// ──────────────── Endurance : charge d'endurance (CE) + moyennes 42 j / 7 j (DESCRIPTIF)
//
// ⚖️ Nos noms, pas ceux de Peaksware (voir l'en-tête de ce fichier).

/** Unité de la filière endurance. Notre nom, notre définition — et l'équivalence, citée. */
export const UNITE_CE = {
  code: "CE",
  nom: "charge d'endurance",
  definition: "durée (h) × intensité relative² × 100",
  equivalence:
    "Fonctionnellement équivalente au **TSS™** de TrainingPeaks (marque déposée de Peaksware, LLC) — " +
    "que l'on **cite** ici comme référence externe, sans l'employer comme nom de notre grandeur (veille/19 §3.5).",
};

// Intensité relative par zone (allure de la zone ÷ allure au seuil) — proxy conservateur sans
// capteur de puissance (veille/03 §3 & §6). 🟡 CONVENTION d'outil, pas un résultat scientifique.
// (C'est ce que TrainingPeaks appelle « IF™ » ; nous l'appelons par sa définition.)
// @chiffre-derive Ces facteurs (0,70 · 0,85 · 0,91 · 1,00 · 1,05) ne figurent PAS dans veille/03 §3 :
// ce sont des **points médians** des zones Daniels rapportés à l'allure au seuil — une CONVENTION
// d'outil, assumée comme telle ci-dessus. La veille fonde les zones, pas ce barème d'intensité.
const INTENSITE_PAR_ZONE = { E: 0.7, M: 0.85, T: 0.91, I: 1.0, R: 1.05 };

/** Charge d'endurance (CE) d'une séance de COURSE : liste de segments { zone, duree_min }. */
export function chargeEndurance(segments) {
  return segments.reduce((ce, seg) => {
    const intensite = INTENSITE_PAR_ZONE[seg.zone] ?? 0.7;
    return ce + (seg.duree_min / 60) * intensite * intensite * 100;
  }, 0);
}

/**
 * Moyennes exponentielles de la charge d'endurance : **charge_42j** (τ ≈ 42 j), **charge_7j**
 * (τ ≈ 7 j), et leur **écart** (`ecart_42j_7j = charge_42j − charge_7j`).
 *
 * ⚠️ QUATRE AVERTISSEMENTS, portés par le code parce qu'ils portent sur le code :
 *  1. **C'est une courbe CARDIOVASCULAIRE.** Aucune charge de musculation n'y est injectée : le
 *     faire supposerait une constante de conversion inventée (l'ancienne `k`, la convention Friel
 *     2016). La muscu est comptée AILLEURS, dans la charge sRPE — filière `force`, séparée.
 *  2. **Ce n'est PAS une cible.** Le moteur n'affiche aucun objectif chiffré, aucun chiffre rond.
 *     La composante « fatigue » du modèle fitness-fatigue n'améliore pas la prédiction (p = 0,57,
 *     Marchal 2025) : elle est descriptive, point.
 *  3. `ecart_42j_7j` **n'est pas un score de forme** — c'est une **soustraction entre deux moyennes
 *     mobiles**. Son nom ingrat est volontaire : lui en donner un joli, ce serait réinventer par la
 *     bande la jauge que l'ADR 0006 a supprimée.
 *  4. Une EMA à τ = 7 j ne peut pas représenter à la fois une fatigue neuromusculaire de 48 h et
 *     une fatigue centrale qui se récupère en minutes. Le signal neuromusculaire local est donc
 *     tenu SÉPARÉ (`src/lib/placement.js`).
 */
export function simulerCharge(ceParJour, charge42jDepart = 30) {
  let charge42j = charge42jDepart;
  let charge7j = charge42jDepart;
  const historique = [];
  for (const ce of ceParJour) {
    charge42j += (ce - charge42j) / 42;
    charge7j += (ce - charge7j) / 7;
    historique.push({ ce, charge_42j: charge42j, charge_7j: charge7j, ecart_42j_7j: charge42j - charge7j });
  }
  return historique;
}

/**
 * Écart 42 j − 7 j projeté le matin de la course = état de la veille au soir. **Descriptif.**
 * Ce n'est pas une prédiction de forme, et il n'y a **aucune valeur « à viser »**.
 */
export function ecartJourCourse(historique) {
  const veille = historique[historique.length - 2];
  return veille ? veille.ecart_42j_7j : null;
}
