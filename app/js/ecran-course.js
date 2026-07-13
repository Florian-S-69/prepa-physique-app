/**
 * ecran-course.js — LA COURSE, À L'ÉCRAN. Le DOM de `course.js`.
 *
 * ══════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'IL REND VISIBLE — et pourquoi c'est TOUT le produit
 * ══════════════════════════════════════════════════════════════════════
 * Trois choses, et elles se tiennent :
 *
 *   1. **LOGUER UNE COURSE** (`ouvrirSaisieCourse`). Distance, durée, RPE de séance. Le reste
 *      (zone, D+, D−) est optionnel et **jamais inventé** : un champ vide vaut `null`, pas `0`.
 *
 *   2. **LA JAUGE UNIFIÉE** (`carteCharge`). Muscu **+** course, une seule charge, dans une seule
 *      unité : `sRPE × durée` (Foster 2001 ; ADR 0006). **C'est la seule chose que ni Strava ni
 *      Hevy ne savent faire** — Strava ne sait pas que tu as fait des jambes, Hevy ne sait pas que
 *      tu as couru. Elle était calculée depuis des semaines (`charge.js chargesHebdo`) et
 *      **affichée nulle part.**
 *
 *   3. **LE CONFLIT DE PLACEMENT** (`lignesPlacement`). « Des jambes lourdes moins de 24–48 h avant
 *      une séance-clé de course. » C'est la règle la mieux étayée du moteur sur l'hybride, et **la
 *      seule qui ne demande aucune calibration** — donc la seule qui serve dès la première semaine.
 *
 * ══════════════════════════════════════════════════════════════════════
 * ⚠️ CE QU'ON N'A PAS FAIT, ET IL FAUT SAVOIR POURQUOI
 * ══════════════════════════════════════════════════════════════════════
 * **On n'affiche PAS `charge_42j` / `charge_7j` / `ecart_42j_7j` pour « muscu + course ».**
 *
 * Ces trois-là existent (`charge.js simulerCharge`) — mais elles sont **CARDIOVASCULAIRES**, et le
 * moteur l'écrit en toutes lettres : *« Aucune charge de musculation n'y est injectée : le faire
 * supposerait une constante de conversion inventée. »* Y verser du sRPE de muscu pour obtenir de
 * jolies moyennes mobiles, ce serait **ressusciter le `k` que l'ADR 0006 a supprimé**, et
 * recréer par la bande le **score de forme fitness-fatigue** — celui dont la composante « fatigue »
 * **n'améliore pas la prédiction** (p = 0,57 ; Marchal et al. 2025, *Sci Rep* 15:3706).
 *
 *   > **« On additionne la CHARGE. On n'additionne pas la FATIGUE. »**
 *
 * Ce qui S'ADDITIONNE légitimement, c'est une **DOSE** — « qu'est-ce que j'ai encaissé cette
 * semaine » (Impellizzeri 2023 : exposition → dose → réponse). C'est exactement ce que rend
 * `chargesHebdo().semaines` : `force_au + endurance_au = total_au`, filières **séparées et
 * auditables**. **C'est ça, la jauge unifiée. C'est ça qu'on affiche.** Aucun score composite n'est
 * inventé ici, et aucun nom de Peaksware n'est employé (veille/19 §3.5).
 *
 * ══════════════════════════════════════════════════════════════════════
 * Le TON
 * ══════════════════════════════════════════════════════════════════════
 * On retire la NARRATION, on garde l'ÉTAT. Un champ vide affiche **`—`**. **Mais aucune vérité ne
 * disparaît** : le *pourquoi* du moteur (son hypothèse centrale, son aveuglement à la descente, sa
 * calibration non faite) attend **derrière un tap**, dans la feuille — mot pour mot, tel que le
 * moteur l'a écrit. **L'app n'écrit aucune explication** : si elle en écrivait, l'écran et le
 * moteur raconteraient deux histoires.
 */

import {
  $, el, echapper, toast,
  ouvrirFeuille, fermerFeuille, blocPourquoi, ligneEtat, SAIT, IGNORE,
} from './ui.js';
import { derive } from './valeurs.js';
import { enregistrerSortie, supprimerSortie } from './moteur.js';
import { dateLocale } from './seance.js';
import {
  ZONES_COURSE, ZONE_DEFAUT,
  allureDite, dureeDite, kmDit, nomZone, trousDe,
} from './course.js';
// 🔴 LA MÊME QUESTION, LE MÊME TEXTE, LES DEUX SPORTS. La grille du RPE était rendue ici **sans
// question et sans explication** ; celle de la muscu POSE la question. Même échelle, sens donné
// une fois sur deux — alors que c'est **parce que la question est la même** qu'elles s'additionnent.
import { blocRPE } from './rpe.js';
// 🔴 Le lundi d'une date vient du MOTEUR (`charge.js`), pas de l'app : c'est LUI qui découpe
// `chargesHebdo().semaines`. Deux définitions de « la semaine », ce serait un jour deux semaines.
import { lundiDe } from '../../src/lib/charge.js';

// ══════════════════════════════════════════════════════════════════════
// 1. LOGUER UNE COURSE
// ══════════════════════════════════════════════════════════════════════

/** Un champ de saisie de la feuille. Même boîte, même hauteur de doigt que partout (46 px). */
function champ(id, libelle, { type = 'text', mode = 'decimal', valeur = '', placeholder = '—', unite = null } = {}) {
  const bloc = el('div', 'champ-inline');
  const lab = el('label', 'champ-inline-lab', echapper(libelle));
  lab.setAttribute('for', id);
  const boite = el('div', `champ-inline-boite${type === 'date' ? ' champ-inline-boite--date' : ''}`);
  const input = el('input');
  input.id = id;
  input.setAttribute('type', type);
  if (type !== 'date') input.setAttribute('inputmode', mode);
  input.setAttribute('placeholder', placeholder);
  input.value = valeur;
  boite.append(input);
  if (unite) boite.append(el('span', 'champ-inline-unite', echapper(unite)));
  bloc.append(lab, boite);
  return bloc;
}

/**
 * 🔴 LA FEUILLE DE SAISIE — et **elle ne prend RIEN en otage**.
 *
 * La séance de muscu a été perdue une fois parce que l'écriture en base vivait **derrière** une
 * modale, et qu'une modale a plus de sorties qu'on n'en compte ([[philosophy]] règle 15). Ici, la
 * leçon tient sans effort : **cette feuille ne détient aucune donnée à perdre.** Rien n'existe tant
 * que « Enregistrer la course » n'a pas été tapé — fermer, glisser, Échap, le voile : les quatre
 * sorties abandonnent une saisie **qui n'avait rien produit**. Il n'y a rien à intercepter.
 *
 * ⚠️ **Le RPE n'est pas obligatoire, et c'est la même règle inversée.** La course est le PRODUIT,
 * le RPE est l'ANNOTATION. On ne verrouille pas l'enregistrement d'un fait derrière une métadonnée
 * facultative. Mais le coût est **dit** : sans RPE, la sortie n'entre pas dans la jauge.
 *
 * ⚠️ **Aucun pré-remplissage du RPE.** Un chiffre suggéré est un chiffre qu'on valide
 * machinalement — et celui-ci porte TOUTE la charge unifiée. Le tap EST la déclaration.
 *
 * @param {{apres: () => Promise<void>}} o  `apres` : le moteur re-tourne (jauge + placement + programme).
 */
export function ouvrirSaisieCourse({ apres } = {}) {
  const corps = el('div', 'crs-form');

  const aujourdhui = dateLocale();
  corps.append(
    champ('crs-date', 'Date', { type: 'date', valeur: aujourdhui }),
    champ('crs-km', 'Distance', { unite: 'km' }),
  );

  // ── 🔴 LA DURÉE — EN HEURES ET EN MINUTES ────────────────────────────────────────────
  // Elle se saisissait **en minutes, et en minutes seulement** : un 30 km en 3 h 20, c'était
  // **200 à taper**. Le champ ne demandait pas une durée, il demandait **une conversion** —
  // faite au pouce, après trois heures de course. Et un « 20 » tapé pour « 200 » **est une durée
  // valide** : aucun garde-fou ne peut l'attraper. Voir `course.js dureeEnMinutes`.
  //
  // Une sortie d'une heure ne coûte rien de plus : on laisse `h` vide. Le moteur, lui, ne connaît
  // toujours que des minutes — la conversion vit dans `course.js`, une fois, et elle est testée.
  const duree = el('div', 'champ-inline');
  duree.append(el('label', 'champ-inline-lab', 'Durée'));
  const duo = el('div', 'crs-duo');
  const boite = (id, unite, ariaLabel) => {
    const b = el('div', 'champ-inline-boite');
    const i = el('input');
    i.id = id;
    i.setAttribute('type', 'text');
    i.setAttribute('inputmode', 'numeric');
    i.setAttribute('placeholder', '—');
    i.setAttribute('aria-label', ariaLabel);
    b.append(i, el('span', 'champ-inline-unite', echapper(unite)));
    return b;
  };
  duo.append(boite('crs-duree-h', 'h', 'Durée — heures'), boite('crs-duree-min', 'min', 'Durée — minutes'));
  duree.append(duo);
  corps.append(duree);

  // La ZONE — les cinq que le moteur accepte (`journal.js TYPES_SORTIE`), nommées par lui
  // (`vdot.js ZONES`). Pas de champ libre : une zone inconnue serait refusée à l'écriture.
  const zoneBloc = el('div', 'champ-inline');
  const zoneLab = el('label', 'champ-inline-lab', 'Type de sortie');
  zoneLab.setAttribute('for', 'crs-zone');
  const select = el('select', 'champ-select');
  select.id = 'crs-zone';
  for (const z of ZONES_COURSE) {
    const o = el('option', null, echapper(`${z.code} · ${z.nom}`));
    o.setAttribute('value', z.code);
    if (z.code === ZONE_DEFAUT) o.setAttribute('selected', 'selected');
    select.append(o);
  }
  select.value = ZONE_DEFAUT;
  zoneBloc.append(zoneLab, select);
  corps.append(zoneBloc);

  // ── 🔴 LE RPE — la donnée pivot, et il est enfin ANCRÉ ────────────────────────────────
  //
  //   > « En muscu on sait qu'on parle de répétitions en plus. Mais **en course, à quoi ça
  //   >   correspond vraiment ? Je ne sais pas.** »
  //
  // Cette grille était rendue **sans question et sans explication** : dix boutons et un libellé.
  // Celle de la muscu, elle, POSE la question et l'explique derrière un tap. **Même grille, sens
  // donné une fois sur deux** — et c'est justement parce que la question est la MÊME que les deux
  // s'additionnent (ADR 0006). Le bloc vient désormais de `rpe.js` : **un seul texte, deux écrans.**
  let rpe = null; // 🔴 rien n'est coché. Rien.
  corps.append(blocRPE({
    onChoisir: (n) => { rpe = n; },
    // 🔴 « Pourquoi cette note ? » ROUVRE le formulaire en sortant — voir `rouvrir()`.
    revenir: () => rouvrir(),
    cout: 'sans lui, hors jauge',
  }));

  // ── Le DÉNIVELÉ — optionnel, et JAMAIS inventé ──
  corps.append(
    champ('crs-dplus', 'Dénivelé positif', { mode: 'numeric', unite: 'm D+' }),
    champ('crs-dmoins', 'Dénivelé négatif', { mode: 'numeric', unite: 'm D−' }),
  );
  const noteD = el('button', 'sc-charge-note', '<span class="why-mark" aria-hidden="true">?</span><span>Dénivelé <b>facultatif</b> — vide, jamais zéro</span>');
  noteD.type = 'button';
  noteD.addEventListener('click', () => expliquerDenivele(() => rouvrir()));
  corps.append(noteD);

  const enregistrer = async () => {
    try {
      const sortie = await enregistrerSortie({
        date: $('#crs-date').value,
        distance_km: $('#crs-km').value,
        duree_h: $('#crs-duree-h').value,
        duree_min: $('#crs-duree-min').value,
        type: $('#crs-zone').value,
        rpe_seance: rpe,
        denivele_m: $('#crs-dplus').value,
        denivele_negatif_m: $('#crs-dmoins').value,
      });
      fermerFeuille();
      await apres?.();
      toast(
        `Course enregistrée : ${kmDit(sortie.km)} en ${dureeDite(sortie.duree_min)}` +
          (sortie.rpe_seance == null ? ' — sans RPE, elle ne compte pas dans la charge.' : `, RPE ${sortie.rpe_seance}.`),
        sortie.rpe_seance == null ? 'info' : 'succes',
      );
    } catch (e) {
      // Le message vient du MOTEUR (`journal.js`) — il est déjà écrit pour un humain, et celui
      // du `D− = 0` est le plus important de l'app. On ne le réécrit pas.
      toast(e.message, 'erreur');
    }
  };

  /**
   * 🔴 ROUVRIR LE FORMULAIRE — la fonction qui manquait, et son absence était un cul-de-sac.
   *
   * `ouvrirFeuille()` fait `replaceChildren()` : ouvrir une explication par-dessus le formulaire
   * **le DÉTACHE**. Avant ce correctif, taper le « ? » du dénivelé — un bouton que l'app offre
   * elle-même — **détruisait la saisie en cours**, et son bouton « Revenir à ma course » ne
   * revenait à **rien** : il fermait la feuille sur un formulaire qui n'existait plus. *(Même
   * motif que « Revenir » sur la note de RPE, corrigé le 2026-07-12 côté muscu.)*
   *
   * Le nœud `corps`, lui, **survit** : il est détaché, pas détruit, et un `<input>` garde sa
   * `value` en mémoire. Le ré-attacher **restitue la saisie au caractère près** — y compris le
   * RPE déjà tapé, qui vit dans la fermeture (`rpe`) et sur les `aria-pressed` des boutons.
   */
  const rouvrir = () =>
    ouvrirFeuille({
      titre: 'Loguer une course',
      corps,
      items: [{ libelle: 'Enregistrer la course', classe: 'feuille-item--primaire', faire: enregistrer }],
      fermer: 'Annuler',
    });

  rouvrir();
}

/** @param {() => void} revenir  ramène au formulaire — il n'est plus détruit. */
function expliquerDenivele(revenir) {
  ouvrirFeuille({
    titre: 'Le dénivelé',
    items: [{ libelle: 'Revenir à ma course', classe: 'feuille-item--primaire', faire: revenir }],
    corps: blocPourquoi([
      {
        label: SAIT,
        texte:
          "**C'est la DESCENTE qui casse, pas la montée.** À **−20 %** de pente, courir coûte **deux fois moins** " +
          "d'énergie qu'à plat (1,73 contre 3,40 J·kg⁻¹·m⁻¹, Minetti 2002) — **et c'est pourtant elle qui abîme** : " +
          "elle est **excentrique**. La charge affichée (RPE × durée) **ne la voit pas**, et le moteur le dit plutôt " +
          "que de la rustiner avec une constante inventée.",
      },
      {
        label: IGNORE,
        sourdine: true,
        texte:
          "**Le D− ne se déduit PAS du D+.** Sur une boucle ils s'égalent ; sur un point-à-point, non — un parcours " +
          "peut afficher **200 m de D+ et 1 800 m de D−**, et c'est exactement le profil le plus agressif pour un " +
          "tendon.\n\n🔴 **Laisse le champ VIDE si tu ne sais pas. Jamais `0`.** « Je ne sais pas » et « il n'y en a " +
          "pas » ne sont pas la même chose : un zéro faux **éteint le seul signal de fatigue mesurable** de ce moteur.",
      },
    ]),
    fermer: 'Fermer',
  });
}

// ══════════════════════════════════════════════════════════════════════
// 2. 🔴 LA JAUGE UNIFIÉE — muscu + course, une seule charge
// ══════════════════════════════════════════════════════════════════════

/**
 * `1 240` — un entier. **Et s'il repose en partie sur une valeur IMPUTÉE, il est ARRONDI À 10.**
 *
 * La taxonomie de `valeurs.js` est non négociable : *« la précision affichée est une déclaration de
 * confiance »*. Une somme qui contient une estimation **EST** une estimation — elle ne se blanchit
 * pas en s'additionnant à des chiffres exacts. Le « ~ » est posé par la CSS (`.val--est::before`) ;
 * l'arrondi grossier, lui, la CSS ne sait pas le faire : il est ici.
 */
const auDit = (au, estime) => derive(estime ? Math.round(au / 10) * 10 : Math.round(au));

/**
 * La carte de charge. **Une semaine, deux filières, une somme.**
 *
 * @param {object|null} charge  `chargesHebdo()` — `null` = rien n'a jamais été logué.
 * @returns {Node|null}
 */
export function carteCharge(charge) {
  const carte = el('section', 'carte crs-charge');
  carte.append(el('h2', 'carte-titre', 'Charge — muscu + course'));

  const lundi = lundiDe(dateLocale());
  const semaines = charge?.semaines ?? [];
  const s = semaines.find((x) => x.lundi === lundi) ?? null;
  const precedente = semaines.filter((x) => x.lundi < lundi).at(-1) ?? null;

  // 🔴 Rien cette semaine → « — ». Pas une phrase, pas un « commence à t'entraîner ! ».
  // L'ÉTAT est : aucune séance loguée depuis lundi. Le tiret le dit.
  const estime = Boolean(s && s.part_estimee_pct > 0);
  const total = el('div', 'crs-total');
  total.append(
    el('span', `val val--strong ${estime ? 'val--est' : 'val--der'}`, s ? auDit(s.total_au, estime) : '—'),
    el('span', 'crs-unite', 'AU · cette semaine'),
  );
  carte.append(total);

  // Les deux filières, SÉPARÉES et auditables (ADR 0006). C'est la ligne qui prouve la somme —
  // et c'est littéralement ce qu'aucune autre app ne sait écrire.
  const split = el('div', 'crs-split');
  split.append(
    el('span', 'crs-part', `Muscu <b>${s ? derive(Math.round(s.force_au)) : '—'}</b>`),
    el('span', 'crs-part', `Course <b>${s ? derive(Math.round(s.endurance_au)) : '—'}</b>`),
  );
  carte.append(split);

  // La semaine passée : une SOUSTRACTION entre deux faits, jamais une projection, jamais un
  // « tu es en forme ». Elle n'apparaît que si elle existe.
  if (precedente) {
    carte.append(
      el('p', 'crs-avant', `Semaine du ${echapper(precedente.lundi)} · <b>${derive(Math.round(precedente.total_au))}</b>`),
    );
  }

  // 🔴 Les séances SANS charge — le trou qui compte, et il ne se tait pas.
  // Une sortie sans RPE n'est pas dans la jauge. Une séance sans RPE **ni RIR** non plus.
  const sansCharge = s?.sans_charge ?? 0;
  if (sansCharge) {
    carte.append(
      el('p', 'crs-avant crs-avant--trou',
        `<b>${derive(sansCharge)}</b> séance${sansCharge > 1 ? 's' : ''} hors jauge — RPE manquant`),
    );
  }

  // …et la VÉRITÉ derrière le tap. Elle n'est pas supprimée : elle est DÉPLACÉE.
  const pourquoi = el('button', 'sc-charge-note', '<span class="why-mark" aria-hidden="true">?</span><span>D’où vient ce chiffre</span>');
  pourquoi.type = 'button';
  pourquoi.addEventListener('click', () => expliquerCharge(charge, s));
  carte.append(pourquoi);

  return carte;
}

/**
 * Le « pourquoi » de la jauge — **écrit par le MOTEUR, pas par l'app**.
 *
 * ⚠️ Le déictique interdit : la prose du moteur a été écrite pour un TERMINAL. Ici on ne reverse
 * que les champs qui se suffisent à eux-mêmes (`pourquoi`, `hypothese_centrale`, l'aveuglement à
 * la descente) — pas ceux qui renvoient à un « ci-dessous » qui ne désigne rien dans une feuille.
 */
function expliquerCharge(charge, semaine) {
  const parts = [];

  if (charge?.pourquoi) parts.push({ label: SAIT, texte: charge.pourquoi });

  // 🔴 L'HYPOTHÈSE CENTRALE DU PRODUIT, assumée à l'écran. Le moteur l'appelle par son nom.
  if (charge?.hypothese_centrale) {
    parts.push({ label: IGNORE, sourdine: true, texte: charge.hypothese_centrale });
  }

  // La calibration du RPE imputé : faite ou non, et sur combien de séances. Le moteur le dit.
  if (charge?.calibration?.pourquoi) {
    parts.push({
      label: charge.calibration.calibre ? 'Estimateur du RPE' : IGNORE,
      sourdine: !charge.calibration.calibre,
      texte: charge.calibration.pourquoi,
    });
  }

  // La part ESTIMÉE de la semaine — un chiffre, pas un adjectif.
  if (semaine?.part_estimee_pct > 0) {
    parts.push({
      label: 'Ce qui est imputé',
      texte:
        `**${semaine.part_estimee_pct} %** de la charge de cette semaine repose sur une valeur **IMPUTÉE** (un RPE ` +
        `déduit des RIR, ou une durée de séance déclarée dans le profil plutôt que mesurée). D'où le « ~ ».`,
    });
  }

  // ⛰️🔴 L'AVEUGLEMENT À LA DESCENTE — porté par la donnée elle-même (`charge.limite_descente`).
  const lim = charge?.limite_descente;
  if (lim) {
    parts.push({ label: 'Ce que cette charge ne voit pas', sourdine: true, texte: `${lim.quoi}\n\n${lim.pourquoi}` });
    if (lim.consequence) parts.push({ label: 'Conséquence', texte: lim.consequence });
  }

  const corps = blocPourquoi(parts);

  // Les sorties que la jauge SOUS-FACTURE — pointées une par une par le moteur, jamais rustinées.
  for (const d of charge?.descente_non_facturee ?? []) {
    corps.append(...blocPourquoi([{ label: `⛰️ ${d.date}`, texte: d.message }]).children);
  }

  if (lim?.source) corps.append(el('p', 'sc-source', echapper(lim.source)));

  ouvrirFeuille({ titre: 'Charge — muscu + course', sous: 'sRPE × durée (Foster) — la même unité pour un squat et pour un 10 km', corps, fermer: 'Fermer' });
}

// ══════════════════════════════════════════════════════════════════════
// 3. 🔴 LE CONFLIT DE PLACEMENT — le différenciateur livrable sans calibration
// ══════════════════════════════════════════════════════════════════════

/** « Legs → Séance de qualité (zone T) » — de la DONNÉE mise en forme, pas une phrase inventée. */
const ligneConflit = (c) =>
  `${echapper(c.date_jambes)} → ${echapper(c.date_course)} (≈ ${c.ecart_jours * 24} h) · ` +
  `${echapper(c.jambes.quoi)} → ${echapper(c.course.quoi)}`;

/**
 * Les lignes d'état du placement. **Ce que le moteur a OBSERVÉ**, pas ce qu'il prédit.
 *
 * `conflitsObserves` (src/lib/placement.js) : *« pas de jambes lourdes moins de 24–48 h avant une
 * séance de course qualitative »*. Il était écrit, testé, publié — et **appelé par le seul CLI**.
 *
 * ⚠️ Chaque ligne OUVRE quelque chose. Une ligne qui n'ouvre rien serait le signe qu'on a supprimé
 * une vérité au lieu de la déplacer.
 *
 * @param {object|null} placement  `conflitsObserves()`
 * @returns {Node|null} `null` = rien à dire. Le silence est un état valide.
 */
export function lignesPlacement(placement) {
  const conflits = placement?.conflits ?? [];
  const limites = placement?.limites ?? [];
  const signaux = placement?.signaux_descente ?? [];
  if (!conflits.length && !limites.length && !signaux.length) return null;

  const zone = el('div', 'lignes-etat');

  if (conflits.length) {
    zone.append(ligneEtat({
      icone: '🦵',
      // Un FAIT, pas un reproche. « Ce n'est pas une faute morale : c'est un placement à corriger. »
      texte: `**${conflits.length}** conflit${conflits.length > 1 ? 's' : ''} de placement — jambes lourdes avant une séance-clé`,
      gravite: placement.durci ? 'critique' : 'alerte',
      go: 'Voir',
      faire: () => {
        const corps = el('div', 'why-block');
        const part = el('div', 'why-part');
        const ul = el('ul', 'puces');
        for (const c of conflits) ul.append(el('li', null, ligneConflit(c)));
        part.append(el('span', 'why-part-label', 'Ce qui a été observé'), ul);
        corps.append(part);
        // Le POURQUOI vient du moteur — l'app ne l'écrit pas.
        corps.append(...blocPourquoi([
          { label: SAIT, texte: placement.pourquoi },
          { label: 'La fenêtre appliquée', texte: placement.fenetre?.origine_declaree ?? '', sourdine: true },
        ]).children);

        // 🔴 LE DÉICTIQUE, RÉSOLU SUR PLACE — vu à l'écran, pas dans un test.
        //
        // `fenetre.origine_declaree` (écrit par le moteur) se termine par « **Voir `FENETRE_DESCENTE`** ».
        // C'est de la prose de TERMINAL : dans une feuille, un nom de constante ne désigne **rien**.
        // On ne réécrit pas la phrase du moteur (elle n'est pas à nous, et elle sert aussi au CLI) —
        // **on met sa cible juste en dessous.** Le pointeur cesse de pendre, et pas un mot ne se perd.
        const fd = placement.fenetre_descente;
        if (fd) {
          corps.append(...blocPourquoi([
            { label: 'Après une descente — ce que disent les données', texte: fd.ce_que_disent_les_donnees, sourdine: true },
            { label: "Ce que le moteur n'invente pas", texte: fd.ce_que_le_moteur_ne_fait_pas },
          ]).children);
        }

        if (placement.fenetre?.source) corps.append(el('p', 'sc-source', echapper(placement.fenetre.source)));
        ouvrirFeuille({ titre: 'Conflit de placement', sous: `Fenêtre ${echapper(placement.fenetre?.libelle ?? '—')}`, corps, fermer: 'Fermer' });
      },
    }));
  }

  if (limites.length) {
    zone.append(ligneEtat({
      icone: '⚠️',
      texte: `**${limites.length}** placement${limites.length > 1 ? 's' : ''} à la borne haute de la fenêtre`,
      faire: () => {
        const corps = el('div', 'why-block');
        const part = el('div', 'why-part why-part--unknown');
        const ul = el('ul', 'puces');
        for (const c of limites) ul.append(el('li', null, ligneConflit(c)));
        part.append(el('span', 'why-part-label', 'À la borne haute — signalé, pas traité comme une faute'), ul);
        corps.append(part);
        ouvrirFeuille({ titre: 'Borne haute de la fenêtre', corps, fermer: 'Fermer' });
      },
    }));
  }

  // ⛰️ Le signal de descente — l'angle mort que le moteur REFUSE de taire (la règle protège la
  // course contre les jambes lourdes ; elle ne dit RIEN du sens inverse). Chaque signal porte son
  // propre `pourquoi`, écrit par le moteur.
  if (signaux.length) {
    zone.append(ligneEtat({
      icone: '⛰️',
      texte: `**${signaux.length}** signal${signaux.length > 1 ? 'aux' : ''} de descente`,
      gravite: 'alerte',
      go: 'Voir',
      faire: () => {
        const corps = blocPourquoi(signaux.map((s) => ({ label: `${s.quand_descente} → ${s.quand_cible}`, texte: s.pourquoi })));
        const fd = placement.fenetre_descente;
        if (fd) {
          corps.append(...blocPourquoi([
            { label: 'Ce que disent les données', texte: fd.ce_que_disent_les_donnees, sourdine: true },
            { label: "Ce que le moteur n'invente pas", texte: fd.ce_que_le_moteur_ne_fait_pas },
          ]).children);
          if (fd.source) corps.append(el('p', 'sc-source', echapper(fd.source)));
        }
        ouvrirFeuille({ titre: 'Après une grosse descente', corps, fermer: 'Fermer' });
      },
    }));
  }

  return zone;
}

// ══════════════════════════════════════════════════════════════════════
// 4. Le bouton, et la dernière course
// ══════════════════════════════════════════════════════════════════════

/** Le geste. Il vit sur l'accueil de la séance : c'est l'écran qu'on ouvre 6 jours sur 7. */
export function boutonCourse(onTap) {
  const b = el('button', 'crs-cta');
  b.type = 'button';
  b.id = 'crs-loguer';
  b.append(
    el('span', 'crs-cta-i', '🏃'),
    el('span', 'crs-cta-t', 'Loguer une course'),
    el('span', 'crs-cta-go', '+'),
  );
  b.addEventListener('click', onTap);
  return b;
}

/**
 * La dernière course. Discrète, factuelle — et elle **prouve** que la course est entrée quelque
 * part : c'est la seule chose qui distingue une donnée écrite d'une donnée avalée.
 *
 * ⚠️ L'allure est un DÉRIVÉ exact (une division) : pas de « ~ ». La distance et la durée sont
 * MESURÉES. Aucun chiffre de cette carte ne sort d'un modèle.
 */
export function carteDerniereCourse(sorties, { onSupprimer } = {}) {
  const d = sorties?.at?.(-1);
  if (!d) return null;

  const c = el('section', 'carte');
  c.append(el('h2', 'carte-titre', 'Ta dernière course'));

  const l = el('div', 'sc-derniere');
  const t = trousDe(d);
  l.append(
    el('div', 'sc-derniere-nom', `${echapper(kmDit(d.km))} · ${echapper(nomZone(d.type))}`),
    el('div', 'sc-derniere-meta',
      `${echapper(d.date)} · <span class="val val--mes">${echapper(dureeDite(d.duree_min))}</span>` +
      ` · <span class="val val--der">${echapper(allureDite(d.km, d.duree_min))}</span>` +
      (t.sans_rpe ? ' · <b>RPE non noté</b>' : ` · RPE <span class="val val--mes">${d.rpe_seance}</span>`) +
      (d.denivele_m != null ? ` · ${derive(d.denivele_m, 'm')} D+` : '') +
      (d.denivele_negatif_m != null ? ` · ${derive(d.denivele_negatif_m, 'm')} D−` : '')),
  );
  c.append(l);

  // 🔴 Une donnée fausse empoisonne la jauge. Elle doit pouvoir PARTIR — sinon elle ment jusqu'à
  // la fin des temps (même règle que « Retirer l'objectif »).
  const actions = el('div', 'carte-actions');
  const suppr = el('button', 'state-btn state-btn--ghost', 'Retirer cette course');
  suppr.type = 'button';
  suppr.id = 'crs-supprimer';
  suppr.addEventListener('click', () =>
    ouvrirFeuille({
      titre: 'Retirer cette course ?',
      sous: `${echapper(kmDit(d.km))} · ${echapper(d.date)}. Elle sortira du carnet et de la jauge de charge.`,
      items: [
        { libelle: 'Garder', classe: 'feuille-item--primaire', faire: fermerFeuille },
        {
          libelle: 'Retirer',
          classe: 'feuille-item--danger',
          faire: async () => {
            await supprimerSortie(d.id);
            fermerFeuille();
            await onSupprimer?.();
            toast('Course retirée.', 'succes');
          },
        },
      ],
      fermer: 'Annuler',
    }));
  actions.append(suppr);
  c.append(actions);

  return c;
}
