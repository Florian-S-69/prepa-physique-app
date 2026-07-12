/**
 * db.js — couche d'accès IndexedDB. Minimale, volontairement.
 *
 * Pourquoi IndexedDB et pas localStorage :
 *   - localStorage est SYNCHRONE (il bloque le thread UI) et plafonné à ~5 Mo ;
 *   - IndexedDB est asynchrone, transactionnel, et le quota réel se compte en Go
 *     (WebKit 2023-08-10 : jusqu'à 60 % du disque par origine, même en PWA installée).
 *   Cf. docs/veille/16-faisabilite-pwa.md §1.4.
 *
 * ⚠️ Sur iOS, l'ORIGINE ENTIÈRE est évincée d'un bloc (IndexedDB + Cache + localStorage
 * ensemble). D'où : `storage.js` (persist) et `backup.js` (export) ne sont pas des
 * options, ce sont des composants du système de stockage.
 *
 * Zéro dépendance. Un wrapper promise de ~120 lignes, pas Dexie.
 */

const DB_NAME = 'prepa-physique';
/**
 * 🔴 v1 → v2 (2026-07-12) : le magasin `sorties` (les COURSES).
 *
 * ⚠️ **Cette migration est ADDITIVE, et ça n'est pas un détail de confort.** `onupgradeneeded`
 * ci-dessous ne fait que **créer les magasins qui manquent** (`objectStoreNames.contains`) : il
 * n'ouvre, ne relit et ne réécrit **aucune donnée existante**. `seances`, `mesures` et `meta`
 * traversent la migration sans être touchés — donc sans pouvoir être perdus.
 *
 * C'est la seule forme de migration qu'on s'autorise sur cette base : elle contient des semaines de
 * RPE **irremplaçables** (il n'y a pas de serveur, il n'y a pas de deuxième copie). Une migration
 * qui TRANSFORME de la donnée devra, elle, être précédée d'un export automatique — ce n'est pas le
 * cas ici, et il ne faut pas s'habituer à ce que « migration » veuille dire « sans risque ».
 */
const DB_VERSION = 2;

/**
 * Les magasins. `meta` est un clé/valeur générique (profil, état du chrono,
 * date du dernier export). Les autres sont des collections datées.
 * Toute évolution du schéma = DB_VERSION + 1 + une branche dans `onupgradeneeded`.
 *
 * 🔴 `sorties` = les COURSES. Un magasin SÉPARÉ de `seances`, et c'est délibéré : une sortie n'a ni
 * exercices, ni séries, ni RIR — la fourrer dans `seances` avec un champ `type` obligerait chaque
 * lecteur du carnet (`versEntreeJournal`, le tonnage, la double progression, le bilan) à commencer
 * par un `if`. Le moteur, lui, les tient déjà séparées : `journal.seances_muscu` et
 * `journal.sorties_course` sont deux listes, avec deux validateurs (`src/lib/journal.js`). La base
 * suit le moteur ; elle ne s'invente pas un schéma à elle.
 *
 * ⚠️ `backup.js` boucle sur `STORES` : les courses partent dans l'export **sans une ligne de plus**.
 * Un magasin qu'on ajoute sans l'ajouter à l'export serait un magasin qu'un import RESTAURERAIT VIDE.
 */
export const STORES = {
  seances: { keyPath: 'id', indexes: [['parDate', 'date']] },
  sorties: { keyPath: 'id', indexes: [['parDate', 'date']] },
  mesures: { keyPath: 'id', indexes: [['parDate', 'date']] },
  meta: { keyPath: 'cle', indexes: [] },
};

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

/** Ouvre (et migre si besoin) la base. Idempotent : une seule connexion partagée. */
export function ouvrirDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error("Ce navigateur ne supporte pas IndexedDB : l'app ne peut rien enregistrer."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [nom, def] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(nom)) continue;
        const store = db.createObjectStore(nom, { keyPath: def.keyPath });
        for (const [nomIndex, champ] of def.indexes) store.createIndex(nomIndex, champ);
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      // Un autre onglet demande une migration : on libère la connexion, sinon il reste bloqué.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    req.onerror = () => reject(req.error ?? new Error('Ouverture de la base impossible'));
    req.onblocked = () =>
      reject(new Error("Une autre fenêtre de l'app bloque la mise à jour de la base. Ferme-la."));
  });

  return dbPromise;
}

// ══════════════════════════════════════════════════════════════════════
// 🔴 UNE ÉCRITURE QUI ÉCHOUE NE DOIT JAMAIS ÊTRE SILENCIEUSE
// ══════════════════════════════════════════════════════════════════════
//
// Depuis le 2026-07-12, **c'est cette couche qui écrit ses séries.** Un `catch`
// qui avale son erreur ici, c'est une série perdue **qu'il ne saura jamais avoir
// perdue** — il rangera la barre, content, et la séance ne sera pas là.
//
// Le quota plein, une transaction avortée par iOS pendant qu'il pose ses
// haltères, une base fermée par un autre onglet : ça arrive, et ça arrive
// justement au pire moment. Le contrat de ce module :
//
//   1. **toute erreur d'écriture est RELANCÉE** (l'appelant décide quoi en dire) ;
//   2. **et elle est SIGNALÉE** sur `ECHECS`, pour que la coquille l'affiche même
//      si personne n'a mis de `try` autour. Un `await ecrireMeta(...)` oublié dans
//      un coin ne doit pas produire un échec muet.
//
// C'est le seul endroit du module qui connaisse quelque chose de l'extérieur —
// et encore : un `EventTarget`, pas le DOM. `db.js` reste sans UI.

/** Canal des échecs d'ÉCRITURE. `main.js` s'y branche et lève une bannière. */
export const ECHECS = new EventTarget();

function signalerEchec(operation, store, erreur) {
  // La console garde la trace technique — l'utilisateur, lui, aura la bannière.
  console.error(`[db] ${operation}(${store}) a échoué :`, erreur);
  ECHECS.dispatchEvent(new CustomEvent('echec', { detail: { operation, store, erreur } }));
  return erreur;
}

/** Enveloppe une IDBRequest dans une promesse. */
function promesse(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Exécute `fn(store)` dans une transaction, et attend sa validation effective. */
async function transaction(nomStore, mode, fn) {
  const db = await ouvrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(nomStore, mode);
    let resultat;
    // On résout sur `oncomplete`, pas sur le succès de la requête : en écriture,
    // seul `complete` garantit que la transaction est réellement validée sur disque.
    tx.oncomplete = () => resolve(resultat);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction annulée'));
    Promise.resolve(fn(tx.objectStore(nomStore)))
      .then((r) => {
        resultat = r;
      })
      .catch((e) => {
        try {
          tx.abort();
        } catch (avorte) {
          // La transaction était déjà finie — ce n'est pas la vraie cause, mais on
          // ne l'efface pas : un `catch {}` nu ici, c'est une piste effacée le jour
          // où on cherchera pourquoi une série a disparu.
          console.warn('[db] abandon d’une transaction déjà terminée :', avorte);
        }
        reject(e);
      });
  });
}

/** Une écriture : elle relance SON erreur, et elle la crie. */
async function ecriture(operation, store, mode, fn) {
  try {
    return await transaction(store, mode, fn);
  } catch (e) {
    throw signalerEchec(operation, store, e);
  }
}

// ── CRUD générique ───────────────────────────────────────────────────

export const lire = (store, cle) => transaction(store, 'readonly', (s) => promesse(s.get(cle)));

export const lireTout = (store) => transaction(store, 'readonly', (s) => promesse(s.getAll()));

export const compter = (store) => transaction(store, 'readonly', (s) => promesse(s.count()));

export const ecrire = (store, valeur) =>
  ecriture('ecrire', store, 'readwrite', (s) => promesse(s.put(valeur)));

export const ecrireLot = (store, valeurs) =>
  ecriture('ecrireLot', store, 'readwrite', (s) => Promise.all(valeurs.map((v) => promesse(s.put(v)))));

export const supprimer = (store, cle) =>
  ecriture('supprimer', store, 'readwrite', (s) => promesse(s.delete(cle)));

export const vider = (store) => ecriture('vider', store, 'readwrite', (s) => promesse(s.clear()));

// ── Raccourcis `meta` (clé/valeur) ───────────────────────────────────

/** @returns la valeur, ou `defaut` si la clé n'existe pas. */
export async function lireMeta(cle, defaut = null) {
  const enr = await lire('meta', cle);
  return enr === undefined ? defaut : enr.valeur;
}

export const ecrireMeta = (cle, valeur) => ecrire('meta', { cle, valeur });

/** Identifiant unique, trié chronologiquement (pas de dépendance uuid). */
export const nouvelId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
