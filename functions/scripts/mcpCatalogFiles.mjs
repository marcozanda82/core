/**
 * Cataloghi server MCP (senza OFF): path pubblici → functions/data/.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FUNCTIONS_ROOT = path.resolve(__dirname, '..');
export const REPO_ROOT = path.resolve(FUNCTIONS_ROOT, '..');
/** Accanto al bundle in lib/ così il pack Functions li include sempre (no gitignore). */
export const DATA_DIR = path.join(FUNCTIONS_ROOT, 'lib', 'catalog-data');
export const CATALOGS_META = path.join(DATA_DIR, 'catalogs.meta.json');

/** Solo CREA + USDA (OFF escluso: troppo grande per il pacchetto Functions). */
export const MCP_SERVER_CATALOGS = Object.freeze([
  'kentu_smart_master_db.json',
  'kentu_smart_master_usda_FINAL.json',
]);

export function fileSha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function publicCatalogPath(name) {
  return path.join(REPO_ROOT, 'public', name);
}

export function dataCatalogPath(name) {
  return path.join(DATA_DIR, name);
}

/**
 * Copia public/ → functions/data/ e scrive catalogs.meta.json.
 * @returns {{ files: Record<string, { sha256: string, bytes: number }>, totalBytes: number }}
 */
export function syncMcpCatalogData() {
  mkdirSync(DATA_DIR, { recursive: true });
  const files = {};
  let totalBytes = 0;
  for (const name of MCP_SERVER_CATALOGS) {
    const src = publicCatalogPath(name);
    if (!existsSync(src)) {
      throw new Error(`[mcp-catalogs] manca public/${name}`);
    }
    const dest = dataCatalogPath(name);
    copyFileSync(src, dest);
    const bytes = statSync(dest).size;
    const sha256 = fileSha256(dest);
    files[name] = { sha256, bytes };
    totalBytes += bytes;
  }
  const meta = {
    builtAt: new Date().toISOString(),
    excludeOff: true,
    files,
    totalBytes,
  };
  writeFileSync(CATALOGS_META, `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

/**
 * Verifica che functions/data sia allineato a public/.
 * @throws {Error}
 */
export function assertMcpCatalogDataFresh() {
  if (!existsSync(CATALOGS_META)) {
    throw new Error('[mcp-catalogs] manca functions/data/catalogs.meta.json — esegui buildMcpBundle');
  }
  const meta = JSON.parse(readFileSync(CATALOGS_META, 'utf8'));
  for (const name of MCP_SERVER_CATALOGS) {
    const src = publicCatalogPath(name);
    const dest = dataCatalogPath(name);
    if (!existsSync(src)) throw new Error(`[mcp-catalogs] manca public/${name}`);
    if (!existsSync(dest)) throw new Error(`[mcp-catalogs] manca functions/data/${name}`);
    const pubHash = fileSha256(src);
    const dataHash = fileSha256(dest);
    if (pubHash !== dataHash) {
      throw new Error(`[mcp-catalogs] ${name} non aggiornato rispetto a public/ — esegui buildMcpBundle`);
    }
    if (!meta.files?.[name] || meta.files[name].sha256 !== dataHash) {
      throw new Error(`[mcp-catalogs] meta non allineato per ${name} — esegui buildMcpBundle`);
    }
  }
}
