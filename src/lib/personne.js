// Normalisation d'un persona brut → persona résolu, prêt pour les générateurs.
// C'est ici que le moteur devient générique : n'importe quel humain en entrée,
// champs manquants → défauts documentés + hypothèse AUTO-GÉNÉRÉE dans la sortie,
// populations à risque → refus avec renvoi vers un professionnel (veille/04 §9, veille/07).
//
// ⚠️ Les citations « veille/04 §5 » qui vivaient ici étaient **FAUSSES** : `04 §5` est la section
// « Compléments alimentaires ». Les garde-fous population sont en **`04 §9`** (« Population sensible
// (TCA, mineurs, pathologies) : renvoyer vers un professionnel de santé, ne pas prescrire »).
// Corrigé le 2026-07-11, et **verrouillé** par `tests/citations.test.js`.

import { PROFILS_MATERIEL } from "./exercices.js";
import { TERRAINS, TERRAIN_DEFAUT } from "./denivele.js";
import { anglesMorts } from "./angles-morts.js";
import { migrerPerformances, reconcilier } from "./performances.js";
import { distanceObjectifM } from "./distances.js";

const CHAMPS_PROFIL_REQUIS = ["sexe", "age", "taille_cm", "poids_kg"];

/**
 * Les limitations d'un persona — **où qu'elles soient déclarées**.
 *
 * ⚠️ Emplacement CANONIQUE : `persona.limitations` (RACINE). Une limitation est **transversale** :
 * un genou douloureux ne concerne pas que la salle — la course est un **impact répété**, et la
 * **descente est excentrique**. L'ancien emplacement `muscu.limitations` est **déprécié** : son nom
 * même trahissait l'angle mort d'origine (« le moteur n'adapte que la muscu »).
 *
 * Il reste **lu** (on ne casse aucun persona existant), et `normaliserPersona` le **migre** vers la
 * racine en le **disant** (`persona.limitations_migration` + `hypotheses`). Ce résolveur est le
 * **point unique** de lecture : un fait dupliqué est un fait qui divergera (philosophy §11).
 */
export function limitationsDe(persona) {
  if (Array.isArray(persona?.limitations)) return persona.limitations;
  if (Array.isArray(persona?.muscu?.limitations)) return persona.muscu.limitations;
  return [];
}

/**
 * Migration RÉTROCOMPATIBLE de `muscu.limitations` → `limitations` (racine).
 * Ne casse rien, n'avale rien : ce qui est migré est DIT.
 */
function migrerLimitations(p) {
  const racine = Array.isArray(p.limitations) ? p.limitations : null;
  const heritees = Array.isArray(p.muscu?.limitations) ? p.muscu.limitations : null;
  p.limitations_migration = null;

  // Cas bénin : les deux champs portent EXACTEMENT la même liste. C'est ce que produit un persona
  // déjà normalisé puis ré-sérialisé (`recaler` écrit le persona résolu, alias compris). Ce n'est
  // PAS un conflit — et crier au conflit à chaque `recaler` userait l'alerte qui, elle, compte.
  if (heritees && racine && JSON.stringify(heritees) === JSON.stringify(racine)) {
    p.limitations = racine;
    if (p.muscu) p.muscu.limitations = p.limitations;
    return;
  }

  if (heritees?.length && !racine) {
    p.limitations = heritees;
    p.limitations_migration = {
      depuis: "muscu.limitations",
      vers: "limitations",
      zones: heritees.map((l) => l?.zone ?? null),
      message:
        "⚠️ Tes limitations sont déclarées dans **`muscu.limitations`** — un emplacement **déprécié**. " +
        "Une limitation n'est **pas** une affaire de musculation : la course est un **impact répété**, et " +
        "**la descente est excentrique**. Le moteur les a **migrées** vers **`limitations`** (racine du persona) " +
        "et les applique désormais **à la muscu ET à la course**. Rien n'est perdu ; déplace le champ à la " +
        "prochaine édition de ton persona.",
    };
    p.hypotheses.push(
      `\`muscu.limitations\` (déprécié) → migré vers \`limitations\` (racine) : ${heritees.length} limitation(s) ` +
        `désormais appliquée(s) à la **muscu ET à la course**. L'ancien champ reste lu, mais son nom cachait le trou.`
    );
  } else if (heritees?.length && racine) {
    // Les deux emplacements sont renseignés. On ne choisit PAS en silence : la racine fait foi,
    // et toute zone présente UNIQUEMENT dans l'ancien champ est REPRISE (jamais perdue) + signalée.
    const zonesRacine = new Set(racine.map((l) => l?.zone));
    const orphelines = heritees.filter((l) => !zonesRacine.has(l?.zone));
    p.limitations = [...racine, ...orphelines];
    p.limitations_migration = {
      depuis: "muscu.limitations",
      vers: "limitations",
      conflit: true,
      reprises: orphelines.map((l) => l?.zone ?? null),
      message:
        "⚠️ **Les DEUX emplacements sont renseignés** (`limitations` ET `muscu.limitations`, déprécié). " +
        "`limitations` (racine) **fait foi** ; les zones présentes uniquement dans l'ancien champ ont été " +
        `**reprises** (${orphelines.map((l) => l?.zone).join(", ") || "aucune"}) — le moteur n'en perd aucune, ` +
        "mais il ne fusionne pas deux statuts contradictoires pour une même zone. **Fusionne les deux listes** " +
        "dans `limitations` pour lever toute ambiguïté.",
    };
    p.hypotheses.push(
      "⚠️ `limitations` (racine) ET `muscu.limitations` (déprécié) coexistent : la racine fait foi, les zones " +
        "orphelines de l'ancien champ ont été reprises. À fusionner dans `limitations`."
    );
  } else {
    p.limitations = racine ?? [];
  }

  // Alias : le champ historique continue d'exister et de pointer sur la MÊME liste. Un persona déjà
  // écrit, un test déjà écrit, un lecteur externe : rien ne casse.
  if (p.muscu) p.muscu.limitations = p.limitations;
}

// Facteur d'activité théorique dérivé du nombre de séances/sem (veille/04 §1 :
// sédentaire ≈ 1,2 → très actif ≈ 1,9). Grossier par nature → toujours flaggé.
function facteurActivite(seancesParSemaine) {
  if (seancesParSemaine <= 0) return 1.2;
  if (seancesParSemaine <= 2) return 1.375;
  if (seancesParSemaine <= 5) return 1.55;
  if (seancesParSemaine <= 7) return 1.725;
  return 1.9;
}

// Niveau muscu déduit de l'ancienneté si non fourni.
function niveauDepuisExperience(ans) {
  if (ans == null) return null;
  if (ans < 1) return "debutant";
  if (ans <= 3) return "intermediaire";
  return "avance";
}

/**
 * Valide et complète un persona. Retourne une copie résolue ; les hypothèses
 * générées par les défauts sont ajoutées à persona.hypotheses (transparence).
 * Lance une erreur explicite si les données sont insuffisantes ou hors périmètre.
 */
export function normaliserPersona(brut, { aujourdhui = new Date() } = {}) {
  const p = structuredClone(brut);
  p.hypotheses = [...(p.hypotheses ?? [])];
  p.nom = p.nom ?? p.id ?? "utilisateur";

  // --- Garde-fous population (on refuse plutôt que de mal prescrire) ---
  if (!p.profil) throw new Error("Persona sans profil : sexe, age, taille_cm et poids_kg sont requis.");
  for (const champ of CHAMPS_PROFIL_REQUIS) {
    if (p.profil[champ] == null) throw new Error(`Profil incomplet : « ${champ} » est requis (pas de défaut raisonnable pour une donnée corporelle).`);
  }
  if (!["homme", "femme"].includes(p.profil.sexe)) {
    throw new Error(`Sexe « ${p.profil.sexe} » non géré par Mifflin-St Jeor : préciser "homme" ou "femme" (base du calcul BMR, veille/04 §1).`);
  }
  if (p.profil.age < 18) {
    throw new Error("Utilisateur mineur : hors périmètre du produit, renvoyer vers un professionnel de santé (veille/04 §9).");
  }
  // 🔴 GROSSESSE / POST-PARTUM — REFUS DE PRESCRIRE (veille/21 §7.3, R2).
  //
  // Ces populations relèvent d'un cadre clinique avec **contre-indications absolues et relatives**
  // (Mottola 2018), **dépistage validé** (_Get Active Questionnaire for Postpartum_, Davenport 2025)
  // et **suivi obstétrical**. Le moteur n'a **aucun** de ces trois éléments et **ne peut pas les
  // avoir** : il est local, sans professionnel dans la boucle.
  //
  // ⚠️ **REFUSER DE PRESCRIRE N'EST PAS DÉCOURAGER DE BOUGER — et le ton compte.** La guideline dit
  // exactement l'**inverse** : l'activité physique prénatale et post-partum est **recommandée**
  // (≥ 150 min/sem d'intensité modérée, aérobie + résistance, plancher pelvien quotidien). Un moteur
  // qui laisserait entendre « ne bougez pas » serait **faux et nuisible**. On le dit, et on renvoie
  // aux guidelines de référence.
  if (p.profil.grossesse || p.profil.post_partum) {
    const quoi = p.profil.grossesse ? "Grossesse" : "Post-partum";
    throw new Error(
      `${quoi} déclaré(e) : le moteur **refuse de PRESCRIRE** — et ce refus n'est pas « ne bougez pas ». ` +
        "**L'activité physique est RECOMMANDÉE pendant et après la grossesse** (≥ 150 min/sem d'intensité modérée sur ≥ 3 jours, " +
        "aérobie **et** résistance, renforcement du plancher pelvien quotidien — Mottola et al., *Br J Sports Med* 2018). " +
        "**Mais elle relève d'un encadrement** que ce moteur n'a pas et ne peut pas avoir : contre-indications absolues et relatives, " +
        "questionnaire de dépistage validé (*Get Active Questionnaire for Postpartum*, Davenport et al. 2025), suivi obstétrical. " +
        "**Un moteur local, sans professionnel dans la boucle, ne peut pas te programmer ça à distance.** " +
        "→ Parles-en à ton médecin ou à une sage-femme, et appuie-toi sur ces guidelines (veille/21 §7.3)."
    );
  }
  // ⚠️ REFUS — et non « adaptation ». Ce garde-fou reste ce qu'il a toujours été : une
  // pathologie MÉDICALE déclarée ou un TCA sortent du périmètre d'un moteur de programmation.
  //
  // 🔴 **MAIS LE CHEMIN `tca` EST INADAPTÉ, ET LE MOTEUR NE PEUT PAS LE RÉPARER SEUL** (veille/21 §7.2).
  // Il repose sur une **auto-déclaration** — or **la dissimulation fait partie du tableau clinique**.
  // **Le garde-fou le plus important du produit est celui qui a le moins de chances de se déclencher.**
  // Et il est **binaire** (refus total) alors que le risque est **graduel** : refuser tout, c'est
  // **pousser dehors** quelqu'un qui s'entraînera quand même, **sans filet** — exactement le
  // raisonnement que le moteur a déjà tenu et **gagné** sur les limitations physiques (le TROISIÈME
  // état : ADAPTER). **Il n'a pas été appliqué ici.**
  // ⚖️ **Ce n'est PAS une décision d'agent** : l'enjeu est **clinique**, pas mécanique, et « dépister »
  // (EAT-26, SCOFF) est **hors périmètre et dangereux** (R8). → Remonté dans « POUR LE PROPRIÉTAIRE »
  // (`docs/JOURNAL-moteur.md`). Le chemin reste **tel quel** en attendant sa décision.
  // Il ne couvre PAS les limitations physiques courantes (épaule douloureuse, tendinite,
  // genou sensible) : celles-ci passent par `limitations`, qui fait ADAPTER le moteur
  // (limitations.js) — le troisième état, entre « prescrire en aveugle » et « ne rien prescrire ».
  // Refuser tout sur une épaule douloureuse, ce serait laisser l'utilisateur s'entraîner sans
  // filet : pire que d'adapter.
  if (p.profil.pathologies?.length || p.profil.tca) {
    throw new Error("Pathologie ou TCA signalé : pas de prescription automatique, renvoyer vers un professionnel de santé (veille/04 §9).");
  }

  // --- Limitations — TRANSVERSALES (muscu ET course). Migrées depuis `muscu.limitations`. ---
  // Placé AVANT les blocs muscu/running : les deux en dépendent, et un persona qui ne fait QUE
  // courir a le droit d'avoir un genou (l'ancien champ le lui interdisait, littéralement).
  migrerLimitations(p);

  // --- Muscu ---
  if (p.muscu) {
    const m = p.muscu;
    if (!m.niveau) {
      m.niveau = niveauDepuisExperience(m.experience_ans) ?? "intermediaire";
      p.hypotheses.push(`Niveau muscu « ${m.niveau} » ${m.experience_ans != null ? `déduit de ${m.experience_ans} an(s) de pratique` : "par défaut (non renseigné)"} — à confirmer.`);
    }
    if (!m.jours_par_semaine) {
      m.jours_par_semaine = 3;
      p.hypotheses.push("Jours de muscu/sem non renseignés → défaut 3 j (full-body) — à confirmer.");
    }
    if (!m.duree_seance_min) m.duree_seance_min = 60;
    if (!m.materiel) {
      m.materiel = "salle_complete";
      p.hypotheses.push("Matériel non renseigné → défaut salle complète — à confirmer.");
    }
    // Le matériel est une contrainte RÉELLE : il filtre les exercices proposés (exercices.js).
    // Mieux vaut refuser un profil inconnu que prescrire du matériel que l'utilisateur n'a pas.
    if (!PROFILS_MATERIEL[m.materiel]) {
      throw new Error(`Matériel muscu « ${m.materiel} » inconnu : attendu ${Object.keys(PROFILS_MATERIEL).join(" | ")}.`);
    }
    if (!m.objectif) {
      m.objectif = "hypertrophie";
      p.hypotheses.push("Objectif muscu non renseigné → défaut hypertrophie — à confirmer.");
    }
    m.priorites = m.priorites ?? [];
    m.echauffement = m.echauffement ?? {};
    if (!m.echauffement.statut) {
      m.echauffement.statut = "INCONNU";
      if ((m.limitations ?? []).some((l) => l?.statut === "ACTIF")) {
        p.hypotheses.push("Échauffement non renseigné alors qu'une limitation ACTIVE est déclarée → protocole par défaut imposé (montées en charge progressives + échauffement de la zone) ; à confirmer (veille/02 §6).");
      }
    }
    m.hybride = m.hybride ?? {};
    m.hybride.priorite = m.hybride.priorite ?? (p.running?.course ? "endurance" : "muscu");
  }

  // --- Running ---
  if (p.running) {
    const r = p.running;
    if (!r.objectif?.distance) throw new Error("Running sans distance objectif (5k / 10k / semi / marathon).");
    r.objectif.but = r.objectif.but ?? "finir";

    // --- TERRAIN & DÉNIVELÉ ---------------------------------------------------------------
    // ⚠️ Le terrain est **DÉCLARÉ**, jamais deviné. Le moteur pourrait être tenté de conclure
    // « 800 m de D+ annoncés → c'est un trail » : ce serait fabriquer le **seuil** que la veille
    // ne donne pas (`NON_SOURCE_COURSE` : aucun seuil de D+ n'est sourcé). Il ne le fait pas.
    // Défaut = `route` (le comportement historique : aucun dénivelé planifié) — et c'est DIT.
    if (!r.objectif.terrain) {
      r.objectif.terrain = TERRAIN_DEFAUT;
      p.hypotheses.push(
        `Terrain non renseigné → **route** supposée : le plan ne contiendra **aucun dénivelé**. Si ta course est ` +
          `vallonnée ou en trail, déclare \`running.objectif.terrain\` (${Object.keys(TERRAINS).join(" | ")}) — le moteur ` +
          `**ne devine pas** un terrain depuis un nombre de mètres (aucun seuil de D+ n'est sourcé).`
      );
    }
    if (!TERRAINS[r.objectif.terrain]) {
      throw new Error(`Terrain « ${r.objectif.terrain} » inconnu : attendu ${Object.keys(TERRAINS).join(" | ")}.`);
    }

    // 🔴 LE ZÉRO INTERDIT. Un `denivele_negatif_m: 0` déclaré « pour remplir le champ » **éteint le
    // seul signal de fatigue mesurable** du moteur : la DESCENTE est EXCENTRIQUE (ADR 0006 §1.5),
    // c'est elle la contrainte. `null` (« je ne sais pas ») et `0` (« il n'y en a pas ») sont deux
    // affirmations différentes — le moteur refuse de les confondre, et refuse le zéro par défaut.
    for (const [ou, obj] of [["running.objectif", r.objectif], ["running", r]]) {
      if (obj?.denivele_negatif_m === 0) {
        throw new Error(
          `\`${ou}.denivele_negatif_m: 0\` — un **zéro faux éteint le seul signal de fatigue mesurable** ` +
            `(la descente est EXCENTRIQUE : c'est ELLE la contrainte, ADR 0006 §1.5). Si tu ne connais pas le D−, ` +
            `mets \`null\` : « je ne sais pas » et « il n'y en a pas » ne sont pas la même chose.`
        );
      }
    }
    for (const champ of ["denivele_m", "denivele_negatif_m"]) {
      const v = r.objectif[champ];
      if (v != null && (!Number.isFinite(Number(v)) || Number(v) < 0)) {
        throw new Error(`\`running.objectif.${champ}\` = « ${v} » : attendu un nombre de mètres ≥ 0, ou \`null\`.`);
      }
    }
    if (r.denivele_actuel_m_sem != null) {
      const v = Number(r.denivele_actuel_m_sem);
      if (!Number.isFinite(v) || v < 0) {
        throw new Error(`\`running.denivele_actuel_m_sem\` = « ${r.denivele_actuel_m_sem} » : attendu un nombre de mètres ≥ 0.`);
      }
      r.denivele_actuel_m_sem = Math.round(v);
    }
    // ⚠️ Pas de défaut pour `denivele_actuel_m_sem`. Contrairement au volume (dont un départ prudent
    // est au moins un ordre de grandeur défendable), **aucun D+ hebdo « normal » n'existe** : entre
    // un coureur de plaine (0 m) et un montagnard (2 000 m), il n'y a pas de milieu raisonnable.
    // Le moteur RÉCLAME la donnée au lieu d'en fabriquer une (même doctrine que la cadence).
    if (!r.niveau) {
      r.niveau = "intermediaire";
      p.hypotheses.push("Niveau course non renseigné → défaut intermédiaire — à confirmer.");
    }
    if (!r.jours_par_semaine) {
      r.jours_par_semaine = 3;
      p.hypotheses.push("Jours de course/sem non renseignés → défaut 3 j — à confirmer.");
    }
    // ═══ PERFORMANCES — un HISTORIQUE, plus une référence unique ═══════════════════════════════
    //
    // 🔴 **Le défaut de conception réparé le 2026-07-12.** `temps_reference` n'acceptait **qu'UNE**
    // performance, et tout le plan en dérivait. Un coureur réel en a plusieurs — **et elles se
    // contredisent**. Cette contradiction n'est pas du bruit : **c'est le fait le plus informatif du
    // dossier** (une perf longue plus lente que la courte ne le prédit = **déficit d'endurance**).
    //
    // `temps_reference` reste **lu** et **migré** (aucun persona ne casse), mais il devient **une
    // entrée parmi d'autres** de `running.performances[]`. La doctrine complète est dans
    // `performances.js` : on ne prend **pas** la meilleure, on ne fait **pas** la moyenne — on
    // **pondère** (la distance la plus proche de l'objectif pèse le plus : veille/03 §2,
    // veille/12 §4) et on **explique la divergence**.
    const mig = migrerPerformances(r);
    r.performances = mig.performances;
    r.performances_migration = mig.migration;
    if (mig.migration && !mig.migration.doublon) p.hypotheses.push(mig.migration.message);

    // VDOT de secours — utilisé UNIQUEMENT si aucune performance n'est exploitable.
    const VDOT_PAR_NIVEAU = { debutant: 30, intermediaire: 38, avance: 45 };
    const vdotSecours = VDOT_PAR_NIVEAU[r.niveau] ?? 35;

    r.reconciliation = reconcilier(r.performances, {
      objectif_distance_m: distanceObjectifM(r.objectif.distance),
      aujourdhui,
      vdot_secours: vdotSecours,
    });

    if (r.reconciliation.source_vdot === "suppose_par_niveau" || r.reconciliation.source_vdot === "aucune") {
      r.vdot_estime = vdotSecours;
      p.hypotheses.push(`Aucun temps de référence → VDOT ${r.vdot_estime} supposé d'après le niveau « ${r.niveau} » ; le test chrono planifié en début de plan est INDISPENSABLE pour recaler les allures (veille/12 §8).`);
    }
    for (const a of r.reconciliation.avertissements) p.hypotheses.push(a);
    // Le PROFIL est une conclusion du moteur, pas une donnée : elle est remontée en hypothèse
    // (transparence, philosophy §4 — l'utilisateur doit pouvoir demander « pourquoi ? »).
    if (["deficit_endurance", "deficit_vitesse"].includes(r.reconciliation.profil.code)) {
      p.hypotheses.push(
        `🎯 **Profil détecté : ${r.reconciliation.profil.libelle}**${r.reconciliation.profil.borne_inferieure ? " (borne inférieure — le vrai écart est plus grand)" : ""} ` +
          `— et **ça change ton plan**. ${r.reconciliation.profil.consequence}`
      );
    }
    if (!r.volume_actuel_km_sem) {
      r.volume_actuel_km_sem = { "5k": 15, "10k": 20, semi: 25, marathon: 30 }[r.objectif.distance] ?? 20;
      p.hypotheses.push(`Volume actuel non renseigné → départ prudent à ${r.volume_actuel_km_sem} km/sem — à confirmer (donnée critique pour la progressivité).`);
    }
    if (!r.longue_sortie_actuelle_km) {
      r.longue_sortie_actuelle_km = Math.round(r.volume_actuel_km_sem * 0.35);
      p.hypotheses.push(`Longue sortie actuelle non renseignée → estimée à ${r.longue_sortie_actuelle_km} km (~35 % du volume) — à confirmer.`);
    }
    // ⚖️ `charge_42j_depart` : NOTRE nom pour la moyenne 42 j de la charge d'endurance. Ce que
    // TrainingPeaks appelle « CTL » est une marque déposée de Peaksware (veille/19 §3.5) — on la
    // cite, on ne s'en sert pas comme nom de champ.
    if (!r.charge_42j_depart) {
      r.charge_42j_depart = Math.round(r.volume_actuel_km_sem * 0.9);
      p.hypotheses.push(`Charge moyenne 42 j de départ estimée à ${r.charge_42j_depart} (CE) depuis le volume actuel — sera remplacée par les données réelles (Strava, Phase 3).`);
    }
    r.hybride = r.hybride ?? {};
    r.hybride.salle_par_semaine = r.hybride.salle_par_semaine ?? (p.muscu ? Math.min(p.muscu.jours_par_semaine, 2) : 0);
  }

  // --- Nutrition ---
  p.nutrition = p.nutrition ?? {};
  const n = p.nutrition;
  if (!n.objectif) {
    n.objectif = p.running?.course ? "maintien_prepa" : p.muscu?.objectif === "recomposition" ? "recomposition" : "maintien";
    p.hypotheses.push(`Objectif nutrition non renseigné → « ${n.objectif} » déduit des objectifs d'entraînement — à confirmer.`);
  }
  if (!n.facteur_activite) {
    // Toutes les séances comptent : muscu, course, et les activités croisées
    // déclarées côté hybride quand l'autre module n'est pas actif.
    const seances =
      (p.muscu?.jours_par_semaine ?? 0) +
      (p.running?.jours_par_semaine ?? 0) +
      (p.muscu && !p.running ? p.muscu.hybride?.course_par_semaine ?? 0 : 0) +
      (p.running && !p.muscu ? p.running.hybride?.salle_par_semaine ?? 0 : 0);
    n.facteur_activite = facteurActivite(seances);
    p.hypotheses.push(`Facteur d'activité ${n.facteur_activite} dérivé de ${seances} séance(s)/sem — estimation grossière, à remplacer par la dépense mesurée dès les wearables (veille/04 §1).`);
  }
  if (!n.proteines_g_par_kg) {
    n.proteines_g_par_kg = p.muscu && p.running ? 1.9 : p.muscu ? 2.0 : 1.8;
  }
  if (!n.lipides_g_par_kg) {
    n.lipides_g_par_kg = p.running?.course ? 0.9 : 0.8;
  }

  // --- ANGLES MORTS — ce que le moteur ne sait pas de CETTE personne, et qu'il DIT ------------
  // 🔴 Le défaut le plus sournois trouvé par la batterie adverse (2026-07-11) : le moteur servait
  // à une femme un programme complet et une cible calorique en déficit **sans jamais mentionner
  // qu'il ne modélise pas la physiologie féminine** — un trou pourtant DÉCLARÉ dans son propre
  // audit de veille (14 §P2). Il ne mentait pas : il se taisait. Sur un produit de santé, c'est
  // équivalent — on ne peut pas corriger ce qu'on ne vous dit pas.
  //
  // ⚠️ Ces angles morts n'AJOUTENT aucune règle de programmation (pas de volume baissé, pas de
  // coefficient inventé) : ils DÉCLARENT. C'est l'ADR 0006 — mieux vaut refuser que d'inventer.
  p.angles_morts = anglesMorts(p);
  for (const am of p.angles_morts) {
    p.hypotheses.push(`🕳️ **${am.titre}** — ${am.fait} Voir le bloc « Ce que le moteur ne sait pas de toi » de chaque document.`);
  }

  return p;
}
