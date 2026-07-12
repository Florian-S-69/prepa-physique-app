/**
 * storage.js — persistance du stockage (Storage API).
 *
 * 🔴 Contrainte NON NÉGOCIABLE n°2 (docs/veille/16-faisabilite-pwa.md §6) :
 *   appeler `navigator.storage.persist()` ET VÉRIFIER LE RETOUR. S'il est refusé,
 *   on le DIT à l'utilisateur. On ne suppose jamais que ça a marché.
 *
 * Ce que persist() protège (WebKit, 2023-08-10, « Updates to Storage Policy ») :
 *   ✅ l'éviction automatique (pression disque, LRU, inactivité) saute les origines
 *      marquées `persistent`.
 * Ce qu'il NE protège PAS (§1.5 de la veille) :
 *   ❌ la suppression de l'icône de la PWA (= désinstallation = données effacées) ;
 *   ❌ Réglages → Safari → « Effacer historique et données de sites » ;
 *   ❌ une restauration / un changement de téléphone.
 *   → d'où l'export JSON (backup.js), qui n'est pas un bonus mais LE filet.
 *
 * WebKit accorde persist() « based on heuristics like whether the website is opened
 * as a Home Screen Web App » → l'installation (install.js) est le préalable.
 */

const dispo = () => typeof navigator !== 'undefined' && 'storage' in navigator;

/**
 * L'origine est-elle déjà en mode persistant ?
 * @returns {Promise<boolean|null>} null = l'API n'existe pas (on ne peut pas savoir).
 */
export async function estPersistant() {
  if (!dispo() || !navigator.storage.persisted) return null;
  try {
    return await navigator.storage.persisted();
  } catch (e) {
    // ⚠️ `null` n'est PAS `false` : « je ne sais pas » ≠ « non protégé ». L'écran
    // affiche « Impossible à vérifier » et pousse à l'export — c'est le bon
    // comportement. Mais on ne jette pas la CAUSE : un `catch {}` nu efface la
    // seule piste qu'on aura le jour où quelqu'un perd ses séances.
    console.warn('[storage] persisted() a échoué :', e);
    return null;
  }
}

/**
 * Demande le mode persistant. À appeler SUR UN GESTE UTILISATEUR (Firefox ouvre un
 * prompt ; Chrome/WebKit décident par heuristique, dont « est-ce une app installée »).
 *
 * @returns {Promise<{accorde: boolean, supporte: boolean, raison: string}>}
 *   `accorde` est le VRAI retour de l'API — jamais une supposition.
 */
export async function demanderPersistance() {
  if (!dispo() || !navigator.storage.persist) {
    return {
      accorde: false,
      supporte: false,
      raison: "Ce navigateur ne connaît pas la protection du stockage. Exporte tes données régulièrement.",
    };
  }
  try {
    const dejaOk = await estPersistant();
    if (dejaOk) {
      return { accorde: true, supporte: true, raison: 'Tes données sont déjà protégées.' };
    }
    const accorde = await navigator.storage.persist();
    return {
      accorde,
      supporte: true,
      raison: accorde
        ? "Le navigateur a accepté : il n'effacera pas tes séances tout seul."
        : "Le navigateur a REFUSÉ. Tes séances peuvent être effacées automatiquement. Installe l'app sur l'écran d'accueil, puis réessaie — et exporte tes données.",
    };
  } catch (e) {
    return {
      accorde: false,
      supporte: true,
      raison: `La demande a échoué (${e.message}). Exporte tes données pour ne rien risquer.`,
    };
  }
}

/**
 * Quota réel de l'origine.
 * @returns {Promise<{utilise: number, quota: number, pct: number}|null>}
 */
export async function estimerQuota() {
  if (!dispo() || !navigator.storage.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { utilise: usage, quota, pct: quota > 0 ? (usage / quota) * 100 : 0 };
  } catch (e) {
    console.warn('[storage] estimate() a échoué :', e);
    return null;
  }
}

/** Formate des octets pour un humain : « 1,4 Mo ». */
export function formaterOctets(octets) {
  if (!Number.isFinite(octets) || octets < 0) return '—';
  const unites = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let i = 0;
  let n = octets;
  while (n >= 1024 && i < unites.length - 1) {
    n /= 1024;
    i++;
  }
  const decimales = i === 0 || n >= 100 ? 0 : 1;
  return `${n.toFixed(decimales).replace('.', ',')} ${unites[i]}`;
}
