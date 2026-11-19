/**
 * Fallisce se il bundle MCP non esiste o non corrisponde alle sorgenti attuali.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertMcpCatalogDataFresh } from './mcpCatalogFiles.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(FUNCTIONS_ROOT, '..');
const MCP_DIR = path.join(FUNCTIONS_ROOT, 'mcp');
const META = path.join(FUNCTIONS_ROOT, 'lib', 'mcpBundle.meta.json');
const OUTS = [
  path.join(FUNCTIONS_ROOT, 'lib', 'mcpHttp.cjs'),
  path.join(FUNCTIONS_ROOT, 'lib', 'mcpTokens.cjs'),
];

const EXTRA_HASH_PATHS = [
  path.join(REPO_ROOT, 'src/features/kentuFocus/score/computeDayScore.js'),
  path.join(REPO_ROOT, 'src/features/kentuFocus/score/dayScoreRecord.js'),
  path.join(REPO_ROOT, 'src/features/kentuFocus/safety/computeSafety.js'),
  path.join(REPO_ROOT, 'src/features/kentuFocus/score/computePeriodScore.js'),
  path.join(REPO_ROOT, 'src/features/kentuFocus/product/loadFocusCatalogsNode.js'),
  path.join(REPO_ROOT, 'src/features/mealBuilder/utils/foodMatchQuality.js'),
  path.join(REPO_ROOT, 'src/foodSearch.js'),
];

function listJsFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listJsFiles(full));
    else if (name.endsWith('.js')) out.push(full);
  }
  return out.sort();
}

function computeSourceHash() {
  const files = [...listJsFiles(MCP_DIR), ...EXTRA_HASH_PATHS.filter((p) => existsSync(p))];
  const h = createHash('sha256');
  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
    h.update(rel);
    h.update('\0');
    h.update(readFileSync(file));
    h.update('\0');
  }
  return h.digest('hex');
}

if (!existsSync(META) || OUTS.some((p) => !existsSync(p))) {
  console.error('[mcp-bundle] mancante: esegui node functions/scripts/buildMcpBundle.mjs');
  process.exit(1);
}

const meta = JSON.parse(readFileSync(META, 'utf8'));
const current = computeSourceHash();
if (meta.sourceHash !== current) {
  console.error('[mcp-bundle] non aggiornato rispetto alle sorgenti.');
  console.error(`  meta:    ${meta.sourceHash}`);
  console.error(`  current: ${current}`);
  console.error('Esegui: node functions/scripts/buildMcpBundle.mjs');
  process.exit(1);
}

try {
  assertMcpCatalogDataFresh();
} catch (error) {
  console.error(String(error?.message || error));
  process.exit(1);
}

console.log(`[mcp-bundle] check ok (${current.slice(0, 12)}…)`);
console.log('[mcp-catalogs] check ok (allineati a public/, OFF escluso)');
