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
const DB_VERSION = 1;

/**
 * Les magasins. `meta` est un clé/valeur générique (profil, état du chrono,
 * date du dernier export). Les autres sont des collections datées.
 * Toute évolution du schéma = DB_VERSION + 1 + une branche dans `onupgradeneeded`.
 */
export const STORES = {
  seances: { keyPath: 'id', indexes: [['parDate', 'date']] },
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
        } catch {
          /* déjà terminée */
        }
        reject(e);
      });
  });
}

// ── CRUD générique ───────────────────────────────────────────────────

export const lire = (store, cle) => transaction(store, 'readonly', (s) => promesse(s.get(cle)));

export const lireTout = (store) => transaction(store, 'readonly', (s) => promesse(s.getAll()));

export const compter = (store) => transaction(store, 'readonly', (s) => promesse(s.count()));

export const ecrire = (store, valeur) =>
  transaction(store, 'readwrite', (s) => promesse(s.put(valeur)));

export const ecrireLot = (store, valeurs) =>
  transaction(store, 'readwrite', (s) => Promise.all(valeurs.map((v) => promesse(s.put(v)))));

export const supprimer = (store, cle) =>
  transaction(store, 'readwrite', (s) => promesse(s.delete(cle)));

export const vider = (store) => transaction(store, 'readwrite', (s) => promesse(s.clear()));

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
