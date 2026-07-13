// ═══════════════════════════════════════════════════════════════════════════════════════════════
// libre.js — LE CHOIX LIBRE PASSE PAR LE MOTEUR
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
//   > « Je n'ai pas l'impression que ce soit possible de **choisir n'importe quel exercice** que je
//   >   voudrais faire — plutôt des exercices qui sont **imposés**. »
//
// L'app PRESCRIVAIT, l'utilisateur SUBISSAIT. Il ne pouvait ni ajouter un exercice, ni en remplacer
// un, ni faire une séance qui n'était pas au programme.
//
// ── 🔴 CE MODULE NE RÉÉCRIT RIEN. IL BRANCHE. ─────────────────────────────────────────────────
// Tout ce dont un choix libre a besoin existait déjà, écrit et testé :
//   • le référentiel d'exercices        `exercices.js catalogueOuvert()`
//   • le droit de REFUSER / d'ADAPTER   `limitations.js appliquerLimitations()`
//   • la double progression             `adaptation.js adapterMuscu()` + `appliquerAdaptationMuscu()`
//   • l'entrée au journal               `journal.js ajouterSeanceMuscu()`
// **Le moteur SAIT. L'app ne DEMANDAIT pas.** Ce fichier est la question.
//
// ── 🔴 UN CHOIX LIBRE N'EST PAS UN CHOIX SANS GARDE-FOU ───────────────────────────────────────
// « Le moteur doit pouvoir REFUSER de prescrire » (philosophy §3) ne s'éteint pas parce que c'est
// l'utilisateur qui a tapé. Un développé militaire choisi à la main avec une **épaule ACTIVE** est
// exactement le mouvement que `REGLES.epaule.ACTIF` retire du programme généré : il doit être
// **refusé de la même façon, avec les MÊMES mots**.
//
// D'où le mécanisme, et il n'a rien d'original — c'est celui de `moteur.js enregistrerSortie()` :
// **on compose une séance JETABLE d'un seul exercice, et on la soumet au juge.** Ce qu'il en
// retire, ce qu'il substitue, ce qu'il plafonne, le RIR qu'il relève : c'est le verdict.
// Un seul juge, une seule table de règles, un seul jeu de mots. Deux chemins de décision
// divergeraient, et celui du choix libre serait le mauvais — celui que les tests ne couvrent pas.
//
// Module PUR : aucune I/O. Persona, journal et référentiel sont injectés.

import { LIBELLES_PATTERN } from "./exercices.js";
import { appliquerLimitations } from "./limitations.js";
import { adapterMuscu, appliquerAdaptationMuscu } from "./adaptation.js";
// 🔴 Ni recopiées, ni ré-inventées : la table des prescriptions et l'élargissement du RIR débutant
// vivent dans le module qui compose les séances (`muscu.js`), et **on les importe**. Un fait
// dupliqué est un fait qui divergera — et celui-ci pilote ce que l'utilisateur soulève.
import { PRESCRIPTIONS, RIR_DEBUTANT } from "./muscu.js";

/** Le nom que porte une séance qui n'était pas au programme. Il part tel quel au journal. */
export const NOM_SEANCE_LIBRE = "Séance libre";

/**
 * Prescriptions de repli — utilisées **uniquement** quand le slot de l'exercice choisi n'apparaît
 * nulle part dans le programme généré de l'utilisateur.
 *
 * ⚠️ Ce ne sont **pas des chiffres inventés pour faire sérieux**, et ce ne sont pas non plus des
 * chiffres « sourcés » : ce sont **exactement les conventions des templates de `muscu.js`**
 * (composé 3–4 séries, isolation 2–3, gainage 2–3), prises à leur borne basse. Elles ne portent
 * aucune affirmation de santé, et l'utilisateur les ajuste dans la séance (`ajouterSerie` /
 * `retirerSerie` existent depuis toujours).
 *
 * **La règle de priorité, elle, est le vrai correctif** : si l'exercice choisi occupe un slot que
 * le programme contient DÉJÀ, on reprend **sa** prescription — celle que le moteur a adaptée au
 * niveau, à l'objectif et aux limitations. Un exercice libre n'est pas un exercice hors-la-loi.
 */
export const SERIES_DEFAUT = { compose: 3, isolation: 2 };

/** Le type de prescription d'un exercice — la même dérivation que les templates de `muscu.js`. */
function prescriptionDe(exo, objectif) {
  if (exo.pattern === "core") return exo.isometrique ? "isometrie" : "anti_rotation";
  if (exo.type === "isolation") return "hypertrophie_iso";
  // `adapterPrescriptions` (muscu.js) passe le PREMIER composé de la séance en « force » quand
  // l'objectif l'est. Une séance libre d'un exercice : ce composé, c'est lui.
  return objectif === "force" ? "force" : "hypertrophie";
}

/**
 * La prescription d'un exercice choisi librement.
 *
 * 1. **Le programme d'abord.** Le même slot y est peut-être déjà — avec ses séries, ses reps, son
 *    RIR, son repos, tous adaptés (niveau, objectif, limitations). On les reprend.
 * 2. **Sinon, le repli** ci-dessus, et il est déclaré (`presc_source`) : l'app peut le dire.
 */
function prescrire(exo, persona, programme) {
  const objectif = persona?.muscu?.objectif ?? null;

  for (const s of programme?.seances ?? []) {
    const jumeau = s.exercices?.find((e) => e.slot === exo.slot);
    if (!jumeau) continue;
    return {
      series: jumeau.series,
      prescription: jumeau.prescription,
      reps: jumeau.reps,
      rir: jumeau.rir,
      repos: jumeau.repos,
      presc_source: { origine: "programme", seance: s.nom },
    };
  }

  const presc = prescriptionDe(exo, objectif);
  const { reps, rir, repos } = PRESCRIPTIONS[presc];
  return {
    series: exo.type === "isolation" || exo.pattern === "core" ? SERIES_DEFAUT.isolation : SERIES_DEFAUT.compose,
    prescription: presc,
    reps,
    rir: persona?.muscu?.niveau === "debutant" ? (RIR_DEBUTANT[rir] ?? rir) : rir,
    repos,
    presc_source: { origine: "defaut" },
  };
}

/**
 * 🔴 **LE VERDICT DU MOTEUR SUR UN EXERCICE CHOISI.** Il peut REFUSER, ADAPTER, ou laisser passer.
 *
 * @param {object}  o
 * @param {string}  o.id          id dataset de l'exercice choisi (`Standing_Military_Press`…)
 * @param {object}  o.persona     persona **normalisé** (celui que `programmeAdapteMuscu` rend)
 * @param {object}  o.programme   le programme généré (pour reprendre la prescription d'un slot connu)
 * @param {object}  o.journal     le journal (double progression : la charge de la PROCHAINE série)
 * @param {object}  o.referentiel référentiel d'exercices
 *
 * @returns {{
 *   verdict: 'ok'|'adapte'|'refuse'|'indisponible',
 *   exercice: object|null,   l'exercice tel qu'il entrera dans la séance (SUBSTITUÉ si adapté)
 *   demande: object|null,    celui qu'il a demandé (≠ `exercice` quand le moteur a substitué)
 *   pourquoi: string|null,   les mots DU MOTEUR — jamais reformulés ici
 *   rir_ajustes: object[], plafond: object|null, alertes: string[]
 * }}
 */
export function jugerExerciceLibre({ id, persona, programme = null, journal = null, referentiel }) {
  const m = persona?.muscu ?? {};
  const { exercices, indisponibles } = referentiel.catalogueOuvert(m.materiel, m.niveau);

  const exo = exercices.find((e) => e.id === id);
  if (!exo) {
    // 🔴 Le premier refus, et il est ANTÉRIEUR aux limitations : matériel ou niveau. Le moteur ne
    // fabrique pas un exercice qu'il ne peut pas servir — il dit lequel, et pourquoi.
    const hors = indisponibles.find((e) => e.id === id);
    return {
      verdict: "indisponible",
      exercice: null,
      demande: hors ?? null,
      pourquoi: hors?.message ?? `« ${id} » n'appartient pas au référentiel du moteur : il ne sait ni le juger, ni le loguer.`,
      rir_ajustes: [],
      plafond: null,
      alertes: [],
    };
  }

  const demande = { ...exo };
  const candidat = { ...exo, ...prescrire(exo, persona, programme) };

  // ── LE JUGE. Une séance JETABLE d'un seul exercice, soumise à la MÊME fonction que le programme.
  //    `appliquerLimitations` MUTE les séances : retraits, substitutions, plafonds, planchers de RIR.
  const seances = [{ nom: NOM_SEANCE_LIBRE, exercices: [candidat] }];
  const rapport = appliquerLimitations(seances, persona, referentiel);
  const final = seances[0].exercices[0] ?? null;

  // ⚠️ On ne remonte QUE ce qui concerne CET exercice. `rapport.alertes` contient aussi les vérités
  //    globales du programme (échauffement non fait, renvoi médical…) — elles vivent déjà sur
  //    l'écran Programme, et les déverser dans un sélecteur d'exercice serait du bruit, pas de la
  //    transparence.
  const nomsDeCetExo = new Set([demande.nom, final?.nom].filter(Boolean));
  const rir_ajustes = rapport.rir_ajustes.filter((r) => nomsDeCetExo.has(r.exercice));
  const plafond = rapport.plafonds.find((p) => nomsDeCetExo.has(p.exercice)) ?? null;

  if (!final) {
    // REFUS. Le moteur a retiré l'exercice — règle nommée, ou filet de cohérence lombaire.
    const retrait = rapport.retraits.find((r) => r.exercice === demande.nom);
    return {
      verdict: "refuse",
      exercice: null,
      demande,
      // Les mots du moteur, tels quels. Les reformuler ici, c'est ouvrir une deuxième vérité.
      pourquoi: retrait?.pourquoi ?? null,
      retrait: retrait ?? null,
      rir_ajustes,
      plafond,
      alertes: [],
    };
  }

  const substitution = rapport.substitutions.find((s) => s.avant === demande.nom) ?? null;

  // ── La charge. `charges_reference` est la dernière charge RÉELLE (recalée depuis le journal par
  //    `recalerPersona`). Même règle que `muscu.js appliquerChargesReference` : correspondance
  //    EXACTE du nom, jamais une ressemblance.
  const ref = m.charges_reference?.[final.nom];
  if (ref?.charge_kg != null) {
    final.charge_depart_kg = ref.charge_kg;
    // Un exercice PLAFONNÉ par une limitation ne démarre pas au-dessus de la dernière charge
    // tolérée : la charge de référence EST le plafond, et la progression passe par les reps.
    if (final.plafond_charge) final.charge_max_kg = ref.charge_kg;
  }
  // 🔴 SUBSTITUÉ : la charge déclarée sur le mouvement d'ORIGINE ne le suit PAS (une charge guidée
  //    n'est pas une charge libre, et aucune conversion n'est sourçable) — mais elle n'est pas
  //    JETÉE : elle devient un REPÈRE, nommé sur son mouvement d'origine. Exactement `muscu.js`.
  const refOrigine = substitution ? m.charges_reference?.[demande.nom] : null;
  if (refOrigine?.charge_kg != null) {
    final.repere_charge = { nom: demande.nom, charge_kg: refOrigine.charge_kg, reps: refOrigine.reps ?? null };
  }

  // ── La double progression. `adapterMuscu` DÉCIDE (+2,5 kg, repartir à 8 reps),
  //    `appliquerAdaptationMuscu` APPLIQUE. Les deux sont appelées **sur la séance jetable** : le
  //    « Prévu » d'un exercice libre est calculé par le même code que celui d'un exercice programmé.
  if (journal?.seances_muscu?.length) {
    const jetable = { seances };
    appliquerAdaptationMuscu(jetable, adapterMuscu(jetable, journal, referentiel));
  }

  return {
    verdict: substitution ? "adapte" : "ok",
    exercice: final,
    demande,
    pourquoi: substitution?.pourquoi ?? null,
    substitution,
    rir_ajustes,
    plafond,
    // Les alertes SPÉCIFIQUES à la substitution impossible (« aucune variante mieux tolérée
    // n'existe avec ce matériel — l'exercice est CONSERVÉ tel quel »). Celle-là concerne bien
    // l'exercice choisi, et la taire serait mentir sur ce qui a été adapté.
    alertes: rapport.alertes.filter((a) => a.includes(demande.nom) || (final.nom !== demande.nom && a.includes(final.nom))),
  };
}

/**
 * Le catalogue à MONTRER, groupé par pattern moteur — et **le verdict est déjà rendu** : un
 * exercice que le moteur refuserait est marqué `refuse` **dans la liste**, avec son pourquoi.
 *
 * ⚠️ On ne le CACHE pas. Cacher un mouvement, c'est laisser croire qu'il n'existe pas — et
 * l'utilisateur le ferait quand même, sans le filet. **On le montre, on dit non, on dit pourquoi.**
 * C'est toute la différence entre un garde-fou et une censure.
 */
export function catalogueLibre({ persona, programme = null, journal = null, referentiel }) {
  const m = persona?.muscu ?? {};
  const { exercices, indisponibles, recommandation_materiel } = referentiel.catalogueOuvert(m.materiel, m.niveau);

  const juges = exercices.map((e) => {
    const v = jugerExerciceLibre({ id: e.id, persona, programme, journal, referentiel });
    return {
      id: e.id,
      nom: e.nom,
      pattern: e.pattern,
      slot: e.slot,
      muscle: e.muscles[0] ?? null,
      equipement: e.equipement,
      verdict: v.verdict,
      pourquoi: v.pourquoi,
      // Le nom de ce qui sera RÉELLEMENT fait (l'exercice adapté), quand il diffère.
      adapte_en: v.verdict === "adapte" ? v.exercice.nom : null,
    };
  });

  // 🔴 L'ORDRE DES GROUPES EST CELUI DU MOTEUR — vu à l'écran, pas dans un test (2026-07-13).
  //
  // Groupés « au fil de la liste », les patterns sortaient dans l'ordre alphabétique des NOMS
  // d'exercices : « Curl biceps » ouvrait le catalogue. On tapait « Séance libre » et on tombait
  // sur **dix isolations — curls, mollets, triceps — avant le moindre squat ou développé.**
  // C'est l'inverse de la façon dont une séance se construit : les composés d'abord, les
  // isolations à la fin. Le moteur le sait déjà (`LIBELLES_PATTERN` est déclaré dans cet ordre,
  // et les templates de `muscu.js` composent dans cet ordre) — l'écran ne le lisait pas.
  //
  // On ne fabrique donc PAS un deuxième classement : on suit l'ordre de déclaration du moteur.
  const groupes = [];
  for (const pattern of Object.keys(LIBELLES_PATTERN)) {
    const exercices = juges.filter((e) => e.pattern === pattern);
    if (!exercices.length) continue;
    groupes.push({ pattern, libelle: LIBELLES_PATTERN[pattern], exercices });
  }

  return { groupes, exercices: juges, indisponibles, recommandation_materiel };
}
