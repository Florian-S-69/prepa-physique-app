// Générateur de programme musculation — règles issues de :
//   docs/veille/02-science-musculation.md (volume, fréquence, RIR, double progression, deload)
//   docs/veille/09-biomecanique-exercices.md (consignes, ROM, équilibre push/pull, patterns)
//   docs/veille/10-culture-coaching-muscu.md (ton copilote, vocabulaire)
//   docs/veille/11-entrainement-hybride.md (cohabitation avec la course)
// Générique : le persona (normalisé par personne.js) pilote tout — split selon les jours,
// volume/RIR selon le niveau, prescriptions selon l'objectif. Aucune valeur utilisateur en dur.
//
// Les exercices viennent de la base publique free-exercise-db (873 exercices, veille/05),
// résolus par `src/lib/exercices.js` : les séances déclarent des SLOTS (intentions motrices),
// le référentiel choisit la variante compatible avec le MATÉRIEL et le NIVEAU de l'utilisateur.
// Le référentiel est INJECTÉ (chargé une seule fois par le CLI) — ce module reste pur.

import { MUSCLES_ACCESSOIRES, PROFILS_MATERIEL, suggererNoms } from "./exercices.js";
import { appliquerLimitations, appliquerLimitationsCourse } from "./limitations.js";
import { echauffementSeance } from "./echauffement.js";
import { composerSemaineMuscuHybride } from "./placement.js";
import { avisDepuisTexte, adaptationsMuscuEnAvis, adaptationsCourseEnAvis } from "./avis.js";

// Prescriptions par objectif (veille/02 §3 & §7 ; isométries en durée, veille/09).
const PRESCRIPTIONS = {
  hypertrophie: { reps: "8–12", rir: "1–3", repos: "2–3 min" },
  hypertrophie_iso: { reps: "10–15", rir: "1–2", repos: "1–2 min" },
  force: { reps: "3–6", rir: "0–2", repos: "3–5 min" },
  isometrie: { reps: "30–60 s", rir: "—", repos: "1 min" },
  anti_rotation: { reps: "10–12 / côté", rir: "2–3", repos: "1 min" },
};

// Débutants : marges de RIR plus larges, focus technique (veille/02 §6).
const RIR_DEBUTANT = { "1–3": "2–4", "1–2": "2–3", "0–2": "2–3" };

// Volume cible (séries pondérées/muscle/sem) selon le niveau (veille/02 §1 & §7).
// @chiffre-derive veille/02 §1 donne DEUX repères : « ≥ 10 séries/sem/muscle » et « ≈ 10–12 pour un
// intermédiaire », plus des **rendements décroissants**. Les bornes 6 · 14 · 16 n'y sont PAS : ce
// sont des **interpolations par niveau** autour de ces repères. La règle est sourcée, la graduation
// ne l'est pas — et le moteur ne fait pas semblant du contraire.
export const CIBLES_VOLUME = {
  debutant: { min: 6, max: 12 },
  intermediaire: { min: 10, max: 14 },
  avance: { min: 10, max: 16 },
};

// Un slot non résolu (matériel/niveau) renvoie null : la séance se compose sans lui,
// et le trou est remonté en alerte plutôt que comblé par un exercice inadapté.
function ex(catalogue, slot, series, presc, superset = null) {
  const e = catalogue.slots[slot];
  if (!e) return null;
  return { ...e, series, superset, prescription: presc, ...PRESCRIPTIONS[presc] };
}

/**
 * Premier slot résolvable d'une liste ORDONNÉE — repli de composition à l'intérieur d'un
 * MÊME pattern moteur, jamais vers un autre pattern.
 *
 * Cas d'usage : le soulevé de terre conventionnel (`hinge_lourd`) exige une barre chargée.
 * Sans barre, la séance retomberait sans aucune charnière de hanche — or veille/09 §1 demande
 * de couvrir tous les patterns chaque semaine. On se replie donc sur le roumain
 * (`hinge_principal`), qui est bien le même pattern. Ce repli n'est PAS silencieux : le slot
 * non couvert reste listé dans `slots_manquants` et le programme dit explicitement que le
 * roumain ne remplace pas le conventionnel sur un objectif de force (TROUS_CONNUS).
 */
function exPremier(catalogue, slots, series, presc, superset = null) {
  for (const slot of slots) {
    const e = ex(catalogue, slot, series, presc, superset);
    if (e) return e;
  }
  return null;
}

/**
 * Nettoie une séance composée de slots partiellement résolus :
 *  - retire les trous (null) ;
 *  - dédoublonne (deux slots peuvent tomber sur le même exercice quand le matériel est pauvre) ;
 *  - défait un superset devenu orphelin (son partenaire a disparu).
 */
function nettoyerSeance(seance) {
  const vus = new Set();
  seance.exercices = seance.exercices.filter((e) => {
    if (!e || vus.has(e.id)) return false;
    vus.add(e.id);
    return true;
  });
  const compte = {};
  for (const e of seance.exercices) if (e.superset) compte[e.superset[0]] = (compte[e.superset[0]] ?? 0) + 1;
  for (const e of seance.exercices) if (e.superset && compte[e.superset[0]] < 2) e.superset = null;
  return seance;
}

/** Split selon les jours dispo (skill generer-programme-muscle §1). */
export function choisirSplit(jours) {
  if (jours <= 3) return "full-body";
  if (jours === 4) return "upper/lower";
  return "push/pull/legs";
}

// --- Modèles de séances par split. Le volume est calibré pour tomber dans la
// --- cible du niveau une fois multiplié par la fréquence hebdo du split.
//
// 🔴 `nom` EST UN NOM. `focus` EST UNE DÉFINITION. Ce sont deux champs.
//
// Une seule chaîne — `"Push (pectoraux, épaules, triceps)"` — atterrissait sur TROIS des quatre
// écrans : le titre du protagoniste (où elle passait à la ligne et repoussait « Démarrer » d'un
// tiers d'écran), l'en-tête de la séance en cours (où elle était **tronquée en plein mot** :
// « PUSH (PECTORAUX, ÉPAULES, … »), et le titre du programme. Elle portait **5 des 11 parenthèses
// du dépôt** — et une parenthèse est, par définition, la précision dont l'auteur admet lui-même
// qu'elle n'est pas dans le fil.
//
// **La liste des muscles est une VÉRITÉ. Elle ne se supprime pas : elle change de conteneur.**
// Elle vit dans `focus`, l'app la rend en sous-titre là où on PLANIFIE (l'onglet Programme), et
// la tait là où on SOULÈVE (un homme qui tient un haltère sait ce qu'est un Push). Le CLI, lui,
// la remet entre parenthèses : c'est du Markdown, pas un écran de 390 px.
//
// ⚠️ Le code SAVAIT déjà que la parenthèse était un ornement : il l'arrachait avec
// `nom.split(" (")[0]` à **trois** endroits pour fabriquer les libellés de jour. Trois
// contournements du même défaut, c'est le défaut qui demande à être corrigé.

function seancesFullBody(nbJours, cat) {
  const seances = [
    {
      nom: "Full-body A",
      exercices: [
        ex(cat, "squat_principal", 3, "hypertrophie"),
        ex(cat, "push_h_principal", 3, "hypertrophie"),
        ex(cat, "pull_h_principal", 3, "hypertrophie"),
        ex(cat, "push_v_lateral", 2, "hypertrophie_iso", "A1"),
        ex(cat, "iso_biceps", 2, "hypertrophie_iso", "A2"),
        ex(cat, "core_iso", 2, "isometrie"),
      ],
    },
    {
      nom: "Full-body B",
      exercices: [
        // ⚠️ PAS de soulevé de terre conventionnel ici — décision assumée, pas un oubli.
        // Deux raisons, mesurées :
        //  1. Volume : le conventionnel est érecteurs-dominant dans le référentiel (primaire =
        //     `lower back`), le roumain est ischio-dominant (primaire = `hamstrings`). L'échanger
        //     ici fait passer les ischios de 6,5 à 5 séries/sem sur un full-body 2 j — SOUS le
        //     plancher de 6 (veille/02 §1). Le full-body n'a pas le volume pour absorber le troc.
        //  2. Technique : le SDT est un mouvement techniquement exigeant (veille/09 §2), et le
        //     full-body 2–3 j est le split des débutants — aucune séance où espacer sa charge axiale.
        // Conséquence (déclarée à l'utilisateur, cf. `hypotheses_programme`) : à 2–3 j/sem, le
        // conventionnel n'est pas programmé. Il apparaît à partir de 4 j (upper/lower).
        ex(cat, "hinge_principal", 3, "hypertrophie"),
        ex(cat, "push_v_principal", 3, "hypertrophie"),
        ex(cat, "pull_v_principal", 3, "hypertrophie"),
        ex(cat, "hinge_ischios", 2, "hypertrophie_iso", "A1"),
        ex(cat, "iso_mollets", 2, "hypertrophie_iso", "A2"),
        ex(cat, "core_antirot", 2, "anti_rotation"),
      ],
    },
    {
      nom: "Full-body C",
      exercices: [
        ex(cat, "squat_unilateral", 3, "hypertrophie"),
        ex(cat, "push_h_incline", 3, "hypertrophie"),
        ex(cat, "pull_h_unilateral", 3, "hypertrophie"),
        ex(cat, "push_v_lateral", 2, "hypertrophie_iso", "A1"),
        ex(cat, "iso_triceps", 2, "hypertrophie_iso", "A2"),
        ex(cat, "core_iso", 2, "isometrie"),
      ],
    },
  ];
  return seances.slice(0, nbJours);
}

function seancesUpperLower(cat) {
  return [
    {
      nom: "Upper A",
      focus: "dominante horizontale",
      exercices: [
        ex(cat, "push_h_principal", 4, "hypertrophie"),
        ex(cat, "pull_h_principal", 4, "hypertrophie"),
        ex(cat, "push_v_principal", 2, "hypertrophie"),
        ex(cat, "pull_v_principal", 2, "hypertrophie"),
        ex(cat, "push_v_lateral", 3, "hypertrophie_iso", "A1"),
        ex(cat, "iso_biceps", 3, "hypertrophie_iso", "A2"),
      ],
    },
    {
      nom: "Lower A",
      focus: "dominante quadriceps",
      exercices: [
        ex(cat, "squat_principal", 4, "hypertrophie"),
        ex(cat, "hinge_principal", 3, "hypertrophie"),
        ex(cat, "squat_machine", 3, "hypertrophie"),
        ex(cat, "hinge_ischios", 2, "hypertrophie_iso", "A1"),
        ex(cat, "iso_mollets", 3, "hypertrophie_iso", "A2"),
        ex(cat, "core_iso", 3, "isometrie"),
      ],
    },
    {
      nom: "Upper B",
      focus: "dominante verticale",
      exercices: [
        ex(cat, "push_v_principal", 3, "hypertrophie"),
        ex(cat, "pull_v_principal", 4, "hypertrophie"),
        ex(cat, "push_h_incline", 3, "hypertrophie"),
        ex(cat, "push_h_dips", 3, "hypertrophie"),
        ex(cat, "pull_h_unilateral", 3, "hypertrophie"),
        ex(cat, "push_v_lateral", 2, "hypertrophie_iso", "A1"),
        ex(cat, "iso_triceps", 3, "hypertrophie_iso", "A2"),
      ],
    },
    {
      nom: "Lower B",
      focus: "dominante chaîne postérieure",
      exercices: [
        // Le soulevé de terre CONVENTIONNEL ouvre la séance postérieure (mouvement le plus lourd
        // → en premier, à fraîcheur maximale). Il est délibérément placé sur une AUTRE séance que
        // le roumain (Lower A) : les deux chargent le même maillon lombaire, les cumuler dans la
        // même séance concentrerait la fatigue au lieu de la répartir (veille/02 §5, veille/09 §1).
        exPremier(cat, ["hinge_lourd", "hinge_principal"], 3, "hypertrophie"),
        ex(cat, "squat_unilateral", 3, "hypertrophie"),
        ex(cat, "hinge_fessiers", 2, "hypertrophie"),
        ex(cat, "hinge_ischios", 2, "hypertrophie_iso", "A1"),
        ex(cat, "iso_mollets", 2, "hypertrophie_iso", "A2"),
        ex(cat, "core_antirot", 3, "anti_rotation"),
      ],
    },
  ];
}

function seancesPPL(nbJours, cat) {
  const cycle = [
    {
      nom: "Push",
      focus: "pectoraux, épaules, triceps",
      exercices: [
        ex(cat, "push_h_principal", 3, "hypertrophie"),
        ex(cat, "push_v_principal", 2, "hypertrophie"),
        ex(cat, "push_h_incline", 2, "hypertrophie"),
        ex(cat, "push_v_lateral", 2, "hypertrophie_iso", "A1"),
        ex(cat, "iso_triceps", 2, "hypertrophie_iso", "A2"),
      ],
    },
    {
      nom: "Pull",
      focus: "dos, biceps",
      exercices: [
        ex(cat, "pull_h_principal", 3, "hypertrophie"),
        ex(cat, "pull_v_principal", 3, "hypertrophie"),
        ex(cat, "pull_h_unilateral", 2, "hypertrophie"),
        ex(cat, "iso_biceps", 2, "hypertrophie_iso"),
        ex(cat, "core_antirot", 2, "anti_rotation"),
      ],
    },
    {
      nom: "Legs",
      focus: "quadriceps, ischios, fessiers",
      exercices: [
        ex(cat, "squat_principal", 3, "hypertrophie"),
        // 2 séries (et non 3) : la séance est répétée ~2×/sem, et le volume INDIRECT des
        // ischios (squat, presse, pont fessier) est désormais compté depuis le référentiel —
        // 3 séries poussaient le total hors fourchette (rendements décroissants, veille/02 §1).
        // Charnière LOURDE (conventionnel) ; repli sur le roumain sans barre. Le PPL n'ayant
        // qu'une séance jambes dans son cycle, elle porte squat lourd + soulevé de terre : le
        // garde-fou lombaire ci-dessous le signale explicitement.
        exPremier(cat, ["hinge_lourd", "hinge_principal"], 2, "hypertrophie"),
        ex(cat, "squat_machine", 2, "hypertrophie"),
        ex(cat, "hinge_fessiers", 2, "hypertrophie"),
        ex(cat, "hinge_ischios", 2, "hypertrophie_iso", "A1"),
        ex(cat, "iso_mollets", 2, "hypertrophie_iso", "A2"),
        ex(cat, "core_iso", 2, "isometrie"),
      ],
    },
  ];
  // 6 j = cycle ×2 (fréquence 2×/muscle) ; 5 j = cycle continu (fréquence ~1,7×).
  return { cycle, repetitions: nbJours === 6 ? 2 : nbJours / 3 };
}

/** Applique niveau (RIR élargi débutant) et objectif (force sur le 1er composé). */
function adapterPrescriptions(seances, { niveau, objectif }) {
  for (const s of seances) {
    if (objectif === "force") {
      const principal = s.exercices.find((e) => e.type === "compose");
      if (principal) Object.assign(principal, PRESCRIPTIONS.force, { prescription: "force" });
    }
    if (niveau === "debutant") {
      for (const e of s.exercices) e.rir = RIR_DEBUTANT[e.rir] ?? e.rir;
    }
  }
  return seances;
}

/**
 * Priorités musculaires : +1 série sur jusqu'à 2 exercices dont le muscle prioritaire
 * est le moteur principal (le volume est LE levier, veille/02 §1) — en gardant le
 * total raisonnable (rendements décroissants).
 *
 * ⚠️ Une priorité ne passe PAS au-dessus d'une limitation. Le volume est bien le levier n°1,
 * mais on ne charge pas DAVANTAGE une chaîne qui fait mal : les exercices dont le pattern (ou
 * le slot) est sous contrainte d'une limitation ACTIVE/ANTÉCÉDENT sont exclus du bonus. Une
 * priorité entièrement bloquée est REMONTÉE (`refusees`), jamais avalée en silence.
 */
function appliquerPriorites(seances, priorites, contraintes = {}) {
  const patterns = contraintes.patterns_sous_contrainte ?? [];
  const slots = contraintes.slots_sous_contrainte ?? [];
  const bloque = (e) => patterns.includes(e.pattern) || slots.includes(e.slot);

  const appliquees = [];
  const refusees = [];
  for (const muscle of priorites ?? []) {
    let bumps = 0;
    let bloques = 0;
    for (const s of seances) {
      for (const e of s.exercices) {
        if (bumps >= 2) break;
        if (e.muscles[0] !== muscle) continue;
        if (bloque(e)) {
          bloques++;
          continue;
        }
        e.series += 1;
        bumps++;
      }
    }
    if (bumps > 0) appliquees.push({ muscle, series_ajoutees: bumps });
    else if (bloques > 0) refusees.push({ muscle, exercices_bloques: bloques });
  }
  return { appliquees, refusees };
}

/**
 * Séries hebdo pondérées par muscle (veille/02 §7). Premier muscle listé =
 * moteur principal (1 série = 1) ; les suivants = 0,5 (comptage fractionnaire).
 * `frequence` multiplie quand les séances du modèle sont répétées dans la semaine.
 */
export function volumeParMuscle(seances, frequence = 1) {
  const compte = {};
  for (const s of seances) {
    for (const e of s.exercices) {
      e.muscles.forEach((m, i) => {
        compte[m] = (compte[m] ?? 0) + e.series * (i === 0 ? 1 : 0.5) * frequence;
      });
    }
  }
  for (const m of Object.keys(compte)) compte[m] = Math.round(compte[m] * 2) / 2;
  return compte;
}

/** Équilibre push/pull haut du corps sur les composés (santé d'épaule, veille/09 §1). */
export function ratioPushPull(seances) {
  let push = 0, pull = 0;
  for (const s of seances) {
    for (const e of s.exercices) {
      if (e.type !== "compose") continue;
      if (e.pattern.startsWith("push")) push += e.series;
      if (e.pattern.startsWith("pull")) pull += e.series;
    }
  }
  return { push, pull, ratio: +(push / pull).toFixed(2) };
}

/**
 * La semaine conseillée, EN DONNÉES — quand l'utilisateur ne court pas (pas de `placement`).
 *
 * Chaque entrée dit **quel jour** porte **quelle séance**, par son INDEX dans `seances`. Le
 * libellé en est DÉRIVÉ, jamais construit à côté : deux listes bâties en parallèle finissent
 * toujours par ne plus s'aligner — c'est exactement ce qui est arrivé (voir `semaine`, plus bas).
 *
 * ⚠️ Un libellé de jour est une ÉTIQUETTE : un jour, une séance. Ce n'est pas un endroit où
 * ranger une règle. « (jamais 2 jours consécutifs) » y était recopié sur CHAQUE ligne — le même
 * fait, dit trois fois, dans un contrôle. La règle vaut pour le SPLIT : elle vit dans
 * `note_split`, une fois, et l'app la rend derrière un tap.
 */
function semaineConseillee(split, seances, frequence) {
  const entree = (jour, seance) => ({
    jour,
    seance,
    libelle: `${jour} — ${seances[seance].nom}`,
    course: null,
    jambes_lourdes: false,
    course_qualitative: false,
  });

  if (split === "full-body") {
    const jours = ["Lundi", "Mercredi", "Vendredi"];
    return seances.map((_, i) => entree(jours[i] ?? `Jour ${i + 1}`, i));
  }
  if (split === "upper/lower") {
    const jours = ["Lundi", "Mardi", "Jeudi", "Vendredi"];
    return seances.map((_, i) => entree(jours[i], i));
  }
  const n = Math.round(seances.length * frequence);
  return Array.from({ length: n }, (_, i) => entree(`Jour ${i + 1}`, i % seances.length));
}

/**
 * Reprend les charges de travail RÉELLES (persona.muscu.charges_reference — saisies à la main
 * ou persistées par `recaler` depuis le journal) comme repère de départ par exercice : `gen`
 * ne repart pas « à vide » côté charge, mais du dernier réel encaissé (veille/02 §4).
 *
 * ⚠️ RÈGLE CENTRALE — aucune charge ne disparaît en silence.
 * L'association se fait sur le nom EXACT. Une clé qui ne tombe pas juste n'est pas devinée :
 * elle est REMONTÉE, avec sa raison, et une suggestion quand c'est manifestement une variante.
 * Deux cas bien distincts (ne pas les confondre : ils n'appellent pas la même action) :
 *   • `nom_inconnu`         — le nom n'existe dans AUCUN exercice du référentiel. La donnée est
 *                             inexploitable telle quelle → ALERTE, l'utilisateur doit corriger.
 *   • `absent_du_programme` — le nom est un exercice valide du référentiel, mais le programme
 *                             généré ne le contient pas (autre split, autre matériel). La donnée
 *                             est bonne : elle n'est simplement pas utilisée cette fois → INFO.
 *
 * On ne rattache JAMAIS sur une simple ressemblance : une mauvaise association ferait démarrer
 * l'utilisateur sur une charge FAUSSE (philosophy §3 — la sécurité prime). On propose, il décide.
 */
function appliquerChargesReference(seances, chargesReference, referentiel, ecartes = new Map()) {
  const appliquees = [];
  const nonAppliquees = [];
  if (!chargesReference) return { appliquees, non_appliquees: nonAppliquees };

  // nom d'exercice → toutes ses occurrences dans le programme (un même exercice peut revenir
  // dans plusieurs séances : on applique partout, mais on ne le compte qu'UNE fois).
  const parNom = new Map();
  for (const s of seances) {
    for (const e of s.exercices) {
      if (!parNom.has(e.nom)) parNom.set(e.nom, []);
      parNom.get(e.nom).push(e);
    }
  }
  const nomsConnus = referentiel?.noms ?? [];

  for (const [nom, ref] of Object.entries(chargesReference)) {
    if (!ref || ref.charge_kg == null) {
      nonAppliquees.push({
        nom,
        charge_kg: null,
        raison: "charge_absente",
        suggestions: [],
        message: `Charge de référence « ${nom} » ignorée : aucune valeur \`charge_kg\` exploitable.`,
      });
      continue;
    }

    const cibles = parNom.get(nom);
    if (cibles) {
      for (const e of cibles) {
        e.charge_depart_kg = ref.charge_kg;
        // Un exercice sous PLAFOND (limitation) ne démarre pas au-dessus de la dernière charge
        // tolérée : la charge de référence EST le plafond, et la progression passe par les reps.
        if (e.plafond_charge) e.charge_max_kg = ref.charge_kg;
      }
      appliquees.push({ nom, charge_kg: ref.charge_kg, date: ref.date ?? null });
      continue;
    }

    // L'exercice existait dans le programme, mais une LIMITATION l'a écarté (retrait ou
    // substitution). La donnée est bonne : la raison n'est ni un nom inconnu ni un split
    // inadapté — c'est une adaptation de sécurité, et il faut le dire comme tel.
    if (ecartes.has(nom)) {
      // 🔴 LE TROU PRODUIT (2026-07-12) — « il a DONNÉ son chiffre, l'app lui demande de l'inventer ».
      // Substitué (développé couché barre → Smith), l'exercice perdait TOUTE trace de la charge
      // déclarée : l'écran de la première séance affichait « Prévu — » et « Charge inconnue » sur
      // son mouvement principal, alors que le persona dit noir sur blanc « 80 kg × 8 ».
      //
      // ⚠️ On ne TRANSPOSE PAS : une charge guidée (Smith) n'égale pas une charge libre, et aucun
      // coefficient de conversion n'est sourçable dans la veille. Inventer ce chiffre serait
      // exactement la faute qu'on combat (« un faux chiffre migre ») — donc `charge_depart_kg`
      // reste `null` et l'état « inconnue » RESTE.
      //
      // Ce qu'on rattache, c'est un REPÈRE : le chiffre qu'il a déclaré, SUR SON MOUVEMENT
      // D'ORIGINE, nommé comme tel. C'est vrai, c'est utile, et c'est infiniment mieux que rien.
      // Le moteur ne prescrit pas ; il rend à l'utilisateur ce que l'utilisateur lui a donné.
      for (const s of seances) {
        for (const e of s.exercices) {
          if (e.substitue_depuis !== nom) continue;
          e.repere_charge = { nom, charge_kg: ref.charge_kg, reps: ref.reps ?? null };
        }
      }
      nonAppliquees.push({
        nom,
        charge_kg: ref.charge_kg,
        raison: "ecarte_par_limitation",
        suggestions: [],
        message:
          `Charge de référence « ${nom} » (${ref.charge_kg} kg) non appliquée : l'exercice a été ` +
          `${ecartes.get(nom)}. La donnée est conservée — elle resservira dès que la limitation le permettra.`,
      });
      continue;
    }

    if (nomsConnus.includes(nom)) {
      nonAppliquees.push({
        nom,
        charge_kg: ref.charge_kg,
        raison: "absent_du_programme",
        suggestions: [],
        message:
          `Charge de référence « ${nom} » (${ref.charge_kg} kg) NON utilisée dans ce programme : ` +
          `l'exercice est bien connu du moteur, mais ce split/matériel ne le programme pas. ` +
          `La donnée est conservée et resservira si l'exercice revient — rien n'est perdu.`,
      });
      continue;
    }

    const suggestions = suggererNoms(nom, nomsConnus);
    nonAppliquees.push({
      nom,
      charge_kg: ref.charge_kg,
      raison: "nom_inconnu",
      suggestions,
      message:
        `Charge de référence « ${nom} » (${ref.charge_kg} kg) NON APPLIQUÉE : ce nom ne correspond ` +
        `à aucun exercice du référentiel.` +
        (suggestions.length
          ? ` Vouliez-vous dire ${suggestions.map((s) => `« ${s} »`).join(" ou ")} ? ` +
            `Le moteur ne tranche PAS à votre place : une association approximative vous ferait ` +
            `démarrer sur une charge fausse. Corrigez le nom dans \`muscu.charges_reference\`.`
          : ` Aucune variante proche trouvée — vérifier l'orthographe dans \`muscu.charges_reference\`.`),
    });
  }
  return { appliquees, non_appliquees: nonAppliquees };
}

/**
 * Garde-fou INTERFÉRENCE LOMBAIRE. Soulevé de terre conventionnel, soulevé de terre roumain et
 * squat lourd sollicitent tous le même maillon : les érecteurs du rachis / le gainage lombaire
 * (veille/09 §1 — le pattern hinge repose dessus). Ce maillon est commun à plusieurs mouvements
 * et récupère plus lentement que les muscles qu'on croit cibler : la fatigue s'y ADDITIONNE en
 * silence, et le programme peut être « dans la cible » muscle par muscle tout en surchargeant le
 * bas du dos.
 *
 * Le moteur agit à deux niveaux :
 *  1. RÉPARTITION (structurelle) — les templates ne mettent jamais conventionnel et roumain dans
 *     la même séance ; ils sont placés sur des séances différentes de la semaine.
 *  2. AVERTISSEMENT (ce qui suit) — on expose les séances concernées et la règle d'espacement.
 *
 * ⚠️ On ne prétend PAS chiffrer un risque de blessure : la veille ne donne pas de seuil sourcé
 * (philosophy §2 — ne jamais survendre un chiffre). C'est un garde-fou de RÉCUPÉRATION, formulé
 * comme un signal à surveiller, et qui défère au deload en cas de fatigue (veille/02 §5).
 */
export function chargeLombaire(seances, frequence = 1) {
  const parSeance = seances
    .map((s) => {
      const exos = s.exercices.filter((e) => e.charge_lombaire);
      return {
        seance: s.nom,
        exercices: exos.map((e) => e.nom),
        series: exos.reduce((n, e) => n + e.series, 0),
      };
    })
    .filter((x) => x.exercices.length);

  const arrondi = (n) => Math.round(n * 10) / 10;
  const seancesParSemaine = arrondi(parSeance.length * frequence);
  const regles = parSeance.length
    ? [
        "Laisser **≥ 48 h** entre deux séances à charge lombaire lourde : les érecteurs du rachis sont le maillon commun au soulevé de terre, au roumain et au squat — ils récupèrent plus lentement que les jambes (veille/02 §5, veille/09 §1).",
        "Ne pas enchaîner une séance à charge lombaire lourde et une **course dure** dans les 24–48 h (veille/11 §2).",
        "Douleur lombaire **aiguë** (≠ courbature) : arrêter le mouvement, ne pas « pousser à travers » — technique avant charge (veille/02 §6).",
      ]
    : [];

  return {
    seances: parSeance,
    seances_par_semaine: seancesParSemaine,
    series_hebdo: arrondi(parSeance.reduce((n, x) => n + x.series, 0) * frequence),
    regles,
  };
}

function reglesHybride(persona) {
  const prioriteEndurance = persona.muscu.hybride.priorite === "endurance";
  const regles = [
    "Séparer salle et course de 6 h+ (ou les mettre sur des jours différents) — veille/11 §2.",
    "Ne pas courir dur dans les 24–48 h après une séance jambes lourdes (dommages musculaires → perf course dégradée) — veille/11 §2. **Le moteur applique désormais cette règle au placement de ta semaine** (bloc « Placement »), il ne se contente plus de l'écrire.",
  ];
  regles.push(
    prioriteEndurance
      ? "Endurance prioritaire : si conflit, c'est la salle qu'on allège ; à l'approche d'une course, réduire les jambes lourdes en gardant l'entretien — veille/11 §3."
      : "Muscu prioritaire pour cet objectif : si conflit, c'est la course qu'on déplace — veille/11 §3."
  );
  return regles;
}

const LIBELLES_NIVEAU = { debutant: "débutant", intermediaire: "intermédiaire", avance: "avancé" };

/**
 * @param persona     persona normalisé (personne.js)
 * @param referentiel référentiel d'exercices INJECTÉ (exercices.js `chargerReferentiel`) —
 *                    le module reste pur, aucune lecture de fichier ici.
 */
export function genererProgrammeMuscu(persona, referentiel) {
  const m = persona.muscu;
  if (!referentiel?.catalogue) {
    throw new Error("genererProgrammeMuscu : référentiel d'exercices manquant (chargerReferentiel(data/exercises.json)).");
  }
  const catalogue = referentiel.catalogue(m.materiel, m.niveau);
  const split = choisirSplit(m.jours_par_semaine);
  const cible = CIBLES_VOLUME[m.niveau] ?? CIBLES_VOLUME.intermediaire;

  let seances, frequence, note_split;
  if (split === "full-body") {
    seances = seancesFullBody(m.jours_par_semaine, catalogue);
    frequence = 1;
    note_split = `${m.jours_par_semaine} jours → full-body : chaque muscle travaillé à chaque séance (fréquence ${m.jours_par_semaine}×/sem). **Jamais 2 jours consécutifs** — chaque muscle est sollicité à chaque séance, il lui faut une journée pour récupérer. Le volume/muscle est mécaniquement plus bas qu'avec plus de jours — normal, la progressivité prime${m.niveau === "debutant" ? " (et largement suffisant pour progresser à ce niveau)" : " ; ajouter un jour pour plus de volume"}.`;
  } else if (split === "upper/lower") {
    seances = seancesUpperLower(catalogue);
    frequence = 1;
    note_split = "4 jours → upper/lower : fréquence 2×/muscle/sem — la fréquence sert surtout à répartir le volume pour tenir la qualité des séries, pas de magie au-delà (veille/02 §2).";
  } else {
    const ppl = seancesPPL(m.jours_par_semaine, catalogue);
    seances = ppl.cycle;
    frequence = ppl.repetitions;
    note_split = `${m.jours_par_semaine} jours → push/pull/legs ${m.jours_par_semaine === 6 ? "×2 (fréquence 2×/muscle/sem)" : "en cycle continu (fréquence ~1,7×/muscle/sem)"} : gros volume réparti sur des séances courtes et spécialisées.`;
  }
  seances.forEach(nettoyerSeance);
  adapterPrescriptions(seances, m);

  // LIMITATIONS — le troisième état du moteur : ni prescrire en aveugle, ni tout refuser, mais
  // ADAPTER (retraits ciblés, substitutions au sein du même pattern, RIR relevé, plafonds de
  // charge, échauffement imposé). Passe AVANT les priorités (une priorité ne charge pas une zone
  // douloureuse) et AVANT les charges de référence (les noms d'exercices sont alors définitifs).
  const limitations = appliquerLimitations(seances, persona, referentiel);
  seances.forEach(nettoyerSeance); // un retrait peut laisser un superset orphelin

  const priorites = appliquerPriorites(seances, m.priorites, limitations);
  const charges = appliquerChargesReference(seances, m.charges_reference, referentiel, limitations.ecartes);

  // ÉCHAUFFEMENT — encodé depuis veille/18. Il est construit APRÈS les charges de référence, et
  // ce n'est pas un détail : les **séries d'approche** se calculent sur les **charges RÉELLES**
  // de l'utilisateur (~40 % / ~80 %, Ribeiro 2020), pas sur des pourcentages abstraits. Il est
  // FONCTION DU PATTERN de la séance (jour Push ⇒ bloc épaule ; jour Legs ⇒ hanche/cheville) et
  // devient **NON SKIPPABLE** quand la séance traverse une zone ACTIVE.
  const equipements = PROFILS_MATERIEL[m.materiel] ?? [];
  for (const s of seances) {
    s.echauffement = echauffementSeance(s, { materiel: m.materiel, equipements, limitationsActives: limitations.actives });
  }

  const volume = volumeParMuscle(seances, frequence);
  const pushPull = ratioPushPull(seances);
  const lombaire = chargeLombaire(seances, frequence);

  // PLACEMENT — la contrainte la mieux étayée de l'hybride (ADR 0006, Couche 2) : pas de jambes
  // lourdes moins de 24–48 h avant une séance de course qualitative. Elle ne demande AUCUNE
  // calibration, et aucune app concurrente ne la traite. Elle ne s'applique qu'aux profils qui
  // courent : sinon il n'y a rien à protéger.
  //
  // ⚠️ Une limitation ACTIVE du BAS DU CORPS **durcit** cette contrainte : l'écart de 48 h cesse
  // d'être « acceptable ». La fenêtre, elle, ne bouge pas — le moteur n'invente pas un « 72 h »
  // pour faire prudent (la décision, et sa justification, sont dans placement.js).
  const placement =
    m.hybride.course_par_semaine > 0
      ? composerSemaineMuscuHybride(
          { seances, frequence, joursParSemaine: m.jours_par_semaine },
          {
            courses: m.hybride.course_par_semaine,
            courseQualitative: m.hybride.course_type !== "facile",
            zone_jambes_active: limitations.zone_jambes_active,
          }
        )
      : null;

  // 🔴 LA SEMAINE, EN DONNÉES — la SEULE liste de jours. `jours` (les libellés) en sort par un
  //    `.map()`, plus bas. Une seule source, donc aucun moyen que les deux se désalignent.
  const semaine = placement
    ? placement.jours.map((j) => ({
        jour: j.jour,
        // L'INDEX de la séance dans `seances` — le lien qui manquait. `j.muscu` est la MÊME
        // référence d'objet que `seances[k]` (placement.js pioche dedans), donc `indexOf` est
        // exact. Un jour de course ou de repos ne porte pas de séance : `null`, et c'est un état
        // que l'app doit savoir rendre — pas un trou dans lequel elle tombe.
        seance: j.muscu ? seances.indexOf(j.muscu) : null,
        course: j.course?.nom ?? null,
        jambes_lourdes: Boolean(j.jambes_lourdes),
        course_qualitative: Boolean(j.course_qualitative),
        libelle: `**${j.jour}** — ${j.muscu ? j.muscu.nom : j.course ? j.course.nom : "Repos"}`,
      }))
    : semaineConseillee(split, seances, frequence);

  // COURSE — le trou historique. `limitations` n'adaptait QUE la salle : un coureur qui déclarait
  // un genou douloureux voyait ses séances de muscu changer et ses SORTIES rester intactes. Un
  // pratiquant de salle qui court (le cas type : PPL 6 j + 1 course/sem) est exactement ce cas.
  // Les limitations sont TRANSVERSALES : elles sont maintenant appliquées ici aussi.
  const limitationsCourse = appliquerLimitationsCourse(persona);

  const alertes = [];
  for (const [muscle, series] of Object.entries(volume)) {
    if (MUSCLES_ACCESSOIRES.includes(muscle)) continue;
    if (series > cible.max + 2) alertes.push(`Volume ${muscle} (${series} séries/sem) au-dessus de la cible ${cible.min}–${cible.max} + marge : rendements décroissants (veille/02 §1).`);
  }
  // Push/pull : le déséquilibre que veille/09 §1 met en garde, c'est l'EXCÈS DE POUSSÉE (santé
  // d'épaule). Quand c'est une limitation qui a retiré de la poussée, le ratio penche vers le
  // TIRAGE — et corriger ce « déséquilibre » en rajoutant de la poussée serait exactement le
  // mauvais geste. Le moteur ne peut pas se contenter de comparer un nombre à 1.
  const poussee_menagee = limitations.patterns_sous_contrainte.some((p) => p.startsWith("push"));
  if (pushPull.ratio > 1.25) {
    alertes.push(`Déséquilibre push/pull (${pushPull.push} vs ${pushPull.pull} séries composées) : trop de poussée — viser un ratio proche de 1:1 (santé d'épaule, veille/09 §1).`);
  } else if (pushPull.ratio < 0.8 && !poussee_menagee) {
    alertes.push(`Déséquilibre push/pull (${pushPull.push} vs ${pushPull.pull} séries composées) : viser un ratio proche de 1:1 (santé d'épaule, veille/09 §1).`);
  } else if (pushPull.ratio < 0.8) {
    alertes.push(
      `Ratio push/pull ${pushPull.ratio} (${pushPull.push} poussée vs ${pushPull.pull} tirage) : **c'est la conséquence VOULUE** de l'adaptation ` +
        `ci-dessus, pas un défaut. Le déséquilibre contre lequel veille/09 §1 met en garde (santé d'épaule) est l'excès de **poussée**, pas ` +
        `l'excès de **tirage**. **Ne cherche pas à « rééquilibrer » en rajoutant de la poussée** — ce serait exactement le mauvais geste ici.`
    );
  }

  // Charges de référence NON appliquées : elles ne disparaissent JAMAIS en silence.
  // Un nom inconnu est une alerte (donnée inexploitable, l'utilisateur doit corriger) ; un
  // exercice connu mais absent du programme est une info (la donnée est bonne, juste pas
  // utilisée ici) — deux problèmes différents, deux traitements différents.
  // `ecarte_par_limitation` est également une INFO : la donnée est bonne, c'est le moteur qui a
  // écarté l'exercice pour protéger l'utilisateur — il l'explique dans le bloc « Adaptations ».
  for (const c of charges.non_appliquees) {
    if (!["absent_du_programme", "ecarte_par_limitation"].includes(c.raison)) alertes.push(c.message);
  }

  // Interférence lombaire : signalée dès que le maillon lombaire est sollicité sur ≥ 3 séances
  // par semaine (le programme peut être « dans la cible » muscle par muscle et surcharger quand
  // même le bas du dos, qui n'apparaît dans aucune fourchette — il est classé accessoire).
  if (lombaire.seances_par_semaine >= 3) {
    alertes.push(
      `Charge lombaire cumulée : ${lombaire.seances_par_semaine} séances/sem sollicitent lourdement ` +
        `le bas du dos (${lombaire.seances.map((s) => s.seance).join(", ")}) — soulevé de terre, roumain et ` +
        `squat lourd s'additionnent sur le même maillon. Espacer de ≥ 48 h ; si la perf baisse ou que le ` +
        `bas du dos reste raide, c'est un signal de fatigue → deload (veille/02 §5).`
    );
  }

  // Trous du référentiel pour CE matériel : on ne comble pas avec un exercice hors matériel
  // ou au-dessus du niveau (le handstand push-up « expert » pour un débutant, typiquement) —
  // on le dit, et on chiffre ce qui le débloque.
  for (const trou of catalogue.manquants) {
    alertes.push(`Matériel « ${m.materiel} » : ${trou.pourquoi}`);
  }
  if (catalogue.recommandation_materiel) alertes.push(catalogue.recommandation_materiel);

  // LIMITATIONS : ce que le moteur a changé, et ce qu'il n'a PAS su traiter (zone inconnue →
  // alerte, jamais un silence). Les renvois vers un professionnel et l'hypothèse clinique sont
  // rendus dans leur propre bloc, pas noyés dans les alertes.
  for (const a of limitations.alertes) alertes.push(a);
  // Idem côté COURSE : une zone sans règle de course crie « je n'ai RIEN adapté pour tes sorties ».
  for (const a of limitationsCourse.alertes) alertes.push(a);

  // ⚠️ Le champ `muscu.limitations` est DÉPRÉCIÉ : son nom même cachait le trou (« le moteur
  // n'adapte que la muscu »). La migration est faite, mais elle est DITE — sinon la prochaine
  // édition du persona réécrira l'ancien champ, et l'angle mort reviendra par la porte.
  if (persona.limitations_migration) alertes.push(persona.limitations_migration.message);

  const sousCible = Object.entries(volume)
    .filter(([muscle, series]) => !MUSCLES_ACCESSOIRES.includes(muscle) && series < cible.min)
    .map(([muscle]) => muscle);
  // Un muscle sous la cible PARCE QU'on vient de le ménager n'est pas un défaut à corriger :
  // le dire « ajoute un jour » ici serait exactement le mauvais conseil.
  const sousCibleVoulu = sousCible.filter((mus) => limitations.muscles_sous_contrainte.includes(mus));
  const sousCibleSubi = sousCible.filter((mus) => !limitations.muscles_sous_contrainte.includes(mus));
  for (const p of priorites.appliquees) {
    if (sousCibleSubi.includes(p.muscle)) {
      alertes.push(`« ${p.muscle} » est prioritaire mais reste sous la cible malgré +${p.series_ajoutees} série(s) : envisager un jour de plus ou un exercice dédié supplémentaire (veille/02 §1).`);
    }
  }
  for (const r of priorites.refusees) {
    alertes.push(
      `Priorité « ${r.muscle} » **NON appliquée** : ses ${r.exercices_bloques} exercice(s) principaux sont sous contrainte d'une limitation ` +
        `(ACTIVE ou ANTÉCÉDENT). Le volume est bien le levier n°1 (veille/02 §1), mais on n'ajoute pas de séries sur une chaîne ` +
        `qui fait mal — la progression viendra des reps et de la technique. Cette priorité redeviendra applicable dès que la ` +
        `limitation sera levée (statut RESOLU) ou que la zone aura été examinée.`
    );
  }

  // Placement : un conflit RÉSIDUEL (que même la réorganisation ne supprime pas) doit être DIT,
  // pas absorbé en silence. Le moteur avertit plutôt que de bricoler un compromis muet.
  if (placement?.analyse.conflits.length) {
    alertes.push(
      `Placement jambes/course : **${placement.analyse.conflits.length} conflit(s) impossibles à supprimer** avec ` +
        `${m.jours_par_semaine} jours de salle + ${m.hybride.course_par_semaine} course(s) sur 7 jours — il n'y a ` +
        `mécaniquement pas assez de place. Le moteur ne bricole pas : il te le dit. Options : retirer un jour de salle, ` +
        `ou faire de cette course un **footing facile** (\`muscu.hybride.course_type: "facile"\`), ` +
        `ce qui lève la contrainte (elle ne vise que les séances de QUALITÉ — veille/11 §3).`
    );
  }

  return {
    persona: persona.nom,
    // 🔴 L'API DE DONNÉES (`avis.js`). **Le moteur rendait un DOCUMENT ; il rend désormais des
    // DONNÉES.** Chaque adaptation porte son **exercice**, sa **séance**, sa **zone** et son
    // **levier** — l'app peut donc afficher « **Développé militaire — RETIRÉ** » **sous l'exercice**,
    // et garder le paragraphe sourcé **derrière un tap**. C'est ça, la différence entre un coach et
    // un article de blog : **la même rigueur, servie au bon moment.**
    mode: persona.mode ?? null,
    avis: [
      ...adaptationsMuscuEnAvis(limitations),
      ...adaptationsCourseEnAvis(limitationsCourse),
      ...alertes
        .map((a) => avisDepuisTexte(a, { type: "alerte", gravite: a.includes("🔴") ? "critique" : "avertissement" }))
        .filter(Boolean),
    ],
    objectif: m.objectif,
    niveau: LIBELLES_NIVEAU[m.niveau] ?? m.niveau,
    materiel: m.materiel,
    referentiel: { source: "free-exercise-db (domaine public, veille/05)", exercices: referentiel.taille },
    slots_manquants: catalogue.manquants,
    split,
    note_split,
    frequence,
    // Quand l'utilisateur court, la « semaine type » n'est plus une liste abstraite de « Jour N » :
    // c'est un vrai calendrier, ordonné pour respecter la contrainte de placement.
    //
    // 🔴 `jours` EST DÉRIVÉ DE `semaine`. Il n'est plus construit à côté.
    //
    // `semaine` est un CALENDRIER (7 entrées quand on court) ; `seances` est un CYCLE (3 entrées
    // en PPL). Les deux n'ont **jamais** eu le même index — mais comme le libellé de jour RECOPIAIT
    // le nom de la séance, personne ne s'en est aperçu, et l'app indexait `seances[i]` avec
    // l'indice du JOUR. À l'écran : taper « Jeudi » (ou vendredi, samedi, dimanche) levait un
    // `TypeError: Cannot read properties of undefined` et **vidait le panneau**. Quatre onglets sur
    // sept étaient morts, sous 482 tests verts. **Un nom recopié n'est pas un lien.**
    //
    // Le libellé, lui, ne porte plus de décor. Il portait « 🦵 _(jambes lourdes)_ », et l'app en
    // faisait le libellé d'un onglet : « Mercredi » devenait trois fois plus large que les autres
    // et poussait la fin de la semaine hors de l'écran. **Un contrôle n'est pas une affiche.**
    // Le fait reste, en donnée (`semaine[i].jambes_lourdes`) : le CLI le remet en Markdown,
    // l'app le range derrière un tap. Rien ne se perd — tout change de conteneur.
    jours: semaine.map((j) => j.libelle),
    semaine,
    placement,
    seances,
    volume_par_muscle: volume,
    cible_volume: cible,
    priorites_appliquees: priorites.appliquees,
    priorites_refusees: priorites.refusees,
    // Ce que les limitations ont changé, pourquoi, ce qu'il faut surveiller, et ce que le moteur
    // n'a PAS su traiter. Rendu dans un bloc dédié : l'utilisateur doit pouvoir demander
    // « pourquoi ? » et obtenir la vraie raison (philosophy §4).
    limitations,
    // Ce que les limitations changent à la COURSE. Rendu dans son propre bloc : un coureur doit
    // pouvoir lire ce que son genou change à ses SORTIES, pas seulement à ses squats.
    limitations_course: limitationsCourse.court ? limitationsCourse : null,
    limitations_migration: persona.limitations_migration ?? null,
    // Échauffement : la DOCTRINE (une fois, en tête) — le protocole chiffré, lui, vit dans chaque
    // séance (`seance.echauffement`), parce que c'est là que sont les charges réelles.
    echauffement: limitations.echauffement,
    renvoi_medical: limitations.renvoi_medical,
    charges_reprises: charges.appliquees,
    // Remontée par l'API : toute charge fournie et non appliquée, avec sa raison et (le cas
    // échéant) les noms suggérés. Le contrat : Object.keys(charges_reference).length ===
    // charges_reprises.length + charges_non_appliquees.length — rien ne se perd en route.
    charges_non_appliquees: charges.non_appliquees,
    charge_lombaire: lombaire,
    push_pull: pushPull,
    progression: {
      regle:
        "Double progression : monter les reps dans la fourchette à RIR cible ; quand le haut de fourchette est atteint sur toutes les séries, +2,5 kg (haut du corps) / +5 kg (bas du corps) et repartir du bas de fourchette." +
        (limitations.progression_prudente.length
          ? " ⚠️ **Exception** : sur les exercices marqués 🐢 (progression prudente, limitation), monter par le **plus petit palier disponible** et **toujours les reps avant la charge** — une zone sensible se réveille sur une hausse brutale, pas sur la régularité."
          : "") +
        (limitations.plafonds.length
          ? " 🔒 Les exercices **plafonnés** ne dépassent PAS la charge indiquée tant que la limitation n'est pas levée : la progression s'y fait **uniquement par les reps**."
          : ""),
      volume: m.niveau === "debutant"
        ? "Pas de progression de volume les premières semaines : la marge de progrès est dans la technique et la charge (veille/02 §6)."
        : `Semaines 1–2 au volume plancher ci-dessous ; à partir de la semaine 3, +1 série/sem sur 1–2 muscles en retard **si** la récupération suit (perf stable, pas de RPE anormal) — progression du volume dans la fourchette ${cible.min}→${cible.max} (veille/02 §1).`,
      source: "veille/02 §1 & §4",
    },
    // 🔴 LE DELOAD NE SE PRESCRIT PLUS AU CALENDRIER — et il n'aurait jamais dû.
    //
    // Cette règle disait « **Semaine 6 (fourchette 4–8)** », **en citant `veille/02 §5 & §7`**
    // — c'est-à-dire les deux sections qui la **RÉFUTENT**, et depuis le 2026-07-11 :
    //
    //   §7 : « Deload : déclenché par des **MARQUEURS** de fatigue — **pas par le calendrier** :
    //          le deload calendaire n'est **pas démontré** (§5). »
    //   §5 : « le deload CALENDAIRE n'est pas démontré. […] privilégier le délestage **RÉACTIF**. »
    //
    // Le « 4–8 » lui-même n'était pas un résultat : c'était **5,6 ± 2,3 semaines**, soit la
    // moyenne ± un écart-type d'un **SONDAGE DE PRATIQUES** (Rogerson 2024, 246 athlètes — dont
    // les auteurs constatent eux-mêmes « un manque évident de recherche empirique »). Et le seul
    // essai contrôlé (Coleman 2024, PeerJ) **ne trouve aucun bénéfice** : hypertrophie identique,
    // force **en faveur du groupe continu**, aucune « re-sensibilisation ».
    //
    // ⚠️ **La veille s'était corrigée. Le produit ne l'avait pas suivie.** Une citation ne périme
    // pas bruyamment — **elle cesse d'être vraie en silence**. (philosophy.md, règle 1.)
    // Le garde-fou est dans `tests/deload.test.js` : il relit la source ET le moteur.
    deload: {
      regle:
        "Deload déclenché par des SIGNAUX de fatigue, jamais par le calendrier : performance en baisse à charge égale, RPE anormalement haut, douleurs, sommeil dégradé. " +
        "Contenu : volume −50 %, RIR 3–4, charges −10 % — on RÉDUIT le volume, on n'arrête pas. " +
        "Un deload périodique fixe n'est pas démontré : le seul essai contrôlé ne lui trouve aucun bénéfice.",
      source: "veille/02 §5 & §7",
    },
    hybride: persona.running || persona.muscu.hybride.course_par_semaine ? { regles: reglesHybride(persona) } : null,
    hypotheses_programme: [
      ...(sousCibleSubi.length
        ? [`Muscles sous la cible ${cible.min}–${cible.max} en pondéré : ${sousCibleSubi.join(", ")} — volume indirect élevé via les composés ; à remonter en priorité via la progression de volume si prioritaires pour l'utilisateur.`]
        : []),
      // Un muscle sous la cible parce qu'une limitation lui a retiré du volume : c'est VOULU.
      // Le signaler comme un manque à combler serait le pire conseil possible.
      ...(sousCibleVoulu.length
        ? [
            `${sousCibleVoulu.join(", ")} sous la cible ${cible.min}–${cible.max} : **c'est voulu**, pas un oubli — ` +
              `du volume a été retiré par une limitation (voir « Adaptations liées à tes limitations »). ` +
              `**Ne pas chercher à le remonter** tant que la zone n'est pas réglée : le volume est le levier n°1 ` +
              `(veille/02 §1), mais pas sur une chaîne douloureuse.`,
          ]
        : []),
      // Le soulevé de terre conventionnel EST disponible avec ce matériel, mais le split
      // full-body ne le programme pas (cf. `seancesFullBody`). Ne pas l'omettre en silence :
      // un utilisateur « force » à 3 j/sem doit savoir POURQUOI son mouvement le plus lourd
      // n'est pas là, et ce qui le débloquerait.
      ...(split === "full-body" && catalogue.slots.hinge_lourd
        ? [
            `Soulevé de terre conventionnel NON programmé à ${m.jours_par_semaine} j/sem : le full-body n'a ` +
              `pas le volume pour l'absorber sans faire passer les ischios sous le plancher (il est ` +
              `érecteurs-dominant, là où le roumain est ischio-dominant), et sa charge axiale ne peut pas ` +
              `être espacée quand chaque séance est complète. Il apparaît à partir de **4 j/sem** ` +
              `(upper/lower). Le roumain le remplace ici — même pattern, pas la même fonction.`,
          ]
        : []),
    ],
    alertes,
  };
}
