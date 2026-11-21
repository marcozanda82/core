/**
 * Bundle MCP (ESM src → CJS per Cloud Functions) + meta hash per predeploy.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncMcpCatalogData } from './mcpCatalogFiles.mjs';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(FUNCTIONS_ROOT, '..');
const MCP_DIR = path.join(FUNCTIONS_ROOT, 'mcp');
const OUT_DIR = path.join(FUNCTIONS_ROOT, 'lib');

const EXTRA_HASH_PATHS = [
  path.join(REPO_ROOT, 'src/features/kentuFocus/score/computeDayScore.js'),
  path.join(REPO_ROOT, 'src/features/kentuFocus/score/dayScoreRecord.js'),
  path.join(REPO_ROOT, 'src/features/kentuFocus/safety/computeSafety.js'),
  path.join(REPO_ROOT, 'src/features/kentuFocus/score/computePeriodScore.js'),
  path.join(REPO_ROOT, 'src/features/kentuFocus/product/loadFocusCatalogsNode.js'),
  path.join(REPO_ROOT, 'src/features/mealBuilder/utils/foodMatchQuality.js'),
  path.join(REPO_ROOT, 'src/features/mealEngine/canonicalMealCommit.js'),
  path.join(REPO_ROOT, 'src/utils/computeTotaliCore.js'),
  path.join(REPO_ROOT, 'src/utils/dayNodeWriteCore.js'),
  path.join(REPO_ROOT, 'src/utils/sodiumUnits.js'),
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

function fileHash(filePath) {
  const buf = readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex');
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
  return { hash: h.digest('hex'), files: files.map((f) => path.relative(REPO_ROOT, f).replace(/\\/g, '/')) };
}

const labShim = path.join(MCP_DIR, 'shims', 'getTrackerDayNode.js');
const draftShim = path.join(MCP_DIR, 'shims', 'draftParser.js');
const denyShim = path.join(MCP_DIR, 'shims', 'browserDeny.js');

const stubLabPlugin = {
  name: 'stub-browser-only-modules',
  setup(build) {
    build.onResolve({ filter: /buildFocusLabDossier(\.js)?$/ }, () => ({ path: labShim }));
    build.onResolve({ filter: /draftParser(\.js)?$/ }, () => ({ path: draftShim }));
    // React/DOM: fallisce il build (mai external → require a runtime).
    build.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) => ({
      path: args.path,
      namespace: 'mcp-forbid-browser',
    }));
    build.onLoad({ filter: /.*/, namespace: 'mcp-forbid-browser' }, (args) => ({
      errors: [{ text: `MCP bundle non può importare "${args.path}" (estrai logica pura senza React/DOM)` }],
    }));
    build.onResolve({
      filter: /(firebaseConfig|coreEngine|aiService|devToolsPersistence|HabitEngine|predictiveGreeting|avatarMood|conversationState|mealLogIntent|assistedMealPipeline|userFoodPreferenceContext|mealSmartDefaults|workoutRegistrationSlots|useBiochimico)(\.(js|jsx))?$/,
    }, () => ({ path: denyShim }));
  },
};

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'warning',
  plugins: [stubLabPlugin],
  // Evita di trascinare il client Firebase / UI nel bundle server.
  packages: 'bundle',
  external: [
    'firebase-admin',
    'firebase-functions',
    'firebase',
    'firebase/*',
    '@modelcontextprotocol/sdk',
    '@modelcontextprotocol/sdk/*',
    'zod',
    'zod/*',
  ],
};

mkdirSync(OUT_DIR, { recursive: true });

const catalogsMeta = syncMcpCatalogData();
console.log(
  `[mcp-catalogs] synced ${(catalogsMeta.totalBytes / (1024 * 1024)).toFixed(2)} MB → functions/lib/catalog-data/ (OFF escluso)`,
);

await esbuild.build({
  ...common,
  entryPoints: [path.join(MCP_DIR, 'httpHandler.js')],
  outfile: path.join(OUT_DIR, 'mcpHttp.cjs'),
});

await esbuild.build({
  ...common,
  entryPoints: [path.join(MCP_DIR, 'tokens.js')],
  outfile: path.join(OUT_DIR, 'mcpTokens.cjs'),
});

const { hash, files } = computeSourceHash();
const meta = {
  builtAt: new Date().toISOString(),
  sourceHash: hash,
  files,
  outputs: ['lib/mcpHttp.cjs', 'lib/mcpTokens.cjs'],
  catalogs: {
    excludeOff: true,
    totalBytes: catalogsMeta.totalBytes,
    files: catalogsMeta.files,
  },
};
writeFileSync(path.join(OUT_DIR, 'mcpBundle.meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
console.log(`[mcp-bundle] ok sourceHash=${hash.slice(0, 12)}… files=${files.length}`);
