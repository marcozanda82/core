import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import parser from '@babel/parser';
import traverse from '@babel/traverse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, '..', 'src', 'SalaComandi.jsx');
const code = fs.readFileSync(file, 'utf8');

const ast = parser.parse(code, {
  sourceType: 'module',
  plugins: ['jsx', 'importAttributes', 'optionalChaining', 'nullishCoalescing', 'classProperties', 'topLevelAwait'],
});

let handlerPath = null;

traverse.default(ast, {
  VariableDeclarator(p) {
    if (p.node.id?.name === 'handleChatSubmit' && p.get('init').isArrowFunctionExpression()) {
      handlerPath = p.get('init');
      p.stop();
    }
  },
});

if (!handlerPath) {
  console.error('handleChatSubmit arrow not found');
  process.exit(1);
}

const free = new Set();

handlerPath.traverse({
  ReferencedIdentifier(p) {
    const name = p.node.name;
    if (name === 'undefined') return;
    const binding = p.scope.getBinding(name);
    if (!binding) {
      free.add(name);
      return;
    }
    // Binding declared inside handleChatSubmit (incl. nested functions) → not a closure dep
    if (handlerPath.isAncestor(binding.path)) return;
    free.add(name);
  },
});

const sorted = [...free].sort();
console.log(JSON.stringify(sorted, null, 2));
console.error('count', sorted.length);
