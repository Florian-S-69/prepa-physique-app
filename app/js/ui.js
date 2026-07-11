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
