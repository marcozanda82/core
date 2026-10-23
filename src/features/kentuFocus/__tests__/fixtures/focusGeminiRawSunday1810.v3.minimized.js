/**
 * Fixture P6.6.4 — terza prova Gemini domenicale 18/10
 * (export citato 2026-10-20T05:23:04; errore storico unico: unauthorized 145).
 *
 * Selection identica a v2. Corpo/titolo centerpiece allineati al raw reale descritto;
 * feature senza «sessioni» nel titolo (nel run 05:23 restava solo l’errore sul 145).
 */

import { buildSunday1810V2AuthorizedSelection } from './focusGeminiRawSunday1810.v2.minimized.js';

export const FOCUS_GEMINI_RAW_SUNDAY_1810_V3_META = Object.freeze({
  schemaSource: 'kentu.focusGeminiPreview.v1',
  sourceFile: 'geminiRawResponse_20261020_052304.txt',
  exportedAt: '2026-10-20T05:23:04.000Z',
  publicationDate: '2026-10-18',
  analysisDate: '2026-10-17',
  historicalValidationErrors: ['articles[1]_unauthorized_number_in_prose:145'],
  note:
    'Token 145 dal titolo «… a 145 grammi …»; 145,06 nel corpo è un unico token già allowlistato. '
    + '145 = Math.round(145.06). Clipboard originale assente in repo → fixture da citazione + selection v2.',
});

export function buildSunday1810V3AuthorizedSelection() {
  return buildSunday1810V2AuthorizedSelection();
}

/** Edizione come respinta pre-P6.6.4 (solo unauthorized 145 sul centerpiece). */
export function buildSunday1810V3RejectedRawEdition() {
  return {
    schemaVersion: '1.0.0',
    kind: 'FocusWrittenEdition',
    analysisDate: '2026-10-17',
    publicationDate: '2026-10-18',
    openingMode: 'progress',
    mastheadTeaser:
      'I ritmi del sonno tra settimana e weekend, l\'apporto proteico settimanale e la continuità delle giornate di forza.',
    coach: null,
    articles: [
      {
        id: 'news_sleep_weekly_rhythm',
        role: 'lead',
        title: 'Sveglia regolare nei giorni feriali e orari più distesi nel fine settimana',
        body:
          'Nelle quattro settimane osservate tra il 19 settembre e il 18 ottobre, la routine del risveglio mostra una netta differenziazione tra i giorni lavorativi e il fine settimana. Dal lunedì al venerdì l\'orario mediano della sveglia si attesta sulle 6:30, con una variabilità contenuta entro una dispersione di circa 0,5 ore. Nel fine settimana, invece, il risveglio tende a posticiparsi di circa 1 ora, accompagnato da un incremento della durata del sonno stimabile in circa 0,5 ore. Questa variazione descrive una transizione d\'orario abituale tra i ritmi lavorativi e il riposo del weekend, senza costituire un indicatore clinico né una prova automatica di recupero o debito pregresso.',
        evidenceIds: [
          'sleepRoutine.ordinary.wake.weekday.median',
          'sleepRoutine.ordinary.regularity.wakeWeekdayIqrH',
          'sleepRoutine.ordinary.wake.deltaWeekendMinusWeekdayH',
          'sleepRoutine.ordinary.duration.deltaWeekendMinusWeekdayH',
        ],
        metricsCited: [
          {
            path: 'sleepRoutine.ordinary.wake.weekday.median',
            value: 6.5,
            unit: 'hour_decimal',
            provenance: 'calculated',
          },
          {
            path: 'sleepRoutine.ordinary.regularity.wakeWeekdayIqrH',
            value: 0.5,
            unit: 'h',
            provenance: 'calculated',
          },
          {
            path: 'sleepRoutine.ordinary.wake.deltaWeekendMinusWeekdayH',
            value: 1,
            unit: 'h',
            provenance: 'calculated',
          },
          {
            path: 'sleepRoutine.ordinary.duration.deltaWeekendMinusWeekdayH',
            value: 0.5,
            unit: 'h',
            provenance: 'calculated',
          },
        ],
        cautions: [
          'Differenza di durata non equivale a debito o recupero di sonno',
          'Nessuna diagnosi o inferenza clinica',
        ],
        selectionIndex: 0,
      },
      {
        id: 'news_week_habits_story',
        role: 'centerpiece',
        title:
          'Apporto proteico medio settimanale a 145 grammi, in diminuzione rispetto alla finestra precedente',
        body:
          'Nel periodo 11–17 ottobre la media proteica registrata è 145,06 g/giorno, in variazione di −12,1 g/giorno rispetto alla finestra equivalente 4–10 ottobre. Il confronto usa una finestra di eguale lunghezza immediatamente precedente, non un mese solare. La rilevazione descrive lo scostamento osservato e non definisce un deficit nutrizionale né conseguenze fisiologiche. Nessuna causalità tra domini senza evidenza dedicata.',
        evidenceIds: [
          'edition.week.nutrition.avgProteinG',
          'edition.week.comparison.deltas.avgProteinG',
          'edition.week.nutrition.daysWithFood',
        ],
        metricsCited: [
          {
            path: 'edition.week.nutrition.avgProteinG',
            value: 145.06,
            unit: 'g',
            provenance: 'calculated',
          },
          {
            path: 'edition.week.comparison.deltas.avgProteinG',
            value: -12.1,
            unit: 'g',
            provenance: 'calculated',
          },
          {
            path: 'edition.week.nutrition.daysWithFood',
            value: 7,
            unit: 'days',
            provenance: 'calculated',
          },
        ],
        cautions: [
          'Non è un mese solare precedente: finestra di eguale lunghezza immediatamente precedente',
          'Nessuna causalità tra domini senza evidenza dedicata',
          'Lo scostamento proteico non costituisce deficit clinico o peggioramento fisiologico',
        ],
        selectionIndex: 1,
      },
      {
        id: 'news_protein_near_target',
        role: 'good',
        title: 'Proteine giornaliere in linea con il valore di riferimento',
        body:
          'Nella giornata di ieri l\'introito proteico registrato ha raggiunto 136,8 g, a fronte del valore di riferimento impostato pari a 127 g. L\'apporto si posiziona così a circa il 108% dell\'obiettivo registrato, confermando una quota allineata alle indicazioni storiche del profilo senza implicare particolari alterazioni o valutazioni di carattere metabolico.',
        evidenceIds: [
          'day.nutrition.totals.proteinG',
          'day.nutrition.targets.proteinG',
        ],
        metricsCited: [
          {
            path: 'day.nutrition.totals.proteinG',
            value: 136.8,
            unit: 'g',
            provenance: 'calculated',
          },
          {
            path: 'day.nutrition.targets.proteinG',
            value: 127,
            unit: 'g',
            provenance: 'recorded',
          },
        ],
        cautions: [
          'Nessuna affermazione di ottimizzazione metabolica o variazione fisiologica',
        ],
        selectionIndex: 2,
      },
      {
        id: 'news_strength_continuity_d30',
        role: 'feature',
        title: 'Quattordici giornate con forza registrate nell\'arco di trenta giorni',
        body:
          'Negli ultimi 30 giorni sono state registrate 14 giornate con sessioni dedicate alla forza. Il conteggio totale non dimostra da solo una distribuzione uniforme né un aumento della forma fisica. L\'eventuale assenza di minuti aerobici codificati indica unicamente la mancanza di etichette a registro, senza costituire inattività generale.',
        evidenceIds: ['history.d30.activity.strengthDaysLogged'],
        metricsCited: [
          {
            path: 'history.d30.activity.strengthDaysLogged',
            value: 14,
            unit: 'days',
            provenance: 'calculated',
          },
        ],
        cautions: [
          'Classificazione strength euristica sui label',
          'Assenza aerobica documentata non equivale a inattività fisica o sedentarietà',
        ],
        selectionIndex: 3,
      },
    ],
  };
}
