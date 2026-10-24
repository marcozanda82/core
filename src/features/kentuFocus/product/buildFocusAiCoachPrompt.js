/**
 * Prompt coach narrativo Kentu Focus (tre pilastri).
 * Ispirato alla ricchezza di Focus Metabolico, senza bollettino clinico né score.
 */

export const FOCUS_AI_COACH_MODEL = 'gemini-3.8-flash';

export const FOCUS_AI_COACH_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    integratedComment: { type: 'string' },
    pillarObservations: {
      type: 'object',
      properties: {
        nutrition: { type: 'string' },
        exercise: { type: 'string' },
        sleep: { type: 'string' },
      },
      required: ['nutrition', 'exercise', 'sleep'],
    },
    focusAspects: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 2,
    },
    practicalAction: { type: 'string' },
    primaryPillarId: {
      type: 'string',
      enum: ['nutrition', 'exercise', 'sleep', 'balanced'],
    },
  },
  required: [
    'integratedComment',
    'pillarObservations',
    'focusAspects',
    'practicalAction',
    'primaryPillarId',
  ],
});

/**
 * @returns {string}
 */
export function buildFocusAiCoachSystemInstruction() {
  return [
    'Sei il coach benessere di Kentu Focus.',
    'Scrivi in italiano, tono naturale e concreto, come un coach che ha letto il diario — non come un referto clinico.',
    'I tre pilastri (alimentazione, esercizio, sonno) hanno pari importanza: puoi dare più spazio a quello con evidenze più rilevanti, senza ignorare gli altri.',
    'Usa SOLO i fatti nel dossier JSON. Non inventare alimenti, quantità, allenamenti, ore di sonno, qualità del riposo o nutrienti assenti.',
    'Se un pilastro ha evidenze insufficienti, dillo in modo naturale e breve; non trasformare l’assenza in giudizio negativo o in “inattività”.',
    'Vietato: score 0–100, punteggi salute, diagnosi, carenze diagnosticate, citochine, glicemia misurata, cortisolo, Nrf2, “stato infiammatorio” clinico, causalità certe tra alimenti e sonno o tra allenamento e riposo.',
    'Puoi fare osservazioni prudenti (“vale la pena notare…”) senza presentarle come prove di causa-effetto.',
    'Collega alimenti nominati nel dossier ai contributi nutrizionali solo se il dossier li rende disponibili.',
    'Rispondi SOLO con JSON valido conforme allo schema richiesto. Niente Markdown fuori dal JSON. Niente campi extra tipo dailyScore o longevityScore.',
  ].join(' ');
}

/**
 * @param {object} dossier
 * @returns {string}
 */
export function buildFocusAiCoachUserPrompt(dossier) {
  const periodLabel = dossier?.periodId === 'ieri'
    ? 'Ieri'
    : dossier?.periodId === 'mese'
      ? 'Mese'
      : 'Settimana';

  return [
    `Genera l’analisi coach Kentu Focus per il periodo ${periodLabel}.`,
    `Date: analisi ${dossier.analysisDate} · pubblicazione ${dossier.publicationDate}.`,
    dossier.windowLabel ? `Finestra: ${dossier.windowLabel}.` : '',
    '',
    '[FOCUS_AI_COACH_DOSSIER]',
    JSON.stringify(dossier),
    '[/FOCUS_AI_COACH_DOSSIER]',
    '',
    'Compila questo JSON:',
    '{',
    '  "integratedComment": "2-4 frasi sul quadro complessivo dei tre pilastri",',
    '  "pillarObservations": {',
    '    "nutrition": "1-2 frasi su alimenti/pasti se disponibili, altrimenti limite naturale",',
    '    "exercise": "1-2 frasi su allenamenti registrati o assenza di log (≠ inattività)",',
    '    "sleep": "1-2 frasi su sonno documentato o dato mancante"',
    '  },',
    '  "focusAspects": ["aspetto rilevante 1", "aspetto rilevante 2 opzionale"],',
    '  "practicalAction": "una sola proposta pratica prudente",',
    '  "primaryPillarId": "nutrition" | "exercise" | "sleep" | "balanced"',
    '}',
    '',
    'focusAspects: massimo 2 voci, solo se fondate sul dossier.',
    'Nessuno score. Nessuna diagnosi. Nessuna causalità dimostrata.',
  ].filter(Boolean).join('\n');
}
