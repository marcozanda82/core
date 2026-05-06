/**
 * Check statiche DEV per foodInputOrchestrator.
 * NON importare da entrypoint/UI: chiamare manualmente `runFoodInputOrchestratorDevCheck()` in DEV se serve.
 */

import { orchestrateFoodInput, shouldRunSmartFoodInput } from './foodInputOrchestrator.js';

const STATIC_CASES = [
  { query: 'yogurt', expectedShouldRunSmart: false },
  { query: 'yogurt greco', expectedShouldRunSmart: false },
  { query: 'yogurt 170g', expectedShouldRunSmart: true },
  { query: 'pane e marmellata', expectedShouldRunSmart: true },
  { query: 'riso pollo verdure', expectedShouldRunSmart: true },
  { query: 'uova + pancetta', expectedShouldRunSmart: true },
];

/**
 * Esegue i casi statici e logga una riga per query (solo se import.meta.env.DEV).
 */
export function runFoodInputOrchestratorDevCheck() {
  if (!import.meta.env?.DEV) return;

  const mockClassicSearchFn = () => [{ id: 'mock_classic', name: 'Mock classic' }];
  const mockSmartParseFn = () => ({ status: 'dev_mock', items: [] });

  for (let i = 0; i < STATIC_CASES.length; i += 1) {
    const c = STATIC_CASES[i];
    const actualShouldRunSmart = shouldRunSmartFoodInput(c.query);
    const orchestrated = orchestrateFoodInput({
      query: c.query,
      foodDb: {},
      flatLog: [],
      classicSearchFn: mockClassicSearchFn,
      smartParseFn: mockSmartParseFn,
      maxClassicResults: 5,
    });
    const ok = actualShouldRunSmart === c.expectedShouldRunSmart;
    // eslint-disable-next-line no-console
    console.log('[foodInputOrchestrator:DEV_CHECK]', {
      query: c.query,
      expectedShouldRunSmart: c.expectedShouldRunSmart,
      actualShouldRunSmart,
      mode: orchestrated.mode,
      ok,
    });
  }
}
