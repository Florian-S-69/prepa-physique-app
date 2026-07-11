// Rendu Markdown des sorties du moteur — chaque bloc est justifié (exigence Phase 1 :
// "chaque bloc justifié"). Couche statique pour le prototype ; la reformulation
// conversationnelle par LLM viendra en Phase 4.

import { formatAllure, formatDuree } from "./vdot.js";
import { MUSCLES_ACCESSOIRES, LIBELLES_PATTERN } from "./exercices.js";
import { NIVEAUX_PREUVE } from "./echauffement.js";
import { CADENCE_SOURCE, CADENCE_RETIRE, CADENCE_EN_DESCENTE, SEUIL_NUDGE_CONVENTION } from "./cadence.js";
import { AVEUGLEMENT_DESCENTE, RECUP_DESCENTE, EFFET_REPETE, SPECIFICITE_PROTEGE, CONVERSION_DPLUS_KM, INTERDITS_DENIVELE } from "./denivele.js";
import { FENETRE_DESCENTE } from "./placement.js";

export const DISCLAIMER = `> **Disclaimer** : ce document est généré à titre d'information générale, il ne remplace
> pas un avis médical. En cas de pathologie, douleur inhabituelle, trouble du comportement
> alimentaire ou doute sur votre aptitude, consultez un professionnel de santé (veille/07).`;

const SECURITE_MUSCU = `## Sécurité
- Échauffement spécifique avant chaque séance (montées en charge progressives sur le premier exercice).
- Technique avant charge : ne pas monter la charge tant que l'exécution se dégrade.
- Douleur articulaire aiguë ≠ courbature : arrêter l'exercice, adapter, consulter si ça persiste (veille/02 §6).`;

const SECURITE_RUNNING = `## Sécurité
- Progressivité avant tout : ne jamais rattraper une semaine manquée en la comprimant sur la suivante.
- Signaux d'alerte : douleur qui modifie la foulée, fatigue anormale persistante, sommeil dégradé → réduire, pas serrer les dents (veille/03 §5).
- L'ACWR et l'écart entre tes moyennes de charge sont des signaux parmi d'autres, jamais des oracles : croiser avec le ressenti (veille/03 §5).`;

function tableau(entetes, lignes) {
  return [
    `| ${entetes.join(" | ")} |`,
    `|${entetes.map(() => "---").join("|")}|`,
    ...lignes.map((l) => `| ${l.join(" | ")} |`),
  ].join("\n");
}

function listeHypotheses(persona, extras = []) {
  const toutes = [...(persona.hypotheses ?? []), ...extras];
  if (!toutes.length) return "";
  return `## Hypothèses à confirmer\n${toutes.map((h) => `- ${h}`).join("\n")}\n`;
}

/**
 * 🕳️ **CE QUE LE MOTEUR NE SAIT PAS DE TOI.** Le bloc que le moteur n'avait pas — et dont
 * l'absence lui faisait servir, à une femme, un déficit calorique et un programme complet sans
 * jamais mentionner qu'il ne modélise **pas** sa physiologie (un trou pourtant déclaré dans son
 * propre audit de veille). Voir `angles-morts.js`.
 *
 * Il est rendu à l'IDENTIQUE dans les trois documents (nutrition, muscu, running) : une seule
 * fonction, une seule vérité (philosophy §11 — un fait dupliqué est un fait qui divergera).
 * Il est placé **AVANT** les hypothèses : ce n'est pas une hypothèse à confirmer, c'est une
 * **limite du moteur**, et elle ne se confirmera pas toute seule.
 */
function blocAnglesMorts(persona) {
  const morts = persona.angles_morts ?? [];
  // Pas d'angle mort → chaîne vide SANS saut de ligne parasite : les documents des personas
  // existants ne bougent pas d'un caractère (non-régression stricte).
  if (!morts.length) return "";

  const blocs = morts.map((am) => {
    const lignes = [
      `### 🕳️ ${am.titre}`,
      "",
      `> ${am.fait}`,
      "",
      ...am.consequences.map((c) => `- ${c}`),
    ];
    if (am.refus) lignes.push("", am.refus);
    // `aveu` porte déjà son propre gras — le sur-emphaser produirait des `****` (gras cassé).
    lignes.push("", `> ${am.aveu}`, "", `_Source : ${am.source}_`);
    return lignes.join("\n");
  });

  return (
    `## 🕳️ Ce que le moteur ne sait pas de toi\n\n` +
    `_Le moteur a été construit et vérifié sur **deux hommes de 27 ans**. Son architecture est générique — mais ` +
    `**« générique » n'est pas « validé sur toi »**. Ce qui suit n'est pas une clause de style : c'est la liste ` +
    `**précise** de ce qu'il ignore de ta situation, d'où ça vient, et de ce qu'il **refuse d'inventer** pour combler ` +
    `le trou. **Un moteur qui te dit « je ne sais pas » est plus fiable qu'un moteur qui devine bien.**_\n\n` +
    blocs.join("\n\n") +
    "\n\n"
  );
}

// ---------------------------------------------------------------- nutrition

/**
 * ⚖️ **DISPONIBILITÉ ÉNERGÉTIQUE & RED-S — le bloc qui remplace un mensonge par un aveu.**
 *
 * 🔴 Jusqu'au 2026-07-11, ce module affichait implicitement « conforme » à tout le monde : il
 * vérifiait un **plancher calorique absolu** (`{ homme: 1500, femme: 1200 }`) **inventé**, sourcé à
 * une section de la veille qui parle de **compléments alimentaires**, et repris d'une **guideline
 * d'obésité**. Aux deux planchers, la **disponibilité énergétique** — la grandeur qui gouverne
 * réellement le RED-S — tombe à **~55 % du seuil d'alerte** (veille/21 §7.1).
 *
 * **Le pire état n'était pas l'absence de garde-fou : c'était un garde-fou qui rassurait à tort.**
 *
 * Ce bloc est affiché à **toute personne que le moteur programme** — pas seulement aux femmes.
 * **Le RED-S n'est pas « un truc de femmes »** (consensus CIO 2023) : le défaut touchait les deux
 * personas masculins sur lesquels ce moteur a été construit, **depuis le premier jour**.
 */
function blocRedS(persona, n) {
  if (!persona.muscu && !persona.running) return "";
  const rs = n.red_s;
  if (!rs) return "";
  const d = rs.disponibilite;

  const lignes = [
    "## ⚖️ Disponibilité énergétique & RED-S — ce que le moteur surveille, et ce qu'il ne surveille PAS",
    "",
    "_Le **RED-S** (déficit énergétique relatif dans le sport) est le vrai risque d'un entraînement mal nourri : cycle, " +
      "**densité osseuse**, immunité, hormones, performance. Il **ne dépend pas** de ce que tu manges dans l'absolu, mais de " +
      "ce qu'il te **reste** une fois l'entraînement payé, rapporté à ta **masse maigre** — la **disponibilité énergétique** " +
      "(veille/21 §6.3). ⚠️ **Ce n'est pas « un truc de femmes »** : le consensus CIO 2023 est explicite, **les hommes sont " +
      "exposés aussi**._",
    "",
    "> 🔴 **Aveu, et il compte.** Ce moteur a longtemps refusé de prescrire sous un **plancher calorique absolu** " +
      "(**1 500 kcal** pour un homme, **1 200 kcal** pour une femme) qu'il présentait comme un **seuil de sécurité**. " +
      "**Ces deux chiffres étaient faux** : ils viennent d'une **recommandation clinique pour l'obésité**, où ils sont la " +
      "**cible d'un régime sous suivi médical** — pas un plancher pour quelqu'un qui s'entraîne. **Et ils ne protégeaient de " +
      "rien** : à ces niveaux, la disponibilité énergétique est **à ~55 % du seuil d'alerte** pendant que le moteur affichait " +
      "« conforme ». **Retirés le 2026-07-11 — et PAS remplacés par d'autres chiffres inventés.**",
    "",
  ];

  if (d.calculable) {
    lignes.push(
      tableau(
        ["Grandeur", "Valeur", "D'où elle vient"],
        [
          ["Masse maigre", `**${d.masse_maigre.kg} kg**`, d.masse_maigre.origine],
          ["Dépense d'entraînement", `**${d.depense_exercice_kcal_j} kcal/j**`, "`nutrition.depense_exercice_kcal_j` (déclarée)"],
          [
            "**Disponibilité énergétique**",
            `**${d.de_kcal_kg_mm} kcal/kg MM/j**`,
            `(cible ${n.cible} − dépense ${d.depense_exercice_kcal_j}) ÷ ${d.masse_maigre.kg} kg de masse maigre`,
          ],
          ["Seuil d'alerte", `${d.seuil} kcal/kg MM/j`, "Loucks & Thuma 2003 (veille/21 §6.3)"],
        ]
      ),
      "",
      d.sous_le_seuil
        ? `🔴 **Sous le seuil d'alerte de ${d.seuil}** — le moteur **refuse de creuser** un déficit dans cet état.`
        : `🟢 **Au-dessus du seuil d'alerte de ${d.seuil}** — aucun frein RED-S ne se déclenche aujourd'hui.`,
      "",
      "⚠️ **Ce seuil est un SIGNAL, pas un diagnostic — et il est étroit.** Il vient de **29 femmes sédentaires suivies " +
        "5 jours**, sur **un seul marqueur hormonal**. Le **consensus CIO 2023 a lui-même abandonné le seuil unique** au profit " +
        "d'un spectre « adaptable ↔ problématique ». Le moteur s'en sert **faute de mieux, et parce qu'il est conservateur** — " +
        "pas parce qu'il serait net. **Ta masse maigre est estimée, jamais mesurée.**"
    );
  } else {
    lignes.push(
      "### 🕳️ Le moteur NE PEUT PAS surveiller ton RED-S — et il préfère te le dire",
      "",
      "**Il lui manque, très précisément :**",
      ...d.manque.map((m) => `- ${m}`),
      "",
      "**Ce qu'il refuse de faire pour combler ce trou : deviner.** Une masse maigre estimée depuis l'IMC, ou une dépense " +
        "d'entraînement extraite du facteur d'activité, produiraient un chiffre **plausible et faux** — et l'erreur irait dans " +
        "le sens **dangereux** : elle **gonflerait** ta disponibilité énergétique, donc te **rassurerait à tort**. " +
        "**C'est exactement le défaut qu'on vient de réparer. On ne le refait pas.**",
      "",
      "> **Un « je ne sais pas » explicite vaut infiniment mieux qu'un garde-fou qui ment.** Si tu veux que le moteur surveille " +
        "vraiment ce risque, donne-lui `profil.masse_grasse_pct` (ou `profil.masse_maigre_kg`) **et** " +
        "`nutrition.depense_exercice_kcal_j`. Sinon, **il ne prétendra pas le faire**.",
      "",
      "⚠️ **Signaux à ne pas laisser passer, et qu'aucune app ne verra à ta place** : cycle qui s'allonge ou disparaît, fatigue " +
        "qui ne part plus, blessures osseuses à répétition, performance qui s'effondre à charge égale. **Ça se regarde avec un " +
        "professionnel de santé.**"
    );
  }

  const freins = (rs.freins ?? []).filter((f) => !f.refus);
  if (freins.length) lignes.push("", "### Freins actifs", ...freins.map((f) => `- ${f.message}`));

  return lignes.join("\n") + "\n\n";
}

export function rendreNutrition(persona, n) {
  const { macros } = n;
  return `# Nutrition — ${persona.nom}

_Généré par le moteur Phase 1. Règles : docs/veille/04-nutrition-calories.md._

## Besoins énergétiques
${tableau(
    ["Métrique", "Valeur", "Pourquoi"],
    [
      ["BMR (Mifflin-St Jeor)", `**${n.bmr} kcal/j**`, "Formule la plus fiable (~5 % d'erreur) — veille/04 §1"],
      [`TDEE (× ${persona.nutrition.facteur_activite})`, `**${n.tdee} kcal/j**`, "Multiplicateur théorique — à remplacer par la dépense mesurée dès les wearables (veille/04 §1)"],
      ["Cible calorique", `**${n.cible} kcal/j**`, n.objectif.libelle],
    ]
  )}

## Macros
${tableau(
    ["Macro", "g/j", "kcal", "g/kg", "Pourquoi"],
    [
      ["Protéines", `**${macros.proteines.g} g**`, `${macros.proteines.kcal}`, `${macros.proteines.g_par_kg}`, "Fourchette 1,6–2,2 g/kg, levier n°1 avec l'entraînement en force (veille/04 §3)"],
      ["Lipides", `**${macros.lipides.g} g**`, `${macros.lipides.kcal}`, `${macros.lipides.g_par_kg}`, "Au-dessus du plancher 0,6–0,8 g/kg (hormonal, satiété) (veille/04 §3)"],
      ["Glucides", `**${macros.glucides.g} g**`, `${macros.glucides.kcal}`, `${macros.glucides.g_par_kg}`, "Le reste des calories — carburant de l'intensité (veille/04 §3)"],
    ]
  )}

${persona.running ? `## Modulation selon le volume de course
Le TDEE ci-dessus correspond à une **semaine de charge**. La dépense d'une sortie ≈ 1 kcal/kg/km
(soit ~${Math.round(persona.profil.poids_kg)} kcal/km ici) : entre une semaine de récupération et un pic de volume, l'écart
atteint plusieurs centaines de kcal/j. En semaine de récupération ou d'affûtage, viser **~200–300 kcal/j
de moins** ; ne jamais laisser un profil sec glisser en déficit involontaire en pleine charge (veille/12 §5).

` : ""}## Boucle d'ajustement (veille/04 §4)
Ces chiffres sont un **point de départ**, pas une vérité :
1. Suivre le **poids en moyenne lissée sur 7 jours** (pas le poids du jour).
2. Après **2–3 semaines**, comparer la tendance réelle à l'objectif (perf + adhérence incluses).
3. Réajuster par paliers de **±100–200 kcal** selon l'écart. Recalculer si le poids change durablement.

${blocRedS(persona, n)}${blocAnglesMorts(persona)}${listeHypotheses(persona)}
${DISCLAIMER}
`;
}

// ---------------------------------------------------------------- muscu

/**
 * Charges de référence fournies mais NON appliquées. Ce bloc existe parce que le contraire —
 * les laisser disparaître sans rien dire — est inacceptable sur un produit de coaching :
 * l'utilisateur donne une vraie donnée, ne la retrouve pas dans son programme, et croit que
 * c'est normal. On distingue les deux cas, car ils n'appellent pas la même action de sa part.
 */
function blocChargesNonAppliquees(p) {
  const nonAppliquees = p.charges_non_appliquees ?? [];
  if (!nonAppliquees.length) return "";

  // Trois raisons, deux traitements : « nom inconnu / charge absente » = donnée inexploitable,
  // l'utilisateur doit CORRIGER (alerte). « absent du programme » et « écarté par une
  // limitation » = la donnée est BONNE, elle n'est simplement pas utilisée cette fois (info).
  const aCorriger = nonAppliquees.filter((c) => ["nom_inconnu", "charge_absente"].includes(c.raison));
  const nonUtilisees = nonAppliquees.filter((c) => c.raison === "absent_du_programme");
  const ecartees = nonAppliquees.filter((c) => c.raison === "ecarte_par_limitation");

  // ⚠️ seulement s'il y a quelque chose à CORRIGER. Une charge écartée par une adaptation de
  // sécurité n'est pas une erreur de l'utilisateur : ne pas l'alarmer pour rien.
  const bloc = [`\n### ${aCorriger.length ? "⚠️" : "ℹ️"} Charges de référence non appliquées (${nonAppliquees.length})\n`];

  if (aCorriger.length) {
    bloc.push(
      `**${aCorriger.length} charge(s) que tu as saisie(s) n'ont PAS pu être utilisées** — le nom ne correspond à aucun exercice connu du moteur. Ces charges sont **ignorées** tant que le nom n'est pas corrigé : ton programme démarre donc **sans repère de charge** sur ces mouvements.\n`,
      tableau(
        ["Nom saisi", "Charge", "Problème", "Nom(s) suggéré(s)"],
        aCorriger.map((c) => [
          `« ${c.nom} »`,
          c.charge_kg != null ? `${c.charge_kg} kg` : "—",
          c.raison === "nom_inconnu" ? "nom inconnu du référentiel" : "aucune `charge_kg` exploitable",
          c.suggestions?.length ? c.suggestions.map((s) => `« ${s} »`).join(" · ") : "—",
        ])
      ),
      `\n_Le moteur **ne devine pas** : il suggère, il ne décide pas. Rattacher « ${aCorriger[0].nom} » à un exercice voisin sur une simple ressemblance te ferait démarrer sur une **charge fausse** — c'est un risque de blessure, pas un détail d'ergonomie. Corrige la clé dans \`muscu.charges_reference\`, puis relance \`gen\`._\n`
    );
  }

  if (nonUtilisees.length) {
    bloc.push(
      `\n**${nonUtilisees.length} charge(s) valide(s) mais non utilisée(s) cette fois** : ${nonUtilisees
        .map((c) => `« ${c.nom} » (${c.charge_kg} kg)`)
        .join(", ")}. Ces exercices sont bien connus du moteur, mais **ce split / ce matériel ne les programme pas**. Rien n'est perdu : la donnée est conservée et resservira si l'exercice revient. Aucune action de ta part.\n`
    );
  }

  if (ecartees.length) {
    bloc.push(
      `\n**${ecartees.length} charge(s) écartée(s) par une adaptation de sécurité** :\n` +
        ecartees.map((c) => `- « ${c.nom} » (${c.charge_kg} kg) — ${c.message.split(" : ").slice(1).join(" : ")}`).join("\n") +
        `\n\n_Ce n'est **ni** une erreur de saisie **ni** un oubli : c'est le moteur qui a retiré ou remplacé l'exercice pour te protéger (voir « Adaptations liées à tes limitations »). Ta donnée est intacte et reviendra dès que la limitation sera levée._\n`
    );
  }
  return bloc.join("\n");
}

/**
 * 🚑 RENVOI MÉDICAL — le bloc le plus haut du document, et le seul qui soit **bloquant**.
 *
 * veille/18 §9.1 règle 6 : « si l'utilisateur déclare l'un des signaux de la §6.5, afficher un
 * écran de renvoi vers un professionnel, NON SKIPPABLE une première fois, et retirer de la
 * génération toute prétention de "corriger" la douleur. »
 *
 * Il passe AVANT l'échauffement — parce qu'aucun échauffement ne gère ces signaux, et qu'un
 * produit qui met le protocole en premier laisserait croire l'inverse.
 */
function blocRenvoiMedical(p) {
  const r = p.renvoi_medical ?? p.limitations?.renvoi_medical;
  if (!r?.requis) return "";

  const zonesMd = r.zones
    .map(
      (z) =>
        `**${z.libelle}**${z.jamais_examinee ? " — **jamais examinée**" : ""} :\n` +
        z.signaux.map((s) => `  - 🚩 ${s.libelle}`).join("\n")
    )
    .join("\n\n");

  return `> ## 🚑 À LIRE AVANT TOUT — renvoi vers un professionnel de santé
>
> ${r.message}

${zonesMd}

**Ce que le moteur ne fait pas — et ne fera pas :**
${r.ce_que_le_moteur_ne_fait_pas.map((x) => `- ${x}`).join("\n")}

**Ce qu'il fait** : ${r.ce_que_le_moteur_fait}

${r.avertissement_detection}

_(${r.source})_

---
`;
}

/**
 * 🔥 ÉCHAUFFEMENT — la DOCTRINE, une fois, en tête. Le protocole chiffré (séries d'approche avec
 * les charges réelles) vit dans chaque séance, plus bas.
 *
 * Ce bloc est écrit sous la règle 2 de la philosophie (« ne jamais survendre un chiffre ») :
 * l'échauffement est un domaine saturé de chiffres survendus. On affiche donc l'effet réel —
 * **modeste**, **extrapolé des sports collectifs** — plutôt qu'un slogan qui vendrait mieux.
 */
function blocEchauffement(p) {
  const e = p.echauffement ?? p.limitations?.echauffement;
  if (!e) return "";
  const h = e.honnetete;
  const titre = e.non_skippable ? "## 🔥 Échauffement — IMPOSÉ, et NON SKIPPABLE" : "## 🔥 Échauffement";

  const parts = [titre];
  if (e.constat) parts.push(`\n> ${e.constat}\n`);
  parts.push(`**${e.duree_min}**, dont **rien** n'exige de matériel.\n`);
  parts.push(e.consignes.map((c) => `- ${c}`).join("\n"));
  parts.push(`\n**Pourquoi** : ${e.pourquoi}`);

  if (e.restrictions_prudence) {
    parts.push(
      `\n### Restrictions d'amplitude — **prudence, pas traitement**\n\n` +
        `${e.restrictions_prudence.texte}\n\n` +
        `À éviter tant que la zone est active : ${e.restrictions_prudence.epaule.map((x) => `${x}`).join(" · ")}.\n\n` +
        `_(${e.restrictions_prudence.source})_`
    );
  }

  if (h) {
    parts.push(`
### Ce que l'échauffement fait vraiment (le bouton « pourquoi ? »)

_Niveaux de preuve : ${Object.entries(NIVEAUX_PREUVE)
      .map(([, v]) => v.badge)
      .join(" · ")}. Chaque item d'échauffement porte le sien — c'est ce qui distingue un coach d'un vendeur._

- ${NIVEAUX_PREUVE[h.blessure.preuve].badge} ${h.blessure.texte}
- ${NIVEAUX_PREUVE[h.performance.preuve].badge} ${h.performance.texte}
- ${NIVEAUX_PREUVE[h.cadre.preuve].badge} ${h.cadre.texte}
- ${NIVEAUX_PREUVE[h.series_approche.preuve].badge} ${h.series_approche.texte}
- ${NIVEAUX_PREUVE[h.etirements.preuve].badge} ${h.etirements.texte}
${h.etirements.regles.map((r) => `  - ${r}`).join("\n")}
- ${h.pas_de_pape}

### Sans matériel
${e.sans_materiel.texte}
`);
  }
  parts.push(`_(${e.source})_\n`);
  return parts.join("\n");
}

/** Le badge de preuve d'un item, ou rien s'il n'en porte pas. */
function badgePreuve(item) {
  return item.preuve ? NIVEAUX_PREUVE[item.preuve]?.badge ?? "" : "";
}

/**
 * ÉCHAUFFEMENT D'UNE SÉANCE — RAMP comme checklist, et les séries d'approche **chiffrées avec
 * les charges réelles de l'utilisateur** (règle 4 de veille/18 §9.1 : « affichées comme des
 * SÉRIES cochables, pas comme un conseil vague »).
 */
function blocEchauffementSeance(e) {
  if (!e) return "";
  const titre = e.non_skippable
    ? `#### 🔥 Échauffement (${e.duree_min}) — 🔒 **NON SKIPPABLE**`
    : `#### 🔥 Échauffement (${e.duree_min})`;

  const parts = [titre];
  if (e.pourquoi_non_skippable) parts.push(`\n> ${e.pourquoi_non_skippable}\n`);

  const phasesAvecItems = e.phases.filter((ph) => ph.items?.length);
  if (phasesAvecItems.length) {
    parts.push(
      tableau(
        ["Phase", "Quoi", "Combien", "Pourquoi", "Preuve"],
        phasesAvecItems.flatMap((ph) =>
          ph.items.map((i, idx) => [
            idx === 0 ? `**${ph.nom.split(" — ")[0]}**` : "",
            `${i.bonus ? "➕ _(bonus matériel)_ " : ""}${i.quoi}`,
            i.combien,
            `${i.pourquoi} _(${i.source})_`,
            badgePreuve(i),
          ])
        )
      )
    );
  }

  // Séries d'approche — le seul point CHIFFRÉ du dossier, et donc le seul qu'on chiffre.
  const app = e.series_approche ?? [];
  if (app.length) {
    parts.push(`\n**P — Séries d'approche** (avec **tes** charges) :`);
    for (const a of app) {
      if (!a.charge_connue) {
        parts.push(`- **${a.exercice}** — ⚠️ ${a.message}`);
        continue;
      }
      const series = a.series
        .map((s) => (s.charge_kg != null ? `**${s.reps} reps @ ${s.charge_kg} kg** _(${s.palier})_` : `**${s.reps} reps ${s.palier}**`))
        .join(" → ");
      parts.push(
        `- **${a.exercice}**${a.re_test ? " 🎯" : ""} — ${series}\n` +
          `  _${a.pourquoi ?? a.series[0]?.pourquoi ?? ""}_` +
          (a.re_test
            ? `\n  _🎯 Cette charge est une **estimation à re-tester** : la montée en charge ci-dessus **EST** ton re-test — on s'arrête au premier palier où la technique bouge._`
            : "")
      );
    }
    if (e.exercices_deja_chauds?.length) {
      parts.push(
        `\n_Les exercices suivants du **même pattern** (${e.exercices_deja_chauds.join(", ")}) n'ont **pas** besoin de séries d'approche : le pattern est déjà chaud (**0 ou 1** série suffit — veille/18 §5.3)._`
      );
    }
  }
  return parts.join("\n") + "\n";
}

/**
 * ADAPTATIONS LIÉES AUX LIMITATIONS — le bloc qui rend le troisième état du moteur lisible.
 *
 * Principe produit (philosophy §4) : l'utilisateur doit pouvoir demander « pourquoi ? » et
 * obtenir la VRAIE raison. Donc : ce qui a été changé, pourquoi, ce qu'il faut surveiller —
 * et ce que le moteur n'a PAS su traiter (une limitation ignorée en silence serait pire que
 * pas de limitation du tout : elle donnerait une fausse impression de sécurité).
 */
function blocLimitations(p) {
  const l = p.limitations;
  if (!l || (!l.limitations.length && !l.non_appliquees.length)) return "";

  const parts = ["\n## 🩹 Adaptations liées à tes limitations\n"];
  parts.push(
    "_Le moteur **adapte** — il ne refuse pas de programmer, et il ne prescrit pas en aveugle. " +
      "Chaque changement ci-dessous porte son **pourquoi**. Rien n'a été modifié en silence, et rien " +
      "de ce que tu as déclaré n'a été ignoré sans le dire._\n"
  );

  for (const lim of l.limitations) {
    parts.push(`### ${lim.libelle} — ${lim.libelle_statut}${lim.gravite ? ` · gravité déclarée : **${lim.gravite}**` : ""}`);
    if (lim.description) parts.push(`> ${lim.description}\n`);
    if (lim.actions.length) {
      parts.push(
        tableau(
          ["Ce que le moteur a changé", "Pourquoi"],
          lim.actions.map((a) => [`${ICONE_ACTION[a.type] ?? "•"} ${a.quoi}`, a.pourquoi])
        )
      );
    } else {
      parts.push(`_${lim.info ?? "Aucune restriction appliquée."}_`);
    }
    if (lim.info && lim.actions.length) parts.push(`\n_${lim.info}_`);
    parts.push("");
  }

  if (l.regles.length) {
    parts.push("### Les règles qui en découlent\n" + l.regles.map((r) => `- ${r}`).join("\n") + "\n");
  }

  if (l.surveiller.length) {
    parts.push(
      "### À surveiller (et quoi faire si ça arrive)\n" +
        l.surveiller.map((s) => `- **${s.libelle}** — ${s.signal}`).join("\n") +
        "\n\n_Une douleur articulaire **aiguë** n'est pas une courbature : on arrête le mouvement, on ne « pousse pas à travers » (veille/02 §6)._\n"
    );
  }

  if (l.hypothese_clinique) {
    parts.push(`### 🔍 Ce que tes données laissent penser (hypothèse, pas diagnostic)

${l.hypothese_clinique.message}

_${l.hypothese_clinique.source}_
`);
  }

  if (l.charges_non_mesurees?.exercices?.length) {
    parts.push(`### 🎯 Charges estimées, pas mesurées

${l.charges_non_mesurees.exercices.map((n) => `- **${n}**`).join("\n")}

Tu as toi-même déclaré ces charges comme des **estimations prudentes à re-tester** (\`charges_actuelles_a_tester\`).
Le moteur **ne prescrit pas du lourd à quasi-échec sur une charge qu'il n'a pas mesurée** : sur ces exercices, le
**RIR est relevé à 3+** le temps d'une **séance de re-test** (montée en charge progressive, 2–3 reps par palier,
on s'arrête dès que la technique bouge). Une fois la charge réelle connue, log-la (\`log … --ex=…\`) puis
\`recaler\` : la prescription repartira du réel (veille/02 §4).
`);
  }

  if (l.renvois_pro.length) {
    parts.push(
      "### 🩺 Ce qu'un programme ne peut pas faire à ta place\n\n" +
        l.renvois_pro.map((r) => `- ${r.message}`).join("\n") +
        "\n"
    );
  }

  if (l.non_appliquees.length) {
    parts.push(
      `### ⚠️ Limitations NON traitées par le moteur (${l.non_appliquees.length})\n\n` +
        l.non_appliquees.map((na) => `- ${na.message}`).join("\n") +
        "\n\n_Le moteur préfère dire « je n'ai rien adapté pour ça » plutôt que de te laisser croire que c'est couvert. " +
        "Une limitation qu'on croit prise en compte et qui ne l'est pas est **plus dangereuse** qu'une limitation connue._\n"
    );
  }

  return parts.join("\n");
}

const ICONE_ACTION = {
  retrait: "🚫 **Retiré**",
  substitution: "🔁 **Remplacé**",
  substitution_impossible: "⚠️ **Conservé faute de variante**",
  plafond: "🔒 **Charge plafonnée**",
  rir: "🎚️",
  progression: "🐢",
  // Course
  volume: "📉",
  denivele: "⛰️",
  cadence: "🎯",
  placement: "📅",
};

/**
 * ADAPTATIONS DE COURSE — le bloc qui comble le trou.
 *
 * Avant lui, `limitations` n'adaptait que la MUSCULATION : un coureur qui déclarait un genou
 * douloureux voyait ses squats changer et ses SORTIES rester intactes. Ce n'était pas un trou de
 * confort, c'était un trou de SÉCURITÉ — le moteur savait protéger une épaule en salle et laissait
 * courir sur un genou sans rien dire.
 *
 * Ce bloc dit trois choses, et il les distingue soigneusement :
 *   1. ce que le moteur a **changé** à tes sorties, et **pourquoi** (sourcé) ;
 *   2. ce qu'il a **délibérément** laissé intact (« la course ne charge pas ton épaule ») ;
 *   3. ce qu'il **ne sait pas** (surface, chaussures, seuil de D+) — parce qu'un silence et un
 *      « je n'ai rien » ne se valent pas.
 */
function blocLimitationsCourse(p) {
  const c = p.limitations_course;
  if (!c?.court) return "";
  if (!c.limitations.length && !c.non_appliquees.length) return "";

  const parts = ["\n## 🏃 Ce que tes limitations changent à TES SORTIES\n"];
  parts.push(
    "_Une limitation n'est **pas** une affaire de salle. **La course est un impact répété**, et surtout : " +
      "**la descente est EXCENTRIQUE** — c'est elle qui charge une articulation, bien plus que le plat. " +
      "Jusqu'ici le moteur adaptait tes séances de muscu et te laissait courir sans rien dire. **C'est corrigé.**_\n"
  );

  for (const lim of c.limitations) {
    parts.push(`### ${lim.libelle} — ${lim.libelle_statut}`);
    if (lim.sans_objet) {
      parts.push(`_${lim.info}_\n`);
      continue;
    }
    if (lim.actions.length) {
      parts.push(
        tableau(
          ["Ce que le moteur change à ta course", "Pourquoi"],
          lim.actions.map((a) => [`${ICONE_ACTION[a.type] ?? "•"} ${a.quoi}`, a.pourquoi])
        )
      );
    } else {
      parts.push(`_${lim.info ?? "Aucune restriction appliquée à la course."}_`);
    }
    parts.push("");
  }

  // 🎯 LA CADENCE — le MEILLEUR levier (base biomécanique). S'il manque la donnée, on la RÉCLAME.
  if (c.cadence?.requise) {
    parts.push(`### 🎯 La cadence — le **meilleur** levier dont le moteur dispose pour toi

${
  c.cadence.connue
    ? `Ta cadence déclarée : **${c.cadence.valeur} pas/min**. Le nudge de cadence n'est **plus optionnel** pour toi (voir le bloc « Cadence » du plan de course).`
    : `⚠️ **Ta cadence est INCONNUE — et c'est le problème.** C'est le levier au **meilleur rapport bénéfice/coût** pour réduire la charge sur ${c.cadence.zones.join(", ")} quand tu cours. **Mesure-la** (montre, ou compte tes pas sur 30 s × 2) puis renseigne \`running.cadence_spm\`. Le moteur **n'inventera pas ta cadence** — mais sans elle, il ne peut pas chiffrer ton nudge.`
}

Une hausse **modérée** (**+5 à 10 %** au-dessus de ta cadence spontanée, **progressive, jamais brutale**) raccourcit la foulée, abaisse le **pic de flexion du genou** et donc la contrainte **fémoro-patellaire** : **−14 % de force de pointe** pour **+10 % de fréquence de pas** (Lenhart 2014). **Coût métabolique : nul. Risque : nul. Réversible en une sortie.**${
      c.cadence.hors_cible_source
        ? " ⚠️ **Honnêteté** : les sources nomment le **fémoro-patellaire (genou)**, le **tibia** et le **tendon d'Achille** — elles **ne nomment pas** toutes tes zones. On te donne le levier ; on ne te promet pas un effet démontré sur une zone que la source ne cite pas."
        : ""
    }

${c.cadence.en_descente ?? CADENCE_EN_DESCENTE}

_${c.cadence.source}_

🔴 **Nuance honnête, et elle a coûté deux chiffres.** La base de ce levier est **BIOMÉCANIQUE** (on mesure des **forces**, pas des blessures évitées) ; sa base **clinique est FAIBLE**. **Les deux chiffres cliniques qui le justifiaient jusqu'ici ont été RETIRÉS le 2026-07-11** : ils ne disaient pas ce qu'on leur faisait dire. C'est le **meilleur levier disponible** ; ce n'est **pas** une garantie, et le moteur ne te vendra pas l'inverse.

<details><summary>Le détail des deux retraits</summary>

${c.cadence.retire ? c.cadence.retire.map((x) => `- ${x}`).join("\n") : ""}

</details>
`);
  }

  if (c.regles.length) {
    parts.push("### Les règles qui en découlent\n" + c.regles.map((r) => `- ${r}`).join("\n") + "\n");
  }

  if (c.surveiller.length) {
    parts.push(
      "### À surveiller quand tu cours\n" +
        c.surveiller.map((s) => `- **${s.libelle}** — ${s.signal}`).join("\n") +
        "\n\n_Une douleur articulaire **aiguë** n'est pas une courbature : la sortie s'arrête là (veille/02 §6)._\n"
    );
  }

  if (c.renvois_pro.length) {
    parts.push("### 🩺 Ce qu'un plan ne peut pas faire à ta place\n\n" + c.renvois_pro.map((r) => `- ${r.message}`).join("\n") + "\n");
  }

  // ⚠️ CE QUE LE MOTEUR NE SAIT PAS. Ce bloc est le plus important de la page : il empêche
  // l'utilisateur de croire qu'un silence est une validation.
  parts.push(
    "### ⚠️ Ce que le moteur **ne sait pas** (et ne prétendra pas savoir)\n\n" +
      c.non_source.map((n) => `- ${n}`).join("\n") +
      "\n\n_Un moteur qui se tait sur ces points laisserait croire qu'ils sont couverts. Ils ne le sont pas — " +
      "et le dire est la seule façon honnête de te laisser décider._\n"
  );

  if (c.non_appliquees.length) {
    parts.push(
      `### ⚠️ Limitations NON traitées côté COURSE (${c.non_appliquees.length})\n\n` +
        c.non_appliquees.map((na) => `- ${na.message}`).join("\n") +
        "\n\n_Ton programme de salle peut être adapté alors que tes **sorties** ne le sont pas. " +
        "Le moteur préfère te le dire que te laisser croire l'inverse._\n"
    );
  }

  return parts.join("\n");
}

/** Garde-fou d'interférence lombaire (veille/02 §5, veille/09 §1, veille/11 §2). */
function blocChargeLombaire(p) {
  const l = p.charge_lombaire;
  if (!l?.seances?.length) return "";
  return `
### 🦴 Charge lombaire — le maillon qu'on oublie de compter

${l.seances_par_semaine} séance(s)/sem chargent lourdement le bas du dos (${l.series_hebdo} séries/sem) :

${l.seances.map((s) => `- **${s.seance}** — ${s.exercices.join(", ")} (${s.series} séries)`).join("\n")}

Le soulevé de terre, le soulevé de terre roumain et le squat lourd tirent tous sur **le même maillon** : les érecteurs du rachis. Ce maillon n'apparaît dans **aucune fourchette de volume** (il est classé « accessoire ») — la fatigue peut donc s'y accumuler alors que chaque muscle est, lui, « dans la cible ». D'où ce bloc.

${l.regles.map((r) => `- ${r}`).join("\n")}

_Ce n'est pas un chiffrage de risque de blessure (aucun seuil sourcé ne le permettrait) : c'est un garde-fou de **récupération**. Si la perf baisse à charge égale ou que le bas du dos reste raide → deload (veille/02 §5)._
`;
}

// Marqueurs posés par les limitations — ils doivent être VISIBLES là où l'utilisateur lit sa
// séance, pas seulement dans un bloc en bas de page.
function marqueurs(e) {
  const m = [];
  if (e.substitue_depuis) m.push("🔁");
  if (e.plafond_charge) m.push("🔒");
  if (e.charge_a_confirmer) m.push("🎯");
  if (e.progression_prudente) m.push("🐢");
  return m.length ? ` ${m.join("")}` : "";
}

function chargeAffichee(e) {
  if (e.charge_max_kg != null) return ` @ **${e.charge_max_kg} kg max**`;
  if (e.charge_depart_kg != null) return ` @ **${e.charge_depart_kg} kg**`;
  return "";
}

export function rendreMuscu(persona, p) {
  const legende = [];
  if (p.seances.some((s) => s.exercices.some((e) => e.substitue_depuis))) legende.push("🔁 exercice **remplacé** par une variante mieux tolérée (limitation)");
  if (p.seances.some((s) => s.exercices.some((e) => e.plafond_charge))) legende.push("🔒 **charge plafonnée** (limitation) : progresser par les reps, pas par la charge");
  if (p.seances.some((s) => s.exercices.some((e) => e.charge_a_confirmer))) legende.push("🎯 charge **estimée, non mesurée** : séance de re-test avant de charger");
  if (p.seances.some((s) => s.exercices.some((e) => e.progression_prudente))) legende.push("🐢 **progression prudente** (limitation) : plus petit palier, reps avant charge");

  const seancesMd = p.seances
    .map(
      (s) => `### ${s.nom}${p.frequence > 1 ? ` — ×${Math.round(p.frequence * 10) / 10}/sem` : ""}

${blocEchauffementSeance(s.echauffement)}
${tableau(
        ["Exercice", "Séries × reps", "RIR", "Repos", "Consigne clé (alternative)"],
        s.exercices.map((e) => [
          (e.superset ? `${e.superset} · ${e.nom}` : e.nom) + marqueurs(e),
          `${e.series} × ${e.reps}${chargeAffichee(e)}`,
          e.rir,
          e.repos,
          `${e.consigne} _(${e.alternative})_`,
        ])
      )}
${s.exercices.some((e) => e.superset) ? "\n_A1/A2 = superset (paire sans interférence : enchaîner les deux, récupérer ensuite) — gain de temps._" : ""}`
    )
    .join("\n\n");

  const { min, max } = p.cible_volume;
  const volumeMd = tableau(
    ["Muscle", "Séries pondérées/sem", `Dans la cible ${min}–${max} ?`],
    Object.entries(p.volume_par_muscle).map(([m, s]) => [
      m,
      String(s),
      MUSCLES_ACCESSOIRES.includes(m) ? "n/a (accessoire)" : s >= min && s <= max ? "✅" : s < min ? "⬇️ sous la cible (voir hypothèses)" : "⚠️ au-dessus",
    ])
  );

  return `# Programme musculation — ${persona.nom}

_Généré par le moteur Phase 1. Règles : docs/veille/02 (volume/RIR/progression), veille/09 (biomécanique), veille/10 (ton & vocabulaire), veille/11 (hybride), veille/18 (échauffement)._

${blocRenvoiMedical(p)}**Objectif** : ${p.objectif} · **Niveau** : ${p.niveau} · **Split** : ${p.split} (${persona.muscu.jours_par_semaine} j/sem) · **Matériel** : ${p.materiel}

_Exercices sélectionnés dans **${p.referentiel.source}** (${p.referentiel.exercices} exercices) : chaque mouvement proposé est faisable avec le matériel déclaré et au niveau déclaré — les variantes hors de portée sont écartées, pas adaptées au petit bonheur._${
    p.slots_manquants?.length
      ? `\n\n> ⚠️ **${p.slots_manquants.length} mouvement(s) non couvert(s) par « ${p.materiel} »** : ${[...new Set(p.slots_manquants.map((m) => LIBELLES_PATTERN[m.pattern] ?? m.pattern))].join(", ")}. Détail et remède en bas de page (contrôle du volume). Rien n'a été remplacé par un exercice inadapté.`
      : ""
  }

## Pourquoi ce split
${p.note_split}

${blocEchauffement(p)}
## Semaine type
${p.jours.map((j) => `- ${j}`).join("\n")}

${seancesMd}
${legende.length ? `\n${legende.map((l) => `- ${l}`).join("\n")}\n` : ""}${p.charges_reprises?.length ? `
_⚓ **Charge de départ** = dernière charge de travail réellement encaissée (reprise du journal via \`recaler\`) : le programme repart du réel, pas d'un repère à vide (double progression, veille/02 §4). Reprise sur ${new Set(p.charges_reprises.map((c) => c.nom)).size} exercice(s) — ré-échauffer et confirmer la charge à la première séance, la double progression fait le reste._
` : ""}${blocLimitations(p)}${blocLimitationsCourse(p)}${blocChargesNonAppliquees(p)}${blocChargeLombaire(p)}
## Contrôle du volume (veille/02 §1 & §7)
Séries **pondérées** : 1 pour le moteur principal, 0,5 pour la contribution indirecte
(comptage fractionnaire). Cible ${min}–${max} séries/muscle/sem pour un profil ${p.niveau}.

${volumeMd}

${p.priorites_appliquees?.length ? p.priorites_appliquees.map((x) => `**Priorité « ${x.muscle} »** : +${x.series_ajoutees} série(s)/sem sur ses exercices principaux (le volume est le levier n°1, veille/02 §1).`).join("\n") + "\n\n" : ""}Équilibre **push/pull** (composés) : ${p.push_pull.push} vs ${p.push_pull.pull} séries — ratio ${p.push_pull.ratio} (cible ≈ 1:1, santé d'épaule, veille/09 §1).
${p.alertes.length ? "\n" + p.alertes.map((a) => `- ⚠️ ${a}`).join("\n") + "\n" : ""}
## Progression
- **Charge/reps** : ${p.progression.regle}
- **Volume** : ${p.progression.volume}

_(${p.progression.source})_ · Choix moteur : intensité pilotée en **RIR** (autorégulation) plutôt qu'en % 1RM figé (veille/02 §3).
**ROM** : amplitude complète contrôlée, vrai travail en position étirée (veille/09 §3).

## Deload
${p.deload.regle} _(${p.deload.source})_

${blocPlacementMuscu(p)}${p.hybride ? `## Hybride muscu + course
${p.hybride.regles.map((r) => `- ${r}`).join("\n")}

` : ""}${SECURITE_MUSCU}

${blocAnglesMorts(persona)}${listeHypotheses(persona, p.hypotheses_programme)}
${DISCLAIMER}
`;
}

// ---------------------------------------------------------------- running

const NOMS_PHASE = { base: "Base", specifique: "Spécifique", affutage: "Affûtage" };

const ROLE_LIBELLE = {
  mesure: "✅ mesure",
  borne_inferieure: "⚠️ borne INFÉRIEURE",
  capacite_volume: "📦 capacité de volume",
};

/**
 * ═══ LA RÉCONCILIATION DES PERFORMANCES — le « bouton pourquoi ? » du VDOT ═══════════════════
 *
 * 🔴 **Le moteur ne dérivait tout le plan que d'UNE performance.** Un coureur réel en a plusieurs,
 * **et elles se contredisent**. Ce bloc rend la contradiction VISIBLE — et le raisonnement qui la
 * résout AUDITABLE, ligne par ligne : quel VDOT chaque perf implique, quel rôle elle joue, quel
 * poids elle a reçu et **pourquoi**.
 *
 * Muet quand il n'y a rien à réconcilier (0 ou 1 perf, aucun profil) : un bloc qui parle pour ne
 * rien dire est un bloc qu'on apprend à sauter.
 */
function blocReconciliation(plan) {
  const rec = plan.reconciliation;
  if (!rec?.performances?.length) return "";
  const pertinent = rec.performances.length > 1 || rec.profil?.code !== "indetermine";
  if (!pertinent) return "";

  const km = (m) => (m % 1000 === 0 ? `${m / 1000} km` : `${(m / 1000).toFixed(1)} km`);
  const parts = ["## 📊 Tes performances — et ce que le moteur en tire\n"];

  parts.push(
    tableau(
      ["Perf", "Date", "Allure", "VDOT implicite", "Rôle", "Poids"],
      rec.performances.map((p) => [
        `**${km(p.distance_m)}** en ${p.temps}`,
        p.date_libelle,
        formatAllure(p.allure_min_par_km),
        String(p.vdot_implicite),
        ROLE_LIBELLE[p.role] ?? p.role,
        p.poids > 0 ? `**${p.poids}**` : "0",
      ])
    )
  );

  if (rec.divergence) {
    parts.push(
      `**Elles ne disent pas la même chose** — VDOT implicite de **${rec.divergence.min}** à **${rec.divergence.max}** ` +
        `(étendue **${rec.divergence.etendue}**). ${rec.divergence.pourquoi}`
    );
  }

  // Le POURQUOI de chaque rôle : c'est là que se joue l'honnêteté du calcul.
  const roles = [...new Map(rec.performances.map((p) => [p.role, p])).values()].filter((p) => p.role !== "mesure");
  for (const p of roles) {
    parts.push(`> **${km(p.distance_m)} en ${p.temps} — ${ROLE_LIBELLE[p.role]}.** ${p.role_pourquoi}`);
  }

  if (rec.retenue) {
    parts.push(
      `**→ VDOT retenu : ${plan.vdot}**, depuis ${km(rec.retenue.distance_m)} en ${rec.retenue.temps} (${rec.retenue.date}).\n` +
        `**Pourquoi celle-là** : c'est la **plus proche de ta distance objectif**, et c'est la règle la mieux étayée dont le ` +
        `moteur dispose — l'erreur de l'équivalence VDOT grimpe de ~1 % (élite) à **~10 %** chez le coureur lent, alors qu'un ` +
        `modèle fondé sur un **semi récent** reste stable (85 % de variance expliquée, MAE 5,67 % — Oficial-Casado et al., ` +
        `*Frontiers in Physiology* 2026 ; **veille/03 §2**, **veille/12 §4**). ` +
        `⚠️ Le moteur **ne prend pas la meilleure** (il te promettrait un chrono que tu ne tiendras pas) et **ne fait pas la ` +
        `moyenne** (il effacerait l'information).`
    );
  }

  // 🎯 LE PROFIL — la conclusion qui vaut le plus, et ce qu'elle change AU PLAN.
  if (rec.profil && rec.profil.code !== "indetermine") {
    parts.push(`### 🎯 Ton profil : **${rec.profil.libelle}**${rec.profil.borne_inferieure ? " — *au moins*" : ""}\n`);
    parts.push(rec.profil.raison);
    if (plan.profil_effets) {
      parts.push(
        `**Ce que ça change à TON plan — concrètement, pas en théorie :**\n` +
          `- **Phase de base : ${plan.profil_effets.semaines_base} semaines** au lieu de ${plan.profil_effets.semaines_base_sans_profil} ` +
          `(un plan « standard » pour cette échéance).\n` +
          `- **Séance de qualité : ${plan.profil_effets.qualite_orientee}.**\n\n` +
          `${rec.profil.consequence}`
      );
    } else {
      parts.push(`**Ce que ça change au plan** : ${rec.profil.consequence}`);
    }
  } else if (rec.profil) {
    parts.push(`### 🎯 Ton profil : **indéterminé**\n\n${rec.profil.raison}`);
  }

  // 📦 La preuve de capacité de VOLUME — elle ne vaut pas zéro, elle vaut autre chose.
  if (rec.capacite_volume) {
    parts.push(
      `### 📦 Tu as déjà couvert **${rec.capacite_volume.plus_longue_km} km**\n\n${rec.capacite_volume.pourquoi}`
    );
  }

  // 📈 L'ÉVOLUTION — et le silence, quand il est dû.
  const t = rec.trajectoire;
  parts.push(
    t.statut === "indeterminable"
      ? `### 📈 Ton évolution : **le moteur ne peut rien en dire**\n\n${t.pourquoi}`
      : `### 📈 Ton évolution : **${t.sens}** (${t.delta_vdot >= 0 ? "+" : ""}${t.delta_vdot} VDOT sur ${t.duree_mois} mois)\n\n${t.pourquoi}`
  );

  // 🕳️ Les limites de la pondération, dites AVANT qu'on les découvre.
  parts.push(
    `### 🕳️ Ce que cette réconciliation ne sait pas\n\n` +
      `- **La règle « la distance la plus proche de l'objectif prime » est sourcée** (veille/03 §2, veille/12 §4). ` +
      `La **forme exacte** de la pondération, elle, **ne l'est pas** : c'est une décision d'ingénierie, déclarée dans le code.\n` +
      `- **Aucune source ne dit à quelle vitesse une performance se périme.** Le moteur applique une demi-vie de ` +
      `**${rec.demi_vie_jours} jours** — un choix, pas un résultat. Il te montre le poids obtenu pour que tu puisses le contester.\n` +
      `- Le seuil au-delà duquel un écart devient un « déficit » (**${rec.seuil_divergence_pct} %**) est **transféré** de ` +
      `l'erreur du meilleur prédicteur connu (MAE 5,67 %) : sous ce seuil, on lirait du **bruit** comme un **diagnostic**. ` +
      `**Ce n'est pas l'usage que la veille fait de ce nombre, et le moteur le dit plutôt que de le cacher.**\n` +
      `- **${rec.performances.length} performances, ce n'est pas une science.** Le test chrono du plan 🧪 est ce qui rendra ` +
      `tout ceci plus juste : il **entrera dans cet historique** et **recalera le plan entier**.`
  );

  return parts.join("\n\n") + "\n\n";
}

/**
 * Allure marathon cible conservatrice (correction du biais VDOT sur les coureurs lents).
 * Ne s'affiche que pour le marathon ; muet quand la correction est nulle (élite).
 */
function blocAllureMarathon(plan) {
  const c = plan.correction_marathon;
  if (!c) return "";
  if (!c.applique) {
    return `**Allure marathon cible** : ≈ **${formatAllure(c.allure_vdot_min_par_km)}** (VDOT), soit ≈ **${formatDuree(c.prediction_vdot_min)}**.
Profil rapide/endurant : l'équivalence VDOT est fiable ici (erreur ~1 % côté élite), pas de correction appliquée.`;
  }
  const source = c.ref_endurante
    ? `Correction **atténuée** car ta référence est déjà une course longue (semi) — le VDOT y capte mieux ton endurance (l'étude privilégie un semi récent à un 10 K).`
    : `Pas de référence longue (semi) fournie → correction **pleine** ; un **temps de semi récent** la réduirait et fiabiliserait la cible.`;
  return `**Allure marathon cible (conservatrice)** : ≈ **${formatAllure(c.allure_conservatrice_min_par_km)}** → arrivée ≈ **${formatDuree(c.prediction_conservatrice_min)}**
(l'équivalence VDOT brute donnerait ${formatAllure(c.allure_vdot_min_par_km)} / ≈ ${formatDuree(c.prediction_vdot_min)} — **trop optimiste** ici).

**Pourquoi cette correction (+${c.pct_correction} %)** : le VDOT suppose une endurance stable quelle que soit la durée ;
en pratique il **surestime l'allure marathon des coureurs lents/peu endurants** — erreur absolue qui grimpe de
~1 % (élite sub-2h30) à ~10 % (profil sub-5h00) selon Oficial-Casado et al. (*Frontiers in Physiology* 2026,
DOI 10.3389/fphys.2025.1718298). ${source} Affiner ensuite par les **longues sorties à allure M** (veille/12 §3-4).`;
}

/**
 * PLACEMENT (plan running) — la contrainte jambes lourdes ↔ séances-clés (ADR 0006, Couche 2).
 * Le jour de renfo jambes n'est plus décrété : il est CALCULÉ pour ne pas tomber dans la fenêtre
 * 24–48 h avant la qualité ou la longue sortie. On le dit, avec le pourquoi sourcé.
 */
function blocPlacementPlan(plan) {
  const p = plan.placement;
  if (!p?.actif) return "";
  const f = p.fenetre;
  const lignes = [`## 🦵🏃 Placement jambes ↔ séances-clés (${f.libelle}) — veille/11 §2 & §3`];
  lignes.push(
    `**La règle** : pas de jambes lourdes moins de **${f.libelle}** avant une séance de qualité ou une longue sortie.\n` +
      `**Pourquoi** : une séance de jambes menée près de l'échec dégrade la capacité à produire de la force **rapidement** ` +
      `pendant **jusqu'à 48 h** (dommages musculaires). Courir dur dans cette fenêtre donne une séance **moins bonne, pour la ` +
      `même fatigue**. 🟢 **Démontré** (${f.source}) — et ça ne demande **aucune calibration**.`
  );
  lignes.push(
    `**Ce que le moteur a fait** : le jour de renfo jambes n'est pas décrété — il est **choisi** parmi les jours libres, en ` +
      `testant chacun contre cette contrainte. Le lundi porte le **haut du corps** (l'interférence y est faible, veille/11 §2), ` +
      `donc il ne coûte rien. En **affûtage**, la séance devient un entretien léger : plus de jambes lourdes, plus de contrainte.`
  );
  if (p.conflits.length) {
    lignes.push(
      `⚠️ **${p.conflits.length} conflit(s) résiduel(s)** que le moteur n'a pas pu supprimer :\n` +
        p.conflits.slice(0, 3).map((c) => `- Semaine ${c.semaine} — ${c.pourquoi}`).join("\n")
    );
  } else if (p.limites.length) {
    lignes.push(
      `ℹ️ ${p.limites.length} placement(s) à la **borne haute** de la fenêtre (≈ 48 h) : acceptable, mais si les jambes ` +
        `sont encore raides le jour J, décale la salle d'un jour. Le moteur ne durcit pas au-delà de ce que la source dit.`
    );
  } else {
    lignes.push(`✅ **Aucun conflit** : les jambes lourdes sont tenues à distance de la qualité et de la longue sortie sur tout le plan.`);
  }
  lignes.push(blocSignauxDescente(p.signaux_descente, f));
  return lignes.filter(Boolean).join("\n\n") + "\n\n";
}

/**
 * ⛰️🔴 LE SIGNAL DE DESCENTE — l'angle mort de l'ADR 0006, remonté au lieu d'être rustiné.
 *
 * La fenêtre de placement (24–48 h) vient de la **MUSCULATION**. Après une grosse descente, les
 * données parlent en **JOURS** (3–4). **Aucune source ne donne la bonne fenêtre** → le moteur
 * **n'en fabrique pas**. Il **détecte**, il **dit**, et il **remonte l'arbitrage au propriétaire du produit**.
 */
function blocSignauxDescente(signaux, fenetre) {
  if (!signaux?.length) return "";
  const jamais = signaux.filter((s) => !s.couvert_par_la_regle);
  const lignes = [
    `### ⛰️🔴 Après une grosse DESCENTE, notre fenêtre ne suffit pas — et le moteur ne va pas faire semblant`,
    `**La fenêtre ci-dessus (${fenetre.libelle}) est CALIBRÉE SUR LA MUSCULATION.** ${FENETRE_DESCENTE.ce_que_disent_les_donnees}`,
    `🔴 ${FENETRE_DESCENTE.le_probleme}`,
    tableau(
      ["Descente", "Ce qui suit", "Écart", "Couvert par la règle ?"],
      signaux
        .slice(0, 8)
        .map((s) => [
          `${s.quand_descente} — **${s.descente_m ?? "?"} m** ${s.d_moins_mesure ? "D−" : "D+ _(D− non mesuré)_"}`,
          `${s.quand_cible} — ${s.cible}`,
          `**≈ ${s.ecart_h} h**`,
          s.couvert_par_la_regle ? "signalé (fenêtre muscu)" : "🔴 **NON — aucun garde-fou**",
        ])
    ),
    jamais.length
      ? `🔴 **${jamais.length} de ces cas ne sont couverts par AUCUNE règle du moteur** : la contrainte de placement protège la ` +
        `**course** contre les **jambes lourdes** — jamais l'inverse. **Elle t'autorise donc du squat lourd 48 h après une grosse ` +
        `descente**, alors que ta vitesse de montée en force est **encore altérée à 72 h**.`
      : "",
    `⚠️ **${FENETRE_DESCENTE.ce_que_le_moteur_ne_fait_pas}** ${FENETRE_DESCENTE.ce_que_le_moteur_fait}`,
    `**Arbitrage en attente** : ${FENETRE_DESCENTE.arbitrage}\n\n_${FENETRE_DESCENTE.source}_`,
  ];
  return lignes.filter(Boolean).join("\n\n");
}

/**
 * PLACEMENT (programme muscu) — le cas où la contrainte MORD : beaucoup de salle, une course.
 * C'est le différenciateur : Strava ne sait pas que tu as fait des jambes hier, Hevy ne sait pas
 * que tu cours demain.
 */
function blocPlacementMuscu(p) {
  const pl = p.placement;
  if (!pl) return "";
  const f = pl.fenetre;
  const parts = [`\n## 🦵🏃 Placement jambes ↔ course (${f.libelle})\n`];
  parts.push(`${pl.pourquoi}\n`);

  if (pl.resolu) {
    parts.push(
      `### ✅ Le moteur a RÉORGANISÉ ta semaine\n\n` +
        `La disposition « naturelle » (salle du lundi au samedi, course le dimanche) créait ` +
        `**${pl.conflits_evites.length} conflit(s)** :\n\n` +
        pl.conflits_evites.map((c) => `- ${c.pourquoi}`).join("\n") +
        `\n\nLa semaine ci-dessus est **réordonnée pour les supprimer** — même volume, mêmes séances, ` +
        `**même effort**. Seul l'ordre change. C'est gratuit.\n`
    );
  } else if (pl.analyse.conflits.length) {
    parts.push(
      `### ⚠️ Conflit que le moteur ne sait PAS supprimer\n\n` +
        pl.analyse.conflits.map((c) => `- ${c.pourquoi}`).join("\n") +
        `\n\nIl n'y a mécaniquement pas assez de jours. Le moteur **ne bricole pas un compromis muet** : il te le dit. ` +
        `Retirer un jour de salle, ou faire de cette course un footing facile, lève la contrainte.\n`
    );
  } else if (pl.analyse.limites.length) {
    parts.push(
      `### ℹ️ Placement à la borne haute\n\n` +
        pl.analyse.limites.map((c) => `- ${c.pourquoi}`).join("\n") +
        `\n`
    );
  } else {
    parts.push(`### ✅ Aucun conflit\n\nTes jambes lourdes sont déjà tenues à distance de ta séance de course.\n`);
  }

  if (pl.hypothese) parts.push(`${pl.hypothese}\n`);
  parts.push(
    `_Ce que **personne d'autre** ne fait : Strava ignore ta muscu, Hevy ignore ta course. ` +
      `Cette règle-là est **démontrée** et ne coûte rien à appliquer — c'est le premier bénéfice concret de l'hybride._\n`
  );
  return parts.join("\n");
}

/**
 * Cadence : garde-fou blessure low-cost (veille/03 §5 bis). Nudge +5–10 % si cadence
 * basse ; sinon confirmation ou, faute de donnée, invitation à la mesurer.
 */
function blocCadence(plan) {
  const c = plan.cadence;
  if (!c) return "";
  const source = CADENCE_SOURCE;
  const exigee = c.exigee_par_limitation ?? null;
  // 🔴 Le titre ne dit PLUS « le seul levier SOURCÉ » : sa base clinique s'est effondrée
  // (veille/20 §8). Il reste le **meilleur levier** — gratuit, sans risque, mécaniquement fondé.
  const entete = exigee
    ? `## 🎯 Cadence — **le meilleur levier dont le moteur dispose pour ${exigee.zones.join(", ")}** (base **biomécanique**)`
    : "## Cadence — garde-fou blessure gratuit (base **biomécanique**)";
  const rappel = exigee
    ? `\n\n🩹 **Ce n'est plus un bonus pour toi** : tu as déclaré une limitation sur **${exigee.zones.join(", ")}**, et la cadence est le levier de ce moteur qui a le meilleur rapport bénéfice/coût — **gratuit, sans risque, réversible, et mécaniquement fondé**.${
        exigee.hors_cible_source
          ? " ⚠️ **Honnêteté** : les sources nomment le **fémoro-patellaire (genou)**, le **tibia** et le **tendon d'Achille** — pas toutes tes zones. Le levier t'est donné ; l'effet sur une zone non citée ne t'est **pas promis**."
          : ""
      }`
    : "";
  // ⛰️ Règle 7 de la veille : le nudge vaut EN DESCENTE, et il y est PLUS pertinent.
  const enDescente = plan.denivele?.planifie ? `\n\n${CADENCE_EN_DESCENTE}` : "";
  // 🔴 L'aveu, dans le document que l'utilisateur lit — pas seulement dans le code.
  const purge = `\n\n<details><summary>🔴 <strong>Deux chiffres ont été retirés de ce bloc le 2026-07-11 — et tu as le droit de savoir pourquoi</strong></summary>\n\n${CADENCE_RETIRE.map((x) => `- ${x}`).join("\n")}\n\n</details>`;

  if (c.statut === "inconnue") {
    return `${entete}
${
  exigee
    ? "⚠️ **Cadence NON RENSEIGNÉE — et c'est le levier qui te manque le plus.** Mesure-la (montre, ou compte tes pas sur 30 s × 2), puis renseigne `running.cadence_spm`. **Le moteur n'inventera pas ta cadence** — mais sans elle, il ne peut pas chiffrer ton nudge."
    : "**Cadence non renseignée.** Mesure-la sur quelques sorties (pas/min à allure facile)."
} Si elle est **basse** (foulée ample), une **hausse modérée de +5 à 10 %** raccourcit la foulée, abaisse le pic de flexion du genou et donc la contrainte **fémoro-patellaire** (**−14 %** de force de pointe pour **+10 %** de fréquence de pas, Lenhart 2014) — **sans pénaliser le coût métabolique**.${rappel}${enDescente}

_Source : ${source}._${purge}`;
  }
  if (c.statut === "adequate") {
    return `${entete}
Cadence **${c.cadence_actuelle} pas/min** : au-dessus du seuil de déclenchement du moteur (${c.seuil_convention} pas/min) — **rien à changer**.

⚠️ **Et le moteur ne va pas pousser plus haut pour autant.** La science étaye une hausse **RELATIVE** (+5 à 10 % d'une cadence **basse**), **pas** une course à la cadence maximale — un écart trop grand autour de la cadence spontanée **dégrade** la mécanique (Lu 2025). **Inventer une cible plus haute serait fabriquer un chiffre.**

_${SEUIL_NUDGE_CONVENTION}_${rappel}${enDescente}

_Source : ${source}._${purge}`;
  }
  return `${entete}
Cadence actuelle **${c.cadence_actuelle} pas/min** → **nudge vers ${c.cible_min}–${c.cible_max} pas/min** (+5 à 10 %, **progressif, jamais brutal**).

**Pourquoi** : une hausse modérée de cadence **raccourcit la foulée** → **abaisse le pic de flexion du genou** → **abaisse la contrainte fémoro-patellaire**. Chiffré : **+10 % de fréquence de pas → −14 % de force de pointe fémoro-patellaire** (Lenhart et al., *MSSE* 2014). Van Hooren 2024 confirme la direction sur les **trois** sites (fémoro-patellaire, tibia, tendon d'Achille). **Sans pénaliser le coût métabolique.**

⚠️ **On MONTE la cadence. On ne la baisse JAMAIS** — un écart de **−10 %** autour de la cadence spontanée **AGGRAVE** la contrainte (Lu 2025).

_${SEUIL_NUDGE_CONVENTION}_${rappel}${enDescente}

_Source : ${source}._${purge}`;
}

/**
 * ⛰️ LE DÉNIVELÉ — le bloc qui transforme un nombre observé en variable planifiée.
 *
 * Il dit quatre choses, et il les distingue :
 *   1. le **D+**, et surtout le **D−** : c'est la DESCENTE la contrainte (excentrique) ;
 *   2. la **règle d'alternance** — jamais le volume ET le dénivelé la même semaine ;
 *   3. la **convention assumée** (le pas de progression est celui du volume, TRANSFÉRÉ) ;
 *   4. 🔴 ce que la veille **ne dit pas** — à commencer par le trail lui-même.
 *
 * Et quand il n'y a **pas** de dénivelé planifié, il explique **laquelle des raisons** c'est. Un
 * plan route qui ne dit rien du dénivelé n'est pas un oubli ; un plan trail qui n'en dit rien, si.
 */
function blocDenivele(plan) {
  const dn = plan.denivele;
  if (!dn) return "";

  // Plan route : rien à dire, et ce n'est pas un manque. On ne pollue pas la page de la personne B.
  if (!dn.planifie && dn.non_planifie?.code === "terrain_route") return "";

  const parts = ["\n## ⛰️ Dénivelé — la DESCENTE est la contrainte\n"];
  parts.push(
    "_**La descente est métaboliquement BON MARCHÉ — et c'est elle qui casse.** À **−20 % de pente**, courir coûte " +
      "**1,73 J·kg⁻¹·m⁻¹** contre **3,40 à plat** : **la moitié** (Minetti 2002). Elle te dit « facile » **là où ton " +
      "muscle encaisse le plus**. Elle est **EXCENTRIQUE**, elle produit des **dommages musculaires**, et elle charge " +
      "le **compartiment fémoro-patellaire** — la montée, elle, fait exactement l'inverse (elle charge le tibia et " +
      "l'Achille, et coûte du souffle). **Un plan de 40 km à plat et un plan de 40 km avec 1 500 m de D− ne sont pas " +
      "le même entraînement.**_\n"
  );

  // 🔴 RÈGLE 2 DE LA VEILLE — LA LIMITE STRUCTURELLE. « À AFFICHER, PAS À RUSTINER EN DOUCE. »
  parts.push(
    `### 🔴 Ce que ta charge d'entraînement ne voit PAS\n\n${AVEUGLEMENT_DESCENTE.pourquoi}\n\n` +
      `${AVEUGLEMENT_DESCENTE.ce_que_le_moteur_ne_fait_pas}\n\n${AVEUGLEMENT_DESCENTE.consequence}\n`
  );

  if (!dn.planifie) {
    parts.push(`${dn.non_planifie.message}\n`);
  } else {
    parts.push(
      `**Terrain déclaré** : ${dn.terrain_libelle} · **Départ (mesuré)** : ${dn.depart_m_sem} m D+/sem · ` +
        `**Pic planifié** : ${dn.pic_m_sem} m D+/sem.\n`
    );
    parts.push(`### La règle, et elle est encodée dans la génération\n\n${dn.regle_alternance}\n`);
    parts.push(
      "Regarde la colonne **« Monte »** du calendrier : chaque semaine, **une seule** variable a le droit d'augmenter. " +
        "Ce n'est plus une consigne en bas de page qu'on oublie — c'est le **calendrier lui-même** qui l'applique.\n"
    );
    parts.push(`### Le D− (dénivelé négatif) — pourquoi il est écrit partout\n\n${dn.convention.d_moins}\n`);
    parts.push(`### ⚠️ La convention du moteur, déclarée\n\n${dn.convention.extrapolation}\n\n${dn.convention.repartition}\n`);
    parts.push(`_Pas de progression : ×${dn.convention.pas} — source du pas (**pour le volume**) : ${dn.convention.source_du_pas}._\n`);
  }

  // Le D− de la COURSE : `null` veut dire « je ne sais pas », et jamais `0`.
  const c = dn.course;
  if (c.denivele_m != null || c.denivele_negatif_m != null) {
    parts.push(
      `### Ta course\n\n**D+ annoncé** : ${c.denivele_m != null ? `${c.denivele_m} m` : "_non renseigné_"} · ` +
        `**D− annoncé** : ${c.denivele_negatif_m != null ? `**${c.denivele_negatif_m} m**` : "_**INCONNU**_"}.\n`
    );
    if (c.pourquoi_pas_deduit) parts.push(`${c.pourquoi_pas_deduit}\n`);
  }

  // ⏱️ RÈGLE 4 — la récupération après descente se compte en JOURS. Et la fenêtre de l'ADR 0006
  // vient de la MUSCU. Le moteur le dit, il ne fabrique pas la bonne fenêtre.
  parts.push(
    `### ⏱️ Après une grosse descente, compte en JOURS — pas en heures\n\n${RECUP_DESCENTE.quoi}\n\n` +
      `🔴 **Et voici le problème, en toutes lettres :** ${FENETRE_DESCENTE.le_probleme}\n\n` +
      `${FENETRE_DESCENTE.ce_que_le_moteur_ne_fait_pas} ${FENETRE_DESCENTE.ce_que_le_moteur_fait}\n\n` +
      `**Arbitrage en attente** : ${FENETRE_DESCENTE.arbitrage}\n\n_${RECUP_DESCENTE.source}_\n`
  );

  // 🔁 RÈGLE 5 — l'effet répété. Réel, rapide, borné. Et il protège le MUSCLE.
  parts.push(
    `### 🔁 L'effet répété — la stratégie la mieux étayée du domaine\n\n${EFFET_REPETE.quoi}\n\n` +
      `${EFFET_REPETE.limite}\n\n${EFFET_REPETE.a_ne_pas_relayer}\n`
  );

  // 🔴 RÈGLE 6 — la spécificité protège, pas le renforcement.
  parts.push(
    `### 🔴 Le renforcement ne te protégera PAS de la descente\n\n${SPECIFICITE_PROTEGE.quoi}\n\n` +
      `${SPECIFICITE_PROTEGE.limite}\n\n_${SPECIFICITE_PROTEGE.source}_\n`
  );

  // 🔴 RÈGLE 3 — jamais de conversion D+ → km. La veille donne enfin la RAISON.
  parts.push(
    `### 🔴 Pourquoi il n'y a **aucune** conversion « 100 m de D+ ≈ 1 km » dans ce moteur\n\n` +
      `${CONVERSION_DPLUS_KM.pourquoi_interdite}\n\n` +
      tableau(
        ["Équivalence", "Année", "Ratio", "Ce que c'est"],
        CONVERSION_DPLUS_KM.conventions.map((c) => [c.nom, c.annee ?? "—", c.ratio, c.nature])
      ) +
      `\n${CONVERSION_DPLUS_KM.si_un_jour_affichee}\n`
  );

  parts.push(
    "### 🔴 Ce que le moteur **ne sait pas** sur le dénivelé (et ne prétendra pas savoir)\n\n" +
      dn.non_source.map((n) => `- ${n}`).join("\n") +
      "\n\n_📚 **Le trou de VEILLE sur le trail est COMBLÉ** : le moteur l'avait signalé et **demandé** ; la veille a " +
      "répondu (`docs/veille/20-trail-denivele.md`, 2026-07-11). Les trous ci-dessus, eux, **restent** — et le premier " +
      "est désormais **certifié comme définitif** : la vitesse de progression du D+ **n'existe nulle part**, et la veille " +
      "dit explicitement qu'elle **ne peut pas faire mieux**. **Un trou certifié est plus honnête qu'un trou soupçonné.**_\n"
  );

  parts.push(
    "### 🚫 Ce que ce moteur ne t'écrira JAMAIS\n\n" + INTERDITS_DENIVELE.map((i) => `- ${i}`).join("\n") + "\n"
  );

  return parts.join("\n") + "\n";
}

export function rendrePlanRunning(persona, plan) {
  const d = plan.distance;
  const alluresMd = tableau(
    ["Zone", "Nom", "% VDOT", "Allure"],
    plan.allures.map((z) => [
      `**${z.code}**`,
      z.nom,
      `${Math.round(z.basse * 100)}–${Math.round(z.haute * 100)} %`,
      z.affichage,
    ])
  );

  // ⛰️ Quand le dénivelé est PLANIFIÉ, le calendrier gagne deux colonnes : le **D+ / D−** de la
  // semaine, et **« Monte »** — la variable, une seule, qui a le droit d'augmenter. C'est la règle
  // « jamais le volume ET le dénivelé la même semaine », rendue LISIBLE ligne par ligne.
  const dPlan = plan.denivele?.planifie;
  const semainesMd = tableau(
    dPlan
      ? ["Sem", "Lundi", "Phase", "Volume", "Longue sortie", "D+ / D−", "Monte", "% facile"]
      : ["Sem", "Lundi", "Phase", "Volume", "Longue sortie", "% facile"],
    plan.semaines.map((s) => {
      const kmM = s.seances.find((x) => x.jour === "Dimanche")?.km_M ?? 0;
      const test = s.seances.some((x) => x.test);
      const base = [
        test ? `${s.num} 🧪` : String(s.num),
        s.lundi,
        s.type === "recuperation" ? `${NOMS_PHASE[s.phase]} (récup)` : s.type === "course" ? "**COURSE**" : NOMS_PHASE[s.phase],
        s.type === "course" ? `${s.volume_km} km + course` : `${s.volume_km} km`,
        s.type === "course" ? `**${d.label} !**` : kmM > 0 ? `${s.longue_km} km (fin ${kmM} km en M)` : `${s.longue_km} km`,
      ];
      const suite = dPlan
        ? [
            s.denivele_m ? `${s.denivele_m} m / **${s.denivele_negatif_m} m**` : "—",
            s.monte === "denivele" ? "⛰️ **dénivelé**" : s.monte === "volume" ? "📈 volume" : "—",
          ]
        : [];
      return [...base, ...suite, `${Math.round(s.part_facile * 100)} %`];
    })
  );

  const semaineType =
    plan.semaines.find((s) => s.phase === "specifique" && s.type === "charge" && s.seances.some((x) => x.km_M > 0)) ??
    plan.semaines.find((s) => s.phase === "specifique" && s.type === "charge") ??
    plan.semaines[0];
  const semaineTypeMd = tableau(
    ["Jour", "Séance"],
    semaineType.seances.map((s) => [s.jour, s.contenu])
  );
  const semaineDuTest = plan.semaines.find((s) => s.seances.some((x) => x.test));

  // ⚠️ La référence des allures vient désormais de la RÉCONCILIATION (`performances[]`), pas du
  // champ `temps_reference` — sans quoi un persona qui déclare proprement son historique se verrait
  // répondre « aucun temps de référence fourni » alors qu'il en a trois. Repli sur l'ancien champ
  // pour les plans générés hors normalisation.
  const rec = plan.reconciliation;
  const retenue = rec?.retenue;
  const refAllures = retenue
    ? `Estimées depuis **${retenue.distance_m / 1000} km en ${retenue.temps}** (${retenue.date})` +
      (rec.performances.length > 1 ? ` — **la perf retenue parmi ${rec.performances.length}** : voir « Tes performances » ci-dessus.` : ".") +
      (rec.source_vdot === "borne_inferieure"
        ? `\n🔴 ⚠️ **Cette perf n'était PAS un effort maximal** : ces allures sont donc calées sur une **BORNE INFÉRIEURE**, ` +
          `c'est-à-dire **trop lentement**. Le **test chrono 🧪** est ce qui les rendra justes.`
        : "")
    : plan.temps_reference
      ? `Estimées depuis ${plan.temps_reference.distance_m / 1000} km en ${plan.temps_reference.temps}${plan.temps_reference.note ? ` (${plan.temps_reference.note})` : ""}.`
      : `**Aucun temps de référence fourni** : VDOT supposé d'après le niveau (voir hypothèses).`;

  // 🔴 FAUSSE CONFIANCE (corrigée le 2026-07-11 — batterie adverse). Le plan affichait une **coche
  // verte** — « Cible chrono 1:35:00 : cohérente avec le niveau actuel ✅ » — sur un plan dont le
  // VOLUME était **GELÉ** pour cause de genou ACTIF, et qui écrivait dix lignes plus haut : « ton
  // objectif chrono passe au second plan ». Le même document validait et invalidait la même cible.
  // Une coche verte n'est pas un détail de rendu : c'est un feu vert. On ne le donne pas quand le
  // moteur vient de brider la préparation.
  const chronoVerdict = (pl) => {
    if (!pl.chrono.realiste) return "au-dessus du niveau actuel — voir l'alerte en tête de plan ⚠️.";
    const gele = pl.limitations_course?.contraintes?.volume?.gel === true;
    if (!gele) return "cohérente avec le niveau actuel ✅.";
    return (
      "cohérente avec ton niveau **actuel** — ⚠️ **mais le moteur ne te la valide PAS** : ton **volume est GELÉ** " +
      "(limitation ACTIVE), donc cette prépa **ne te fera pas progresser** vers elle comme une prépa normale le ferait. " +
      "L'équivalence ci-dessus décrit **où tu en es**, pas **où tu seras**. **Le chrono passe au second plan tant que la " +
      "zone n'est pas examinée** — c'est écrit en tête de plan, et ce n'est pas une formule de politesse."
    );
  };

  const objectifJourJ = plan.plan_ecourte && d.km >= 21
    ? `**Objectif jour J** : l'équivalence VDOT donne ≈ ${formatDuree(plan.prediction_min)} (${formatAllure(plan.prediction_min / d.km)}),
**mais elle suppose une prépa complète** — ce qui n'est pas le cas ici (${plan.nb_semaines} sem). Consigne : **départ à ${formatAllure(plan.allure_prudente_min_par_km)}**
(allure M + ~25 s/km) soit une arrivée ≈ **${formatDuree(plan.temps_prudent_min)}** ; accélérer sur la fin seulement si tout va bien.
L'objectif prioritaire reste **${plan.but}**.`
    : `**Objectif jour J** : équivalence VDOT ≈ **${formatDuree(plan.prediction_min)}** (${formatAllure(plan.prediction_min / d.km)}) — à recaler après le test 🧪${plan.but === "finir" ? " ; l'objectif prioritaire reste **finir**" : ""}.${plan.chrono ? `\n**Cible chrono ${plan.chrono.temps_cible}** (${formatAllure(plan.chrono.allure_cible)}) : ${chronoVerdict(plan)}` : ""}`;

  return `# Plan ${d.label} — ${persona.nom}

_Généré le ${plan.genere_le} par le moteur Phase 1. Règles : docs/veille/03 (80/20, VDOT, charge),
docs/veille/12 (prépa course), docs/veille/11 (hybride)._

**Course** : ${plan.course.nom ?? d.label}, le **${plan.course.date}**${plan.course.profil_parcours ? ` — parcours ${plan.course.profil_parcours}` : ""}${plan.course.barriere_horaire ? `, barrière horaire ${plan.course.barriere_horaire}` : ""}.
**Plan** : **${plan.nb_semaines} semaines** à partir du ${plan.debut} · pic de volume **${plan.volume_pic_km} km/sem**.

${plan.alertes.map((a) => `${a}\n`).join("\n")}
${blocReconciliation(plan)}## Allures d'entraînement (VDOT ${plan.vdot})
${refAllures}
${semaineDuTest ? `Un **test chrono est planifié en semaine ${semaineDuTest.num}** (🧪) pour recaler le VDOT et toutes les allures.` : ""}

${alluresMd}

${objectifJourJ}

**Pourquoi le VDOT** : allures individualisées depuis une perf réelle plutôt que des zones génériques ;
à recalculer quand la forme progresse (veille/03 §2 & §6).

${blocAllureMarathon(plan)}

## Calendrier
${semainesMd}

**Pourquoi cette structure** : progression du volume ≤ ~10 %/sem avec semaine de récupération
toutes les 4 semaines (garde-fou blessure — veille/12 §7) ; la colonne « % facile » contrôle la
distribution d'intensité : **≈ 80 % facile** (80/20, veille/03 §1) — volontairement plus conservateur
en début de plan (risque de blessure), légèrement sous 80 % les semaines à test 🧪 ou à qualité
longue, ce qui reste dans l'esprit Daniels (M+T ≤ 15 %) ; **affûtage** sur ${d.taper.length === 1 ? "la dernière semaine" : `les ${d.taper.length} dernières semaines`} :
le volume chute, la fitness reste (veille/03 §3).

## Semaine type (${NOMS_PHASE[semaineType.phase].toLowerCase()} — sem ${semaineType.num})
${semaineTypeMd}

${plan.hybride ? `**Placement salle** (veille/11) : haut du corps le lundi (zéro interférence), renfo jambes à
distance de la qualité et de la longue sortie ; en affûtage, **réduire** les jambes lourdes mais
**garder un entretien léger** (économie de course, prévention — veille/11 §3, veille/12 §6).
La course est prioritaire : si conflit, c'est la salle qu'on allège.

` : ""}${blocPlacementPlan(plan)}${blocDenivele(plan)}## Charge & affûtage (veille/03 §3)
- **Charge moyenne 42 j** de départ (**estimée**) : ${plan.charge.charge_42j_depart} CE · **Écart 42 j − 7 j** projeté le jour J : ${plan.charge.ecart_jour_course >= 0 ? "+" : ""}${plan.charge.ecart_jour_course}.
- ⚖️ **Ce sont NOS noms.** L'unité est la **charge d'endurance (CE)** = durée × intensité relative² ;
  les deux jauges sont les **moyennes exponentielles** de cette charge sur ~42 j et ~7 j, et la
  troisième est leur **soustraction**. (« TSS », « CTL », « ATL », « TSB » sont des **marques
  déposées de Peaksware/TrainingPeaks** : on les **cite**, on ne s'en sert pas comme noms — veille/19 §3.5.)
- 🟡 **Ce n'est PAS une cible — et il n'y en a plus.** Le moteur affichait ici une fourchette
  « à viser » : c'était une **convention d'outil**, pas un résultat scientifique. Pire, la
  composante « fatigue » du modèle qui produit ce nombre **n'améliore pas la prédiction de la
  performance** (ΔRMSE 0,001 ; **p = 0,57** — Marchal et al. 2025, *Scientific Reports* 15:3706) :
  c'est du surapprentissage, pas de l'information. L'écart survit ici comme **courbe descriptive** —
  pour voir les rampes — et **rien d'autre**. On ne pilote pas un affûtage sur un chiffre rond, et
  **on ne lui donne pas un joli nom** (« forme », « fraîcheur ») qui le ferait passer pour tel.
- ⚠️ Cette courbe est **cardiovasculaire** : la **musculation n'y est pas convertie**. Le faire
  exigerait une constante de conversion inventée. Ta charge de salle est comptée ailleurs, dans la
  **charge sRPE** (bilan), dans la même unité que la course — mais **séparément** (ADR 0006).
- L'écart projeté reste une simulation sur séances **planifiées** ET sur une moyenne 42 j de départ
  estimée : à croiser avec le ressenti — pas de pilotage par une seule métrique (veille/03 §5).

${d.km >= 21 ? `## Nutrition course (veille/12 §5)
- **Glucides pendant l'effort** : commencer à **30–60 g/h** (fenêtre d'absorption du glucose ; ≈ 5–8 gels
  sur un marathon), montable vers **75–90 g/h** (mélange **glucose+fructose**, voies de transport distinctes)
  **seulement si** c'est rodé en longue sortie. **Pourquoi** : au-delà de ~60 g/h, seul le co-transport
  glucose+fructose évite la saturation intestinale et les troubles digestifs (veille/12 §5).
- **Hydratation : boire à la SOIF**, pas un volume horaire imposé. Chez l'amateur, le vrai risque n'est pas
  la déshydratation mais l'**hyponatrémie d'effort (EAH)** par **sur-hydratation** (sodium sanguin dilué) :
  les consensus (IMMDA) retiennent la **soif** comme guide, avec des **pesées sporadiques** — **prendre**
  du poids pendant l'effort = signe qu'on boit trop. **Pourquoi** : boire au-delà de la soif ne prévient ni
  crampes ni coup de chaleur et expose à l'EAH, potentiellement grave (PMC9699060, veille/12 §5).
- **Sodium** : viser **~500–700 mg de sodium par litre** de boisson sur les efforts longs (ordre de grandeur
  d'une sueur typique) ; **majorer** par forte chaleur et pour les profils **gros sueurs / sueur salée**.
- **Règle d'or : tout tester en longue sortie** (marque, quantité, sodium, tolérance digestive) — rien de nouveau le jour J.
- Charge glucidique les 2–3 jours précédents.
- **Vérifier les modalités officielles de ravitaillement** (emplacements, contenants — prévoir
  flasque/ceinture le cas échéant) et les répéter telles quelles à l'entraînement.

` : ""}${blocCadence(plan)}
${blocLimitationsCourse(plan)}
${SECURITE_RUNNING}

${blocAnglesMorts(persona)}${listeHypotheses(persona)}
${DISCLAIMER}
`;
}

// Rétro-compatibilité.
export const rendrePlanMarathon = rendrePlanRunning;

// ---------------------------------------------------------------- bilan (boucle adaptative)

// Lecture des tendances par exercice → recommandation de VOLUME/priorité par muscle
// (stagnation = plus de volume, le levier n°1, veille/02 §1 ; progression = maintenir).
// @chiffre-de-la-veille — vérifié dans veille/02 §1 & §7.
const LECTURE_TENDANCE = {
  progression: "📈 progresse → maintenir (ne pas ajouter de volume inutile)",
  stagnation: "➡️ stagne → +volume (le levier n°1, veille/02 §1)",
  regression: "📉 en baisse → consolider / deload avant d'ajouter du volume (veille/02 §7)",
};

function rendreTendancesMuscu(tendances) {
  if (!tendances?.suffisant) return "";
  const table = tableau(
    ["Exercice", "1RM est. (kg)", "Variation", "Lecture"],
    tendances.exercices.map((e) => [
      e.nom,
      `${e.e1rm_debut} → ${e.e1rm_fin}`,
      `${e.variation_pct >= 0 ? "+" : ""}${e.variation_pct} %`,
      LECTURE_TENDANCE[e.statut],
    ])
  );
  const stagnants = tendances.muscles.filter((m) => m.statut === "stagnation" && !MUSCLES_ACCESSOIRES.includes(m.muscle)).map((m) => m.muscle);
  const synthese = tendances.regressions >= 2
    ? `\n\n_⚠️ Baisse sur plusieurs exercices : signal de fatigue globale → **deload** avant d'ajouter du volume ; on ne remonte pas les priorités tant que la perf ne repart pas (veille/02 §5 & §7)._`
    : stagnants.length
      ? `\n\n_Muscle(s) en stagnation : **${stagnants.join(", ")}** → \`recaler\` les ajoute aux **priorités** (+1 série au prochain \`gen\`), le volume étant le levier n°1 (veille/02 §1)._`
      : `\n\n_Aucun muscle en stagnation nette : rien à re-prioriser, on laisse la double progression opérer (veille/02 §4)._`;
  return `

### Tendances par exercice (1RM estimé, veille/02 §1 & §4)
_Métrique : 1RM estimé (Epley) du meilleur set, comparé entre la 1re et la 2e moitié de l'historique (≥ 3 séances)._

${table}${synthese}`;
}

/**
 * PLACEMENT OBSERVÉ — la règle a-t-elle été tenue dans la vraie vie ? Le moteur ne se contente
 * pas de bien planifier : il regarde ce qui s'est passé, et le dit (ADR 0006, Couche 2).
 */
function blocPlacementObserve(p) {
  if (!p) return "";
  const entete = `## 🦵🏃 Placement jambes ↔ course (${p.fenetre.libelle}) — ce qui s'est vraiment passé`;
  const descente = blocSignauxDescente(p.signaux_descente, p.fenetre);
  if (!p.conflits.length && !p.limites.length) {
    return [`${entete}\n✅ ${p.pourquoi}`, descente].filter(Boolean).join("\n\n");
  }
  const lignes = [entete, p.pourquoi];
  if (p.conflits.length) {
    lignes.push(
      tableau(
        ["Jambes lourdes", "Séance-clé", "Écart", "Ce que ça a coûté"],
        p.conflits.map((c) => [
          `${c.date_jambes} — ${c.jambes.quoi}${c.jambes.origine === "denivele" ? " _(D+ : composante excentrique)_" : ""}`,
          `${c.date_course} — ${c.course.quoi}`,
          c.ecart_jours === 0 ? "**même jour**" : `**≈ ${c.ecart_jours * 24} h**`,
          "Force explosive encore dégradée → séance de course en dessous de son potentiel",
        ])
      )
    );
  }
  if (p.limites.length) {
    lignes.push(
      `_${p.limites.length} autre(s) placement(s) à ≈ 48 h — la **borne haute** de la fenêtre. Acceptable si la séance de jambes ` +
        `n'était pas près de l'échec ; à surveiller sinon. Le moteur ne durcit pas au-delà de ce que la source dit._`
    );
  }
  lignes.push(
    `**Le correctif est gratuit** : même volume, mêmes séances, **même effort** — seul l'**ordre** change. ` +
      `Le programme muscu régénéré (\`gen\`) place désormais les jambes lourdes hors de cette fenêtre.`
  );
  lignes.push(descente);
  return lignes.filter(Boolean).join("\n\n");
}

/**
 * OBSERVANCE DE L'ÉCHAUFFEMENT — « non skippable » ne veut rien dire si personne ne regarde.
 * veille/18 §9.1 règle 1 : la skippabilité doit être JOURNALISÉE ; l'effet de l'échauffement est
 * modulé par l'observance. Le moteur compte, constate, et ne moralise pas.
 */
function blocObservanceEchauffement(e) {
  if (!e) return "";
  const lignes = [`## 🔥 Échauffement — ce qui a vraiment été fait`];
  lignes.push(e.pourquoi);
  if (e.renseignees) {
    lignes.push(
      tableau(
        ["Fait", "Partiel", "Sauté", "Non renseigné", "Observance"],
        [[String(e.fait), String(e.partiel), String(e.saute), String(e.non_renseigne), e.taux_pct != null ? `**${e.taux_pct} %**` : "—"]]
      )
    );
  }
  if (e.alerte) lignes.push(`⚠️ ${e.alerte}`);
  lignes.push(`_(${e.source})_`);
  return lignes.join("\n\n");
}

/** Badge d'honnêteté (ADR 0006 §6) — chaque chiffre affiché dit d'où il vient. */
const BADGE = {
  demontre: "🟢 **Démontré**",
  convention: "🟡 **Convention**",
  calibre: "🔵 **Calibré sur toi**",
  hypothese: "🔴 **Hypothèse**",
  estime: "⚪ **Estimé**",
};

/**
 * CHARGE sRPE — la charge unifiée force ↔ endurance (ADR 0006, Couche 1).
 * « On additionne la CHARGE. On n'additionne pas la FATIGUE. »
 * Toute valeur estimée est DÉCLARÉE comme telle. Pas d'accent, pas de fausse précision.
 */
function blocChargeSRPE(c) {
  if (!c || !c.semaines.length) return "";
  const cal = c.calibration;

  const semainesMd = tableau(
    ["Semaine du", "Force (AU)", "Endurance (AU)", "**Total (AU)**", "Part estimée"],
    c.semaines.map((s) => [
      s.lundi,
      String(s.force_au),
      String(s.endurance_au),
      `**${s.total_au}**`,
      s.part_estimee_pct > 0 ? `⚪ ${s.part_estimee_pct} %` : "— (mesurée)",
    ])
  );

  const detailMd = tableau(
    ["Date", "Séance", "Filière", "RPE", "Durée", "Charge (AU)"],
    c.detail.map((d) => [
      d.date,
      d.seance ?? "—",
      d.filiere,
      d.rpe == null
        ? "❌ **indisponible**"
        : d.rpe_source === "saisi"
          ? `${d.rpe} _(saisi)_`
          : `⚪ ${d.rpe} _(**estimé** depuis les RIR)_`,
      d.duree_min == null ? "❌ manquante" : `${d.duree_min} min${d.duree_source === "persona" ? " ⚪ _(déclarée, pas mesurée)_" : ""}`,
      d.au == null ? "—" : `${d.au}${d.estimee ? " ⚪" : ""}`,
    ])
  );

  const manquantes = c.seances_sans_charge.length
    ? `\n⚠️ **${c.seances_sans_charge.length} séance(s) sans charge calculable** (ni RPE saisi, ni RIR pour l'imputer, ou durée absente). ` +
      `Elles ne comptent **pas** dans les totaux ci-dessus — le moteur préfère un trou déclaré à un chiffre inventé.\n`
    : "";

  return `## ⚖️ Charge unifiée force ↔ endurance (ADR 0006)

> **On additionne la CHARGE. On n'additionne pas la FATIGUE.**

**Unité** : ${c.unite}.
${c.pourquoi}

### Par semaine — filières séparées, somme auditable
${semainesMd}

Additionner ces deux colonnes est légitime : ce sont deux **doses** (« qu'est-ce que j'ai encaissé »),
et additionner des heures de stress perçu l'est autant qu'additionner des kilomètres (Impellizzeri et al.
2023, *Sports Medicine* 53:1667-1679 — exposition → dose → réponse).
**Ce qu'on n'additionne PAS** : les deux **fatigues**. Un squat lourd dégrade ta force explosive pendant
48 h, une sortie facile se récupère en heures — une moyenne mobile à 7 jours ne peut pas représenter les
deux. C'est pour ça qu'il n'y a **aucun « score de forme » unique** ici, et qu'il n'y en aura pas.
${manquantes}
### Séance par séance
${detailMd}

### D'où viennent ces chiffres (le bouton « pourquoi ? »)
- ${BADGE.demontre} — la contrainte de placement jambes ↔ course (bloc ci-dessus). C'est ce qui vaut vraiment de l'argent, et ça ne demande **aucune** calibration.
- ${BADGE.convention} — l'échelle de la **charge d'endurance** et de ses moyennes 42 j / 7 j (usage d'outil, non validé). **Aucune cible chiffrée n'en est tirée.**
- ${cal.calibre ? BADGE.calibre : BADGE.hypothese} — l'estimateur du RPE manquant. ${cal.pourquoi}
- ${BADGE.estime} — toute valeur **imputée** (RPE déduit des RIR, durée reprise du persona). Elle est marquée ⚪ **partout** où elle apparaît.
- ${c.hypothese_centrale}

_Ce que personne d'autre ne peut écrire : **« Personne ne sait additionner proprement la fatigue de la muscu
et celle de la course. Nous additionnons la charge, pas la fatigue — et voici pourquoi. »** Face à des boîtes
noires qui donnent un score sans dire d'où il sort, c'est un argument, pas un aveu._`;
}

export function rendreBilan(persona, bilan) {
  const blocs = [];

  if (bilan.muscu) {
    const m = bilan.muscu;
    blocs.push(`## Musculation — double progression (veille/02 §4)
${tableau(
      ["Exercice", "Décision", "Pourquoi"],
      m.decisions.map((d) => [d.exercice, `**${d.action}**`, d.pourquoi])
    )}${rendreTendancesMuscu(m.tendances)}

### Deload
${m.deload.declenche ? "🔻 **Deload recommandé cette semaine.**" : "✅ Pas de deload nécessaire."} ${m.deload.pourquoi}
_Signaux observés : ${m.deload.signaux.exercices_en_baisse} exercice(s) en baisse de perf, ${m.deload.signaux.seances_rpe_9_plus} séance(s) à RPE ≥ 9._`);
  }

  if (bilan.running) {
    const r = bilan.running;
    const lignes = [];
    if (r.vdot) {
      lignes.push(`### VDOT recalé : ${r.vdot.valeur}${r.vdot.delta != null ? ` (${r.vdot.delta >= 0 ? "+" : ""}${r.vdot.delta} vs référence initiale${r.vdot.reference_hypothetique ? " — qui était une HYPOTHÈSE : ce delta est un recalage, pas un progrès mesuré" : ""})` : ""}
Test du ${r.vdot.test.date} : ${r.vdot.test.distance_m / 1000} km en ${r.vdot.test.temps}. ${r.vdot.pourquoi}

${tableau(
        ["Zone", "Nouvelle allure"],
        r.vdot.allures.map((z) => [`**${z.code}** ${z.nom}`, z.affichage])
      )}`);
    }
    if (r.semaines.length) {
      lignes.push(`### Volume réalisé
${tableau(["Semaine du", "Km courus"], r.semaines.map((s) => [s.lundi, `${s.km} km`]))}`);
    }
    if (r.alertes.length) lignes.push(r.alertes.map((a) => `- ⚠️ ${a}`).join("\n"));
    if (r.rappel_ravito) lignes.push(`- 🥤 ${r.rappel_ravito}`);
    if (r.charge) {
      lignes.push(`### Charge d'endurance réelle (veille/03 §3)
Moyenne **42 j** : **${r.charge.charge_42j} CE** · Moyenne **7 j** : **${r.charge.charge_7j} CE** · **Écart 42 j − 7 j** : **${r.charge.ecart_42j_7j >= 0 ? "+" : ""}${r.charge.ecart_42j_7j}**
${r.charge.pourquoi}`);
    }
    if (r.replanification) {
      const rp = r.replanification;
      if (rp.statut === "ok") {
        const changementsMd = rp.changements.length
          ? tableau(["Paramètre", "Plan initial (hypothèse)", "Replanifié (réel)"], rp.changements.map((c) => [c.quoi, String(c.avant), `**${c.apres}**`]))
          : "_Aucun paramètre de départ ne bouge : les données réelles confirment les hypothèses initiales._";
        lignes.push(`### Replanification — plan recalculé sur le réel (veille/03 §6, veille/12 §8)
À partir du **${rp.date_reference}**, il reste **${rp.nb_semaines_restantes} semaine(s)** jusqu'à la course. Plan des semaines restantes régénéré depuis les données réelles${rp.recale_sur_test ? " (VDOT recalé sur le dernier test chrono)" : " (volume et charge moyenne 42 j réels ; VDOT inchangé faute de test récent)"} : pic de volume **${rp.volume_pic_km} km/sem**, écart 42 j − 7 j projeté le jour J **${rp.ecart_jour_course >= 0 ? "+" : ""}${rp.ecart_jour_course}**.

${changementsMd}
${rp.alertes_plan?.length ? "\n" + rp.alertes_plan.map((a) => `${a}`).join("\n") + "\n" : ""}
${rp.pourquoi}`);
      } else {
        lignes.push(`### Replanification
⏳ ${rp.pourquoi}`);
      }
    }
    blocs.push(`## Course\n${lignes.join("\n\n")}`);
  }

  const placementMd = blocPlacementObserve(bilan.placement);
  if (placementMd) blocs.push(placementMd);

  const echauffementMd = blocObservanceEchauffement(bilan.echauffement);
  if (echauffementMd) blocs.push(echauffementMd);

  const chargeMd = blocChargeSRPE(bilan.charge_srpe);
  if (chargeMd) blocs.push(chargeMd);

  if (bilan.nutrition) {
    const n = bilan.nutrition;
    blocs.push(
      n.statut === "insuffisant"
        ? `## Nutrition — boucle d'ajustement (veille/04 §4)\n⏳ **Pas d'ajustement.** ${n.pourquoi}`
        : `## Nutrition — boucle d'ajustement (veille/04 §4)
- Poids lissé : ${n.poids_lisse_debut} kg → ${n.poids_lisse_fin} kg (tendance **${n.tendance_kg_sem >= 0 ? "+" : ""}${n.tendance_kg_sem} kg/sem**, attendu ${n.fourchette_attendue.min} à ${n.fourchette_attendue.max}).
- **Décision : ${n.ajustement_kcal === 0 ? "aucun changement" : `${n.ajustement_kcal > 0 ? "+" : ""}${n.ajustement_kcal} kcal/j (ordre de grandeur)`}.**
- ${n.pourquoi}
${n.alerte ? `- 🚨 **${n.alerte}**\n` : ""}- ⏭️ ${n.suite}`
    );
  }

  return `# Bilan & ajustements — ${persona.nom}

_Boucle adaptative du moteur Phase 1-2 : décisions calculées sur les données RÉELLES du journal${bilan.periode ? ` (${bilan.periode.debut} → ${bilan.periode.fin})` : ""},
pas sur le plan théorique. Chaque décision reste une suggestion : le ressenti prime (veille/03 §5)._

${blocs.join("\n\n")}

${DISCLAIMER}
`;
}
