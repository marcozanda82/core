/**
 * Blocca un commit se il diff in stage introduce chiavi o segreti.
 * Stampa solo il file e il tipo di regola, mai il valore.
 */
import { execFileSync } from 'node:child_process';

const RULES = [
  { name: 'google-api-key', re: /AIza[0-9A-Za-z_-]{20,}/ },
  { name: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'private-key', re: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/ },
  { name: 'provider-secret-key', re: /sk-(?:proj|ant|live|or)-[A-Za-z0-9_-]{10,}/ },
  { name: 'github-token', re: /ghp_[A-Za-z0-9]{20,}/ },
  { name: 'slack-token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  {
    name: 'gemini-key-assignment',
    // Blocca assegnazioni codice a GEMINI_API_KEY salvo segnaposto esplicito
    // o process.env.GEMINI_API_KEY (con optional fallback al segnaposto).
    test(line) {
      const code = String(line).replace(/\/\/.*$/, '');
      const m = code.match(/(?:^|[^.\w])GEMINI_API_KEY\s*=\s*(.+)$/);
      if (!m) return false;
      const rhs = m[1].trim().replace(/;+\s*$/, '');
      if (/^['"]emulator-placeholder['"]$/.test(rhs)) return false;
      if (/^process\.env\.GEMINI_API_KEY(?:\s*\|\|\s*['"]emulator-placeholder['"])?$/.test(rhs)) {
        return false;
      }
      return true;
    },
  },
];

function ruleHits(line) {
  const hits = [];
  for (const rule of RULES) {
    if (typeof rule.test === 'function') {
      if (rule.test(line)) hits.push(rule.name);
    } else if (rule.re?.test(line)) {
      hits.push(rule.name);
    }
  }
  return hits;
}

function addedLines(diff) {
  const found = [];
  let file = '';
  for (const line of String(diff).split(/\n/)) {
    if (line.startsWith('+++ b/')) {
      file = line.slice(6);
      continue;
    }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    for (const name of ruleHits(line.slice(1))) {
      found.push({ file: file || '(diff)', rule: name });
    }
  }
  return found;
}

function stagedDiff() {
  return execFileSync(
    'git',
    ['diff', '--cached', '--diff-filter=ACMR', '-U0', '--'],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
}

const hits = addedLines(stagedDiff());
if (hits.length > 0) {
  console.error('Commit bloccato: il diff in stage contiene chiavi o segreti.');
  for (const hit of hits) console.error(`- ${hit.file}: ${hit.rule}`);
  process.exit(1);
}
