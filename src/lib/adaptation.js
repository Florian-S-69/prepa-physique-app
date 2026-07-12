// Boucle adaptative « observer → adapter → expliquer » — règles issues de :
//   docs/veille/02-science-musculation.md §4 & §7 (double progression, deload sur signaux)
//   docs/veille/03-science-running.md §5 & §6 (recalcul VDOT, hausses brutales = signal)
//   docs/veille/04-nutrition-calories.md §4 (ajustement sur tendance lissée, pas la théorie)
// Entrée : un persona normalisé + un journal (séances réalisées, pesées, tests chrono).
// Sortie : décisions structurées, chacune avec son « pourquoi » sourcé.
// Prototype offline : le journal est un JSON local ; en Phase 3 il sera alimenté
// par l'app et Strava.

import { estimerVdot, alluresEntrainement } from "./vdot.js";
import { migrerPerformances, reconcilier, testEnPerformance, ajouterPerformance } from "./performances.js";
import { distanceObjectifM } from "./distances.js";
import { chargeEndurance, simulerCharge, chargesHebdo, verifierProprietaireJournal } from "./charge.js";
import { observanceEchauffement } from "./echauffement.js";
import { conflitsObserves } from "./placement.js";
import { genererPlanRunning } from "./running.js";
import { genererProgrammeMuscu } from "./muscu.js";
import { normaliserPersona, limitationsDe } from "./personne.js";
import { validerLimitations, zoneJambesActive } from "./limitations.js";
import { MUSCLES_ACCESSOIRES } from "./exercices.js";
import { SEUIL_PERTE_HEBDO_PCT } from "./red-s.js";
// Les records se DÉRIVENT du carnet ; la cible se LIT contre eux. Aucun des deux ne se saisit.
import { recordsMuscu } from "./records.js";
import { evaluerCible } from "./objectif.js";

// Le lien « nom d'exercice loggué → muscle moteur principal » vient du RÉFÉRENTIEL
// (free-exercise-db, exercices.js) : le journal ne loggue qu'un nom, pas un muscle.
// Le référentiel est injecté (module pur, aucune I/O ici).
function musclePrincipal(referentiel, nom) {
  return referentiel?.musclePrincipal?.[nom] ?? null;
}

const JOUR_MS = 24 * 3600 * 1000;

/**
 * Le VDOT « d'avant » d'un bloc running — **une seule** définition, partagée par tous les chemins
 * (bilan, replanification, recalage). Priorité à la **réconciliation** (l'historique pondéré) ;
 * repli sur l'ancien `temps_reference` puis sur le VDOT supposé par niveau, pour qu'un persona
 * non normalisé (appel direct, test unitaire ancien) continue de marcher à l'identique.
 * Un fait dupliqué est un fait qui divergera (philosophy §11).
 */
function vdotDeReference(r) {
  if (r?.reconciliation?.vdot != null) return r.reconciliation.vdot;
  if (r?.temps_reference) return estimerVdot(r.temps_reference.distance_m, r.temps_reference.temps);
  return r?.vdot_estime ?? null;
}

/**
 * 🔁 **LA BOUCLE, FERMÉE.** Intègre le dernier test chrono du journal dans l'HISTORIQUE de
 * performances, puis **re-réconcilie tout** : VDOT, profil, trajectoire, correction marathon.
 * Le test ne remplace pas le passé — il **s'y ajoute** et **le pondère** (`performances.js`).
 *
 * Renvoie `{ performances, reconciliation }` prêts à être injectés dans un bloc `running`.
 */
function reconcilierAvecTest(r, dernierTest, dateRef) {
  const base = Array.isArray(r?.performances) ? r.performances : migrerPerformances(r).performances;
  const performances = dernierTest ? ajouterPerformance(base, testEnPerformance(dernierTest)) : base;
  const reconciliation = reconcilier(performances, {
    objectif_distance_m: distanceObjectifM(r?.objectif?.distance),
    aujourdhui: dateRef ? new Date(`${dateRef}T12:00:00Z`) : new Date(),
    vdot_secours: r?.vdot_estime ?? null,
  });
  return { performances, reconciliation };
}

function parseFourchette(reps) {
  const m = String(reps).match(/^(\d+)\s*[–-]\s*(\d+)$/);
  return m ? { min: +m[1], max: +m[2] } : null;
}

function tonnage(entree) {
  return (entree.charge_kg ?? 0) * entree.reps.reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------- muscu

/**
 * Le PAS de charge d'un exercice — ce que vaut « l'étape suivante » de la double
 * progression. Ajouter 5 kg à un curl, c'est une hausse que personne ne tient ;
 * ajouter 2,5 kg à un squat, c'est ne jamais progresser. Le mouvement décide.
 * (La règle vivait en ligne dans la phrase de la décision — elle porte maintenant
 * aussi la VALEUR, et une seule définition les alimente toutes les deux.)
 */
const RE_PETIT_PAS = /couché|militaire|rowing|tractions|dips|incliné|curl|extension|élévations/i;
const pasDeProgression = (nom) => (RE_PETIT_PAS.test(nom) ? 2.5 : 5);

/**
 * La baisse de charge quand la série est tombée sous la fourchette à RIR 0 : ~5 %,
 * mais **ramenée sur la grille de la salle** (on ne descend pas de 4,37 kg).
 */
function reductionKg(charge, pas) {
  if (!(charge > 0)) return 0;
  return -Math.max(pas, Math.round((charge * 0.05) / pas) * pas);
}

/**
 * Applique la double progression exercice par exercice (veille/02 §4) et détecte
 * les signaux de deload (veille/02 §7 : perf en baisse, RPE anormalement haut).
 *
 * 🔴 **Chaque décision porte une VALEUR, pas seulement une phrase** (`delta_kg`,
 * `reps_cible`). Elle rendait `action: "+2,5 kg, repartir à 8 reps"` — une phrase que
 * **personne n'appliquait** : la boucle était *conseillée*, jamais *fermée*. Le texte
 * reste (il s'affiche, il s'imprime dans le bilan CLI) ; la donnée apparaît à côté, et
 * c'est elle qu'`appliquerAdaptationMuscu` verse dans le programme.
 * On sépare la donnée du texte — on ne supprime pas le texte (cf. `avis.js`).
 */
export function adapterMuscu(programme, journal, referentiel) {
  const seances = journal.seances_muscu ?? [];
  if (!seances.length) return null;

  const parExercice = new Map();
  for (const s of [...seances].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const e of s.exercices ?? []) {
      if (!parExercice.has(e.nom)) parExercice.set(e.nom, []);
      parExercice.get(e.nom).push({ ...e, date: s.date });
    }
  }

  const prescriptions = new Map();
  for (const seance of programme.seances) {
    for (const ex of seance.exercices) prescriptions.set(ex.nom, ex);
  }

  const decisions = [];
  for (const [nom, historique] of parExercice) {
    const presc = prescriptions.get(nom);
    const fourchette = presc ? parseFourchette(presc.reps) : null;
    if (!fourchette) continue; // isométries / exercice hors programme : pas de double progression chiffrée
    const dernier = historique[historique.length - 1];
    if (!Array.isArray(dernier.reps) || dernier.reps.length === 0) continue;

    // « À RIR cible » ne se décrète pas : si le RIR est loggé à 0, le haut de
    // fourchette a été pris à l'échec → consolider avant de charger (veille/02 §3).
    const rirOk = dernier.rir == null || dernier.rir >= 1;
    const hautAtteint = dernier.reps.every((r) => r >= fourchette.max) && rirOk;
    const sousFourchette = dernier.reps.some((r) => r < fourchette.min);
    const pas = pasDeProgression(nom);
    if (hautAtteint) {
      decisions.push({
        exercice: nom,
        action: `+${pas === 2.5 ? "2,5" : "5"} kg, repartir à ${fourchette.min} reps`,
        // LA DONNÉE — celle que quelqu'un peut enfin APPLIQUER.
        delta_kg: pas,
        reps_cible: fourchette.min,
        pourquoi: `Haut de fourchette (${fourchette.max}) atteint sur toutes les séries à RIR cible → étape suivante de la double progression (veille/02 §4).`,
      });
    } else if (sousFourchette) {
      const tropLourd = dernier.rir === 0;
      decisions.push({
        exercice: nom,
        action: tropLourd ? "Réduire la charge de ~5 % et revenir dans la fourchette" : "Garder la charge, consolider les reps",
        delta_kg: tropLourd ? reductionKg(dernier.charge_kg, pas) : 0,
        reps_cible: fourchette.min,
        pourquoi: `Série(s) sous le bas de fourchette (${fourchette.min})${tropLourd ? " avec RIR 0 : la charge est trop lourde pour la plage cible" : ""} (veille/02 §3–4).`,
      });
    } else {
      decisions.push({
        exercice: nom,
        action: "Garder la charge, viser +1 rep sur les séries les plus basses",
        delta_kg: 0,
        // +1 rep sur la série la plus BASSE, sans dépasser le haut de fourchette :
        // la charge ne monte qu'une fois le haut tenu partout.
        reps_cible: Math.min(fourchette.max, Math.min(...dernier.reps) + 1),
        pourquoi: "Dans la fourchette, haut pas encore atteint → on monte les reps avant la charge (double progression, veille/02 §4).",
      });
    }
  }

  // Signaux de deload : perf en baisse À CHARGE ÉGALE (veille/02 §7) — une charge
  // qui monte avec reset des reps est de la double progression, pas de la fatigue.
  let perfEnBaisse = 0;
  for (const historique of parExercice.values()) {
    if (historique.length < 2) continue;
    const [avant, apres] = [historique.at(-2), historique.at(-1)];
    const chargeEgaleOuMoindre = (apres.charge_kg ?? 0) <= (avant.charge_kg ?? 0);
    if (chargeEgaleOuMoindre && tonnage(apres) < tonnage(avant) * 0.95) perfEnBaisse++;
  }
  const rpeEleves = seances.filter((s) => (s.rpe_seance ?? 0) >= 9).length;
  const deload = perfEnBaisse >= 2 || rpeEleves >= 2;

  return {
    decisions,
    tendances: tendancesMuscu(seances, referentiel),
    deload: {
      declenche: deload,
      signaux: { exercices_en_baisse: perfEnBaisse, seances_rpe_9_plus: rpeEleves },
      // 🔴 « prochain deload au calendrier » : c'est ce que disait cette ligne — en citant
      // `veille/02 §5`, la section qui écrit noir sur blanc que **le deload calendaire n'est
      // pas démontré**. Il n'y a PAS de « prochain deload au calendrier » : il n'y a pas de
      // calendrier. Sans signal, on continue — point. C'est tout ce que la source autorise.
      pourquoi: deload
        ? "Perf en baisse et/ou RPE anormalement haut à charge égale = marqueurs de fatigue → deload (volume −50 %, RIR 3–4, charges −10 %) (veille/02 §5 & §7)."
        : "Pas de marqueur de fatigue : on continue. Le deload se déclenche sur SIGNAUX, pas à une échéance (veille/02 §5 & §7).",
    },
  };
}

/**
 * 🔁 **LA DOUBLE PROGRESSION, REFERMÉE.** `adapterMuscu` DÉCIDE ; ici on APPLIQUE.
 *
 * Sans cette fonction, la génération repartait de la **dernière charge réelle**
 * (`charges_reference`, via `recalerPersona`) — donc **de la charge d'hier, jamais de la
 * charge d'après**. Le « +2,5 kg » restait une phrase dans un tableau : la semaine suivante
 * prescrivait exactement la même chose que la semaine passée.
 *
 * Ce qui est écrit sur chaque exercice du programme :
 *   `charge_prevue_kg`  la charge de la PROCHAINE séance = dernière charge réelle + `delta_kg`
 *   `reps_prevues`      les reps à viser (bas de fourchette après une hausse, +1 sinon)
 *   `progression`       la décision qui l'a produite (delta, reps, action, pourquoi) — traçable
 *
 * ⚠️ On n'écrase **pas** `charge_depart_kg` : il reste ce qu'il est, la dernière charge
 * **soulevée**. « Prévu » et « précédent » sont deux faits différents, et l'écran les montre
 * tous les deux.
 *
 * @param {object} programme   sortie de `genererProgrammeMuscu` — MUTÉ en place
 * @param {object} adaptation  sortie d'`adapterMuscu` (peut être `null` : journal vide)
 */
export function appliquerAdaptationMuscu(programme, adaptation) {
  const appliquees = [];
  if (!programme?.seances || !adaptation?.decisions?.length) return { appliquees };

  const parNom = new Map(adaptation.decisions.map((d) => [d.exercice, d]));
  for (const seance of programme.seances) {
    for (const e of seance.exercices) {
      const d = parNom.get(e.nom);
      if (!d) continue;

      // La base, c'est le RÉEL : `charge_depart_kg` vient de `charges_reference`, que
      // `recalerPersona` a rempli depuis le journal. Sans base, pas de prévision — on
      // n'invente pas une charge de départ pour pouvoir lui ajouter 2,5 kg.
      const base = e.charge_depart_kg ?? null;
      let charge = null;
      if (base != null) {
        charge = Math.max(0, Math.round((base + (d.delta_kg ?? 0)) * 100) / 100);
        // 🔒 Un exercice PLAFONNÉ par une limitation ne monte pas en charge, jamais :
        // il progresse par les reps. La double progression ne perce pas un garde-fou.
        if (e.plafond_charge && e.charge_max_kg != null) charge = Math.min(charge, e.charge_max_kg);
      }

      e.charge_prevue_kg = charge;
      e.reps_prevues = d.reps_cible ?? null;
      e.progression = {
        delta_kg: d.delta_kg ?? 0,
        reps_cible: d.reps_cible ?? null,
        action: d.action,
        pourquoi: d.pourquoi,
      };
      // Une charge dérivée d'une charge RÉELLEMENT soulevée n'est plus une estimation du
      // moteur : le marqueur tombe, sinon l'app peindrait un mesuré en « ~85 kg » (elle
      // arrondit les estimés à 5 kg) — une fausse imprécision, aussi fausse que l'inverse.
      if (charge != null) e.charge_a_confirmer = false;

      appliquees.push({
        nom: e.nom,
        seance: seance.nom,
        avant: base,
        apres: charge,
        delta_kg: d.delta_kg ?? 0,
        reps_cible: d.reps_cible ?? null,
      });
    }
  }
  return { appliquees };
}

/**
 * 🔴 **LA BOUCLE ENTIÈRE, EN UNE FONCTION PURE** — celle que l'app appelle, et celle que les
 * tests exercent. Elle n'existait nulle part : chaque maillon était écrit, testé, publié… et
 * **aucun appelant ne les enchaînait**. Les séances partaient dans un tiroir que personne
 * n'ouvrait, et le programme se régénérait à l'identique à chaque démarrage.
 *
 *   journal → `recalerPersona`  les charges RÉELLES remontent dans `charges_reference`
 *           → `genererProgrammeMuscu`  le programme repart du réel, pas de l'hypothèse
 *           → `adapterMuscu`           les décisions de double progression
 *           → `appliquerAdaptationMuscu`  et **quelqu'un applique enfin le +2,5 kg**
 *           → `chargesHebdo`           la jauge unifiée sRPE (ADR 0006)
 *
 * Aucune I/O : l'appelant lit le persona et le journal où ils vivent (IndexedDB dans l'app,
 * des fichiers dans le CLI) et les passe ici.
 *
 * @param {object} personaBrut  le persona tel qu'il est stocké (non normalisé)
 * @param {object} journal      journal dérivé des séances loguées (`journal.js`)
 * @param {object} referentiel  référentiel d'exercices
 */
export function programmeAdapteMuscu(personaBrut, journal, referentiel) {
  // 1. Le persona se recale sur le réel. C'est CE geste qui fait que la semaine prochaine
  //    ne sera pas identique à cette semaine. `recalerPersona` est PURE : rien n'est écrit.
  const recalage = recalerPersona(personaBrut, journal, referentiel);
  const brut = recalage.statut === "ok" ? recalage.persona : personaBrut;
  const persona = normaliserPersona(brut);

  // 2. Le programme, généré SUR les charges réelles.
  const programme = genererProgrammeMuscu(persona, referentiel);

  // 3. Les décisions… et leur APPLICATION (c'était le maillon manquant).
  const adaptation = adapterMuscu(programme, journal, referentiel);
  const progression = appliquerAdaptationMuscu(programme, adaptation);

  // 4. La jauge unifiée sRPE — muscu et course dans la même unité (ADR 0006).
  const aDesSeances = (journal?.seances_muscu?.length ?? 0) + (journal?.sorties_course?.length ?? 0) > 0;
  const charge = aDesSeances
    ? chargesHebdo(journal, {
        dureeDefautMuscu: persona.muscu?.duree_seance_min ?? null,
        pour: persona.id ?? persona.nom ?? null,
      })
    : null;

  // 5. 🔴 LES RECORDS ET LA CIBLE — et c'est ICI que le bug ne se reproduit pas.
  //
  //    Ce projet a écrit **deux fois** un maillon que personne n'appelait : `versEntreeJournal()`
  //    (testée, importée, jamais appelée) puis la séance finie qui n'entrait au carnet que par le
  //    pavé de note. **Ajouter un champ « cible » que le moteur ne LIT pas serait le troisième.**
  //
  //    Alors la cible est lue **ici**, dans la fonction que l'app appelle à chaque génération, à
  //    côté du programme et des limitations dont elle a besoin pour pouvoir REFUSER. Les records,
  //    eux, sortent du **journal** — et de lui seul (`records.js` : `records_historiques` est en
  //    quarantaine, et sa signature l'y maintient).
  const records = recordsMuscu(journal);
  const cible = evaluerCible(persona, journal, programme);

  return { persona, brut, programme, adaptation, progression, charge, recalage, records, cible };
}

// ---------------------------------------------------------------- running

/**
 * Recalcule le VDOT sur test/course récent (veille/03 §6), reconstruit la charge d'endurance
 * réelle (CE / moyennes 42 j & 7 j — **nos noms**, cf. charge.js) et surveille les hausses
 * brutales de volume (signal, jamais oracle — veille/03 §5).
 */
export function adapterRunning(persona, journal) {
  const sorties = journal.sorties_course ?? [];
  const tests = journal.tests_chrono ?? [];
  if (!sorties.length && !tests.length) return null;
  const r = persona.running;

  // --- VDOT ---
  let vdot = null;
  if (tests.length) {
    const dernier = [...tests].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    const nouveau = estimerVdot(dernier.distance_m, dernier.temps);
    const ancien = vdotDeReference(r);
    // Si la référence initiale était une hypothèse (note, ou VDOT estimé par niveau),
    // le delta n'est PAS un progrès mesuré — juste un recalage.
    const referenceHypothetique = Boolean(r?.temps_reference?.note) || (ancien != null && !r?.temps_reference);
    // 🔁 Le test entre dans l'HISTORIQUE et re-réconcilie tout : le VDOT « brut » du test n'est plus
    // le mot de la fin — il est **pondéré** avec les autres perfs (fraîcheur + effort maximal lui
    // donnent naturellement le dessus, sans règle spéciale). Et le **PROFIL se recalcule** : un
    // déficit d'endurance établi sur une borne inférieure devient un écart **MESURÉ**.
    const { reconciliation } = reconcilierAvecTest(r, dernier, journal.periode?.fin ?? dernier.date);
    vdot = {
      valeur: +nouveau.toFixed(1),
      precedent: ancien != null ? +ancien.toFixed(1) : null,
      delta: ancien != null ? +(nouveau - ancien).toFixed(1) : null,
      reference_hypothetique: referenceHypothetique,
      test: dernier,
      allures: alluresEntrainement(nouveau),
      // Le VDOT effectivement retenu APRÈS réconciliation (≠ celui du test seul si l'historique
      // contient une perf plus proche de la distance objectif — veille/03 §2, veille/12 §4).
      reconcilie: reconciliation.vdot,
      profil: reconciliation.profil,
      reconciliation,
      pourquoi:
        "Les allures se recalculent sur la perf réelle la plus récente, pas sur l'hypothèse initiale (veille/03 §2 & §6). " +
        "⚠️ **Le test ne SUPPRIME pas ton historique** : il **y entre**. Le VDOT retenu est celui de la **réconciliation** " +
        "(`performances[]`), où la perf la plus proche de ta distance objectif pèse le plus (veille/03 §2, veille/12 §4). " +
        "Un test frais à effort maximal l'emporte le plus souvent — **par sa pondération, pas par décret**.",
    };
  }

  // --- Volume par semaine + hausse brutale ---
  const parSemaine = new Map();
  for (const s of sorties) {
    const d = new Date(s.date + "T00:00:00Z");
    const lundi = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * JOUR_MS).toISOString().slice(0, 10);
    parSemaine.set(lundi, (parSemaine.get(lundi) ?? 0) + s.km);
  }
  const semaines = [...parSemaine.entries()].sort().map(([lundi, km]) => ({ lundi, km: +km.toFixed(1) }));
  const alertes = [];
  // Garde-fou souple ~10 %/sem (veille/12 §7) → on alerte dès +20 % vs la moyenne
  // glissante (capte aussi les rampes cumulées que le semaine-à-semaine rate).
  for (let i = 1; i < semaines.length; i++) {
    const precedentes = semaines.slice(Math.max(0, i - 4), i).map((s) => s.km);
    const moyenne = precedentes.reduce((a, b) => a + b, 0) / precedentes.length;
    if (moyenne > 0 && semaines[i].km > moyenne * 1.2) {
      alertes.push(
        `Semaine du ${semaines[i].lundi} : ${semaines[i].km} km, +${Math.round((semaines[i].km / moyenne - 1) * 100)} % vs la moyenne des ${precedentes.length} semaine(s) précédente(s) (garde-fou ~10 %/sem, veille/12 §7) — hausse brutale = risque de blessure ; c'est un SIGNAL à croiser avec le ressenti, pas un verdict (veille/03 §5).`
      );
    }
  }
  // Règle d'or marathon/semi : la longue sortie sert AUSSI à répéter le ravitaillement.
  const plusLongue = Math.max(0, ...sorties.map((s) => s.km));
  const rappelRavito =
    plusLongue >= 16 && ["semi", "marathon"].includes(r?.objectif?.distance)
      ? `Longue(s) sortie(s) jusqu'à ${plusLongue} km logguée(s) : répéter le ravitaillement à chacune (30–60 g de glucides/h, matériel et marques du jour J) — ne rien découvrir en course (veille/12 §5).`
      : null;

  // --- Charge d'endurance réelle (CE, reconstruite depuis les sorties) ---
  //
  // ⚠️ La musculation n'est plus ajoutée ici. Elle l'était à raison de **+25 points par séance**,
  // un nombre décrété — la constante `k` de l'ADR 0006, sous un autre nom. Supprimée. Les moyennes
  // 42 j / 7 j redeviennent ce qu'elles sont vraiment : **cardiovasculaires** (l'honnêteté assumée
  // d'intervals.icu), et **descriptives** — jamais une cible (Marchal et al. 2025 : la composante
  // fatigue n'améliore pas la prédiction, p = 0,57).
  // La charge de musculation est comptée dans `charge_srpe`, filière `force`, dans la même unité
  // que la course (sRPE × durée) — séparée, sommable comme DOSE, et auditable.
  const parJour = new Map();
  for (const s of sorties) {
    const ce = chargeEndurance([{ zone: s.type ?? "E", duree_min: s.duree_min }]);
    parJour.set(s.date, (parJour.get(s.date) ?? 0) + ce);
  }
  const dates = [...parJour.keys()].sort();
  let charge = null;
  if (dates.length) {
    const debut = new Date(dates[0] + "T00:00:00Z");
    const fin = new Date(dates.at(-1) + "T00:00:00Z");
    const ceParJour = [];
    for (let t = debut.getTime(); t <= fin.getTime(); t += JOUR_MS) {
      ceParJour.push(parJour.get(new Date(t).toISOString().slice(0, 10)) ?? 0);
    }
    const historique = simulerCharge(ceParJour, r?.charge_42j_depart ?? 30);
    const etat = historique.at(-1);
    charge = {
      charge_42j: +etat.charge_42j.toFixed(1),
      charge_7j: +etat.charge_7j.toFixed(1),
      ecart_42j_7j: +etat.ecart_42j_7j.toFixed(1),
      pourquoi:
        "Moyennes **42 j** et **7 j** de la **charge d'endurance (CE)**, reconstruites sur les **sorties de course** " +
        "réellement effectuées (durée × intensité relative², veille/03 §3 & §6). 🟡 **Convention d'outil, pas une cible** : " +
        "l'écart entre les deux moyennes est **une soustraction**, pas un « score de forme » — la composante « fatigue » de " +
        "ce modèle n'améliore pas la prédiction (p = 0,57 ; Marchal et al. 2025, *Sci Rep* 15:3706). On la garde comme " +
        "**courbe descriptive**, pour voir les rampes, et rien de plus. La **musculation n'y est pas convertie** (ce serait " +
        "une constante inventée) : elle est comptée dans la charge sRPE, filière force.",
    };
  }

  // --- Replanification : régénérer le plan restant sur les données réelles ---
  const replanification = replanifierRunning(persona, journal, {
    semaines,
    plusLongue,
    charge,
    dernierTest: tests.length ? [...tests].sort((a, b) => a.date.localeCompare(b.date)).at(-1) : null,
  });

  return { vdot, semaines, alertes, rappel_ravito: rappelRavito, charge, replanification };
}

/**
 * Ancrages « réels » du running, partagés par la replanification et le recalage du
 * persona : volume = moyenne des 3 dernières semaines observées (lisse une dernière
 * semaine partielle), longue = la plus longue réellement encaissée (plancher à
 * l'hypothèse initiale pour ne pas régresser sur une sous-log), moyenne 42 j = charge réelle
 * reconstruite. On ne recale que ce qui est mesuré (veille/03 §6).
 */
function ancragesReels(r, { semaines, plusLongue, charge }) {
  const recentes = semaines.slice(-3);
  return {
    volumeReel: recentes.length ? Math.round(recentes.reduce((a, s) => a + s.km, 0) / recentes.length) : r.volume_actuel_km_sem,
    longueReel: Math.max(Math.round(plusLongue), r.longue_sortie_actuelle_km),
    charge42jReel: charge ? Math.round(charge.charge_42j) : r.charge_42j_depart,
  };
}

/**
 * Boucle « générer → observer → adapter → RE-GÉNÉRER » : reconstruit le plan des
 * semaines restantes depuis les données réelles (VDOT recalé sur le dernier test,
 * volume et longue sortie de départ = charge récente réellement encaissée, moyenne 42 j
 * réelle) au lieu des hypothèses initiales (veille/03 §6, veille/12 §8). Le plan
 * s'aligne sur l'athlète, pas l'inverse. Ne recalcule que ce qui est mesuré.
 */
function replanifierRunning(persona, journal, ctx) {
  const r = persona.running;
  if (!r?.course?.date) return null; // sans date de course, rien à re-dimensionner
  const { semaines, plusLongue, charge, dernierTest } = ctx;

  // Date « à partir de laquelle on re-planifie » = fin de la période observée.
  const dateRefStr =
    journal.periode?.fin ??
    [...(journal.sorties_course ?? []), ...(journal.tests_chrono ?? [])]
      .map((x) => x.date)
      .sort()
      .at(-1);
  if (!dateRefStr) return null;
  const dateRef = new Date(dateRefStr + "T12:00:00Z");
  const dateCourse = new Date(r.course.date + "T00:00:00Z");
  if (dateCourse.getTime() <= dateRef.getTime()) {
    return { statut: "course_passee", date_reference: dateRefStr, pourquoi: "La date de course est déjà passée sur la période observée : plus rien à re-planifier, place au bilan post-course." };
  }

  // Il faut de quoi ré-ancrer honnêtement : un test récent OU ≥ 2 semaines de volume.
  if (!dernierTest && semaines.length < 2) {
    return { statut: "donnees_insuffisantes", date_reference: dateRefStr, pourquoi: "Trop peu de données réelles pour re-planifier de façon fiable (il faut un test chrono récent ou ≥ 2 semaines de volume) — garder le plan en cours et continuer à logguer." };
  }

  // Ancrages réels (volume = moyenne des 3 dernières semaines, longue = plus longue
  // encaissée avec plancher anti-régression, moyenne 42 j réelle) — partagés avec `recalerPersona`.
  const { volumeReel, longueReel, charge42jReel } = ancragesReels(r, { semaines, plusLongue, charge });
  const vdotAvant = vdotDeReference(r);

  // 🔁 Le test chrono entre dans l'HISTORIQUE, et tout se re-réconcilie : VDOT, profil, correction
  // marathon. La boucle générer → observer → adapter → **re-générer** se referme sur les
  // performances, pas seulement sur le volume.
  const { performances, reconciliation } = reconcilierAvecTest(r, dernierTest, dateRefStr);

  const personaMaj = {
    ...persona,
    running: {
      ...r,
      volume_actuel_km_sem: volumeReel,
      longue_sortie_actuelle_km: longueReel,
      charge_42j_depart: charge42jReel,
      performances,
      reconciliation,
      // Un test réel remplace la référence (et n'est plus une hypothèse) ; sinon on garde l'existant.
      // ⚠️ `temps_reference` n'est plus la SOURCE du VDOT (c'est `reconciliation`) — il survit
      // comme champ de compatibilité, et il est tenu à jour pour ne casser aucun appelant.
      temps_reference: dernierTest ? { distance_m: dernierTest.distance_m, temps: dernierTest.temps } : r.temps_reference,
    },
  };

  let plan;
  try {
    plan = genererPlanRunning(personaMaj, dateRef);
  } catch (err) {
    // genererPlanRunning refuse une échéance trop proche : on relaie le message tel quel.
    return { statut: "trop_court", date_reference: dateRefStr, pourquoi: err.message };
  }

  const changements = [
    { quoi: "VDOT", avant: +vdotAvant.toFixed(1), apres: plan.vdot },
    { quoi: "Volume de départ (km/sem)", avant: r.volume_actuel_km_sem, apres: volumeReel },
    { quoi: "Longue sortie de départ (km)", avant: r.longue_sortie_actuelle_km, apres: longueReel },
    { quoi: "Charge moyenne 42 j de départ (CE)", avant: r.charge_42j_depart, apres: charge42jReel },
  ].filter((c) => c.avant !== c.apres);

  return {
    statut: "ok",
    date_reference: dateRefStr,
    debut: plan.debut,
    nb_semaines_restantes: plan.nb_semaines,
    vdot: plan.vdot,
    volume_pic_km: plan.volume_pic_km,
    ecart_jour_course: plan.charge.ecart_jour_course,
    alertes_plan: plan.alertes,
    changements,
    recale_sur_test: Boolean(dernierTest),
    pourquoi:
      "Plan des semaines restantes régénéré sur les données RÉELLES du journal (VDOT recalé sur le dernier test, volume et longue sortie de départ = charge récemment encaissée, moyenne 42 j réelle) plutôt que sur les hypothèses de départ — la boucle générer→observer→adapter se referme (veille/03 §6, veille/12 §8). Régénérer le plan complet : `gen` sur un persona mis à jour avec ces valeurs.",
  };
}

/**
 * Historique complet par exercice : Map nom → [{ charge_kg, reps, rir?, date, seance? }]
 * trié par date (ancien → récent). Ignore les entrées sans charge/reps exploitables.
 * Base commune du repère de charge (`ancragesMuscu`) et des tendances (`tendancesMuscu`).
 */
function historiqueParExercice(seances) {
  const parExercice = new Map();
  for (const s of [...seances].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const e of s.exercices ?? []) {
      if (!e?.nom || e.charge_kg == null || !Array.isArray(e.reps) || !e.reps.length) continue;
      if (!parExercice.has(e.nom)) parExercice.set(e.nom, []);
      parExercice.get(e.nom).push({
        charge_kg: e.charge_kg,
        reps: e.reps,
        ...(e.rir != null ? { rir: e.rir } : {}),
        date: s.date,
        ...(s.seance ? { seance: s.seance } : {}),
      });
    }
  }
  return parExercice;
}

/**
 * Ancrages « réels » de la muscu, pendant de `ancragesReels` côté force : pour chaque
 * exercice loggué, la DERNIÈRE charge de travail réellement encaissée (charge + reps de
 * la séance la plus récente qui le contient). C'est le repère de départ que `gen` muscu
 * doit reprendre au lieu de repartir « à vide » (double progression, veille/02 §4).
 * Renvoie une Map nom → { charge_kg, reps, rir?, date, seance? }, triée par date.
 */
function ancragesMuscu(seances) {
  const dernier = new Map();
  for (const [nom, historique] of historiqueParExercice(seances)) {
    dernier.set(nom, { ...historique.at(-1) }); // la séance la plus récente écrase
  }
  return dernier;
}

// 1RM estimé (Epley) du MEILLEUR set d'une séance : charge × (1 + reps_max/30). Robuste
// au nombre de séries et sensible à la double progression (reps OU charge qui montent) —
// c'est le bon proxy de « progression » d'un exercice au fil du temps (veille/02 §4).
function e1rm(entree) {
  return entree.charge_kg * (1 + Math.max(...entree.reps) / 30);
}

// @chiffre-derive Ni « 3 séances » ni « ±2 % » ne figurent dans veille/02 §1 ou §5 : ce sont des
// seuils de LECTURE DU BRUIT (à partir de quand un écart mérite le nom de « tendance »), pas des
// chiffres de la science. La veille fonde la RÈGLE (stagnation → +volume, le levier n°1) ; le
// moteur choisit la sensibilité du détecteur. On le DIT, plutôt que de le faire passer pour sourcé.
const MIN_SEANCES_TENDANCE = 3; // en-deçà, un « écart » n'est pas une tendance mais du bruit
// @chiffre-derive idem — ±2 % de 1RM estimé : seuil d'ingénierie, absent de veille/02 §1 & §5.
const SEUIL_TENDANCE = 0.02; // ±2 % de 1RM estimé entre les deux moitiés = zone de stagnation

/**
 * Tendances observées par exercice puis agrégées par muscle, sur l'historique du journal.
 * On compare la moyenne du 1RM estimé de la 1re moitié de l'historique à celle de la 2e
 * (≥ 3 séances requises par exercice). Classement progression / stagnation / regression
 * selon ±SEUIL_TENDANCE. Un muscle qui STAGNE dans la durée appelle plus de VOLUME (le
 * levier n°1, veille/02 §1) ; un muscle qui PROGRESSE, on ne touche à rien (rendements
 * décroissants) ; une BAISSE relève de la fatigue → deload avant d'ajouter du volume
 * (veille/02 §5 & §7). Fonction PURE, réutilisée par le bilan (observer) et `recaler`
 * (persister les priorités). Renvoie { exercices, muscles, regressions, suffisant }.
 */
export function tendancesMuscu(seances, referentiel) {
  const exercices = [];
  const parMuscle = new Map();
  let regressions = 0;
  for (const [nom, historique] of historiqueParExercice(seances)) {
    if (historique.length < MIN_SEANCES_TENDANCE) continue;
    const serie = historique.map(e1rm);
    const moitie = Math.floor(serie.length / 2); // médiane ignorée si longueur impaire
    const debut = serie.slice(0, moitie);
    const fin = serie.slice(serie.length - moitie);
    const moy = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const moyDebut = moy(debut);
    const variation = (moy(fin) - moyDebut) / moyDebut;
    const statut = variation >= SEUIL_TENDANCE ? "progression" : variation <= -SEUIL_TENDANCE ? "regression" : "stagnation";
    if (statut === "regression") regressions++;
    const muscle = musclePrincipal(referentiel, nom);
    exercices.push({
      nom,
      muscle,
      statut,
      seances: historique.length,
      variation_pct: +(variation * 100).toFixed(1),
      e1rm_debut: +moyDebut.toFixed(1),
      e1rm_fin: +moy(fin).toFixed(1),
    });
    if (muscle) {
      if (!parMuscle.has(muscle)) parMuscle.set(muscle, []);
      parMuscle.get(muscle).push(statut);
    }
  }
  // Agrégation par muscle : un exercice qui progresse « sauve » le muscle (adaptation en
  // cours → maintenir) ; sinon une baisse prime sur la stagnation (signal de fatigue).
  const muscles = [...parMuscle].map(([muscle, statuts]) => ({
    muscle,
    statut: statuts.includes("progression") ? "progression" : statuts.includes("regression") ? "regression" : "stagnation",
  }));
  return { exercices, muscles, regressions, suffisant: exercices.length > 0 };
}

// ------------------------------------------------ persistance du persona recalé

/**
 * Recalage RUNNING (sous-routine de `recalerPersona`) : réinjecte dans `maj.running`
 * les valeurs RÉELLES du journal — VDOT via le dernier test chrono, volume/longue/moyenne 42 j de
 * départ = charge récemment encaissée (mêmes ancrages que la replanification). Mute `maj`
 * en place et renvoie le sous-résultat ({ applique, changements, … } ou un statut de refus).
 */
function recalerRunningInterne(persona, journal, maj) {
  const adaptation = adapterRunning(persona, journal);
  if (!adaptation) {
    return { applique: false, statut: "aucune_donnee", pourquoi: "Aucune sortie de course ni test chrono dans le journal : rien de réel à réinjecter côté running (veille/03 §6)." };
  }
  const r = persona.running;
  const sorties = journal.sorties_course ?? [];
  const tests = journal.tests_chrono ?? [];
  const dernierTest = tests.length ? [...tests].sort((a, b) => a.date.localeCompare(b.date)).at(-1) : null;
  const semaines = adaptation.semaines;
  if (!dernierTest && semaines.length < 2) {
    return { applique: false, statut: "donnees_insuffisantes", pourquoi: "Trop peu de données réelles pour recaler le running de façon fiable (il faut un test chrono récent ou ≥ 2 semaines de volume) — garder le persona et continuer à logguer." };
  }
  const plusLongue = Math.max(0, ...sorties.map((s) => s.km));
  const { volumeReel, longueReel, charge42jReel } = ancragesReels(r, { semaines, plusLongue, charge: adaptation.charge });
  const dateRef = journal.periode?.fin ?? [...sorties, ...tests].map((x) => x.date).sort().at(-1);

  const rb = (maj.running = { ...(maj.running ?? {}) });
  const changements = [];
  const pousser = (quoi, avant, apres) => { if (avant !== apres) changements.push({ quoi, avant, apres }); };

  if (dernierTest) {
    const vdotAvant = vdotDeReference(r);
    // 🔁 **LA BOUCLE SE FERME DANS LE FICHIER PERSONA.** Le test n'écrase plus l'unique référence :
    // il **entre dans l'historique** (`performances[]`), qui est **persisté**. Le prochain `gen`
    // repartira donc d'un historique ENRICHI — pas d'une perf qui aurait effacé les précédentes.
    // ⚠️ On repart du BRUT (`maj.running`), pas du normalisé : le fichier persona reste lisible.
    const { performances, reconciliation } = reconcilierAvecTest(
      { ...rb, objectif: rb.objectif ?? r.objectif, vdot_estime: rb.vdot_estime ?? r.vdot_estime },
      dernierTest,
      dateRef
    );
    rb.performances = performances;
    const vdotApres = reconciliation.vdot ?? estimerVdot(dernierTest.distance_m, dernierTest.temps);
    pousser("VDOT", +vdotAvant.toFixed(1), +vdotApres.toFixed(1));
    pousser("Performances à l'historique", (r.performances?.length ?? 0) || "—", performances.length);
    // Le test réel DEVIENT la référence de compatibilité : ce n'est plus une hypothèse.
    // ⚠️ La `date` est OBLIGATOIRE ici — sans elle, la re-normalisation migrerait ce
    // `temps_reference` comme une perf DISTINCTE du test déjà présent dans `performances[]`
    // (le dédoublonnage se fait sur `distance|temps|date`) → un doublon silencieux.
    rb.temps_reference = {
      distance_m: dernierTest.distance_m,
      temps: dernierTest.temps,
      date: dernierTest.date,
      type: "test",
      effort: "maximal",
      note: `recalé le ${dateRef} sur test réel du ${dernierTest.date} (journal)`,
    };
    delete rb.vdot_estime; // l'hypothèse de niveau ne sert plus, on a du réel
  }
  pousser("Volume de départ (km/sem)", r.volume_actuel_km_sem, volumeReel);
  pousser("Longue sortie de départ (km)", r.longue_sortie_actuelle_km, longueReel);
  pousser("Charge moyenne 42 j de départ (CE)", r.charge_42j_depart, charge42jReel);
  rb.volume_actuel_km_sem = volumeReel;
  rb.longue_sortie_actuelle_km = longueReel;
  rb.charge_42j_depart = charge42jReel;

  // Les hypothèses running désormais remplacées par du réel n'ont plus lieu d'être.
  const obsoletes = [/volume actuel/i, /longue sortie/i, /\bctl\b/i];
  if (dernierTest) obsoletes.push(/temps de référence/i, /vdot/i);
  maj.hypotheses = (maj.hypotheses ?? []).filter((h) => !obsoletes.some((re) => re.test(h)));

  return { applique: true, changements, recaleSurTest: Boolean(dernierTest), dateReference: dateRef };
}

/**
 * Recalage MUSCU (symétrie du recalage running) : persiste dans `maj.muscu.charges_reference`
 * la dernière charge de travail réellement encaissée par exercice, pour que le prochain `gen`
 * muscu reparte du réel plutôt que sans repère de charge (double progression, veille/02 §4).
 * Mute `maj` en place et renvoie le sous-résultat.
 */
function recalerMuscuInterne(persona, journal, maj, referentiel) {
  const seances = journal.seances_muscu ?? [];
  if (!seances.length) {
    return { applique: false, statut: "aucune_donnee_muscu", pourquoi: "Aucune séance de muscu dans le journal : aucune charge réelle à réinjecter dans le persona (veille/02 §4)." };
  }
  const ancrages = ancragesMuscu(seances);
  if (!ancrages.size) {
    return { applique: false, statut: "donnees_insuffisantes_muscu", pourquoi: "Séances de muscu présentes mais sans charge/reps exploitables : rien à recaler côté charges (veille/02 §4)." };
  }
  const dateRef = journal.periode?.fin ?? [...seances].map((s) => s.date).sort().at(-1);
  const mb = (maj.muscu = { ...(maj.muscu ?? {}) });
  const ref = { ...(mb.charges_reference ?? {}) };
  const changements = [];
  for (const [nom, a] of ancrages) {
    const avant = ref[nom]?.charge_kg ?? null;
    ref[nom] = { charge_kg: a.charge_kg, reps: a.reps, ...(a.rir != null ? { rir: a.rir } : {}), date: a.date };
    if (avant !== a.charge_kg) changements.push({ quoi: `Charge de départ « ${nom} » (kg)`, avant: avant ?? "—", apres: a.charge_kg });
  }
  mb.charges_reference = ref;

  // Recalage des PRIORITÉS depuis les tendances observées : un muscle qui stagne dans la
  // durée (≥ 3 séances, pas de progression de 1RM estimé) réclame plus de VOLUME — le
  // levier n°1 (veille/02 §1) — donc on l'ajoute aux priorités que `gen` traduira en
  // +1 série sur ses exercices principaux. Un muscle qui progresse : on ne touche à rien.
  const tendances = tendancesMuscu(seances, referentiel);
  if (tendances.suffisant) {
    const prioritesActuelles = mb.priorites ?? persona.muscu.priorites ?? [];
    const dejaPrioritaire = new Set(prioritesActuelles);
    // Garde-fou : une baisse SYSTÉMIQUE (≥ 2 exercices en régression) = fatigue globale →
    // deload, pas ajout de volume (veille/02 §5 & §7). On ne bump alors aucune priorité.
    const fatigueSystemique = tendances.regressions >= 2;
    const candidats = fatigueSystemique
      ? []
      : tendances.muscles
          .filter((m) => m.statut === "stagnation" && !MUSCLES_ACCESSOIRES.includes(m.muscle) && !dejaPrioritaire.has(m.muscle))
          .map((m) => m.muscle)
          .slice(0, 2); // au plus 2 nouvelles priorités/run (rendements décroissants, veille/02 §1)
    if (candidats.length) {
      mb.priorites = [...prioritesActuelles, ...candidats];
      for (const muscle of candidats) {
        changements.push({ quoi: `Priorité muscu « ${muscle} »`, avant: "—", apres: "stagnation observée → +volume (veille/02 §1)" });
      }
    }
  }

  return { applique: true, changements, dateReference: dateRef, tendances };
}

/**
 * Dernier maillon de la boucle : persiste le persona « recalé sur le réel ». Réinjecte
 * dans le persona les valeurs RÉELLES observées dans le journal — côté RUNNING (VDOT via
 * le dernier test chrono, volume/longue/moyenne 42 j de départ = charge récemment encaissée) ET côté
 * MUSCU (dernière charge de travail par exercice) — pour que le prochain `gen` reparte du
 * réel sans réédition manuelle ; la boucle générer→observer→adapter→re-générer se referme
 * (veille/02 §4, veille/03 §6, veille/12 §8).
 *
 * Fonction PURE : prend le persona BRUT (tel que sur disque) + le journal, renvoie un
 * persona brut mis à jour (fichier lisible, sans défauts/hypothèses résolus) + le diff.
 * L'écriture disque est laissée au CLI. Traite tous les modules présents (running et/ou muscu).
 */
export function recalerPersona(personaBrut, journal, referentiel) {
  const persona = normaliserPersona(personaBrut); // valeurs de référence résolues
  // 🔒 VERROU D'IDENTITÉ — le chemin le PLUS dangereux du moteur, et il était le moins protégé.
  // `recaler` ÉCRIT dans le persona : les charges de travail réelles, le VDOT, le volume. Croiser
  // un journal étranger revenait à prescrire à quelqu'un le développé couché d'un autre humain —
  // et le moteur le faisait en affichant une coche verte (cf. charge.js).
  verifierProprietaireJournal(persona, journal);
  if (!persona.running && !persona.muscu) {
    return { statut: "hors_perimetre", pourquoi: "Ce persona n'a ni bloc running ni bloc muscu : rien à recaler (nutrition seule = pas de charges/allures à persister)." };
  }

  // On repart du BRUT pour garder un persona lisible (pas les défauts résolus par la
  // normalisation) ; on n'écrase que ce qu'on a mesuré. Chaque sous-routine mute `maj`.
  const maj = structuredClone(personaBrut);
  const changements = [];
  const sousStatuts = {};
  let recaleSurTest = false;
  let dateReference = journal.periode?.fin ?? null;
  let appliqueCount = 0;

  for (const [module, res] of [
    persona.running ? ["running", recalerRunningInterne(persona, journal, maj)] : null,
    persona.muscu ? ["muscu", recalerMuscuInterne(persona, journal, maj, referentiel)] : null,
  ].filter(Boolean)) {
    if (res.applique) {
      appliqueCount++;
      changements.push(...res.changements);
      if (res.recaleSurTest) recaleSurTest = true;
      if (res.dateReference) dateReference = res.dateReference;
    } else {
      sousStatuts[module] = { statut: res.statut, pourquoi: res.pourquoi };
    }
  }

  // Rien d'applicable : relayer le statut du seul module concerné (rétro-compat), sinon agréger.
  if (appliqueCount === 0) {
    const modules = Object.keys(sousStatuts);
    if (modules.length === 1) return sousStatuts[modules[0]];
    return { statut: "rien_a_recaler", details: sousStatuts, pourquoi: "Ni le running ni la muscu n'ont assez de données réelles pour recaler (voir details) — continuer à logguer." };
  }

  // Trace d'audit datée (le persona reste auto-documenté) — une entrée agrégée par run,
  // uniquement si au moins une valeur a bougé (sinon le persona était déjà aligné).
  if (changements.length) {
    maj.recalages = [
      ...(maj.recalages ?? []),
      { date: dateReference, periode: journal.periode ?? null, recale_sur_test: recaleSurTest, changements },
    ];
  }

  return {
    statut: "ok",
    persona: maj,
    changements,
    date_reference: dateReference,
    recale_sur_test: recaleSurTest,
    pourquoi:
      "Persona réécrit sur les données RÉELLES du journal (running : VDOT/volume/longue/charge moyenne 42 j ; muscu : dernières charges de travail par exercice) — le prochain `gen` repart du réel sans réédition manuelle ; la boucle générer→observer→adapter→re-générer se referme (veille/02 §4, veille/03 §6, veille/12 §8).",
  };
}

// ---------------------------------------------------------------- nutrition

// Tendance de poids attendue (kg/sem) par objectif — dérivée des cibles caloriques
// de la veille/04 §2 (≈ 7 700 kcal/kg) : ±250 kcal/j ≈ ±0,23 kg/sem.
// @chiffre-derive Les bornes (0,1 · 0,35 · 0,25 · 0,5 · 0,2 kg/sem) ne figurent PAS telles quelles
// dans veille/04 §2 : elles sont CALCULÉES depuis les deltas caloriques de la section et
// l'équivalent énergétique du tissu (≈ 7 700 kcal/kg), puis arrondies. Dérivation, pas citation.
const TENDANCE_ATTENDUE = {
  prise_de_muscle: { min: 0.1, max: 0.35 },
  perte_de_gras: { min: -0.5, max: -0.25 },
  recomposition: { min: -0.2, max: 0.2 },
  maintien: { min: -0.2, max: 0.2 },
  maintien_prepa: { min: -0.2, max: 0.2 },
};

/**
 * Boucle d'ajustement calorique sur la tendance réelle du poids (moyennes lissées
 * 7 j comparées sur ≥ 2 semaines), jamais sur une pesée isolée (veille/04 §4).
 */
export function adapterNutrition(persona, journal) {
  const pesees = [...(journal.pesees ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  if (pesees.length < 8) {
    return { statut: "insuffisant", pourquoi: "Moins de ~8 pesées : la tendance lissée n'est pas fiable, continuer à observer (veille/04 §4)." };
  }
  const debut = new Date(pesees[0].date + "T00:00:00Z");
  const fin = new Date(pesees.at(-1).date + "T00:00:00Z");
  const jours = (fin - debut) / JOUR_MS;
  if (jours < 14) {
    return { statut: "insuffisant", pourquoi: "Période < 2 semaines : trop tôt pour ajuster, le poids fluctue (eau, glycogène) — observer 2–3 semaines (veille/04 §4)." };
  }

  const moyenne = (arr) => arr.reduce((a, p) => a + p.kg, 0) / arr.length;
  const centre = (arr) => arr.reduce((a, p) => a + new Date(p.date + "T00:00:00Z").getTime(), 0) / arr.length;
  // Fenêtres de lissage de 7 JOURS (pas 7 pesées : avec des pesées espacées, 7 entrées
  // couvriraient bien plus d'une semaine et dilueraient la tendance) — veille/04 §4.
  const ts = (p) => new Date(p.date + "T00:00:00Z").getTime();
  const fenetreDebut = pesees.filter((p) => (ts(p) - debut.getTime()) / JOUR_MS < 7);
  const fenetreFin = pesees.filter((p) => (fin.getTime() - ts(p)) / JOUR_MS < 7);
  if (fenetreDebut.length < 3 || fenetreFin.length < 3) {
    return { statut: "insuffisant", pourquoi: "Moins de 3 pesées dans une des fenêtres de 7 j : moyenne lissée non fiable, se peser plus régulièrement (veille/04 §4)." };
  }
  const premiere = moyenne(fenetreDebut);
  const derniere = moyenne(fenetreFin);
  // Pente entre les CENTRES des deux fenêtres lissées (diviser par la période
  // totale sous-estimerait la tendance).
  const ecartJours = (centre(fenetreFin) - centre(fenetreDebut)) / JOUR_MS;
  if (ecartJours < 7) {
    return { statut: "insuffisant", pourquoi: "Fenêtres de lissage trop rapprochées (< 7 j d'écart) : tendance non fiable, continuer à observer (veille/04 §4)." };
  }
  const tendance = +(((derniere - premiere) / ecartJours) * 7).toFixed(2);

  const objectif = persona.nutrition.objectif;
  const attendu = TENDANCE_ATTENDUE[objectif] ?? TENDANCE_ATTENDUE.maintien;
  let ajustement, pourquoi;
  if (tendance > attendu.max) {
    ajustement = -150;
    pourquoi = `Tendance +${tendance} kg/sem au-dessus de la fourchette attendue pour « ${objectif} » (${attendu.min} à ${attendu.max}) → réduire de ~100–200 kcal/j (veille/04 §4).`;
  } else if (tendance < attendu.min) {
    ajustement = objectif === "maintien_prepa" ? 250 : 150;
    pourquoi = `Tendance ${tendance} kg/sem sous la fourchette attendue (${attendu.min} à ${attendu.max}) → ajouter ~${ajustement === 250 ? "200–300" : "100–200"} kcal/j${objectif === "maintien_prepa" ? " — déficit involontaire en pleine charge d'entraînement, piège du profil sec (veille/12 §5)" : ""} (veille/04 §4).`;
  } else {
    ajustement = 0;
    pourquoi = `Tendance ${tendance >= 0 ? "+" : ""}${tendance} kg/sem dans la fourchette attendue (${attendu.min} à ${attendu.max}) → ne rien changer (veille/04 §4).`;
  }

  // 🔴 FREIN RED-S — perte de poids trop rapide (veille/21 §7.4 : « > ~1 %/sem soutenue → REMONTER
  // les calories ; ne proposer JAMAIS d'accélérer »). Il complète le garde-fou générique de
  // veille/04 §9 (« alerter en cas de déficit trop agressif », sans chiffre).
  // ⚠️ Le seuil de 1 %/sem vit dans `red-s.js` (`SEUIL_PERTE_HEBDO_PCT`) : un fait dupliqué est un
  // fait qui divergera (philosophy §11).
  const pctSemaine = +((tendance / persona.profil.poids_kg) * 100).toFixed(2);
  let alerte = null;
  if (objectif === "perte_de_gras" ? pctSemaine < -SEUIL_PERTE_HEBDO_PCT : pctSemaine <= -0.5) {
    alerte = `Perte de ${Math.abs(pctSemaine)} % du poids de corps/sem${objectif === "perte_de_gras" ? ` — au-delà des ~${SEUIL_PERTE_HEBDO_PCT} %/sem au-delà desquels la veille demande de REMONTER les calories, jamais d'accélérer (veille/21 §7.4) : une perte trop rapide attaque la masse maigre et installe le terrain du RED-S` : ` alors que l'objectif est « ${objectif} » : déficit involontaire ≈ ${Math.round(Math.abs(tendance) * 7700 / 7)} kcal/j`} → vérifier l'apport réel et corriger sans attendre le prochain bilan (veille/04 §9).`;
  }
  // 🔴 Et le moteur ne propose JAMAIS de creuser davantage sur une perte déjà trop rapide.
  if (objectif === "perte_de_gras" && pctSemaine < -SEUIL_PERTE_HEBDO_PCT && ajustement < 0) ajustement = 0;

  return {
    statut: "ok",
    poids_lisse_debut: +premiere.toFixed(1),
    poids_lisse_fin: +derniere.toFixed(1),
    tendance_kg_sem: tendance,
    fourchette_attendue: attendu,
    ajustement_kcal: ajustement,
    alerte,
    suite:
      ajustement !== 0
        ? "Ceci est un PREMIER palier : re-mesurer la tendance lissée après 2–3 semaines au nouvel apport ; si elle reste hors fourchette, appliquer un palier supplémentaire — la boucle itère (veille/04 §4)."
        : "Prochain contrôle de tendance dans 2–3 semaines (veille/04 §4).",
    pourquoi,
  };
}

/** Bilan complet : n'adapte que les volets pour lesquels le journal a des données. */
export function genererBilan(persona, programmeMuscu, journal, referentiel) {
  // 🔒 VERROU D'IDENTITÉ — avant tout calcul. Un journal qui appartient à quelqu'un d'autre ne
  // franchit pas cette ligne : il contaminerait le facteur de calibration du RPE (le β), qui est
  // ajusté sur la perception d'UN individu. Voir charge.js.
  const proprietaire = verifierProprietaireJournal(persona, journal);
  const pour = persona?.id ?? persona?.nom ?? null;
  const aDesSeances = (journal.seances_muscu?.length ?? 0) + (journal.sorties_course?.length ?? 0) > 0;
  return {
    persona: persona.nom,
    periode: journal.periode ?? null,
    // L'appartenance du journal est REMONTÉE : quand elle n'est pas prouvable, le bilan le dit.
    journal_proprietaire: proprietaire,
    muscu: programmeMuscu ? adapterMuscu(programmeMuscu, journal, referentiel) : null,
    running: persona.running ? adapterRunning(persona, journal) : null,
    // CHARGE UNIFIÉE (ADR 0006) — filières force et endurance dans la MÊME unité (sRPE × durée),
    // gardées séparées et auditables. On additionne la charge ; on n'additionne pas la fatigue.
    charge_srpe: aDesSeances
      ? chargesHebdo(journal, { dureeDefautMuscu: persona.muscu?.duree_seance_min ?? null, pour })
      : null,
    // Le signal neuromusculaire local, SÉPARÉ par construction : la règle de placement a-t-elle
    // été tenue dans la vraie vie ? (Couche 2 de l'ADR — la seule qui ne demande aucune calibration.)
    // ⚠️ Durcie si une zone du BAS DU CORPS est ACTIVE : chaque empilement observé n'a alors pas
    // seulement gâché une séance — il a ajouté de l'excentrique sur une articulation douloureuse.
    placement: aDesSeances
      ? conflitsObserves(journal, referentiel, {
          zone_jambes_active: zoneJambesActive(validerLimitations(limitationsDe(persona)).valides),
        })
      : null,
    // ÉCHAUFFEMENT : la règle « limitation ACTIVE ⇒ non skippable » a-t-elle été tenue dans la vraie
    // vie ? Le skip est JOURNALISÉ (veille/18 §9.1, règle 1) — sans quoi « non skippable » ne serait
    // qu'un mot dans un document que personne n'applique.
    echauffement: observanceEchauffement(persona, journal),
    nutrition: adapterNutrition(persona, journal),
  };
}
