// Persistance légère d'un journal d'entraînement (pesées / séances muscu / sorties
// course / tests chrono) qui nourrit la boucle adaptative (src/lib/adaptation.js).
// Prototype offline : le journal est un fichier JSON local, appendé entrée par entrée
// depuis le CLI (`node src/cli.js log …`). En Phase 3 il sera alimenté par l'app/Strava.
//
// Ce module est PUR (pas d'I/O) : il valide et manipule un objet journal en mémoire.
// Le CLI se charge de lire/écrire le fichier. Ainsi le format d'entrée du `bilan`
// (cf. adaptation.js / docs/moteur.md) reste la seule source de vérité.

import { STATUTS_ECHAUFFEMENT_JOURNAL } from "./echauffement.js";

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_TEMPS = /^\d{1,2}:\d{2}(:\d{2})?$/;
const TYPES_SORTIE = new Set(["E", "M", "T", "I", "R"]);

/** Journal vierge au format attendu par `bilan` (adaptation.js). */
export function journalVide(persona = null) {
  return {
    persona,
    periode: { debut: null, fin: null },
    pesees: [],
    seances_muscu: [],
    sorties_course: [],
    tests_chrono: [],
  };
}

function exigerDate(date, champ = "date") {
  if (!RE_DATE.test(String(date ?? ""))) {
    throw new Error(`${champ} invalide « ${date ?? ""} » (attendu AAAA-MM-JJ).`);
  }
  if (Number.isNaN(Date.parse(date + "T00:00:00Z"))) {
    throw new Error(`${champ} « ${date} » n'est pas un jour valide.`);
  }
  return date;
}

function nombre(v, champ, { min = null, max = null, entier = false } = {}) {
  const n = Number(v);
  if (v == null || v === "" || Number.isNaN(n)) throw new Error(`${champ} : nombre attendu (reçu « ${v ?? ""} »).`);
  if (min != null && n < min) throw new Error(`${champ} : doit être ≥ ${min} (reçu ${n}).`);
  if (max != null && n > max) throw new Error(`${champ} : doit être ≤ ${max} (reçu ${n}).`);
  if (entier && !Number.isInteger(n)) throw new Error(`${champ} : entier attendu (reçu ${n}).`);
  return n;
}

/**
 * RPE de séance — échelle de **Foster (CR-10, 0–10)**, recueilli **~30 min après** la séance.
 *
 * C'est LA donnée qui porte le modèle de charge (ADR 0006) : `charge = rpe × duree_min`, la même
 * formule pour un squat et pour un 10 km. C'est la seule grandeur définie à l'identique dans les
 * deux filières — la conversion force↔endurance est faite par la **perception de l'athlète**, pas
 * par une constante inventée.
 *
 * `specs/data-model.md` §9 la déclare **obligatoire** sur toute séance réalisée. Le journal ne la
 * REFUSE pas quand elle manque (les journaux déjà écrits et les imports Strava n'en ont pas), mais
 * son absence a un coût, et le coût est déclaré : le moteur doit alors **imputer** le RPE depuis
 * les RIR (charge.js `estimerRPE`) et marque toute la charge de la séance comme **estimée**.
 */
function rpeSeance(v, champ = "rpe_seance") {
  return nombre(v, champ, { min: 0, max: 10 });
}

function trierParDate(liste) {
  return liste.sort((a, b) => a.date.localeCompare(b.date));
}

/** Recalcule periode.debut / periode.fin depuis toutes les entrées datées. */
export function recalculerPeriode(journal) {
  const dates = [
    ...(journal.pesees ?? []),
    ...(journal.seances_muscu ?? []),
    ...(journal.sorties_course ?? []),
    ...(journal.tests_chrono ?? []),
  ].map((e) => e.date).filter(Boolean).sort();
  journal.periode = dates.length ? { debut: dates[0], fin: dates.at(-1) } : { debut: null, fin: null };
  return journal;
}

// ------------------------------------------------------------------ ajouts

/** Une pesée par jour : ré-enregistrer la même date remplace (log idempotent). */
export function ajouterPesee(journal, { date, kg }) {
  exigerDate(date);
  const poids = nombre(kg, "kg", { min: 20 });
  journal.pesees = (journal.pesees ?? []).filter((p) => p.date !== date);
  journal.pesees.push({ date, kg: +poids.toFixed(2) });
  trierParDate(journal.pesees);
  return recalculerPeriode(journal);
}

/**
 * Une sortie de course. `rpe_seance` (Foster 0–10) porte la charge, exactement comme en muscu.
 * `denivele_m` (D+) n'est PAS une décoration : la descente est **excentrique** → dommages
 * musculaires → la course cesse d'être une fatigue purement métabolique. C'est un signal de
 * fatigue **neuromusculaire**, décisif pour le trail — et qu'une charge calculée sur la seule
 * ALLURE (la nôtre comme celle de TrainingPeaks) ignore complètement (ADR 0006 §1.5 & §7).
 *
 * ⚠️ `denivele_negatif_m` (D−) — **c'est LUI la contrainte**, et le moteur le PLANIFIE désormais
 * (denivele.js). Il faut donc pouvoir l'**observer** : boucler la boucle générer → observer.
 * 🔴 **JAMAIS `0`.** `null` (« je ne sais pas ») et `0` (« il n'y en a pas ») sont deux affirmations
 * différentes. Un zéro faux **éteint le seul signal de fatigue mesurable** de ce moteur — on le
 * refuse à l'entrée plutôt que de le découvrir six semaines plus tard dans une courbe plate.
 */
export function ajouterSortie(journal, { date, km, duree_min, type = "E", rpe_seance = null, denivele_m = null, denivele_negatif_m = null }) {
  exigerDate(date);
  const t = String(type).toUpperCase();
  if (!TYPES_SORTIE.has(t)) throw new Error(`type de sortie « ${type} » inconnu (attendu : ${[...TYPES_SORTIE].join(", ")}).`);
  if (denivele_negatif_m === 0 || denivele_negatif_m === "0") {
    throw new Error(
      "`denivele_negatif_m: 0` — un **zéro faux éteint le seul signal de fatigue mesurable** (la descente est EXCENTRIQUE : " +
        "c'est ELLE la contrainte, ADR 0006 §1.5). Si tu ne connais pas le D− de cette sortie, **ne renseigne rien** : " +
        "« je ne sais pas » et « il n'y en a pas » ne sont pas la même chose."
    );
  }
  const entree = {
    date,
    km: +nombre(km, "km", { min: 0 }).toFixed(2),
    duree_min: +nombre(duree_min, "duree_min", { min: 0 }).toFixed(1),
    type: t,
  };
  if (rpe_seance != null && rpe_seance !== "") entree.rpe_seance = rpeSeance(rpe_seance);
  if (denivele_m != null && denivele_m !== "") entree.denivele_m = Math.round(nombre(denivele_m, "denivele_m", { min: 0 }));
  if (denivele_negatif_m != null && denivele_negatif_m !== "") {
    entree.denivele_negatif_m = Math.round(nombre(denivele_negatif_m, "denivele_negatif_m", { min: 1 }));
  }
  journal.sorties_course = journal.sorties_course ?? [];
  journal.sorties_course.push(entree);
  trierParDate(journal.sorties_course);
  return recalculerPeriode(journal);
}

export function ajouterTest(journal, { date, distance_m, temps }) {
  exigerDate(date);
  if (!RE_TEMPS.test(String(temps ?? ""))) throw new Error(`temps invalide « ${temps ?? ""} » (attendu MM:SS ou HH:MM:SS).`);
  const entree = { date, distance_m: nombre(distance_m, "distance_m", { min: 1 }), temps: String(temps) };
  journal.tests_chrono = journal.tests_chrono ?? [];
  journal.tests_chrono.push(entree);
  trierParDate(journal.tests_chrono);
  return recalculerPeriode(journal);
}

/**
 * Une séance muscu = date + exercices [{ nom, charge_kg, reps:[…], rir? }].
 *
 * `rpe_seance` (Foster 0–10) + `duree_min` sont le **socle de la charge unifiée** : ensemble ils
 * donnent `load_au = rpe × duree_min`, la même formule que pour une sortie de course (ADR 0006).
 * Sans eux, le moteur doit imputer, et il le déclare. `seance` (nom du bloc, ex. « Upper A »)
 * reste optionnel mais utile à la lecture.
 *
 * `echauffement` (« fait » | « partiel » | « saute ») : **la skippabilité doit être journalisée**
 * (veille/18 §9.1, règle 1). Ce n'est pas de la bureaucratie — l'effet de l'échauffement sur les
 * blessures est **modulé par l'observance**, donc un protocole dont on ne sait pas s'il est fait
 * ne peut être ni évalué ni ajusté. Le champ reste **optionnel** : le moteur compte « non
 * renseigné » plutôt que d'imputer (il n'invente rien, même ici).
 */
export function ajouterSeanceMuscu(journal, { date, seance = null, rpe_seance = null, duree_min = null, echauffement = null, exercices }) {
  exigerDate(date);
  if (!Array.isArray(exercices) || exercices.length === 0) throw new Error("séance muscu : au moins un exercice attendu.");
  const exNorm = exercices.map((e) => {
    if (!e.nom || !String(e.nom).trim()) throw new Error("exercice : nom manquant.");
    if (!Array.isArray(e.reps) || e.reps.length === 0) throw new Error(`exercice « ${e.nom} » : liste de reps attendue.`);
    const reps = e.reps.map((r) => nombre(r, `reps de « ${e.nom} »`, { min: 0, entier: true }));
    const ex = { nom: String(e.nom).trim(), charge_kg: +nombre(e.charge_kg, `charge de « ${e.nom} »`, { min: 0 }).toFixed(2), reps };
    if (e.rir != null && e.rir !== "") ex.rir = nombre(e.rir, `rir de « ${e.nom} »`, { min: 0, entier: true });
    return ex;
  });
  const entree = { date, seance: seance || null, exercices: exNorm };
  if (rpe_seance != null && rpe_seance !== "") entree.rpe_seance = rpeSeance(rpe_seance);
  if (duree_min != null && duree_min !== "") entree.duree_min = +nombre(duree_min, "duree_min", { min: 0 }).toFixed(1);
  if (echauffement != null && echauffement !== "") {
    const e = String(echauffement).toLowerCase();
    if (!STATUTS_ECHAUFFEMENT_JOURNAL.includes(e)) {
      throw new Error(`echauffement « ${echauffement} » inconnu (attendu : ${STATUTS_ECHAUFFEMENT_JOURNAL.join(" | ")}).`);
    }
    entree.echauffement = e;
  }
  journal.seances_muscu = journal.seances_muscu ?? [];
  journal.seances_muscu.push(entree);
  trierParDate(journal.seances_muscu);
  return recalculerPeriode(journal);
}

/**
 * Ce qui MANQUE au journal pour que la charge unifiée tienne debout. Le moteur ne se contente pas
 * d'imputer en silence : il dit ce qu'il lui faudrait. (`specs/data-model.md` §9 : `rpe_seance`
 * est obligatoire sur toute séance réalisée — le journal l'accepte manquant, mais pas sans le dire.)
 */
export function donneesManquantes(journal) {
  const trous = [];
  for (const s of journal?.seances_muscu ?? []) {
    const manque = [];
    if (s.rpe_seance == null) manque.push("rpe_seance");
    if (s.duree_min == null) manque.push("duree_min");
    if (manque.length) trous.push({ type: "seance_muscu", date: s.date, quoi: s.seance ?? "séance", manque });
  }
  for (const s of journal?.sorties_course ?? []) {
    if (s.rpe_seance == null) trous.push({ type: "sortie_course", date: s.date, quoi: `Sortie ${s.type ?? "E"}`, manque: ["rpe_seance"] });
  }
  return trous;
}
