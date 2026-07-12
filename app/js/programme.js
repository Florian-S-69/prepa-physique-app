/**
 * programme.js — l'onglet Programme. Un ÉCRAN, pas un article.
 *
 * ══════════════════════════════════════════════════════════════════════
 * Ce qu'il répare
 * ══════════════════════════════════════════════════════════════════════
 * Cet écran faisait **7 656 px** — dix hauteurs d'iPhone. On y lisait, à plat et
 * sans l'avoir demandé, une prose qui citait `(veille/18 §9.1, règle 2)` et
 * « ≈ −16 % de risque relatif, extrapolé des sports collectifs » — **à un homme
 * qui tient un haltère.** Un titre (« Ton programme ») annonçait le programme
 * au-dessus du programme. Huit contrôles en tout, aucun avant le troisième écran.
 *
 *   > « Je veux une application qu'on utilise comme un OUTIL, pas comme un
 *   >   INTERLOCUTEUR. L'intelligence de l'application doit se voir dans la
 *   >   PERTINENCE de ce qu'elle affiche, pas dans la QUANTITÉ de messages
 *   >   qu'elle envoie. »
 *
 * ══════════════════════════════════════════════════════════════════════
 * 🔴 LA RÈGLE : on retire la NARRATION, on garde l'ÉTAT.
 * ══════════════════════════════════════════════════════════════════════
 * **Aucune vérité n'est supprimée. Chacune est DÉPLACÉE derrière un tap.**
 *
 * Le mécanisme n'a pas été inventé ici : il existait **déjà**, à trois lignes de
 * là — le « Pourquoi ? » des substitutions d'exercice. Il était bon. Il n'était
 * simplement **appliqué nulle part ailleurs**. Le bloc d'échauffement, les règles
 * du moteur, les signaux à surveiller, l'hypothèse clinique, le renvoi médical :
 * tous se déversaient à plat. Ils passent tous derrière une **ligne d'état**
 * (`ligneEtat`, ui.js) qui ouvre la **feuille** (`design/sheet.js`).
 *
 * Une ligne dit **ce qui est**. Le tap dit **pourquoi**. Rien ne se perd —
 * et si une ligne n'ouvrait rien, ce serait le signe qu'on a supprimé au lieu
 * de déplacer. **C'est la seule régression qui compte ici.**
 *
 * ── L'app ne dit plus « je » ──────────────────────────────────────────
 * Elle ne dit pas non plus « le moteur ». Elle **montre un état**. La prose du
 * moteur (`src/lib/`) n'est pas réécrite — elle est **hors périmètre** — mais
 * elle n'est plus **déversée** : elle vit dans la feuille, mot pour mot,
 * consultable. Structurée, la rigueur devient consultable au lieu d'être subie.
 *
 * ── Rédaction ─────────────────────────────────────────────────────────
 * ⚠️ Aucune EXPLICATION n'est écrite par l'app. Toutes viennent du moteur
 * (`limitations.js`) ou du persona. L'app **étiquette** et **met en forme** ;
 * elle n'interprète pas — sinon les deux se mettraient à raconter deux histoires.
 */

import {
  $, afficherEcran, echapper, riche, el,
  ouvrirFeuille, blocPourquoi, ligneEtat, SAIT, IGNORE,
} from './ui.js';
import { genererProgramme } from './moteur.js';
import { chargeDepart, derive, mesureKg, NIVEAUX } from './valeurs.js';
// 🔴 Le moteur rend des DONNÉES pour ça : { type, gravite, titre, detail, source, cible }.
// `cible.exercice` est ce qui permet d'accrocher une adaptation SOUS l'exercice concerné,
// au lieu de l'empiler dans un mur en tête de page. Le contenant existait ; on s'en sert.
import { adaptationsMuscuEnAvis, avisDepuisTexte } from '../../src/lib/avis.js';

/** Une valeur typée par la taxonomie. Le « ~ » de l'estimé est posé par la CSS. */
function valeur(niveau, texte, fort = false) {
  const n = el('span', `val ${NIVEAUX[niveau].classe}${fort ? ' val--strong' : ''}`, echapper(texte));
  // Le niveau est lisible au lecteur d'écran : « estimé, 90 kg » — la nuance
  // visuelle ne doit pas être réservée aux voyants.
  n.setAttribute('aria-label', `${NIVEAUX[niveau].libelle} : ${texte}`);
  return n;
}

/** Une liste à puces, telle que le moteur l'a écrite. */
function puces(items, rendu = (x) => riche(String(x))) {
  const ul = el('ul', 'puces');
  for (const x of items) ul.append(el('li', null, rendu(x)));
  return ul;
}

/** Ouvre la feuille sur un contenu libre. Le « pourquoi » y vit ; il n'est plus déversé. */
function feuille(titre, corps, { sous = null, fermer = 'Fermer' } = {}) {
  ouvrirFeuille({ titre, sous, corps, fermer });
}

// ══════════════════════════════════════════════════════════════════════
// LES LIGNES D'ÉTAT — ce que le moteur a à dire, une ligne chacune
// ══════════════════════════════════════════════════════════════════════

/**
 * Ce qui doit se voir SANS scroller : la sécurité. Le reste attend plus bas.
 *
 * ⚠️ Ces lignes ne sont pas décoratives. Le renvoi médical et l'échauffement imposé
 * sont des garde-fous (`philosophy.md`, règle 3) : ils restent **au-dessus** du
 * sélecteur de jour. Ce qui change, c'est qu'ils tiennent en **une ligne** — leur
 * contenu, intact, est dans la feuille.
 */
/**
 * 🔴 LES ALERTES RÉPÈTENT LES BLOCS — ET ELLES SONT LES SEULES À PORTER CERTAINS FAITS.
 *
 * L'alerte d'échauffement résume le bloc d'échauffement. L'alerte « 🚑 renvoi » résume le
 * bloc de renvoi (elle dit même « voir le bloc en tête de programme »). Les afficher **en
 * plus** des blocs, c'était **dire deux fois la même chose** — et c'est comme ça qu'un écran
 * finit à 7 656 px.
 *
 * Mais les supprimer serait pire : **vérifié à l'écran**, elles sont les SEULES à porter
 * « ≈ −16 % de risque relatif », « extrapolé des sports collectifs », `veille/18 §9.1`,
 * « NON SKIPPABLE » et « Aucun échauffement ne gère ces signaux ». Le bloc d'échauffement,
 * lui, dit « l'effet mesuré est modeste (**voir ci-dessous**) » — et ce « ci-dessous »
 * ne menait nulle part.
 *
 * → On les **RANGE** dans la feuille du bloc qu'elles résument. Une ligne de moins à
 *   l'écran, pas un mot de moins dans l'app.
 *
 * ⚠️ Le rattachement se fait sur un mot du message : c'est **fragile**, et c'est assumé —
 * parce que l'échec est **sûr**. Une alerte qu'on ne sait pas rattacher **garde sa propre
 * ligne** (voir `restantes`). Elle peut faire doublon ; elle ne peut pas **disparaître**.
 */
export function rangerAlertes(l) {
  const pour = { echauffement: [], renvoi: [] };
  const restantes = [];
  for (const a of l?.alertes ?? []) {
    // ⚠️ Le renvoi D'ABORD : son message contient « Aucun échauffement ne gère ces
    //    signaux » — testé sur l'échauffement en premier, il tomberait dans la mauvaise
    //    feuille. L'ordre de ces deux lignes est le correctif.
    if (l?.renvois_pro?.length && /professionnel de santé/i.test(a)) pour.renvoi.push(a);
    else if (l?.echauffement?.impose && /échauff/i.test(a)) pour.echauffement.push(a);
    else restantes.push(a);
  }
  return { pour, restantes };
}

function rendreAvisHaut(p) {
  const l = p.limitations;
  const zone = el('div', 'lignes-etat');
  const { pour, restantes } = rangerAlertes(l);

  // 🩺 Renvoi vers un professionnel — le plus grave, et jamais enterré.
  for (const r of l?.renvois_pro ?? []) {
    zone.append(ligneEtat({
      icone: '🩺',
      texte: `**${echapper(r.libelle)}** — à faire examiner`,
      gravite: 'critique',
      faire: () => feuille(
        'À faire examiner',
        blocPourquoi([
          { label: 'Pourquoi', texte: r.message },
          ...pour.renvoi.map((a) => ({ label: 'Alerte du moteur', texte: a, sourdine: true })),
        ]),
      ),
    }));
  }

  // 🔥 L'ÉCHAUFFEMENT — une SECTION, pas une sommation.
  //
  // Il disait : « Échauffement **imposé** — 6 consignes ». Verdict de l'utilisateur : *« À la
  // limite, une petite section échauffement, pourquoi pas. Mais pas "échauffement imposé", tirer
  // six consignes. »* Deux fautes dans cinq mots :
  //   · **imposé** est un ordre — l'app somme au lieu de nommer un état ;
  //   · **6 consignes** annonce une conférence avant même de l'avoir ouverte. Un compteur qui
  //     prévient de la longueur de ce qu'on va lire est une raison de ne pas le lire.
  //
  // ⚠️ **Le CONTENU ne bouge pas d'un mot.** L'échauffement reste OBLIGATOIRE (une limitation
  //    ACTIVE le déclenche), la ligne garde sa gravité `alerte`, et la feuille contient toujours
  //    les six consignes, le constat, le « pourquoi imposé » et l'alerte du moteur — mot pour mot.
  //    On retire la MISE EN SCÈNE, pas la règle de sécurité.
  const e = l?.echauffement;
  if (e?.impose) {
    zone.append(ligneEtat({
      icone: '🔥',
      texte: 'Échauffement',
      gravite: 'alerte',
      go: 'Voir',
      faire: () => {
        const corps = el('div', 'why-block');
        const part = el('div', 'why-part');
        part.append(el('span', 'why-part-label', 'Les consignes'), puces(e.consignes ?? []));
        corps.append(part);
        // Le constat, le « pourquoi » et l'alerte du moteur — mot pour mot, derrière le
        // tap. Plus jamais à plat sur l'écran d'un homme qui tient un haltère.
        corps.append(...blocPourquoi([
          { label: SAIT, texte: e.constat },
          { label: 'Pourquoi imposé', texte: e.pourquoi, sourdine: true },
          ...pour.echauffement.map((a) => ({ label: 'Ce que ça vaut, honnêtement', texte: a, sourdine: true })),
        ]).children);
        feuille('Échauffement imposé', corps);
      },
    }));
  }

  // ⚠️ Les alertes qu'on n'a PAS su rattacher. Elles gardent leur ligne — le filet.
  //    `avisDepuisTexte` sépare l'essentiel du pourquoi ; la feuille rend le message
  //    d'ORIGINE, intact (`markdown`) : le découpage mécanique ne peut pas amputer.
  for (const brut of restantes) {
    const a = avisDepuisTexte(brut);
    if (!a) continue;
    zone.append(ligneEtat({
      icone: '⚠️',
      texte: a.titre,
      gravite: 'alerte',
      faire: () => feuille(
        'Alerte',
        blocPourquoi([{ label: 'Le message, en entier', texte: a.markdown }]),
      ),
    }));
  }

  // ⚠️ Ce qui n'a PAS pu être adapté — jamais silencieux, jamais supprimé.
  if (l?.non_appliquees?.length) {
    const n = l.non_appliquees;
    zone.append(ligneEtat({
      icone: '⚠️',
      texte: `**${n.length}** limitation${n.length > 1 ? 's' : ''} sans adaptation`,
      gravite: 'alerte',
      go: 'Voir',
      faire: () => {
        const corps = el('div', 'why-block');
        const part = el('div', 'why-part why-part--unknown');
        part.append(
          el('span', 'why-part-label', "Ce qui n'a pas pu être adapté"),
          puces(n, (x) => riche(x.message ?? x.pourquoi ?? String(x))),
        );
        corps.append(part);
        feuille('Sans adaptation', corps);
      },
    }));
  }

  return zone.children.length ? zone : null;
}

/**
 * La matière de référence : vraie, utile, et dont on n'a **pas** besoin maintenant.
 * Elle vit en bas de l'écran, une ligne chacune. Elle ne se déverse plus.
 */
function rendreAvisBas(p, persona) {
  const l = p.limitations;
  const zone = el('div', 'lignes-etat lignes-etat--bas');

  // 🔍 L'hypothèse clinique (stagnation × limitation).
  const h = l?.hypothese_clinique;
  if (h) {
    zone.append(ligneEtat({
      icone: '🔍',
      texte: 'Une hypothèse, pas un diagnostic',
      faire: () => {
        const corps = blocPourquoi([{ label: "L'hypothèse", texte: h.message, sourdine: true }]);
        if (h.source) corps.append(el('p', 'sc-source', echapper(h.source)));
        feuille('Une hypothèse, pas un diagnostic', corps);
      },
    }));
  }

  // 👀 Les signaux qui doivent faire lever le pied.
  if (l?.surveiller?.length) {
    zone.append(ligneEtat({
      icone: '👀',
      texte: `**${l.surveiller.length}** signaux à surveiller`,
      go: 'Voir',
      faire: () => {
        const corps = el('div', 'why-block');
        const part = el('div', 'why-part');
        part.append(
          el('span', 'why-part-label', 'Lever le pied si'),
          puces(l.surveiller, (s) => `<b>${echapper(s.libelle)}</b> — ${riche(s.signal)}`),
        );
        corps.append(part);
        feuille('Signaux à surveiller', corps);
      },
    }));
  }

  // 📐 Les règles du programme. (Elles disaient « les règles que LE MOTEUR s'impose ».)
  if (l?.regles?.length) {
    zone.append(ligneEtat({
      icone: '📐',
      texte: `**${l.regles.length}** règles sur ce programme`,
      go: 'Voir',
      faire: () => {
        const corps = el('div', 'why-block');
        const part = el('div', 'why-part');
        part.append(el('span', 'why-part-label', 'Les règles'), puces(l.regles));
        corps.append(part);
        feuille('Règles du programme', corps);
      },
    }));
  }

  // 📦 Les charges de référence mises de côté — la donnée n'est pas perdue, et on le montre.
  if (p.charges_non_appliquees?.length) {
    const c = p.charges_non_appliquees;
    zone.append(ligneEtat({
      icone: '📦',
      texte: `**${c.length}** charge${c.length > 1 ? 's' : ''} mise${c.length > 1 ? 's' : ''} de côté`,
      go: 'Voir',
      faire: () => {
        const corps = el('div', 'why-block');
        const part = el('div', 'why-part');
        part.append(
          el('span', 'why-part-label', 'Conservées, pas appliquées'),
          puces(c, (x) => riche(x.message)),
        );
        corps.append(part);
        feuille('Charges mises de côté', corps);
      },
    }));
  }

  // ❓ Sur quoi ce programme repose — les hypothèses, et la raison du split.
  const hyps = [...(p.hypotheses_programme ?? []), ...(persona.hypotheses ?? [])];
  if (hyps.length || p.note_split) {
    zone.append(ligneEtat({
      icone: '❓',
      texte: 'Sur quoi ce programme repose',
      go: 'Voir',
      faire: () => {
        const corps = el('div', 'why-block');
        if (p.note_split) {
          // La note du split vivait à plat, sous le titre. C'est une explication :
          // elle rejoint les autres, derrière le tap.
          const s = el('div', 'why-part');
          s.append(el('span', 'why-part-label', 'Le split'), el('p', null, riche(p.note_split)));
          corps.append(s);
        }
        if (hyps.length) {
          const part = el('div', 'why-part why-part--unknown');
          part.append(el('span', 'why-part-label', 'Hypothèses — à confirmer'), puces(hyps));
          corps.append(part);
        }
        feuille('Sur quoi ce programme repose', corps);
      },
    }));
  }

  return zone.children.length ? zone : null;
}

// ══════════════════════════════════════════════════════════════════════
// Un exercice
// ══════════════════════════════════════════════════════════════════════

/** Les avis du moteur qui concernent CET exercice. L'app filtre, elle ne parse pas. */
const avisDe = (exo, avis) =>
  avis.filter(
    (a) =>
      a.cible?.exercice === exo.nom ||
      a.cible?.remplace === exo.nom ||
      (a.cible?.pattern && a.cible.pattern === exo.pattern && !a.cible.exercice),
  );

/** La feuille d'un exercice : tout ce que le moteur a changé, et pourquoi. */
function montrerAvisExo(exo, siens) {
  const corps = el('div', 'sc-avis-liste');
  for (const a of siens) {
    const bloc = el('div', 'why-block');
    const p1 = el('div', 'why-part');
    // ⚠️ « Ce que LE MOTEUR a fait » — l'app parlait d'elle-même jusque dans ses
    // étiquettes. L'état se nomme ; il ne se raconte pas.
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
  feuille(exo.nom, corps);
}

/**
 * @param notesRef  nom d'exercice → note de `charges_reference` (le persona explique
 *                  LUI-MÊME pourquoi telle charge est une estimation).
 */
function rendreExercice(exo, notesRef, avis) {
  const li = el('li', 'exo');

  // ── Titre + badges ──────────────────────────────────────────────────
  const tete = el('div', 'exo-tete');
  tete.append(el('h3', 'exo-nom', echapper(exo.nom)));

  const badges = el('div', 'exo-badges');
  if (exo.substitue_depuis) badges.append(el('span', 'tag', '⇄ Remplacé'));
  if (exo.plafond_charge) badges.append(el('span', 'tag', '🔒 Plafonné'));
  if (exo.progression_prudente) badges.append(el('span', 'tag', '🐢 Prudent'));
  if (badges.children.length) tete.append(badges);
  li.append(tete);

  // ── La prescription : séries × reps · RIR · repos ────────────────────
  // Ce sont des CIBLES (ce qu'on te demande), pas des observations : ni accent,
  // ni traitement « mesuré ». La taxonomie ne s'applique qu'aux valeurs qui
  // prétendent décrire l'utilisateur.
  const presc = el('div', 'exo-presc');
  presc.append(
    el('span', 'presc-bloc', `<b>${exo.series}</b> × <b>${echapper(exo.reps)}</b><span class="presc-lab">séries × reps</span>`),
    el('span', 'presc-bloc', `<b>${echapper(exo.rir)}</b><span class="presc-lab">RIR</span>`),
    el('span', 'presc-bloc', `<b>${echapper(exo.repos)}</b><span class="presc-lab">repos</span>`),
  );
  li.append(presc);

  // ── LA CHARGE — le point d'honnêteté ────────────────────────────────
  // L'ÉTAT reste (estimée · mesurée · à établir), et il se VOIT. C'est sa mise en
  // MOTS qui passe derrière le « ? ». Un champ sans valeur affiche « à établir » ;
  // il ne dit pas « le moteur ne connaît pas ta charge ».
  const { niveau, texte } = chargeDepart(exo);
  const ligne = el('div', 'exo-charge');
  ligne.append(el('span', 'exo-charge-lab', 'Charge de départ'));

  const source = exo.substitue_depuis ?? exo.nom;
  let parts = null;

  if (niveau === 'est') {
    // 🔴 ESTIMÉ : « ~ » (posé par la CSS), arrondi à 5 kg, aucun accent, « ? » obligatoire.
    ligne.append(valeur('est', texte), el('span', 'tag tag--warn', 'Estimée, pas mesurée'));
    parts = [
      {
        label: SAIT,
        texte:
          `Cette charge est un **point de départ prudent**, pas une mesure. Le **RIR est relevé à ${echapper(exo.rir)}** ` +
          `en conséquence : pas de lourd à quasi-échec sur une charge qui n'a **pas été mesurée**.`,
      },
      {
        label: IGNORE,
        sourdine: true,
        texte:
          `${notesRef.get(source) ? `Ta propre note sur « ${source} » : _${notesRef.get(source)}_\n\n` : ''}` +
          `**Ta vraie charge d'aujourd'hui, personne ne la connaît** — toi non plus, tu l'as déclarée « à re-tester ». ` +
          `Fais-en une **séance de re-test** : montée en charge progressive, 2–3 reps par palier, on s'arrête dès que la ` +
          `technique bouge. Une fois la charge réelle loguée, la prescription repart du réel.`,
      },
    ];
  } else if (niveau === 'mes') {
    // MESURÉ : c'est TA donnée, précision pleine. Seul niveau qui a droit à l'accent.
    ligne.append(valeur('mes', texte, true));
    if (exo.plafond_charge && exo.charge_max_kg != null) {
      ligne.append(el('span', 'tag tag--warn', `🔒 Plafond ${mesureKg(exo.charge_max_kg)}`));
    }
    if (exo.plafond_charge && exo.plafond_pourquoi) {
      parts = [
        { label: 'Pourquoi ce plafond', texte: exo.plafond_pourquoi },
        {
          label: IGNORE,
          sourdine: true,
          texte:
            "Aucun seuil de charge « sûr » n'existe dans la littérature pour un tendon : **aucun chiffre n'est fabriqué ici**. " +
            "Le plafond retenu est **ta** dernière charge tolérée — ta donnée, pas une valeur inventée.",
        },
      ];
    }
  } else {
    // Pas de charge du tout : on le dit, on n'invente pas un nombre.
    ligne.append(el('span', 'exo-charge-vide', 'à établir'));
    if (exo.charge_a_confirmer) {
      parts = [
        {
          label: IGNORE,
          sourdine: true,
          texte:
            `**Aucune charge n'est affichée ici : il n'y en a pas.** ${
              exo.substitue_depuis
                ? `« ${echapper(exo.substitue_depuis)} » a été remplacé par cet exercice, et ta charge de référence ne s'y transporte pas telle quelle (mouvement différent).`
                : "Tu n'as pas déclaré de charge de référence sur cet exercice."
            } Ton RIR est relevé à **${echapper(exo.rir)}** en attendant.`,
        },
        {
          label: 'Ce qu’il faut faire',
          texte:
            'Inventer un chiffre plausible serait la pire option : tu le suivrais. Première séance = **séance de ' +
            'calibration**. Monte progressivement, arrête-toi quand la technique bouge, et logue ce que tu as ' +
            'réellement fait.',
        },
      ];
    }
  }

  // Le « ? » — la vérité est là, en un tap. Pas de pavé, pas d'accordéon.
  if (parts) {
    const q = el('button', 'exo-why');
    q.type = 'button';
    q.setAttribute('aria-label', `Pourquoi cette charge sur ${exo.nom} ?`);
    q.append(el('span', 'why-mark', '?'));
    q.addEventListener('click', () => feuille(exo.nom, blocPourquoi(parts), { sous: 'Charge de départ' }));
    ligne.append(q);
  }
  li.append(ligne);

  // ── Ce que le moteur a changé sur CET exercice — une ligne, un tap ───
  // C'est ce que `avis.js` rend possible : `cible.exercice` accroche l'adaptation
  // sous l'exercice concerné. Les 14 adaptations ne s'empilent plus en tête de page.
  const siens = avisDe(exo, avis);
  if (siens.length) {
    const chip = el('button', 'sc-avis');
    chip.type = 'button';
    chip.append(
      el('span', 'sc-avis-icone', '⚠️'),
      el('span', null, `<b>Modifié</b> — ${siens.length} adaptation${siens.length > 1 ? 's' : ''}`),
      el('span', 'sc-avis-go', 'Pourquoi ?'),
    );
    chip.addEventListener('click', () => montrerAvisExo(exo, siens));
    li.append(chip);
  }

  if (exo.consigne) li.append(el('p', 'exo-consigne', `💡 ${echapper(exo.consigne)}`));
  // ⚠️ « Machine prise ? → X » posait une QUESTION. Un écran ne t'interroge pas :
  //    il nomme l'état. La donnée (l'alternative) est identique.
  if (exo.alternative) li.append(el('p', 'exo-alt', `Alternative · <b>${echapper(exo.alternative)}</b>`));

  return li;
}

// ══════════════════════════════════════════════════════════════════════
// L'écran
// ══════════════════════════════════════════════════════════════════════

let etat = null; // { persona, programme, notesRef, avis, jour }

/**
 * 🔴 LE JOUR N'EST PAS LA SÉANCE — et cet écran les confondait.
 *
 * Le sélecteur affiche la SEMAINE (7 jours, quand il court). `p.seances` est le CYCLE du split
 * (3 séances en PPL). `rendreJour(i)` faisait `p.seances[i]` : à partir du **jeudi**, l'index
 * sortait du tableau, `seance.nom` levait un `TypeError` et **le panneau restait vide.**
 * **Quatre onglets sur sept étaient morts** — celui du dimanche compris.
 *
 * Personne ne l'avait vu parce que le libellé du jour RECOPIAIT le nom de la séance : à l'œil,
 * « Jeudi — Push » avait l'air branché sur quelque chose. **Un nom recopié n'est pas un lien.**
 * Le moteur rend désormais le lien (`programme.semaine[i].seance` = l'index réel), et un jour
 * sans séance (course, repos) est un ÉTAT que cet écran sait rendre — plus un trou où il tombe.
 */
const jourDe = (p, i) => p.semaine?.[i] ?? { seance: i, course: null, jambes_lourdes: false };

/**
 * Ce que le PLACEMENT dit de ce jour-là — une ligne, le pourquoi derrière le tap.
 *
 * Le moteur produit deux faits par jour (`semaine[i]`) : la séance laisse-t-elle les jambes
 * lourdes, et ce jour porte-t-il la séance-clé de course ? Ils étaient **imprimés dans le
 * libellé de l'onglet** (« Legs 🦵 _(jambes lourdes)_ »). Ils reviennent ici : sous la séance
 * concernée, en une ligne, avec la règle complète — celle du moteur, mot pour mot — sous le doigt.
 */
function lignePlacement(p, j) {
  if (!p.placement || (!j.jambes_lourdes && !j.course_qualitative)) return null;
  const pourquoi = () => blocPourquoi([
    { label: SAIT, texte: p.placement.pourquoi },
    { label: 'La fenêtre appliquée', texte: p.placement.fenetre?.origine_declaree ?? '', sourdine: true },
  ]);

  const zone = el('div', 'lignes-etat');
  if (j.jambes_lourdes) {
    zone.append(ligneEtat({
      icone: '🦵',
      texte: 'Jambes lourdes',
      faire: () => feuille('Jambes lourdes', pourquoi()),
    }));
  }
  if (j.course_qualitative) {
    zone.append(ligneEtat({
      icone: '🏃',
      texte: 'Séance-clé — à protéger',
      faire: () => feuille('Séance-clé', pourquoi()),
    }));
  }
  return zone;
}

function rendreJour(i) {
  etat.jour = i;
  const { programme: p, avis } = etat;
  const j = jourDe(p, i);
  const seance = j.seance != null ? p.seances[j.seance] : null;

  for (const b of document.querySelectorAll('.jour-btn')) {
    const actif = Number(b.dataset.jour) === i;
    b.classList.toggle('est-actif', actif);
    b.setAttribute('aria-selected', String(actif));
  }

  const hote = $('#seance-detail');
  hote.replaceChildren();

  // Un jour SANS séance de salle n'est pas une panne : c'est une course, ou du repos. On le
  // NOMME. (Avant, on y lisait un panneau vide et une exception dans la console.)
  if (!seance) {
    hote.append(el('h2', 'seance-nom', echapper(j.course ?? 'Repos')));
    const l = lignePlacement(p, j);
    if (l) hote.append(l);
    return;
  }

  hote.append(el('h2', 'seance-nom', echapper(seance.nom)));
  // La liste des muscles vit ICI, où l'on PLANIFIE — pas dans le titre, où elle passait à la
  // ligne, ni dans l'en-tête d'une séance en cours, où elle était tronquée en plein mot.
  if (seance.focus) hote.append(el('p', 'seance-focus', echapper(seance.focus)));

  // 🦵 « Jambes lourdes » : une ligne d'état, à sa place — sur la séance qui les fabrique, et
  // seulement là. C'était un décor collé à l'onglet du jour, qui triplait sa largeur.
  const placementDuJour = lignePlacement(p, j);
  if (placementDuJour) hote.append(placementDuJour);

  // Trois chiffres de tête, pas quatre. Tous DÉRIVÉS : des sommes exactes sur le
  // programme, pas des modèles.
  const series = seance.exercices.reduce((n, e) => n + e.series, 0);
  const stats = el('div', 'seance-stats');
  for (const [v, lab] of [
    [derive(seance.exercices.length), 'exercices'],
    [derive(series), 'séries'],
    [derive(p.frequence, '×/sem'), 'par muscle'],
  ]) {
    const s = el('div', 'stat');
    s.append(valeur('der', v), el('span', 'stat-lab', lab));
    stats.append(s);
  }
  hote.append(stats);

  // ⛔ Un exercice RETIRÉ de cette séance n'a plus de carte où vivre — et c'est
  // précisément le genre de vérité qui disparaîtrait sans qu'on s'en aperçoive.
  // Il garde sa ligne, ici, dans la séance dont il a été retiré.
  const retires = (etat.programme.limitations?.retraits ?? []).filter((r) => r.seance === seance.nom);
  if (retires.length) {
    const zone = el('div', 'lignes-etat');
    for (const r of retires) {
      zone.append(ligneEtat({
        icone: '⛔',
        texte: `**${r.exercice}** — retiré de cette séance`,
        gravite: 'alerte',
        faire: () => feuille(r.exercice, blocPourquoi([{ label: 'Pourquoi retiré', texte: r.pourquoi }]), {
          sous: 'Retiré du programme',
        }),
      }));
    }
    hote.append(zone);
  }

  const ul = el('ul', 'exos');
  for (const exo of seance.exercices) ul.append(rendreExercice(exo, etat.notesRef, avis));
  hote.append(ul);
}

// ══════════════════════════════════════════════════════════════════════
// 🔴 LA CIBLE — l'ÉTAT, pas la NARRATION
// ══════════════════════════════════════════════════════════════════════
//
// > *« 100 kg au développé couché » ne veut rien dire sans savoir qu'on est à 80.*
//
// Le **record** est le dénominateur ; l'**écart** est la seule chose actionnable. Les deux sont
// **mesurés** — ils sortent du carnet (`records.js`), jamais d'un modèle et jamais du persona.
//
// ⚠️ **Ce qui n'est pas mesurable affiche `—`.** Pas une phrase, pas une estimation, pas un « tu
// y seras en 12 semaines ». Un chiffre plausible serait la pire des réponses : **il le suivrait.**
// La raison, elle, ne disparaît pas — elle attend **derrière le tap** (`cible.pourquoi`, écrit
// par le moteur).
function rendreCible(cible) {
  if (!cible) return null; // aucune cible = aucune ligne. Le silence est un état valide.

  const zone = el('div', 'lignes-etat');
  const kg = (v) => `${String(v).replace('.', ',')} kg`;

  // L'écart : une SOUSTRACTION entre deux faits. Jamais une projection.
  const etatTexte = () => {
    if (cible.statut === 'REFUSE') return `**${echapper(cible.exercice ?? 'Objectif')}** — objectif refusé`;
    if (cible.atteint) return `**${echapper(cible.exercice)}** — 🎯 cible atteinte (${kg(cible.charge_cible_kg)})`;

    const record = cible.record;
    // 🔴 LE `0 kg` NE PEUT PAS SORTIR : `au_poids_du_corps` l'interdit, le record est en REPS.
    const recordTxt = !record
      ? '—'
      : record.au_poids_du_corps
        ? `${record.reps} reps`
        : `${kg(record.charge_kg)} × ${record.reps}`;
    const ecartTxt = cible.ecart_kg == null ? '—' : `+${kg(cible.ecart_kg)}`;

    return (
      `**${echapper(cible.exercice)}** → **${kg(cible.charge_cible_kg)}** · ` +
      `record ${recordTxt} · écart ${ecartTxt}`
    );
  };

  zone.append(ligneEtat({
    icone: cible.statut === 'REFUSE' ? '⛔' : cible.atteint ? '🎯' : '🎯',
    texte: etatTexte(),
    // Le vocabulaire de gravité existe déjà (`ligne-etat--critique` / `--alerte`) : on l'emploie,
    // on n'en invente pas un troisième que la CSS ne connaîtrait pas.
    gravite: cible.statut === 'REFUSE' ? 'critique' : cible.statut === 'ADAPTE' ? 'alerte' : 'info',
    faire: () => {
      const parts = [];

      if (cible.record) {
        parts.push({
          label: SAIT,
          texte:
            `Ton record sur **${cible.exercice}** : ` +
            (cible.record.au_poids_du_corps
              ? `**${cible.record.reps} reps au poids du corps**, le ${cible.record.date}.`
              : `**${kg(cible.record.charge_kg)} × ${cible.record.reps}**, le ${cible.record.date}.`) +
            `\n\nIl n'est **pas saisi** : il est **DÉRIVÉ de ton carnet** — la meilleure série qu'il ait vue, ` +
            `au sens de la **double progression** (la charge d'abord ; à charge égale, les reps). C'est l'ordre ` +
            `que ton programme te demande de suivre : **battre ton record, c'est littéralement faire ce qu'il ` +
            `prescrit.**`,
        });
      }

      // La progression : MESURÉE, ou `—`. Il n'y a pas de troisième porte.
      parts.push(
        cible.progression
          ? {
              label: 'Progression mesurée',
              texte:
                `**${cible.progression.delta_kg >= 0 ? '+' : ''}${kg(cible.progression.delta_kg)}** sur ` +
                `**${cible.progression.semaines} semaines** (${cible.progression.seances} séances, ` +
                `du ${cible.progression.depuis} au ${cible.progression.jusqua}).\n\n` +
                `⚠️ **C'est ce qui a été MESURÉ — ce n'est pas une prévision.** Le moteur ne l'extrapole pas : ` +
                `il ne te dira **jamais** « à ce rythme, tu y seras en N semaines ». Une progression passée n'est ` +
                `pas une promesse d'avenir, et un chiffre plausible serait la pire des réponses — **tu le suivrais.**`,
            }
          : {
              label: IGNORE,
              sourdine: true,
              texte:
                `**Progression : —.** Le carnet n'a pas encore de quoi la **mesurer** (il faut au moins 3 séances ` +
                `de cet exercice, étalées sur au moins une semaine).\n\n` +
                `Le moteur **n'estime pas** ce qu'il ne peut pas mesurer. **Il affiche un tiret, et il continue de compter.**`,
            },
      );

      // Le POURQUOI du moteur : refus, adaptation, aveu. L'app ne l'écrit pas — elle le rend.
      for (const p of cible.pourquoi ?? []) {
        parts.push({ label: cible.statut === 'REFUSE' ? 'Refus du moteur' : 'Ce que ça change', texte: p });
      }

      feuille(
        cible.statut === 'REFUSE' ? 'Objectif refusé' : 'Ton objectif',
        blocPourquoi(parts),
        { sous: cible.echeance ? `Échéance : ${cible.echeance}` : null },
      );
    },
  }));

  return zone;
}

function rendre() {
  const { persona, programme: p, cible } = etat;
  const hote = $('#prog');
  hote.replaceChildren();

  // ── En-tête ─────────────────────────────────────────────────────────
  // Le split, et rien qui l'annonce. « Ton programme » posé au-dessus du programme
  // était du texte qui explique ce qu'on voit déjà — le premier signe de la pâte IA.
  const tete = el('header', 'prog-tete');
  tete.append(
    el('span', 'kicker', `Muscu · ${echapper(p.objectif)} · ${echapper(p.niveau)}`),
    el('h1', 'prog-split', echapper(p.split)),
  );
  hote.append(tete);

  // ── 🔴 La SÉCURITÉ, avant le sélecteur de jour. Une ligne chacune. ───
  // ⚠️ **Et avant l'objectif.** Vérifié à l'écran : la ligne de cible s'était glissée AU-DESSUS du
  // renvoi médical (« épaule droite — à faire examiner »). Un objectif chiffré qui passe devant un
  // garde-fou de santé, c'est la hiérarchie du produit à l'envers (`philosophy.md` §3). La cible est
  // importante ; elle n'est pas plus importante qu'une épaule à faire examiner.
  const haut = rendreAvisHaut(p);
  if (haut) hote.append(haut);

  // ── 🎯 L'OBJECTIF — le record, et l'écart. Une ligne, le reste derrière un tap. ──
  const ligneCible = rendreCible(cible);
  if (ligneCible) hote.append(ligneCible);

  // ── Le sélecteur de jour — le CONTRÔLE, atteignable sans scroller ───
  const nav = el('nav', 'jours');
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Jours du programme');
  // 🔴 DU MARKDOWN BRUT s'affichait ici (« **Lundi** », « Legs 🦵 _(jambes lourdes)_ ») :
  // quand l'utilisateur court, `jours` vient de `placement` (muscu.js), qui écrit du
  // Markdown — comme partout, puisque le moteur rend aussi du Markdown en CLI. Cet écran
  // l'échappait au lieu de le STYLISER. `riche()` échappe PUIS stylise : la protection
  // contre l'injection est identique.
  //
  // ⚠️ Un onglet porte UN JOUR et UN NOM. Rien d'autre. Le marqueur « 🦵 (jambes lourdes) »
  //    y était collé : l'onglet du mercredi devenait trois fois plus large que les autres et
  //    poussait jeudi → dimanche hors de l'écran. Le fait n'est pas perdu — il est descendu
  //    sous la séance (`lignePlacement`), là où il veut dire quelque chose.
  p.jours.forEach((nom, i) => {
    const b = el('button', 'jour-btn');
    b.type = 'button';
    b.dataset.jour = String(i);
    b.setAttribute('role', 'tab');
    const [num, titre] = nom.split(' — ');
    b.append(el('span', 'jour-num', riche(num.replace('Jour ', 'J'))), el('span', 'jour-nom', riche(titre ?? nom)));
    b.addEventListener('click', () => rendreJour(i));
    nav.append(b);
  });
  hote.append(nav);

  const detail = el('div', 'seance-detail');
  detail.id = 'seance-detail';
  hote.append(detail);

  // ── La matière de référence : vraie, utile, et pas maintenant ────────
  const bas = rendreAvisBas(p, persona);
  if (bas) hote.append(bas);

  // Le disclaimer médical RESTE À PLAT — c'est sa place (philosophy §3) : un avertissement légal
  // derrière un tap n'avertit personne. Mais deux phrases pour dire une chose en font une prose :
  // la première n'existait que pour poser la seconde. Une phrase, le même fait.
  hote.append(
    el('p', 'mentions', "Information générale — ne remplace pas l'avis d'un professionnel de santé."),
  );

  hote.hidden = false;
  rendreJour(0);
}

/** Squelette pendant que le moteur charge le référentiel (848 Ko) et calcule. */
function squelette() {
  const z = $('#prog-etat');
  z.replaceChildren();
  const sk = el('div', 'sk-stack');
  sk.innerHTML =
    '<div class="sk sk-line sk-line--lg"></div><div class="sk sk-line sk-line--sm"></div>' +
    '<div class="sk sk-block"></div><div class="sk sk-block"></div><div class="sk sk-block"></div>';
  // ⚠️ « Le moteur calcule ton programme… » — l'app parlait d'elle-même jusque dans
  //    son écran d'attente. Un état, pas un narrateur.
  z.append(sk, el('p', 'state-hint', '<span class="spinner"></span> Calcul du programme…'));
  z.hidden = false;
}

/**
 * 🔴 L'ÉTAT VIDE — l'app publiée arrive ICI, à son tout premier démarrage.
 *
 * Elle n'a **pas de profil** : le persona de développement n'est pas publié
 * (voir amorce.js). Ce n'est pas une panne, c'est un utilisateur neuf — et le
 * dire avec un écran d'erreur rouge serait mentir sur ce qui se passe.
 *
 * ⚠️ Le titre disait « **Le moteur ne sait rien de toi** ». C'est l'app qui se
 * met en scène pour annoncer un état vide. L'état, c'est : aucun profil.
 */
function vide() {
  const z = $('#prog-etat');
  z.replaceChildren();

  const d = el('div', 'state state--screen');
  d.append(
    el('h2', 'state-title', 'Aucun profil sur cet appareil'),
    el(
      'p',
      'state-msg',
      'Pas de profil, donc pas de programme. C’est normal au premier démarrage : ' +
        '<b>rien ne part d’ici, et rien n’y arrive tout seul.</b> Importe une sauvegarde pour retrouver tes données.',
    ),
  );

  const actions = el('div', 'state-actions');
  const b = el('button', 'state-btn', 'Importer mes données');
  b.type = 'button';
  b.addEventListener('click', () => {
    afficherEcran('donnees');
    $('#btn-import').click();
  });
  actions.append(b);
  d.append(actions);

  z.append(d);
  z.hidden = false;
}

function erreur(e) {
  const z = $('#prog-etat');
  z.replaceChildren();
  const d = el('div', 'state state--screen state--error');
  d.append(
    el('h2', 'state-title', 'Programme indisponible'),
    el('p', 'state-msg', echapper(e.message)),
  );
  const actions = el('div', 'state-actions');
  const b = el('button', 'state-btn', 'Réessayer');
  b.addEventListener('click', () => afficherProgramme());
  actions.append(b);
  d.append(actions);
  z.append(d);
  z.hidden = false;
  // Une erreur ne doit pas être un cul-de-sac (states.css) — d'où le bouton.
  console.error('[programme]', e);
}

/** Point d'entrée : IndexedDB → moteur → écran. */
export async function afficherProgramme() {
  $('#prog').hidden = true;
  squelette();
  try {
    const resultat = await genererProgramme();

    // Pas de profil : ce n'est pas un échec. Voir vide().
    if (!resultat) {
      etat = null;
      vide();
      return null;
    }
    // 🔴 `cible` et `records` viennent du MOTEUR (adaptation.js → objectif.js / records.js).
    // L'app ne les recalcule pas : elle les AFFICHE. Deux calculs, deux vérités qui divergeraient.
    // 🏃 `charge` (la jauge unifiée sRPE) et `placement` (le conflit jambes lourdes ↔ séance-clé)
    //    aussi — et jusqu'au 2026-07-12, cette ligne les JETAIT. Elles sortent du même tour de
    //    moteur ; l'écran de séance les consomme (`initSeance`). On ne fait pas tourner le moteur
    //    deux fois pour afficher deux vues du même journal.
    const { persona, programme, cible, charge, placement } = resultat;

    // Le persona explique lui-même pourquoi telle charge est une estimation :
    // on garde ses notes sous la main pour les « ? ».
    const notesRef = new Map();
    for (const [nom, ref] of Object.entries(persona.muscu.charges_reference ?? {})) {
      if (ref?.note) notesRef.set(nom, ref.note);
    }

    // Les adaptations, en DONNÉES. Chacune porte son exercice cible : elle s'affiche
    // SOUS lui, au moment où on le regarde — pas dans un mur en tête de programme.
    const avis = programme.limitations ? adaptationsMuscuEnAvis(programme.limitations) : [];

    etat = { persona, programme, notesRef, avis, cible, jour: 0 };
    $('#prog-etat').hidden = true;
    $('#prog-etat').replaceChildren();
    rendre();
    return { persona, programme, cible, charge, placement };
  } catch (e) {
    erreur(e);
    throw e;
  }
}
