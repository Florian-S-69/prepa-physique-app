// Générateur de plan running (5K → marathon) — règles issues de :
//   docs/veille/03-science-running.md  (80/20, VDOT, charge d'endurance, garde-fous volume)
//   docs/veille/12-prepa-marathon.md   (durée de plan, longue sortie, nutrition course, taper)
//   docs/veille/11-entrainement-hybride.md (placement salle vs séances-clés)
// Générique : le persona (normalisé par personne.js) et la table DISTANCES pilotent tout.

import { estimerVdot, alluresEntrainement, allurePourFraction, tempsPredit, parseTemps, allureMarathonConservatrice } from "./vdot.js";
import { DISTANCES } from "./distances.js";
import { chargeEndurance, simulerCharge } from "./charge.js";
import { analyserSemaine, signauxDescente, jambesLourdesSortie, FENETRE_NM, FENETRE_DESCENTE, JOURS_SEMAINE } from "./placement.js";
import { appliquerLimitationsCourse } from "./limitations.js";
import { recommandationCadence } from "./cadence.js";
import {
  TERRAINS,
  PAS_GRADUEL,
  PAS_GRADUEL_SOURCE,
  NON_SOURCE_DENIVELE,
  AVEUGLEMENT_DESCENTE,
  RECUP_DESCENTE,
  EFFET_REPETE,
  SPECIFICITE_PROTEGE,
  CONVERSION_DPLUS_KM,
  INTERDITS_DENIVELE,
  planifierDenivele,
  repartirDenivele,
  deniveleCourse,
  raisonNonPlanifie,
} from "./denivele.js";

const JOUR_MS = 24 * 3600 * 1000;

// La table des distances vit dans `distances.js` (module SANS dépendance) : `personne.js` en a
// besoin pour pondérer les performances, et `personne.js → running.js` serait un cycle d'imports.
// Ré-exportée ici : aucun appelant historique ne casse.
export { DISTANCES };

function lundiSuivant(date) {
  const d = new Date(date);
  const decalage = (8 - d.getDay()) % 7 || 7;
  return new Date(d.getTime() + decalage * JOUR_MS);
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

/** Allure médiane d'une zone (min/km) pour convertir km → durée. */
function allureMediane(vdot, zone) {
  const fractions = { E: 0.695, M: 0.82, T: 0.9, I: 0.975, R: 1.065 };
  return allurePourFraction(vdot, fractions[zone]);
}

/**
 * Progression du volume hebdo : +≤10 % par rapport à la dernière semaine de charge
 * (garde-fou souple, veille/03 §5 — `PAS_GRADUEL`), semaine de récupération (−25 %) toutes les
 * 4 semaines, puis affûtage (coefficients de la distance).
 *
 * ⚠️ `gel` — une limitation ACTIVE d'une zone que la course traverse (genou, hanche, cheville,
 * pied, tibia, bas du dos) **gèle** la progression du volume : le volume ne monte plus. La course
 * est un **impact répété** ; monter le volume sur une zone qui fait déjà mal, c'est ajouter des
 * cycles de charge là où ça fait mal. Le levier de prévention le mieux étayé côté course est la
 * **charge graduelle** (veille/03 §5) — ici, « graduelle » veut dire **plate**.
 * ⚠️ **Choix de sécurité produit ASSUMÉ**, pas une conclusion scientifique : aucune source ne dit
 * à partir de quel volume un genou douloureux « casse ». Le moteur n'invente donc aucun chiffre —
 * il gèle, et il le DIT (avec son coût : l'objectif chrono passe au second plan).
 *
 * ⚠️ `alterner` — **LA RÈGLE**, et elle est encodée ICI, dans la GÉNÉRATION, pas dans un
 * avertissement de fin de page : **on ne monte JAMAIS le volume ET le dénivelé la même semaine.**
 * Deux variables, deux progressions. Chaque semaine de charge porte donc `monte` : la variable —
 * **une seule** — qui a le droit d'augmenter cette semaine-là.
 *   • `alterner = false` (plan route) → `monte` vaut toujours `"volume"` : **comportement
 *     historique, à l'identique**. Un plan route reste un plan route.
 *   • `alterner = true`  (dénivelé planifié) → volume et dénivelé montent **à tour de rôle**, en
 *     commençant par le volume. Le volume monte donc **deux fois moins vite** — c'est le **prix**
 *     de la spécificité trail, et il est **assumé** (pas un bug : un plan trail n'est pas un plan
 *     route avec des côtes).
 */
function planifierVolumes(volumeDepart, nbSemaines, taper, { gel = false, alterner = false } = {}) {
  const volumes = [];
  let charge = volumeDepart;
  const semainesCharge = nbSemaines - taper.length;
  let pic = volumeDepart;
  let hausses = 0; // compte les semaines où QUELQUE CHOSE monte → pilote l'alternance
  for (let i = 0; i < semainesCharge; i++) {
    const estRecup = (i + 1) % 4 === 0 && i < semainesCharge - 1;
    if (i === 0) {
      // Semaine 0 = le point de départ. Rien ne « monte » : c'est la base mesurée.
      volumes.push({ km: charge, type: "charge", monte: null });
    } else if (estRecup) {
      volumes.push({ km: Math.round(charge * 0.75), type: "recuperation", monte: null });
    } else {
      // Qui a le droit de monter cette semaine ? Une seule variable — jamais les deux.
      const monte = gel ? null : !alterner || hausses % 2 === 0 ? "volume" : "denivele";
      if (monte === "volume") charge = Math.round(charge * PAS_GRADUEL);
      volumes.push({ km: charge, type: "charge", gele: gel, monte });
      hausses++;
    }
    pic = Math.max(pic, volumes[volumes.length - 1].km);
  }
  taper.forEach((coef, i) => {
    volumes.push({
      km: Math.round(pic * coef),
      type: i === taper.length - 1 ? "course" : "affutage",
      monte: null,
      coef,
    });
  });
  return { volumes, pic };
}

/**
 * Progression de la longue sortie : +pas les semaines où le VOLUME monte, récup alignée, plafond,
 * taper.
 *
 * ⚠️ La longue sortie est du **volume** : elle ne monte donc que les semaines `monte === "volume"`.
 * Les semaines « dénivelé », elle reste **plate** — sinon la règle « jamais les deux la même
 * semaine » serait contournée par la porte de derrière (allonger la longue sortie ET y ajouter du
 * D+, c'est monter les deux).
 *
 * ⚠️ `gel` — si le volume est gelé, la LONGUE SORTIE l'est aussi. Ce n'est pas cosmétique : la
 * longue sortie est la séance où l'impact s'accumule le plus. La geler sans geler le volume (ou
 * l'inverse) serait une demi-mesure — et une demi-mesure sur une zone douloureuse est un mensonge.
 */
function planifierLonguesSorties(lsDepart, volumes, d, { gel = false } = {}) {
  const sorties = [];
  let charge = lsDepart;
  for (let i = 0; i < volumes.length; i++) {
    const v = volumes[i];
    if (v.type === "charge") {
      if (i > 0 && !gel && v.monte === "volume") charge = Math.min(charge + d.pas_ls, d.ls_plafond + d.pas_ls);
      sorties.push(Math.min(charge, d.ls_plafond));
    } else if (v.type === "recuperation") {
      sorties.push(Math.max(lsDepart, Math.round(sorties[sorties.length - 1] * 0.7)));
    } else if (v.type === "affutage") {
      sorties.push(gel ? lsDepart : Math.max(Math.round(d.ls_plafond * 0.6), lsDepart));
    } else {
      sorties.push(d.km); // semaine de course : la "longue" EST la course
    }
  }
  return sorties;
}

// ═══ 🎯 CE QUE LE PROFIL CHANGE AU PLAN ═════════════════════════════════════════════════════════
//
// Détecter un déficit d'endurance et **ne rien en faire** serait un diagnostic de vitrine. Le profil
// (`performances.js`) pilote donc **deux leviers réels** de la génération :
//
//   1. **La longueur de la phase de BASE** (E-dominante) — ci-dessous.
//   2. **La zone de la séance de qualité** — `seanceQualite`.
//
// **Déficit d'ENDURANCE** → **volume et allure facile, pas de fractionné.** Ce qui manque n'est pas
// le moteur aérobie (la perf courte le prouve) mais la **capacité à le soutenir** : base **allongée**,
// et la séance de qualité **n'est pas orientée vers l'intervalle** (sur 5K/10K, le bloc I devient un
// bloc **T** : on construit le seuil avant le plafond).
// **Déficit de VITESSE** → l'inverse : base **raccourcie**, qualité orientée **INTERVALLE (I)**.
//
// @chiffre-derive ⚠️ **Les fractions 0,6 / 0,5 / 0,4 ne sont PAS dans la veille** — elle ne donne
// aucune règle de répartition base/spécifique en fonction d'un profil de coureur. Ce qui EST sourcé :
// (a) la **distribution 80/20** (veille/03 §1) — la base est le lieu du volume facile ; (b) la
// **spécificité** (veille/12 §3–§4) — le spécifique est le lieu de l'allure de course. Le moteur en
// déduit un **curseur**, et **0,5 est le comportement historique** (`Math.floor(n / 2)`, inchangé
// pour tout profil non diagnostiqué : **zéro régression**). ±0,1 est une **décision d'ingénierie**,
// délibérément **modeste** : on incline le plan, on ne le renverse pas sur un diagnostic tiré de
// deux ou trois courses.
const PART_BASE = { deficit_endurance: 0.6, deficit_vitesse: 0.4 };

/** Nombre de semaines de phase BASE. Profil non diagnostiqué → EXACTEMENT le comportement historique. */
function semainesBase(nbSemaines, taper, profilCode) {
  const chargeables = nbSemaines - taper.length;
  const part = PART_BASE[profilCode];
  if (part == null) return Math.max(Math.floor(chargeables / 2), 1); // historique, à l'identique
  return Math.max(Math.min(Math.round(chargeables * part), chargeables - 1), 1);
}

/**
 * Séance qualité selon la phase, la distance et le PROFIL (une seule séance dure/sem, veille/03 §1).
 *
 * ⚠️ `profilCode` absent / `equilibre` / `indetermine` → comportement **historique**, à l'identique.
 */
function seanceQualite(vdot, phase, d, profilCode = null) {
  const alE = allureMediane(vdot, "E");
  const courte = d.km <= 10;
  // 🎯 Déficit d'ENDURANCE sur une distance courte : le spécifique passait par la VO₂max (zone I).
  // On le remplace par du **seuil (T)** — ce coureur n'a pas besoin d'un plafond plus haut, il a
  // besoin de **tenir** celui qu'il a. Construire le seuil avant le plafond (veille/03 §1 : le
  // volume facile et le seuil portent l'endurance ; l'intervalle porte le plafond).
  const intervalle = courte && profilCode !== "deficit_endurance";
  if (phase === "specifique" && intervalle) {
    // 5K/10K : le spécifique passe par la VO₂max (zone I, veille/03 §2)
    const nbReps = d.km <= 5 ? 5 : 6;
    return {
      contenu: `Qualité : 2 km E + ${nbReps} × 1 000 m en I (récup 2–3 min trot) + 2 km E`,
      segments: [
        { zone: "E", duree_min: 2 * alE, km: 2 },
        { zone: "I", duree_min: nbReps * allureMediane(vdot, "I"), km: nbReps },
        { zone: "E", duree_min: 2 * alE, km: 2 },
      ],
      km: 4 + nbReps,
    };
  }
  // 🎯 Déficit de VITESSE sur une distance LONGUE (semi/marathon) : la qualité restait au seuil (T).
  // Ce coureur tient déjà l'effort — ce qui lui manque est le **plafond**. Le spécifique passe donc
  // par l'**INTERVALLE (I)**, ce que le plan historique ne faisait jamais au-delà de 10 km.
  if (phase === "specifique" && !courte && profilCode === "deficit_vitesse") {
    const nbReps = 6;
    return {
      contenu: `Qualité : 2 km E + ${nbReps} × 1 000 m en I (récup 2–3 min trot) + 2 km E — **orientée VITESSE** : ton endurance est en avance sur ton plafond`,
      segments: [
        { zone: "E", duree_min: 2 * alE, km: 2 },
        { zone: "I", duree_min: nbReps * allureMediane(vdot, "I"), km: nbReps },
        { zone: "E", duree_min: 2 * alE, km: 2 },
      ],
      km: 4 + nbReps,
    };
  }
  const tKm = phase === "affutage" ? 3 : phase === "base" ? 4 : 5;
  return {
    contenu: `Qualité : 2 km E + ${tKm} km T + 2 km E`,
    segments: [
      { zone: "E", duree_min: 2 * alE, km: 2 },
      { zone: "T", duree_min: tKm * allureMediane(vdot, "T"), km: tKm },
      { zone: "E", duree_min: 2 * alE, km: 2 },
    ],
    km: 4 + tKm,
  };
}

/**
 * Vue « placement » d'un jour : porte-t-il des jambes lourdes, et/ou une séance de course à
 * protéger ? C'est l'entrée de `analyserSemaine` (placement.js).
 *
 * ⚠️ Depuis que le moteur **planifie** du dénivelé, une sortie du plan peut elle-même laisser des
 * **jambes lourdes** : la descente est **EXCENTRIQUE** (ADR 0006 §1.5). On réutilise la fonction
 * **déjà sourcée et déjà testée** `jambesLourdesSortie` (placement.js) — pas une seconde heuristique
 * qui divergerait de la première.
 *
 * ⚠️ **Le piège, et il est réel** : une longue sortie vallonnée est à la fois la **source** des
 * jambes lourdes et la **séance-clé à protéger**. Elle ne doit pas entrer en conflit **avec
 * elle-même** — mais son D+ **doit** peser sur les jours **suivants** (c'est là qu'il compte : la
 * séance de qualité du mardi paie la descente du dimanche). L'exclusion est donc faite **sur la
 * paire** (écart 0 j) dans `analyserSemaine`, **pas** en effaçant le signal du jour — exactement
 * comme `conflitsObserves` le fait déjà côté journal. Les deux faces du moteur disent la même chose.
 */
function jourPlacement(jour, s) {
  const muscu = s?.jambes_lourdes ? { origine: "muscu", quoi: "renfo jambes en salle", exercices: [], series: null } : null;
  const dSortie = s?.km ? jambesLourdesSortie(s) : null;
  return {
    jour,
    // La salle prime comme SOURCE si les deux tombent le même jour (elle porte l'exclusion « même
    // jour » qui, elle, doit rester active).
    jambes_lourdes: muscu ?? dSortie,
    // ⛰️ La DESCENTE est portée à part : quand la salle « prime » ci-dessus, elle ne doit pas
    // disparaître du radar. C'est elle que `signauxDescente` lit (veille/20 §9.4).
    descente: dSortie,
    course_qualitative: s?.qualitative ? { quoi: s.type === "longue" ? "la longue sortie" : "la séance de qualité", motif: s.type } : null,
  };
}

function vuePlacement(semaine) {
  return JOURS_SEMAINE.map((jour) => jourPlacement(jour, semaine.get(jour)));
}

/**
 * Compose la semaine : qualité mardi + longue dimanche + footings E pour compléter
 * le volume selon les jours dispo ; salle placée selon veille/11 (jambes loin des
 * séances-clés).
 */
function composerSemaine(vdot, volume_km, longue_km, phase, d, joursCourse, salleParSemaine, { zone_jambes_active = null, denivele_m = 0, profil = null } = {}) {
  const optsPlacement = { zone_jambes_active };
  const alE = allureMediane(vdot, "E");
  const alM = allureMediane(vdot, "M");

  const kmM = d.fin_M && longue_km >= d.fin_M && phase === "specifique" ? Math.min(6, Math.max(4, longue_km - d.fin_M + 4)) : 0;
  const segmentsLongue =
    kmM > 0
      ? [
          { zone: "E", duree_min: (longue_km - kmM) * alE, km: longue_km - kmM },
          { zone: "M", duree_min: kmM * alM, km: kmM },
        ]
      : [{ zone: "E", duree_min: longue_km * alE, km: longue_km }];

  const qualite = seanceQualite(vdot, phase, d, profil);
  const resteKm = Math.max(volume_km - longue_km - qualite.km, 0);
  const joursFaciles = ["Jeudi", "Samedi", "Mercredi"].slice(0, Math.max(joursCourse - 2, 0));
  const kmFacile = joursFaciles.map(() => (joursFaciles.length ? Math.floor(resteKm / joursFaciles.length) : 0));
  if (kmFacile.length) kmFacile[0] += resteKm - kmFacile.reduce((a, b) => a + b, 0);

  const semaine = new Map();
  // `qualitative` : la séance-clé de course que la contrainte de placement doit PROTÉGER
  // (veille/11 §3 : « une séance de qualité de course — ou une longue sortie »).
  semaine.set("Mardi", { jour: "Mardi", type: "qualite", qualitative: true, ...qualite });
  semaine.set("Dimanche", {
    jour: "Dimanche",
    type: "longue",
    qualitative: true,
    km_M: kmM,
    contenu: kmM > 0 ? `Longue sortie ${longue_km} km (dont ${kmM} derniers km à allure M) — répéter le ravitaillement (veille/12 §5)` : `Longue sortie ${longue_km} km en E`,
    segments: segmentsLongue,
    km: longue_km,
  });
  joursFaciles.forEach((jour, i) => {
    if (kmFacile[i] > 0) {
      semaine.set(jour, { jour, type: "facile", contenu: `Footing E ${kmFacile[i]} km`, segments: [{ zone: "E", duree_min: kmFacile[i] * alE, km: kmFacile[i] }], km: kmFacile[i] });
    }
  });

  // ⛰️ Le D+ de la semaine est réparti sur les sorties **AVANT** de placer la salle : une longue
  // sortie vallonnée laisse des **jambes lourdes** (la descente est EXCENTRIQUE, ADR 0006 §1.5),
  // et le placement du renfo jambes doit en tenir compte. L'ignorer reviendrait à protéger la
  // séance-clé de la salle… tout en la faisant précéder d'une descente de 800 m.
  repartirDenivele([...semaine.values()], denivele_m);
  for (const s of semaine.values()) {
    if (!s.denivele_m) continue;
    // ⚠️ Le D− est écrit **explicitement**, jamais sous-entendu : c'est LUI la contrainte.
    // Et l'allure cible est retirée de la consigne en dénivelé — les zones VDOT sont calibrées
    // sur le PLAT, la veille ne donne aucune équivalence allure↔pente. On court à l'EFFORT.
    s.contenu =
      `${s.contenu} · **${s.denivele_m} m D+ / ${s.denivele_negatif_m} m D−** ` +
      `— ⚠️ **la DESCENTE est la contrainte** (excentrique) ; à l'**effort**, pas à l'allure (le VDOT est calibré sur le plat)`;
  }

  // Salle — le lundi porte le HAUT du corps : aucune interférence avec la course, quel que soit
  // le reste de la semaine (veille/11 §2 : l'interférence force↔endurance est faible sur le haut).
  if (salleParSemaine >= 1) {
    semaine.set("Lundi", { jour: "Lundi", type: "salle", jambes_lourdes: false, contenu: "Salle — haut du corps (aucun conflit avec la course, veille/11 §2)" });
  }

  // Salle jambes — le jour n'est plus DÉCRÉTÉ (« mercredi, sinon vendredi ») : il est CALCULÉ.
  // On teste chaque jour candidat avec la contrainte de placement et on retient le premier qui
  // ne tombe pas dans la fenêtre 24–48 h avant une séance-clé (placement.js). En affûtage, la
  // séance devient un entretien léger : plus de jambes lourdes, donc plus de contrainte
  // (veille/11 §3, veille/12 §6).
  if (salleParSemaine >= 2) {
    const jambesLourdes = phase !== "affutage";
    const contenu = jambesLourdes
      ? "Salle — renfo jambes modéré (à distance de la qualité et de la longue, veille/11 §3)"
      : "Salle — entretien léger, réduire les jambes lourdes (veille/11 §3)";
    // Jours LIBRES d'abord (on n'écrase jamais un footing : ce serait perdre du volume). S'il n'y
    // en a pas, on double avec un footing FACILE — jamais avec une séance-clé (veille/11 §2 :
    // séparer de 6 h+). La séance-clé, elle, reste sanctuarisée.
    const libres = JOURS_SEMAINE.filter((j) => !semaine.has(j));
    const doublables = JOURS_SEMAINE.filter((j) => semaine.get(j)?.type === "facile");
    const candidats = libres.length ? libres : doublables;
    const evalue = candidats.map((jour) => {
      const essai = new Map(semaine);
      essai.set(jour, { ...(essai.get(jour) ?? { jour }), jour, jambes_lourdes: jambesLourdes });
      const a = analyserSemaine(vuePlacement(essai), optsPlacement);
      return { jour, conflits: a.conflits.length, limites: a.limites.length };
    });
    evalue.sort((a, b) => a.conflits - b.conflits || a.limites - b.limites);
    const retenu = evalue[0];
    if (retenu) {
      const existant = semaine.get(retenu.jour);
      semaine.set(
        retenu.jour,
        existant
          ? { ...existant, jambes_lourdes: jambesLourdes, salle: contenu, contenu: `${existant.contenu} · ${contenu} — séparer les deux de **6 h+** (veille/11 §2)` }
          : { jour: retenu.jour, type: "salle", jambes_lourdes: jambesLourdes, contenu }
      );
    }
  }

  return JOURS_SEMAINE.map((jour) => semaine.get(jour) ?? { jour, type: "repos", contenu: "Repos" });
}

// Cadence : le nudge — garde-fou blessure gratuit. ⚠️ Sa doctrine (et la PURGE des deux chiffres
// survendus qui le décoraient : Chan 2018 « −62 % », Luedke 2016 « ×6–7 sous 166 ») vit dans
// `cadence.js`. Un fait dupliqué est un fait qui divergera : ce fichier ne fait que l'utiliser.
// Ré-exporté ici pour ne pas casser les appelants historiques.
export { recommandationCadence };

/** % du volume couru en zone E (contrôle 80/20, veille/03 §1). */
function partFacile(seances) {
  let e = 0, total = 0;
  for (const s of seances) {
    for (const seg of s.segments ?? []) {
      total += seg.km;
      if (seg.zone === "E") e += seg.km;
    }
  }
  return total > 0 ? e / total : 1;
}

export function genererPlanRunning(persona, dateGeneration = new Date()) {
  const r = persona.running;
  const d = DISTANCES[r.objectif.distance];
  if (!d) throw new Error(`Distance « ${r.objectif.distance} » inconnue (attendu : ${Object.keys(DISTANCES).join(", ")}).`);
  if (!r.course?.date) throw new Error("Pas de date de course : impossible de dimensionner le plan (fournir running.course.date).");

  const dateCourse = new Date(r.course.date + "T00:00:00Z");
  const debut = lundiSuivant(dateGeneration);
  const nbSemaines = Math.ceil((dateCourse.getTime() - debut.getTime() + JOUR_MS) / (7 * JOUR_MS));
  if (nbSemaines < d.min_sem) {
    throw new Error(`Seulement ${nbSemaines} semaine(s) avant la course : trop court pour préparer un ${d.label} en sécurité (minimum ${d.min_sem}). Recommandation : course plus tardive ou distance plus courte.`);
  }

  const alertes = [];
  const planEcourte = nbSemaines < d.prep_sem[0];
  if (planEcourte) {
    alertes.push(
      `⚠️ ${nbSemaines} semaines disponibles, sous la fourchette recommandée de ${d.prep_sem[0]}–${d.prep_sem[1]} semaines pour un ${d.label} (veille/12 §2). Le plan vise "${r.objectif.but}" avec une montée en charge prudente ; l'objectif chrono passe au second plan. Toute semaine manquée doit décaler l'ambition, pas comprimer la progression.`
    );
  }

  // ═══ LE VDOT VIENT DÉSORMAIS DE LA RÉCONCILIATION ══════════════════════════════════════════
  // Il ne dérive plus d'UNE performance décrétée « la » référence, mais d'un **historique
  // pondéré** (`performances.js`) : la distance la plus proche de l'objectif pèse le plus
  // (veille/03 §2, veille/12 §4), les efforts non maximaux sont des **bornes inférieures** et les
  // sorties d'entraînement ne comptent **pas** comme des performances.
  // ⚠️ Fallback historique conservé : un persona non normalisé (tests unitaires anciens, appels
  // directs) continue de marcher exactement comme avant.
  const rec = r.reconciliation ?? null;
  const vdot = rec?.vdot ?? (r.temps_reference ? estimerVdot(r.temps_reference.distance_m, r.temps_reference.temps) : r.vdot_estime);
  const profilCode = rec?.profil?.code ?? null;
  const allures = alluresEntrainement(vdot);
  const predictionMin = tempsPredit(vdot, d.km * 1000);
  const allurePrudente = allureMediane(vdot, "M") + 25 / 60;
  const tempsPrudentMin = allurePrudente * d.km;

  // Allure marathon cible conservatrice : le VDOT surestime l'allure marathon des
  // coureurs lents/peu endurants (veille/03 §2, veille/12 §4). On ne corrige QUE
  // l'allure marathon cible (les allures d'ENTRAÎNEMENT E/M/T/I/R restent au VDOT,
  // acceptables sur des efforts courts — cf. source). Élite / distances < marathon :
  // pas de correction.
  //
  // 🔒 **LA CORRECTION CONSERVATRICE SURVIT — et elle est même MIEUX NOURRIE.** La distance de
  // référence n'est plus celle d'un champ unique, mais celle de la perf **retenue** par la
  // réconciliation. Chez un coureur qui déclare un semi, c'est le **semi** qui devient la
  // référence — donc `ref_endurante` devient vrai et la correction est **atténuée** (×0,3), ce
  // qui est exactement ce que la source demande : le VDOT issu d'un semi capte mieux la
  // décroissance d'allure qu'un VDOT issu d'un 10 K (veille/03 §2).
  const correctionMarathon =
    r.objectif.distance === "marathon"
      ? allureMarathonConservatrice(vdot, rec?.distance_reference_m ?? r.temps_reference?.distance_m ?? null)
      : null;

  // Objectif chrono : confronter la cible au niveau actuel (équivalence VDOT).
  let chrono = null;
  if (r.objectif.but === "chrono" && r.objectif.temps_cible) {
    const cibleMin = parseTemps(r.objectif.temps_cible);
    const realiste = cibleMin >= predictionMin * 0.97; // marge : une prépa fait progresser
    chrono = {
      temps_cible: r.objectif.temps_cible,
      allure_cible: cibleMin / d.km,
      realiste,
    };
    if (!realiste) {
      alertes.push(
        `⚠️ Objectif ${r.objectif.temps_cible} nettement plus rapide que l'équivalence du niveau actuel (VDOT ${vdot.toFixed(1)} → ≈ ${Math.round(predictionMin)} min) : viser d'abord le test chrono, puis réévaluer — courir au-dessus de son niveau le jour J est le meilleur moyen d'exploser (veille/03 §2, veille/12 §4).`
      );
    }
  }

  // ═══ LIMITATIONS × COURSE ════════════════════════════════════════════════════════════════
  // Le trou historique : `limitations` n'adaptait QUE la musculation. Un coureur avec un genou
  // douloureux voyait ses squats changer et ses SORTIES rester intactes — alors que la course est
  // un **impact répété**, et que **la descente est excentrique**. C'est réparé ici.
  const limitationsCourse = appliquerLimitationsCourse(persona);
  const gelVolume = limitationsCourse.contraintes.volume.gel;
  for (const a of limitationsCourse.alertes) alertes.push(a);
  if (persona.limitations_migration) alertes.push(persona.limitations_migration.message);

  if (gelVolume) {
    alertes.push(
      `🩹 **Volume de course GELÉ** — il ne monte pas de la préparation, à cause de : ` +
        `**${limitationsCourse.contraintes.volume.zones.join(", ")}** (limitation ACTIVE). ` +
        `La course est un **impact répété** : on n'ajoute pas de cycles de charge sur une zone qui fait déjà mal ` +
        `(veille/03 §5 — la charge graduelle est le levier de prévention le mieux étayé côté course). ` +
        `⚠️ **Le coût est réel, et le moteur ne te le cache pas : ton objectif chrono passe au second plan.** ` +
        `C'est un **choix de sécurité assumé**, pas une conclusion scientifique — aucune source ne chiffre le volume ` +
        `« sûr » d'un genou douloureux, donc le moteur n'invente pas de chiffre. Fais examiner la zone : c'est ce qui ` +
        `débloquera la progression, pas un réglage de plan.`
    );
  }
  // ═══ DÉNIVELÉ : le D+ (et surtout le D−) deviennent des VARIABLES PLANIFIÉES ═══════════════
  // Le moteur savait qu'une sortie **a** du dénivelé. Il n'en **générait** aucun. Un plan de 40 km
  // à plat et un plan de 40 km avec 1 500 m de D− ne sont pas le même entraînement — et **c'est la
  // DESCENTE** qui est la contrainte (ADR 0006 §1.5), pas la montée.
  const terrain = r.objectif.terrain;
  const eviterDenivele = limitationsCourse.contraintes.denivele.eviter;
  const nonPlanifie = raisonNonPlanifie({
    terrain,
    depart_m: r.denivele_actuel_m_sem ?? null,
    eviter: eviterDenivele,
    zones: limitationsCourse.contraintes.denivele.zones,
  });
  const dPlanifie = !nonPlanifie;
  if (nonPlanifie?.message) alertes.push(nonPlanifie.message);
  // Le terrain est TRAIL/VALLONNÉ mais une zone ACTIVE ferme le dénivelé : le plan **ne prépare pas
  // la course**. C'est le coût de la sécurité, et il est DIT — pas escamoté.
  if (eviterDenivele && TERRAINS[terrain]?.planifier_denivele) {
    alertes.push(
      `🔴 **Conflit assumé, et tu dois le savoir** : ta course est en **${TERRAINS[terrain].libelle}**, et ton plan ne ` +
        `contient **aucun dénivelé** (limitation ACTIVE). **Ce plan ne te prépare donc PAS à ta course.** Le moteur ne ` +
        `choisit pas ta santé à ta place : il te met les deux termes sous les yeux. Faire examiner la zone est ce qui ` +
        `rouvrira le dénivelé — pas un réglage de plan, et pas un compromis que le moteur inventerait.`
    );
  }

  const { volumes, pic } = planifierVolumes(r.volume_actuel_km_sem, nbSemaines, d.taper, {
    gel: gelVolume,
    alterner: dPlanifie,
  });
  const longues = planifierLonguesSorties(r.longue_sortie_actuelle_km, volumes, d, { gel: gelVolume });

  // Le plan de D+ suit les MÊMES semaines : alternance encodée dans `volumes[i].monte`.
  let dPlan = null;
  if (dPlanifie) {
    const brut = planifierDenivele(volumes, { depart_m: r.denivele_actuel_m_sem, gel: gelVolume });
    // Affûtage / semaine de course : le D+ suit les coefficients d'affûtage du VOLUME.
    // ⚠️ Cohérent, PAS démontré — aucune source ne dit quand cesser la descente (NON_SOURCE_DENIVELE).
    const dSem = brut.semaines.map((m, i) => (m == null ? Math.round(brut.pic * (volumes[i].coef ?? 0)) : m));
    dPlan = { ...brut, semaines: dSem };
    if (limitationsCourse.contraintes.denivele.progressif) {
      alertes.push(
        `⛰️ **Ton dénivelé progresse SÉPARÉMENT de ton volume** (${limitationsCourse.contraintes.denivele.zones.join(", ")} — ` +
          `limitation **LATENTE**). Le moteur ne monte **jamais** les deux la même semaine : une semaine le volume, la ` +
          `suivante le dénivelé. **Pourquoi** : la **descente est EXCENTRIQUE** (ADR 0006 §1.5) — c'est **elle** qui ` +
          `réveille un tendon rotulien, pas la montée. Ce n'est plus une consigne écrite en bas de page : c'est **encodé ` +
          `dans la génération**, semaine par semaine (colonne « Monte »).`
      );
    }
  }

  // ═══ 🎯 LE PROFIL CHANGE LE PLAN ═══════════════════════════════════════════════════════════
  // Un diagnostic qui ne change rien est un diagnostic de vitrine. Celui-ci pilote la **longueur de
  // la phase de base** et la **zone de la séance de qualité** (voir `PART_BASE` / `seanceQualite`).
  if (rec?.profil && ["deficit_endurance", "deficit_vitesse"].includes(rec.profil.code)) {
    alertes.push(
      `🎯 **PROFIL DÉTECTÉ — ${rec.profil.libelle}${rec.profil.borne_inferieure ? " (au moins)" : ""}.**\n\n${rec.profil.raison}\n\n` +
        `**Ce que le moteur en fait :** ${rec.profil.consequence}`
    );
  }
  if (rec?.divergence) {
    alertes.push(
      `📊 **Tes performances ne disent pas la même chose** (VDOT implicite de **${rec.divergence.min}** à ` +
        `**${rec.divergence.max}**, étendue **${rec.divergence.etendue}**). ${rec.divergence.pourquoi}\n\n` +
        `**Retenu** : ${rec.retenue ? `${rec.retenue.distance_m / 1000} km en ${rec.retenue.temps} (${rec.retenue.date}) → VDOT **${vdot.toFixed(1)}**` : `VDOT **${vdot.toFixed(1)}**`}.`
    );
  }
  if (rec?.capacite_volume) {
    alertes.push(
      `✅ **Tu as déjà couvert ${rec.capacite_volume.plus_longue_km} km** (sortie d'entraînement). ${rec.capacite_volume.pourquoi}`
    );
  }

  const optsPlacement = { zone_jambes_active: limitationsCourse.zone_jambes_active };
  const nbBase = semainesBase(nbSemaines, d.taper, profilCode);
  const semaineTest = nbSemaines >= 6 ? 3 : 2;
  const semaines = volumes.map((v, i) => {
    const phase =
      v.type === "course" || v.type === "affutage" ? "affutage" : i < nbBase ? "base" : "specifique";
    const lundi = new Date(debut.getTime() + i * 7 * JOUR_MS);
    // Le D+ de la semaine descend dans les SÉANCES (avec son D−) — **à l'intérieur** de
    // `composerSemaine`, AVANT le placement de la salle. Sinon le moteur placerait le renfo jambes
    // sans savoir que la longue sortie du dimanche laisse des jambes lourdes (D+ = excentrique).
    const dSemaine = dPlan && v.type !== "course" ? dPlan.semaines[i] : 0;
    const seances = composerSemaine(vdot, v.km, longues[i], phase, d, r.jours_par_semaine, r.hybride.salle_par_semaine, {
      ...optsPlacement,
      denivele_m: dSemaine,
      profil: profilCode,
    });

    if (v.type === "course") {
      const dimanche = seances.find((s) => s.jour === "Dimanche");
      dimanche.contenu = `**COURSE — ${r.course.nom ?? d.label}** (${d.label}, ravitaillement/allure répétés à l'entraînement)`;
    }
    // Test chrono pour (re)caler le VDOT : indispensable si les allures reposent
    // sur une hypothèse, utile dans tous les cas (veille/12 §8, veille/03 §6).
    if (i === semaineTest - 1 && v.type === "charge") {
      const distTest = d.km <= 10 ? 5 : 10;
      const mardi = seances.find((s) => s.jour === "Mardi");
      mardi.contenu = `**Test ${distTest} km chrono** (échauffement 2 km E + ${distTest} km à effort de course) → recaler le VDOT et toutes les allures du plan`;
      mardi.segments = [
        { zone: "E", duree_min: 2 * allureMediane(vdot, "E"), km: 2 },
        { zone: "T", duree_min: distTest * allureMediane(vdot, "T"), km: distTest },
      ];
      mardi.km = distTest + 2;
      mardi.test = true;
    }

    // Le D+ RÉELLEMENT posé dans les séances (pas l'enveloppe théorique) : auditable, et il ne peut
    // pas diverger silencieusement de la répartition.
    const dPlus = seances.reduce((n, s) => n + (s.denivele_m ?? 0), 0);

    return {
      num: i + 1,
      lundi: fmtDate(lundi),
      phase,
      type: v.type,
      volume_km: v.km,
      longue_km: longues[i],
      // ⛰️ Le D+ est une VARIABLE DU PLAN, au même rang que le volume. Et le **D−** est écrit à
      // côté de lui — jamais sous-entendu : c'est LUI la contrainte (la descente est excentrique).
      // 🔴 **Le champ est ABSENT quand aucun D+ n'est planifié cette semaine — surtout PAS `0`.**
      // (La semaine de COURSE en est le cas type : le dimanche, c'est la course, pas une sortie
      // planifiée. Y écrire « 0 m D− » serait affirmer qu'il n'y a pas de descente — le moteur
      // n'en sait rien, et un zéro faux éteint le seul signal de fatigue qu'il sache lire.
      // Le D+/D− de la course vit dans `denivele.course`, avec son `null` assumé.)
      ...(dPlanifie && dPlus > 0 ? { denivele_m: dPlus, denivele_negatif_m: dPlus, denivele_boucle: true } : {}),
      // La variable — **une seule** — qui a le droit de monter cette semaine. C'est la règle
      // « jamais le volume ET le dénivelé la même semaine », rendue AUDITABLE.
      monte: v.monte ?? null,
      seances,
      // Contrainte de placement jambes ↔ séances-clés, vérifiée semaine par semaine (ADR 0006,
      // Couche 2). Le placement de la salle est déjà calculé pour l'éviter : ce champ est le
      // CONTRÔLE, et il reste dans la sortie pour être auditable.
      // ⚠️ Les jambes lourdes peuvent venir de la SALLE **ou du DÉNIVELÉ** (`jourPlacement`).
      placement: analyserSemaine(
        JOURS_SEMAINE.map((jour) => jourPlacement(jour, seances.find((x) => x.jour === jour))),
        optsPlacement
      ),
      part_facile: partFacile(seances),
    };
  });

  // Simulation de charge ENDURANCE : charge d'endurance (CE) par jour → moyennes 42 j / 7 j,
  // et leur écart. DESCRIPTIF (⚖️ nos noms, pas ceux de Peaksware — cf. charge.js).
  //
  // ⚠️ La musculation n'est PLUS injectée ici. Elle l'était via une constante inventée
  // (25 points par séance de salle, 10 en affûtage) — c'est-à-dire exactement la « constante k »
  // que l'ADR 0006 supprime : la convention Joe Friel 2016, sans aucune validation. Faire porter
  // à une courbe CARDIOVASCULAIRE une charge de musculation convertie par un nombre décrété,
  // c'est mentir avec deux décimales. La muscu est comptée dans la charge sRPE (filière `force`,
  // charge.js), séparément et auditablement.
  const ceParJour = [];
  for (const sem of semaines) {
    for (const seance of sem.seances) {
      const estJourCourse = sem.type === "course" && seance.jour === "Dimanche";
      if (estJourCourse) { ceParJour.push(0); continue; } // on projette l'état AVANT la course
      ceParJour.push(seance.segments?.length ? chargeEndurance(seance.segments) : 0);
    }
  }
  const historique = simulerCharge(ceParJour, r.charge_42j_depart);
  const ecartCourse = historique[historique.length - 1].ecart_42j_7j;

  return {
    persona: persona.nom,
    distance: { ...d, code: r.objectif.distance },
    but: r.objectif.but,
    course: r.course,
    genere_le: fmtDate(dateGeneration),
    debut: fmtDate(debut),
    nb_semaines: nbSemaines,
    duree_recommandee: { min: d.prep_sem[0], max: d.prep_sem[1] },
    alertes,
    vdot: +vdot.toFixed(1),
    temps_reference: r.temps_reference ?? null,
    // ═══ LA RÉCONCILIATION — auditable de bout en bout ════════════════════════════════════════
    // Chaque perf, son VDOT implicite, son RÔLE (mesure / borne inférieure / capacité de volume),
    // son POIDS et le détail de ce poids. Plus le PROFIL, la TRAJECTOIRE (ou son silence assumé),
    // et la DIVERGENCE expliquée. C'est le « bouton pourquoi ? » de philosophy §4, appliqué à la
    // question la plus structurante du plan : **d'où sort ce VDOT ?**
    reconciliation: rec,
    // 🎯 Le profil est remonté à part : c'est LUI qui a changé la structure du plan.
    profil: rec?.profil ?? null,
    // Ce que le profil a CONCRÈTEMENT changé — auditable, pas déclaratif.
    // ⚠️ `null` quand AUCUN profil n'est diagnostiqué : un plan non modifié ne doit pas prétendre
    // l'avoir été. `indetermine` / `equilibre` / `contradictoire` ne changent RIEN (zéro régression).
    profil_effets: PART_BASE[profilCode]
      ? {
          semaines_base: nbBase,
          semaines_base_sans_profil: Math.max(Math.floor((nbSemaines - d.taper.length) / 2), 1),
          part_base: PART_BASE[profilCode] ?? 0.5,
          qualite_orientee:
            profilCode === "deficit_endurance"
              ? "seuil (T) — pas d'intervalle : construire la capacité à TENIR, pas le plafond"
              : profilCode === "deficit_vitesse"
                ? "intervalle (I) — le plafond, pas l'endurance (elle est déjà là)"
                : "standard",
        }
      : null,
    allures,
    prediction_min: predictionMin,
    chrono,
    plan_ecourte: planEcourte,
    allure_prudente_min_par_km: allurePrudente,
    temps_prudent_min: tempsPrudentMin,
    correction_marathon: correctionMarathon,
    // Le nudge de cadence existait déjà — mais il était OPTIONNEL. Avec une limitation d'une zone
    // que la source nomme (tibia, genou, hanche), il cesse de l'être : c'est le seul levier SOURCÉ
    // qui abaisse la charge articulaire en course, et il est gratuit (veille/03 §5 bis).
    cadence: { ...recommandationCadence(r.cadence_spm), ...(limitationsCourse.cadence ? { exigee_par_limitation: limitationsCourse.cadence } : {}) },
    volume_pic_km: pic,
    // ═══ LE DÉNIVELÉ, PLANIFIÉ ═══════════════════════════════════════════════════════════════
    // Auditable de bout en bout : ce qui est planifié, ce qui ne l'est pas et POURQUOI, sur quelle
    // convention, et **ce que la veille ne dit pas** (le trou trail est un trou de VEILLE).
    denivele: {
      planifie: dPlanifie,
      terrain,
      terrain_libelle: TERRAINS[terrain]?.libelle ?? terrain,
      // ⚠️ QUATRE raisons distinctes de ne rien planifier. Les confondre laisserait croire qu'un
      // silence est une validation.
      non_planifie: nonPlanifie ? { code: nonPlanifie.code, retire: nonPlanifie.retire, message: nonPlanifie.message } : null,
      depart_m_sem: dPlanifie ? dPlan.depart_m : null,
      pic_m_sem: dPlanifie ? Math.max(...semaines.map((s) => s.denivele_m ?? 0)) : null,
      // Le D+/D− de la COURSE. Le D− n'est **jamais déduit** du D+ (point-à-point ≠ boucle), et
      // **jamais mis à 0** : `null` veut dire « je ne sais pas », et le moteur le DIT.
      course: deniveleCourse(r.objectif),
      alterne: dPlanifie,
      // La règle, encodée dans la GÉNÉRATION (colonne `monte`), pas dans un avertissement.
      regle_alternance:
        "**Jamais le volume ET le dénivelé la même semaine.** Deux variables, deux progressions — une semaine sur deux " +
        "chacune. Le volume monte donc **deux fois moins vite** que sur un plan route : c'est le **prix** de la spécificité, " +
        "et il est assumé.",
      convention: dPlanifie
        ? {
            pas: PAS_GRADUEL,
            source_du_pas: PAS_GRADUEL_SOURCE,
            // 🔴 L'aveu, en toutes lettres. Un chiffre transféré et AVOUÉ n'est pas un chiffre
            // inventé et CACHÉ — mais ça reste un transfert, et le moteur ne le maquille pas.
            extrapolation:
              "⚠️ **Le pas de progression du D+ est le garde-fou du VOLUME, transféré — c'est une EXTRAPOLATION, pas une " +
              "source.** Aucune étude de la veille ne dit à quelle vitesse construire du dénivelé. Le moteur avait le choix " +
              "entre fabriquer un chiffre spécifique au D+ (interdit) et transférer un garde-fou existant **en le déclarant** : " +
              "il transfère, et il le dit. Appliqué **une semaine sur deux**, il progresse donc **plus lentement encore**.",
            repartition:
              "Le D+ hebdo est réparti **proportionnellement aux kilomètres**, **sauf sur la séance de qualité** (les allures " +
              "T/I/R viennent du VDOT, calibré sur le **PLAT** : une « allure T » dans une côte n'a aucun sens, et la veille " +
              "ne donne **aucune** équivalence allure↔pente). Convention **déclarée**, non sourcée — tu peux redistribuer.",
            d_moins:
              "Sur une **boucle** (départ = arrivée), **D− = D+** : c'est de la **géométrie**, pas une hypothèse — et le moteur " +
              "planifie des boucles. Le D− est écrit **explicitement** à côté du D+ parce que **c'est LUI la contrainte** " +
              "(la descente est **EXCENTRIQUE**, ADR 0006 §1.5). Il n'est **jamais** mis à `0` par défaut.",
          }
        : null,
      // 🔴 Ce que la veille ne dit pas — le trou de la PROGRESSION du D+, désormais CERTIFIÉ.
      non_source: NON_SOURCE_DENIVELE,
      // 📚 Ce que la veille trail (veille/20) APPORTE, transporté avec le plan : le moteur ne se
      // contente plus d'avouer ce qu'il ignore — il dit ce qu'il sait, et d'où il le tient.
      veille_trail: {
        aveuglement_charge: AVEUGLEMENT_DESCENTE,
        recuperation: RECUP_DESCENTE,
        effet_repete: EFFET_REPETE,
        specificite: SPECIFICITE_PROTEGE,
        conversion_dplus_km: CONVERSION_DPLUS_KM,
        interdits: INTERDITS_DENIVELE,
        source: "docs/veille/20-trail-denivele.md (2026-07-11) — écrite sur demande de la piste moteur",
      },
      source:
        "veille/20 (trail & dénivelé — la DESCENTE est la contrainte ; Minetti 2002 ; Van Hooren 2024) · " +
        "ADR 0006 §1.5 · veille/03 §5 (charge graduelle — pour le VOLUME)",
    },
    semaines,
    // Ce que les limitations changent aux SORTIES (et pas seulement aux squats).
    limitations_course: limitationsCourse.court ? limitationsCourse : null,
    limitations_migration: persona.limitations_migration ?? null,
    volume_gele: gelVolume
      ? { zones: limitationsCourse.contraintes.volume.zones, pourquoi: limitationsCourse.contraintes.volume.pourquoi }
      : null,
    hybride: r.hybride.salle_par_semaine > 0,
    // ⚠️ AUCUNE cible chiffrée. Il y avait ici « +15 à +25 » : une **convention TrainingPeaks**, pas
    // un résultat scientifique — et, pire, une cible posée sur un modèle dont la composante
    // « fatigue » n'améliore pas la prédiction (p = 0,57, Marchal et al. 2025, Sci Rep 15:3706).
    // L'écart 42 j − 7 j survit comme COURBE DESCRIPTIVE. Le moteur ne vise plus aucun chiffre rond.
    // Décision : ADR 0006, validée le 2026-07-11.
    charge: {
      charge_42j_depart: r.charge_42j_depart,
      ecart_jour_course: +ecartCourse.toFixed(1),
      filiere: "endurance seule (la muscu n'y est pas convertie : voir la charge sRPE)",
      descriptif: true,
    },
    // La contrainte de placement, au niveau du plan (agrégée depuis les semaines).
    placement: {
      fenetre: FENETRE_NM,
      // 🔴 LA CONSÉQUENCE REMONTÉE À L'ADR 0006 : la fenêtre ci-dessus est calibrée MUSCULATION,
      // et elle est trop courte après une grosse descente. Le moteur DÉTECTE et SIGNALE — il ne
      // fabrique pas la bonne fenêtre (aucune source ne la donne). Arbitrage : le propriétaire du produit.
      fenetre_descente: FENETRE_DESCENTE,
      signaux_descente: semaines.flatMap((s) => (s.placement.signaux_descente ?? []).map((x) => ({ ...x, semaine: s.num }))),
      conflits: semaines.flatMap((s) => s.placement.conflits.map((c) => ({ ...c, semaine: s.num }))),
      limites: semaines.flatMap((s) => s.placement.limites.map((c) => ({ ...c, semaine: s.num }))),
      actif: r.hybride.salle_par_semaine >= 2,
      // La règle a-t-elle été DURCIE par une limitation ACTIVE du bas du corps ? (La fenêtre, elle,
      // ne bouge pas — cf. la doctrine dans placement.js.)
      durci: Boolean(limitationsCourse.zone_jambes_active),
      zone_active: limitationsCourse.zone_jambes_active,
    },
  };
}

// Rétro-compatibilité avec le CLI/skill initial.
export const genererPlanMarathon = genererPlanRunning;
