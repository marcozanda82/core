/**
 * Fixture fedele a un rapporto editoriale v3 già persistito (Mese),
 * per riprodurre il recupero storico SENZA Gemini e SENZA write Firebase prod.
 *
 * Contiene 4 evidenceRefs utilizzabili + casi non risolvibili (vuoti / null).
 */

export const FOCUS_SAVED_EVIDENCE_HARNESS_REVISION_ID = 'r1_mvo2d66x';

export const FOCUS_SAVED_EVIDENCE_HARNESS_GENERATED_AT = Date.parse('2026-10-25T17:50:24.000Z');

/**
 * Analisi v3 come tipicamente salvata (mix path stringa + oggetti Gemini + buchi).
 * @returns {object}
 */
export function buildFocusSavedEvidenceHarnessAnalysis() {
  return {
    schema: 'kentu.focusAiCoachAnalysis.v3',
    headline: 'Un mese scandito dal metodo, in cui solo il riposo va a fisarmonica',
    lead: 'Sul mese emergono continuità di stimolo e un sonno irregolare da osservare senza certezze cliniche.',
    sections: [
      {
        id: 'metodo',
        title: 'Metodo',
        body: 'La forza si ripete nel mese; non è un verdetto di ipertrofia, solo continuità di pratica.',
      },
      {
        id: 'riposo',
        title: 'Riposo',
        body: 'Il riposo oscilla: da contestualizzare nel diario, non da diagnosticare.',
      },
    ],
    keyInsight: 'Continuità di metodo vs irregolarità del riposo.',
    recommendedAction: 'Consolida l’orario di addormentamento già riuscito in più notti registrate.',
    expectedChange: 'Cambia soprattutto la regolarità della routine; non attribuisce rischi clinici.',
    verifyNext: 'Confronta regolarità sonno e frequenza forza sul prossimo mese.',
    evidenceRefs: [
      'kentuEngines.muscleStimulus',
      { source: 'kentuEngines.bussola', label: '', value: '' },
      { label: 'Sonno sul mese', value: 'serie notti registrate', engine: 'sleep' },
      { id: 'kentuEngines.energyPilot' },
      'habitCompass.evaluations[0]',
      'habitCompass.evaluations[3]',
      'habitCompass.evaluations[99]',
      '',
      null,
      { label: '', value: '', source: '' },
      '   ',
      'totally.unknown.ref.xyz',
    ],
    limits: ['Target calorico ≠ TDEE misurato.'],
    primaryPillarId: 'balanced',
  };
}

/**
 * Variante RTDB: array deserializzato come mappa numerica + una entry null.
 * @returns {object}
 */
export function buildFocusSavedEvidenceHarnessAnalysisFirebaseMap() {
  const base = buildFocusSavedEvidenceHarnessAnalysis();
  return {
    ...base,
    evidenceRefs: {
      0: 'kentuEngines.muscleStimulus',
      1: 'kentuEngines.bussola',
      2: 'kentuEngines.cardio',
      3: 'sleep.seriesRecorded',
      4: null,
    },
  };
}
