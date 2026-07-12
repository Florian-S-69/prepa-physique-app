/* ═══════════════════════════════════════════════════════════════════════════
   sheet.js — la poignée tient sa promesse.
   prepa-physique · design system · zéro dépendance, zéro build, zéro lib.

   ── Pourquoi ce fichier existe ────────────────────────────────────────────
   `.sheet-grip` dessinait EXACTEMENT la poignée de Vaul : 38 × 4 px, arrondie,
   centrée, en haut de la feuille. Elle ne faisait RIEN. Aucun écouteur, aucun
   drag. Nous avions pris le DESSIN de l'affordance sans sa FONCTION.

   Un utilisateur d'iPhone sait ce que cette barre veut dire. Il tire dessus,
   et il ne se passe rien. **Une affordance qui ment est pire qu'aucune
   affordance** — c'est du théâtre d'interface, l'exact contraire de la
   doctrine (« unseen details compound » : les détails invisibles s'additionnent
   parce qu'ils sont VRAIS, pas parce qu'ils sont dessinés).

   Arbitré par le propriétaire du produit (2026-07-11) : on la branche.

   ⚠️ Ce commentaire nommait une personne réelle. Ce fichier est devenu
   PUBLIABLE le 2026-07-12 (l'app de séance a besoin de la feuille), et le
   garde-fou de publication (R3) a fait échouer le build : **un commentaire
   publié est public.** Il n'y a pas de « commentaire privé » dans un .js servi
   sur une URL.

   ── Les seuils, et le raisonnement ────────────────────────────────────────
   Empiriques, éprouvés par Vaul / Sonner (MIT — on reprend des NOMBRES, pas
   du code ; rien n'est copié, tout est réimplémenté en pointer events natifs) :

     · distance ≥ 25 % de la hauteur de la feuille   → on ferme
     · OU vélocité > 0,4 px/ms                        → on ferme

   **Distance OU vélocité — jamais distance seule.** Un utilisateur pressé fait
   des gestes RAPIDES et COURTS. Exiger de la distance, c'est punir la hâte.
   Un coup sec doit suffire.

   Vers le haut : **frottement, pas de mur.** On laisse tirer, avec une
   résistance logarithmique croissante, plafonnée. « It feels more natural than
   hitting an invisible wall. »

   ── Ce que le glissé N'EST PAS ────────────────────────────────────────────
   Un REMPLACEMENT. Il s'AJOUTE. La feuille reste fermable :
     · au bouton « Fermer » / « Annuler » (visible, focusable) ;
     · à la touche Échap ;
     · au tap sur le voile.
   Rien de ce qui suit ne retire une seule de ces trois portes. Un geste n'est
   jamais accessible au clavier — on ne construit pas une sortie qui exige
   une main.

   ── Usage ─────────────────────────────────────────────────────────────────
     <link rel="stylesheet" href="motion.css">          (après tokens.css)
     <script src="motion.js"></script>                  (AVANT sheet.js : il lit les tokens)
     <script src="sheet.js"></script>                   (avant le script d'écran)

     <div class="scrim" id="scrim" data-scrim hidden>
       <div class="sheet" data-sheet role="dialog" aria-modal="true">
         <div class="sheet-grip" data-sheet-grip aria-hidden="true"></div>
         …

     Sheet.bind(scrim, closeFn)   une fois, au chargement. closeFn = la
                                  fermeture de l'écran (celle qui fait le
                                  ménage), pas Sheet.close.
     Sheet.open(scrim)            affiche + fait MONTER la feuille.
     Sheet.close(scrim, done)     fait DESCENDRE, puis masque, puis done().
     Sheet.isOpen(scrim)
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Le glissé démarre au-delà de ce seuil : en deçà, c'est un TAP, et le clic
     du bouton sous le doigt doit passer intact. */
  const START_PX = 6;

  /* Plafond de sur-glissement vers le haut. La feuille est déjà en butée : on
     autorise le geste, on ne le récompense pas. */
  const OVERDRAG_MAX_PX = 16;

  const registre = new WeakMap();

  /* Les seuils et les durées viennent de tokens.css, lus par `Motion.ms()`
     (motion.js) — pas d'un nombre écrit ici. Le point de vérité unique vaut
     aussi pour le JS. */
  const reduit = () => window.Motion.reduit();
  const token = (nom, parDefaut) => window.Motion.ms(nom, parDefaut);

  const ratioFermeture = () => token('--sheet-close-ratio', 0.25);
  const veloFermeture  = () => token('--sheet-close-velocity', 0.4);
  const dureeSortie    = () => token('--dur-exit', 160);

  /* Frottement logarithmique : plus on tire, moins ça bouge. Monotone, borné,
     nul à l'origine (la formule d'amortissement de Vaul, elle, vaut −16 en 0 :
     elle est écrite pour un autre point d'appel. On garde l'IDÉE, pas le bug). */
  function frottement(px) {
    return Math.min(OVERDRAG_MAX_PX, 8 * Math.log(1 + px / 8));
  }

  function etat(scrim) {
    return registre.get(scrim);
  }

  function isOpen(scrim) {
    return !scrim.hidden && scrim.dataset.state !== 'closing';
  }

  function open(scrim) {
    const e = etat(scrim);
    if (!e) return;
    e.fermeture = false;
    scrim.hidden = false;
    /* Une feuille qui ne défile pas se glisse par TOUTE sa surface. Une feuille
       qui défile ne se glisse QUE par sa poignée (sinon on vole le scroll). */
    e.sheet.style.touchAction =
      e.sheet.scrollHeight <= e.sheet.clientHeight ? 'none' : '';
    scrim.dataset.state = 'enter';
    void scrim.offsetHeight;          /* on force le calcul : sans ça, pas de transition */
    scrim.dataset.state = 'open';
  }

  function close(scrim, done) {
    const e = etat(scrim);
    if (!e || scrim.hidden || e.fermeture) return;
    e.fermeture = true;
    purge(e);
    scrim.dataset.state = 'closing';
    window.setTimeout(function () {
      scrim.hidden = true;
      scrim.dataset.state = 'closed';
      e.fermeture = false;
      if (typeof done === 'function') done();
    }, dureeSortie());
  }

  /* Retire tout ce que le doigt a posé en inline. */
  function purge(e) {
    e.sheet.style.transform = '';
    e.scrim.style.opacity = '';
    e.drag = null;
  }

  /* ── Le glissé ────────────────────────────────────────────────────────── */

  function onDown(e, ctx) {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!isOpen(ctx.scrim)) return;
    /* On ne vole jamais un champ de saisie ni une zone déjà défilée. */
    if (e.target.closest('input, textarea, select')) return;
    const surPoignee = !!e.target.closest('[data-sheet-grip]');
    if (!surPoignee && ctx.sheet.scrollTop > 0) return;

    ctx.drag = {
      id: e.pointerId,
      y0: e.clientY,
      t0: e.timeStamp,
      /* Vélocité sur le DERNIER segment, pas sur tout le geste : un doigt qui
         hésite puis lance ne doit pas être puni par sa propre hésitation. */
      yPrec: e.clientY,
      tPrec: e.timeStamp,
      v: 0,
      actif: false,
      h: ctx.sheet.getBoundingClientRect().height,
    };
  }

  function onMove(e, ctx) {
    const d = ctx.drag;
    if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y0;

    if (!d.actif) {
      if (Math.abs(dy) < START_PX) return;    /* toujours un tap : on ne touche à rien */
      d.actif = true;
      ctx.sheet.setPointerCapture(d.id);      /* le geste survit à la sortie de la feuille */
      ctx.scrim.dataset.state = 'dragging';
    }

    const dt = e.timeStamp - d.tPrec;
    if (dt > 0) d.v = (e.clientY - d.yPrec) / dt;
    d.yPrec = e.clientY;
    d.tPrec = e.timeStamp;

    const y = dy >= 0 ? dy : -frottement(-dy);
    ctx.sheet.style.transform = 'translateY(' + y + 'px)';
    /* Le voile suit : la feuille qui part emmène son ombre avec elle. */
    if (!reduit() && d.h > 0) {
      ctx.scrim.style.opacity = String(Math.max(0, 1 - (Math.max(0, dy) / d.h) * 0.9));
    }
    e.preventDefault();
  }

  function onUp(e, ctx) {
    const d = ctx.drag;
    if (!d || e.pointerId !== d.id) return;
    ctx.drag = null;
    if (!d.actif) return;                     /* c'était un tap : le clic passe */

    if (ctx.sheet.hasPointerCapture(d.id)) ctx.sheet.releasePointerCapture(d.id);
    ctx.scrim.dataset.state = 'open';

    const dy = e.clientY - d.y0;
    /* Un geste terminé après une pause n'a plus de vélocité : on ne referme
       pas sur une impulsion vieille de 300 ms. */
    const frais = e.timeStamp - d.tPrec < 120;
    const v = frais ? d.v : 0;

    const assezLoin = dy >= d.h * ratioFermeture();
    const assezVite = v > veloFermeture();

    /* Le glissé a bougé la feuille : le clic qui suit IMMÉDIATEMENT n'est pas
       un clic, c'est la fin du geste. On l'avale — mais dans une FENÊTRE de
       temps, pas avec un drapeau.
       ⚠️ Le drapeau était un bug, attrapé au navigateur : un glissé qui FERME
       la feuille n'est suivi d'aucun clic ; le drapeau restait donc levé, et
       c'est le clic LÉGITIME suivant (« Fermer », à la réouverture) qui se
       faisait avaler. Un bouton mort, silencieusement. */
    ctx.avaleClicJusqua = e.timeStamp + 350;

    /* On rend la main à la CSS AVANT de décider : la feuille repart de là où
       le doigt l'a laissée, elle ne saute pas. */
    purge(ctx);

    if (assezLoin || assezVite) {
      /* On ne ferme pas nous-mêmes : on appelle la fermeture de L'ÉCRAN, celle
         qui fait le ménage. Une seule porte de sortie, un seul ménage — sinon
         le geste devient une deuxième fermeture, avec un état différent. */
      if (ctx.onDismiss) ctx.onDismiss();
      else close(ctx.scrim);
    }
    /* Sinon : elle revient. Sur --dur-sheet, avec la courbe des feuilles. */
  }

  function onCancel(e, ctx) {
    const d = ctx.drag;
    if (!d || e.pointerId !== d.id) return;
    ctx.scrim.dataset.state = 'open';
    purge(ctx);
  }

  /* `onDismiss` : la fermeture PROPRE de l'écran (celle qui remet l'état à
     zéro). On la rappelle telle quelle depuis le glissé — le geste ne doit pas
     être une deuxième porte de sortie avec un ménage différent. */
  function bind(scrim, onDismiss) {
    const sheet = scrim.querySelector('[data-sheet]');
    if (!sheet) return;

    const ctx = {
      scrim: scrim,
      sheet: sheet,
      drag: null,
      fermeture: false,
      avaleClicJusqua: 0,
      onDismiss: typeof onDismiss === 'function' ? onDismiss : null,
    };

    registre.set(scrim, ctx);

    sheet.addEventListener('pointerdown', e => onDown(e, ctx));
    sheet.addEventListener('pointermove', e => onMove(e, ctx));
    sheet.addEventListener('pointerup', e => onUp(e, ctx));
    sheet.addEventListener('pointercancel', e => onCancel(e, ctx));

    /* Un glissé qui finit sur un bouton ne DÉCLENCHE pas ce bouton. */
    sheet.addEventListener('click', function (e) {
      if (e.timeStamp > ctx.avaleClicJusqua) return;
      ctx.avaleClicJusqua = 0;
      e.stopPropagation();
      e.preventDefault();
    }, true);

    return ctx;
  }

  window.Sheet = { bind: bind, open: open, close: close, isOpen: isOpen };
})();
