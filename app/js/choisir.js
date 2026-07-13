/**
 * choisir.js — LE SÉLECTEUR D'EXERCICE. La question que l'app ne posait pas.
 *
 * ══════════════════════════════════════════════════════════════════════
 *   > « Je n'ai pas l'impression que ce soit possible de **choisir n'importe quel exercice** que
 *   >   je voudrais faire — plutôt des exercices qui sont **imposés**. »
 * ══════════════════════════════════════════════════════════════════════
 *
 * Le référentiel existe (873 exercices), le moteur sait REFUSER et ADAPTER, le journal sait
 * recevoir une séance. **Rien de tout ça n'était atteignable au doigt.** Ce fichier n'ajoute
 * aucune règle : il rend le catalogue tapable, et il affiche le verdict du moteur.
 *
 * ── 🔴 CE QU'IL NE FAIT PAS, ET C'EST LE POINT ─────────────────────────
 * **Il ne décide rien.** Chaque ligne de la liste porte déjà un verdict rendu par
 * `src/lib/libre.js jugerExerciceLibre()` — c'est-à-dire par `appliquerLimitations()`, la MÊME
 * fonction qui garde le programme généré. L'app affiche ; elle ne juge pas.
 *
 * ── 🔴 ON NE CACHE PAS CE QU'ON REFUSE ─────────────────────────────────
 * Un exercice refusé **reste dans la liste**, marqué, et son « pourquoi » est à un tap. Le
 * masquer laisserait croire qu'il n'existe pas — et il le ferait quand même, sans le filet.
 * Idem pour ce que le matériel ou le niveau écartent : c'est en bas de la feuille, avec ce qui
 * le débloque. **Aucune vérité ne disparaît.**
 */

import { el, echapper, riche, ouvrirFeuille, fermerFeuille, blocPourquoi } from './ui.js';
import { chargerReferentielEx } from './moteur.js';
import { catalogueLibre, jugerExerciceLibre } from '../../src/lib/libre.js';

// Le contexte du moteur, posé une fois par l'écran de séance (il l'a déjà : il ne le recalcule pas).
let ctx = { persona: null, programme: null, journal: null };

/** L'écran de séance pousse ici ce que `genererProgramme()` lui a rendu. Aucun second calcul. */
export function contexteChoix({ persona, programme, journal }) {
  ctx = { persona, programme, journal };
}

export const choixDisponible = () => Boolean(ctx.persona?.muscu);

/**
 * Le sélecteur.
 *
 * @param {object}   o
 * @param {string}   o.titre     ce que le geste va faire (« Ajouter un exercice »…)
 * @param {function} o.apres     reçoit l'exercice FINAL (adapté s'il l'a été), prêt pour la séance
 * @param {string=}  o.exclure   nom d'un exercice déjà dans la séance (celui qu'on remplace)
 */
export async function ouvrirChoixExercice({ titre, apres, exclure = null }) {
  const referentiel = await chargerReferentielEx();
  const cat = catalogueLibre({ ...ctx, referentiel });

  const corps = el('div', 'chx');

  // ── LA RECHERCHE. 60+ exercices : le doigt ne défile pas soixante lignes pour trouver « dips ».
  const champ = el('input', 'chx-q');
  champ.type = 'search';
  champ.placeholder = 'Chercher un exercice';
  champ.setAttribute('aria-label', 'Chercher un exercice');
  corps.append(champ);

  const liste = el('div', 'chx-liste');
  corps.append(liste);

  // « developpe » doit trouver « Développé ». Même normalisation que `exercices.js normaliserNom`
  // — mais elle, elle sert de CLÉ ; celle-ci ne sert qu'à filtrer une liste à l'écran.
  const sansAccent = (s) =>
    String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const choisir = (e) => {
    const v = jugerExerciceLibre({ id: e.id, ...ctx, referentiel });

    // REFUS — et il ne se contourne pas. Le moteur dit non, et il dit pourquoi. Aucun bouton
    // « faire quand même » : ce serait rendre le garde-fou décoratif.
    if (v.verdict === 'refuse' || v.verdict === 'indisponible') {
      ouvrirFeuille({
        titre: e.nom,
        sous: v.verdict === 'refuse' ? '<b>Retiré</b> — pas avec ta limitation en cours' : '<b>Indisponible</b>',
        corps: blocPourquoi([{ label: 'Pourquoi', texte: v.pourquoi ?? '—', sourdine: true }]),
        fermer: 'Choisir autre chose',
      });
      return;
    }

    // ADAPTÉ — on ne substitue JAMAIS en silence. Ce qu'il aura sous la main n'est pas ce qu'il a
    // tapé : il doit le voir, savoir pourquoi, et confirmer. C'est un tap de plus, sur le seul cas
    // où il en vaut la peine.
    if (v.verdict === 'adapte') {
      ouvrirFeuille({
        titre: e.nom,
        sous: `<b>Adapté</b> → ${echapper(v.exercice.nom)}`,
        corps: blocPourquoi([{ label: 'Pourquoi', texte: v.pourquoi ?? '—', sourdine: true }]),
        items: [
          {
            libelle: `Faire ${v.exercice.nom}`,
            classe: 'feuille-item--primaire',
            faire: () => {
              fermerFeuille();
              apres({ ...v.exercice, libre: true });
            },
          },
        ],
        fermer: 'Choisir autre chose',
      });
      return;
    }

    fermerFeuille();
    apres({ ...v.exercice, libre: true });
  };

  const rendreListe = (q = '') => {
    liste.replaceChildren();
    const cible = sansAccent(q.trim());
    let vus = 0;

    for (const g of cat.groupes) {
      const dedans = g.exercices.filter(
        (e) => e.nom !== exclure && (!cible || sansAccent(e.nom).includes(cible) || sansAccent(g.libelle).includes(cible)),
      );
      if (!dedans.length) continue;

      liste.append(el('div', 'chx-groupe', echapper(g.libelle.toUpperCase())));
      for (const e of dedans) {
        vus++;
        const btn = el('button', `chx-exo chx-exo--${e.verdict}`);
        btn.type = 'button';
        btn.dataset.exo = e.id;
        // L'état, à plat : ce qui sera fait, et rien de plus. Le pourquoi est derrière le tap.
        const etat =
          e.verdict === 'refuse' ? 'Retiré · pourquoi ?'
            : e.verdict === 'adapte' ? `→ ${e.adapte_en}`
              : '+';
        btn.append(
          el('span', 'chx-exo-nom', echapper(e.nom)),
          el('span', 'chx-exo-go', echapper(etat)),
        );
        btn.addEventListener('click', () => choisir(e));
        liste.append(btn);
      }
    }

    if (!vus) liste.append(el('p', 'chx-vide', 'Aucun exercice ne correspond.'));
  };

  rendreListe();
  champ.addEventListener('input', () => rendreListe(champ.value));

  // ── CE QUE LE MATÉRIEL ET LE NIVEAU ÉCARTENT — en bas, à un tap, jamais supprimé.
  if (cat.indisponibles.length) {
    const b = el('button', 'chx-hors');
    b.type = 'button';
    b.append(
      el('span', null, `<b>${cat.indisponibles.length}</b> hors de ton matériel ou de ton niveau`),
      el('span', 'chx-hors-go', 'Pourquoi ?'),
    );
    b.addEventListener('click', () => {
      const c = el('div');
      for (const i of cat.indisponibles) c.append(el('p', 'chx-hors-l', riche(i.message)));
      if (cat.recommandation_materiel) {
        c.append(blocPourquoi([{ label: 'Ce qui les débloque', texte: cat.recommandation_materiel }]));
      }
      ouvrirFeuille({ titre: 'Écartés par ton profil', corps: c, fermer: 'Revenir au choix' });
    });
    corps.append(b);
  }

  ouvrirFeuille({ titre, corps, fermer: 'Annuler' });
  // Le champ ne prend PAS le focus : sur iPhone, il ferait monter le clavier par-dessus la liste
  // — l'utilisateur veut d'abord VOIR ses exercices, pas taper. Il tape s'il ne trouve pas.
}

/**
 * 🔴 LA SÉANCE QUI N'ÉTAIT PAS AU PROGRAMME.
 *
 * Elle n'a **aucun code à elle** : c'est un programme d'une seule séance, d'un seul exercice, passé
 * à `creerSeance()` — la même fonction que les autres. Et parce que c'est la même fonction, elle
 * finit dans le même `terminerSeance()`, donc dans le même magasin `seances`, donc dans le **même
 * journal**, donc dans la **même jauge sRPE**. **Une séance libre COMPTE.**
 *
 * ⚠️ Une séance qui vivrait dans son propre chemin serait une séance que le moteur ne verrait pas.
 * C'est le bug n°1 de ce projet, et on ne le rejoue pas.
 */
export function programmeDUnExercice(exercice, nom) {
  return { seances: [{ nom, exercices: [exercice] }] };
}
