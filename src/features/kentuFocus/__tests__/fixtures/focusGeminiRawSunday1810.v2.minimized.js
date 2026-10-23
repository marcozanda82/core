/**
 * Fixture P6.6.3 — raw reale `geminiRawResponse_20261020.txt`
 * (kentu.focusGeminiPreview.v1, exportedAt 2026-10-20T05:03:11.364Z).
 */

export const FOCUS_GEMINI_RAW_SUNDAY_1810_V2_META = Object.freeze({
  "schemaSource": "kentu.focusGeminiPreview.v1",
  "sourceFile": "geminiRawResponse_20261020.txt",
  "exportedAt": "2026-10-20T05:03:11.364Z",
  "publicationDate": "2026-10-18",
  "analysisDate": "2026-10-17",
  "model": "gemini-3.8-flash",
  "callCount": 1,
  "historicalValidationErrors": [
    "mandatory_context_missing:protein_delta_not_proven_deficit",
    "articles[1]_unauthorized_number_in_prose",
    "metric_unit_mismatch"
  ],
  "note": "Raw reale 20/10/2026 05:03Z — minimizzato (no essentialEvidence duplicato)."
});

export function buildSunday1810V2AuthorizedSelection() {
  return {
  "schemaVersion": "1.0.0",
  "analysisDate": "2026-10-17",
  "publicationDate": "2026-10-18",
  "editionKind": "sunday_plus",
  "openingMode": "progress",
  "lead": {
    "id": "news_sleep_weekly_rhythm",
    "role": "lead",
    "tone": "neutral",
    "claimType": "calculated",
    "domain": "sleep",
    "topicId": "sleep_weekly_rhythm",
    "editorialScale": "episode",
    "storyKind": null,
    "headlineSeed": "Sveglia precisa in settimana, ritmo diverso nel weekend",
    "summarySeed": "sveglia feriale stabile intorno alle 6:30; nel weekend la sveglia si sposta di circa 1 h (più tardi). Osservazione sulle abitudini, non un giudizio sulla qualità del recupero.",
    "evidenceFingerprint": "S|W1|-|-|-|A0",
    "observedPeriod": {
      "from": "2026-09-19",
      "to": "2026-10-18",
      "windowDays": 30
    },
    "metrics": [
      {
        "path": "sleepRoutine.ordinary.wake.weekday.median",
        "value": 6.5,
        "unit": "hour_decimal",
        "provenance": "calculated"
      },
      {
        "path": "sleepRoutine.ordinary.regularity.wakeWeekdayIqrH",
        "value": 0.5,
        "unit": "h",
        "provenance": "calculated"
      },
      {
        "path": "sleepRoutine.ordinary.wake.deltaWeekendMinusWeekdayH",
        "value": 1,
        "unit": "h",
        "provenance": "calculated"
      },
      {
        "path": "sleepRoutine.ordinary.duration.deltaWeekendMinusWeekdayH",
        "value": 0.5,
        "unit": "h",
        "provenance": "calculated"
      }
    ],
    "limitations": [
      "Pattern su notti ordinary; orari atipici conservati ma esclusi dai confronti forti",
      "Differenza di durata ≠ debito o recupero di sonno",
      "Bedtime spesso ambiguo se persistito come wake−duration"
    ],
    "doNotClaim": [
      "debito di sonno",
      "recupero weekend automatico",
      "insonnia",
      "diagnosi",
      "risvegli notturni non registrati"
    ],
    "refs": [
      "sleepRoutine.ordinary",
      "sleepRoutine.aggregate.reliability",
      "sleepRoutine.signals",
      "sleepRoutine.ordinary.wake.weekday.median",
      "sleepRoutine.ordinary.regularity.wakeWeekdayIqrH",
      "sleepRoutine.ordinary.wake.deltaWeekendMinusWeekdayH",
      "sleepRoutine.ordinary.duration.deltaWeekendMinusWeekdayH"
    ],
    "evidenceQuality": "high"
  },
  "centerpiece": {
    "id": "news_week_habits_story",
    "role": "centerpiece",
    "tone": "neutral",
    "claimType": "calculated",
    "domain": "nutrition",
    "topicId": "week_habits_story",
    "editorialScale": "week_interpretation",
    "storyKind": "significant_change",
    "headlineSeed": "Proteine medie in calo nella settimana",
    "summarySeed": "Media proteine ≈145.06 nel periodo 2026-10-11→2026-10-17 (Δ -12.1 vs 2026-10-04→2026-10-10) su 7 giorni con cibo. Riferimento: finestra equivalente precedente 2026-10-04→2026-10-10. Perché può interessare: Lo scostamento è abbastanza ampio e la copertura alimentare è allineata fra le finestre. Limiti: Non implica causalità né conclusioni fisiologiche.",
    "evidenceFingerprint": "week|2026-10-11|2026-10-17|protein_intake_shift|food7|sleep6|str3|cmp-12.1",
    "observedPeriod": {
      "from": "2026-10-11",
      "to": "2026-10-17",
      "sleepWakeFrom": "2026-10-11",
      "sleepWakeTo": "2026-10-17"
    },
    "metrics": [
      {
        "path": "edition.week.nutrition.daysWithFood",
        "value": 7,
        "unit": "days",
        "provenance": "calculated"
      },
      {
        "path": "edition.week.nutrition.avgProteinG",
        "value": 145.06,
        "unit": "g",
        "provenance": "calculated"
      },
      {
        "path": "edition.week.sleep.nightsLogged",
        "value": 6,
        "unit": "nights",
        "provenance": "calculated"
      },
      {
        "path": "edition.week.sleep.avgHours",
        "value": 6.95,
        "unit": "h",
        "provenance": "calculated"
      },
      {
        "path": "edition.week.activity.strengthDaysLogged",
        "value": 3,
        "unit": "days",
        "provenance": "calculated"
      },
      {
        "path": "edition.week.comparison.deltas.avgProteinG",
        "value": -12.1,
        "unit": "g",
        "provenance": "calculated"
      }
    ],
    "limitations": [
      "Giorno senza log ≠ comportamento assente",
      "Nodo presente ≠ osservazione registrata",
      "Data futura ≠ giornata osservata",
      "Assenza aerobica etichettata ≠ inattività fisica",
      "Niente conclusioni corporee da misure fuori finestra",
      "Fibre: non giudicare se fonte inattendibile",
      "Non è un mese solare precedente: finestra di eguale lunghezza immediatamente precedente. Differenze di conteggio possono riflettere copertura diversa, non solo comportamento.",
      "Nessuna causalità tra domini senza evidenza dedicata",
      "Lo scostamento proteico non è un deficit dimostrato"
    ],
    "doNotClaim": [
      "correlazione causale inventata",
      "diagnosi",
      "inattività da assenza di log",
      "conclusione corporea da misure vecchie",
      "consiglio proteico automatico",
      "deficit proteico",
      "peggioramento fisiologico"
    ],
    "refs": [
      "edition.week.aggregate.nutrition",
      "edition.week.aggregate.sleep",
      "edition.week.aggregate.activity",
      "edition.week.nutrition.daysWithFood",
      "edition.week.nutrition.avgProteinG",
      "edition.week.sleep.nightsLogged",
      "edition.week.sleep.avgHours",
      "edition.week.activity.strengthDaysLogged",
      "edition.week.comparison.deltas.avgProteinG"
    ],
    "storySpine": {
      "mainFactId": "week_protein_intake_shift",
      "mainMetricPath": "edition.week.comparison.deltas.avgProteinG",
      "mainMetricValue": -12.1,
      "mainUnit": "g",
      "periodFrom": "2026-10-11",
      "periodTo": "2026-10-17",
      "comparisonFrom": "2026-10-04",
      "comparisonTo": "2026-10-10",
      "levelMetricPath": "edition.week.nutrition.avgProteinG",
      "levelMetricValue": 145.06,
      "levelUnit": "g",
      "coverageMetricPath": "edition.week.nutrition.daysWithFood",
      "coverageMetricValue": 7,
      "coverageUnit": "days",
      "essentialContextIds": [
        "equal_length_window_not_calendar_month"
      ]
    },
    "evidenceQuality": "high"
  },
  "goodNews": [
    {
      "id": "news_protein_near_target",
      "role": "good",
      "tone": "neutral",
      "claimType": "calculated",
      "domain": "nutrition",
      "topicId": "protein_near_target",
      "editorialScale": "episode",
      "storyKind": null,
      "headlineSeed": "Proteine in linea con il riferimento registrato",
      "summarySeed": "Ieri circa 136.8 g di proteine su riferimento 127 g (rapporto 108%); fonte targets.targetHistory, valido al 2026-10-02.",
      "evidenceFingerprint": null,
      "observedPeriod": null,
      "metrics": [
        {
          "path": "day.nutrition.totals.proteinG",
          "value": 136.8,
          "unit": "g",
          "provenance": "calculated"
        },
        {
          "path": "day.nutrition.targets.proteinG",
          "value": 127,
          "unit": "g",
          "provenance": "recorded"
        }
      ],
      "limitations": [],
      "doNotClaim": [
        "ottimizzazione metabolica",
        "miglioramento fisiologico",
        "eccesso proteico problematico"
      ],
      "refs": [
        "day.nutrition.totals.proteinG",
        "day.nutrition.targets.proteinG"
      ],
      "evidenceQuality": "high"
    }
  ],
  "features": [
    {
      "id": "news_strength_continuity_d30",
      "role": "feature",
      "tone": "neutral",
      "claimType": "calculated",
      "domain": "activity",
      "topicId": "strength_continuity_d30",
      "editorialScale": "episode",
      "storyKind": null,
      "headlineSeed": "Continuità della forza negli ultimi 30 giorni",
      "summarySeed": "14 giorni con sessioni di forza registrate nella finestra d30. L’assenza di minuti aerobici etichettati non implica inattività fisica.",
      "evidenceFingerprint": null,
      "observedPeriod": null,
      "metrics": [
        {
          "path": "history.d30.activity.strengthDaysLogged",
          "value": 14,
          "unit": "days",
          "provenance": "calculated"
        }
      ],
      "limitations": [
        "Classificazione strength euristica sui label",
        "Assenza aerobica documentata ≠ sedentarietà"
      ],
      "doNotClaim": [
        "inattività fisica",
        "sedentarietà",
        "volume insufficiente"
      ],
      "refs": [
        "history.d30.activity.strengthDaysLogged"
      ],
      "evidenceQuality": "high"
    }
  ],
  "concerns": [],
  "coach": null,
  "omitted": [],
  "editorialNotes": [],
  "caps": {}
};
}

export function buildSunday1810V2RejectedRawEdition() {
  return {
  "schemaVersion": "1.0.0",
  "kind": "FocusWrittenEdition",
  "analysisDate": "2026-10-17",
  "publicationDate": "2026-10-18",
  "openingMode": "progress",
  "articles": [
    {
      "id": "news_sleep_weekly_rhythm",
      "role": "lead",
      "title": "Sveglia regolare nei giorni feriali e orari più distesi nel fine settimana",
      "body": "Nelle quattro settimane osservate tra il 19 settembre e il 18 ottobre, la routine del risveglio mostra una netta differenziazione tra i giorni lavorativi e il fine settimana. Dal lunedì al venerdì l'orario mediano della sveglia si attesta sulle 6:30, con una variabilità contenuta entro una dispersione di circa 0,5 ore. Nel fine settimana, invece, il risveglio tende a posticiparsi di circa 1 ora, accompagnato da un incremento della durata del sonno stimabile in circa 0,5 ore. Questa variazione descrive una transizione d'orario abituale tra i ritmi lavorativi e il riposo del weekend, senza costituire un indicatore clinico né una prova automatica di recupero o debito pregresso.",
      "evidenceIds": [
        "sleepRoutine.ordinary.wake.weekday.median",
        "sleepRoutine.ordinary.regularity.wakeWeekdayIqrH",
        "sleepRoutine.ordinary.wake.deltaWeekendMinusWeekdayH",
        "sleepRoutine.ordinary.duration.deltaWeekendMinusWeekdayH"
      ],
      "metricsCited": [
        {
          "path": "sleepRoutine.ordinary.wake.weekday.median",
          "value": 6.5,
          "unit": "hour_decimal",
          "provenance": "calculated"
        },
        {
          "path": "sleepRoutine.ordinary.regularity.wakeWeekdayIqrH",
          "value": 0.5,
          "unit": "h",
          "provenance": "calculated"
        },
        {
          "path": "sleepRoutine.ordinary.wake.deltaWeekendMinusWeekdayH",
          "value": 1,
          "unit": "h",
          "provenance": "calculated"
        },
        {
          "path": "sleepRoutine.ordinary.duration.deltaWeekendMinusWeekdayH",
          "value": 0.5,
          "unit": "h",
          "provenance": "calculated"
        }
      ],
      "cautions": [
        "Differenza di durata non equivale a debito o recupero di sonno",
        "Nessuna diagnosi o inferenza clinica"
      ],
      "selectionIndex": 0
    },
    {
      "id": "news_week_habits_story",
      "role": "centerpiece",
      "title": "Apporto proteico medio in flessione nella settimana appena conclusa",
      "body": "Nel corso della settimana dall'11 al 17 ottobre, la media giornaliera delle proteine registrate si è attestata a 145,06 g su 7 giorni di tracciamento alimentare completo. Il confronto con la finestra immediatamente precedente di pari durata (4-10 ottobre) evidenzia una riduzione media di 12,1 g al giorno. Il confronto fa riferimento a una finestra temporale equivalente contigua e non a un intero mese di calendario. Nella stessa settimana sono state conteggiate 6 notti di sonno registrate, con una media di 6,95 ore per notte, e 3 giornate con allenamenti di forza annotati. La rilevazione del calo proteico rappresenta una misurazione descrittiva rispetto ai sette giorni precedenti e non definisce un deficit nutrizionale, così come la compresenza di dati tra riposo, alimentazione e allenamento non presuppone legami di causa ed effetto tra i diversi ambiti.",
      "evidenceIds": [
        "edition.week.nutrition.avgProteinG",
        "edition.week.comparison.deltas.avgProteinG",
        "edition.week.nutrition.daysWithFood",
        "edition.week.sleep.nightsLogged",
        "edition.week.sleep.avgHours",
        "edition.week.activity.strengthDaysLogged"
      ],
      "metricsCited": [
        {
          "path": "edition.week.nutrition.daysWithFood",
          "value": 7,
          "unit": "days",
          "provenance": "calculated"
        },
        {
          "path": "edition.week.nutrition.avgProteinG",
          "value": 145.06,
          "unit": "g",
          "provenance": "calculated"
        },
        {
          "path": "edition.week.sleep.nightsLogged",
          "value": 6,
          "unit": "nights",
          "provenance": "calculated"
        },
        {
          "path": "edition.week.sleep.avgHours",
          "value": 6.95,
          "unit": "h",
          "provenance": "calculated"
        },
        {
          "path": "edition.week.activity.strengthDaysLogged",
          "value": 3,
          "unit": "days",
          "provenance": "calculated"
        },
        {
          "path": "edition.week.comparison.deltas.avgProteinG",
          "value": -12.1,
          "unit": "g",
          "provenance": "calculated"
        }
      ],
      "cautions": [
        "Non è un mese solare precedente: finestra di eguale lunghezza immediatamente precedente",
        "Nessuna causalità tra domini senza evidenza dedicata",
        "Lo scostamento proteico non costituisce deficit clinico o peggioramento fisiologico"
      ],
      "selectionIndex": 1
    },
    {
      "id": "news_protein_near_target",
      "role": "good",
      "title": "Proteine giornaliere in linea con il valore di riferimento",
      "body": "Nella giornata di ieri l'introito proteico registrato ha raggiunto 136,8 g, a fronte del valore di riferimento impostato pari a 127 g. L'apporto si posiziona così a circa il 108% dell'obiettivo registrato, confermando una quota allineata alle indicazioni storiche del profilo senza implicare particolari alterazioni o valutazioni di carattere metabolico.",
      "evidenceIds": [
        "day.nutrition.totals.proteinG",
        "day.nutrition.targets.proteinG"
      ],
      "metricsCited": [
        {
          "path": "day.nutrition.totals.proteinG",
          "value": 136.8,
          "unit": "g",
          "provenance": "calculated"
        },
        {
          "path": "day.nutrition.targets.proteinG",
          "value": 127,
          "unit": "g",
          "provenance": "recorded"
        }
      ],
      "cautions": [
        "Nessuna affermazione di ottimizzazione metabolica o variazione fisiologica"
      ],
      "selectionIndex": 2
    },
    {
      "id": "news_strength_continuity_d30",
      "role": "feature",
      "title": "Quattordici sessioni di forza registrate nell'arco di trenta giorni",
      "body": "Negli ultimi 30 giorni sono state registrate 14 giornate con sessioni dedicate alla forza. La continuità delle registrazioni riflette una frequenza costante nel periodo osservato; l'eventuale assenza di minuti dedicati ad attività aerobiche codificate indica unicamente la mancanza di specifiche etichette a registro, senza costituire un elemento di inattività o sedentarietà generale.",
      "evidenceIds": [
        "history.d30.activity.strengthDaysLogged"
      ],
      "metricsCited": [
        {
          "path": "history.d30.activity.strengthDaysLogged",
          "value": 14,
          "unit": "days",
          "provenance": "calculated"
        }
      ],
      "cautions": [
        "Classificazione strength euristica sui label",
        "Assenza aerobica documentata non equivale a inattività fisica o sedentarietà"
      ],
      "selectionIndex": 3
    }
  ],
  "coach": null,
  "mastheadTeaser": "I ritmi del sonno tra settimana e weekend, l'apporto proteico settimanale e la continuità delle sessioni di forza."
};
}
