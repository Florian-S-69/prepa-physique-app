// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA CIBLE — un objectif chiffré n'a de sens que CONTRE un record
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// > *« Je ne ressens pas la possibilité de rentrer mes charges, **ni de fixer un objectif**. »*
//
// En COURSE, le moteur sait tout faire d'un objectif : une distance, une **échéance**, un dénivelé —
// et il en tire une périodisation, un affûtage, un pic. En MUSCU, `objectif` n'était **qu'un mot** :
// `"force"` ou `"hypertrophie"`. Aucune cible chiffrée. Aucune date. Rien à viser.
//
// ── Deux questions, deux champs. Le moteur les distinguait déjà en course ; il le fait ici aussi ──
//
//   • `muscu.objectif`  → **« pour quoi t'entraînes-tu ? »**  `force` | `hypertrophie`.
//                         Il pilote les **prescriptions** (séries, reps, RIR — `muscu.js`).
//                         C'est une **nature d'entraînement**. Il existait déjà. On n'y touche pas.
//
//   • `muscu.cible`     → **« quel chiffre veux-tu atteindre, et quand ? »**
//                         `{ exercice, charge_kg, echeance }`. **C'est ce module.**
//
// Les confondre aurait été l'erreur : « hypertrophie » et « 100 kg au développé couché d'ici Noël »
// ne se contredisent pas — ils ne répondent pas à la même question.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LE RECORD EST LE DÉNOMINATEUR
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// **« 100 kg au développé couché » ne veut rien dire sans savoir qu'on est à 80.** L'écart — la
// seule chose qui rende une cible actionnable — est une **soustraction entre la cible et le
// record**. Sans record, pas d'écart : le moteur affiche **`—`**, il ne comble pas.
//
// D'où l'ordre de ce module : il ne prend pas la cible au sérieux avant d'avoir lu `records.js`.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 LA LIGNE ROUGE : AUCUNE PROJECTION. JAMAIS.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Ce module **ne dira jamais** :
//   ✗ « à ce rythme, tu y seras en 12 semaines »
//   ✗ « atteignable / non atteignable »
//   ✗ une date d'atteinte, un pourcentage de réussite, une probabilité
//
// Il dit **trois faits**, et rien d'autre :
//   ✓ **le record** (mesuré) — ou `—`
//   ✓ **l'écart** (une soustraction entre deux nombres connus) — ou `—`
//   ✓ **la progression MESURÉE** sur le carnet (`records.js progressionMesuree`) — ou `—`
//
// Le troisième est `null` dès que le carnet n'a pas de quoi mesurer. **Il n'est jamais estimé.**
//
// > *« Un chiffre plausible est la pire option : **il le suivrait**. »*
//
// Une progression passée n'est pas une promesse d'avenir. Un moteur qui extrapole « +2,5 kg toutes
// les 3 semaines » sur 12 semaines vend une **droite** là où la réalité est un **plateau** — et il
// la vendrait avec l'autorité d'un chiffre. C'est exactement la classe de faute que
// `philosophy.md` §2 a déjà attrapée **sept fois** dans ce projet.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LE TROISIÈME ÉTAT : le moteur peut REFUSER
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `limitations.js` a appris au moteur à ne pas choisir entre « prescrire en aveugle » et « tout
// refuser » : il **ADAPTE**. La cible hérite des trois mêmes états, et pour la même raison.
//
//   **PRESCRIT** — rien ne s'y oppose. Le moteur donne le record, l'écart, la progression mesurée.
//   **ADAPTÉ**   — la cible tient, mais son exercice traverse une zone sous contrainte : le RIR est
//                  plafonné, le volume ne monte pas. Le moteur l'accepte **et le déclare**.
//   **REFUSÉ**   — la cible porte sur un mouvement que le moteur **RETIRE du programme**. Viser un
//                  geste qu'il refuse de prescrire est une **contradiction**, pas un objectif.
//
// > *« Un objectif de +30 kg en 4 semaines sur une épaule ACTIVE n'est pas un objectif, c'est une
// >   blessure programmée. »*
//
// ⚠️ **Et voici ce que le moteur NE refuse PAS — parce qu'il ne le peut pas honnêtement.**
// Il **ne refuse pas une cible « trop ambitieuse »**. Refuser « +30 kg en 4 semaines » chez
// quelqu'un dont l'épaule va bien exigerait un **seuil de progression sûre en kg/semaine**.
// **Ce chiffre n'existe nulle part dans la veille.** L'inventer pour avoir l'air prudent serait
// exactement la faute que ce projet combat (`philosophy.md` §2) — un garde-fou fabriqué est un
// mensonge qui a l'air d'une protection.
//
// → Le moteur pose donc les **faits** côte à côte (écart · jours restants · progression mesurée) et
//   **laisse l'utilisateur voir**. Il ne le juge pas ; il ne lui ment pas non plus.
//
// ⚠️ **Ce que la cible ne fait PAS (encore), et il faut le savoir** : elle ne **réordonne pas** le
// programme, elle ne force pas l'exercice visé en tête de séance, elle ne change aucune
// prescription. Elle est **LUE**, **évaluée**, **refusable** et **affichée** — c'est déjà tout ce
// que « fixer un objectif » veut dire aujourd'hui. Prétendre qu'elle pilote le programme alors
// qu'elle ne le fait pas serait le **troisième exemplaire** du bug de ce projet : un champ que le
// moteur n'honore pas.

import { normaliserNom, suggererNoms } from "./exercices.js";
import { recordExercice, progressionMesuree } from "./records.js";

export const STATUTS_CIBLE = ["PRESCRIT", "ADAPTE", "REFUSE"];

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const JOUR_MS = 86_400_000;

/** Le jour, en `AAAA-MM-JJ` UTC — le format du journal. */
const jour = (d) => new Date(d).toISOString().slice(0, 10);

/**
 * La cible, validée. **Une cible mal formée est REFUSÉE, jamais réparée en douce** : deviner ce
 * qu'a voulu dire l'utilisateur, c'est écrire un chiffre qu'il n'a pas donné.
 *
 * @returns {{ok: true, cible}|{ok: false, pourquoi: string}}
 */
export function normaliserCible(brut) {
  if (!brut || typeof brut !== "object") return { ok: false, pourquoi: "Aucune cible déclarée." };

  const exercice = String(brut.exercice ?? "").trim();
  if (!exercice) return { ok: false, pourquoi: "Cible sans exercice : « 100 kg » tout seul ne veut rien dire." };

  const charge = Number(brut.charge_kg);
  if (!Number.isFinite(charge) || charge <= 0) {
    return {
      ok: false,
      pourquoi:
        `Charge cible invalide (« ${brut.charge_kg ?? ""} ») : un nombre de kilos strictement positif est attendu. ` +
        `**« Je ne sais pas » n'est pas « zéro »** — le moteur n'écrit pas un chiffre que tu ne lui as pas donné.`,
    };
  }

  const echeance = String(brut.echeance ?? "").trim();
  if (!RE_DATE.test(echeance) || Number.isNaN(Date.parse(`${echeance}T00:00:00Z`))) {
    return {
      ok: false,
      pourquoi:
        `Échéance invalide (« ${brut.echeance ?? ""} ») : une date **absolue** au format AAAA-MM-JJ est attendue. ` +
        `**C'est l'échéance qui fait la différence entre une intention et un objectif** — en course, c'est déjà ` +
        `elle, et elle seule, qui rend une périodisation possible.`,
    };
  }

  return { ok: true, cible: { exercice, charge_kg: +charge.toFixed(2), echeance } };
}

/** L'exercice `nom` dans le programme généré → son entrée (avec `pattern`, `slot`), ou `null`. */
function dansLeProgramme(programme, nom) {
  const cle = normaliserNom(nom);
  for (const s of programme?.seances ?? []) {
    for (const e of s.exercices ?? []) {
      if (normaliserNom(e.nom) === cle) return { ...e, seance: s.nom };
    }
  }
  return null;
}

/** Le retrait qui frappe `nom`, s'il y en a un (limitations.js `retraits`). */
function retraitDe(programme, nom) {
  const cle = normaliserNom(nom);
  return (programme?.limitations?.retraits ?? []).find((r) => normaliserNom(r.exercice ?? "") === cle) ?? null;
}

/**
 * La substitution qui a remplacé `nom`, s'il y en a une (limitations.js : `{ avant, apres, … }`).
 *
 * ⚠️ Un exercice SUBSTITUÉ **quitte le programme** — c'est son remplaçant qui y figure. Il ne faut
 * donc surtout pas conclure « inconnu au bataillon » de son absence : il est connu, et il a été
 * délibérément écarté. C'est pour ça que ce test passe **avant** celui de l'exercice inconnu.
 */
function substitutionDe(programme, nom) {
  const cle = normaliserNom(nom);
  return (programme?.limitations?.substitutions ?? []).find((s) => normaliserNom(s.avant ?? "") === cle) ?? null;
}

/**
 * 🔴 **LE MOTEUR LIT LA CIBLE.** C'est le seul point d'entrée, et il est appelé par
 * `adaptation.js programmeAdapteMuscu` — donc par l'app, à chaque génération.
 *
 * Si un jour ce module cesse d'être appelé, `tests/objectif.test.js` tombe. **C'est délibéré** :
 * ce projet a déjà produit **deux fois** le bug du champ écrit-mais-jamais-lu (`versEntreeJournal`
 * jamais appelée ; la séance finie qui n'entrait au carnet que par le pavé de note). Le garde-fou
 * n'est pas une consigne — c'est un test qui échoue.
 *
 * @param {object} persona     normalisé — on n'y lit QUE `muscu.cible`
 * @param {object} journal     le carnet : c'est lui qui porte le record
 * @param {object} programme   le programme généré : c'est lui qui porte les retraits/substitutions
 * @param {{aujourdhui?: Date}} [opts]
 * @returns {null|object}  `null` = aucune cible déclarée (l'écran affiche `—`, pas une phrase)
 */
export function evaluerCible(persona, journal, programme, { aujourdhui = new Date() } = {}) {
  const brut = persona?.muscu?.cible;
  if (brut == null) return null;

  const valid = normaliserCible(brut);
  if (!valid.ok) {
    return {
      statut: "REFUSE",
      declaree: brut,
      exercice: null,
      charge_cible_kg: null,
      echeance: null,
      record: null,
      ecart_kg: null,
      jours_restants: null,
      progression: null,
      atteint: false,
      pourquoi: [valid.pourquoi],
    };
  }

  const { exercice, charge_kg, echeance } = valid.cible;

  // ── L'échéance ────────────────────────────────────────────────────────────────────────────
  const jours_restants = Math.round((Date.parse(`${echeance}T00:00:00Z`) - Date.parse(`${jour(aujourdhui)}T00:00:00Z`)) / JOUR_MS);

  // ── Le RECORD : le dénominateur. Dérivé du carnet, JAMAIS du persona (records.js). ────────
  const record = recordExercice(journal, exercice);
  const progression = record ? progressionMesuree(journal, exercice) : null;

  // 🔴 L'écart n'existe QUE si le record existe. Pas de record ⇒ `null` ⇒ l'écran affiche `—`.
  //    On ne prend surtout pas « 0 » comme point de départ : ce serait affirmer qu'il ne sait
  //    rien soulever, ce que le carnet ne dit pas — il dit qu'il n'a rien loggué.
  const ecart_kg = record && !record.au_poids_du_corps ? +(charge_kg - record.charge_kg).toFixed(2) : null;
  const atteint = ecart_kg != null && ecart_kg <= 0;

  const base = {
    declaree: brut,
    exercice,
    charge_cible_kg: charge_kg,
    echeance,
    record,
    ecart_kg,
    jours_restants,
    progression,
    atteint,
  };

  // ── L'ÉTAT DU DÉNOMINATEUR — et il vaut pour TOUS les statuts recevables ──────────────────
  //
  // 🔴 Trouvé en conduisant l'app pour de vrai (pas dans les tests) : sur le chemin **ADAPTÉ**,
  // l'écran affichait « record — · écart — » **sans dire pourquoi**. La vérité disparaissait dans
  // le seul cas où l'utilisateur en avait le plus besoin. C'est exactement la contre-règle de
  // `tests/ton.test.js` : *un correctif qui fait TAIRE le moteur est un mauvais correctif.*
  //
  // Ces notes sont donc calculées **une fois**, et servies à ADAPTÉ **comme** à PRESCRIT.
  const notes = [];
  if (!record) {
    notes.push(
      `Ton carnet n'a **encore jamais vu** « ${exercice} » : pas de record ⇒ **pas d'écart**. Le moteur ` +
        `affiche **—** plutôt qu'un chiffre qu'il aurait deviné — il ne part surtout pas d'un **zéro**, ` +
        `qui affirmerait que tu ne sais rien soulever. **Une séance suffit à ouvrir le compteur.**`
    );
  } else if (record.au_poids_du_corps) {
    notes.push(
      `Ton record sur « ${exercice} » est **au poids du corps** (${record.reps} reps) : il n'y a pas encore ` +
        `de **charge** à comparer à ta cible. L'écart s'affichera dès la première série **lestée**.`
    );
  }
  if (record && !progression) {
    notes.push(
      `**Progression mesurée : —.** Le carnet n'a pas de quoi la **mesurer** (il faut au moins 3 séances de ` +
        `cet exercice, étalées sur au moins une semaine). **Le moteur ne l'estime pas** : un chiffre plausible ` +
        `ici serait la pire des réponses, **parce que tu le suivrais.**`
    );
  }
  if (atteint) {
    notes.push(
      `🎯 **Cible atteinte** : ton record (${record.charge_kg} kg × ${record.reps}, le ${record.date}) est **au ` +
        `niveau ou au-dessus** de ta cible. Il est temps d'en fixer une autre.`
    );
  }

  // ── REFUS 1 — le moteur RETIRE ce mouvement. Viser ce qu'il refuse de prescrire n'a pas de sens.
  const retrait = retraitDe(programme, exercice);
  if (retrait) {
    return {
      ...base,
      statut: "REFUSE",
      pourquoi: [
        `**${exercice}** est **RETIRÉ de ton programme** par l'adaptation « ${retrait.zone} ». ` +
          `Le moteur refuse de le prescrire : en faire une **cible chiffrée** serait se donner rendez-vous ` +
          `sur le seul mouvement qu'il t'a demandé de ne pas faire.`,
        retrait.pourquoi,
        `**Ce n'est pas un refus de progresser** — c'est un refus de progresser **LÀ**, maintenant. ` +
          `Le retrait est **RÉVERSIBLE** : dès que la limitation cesse d'être ACTIVE, la cible redevient ` +
          `recevable telle quelle.`,
      ],
    };
  }

  // ── ADAPTÉ (a) — le mouvement a été SUBSTITUÉ. Il a quitté le programme, mais il n'est pas
  //    « inconnu » : il a été délibérément remplacé. Ce test passe donc AVANT celui de l'inconnu.
  const auProgramme = dansLeProgramme(programme, exercice);
  const substitution = substitutionDe(programme, exercice);
  if (substitution) {
    return {
      ...base,
      statut: "ADAPTE",
      pourquoi: [
        `**${exercice}** a été **SUBSTITUÉ** dans ton programme — remplacé par **${substitution.apres}** ` +
          `(adaptation « ${substitution.zone} »). La cible reste recevable, mais **le mouvement que tu ` +
          `t'entraînes à faire n'est pas exactement celui que tu vises** : le moteur préfère te le dire ` +
          `que de te laisser croire que tu prépares directement ta cible.`,
        substitution.pourquoi,
        `La substitution est **RÉVERSIBLE** : dès que la limitation le permet, le mouvement visé revient ` +
          `au programme et la cible se poursuit sur lui.`,
        ...notes,
      ],
    };
  }

  // ── REFUS 2 — le moteur ne sait pas de quoi on parle. ──────────────────────────────────────
  if (!auProgramme && !record) {
    const connus = [
      ...new Set([
        ...(programme?.seances ?? []).flatMap((s) => (s.exercices ?? []).map((e) => e.nom)),
        ...(journal?.seances_muscu ?? []).flatMap((s) => (s.exercices ?? []).map((e) => e.nom)),
      ]),
    ];
    const proches = suggererNoms(exercice, connus, 3);
    return {
      ...base,
      statut: "REFUSE",
      pourquoi: [
        `**${exercice}** n'est ni à ton programme, ni dans ton carnet : le moteur n'a **aucun moyen de ` +
          `mesurer** où tu en es sur ce mouvement, ni de constater que tu l'atteins.` +
          (proches.length ? ` Peut-être : ${proches.map((n) => `**${n}**`).join(" · ")} ?` : ""),
        `Une cible sans record est une cible **sans dénominateur** : le moteur préfère la refuser ` +
          `plutôt que de te renvoyer un écart calculé depuis un zéro qu'il aurait inventé.`,
      ],
    };
  }

  // ── ADAPTÉ (b) — la cible tient, mais son pattern est sous contrainte. ────────────────────
  const sousContrainte = new Set(programme?.limitations?.patterns_sous_contrainte ?? []);
  if (auProgramme && sousContrainte.has(auProgramme.pattern)) {
    return {
      ...base,
      statut: "ADAPTE",
      pourquoi: [
        `Le pattern **${auProgramme.pattern}** est **sous contrainte** (limitation déclarée) : le RIR y est ` +
          `plafonné et le volume n'y monte pas tant que la zone n'est pas résolue. La cible tient, mais elle ` +
          `avance sur un terrain **volontairement bridé** — c'est un choix de **sécurité**, et il a un coût.`,
        `⚠️ **De combien la progression sera-t-elle plus lente ? Le moteur n'en sait RIEN, et il ne le ` +
          `fabriquera pas.** Aucune source de la veille ne chiffre ça. Il te dit que le frein **existe** ; ` +
          `il n'invente pas sa **valeur**.`,
        ...notes,
      ],
    };
  }

  // ── PRESCRIT ──────────────────────────────────────────────────────────────────────────────
  return { ...base, statut: "PRESCRIT", pourquoi: notes };
}
