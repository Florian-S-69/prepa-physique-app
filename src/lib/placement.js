// PLACEMENT — « Pas de jambes lourdes moins de 24–48 h avant une séance de course qualitative. »
//
// C'est la Couche 2 de l'ADR 0006, et c'est le premier livrable utile du différenciateur :
// démontré, sans aucune calibration à faire, et fait par AUCUNE app concurrente (Strava ne sait
// pas que tu as fait des jambes hier ; Hevy ne sait pas que tu cours demain).
//
// ── Le signal, et pourquoi il est SÉPARÉ de la charge ───────────────────────────────────────
// La fatigue neuromusculaire locale du bas du corps n'est PAS la même grandeur que la charge
// systémique, et elle n'a pas la même cinétique :
//   • muscu jusqu'à l'échec → la capacité à produire de la force RAPIDEMENT (RFD) reste dégradée
//     jusqu'à ~48 h ; les dommages musculaires (CK, DOMS) culminent à 24–72 h ;
//   • une grande part de la fatigue d'endurance se récupère en MINUTES.
// Une moyenne mobile à 7 jours (la `charge_7j`) ne peut pas représenter les deux : elle lisse un pic de
// 48 h et étale une récupération de 5 minutes sur une semaine (ADR 0006 §1.5 ; Enoka & Duchateau
// 2016 ; Behrens et al. 2023). Ce compteur est donc tenu à part, et **jamais fusionné** dans un
// scalaire de « forme ». Son usage n'est pas d'afficher un score : c'est une CONTRAINTE DE
// PLANIFICATION.
//
// ── La source de la règle ───────────────────────────────────────────────────────────────────
// veille/11 §2 : « La force peut dégrader la perf / la VO₂ **jusqu'à 48 h** selon les dommages
// musculaires induits. » veille/11 §3 : « Ne pas coller une grosse séance de jambes juste avant
// une séance de qualité de course (ou une longue sortie) — respecter la récup (jusqu'à 48 h si
// gros dommages). Caler les jambes lourdes **loin** des séances-clés de course. »
//
// ⚠️ La fenêtre est « 24–48 h » et le moteur dit « 24–48 h ». On ne fabrique PAS un seuil précis
// pour faire joli : la source est qualitative, la sortie reste qualitative (philosophy §2).
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 2026-07-11 — LA VEILLE TRAIL REMONTE UNE CONSÉQUENCE À L'ADR 0006, ET ELLE EST GRAVE.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// **La fenêtre 24–48 h ci-dessous est CALIBRÉE SUR LA MUSCULATION** (veille/11 §2–§3 : littérature
// de force). C'est écrit noir sur blanc dans `FENETRE_NM.origine`.
//
// Or, **après une grosse DESCENTE**, les données de récupération sont d'un autre ordre :
//   • force max volontaire à **84 %** de la ligne de base à **24 h** ;
//   • **vitesse de montée en force à 63 %** à 24 h — **ENCORE ALTÉRÉE À 72 h** ;
//   • tout résolu à **96 h**.  (veille/20 §2.2, n = 10, 30 min à −20 %)
//
//   > **48 h après une grosse descente, on n'est PAS récupéré — et notre règle autorise pourtant
//   > du squat lourd.**
//
// **AUCUNE SOURCE NE DONNE LA BONNE FENÊTRE « descente → séance de qualité ».** Le moteur **ne
// fabrique donc PAS un « 72 h »** pour faire prudent : ce serait exactement le chiffre rond inventé
// que ce projet s'interdit (philosophy §2 — et la veille refuse elle-même de le proposer).
//
// **Ce que le moteur fait, et c'est tout ce qu'il peut faire honnêtement :**
//   1. il **DÉCLARE** l'origine de sa fenêtre (musculation) — `FENETRE_NM.origine` ;
//   2. il rend la fenêtre **PARAMÉTRABLE** (`analyserSemaine({ fenetre_nm })`) — le jour où le produit
//      tranche, c'est un paramètre, pas une réécriture ;
//   3. il **DÉTECTE** le cas (grosse sortie en D− récente suivie de jambes lourdes ou d'une
//      séance-clé) et il le **SIGNALE** — `signauxDescente()` ;
//   4. il **REMONTE l'arbitrage au produit** (sécurité ↔ entraînabilité) — `FENETRE_DESCENTE`.
//
// Module PUR : aucune I/O.

// Les données de récupération après descente vivent dans `denivele.js` — on les IMPORTE, on ne les
// recopie pas (philosophy §11 : un fait dupliqué est un fait qui divergera).
import { RECUP_DESCENTE } from "./denivele.js";

/**
 * La fenêtre démontrée. Deux bornes, pas un chiffre inventé entre les deux.
 *
 * ⚠️ **`origine` n'est pas une décoration : c'est l'aveu qui rend cette constante honnête.**
 * Elle vient de la littérature **MUSCULATION**. Rien ne dit qu'elle vaille après une descente.
 */
// @chiffre-de-la-veille — vérifié : 24 h et 48 h existent dans veille/11 §2.
export const FENETRE_NM = {
  min_h: 24,
  max_h: 48,
  libelle: "24–48 h",
  tau_jours: "2–3 j (décroissance de la fatigue neuromusculaire locale)",
  // 🔴 L'ORIGINE, DÉCLARÉE. C'est la moitié de la réponse à la veille.
  origine: "musculation",
  origine_declaree:
    "🔴 **Cette fenêtre est CALIBRÉE SUR LA MUSCULATION** (veille/11 §2–§3 : « la force peut dégrader " +
    "la perf jusqu'à **48 h** selon les dommages musculaires induits »). **Elle n'a jamais été " +
    "validée après une DESCENTE** — et les données de descente parlent en **JOURS** (3–4), pas en " +
    "heures (veille/20 §2.2). Voir `FENETRE_DESCENTE` : le moteur **détecte** le cas et le " +
    "**signale**, il **n'invente pas** la bonne fenêtre.",
  parametrable: true,
  source: "veille/11 §2 & §3 ; ADR 0006 §1.5 — RFD dégradé jusqu'à 48 h, CK/DOMS à 24–72 h",
};

/**
 * 🔴 **LA FENÊTRE APRÈS UNE DESCENTE — NON ARBITRÉE. ET LE MOTEUR NE L'INVENTERA PAS.**
 *
 * `valeur_h: null` **est la réponse**, pas un oubli. Les données disent **3–4 jours** ; notre règle
 * dit **24–48 h** (et elle vient de la muscu). **Aucune source ne donne la fenêtre « descente →
 * séance de qualité »** : ni la veille, ni la littérature, ni personne. Fabriquer « 72 h » parce
 * que ça sonne prudent serait exactement le geste que ce moteur s'interdit.
 *
 * **C'est un arbitrage PRODUIT — sécurité (allonger) ↔ entraînabilité (garder) — et il appartient
 * pas au moteur.** Le moteur pose les deux termes sous les yeux du produit et continue de travailler.
 */
export const FENETRE_DESCENTE = {
  valeur_h: null, // 🔴 AUCUNE SOURCE. Le moteur ne fabrique pas de « 72 h ».
  statut: "NON ARBITRÉE — décision produit en attente",
  donnees_recuperation: "3–4 jours (72–96 h)",
  ce_que_disent_les_donnees:
    "Après **30 min de course à −20 %** (n = 10) : force max volontaire à **84 %** à 24 h ; " +
    "**vitesse de montée en force à 63 %** à 24 h et **ENCORE ALTÉRÉE À 72 h** ; tout résolu à " +
    "**96 h**. En course réelle, la CK culmine à **J+2 / J+3** et ne revient à la base qu'à " +
    "**J+3 – J+5**. → **La récupération après descente se compte en JOURS, pas en heures.**",
  le_probleme:
    "🔴 **48 h après une grosse descente, tu n'es PAS récupéré — et la règle de placement du moteur " +
    "(24–48 h, calibrée sur la MUSCULATION) t'autorise pourtant du squat lourd.** Le moteur ne va " +
    "pas faire semblant de ne pas le savoir.",
  ce_que_le_moteur_ne_fait_pas:
    "⚠️ **Il ne fabrique PAS un « 72 h ».** Aucune source ne donne la bonne fenêtre — la veille " +
    "elle-même refuse de la proposer. Un chiffre rond inventé pour faire prudent reste un chiffre " +
    "inventé (philosophy §2).",
  ce_que_le_moteur_fait:
    "Il **déclare** l'origine de sa fenêtre (musculation), il la rend **paramétrable**, il **détecte** " +
    "la conjonction (grosse descente récente + jambes lourdes ou séance-clé) et il te la **signale**.",
  arbitrage: "**SÉCURITÉ (allonger la fenêtre) ↔ ENTRAÎNABILITÉ (la garder).** Arbitrage produit, à trancher.",
  source: "veille/20 §2.2, §9.1 règle 4, §9.4 — conséquence remontée à l'ADR 0006",
};

export const JOURS_SEMAINE = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

// Patterns moteurs qui chargent lourdement le bas du corps. Table EXPLICITE, comme SLOTS et
// REGLES : sur un produit de santé, une règle déduite par heuristique est une erreur silencieuse
// en puissance (même parti pris que exercices.js / limitations.js).
const PATTERNS_JAMBES = ["squat", "hinge"];

// Prescriptions « lourdes » : la fatigue neuromusculaire vient des séries LOURDES / proches de
// l'échec, pas des isolations légères (veille/02 §3 : au-delà de ~1–2 RIR, s'approcher de l'échec
// n'apporte quasi rien mais COÛTE de la fatigue).
const PRESCRIPTIONS_LOURDES = ["force", "hypertrophie"];

/**
 * Dénivelé d'une sortie à partir duquel la composante EXCENTRIQUE compte.
 * ⚠️ Il n'existe **aucun seuil sourcé** au-delà duquel la course « devient de la muscu ».
 * On ne fabrique donc pas de score : on utilise le dénivelé comme un **marqueur binaire de présence**
 * d'une composante excentrique notable, et le rendu le dit comme tel. La valeur ci-dessous est un
 * ordre de grandeur de « sortie vallonnée », déclaré comme une CONVENTION du moteur, pas comme
 * une donnée scientifique.
 */
export const D_PLUS_NOTABLE_M = 300;

/**
 * 🔴 **Le MÊME seuil, appliqué au D− — et c'est LUI qui compte.**
 *
 * La veille est formelle (veille/20 §1.1, §2) : **c'est la DESCENTE qui casse**, pas la montée. Le
 * D+ n'est qu'un **pis-aller** quand le D− est inconnu — et il **sous-estime le cas le plus
 * dangereux** : le point-à-point descendant (200 m de D+, 1 800 m de D−).
 *
 * ⚠️ **Même convention déclarée, même absence de source.** On ne fabrique pas un second chiffre pour
 * faire savant : c'est le même seuil, et il n'est pas plus sourcé que l'autre.
 */
export const D_MOINS_NOTABLE_M = D_PLUS_NOTABLE_M;

// ────────────────────────────────────────────── Détection : qu'est-ce qu'une « jambe lourde » ?

/**
 * Une séance de MUSCU (du programme généré) charge-t-elle lourdement les jambes ?
 * Critère catégoriel, pas un score : au moins un composé squat/hinge en prescription lourde.
 * On remonte le NOMBRE de séries concernées — auditable, pas magique.
 */
export function jambesLourdesProgramme(seance) {
  const exos = (seance?.exercices ?? []).filter(
    (e) => e && e.type === "compose" && PATTERNS_JAMBES.includes(e.pattern) && PRESCRIPTIONS_LOURDES.includes(e.prescription)
  );
  if (!exos.length) return null;
  return {
    origine: "muscu",
    quoi: seance.nom,
    exercices: exos.map((e) => e.nom),
    series: exos.reduce((n, e) => n + (e.series ?? 0), 0),
  };
}

/**
 * Une séance de MUSCU LOGGUÉE (journal) charge-t-elle lourdement les jambes ?
 * Le journal ne porte qu'un nom d'exercice → le pattern vient du RÉFÉRENTIEL (injecté).
 * `rir <= 2` = série proche de l'échec (veille/02 §3).
 */
export function jambesLourdesLoggees(seance, referentiel) {
  const exos = (seance?.exercices ?? []).filter((e) => {
    if (!e) return false;
    if (!PATTERNS_JAMBES.includes(referentiel?.pattern?.[e.nom])) return false;
    // COMPOSÉ seulement : un leg curl partage le pattern `hinge` avec le soulevé de terre, mais
    // ne dégrade pas la production de force du bas du corps de la même façon. Compter l'isolation
    // ferait déplacer des séances pour rien.
    if (referentiel?.typeExercice?.[e.nom] !== "compose") return false;
    return e.rir == null || Number(e.rir) <= 2; // RIR absent : on ne suppose pas que c'était léger
  });
  if (!exos.length) return null;
  return {
    origine: "muscu",
    quoi: seance.seance ?? "Séance de musculation",
    exercices: exos.map((e) => e.nom),
    series: exos.reduce((n, e) => n + (e.reps?.length ?? 0), 0),
  };
}

/**
 * Une sortie en dénivelé laisse elle aussi des jambes lourdes (composante **excentrique**).
 *
 * 🔴 **On lit le D− EN PRIORITÉ — c'est lui la contrainte** (veille/20 §1.1 : la descente coûte
 * **−49 % d'énergie** à −20 % de pente **tout en produisant le dommage**). Le D+ n'est qu'un
 * **PIS-ALLER** quand le D− est inconnu, et il est **signalé comme tel** (`d_moins_mesure: false`) :
 * sur un point-à-point descendant, il **sous-estime exactement le profil le plus agressif**.
 */
export function jambesLourdesSortie(sortie) {
  const dmoins = Number(sortie?.denivele_negatif_m);
  const dplus = Number(sortie?.denivele_m);
  const mesure = Number.isFinite(dmoins) && dmoins > 0;
  // La valeur qui décide : le D− s'il est connu, sinon le D+ (approximation déclarée).
  const valeur = mesure ? dmoins : dplus;
  if (!Number.isFinite(valeur) || valeur < D_MOINS_NOTABLE_M) return null;
  return {
    origine: "denivele",
    quoi: `Sortie ${sortie.type ?? "E"} — ${sortie.km ?? "?"} km, ${Math.round(valeur)} m ${mesure ? "D−" : "D+"}`,
    exercices: [],
    denivele_m: Number.isFinite(dplus) ? Math.round(dplus) : null,
    denivele_negatif_m: mesure ? Math.round(dmoins) : null,
    // ⚠️ Auditable : le signal repose-t-il sur la vraie contrainte (le D−) ou sur son proxy (le D+) ?
    d_moins_mesure: mesure,
    descente_m: Math.round(valeur),
  };
}

/**
 * Une sortie de course est-elle « qualitative » (au sens de la contrainte) ?
 * = séance-clé : allure de qualité (T/I/R), test chrono, ou longue sortie.
 * veille/11 §3 vise explicitement « une séance de qualité de course (**ou une longue sortie**) ».
 */
export function courseQualitative(sortie, { seuil_longue_km = 16 } = {}) {
  if (!sortie) return null;
  if (sortie.qualitative === false) return null;
  const type = String(sortie.type ?? "E").toUpperCase();
  if (["T", "I", "R"].includes(type)) return { quoi: `Séance de qualité (zone ${type})`, motif: "intensite" };
  if (sortie.test) return { quoi: "Test chrono", motif: "test" };
  if (Number(sortie.km ?? 0) >= seuil_longue_km) return { quoi: `Longue sortie (${sortie.km} km)`, motif: "longue" };
  return null;
}

// ───────────────────────────────────────────────────────── Le cœur : analyser une semaine type

// ─────────────────────── Ce qu'une limitation ACTIVE du bas du corps change à cette règle
//
// 🔴 LA QUESTION, ET LA RÉPONSE — tranchée, et justifiée.
//
// « Une limitation ACTIVE au genou change-t-elle la règle des 24–48 h ? »
//
// **1. Elle NE RALLONGE PAS la fenêtre.** Aucune source ne dit qu'un genou douloureux ferait passer
//    la récupération neuromusculaire de 48 h à 72 h. Fabriquer « 72 h » pour faire prudent serait
//    exactement le geste que ce moteur s'interdit : un chiffre rond, inventé, présenté comme une
//    donnée (philosophy §2). **La fenêtre reste 24–48 h.**
//
// **2. Elle CHANGE LA NATURE de la règle — et donc sa SÉVÉRITÉ.** Sans limitation, un conflit de
//    placement coûte une **performance** : « ta séance de course sera moins bonne ». Avec une zone
//    du bas du corps **ACTIVE**, le même conflit coûte autre chose : on empile des **dommages
//    musculaires** (dont la composante **excentrique**) sur une articulation **qui fait déjà mal**.
//    Ce n'est plus un arbitrage de perf, c'est un enjeu de **sécurité**.
//    Conséquence encodée : l'écart de 2 j (≈ 48 h), jusqu'ici classé « limite » et déclaré
//    « acceptable », devient un **conflit**. On ne sort PAS de la fenêtre sourcée (48 h **est** dans
//    « jusqu'à 48 h ») — on cesse simplement de traiter sa borne haute comme un détail.
//    ⚠️ **C'est un choix de SÉCURITÉ PRODUIT assumé, pas une conclusion scientifique** — même
//    franchise que pour l'échauffement non skippable (veille/18 §9.1, règle 2).
//
// **3. Elle NE SUPPRIME PAS la séance de qualité.** Supprimer, c'est refuser — et le moteur adapte,
//    il ne refuse pas (sinon l'utilisateur la fera quand même, sans filet : c'est pire). Ce qui est
//    adapté, c'est le **contenu** (le dénivelé sort : la descente est excentrique), le **volume**
//    (il ne monte plus) et la **cadence** (le seul levier sourcé) — voir limitations.js.
//
// **4. Seul le statut ACTIF durcit.** Un genou LATENT ne durcit rien : ce serait sur-réagir, et ce
//    serait incohérent avec la salle (où LATENT ne retire ni ne substitue rien).

/**
 * Analyse une semaine (7 jours) et renvoie les conflits de placement.
 *
 * `jours` : [{ jour, jambes_lourdes: {…}|null, course_qualitative: {…}|null }, …] dans l'ordre.
 * La semaine est traitée comme CYCLIQUE (le programme se répète) : des jambes lourdes le dimanche
 * pèsent bien sur une séance de qualité le lundi.
 *
 * Trois écarts, trois traitements — et on ne prétend rien de plus que ce que la source dit :
 *   • 0 j (même jour)  → conflit (le pire : veille/11 §2 demande ≥ 6 h de séparation MINIMUM) ;
 *   • 1 j (≈ 24 h)     → conflit — DANS la fenêtre 24–48 h ;
 *   • 2 j (≈ 48 h)     → « limite » : à la borne HAUTE de la fenêtre. Signalé, pas traité comme
 *                        une faute. La source dit « jusqu'à 48 h » — on ne durcit pas au-delà.
 *                        ⚠️ SAUF si une zone du bas du corps est ACTIVE : voir ci-dessus.
 *
 * @param options.zone_jambes_active {zone, libelle, possessif} | null — cf. limitations.js
 * @param options.fenetre_nm  la fenêtre à appliquer. **PARAMÉTRABLE depuis le 2026-07-11** : la
 *        valeur par défaut (`FENETRE_NM`, 24–48 h) est **calibrée sur la MUSCULATION**, et la veille
 *        trail montre qu'elle est **trop courte après une grosse descente** (§9.4). Aucune source ne
 *        donne la bonne valeur → le moteur **n'en fabrique pas**, mais il rend le réglage possible :
 *        le jour où le produit tranche, c'est **un paramètre**, pas une réécriture. Les écarts examinés
 *        en découlent (`max_h / 24`) : 48 h → J-0/1/2 ; 72 h → J-0/1/2/3.
 */
export function analyserSemaine(jours, { zone_jambes_active = null, fenetre_nm = FENETRE_NM } = {}) {
  const n = jours.length;
  const conflits = [];
  const zone = zone_jambes_active;
  const f = fenetre_nm ?? FENETRE_NM;
  // Les écarts examinés découlent de la FENÊTRE — plus aucun [0,1,2] en dur.
  const ecartMax = Math.max(1, Math.round(f.max_h / 24));
  const ecarts = Array.from({ length: ecartMax + 1 }, (_, k) => k);
  // La fenêtre ne bouge PAS d'elle-même (aucune source ne l'allonge). C'est la GRAVITÉ de sa borne
  // haute qui change : on n'empile pas de l'excentrique sur une articulation douloureuse « parce
  // que 48 h ».
  const durci = Boolean(zone);
  const raisonSecurite = durci
    ? ` 🩹 **${zone.libelle} est une limitation ACTIVE** : ici, un conflit de placement ne coûte plus seulement une ` +
      `**performance** — il empile des **dommages musculaires** sur une articulation **qui fait déjà mal**. La fenêtre ` +
      `**reste ${f.libelle}** (aucune source ne l'allonge, et le moteur n'invente pas un « 72 h » pour faire ` +
      `prudent), mais sa **borne haute cesse d'être « acceptable »**. ⚠️ Choix de **sécurité** assumé, pas une conclusion ` +
      `scientifique.`
    : "";

  for (let i = 0; i < n; i++) {
    const cible = jours[i];
    if (!cible.course_qualitative) continue;
    for (const ecart of ecarts) {
      const src = jours[(i - ecart + n) % n];
      if (!src.jambes_lourdes) continue;
      // ⚠️ Une sortie n'est pas « des jambes lourdes AVANT elle-même ». Depuis que le moteur
      // PLANIFIE du dénivelé, la longue sortie vallonnée est à la fois la source de l'excentrique
      // et la séance-clé à protéger : sans ce garde-fou, elle serait en conflit avec elle-même.
      // Son D− pèse en revanche pleinement sur les jours SUIVANTS — c'est là qu'il compte. Même
      // exclusion que `conflitsObserves` : les deux faces du moteur disent la même chose.
      if (ecart === 0 && src.jambes_lourdes.origine === "denivele") continue;
      const borneHaute = ecart === ecartMax;
      const severite = !borneHaute || durci ? "conflit" : "limite";
      conflits.push({
        severite,
        ecart_jours: ecart,
        durci: durci && borneHaute,
        zone_active: zone?.zone ?? null,
        jour_jambes: src.jour,
        jour_course: cible.jour,
        jambes: src.jambes_lourdes,
        course: cible.course_qualitative,
        pourquoi:
          (ecart === 0
            ? `**${src.jour}** : jambes lourdes (${src.jambes_lourdes.quoi}) le MÊME JOUR que ${cible.course_qualitative.quoi.toLowerCase()}. ` +
              `Séparer les deux filières d'au moins 6 h (veille/11 §2) — et si l'objectif est la course, la faire en premier.`
            : !borneHaute
              ? `**${src.jour} → ${cible.jour}** (≈ ${ecart * 24} h) : ${src.jambes_lourdes.quoi} laisse les jambes lourdes, et ${cible.course_qualitative.quoi.toLowerCase()} tombe dans la fenêtre ` +
                `**${f.libelle}** où la capacité à produire de la force reste dégradée. La séance de course sera **moins bonne**, ` +
                `et le bénéfice de la qualité en partie perdu (${f.source}).`
              : durci
                ? `**${src.jour} → ${cible.jour}** (≈ ${ecart * 24} h) : à la **borne haute** de la fenêtre ${f.libelle} — et ce n'est **plus acceptable** ici ` +
                  `(${f.source}).`
                : `**${src.jour} → ${cible.jour}** (≈ ${ecart * 24} h) : à la **borne haute** de la fenêtre ${f.libelle}. ` +
                  `Acceptable si la séance de jambes n'a pas été menée près de l'échec ; à surveiller si les jambes sont encore raides le jour J ` +
                  `(${f.source}).`) + (durci ? raisonSecurite : ""),
      });
    }
  }
  return {
    conflits: conflits.filter((c) => c.severite === "conflit"),
    limites: conflits.filter((c) => c.severite === "limite"),
    ok: conflits.every((c) => c.severite !== "conflit"),
    // La règle a-t-elle été durcie, et par quoi ? Auditable, jamais implicite.
    durci,
    zone_active: zone ?? null,
    // La fenêtre RÉELLEMENT appliquée, et son origine. Jamais implicite : c'est le cœur de l'aveu.
    fenetre: f,
    // 🔴 Le signal que la veille trail impose : une grosse descente récente n'est PAS couverte par
    // cette fenêtre (calibrée muscu). Détecté et remonté — pas rustiné.
    signaux_descente: signauxDescente(jours, { fenetre_nm: f }),
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 LE SIGNAL DE DESCENTE — CE QUE L'ADR 0006 NE COUVRE PAS, ET QUE LE MOTEUR REFUSE DE TAIRE
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * La règle de placement (24–48 h) protège **la course qualitative** contre **les jambes lourdes**.
 * Elle a **deux angles morts**, et la veille trail les révèle tous les deux :
 *
 *   1. **Le sens inverse n'est pas couvert.** Une grosse **descente** le dimanche, puis du **squat
 *      lourd** le mardi (48 h) : la règle actuelle ne dit **rien** — elle ne regarde que « jambes
 *      lourdes **avant** course ». Or la vitesse de montée en force est **encore altérée à 72 h**
 *      après une descente (veille/20 §2.2). **On charge un muscle qui n'a pas fini de réparer.**
 *
 *   2. **La fenêtre elle-même est trop courte** après une descente : elle vient de la **musculation**
 *      (`FENETRE_NM.origine`), et les données de descente parlent en **JOURS** (3–4).
 *
 * ⚠️ **Ce que cette fonction NE fait PAS : décider.** Elle ne déplace rien, elle ne bloque rien, elle
 * **n'invente aucune fenêtre de remplacement**. Elle **détecte** et elle **dit**. L'arbitrage
 * (sécurité ↔ entraînabilité) appartient au produit — `FENETRE_DESCENTE`.
 *
 * Le balayage va jusqu'à **`RECUP_DESCENTE_J` jours**, qui n'est **pas** une fenêtre décidée : c'est
 * l'**horizon des données** (la trace neuromusculaire est résolue à 96 h). Regarder moins loin
 * reviendrait à décider en silence que le problème n'existe pas.
 */
// @chiffre-de-la-veille — vérifié dans veille/20 §2.2.
const RECUP_DESCENTE_J = 4; // horizon des DONNÉES (96 h), pas une fenêtre arbitrée

/** La descente portée par un jour (elle survit même si la salle « prime » comme source ce jour-là). */
function descenteDu(jour) {
  return jour?.descente ?? (jour?.jambes_lourdes?.origine === "denivele" ? jour.jambes_lourdes : null);
}

/**
 * Construit UN signal. Partagé par la semaine PLANIFIÉE et le journal OBSERVÉ : les deux faces du
 * moteur doivent dire exactement la même chose (un fait dupliqué est un fait qui divergera).
 */
function signalDescente({ d, cible, ecart, quandSrc, quandCible, f }) {
  const squatLourd = cible.jambes_lourdes?.origine === "muscu" ? cible.jambes_lourdes : null;
  const cle = cible.course_qualitative ?? null;
  if (!squatLourd && !cle) return null;
  const descente_m = d.descente_m ?? d.denivele_negatif_m ?? d.denivele_m ?? null;
  const h = ecart * 24;
  return {
    type: squatLourd ? "descente_puis_jambes_lourdes" : "descente_puis_seance_cle",
    ecart_jours: ecart,
    ecart_h: h,
    quand_descente: quandSrc,
    quand_cible: quandCible,
    descente_m,
    d_moins_mesure: d.d_moins_mesure ?? false,
    cible: squatLourd?.quoi ?? cle?.quoi ?? null,
    // 🔴 Le point qui fait mal : la règle AUTORISE, et les données DISENT NON.
    // (Le sens « descente → squat lourd » n'a, lui, AUCUN garde-fou : la règle ne le regarde même pas.)
    couvert_par_la_regle: !squatLourd && h <= f.max_h,
    arbitrage_en_attente: true,
    pourquoi:
      `⛰️🔴 **${quandSrc} : grosse descente (${descente_m ?? "?"} m ${d.d_moins_mesure ? "D−" : "D+ — le D− n'est pas mesuré"})** → ` +
      `**${quandCible}** (≈ ${h} h) : ${squatLourd ? `**${squatLourd.quoi}** — jambes lourdes` : `**${cle.quoi}**`}. ` +
      (h <= RECUP_DESCENTE.encore_alteree_h
        ? `🔴 **Les données disent que tu n'es PAS récupéré** : après une descente, la **vitesse de montée en force** est ` +
          `**encore altérée à 72 h**, et tout n'est résolu qu'à **96 h** (veille/20 §2.2). `
        : `Tu es probablement récupéré (la trace neuromusculaire se résout à **96 h**) — mais tu es à la borne. `) +
      (squatLourd
        ? `⚠️ **Et la règle de placement du moteur ne dit RIEN de ce cas** : elle protège la **course** contre les ` +
          `**jambes lourdes**, jamais l'inverse. **Elle t'autorise donc du squat lourd ici.**`
        : `⚠️ **La fenêtre du moteur (${f.libelle}) est CALIBRÉE SUR LA MUSCULATION** (veille/11) — elle n'a **jamais** ` +
          `été validée après une descente.`) +
      ` 🔴 **Aucune source ne donne la bonne fenêtre, et le moteur n'en fabriquera pas** (pas de « 72 h » inventé). ` +
      `Il te **signale** le cas ; l'arbitrage **sécurité ↔ entraînabilité** t'appartient.`,
  };
}

export function signauxDescente(jours, { fenetre_nm = FENETRE_NM } = {}) {
  const n = jours?.length ?? 0;
  if (!n) return [];
  const f = fenetre_nm ?? FENETRE_NM;
  const signaux = [];
  for (let i = 0; i < n; i++) {
    const d = descenteDu(jours[i]);
    if (!d) continue;
    for (let ecart = 1; ecart <= Math.min(RECUP_DESCENTE_J, n - 1); ecart++) {
      const cible = jours[(i + ecart) % n];
      const s = signalDescente({
        d,
        cible,
        ecart,
        quandSrc: jours[i].jour ?? `J`,
        quandCible: cible.jour ?? `J+${ecart}`,
        f,
      });
      if (s) signaux.push(s);
    }
  }
  return signaux;
}

// ─────────────────────────────────── Composer une semaine SANS conflit (profil muscu-first)

/**
 * Étale les séances d'un programme muscu sur la semaine : le cycle du split, répété tant qu'il
 * reste des jours d'entraînement. PPL sur 6 j → [Push, Pull, Legs, Push, Pull, Legs] ; PPL sur
 * 5 j → [Push, Pull, Legs, Push, Pull] ; Upper/Lower sur 4 j → les 4 modèles.
 */
function sequenceSeances(seances, joursParSemaine) {
  const seq = [];
  while (seq.length < joursParSemaine && seances.length) seq.push(seances[seq.length % seances.length]);
  return seq;
}

/**
 * Compose la semaine d'un profil **muscu-first qui court** (PPL 6 j + 1 course).
 *
 * C'est exactement le cas où la contrainte mord : avec 6 jours de salle, la course tombe
 * mécaniquement à côté d'un jour de jambes — la seule journée libre est, par construction, collée
 * à deux séances de salle.
 *
 * Méthode (pas de sur-ingénierie) : on énumère les arrangements obtenus en (a) choisissant le jour
 * qui accueille la course et (b) faisant tourner le cycle du split, puis on garde le premier SANS
 * conflit — en préférant, à égalité, celui qui bouge le moins par rapport à la disposition naïve
 * (salle dès le lundi, course le dernier jour). Si aucun arrangement ne supprime le conflit, on
 * **avertit** au lieu de bricoler : le moteur dit ce qu'il ne sait pas faire (philosophy §4).
 *
 * ⚠️ Une seule séance de course est PLACÉE — la **séance-clé**, celle que la contrainte protège.
 * Les courses supplémentaires sont, par hypothèse, des footings faciles : la fenêtre 24–48 h ne
 * vise **que** les séances de qualité et les longues sorties (veille/11 §3). Elles sont donc
 * laissées libres, et c'est DIT (`courses_libres`), pas escamoté.
 */
export function composerSemaineMuscuHybride(programme, { courses = 0, courseQualitative: qualite = true, zone_jambes_active = null } = {}) {
  const opts = { zone_jambes_active };
  const joursParSemaine = Math.min(programme.joursParSemaine ?? programme.seances.length, 7);
  const seq = sequenceSeances(programme.seances, joursParSemaine);
  const nbMuscu = seq.length;
  const nbCourses = Math.max(0, Math.round(courses));
  const coursesLibres = Math.max(0, nbCourses - 1);

  const construire = (jourCourse, rotation) => {
    const jours = JOURS_SEMAINE.map((jour) => ({ jour, muscu: null, course: null, jambes_lourdes: null, course_qualitative: null }));
    // Les jours de salle occupent les jours suivants, en tournant, sans jamais prendre le jour de
    // course : la salle et la séance-clé ne partagent pas la journée (veille/11 §2 — 6 h+ mini).
    const indexSalle = [];
    for (let k = 1; k <= 6 && indexSalle.length < nbMuscu; k++) indexSalle.push((jourCourse + k) % 7);
    indexSalle.sort((a, b) => a - b);
    indexSalle.forEach((i, k) => {
      const s = seq[(k + rotation) % seq.length];
      jours[i].muscu = s;
      jours[i].jambes_lourdes = jambesLourdesProgramme(s);
    });
    if (nbCourses > 0) {
      jours[jourCourse].course = { nom: qualite ? "Course — séance-clé" : "Course — footing facile", qualitative: qualite };
      if (qualite) jours[jourCourse].course_qualitative = { quoi: "la séance de course", motif: "seance_cle" };
    }
    return jours;
  };

  const naif = construire(6, 0); // disposition « naturelle » : salle dès le lundi, course le dimanche
  const analyseNaive = analyserSemaine(naif, opts);

  const candidats = [];
  for (let jourCourse = 0; jourCourse < 7; jourCourse++) {
    for (let rotation = 0; rotation < seq.length; rotation++) {
      const jours = construire(jourCourse, rotation);
      const analyse = analyserSemaine(jours, opts);
      const deplacements = jours.filter(
        (j, i) => (j.muscu?.nom ?? null) !== (naif[i].muscu?.nom ?? null) || Boolean(j.course) !== Boolean(naif[i].course)
      ).length;
      candidats.push({ jours, analyse, deplacements });
    }
  }
  candidats.sort(
    (x, y) =>
      x.analyse.conflits.length - y.analyse.conflits.length ||
      x.analyse.limites.length - y.analyse.limites.length ||
      x.deplacements - y.deplacements
  );
  const retenu = candidats[0];

  return {
    jours: retenu.jours,
    analyse: retenu.analyse,
    reorganise: retenu.deplacements > 0 && analyseNaive.conflits.length > 0,
    conflits_evites: analyseNaive.conflits,
    resolu: analyseNaive.conflits.length > 0 && retenu.analyse.conflits.length === 0,
    courses_libres: coursesLibres,
    fenetre: FENETRE_NM,
    // La contrainte a-t-elle été DURCIE par une limitation ACTIVE du bas du corps ? Le placement
    // retenu peut être différent à cause d'elle : ça ne doit pas être invisible.
    zone_jambes_active,
    hypothese:
      nbCourses > 0 && qualite
        ? "🔴 **Hypothèse** : le moteur traite ta course comme une **séance-clé** (qualité ou longue sortie) — c'est le cas " +
          "le plus contraignant, et le plus prudent. Si c'est un footing très facile, la contrainte ne s'applique pas : " +
          'déclare-le (`muscu.hybride.course_type: "facile"`) et le moteur relâchera.' +
          (coursesLibres > 0
            ? ` ⚠️ Tes **${coursesLibres} autre(s) course(s)** de la semaine ne sont **pas placées** par le moteur : la fenêtre ` +
              `${FENETRE_NM.libelle} ne vise que les séances de QUALITÉ (veille/11 §3). Place-les où tu veux — mais si l'une d'elles ` +
              `est dure, elle mérite le même traitement que la séance-clé.`
            : "")
        : null,
    pourquoi:
      `Les séances de jambes lourdes sont placées de façon à laisser **${FENETRE_NM.libelle}** avant la séance de course. ` +
      `**Pourquoi** : une séance de jambes menée près de l'échec dégrade la capacité à produire de la force rapidement ` +
      `pendant **jusqu'à 48 h** (dommages musculaires) — courir dur dans cette fenêtre donne une séance de course moins ` +
      `bonne, pour la même fatigue (${FENETRE_NM.source}). 🟢 **Démontré** — c'est la règle la mieux étayée du moteur sur ` +
      `l'hybride, et elle ne demande **aucune calibration**.`,
  };
}

// ────────────────────────────────────────────── Rétrospective : ce qui s'est VRAIMENT passé

/**
 * Conflits de placement OBSERVÉS dans le journal (pas dans le plan). Le moteur ne se contente pas
 * de bien planifier : il regarde si la règle a été tenue, et le dit.
 * Le référentiel est INJECTÉ (le journal ne loggue qu'un nom d'exercice).
 */
export function conflitsObserves(journal, referentiel, { zone_jambes_active = null, fenetre_nm = FENETRE_NM } = {}) {
  const durci = Boolean(zone_jambes_active);
  const f = fenetre_nm ?? FENETRE_NM;
  const ecartMax = Math.max(1, Math.round(f.max_h / 24));
  const JOUR_MS = 24 * 3600 * 1000;
  const jours = new Map(); // date → { jambes_lourdes, course_qualitative, descente }
  const poser = (date, cle, valeur) => {
    if (!valeur) return;
    if (!jours.has(date)) jours.set(date, { date, jambes_lourdes: null, course_qualitative: null, descente: null });
    jours.get(date)[cle] = jours.get(date)[cle] ?? valeur;
  };

  for (const s of journal?.seances_muscu ?? []) poser(s.date, "jambes_lourdes", jambesLourdesLoggees(s, referentiel));
  for (const s of journal?.sorties_course ?? []) {
    poser(s.date, "jambes_lourdes", jambesLourdesSortie(s));
    // ⛰️ La descente est posée SÉPARÉMENT : si une séance de salle tombe le même jour, elle « prime »
    // comme source de jambes lourdes — mais la descente, elle, ne doit pas disparaître du radar.
    poser(s.date, "descente", jambesLourdesSortie(s));
    poser(s.date, "course_qualitative", courseQualitative(s));
  }
  for (const t of journal?.tests_chrono ?? []) poser(t.date, "course_qualitative", { quoi: "Test chrono", motif: "test" });

  const conflits = [];
  const limites = [];
  for (const [date, j] of jours) {
    if (!j.course_qualitative) continue;
    const t = new Date(date + "T00:00:00Z").getTime();
    for (let ecart = 0; ecart <= ecartMax; ecart++) {
      const veille = new Date(t - ecart * JOUR_MS).toISOString().slice(0, 10);
      const src = jours.get(veille);
      if (!src?.jambes_lourdes) continue;
      // Le même jour : seulement si la source n'est pas la sortie elle-même (une sortie vallonnée
      // n'est pas « des jambes lourdes AVANT elle-même »).
      if (ecart === 0 && src.jambes_lourdes.origine === "denivele") continue;
      const borneHaute = ecart === ecartMax;
      const item = {
        ecart_jours: ecart,
        durci: durci && borneHaute,
        date_jambes: veille,
        date_course: date,
        jambes: src.jambes_lourdes,
        course: j.course_qualitative,
      };
      // Zone du bas du corps ACTIVE → la borne haute (48 h) cesse d'être « acceptable » : elle
      // compte comme un conflit. La fenêtre, elle, ne bouge pas (cf. le bloc de doctrine ci-dessus).
      (!borneHaute || durci ? conflits : limites).push(item);
    }
  }
  conflits.sort((a, b) => a.date_course.localeCompare(b.date_course));
  limites.sort((a, b) => a.date_course.localeCompare(b.date_course));

  // ⛰️🔴 LE SIGNAL DE DESCENTE — sur ce qui s'est VRAIMENT passé. Même détection, même message que
  // côté plan (`signauxDescente`) : les deux faces du moteur disent la même chose.
  const signaux_descente = [];
  for (const [date, src] of jours) {
    const d = descenteDu(src);
    if (!d) continue;
    const t = new Date(date + "T00:00:00Z").getTime();
    for (let ecart = 1; ecart <= RECUP_DESCENTE_J; ecart++) {
      const apres = new Date(t + ecart * JOUR_MS).toISOString().slice(0, 10);
      const cible = jours.get(apres);
      if (!cible) continue;
      const s = signalDescente({ d, cible, ecart, quandSrc: date, quandCible: apres, f });
      if (s) signaux_descente.push(s);
    }
  }
  signaux_descente.sort((a, b) => a.quand_cible.localeCompare(b.quand_cible));

  return {
    conflits,
    limites,
    signaux_descente,
    fenetre: f,
    fenetre_descente: FENETRE_DESCENTE,
    durci,
    zone_active: zone_jambes_active ?? null,
    pourquoi: conflits.length
      ? `${conflits.length} fois, une séance de jambes lourdes est tombée à **moins de ${f.max_h} h** avant une séance-clé de course. ` +
        `La séance de course en a payé le prix (force explosive dégradée jusqu'à ${f.max_h} h après des dommages musculaires) — ` +
        `même fatigue, moins de bénéfice (${f.source}). Ce n'est pas une faute morale : c'est un **placement** à corriger, ` +
        `et le moteur sait le faire pour toi.` +
        (durci
          ? ` 🩹 **Et ici, ce n'est plus qu'une histoire de performance** : ta limitation **${zone_jambes_active.libelle}** est ` +
            `**ACTIVE**. Chacun de ces empilements a ajouté des **dommages musculaires** sur une articulation qui fait déjà mal. ` +
            `La fenêtre reste **${f.libelle}** — mais sa borne haute n'est plus « acceptable » pour toi.`
          : "")
      : `Aucun conflit de placement observé : les jambes lourdes ont bien été tenues à distance des séances-clés de course (${f.libelle}).`,
  };
}
