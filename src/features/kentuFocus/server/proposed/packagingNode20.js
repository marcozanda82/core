/**
 * Stato packaging Focus → Cloud Functions (I4-C).
 */

export const FOCUS_PACKAGING_STATUS = Object.freeze({
  focusModulesLocation: 'src/features/kentuFocus/**',
  functionsRuntime: 'node20-commonjs',
  syncScript: 'scripts/syncFocusForFunctions.mjs',
  packageOutput: 'functions/_shared (generated, gitignored)',
  includedInFunctionsDeployToday: false,
  predeployHookWired: false,
  smokeScript: 'functions/smokeFocusPackage.cjs',
  recommendedNextStep: 'approve_predeploy_sync_then_wire_firebase_json',
  requiresApprovalBeforeDeploy: true,
});
