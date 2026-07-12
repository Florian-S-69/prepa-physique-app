// ═══════════════════════════════════════════════════════════════════════════════════════════════
// AVIS — l'API de DONNÉES de tout ce que le moteur a à DIRE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 **LE DÉFAUT ARCHITECTURAL QUE CE MODULE RÉPARE — et il a été trouvé par un utilisateur réel.**
//
// > *« J'ai vraiment l'impression que c'est une IA basique qui me parle. Trop de précisions, trop de
// > mots à l'écran. J'ai l'impression de lire un article sur de la musculation en ligne. »*
//
// **Le moteur a été écrit pour un TERMINAL. Il rendait un DOCUMENT.** Ses décisions sortaient sous
// forme de **chaînes Markdown** (`alertes: string[]`) — de la prose, avec son « pourquoi », ses
// sources et ses aveux **fondus dans le même paragraphe**. Une app ne peut rien en faire : pour
// afficher « développé militaire retiré » sans le pavé sourcé qui l'accompagne, il lui faudrait
// **rétro-analyser du Markdown**. C'est inacceptable — et c'est ce qui produisait la « pâte IA » :
// **tout est dit, tout le temps, au même niveau.**
//
// ── La règle, et elle est structurelle ──────────────────────────────────────────────────────────
//
//   **1. Le moteur produit des DONNÉES. `rendu.js` est un FORMATEUR — jamais un auteur.**
//      Une phrase qui n'existe pas dans les données ne doit pas exister dans le document.
//
//   **2. Deux NIVEAUX, séparés À LA SOURCE — pas au rendu :**
//      • `titre`  → **L'ESSENTIEL.** Une ligne. *« Développé militaire retiré (épaule ACTIVE). »*
//        C'est ce qui s'affiche. **Toujours.**
//      • `detail` → **LE POURQUOI.** Le paragraphe sourcé. **Derrière un tap.** Jamais dans le flux.
//      **La rigueur n'est pas le problème — la servir en bloc l'était.** Structurée, elle devient
//      *consultable* au lieu d'être *subie*.
//
//   **3. Rien ne se perd.** `markdown` conserve le message **d'origine, mot pour mot**. Le
//      document Markdown historique reste reproductible **au caractère près** — on n'a pas troqué
//      la traçabilité contre de l'ergonomie.
//
// ⚠️ **Ce module n'ajoute AUCUNE règle de programmation.** Pas un volume, pas un coefficient, pas
// un seuil. Il **transporte** ce que les autres modules ont décidé. C'est un contrat de données.
//
// Module PUR : zéro dépendance.

/**
 * **QUOI** — la nature de l'avis. Elle pilote l'endroit où l'app l'affiche, pas sa mise en forme.
 *
 * • `adaptation` — le moteur a **CHANGÉ** le programme (retrait, substitution, plafond, RIR, gel).
 *                  **C'est le type le plus important : il porte toujours une `cible`.**
 * • `alerte`     — quelque chose demande une **action ou une vigilance** (volume hors cible,
 *                  conflit de placement, donnée manquante qui coûte cher).
 * • `aveu`       — 🕳️ le moteur **ne sait pas**, et il le dit (angle mort, chiffre non sourcé).
 *                  **Un aveu n'est pas une alerte** : il n'y a rien à corriger, il y a à savoir.
 * • `info`       — un fait utile, sans action attendue.
 * • `refus`      — le moteur **refuse** de prescrire (population hors périmètre).
 */
export const AVIS_TYPES = ["adaptation", "alerte", "aveu", "info", "refus"];

/**
 * **COMBIEN ÇA COMPTE** — et **rien d'autre**. Ce n'est ni un score de risque, ni un chiffrage :
 * c'est une **priorité d'affichage**. Le moteur ne chiffre pas la peur (veille/20 §9.3).
 */
export const GRAVITES = ["critique", "avertissement", "info"];

const ICONES = { critique: "🔴", avertissement: "⚠️", info: "ℹ️" };

/** L'icône d'une gravité — pour que `rendu.js` n'ait pas à en choisir une (il n'a rien à décider). */
export function iconeGravite(gravite) {
  return ICONES[gravite] ?? ICONES.info;
}

/**
 * Crée un avis **AUTORÉ** : `titre` et `detail` ont été écrits séparément, par le module qui a pris
 * la décision. C'est la forme **cible**.
 *
 * @param {object}  a
 * @param {string}  a.type    voir `AVIS_TYPES`
 * @param {string}  a.titre   **L'ESSENTIEL, en une ligne.** Obligatoire — c'est ce qui s'affiche.
 * @param {string=} a.detail  **LE POURQUOI**, sourcé. Facultatif, mais c'est lui la valeur.
 * @param {string=} a.gravite voir `GRAVITES` (défaut `info`)
 * @param {string=} a.source  « veille/03 §5 », « ADR 0006 §1.5 »… — **la source, isolée**, pour que
 *                            l'app puisse l'afficher (ou pas) sans la découper d'un paragraphe.
 * @param {object=} a.cible   **CE QUE ÇA CONCERNE** : `{ exercice, zone, seance, semaine, muscle }`.
 *                            C'est ce champ qui permet à l'app d'accrocher l'avis **au bon endroit**
 *                            (sous l'exercice concerné) au lieu de l'empiler en tête de page.
 */
export function creerAvis(a) {
  const titre = String(a?.titre ?? "").trim();
  if (!titre) {
    throw new Error("Avis sans `titre` : l'ESSENTIEL est obligatoire — c'est la seule partie qui s'affiche toujours.");
  }
  if (!AVIS_TYPES.includes(a.type)) {
    throw new Error(`Avis de type « ${a.type} » inconnu : attendu ${AVIS_TYPES.join(" | ")}.`);
  }
  const gravite = a.gravite ?? "info";
  if (!GRAVITES.includes(gravite)) {
    throw new Error(`Avis de gravité « ${gravite} » inconnue : attendu ${GRAVITES.join(" | ")}.`);
  }
  const detail = a.detail ? String(a.detail).trim() : null;
  return {
    id: a.id ?? null,
    type: a.type,
    gravite,
    titre,
    detail,
    source: a.source ?? null,
    cible: a.cible ?? null,
    // `auteur` : les deux niveaux ont été **écrits** séparément.
    // `auto`   : ils ont été **découpés** mécaniquement d'un message historique (voir ci-dessous).
    structure: "auteur",
    // 🔒 Le message d'origine, **intact**. C'est lui qui garantit qu'aucune information n'a été
    // perdue en passant du document à la donnée.
    markdown: a.markdown ?? (detail ? `${titre}\n\n${detail}` : titre),
  };
}

/**
 * ⚠️ **L'ADAPTATEUR — et c'est une DETTE, pas une solution.**
 *
 * Le moteur a des dizaines de messages écrits **en un seul bloc de prose** (héritage du terminal).
 * Les réécrire tous en `titre` + `detail` est un chantier — et le faire à la va-vite produirait des
 * titres bâclés, c'est-à-dire **exactement le problème qu'on répare**.
 *
 * En attendant, ce découpage **mécanique** (première proposition = titre, le reste = détail) rend
 * ces messages **consommables par l'app** dès aujourd'hui. Il est marqué `structure: "auto"` : l'app
 * **sait** que le titre n'a pas été écrit pour être un titre, et un test **compte** ces avis pour
 * que la dette reste **visible et chiffrée** au lieu de s'installer en silence.
 *
 * 🔒 **`markdown` reste le message d'origine, mot pour mot** — le découpage n'efface rien.
 */
export function avisDepuisTexte(texte, meta = {}) {
  const t = String(texte ?? "").trim();
  if (!t) return null;
  const { titre, detail } = decouper(t);
  return {
    ...creerAvis({ ...meta, type: meta.type ?? "alerte", titre, detail, markdown: t }),
    structure: "auto",
  };
}

/**
 * Découpe « l'essentiel » du « pourquoi ». Conservateur par construction : en cas de doute, **tout
 * reste dans le titre** (un titre trop long est laid ; un détail qui avale l'essentiel est un bug).
 */
function decouper(t) {
  const MIN = 25; // sous cette longueur, une coupure produirait un titre creux (« ⚠️ Attention »).
  const bornes = [];
  const para = t.indexOf("\n\n");
  if (para >= MIN) bornes.push({ i: para, saut: 2 });
  for (const sep of [" — ", ". ", " : "]) {
    const i = t.indexOf(sep, MIN);
    if (i > 0) bornes.push({ i: sep === ". " ? i + 1 : i, saut: sep.length - (sep === ". " ? 1 : 0) });
  }
  if (!bornes.length) return { titre: t, detail: null };
  const c = bornes.sort((a, b) => a.i - b.i)[0];
  const detail = t.slice(c.i + c.saut).trim();
  // Un « détail » trop court n'en est pas un : mieux vaut un titre complet qu'un tap sur du vide.
  if (detail.length < 30) return { titre: t, detail: null };
  return { titre: t.slice(0, c.i).trim(), detail };
}

/**
 * Projette les adaptations de MUSCULATION (`appliquerLimitations`) en avis structurés.
 *
 * 🎯 **C'est ici que l'app gagne ce qu'elle ne pouvait pas avoir** : chaque adaptation porte son
 * **exercice concerné** (`cible.exercice`) et sa **séance** (`cible.seance`) — l'app peut donc
 * l'afficher **sous l'exercice**, au moment où l'utilisateur le regarde, au lieu de l'empiler dans
 * un mur de texte en tête de programme.
 */
export function adaptationsMuscuEnAvis(lim) {
  const out = [];

  for (const r of lim?.retraits ?? []) {
    out.push(
      creerAvis({
        id: `retrait:${r.zone}:${r.seance}:${r.exercice}`,
        type: "adaptation",
        gravite: "avertissement",
        titre: `**${r.exercice}** — RETIRÉ de « ${r.seance} »${r.filet ? " (filet de cohérence)" : ""}`,
        detail: r.pourquoi ?? null,
        cible: { discipline: "muscu", levier: "retrait", zone: r.zone, seance: r.seance, exercice: r.exercice, pattern: r.pattern ?? null },
      })
    );
  }
  for (const s of lim?.substitutions ?? []) {
    out.push(
      creerAvis({
        id: `substitution:${s.zone}:${s.seance}:${s.avant}`,
        type: "adaptation",
        gravite: "info",
        titre: `**${s.avant}** → **${s.apres}** dans « ${s.seance} » (même pattern, charge différente)`,
        detail: s.pourquoi ?? null,
        cible: { discipline: "muscu", levier: "substitution", zone: s.zone, seance: s.seance, exercice: s.apres, remplace: s.avant, pattern: s.pattern ?? null },
      })
    );
  }
  for (const p of lim?.plafonds ?? []) {
    out.push(
      creerAvis({
        id: `plafond:${p.zone}:${p.exercice}`,
        type: "adaptation",
        gravite: "avertissement",
        titre: `**${p.exercice}** — charge PLAFONNÉE (progression par les reps seulement)`,
        detail: p.pourquoi ?? null,
        cible: { discipline: "muscu", levier: "plafond", zone: p.zone, exercice: p.exercice },
      })
    );
  }
  // ⚠️ Un même exercice peut voir son RIR relevé DEUX FOIS, pour deux raisons différentes : une
  // zone contrainte (épaule ACTIVE), puis une charge non mesurée. Les deux étapes sortent, dans
  // l'ordre — c'est la CHAÎNE qui explique le RIR final, et une seule de ses maillons ne
  // l'explique pas. L'`id` porte donc le motif, sinon la seconde écraserait la première.
  for (const r of lim?.rir_ajustes ?? []) {
    out.push(
      creerAvis({
        id: `rir:${r.zone ?? r.motif ?? "?"}:${r.exercice}`,
        type: "adaptation",
        gravite: "info",
        titre: `**${r.exercice}** — RIR relevé de ${r.avant} à ${r.apres} : pas de recherche d'échec`,
        detail: r.pourquoi ?? null,
        cible: { discipline: "muscu", levier: "rir", zone: r.zone ?? null, motif: r.motif ?? null, exercice: r.exercice, rir_avant: r.avant, rir_apres: r.apres },
      })
    );
  }
  for (const p of lim?.progression_prudente ?? []) {
    const quoi = [...(p.patterns ?? []), ...(p.slots ?? [])].join(", ") || "les mouvements concernés";
    out.push(
      creerAvis({
        id: `progression:${p.zone}`,
        type: "adaptation",
        gravite: "info",
        titre: `Progression PRUDENTE sur ${quoi} — reps avant charge, plus petit palier`,
        detail: p.pourquoi ?? null,
        cible: { discipline: "muscu", levier: "progression_prudente", zone: p.zone, patterns: p.patterns ?? [], slots: p.slots ?? [] },
      })
    );
  }
  return out;
}

/**
 * Projette les adaptations de COURSE (`appliquerLimitationsCourse`) en avis structurés.
 * Elles portent une **zone**, pas un exercice : c'est la sortie qui change, pas un mouvement.
 */
export function adaptationsCourseEnAvis(limCourse) {
  const out = [];
  for (const l of limCourse?.limitations ?? []) {
    for (const a of l.actions ?? []) {
      out.push(
        creerAvis({
          id: `course:${a.type}:${l.zone}`,
          type: "adaptation",
          gravite: l.statut === "ACTIF" ? "avertissement" : "info",
          titre: `${a.quoi} — **${l.libelle}** (${l.statut})`,
          detail: a.pourquoi ?? null,
          cible: { zone: l.zone, discipline: "course", levier: a.type },
        })
      );
    }
  }
  return out;
}

/** Les avis d'un type / d'une gravité — l'app filtre, elle ne parse pas. */
export function filtrerAvis(avis, { type = null, gravite = null } = {}) {
  return (avis ?? []).filter((a) => (!type || a.type === type) && (!gravite || a.gravite === gravite));
}

/**
 * Le canal historique : `alertes: string[]`. **Dérivé** des avis, jamais écrit en parallèle —
 * un fait dupliqué est un fait qui divergera (philosophy §11). Le CLI et les tests existants
 * continuent de le lire, **au caractère près**.
 */
export function alertesDepuisAvis(avis) {
  return (avis ?? []).filter((a) => a.type !== "adaptation").map((a) => a.markdown);
}
