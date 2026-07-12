// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LES RECORDS — un record ne se SAISIT pas. Il se DÉRIVE.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Le mot `record` n'existait **nulle part** dans ce code. Pas un fichier, pas une fonction. Et
// pourtant le carnet le contient déjà : depuis que chaque séance terminée entre au journal, la
// question « quelle est la plus lourde charge que j'aie soulevée au développé couché ? » a une
// réponse — **il suffisait de la lire.**
//
// D'où la règle qui gouverne ce module, et qui est sa raison d'être :
//
//   🔴 **AUCUNE SAISIE. AUCUNE INVENTION. Le journal, et rien d'autre.**
//
// Ce module ne lit **jamais** le persona. C'est structurel, pas une politesse — voir le piège
// ci-dessous.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 LE PIÈGE : `records_historiques` EST EN QUARANTAINE. NE L'EN SORS PAS.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Le persona de développement (`data/personas/`, non publié) porte un bloc `records_historiques` —
// d'anciens PR de barre libre — surmonté de cet avertissement, écrit à la main :
//
//   > « ⚠️ NE PAS UTILISER COMME CHARGES DE DÉPART. Anciens PR, non reproductibles aujourd'hui
//   >   (déconditionnement force + longue période sans lourd en barre libre). »
//
// Ce sont de **vrais** records — **d'un autre athlète**, celui d'il y a des années. Les réhabiliter
// « parce que ce sont techniquement des records » remettrait une charge maximale historique en face
// d'un dos qui n'a pas retesté le soulevé de terre depuis sa reprise. Le persona le dit lui-même :
// ses charges actuelles sont **INCONNUES** (`charges_actuelles_a_tester`).
//
// **La parade n'est pas une consigne, c'est une SIGNATURE** : `recordsMuscu(journal)` ne prend
// **que** le journal. Le persona n'est pas dans sa portée. Un record que le carnet n'a pas vu
// n'existe pas pour ce module — et il ne peut pas y entrer par accident.
//
// (Ce qu'ils sont vraiment : de l'**histoire**, pas une **mesure d'aujourd'hui**. Un jour où l'autre
// un écran voudra les montrer comme un passé — ce sera un autre champ, avec sa date, et il ne
// passera pas par ici.)
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// CE QU'EST UN RECORD, ICI — ET POURQUOI CE N'EST PAS UN 1RM ESTIMÉ
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// **Un record est une MESURE.** Une charge qui a été soulevée, un nombre de reps qui a été fait,
// un jour qui a une date. On peut le pointer dans le carnet.
//
// 🔴 **Ce que ce module N'affiche PAS comme record : un 1RM estimé.** Et c'est un refus réfléchi.
//
//   1. **Une estimation de 1RM est un MODÈLE, pas une mesure.** Epley (`w × (1 + r/30)`) et Brzycki
//      (`w × 36/(37 − r)`) sont deux formules **différentes** qui donnent deux nombres différents
//      pour la même série. Aucune n'a été mesurée sur cet utilisateur.
//
//   2. **Et la parade « évidente » est un piège que `philosophy.md` nomme déjà.** L'idée séduisante
//      — calculer les deux et afficher leur écart comme une fourchette (« ~94 à 100 kg ») — est
//      exactement la **FAUSSE MODESTIE** de la règle 2 : *« un chiffre qui a l'air prudent et qui
//      ment cinq fois plus »*. Epley et Brzycki **s'accordent entre elles** bien mieux qu'elles ne
//      s'accordent avec la réalité : leur écart mutuel (~3 % à 10 reps) ne **borne** en rien
//      l'erreur vraie. Une fourchette bâtie dessus aurait l'air rigoureuse **et mentirait**.
//
//   3. **Et surtout : il n'en a pas besoin.** Ce qu'il veut, c'est *« pousser tel poids »* — une
//      **CHARGE**, pas un modèle. Le dénominateur de cet objectif est **la plus lourde charge qu'il
//      ait réellement soulevée.** Ça, le carnet le sait.
//
// ⚠️ **Le moteur, lui, continue d'utiliser Epley en interne** (`adaptation.js tendancesMuscu`) pour
// détecter une **tendance** : là, le modèle est comparé **à lui-même** d'une période à l'autre, donc
// son biais s'annule. C'est un usage **relatif**, légitime. L'afficher comme un **record absolu**
// serait un usage **absolu** — et l'inviterait à courir après un chiffre que personne n'a soulevé.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// L'ORDRE : LA DOUBLE PROGRESSION EST DÉJÀ LA RÈGLE DU MOTEUR
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Comment comparer `80 kg × 5` et `75 kg × 10` ? Il faut un ordre, et **on ne l'invente pas** : le
// moteur en a déjà un, et c'est celui qu'il PRESCRIT. `veille/02 §4` (surcharge progressive) :
// **double progression** — on monte les **reps** dans la fourchette, *puis* la **charge**.
//
//   → **La charge d'abord. À charge égale, les reps.**
//
// Le record est donc « la meilleure série » **au sens exact de la progression que le moteur
// demande**. Battre son record, c'est littéralement faire ce que le programme prescrit. Un ordre
// inventé (un score `charge × reps`, un « point IPF ») aurait récompensé autre chose que le
// programme — et l'aurait envoyé courir dans une direction que le moteur ne prescrit pas.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 LE `0 kg` — LE BUG QUE `juge-app` A DÉJÀ ATTRAPÉ UNE FOIS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Dans le journal, `charge_kg` est **le LEST**, pas la charge soulevée (`app/js/seance.js
// chargeSoulevee`). Une traction au poids du corps **sans lest** s'écrit donc `charge_kg: 0`.
//
// Un « record = la charge la plus lourde » naïf afficherait, pour les tractions : **« 0 kg ».**
// C'est exactement le `0 kg` que le skill `juge-app` a recalé sur l'écran de séance — que
// **367 tests n'avaient pas vu**.
//
// → Le record porte donc `au_poids_du_corps` (vrai quand sa charge est nulle). **Le record d'une
//   traction au poids du corps est en REPS**, et l'écran n'a aucun moyen d'écrire « 0 kg » : le
//   drapeau le lui interdit, et un test le vérifie.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🕳️ CE QUE CE MODULE NE FAIT PAS (et l'aveu fait partie du garde-fou)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// **Aucun record de TONNAGE.** La tentation était là — et c'aurait été un **faux chiffre**. Le
// tonnage honnête compte **le poids du corps** (tractions, dips) : c'est le correctif du commit
// `a06aa1e`, *« le carnet écrivait moins de travail quand il en faisait plus »*. Or cette part du
// corps vit dans `app/js/seance.js` (`PART_DU_CORPS`), avec le **poids GELÉ à la date de la
// séance** — le journal du moteur, lui, ne porte **que le lest**. Un tonnage calculé ici
// **sous-compterait** exactement les exercices que ce commit a réparés. Plutôt que de recréer une
// demi-vérité dans un second endroit, **on ne le calcule pas**, et on écrit pourquoi.

/**
 * Le nombre de séances en deçà duquel une différence de charge n'est **pas** une progression, mais
 * du **bruit** (un bon jour, un mauvais jour, un échauffement qui a mieux pris).
 *
 * @chiffre-derive Ce `3` n'est **pas** dans `veille/02 §4` — la veille fonde la **règle** (double
 * progression), pas la **sensibilité du détecteur**. C'est un seuil d'ingénierie, aligné sur celui
 * que `adaptation.js` s'est déjà donné (`MIN_SEANCES_TENDANCE`), et on le DIT plutôt que de le
 * faire passer pour sourcé. En deçà, `progressionMesuree()` renvoie `null` — **jamais un chiffre
 * plausible.**
 */
export const MIN_SEANCES_PROGRESSION = 3;

/**
 * La durée minimale sur laquelle une progression a un sens. Deux séances dans la même semaine ne
 * disent rien d'une tendance.
 *
 * @chiffre-derive Ce `7` (jours) est une convention de LECTURE, absente de la veille : elle ne
 * prétend pas qu'il faut « au moins une semaine pour progresser » — elle dit que le moteur refuse
 * de qualifier de « progression » un écart mesuré sur moins que ça.
 */
export const MIN_JOURS_PROGRESSION = 7;

const JOUR_MS = 86_400_000;

/** Les jours entre deux dates `AAAA-MM-JJ` (bornes incluses côté calcul : c'est une durée). */
function joursEntre(depuis, jusqua) {
  return Math.round((Date.parse(`${jusqua}T00:00:00Z`) - Date.parse(`${depuis}T00:00:00Z`)) / JOUR_MS);
}

/**
 * L'ORDRE DE LA DOUBLE PROGRESSION : `a` bat-elle `b` ?
 * **La charge d'abord ; à charge égale, les reps** (veille/02 §4). Voir l'en-tête : cet ordre n'est
 * pas un choix esthétique, c'est celui que le programme PRESCRIT.
 */
function bat(a, b) {
  if (!b) return true;
  if (a.charge_kg !== b.charge_kg) return a.charge_kg > b.charge_kg;
  return a.reps > b.reps;
}

/**
 * Toutes les séries d'un exercice, à plat, dans l'ordre du carnet.
 * Une entrée de journal porte **une charge et une liste de reps** (`journal.js ajouterSeanceMuscu`) :
 * chaque rep de la liste est une SÉRIE distincte, et chacune peut porter le record.
 */
function seriesDe(journal, nom) {
  const series = [];
  for (const s of journal?.seances_muscu ?? []) {
    for (const e of s.exercices ?? []) {
      if (e?.nom !== nom || e.charge_kg == null || !Array.isArray(e.reps)) continue;
      for (const reps of e.reps) {
        if (reps == null) continue;
        series.push({ charge_kg: e.charge_kg, reps, date: s.date, seance: s.seance ?? null });
      }
    }
  }
  return series.sort((a, b) => a.date.localeCompare(b.date));
}

/** Les noms d'exercices que le carnet contient réellement. */
export function exercicesDuJournal(journal) {
  const noms = new Set();
  for (const s of journal?.seances_muscu ?? []) {
    for (const e of s.exercices ?? []) if (e?.nom) noms.add(e.nom);
  }
  return [...noms];
}

/**
 * 🔴 LA PROGRESSION **MESURÉE** — ou `null`. Il n'y a pas de troisième porte.
 *
 * On compare la **meilleure série de la première séance** de cet exercice à la **meilleure série
 * d'aujourd'hui** (le record), sur le temps réellement écoulé entre les deux. C'est une
 * **soustraction entre deux faits du carnet** : rien n'est modélisé, rien n'est lissé, rien n'est
 * extrapolé.
 *
 * ⚠️ **LA LIGNE ROUGE.** Si le carnet n'a pas de quoi MESURER (moins de `MIN_SEANCES_PROGRESSION`
 * séances, ou moins de `MIN_JOURS_PROGRESSION` jours d'écart), cette fonction renvoie **`null`** —
 * et l'écran affichera **`—`**. Elle ne renvoie **jamais** un chiffre « plausible ».
 *
 * *« Un chiffre plausible est la pire option : il le suivrait. »*
 *
 * Ce que la fonction NE renvoie PAS, et ne renverra jamais : une **date d'atteinte**, un **nombre
 * de semaines restantes**, un « à ce rythme tu y seras ». Une progression passée n'est pas une
 * promesse d'avenir, et ce moteur ne pronostique pas.
 *
 * @returns {{delta_kg, jours, semaines, seances, depuis, jusqua, depart}|null}
 */
export function progressionMesuree(journal, nom) {
  const series = seriesDe(journal, nom);
  if (!series.length) return null;

  const dates = [...new Set(series.map((s) => s.date))];
  if (dates.length < MIN_SEANCES_PROGRESSION) return null;

  // La meilleure série de la PREMIÈRE séance : le point de départ réel, pas une hypothèse.
  const premiere = dates[0];
  let depart = null;
  for (const s of series) if (s.date === premiere && bat(s, depart)) depart = s;

  const record = recordExercice(journal, nom);
  if (!record || !depart) return null;

  const jours = joursEntre(depart.date, record.date);
  if (jours < MIN_JOURS_PROGRESSION) return null;

  return {
    delta_kg: +(record.charge_kg - depart.charge_kg).toFixed(2),
    jours,
    semaines: +(jours / 7).toFixed(1),
    seances: dates.length,
    depuis: depart.date,
    jusqua: record.date,
    depart: { charge_kg: depart.charge_kg, reps: depart.reps },
  };
}

/**
 * LE RECORD D'UN EXERCICE — la meilleure série que le carnet ait vue, ou `null`.
 *
 * `null` n'est pas un échec : c'est l'état honnête d'un exercice jamais loggué. L'écran y répond
 * par **`—`**, pas par une phrase.
 *
 * @param {object} journal   le carnet — **et lui seul** (voir l'en-tête : le persona est hors portée)
 * @param {string} nom       le nom d'exercice, tel que le carnet l'écrit
 * @returns {{nom, charge_kg, reps, date, seance, au_poids_du_corps, seances, premiere_date}|null}
 */
export function recordExercice(journal, nom) {
  const series = seriesDe(journal, nom);
  if (!series.length) return null;

  let meilleure = null;
  for (const s of series) if (bat(s, meilleure)) meilleure = s;

  const dates = [...new Set(series.map((s) => s.date))];

  return {
    nom,
    charge_kg: meilleure.charge_kg,
    reps: meilleure.reps,
    date: meilleure.date,
    seance: meilleure.seance,
    // 🔴 Le garde-fou du « 0 kg » : à charge nulle, le record est en REPS. L'écran lit ce drapeau
    //    et ne peut pas écrire « 0 kg » (test à l'appui).
    au_poids_du_corps: meilleure.charge_kg === 0,
    seances: dates.length,
    premiere_date: dates[0],
  };
}

/**
 * Tous les records du carnet, exercice par exercice. Le seul point d'entrée dont l'app a besoin.
 *
 * @param {object} journal
 * @returns {Array<record & {progression: object|null}>} trié par date de record, le plus récent d'abord
 */
export function recordsMuscu(journal) {
  const out = [];
  for (const nom of exercicesDuJournal(journal)) {
    const record = recordExercice(journal, nom);
    if (record) out.push({ ...record, progression: progressionMesuree(journal, nom) });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.nom.localeCompare(b.nom));
}
