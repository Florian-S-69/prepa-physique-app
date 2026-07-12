// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LE MODE D'USAGE — musculation seule · course seule · hybride
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 **Le trou que ce module ferme.** Le moteur savait déjà générer trois choses (muscu, course,
// nutrition), mais il ne **nommait** jamais ce qu'il était en train de faire. Résultat : personne
// — ni l'utilisateur, ni les tests, ni le moteur lui-même — ne pouvait dire « ce persona est un
// pratiquant de salle qui ne court pas », ou « c'est un coureur pur ». Le mode existait **de fait**
// (par la présence ou l'absence d'un bloc), **jamais en toutes lettres**.
//
// Et ce silence coûtait cher : la seule chose qui distingue un **hybride** d'un pratiquant de salle,
// c'est précisément **la contrainte de placement jambes ↔ course** (veille/11 §2–§3). Un moteur qui
// ne sait pas dire dans quel mode il est ne sait pas non plus dire **pourquoi** cette contrainte
// s'applique — ni pourquoi elle ne s'applique pas.
//
// ── La règle, et elle tient en une ligne ────────────────────────────────────────────────────────
// **Le mode est LU des blocs déclarés, jamais deviné.** `muscu` présent → il soulève. `running`
// présent → il court. Les deux → hybride. **Aucune inférence**, aucune heuristique : un bloc absent
// veut dire « il ne le fait pas », pas « je ne sais pas ».
//
// ⚠️ **Un mode ne doit RIEN changer aux autres.** C'est une **déclaration**, pas une règle de
// programmation : ce module n'ajoute aucun volume, aucun coefficient, aucun seuil. Il **nomme**.
//
// Module PUR : zéro dépendance.

/**
 * Le troisième cas, et il est réel : un persona **sans bloc `running`** qui déclare quand même
 * courir, via `muscu.hybride.course_par_semaine`. Le moteur **adapte** alors ses limitations à la
 * course (limitations.js), mais il **ne planifie pas** ses sorties — et c'est exactement le genre
 * de demi-état qu'il faut **dire**, pas laisser deviner.
 */
function courseDeclareeHorsBloc(persona) {
  return Number(persona?.muscu?.hybride?.course_par_semaine ?? 0) > 0;
}

/** Le mode d'usage du persona. Retourne toujours un objet — jamais `null`, jamais une devinette. */
export function modeDe(persona) {
  const aMuscu = Boolean(persona?.muscu);
  const aCourse = Boolean(persona?.running);
  const code = aMuscu && aCourse ? "hybride" : aMuscu ? "muscu" : aCourse ? "course" : "aucun";
  const horsBloc = code === "muscu" && courseDeclareeHorsBloc(persona);

  const base = {
    code,
    muscu: aMuscu,
    course: aCourse,
    // Le persona court-il, d'une manière ou d'une autre ? (bloc `running`, OU course déclarée
    // côté hybride). C'est ce booléen que lisent les limitations de course.
    court: aCourse || horsBloc,
    course_hors_bloc: horsBloc,
  };

  if (code === "hybride") {
    return {
      ...base,
      libelle: "Hybride — musculation **et** course",
      genere: ["programme de musculation", "plan de course", "nutrition"],
      // 🎯 CE QUE LE MODE HYBRIDE AJOUTE, ET LUI SEUL.
      specifique:
        "**C'est le seul mode où la contrainte de placement jambes ↔ course existe.** Une séance de jambes " +
        "menée près de l'échec dégrade la capacité à produire de la force **rapidement** pendant **24–48 h** — " +
        "et c'est exactement ce dont une séance de qualité ou une longue sortie a besoin (veille/11 §2–§3). " +
        "Le moteur **calcule** le jour du renfo jambes pour l'éviter ; il ne le décrète pas.",
      pas_genere: [],
    };
  }
  if (code === "muscu") {
    return {
      ...base,
      libelle: horsBloc ? "Musculation — avec de la course NON planifiée" : "Musculation seule",
      genere: ["programme de musculation", "nutrition"],
      specifique: horsBloc
        ? "⚠️ **Tu déclares courir (`muscu.hybride.course_par_semaine`) mais tu n'as pas de bloc `running`.** " +
          "Le moteur **adapte tes limitations à la course** (il sait que tu cours), mais il **ne PLANIFIE pas tes " +
          "sorties** : ni volume, ni allure, ni progression. **Ce n'est pas un demi-plan, c'est zéro plan.** " +
          "Ajoute un bloc `running` — **il n'a besoin d'aucune course datée** (voir le plan de base)."
        : "Aucune course déclarée : la contrainte de placement jambes ↔ course **ne s'applique pas** — et ce " +
          "n'est pas un oubli, c'est un constat. Rien à protéger, rien à décaler.",
      pas_genere: horsBloc ? ["plan de course (bloc `running` absent)"] : ["plan de course"],
    };
  }
  if (code === "course") {
    return {
      ...base,
      libelle: "Course seule",
      genere: ["plan de course", "nutrition"],
      specifique:
        "Aucun bloc `muscu` : le moteur **ne génère aucun programme de salle**. ⚠️ Si tu déclares des séances de " +
        "salle via `running.hybride.salle_par_semaine`, le moteur les **place** dans ton plan (et les tient à " +
        "distance de tes séances-clés) **sans en prescrire le contenu** — il ne sait pas ce que tu y fais.",
      pas_genere: ["programme de musculation"],
    };
  }
  return {
    ...base,
    libelle: "Aucune discipline déclarée",
    genere: ["nutrition"],
    specifique:
      "**Ni bloc `muscu`, ni bloc `running`.** Le moteur ne peut produire qu'une **cible nutritionnelle**, et " +
      "elle repose sur un facteur d'activité **sans aucune séance** pour l'étayer. Déclare au moins une discipline.",
    pas_genere: ["programme de musculation", "plan de course"],
  };
}
