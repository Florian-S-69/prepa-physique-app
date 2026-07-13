/**
 * seance.js — LA SÉANCE EN COURS. La logique, sans une ligne de DOM.
 *
 * ── Pourquoi ce fichier existe ──────────────────────────────────────────
 * Le magasin `seances` d'IndexedDB existait depuis le premier jour, et **rien
 * n'a jamais écrit dedans**. L'app rendait le programme comme un DOCUMENT :
 * on pouvait le lire, jamais le faire. Aucune série, aucune charge, **aucun
 * RPE** — alors que le RPE de séance est la donnée pivot du moteur de charge
 * (ADR 0006 : `charge = rpe × durée`, la même formule pour un squat et un
 * 10 km). Sans écran de séance, cette décision était morte.
 *
 * Ce module est le cerveau de cet écran. Il est **PUR** : pas de DOM, pas
 * d'IndexedDB, pas d'horloge cachée (l'appelant passe les instants). C'est ce
 * qui le rend testable sous Node — et tout ce qui **décide** ou **persiste**
 * doit l'être.
 *
 * ── La contrainte qui gouverne tout ─────────────────────────────────────
 * 🔴 **On n'écrit jamais dans le journal un chiffre que l'utilisateur n'a pas
 * produit.** Les charges du persona sont des ESTIMATIONS PRUDENTES : elles
 * amorcent le champ de saisie (il faut bien partir de quelque part, et l'app
 * les affiche comme estimées — cf. valeurs.js), mais ce qui part en base est
 * **ce qu'il a validé**, pas ce qui était prescrit.
 *
 * Le **RIR** et le **RPE**, eux, ne sont **JAMAIS** pré-remplis — ni depuis la
 * cible, ni depuis la dernière fois. Décision tranchée par le propriétaire :
 * un chiffre suggéré est un chiffre qu'on valide machinalement, et celui-là
 * **corromprait la donnée pivot du moteur**. Le tap EST la déclaration.
 *
 * ── Le format de sortie n'est pas inventé ici ───────────────────────────
 * `versEntreeJournal()` produit exactement ce que `src/lib/journal.js`
 * (`ajouterSeanceMuscu`) accepte. Le moteur est la source unique de vérité du
 * format ; l'app s'y plie. Un test le vérifie en faisant passer une vraie
 * séance loguée dans le vrai journal — pas dans une copie du format.
 */

// ══════════════════════════════════════════════════════════════════════
// Le pas de charge — DÉRIVÉ de l'équipement, jamais un nombre unique
// ══════════════════════════════════════════════════════════════════════

/**
 * Un « + » ne vaut pas la même chose partout. Ajouter 2,5 kg à une élévation
 * latérale à 12 kg, c'est **+21 %** — une progression que personne ne tient.
 * Les valeurs suivent le matériel réel : disques de 1,25 kg par côté à la
 * barre (donc 2,5 kg), racks d'haltères par 2 kg, colonnes de poulie et de
 * machine par 5 kg.
 *
 * Un poids du corps **lesté** (traction, dips) se charge au disque : 2,5 kg.
 *
 * Les clés sont les valeurs `equipment` du référentiel (free-exercise-db),
 * portées telles quelles par `src/lib/exercices.js` dans `exo.equipement`.
 */
export const PAS_PAR_EQUIPEMENT = {
  barbell: 2.5,
  'e-z curl bar': 2.5,
  dumbbell: 2,
  kettlebells: 2,
  machine: 5,
  cable: 5,
  bands: 1,
  'body only': 2.5,
  'exercise ball': 1,
  'medicine ball': 1,
  'foam roll': 1,
  other: 2.5,
};

/** Équipement inconnu → 2,5 kg : le pas de la barre, le plus courant. */
export const pasDeCharge = (equipement) => PAS_PAR_EQUIPEMENT[equipement] ?? 2.5;

/**
 * 🔴 Le PLANCHER — une charge affichée doit être une charge qu'il peut
 * RÉELLEMENT charger.
 *
 * Une barre olympique **vide pèse 20 kg**. Afficher « 18 kg » à la barre, c'est
 * afficher un poids qui n'existe pas dans sa salle. Les disques descendent à
 * 1,25 kg et vont **par paire** → toute charge à la barre vaut
 * **20 + un multiple de 2,5** : 20 · 22,5 · 25 · 27,5… **jamais 18, jamais 23.**
 *
 * ⚠️ Le plancher gouverne les **steppers** — pas la saisie au clavier. S'il tape
 * un chiffre hors grille, on l'accepte : c'est SA salle, pas la nôtre. On l'aide,
 * on ne le bride pas.
 */
export const PLANCHER_PAR_EQUIPEMENT = {
  barbell: 20, // la barre olympique VIDE
  dumbbell: 2,
  machine: 5,
  cable: 5,
  // Sans charge externe, le chiffre n'est plus une charge : c'est un LEST, et il part
  // de zéro (aucun disque accroché). Ce `0` est vrai — à condition que l'app ne
  // l'appelle jamais « la charge ». Voir `estAuPoidsDuCorps` plus bas.
  'body only': 0,
};

/** Sans plancher déclaré : le pas fait office de plus petite charge chargeable. */
export const plancherDeCharge = (equipement) =>
  PLANCHER_PAR_EQUIPEMENT[equipement] ?? pasDeCharge(equipement);

/**
 * 🔴 Cet exercice porte-t-il une charge EXTERNE ?
 *
 * C'est la distinction qui manquait, et son absence a produit le bug : sur une
 * traction, `0 kg` **est la réponse** (aucun lest) ; sur un développé couché,
 * `0 kg` **n'est pas une réponse, c'est un mensonge** — le moteur n'a rien dit.
 *
 * **Zéro et « je ne sais pas » ne sont PAS la même chose.** Ici, on les sépare
 * à la source, sur un fait que le moteur donne : l'équipement.
 */
const SANS_CHARGE_EXTERNE = new Set(['body only', 'bands', 'exercise ball', 'foam roll']);

/**
 * ⚠️ Le dataset classe les **dips aux barres parallèles** en `equipment: "other"` — les
 * barres. C'est le MATÉRIEL, pas la charge : un dip se soulève **au poids du corps**, et
 * ce qu'on y accroche est un **lest**. Sans cette correction, l'app demandait « ta charge ? »
 * sur un dip et comptait la réponse comme une charge externe — exactement le bug du
 * « 0 kg » des tractions, entré par une autre porte.
 */
const AU_POIDS_DU_CORPS_PAR_ID = new Set(['Parallel_Bar_Dip']);

export const porteUneChargeExterne = (equipement, exoId = null) =>
  !SANS_CHARGE_EXTERNE.has(equipement) && !AU_POIDS_DU_CORPS_PAR_ID.has(exoId);

// ══════════════════════════════════════════════════════════════════════
// 🔴 LA PART DU CORPS RÉELLEMENT SOULEVÉE — par MOUVEMENT, jamais « en général »
// ══════════════════════════════════════════════════════════════════════
//
// Le tonnage EXCLUAIT le poids du corps, faute de coefficient sourcé. C'était le bon
// réflexe — mais il produisait un carnet qui **affiche MOINS de travail quand on en fait
// PLUS** : trois séries de tractions à ~84 kg de corps y valaient **zéro**. Pire
// qu'imprécis : **trompeur**. On compte, donc. Et on DIT ce qu'on compte.
//
// ── Traction · dip · muscle-up → 1,00. Ce n'est PAS une estimation. ────────────────────
// C'est une **identité physique** : rien ne touche le sol, les mains portent **tout** le
// corps. `F = m·g` — et pendant la montée, `F = m(g+a)` : **100 % est un PLANCHER**, pas un
// plafond. Aucune source n'est nécessaire, aucune incertitude n'est à déclarer.
//
// > ⚠️ **LE PIÈGE, ET IL EST PARTOUT.** Le « ~95 % » que citent tous les blogs **existe**
// > vraiment : il sort d'une soustraction sur les tables de segments de **Dempster**
// > (avant-bras + main ≈ 2,2 % par bras — ils **restent sur la barre**, ils ne montent pas).
// > Mais il répond à **une AUTRE question** : *« quelle masse MONTE ? »*, et non
// > *« quelle charge les muscles SUPPORTENT ? »*. La seconde est celle du carnet.
// > **On n'utilise PAS 95 %.** On utilise **1,00**.
//
// ── Pompe → 0,65, et le chiffre PORTE SON INCERTITUDE À L'ÉCRAN ────────────────────────
// La littérature **ne converge pas** : 64 % (Ebben), 69–75 % (Suprak), et surtout
// **97,7 % chez l'homme contre 80,0 % chez la femme** (Mier & Amasay, p < 0,0001).
// Un chiffre pareil n'a pas le droit de s'afficher nu. Il est **ESTIMÉ** (valeurs.js), il
// porte son « ~ », et son « Pourquoi ? » est obligatoire.
//
// ── Gainage / planche → AUCUN tonnage ─────────────────────────────────────────────────
// `W = F × d`, et **`d = 0`**. Il n'y a pas de travail mécanique : lui fabriquer un tonnage
// serait inventer. L'effort est réel et il est **déjà** compté — en **secondes**, dans la
// jauge sRPE (`src/lib/charge.js`). On ne le compte pas deux fois dans la mauvaise unité.
// Repéré par `bloc.isometrique`, que le dataset DÉCLARE (`force: "static"`).
//
// ── Tout le reste (pont fessier, dips sur banc, crunch, traction assistée) ─────────────
// Les pieds, le dos ou un élastique portent une part du corps que **personne n'a chiffrée**
// pour nous. Aucune entrée ici ⇒ **hors tonnage, et l'écran le déclare.** On n'invente pas
// un coefficient pour faire joli : c'est exactement la faute qu'on combat.

/**
 * @type {Record<string, { part: number, incertitude: number, identite: boolean }>}
 *   `part`        fraction du poids de corps supportée
 *   `incertitude` ± en points de fraction (0 = certitude, donc DÉRIVÉ ; > 0 → ESTIMÉ)
 *   `identite`    vrai = déduit de la physique, pas d'une étude
 */
export const PART_DU_CORPS = {
  // Rien au sol : les mains portent tout. Identité, pas estimation.
  Pullups: { part: 1, incertitude: 0, identite: true },
  'Chin-Up': { part: 1, incertitude: 0, identite: true },
  Parallel_Bar_Dip: { part: 1, incertitude: 0, identite: true },
  'Dips_-_Triceps_Version': { part: 1, incertitude: 0, identite: true },
  'Handstand_Push-Ups': { part: 1, incertitude: 0, identite: true },

  // Les pieds sont au sol : une part passe dedans. La littérature ne converge pas.
  Pushups: { part: 0.65, incertitude: 0.1, identite: false },
};

/** @returns {{part, incertitude, identite}|null} `null` = aucune part sourcée → hors tonnage. */
export const partDuCorps = (exoId) => PART_DU_CORPS[exoId] ?? null;

/**
 * 🔴 CE QU'UNE SÉRIE A RÉELLEMENT FAIT SOULEVER — en kg, ou `null` si ce n'est pas chiffrable.
 *
 * @param {object} bloc
 * @param {object} serie          `{ charge_kg, reps }` — `charge_kg` = le LEST au poids du corps
 * @param {number|null} poidsCorpsKg  le poids **FIGÉ AU MOMENT DE LA SÉANCE** (jamais celui d'aujourd'hui)
 * @returns {number|null}
 */
export function chargeSoulevee(bloc, serie, poidsCorpsKg) {
  if (!estAuPoidsDuCorps(bloc)) return serie.charge_kg ?? 0; // charge externe : elle EST la charge
  if (bloc.isometrique) return null;                          // d = 0 : pas de travail mécanique
  const p = partDuCorps(bloc.exo_id);
  if (!p || poidsCorpsKg == null) return null;                // part non sourcée, ou poids inconnu
  // Le lest s'ajoute naturellement : charge = poids_de_corps × part + lest.
  return poidsCorpsKg * p.part + (serie.charge_kg ?? 0);
}

/**
 * 🔴 CE BLOC SE SOULÈVE-T-IL AU POIDS DU CORPS ?
 *
 * Le concept existait déjà (`SANS_CHARGE_EXTERNE`, ci-dessus) — **et l'écran l'ignorait.**
 * Résultat, observé sur une séance Pull réelle (2026-07-12) :
 *
 *     ✓ Tractions   — 3 séries ·   0 kg
 *
 * Trois séries de tractions à ~84 kg de corps, écrites **ZÉRO** dans le carnet. Et le
 * chiffre-titre de la séance avalait ~2 000 kg en silence. La prochaine fois, « PRÉCÉDENT »
 * aurait dit « 0 kg × 8 » — et la progression sur les tractions n'aurait **jamais** bougé.
 *
 * **La faute n'était PAS la valeur `0`. C'était le MOT.** `charge_kg = 0` sur une traction
 * est exact : il n'y a **aucun lest**. Ce qui était faux, c'est de l'afficher sous une
 * colonne qui s'appelle « CHARGE ». `0` ne répond pas à « quelle charge ? », il répond à
 * « quel lest ? ». Le carnet ne dit plus « 0 kg » — il dit **« poids du corps »**.
 *
 * ⚠️ Conséquence directe : **on ne touche PAS au schéma.** `charge_kg` reste le lest, la
 * base ne bouge pas, et le moteur (double progression) continue de lire un chiffre juste —
 * il prescrira « + 2,5 kg » de lest le jour où le haut de la fourchette de reps est tenu.
 */
export const estAuPoidsDuCorps = (bloc) => bloc?.charge_externe === false;

/**
 * Ce que vaut le prochain cran du stepper, sur la grille RÉELLE de sa salle.
 *
 *   • charge inconnue (`null`) → **le plancher** : le premier cran atterrit sur
 *     la plus petite charge réellement chargeable (20 kg à la barre) ;
 *   • charge hors grille (tapée au clavier : 23 kg) → le cran la **réaligne**
 *     (22,5 ou 25), il ne la décale pas de 2,5 en gardant la faute.
 *
 * @returns {number} toujours ≥ plancher, toujours sur la grille.
 */
export function chargeSuivante(bloc, charge, sens) {
  const pas = bloc.pas_kg;
  const sol = bloc.plancher_kg ?? 0;
  if (charge == null) return sol;
  const k = (charge - sol) / pas;
  const cran = sens > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1;
  return Math.max(sol, Math.round((sol + cran * pas) * 100) / 100);
}

// ══════════════════════════════════════════════════════════════════════
// Lecture des prescriptions du moteur (« 2–3 min », « 8–12 »)
// ══════════════════════════════════════════════════════════════════════

/** Repos par défaut quand la prescription est illisible (« — » sur un iso). */
export const REPOS_DEFAUT_S = 120;

/**
 * « 2–3 min » → 120 s. On prend la **borne BASSE** : c'est un repos MINIMUM,
 * et le chrono est de toute façon ajustable à la volée (±15 s). Prendre la
 * borne haute allongerait toutes les séances de quelqu'un qui ne l'a pas
 * demandé.
 */
export function reposEnSecondes(repos) {
  const t = String(repos ?? '');
  const m = t.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return REPOS_DEFAUT_S;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return REPOS_DEFAUT_S;
  return /\bs\b|seconde/i.test(t) ? Math.round(n) : Math.round(n * 60);
}

/**
 * « 8–12 » → 8. La borne basse encore : elle amorce le compteur de reps, et
 * l'utilisateur le monte d'un tap.
 *
 * ⚠️ Sur une prescription d'isométrie (« 30–60 s »), ce nombre est une DURÉE,
 * pas un compte de répétitions. Le moteur ne distingue pas les deux dans son
 * champ `reps` ; l'app ne va pas inventer la distinction — elle amorce, et
 * c'est l'utilisateur qui corrige. Aucun chiffre n'est écrit en base sans son
 * geste.
 */
export function repsCible(reps) {
  const m = String(reps ?? '').match(/(\d+)/);
  const n = m ? Number(m[1]) : 8;
  return Number.isFinite(n) && n > 0 ? n : 8;
}

// ══════════════════════════════════════════════════════════════════════
// Le RPE de séance — la donnée pivot
// ══════════════════════════════════════════════════════════════════════

/** Échelle de Foster (CR-10). Identique en muscu et en course : c'est le point. */
export const RPE_FOSTER = { min: 0, max: 10 };

/**
 * Bornes du RIR déclaré à la validation d'une série.
 *
 * 🔴 **L'APP NE POUVAIT PAS ENREGISTRER L'EFFORT QU'ELLE DEMANDAIT** (2026-07-12).
 * Le pavé de validation était écrit **en dur dans le HTML** : quatre boutons, 0 · 1 · 2 · 3.
 * Or le moteur prescrit jusqu'à **RIR 3–4** (plancher 3 sur une charge non mesurée ou une
 * isolation bras ; `RIR_DEBUTANT` monte à « 2–4 »). **Le haut de sa propre fourchette cible
 * n'était pas saisissable.** Un pavé qui ne sait pas recevoir ce que le moteur prescrit force
 * l'utilisateur à déclarer un RIR FAUX — sur la donnée qui pilote la double progression.
 *
 * La contrainte est ici, et nulle part ailleurs : `verifierSerie()` accepte `0..RIR_MAX`.
 * **Le pavé est désormais DÉRIVÉ de cette constante** (`RIR_CHOIX`), il n'est plus recopié.
 * Un test vérifie qu'aucun RIR prescriptible par le moteur ne sort de cette fourchette.
 */
export const RIR_MAX = 5;

/**
 * Les taps offerts par le pavé — **la liste des valeurs que le moteur sait recevoir**.
 * Une seule source : `RIR_MAX`. L'app ne recopie plus un chiffre, elle le dérive.
 */
export const RIR_CHOIX = Array.from({ length: RIR_MAX + 1 }, (_, i) => i);

/**
 * Le HAUT de la fourchette prescrite (« 3–6 @ RIR 3–4 » → 4). `null` sur une prescription
 * non numérique (isométrie : « — »). Sert à prouver, par un test, que le pavé sait recevoir
 * ce que le moteur demande — au lieu de l'espérer.
 */
export function rirMaxPrescrit(rir) {
  const m = String(rir ?? '').match(/^(\d+)\s*[–-]\s*(\d+)$/);
  return m ? Number(m[2]) : null;
}

export function validerRPE(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < RPE_FOSTER.min || n > RPE_FOSTER.max) {
    throw new Error(`RPE de séance invalide (« ${v} ») : attendu un entier de ${RPE_FOSTER.min} à ${RPE_FOSTER.max} (échelle de Foster).`);
  }
  return n;
}

// ══════════════════════════════════════════════════════════════════════
// Dates
// ══════════════════════════════════════════════════════════════════════

/**
 * « AAAA-MM-JJ » en heure LOCALE. `toISOString()` serait un bug : une séance
 * finie à 21 h le 12 serait datée du 13 dans la moitié du monde — et le
 * moteur compte les séances **par jour**.
 */
export function dateLocale(instant = Date.now()) {
  const d = new Date(instant);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ══════════════════════════════════════════════════════════════════════
// Créer une séance à partir du programme
// ══════════════════════════════════════════════════════════════════════

/**
 * @param {object}  programme  sortie de `genererProgrammeMuscu` (moteur)
 * @param {number}  jour       index dans `programme.seances`
 * @param {number}  debut      instant de départ (ms epoch) — passé, jamais lu ici
 * @returns l'état de séance : un objet JSON pur, donc **persistable tel quel**
 *          (c'est ce qui permet de survivre à un kill de l'app par iOS).
 */
/**
 * Un exercice DU MOTEUR → un bloc de séance. La seule traduction, et il n'y en a qu'une :
 * `creerSeance` l'appelle pour le programme du jour, `ajouterExercice`/`remplacerExercice` pour
 * un exercice CHOISI (`src/lib/libre.js`). Deux traductions divergeraient — et l'exercice libre
 * hériterait de la mauvaise, celle que les tests ne couvrent pas.
 */
export function blocDepuisExercice(e) {
  return {
    nom: e.nom,
    exo_id: e.id ?? null,
    equipement: e.equipement ?? null,
    // Le dataset le DÉCLARE (`force: "static"`). Un isométrique n'a pas de tonnage : `d = 0`.
    isometrique: Boolean(e.isometrique),
    pas_kg: pasDeCharge(e.equipement),
    plancher_kg: plancherDeCharge(e.equipement),
    // 🔴 La ligne qui sépare « 0 kg » de « je ne sais pas ». Voir plus bas :
    // `brouillon()` en dépend, et le carnet aussi.
    charge_externe: porteUneChargeExterne(e.equipement, e.id ?? null),
    series_prevues: e.series,
    reps_cible: e.reps,
    rir_cible: e.rir,
    repos_s: reposEnSecondes(e.repos),
    // La charge du moteur : point de DÉPART, marqué pour ce qu'il est.
    // `null` = le moteur ne sait pas. Ce n'est PAS zéro, et ça ne le deviendra
    // jamais en chemin : l'écran laisse le champ vide et appelle la saisie.
    charge_depart_kg: e.charge_depart_kg ?? null,
    // 🔁 LA PRESCRIPTION — dernière charge RÉELLE + le pas de la double progression
    // (`adaptation.js appliquerAdaptationMuscu`). C'est ce que l'écran affiche en
    // « Prévu », et c'est ce qui amorce le champ. Sans journal, elle vaut `null` :
    // le moteur n'a encore rien observé, il ne prescrit pas d'incrément.
    charge_prevue_kg: e.charge_prevue_kg ?? null,
    reps_prevues: e.reps_prevues ?? null,
    progression: e.progression ?? null,
    charge_estimee: Boolean(e.charge_a_confirmer),
    charge_max_kg: e.plafond_charge ? (e.charge_max_kg ?? null) : null,
    consigne: e.consigne ?? null,
    substitue_depuis: e.substitue_depuis ?? null,
    // 🔴 LE REPÈRE — le chiffre qu'IL a déclaré, sur le mouvement d'ORIGINE.
    // Quand le moteur substitue (couché barre → Smith, à cause de l'épaule), la charge
    // déclarée ne suit PAS : une charge guidée n'est pas une charge libre, et aucune
    // conversion n'est sourçable. Elle n'est pas transposée — mais elle n'est plus
    // JETÉE non plus. « Tu déclares 80 kg × 8 à la barre libre » est vrai, et c'est un
    // point d'ancrage. Le champ reste vide, l'état `inconnue` reste : c'est un repère,
    // pas une prescription. Vient du moteur (`muscu.js`), jamais de l'app.
    repere_charge: e.repere_charge ?? null,
    // 🔴 Il l'a CHOISI, le moteur ne l'a pas prescrit. Le carnet doit pouvoir le dire — sinon,
    // relu dans six mois, un exercice libre serait indiscernable d'une prescription.
    libre: Boolean(e.libre),
    faites: [],
    passe: false,
  };
}

export function creerSeance({ programme, jour = 0, debut = Date.now(), poids_corps_kg = null }) {
  const s = programme?.seances?.[jour];
  if (!s) throw new Error(`Le programme n'a pas de séance n°${jour + 1}.`);

  const blocs = s.exercices.map(blocDepuisExercice);

  return {
    version: 1,
    seance: s.nom,
    jour,
    debut,
    date: dateLocale(debut),
    // 🔴 LE POIDS DE CORPS, FIGÉ ICI — au moment où la séance commence.
    //
    // Le tonnage d'une traction en dépend directement. Or **le poids de corps change** : le
    // lire dans le persona au moment de l'affichage ferait qu'une séance de mars, relue en
    // juin, n'afficherait plus le même tonnage. **Ce serait réécrire l'histoire** — et en
    // silence : le carnet raconterait une progression qui n'a pas eu lieu (ou en effacerait
    // une qui a eu lieu).
    //
    // Il est donc capturé au départ, persisté avec la séance, et l'enregistrement gèle en
    // plus son `tonnage_kg`. Une séance passée ne se recalcule **jamais**.
    // `null` = poids inconnu (persona sans poids, ou séance d'avant ce correctif) : le corps
    // n'est alors PAS compté, et l'écran le déclare. On n'invente pas un poids.
    poids_corps_kg: poids_corps_kg ?? null,
    blocs,
    ordre: blocs.map((_, i) => i),
    position: 0,
    echauffement: null,
    rpe_seance: null,
    fin: null,
    // Instant où le chrono de repos a été armé. Il vit DANS l'état (donc en base) :
    // si iOS tue l'app pendant un repos, le repos réellement écoulé reste juste au
    // retour. Un compteur en mémoire, lui, serait perdu — contrainte n°4.
    repos_arme_a: null,
  };
}

// ── Lectures ──────────────────────────────────────────────────────────

export const indexCourant = (etat) => etat.ordre[etat.position] ?? null;

export function blocCourant(etat) {
  const i = indexCourant(etat);
  return i == null ? null : etat.blocs[i];
}

export const seanceFinie = (etat) => etat.position >= etat.ordre.length;

/** Les séries qui RESTENT sur un bloc (jamais négatif : on peut en faire plus que prévu). */
const restantes = (b) => Math.max(0, b.series_prevues - b.faites.length);

/**
 * La progression se compte en **SÉRIES**, pas en exercices : c'est l'unité du
 * geste. 3 exercices sur 5 ne dit rien ; 11 séries sur 17, si.
 */
export function progression(etat) {
  let faites = 0;
  let total = 0;
  for (const b of etat.blocs) {
    // ⚠️ Un bloc RETIRÉ est sorti de `ordre`, mais il reste dans `blocs` : les index de `ordre`
    // pointent dessus, et les décaler corromprait la séance en cours. Il ne compte pas — et il
    // ne peut RIEN faire perdre : on ne retire que ce qui n'a AUCUNE série (`retirerExercice`).
    if (b.retire) continue;
    faites += b.faites.length;
    total += b.passe ? b.faites.length : Math.max(b.series_prevues, b.faites.length);
  }
  return { faites, total, pct: total ? (faites / total) * 100 : 0 };
}

/**
 * Σ charge × reps — **poids du corps COMPRIS** (voir `chargeSoulevee` et `PART_DU_CORPS`).
 *
 * 🔴 **Le tonnage n'est PAS une mesure.** C'est un agrégat : il additionne des kilos qui
 * n'ont pas été soulevés au même moment ni de la même façon. Il ne se compare **jamais**
 * entre deux exercices, ni entre deux personnes. Son seul usage honnête : **soi, dans le
 * temps.** Le « ? » du bilan le dit à l'écran.
 *
 * ⚠️ `poidsCorpsKg` doit être celui **FIGÉ AU MOMENT DE LA SÉANCE** (`etat.poids_corps_kg`).
 * Le poids de corps change ; recalculer un tonnage passé avec le poids d'aujourd'hui
 * **réécrirait l'histoire**. Les séances enregistrées portent donc leur propre poids, et
 * leur `tonnage_kg` est **gelé dans l'enregistrement** : on ne le recalcule jamais.
 */
export function tonnage(blocOuEtat, poidsCorpsKg = undefined) {
  if (Array.isArray(blocOuEtat?.blocs)) {
    const poids = poidsCorpsKg === undefined ? (blocOuEtat.poids_corps_kg ?? null) : poidsCorpsKg;
    return blocOuEtat.blocs.reduce((t, b) => t + tonnage(b, poids), 0);
  }
  const bloc = blocOuEtat;
  const poids = poidsCorpsKg ?? null;
  return (bloc?.faites ?? []).reduce((t, s) => {
    const kg = chargeSoulevee(bloc, s, poids);
    return kg == null ? t : t + kg * s.reps; // non chiffrable → on n'invente pas, on saute
  }, 0);
}

/**
 * 🔴 DE QUOI CE TONNAGE EST FAIT — pour que l'écran puisse le DÉCLARER, pas le déverser.
 *
 * Trois conditions rendent le comptage du poids du corps honnête, et elles sont non
 * négociables : le kg dérivé du corps est **marqué** à l'écran, le tonnage **n'est pas une
 * mesure**, et il **ne se compare jamais**. Cette fonction fournit de quoi tenir la première.
 *
 * `niveau` suit la taxonomie de `valeurs.js` — on ne s'en invente pas une deuxième :
 *   • `der` (DÉRIVÉ)  toutes les parts sont des **identités physiques** (1,00) → exact.
 *   • `est` (ESTIMÉ)  au moins une part est incertaine (la pompe) → « ~ », arrondi grossier,
 *                     « Pourquoi ? » obligatoire. **Un estimé contamine la somme** : une
 *                     addition qui contient une estimation EST une estimation.
 */
export function detailTonnage(etat) {
  const poids = etat?.poids_corps_kg ?? null;
  let externe = 0;
  let corps = 0;
  let incertitude = 0;
  let incertain = false;
  const exclus = [];

  for (const b of etat?.blocs ?? []) {
    if (!b.faites?.length) continue;
    const reps = b.faites.reduce((n, s) => n + s.reps, 0);

    if (!estAuPoidsDuCorps(b)) {
      externe += b.faites.reduce((t, s) => t + (s.charge_kg ?? 0) * s.reps, 0);
      continue;
    }
    // Le lest accroché à une traction est une charge externe : il compte, quoi qu'il arrive.
    const lest = b.faites.reduce((t, s) => t + (s.charge_kg ?? 0) * s.reps, 0);

    if (b.isometrique) {
      exclus.push({ nom: b.nom, raison: 'isometrique', series: b.faites.length, reps });
      continue; // d = 0 : aucun tonnage, et le lest d'un gainage n'en fait pas un non plus
    }
    const p = partDuCorps(b.exo_id);
    if (!p || poids == null) {
      exclus.push({ nom: b.nom, raison: poids == null ? 'poids_inconnu' : 'part_non_sourcee', series: b.faites.length, reps });
      continue;
    }
    externe += lest;
    corps += poids * p.part * reps;
    if (p.incertitude > 0) {
      incertain = true;
      incertitude += poids * p.incertitude * reps;
    }
  }

  return {
    kg: externe + corps,
    externe_kg: externe,
    corps_kg: corps,
    incertitude_kg: incertitude,
    niveau: incertain ? 'est' : 'der',
    poids_corps_kg: poids,
    exclus,
  };
}

/**
 * Le travail que le tonnage **ne compte pas** — et il n'en reste presque plus.
 * Il existe pour qu'on ne puisse pas l'oublier : le bilan l'affiche à côté du tonnage,
 * avec sa RAISON (isométrie → `d = 0` ; ou part du corps non sourcée).
 */
export function seriesAuPoidsDuCorps(etat) {
  let series = 0;
  let reps = 0;
  for (const ex of detailTonnage(etat).exclus) {
    series += ex.series;
    reps += ex.reps;
  }
  return { series, reps };
}

/**
 * 🔴 CE QU'UN EXERCICE FINI A RÉELLEMENT VU — la CHARGE, pas le tonnage.
 *
 * L'autre chiffre qui mentait sans bruit (2026-07-12) : le récap affichait
 * « Développé couché — 3 séries · **720 kg** ». Ce n'est **pas** la charge, c'est le
 * tonnage — et la preuve, à l'écran : **deux exercices à 60 et 40 kg affichaient tous
 * deux 720**. Collé au nom de l'exercice, en chasse fixe, exactement là où un pratiquant
 * lit sa charge de travail, « 720 kg » est **assez plausible pour être cru**.
 *
 * Le tonnage n'est pas supprimé — il est **utile, et vrai**. Il passe derrière le tap
 * (la feuille de l'exercice), et la ligne du récap rend enfin **ce qu'il a soulevé**.
 */
export function resumeBloc(bloc, poidsCorpsKg = null) {
  const faites = bloc?.faites ?? [];
  const charges = faites.map((s) => s.charge_kg);
  return {
    series: faites.length,
    au_poids_du_corps: estAuPoidsDuCorps(bloc),
    charge_basse_kg: charges.length ? Math.min(...charges) : null,
    charge_haute_kg: charges.length ? Math.max(...charges) : null,
    // Le tonnage de CE bloc, poids du corps compris quand il est chiffrable (`chargeSoulevee`).
    // Il reste derrière le tap : collé au nom de l'exercice, un tonnage se lit comme une charge.
    tonnage_externe_kg: Math.round(tonnage(bloc, poidsCorpsKg)),
  };
}

/**
 * ESTIMÉ, et assumé : ~45 s sous la barre + le repos prescrit, par série
 * restante. On ne sait pas combien de temps il va **réellement** se reposer.
 * Arrondi grossier à 5 min par l'affichage (valeurs.js) — pas de fausse
 * précision sur une estimation.
 */
export function minutesRestantes(etat) {
  let s = 0;
  for (let k = etat.position; k < etat.ordre.length; k++) {
    const b = etat.blocs[etat.ordre[k]];
    if (!b.passe) s += restantes(b) * (45 + b.repos_s);
  }
  return s / 60;
}

/**
 * La **dernière fois** sur cet exercice : les séries ET le jour.
 * C'est la première chose que cette app peut enfin répondre : elle se
 * souvient. Avant, la colonne « précédent » n'existait pas, faute de données.
 *
 * @param {object[]} historique  séances enregistrées (les plus récentes en dernier)
 * @returns {{series: object[], date: string|null}|null}
 */
export function derniereFoisDe(historique, nom) {
  for (let i = (historique?.length ?? 0) - 1; i >= 0; i--) {
    const ex = (historique[i].exercices ?? []).find((e) => e.nom === nom);
    if (ex?.series?.length) return { series: ex.series, date: historique[i].date ?? null };
  }
  return null;
}

/** Les seules séries de la dernière fois (l'écran de séance en a besoin ligne à ligne). */
export const precedentesDe = (historique, nom) => derniereFoisDe(historique, nom)?.series ?? [];

/**
 * 🔴 LE VERDICT DE FIN DE SÉANCE — il avait DEUX issues, il lui en fallait QUATRE.
 *
 * ── Ce que l'écran écrivait, et qui était faux ───────────────────────────────────────────
 * La ligne « Progression de charge » vivait dans `ecran-seance.js`, en six lignes, et elle ne
 * retenait qu'une comparaison : `now > then`. **Structurellement incapable de dire « en
 * baisse ».** Son repli, lui, testait `historique.length` — « existe-t-il une séance passée ? »
 * — jamais « **ces exercices** ont-ils un passé ? ».
 *
 * Deux mensonges, tous deux observés à l'écran le 2026-07-12 :
 *
 *   1. **Une Push reloguée en divisant TOUTES les charges par deux** (3 100 → 1 780 kg) :
 *      l'app écrivait « **mesuré, vs la dernière fois · charges tenues** ». Il n'a rien tenu.
 *      Et la baisse était écrite 15 px au-dessus, honnêtement, ligne par exercice : **l'app
 *      avait la donnée, et la ligne de verdict disait le contraire.**
 *
 *   2. **Une Pull juste après une Push** — zéro exercice en commun, **rien à comparer** :
 *      « mesuré, vs la dernière fois · charges tenues ». En Push/Pull/Legs six jours sur
 *      sept, ça arrive à la **DEUXIÈME séance**.
 *
 * ── Pourquoi c'est ICI et plus dans l'écran ──────────────────────────────────────────────
 * Un verdict est une DÉCISION. Elle se teste sans DOM, elle ne se relit pas dans un `append()`.
 * L'écran, lui, ne fait plus que **rendre** ce que cette fonction a **décidé**.
 *
 * ── `mesure` n'est pas décoratif : c'est le garde-fou ────────────────────────────────────
 * La taxonomie `valeurs.js` (**mesuré · dérivé · estimé**) gouverne tous les chiffres de
 * l'app. **Un verdict sans comparaison n'est aucun des trois : il n'existe pas.** Le champ
 * `mesure` porte cette vérité en DONNÉE — l'écran ne peut donc pas estampiller « mesuré »
 * un verdict qui ne repose sur rien, même par distraction. C'est exactement ce qu'`avis.js`
 * a fait pour les avis : **on sépare la donnée du texte.**
 *
 * ⚠️ **Un fait, pas un jugement.** « Si l'utilisateur baisse sa charge, son historique doit
 * refléter la réalité — **sans afficher un message compliqué ou culpabilisant**. » `−10 kg ·
 * Développé couché` suffit. Ni « attention », ni « tu as régressé ».
 *
 * ⚠️ **Une hausse et une baisse peuvent coexister** — et c'est même le cas ORDINAIRE (le
 * développé monte, les élévations fatiguent). N'en montrer qu'une serait retomber dans la
 * faute qu'on répare : cacher une baisse derrière une hausse. Les deux sont rendues.
 *
 * @param {object}   etat        la séance en cours
 * @param {object[]} historique  les séances DÉJÀ enregistrées (celle-ci n'y est pas encore)
 * @returns {{
 *   statut: 'premiere_seance'|'sans_reference'|'hausse'|'baisse'|'mixte'|'tenues',
 *   mesure: boolean,
 *   compares: number,
 *   hausse: {nom: string, delta_kg: number}|null,
 *   baisse: {nom: string, delta_kg: number}|null,
 * }}  `delta_kg` est SIGNÉ : positif en hausse, négatif en baisse.
 */
export function progressionDeCharge(etat, historique = []) {
  let hausse = null;
  let baisse = null;
  let compares = 0;

  for (const b of etat?.blocs ?? []) {
    if (!b.faites?.length) continue;
    const avant = precedentesDe(historique, b.nom);
    // 🔴 LA QUESTION JUSTE : « CET exercice a-t-il un passé ? » — pas « y a-t-il un passé ? ».
    if (!avant.length) continue;
    compares++;

    // La charge la plus lourde tenue sur l'exercice, hier et aujourd'hui. Sur un mouvement au
    // poids du corps, `charge_kg` est le LEST : on compare des lests entre eux, ce qui reste
    // homogène. (Le poids du corps, lui, ne se compare pas ainsi — il change pour d'autres
    // raisons que l'entraînement, et il est gelé par séance.)
    const maintenant = Math.max(...b.faites.map((s) => s.charge_kg ?? 0));
    const alors = Math.max(...avant.map((s) => s.charge_kg ?? 0));
    const delta = Math.round((maintenant - alors) * 100) / 100;

    if (delta > 0 && (!hausse || delta > hausse.delta_kg)) hausse = { nom: b.nom, delta_kg: delta };
    if (delta < 0 && (!baisse || delta < baisse.delta_kg)) baisse = { nom: b.nom, delta_kg: delta };
  }

  // Rien à comparer. Ce n'est PAS « il a tenu ses charges » — c'est « on ne sait pas ».
  // Deux causes distinctes, deux phrases : aucune séance du tout ≠ aucun de CES exercices.
  if (!compares) {
    return {
      statut: historique?.length ? 'sans_reference' : 'premiere_seance',
      mesure: false, // 🔴 rien n'a été mesuré. Le dire en donnée, pas seulement en mot.
      compares: 0,
      hausse: null,
      baisse: null,
    };
  }

  const statut = hausse && baisse ? 'mixte' : hausse ? 'hausse' : baisse ? 'baisse' : 'tenues';
  return { statut, mesure: true, compares, hausse, baisse };
}

/**
 * « il y a 4 jours » — l'ÉCART, pas une date à décoder. Sans narration : trois mots.
 * @param {string} date  « AAAA-MM-JJ » (la date de séance, locale)
 */
export function ilYA(date, maintenant = Date.now()) {
  if (!date) return null;
  const alors = new Date(`${date}T12:00:00`);
  if (Number.isNaN(alors.getTime())) return null;
  const aujourdhui = new Date(dateLocale(maintenant) + 'T12:00:00');
  const jours = Math.round((aujourdhui - alors) / 86400000);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return 'hier';
  if (jours < 7) return `il y a ${jours} jours`;
  const semaines = Math.floor(jours / 7);
  return semaines === 1 ? 'il y a 1 semaine' : `il y a ${semaines} semaines`;
}

/**
 * La valeur qui AMORCE les champs charge/reps de la série à venir.
 *
 * Ordre de préférence — de l'observation vers la supposition :
 *   1. la série précédente **de cette séance** (ce qu'il vient de faire) ;
 *   2. 🔁 la **PRESCRIPTION** (`charge_prevue_kg`) — la dernière charge réelle **plus le
 *      pas de la double progression**. Elle passe DEVANT « la dernière fois », et c'est
 *      tout l'objet du correctif : amorcer sur la charge d'hier, c'est re-loguer la
 *      charge d'hier, c'est ne jamais progresser. Elle DÉRIVE de la dernière fois — elle
 *      ne l'ignore pas, elle l'incrémente.
 *   3. la même série **la dernière fois** (pas de prescription : exercice hors décision) ;
 *   4. la dernière série connue la dernière fois ;
 *   5. la charge de départ du moteur (ESTIMÉE — l'app l'affiche comme telle) ;
 *   6. rien. Et là, **deux cas qu'il ne faut surtout pas confondre** :
 *        • exercice **sans charge externe** (traction, gainage) → **lest 0**, et
 *          c'est la VÉRITÉ : il n'y a pas de disque accroché. Le geste reste à **un tap**
 *          (une traction non lestée est le cas normal) — mais l'écran n'écrit **jamais**
 *          « 0 kg » : il écrit **« poids du corps »** (valeurs.js, `lestKg`) ;
 *        • exercice **chargé** (barre, machine, poulie, haltère) → **`null`**.
 *          Le moteur n'a rien dit. **L'app n'invente pas un chiffre.**
 *
 * 🔴 C'est ICI que le bug vivait. `null` devenait `0`, l'écran écrivait « 0 kg »,
 * le carnet enregistrait « 3 séries · 0 kg », et **ce 0 devenait la référence de
 * la séance suivante** : la progression serait repartie de zéro. Un faux chiffre
 * MIGRE — c'est exactement la règle du projet, prise en flagrant délit.
 *
 * ⚠️ Le RIR n'est PAS ici, et il ne le sera jamais.
 */
export function brouillon(etat, precedentes = []) {
  const b = blocCourant(etat);
  if (!b) return { charge_kg: null, reps: 0 };
  const i = b.faites.length;
  const src =
    b.faites[i - 1] ??
    prescriptionDe(b) ??
    precedentes[i] ??
    precedentes[precedentes.length - 1] ??
    (b.charge_depart_kg != null ? { charge_kg: b.charge_depart_kg, reps: repsCible(b.reps_cible) } : null) ??
    { charge_kg: b.charge_externe ? null : 0, reps: repsCible(b.reps_cible) };
  return { charge_kg: src.charge_kg ?? null, reps: src.reps };
}

/**
 * La PRESCRIPTION ADAPTÉE : la dernière charge réelle **plus** le pas de la double
 * progression (`adaptation.js`). `null` tant que le moteur n'a rien observé.
 *
 * C'est elle — et elle seule — qui a le droit de passer devant « la dernière fois »
 * pour amorcer le champ : elle DÉRIVE de la dernière fois, elle l'incrémente.
 */
export function prescriptionDe(bloc) {
  if (!bloc || bloc.charge_prevue_kg == null) return null;
  return {
    charge_kg: bloc.charge_prevue_kg,
    reps: bloc.reps_prevues ?? repsCible(bloc.reps_cible),
  };
}

/**
 * La ligne « PRÉVU » de l'écran : ce que le moteur prévoit pour AUJOURD'HUI.
 *
 * Deux sources, dans cet ordre — et elles ne valent pas la même chose :
 *   • la **prescription adaptée** (il a logué : le moteur a lu, et il incrémente) ;
 *   • à défaut, la **charge de départ** du persona (déclarée, parfois ESTIMÉE — et
 *     dans ce cas l'écran l'arrondit à 5 kg et lui refuse l'accent : on n'affiche pas
 *     « 82,5 kg » quand on ne sait qu'à 5 kg près).
 *
 * `null` = le moteur ne prévoit rien. L'écran écrit « — » et n'ajoute pas un mot.
 *
 * @returns {{charge_kg: number, reps: number, estimee: boolean}|null}
 */
export function prevuDe(bloc) {
  if (!bloc) return null;
  const adapte = bloc.charge_prevue_kg != null;
  const charge = adapte ? bloc.charge_prevue_kg : bloc.charge_depart_kg;
  if (charge == null) return null;
  return {
    charge_kg: charge,
    reps: (adapte ? bloc.reps_prevues : null) ?? repsCible(bloc.reps_cible),
    // Une charge dérivée d'un réel soulevé n'est plus une estimation.
    estimee: !adapte && Boolean(bloc.charge_estimee),
  };
}

/**
 * Le moteur a-t-il quelque chose à dire sur la charge de CE bloc, maintenant ?
 * Trois états, trois phrases — et **jamais la même**, parce qu'elles ne disent
 * pas la même chose :
 *
 *   'mesuree'  il a déjà soulevé (ici ou la dernière fois) → aucune note.
 *   'estimee'  le moteur a estimé (squat, 90 kg) → « estimée, pas mesurée ».
 *              **C'est VRAI. Cette phrase reste.**
 *   'inconnue' le moteur n'a RIEN estimé → il ignore. Le dire, et appeler la
 *              saisie. **Ne pas supprimer une vérité : supprimer une invention.**
 */
export function etatCharge(bloc, precedente = null) {
  if (!bloc) return 'mesuree';
  if (bloc.faites.length || precedente) return 'mesuree';
  if (bloc.charge_depart_kg == null && bloc.charge_externe) return 'inconnue';
  return bloc.charge_estimee ? 'estimee' : 'mesuree';
}

// ══════════════════════════════════════════════════════════════════════
// LE GESTE — valider une série
// ══════════════════════════════════════════════════════════════════════

/**
 * 🔴 `null` n'est PAS zéro — et sur le RIR, cette confusion serait un poison.
 *
 * `Number(null) === 0`. Sans ce garde-fou, un RIR **non déclaré** (l'écran n'a
 * pas reçu le tap) entrerait en base comme **« RIR 0 » — c'est-à-dire ÉCHEC
 * MUSCULAIRE**. Le moteur lirait une série menée à l'échec là où l'utilisateur
 * n'a rien dit, et il en tirerait un RPE imputé faux (charge.js `estimerRPE`),
 * sur la donnée qui porte toute la charge unifiée.
 * « Je ne sais pas » et « zéro » sont deux affirmations différentes — le
 * journal du moteur pose exactement la même règle sur le D− (journal.js).
 */
function exiger(v, champ) {
  if (v == null || v === '') throw new Error(`${champ} : valeur absente. « Je ne sais pas » n’est pas « zéro » — l’app n’écrit pas un chiffre que tu n’as pas donné.`);
  return Number(v);
}

function verifierSerie({ charge_kg, reps, rir }) {
  const c = exiger(charge_kg, 'Charge invalide');
  if (!Number.isFinite(c) || c < 0) throw new Error(`Charge invalide (« ${charge_kg} ») : un nombre ≥ 0 est attendu.`);
  const r = exiger(reps, 'Répétitions invalides');
  if (!Number.isInteger(r) || r < 1) throw new Error(`Répétitions invalides (« ${reps} ») : au moins 1 répétition pour valider une série.`);
  const rr = exiger(rir, 'RIR invalide');
  if (!Number.isInteger(rr) || rr < 0 || rr > RIR_MAX) {
    throw new Error(`RIR invalide (« ${rir} ») : attendu un entier de 0 à ${RIR_MAX}.`);
  }
  return { charge_kg: Math.round(c * 100) / 100, reps: r, rir: rr };
}

/**
 * Un tap = la série est écrite, avec sa VRAIE charge et son VRAI RIR.
 * `repos_s` est le repos **réellement écoulé** avant cette série (mesuré par
 * l'écran, `null` s'il n'a pas été chronométré). C'est une donnée, pas un
 * décor : elle dira un jour si le repos prescrit est tenu.
 *
 * Quand le bloc a atteint ses séries prévues, on **avance** : l'utilisateur
 * n'a pas à le demander.
 *
 * 🔴 **IL RENVOIE LA SÉRIE ÉCRITE — plus l'état.** Ce n'est pas cosmétique.
 * L'écran validait la série, **re-semait le champ pour la suivante**, puis annonçait
 * (`aria-live`) ce qu'il lisait **dans le champ** : il déclarait donc la série
 * SUIVANTE. Observé : 60, 60, 60 sur le développé → « 60 », « 60 », puis **« 20 »** ;
 * et en fin d'exercice, **« Série enregistrée : —, RIR 2 »**. Il n'était juste que
 * **par coïncidence**, à l'intérieur d'un exercice.
 *
 * La confusion — « la série que je viens d'écrire » vs « la série qui est maintenant
 * dans le champ » — se corrige **ici**, à la source : le seul objet qui décrit ce qui
 * est parti en base est **celui que cette fonction rend**. On ne peut plus se tromper
 * de sujet, parce qu'il n'y en a plus qu'un.
 *
 * @returns {{charge_kg: number, reps: number, rir: number, repos_s: number|null}} la série ÉCRITE
 */
export function validerSerie(etat, { charge_kg, reps, rir, repos_s = null }) {
  const b = blocCourant(etat);
  if (!b) throw new Error('Aucun exercice en cours : la séance est terminée.');
  const serie = verifierSerie({ charge_kg, reps, rir });
  const ecrite = { ...serie, repos_s: repos_s == null ? null : Math.max(0, Math.round(repos_s)) };
  b.faites.push(ecrite);
  if (b.faites.length >= b.series_prevues) avancer(etat);
  return ecrite;
}

/**
 * Corriger une série DÉJÀ validée — une donnée fausse empoisonne le moteur.
 * @returns la série CORRIGÉE (même raison que ci-dessus : on annonce ce qu'on a écrit).
 */
export function corrigerSerie(etat, iBloc, iSerie, { charge_kg, reps, rir }) {
  const b = etat.blocs[iBloc];
  if (!b?.faites?.[iSerie]) throw new Error('Cette série n’existe pas : rien à corriger.');
  b.faites[iSerie] = { ...b.faites[iSerie], ...verifierSerie({ charge_kg, reps, rir }) };
  return b.faites[iSerie];
}

export function supprimerSerie(etat, iBloc, iSerie) {
  const b = etat.blocs[iBloc];
  if (!b?.faites?.[iSerie]) throw new Error('Cette série n’existe pas : rien à supprimer.');
  b.faites.splice(iSerie, 1);
  return etat;
}

/** Le plan n'est pas une loi : on peut en faire une de plus, ou une de moins. */
export function ajouterSerie(etat) {
  const b = blocCourant(etat);
  if (b) b.series_prevues++;
  return etat;
}

export function retirerSerie(etat) {
  const b = blocCourant(etat);
  if (!b || b.series_prevues <= b.faites.length) return etat; // on ne supprime pas une série FAITE
  b.series_prevues--;
  if (b.series_prevues <= b.faites.length) avancer(etat);
  return etat;
}

export function avancer(etat) {
  etat.position++;
  return etat;
}

/** Machine prise, douleur : on passe. Les séries déjà faites restent acquises. */
export function passerExercice(etat) {
  const b = blocCourant(etat);
  if (b) b.passe = true;
  return avancer(etat);
}

/** Remonter un exercice « à venir » à MAINTENANT (la séance ne se déroule jamais comme prévu). */
export function faireMaintenant(etat, iBloc) {
  const k = etat.ordre.indexOf(iBloc);
  if (k < 0 || k <= etat.position) return etat;
  etat.ordre.splice(k, 1);
  etat.ordre.splice(etat.position, 0, iBloc);
  etat.blocs[iBloc].passe = false;
  return etat;
}

// ══════════════════════════════════════════════════════════════════════
// 🔴 LA SÉANCE N'EST PAS UNE LOI — ajouter · remplacer · retirer
// ══════════════════════════════════════════════════════════════════════
//
//   > « Je n'ai pas l'impression que ce soit possible de choisir n'importe quel exercice que je
//   >   voudrais faire — plutôt des exercices qui sont imposés. »
//
// Le plan du jour se plie déjà à la vie : on avance un exercice, on le repousse, on le passe, on
// ajoute une série, on en retire une. **La seule chose qu'on ne pouvait pas faire, c'est CHANGER
// L'EXERCICE lui-même.** Voici les trois verbes qui manquaient.
//
// ⚠️ **`blocs` ne se réindexe JAMAIS.** `ordre` est une liste d'INDEX dans `blocs` : supprimer un
// élément de `blocs` décalerait tous les index suivants, et la séance en cours pointerait sur les
// mauvais exercices — un `TypeError` au mieux, une série écrite sur le mauvais mouvement au pire.
// Un bloc retiré sort de `ordre` et se marque `retire` ; il reste en place dans `blocs`.
//
// ⚠️ **Aucune série validée ne peut disparaître.** C'est la contrainte dure : elles sont écrites,
// elles partent au journal (`terminerSeance` ne garde que les blocs qui ont des `faites`), et
// elles pilotent la double progression. Un « remplacer » qui les jetterait serait le bug du carnet,
// rejoué. → Un exercice DÉJÀ COMMENCÉ n'est pas retiré : il est **PASSÉ** (gardé, compté, journalisé),
// et le remplaçant prend la place suivante.

/** L'exercice choisi entre dans la séance, en dernier. @returns {number} l'index de son bloc. */
export function ajouterExercice(etat, exercice) {
  const i = etat.blocs.push(blocDepuisExercice(exercice)) - 1;
  etat.ordre.push(i);
  return i;
}

/**
 * Le rack est pris, ça tire quelque part, il en a envie d'un autre : **on change l'exercice.**
 *
 * @returns {number} l'index du bloc REMPLAÇANT.
 */
export function remplacerExercice(etat, iBloc, exercice) {
  const k = etat.ordre.indexOf(iBloc);
  const ancien = etat.blocs[iBloc];
  if (!ancien || k < 0) throw new Error("Cet exercice n'est plus dans la séance : il n'y a rien à remplacer.");

  const j = etat.blocs.push(blocDepuisExercice(exercice)) - 1;

  if (ancien.faites.length) {
    // 🔴 SES SÉRIES SONT ÉCRITES — elles ne disparaissent pas. L'ancien devient un exercice
    // PASSÉ : il reste dans l'ordre, il reste visible dans « ce qui est fait », et il part au
    // journal avec ce qu'il a produit. Le remplaçant prend la place JUSTE APRÈS.
    ancien.passe = true;
    etat.ordre.splice(k + 1, 0, j);
    // On était dessus : on le quitte, donc le remplaçant devient l'exercice courant.
    if (k === etat.position) etat.position++;
  } else {
    // Rien de logué : ce bloc n'a jamais rien produit. Il sort de l'ordre, le remplaçant prend
    // sa place EXACTE — même rang dans la séance, même moment.
    ancien.retire = true;
    etat.ordre.splice(k, 1, j);
  }
  return j;
}

/**
 * Retirer un exercice du jour.
 *
 * 🔴 **Il REFUSE de retirer un exercice qui a des séries.** Ce n'est pas une timidité : ces séries
 * sont une donnée irremplaçable (elles pilotent la charge suivante, elles portent la jauge sRPE).
 * Le geste qui existe pour ça s'appelle **« Passer »** — il garde tout et il le dit.
 */
export function retirerExercice(etat, iBloc) {
  const k = etat.ordre.indexOf(iBloc);
  const b = etat.blocs[iBloc];
  if (!b || k < 0) throw new Error("Cet exercice n'est plus dans la séance : il n'y a rien à retirer.");
  if (b.faites.length) {
    throw new Error(
      `« ${b.nom} » : ${b.faites.length} série${b.faites.length > 1 ? 's sont enregistrées' : ' est enregistrée'}. ` +
        `Elles ne peuvent pas disparaître — passe l'exercice, elles seront gardées et comptées.`,
    );
  }
  b.retire = true;
  etat.ordre.splice(k, 1);
  // L'exercice retiré était AVANT la position : tout ce qui suit remonte d'un cran.
  if (k < etat.position) etat.position--;
  return etat;
}

// ══════════════════════════════════════════════════════════════════════
// Terminer — PUIS, séparément, le RPE
// ══════════════════════════════════════════════════════════════════════
//
// 🔴 L'ORDRE DE CES DEUX FONCTIONS EST LE PRODUIT.
//
// `terminerSeance()` rend une séance COMPLÈTE avec `rpe_seance: null`. Elle ne
// dépend d'AUCUNE note : la séance est le produit, la note est une annotation.
// `noterSeance()` vient après, sur un enregistrement DÉJÀ écrit — et il peut ne
// jamais venir. Un trou de RPE se voit (`journal.donneesManquantes()`) ; une
// séance perdue, non.
//
// L'app avait inversé la dépendance : l'écriture en base était le corps de la
// fonction qui recevait le RPE. Une note facultative gardait la séance en otage.

/**
 * L'enregistrement qui part dans IndexedDB (`STORES.seances`).
 *
 * Il garde la **fidélité pleine** : chaque série avec sa charge, ses reps, son
 * RIR et son repos réel. Le journal du moteur, lui, agrège — mais on ne jette
 * pas la donnée fine à l'écriture pour la reconstituer plus tard : on la garde,
 * et on projette à la lecture (`versEntreeJournal`).
 *
 * @param {number|null} rpe_seance  `null` est ACCEPTÉ (il n'a pas répondu), et
 *        c'est un trou qui se voit : `journal.donneesManquantes()` le signale.
 *        Le refuser ferait perdre toute la séance — ce serait pire.
 */
export function terminerSeance(etat, { fin = Date.now(), rpe_seance = null, echauffement = null, id = null } = {}) {
  const exercices = etat.blocs
    .filter((b) => b.faites.length)
    .map((b) => ({
      nom: b.nom,
      exo_id: b.exo_id,
      equipement: b.equipement,
      substitue_depuis: b.substitue_depuis,
      series: b.faites.map((s) => ({ ...s })),
    }));

  if (!exercices.length) throw new Error("Aucune série validée : il n'y a rien à enregistrer.");

  const duree = Math.max(0, fin - etat.debut) / 60000;

  return {
    id: id ?? `${etat.debut.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    date: etat.date,
    seance: etat.seance,
    jour: etat.jour,
    debut: etat.debut,
    fin,
    duree_min: Math.round(duree * 10) / 10,
    rpe_seance: rpe_seance == null ? null : validerRPE(rpe_seance),
    echauffement: echauffement ?? null,
    exercices,
    // 🔴 Le poids qui a SERVI à ce tonnage, gardé avec lui. Sans ça, `tonnage_kg` serait un
    // chiffre sans unité de mesure : on ne saurait plus sur quel corps il a été calculé.
    poids_corps_kg: etat.poids_corps_kg ?? null,
    // ⚠️ GELÉ. Le poids du corps y est compris (tractions, dips), et il ne se recalcule
    // jamais : le poids de corps change, l'histoire non. Voir `tonnage()`.
    tonnage_kg: Math.round(tonnage(etat)),
    // Ce que ce tonnage ne compte PAS, et pourquoi — pour que l'écran puisse le déclarer
    // sans le déduire à nouveau (un deuxième calcul est un deuxième endroit où diverger).
    tonnage_niveau: detailTonnage(etat).niveau,
    series: exercices.reduce((n, e) => n + e.series.length, 0),
  };
}

/**
 * 🔴 LE RPE **ANNOTE** UNE SÉANCE DÉJÀ EN BASE. Il ne la crée pas.
 *
 * Rien d'autre ne bouge : ni les séries, ni le tonnage, ni la durée — l'`id` est
 * le même, donc l'écriture RE-écrit la même ligne au lieu d'en ajouter une seconde.
 * Une séance notée n'est pas une séance différente : c'est la même, mieux décrite.
 *
 * ⚠️ `rpe == null` reste une réponse VALIDE et HONNÊTE — « je n'ai pas noté ».
 * Aucun RPE par défaut n'est fabriqué ici, ni ailleurs : un `7` inventé serait une
 * fausse mesure, et elle migrerait (elle porte la charge sRPE, ADR 0006).
 */
export function noterSeance(enr, rpe) {
  return { ...enr, rpe_seance: rpe == null ? null : validerRPE(rpe) };
}

/**
 * L'enregistrement → l'entrée que `src/lib/journal.js` (`ajouterSeanceMuscu`)
 * sait lire. **Le moteur possède ce format ; l'app s'y plie.**
 *
 * Le journal ne porte **qu'une** charge par exercice, avec une liste de reps.
 * Une séance réelle, elle, monte en charge d'une série à l'autre. On ne
 * moyenne pas (ce serait fabriquer un chiffre que personne n'a soulevé) : on
 * **groupe par (exercice, charge, RIR)**. Chaque groupe devient une entrée.
 * Rien n'est perdu, rien n'est inventé.
 */
export function versEntreeJournal(enr) {
  const groupes = new Map();
  for (const ex of enr.exercices ?? []) {
    for (const s of ex.series) {
      const cle = `${ex.nom}|${s.charge_kg}|${s.rir}`;
      if (!groupes.has(cle)) groupes.set(cle, { nom: ex.nom, charge_kg: s.charge_kg, rir: s.rir, reps: [] });
      groupes.get(cle).reps.push(s.reps);
    }
  }
  const entree = {
    date: enr.date,
    seance: enr.seance ?? null,
    exercices: [...groupes.values()],
  };
  if (enr.rpe_seance != null) entree.rpe_seance = enr.rpe_seance;
  if (enr.duree_min != null) entree.duree_min = enr.duree_min;
  if (enr.echauffement) entree.echauffement = enr.echauffement;
  return entree;
}
