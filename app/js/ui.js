/**
 * ui.js — micro-helpers DOM. Pas un framework, et ce n'est pas un oubli :
 * le moteur (`src/lib/*.js`) est en modules ES natifs sans dépendance, l'app
 * reste dans la même philosophie. Zéro build, zéro node_modules, coût 0 €.
 */

export const $ = (sel, racine = document) => racine.querySelector(sel);
export const $$ = (sel, racine = document) => [...racine.querySelectorAll(sel)];

/** Bascule un écran (les écrans sont des <section data-ecran>). */
export function afficherEcran(id) {
  for (const section of $$('[data-ecran]')) {
    const actif = section.dataset.ecran === id;
    section.hidden = !actif;
  }
  for (const onglet of $$('[data-vers]')) {
    const actif = onglet.dataset.vers === id;
    onglet.classList.toggle('est-actif', actif);
    onglet.setAttribute('aria-current', actif ? 'page' : 'false');
  }
  document.querySelector('main')?.scrollTo(0, 0);
}

/**
 * Message éphémère, annoncé aux lecteurs d'écran.
 * @param {'info'|'succes'|'erreur'} ton
 */
export function toast(message, ton = 'info') {
  const zone = $('#toasts');
  if (!zone) return;
  const div = document.createElement('div');
  div.className = `toast toast--${ton}`;
  div.textContent = message;
  zone.append(div);
  // La zone est aria-live="polite" : l'insertion suffit à l'annoncer.
  setTimeout(() => {
    div.classList.add('sort');
    div.addEventListener('transitionend', () => div.remove(), { once: true });
    setTimeout(() => div.remove(), 600); // filet si transitionend ne part pas
  }, 4200);
}

/** « 11 juillet 2026 » */
export const formaterDate = (date) =>
  date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

// ══════════════════════════════════════════════════════════════════════
// Construction de DOM — un seul point de vérité pour l'échappement
// ══════════════════════════════════════════════════════════════════════
// Ces trois fonctions vivaient dans programme.js. L'écran de séance en a besoin
// aussi — et une deuxième copie de la règle d'échappement, c'est une copie qui
// finira par diverger, sur le seul endroit du code où ça coûte une injection.

export const echapper = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Le moteur écrit `**gras**`, `` `code` `` et `_italique_` (il rend aussi du
 * Markdown en CLI). On échappe d'ABORD, on stylise ENSUITE : aucune chaîne du
 * moteur ne peut injecter de HTML.
 *
 * 🔴 L'ITALIQUE MANGEAIT LES `code` — VU À L'ÉCRAN (2026-07-12).
 * La passe `_italique_` tournait APRÈS la passe `` `code` ``, donc **sur le contenu du
 * code**. Résultat, dans une feuille « Pourquoi ? » :
 *   `muscu.charges_actuelles_a_tester`  →  « muscu.chargesactuellesa_tester »
 * Deux underscores avalés, l'identifiant devenu FAUX. Le moteur en écrit une trentaine de
 * ce genre (`charge_lombaire`, `charges_reference`, `charge_depart_kg`…) : **toutes**
 * étaient déformées, en silence, derrière un tap. Un nom de champ tronqué est une piste que
 * l'utilisateur ne peut pas suivre — et il croit que c'est le moteur qui l'a écrite ainsi.
 *
 * Les `code` sont donc MIS DE CÔTÉ (jeton) avant les passes de style, puis remis : ils
 * traversent le Markdown sans le subir. C'est ce qu'un bloc de code doit faire, partout.
 */
// ⚠️ Un caractère de CONTRÔLE, jamais un motif de texte : un jeton « espace-chiffre-espace »
//    aurait capturé du VRAI texte (« pas de 5 kg ») et l'aurait remplacé par du vide.
const JETON = String.fromCharCode(0);

export const riche = (s) => {
  const codes = [];
  return echapper(s)
    .replace(/`(.+?)`/g, (_, c) => JETON + (codes.push(c) - 1) + JETON)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/_(.+?)_/g, '<i>$1</i>')
    .replace(new RegExp(JETON + '(\\d+)' + JETON, 'g'), (_, i) => `<code>${codes[Number(i)]}</code>`);
};

/** Crée un élément. `html` passe par `riche()`/`echapper()`, jamais par innerHTML brut. */
export function el(tag, classe, html) {
  const n = document.createElement(tag);
  if (classe) n.className = classe;
  if (html != null) n.innerHTML = html;
  return n;
}

// ══════════════════════════════════════════════════════════════════════
// LA FEUILLE — c'est elle qui rend l'honnêteté possible sans le bavardage
// ══════════════════════════════════════════════════════════════════════
//
// « Être honnête SANS être bavard. » La transparence n'est pas un déluge de
// texte : c'est que la vérité soit DISPONIBLE quand on la cherche. La feuille
// est l'endroit où va tout ce dont on n'a pas besoin MAINTENANT, un haltère
// dans la main — sans qu'une seule vérité ne soit supprimée.
//
// Le glissé, le voile, la touche Échap et le bouton « Fermer » sont fournis par
// `design/sheet.js` (+ motion.css). On ne réécrit pas un deuxième système.

let itemsFeuille = [];
let focusAvant = null;

/** À appeler une fois au démarrage : branche le glissé de la poignée. */
export function brancherFeuille() {
  const scrim = $('#scrim');
  if (!scrim || !globalThis.Sheet) return;
  globalThis.Sheet.bind(scrim, fermerFeuille);
  $('#feuille-fermer').addEventListener('click', fermerFeuille);
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) fermerFeuille();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && globalThis.Sheet.isOpen(scrim)) fermerFeuille();
  });
  $('#feuille-corps').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-item]');
    if (!btn) return;
    itemsFeuille[Number(btn.dataset.item)]?.faire?.();
  });
}

/**
 * @param {object}   o
 * @param {string}   o.titre
 * @param {string=}  o.sous     sous-titre (HTML interne uniquement)
 * @param {object[]=} o.items   [{ libelle, sous, classe, faire }]
 * @param {Node=}    o.corps    contenu libre (le « Pourquoi ? » d'un avis, par ex.)
 * @param {string=}  o.fermer   libellé du bouton de sortie
 */
export function ouvrirFeuille({ titre, sous = null, items = [], corps = null, fermer = 'Fermer' }) {
  const scrim = $('#scrim');
  if (!scrim || !globalThis.Sheet) return;
  focusAvant = document.activeElement;

  $('#feuille-titre').textContent = titre;
  const sub = $('#feuille-sous');
  sub.hidden = !sous;
  if (sous) sub.innerHTML = sous;

  const hote = $('#feuille-corps');
  hote.replaceChildren();
  itemsFeuille = items;
  if (corps) hote.append(corps);
  items.forEach((it, i) => {
    const b = el('button', `feuille-item ${it.classe ?? ''}`);
    b.type = 'button';
    b.dataset.item = String(i);
    b.append(
      el(
        'span',
        null,
        `${echapper(it.libelle)}${it.sous ? `<small>${echapper(it.sous)}</small>` : ''}`,
      ),
    );
    hote.append(b);
  });

  $('#feuille-fermer').textContent = fermer;
  globalThis.Sheet.open(scrim);

  // 🔴 On donne le focus à la FEUILLE, jamais à son premier bouton.
  //
  // ⚠️ Attrapé à l'écran, pas par un test (2026-07-12) : la feuille du RPE
  // focalisait son premier bouton — le « 0 ». Le focus visible (anneau d'accent)
  // le peignait exactement comme un choix DÉJÀ FAIT. Sur un écran tactile,
  // personne ne lit ça comme « le clavier est ici » : on lit « 0 est coché ».
  // C'était un PRÉ-REMPLISSAGE déguisé en accessibilité — sur la donnée pivot du
  // moteur, et « 0 » veut dire « séance nulle ». Onze assertions disaient
  // « aucun aria-pressed » et avaient raison ; l'écran, lui, suggérait un chiffre.
  //
  // Focaliser le conteneur de dialogue est le motif standard : le lecteur d'écran
  // annonce le titre, le clavier tabule vers les boutons, et AUCUNE valeur n'est
  // désignée.
  scrim.querySelector('[data-sheet]')?.focus();
}

export function fermerFeuille() {
  const scrim = $('#scrim');
  if (!scrim || !globalThis.Sheet) return;
  itemsFeuille = [];
  globalThis.Sheet.close(scrim, () => focusAvant?.focus?.());
}

export const feuilleOuverte = () => Boolean(globalThis.Sheet?.isOpen($('#scrim')));

// ══════════════════════════════════════════════════════════════════════
// CE QUI VA DANS LA FEUILLE — et l'app n'y dit plus « je »
// ══════════════════════════════════════════════════════════════════════
//
// > « L'utilisateur ne doit pas avoir l'impression de PARLER à l'application. »
//
// Les étiquettes de ces blocs disaient **« Ce que je sais » / « Ce que je ne sais
// pas »** : l'app se mettait en scène, à la première personne, jusque dans son
// aveu d'ignorance. Le FOND était juste — c'est la seule app qui distingue ce
// qu'elle a mesuré de ce qu'elle a supposé, et ça ne se supprime pas.
// **C'est la VOIX qui change, pas le contenu** : on nomme l'état de la
// connaissance, on ne raconte plus un narrateur qui la possède.
//
//   « Ce que je sais »          →  « Ce qui est établi »
//   « Ce que je ne sais pas »   →  « Ce qui ne l'est pas »
//
// Deux copies de ces libellés divergeraient : ils vivent ICI, une fois.

export const SAIT = 'Ce qui est établi';
export const IGNORE = "Ce qui ne l'est pas";

/**
 * Un bloc « pourquoi » pour la feuille : des parts étiquetées, dans l'ordre.
 * @param {{label: string, texte: string, sourdine?: boolean}[]} parts
 *        `sourdine` = la part « ce qui n'est pas connu » (traitement visuel distinct).
 */
export function blocPourquoi(parts) {
  const bloc = el('div', 'why-block');
  for (const p of parts) {
    if (!p?.texte) continue;
    const d = el('div', `why-part${p.sourdine ? ' why-part--unknown' : ''}`);
    d.append(el('span', 'why-part-label', echapper(p.label)), el('p', null, riche(p.texte)));
    bloc.append(d);
  }
  return bloc;
}

/**
 * 🔴 UNE LIGNE D'ÉTAT — l'essentiel à plat, la vérité derrière le tap.
 *
 * Le pavé du moteur (son « pourquoi », sa source, son aveu) ne se DÉVERSE plus : il se
 * CONSULTE. Une ligne dit **ce qui est** ; le tap dit **pourquoi**. C'est le mécanisme
 * qui existait déjà sur les substitutions d'exercice — il est simplement appliqué
 * partout, au lieu de l'être à un seul endroit.
 *
 * ⚠️ Une ligne sans `faire` n'est pas une ligne : si rien ne s'ouvre, la vérité a été
 * supprimée, pas déplacée. C'est exactement la régression à ne pas commettre.
 */
export function ligneEtat({ icone, texte, faire, go = 'Pourquoi ?', gravite = 'info' }) {
  const b = el('button', `ligne-etat ligne-etat--${gravite}`);
  b.type = 'button';
  b.append(
    el('span', 'ligne-etat-i', echapper(icone ?? '')),
    el('span', 'ligne-etat-t', riche(texte)),
    el('span', 'ligne-etat-go', echapper(go)),
  );
  b.addEventListener('click', faire);
  return b;
}
