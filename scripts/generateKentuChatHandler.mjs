import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const salaPath = path.join(root, 'src', 'SalaComandi.jsx');
const outPath = path.join(root, 'src', 'hooks', 'useKentuChatHandler.js');

const BUILTIN = new Set([
  'Array',
  'Boolean',
  'Date',
  'JSON',
  'Math',
  'NaN',
  'Number',
  'Object',
  'String',
  'parseInt',
  'parseFloat',
  'isNaN',
  'window',
  'handleChatSubmit',
]);

/** Symbols imported inside useKentuChatHandler.js (not passed via context). */
const IMPORTED_IN_HOOK = new Set([
  'MEAL_LABELS_SAVE',
  'SLEEP_AI_MI_FITNESS_INSTRUCTIONS',
  'applyCalorieStrategyToProfileKcal',
  'buildKentuAiMetabolicRecompositionContext',
  'buildKentuAiVitalsContextParagraph',
  'buildPostWorkoutCoachMessage',
  'buildTrainingWaveContextSnippet',
  'calculateConsolidatedAverageScore',
  'calculateProjectedAge',
  'deriveCurrentBodyMetricsFromHistory',
  'deriveEffectiveBodyMetricsForDate',
  'detectWorkoutIntentFromChat',
  'extractAndStripDailyPlan',
  'extractAndStripMealProposal',
  'findLastMatchingWorkoutSlot',
  'findRecentFoodHabit',
  'formatDecimalHourIt',
  'generateLocalHabitScanner',
  'generateLocalMonthlyAudit',
  'generateLocalNutritionalAudit',
  'generateLocalTrainingAdvice',
  'generateRealEnergyData',
  'getGhostMealType',
  'getInvisibleContext',
  'getMorningBriefingVerdict',
  'getTodayString',
  'getYesterdayCalorieStatus',
  'markEveningBriefingShown',
  'normalizeLogData',
  'parseFlexibleTimeToDecimal',
  'parseKentuInvisibleCmd',
  'stripInvisibleContextFromVisibleUserText',
]);

const lines = fs.readFileSync(salaPath, 'utf8').split(/\r?\n/);
// 1-based line numbers from editor: handle starts 4756, ends 6164
// 1-based: L4756 = `const handleChatSubmit...`, L6164 = `  };`
const slice = lines.slice(4755, 6164); // 0-based [4755..6163]
if (!slice[0]?.includes('const handleChatSubmit')) {
  console.error('Unexpected first line', slice[0]);
  process.exit(1);
}
if (!slice[slice.length - 1]?.trim().startsWith('};')) {
  console.error('Unexpected last line', slice[slice.length - 1]);
  process.exit(1);
}
// Re-indent: was 4 spaces inside SalaComandi; here 6 spaces inside async(handleChatSubmit) under useMemo
const innerBody = slice
  .slice(1, -1)
  .map((line) => (line.length === 0 ? line : `  ${line}`))
  .join('\n');

const HEADER = `import { useMemo, useRef } from 'react';
import {
  calculateConsolidatedAverageScore,
  calculateProjectedAge,
  buildKentuAiVitalsContextParagraph,
  buildKentuAiMetabolicRecompositionContext,
} from '../longevityStats';
import {
  getTodayString,
  getGhostMealType,
  generateRealEnergyData,
  buildTrainingWaveContextSnippet,
  parseKentuInvisibleCmd,
  applyCalorieStrategyToProfileKcal,
  MEAL_LABELS_SAVE,
  SLEEP_AI_MI_FITNESS_INSTRUCTIONS,
  normalizeLogData,
  generateLocalNutritionalAudit,
  generateLocalTrainingAdvice,
  generateLocalMonthlyAudit,
  generateLocalHabitScanner,
} from '../coreEngine';
import {
  getMorningBriefingVerdict,
  getYesterdayCalorieStatus,
  markEveningBriefingShown,
  buildPostWorkoutCoachMessage,
} from '../useSmartKentuTriggers';
import {
  formatDecimalHourIt,
  parseFlexibleTimeToDecimal,
  detectWorkoutIntentFromChat,
  findLastMatchingWorkoutSlot,
} from '../features/salaComandi/utils/timelineUtils';
import {
  deriveEffectiveBodyMetricsForDate,
  deriveCurrentBodyMetricsFromHistory,
} from '../features/salaComandi/engines/bodyMetricsEngine';
import {
  stripInvisibleContextFromVisibleUserText,
  getInvisibleContext,
  extractAndStripMealProposal,
  extractAndStripDailyPlan,
} from '../features/salaComandi/utils/aiContextUtils';
import { findRecentFoodHabit } from '../features/salaComandi/utils/foodUtils';

/**
 * Kentu chat submit handler (extracted from SalaComandi).
 * Pass a fresh \`context\` object each render; the hook keeps a ref for a stable callback.
 */
export function useKentuChatHandler(context) {
  const ctxRef = useRef(context);
  ctxRef.current = context;

  return useMemo(() => {
    async function handleChatSubmit(optionalReply, sendMeta) {
      const {
`;

const FOOTER = `
      } = ctxRef.current;

${innerBody}
    }
    return handleChatSubmit;
  }, []);
}
`;

// Compute context keys: free identifiers from a quick scan — use IMPORTED_IN_HOOK + BUILTIN
import parser from '@babel/parser';
import traverse from '@babel/traverse';

const code = fs.readFileSync(salaPath, 'utf8');
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
    if (handlerPath.isAncestor(binding.path)) return;
    free.add(name);
  },
});

const contextKeys = [...free]
  .filter((n) => !BUILTIN.has(n) && !IMPORTED_IN_HOOK.has(n))
  .sort();

const destructure = contextKeys.map((k) => `        ${k},`).join('\n');

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, HEADER + destructure + FOOTER, 'utf8');
console.log('Wrote', outPath, 'context keys:', contextKeys.length);
