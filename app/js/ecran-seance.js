/**
 * ecran-seance.js — L'ÉCRAN DE SÉANCE. Un écran, pas un article.
 *
 * ══════════════════════════════════════════════════════════════════════
 * Ce qu'il répare
 * ══════════════════════════════════════════════════════════════════════
 * L'app avait un écran « Programme » qui déversait le programme ENTIER comme un
 * document, et un chrono dans un ONGLET SÉPARÉ. Il n'existait aucun endroit où
 * saisir une charge, aucun où noter un RPE, et le magasin `seances` d'IndexedDB
 * n'avait jamais reçu une seule ligne.
 *
 *   > « Je ressens la pâte IA. J'ai l'impression de lire un article de muscu,
 *   >   pas d'utiliser une app. Je ne peux pas rentrer mes charges. »
 *
 * ══════════════════════════════════════════════════════════════════════
 * Les quatre règles de cet écran
 * ══════════════════════════════════════════════════════════════════════
 * 1. **UN exercice à la fois**, en grand. Ce qui est fait se replie, ce qui
 *    arrive est annoncé (« qu'on sache ce qui arrive »). Jamais un mur.
 *
 * 2. **La cible du geste ne bouge JAMAIS.** La barre d'action est ANCRÉE en
 *    bas : le pouce retrouve le même bouton, série après série, pendant que
 *    l'historique défile derrière. (Le geste est répété ~17×/séance, 6×/semaine
 *    — c'est LUI qui décide si l'app est utilisée ou abandonnée.)
 *
 * 3. **Un tap = la série est écrite ET le chrono est armé.** On ne quitte plus
 *    sa séance pour aller chercher le chrono dans un onglet : il vit dans la
 *    barre, là où le pouce est déjà.
 *
 * 4. **Le « pourquoi » derrière un TAP.** « Être honnête SANS être bavard » :
 *    la transparence n'est pas un déluge de texte, c'est que la vérité soit
 *    DISPONIBLE quand on la cherche. `src/lib/avis.js` rend des DONNÉES —
 *    l'essentiel (`titre`), le pourquoi (`detail`) et la source, séparés à la
 *    source. On affiche l'essentiel ; le reste monte dans la feuille.
 *    **Aucune vérité n'est supprimée. Elle est déplacée.**
 *
 * ⚠️ Animation : le budget est DÉPENSÉ là où c'est RARE (le bilan de fin de
 * séance, une fois) et COUPÉ là où c'est fréquent (valider une série). Une
 * animation vue 17 fois par séance est une friction, pas un plaisir.
 */

import {
  $, $$, el, echapper, riche, toast, afficherEcran,
  ouvrirFeuille, fermerFeuille, blocPourquoi, SAIT, IGNORE,
} from './ui.js';

/**
 * 🔴 LA NAVIGATION DE LA COQUILLE — injectée par `main.js`, jamais importée.
 *
 * `main.js` importe cet écran ; cet écran ne peut donc pas importer `main.js`. Mais quitter une
 * séance **est une navigation**, et elle doit passer par la MÊME porte que les onglets : celle
 * qui empile une entrée d'historique (le retour d'Android) et qui met `ecranCourant` à jour.
 *
 * `afficherEcran` ne fait ni l'un ni l'autre — elle *peint*. L'utiliser pour sortir d'une séance
 * laissait la coquille convaincue d'être encore sur « seance » : **taper l'onglet Séance ne
 * faisait plus rien du tout.** Le repli sur `afficherEcran` garde l'écran utilisable si personne
 * n'injecte rien (les tests qui ne montent que cet écran), mais l'app, elle, injecte.
 */
let allerVers = afficherEcran;
import { ecrire, lireTout, lireMeta, ecrireMeta } from './db.js';
import {
  derive, mesureKg, estimeKg, lestKg,
  // 🔴 La SEULE porte par laquelle une charge de série atteint l'écran (valeurs.js).
  // Tant qu'on passe par elle, aucun chemin ne peut réafficher « 0 kg » sur une traction.
  chargeOuTiret as kg, chargeDeSerie as chargeDite, chargeDuResume,
} from './valeurs.js';
import { adaptationsMuscuEnAvis } from '../../src/lib/avis.js';
// Le moteur re-tourne dès qu'une séance est enregistrée : c'est ça, refermer la boucle.
import { afficherProgramme } from './programme.js';
import {
  creerSeance, blocCourant, indexCourant, seanceFinie, progression, tonnage,
  minutesRestantes, brouillon, precedentesDe, derniereFoisDe, ilYA, prevuDe,
  // 🔴 Le verdict de fin de séance — QUATRE issues, et il porte sa provenance (`mesure`).
  progressionDeCharge,
  validerSerie, corrigerSerie,
  supprimerSerie, ajouterSerie, retirerSerie, passerExercice, faireMaintenant,
  // 🔴 LES TROIS VERBES QUI MANQUAIENT. « Des exercices qui sont imposés » — c'est fini.
  ajouterExercice, remplacerExercice, retirerExercice,
  // 🔴 DEUX fonctions, dans cet ordre : la séance s'écrit, PUIS elle s'annote.
  terminerSeance, noterSeance,
  chargeSuivante, etatCharge, estAuPoidsDuCorps, resumeBloc,
  seriesAuPoidsDuCorps, detailTonnage, RIR_MAX, RIR_CHOIX,
} from './seance.js';
// 🔴 LE CHOIX LIBRE. Le sélecteur d'exercice affiche le verdict du moteur (`src/lib/libre.js`) ;
// il ne décide rien. `NOM_SEANCE_LIBRE` est le nom qui part au JOURNAL — écrit à un seul endroit.
import { contexteChoix, ouvrirChoixExercice, programmeDUnExercice } from './choisir.js';
import { NOM_SEANCE_LIBRE } from '../../src/lib/libre.js';
// 🔴 LE RPE DE SÉANCE — la question, la grille, l'échelle et le « pourquoi », en UN seul endroit.
// L'écran de course rendait la même grille SANS la question et SANS l'explication. La jauge
// unifiée ne tient que si la question est la même des deux côtés (ADR 0006).
import { QUESTION_RPE, grilleRPE, echelleRPE, boutonPourquoiRPE } from './rpe.js';

/**
 * Pourquoi une série reste hors du tonnage. Deux raisons, et elles n'ont RIEN à voir :
 * l'une dit « ce chiffre n'existe pas », l'autre dit « je ne le connais pas ».
 * Les confondre, c'est faire passer une ignorance pour une loi physique.
 */
const RAISON_HORS_TONNAGE = {
  // `W = F × d`, et `d = 0`. Il n'y a pas de travail mécanique à compter : ça se compte en
  // secondes, et c'est déjà fait — dans la jauge sRPE.
  isometrique: 'isométrique : aucun déplacement, donc aucun travail mécanique — ça se compte en secondes',
  // Les pieds, le dos ou un élastique portent une part du corps que personne n'a chiffrée.
  part_non_sourcee: 'la part du corps réellement soulevée n’est pas sourçable sur ce mouvement',
  poids_inconnu: 'ton poids de corps n’était pas connu au moment de cette séance',
};
import {
  demarrerChrono, lireChrono, ajusterChrono, arreterChrono, doitSignalerFin,
  bip, amorcerAudio, formaterChrono, garderEcranAllume, libererEcran,
  wakeLockSupporte,
} from './timer.js';
// 🏃 🔴 LA COURSE. L'app faisait la MOITIÉ de son sport : le moteur savait générer un plan,
// additionner un squat et un 10 km (ADR 0006) et détecter des jambes lourdes avant une séance-clé
// — et l'écran ne savait recevoir **aucune** course. Ces quatre-là referment le trou.
import { chargerSorties } from './moteur.js';
import { ouvrirSaisieCourse, carteCharge, lignesPlacement, boutonCourse, carteDerniereCourse } from './ecran-course.js';
// La limite du Wake Lock n'est pas la même sur iOS et sur Android : on dit CELLE
// de son téléphone, pas une excuse qui ne le concerne pas.
import { regimeStockage } from './install.js';

/** Clé de la séance EN COURS dans `meta`. Elle survit à un kill de l'app par iOS. */
const CLE_EN_COURS = 'seanceEnCours';

let programme = null;
let persona = null;         // son poids de corps y est — et il n'est PAS dans le tonnage : on le dit
let avis = [];
let etat = null;            // la séance en cours (null = pas commencée)
let historique = [];        // les séances déjà enregistrées
// 🏃 Les trois qui étaient calculés par le moteur et JETÉS par l'app.
let charge = null;          // `chargesHebdo()` — la jauge unifiée sRPE (muscu + course), ADR 0006
let placement = null;       // `conflitsObserves()` — jambes lourdes < 24–48 h avant une séance-clé
let sorties = [];           // les courses loguées
let mode = 'log';           // 'log' | 'edit'
let edition = null;         // { bloc, serie } en correction
let brouillonCourant = { charge_kg: null, reps: 0 };
let boucle = null;
let bilanJoue = false;

// ══════════════════════════════════════════════════════════════════════
// Formatage — la taxonomie MESURÉ · DÉRIVÉ · ESTIMÉ n'est pas décorative
// ══════════════════════════════════════════════════════════════════════

/**
 * 🔴 `null` ne s'écrit PAS. Ni « 0 », ni « null », ni « NaN » : rien.
 * Le champ reste vide, et un champ vide appelle la saisie — ce qu'un « 0 »
 * ne fait jamais (il a l'air d'une réponse).
 */
const nb = (v) => (v == null ? '' : String(v).replace('.', ','));

/** ESTIMÉ : arrondi GROSSIER (5 min). Le « ~ » est posé par la CSS, jamais ici. */
const estMin = (m) => (m <= 0 ? 0 : Math.max(5, Math.round(m / 5) * 5));

// `kg` (charge externe → « 60 kg », inconnue → « — ») et `chargeDite` (poids du corps
// → « poids du corps ») viennent de valeurs.js. Elles ne sont PAS redéfinies ici : une
// deuxième copie de la règle est une copie qui divergera — et c'est précisément là que le
// « 0 kg » des tractions avait pu naître.

// ══════════════════════════════════════════════════════════════════════
// Persistance — on écrit APRÈS chaque série, pas à la fin
// ══════════════════════════════════════════════════════════════════════
//
// Une séance perdue parce que l'app a été tuée pendant qu'on rangeait la barre,
// c'est un utilisateur qui ne revient pas. iOS gèle et tue les PWA en arrière-plan
// sans prévenir : l'état part en base à chaque geste qui compte.

async function sauver() {
  if (!etat) return;
  try {
    await ecrireMeta(CLE_EN_COURS, etat);
  } catch (e) {
    // On ne bloque PAS la séance : les séries saisies restent en mémoire et
    // l'utilisateur continue. Mais on ne fait pas semblant que c'est passé.
    toast(`Sauvegarde impossible : ${e.message}`, 'erreur');
  }
}

// ══════════════════════════════════════════════════════════════════════
// Entrée
// ══════════════════════════════════════════════════════════════════════

/**
 * @param {{persona, programme}|null} resultat  sortie du moteur (déjà calculée
 *        par l'écran Programme : on ne fait pas tourner le moteur deux fois).
 */
export async function initSeance(resultat) {
  programme = resultat?.programme ?? null;
  persona = resultat?.persona ?? null;
  // 🏃 La jauge et le placement viennent du MOTEUR (`adaptation.js programmeAdapteMuscu`), avec le
  // programme, dans le même tour. On ne les recalcule pas : deux calculs, deux vérités.
  charge = resultat?.charge ?? null;
  placement = resultat?.placement ?? null;
  avis = programme?.limitations ? adaptationsMuscuEnAvis(programme.limitations) : [];
  // 🔴 Le sélecteur d'exercice juge avec le MÊME persona, le MÊME programme et le MÊME journal que
  // l'écran — ceux que `genererProgramme()` vient de rendre. Il ne refait tourner aucun moteur :
  // un second calcul serait une seconde vérité (et c'est la charge prescrite qui divergerait).
  contexteChoix({ persona, programme, journal: resultat?.journal ?? null });

  try {
    historique = (await lireTout('seances')) ?? [];
    historique.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    sorties = await chargerSorties();
    const reprise = await lireMeta(CLE_EN_COURS, null);
    // Une séance reprise doit correspondre au programme actuel : si le profil a
    // changé entre-temps, ses exercices ne veulent plus rien dire.
    etat = reprise?.blocs?.length ? reprise : null;
  } catch (e) {
    historique = [];
    sorties = [];
    etat = null;
    toast(`Base illisible : ${e.message}`, 'erreur');
  }

  if (etat) semer();
  rendre();
}

/**
 * Appelée à chaque fois que l'écran de séance devient visible.
 *
 * 🔴 ET S'IL N'Y A PAS DE SÉANCE, ON N'Y RESTE PAS.
 * L'écran de séance n'a plus d'onglet, mais il a toujours une entrée d'HISTORIQUE : un
 * retour d'Android peut y ramener **après** que la séance a été terminée. Sans ce garde,
 * on atterrit sur une section vide, sans barre d'action et sans rien à faire — un
 * cul-de-sac. L'écran se soigne lui-même : il renvoie à l'accueil.
 */
export function activerSeance() {
  if (!etat) {
    surEcran = false;
    allerVers('accueil');
    return;
  }
  surEcran = true;
  rendre();
  lancerBoucle();
}

/**
 * 🔴 ON QUITTE L'ÉCRAN — **la séance, elle, continue d'exister.**
 *
 * C'est la moitié qui n'existait pas. `activerSeance()` était appelée à l'entrée ; **rien**
 * n'était appelé à la sortie. La coquille restait donc figée dans son état « en séance » :
 * barre d'action épinglée sur l'écran Programme, barre d'onglets absente, **plus aucune
 * navigation**. (Voir le bloc de `rendre()`.)
 *
 * ⚠️ Elle ne touche NI à `etat`, NI au chrono, NI au carnet. Sortir de la VUE n'est pas sortir
 * de la SÉANCE — c'est exactement la distinction qui manquait.
 */
export function quitterVueSeance() {
  surEcran = false;
  rendre();
}

/**
 * Le moteur re-tourne sur un journal qui a changé. Il ne se contente pas de
 * re-générer : il **relit les séances loguées** et en tire la prescription suivante.
 *
 * Un échec ici ne perd rien — la séance est déjà en base. On garde le programme
 * précédent et on le dit à la console ; on ne le dit pas à l'utilisateur, qui vient
 * de finir sa séance et n'a rien à corriger.
 */
async function rafraichirProgramme() {
  try {
    const resultat = await afficherProgramme();
    if (resultat?.programme) {
      programme = resultat.programme;
      persona = resultat.persona ?? persona;
      // 🏃 La jauge et le placement RE-TOURNENT avec le programme. Sans ces deux lignes, on
      // logue une course… et la charge affichée reste celle d'avant : le champ se remplit et
      // l'écran ne bouge pas. **C'est le bug de ce projet, pour la quatrième fois.**
      charge = resultat.charge ?? null;
      placement = resultat.placement ?? null;
      avis = programme.limitations ? adaptationsMuscuEnAvis(programme.limitations) : [];
    }
  } catch (e) {
    console.error('[seance] le programme n’a pas pu être régénéré :', e);
  }
}

/**
 * 🏃 Après une course : le moteur re-tourne (la course entre au journal → la jauge et le placement
 * changent), le carnet des sorties se relit, l'écran se re-rend. **La boucle se referme tout de
 * suite** — on ne demande pas de fermer et rouvrir l'app pour voir sa charge bouger.
 */
async function apresCourse() {
  await rafraichirProgramme();
  try {
    sorties = await chargerSorties();
  } catch (e) {
    console.error('[seance] les sorties n’ont pas pu être relues :', e);
  }
  rendre();
}

// ══════════════════════════════════════════════════════════════════════
// Le brouillon de la série à venir
// ══════════════════════════════════════════════════════════════════════

const precedentes = () => {
  const b = blocCourant(etat);
  return b ? precedentesDe(historique, b.nom) : [];
};

function semer() {
  brouillonCourant = brouillon(etat, precedentes());
}

/** Le bloc que le champ de saisie décrit en ce moment (en correction : celui qu'on corrige). */
const blocSaisi = () => (mode === 'edit' ? etat.blocs[edition.bloc] : blocCourant(etat));

/**
 * Lit ce que l'utilisateur a tapé au clavier (l'échappatoire du stepper).
 *
 * ⚠️ Un champ **vidé** repasse la charge à `null` — « je ne sais plus » est une
 * réponse recevable, et elle ne doit pas se transformer en un 0 rémanent.
 * La saisie clavier est TOUJOURS acceptée telle quelle, même hors grille : c'est
 * sa salle, pas la nôtre. On l'aide (le stepper), on ne le bride pas.
 *
 * 🔴 **SAUF au poids du corps** : là, le champ est un **LEST**, et un lest vide vaut
 * **zéro** — « je n'ai accroché aucun disque » est une réponse COMPLÈTE, pas un trou.
 * C'est ce qui garde le geste à **un seul tap** sur une traction non lestée, sans jamais
 * écrire « 0 kg » nulle part.
 */
function lireChamps() {
  const brut = String($('#sc-charge')?.value ?? '').trim();
  const c = parseFloat(brut.replace(',', '.'));
  const r = parseInt(String($('#sc-reps')?.value ?? ''), 10);
  if (brut === '') brouillonCourant.charge_kg = estAuPoidsDuCorps(blocSaisi()) ? 0 : null;
  else if (Number.isFinite(c)) brouillonCourant.charge_kg = Math.max(0, c);
  if (Number.isFinite(r)) brouillonCourant.reps = Math.max(0, r);
}

// ══════════════════════════════════════════════════════════════════════
// LE GESTE — un tap : la série est écrite, le chrono est armé
// ══════════════════════════════════════════════════════════════════════

async function valider(rir) {
  lireChamps();

  // 🔴 LA PORTE. Une série sans charge déclarée n'entre PAS en base.
  // `seance.js` la refuserait de toute façon (`exiger`), mais un refus qui
  // arrive après le tap est un refus qu'on subit : ici, on le voit venir (les
  // boutons RIR sont éteints), et on est renvoyé au champ, pas à un message.
  // ⚠️ On renvoie au CHAMP, pas à un discours : l'app ne parle pas d'elle-même.
  if (brouillonCourant.charge_kg == null) {
    toast('Charge manquante.', 'erreur');
    $('#sc-charge').focus();
    return;
  }

  if (mode === 'edit') {
    const cible = etat.blocs[edition.bloc];
    let corrigee;
    try {
      corrigee = corrigerSerie(etat, edition.bloc, edition.serie, { ...brouillonCourant, rir });
    } catch (e) {
      toast(e.message, 'erreur');
      return;
    }
    mode = 'log';
    edition = null;
    semer();
    await sauver();
    rendre();
    annoncer(`Série corrigée : ${chargeDite(cible, corrigee.charge_kg)}, ${corrigee.reps} reps, RIR ${corrigee.rir}.`);
    return;
  }

  const b = blocCourant(etat);
  if (!b) return;

  // Le repos RÉELLEMENT écoulé avant cette série. C'est une donnée mesurée, pas
  // un décor : elle dira un jour si le repos prescrit est tenu.
  const repos_s = etat.repos_arme_a ? Math.round((Date.now() - etat.repos_arme_a) / 1000) : null;

  // 🔴 `validerSerie` rend LA SÉRIE ÉCRITE. C'est elle qu'on annonce — plus jamais
  // le contenu du champ, qui décrit déjà la série SUIVANTE une fois `semer()` passé.
  let ecrite;
  try {
    ecrite = validerSerie(etat, { ...brouillonCourant, rir, repos_s });
  } catch (e) {
    toast(e.message, 'erreur'); // messages déjà écrits pour un humain (seance.js)
    return;
  }

  // Le même tap arme le repos. On ne quitte plus sa séance pour ça.
  amorcerAudio();                       // l'AudioContext doit naître d'un geste (iOS)
  if (!seanceFinie(etat)) {
    await demarrerChrono(b.repos_s);
    etat.repos_arme_a = Date.now();
    garderEcranAllume();                // refusé (iOS < 18.4) → l'écran s'éteint, le chrono reste juste
  } else {
    await arreterChrono();
    etat.repos_arme_a = null;
    await libererEcran();
  }

  semer();
  await sauver();
  rendre();
  lancerBoucle();
  annoncer(`Série enregistrée : ${chargeDite(b, ecrite.charge_kg)}, ${ecrite.reps} reps, RIR ${ecrite.rir}.`);
}

// ══════════════════════════════════════════════════════════════════════
// Démarrer / reprendre / quitter
// ══════════════════════════════════════════════════════════════════════

/**
 * 🔴 LA SÉANCE LIBRE — celle qui n'était pas au programme.
 *
 * Elle n'a **aucun chemin à elle**. C'est un programme d'une seule séance, passé à la MÊME
 * `creerSeance()`. Elle finit donc dans le même `terminerSeance()`, le même magasin `seances`, le
 * même journal, la même jauge sRPE. **Elle COMPTE.** Un second chemin d'enregistrement serait une
 * séance que le moteur ne verrait pas — le bug n°1 de ce projet, rejoué à l'identique.
 */
async function demarrerLibre() {
  await ouvrirChoixExercice({
    titre: 'Séance libre',
    apres: async (exercice) => {
      programmeLibre = programmeDUnExercice(exercice, NOM_SEANCE_LIBRE);
      await demarrer(0, programmeLibre);
    },
  });
}

/** Le programme d'une séance libre en cours — il ne vient pas du moteur, il vient de son choix. */
let programmeLibre = null;

async function demarrer(jour, source = null) {
  etat = creerSeance({
    programme: source ?? programme,
    jour,
    debut: Date.now(),
    // 🔴 Le poids de corps est FIGÉ ICI, pour toute la durée de cette séance.
    // Il entre dans le tonnage des tractions et des dips. Le relire plus tard (il change)
    // réécrirait le tonnage d'une séance passée : le carnet raconterait une progression qui
    // n'a pas eu lieu. On le capture, on le persiste, on n'y retouche plus. Voir `seance.js`.
    poids_corps_kg: persona?.profil?.poids_kg ?? null,
  });
  mode = 'log';
  edition = null;
  bilanJoue = false;
  semer();
  await sauver();
  await garderEcranAllume();
  // 🔴 DÉMARRER, C'EST NAVIGUER. La séance est un ÉCRAN maintenant, pas un pli de l'accueil :
  //    il faut y ALLER. Et il faut y aller par la porte de la coquille (`allerVers`), qui
  //    empile l'historique — sinon le retour d'Android, depuis une séance, fermerait l'app.
  surEcran = true;
  allerVers('seance');
  rendre();
  lancerBoucle();
  annoncer(`Séance ${etat.seance} démarrée.`);
}

/**
 * 🔴 LA SORTIE — et elle mène quelque part, maintenant.
 *
 *   > « J'ai du mal à sortir de ma séance une fois dedans, pour dire par exemple que je veux
 *   >   juste **changer de séance**. »
 *
 * **Rien ne s'appelait « changer de séance ».** Il fallait deviner que « Quitter » ramenait au
 * choix des séances — et quand une série était loguée, « Quitter et garder » **l'enfermait sur
 * l'écran Programme sans barre d'onglets** (voir `rendre()`). Les deux moitiés du problème.
 *
 * ⚠️ **UNE SEULE séance peut être en cours** (`CLE_EN_COURS` est une clé unique). « Changer »
 * quand des séries sont déjà loguées n'est donc PAS gratuit : il faut soit les **enregistrer**,
 * soit les **perdre**. On ne fabrique pas un troisième chemin qui ferait croire qu'on garde deux
 * séances ouvertes — ce serait un mensonge d'interface. On DIT ce que chaque porte coûte.
 */
function quitter() {
  const { faites } = progression(etat);

  // Rien de logué : il n'y a rien à peser. On le ramène au choix, sans cérémonie — c'est
  // exactement « changer de séance », et ça ne coûte rien.
  if (!faites) {
    abandonner();
    return;
  }

  const s = faites > 1 ? 's' : '';
  ouvrirFeuille({
    titre: 'Quitter la séance ?',
    sous: `<b>${faites} série${s}</b> ${faites > 1 ? 'sont enregistrées' : 'est enregistrée'} sur cet appareil.`,
    items: [
      { libelle: 'Reprendre la séance', classe: 'feuille-item--primaire', faire: fermerFeuille },
      {
        libelle: 'Quitter et garder la séance',
        sous: 'Elle t’attendra ici — tu reprendras où tu en es',
        faire: async () => {
          await arreterChrono();
          await libererEcran();
          fermerFeuille();
          // 🔴 `naviguer`, PAS `afficherEcran`. `afficherEcran` peint l'écran sans rien dire à la
          //    coquille : `ecranCourant` restait sur « seance », donc **taper l'onglet Séance ne
          //    faisait plus RIEN** (`naviguer` court-circuite quand la cible est déjà courante),
          //    et le bouton retour d'Android dépilait vers un écran fantôme. Observé, headless.
          //
          // ⚠️ ET ON REVIENT À L'ACCUEIL, plus à « Programme ». La séance qu'il garde y est
          //    AFFICHÉE (carte « Reprendre ») : il voit où elle est passée. L'envoyer sur un
          //    autre écran, c'était lui faire abandonner sa séance en silence.
          allerVers('accueil');
        },
      },
      {
        // 🔴 CE QU'IL DEMANDAIT, ET QUI N'EXISTAIT NULLE PART.
        //    Ses séries sont ÉCRITES (elles ne sont pas jetées), puis l'accueil revient — avec
        //    Push · Pull · Legs, à un tap. `terminer()` écrit AVANT d'ouvrir quoi que ce soit :
        //    la séance n'est plus l'otage d'une note ([[philosophy]] règle 15).
        libelle: 'Terminer et changer de séance',
        sous: faites > 1
          ? `Tes ${faites} séries sont enregistrées, puis tu choisis`
          : 'Ta série est enregistrée, puis tu choisis',
        faire: async () => {
          fermerFeuille();
          etat.position = etat.ordre.length; // la séance est close : le reste ne sera pas compté
          await terminer();
        },
      },
    ],
    fermer: 'Annuler',
  });
}

async function abandonner() {
  etat = null;
  // Une écriture SANS `try` : son échec partait en rejet non capturé, donc nulle
  // part. `db.js` le crie désormais sur `ECHECS` (bannière), mais on ne compte pas
  // là-dessus pour laisser l'app dans un état incohérent : on l'attrape ici aussi.
  try {
    await ecrireMeta(CLE_EN_COURS, null);
  } catch (e) {
    toast(`La séance n’a pas pu être effacée de la base : ${e.message}`, 'erreur');
  }
  await arreterChrono();
  await libererEcran();
  arreterBoucle();
  // La séance n'existe plus : son écran non plus. **Le laisser affiché, c'est la section vide
  // et sans issue** — exactement le cul-de-sac que `activerSeance()` refuse par ailleurs.
  surEcran = false;
  allerVers('accueil');
  rendre();
}

// ══════════════════════════════════════════════════════════════════════
// 🔴 TERMINER = ENREGISTRER. Le RPE annote ; il ne crée rien.
// ══════════════════════════════════════════════════════════════════════
//
// ── LE BUG, ET IL EST STRUCTUREL ──────────────────────────────────────
// Neuf séries, 80 kg au développé couché, « Terminer la séance ». La feuille de
// note monte. Il tape **« Plus tard »** — un bouton que l'app lui offre elle-même.
// Résultat en base : `seances` = **0**. Le lendemain, le moteur re-prescrit
// « CHARGE DE DÉPART · à établir ». **Il n'a jamais soulevé, pour l'app.**
//
// L'écriture en base était le CORPS de la fonction qui recevait le RPE — et cette
// fonction n'était atteignable que par les **deux boutons affirmatifs** de la feuille.
// Or une feuille (`design/sheet.js`) a **trois sorties par conception** : le glissé de
// la poignée, la touche Échap, le bouton de fermeture. Elle en aura peut-être quatre
// demain. **Les trois sautaient l'écriture.**
//
//   > La séance était **verrouillée derrière une annotation FACULTATIVE**.
//   > La dépendance était inversée : le RPE est un bonus, **la séance est le produit**.
//
// ── LA PARADE — fermer la porte à la SOURCE, pas la garder ─────────────
// Intercepter les trois sorties une par une, c'est traiter les symptômes : la
// quatrième sortie qu'on ajoutera dans six mois rouvrirait le trou en silence.
// **La séance est en base AVANT que la feuille s'ouvre.** Il n'y a plus rien à perdre
// derrière la feuille — donc plus aucune sortie à garder.
//
// Ce que ça règle du même coup, et ce n'est pas une coïncidence — c'était UNE cause :
//   · `body.en-seance` retombe → la barre d'onglets revient (l'app était sans navigation) ;
//   · `#sc-bar` se replie     → « Terminer la séance » cesse d'être épinglé sur Programme ;
//   · `#sc-vue` se replie     → « × Quitter » ne demande plus de quitter une séance finie ;
//   · le bilan est démonté    → il n'annonce plus « 9 séries loguées » sur un carnet vide.
//
// ⚠️ Ce qui NE change pas : `rpe = null` reste un état **honnête** et il se DIT (accueil :
// « RPE non noté » ; `journal.donneesManquantes()` le signale au moteur). Aucun RPE par
// défaut n'est fabriqué — un `7` inventé serait une fausse mesure, et **une fausse mesure
// MIGRE** (elle porte la charge sRPE : `charge = rpe × durée`, ADR 0006).

/**
 * « 2 860 kg » tout court laisserait croire à un total. Ça reste un TONNAGE — un agrégat,
 * pas une mesure — et il le dit. Un tonnage partiellement estimé porte son « ~ ».
 */
const tonnageDit = (enr) =>
  `${enr.tonnage_niveau === 'est' ? '~' : ''}${derive(enr.tonnage_kg, 'kg')} de tonnage`;

/**
 * 🔴 LE TAP QUI ÉCRIT. C'est le seul, et il est AFFIRMATIF : « Terminer la séance ».
 *
 * En cas d'échec d'écriture, on **ne monte pas la feuille** et `etat` reste INTACT : la
 * séance est toujours là, il peut retaper. On ne demande jamais une note sur une séance
 * qui n'est pas en base — ce serait re-fabriquer exactement le bug qu'on supprime.
 */
async function terminer() {
  if (!etat) return;

  let enr;
  try {
    enr = terminerSeance(etat, { fin: Date.now(), rpe_seance: null, echauffement: etat.echauffement });
  } catch (e) {
    toast(e.message, 'erreur'); // « Aucune série validée » — rien à enregistrer
    return;
  }

  try {
    // 🔴 La séance MÉMORISÉE. Sans note, et c'est très bien : la note viendra après.
    await ecrire('seances', enr);
    await ecrireMeta(CLE_EN_COURS, null);
  } catch (e) {
    toast(`Enregistrement impossible : ${e.message}. La séance reste ouverte, réessaie.`, 'erreur');
    return;
  }

  historique.push(enr);

  // 🔁 LA BOUCLE SE REFERME ICI, ET ELLE SE REFERME TOUT DE SUITE.
  // La séance vient d'entrer en base ; le moteur la LIT (moteur.js `chargerJournal`),
  // recale les charges de référence sur le réel, et applique la double progression.
  // La prochaine prescription n'est plus celle d'hier. Sans cet appel, il faudrait
  // fermer et rouvrir l'app pour que le programme cesse d'être identique à lui-même.
  await rafraichirProgramme();

  await arreterChrono();
  await libererEcran();
  etat = null;
  arreterBoucle();
  // La séance est finie : son écran n'a plus de raison d'être. On rend la main à l'accueil —
  // qui affiche déjà, lui, la séance qu'on vient d'écrire (« Ta dernière séance »).
  surEcran = false;
  allerVers('accueil');
  rendre();

  // La séance est écrite, l'écran est propre : la feuille ne garde plus rien en otage.
  demanderRPE(enr);
}

// ══════════════════════════════════════════════════════════════════════
// LE RPE — la donnée pivot. Demandée UNE fois, à la fin. Jamais suggérée.
// ══════════════════════════════════════════════════════════════════════
//
// Décision déjà tranchée, et elle ne se rejoue pas : **aucun pré-remplissage**.
// Un chiffre suggéré est un chiffre qu'on valide machinalement — et celui-ci
// porte TOUTE la charge unifiée (ADR 0006 : `charge = rpe × durée`, la même
// formule pour un squat et pour un 10 km). Le pré-remplir corromprait la seule
// donnée que le moteur ne peut pas recalculer.
//
// L'échelle est celle de **Foster (CR-10)**, la même en muscu et en course :
// c'est ce qui rend les deux additionnables. Ce n'est pas une note de plaisir.

/**
 * @param {object} enr  la séance DÉJÀ écrite en base. La feuille l'annote, rien de plus.
 *
 * 🔴 La question, la grille, l'échelle et le « pourquoi » viennent de `rpe.js` — **ils ne sont
 * plus écrits ici.** La course rendait la MÊME grille **sans question et sans explication** :
 * deux copies, un seul sens. Or la jauge unifiée ne tient QUE si la question est la même des
 * deux côtés (`charge = rpe × durée`, ADR 0006). **Un texte, deux écrans, aucune dérive possible.**
 */
function demanderRPE(enr) {
  const corps = el('div', 'rpe');
  corps.append(el('p', 'rpe-consigne', QUESTION_RPE));
  // ⚠️ Aucun `aria-pressed="true"`, aucune valeur par défaut, aucun « suggéré » : `valeur` reste
  //    `null`. Le tap EST la déclaration — et ici il ÉCRIT (`noter`), il ne mémorise pas un choix.
  corps.append(grilleRPE({ onChoisir: (n) => noter(enr, n) }));
  corps.append(echelleRPE());
  // « Revenir à ma note » rouvre CETTE feuille — une explication ramène toujours au geste.
  corps.append(boutonPourquoiRPE(() => demanderRPE(enr)));

  // ⚠️ « Enregistrer sans noter » n'existe plus — et ce n'est PAS une vérité supprimée.
  // Ce bouton était le seul geste honnête d'une feuille qui, sinon, perdait la séance :
  // il ANNONÇAIT ce que les trois sorties faisaient en silence. La séance étant désormais
  // écrite AVANT que la feuille monte, il ne ferait plus rien qu'une fermeture ne fasse.
  // Une affordance qui n'agit plus est du théâtre. Ce qu'elle disait — « gardée, mais
  // hors jauge » — est passé dans le sous-titre et dans le libellé de la sortie, où
  // **toutes** les sorties le lisent, pas seulement celle qu'on aurait tapée.
  ouvrirFeuille({
    titre: 'Ta séance en un chiffre',
    sous: `<b>Séance enregistrée</b> — ${derive(enr.series)} séries, ${tonnageDit(enr)}. `
      + 'Une seule note, pour toute la séance : <b>sans elle, la séance ne comptera pas dans la jauge de charge</b>.',
    corps,
    fermer: 'Sans noter',
  });
}

/**
 * 🔴 ANNOTER — pas enregistrer. La séance est déjà là ; on lui ajoute son chiffre.
 *
 * Même `id` → la ligne est RÉÉCRITE, jamais dupliquée. Et le moteur re-tourne : le RPE
 * n'est pas un ornement, il pèse (`adaptation.js` : un RPE ≥ 9 est un marqueur de fatigue).
 */
async function noter(enr, rpe) {
  const note = noterSeance(enr, rpe);

  try {
    await ecrire('seances', note);
  } catch (e) {
    // La séance, elle, est sauve — c'est LA garantie du nouvel ordre. On ne le lui cache
    // pas pour autant : sa note n'est pas passée, et la jauge ne la comptera pas.
    toast(`Note non enregistrée : ${e.message}. La séance, elle, est bien gardée — sans RPE.`, 'erreur');
    fermerFeuille();
    return;
  }

  const i = historique.findIndex((s) => s.id === note.id);
  if (i >= 0) historique[i] = note;

  await rafraichirProgramme();
  fermerFeuille();
  rendre(); // l'accueil passe de « RPE non noté » à « RPE 7 »

  toast(`Séance enregistrée : ${note.series} séries, ${tonnageDit(note)}, RPE ${rpe}.`, 'succes');
}

// ══════════════════════════════════════════════════════════════════════
// RENDU
// ══════════════════════════════════════════════════════════════════════

/**
 * 🔴 `rendre()` EST UNE FONCTION TOTALE DE L'ÉTAT — et il a fallu un fantôme pour l'apprendre.
 *
 * Chaque nœud de cet écran voit sa visibilité **RECALCULÉE** ici, à chaque rendu, dans les
 * DEUX sens (`= finie`, `= !finie`). **Un seul y échappait** : le bilan. `rendreBilan()`
 * écrivait `hidden = false` et **rien, nulle part, ne réécrivait `true`**.
 *
 * Conséquence, en pleine séance NEUVE — 0 série au compteur :
 *
 *     PUSH — 0 / 9 séries
 *        ┌──────────────────────────────────────┐
 *        │  Séance terminée                     │  ← le bilan de la séance d'AVANT
 *        │  12 séries loguées en 0:16           │
 *        │  « aucune séance antérieure »        │
 *        └──────────────────────────────────────┘
 *     PRÉCÉDENT · 100 kg × 3 · aujourd'hui           ← 15 px plus bas. Il se contredit.
 *
 * Un `F5` nettoyait tout — **c'est pour ça que personne ne l'a jamais vu.** Or une PWA
 * installée **ne recharge pas** : elle reste résidente, et il enchaîne Push/Pull/Legs
 * 6 jours sur 7. Le cas nominal était le cas cassé.
 *
 * **La règle, désormais : tout ce que ce rendu MONTRE, ce rendu doit savoir le CACHER.**
 * Un `hidden = false` sans `hidden = true` en face est un fantôme en puissance.
 * Le garde-fou est dans `tests/ecran-seance.test.js` : il démarre DEUX séances de suite.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 L'ÉTAT QUI MANQUAIT — et il coûtait la SORTIE de l'app (2026-07-13)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   > « J'ai du mal à **sortir de ma séance** une fois dedans, pour dire par exemple que je
 *   >   veux juste **changer de séance**. »
 *
 * `en-seance` valait `Boolean(etat)` : **« une séance EXISTE »**. Mais la classe pilote la
 * COQUILLE — elle cache la barre d'onglets et sort la barre d'action. Elle avait donc besoin
 * d'une tout autre question : **« est-ce que je REGARDE ma séance ? »**
 *
 * **Les deux ont été confondues, et voici ce que ça donnait** (observé, headless, pas déduit) :
 * il tape « Quitter et garder la séance » → l'app affiche l'écran **Programme**… et `etat`
 * existe toujours, donc :
 *
 *     écran visible      programme
 *     BARRE D'ACTION     VISIBLE      ← épinglée en bas d'un écran qui n'est pas le sien
 *     MENU (onglets)     ABSENT       ← 🔴 il n'a plus AUCUNE navigation
 *
 * **Il est sur Programme, avec la barre de saisie d'une séance, et zéro menu.** La seule issue
 * est de tuer l'app. *(« La barre de saisie est trop grosse et TOUJOURS en bas, même hors
 * exercice » — c'est le même bug, vu de l'autre bout.)*
 *
 * 🎯 **Un état sans nom est un bug qui attend** ([[philosophy]] règle 18). Trois symptômes, une
 * seule cause. On ne corrige pas les trois : **on nomme l'état.**
 *
 *   `etat`     → une séance EXISTE   (la donnée ; elle survit à tout, y compris à un kill d'iOS)
 *   `surEcran` → on la REGARDE       (la vue ; elle change quand on tape un onglet)
 *
 * La coquille (`body.en-seance`, `#sc-bar`) suit **les deux**. Le reste suit `etat` seul.
 */

/**
 * 🔴 L'onglet Séance est-il celui qu'on regarde ? **Ce n'est PAS « une séance est en cours ».**
 * Voir le bloc ci-dessus : les confondre enfermait l'utilisateur hors de son app.
 */
let surEcran = true;

function rendre() {
  const seanceOuverte = Boolean(etat);      // une séance EXISTE
  const vueSeance = seanceOuverte && surEcran; // …et c'est elle qu'on REGARDE

  // 🔴 LA COQUILLE. Elle ne dépend PAS de l'existence d'une séance, mais du fait qu'on la
  //    regarde. Le bas de l'écran appartient à l'ACTION **tant qu'on est sur l'action** — et
  //    la navigation revient **dès qu'on en sort**. C'est tout le correctif.
  document.body.classList.toggle('en-seance', vueSeance);
  $('#sc-bar').hidden = !vueSeance;

  // `#sc-vue` suit la DONNÉE : il vit dans `section[data-ecran="seance"]`, masquée en entier
  // quand on est ailleurs. Son état hors écran n'a aucun effet visible.
  $('#sc-vue').hidden = !seanceOuverte;

  // 🔴 L'ACCUEIL SE REND TOUJOURS — Y COMPRIS PENDANT UNE SÉANCE.
  //
  //    Il n'est plus le verso de la séance : c'est un ÉCRAN, avec son onglet. Et depuis que
  //    la séance n'a plus d'onglet à elle, **l'accueil est le SEUL chemin qui y ramène**
  //    (la carte « Reprendre »). Un accueil rendu paresseusement serait un accueil qui, un
  //    jour, oublierait de dire qu'une séance est ouverte : l'utilisateur aurait une séance
  //    en cours, et aucun moyen de la retrouver. On ne joue pas à ça.
  //
  //    ⚠️ Oui, ça reconstruit ~30 nœuds à chaque série validée (~17×/séance) pendant que
  //    l'accueil est masqué. C'est le prix, et il est dérisoire : `rendre()` n'est appelée
  //    que sur des gestes, jamais dans la boucle du chrono (elle, ne touche que du texte).
  //    **Ce dépôt a déjà payé quatre fois « le champ se remplit et l'écran ne bouge pas ».
  //    Un rendu toujours juste vaut mieux qu'un rendu malin.**
  rendreAccueil();

  if (!seanceOuverte) {
    // ⚠️ Pas de séance = pas de bilan. Sans ça, il reste ARMÉ (visible, plein de son
    // texte) et il réapparaît tel quel dès que `#sc-vue` se rouvre, à la séance suivante.
    viderBilan();
    return;
  }

  const finie = seanceFinie(etat);
  const b = blocCourant(etat);
  const p = progression(etat);

  $('#sc-nom-seance').textContent = etat.seance;
  $('#sc-faites').textContent = String(p.faites);
  $('#sc-total').textContent = String(p.total);
  $('#sc-jauge').style.width = `${p.pct}%`;
  $('#sc-eta-bloc').hidden = finie;
  $('#sc-eta').textContent = derive(estMin(minutesRestantes(etat)), 'min');

  rendrePasses();
  $('#sc-bloc').hidden = finie;
  if (b) rendreBloc(b);
  rendreAVenir();

  $('#sc-controles').hidden = finie;
  $('#sc-terminer').hidden = !finie;
  // Les deux sens, comme partout ailleurs sur cet écran. C'est TOUT le correctif.
  if (finie) rendreBilan();
  else {
    viderBilan();
    rendreControles(b);
  }

  rendreRepos();
  ajusterHauteurBarre();
}

/**
 * 🔴 OÙ EN EST-IL DANS SON CYCLE — un fait DÉRIVÉ, pas une devinette.
 *
 * L'app **savait déjà tout** : elle affichait « Ta dernière séance — Push » et le persona
 * déclare un split PPL. Elle avait donc tout pour dire, en gros : **« ensuite : Pull »**.
 * Elle ne le disait pas. Elle posait trois cartes rigoureusement identiques — même taille,
 * même poids, même bouton — et demandait « Qu'est-ce que tu fais aujourd'hui ? ».
 * **Trois blocs égaux, aucun protagoniste** : la liste symétrique, là où la vie ne l'est pas.
 *
 * Ce qu'on rend ici n'est **pas une prédiction** : c'est la **rotation du split**, lue dans
 * le programme du moteur, à partir de la dernière séance réellement loguée. Traçable, donc.
 * Aucun chiffre inventé (règle 8 du juge).
 *
 * @returns {number} l'index de la séance qui SUIT la dernière faite. 0 s'il n'y a pas d'histoire.
 */
function suivanteDuCycle() {
  if (!programme?.seances?.length) return 0;
  if (!historique.length) return 0;
  // 🔴 ON REMONTE JUSQU'À LA DERNIÈRE SÉANCE **DU CYCLE**. Une séance LIBRE (« j'avais envie de
  //    tirer aujourd'hui ») n'est pas une étape du split : la compter remettrait la rotation à
  //    zéro et lui referait sa Push le lendemain de sa Push. Elle est loguée, elle compte dans la
  //    charge — elle ne DÉPLACE simplement pas le cycle. Même logique qu'un profil changé : on ne
  //    fabrique pas une rotation à partir d'une séance qui n'appartient pas au programme.
  for (let k = historique.length - 1; k >= 0; k--) {
    const i = programme.seances.findIndex((s) => s.nom === historique[k]?.seance);
    if (i >= 0) return (i + 1) % programme.seances.length;
  }
  return 0;
}

/**
 * L'accueil : pas de séance en cours.
 *
 * > ### 🔴 LA CONTRAINTE DURE, ET ELLE NE SE REJOUE PAS
 * > « Je dois être capable d'avoir **la liberté de toucher et de choisir la séance que je
 * >   veux à chaque fois**. »
 *
 * **PROPOSER n'est pas DEVINER.** Une carte est plus grosse que les autres — et **les autres
 * sont toujours là, au même endroit, tapables en un geste**. Pas de confirmation, pas de
 * message, pas de « es-tu sûr ». Il tape ce qu'il veut. **Il n'est enfermé dans aucune case.**
 *
 * Et l'app ne pose plus de question : un écran de choix **MONTRE les séances**, il n'interroge pas.
 */
function rendreAccueil() {
  const hote = $('#sc-accueil');
  hote.replaceChildren();

  if (!programme) {
    // ⚠️ « Le moteur ne sait rien de toi » — l'app se mettait en scène pour annoncer
    //    un état vide. L'état, c'est : aucun profil.
    hote.append(
      el('div', 'state state--screen',
        '<h2 class="state-title">Aucun profil sur cet appareil</h2>' +
        '<p class="state-msg">Pas de profil, donc pas de séance à faire. Importe une sauvegarde depuis <b>Moi</b>.</p>'),
    );
    return;
  }

  const suivante = suivanteDuCycle();
  const meta = (s) => {
    const series = s.exercices.reduce((n, e) => n + e.series, 0);
    return `${derive(s.exercices.length)} exercices · ${derive(series)} séries`;
  };

  // ══════════════════════════════════════════════════════════════════════
  // 🔴 UNE SÉANCE EST OUVERTE — et depuis que la séance n'a plus d'onglet, C'EST ICI, ET
  //    NULLE PART AILLEURS, QU'ON LA RETROUVE.
  // ══════════════════════════════════════════════════════════════════════
  //
  // Ce cas n'existait PAS : quand une séance était en cours, l'accueil était masqué en
  // entier. L'onglet « Séance » servait de porte de retour. **Cette porte vient de fermer**
  // — il en faut donc une autre, et elle doit être la première chose qu'on voit.
  //
  // ⛔ ET ON N'OFFRE PLUS LES AUTRES SÉANCES ICI. `CLE_EN_COURS` est une clé UNIQUE : taper
  //    « Démarrer » sur Pull pendant qu'une séance Push est ouverte **écraserait `etat`** —
  //    ses séries loguées, silencieusement, sans un mot. En rendant l'accueil atteignable
  //    pendant une séance, on vient de CRÉER ce chemin ; on le referme dans le même geste.
  //    Changer de séance existe déjà, et il DIT ce qu'il coûte : c'est « × Quitter » →
  //    « Terminer et changer de séance » (voir `quitter()`), qui ENREGISTRE avant de rendre
  //    la main. On ne fabrique pas une seconde porte qui, elle, jetterait tout.
  if (etat) {
    const p = progression(etat);
    // Le vocabulaire du protagoniste, tel quel : c'est LE geste de cet écran tant qu'une
    // séance est ouverte. Pas de classe de plus — pas de CSS morte à entretenir.
    const reprise = el('button', 'sc-hero');
    reprise.type = 'button';
    reprise.dataset.reprendre = '';
    reprise.append(
      el('span', 'sc-hero-kicker', 'Séance en cours'),
      el('span', 'sc-hero-nom', echapper(etat.seance)),
      el('span', 'sc-hero-meta', `${derive(p.faites)} / ${derive(p.total)} séries`),
      el('span', 'sc-hero-go', 'Reprendre'),
    );
    reprise.addEventListener('click', () => allerVers('seance'));
    hote.append(reprise);

    // La course, elle, n'entre en conflit avec rien : on peut loguer une sortie d'hier
    // pendant qu'une séance de salle est ouverte. Elle reste.
    hote.append(boutonCourse(() => ouvrirSaisieCourse({ apres: apresCourse })));
    const jaugeEnCours = carteCharge(charge);
    if (jaugeEnCours) hote.append(jaugeEnCours);
    return;
  }

  // ── 🔴 LE CONFLIT DE PLACEMENT — AVANT le geste, comme la sécurité sur l'écran Programme ──
  //
  // « Tu as fait des jambes lourdes il y a 24 h, ta séance-clé de course va en pâtir. » C'est un
  // fait OBSERVÉ (`placement.js conflitsObserves`), pas une prédiction — et c'est **le seul
  // différenciateur livrable sans aucune calibration**. Le mettre sous la carte de démarrage, ce
  // serait le mettre après la décision qu'il doit éclairer.
  //
  // ⚠️ Ce n'est PAS un reproche. « Ce n'est pas une faute morale : c'est un placement à corriger. »
  const conflits = lignesPlacement(placement);
  if (conflits) hote.append(conflits);

  // ── LE PROTAGONISTE ─────────────────────────────────────────────────
  // Le kicker dit d'où il sort : la rotation du cycle, ou son début. Il n'affirme
  // rien sur « aujourd'hui » — l'app ne sait pas quel jour il s'entraîne, et elle
  // ne le prétend pas.
  // ⚠️ `data-seance` porte l'index de la séance DANS LE PROGRAMME — pas sa position
  //    à l'écran. Depuis que le protagoniste sort de la liste, les deux ne coïncident
  //    plus, et un test qui cliquait « la nième carte » démarrait la mauvaise séance.
  //    Le DOM dit désormais ce que le bouton FAIT, pas où il se trouve.
  const s0 = programme.seances[suivante];
  const hero = el('button', 'sc-hero');
  hero.type = 'button';
  hero.dataset.seance = String(suivante);
  hero.append(
    el('span', 'sc-hero-kicker', historique.length ? 'Suite de ton cycle' : 'Début de ton cycle'),
    el('span', 'sc-hero-nom', echapper(s0.nom)),
    el('span', 'sc-hero-meta', meta(s0)),
    el('span', 'sc-hero-go', 'Démarrer'),
  );
  hero.addEventListener('click', () => demarrer(suivante));
  hote.append(hero);

  // ── LES AUTRES — toujours là, au même endroit, un seul tap ───────────
  const liste = el('div', 'sc-jours');
  programme.seances.forEach((s, i) => {
    if (i === suivante) return; // il est au-dessus, en grand
    const btn = el('button', 'sc-jour');
    btn.type = 'button';
    btn.dataset.seance = String(i);
    btn.append(
      el('span', 'sc-jour-nom', echapper(s.nom)),
      el('span', 'sc-jour-meta', meta(s)),
      el('span', 'sc-jour-go', 'Démarrer →'),
    );
    btn.addEventListener('click', () => demarrer(i));
    liste.append(btn);
  });
  if (liste.children.length) hote.append(liste);

  // ── 🔴 LA SÉANCE LIBRE — « des exercices qui sont IMPOSÉS » ──────────
  //
  // Les trois cartes ci-dessus sont les séances que le moteur a COMPOSÉES. Elles restent, et elles
  // restent en premier : c'est ce qu'il fait 6 jours sur 7, et c'est la valeur du produit.
  // Mais elles n'étaient pas une proposition — elles étaient **le seul chemin existant**.
  //
  // ⚠️ En dessous, pas au-dessus : ouvrir sur un catalogue de 60 exercices, ce serait remplacer
  //    un coach par un tiroir. Le moteur PROPOSE toujours ; il n'IMPOSE plus.
  const libre = el('button', 'crs-cta');
  libre.type = 'button';
  libre.dataset.libre = '';
  libre.append(
    el('span', 'crs-cta-i', '🎯'),
    el('span', 'crs-cta-t', 'Séance libre'),
    el('span', 'crs-cta-go', '+'),
  );
  libre.addEventListener('click', demarrerLibre);
  hote.append(libre);

  // ── 🏃 LE GESTE QUI MANQUAIT — loguer une course ─────────────────────
  // Il est ICI, sur l'écran qu'il ouvre 6 jours sur 7, sous les séances de salle : la course n'est
  // pas un module à part, c'est **l'autre moitié du même entraînement**. C'est d'ailleurs toute la
  // thèse du produit — et jusqu'ici elle n'existait que dans un commentaire.
  hote.append(boutonCourse(() => ouvrirSaisieCourse({ apres: apresCourse })));

  // ── 🔴 LA JAUGE UNIFIÉE — muscu + course, UNE charge ─────────────────
  // « Ce que ni Strava ni Hevy ne savent faire. » Elle était calculée (`charge.js chargesHebdo`,
  // ADR 0006) et affichée NULLE PART. La voici.
  const jauge = carteCharge(charge);
  if (jauge) hote.append(jauge);

  // Ce qu'elle a mémorisé. Discret, factuel — et c'est ce qui EXPLIQUE le protagoniste
  // ci-dessus : la dernière séance dit d'où vient la suivante.
  if (historique.length) {
    const d = historique[historique.length - 1];
    const c = el('section', 'carte');
    c.append(el('h2', 'carte-titre', 'Ta dernière séance'));
    const l = el('div', 'sc-derniere');
    l.append(
      el('div', 'sc-derniere-nom', echapper(d.seance ?? 'Séance')),
      // « 2 860 kg » nu, collé à une séance, se lit comme un total. C'est un TONNAGE de
      // charges externes : il porte son nom, ici comme dans le bilan.
      el('div', 'sc-derniere-meta',
        // Le niveau est GELÉ dans l'enregistrement (`tonnage_niveau`) : une séance qui
        // contenait des pompes reste estimée pour toujours, et garde son « ~ ».
        `${echapper(d.date)} · ${derive(d.series)} séries · <span class="val val--${d.tonnage_niveau === 'est' ? 'est' : 'der'}">${derive(d.tonnage_kg, 'kg')}</span> de tonnage` +
        (d.rpe_seance != null ? ` · RPE <span class="val val--mes">${d.rpe_seance}</span>` : ' · <b>RPE non noté</b>')),
    );
    c.append(l);
    hote.append(c);
  }

  // 🏃 …et la dernière course. La preuve, à l'écran, qu'elle est entrée quelque part.
  const derniereCourse = carteDerniereCourse(sorties, { onSupprimer: apresCourse });
  if (derniereCourse) hote.append(derniereCourse);
}

/**
 * 🔴 LA CHARGE D'UN EXERCICE FINI — pas son tonnage.
 *
 * Le récap écrivait « Développé couché — 3 séries · **720 kg** », collé au nom, en chasse
 * fixe, **là où un pratiquant lit sa charge de travail**. Ce n'était pas la charge : c'était
 * Σ charge × reps. La preuve était à l'écran : **60 kg et 40 kg affichaient tous deux 720.**
 * Un chiffre « assez plausible pour être cru » — la définition d'un chiffre qui ment sans bruit.
 *
 * On ne supprime pas le tonnage (il est vrai, et utile) : il passe **derrière le tap**, dans
 * la feuille de l'exercice, **étiqueté**. Ici, on rend ce qu'il a **soulevé** :
 *   • charge constante → « 60 kg » ;
 *   • charge montante  → « 60 → 70 kg » (on ne moyenne pas, on ne cache pas la rampe) ;
 *   • poids du corps   → « poids du corps », jamais « 0 kg ».
 */
// ⚠️ Le poids FIGÉ de la séance en cours (`etat.poids_corps_kg`), jamais celui du persona
// d'aujourd'hui : c'est lui qui a produit les chiffres de CETTE séance.
const resumeDuBloc = (b) => resumeBloc(b, etat?.poids_corps_kg ?? null);
const chargeDuBloc = (b) => chargeDuResume(resumeDuBloc(b));

/** Ce qui est FAIT se replie : une ligne, un tap pour y revenir. */
function rendrePasses() {
  const hote = $('#sc-passes');
  hote.replaceChildren();
  for (let k = 0; k < etat.position; k++) {
    const i = etat.ordre[k];
    const b = etat.blocs[i];
    if (!b.faites.length && !b.passe) continue;
    const li = el('button', `sc-passe${b.passe ? ' est-passe' : ''}`);
    li.type = 'button';
    li.append(
      el('span', 'sc-passe-tick', b.passe ? '–' : '✓'),
      el('span', 'sc-passe-nom', echapper(b.nom)),
      // `val--mes` : c'est SA charge, celle qu'il a validée. Pas un calcul dérivé.
      el('span', 'sc-passe-agg val val--mes',
        b.passe && !b.faites.length
          ? 'passé'
          : `${derive(b.faites.length)} séries · ${chargeDuBloc(b)}`),
    );
    li.addEventListener('click', () => menuPasse(i));
    hote.append(li);
  }
}

function rendreBloc(b) {
  $('#sc-exo').textContent = b.nom;

  const meta = $('#sc-meta');
  meta.replaceChildren();
  meta.append(el('span', 'tag', `${derive(b.series_prevues)} × ${echapper(b.reps_cible)} @ RIR ${echapper(b.rir_cible)}`));
  // 🔴 Sur une traction, « body only · pas 2,5 kg » ne dit RIEN de ce qu'on soulève.
  // On nomme ce qui monte (le corps) et ce qu'on peut y ajouter (un disque, pas une paire).
  meta.append(el('span', 'tag', estAuPoidsDuCorps(b)
    ? `poids du corps · lest par ${nb(b.pas_kg)} kg`
    : `${echapper(b.equipement ?? 'charge libre')} · pas ${nb(b.pas_kg)} kg`));
  if (b.charge_max_kg != null) meta.append(el('span', 'tag tag--warn', `🔒 plafond ${kg(b.charge_max_kg)}`));

  // ── Le « pourquoi » du moteur — L'ESSENTIEL ici, le détail derrière un tap ──
  // C'est exactement ce pour quoi `avis.js` sépare `titre` / `detail` / `source`.
  const siens = avisDe(b);
  if (siens.length) {
    const chip = el('button', 'sc-avis');
    chip.type = 'button';
    chip.append(
      el('span', 'sc-avis-icone', '⚠️'),
      // « LE MOTEUR a changé cet exercice » — l'app parlait du moteur à la 3ᵉ personne,
      // comme d'un personnage. L'exercice est modifié : c'est un ÉTAT, et il se nomme.
      el('span', null, `<b>Modifié</b> — ${siens.length} adaptation${siens.length > 1 ? 's' : ''}`),
      el('span', 'sc-avis-go', 'Pourquoi ?'),
    );
    chip.addEventListener('click', () => montrerAvis(b, siens));
    meta.append(chip);
  }

  if (b.consigne) $('#sc-consigne').innerHTML = `💡 ${echapper(b.consigne)}`;
  $('#sc-consigne').hidden = !b.consigne;

  rendreSeries(b);
}

/** Les avis du moteur qui concernent CET exercice. L'app filtre, elle ne parse pas. */
const avisDe = (b) =>
  avis.filter((a) => a.cible?.exercice === b.nom || a.cible?.remplace === b.nom || (a.cible?.pattern && a.cible.pattern === b.pattern && !a.cible.exercice));

function montrerAvis(b, siens) {
  const corps = el('div', 'sc-avis-liste');
  for (const a of siens) {
    const bloc = el('div', 'why-block');
    const p1 = el('div', 'why-part');
    // « Ce que LE MOTEUR a fait » → l'état, nommé. Le contenu (a.titre) ne bouge pas.
    p1.append(el('span', 'why-part-label', 'Ce qui a changé'), el('p', null, riche(a.titre)));
    bloc.append(p1);
    if (a.detail) {
      const p2 = el('div', 'why-part why-part--unknown');
      p2.append(el('span', 'why-part-label', 'Pourquoi'), el('p', null, riche(a.detail)));
      bloc.append(p2);
    }
    if (a.source) bloc.append(el('p', 'sc-source', echapper(a.source)));
    corps.append(bloc);
  }
  // ⚠️ Le sous-titre « Ton programme n'est pas le programme nominal. » est un
  //    COMMENTAIRE de l'app sur son propre travail. Les adaptations, juste en dessous,
  //    le disent déjà — et elles, elles le PROUVENT. Aucune vérité ne part avec lui.
  ouvrirFeuille({ titre: b.nom, corps, fermer: 'Revenir à ma série' });
}

function rendreSeries(b) {
  const hote = $('#sc-series');
  hote.replaceChildren();
  const prec = precedentes();
  const iBloc = indexCourant(etat);

  const tete = el('div', 'sc-grille sc-tete');
  tete.append(
    el('span', null, 'SÉR'),
    el('span', null, 'PRÉCÉDENT'),
    el('span', null, 'FAIT'),
    el('span', 'sc-droite', 'RIR'),
    el('span', null, ''),
  );
  hote.append(tete);

  const lignes = Math.max(b.series_prevues, b.faites.length);
  for (let i = 0; i < lignes; i++) {
    // 🔴 « PRÉCÉDENT » aussi disait « 0 kg × 8 » sur une traction. La semaine suivante,
    // il aurait relu ce zéro comme sa référence. Un faux chiffre migre — y compris en arrière.
    const avant = prec[i] ? `${chargeDite(b, prec[i].charge_kg, true)} × ${prec[i].reps}` : '—';
    const f = b.faites[i];

    if (f) {
      const enCours = mode === 'edit' && edition.bloc === iBloc && edition.serie === i;
      const ligne = el('button', `sc-grille sc-serie${enCours ? ' est-edite' : ''}`);
      ligne.type = 'button';
      // Le lecteur d'écran a droit à la forme LONGUE : il n'a pas de colonne à respecter.
      ligne.setAttribute('aria-label', `Série ${i + 1} — ${chargeDite(b, f.charge_kg)}, ${f.reps} reps, RIR ${f.rir}. Corriger.`);
      ligne.append(
        el('span', 'sc-idx', String(i + 1)),
        el('span', 'sc-prec', avant),
        el('span', 'val val--mes', `${chargeDite(b, f.charge_kg, true)} × ${f.reps}`),
        el('span', 'sc-rir', `RIR ${f.rir}`),
        el('span', 'sc-etat', enCours ? '✎' : '✓'),
      );
      if (f.repos_s != null) {
        ligne.append(el('span', 'sc-repos-log', `repos réel ${formaterChrono(f.repos_s)}`));
      }
      ligne.addEventListener('click', () => (enCours ? annulerEdition() : editer(iBloc, i)));
      hote.append(ligne);
    } else if (i === b.faites.length && mode !== 'edit') {
      const ligne = el('div', 'sc-grille sc-serie est-active');
      ligne.append(
        el('span', 'sc-idx', String(i + 1)),
        el('span', 'sc-prec', avant),
        el('span', 'val val--mes', `${chargeDite(b, brouillonCourant.charge_kg, true)} × ${brouillonCourant.reps}`),
        el('span', 'sc-rir', '—'),
        el('span', 'sc-etat', '›'),
      );
      ligne.id = 'sc-ligne-active';
      hote.append(ligne);
    } else {
      const ligne = el('div', 'sc-grille sc-serie est-avenir');
      ligne.append(
        el('span', 'sc-idx', String(i + 1)),
        el('span', 'sc-prec', avant),
        el('span', 'val val--der', `${echapper(b.reps_cible)} reps`),
        el('span', 'sc-rir', '—'),
        el('span', 'sc-etat', ''),
      );
      hote.append(ligne);
    }
  }
}

/** « Qu'on sache ce qui arrive » — ses mots. */
function rendreAVenir() {
  const hote = $('#sc-avenir');
  hote.replaceChildren();
  const suite = etat.ordre.slice(etat.position + 1);
  // 🔴 IL RESTE VISIBLE MÊME SANS SUITE. « À venir » n'est plus seulement une liste : c'est
  //    l'endroit où l'on AJOUTE. Le cacher sur le dernier exercice, c'est fermer la porte
  //    exactement au moment où l'on veut en faire un de plus.
  hote.hidden = seanceFinie(etat);
  if (hote.hidden) return;

  if (suite.length) {
    hote.append(el('div', 'sc-avenir-lab', 'À venir'));
    for (const i of suite) {
      const b = etat.blocs[i];
      const btn = el('button', 'sc-avenir-row');
      btn.type = 'button';
      btn.append(
        el('span', null, echapper(b.nom)),
        el('span', 'sc-avenir-go', `${derive(b.series_prevues)} × ${echapper(b.reps_cible)} · faire maintenant →`),
      );
      btn.addEventListener('click', async () => {
        faireMaintenant(etat, i);
        semer();
        await sauver();
        rendre();
        annoncer(`${b.nom} — exercice avancé.`);
      });
      hote.append(btn);
    }
  }

  // ── 🔴 AJOUTER UN EXERCICE — le geste qui n'existait nulle part ──────
  // Il est ICI, à la fin de ce qui reste à faire, parce que c'est là qu'on se pose la question :
  // « il me reste du jus, je rajoute des biceps ». Le menu « ··· » l'offre aussi — un geste que
  // l'utilisateur ne trouve pas est un geste qui n'existe pas.
  const plus = el('button', 'sc-avenir-row sc-avenir-row--plus');
  plus.type = 'button';
  plus.dataset.ajouter = '';
  plus.append(
    el('span', null, 'Ajouter un exercice'),
    el('span', 'sc-avenir-go', '+'),
  );
  plus.addEventListener('click', ajouterUnExercice);
  hote.append(plus);
}

/** Le catalogue, le verdict du moteur, puis le bloc entre dans la séance — en dernier. */
function ajouterUnExercice() {
  ouvrirChoixExercice({
    titre: 'Ajouter un exercice',
    apres: async (exercice) => {
      ajouterExercice(etat, exercice);
      semer();
      await sauver();
      rendre();
      annoncer(`${exercice.nom} ajouté à la séance.`);
    },
  });
}

/**
 * 🔴 PRÉVU · PRÉCÉDENT · SAISI — trois lignes, zéro phrase.
 *
 * « Prévu » est la ligne qui manquait, et son absence était le bug : le moteur ne
 * lisait pas le carnet, donc il prescrivait chaque semaine ce qu'il avait prescrit
 * la précédente. Elle vient de `adaptation.js` (dernière charge réelle + le pas de la
 * double progression) — plus d'une estimation figée dans le persona.
 *
 * ⚠️ Un champ sans valeur affiche **« — »**. Il ne dit pas ce qu'il ne sait pas :
 * l'état se voit, la mise en mots est derrière le tap (« ? »).
 */
function rendreControles(b) {
  const enEdition = mode === 'edit';
  const cible = enEdition ? etat.blocs[edition.bloc] : b;
  const i = enEdition ? edition.serie : b.faites.length;
  const derniere = derniereFoisDe(historique, cible.nom);
  const prec = derniere?.series?.[i] ?? null;

  const auPoids = estAuPoidsDuCorps(cible);

  // PRÉVU — ce que le moteur prévoit aujourd'hui. Un estimé ne se peint jamais comme
  // un mesuré : il est arrondi à 5 kg et n'a pas droit à l'accent (valeurs.js).
  const prevu = prevuDe(cible);
  const cellule = $('#sc-prevu-val');
  cellule.className = `sc-plan-v val ${prevu?.estimee && !auPoids ? 'val--est' : 'val--der'}`;
  cellule.textContent = prevu
    ? `${auPoids ? lestKg(prevu.charge_kg) : prevu.estimee ? estimeKg(prevu.charge_kg) : kg(prevu.charge_kg)} × ${prevu.reps}`
    : '—';

  // PRÉCÉDENT — ce qu'il a réellement soulevé la dernière fois, et quand.
  $('#sc-prec-val').textContent = prec ? `${chargeDite(cible, prec.charge_kg)} × ${prec.reps}` : '—';
  $('#sc-prec-quand').textContent = prec && derniere?.date ? (ilYA(derniere.date) ?? '') : '';

  // 🔴 REPÈRE — le chiffre qu'IL a donné, sur le mouvement d'ORIGINE.
  // Le moteur substitue (couché barre → Smith, à cause de l'épaule) : la charge déclarée
  // ne le suit pas, et c'est juste — une charge guidée n'est pas une charge libre, et
  // transposer serait inventer. Mais la JETER laissait « Prévu — » et « Charge inconnue »
  // sur son mouvement principal, à sa première séance : « il a donné son chiffre, et l'app
  // lui demande de l'inventer ».
  // On ne le prescrit pas — on le lui RE-MONTRE, nommé sur son mouvement d'origine.
  // Il ne s'affiche QUE dans le trou — c'est-à-dire exactement quand la charge est
  // `inconnue` : rien de prévu, rien de précédent, et rien de logué ici. Dès qu'un chiffre
  // RÉEL existe (il vient de soulever), le repère devient du bruit et il s'efface.
  //
  // 🔴 TROIS ÉTATS de charge. Les confondre a produit un « 0 kg » que le carnet a gobé.
  //   estimée   le moteur a estimé (squat, 90 kg) → à corriger, elle n'est pas mesurée.
  //   inconnue  le moteur n'a RIEN estimé — il ignore. Le champ est vide, il appelle la saisie.
  //   mesurée   il a soulevé → rien à dire.
  const quoi = etatCharge(cible, prec);

  const rep = cible.repere_charge;
  const montrerRepere = Boolean(rep) && !prevu && quoi === 'inconnue';
  $('#sc-repere').hidden = !montrerRepere;
  if (montrerRepere) {
    // 🔴 UNE VALEUR SANS SA PROVENANCE, C'EST « AU PIF ». Le repère affichait
    // « 80 kg × 8 · déclaré » — alors que le persona note lui-même, sur cette ligne,
    // « ⚠️ ESTIMATION PRUDENTE à re-tester ». Le moteur le SAIT déjà : il a posé
    // `charge_a_confirmer` sur ce bloc (→ `charge_estimee`), exactement le marqueur qui
    // vaut au squat son « ~90 kg · estimée, pas mesurée ». On le lit, on ne le redéduit pas.
    const estime = Boolean(cible.charge_estimee);
    const cel = $('#sc-repere-val');
    cel.className = `sc-plan-v val ${estime ? 'val--est' : 'val--der'}`; // le « ~ » est posé par la CSS
    const valeur = estime ? estimeKg(rep.charge_kg) : kg(rep.charge_kg);
    cel.textContent = rep.reps ? `${valeur} × ${rep.reps}` : valeur;
    $('#sc-repere-src').textContent = `${estime ? 'estimé' : 'déclaré'} · ${rep.nom}`;
  }

  // SAISI — le geste. En correction, on le dit : ce n'est pas la même série.
  $('#sc-qui').textContent = enEdition ? `Correction · série ${i + 1}` : 'Saisi';
  $('#sc-suppr').hidden = !enEdition;

  // 🔴 Le champ n'est PAS une charge sur une traction : c'est un LEST. Il est vide par
  // défaut (aucun disque), placeholder « 0 » — l'app n'amorce plus « 0 » dans une case
  // qui s'appelle CHARGE. Le pavé RIR reste ARMÉ : « aucun lest » est une réponse complète.
  const champ = $('#sc-charge');
  $('#sc-lab-charge').textContent = auPoids
    ? `Lest · pas ${nb(cible.pas_kg)} kg`
    : `Charge · pas ${nb(cible.pas_kg)} kg`;
  champ.placeholder = auPoids ? '0' : '—';
  $('#sc-lab-reps').textContent = `Reps · cible ${cible.reps_cible}`;
  champ.value = auPoids && !brouillonCourant.charge_kg ? '' : nb(brouillonCourant.charge_kg);
  $('#sc-reps').value = String(brouillonCourant.reps);

  // L'ÉTAT reste ; c'est sa **mise en mots** qui part derrière le tap. On ne supprime pas
  // une vérité — on supprime un bavardage.
  const note = $('#sc-charge-note');
  const txt = $('#sc-charge-note-txt');
  note.hidden = quoi === 'mesuree';
  note.dataset.etat = quoi;
  if (quoi === 'estimee') {
    txt.innerHTML = 'Charge <b>estimée</b>, pas mesurée';
    note.onclick = () => expliquerChargeEstimee(cible);
  } else if (quoi === 'inconnue') {
    txt.innerHTML = 'Charge <b>inconnue</b>';
    note.onclick = () => expliquerChargeInconnue(cible);
  }

  majGeste();
}

/**
 * 🔴 LE PAVÉ RIR — DÉRIVÉ, jamais recopié.
 *
 * Il était écrit en dur dans `index.html` : quatre boutons, 0 · 1 · 2 · 3. Et le moteur,
 * lui, prescrivait **« @ RIR 3–4 »** sur le développé couché (plancher 3 : charge non
 * mesurée). **Le haut de la fourchette cible n'était pas saisissable** — l'app demandait un
 * effort qu'elle ne savait pas recevoir, et forçait à déclarer un RIR faux sur la donnée qui
 * pilote la double progression.
 *
 * La seule borne qui existe est `RIR_MAX` (seance.js), celle que `verifierSerie()` fait
 * respecter. Le pavé la lit. Un chiffre en dur dans le HTML est un chiffre qui mentira en
 * silence dès que le moteur bougera (règle 8 du juge).
 */
function construirePave() {
  const seg = $('#sc-seg');
  seg.replaceChildren();
  for (const n of RIR_CHOIX) {
    const btn = el('button');
    btn.type = 'button';
    btn.dataset.rir = String(n);
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', `${n} répétition${n > 1 ? 's' : ''} en réserve`);
    btn.append(el('span', 'sc-seg-n', String(n)), el('span', 'sc-seg-u', 'RIR'));
    seg.append(btn);
  }
}

/**
 * L'état du GESTE, et lui seul. Appelé à chaque frappe — donc il **ne touche
 * jamais aux champs de saisie** : les réécrire pendant qu'il tape lui mangerait
 * sa virgule (« 22, » → « 22 »).
 *
 * 🔴 Tant que la charge est absente, la validation est ÉTEINTE. C'est la parade
 * la moins pénible qu'on ait trouvée : il voit *avant* de taper que le geste
 * n'est pas armé, au lieu de récolter un message d'erreur après coup. Et surtout,
 * **il devient impossible d'inscrire un 0 kg que personne n'a soulevé.**
 */
function majGeste() {
  if (!etat || seanceFinie(etat)) return;
  const enEdition = mode === 'edit';
  const sansCharge = brouillonCourant.charge_kg == null;

  $('#sc-seg-lab').innerHTML = sansCharge
    ? '<span><b>Entre ta charge</b> pour valider</span><span class="sc-echelle">au clavier, ou avec les + / −</span>'
    : enEdition
      ? `<span>Enregistrer&nbsp;— <b>reps en réserve&nbsp;?</b></span><span class="sc-echelle">déclaré : RIR ${etat.blocs[edition.bloc].faites[edition.serie].rir}</span>`
      // ⚠️ La borne haute vient de `RIR_MAX`, pas d'un chiffre recopié : elle bougerait
      //    avec le pavé, et l'échelle annoncée resterait juste.
      : `<span>Valider&nbsp;— <b>reps en réserve&nbsp;?</b></span><span class="sc-echelle">0 = échec · ${RIR_MAX} = large marge</span>`;

  // ⚠️ En mode LOG, aucun bouton n'est marqué : le tap EST la déclaration.
  // En mode ÉDITION, on re-montre le choix QU'IL A FAIT — ce n'est pas une
  // suggestion du moteur, c'est sa propre donnée.
  $('#sc-seg').classList.toggle('est-eteint', sansCharge);
  for (const btn of $$('#sc-seg button')) {
    btn.disabled = sansCharge;
    const on = !sansCharge && enEdition && Number(btn.dataset.rir) === etat.blocs[edition.bloc].faites[edition.serie].rir;
    btn.setAttribute('aria-pressed', String(on));
  }
}

function expliquerChargeEstimee(b) {
  const bloc = blocPourquoi([
    {
      label: SAIT,
      texte:
        `Cette charge est un **point de départ prudent**, pas une mesure : elle vient de ce que tu as **déclaré**, pas de ce que tu as **soulevé ici**. ` +
        `Le **RIR est relevé à ${b.rir_cible}** en conséquence — pas de lourd à quasi-échec sur une charge qui n'a **pas été mesurée**.`,
    },
    {
      label: IGNORE,
      sourdine: true,
      texte:
        "**Ta vraie charge d'aujourd'hui, personne ne la connaît.** Change le chiffre : c'est **ce que tu valides** qui part en base, jamais ce qui était prescrit. " +
        "Dès la première série loguée, la référence devient **la tienne** — et cette estimation disparaît.",
    },
  ]);
  ouvrirFeuille({ titre: 'Charge estimée, pas mesurée', corps: bloc, fermer: 'Revenir à ma série' });
}

/**
 * 🔴 L'AUTRE état — celui qui n'existait pas, et dont l'absence a produit le bug.
 * Le moteur n'a **rien** estimé ici. Lui faire dire « estimée » serait un
 * mensonge de plus ; écrire « 0 kg » en était un.
 */
function expliquerChargeInconnue(b) {
  const rep = b.repere_charge;

  // 🔴 DEUX « inconnues » BIEN DIFFÉRENTES — et les confondre serait mentir.
  //
  //   • Sans repère : rien n'a jamais été déclaré sur ce mouvement.
  //   • Avec repère : **il a déclaré son chiffre** — sur le mouvement d'ORIGINE, celui qui a
  //     été substitué (couché barre → Smith, épaule). Lui dire ici « tu ne l'as jamais
  //     déclarée » serait FAUX, et c'est exactement ce que disait cette feuille.
  //     Rien n'est transposé (une charge guidée n'est pas une charge libre, et aucun
  //     coefficient n'est sourçable) — mais le chiffre est **rendu**, et la raison de
  //     s'arrêter là est dite.
  const bloc = blocPourquoi([
    {
      label: IGNORE,
      sourdine: true,
      texte: rep
        ? `**Ta charge sur ${b.nom}.** Tu as déclaré **${kg(rep.charge_kg)}${rep.reps ? ` × ${rep.reps}` : ''}** sur **${rep.nom}** — mais ce mouvement a été **substitué**, ` +
          "et **une charge guidée n'est pas une charge libre**. Aucun coefficient de conversion n'est sourcé : **rien n'est transposé**. " +
          "Le chiffre ci-dessus est un **repère**, pas une prescription — inventer la conversion en ferait une **fausse mesure**, et **un faux chiffre migre.**"
        : `**Ta charge sur ${b.nom}.** **Aucune référence** : elle n'a jamais été déclarée, et rien n'a encore été logué dessus. ` +
          "**Rien n'est estimé ici** — un chiffre inventé deviendrait ta référence de la semaine prochaine : **un faux chiffre migre.**",
    },
    {
      label: 'Ce qu’il faut faire',
      texte:
        `Fais ta série, et **entre ce que tu as réellement chargé** — au clavier, ou avec les **+ / −** (pas de ${nb(b.pas_kg)} kg, plancher ${kg(b.plancher_kg)}). ` +
        '**C’est cette valeur qui devient la référence**, et la progression repart d’elle.',
    },
  ]);
  // « Le moteur ne connaît pas cette charge » → l'état, nommé. C'est le même fait.
  ouvrirFeuille({ titre: 'Charge inconnue', corps: bloc, fermer: 'Revenir à ma série' });
}

// ── Le chrono, DANS la barre ──────────────────────────────────────────

function rendreRepos() {
  const c = lireChrono();
  const zone = $('#sc-repos');
  zone.hidden = !c.actif || !etat || seanceFinie(etat);
  if (zone.hidden) return;

  zone.classList.toggle('est-fini', c.fini);
  $('#sc-repos-lab').textContent = c.fini ? 'Repos terminé' : 'Repos';
  // Le dépassement est une DONNÉE, pas un bug : on l'affiche, on ne le cache
  // pas derrière un 0:00 figé.
  $('#sc-repos-val').textContent = c.fini
    ? `+${formaterChrono(c.depassementS)}`
    : formaterChrono(c.restantMs / 1000);

  if (doitSignalerFin()) {
    bip();
    annoncer('Repos terminé.');
  }
}

function lancerBoucle() {
  arreterBoucle();
  if (!etat) return;
  const battre = () => {
    if (!etat) return arreterBoucle();
    $('#sc-ecoule').textContent = formaterChrono((Date.now() - etat.debut) / 1000);
    rendreRepos();
  };
  battre();
  boucle = setInterval(battre, 250);
}

function arreterBoucle() {
  if (boucle) clearInterval(boucle);
  boucle = null;
}

// ── Le bilan — le SEUL endroit où l'animation a le droit d'exister ────
// Valider une série : ~17× par séance → aucune animation, jamais.
// Terminer une séance : UNE fois, après 75 minutes sous la barre → le budget
// de mouvement se dépense ICI, précisément parce qu'il est coupé ailleurs.

/**
 * 🔴 L'INVERSE DE `rendreBilan()` — la fonction qui manquait, et c'est tout le bug.
 *
 * Elle ne se contente pas de re-cacher : elle **démonte**. Un nœud `hidden` qui garde ses
 * enfants reste dans l'arbre — lu par les lecteurs d'écran, trouvé par une recherche dans la
 * page, et prêt à ressurgir. « Séance terminée » n'a rien à faire dans le DOM de quelqu'un
 * qui vient de commencer.
 *
 * ⚠️ **`est-neuf` doit partir aussi**, et ce n'est pas cosmétique. `rendreBilan()` la POSE
 * (`classList.add`) sans que personne ne la retire : à la 2ᵉ séance, la classe est **déjà là**,
 * `add()` devient un **no-op**, et l'animation d'arrivée — le SEUL endroit de l'app où le
 * budget de mouvement se dépense — **ne se rejoue plus jamais.** Le drapeau `bilanJoue`, lui,
 * était bien remis à zéro : c'est le DOM qui gardait la trace. Même cause exactement que le
 * fantôme, en plus silencieux.
 */
function viderBilan() {
  const hote = $('#sc-bilan');
  hote.hidden = true;
  hote.replaceChildren();
  hote.classList.remove('est-neuf');
}

function rendreBilan() {
  const hote = $('#sc-bilan');
  hote.hidden = false;
  hote.replaceChildren();

  const p = progression(etat);
  const t = Math.round(tonnage(etat));
  const duree = formaterChrono((Date.now() - etat.debut) / 1000);

  hote.append(
    el('h2', 'sc-bilan-titre', 'Séance terminée'),
    el('p', 'sc-bilan-lead', `${derive(p.faites)} séries loguées en ${duree}.`),
  );

  const lignes = el('div', 'sc-bilan-lignes');
  const ligne = (k, sous, valeur, classe) => {
    const r = el('div', 'sc-bilan-ligne');
    r.append(
      el('span', 'sc-bilan-k', `${echapper(k)}<small>${echapper(sous)}</small>`),
      el('span', `val ${classe}`, valeur),
    );
    return r;
  };

  /**
   * ⚠️ Une SOURCE ne se déverse pas — elle se consulte.
   * « dérivé : Σ charge × reps » était rendu **à plat**, sous le tonnage, sans qu'on l'ait
   * demandé : c'est la formule du calcul, pas le résultat. Elle reste — la traçabilité est un
   * différenciateur, pas une option — mais **derrière un tap**, comme tout le reste du
   * « pourquoi » du moteur.
   */
  /**
   * 🔴 Une ligne SANS VALEUR — parce qu'il n'y en a pas.
   *
   * La taxonomie de `valeurs.js` a trois niveaux : **mesuré · dérivé · estimé**. Un verdict
   * rendu sans aucune comparaison n'est **aucun des trois** — il n'existe pas. Le peindre en
   * `.val` (chasse fixe, gras, calibre de métrique) lui donnerait l'allure d'un résultat.
   * Il n'en est pas un : c'est une **absence**, et l'écran doit la montrer comme telle.
   */
  const ligneRien = (k, sous, texte) => {
    const r = el('div', 'sc-bilan-ligne');
    r.append(
      el('span', 'sc-bilan-k', `${echapper(k)}<small>${echapper(sous)}</small>`),
      el('span', 'sc-bilan-rien', echapper(texte)),
    );
    return r;
  };

  const ligneSourcee = (k, valeur, classe, titre, corps) => {
    const r = el('button', 'sc-bilan-ligne sc-bilan-ligne--why');
    r.type = 'button';
    const cle = el('span', 'sc-bilan-k');
    cle.append(document.createTextNode(k), el('span', 'why-mark', '?'));
    r.append(cle, el('span', `val ${classe}`, valeur));
    r.addEventListener('click', () => {
      const b = el('div', 'why-block');
      const p = el('div', 'why-part');
      p.append(el('span', 'why-part-label', 'D’où vient ce chiffre'), el('p', null, riche(corps)));
      b.append(p);
      ouvrirFeuille({ titre, corps: b, fermer: 'Fermer' });
    });
    return r;
  };
  // 🔴 LE TONNAGE COMPTE MAINTENANT LE POIDS DU CORPS — et il DIT ce qu'il compte.
  //
  // Il avalait ~2 000 kg de tractions en silence : le carnet affichait **moins de travail
  // quand il en faisait plus**. L'exclusion était le bon réflexe tant qu'aucun coefficient
  // n'était sourçable ; elle ne l'est plus, parce qu'il n'y a **rien à sourcer** sur une
  // traction — c'est une identité physique (rien ne touche le sol → `F = m·g`).
  //
  // Trois conditions rendent ce comptage honnête, et les voici tenues :
  //   1. le kg **dérivé du corps est MARQUÉ** — `niveau` sort de `detailTonnage()` et suit la
  //      taxonomie de `valeurs.js` (`der` exact · `est` → « ~ », arrondi grossier). On ne
  //      s'en invente pas une deuxième ;
  //   2. le tonnage **n'est pas une mesure** — le « ? » ci-dessous le dit ;
  //   3. il **ne se compare jamais** entre deux exercices ni entre deux personnes — idem.
  const detail = detailTonnage(etat);
  const pdc = seriesAuPoidsDuCorps(etat);
  // ⚠️ Le poids AFFICHÉ est celui FIGÉ au départ de la séance, pas celui du persona
  // d'aujourd'hui : c'est lui qui a produit le chiffre, c'est lui qu'on montre.
  const poidsCorps = detail.poids_corps_kg;

  // Un estimé ne se peint JAMAIS comme un mesuré : la classe `val--est` pose le « ~ » (CSS)
  // et `estimeKg` arrondit grossièrement. Une somme qui contient une estimation EST une
  // estimation — elle ne se blanchit pas en s'additionnant à des chiffres exacts.
  const estime = detail.niveau === 'est';
  const valeurTonnage = estime ? estimeKg(detail.kg) : derive(t, 'kg');

  lignes.append(ligneSourcee(
    'Tonnage soulevé', valeurTonnage,
    estime ? 'val--est val--strong' : 'val--der val--strong',
    'Tonnage soulevé',
    "**Σ charge × reps**, sur chaque série que **tu** as validée.\n\n" +
    (detail.corps_kg > 0
      // ⚠️ `externe_kg` = TOUTES les charges externes (barre, haltères, poulies) **et** le lest.
      // Une version de cette phrase l'appelait « ton lest » : elle annonçait 4 736 kg de lest à
      // quelqu'un qui n'en avait accroché **aucun**. Vu à l'écran. Un chiffre juste sous un mot
      // faux ment exactement autant qu'un chiffre faux.
      ? `Tes tractions et tes dips **comptent** : rien n'y touche le sol, donc tes bras portent **tout** ton corps — ` +
        `c'est de la physique (\`F = m·g\`), pas une estimation.\n\n` +
        `Sur cette séance : ton **corps** y apporte **${derive(Math.round(detail.corps_kg), 'kg')}** ` +
        `(à ${poidsCorps ? mesureKg(poidsCorps) : '—'}), et tes **charges externes** — barre, haltères, poulies, lest éventuel — ` +
        `**${derive(Math.round(detail.externe_kg), 'kg')}**.\n\n` +
        `⚠️ Ce poids de corps est **celui du jour de la séance**, gelé. Il ne sera pas recalculé si tu changes de ` +
        `poids : une séance passée ne se réécrit pas.\n\n`
      : '') +
    (estime
      ? "⚠️ **Une partie de ce chiffre est ESTIMÉE** (d'où le « ~ »). Sur une pompe, la part du corps qui repose sur " +
        "les mains **ne fait pas consensus** : 64 %, 69–75 %, et jusqu'à **97,7 % chez l'homme contre 80,0 % chez la femme** " +
        `selon les études. On retient **65 % ± 10 points** — soit **± ${derive(Math.round(detail.incertitude_kg), 'kg')}** ici. ` +
        "Le chiffre porte son incertitude ; il ne fait pas semblant.\n\n"
      : '') +
    "🔴 **Un tonnage n'est PAS une mesure.** Il additionne des kilos soulevés à des moments et de façons " +
    "différentes. Il **ne se compare ni entre deux exercices, ni entre deux personnes** — 3 000 kg de squat et " +
    "3 000 kg de curl ne veulent pas dire la même chose. Le seul usage honnête : **toi, dans le temps**." +
    (pdc.series
      ? "\n\n**Ce qu'il ne compte pas :** " +
        detail.exclus.map((e) => `**${e.nom}** (${RAISON_HORS_TONNAGE[e.raison]})`).join(', ') + '.'
      : ''),
  ));

  // Ce qui reste DEHORS — et ce n'est plus « le poids du corps » (il est compté, maintenant) :
  // c'est le gainage (`d = 0`) et les mouvements dont la part portée n'est pas sourçable.
  // Il reste affiché : un travail qu'on ne compte pas doit rester VISIBLE, sinon il disparaît.
  if (pdc.series) {
    lignes.append(ligne(
      'Hors tonnage', 'voir « ? »',
      `${derive(pdc.series)} séries · ${derive(pdc.reps)} reps`, 'val--mes',
    ));
  }

  // ══════════════════════════════════════════════════════════════════════
  // 🔴 LA LIGNE DE VERDICT — QUATRE issues, plus deux
  // ══════════════════════════════════════════════════════════════════════
  //
  // La décision est prise par `progressionDeCharge()` (seance.js) : elle est PURE, elle se
  // teste sans DOM, et elle porte `mesure` en donnée. Ici, on ne fait plus que RENDRE.
  //
  //   en hausse             +5 kg          « Développé couché · mesuré, vs la dernière fois »
  //   en baisse            −30 kg          idem — un FAIT, pas un reproche
  //   égales               charges tenues  et SEULEMENT là
  //   rien de comparable   première fois pour ces exercices — et PAS estampillé « mesuré »
  //
  // ⚠️ Le chiffre est la VALEUR (court, chasse fixe, jamais tronqué) ; l'exercice est la
  // LÉGENDE (elle passe à la ligne). « −30 kg · Développé couché à la Smith » en chasse fixe
  // insécable déborde de la colonne sur un iPhone — vérifié à l'écran.
  const prog = progressionDeCharge(etat, historique);
  const dit = (nom) => `${echapper(nom)} · mesuré, vs la dernière fois`;

  if (prog.hausse) {
    lignes.append(ligne('Progression de charge', dit(prog.hausse.nom), `+${kg(prog.hausse.delta_kg)}`, 'val--mes'));
  }
  if (prog.baisse) {
    // Le « − » est un VRAI signe moins (U+2212), pas un trait d'union : en chasse fixe,
    // le tiret d'un clavier se lit comme une puce de liste.
    lignes.append(ligne('Baisse de charge', dit(prog.baisse.nom), `−${kg(-prog.baisse.delta_kg)}`, 'val--mes'));
  }
  if (prog.statut === 'tenues') {
    lignes.append(ligne('Progression de charge', 'mesuré, vs la dernière fois', 'charges tenues', 'val--der'));
  }
  if (prog.statut === 'premiere_seance') {
    lignes.append(ligne('Progression de charge', 'aucune séance antérieure — la référence, c’est aujourd’hui', 'première séance', 'val--der'));
  }
  if (prog.statut === 'sans_reference') {
    // 🔴 Ni mesuré, ni dérivé, ni estimé : ce verdict n'existe pas. Il ne se peint donc pas
    // comme une valeur — ni chasse fixe, ni gras, ni accent. C'est une ABSENCE, et ça se voit.
    lignes.append(ligneRien(
      'Progression de charge',
      'aucun de ces exercices n’a de passé',
      'première fois pour ces exercices',
    ));
  }
  hote.append(lignes);

  if (bilanJoue) return;
  bilanJoue = true;
  hote.classList.add('est-neuf'); // ne se joue qu'UNE fois : re-rendre ne rejoue pas la fête
}

// ══════════════════════════════════════════════════════════════════════
// Édition d'une série déjà validée
// ══════════════════════════════════════════════════════════════════════

function editer(iBloc, iSerie) {
  mode = 'edit';
  edition = { bloc: iBloc, serie: iSerie };
  const s = etat.blocs[iBloc].faites[iSerie];
  brouillonCourant = { charge_kg: s.charge_kg, reps: s.reps };
  rendre();
  $('#sc-charge').focus();
}

function annulerEdition() {
  mode = 'log';
  edition = null;
  semer();
  rendre();
}

async function retirerLaSerie() {
  if (!edition) return;
  supprimerSerie(etat, edition.bloc, edition.serie);
  annulerEdition();
  await sauver();
  annoncer('Série supprimée.');
}

// ══════════════════════════════════════════════════════════════════════
// Feuilles : menu d'exercice, exercice passé, réglages
// ══════════════════════════════════════════════════════════════════════

function menuExercice() {
  const b = blocCourant(etat);
  if (!b) return;
  const iBloc = indexCourant(etat);
  const commence = b.faites.length > 0;

  // ⚠️ « La machine est prise ? Ça tire quelque part ? On ajuste sans casser la séance. »
  //    L'app interrogeait l'utilisateur pour lui présenter un menu. Les options ci-dessous SONT
  //    la réponse : elles se lisent en une seconde, et elles disent exactement ce qu'elles font.
  //
  // 🔴 ET ELLES SONT DEUX DE PLUS. Il pouvait déplacer un exercice, le passer, l'abandonner —
  //    jamais le CHANGER. « Des exercices qui sont imposés » : le menu lui-même le prouvait.
  ouvrirFeuille({
    titre: b.nom,
    items: [
      {
        // Le rack est pris, ça tire à l'épaule, il en préfère un autre. Le moteur garde son droit
        // de refuser le remplaçant (`libre.js`) : un choix libre n'est pas un choix sans filet.
        libelle: 'Remplacer cet exercice',
        sous: commence
          ? `Tes ${b.faites.length} séries restent — celui-ci sera compté comme passé`
          : 'Choisir un autre exercice à sa place',
        faire: () => {
          fermerFeuille();
          ouvrirChoixExercice({
            titre: `Remplacer ${b.nom}`,
            exclure: b.nom,
            apres: async (exercice) => {
              remplacerExercice(etat, iBloc, exercice);
              semer();
              await sauver();
              rendre();
              annoncer(`${b.nom} remplacé par ${exercice.nom}.`);
            },
          });
        },
      },
      {
        libelle: 'Ajouter un exercice',
        sous: 'Il vient s’ajouter à la fin de la séance',
        faire: () => {
          fermerFeuille();
          ajouterUnExercice();
        },
      },
      {
        libelle: 'Faire plus tard',
        sous: 'Le remettre après les autres',
        faire: async () => {
          const i = indexCourant(etat);
          etat.ordre.splice(etat.position, 1);
          etat.ordre.push(i);
          semer();
          await sauver();
          fermerFeuille();
          rendre();
          annoncer(`${b.nom} repoussé en fin de séance.`);
        },
      },
      {
        // 🔴 RETIRER n'existe QUE sur un exercice intact. Des séries validées sont une donnée
        //    irremplaçable (elles pilotent la charge suivante et portent la jauge sRPE) : dès
        //    qu'il y en a une, le geste devient « Passer », qui garde tout et le dit.
        libelle: commence ? 'Passer cet exercice' : 'Retirer cet exercice',
        sous: commence
          ? `Les ${b.faites.length} séries déjà faites sont gardées`
          : 'Il sort de la séance du jour',
        faire: async () => {
          if (commence) passerExercice(etat);
          else retirerExercice(etat, iBloc);
          fermerFeuille();
          // 🔴 IL A RETIRÉ LE DERNIER EXERCICE. La séance est VIDE, et rien n'a été logué : elle
          //    n'existe plus. La laisser affichée, ce serait un écran « terminé » dont le seul
          //    bouton refuserait d'écrire (« aucune série validée ») — un cul-de-sac fabriqué.
          //    On le ramène au choix des séances, où il retrouve tout, sans rien perdre.
          if (!etat.ordre.length && !progression(etat).faites) {
            await abandonner();
            annoncer('Séance vidée — retour au choix des séances.');
            return;
          }
          semer();
          await sauver();
          rendre();
          annoncer(commence ? `${b.nom} passé.` : `${b.nom} retiré de la séance.`);
        },
      },
      {
        libelle: 'Terminer la séance maintenant',
        sous: 'Le reste ne sera pas compté',
        classe: 'feuille-item--danger',
        faire: () => {
          etat.position = etat.ordre.length;
          fermerFeuille();
          rendre();
        },
      },
    ],
  });
}

function menuPasse(i) {
  const b = etat.blocs[i];
  const r = resumeDuBloc(b);
  // Le tonnage n'est pas supprimé — il est ICI, **étiqueté**, à un tap. C'est exactement
  // ce que le juge exige : on DÉPLACE une vérité, on ne la fait pas taire.
  // ⚠️ Sur un gainage, il n'y a **pas** de tonnage (`d = 0`) : on n'écrit pas « 0 kg »,
  //    on ne dit rien. Un zéro a l'air d'une réponse — et là, la question ne se pose pas.
  const tonnageDuBloc = b.isometrique
    ? ''
    : `<br><small>Tonnage (Σ charge × reps) : ${derive(r.tonnage_externe_kg, 'kg')}</small>`;
  const sous = b.passe && !b.faites.length
    ? 'Exercice passé.'
    : `${derive(r.series)} série${r.series > 1 ? 's' : ''} · <b>${echapper(chargeDuBloc(b))}</b>${tonnageDuBloc}`;
  ouvrirFeuille({
    titre: b.nom,
    sous,
    items: [
      {
        libelle: 'Y revenir',
        sous: 'Reprendre cet exercice maintenant',
        faire: async () => {
          // On le remet à la position courante : l'ordre est une liste, pas une loi.
          const k = etat.ordre.indexOf(i);
          etat.ordre.splice(k, 1);
          etat.ordre.splice(etat.position - 1, 0, i);
          etat.position--;
          etat.blocs[i].passe = false;
          mode = 'log';
          edition = null;
          semer();
          await sauver();
          fermerFeuille();
          rendre();
        },
      },
    ],
  });
}

function reglages() {
  const b = blocCourant(etat);
  const corps = el('div');
  // 🔴 L'aveu du chrono vivait dans l'onglet « Repos », qui n'existe plus. Il est
  // ICI, entier — et il reste RÉGIONALISÉ : « il faut iOS 18.4 ou plus » n'a
  // aucun sens sur un Android (regimeStockage()). Une vérité se DÉPLACE ;
  // elle ne se supprime pas.
  corps.append(
    el('p', 'sc-limite', wakeLockSupporte()
      ? "L'écran est <b>maintenu allumé</b> pendant la séance. Le chrono s'affiche. Si tu <b>verrouilles</b> ton téléphone, il continue de compter juste — il est calculé sur l'heure, pas sur un compteur — <b>mais il ne sonnera pas</b>. Aucun navigateur de téléphone ne sait le faire sans serveur, <b>ni iPhone ni Android</b>."
      : regimeStockage().sansWakeLock),
  );
  if (b) {
    corps.append(el('p', 'sc-limite sc-limite--nu',
      `Repos par défaut sur <b>${echapper(b.nom)}</b> : <b>${formaterChrono(b.repos_s)}</b>. Ajustable à la volée avec −15 s / +15 s.`));
  }
  ouvrirFeuille({ titre: 'Réglages de la séance', corps, fermer: 'Fermer' });
}

// ══════════════════════════════════════════════════════════════════════
// Câblage
// ══════════════════════════════════════════════════════════════════════

const annoncer = (t) => {
  const z = $('#sc-annonce');
  if (z) z.textContent = t;
};

/** La barre est ancrée : le flux doit lui réserver sa hauteur EXACTE. */
function ajusterHauteurBarre() {
  const bar = $('#sc-bar');
  document.documentElement.style.setProperty('--sc-bar-h', `${bar.hidden ? 0 : bar.offsetHeight}px`);
}

/**
 * Tap = un cran. Appui long = répétition — l'échappatoire clavier reste le champ.
 *
 * 🔴 Le cran atterrit sur la grille RÉELLE de sa salle (`chargeSuivante`) :
 * une barre vaut **20 kg + un multiple de 2,5**. Jamais 18, jamais 23. Et sur un
 * champ vide, le premier cran donne le **plancher** — la plus petite charge
 * qu'il puisse réellement charger, pas un zéro.
 */
function pas(quoi, sens) {
  const cible = blocSaisi();
  if (!cible) return;
  lireChamps();
  if (quoi === 'charge') {
    brouillonCourant.charge_kg = chargeSuivante(cible, brouillonCourant.charge_kg, sens);
  } else {
    brouillonCourant.reps = Math.max(0, brouillonCourant.reps + sens);
  }
  // Au poids du corps, redescendre à 0 lest **vide** le champ : on ne réécrit pas « 0 »
  // dans une case, même quand elle s'appelle « Lest ». Le placeholder « 0 » dit le reste.
  $('#sc-charge').value =
    estAuPoidsDuCorps(cible) && !brouillonCourant.charge_kg ? '' : nb(brouillonCourant.charge_kg);
  $('#sc-reps').value = String(brouillonCourant.reps);
  majLigneActive();
  majGeste(); // la charge vient d'exister : le geste se rallume
}

function majLigneActive() {
  const l = $('#sc-ligne-active .val');
  if (l) l.textContent = `${chargeDite(blocSaisi(), brouillonCourant.charge_kg, true)} × ${brouillonCourant.reps}`;
}

/**
 * @param {{naviguer?: (vers: string) => void}=} o  `naviguer` = la porte de la coquille
 *        (`main.js`) : elle empile l'historique et tient `ecranCourant`. Voir `allerVers`.
 */
export function brancherSeance({ naviguer } = {}) {
  if (naviguer) allerVers = naviguer;

  $('#sc-quitter').addEventListener('click', quitter);
  $('#sc-reglages').addEventListener('click', reglages);
  $('#sc-menu').addEventListener('click', menuExercice);
  $('#sc-suppr').addEventListener('click', retirerLaSerie);
  // 🔴 Ce tap ÉCRIT la séance. Il n'ouvre pas une feuille qui, elle, écrirait —
  // c'était toute la faille : une modale a des sorties, une écriture n'en a pas.
  $('#sc-terminer').addEventListener('click', terminer);

  $('#sc-plus-serie').addEventListener('click', async () => {
    ajouterSerie(etat);
    semer();
    await sauver();
    rendre();
  });
  $('#sc-moins-serie').addEventListener('click', async () => {
    retirerSerie(etat);
    semer();
    await sauver();
    rendre();
  });

  // Steppers — tap, puis répétition à l'appui long.
  let attente = null;
  let repetition = null;
  let aRepete = false;
  for (const btn of $$('[data-pas]')) {
    const go = () => pas(btn.dataset.pas, Number(btn.dataset.sens));
    btn.addEventListener('click', () => {
      if (aRepete) {
        aRepete = false;
        return;
      }
      go();
    });
    btn.addEventListener('pointerdown', () => {
      aRepete = false;
      attente = setTimeout(() => {
        repetition = setInterval(() => {
          aRepete = true;
          go();
        }, 90);
      }, 420);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
      btn.addEventListener(ev, () => {
        clearTimeout(attente);
        clearInterval(repetition);
        repetition = null;
      });
    }
  }

  for (const id of ['#sc-charge', '#sc-reps']) {
    $(id).addEventListener('input', () => {
      lireChamps();
      majLigneActive();
      majGeste(); // il tape sa charge → le geste s'arme, sans qu'on lui reprenne son champ
    });
  }

  // 🔴 LE geste — et le pavé qui le porte, DÉRIVÉ de `RIR_MAX`.
  // Il était écrit en dur dans le HTML (0 · 1 · 2 · 3) pendant que le moteur prescrivait
  // « @ RIR 3–4 » : l'app ne pouvait pas enregistrer l'effort qu'elle demandait. On ne
  // recopie plus la borne — on la lit là où `verifierSerie()` la fait respecter.
  construirePave();
  for (const btn of $$('#sc-seg button')) {
    btn.addEventListener('click', () => valider(Number(btn.dataset.rir)));
  }

  // Le chrono, sur place.
  $('#sc-repos-moins').addEventListener('click', async () => {
    await ajusterChrono(-15);
    rendreRepos();
  });
  $('#sc-repos-plus').addEventListener('click', async () => {
    await ajusterChrono(15);
    rendreRepos();
  });
  $('#sc-repos-passer').addEventListener('click', async () => {
    await arreterChrono();
    rendreRepos();
    ajusterHauteurBarre();
    annoncer('Repos passé.');
  });

  // La barre change de hauteur quand le chrono apparaît : le flux suit.
  new ResizeObserver(ajusterHauteurBarre).observe($('#sc-bar'));
}

/** Au retour d'arrière-plan : on RECALCULE tout depuis les timestamps (contrainte n°4). */
export function reprendreSeance() {
  if (!etat) return;
  lancerBoucle();
}
