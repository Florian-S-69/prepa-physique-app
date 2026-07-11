/**
 * programme.js — le premier écran RÉEL. Le moteur y devient visible.
 *
 * ── Ce que cet écran doit prouver ───────────────────────────────────────
 * 1. Le moteur tourne **dans le navigateur**, sur les **vraies** données de
 *    l'utilisateur sorties d'IndexedDB. Aucun rendu pré-calculé, aucun Markdown
 *    d'`out/`, aucune donnée en dur.
 * 2. **Les adaptations liées aux limitations sont VISIBLES.** C'est le cœur
 *    du produit : quand une limitation d'épaule est ACTIVE, le moteur retire la
 *    poussée verticale, substitue le développé couché vers la Smith, plafonne
 *    le curl, relève le RIR, impose l'échauffement et renvoie vers un pro —
 *    **en expliquant pourquoi**. Ce « pourquoi » n'est pas une note de bas
 *    de page : c'est le produit. Il est donc en HAUT, avant les exercices.
 * 3. **Honnêteté de l'affichage.** Ses charges en barre libre sont des
 *    ESTIMATIONS PRUDENTES, pas des mesures. Elles portent le « ~ »,
 *    l'arrondi grossier, aucun accent, et un « Pourquoi ? » obligatoire
 *    (voir valeurs.js). Un estimé peint comme un mesuré est un mensonge.
 *
 * ── Ce que cet écran n'est PAS ──────────────────────────────────────────
 * Ce n'est pas le **log de séance** (le geste des 6×/semaine). La piste
 * design le refond en ce moment (bouton ancré, chrono armé au même tap).
 * On l'intégrera après. Ici, on LIT son programme ; on ne le logue pas.
 *
 * ── Rédaction des « Pourquoi ? » ────────────────────────────────────────
 * ⚠️ Aucun texte d'explication n'est écrit par l'app. **Tous** viennent du
 * moteur (`limitations.js`) ou du persona lui-même. L'app met en forme, elle
 * n'interprète pas — sinon les deux se mettraient à raconter deux histoires.
 */

import { $, afficherEcran } from './ui.js';
import { genererProgramme } from './moteur.js';
import { chargeDepart, derive, mesureKg, NIVEAUX } from './valeurs.js';

// ══════════════════════════════════════════════════════════════════════
// Rendu de texte — le moteur écrit en Markdown léger
// ══════════════════════════════════════════════════════════════════════

const echapper = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Le moteur écrit `**gras**`, `` `code` `` et `_italique_` (il rend aussi du
 * Markdown en CLI). On échappe d'ABORD, on stylise ENSUITE : aucune chaîne du
 * moteur ne peut injecter de HTML.
 */
const riche = (s) =>
  echapper(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/_(.+?)_/g, '<i>$1</i>');

/** Crée un élément. `html` passe par `riche()`, jamais par innerHTML brut. */
function el(tag, classe, html) {
  const n = document.createElement(tag);
  if (classe) n.className = classe;
  if (html != null) n.innerHTML = html;
  return n;
}

/**
 * Le « Pourquoi ? » repliable — pattern du design system, en `<details>` natif :
 * accessible au clavier et au lecteur d'écran, zéro JS, zéro dépendance.
 *
 * @param {string} savoir    ce que je sais    (obligatoire)
 * @param {string} [ignore]  ce que je ne sais pas — OBLIGATOIRE dès qu'un ESTIMÉ
 *                           est en jeu (RECHERCHE-ux.md P21). C'est cette moitié-là
 *                           que Strava range dans son centre d'aide ; nous, on
 *                           l'affiche dans la carte.
 */
function pourquoi(savoir, ignore) {
  const d = el('details', 'why');
  const s = el('summary', 'why-link');
  s.append(el('span', 'why-mark', '?'), el('span', null, 'Pourquoi&nbsp;?'));
  d.append(s);

  const bloc = el('div', 'why-block');
  const p1 = el('div', 'why-part');
  p1.append(el('span', 'why-part-label', 'Ce que je sais'), el('p', null, riche(savoir)));
  bloc.append(p1);

  if (ignore) {
    const p2 = el('div', 'why-part why-part--unknown');
    p2.append(el('span', 'why-part-label', 'Ce que je ne sais pas'), el('p', null, riche(ignore)));
    bloc.append(p2);
  }
  d.append(bloc);
  return d;
}

/** Une valeur typée par la taxonomie. Le « ~ » de l'estimé est posé par la CSS. */
function valeur(niveau, texte, fort = false) {
  const n = el('span', `val ${NIVEAUX[niveau].classe}${fort ? ' val--strong' : ''}`, echapper(texte));
  // Le niveau est lisible au lecteur d'écran : « estimé, 90 kg » — la nuance
  // visuelle ne doit pas être réservée aux voyants.
  n.setAttribute('aria-label', `${NIVEAUX[niveau].libelle} : ${texte}`);
  return n;
}

// ══════════════════════════════════════════════════════════════════════
// Bloc « Adaptations » — LE CŒUR
// ══════════════════════════════════════════════════════════════════════

/** Chaque type d'action a son icône et son libellé. Ordre = gravité décroissante. */
const TYPES = [
  ['retraits', '⛔', 'Retiré', (a) => a.exercice, (a) => `Retiré de « ${a.seance} »`],
  ['substitutions', '⇄', 'Remplacé', (a) => `${a.avant} → ${a.apres}`, (a) => `Dans « ${a.seance} »`],
  ['plafonds', '🔒', 'Charge plafonnée', (a) => a.exercice, () => 'La charge ne monte plus'],
  ['rir_ajustes', '↑', 'RIR relevé', (a) => a.exercice, (a) => `RIR ${a.avant} → ${a.apres}`],
];

function rendreAdaptations(l) {
  const carte = el('section', 'carte adapt');
  carte.append(
    el('span', 'kicker', 'Ton programme n’est pas le programme nominal'),
    el('h2', 'carte-titre adapt-titre', 'Adaptations liées à tes limitations'),
  );

  const zones = l.limitations.map((x) => `<b>${echapper(x.libelle)}</b> (${echapper(x.libelle_statut.split(' (')[0])})`);
  carte.append(
    el(
      'p',
      'carte-note',
      `Le moteur a lu ${zones.length} limitation${zones.length > 1 ? 's' : ''} — ${zones.join(', ')} — et a <b>changé le programme</b> autour d’elles. Chaque changement dit pourquoi.`,
    ),
  );

  // ── Alertes (ce qui ne peut pas attendre) ───────────────────────────
  for (const a of l.alertes ?? []) carte.append(el('div', 'banner banner--error', `<span>${riche(a)}</span>`));

  // ── Les changements, un par un ──────────────────────────────────────
  const liste = el('ul', 'adapt-liste');

  for (const [cle, icone, libelle, quoi, detail] of TYPES) {
    for (const a of l[cle] ?? []) {
      const li = el('li', 'adapt-item');
      const tete = el('div', 'adapt-tete');
      tete.append(
        el('span', 'adapt-icone', icone),
        el('div', 'adapt-quoi', `<span class="adapt-nom">${echapper(quoi(a))}</span><span class="adapt-detail">${echapper(detail(a))}</span>`),
        el('span', 'tag', echapper(libelle)),
      );
      li.append(tete);
      // Le « pourquoi » est celui du MOTEUR, mot pour mot.
      li.append(pourquoi(a.pourquoi));
      liste.append(li);
    }
  }

  // Progression prudente — porte sur un pattern, pas sur un exercice nommé.
  for (const p of l.progression_prudente ?? []) {
    const li = el('li', 'adapt-item');
    const tete = el('div', 'adapt-tete');
    tete.append(
      el('span', 'adapt-icone', '🐢'),
      el('div', 'adapt-quoi', `<span class="adapt-nom">Pattern « ${echapper(p.patterns.join(', '))} »</span><span class="adapt-detail">Progression au plus petit palier</span>`),
      el('span', 'tag', 'Prudent'),
    );
    li.append(tete, pourquoi(p.pourquoi));
    liste.append(li);
  }

  if (liste.children.length) carte.append(liste);

  // ── Échauffement imposé ─────────────────────────────────────────────
  if (l.echauffement?.impose) {
    const e = l.echauffement;
    const bloc = el('div', 'adapt-bloc adapt-bloc--fort');
    bloc.append(el('h3', 'adapt-sous-titre', '🔥 Échauffement — imposé, pas suggéré'));
    bloc.append(el('p', 'carte-note', riche(e.constat)));
    const ul = el('ul', 'puces');
    for (const c of e.consignes) ul.append(el('li', null, riche(c)));
    bloc.append(ul, pourquoi(e.pourquoi));
    carte.append(bloc);
  }

  // ── Hypothèse clinique (le croisement stagnation × limitation) ───────
  if (l.hypothese_clinique) {
    const h = l.hypothese_clinique;
    const bloc = el('div', 'adapt-bloc');
    bloc.append(
      el('h3', 'adapt-sous-titre', '🔍 Une hypothèse, pas un diagnostic'),
      el('p', 'carte-note', riche(h.message)),
      el('p', 'adapt-source', riche(h.source)),
    );
    carte.append(bloc);
  }

  // ── Renvoi vers un professionnel — jamais enterré ────────────────────
  for (const r of l.renvois_pro ?? []) {
    const bloc = el('div', 'adapt-bloc adapt-bloc--pro');
    bloc.append(
      el('h3', 'adapt-sous-titre', '🩺 Fais examiner ça'),
      el('p', 'carte-note', riche(r.message)),
    );
    carte.append(bloc);
  }

  // ── Signaux à surveiller ────────────────────────────────────────────
  if (l.surveiller?.length) {
    const bloc = el('div', 'adapt-bloc');
    bloc.append(el('h3', 'adapt-sous-titre', '👀 Les signaux qui doivent te faire lever le pied'));
    const ul = el('ul', 'puces');
    for (const s of l.surveiller) ul.append(el('li', null, `<b>${echapper(s.libelle)}</b> — ${riche(s.signal)}`));
    bloc.append(ul);
    carte.append(bloc);
  }

  // ── Règles du programme ─────────────────────────────────────────────
  if (l.regles?.length) {
    const bloc = el('div', 'adapt-bloc');
    bloc.append(el('h3', 'adapt-sous-titre', '📐 Les règles que le moteur s’impose'));
    const ul = el('ul', 'puces');
    for (const r of l.regles) ul.append(el('li', null, riche(r)));
    bloc.append(ul);
    carte.append(bloc);
  }

  // ── 🔴 Ce que le moteur N'A PAS su faire — jamais silencieux ──────────
  if (l.non_appliquees?.length) {
    const bloc = el('div', 'adapt-bloc adapt-bloc--fort');
    bloc.append(el('h3', 'adapt-sous-titre', '⚠️ Ce que le moteur n’a pas su adapter'));
    const ul = el('ul', 'puces');
    for (const n of l.non_appliquees) ul.append(el('li', null, riche(n.message ?? n.pourquoi ?? String(n))));
    bloc.append(ul);
    carte.append(bloc);
  }

  return carte;
}

// ══════════════════════════════════════════════════════════════════════
// Une séance : la liste d'exercices
// ══════════════════════════════════════════════════════════════════════

/**
 * @param notesRef  nom d'exercice → note de `charges_reference` (le persona explique
 *                  LUI-MÊME pourquoi telle charge est une estimation). C'est notre
 *                  meilleure matière pour « ce que je ne sais pas ».
 */
function rendreExercice(exo, notesRef) {
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
  const { niveau, texte } = chargeDepart(exo);
  const ligne = el('div', 'exo-charge');

  if (niveau === 'est') {
    // 🔴 ESTIMÉ : « ~ » (posé par la CSS), arrondi à 5 kg, aucun accent,
    //    « Pourquoi ? » OBLIGATOIRE. Cf. valeurs.js.
    ligne.append(el('span', 'exo-charge-lab', 'Charge de départ'), valeur('est', texte));
    ligne.append(el('span', 'tag tag--warn', 'Estimée, pas mesurée'));
    li.append(ligne);
    const source = exo.substitue_depuis ?? exo.nom;
    li.append(
      pourquoi(
        `Cette charge est un **point de départ prudent**, pas une mesure. Le moteur a relevé ton **RIR à ${echapper(exo.rir)}** dessus : il ne prescrit pas du lourd à quasi-échec sur une charge qu'il n'a **pas mesurée**.`,
        `${notesRef.get(source) ? `Ta propre note sur « ${source} » : _${notesRef.get(source)}_\n\n` : ''}` +
          `**Ta vraie charge d'aujourd'hui, personne ne la connaît** — toi non plus, tu l'as déclarée « à re-tester ». Fais-en une **séance de re-test** : montée en charge progressive, 2–3 reps par palier, on s'arrête dès que la technique bouge. Une fois la charge réelle loguée, la prescription repartira du réel.`,
      ),
    );
  } else if (niveau === 'mes') {
    // MESURÉ : c'est TA donnée, précision pleine. Seul niveau qui a droit à l'accent.
    ligne.append(el('span', 'exo-charge-lab', 'Charge de départ'), valeur('mes', texte, true));
    if (exo.plafond_charge && exo.charge_max_kg != null) {
      ligne.append(el('span', 'tag tag--warn', `🔒 Plafond ${mesureKg(exo.charge_max_kg)}`));
    }
    li.append(ligne);
    if (exo.plafond_charge && exo.plafond_pourquoi) {
      li.append(
        pourquoi(
          exo.plafond_pourquoi,
          "Aucun seuil de charge « sûr » n'existe dans la littérature pour un tendon : le moteur **ne fabrique pas de chiffre**. Le plafond retenu est **ta** dernière charge tolérée — ta donnée, pas une valeur inventée.",
        ),
      );
    }
  } else {
    // Pas de charge du tout : on le dit, on n'invente pas un nombre.
    ligne.append(el('span', 'exo-charge-lab', 'Charge de départ'), el('span', 'exo-charge-vide', 'à établir'));
    li.append(ligne);
    if (exo.charge_a_confirmer) {
      li.append(
        pourquoi(
          `Le moteur **n'affiche aucune charge** ici : il n'en a pas. ${
            exo.substitue_depuis
              ? `« ${echapper(exo.substitue_depuis)} » a été remplacé par cet exercice, et ta charge de référence ne s'y transporte pas telle quelle (mouvement différent).`
              : "Tu n'as pas déclaré de charge de référence sur cet exercice."
          } Ton RIR est relevé à **${echapper(exo.rir)}** en attendant.`,
          "Inventer un chiffre plausible serait la pire option : tu le suivrais. Première séance = **séance de calibration**. Monte progressivement, arrête-toi quand la technique bouge, et logue ce que tu as réellement fait.",
        ),
      );
    }
  }

  // ── Substitution : le pourquoi du moteur, à sa place ─────────────────
  if (exo.substitue_depuis && exo._pourquoi_subst) {
    li.append(pourquoi(`Tu devais faire « **${exo.substitue_depuis}** ». ${exo._pourquoi_subst}`));
  }

  if (exo.consigne) li.append(el('p', 'exo-consigne', `💡 ${echapper(exo.consigne)}`));
  if (exo.alternative) li.append(el('p', 'exo-alt', `Machine prise ? → <b>${echapper(exo.alternative)}</b>`));

  return li;
}

// ══════════════════════════════════════════════════════════════════════
// L'écran
// ══════════════════════════════════════════════════════════════════════

let etat = null; // { persona, programme, jour }

function rendreJour(i) {
  etat.jour = i;
  const { programme: p } = etat;
  const seance = p.seances[i];

  for (const b of document.querySelectorAll('.jour-btn')) {
    const actif = Number(b.dataset.jour) === i;
    b.classList.toggle('est-actif', actif);
    b.setAttribute('aria-selected', String(actif));
  }

  const hote = $('#seance-detail');
  hote.replaceChildren();
  hote.append(el('h2', 'seance-nom', echapper(seance.nom)));

  // Trois chiffres de tête, pas quatre (RECHERCHE-ux.md P1). Tous DÉRIVÉS :
  // ce sont des sommes exactes sur le programme, pas des modèles.
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

  const ul = el('ul', 'exos');
  for (const exo of seance.exercices) ul.append(rendreExercice(exo, etat.notesRef));
  hote.append(ul);
}

function rendre() {
  const { persona, programme: p } = etat;
  const hote = $('#prog');
  hote.replaceChildren();

  // ── En-tête ─────────────────────────────────────────────────────────
  const tete = el('section', 'carte prog-tete');
  tete.append(
    el('span', 'kicker', `Muscu · ${echapper(p.objectif)} · ${echapper(p.niveau)}`),
    el('h2', 'prog-split', echapper(p.split)),
    el('p', 'carte-note', riche(p.note_split)),
  );
  hote.append(tete);

  // ── 🔴 Les adaptations, AVANT les exercices ─────────────────────────
  if (p.limitations?.limitations?.length) hote.append(rendreAdaptations(p.limitations));

  // ── Charges de référence non appliquées (la donnée n'est pas perdue) ─
  if (p.charges_non_appliquees?.length) {
    const c = el('section', 'carte');
    c.append(el('h2', 'carte-titre', 'Tes charges mises de côté'));
    const ul = el('ul', 'puces');
    for (const x of p.charges_non_appliquees) ul.append(el('li', null, riche(x.message)));
    c.append(ul);
    hote.append(c);
  }

  // ── Le sélecteur de jour ────────────────────────────────────────────
  const nav = el('nav', 'jours');
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Jours du programme');
  p.jours.forEach((nom, i) => {
    const b = el('button', 'jour-btn');
    b.type = 'button';
    b.dataset.jour = String(i);
    b.setAttribute('role', 'tab');
    const [num, titre] = nom.split(' — ');
    b.append(el('span', 'jour-num', echapper(num.replace('Jour ', 'J'))), el('span', 'jour-nom', echapper(titre ?? nom)));
    b.addEventListener('click', () => rendreJour(i));
    nav.append(b);
  });
  hote.append(nav);

  const detail = el('div', 'seance-detail');
  detail.id = 'seance-detail';
  hote.append(detail);

  // ── Hypothèses du moteur — ce qu'il a supposé, pas ce qu'il sait ─────
  if (p.hypotheses_programme?.length || persona.hypotheses?.length) {
    const d = el('details', 'why why--bloc');
    const s = el('summary', 'why-link');
    s.append(el('span', 'why-mark', '?'), el('span', null, 'Sur quoi ce programme repose-t-il&nbsp;?'));
    d.append(s);
    const bloc = el('div', 'why-block');
    const part = el('div', 'why-part why-part--unknown');
    part.append(el('span', 'why-part-label', 'Hypothèses — à confirmer'));
    const ul = el('ul', 'puces');
    for (const h of [...(p.hypotheses_programme ?? []), ...(persona.hypotheses ?? [])]) {
      ul.append(el('li', null, riche(h)));
    }
    part.append(ul);
    bloc.append(part);
    d.append(bloc);
    hote.append(d);
  }

  hote.append(
    el(
      'p',
      'mentions',
      "Ce programme est généré à titre d'information générale. Il ne remplace pas l'avis d'un professionnel de santé.",
    ),
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
  z.append(sk, el('p', 'state-hint', '<span class="spinner"></span> Le moteur calcule ton programme…'));
  z.hidden = false;
}

/**
 * 🔴 L'ÉTAT VIDE — l'app publiée arrive ICI, à son tout premier démarrage.
 *
 * Elle n'a **pas de profil** : le persona de développement n'est pas publié
 * (voir amorce.js). Ce n'est pas une panne, c'est un utilisateur neuf — et le
 * dire avec un écran d'erreur rouge serait mentir sur ce qui se passe.
 *
 * Donc : pas de `state--error`, pas de `console.error`, pas de « Réessayer »
 * (réessayer quoi ? rien n'a échoué). Un accueil, et **une porte de sortie
 * praticable** : l'import, qui existe déjà. L'onboarding prendra sa place ici.
 */
function vide() {
  const z = $('#prog-etat');
  z.replaceChildren();

  const d = el('div', 'state state--screen');
  d.append(
    el('h2', 'state-title', 'Le moteur ne sait rien de toi'),
    el(
      'p',
      'state-msg',
      'Pas de profil sur cet appareil — donc pas de programme. C’est normal au premier démarrage : ' +
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
    el('h2', 'state-title', 'Le moteur n’a pas pu générer ton programme'),
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
    const { persona, programme } = resultat;

    // Le persona explique lui-même pourquoi telle charge est une estimation :
    // on garde ses notes sous la main pour les « Pourquoi ? ».
    const notesRef = new Map();
    for (const [nom, ref] of Object.entries(persona.muscu.charges_reference ?? {})) {
      if (ref?.note) notesRef.set(nom, ref.note);
    }

    // Le « pourquoi » d'une substitution vit dans le rapport de limitations, pas
    // sur l'exercice : on le raccroche pour l'afficher au bon endroit.
    for (const s of programme.limitations?.substitutions ?? []) {
      for (const seance of programme.seances) {
        for (const e of seance.exercices) if (e.nom === s.apres) e._pourquoi_subst = s.pourquoi;
      }
    }

    etat = { persona, programme, notesRef, jour: 0 };
    $('#prog-etat').hidden = true;
    $('#prog-etat').replaceChildren();
    rendre();
    return { persona, programme };
  } catch (e) {
    erreur(e);
    throw e;
  }
}
