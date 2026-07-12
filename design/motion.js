/* ═══════════════════════════════════════════════════════════════════════════
   motion.js — la ligne sans laquelle motion.css ne sert à rien sur iOS.
   prepa-physique · design system · zéro dépendance, zéro build.

   ── Le piège, observé au navigateur ───────────────────────────────────────
   `motion.css` pose `:active { transform: scale(0.97) }` sur tout élément
   pressable. En émulation tactile, Chrome **n'applique pas `:active`** sur un
   contact : le bouton ne bouge pas. Ce n'est pas une bizarrerie du harnais de
   test — c'est le comportement documenté des moteurs mobiles, et **iOS Safari
   est le plus strict** : `:active` n'est appliqué au toucher que si un
   écouteur `touchstart` existe sur l'élément ou sur l'un de ses ancêtres.

   Sans cette ligne, **le retour de press est mort sur le seul appareil qui en
   a besoin.** Et il meurt en silence : la CSS est juste, le token est juste,
   l'audit est vert — et rien ne bouge sous le doigt. Exactement la classe de
   faute que cette piste passe son temps à traquer : une intention correcte,
   un effet nul, aucun garde-fou pour le dire.

   Un écouteur vide, passif, au niveau du document. C'est tout. C'est le
   correctif standard, et il ne coûte rien : `passive: true` garantit qu'il ne
   peut pas bloquer le défilement.

   ⚠️ NON VÉRIFIÉ SUR UN VRAI IPHONE — voir la section d'arbitrage du JOURNAL.
   (Ce commentaire nommait une personne réelle. Ce fichier est devenu PUBLIABLE
   le 2026-07-12 : le garde-fou R3 a fait échouer le build. Un commentaire publié
   est public.)
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  document.addEventListener('touchstart', function () {}, { passive: true });

  /* ── Lire une durée de tokens.css depuis le JS ────────────────────────────
     Le point de vérité unique vaut aussi pour le JS : aucune durée n'est écrite
     dans un script. `.26s` et `260ms` sont la même durée — les deux se lisent. */
  function ms(nom, parDefaut) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return parDefaut;
    return /[0-9.]s$/.test(v) ? n * 1000 : n;
  }

  const reduit = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Un chiffre qui se pose ───────────────────────────────────────────────
     Réservé à ce qui arrive UNE fois (le tonnage de fin de séance). Interdit
     sur tout ce qui se répète — voir la table de fréquence dans tokens.css.

     ⚠️ L'amortissement est écrit en JS (`1 − (1−p)³`, l'easeOutCubic de
     Penner) : on ne peut pas résoudre une courbe de Bézier sans solveur. C'est
     le plus proche équivalent de `--ease-out`, et c'est la SEULE courbe du
     produit qui ne sort pas des tokens. Elle est ici, elle est nommée, elle
     n'est pas dispersée.

     En mouvement réduit : le chiffre est posé, pas compté. Il ne disparaît
     pas — il arrive tout de suite. « Fewer and gentler, not zero. » */
  function compter(el, cible, format) {
    const rendu = typeof format === 'function' ? format : String;
    const duree = ms('--dur-count', 0);
    if (reduit() || duree <= 0 || !el) { if (el) el.textContent = rendu(cible); return; }
    const t0 = performance.now();
    (function pas(t) {
      const p = Math.min(1, (t - t0) / duree);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = rendu(Math.round(cible * e));
      if (p < 1) requestAnimationFrame(pas);
    })(performance.now());
  }

  window.Motion = { ms: ms, reduit: reduit, compter: compter };
})();
