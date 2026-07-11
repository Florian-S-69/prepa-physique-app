/**
 * backup.js — export / import JSON.
 *
 * 🔴 Contrainte NON NÉGOCIABLE n°3 (docs/veille/16-faisabilite-pwa.md §6).
 *
 * `persist()` ne protège d'AUCUNE action de l'utilisateur : icône supprimée,
 * « Effacer données de sites », téléphone restauré. Sans serveur, il n'existe
 * qu'un seul exemplaire des données. **Le seul backend, c'est l'utilisateur.**
 *
 * Ce que cette brique doit garantir :
 *   - Export : `Blob` + `<a download>` → marche partout, y compris iOS
 *     (le fichier atterrit dans l'app Fichiers).
 *   - Import : `<input type="file">` → marche partout.
 *   - Un RAPPEL quand la dernière sauvegarde date trop.
 */

import { STORES, lireTout, ecrireLot, lireMeta, ecrireMeta, vider } from './db.js';

/** Au-delà, l'app rappelle (gentiment) qu'il faut exporter. */
export const SEUIL_RAPPEL_JOURS = 14;

const FORMAT = 'prepa-physique/export';
const FORMAT_VERSION = 1;
const CLE_DERNIER_EXPORT = 'dernierExport';

/** Construit l'instantané complet de la base. */
export async function construireExport() {
  const donnees = {};
  for (const nom of Object.keys(STORES)) {
    donnees[nom] = await lireTout(nom);
  }
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exporteLe: new Date().toISOString(),
    donnees,
  };
}

const nomFichier = () => `prepa-physique-${new Date().toISOString().slice(0, 10)}.json`;

/**
 * Exporte et déclenche le téléchargement.
 * @returns {Promise<{nom: string, octets: number, lignes: number}>}
 */
export async function exporterJSON() {
  const instantane = await construireExport();
  const texte = JSON.stringify(instantane, null, 2);
  const blob = new Blob([texte], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier();
  document.body.append(a);
  a.click();
  a.remove();
  // Laisser le temps au téléchargement de démarrer avant de révoquer l'URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);

  await ecrireMeta(CLE_DERNIER_EXPORT, instantane.exporteLe);

  const lignes = Object.values(instantane.donnees).reduce((n, arr) => n + arr.length, 0);
  return { nom: a.download, octets: blob.size, lignes };
}

/**
 * Partage le fichier via la feuille de partage iOS/Android (iCloud Drive, Mail…).
 * Web Share Level 2 : iOS 15+, Android. Absent sur desktop → on ne l'affiche pas.
 */
export const partageFichierDisponible = () => {
  if (!navigator.canShare) return false;
  try {
    const test = new File(['{}'], 'test.json', { type: 'application/json' });
    return navigator.canShare({ files: [test] });
  } catch {
    return false;
  }
};

export async function partagerExport() {
  const instantane = await construireExport();
  const fichier = new File([JSON.stringify(instantane, null, 2)], nomFichier(), {
    type: 'application/json',
  });
  await navigator.share({ files: [fichier], title: 'Sauvegarde prepa-physique' });
  await ecrireMeta(CLE_DERNIER_EXPORT, instantane.exporteLe);
  return { nom: fichier.name, octets: fichier.size };
}

/**
 * Importe un fichier d'export.
 * @param {File} fichier
 * @param {'remplacer'|'fusionner'} mode  remplacer = on vide d'abord (restauration
 *   d'un téléphone) ; fusionner = on écrase clé par clé (les ids sont stables).
 * @returns {Promise<{lignes: number, exporteLe: string}>}
 * @throws {Error} message lisible par un humain si le fichier n'est pas valide.
 */
export async function importerJSON(fichier, mode = 'remplacer') {
  let instantane;
  try {
    instantane = JSON.parse(await fichier.text());
  } catch {
    throw new Error("Ce fichier n'est pas du JSON lisible. Choisis un export de l'app.");
  }

  if (instantane?.format !== FORMAT) {
    throw new Error("Ce fichier ne vient pas de prepa-physique. Rien n'a été modifié.");
  }
  if (instantane.version > FORMAT_VERSION) {
    throw new Error(
      `Ce fichier vient d'une version plus récente de l'app (format ${instantane.version}). Mets l'app à jour avant d'importer.`,
    );
  }
  if (!instantane.donnees || typeof instantane.donnees !== 'object') {
    throw new Error("Cet export est vide ou corrompu. Rien n'a été modifié.");
  }

  // On valide TOUT avant d'écrire QUOI QUE CE SOIT : un import qui échoue à
  // mi-parcours laisserait la base dans un état incohérent.
  const aEcrire = [];
  for (const [nom, def] of Object.entries(STORES)) {
    const lignes = instantane.donnees[nom];
    if (lignes === undefined) continue;
    if (!Array.isArray(lignes)) throw new Error(`Section « ${nom} » corrompue dans le fichier.`);
    for (const ligne of lignes) {
      if (!ligne || typeof ligne !== 'object' || ligne[def.keyPath] === undefined) {
        throw new Error(`Une entrée de « ${nom} » n'a pas de clé « ${def.keyPath} ».`);
      }
    }
    aEcrire.push([nom, lignes]);
  }

  if (mode === 'remplacer') {
    for (const nom of Object.keys(STORES)) await vider(nom);
  }
  let total = 0;
  for (const [nom, lignes] of aEcrire) {
    if (lignes.length) await ecrireLot(nom, lignes);
    total += lignes.length;
  }

  // La date d'export du fichier importé devient la date de dernière sauvegarde :
  // ces données SONT sauvegardées quelque part (dans ce fichier-là).
  await ecrireMeta(CLE_DERNIER_EXPORT, instantane.exporteLe ?? new Date().toISOString());

  return { lignes: total, exporteLe: instantane.exporteLe };
}

// ── Rappel de sauvegarde ─────────────────────────────────────────────

/**
 * @returns {Promise<{jamais: boolean, date: Date|null, jours: number|null, aRappeler: boolean}>}
 */
export async function etatSauvegarde() {
  const iso = await lireMeta(CLE_DERNIER_EXPORT, null);
  if (!iso) return { jamais: true, date: null, jours: null, aRappeler: true };

  const date = new Date(iso);
  const jours = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  return { jamais: false, date, jours, aRappeler: jours >= SEUIL_RAPPEL_JOURS };
}

/** Phrase prête à afficher : « Dernière sauvegarde il y a 23 jours ». */
export function libelleSauvegarde(etat) {
  if (etat.jamais) return "Tu n'as jamais exporté tes données.";
  if (etat.jours === 0) return "Dernière sauvegarde : aujourd'hui.";
  if (etat.jours === 1) return 'Dernière sauvegarde : hier.';
  return `Dernière sauvegarde il y a ${etat.jours} jours.`;
}
