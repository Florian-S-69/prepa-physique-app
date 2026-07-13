/**
 * rpe.js — LE RPE DE SÉANCE : **une** question, **une** échelle, **un** texte.
 *
 * ══════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'IL RÉPARE
 * ══════════════════════════════════════════════════════════════════════
 *
 *   > « En muscu on sait qu'on parle de répétitions en plus. Mais **en course, à quoi ça
 *   >   correspond vraiment ? Je ne sais pas.** »
 *
 * **Et c'était notre faute, pas la sienne.** La même grille 0–10 était rendue deux fois,
 * et **le sens n'était donné qu'une fois sur deux** :
 *
 *   • en **muscu**, la feuille POSE la question (« à quel point cette séance a-t-elle été
 *     dure, dans l'ensemble ? ») et un tap explique à quoi la note sert ;
 *   • en **course**, dix boutons, un libellé (« RPE de séance »), **et rien d'autre** :
 *     ni question, ni explication, aucun moyen de savoir ce qu'on note.
 *
 * Or c'est **précisément parce que c'est la MÊME question** que les deux s'additionnent :
 * `charge = rpe × durée`, la même formule pour un squat et pour un 10 km (`src/lib/charge.js`,
 * ADR 0006). **Deux écrans qui posent deux questions différentes fabriquent deux échelles
 * différentes** — et la jauge unifiée, le différenciateur du produit, additionnerait des
 * pommes et des poires **en silence**.
 *
 * → **Une question, un texte, un fichier.** Les deux écrans le lisent ; aucun ne le récrit.
 *
 * ══════════════════════════════════════════════════════════════════════
 * ⚠️ CE QUE CE FICHIER N'ÉCRIT **PAS**, ET POURQUOI (2026-07-13)
 * ══════════════════════════════════════════════════════════════════════
 * Des **repères verbaux** propres à la course avaient été proposés — *« 2–3 : je parle en
 * phrases entières · 4–6 : par bribes · 7–8 : quelques mots · 9–10 : je ne parle plus »*.
 * **Ils ne sont pas ici, et c'est délibéré. Deux raisons, et chacune suffit :**
 *
 * 1. **Ils ne sont dans AUCUNE section de `docs/veille/`.** Vérifié : `03-science-running.md`
 *    ne contient **pas une seule occurrence** de « RPE », de « Foster » ni de « CR-10 ». Les
 *    poser en citant la veille serait exactement la faute que `tests/citations.test.js` existe
 *    pour attraper — *« un `source:` est une affirmation, pas une preuve »*.
 *
 * 2. **Ce sont deux construits DIFFÉRENTS, et les confondre est une erreur de mesure.**
 *    Le « test de la parole » décrit ce qu'on arrive à dire **PENDANT** l'effort : il suit les
 *    **seuils ventilatoires**, à l'instant t. Le RPE de Foster est une note **GLOBALE et
 *    RÉTROSPECTIVE**, une seule, donnée **~30 min APRÈS** (`charge.js`, `ECHELLE_FOSTER`).
 *    Mapper l'un sur l'autre, c'est **transposer une observation d'une configuration à une
 *    autre** — `philosophy.md` règle 11, la faute qui a déjà coûté une architecture ici.
 *
 * → **À trancher par le propriétaire du produit, et seulement après une entrée de veille.** En
 *   attendant, l'app dit ce qu'elle SAIT — et ça suffit à lever la confusion signalée :
 *   **la question**, et **ce qui la sépare du RIR**.
 */

import { el, echapper, blocPourquoi, ouvrirFeuille, SAIT, IGNORE } from './ui.js';
// 🔴 Les bornes viennent du MOTEUR, pas d'un chiffre recopié dans un écran. `seance.js` et
// `course.js` en gardent chacun une copie (`RPE_FOSTER`) — trois exemplaires du même 0–10.
// La grille, elle, lit la source : elle ne peut pas dériver du validateur.
import { ECHELLE_FOSTER } from '../../src/lib/charge.js';

/**
 * 🔴 **LA question. Une seule, et elle est la même dans les deux sports.**
 *
 * Le mot « séance » est employé pour une sortie de course comme pour une séance de salle : le
 * champ du moteur s'appelle `rpe_seance` **des deux côtés** (`journal.js`), et c'est le même
 * nombre qui entre dans la même formule. **Changer le nom en course rouvrirait exactement
 * l'écart qu'on est en train de fermer.**
 */
export const QUESTION_RPE =
  'À quel point cette séance a-t-elle été <b>dure</b>, dans l’ensemble&nbsp;?';

/** Les trois ancres de l'échelle, à plat sous la grille. Elles étaient déjà là, aux deux endroits. */
const ANCRES = '<span>0 · rien</span><span>5 · dur</span><span>10 · maximal</span>';

/**
 * 🔴 **CE QUI SÉPARE LE RIR DU RPE DE SÉANCE — et c'est LÀ que la confusion s'est logée.**
 *
 * Ce n'est **pas** de la science : ce sont **nos deux champs**, et leur définition. Aucune
 * source à citer, rien à inventer — il suffisait de l'écrire, et on ne l'avait jamais fait.
 */
const RIR_NEST_PAS_LE_RPE =
  'Le **RIR** se déclare **à chaque série** — les répétitions qu\'il te restait. ' +
  'Cette note-ci est **unique**, elle porte **toute la séance**, et elle se donne **à la fin**. ' +
  '**C\'est la même question en salle et sur la route** — et c\'est parce que la question est ' +
  'la même que les deux **s\'additionnent** dans la jauge.';

/**
 * La grille 0–10. **Rien n'est pré-coché. Jamais.**
 *
 * Un chiffre suggéré est un chiffre qu'on valide machinalement — et celui-ci porte TOUTE la
 * charge unifiée. **Le tap EST la déclaration.** (Décision déjà tranchée, elle ne se rejoue pas.)
 *
 * @param {object}   o
 * @param {(n: number) => void} o.onChoisir  appelé avec la note tapée
 * @param {number|null=} o.valeur  la note DÉJÀ choisie (course : la feuille reste ouverte)
 * @returns {HTMLElement}
 */
export function grilleRPE({ onChoisir, valeur = null }) {
  const grille = el('div', 'rpe-grille');
  grille.setAttribute('role', 'group');
  grille.setAttribute('aria-label', `RPE de séance, de ${ECHELLE_FOSTER.min} à ${ECHELLE_FOSTER.max}`);

  for (let n = ECHELLE_FOSTER.min; n <= ECHELLE_FOSTER.max; n++) {
    const b = el('button', 'rpe-btn', String(n));
    b.type = 'button';
    b.dataset.rpe = String(n);
    b.setAttribute('aria-pressed', String(valeur === n));
    b.setAttribute('aria-label', `RPE ${n}`);
    b.addEventListener('click', () => {
      for (const autre of grille.children) {
        autre.setAttribute('aria-pressed', String(Number(autre.dataset.rpe) === n));
      }
      onChoisir(n);
    });
    grille.append(b);
  }
  return grille;
}

/** La ligne d'ancres, sous la grille. */
export const echelleRPE = () => el('p', 'rpe-echelle', ANCRES);

/**
 * Le bouton « Pourquoi cette note ? ». Il existe désormais **des deux côtés** — il n'existait
 * qu'en muscu.
 *
 * @param {() => void} revenir  🔴 **OBLIGATOIRE.** Ce qu'on rouvre en sortant de l'explication.
 *        Une feuille qui explique un geste doit **ramener au geste** : sans ça, lire le
 *        « pourquoi » d'une note **détruit le formulaire qu'on était en train de remplir**.
 *        (C'est le bug qu'on répare ici, et il existait aussi sur le dénivelé.)
 */
export function boutonPourquoiRPE(revenir) {
  const b = el(
    'button',
    'feuille-item feuille-item--discret',
    '<span>Pourquoi cette note&nbsp;?<small>Ce qu’elle sert, et ce qu’elle ne dit pas</small></span>',
  );
  b.type = 'button';
  b.addEventListener('click', () => expliquerRPE(revenir));
  return b;
}

/**
 * Le « pourquoi » de la note — **le même texte pour la salle et pour la route**.
 *
 * ⚠️ Le FOND ne bouge pas d'un iota par rapport à la version muscu : chaque fait, chaque aveu,
 * chaque chiffre y est. Ce qui s'y AJOUTE, c'est la part que l'app n'avait jamais dite —
 * **la différence avec le RIR** — et elle est désormais lue par les deux écrans.
 *
 * @param {() => void} revenir  ramène au geste (la note, ou le formulaire de course).
 */
export function expliquerRPE(revenir) {
  const bloc = blocPourquoi([
    {
      label: SAIT,
      texte:
        "Ce chiffre × la **durée** de ta séance, c'est la seule mesure de charge définie **à l'identique** pour un squat et pour un 10 km (échelle de Foster). " +
        "C'est ce qui permet d'**additionner** ta muscu et ta course — ce que ni Strava ni Hevy ne savent faire. La conversion entre les deux, c'est **ta perception** qui la fait, pas une constante inventée.",
    },
    // 🔴 LA PART QUI MANQUAIT. Elle n'est pas « une explication de plus » : c'est la réponse à
    // la seule question qu'il ait posée sur cet écran.
    {
      label: 'Ce n’est pas le RIR',
      texte: RIR_NEST_PAS_LE_RPE,
    },
    {
      label: IGNORE,
      sourdine: true,
      texte:
        "Ce que **ton** 7 vaut par rapport à celui d'un autre : **rien ne permet de le savoir, et rien ne le permettra** — l'échelle est **calibrée sur toi seul**. " +
        "Il faut **~8 semaines** de notes pour que la jauge tienne debout, et le critère d'abandon est **signé d'avance** : si la corrélation est trop faible, **la jauge est jetée**. " +
        "Et **aucun rappel n'est possible** : une app installée sur l'écran d'accueil n'envoie aucune notification sans serveur. **La régularité repose entièrement sur toi.**",
    },
  ]);

  ouvrirFeuille({
    titre: 'Pourquoi cette note ?',
    corps: bloc,
    // ⚠️ « Revenir » DOIT rouvrir le geste. Une explication qui ferme ce qu'elle explique est un
    // cul-de-sac — et celui-ci coûtait la saisie en cours.
    items: [{ libelle: 'Revenir à ma note', classe: 'feuille-item--primaire', faire: revenir }],
    fermer: 'Sans noter',
  });
}

/**
 * Le bloc COMPLET, tel qu'il s'affiche dans un formulaire (la course) : la question, la grille,
 * l'échelle, et le tap qui explique. **La muscu monte le sien dans sa propre feuille** (elle a
 * un titre et un sous-titre à elle), mais elle appelle **les mêmes** `grilleRPE` / `echelleRPE`
 * / `boutonPourquoiRPE`.
 *
 * @param {object} o
 * @param {(n: number) => void} o.onChoisir
 * @param {() => void} o.revenir
 * @param {number|null=} o.valeur
 * @param {string=} o.cout  ce que coûte l'absence de note. **Il est DIT, jamais tu.**
 */
export function blocRPE({ onChoisir, revenir, valeur = null, cout = null }) {
  const zone = el('div', 'rpe');
  const lab = el('div', 'champ-inline-lab', 'RPE de séance');
  if (cout) lab.append(el('span', 'crs-opt', `— ${echapper(cout)}`));
  zone.append(lab);
  // 🔴 LA QUESTION. Elle n'était posée qu'en muscu. C'est tout le bug.
  zone.append(el('p', 'rpe-consigne', QUESTION_RPE));
  zone.append(grilleRPE({ onChoisir, valeur }), echelleRPE(), boutonPourquoiRPE(revenir));
  return zone;
}
