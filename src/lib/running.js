// Générateur de plan running (5K → marathon) — règles issues de :
//   docs/veille/03-science-running.md  (80/20, VDOT, charge d'endurance, garde-fous volume)
//   docs/veille/12-prepa-marathon.md   (durée de plan, longue sortie, nutrition course, taper)
//   docs/veille/11-entrainement-hybride.md (placement salle vs séances-clés)
// Générique : le persona (normalisé par personne.js) et la table DISTANCES pilotent tout.

import { estimerVdot, alluresEntrainement, allurePourFraction, tempsPredit, parseTemps, allureMarathonConservatrice, formatAllure } from "./vdot.js";
import { DISTANCES } from "./distances.js";
import { creerAvis, avisDepuisTexte, adaptationsCourseEnAvis } from "./avis.js";
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
  // En affûtage, la séance devient un entretien léger : plus de jambes lourdes, donc plus de
  // contrainte (veille/11 §3, veille/12 §6).
  placerSalleJambes(semaine, { salleParSemaine, jambesLourdes: phase !== "affutage", optsPlacement });

  return JOURS_SEMAINE.map((jour) => semaine.get(jour) ?? { jour, type: "repos", contenu: "Repos" });
}

/**
 * Place la séance de RENFO JAMBES au jour qui minimise les conflits de placement (placement.js).
 *
 * ⚠️ **Extrait de `composerSemaine` — et pas dupliqué.** Le plan de base a exactement le même
 * besoin, et un fait dupliqué est un fait qui divergera (philosophy §11). Le jour n'est pas
 * DÉCRÉTÉ : on teste chaque candidat et on retient celui qui ne tombe pas dans la fenêtre 24–48 h
 * avant une séance-clé.
 *
 * Jours LIBRES d'abord (on n'écrase jamais un footing : ce serait perdre du volume). S'il n'y en a
 * pas, on double avec un footing FACILE — jamais avec une séance-clé (veille/11 §2 : séparer de
 * 6 h+). La séance-clé reste sanctuarisée.
 */
function placerSalleJambes(semaine, { salleParSemaine, jambesLourdes, optsPlacement }) {
  if (salleParSemaine < 2) return;
  const contenu = jambesLourdes
    ? "Salle — renfo jambes modéré (à distance de la qualité et de la longue, veille/11 §3)"
    : "Salle — entretien léger, réduire les jambes lourdes (veille/11 §3)";
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
  if (!retenu) return;
  const existant = semaine.get(retenu.jour);
  semaine.set(
    retenu.jour,
    existant
      ? { ...existant, jambes_lourdes: jambesLourdes, salle: contenu, contenu: `${existant.contenu} · ${contenu} — séparer les deux de **6 h+** (veille/11 §2)` }
      : { jour: retenu.jour, type: "salle", jambes_lourdes: jambesLourdes, contenu }
  );
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

/**
 * 🔴 **LE POINT D'ENTRÉE — et le bug qu'il répare.**
 *
 * Le moteur n'avait **qu'un seul** type de plan : la **préparation d'une course datée**. Un
 * utilisateur qui court **sans préparer aucune course** était **refusé** (« Running sans distance
 * objectif »). **Ce n'était pas une donnée qui manquait : c'était une fonctionnalité.**
 *
 * La bascule tient à **une seule question** : **y a-t-il une DATE ?**
 *   • **oui** → plan **périodisé** (base → spécifique → **affûtage** → course). Inchangé.
 *   • **non** → plan de **BASE** : volume, allure facile, progression prudente. **Ni affûtage, ni
 *     pic, ni chrono cible** — le moteur ne les fabrique pas, parce qu'ils n'ont de sens que par
 *     rapport à une date.
 */
export function genererPlanRunning(persona, dateGeneration = new Date()) {
  return persona.running?.course?.date
    ? genererPlanCourse(persona, dateGeneration)
    : genererPlanBase(persona, dateGeneration);
}

function genererPlanCourse(persona, dateGeneration = new Date()) {
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
    // 🔴 L'API DE DONNÉES — le mode et les avis STRUCTURÉS (voir `avis.js`). L'app ne parse plus du
    // Markdown : elle lit `avis[]` (essentiel / pourquoi / source / cible) et affiche ce qu'elle veut.
    mode: persona.mode ?? null,
    type: "course",
    avis: avisDuPlan(alertes, limitationsCourse),
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
      // fabrique pas la bonne fenêtre (aucune source ne la donne). Arbitrage : le propriétaire.
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

/**
 * 🔴 **LES AVIS — l'API de données de tout ce que le plan a à DIRE.**
 *
 * Les `alertes` historiques (des **chaînes Markdown**, écrites pour un terminal) sont **converties**
 * en avis structurés — **l'essentiel** d'un côté, **le pourquoi** de l'autre. Elles restent le
 * canal `alertes` (le CLI et les tests les lisent), mais elles ne sont plus **la seule** forme :
 * l'app lit `avis[]`, où chaque entrée porte son `titre`, son `detail`, sa `gravite` et sa `cible`.
 *
 * ⚠️ Le découpage de ces messages historiques est **mécanique** (`structure: "auto"`) — et c'est une
 * **dette déclarée**, pas une solution. Les **adaptations**, elles, sont **autorées** : elles portent
 * leur zone et leur levier, et l'app peut les afficher **au bon endroit** au lieu de les empiler.
 */
function avisDuPlan(alertes, limitationsCourse, autores = []) {
  return [
    ...autores,
    ...adaptationsCourseEnAvis(limitationsCourse),
    ...alertes
      .map((a) => avisDepuisTexte(a, { type: "alerte", gravite: a.includes("🔴") ? "critique" : "avertissement" }))
      .filter(Boolean),
  ];
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 🏃 LE PLAN DE BASE — « je cours, et je ne prépare aucune course »
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 **Le moteur supposait que si tu cours, c'est pour préparer une course.** C'est faux pour la
// majorité des gens qui courent — et ça a **bloqué le premier utilisateur réel** de l'app, le soir
// où il l'a installée. Il court **pour courir**. Il vise le trail **à terme, sans échéance**.
//
// ── CE QUE CE PLAN EST ──────────────────────────────────────────────────────────────────────────
//   • du **VOLUME**, construit **graduellement** (~10 %/sem, garde-fou souple — veille/03 §5) ;
//   • de l'**ALLURE FACILE** : la distribution 80/20 (veille/03 §1) — la base est le lieu du volume
//     facile, et **elle n'a pas de fin** ;
//   • un **cycle de 4 semaines** (3 de charge + 1 de récupération) qui **se répète**, indéfiniment ;
//   • et, si le terrain est déclaré et le point de départ connu, une **progression du DÉNIVELÉ**,
//     en **alternance** avec le volume (jamais les deux la même semaine).
//
// ── 🔴 CE QU'IL N'EST PAS — ET LE MOTEUR NE LE FABRIQUERA PAS ───────────────────────────────────
//   ❌ **Pas d'AFFÛTAGE.** L'affûtage fait chuter le volume pour arriver frais **à une date**.
//      Sans date, il n'affûte **rien** — il fait juste perdre du volume.
//   ❌ **Pas de PIC.** Un pic est un **sommet** : il suppose qu'on redescend ensuite, **vers** quelque
//      chose. Sans échéance, il n'y a pas de sommet — il y a une **progression**.
//   ❌ **Pas de CHRONO CIBLE.** Aucune course, aucun chrono. L'équivalence VDOT dit **où tu en es**,
//      elle ne promet **rien** pour un jour J qui n'existe pas.
//   **Les trois sont des fonctions de la DATE. Les mimer sans elle serait du théâtre.**

// Horizon d'AFFICHAGE du plan de base, en semaines.
// @chiffre-derive ⚠️ **Ce nombre n'a AUCUNE signification physiologique — et c'est justement le
// point.** Un plan de base n'a pas de durée : c'est un **cycle qui se répète** (3 semaines de charge
// + 1 de récupération, +≤10 %/sem — veille/03 §5). 12 semaines = **3 cycles**, c'est-à-dire une
// **fenêtre d'affichage**, pas une périodisation. Le moteur n'invente donc aucune structure : il
// **imprime** la règle sur 12 semaines au lieu de l'imprimer à l'infini. Réglable :
// `running.horizon_semaines`.
const HORIZON_BASE_SEMAINES = 12;

/**
 * La longue sortie d'un plan de base : elle **suit le volume**, dans la proportion **déclarée par
 * l'utilisateur** (`longue_sortie_actuelle_km / volume_actuel_km_sem`).
 *
 * ⚠️ **Aucun palier inventé, aucun plafond inventé.** Le plan de course a `pas_ls` et `ls_plafond`
 * (des paramètres **dérivés de la distance à préparer**) ; **ici, il n'y a pas de distance à
 * préparer**. Fabriquer un plafond reviendrait à répondre à une question que personne n'a posée. La
 * longue sortie est donc **bornée par le volume lui-même** — qui, lui, est bel et bien bridé.
 * Si une distance objectif **est** déclarée (sans date), son plafond s'applique : il existe déjà.
 */
function planifierLonguesSortiesBase(lsDepart, volumes, volumeDepart, { plafond = null } = {}) {
  const part = volumeDepart > 0 ? Math.min(lsDepart / volumeDepart, 1) : 1;
  return volumes.map((v) => {
    const km = Math.max(1, Math.round(v.km * part));
    return plafond ? Math.min(km, plafond) : km;
  });
}

/**
 * La séance de qualité d'un plan de base — **ou son absence, et c'est une décision.**
 *
 * La part **dure** ne dépasse jamais **20 % du volume de la semaine** : c'est la distribution
 * **80/20** (veille/03 §1), appliquée **littéralement** plutôt que par un nombre de kilomètres
 * décrété. Conséquence directe et voulue : **sous ~5 km/sem, il n'y a pas de séance de qualité du
 * tout** — 1 km de seuil dans une semaine de 5 km, ce serait 20 % de dur sur une base qui n'existe
 * pas encore. **Le moteur préfère ne rien prescrire que prescrire de l'intensité sur du vide.**
 */
function seanceQualiteBase(vdot, volume_km) {
  const alE = allureMediane(vdot, "E");
  // Plafond à 4 km de seuil : c'est **exactement** le bloc T de la phase de base du plan de course
  // (`seanceQualite`, phase « base »). Le même chiffre, pour la même chose — pas un second.
  const tKm = Math.min(4, Math.floor(volume_km * 0.2));
  if (tKm < 1) return null;
  return {
    contenu: `Qualité : 2 km E + ${tKm} km T + 2 km E — **une seule séance dure par semaine** (80/20, veille/03 §1)`,
    segments: [
      { zone: "E", duree_min: 2 * alE, km: 2 },
      { zone: "T", duree_min: tKm * allureMediane(vdot, "T"), km: tKm },
      { zone: "E", duree_min: 2 * alE, km: 2 },
    ],
    km: 4 + tKm,
  };
}

/**
 * Compose une semaine de plan de base.
 *
 * ⚠️ **`composerSemaine` (plan de course) ne pouvait PAS servir ici** : il pose **toujours** deux
 * séances-clés (qualité mardi + longue dimanche), quel que soit `jours_par_semaine`. Sur un
 * utilisateur qui court **une fois par semaine**, il en aurait donc généré **deux**. Ce n'est pas un
 * détail de rendu : c'est **prescrire une séance qui n'existe pas**.
 */
function composerSemaineBase(vdot, volume_km, longue_km, joursCourse, salleParSemaine, { zone_jambes_active = null, denivele_m = 0 } = {}) {
  const alE = allureMediane(vdot, "E");
  const optsPlacement = { zone_jambes_active };
  const semaine = new Map();

  // Sous 3 sorties/semaine, **aucune séance de qualité** : avec une ou deux sorties, tout le volume
  // est déjà en dessous du minimum qui rendrait le 80/20 réalisable — et la seule chose qui
  // construise une base à ce niveau, c'est **courir plus souvent**, pas courir plus dur.
  const qualite = joursCourse >= 3 ? seanceQualiteBase(vdot, volume_km) : null;
  const kmQualite = qualite?.km ?? 0;

  const longue = Math.max(1, Math.min(Math.round(longue_km), Math.max(volume_km - kmQualite, 1)));
  semaine.set("Dimanche", {
    jour: "Dimanche",
    type: "longue",
    // La longue sortie **est** la séance-clé d'un plan de base : c'est elle que la contrainte de
    // placement doit protéger (veille/11 §3), exactement comme dans un plan de course.
    qualitative: true,
    contenu: joursCourse === 1 ? `Sortie ${longue} km en E — **ta seule sortie de la semaine**` : `Longue sortie ${longue} km en E`,
    segments: [{ zone: "E", duree_min: longue * alE, km: longue }],
    km: longue,
  });
  if (qualite) semaine.set("Mardi", { jour: "Mardi", type: "qualite", qualitative: true, ...qualite });

  const nbFaciles = Math.max(joursCourse - 1 - (qualite ? 1 : 0), 0);
  const joursFaciles = ["Jeudi", "Samedi", "Mercredi", "Vendredi"].slice(0, nbFaciles);
  const reste = Math.max(volume_km - longue - kmQualite, 0);
  if (joursFaciles.length && reste > 0) {
    const parJour = Math.floor(reste / joursFaciles.length);
    const kmFacile = joursFaciles.map(() => parJour);
    kmFacile[0] += reste - parJour * joursFaciles.length;
    joursFaciles.forEach((jour, i) => {
      if (kmFacile[i] > 0) {
        semaine.set(jour, { jour, type: "facile", contenu: `Footing E ${kmFacile[i]} km`, segments: [{ zone: "E", duree_min: kmFacile[i] * alE, km: kmFacile[i] }], km: kmFacile[i] });
      }
    });
  }

  // ⛰️ Le D+ descend dans les séances **AVANT** le placement de la salle : une sortie vallonnée
  // laisse des **jambes lourdes** (la descente est EXCENTRIQUE, ADR 0006 §1.5).
  repartirDenivele([...semaine.values()], denivele_m);
  for (const s of semaine.values()) {
    if (!s.denivele_m) continue;
    s.contenu =
      `${s.contenu} · **${s.denivele_m} m D+ / ${s.denivele_negatif_m} m D−** ` +
      `— ⚠️ **la DESCENTE est la contrainte** (excentrique) ; à l'**effort**, pas à l'allure (le VDOT est calibré sur le plat)`;
  }

  if (salleParSemaine >= 1) {
    semaine.set("Lundi", { jour: "Lundi", type: "salle", jambes_lourdes: false, contenu: "Salle — haut du corps (aucun conflit avec la course, veille/11 §2)" });
  }
  // Pas d'affûtage dans un plan de base ⇒ le renfo jambes reste **lourd** toute l'année. La
  // contrainte de placement s'applique donc **en permanence** : c'est le mode hybride, sans répit.
  placerSalleJambes(semaine, { salleParSemaine, jambesLourdes: true, optsPlacement });

  return JOURS_SEMAINE.map((jour) => semaine.get(jour) ?? { jour, type: "repos", contenu: "Repos" });
}

/**
 * 🏃 **LE PLAN DE BASE.** Aucune date, aucune périodisation, aucun affûtage. Du volume, de l'allure
 * facile, une progression prudente — et le moteur **dit** ce qu'il ne fait pas.
 */
export function genererPlanBase(persona, dateGeneration = new Date()) {
  const r = persona.running;
  const debut = lundiSuivant(dateGeneration);
  const nbSemaines = Math.max(4, Math.round(Number(r.horizon_semaines ?? HORIZON_BASE_SEMAINES)));
  const alertes = [];
  const autores = [];

  // La distance objectif est **facultative** ici. Si elle est déclarée (sans date), elle sert
  // encore : elle **pondère** les performances (veille/03 §2) et elle borne la longue sortie.
  const d = r.objectif.distance ? DISTANCES[r.objectif.distance] : null;

  const rec = r.reconciliation ?? null;
  const vdot = rec?.vdot ?? r.vdot_estime ?? 38;
  const profilCode = rec?.profil?.code ?? null;
  const allures = alluresEntrainement(vdot);

  autores.push(
    creerAvis({
      id: "base:ce-que-ce-plan-est",
      type: "info",
      gravite: "info",
      titre: "**Plan de BASE** — aucune course datée : ni affûtage, ni pic, ni chrono cible",
      detail:
        "**Ce que ce plan EST** : du **volume**, de l'**allure facile**, une **progression prudente** (≤ ~10 %/sem, " +
        "garde-fou souple — veille/03 §5), et un **cycle de 4 semaines** (3 de charge + 1 de récupération) qui **se " +
        "répète**. La distribution est **80/20** (veille/03 §1) : la base est le lieu du **volume facile**.\n\n" +
        "🔴 **Ce qu'il N'EST PAS, et le moteur ne le fabriquera pas :**\n" +
        "- **pas d'AFFÛTAGE** — l'affûtage fait chuter le volume pour arriver frais **à une date**. Sans date, il " +
        "n'affûte rien : il fait juste perdre du volume ;\n" +
        "- **pas de PIC** — un pic suppose qu'on redescend **vers** quelque chose. Sans échéance, il n'y a pas de " +
        "sommet, il y a une **progression** ;\n" +
        "- **pas de CHRONO CIBLE** — aucune course, aucun chrono. L'équivalence VDOT dit **où tu en es**, elle ne " +
        "promet rien pour un jour J qui n'existe pas.\n\n" +
        "**Le jour où tu auras une course, déclare `running.course.date` : le moteur bascule seul en plan périodisé.**",
      source: "veille/03 §1 (80/20) · veille/03 §5 (charge graduelle)",
    })
  );

  // ═══ CE QUE LE VDOT VAUT ICI — et pourquoi c'est SANS DANGER ═══════════════════════════════
  // Sur un plan de course, un VDOT calé trop bas fait rater un chrono. Sur un plan de base, il fait
  // courir… **trop facile**. Ce n'est pas la même faute, et le moteur ne va pas paniquer pour rien.
  if (rec && ["borne_inferieure", "suppose_par_niveau", "aucune"].includes(rec.source_vdot)) {
    autores.push(
      creerAvis({
        id: "base:vdot-incertain",
        type: "aveu",
        gravite: "info",
        titre: `**Tes allures reposent sur un VDOT ${rec.source_vdot === "borne_inferieure" ? "PLANCHER" : "SUPPOSÉ"} (${vdot.toFixed(1)}) — donc elles sont probablement trop LENTES**`,
        detail:
          "🕳️ **Le moteur n'a aucune mesure de ta vitesse.** " +
          (rec.source_vdot === "borne_inferieure"
            ? "Ta seule performance exploitable a été courue à effort **NON maximal** : elle dit « je vaux **au moins** ça », pas « je vaux ça »."
            : "Tu n'as déclaré aucune **course** exploitable — une sortie d'**entraînement** prouve un **volume**, pas une **vitesse**.") +
          "\n\n✅ **Et sur un plan de base, ce n'est PAS grave — c'est même le bon sens de la faute.** Un VDOT " +
          "sous-estimé produit une allure facile… **encore plus facile**. Or l'allure facile est **censée** être " +
          "facile (80/20, veille/03 §1). **Sur un plan de course, cette même erreur ferait rater un chrono ; ici, " +
          "elle ne coûte rien.**\n\n" +
          "**Le moteur ne t'impose donc AUCUN test chrono** — tu ne prépares aucune course, il n'a rien à te vendre. " +
          "Si tu **veux** des allures justes, cours un 5 km à fond une fois et déclare-le dans `running.performances[]` : " +
          "tout se recale seul.",
        source: "veille/03 §1 (80/20) · veille/03 §2 (équivalence VDOT)",
      })
    );
  }

  // 🎯 Un coureur dont l'allure d'endurance DÉCLARÉE est plus rapide que l'allure E que le moteur
  // lui propose : le VDOT supposé est trop bas, et le moteur peut le **constater** sans rien inventer.
  const alE = allureMediane(vdot, "E");
  const plusRapideQueE = (rec?.performances ?? []).find((p) => p.allure_min_par_km < alE);
  if (plusRapideQueE && rec?.source_vdot !== "moyenne_ponderee" && rec?.source_vdot !== "mesure_unique") {
    autores.push(
      creerAvis({
        id: "base:allure-e-trop-lente",
        type: "aveu",
        gravite: "avertissement",
        titre: `**Tu cours DÉJÀ plus vite (${formatAllure(plusRapideQueE.allure_min_par_km)}) que l'allure facile que le moteur te propose (${formatAllure(alE)})**`,
        detail:
          `Tu as déclaré ${(plusRapideQueE.distance_m / 1000).toFixed(1)} km à **${formatAllure(plusRapideQueE.allure_min_par_km)}** — ` +
          `et le VDOT **supposé** (${vdot.toFixed(1)}) te donne une allure facile de **${formatAllure(alE)}**, c'est-à-dire ` +
          `**plus lente que ce que tu fais déjà**. **Le moteur te le dit au lieu de faire comme si de rien n'était.**\n\n` +
          `⚠️ **Il ne va PAS « corriger » le VDOT pour autant** : cette sortie est une preuve de **volume**, pas de ` +
          `**vitesse** (en tirer un VDOT reviendrait à confondre allure d'endurance et allure de course — le moteur le ` +
          `refuse ailleurs, il ne va pas le faire ici). **Ce qu'il fait : il te montre la contradiction et te dit ce qui ` +
          `la lève** — une seule performance à effort maximal dans \`running.performances[]\`.\n\n` +
          `✅ **En attendant, cours à l'effort, pas au chronomètre.** L'allure E est une **borne haute d'effort**, pas ` +
          `une consigne de vitesse : si ${formatAllure(alE)} te paraît trop lent, c'est probablement que ça l'est.`,
        source: "veille/03 §2",
      })
    );
  }

  // ═══ LIMITATIONS × COURSE — identiques au plan de course. Un genou ne sait pas si tu as une
  // course dans le calendrier.
  const limitationsCourse = appliquerLimitationsCourse(persona);
  const gelVolume = limitationsCourse.contraintes.volume.gel;
  for (const a of limitationsCourse.alertes) alertes.push(a);
  if (persona.limitations_migration) alertes.push(persona.limitations_migration.message);
  if (gelVolume) {
    autores.push(
      creerAvis({
        id: "base:volume-gele",
        type: "adaptation",
        gravite: "critique",
        titre: `🩹 **Volume de course GELÉ** — il ne monte pas (${limitationsCourse.contraintes.volume.zones.join(", ")} : limitation ACTIVE)`,
        detail:
          "La course est un **impact répété** : on n'ajoute pas de cycles de charge sur une zone qui fait déjà mal " +
          "(veille/03 §5 — la charge graduelle est le levier de prévention le mieux étayé côté course ; ici, " +
          "« graduelle » veut dire **plate**). ⚠️ **Choix de sécurité ASSUMÉ, pas une conclusion scientifique** — aucune " +
          "source ne chiffre le volume « sûr » d'une articulation douloureuse, donc le moteur n'invente aucun chiffre.\n\n" +
          "✅ **Et sur un plan de base, le coût est plus faible qu'il n'y paraît** : tu ne prépares aucune course, donc " +
          "**tu ne rates rien**. Tu continues à courir, tu ne progresses simplement pas en volume tant que la zone n'est " +
          "pas examinée. **Fais-la examiner : c'est ça qui débloque la progression, pas un réglage de plan.**",
        source: "veille/03 §5",
        cible: { discipline: "course", levier: "volume", zones: limitationsCourse.contraintes.volume.zones },
      })
    );
  }

  // ═══ DÉNIVELÉ — ⛰️ LA BASE TRAIL SANS ÉCHÉANCE ═════════════════════════════════════════════
  // 🔴 **Peut-on construire une base trail sans date ? OUI — et rien n'avait besoin d'être inventé.**
  // Ce qui dépend d'une date, dans le dénivelé, c'est **l'affûtage** (quand cesser la descente), et
  // **lui seul** — la veille dit d'ailleurs qu'elle n'en sait rien (`NON_SOURCE_DENIVELE`). Tout le
  // reste — départ **MESURÉ**, progression **RELATIVE** par paliers, **alternance** volume/dénivelé —
  // est **indépendant de toute échéance**. Le moteur planifie donc le D+ **exactement comme sur un
  // plan de course**, moins l'affûtage. **Il ne fabrique rien de neuf : il retire ce qui n'a plus de sens.**
  const terrain = r.objectif.terrain;
  const nonPlanifie = raisonNonPlanifie({
    terrain,
    depart_m: r.denivele_actuel_m_sem ?? null,
    eviter: limitationsCourse.contraintes.denivele.eviter,
    zones: limitationsCourse.contraintes.denivele.zones,
    sans_course: true,
  });
  const dPlanifie = !nonPlanifie;
  if (nonPlanifie?.message) alertes.push(nonPlanifie.message);

  const { volumes, pic } = planifierVolumes(r.volume_actuel_km_sem, nbSemaines, [], { gel: gelVolume, alterner: dPlanifie });
  const longues = planifierLonguesSortiesBase(r.longue_sortie_actuelle_km, volumes, r.volume_actuel_km_sem, {
    plafond: d?.ls_plafond ?? null,
  });

  let dPlan = null;
  if (dPlanifie) {
    dPlan = planifierDenivele(volumes, { depart_m: r.denivele_actuel_m_sem, gel: gelVolume });
    autores.push(
      creerAvis({
        id: "base:trail-sans-echeance",
        type: "info",
        gravite: "info",
        titre: `⛰️ **Base en dénivelé — sans échéance, et c'est possible** : ${dPlan.depart_m} m D+/sem au départ, en alternance avec le volume`,
        detail:
          "**Ce qui, dans le dénivelé, dépend d'une date ? UNE seule chose : l'affûtage** (quand cesser la descente " +
          "avant la course) — et la veille dit franchement qu'elle **n'en sait rien** (aucune étude d'affûtage en trail). " +
          "**Tout le reste en est indépendant** : ton **point de départ** est **mesuré** (jamais supposé), la progression " +
          "est **RELATIVE** à ce que tu encaisses **déjà** (par paliers), et la **règle d'alternance** tient debout toute " +
          "seule.\n\n" +
          "**La règle, encodée dans la génération** (colonne « Monte ») : **jamais le volume ET le dénivelé la même " +
          "semaine.** Elle ne vient pas d'un essai sur le dénivelé — elle vient du fait que **la descente laisse une " +
          "trace neuromusculaire de 3–4 jours** (veille/20 §2.2) : deux contraintes qui montent ensemble sur une semaine " +
          "de 7 jours ne laissent pas la place à cette récupération. **C'est un raisonnement, et il est étiqueté comme tel.**\n\n" +
          "🔴 **Et ce que le moteur ne dira JAMAIS** : « fais des descentes, ça protégera ton genou ». L'effet répété " +
          "protège le **MUSCLE**, **pas le TENDON** — et aucune preuve épidémiologique ne lie la descente à une " +
          "tendinopathie rotulienne (veille/20 §3.2).",
        source: "veille/20 §2.2 · veille/20 §5 · ADR 0006 §1.5",
        cible: { discipline: "course", levier: "denivele", terrain },
      })
    );
  }

  const optsPlacement = { zone_jambes_active: limitationsCourse.zone_jambes_active };
  const semaines = volumes.map((v, i) => {
    const lundi = new Date(debut.getTime() + i * 7 * JOUR_MS);
    const dSemaine = dPlan ? dPlan.semaines[i] ?? 0 : 0;
    const seances = composerSemaineBase(vdot, v.km, longues[i], r.jours_par_semaine, r.hybride.salle_par_semaine, {
      ...optsPlacement,
      denivele_m: dSemaine,
    });
    const dPlus = seances.reduce((n, s) => n + (s.denivele_m ?? 0), 0);
    return {
      num: i + 1,
      lundi: fmtDate(lundi),
      // 🔴 **UNE SEULE PHASE, et elle s'appelle « base ».** Il n'y a ni « spécifique » (spécifique à
      // QUOI ?) ni « affûtage » (affûter POUR quand ?). Le moteur ne mime pas une périodisation.
      phase: "base",
      type: v.type,
      volume_km: v.km,
      longue_km: longues[i],
      ...(dPlanifie && dPlus > 0 ? { denivele_m: dPlus, denivele_negatif_m: dPlus, denivele_boucle: true } : {}),
      monte: v.monte ?? null,
      seances,
      placement: analyserSemaine(
        JOURS_SEMAINE.map((jour) => jourPlacement(jour, seances.find((x) => x.jour === jour))),
        optsPlacement
      ),
      part_facile: partFacile(seances),
    };
  });

  const ceParJour = [];
  for (const sem of semaines) for (const s of sem.seances) ceParJour.push(s.segments?.length ? chargeEndurance(s.segments) : 0);
  const historique = simulerCharge(ceParJour, r.charge_42j_depart);

  if (r.jours_par_semaine <= 2) {
    autores.push(
      creerAvis({
        id: "base:frequence-faible",
        type: "aveu",
        gravite: "avertissement",
        titre: `**${r.jours_par_semaine} sortie(s)/semaine : c'est de l'ENTRETIEN, pas une construction de base**`,
        detail:
          "Le moteur te génère un plan honnête à cette fréquence, mais il ne va pas te laisser croire qu'il construit " +
          "quelque chose qu'il ne construit pas. **Ce qui construit une base, c'est la FRÉQUENCE et le VOLUME FACILE** " +
          "(veille/03 §1) — pas l'intensité. À 1–2 sorties, le volume hebdomadaire plafonne vite et la progression est " +
          "lente.\n\n" +
          "⚠️ **Et le moteur ne te prescrira PAS de séance dure pour « compenser »** : ce serait exactement le mauvais " +
          "geste (plus d'intensité sur moins de base = le chemin classique vers la blessure). **La seule chose qui " +
          "change vraiment quelque chose ici : une sortie de plus.**\n\n" +
          "🕳️ **Ce que le moteur ne sait PAS** : aucune source du corpus ne dit combien de sorties/semaine il faut pour " +
          "« maintenir » une base. Il n'invente donc **aucun seuil** — il te dit ce qui est établi (fréquence + volume " +
          "facile) et te laisse décider.",
        source: "veille/03 §1",
      })
    );
  }

  return {
    persona: persona.nom,
    mode: persona.mode ?? null,
    // 🔑 Le discriminant, en une clé : l'app sait **immédiatement** de quel plan il s'agit.
    type: "base",
    avis: avisDuPlan(alertes, limitationsCourse, autores),
    // Pas de `distance` : il n'y a **pas de course**. Un `{ km: 0 }` de complaisance serait un
    // mensonge de plus (même doctrine que le `denivele_negatif_m: 0` interdit).
    distance: d ? { ...d, code: r.objectif.distance, sans_date: true } : null,
    but: r.objectif.but,
    course: null,
    genere_le: fmtDate(dateGeneration),
    debut: fmtDate(debut),
    nb_semaines: nbSemaines,
    horizon: {
      semaines: nbSemaines,
      // 🔴 L'aveu, en donnée — pas en note de bas de page.
      quoi: "**Une fenêtre d'AFFICHAGE, pas une périodisation.** Le cycle (3 semaines de charge + 1 de récupération, ≤ ~10 %/sem) **se répète** : le moteur l'imprime sur ces semaines, il ne les *structure* pas vers quoi que ce soit.",
      reglable: "running.horizon_semaines",
    },
    alertes,
    vdot: +vdot.toFixed(1),
    reconciliation: rec,
    profil: rec?.profil ?? null,
    // Aucun `profil_effets` : sans phase spécifique ni affûtage, le profil n'a **rien à réorienter**.
    // Prétendre le contraire serait afficher un diagnostic de vitrine.
    profil_effets: null,
    allures,
    // 🔴 Ni prédiction, ni chrono, ni allure « jour J », ni correction marathon : **il n'y a pas de
    // jour J.** Les champs existent, à `null`, pour que l'app n'ait pas à deviner leur absence.
    prediction_min: null,
    chrono: null,
    correction_marathon: null,
    plan_ecourte: false,
    allure_prudente_min_par_km: null,
    temps_prudent_min: null,
    cadence: { ...recommandationCadence(r.cadence_spm), ...(limitationsCourse.cadence ? { exigee_par_limitation: limitationsCourse.cadence } : {}) },
    volume_pic_km: pic,
    denivele: {
      planifie: dPlanifie,
      terrain,
      terrain_libelle: TERRAINS[terrain]?.libelle ?? terrain,
      non_planifie: nonPlanifie ? { code: nonPlanifie.code, retire: nonPlanifie.retire, message: nonPlanifie.message } : null,
      depart_m_sem: dPlanifie ? dPlan.depart_m : null,
      pic_m_sem: dPlanifie ? Math.max(...semaines.map((s) => s.denivele_m ?? 0)) : null,
      course: deniveleCourse(r.objectif),
      alterne: dPlanifie,
      regle_alternance:
        "**Jamais le volume ET le dénivelé la même semaine.** Deux variables, deux progressions — une semaine sur deux " +
        "chacune. Le volume monte donc **deux fois moins vite** : c'est le **prix** de la spécificité, et il est assumé.",
      convention: dPlanifie
        ? {
            pas: PAS_GRADUEL,
            source_du_pas: PAS_GRADUEL_SOURCE,
            extrapolation:
              "⚠️ **Le pas de progression du D+ est le garde-fou du VOLUME, transféré — c'est une EXTRAPOLATION, pas une " +
              "source.** Aucune étude de la veille ne dit à quelle vitesse construire du dénivelé (veille/20 §5 a cherché " +
              "et **certifie qu'il n'y a rien**). Le moteur transfère, **et il le dit**.",
            repartition:
              "Le D+ hebdo est réparti **proportionnellement aux kilomètres**, **sauf sur la séance de qualité** (les allures " +
              "T/I/R viennent du VDOT, calibré sur le **PLAT**). Convention **déclarée**, non sourcée.",
            d_moins:
              "Sur une **boucle** (départ = arrivée), **D− = D+** : c'est de la **géométrie**, pas une hypothèse. Le D− est " +
              "écrit **explicitement** parce que **c'est LUI la contrainte** (la descente est **EXCENTRIQUE**, ADR 0006 §1.5).",
          }
        : null,
      // 🔴 CE QUE LE MOTEUR NE SAIT PAS FAIRE SANS DATE, ET IL LE DIT PLUTÔT QUE DE L'INVENTER.
      sans_echeance: {
        possible: "**Construire une base en dénivelé SANS échéance est possible, et le moteur le fait** : le départ est mesuré, la progression est relative, l'alternance tient toute seule. **Rien là-dedans n'a besoin d'une date.**",
        impossible:
          "🕳️ **Ce qui n'est PAS possible sans date : l'AFFÛTAGE du dénivelé** (« quand cesser la descente ? »). Sur un " +
          "plan de course, le moteur fait chuter le D+ avec le volume — c'est **cohérent, pas démontré** (aucune étude " +
          "d'affûtage n'existe en trail). **Sans date, la question ne se pose même pas, et le moteur ne la simule pas.**",
      },
      non_source: NON_SOURCE_DENIVELE,
      veille_trail: {
        aveuglement_charge: AVEUGLEMENT_DESCENTE,
        recuperation: RECUP_DESCENTE,
        effet_repete: EFFET_REPETE,
        specificite: SPECIFICITE_PROTEGE,
        conversion_dplus_km: CONVERSION_DPLUS_KM,
        interdits: INTERDITS_DENIVELE,
        source: "docs/veille/20-trail-denivele.md (2026-07-11) — écrite sur demande de la piste moteur",
      },
      source: "veille/20 (trail & dénivelé — la DESCENTE est la contrainte) · ADR 0006 §1.5 · veille/03 §5 (charge graduelle — pour le VOLUME)",
    },
    semaines,
    limitations_course: limitationsCourse.court ? limitationsCourse : null,
    limitations_migration: persona.limitations_migration ?? null,
    volume_gele: gelVolume ? { zones: limitationsCourse.contraintes.volume.zones, pourquoi: limitationsCourse.contraintes.volume.pourquoi } : null,
    hybride: r.hybride.salle_par_semaine > 0,
    charge: {
      charge_42j_depart: r.charge_42j_depart,
      ecart_jour_course: null, // il n'y a pas de jour de course.
      ecart_fin_horizon: +historique[historique.length - 1].ecart_42j_7j.toFixed(1),
      filiere: "endurance seule (la muscu n'y est pas convertie : voir la charge sRPE)",
      descriptif: true,
    },
    placement: {
      fenetre: FENETRE_NM,
      fenetre_descente: FENETRE_DESCENTE,
      signaux_descente: semaines.flatMap((s) => (s.placement.signaux_descente ?? []).map((x) => ({ ...x, semaine: s.num }))),
      conflits: semaines.flatMap((s) => s.placement.conflits.map((c) => ({ ...c, semaine: s.num }))),
      limites: semaines.flatMap((s) => s.placement.limites.map((c) => ({ ...c, semaine: s.num }))),
      actif: r.hybride.salle_par_semaine >= 2,
      durci: Boolean(limitationsCourse.zone_jambes_active),
      zone_active: limitationsCourse.zone_jambes_active,
    },
  };
}

// Rétro-compatibilité avec le CLI/skill initial.
export const genererPlanMarathon = genererPlanRunning;
