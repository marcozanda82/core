/**
 * Fixture P6.6.2 — derivata dal JSON reale `geminiRawResponse.txt`
 * (kentu.focusGeminiPreview.v1). Minimizzata: selection + raw + controllo accettato.
 *
 * Selection: refs/storySpine/Δ allineati al compose attuale. Il clipboard reale
 * non esponeva edition.week.comparison.deltas.avgProteinG in metrics[] pur citando
 * Δ -12.1 nel summarySeed.
 */

export const FOCUS_GEMINI_RAW_SUNDAY_1810_META = Object.freeze({
  "schemaSource": "kentu.focusGeminiPreview.v1",
  "sourceFile": "geminiRawResponse.txt",
  "publicationDate": "2026-10-18",
  "analysisDate": "2026-10-17",
  "model": "gemini-3.8-flash",
  "callCount": 1,
  "historicalValidationErrors": [
    "articles[0]_missing_required_caution",
    "articles[1]_missing_required_caution",
    "articles[2]_missing_required_caution",
    "articles[3]_missing_required_caution"
  ],
  "note": "Derivata dal JSON reale di revisione Gemini; minimizzata."
});

export function buildSunday1810AuthorizedSelection() {
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
    "evidenceQuality": "high",
    "refs": [
      "sleepRoutine.ordinary",
      "sleepRoutine.aggregate.reliability",
      "sleepRoutine.signals",
      "sleepRoutine.ordinary.wake.weekday.median",
      "sleepRoutine.ordinary.regularity.wakeWeekdayIqrH",
      "sleepRoutine.ordinary.wake.deltaWeekendMinusWeekdayH",
      "sleepRoutine.ordinary.duration.deltaWeekendMinusWeekdayH"
    ]
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
      "deficit proteico",
      "peggioramento fisiologico"
    ],
    "evidenceQuality": "high",
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
    }
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
      "evidenceQuality": "high",
      "refs": [
        "day.nutrition.totals.proteinG",
        "day.nutrition.targets.proteinG"
      ]
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
      "evidenceQuality": "high",
      "refs": [
        "history.d30.activity.strengthDaysLogged"
      ]
    }
  ],
  "concerns": [],
  "coach": null,
  "omitted": [],
  "editorialNotes": [],
  "caps": {}
};
}

export function buildSunday1810RejectedRawEdition() {
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
      "title": "Sveglia stabile nei giorni feriali e ritmo differente nel fine settimana",
      "body": "Nel periodo osservato tra metà settembre e metà ottobre, il risveglio nei giorni feriali si è attestato su una mediana di circa {{sleepRoutine.ordinary.wake.weekday.median}} (con una variabilità contenuta di {{sleepRoutine.ordinary.regularity.wakeWeekdayIqrH}} ore). Nel fine settimana l'orario di sveglia registra uno slittamento di {{sleepRoutine.ordinary.wake.deltaWeekendMinusWeekdayH}} ora in avanti, accompagnato da una variazione della durata stimata di circa {{sleepRoutine.ordinary.duration.deltaWeekendMinusWeekdayH}} ore. Si tratta di una fotografia descrittiva delle abitudini ordinarie e non di un indicatore clinico del riposo.",
      "evidenceIds": [
        "sleepRoutine.ordinary",
        "sleepRoutine.aggregate.reliability",
        "sleepRoutine.signals",
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
        "Pattern limitato a notti ordinarie, escludendo orari atipici dai confronti principali",
        "La differenza di durata registrata non equivale a debito o a recupero automatico di sonno",
        "L'orario di coricamento può risultare ambiguo se calcolato retroattivamente",
        "Nessuna diagnosi medica o presunzione di insonnia",
        "I dati non includono risvegli notturni non esplicitamente registrati"
      ],
      "selectionIndex": 0
    },
    {
      "id": "news_week_habits_story",
      "role": "centerpiece",
      "title": "Abitudini settimanali: apporto proteico e quadro delle registrazioni",
      "body": "Nell'arco della settimana conclusa il 17 ottobre, con {{edition.week.nutrition.daysWithFood}} giorni di registrazioni alimentari complete, l'apporto proteico medio si è posizionato a circa {{edition.week.nutrition.avgProteinG}} grammi al giorno. Il confronto con la finestra precedente di pari durata evidenzia uno scostamento verso il basso, monitorato con continuità di tracciamento. Sul fronte del riposo, sono state registrate {{edition.week.sleep.nightsLogged}} notti con una media di {{edition.week.sleep.avgHours}} ore, mentre le sessioni di forza annotate sono state {{edition.week.activity.strengthDaysLogged}}. Le grandezze descrivono la settimana su domini distinti, senza implicare legami causali diretti tra alimentazione, attività e sonno.",
      "evidenceIds": [
        "edition.week.aggregate.nutrition",
        "edition.week.aggregate.sleep",
        "edition.week.aggregate.activity",
        "edition.week.nutrition.daysWithFood",
        "edition.week.nutrition.avgProteinG",
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
        }
      ],
      "cautions": [
        "Il confronto si riferisce a una finestra di eguale durata immediatamente precedente, non a un mese solare",
        "Nessuna correlazione causale stabilita tra i diversi domini registrati",
        "Assenza di diagnosi cliniche o valutazioni sullo stato corporeo",
        "La mancata annotazione di specifiche attività non coincide con inattività fisica"
      ],
      "selectionIndex": 1
    },
    {
      "id": "news_protein_near_target",
      "role": "good",
      "title": "Apporto proteico giornaliero allineato al valore di riferimento",
      "body": "Nella giornata di ieri l'introito proteico registrato ha raggiunto {{day.nutrition.totals.proteinG}} g, a fronte del valore di riferimento impostato a {{day.nutrition.targets.proteinG}} g. L'allineamento descrive la rispondenza al valore memorizzato per la giornata, senza pretese di valutazione metabolica.",
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
        "Non costituisce indicazione di ottimizzazione metabolica o miglioramento fisiologico",
        "Il valore non è valutato in termini di eccesso o carenza clinica"
      ],
      "selectionIndex": 2
    },
    {
      "id": "news_strength_continuity_d30",
      "role": "feature",
      "title": "Quattordici sessioni di forza registrate negli ultimi trenta giorni",
      "body": "Negli ultimi 30 giorni sono presenti {{history.d30.activity.strengthDaysLogged}} giorni con sessioni di forza registrate. L'indicatore riassume unicamente la frequenza delle etichette inserite nel periodo, senza misurare volumi complessivi o altre forme di movimento.",
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
        "Classificazione della forza basata su euristiche dei dati registrati",
        "L'assenza di sessioni aerobiche etichettate non documenta sedentarietà o inattività",
        "Nessun giudizio sull'adeguatezza o sul volume complessivo di allenamento"
      ],
      "selectionIndex": 3
    }
  ],
  "coach": null,
  "mastheadTeaser": "Il punto su ritmo del sonno, tracciamento settimanale dei nutrienti e continuità delle sessioni registrate."
};
}

export function buildSunday1810AcceptedEdition() {
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
      "title": "Sveglia stabile nei giorni feriali, ritmo diverso nel weekend",
      "body": "Nel periodo osservato il risveglio feriale ha mediana circa 6.5 h (IQR 0.5 h). Nel weekend la sveglia si sposta di circa 1 h, con variazione di durata stimata di 0.5 h. Fotografia di abitudini ordinarie, non indicatore clinico del riposo.",
      "evidenceIds": [
        "sleepRoutine.ordinary",
        "sleepRoutine.aggregate.reliability",
        "sleepRoutine.signals",
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
        "Nessuna diagnosi medica o presunzione di insonnia"
      ],
      "selectionIndex": 0
    },
    {
      "id": "news_week_habits_story",
      "role": "centerpiece",
      "title": "Proteine medie in calo di 12.1 g nella settimana",
      "body": "Nel periodo 2026-10-11→2026-10-17 la media proteica è 145.06 g al giorno, in calo di 12.1 g rispetto alla finestra equivalente 2026-10-04→2026-10-10 (non un mese solare precedente). Sette giorni con cibo registrato in ciascuna finestra. Nessuna causalità tra domini senza evidenza dedicata.",
      "evidenceIds": [
        "edition.week.aggregate.nutrition",
        "edition.week.nutrition.avgProteinG",
        "edition.week.comparison.deltas.avgProteinG"
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
        "Il confronto si riferisce a una finestra di eguale durata immediatamente precedente, non a un mese solare",
        "Nessuna correlazione causale stabilita tra i diversi domini registrati"
      ],
      "selectionIndex": 1
    },
    {
      "id": "news_protein_near_target",
      "role": "good",
      "title": "Apporto proteico giornaliero allineato al valore di riferimento",
      "body": "Nella giornata di analisi l'introito proteico registrato ha raggiunto 136.8 g, a fronte del riferimento 127 g, senza pretese di valutazione metabolica.",
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
        "Non costituisce indicazione di ottimizzazione metabolica o miglioramento fisiologico",
        "Il valore non è valutato in termini di eccesso o carenza clinica"
      ],
      "selectionIndex": 2
    },
    {
      "id": "news_strength_continuity_d30",
      "role": "feature",
      "title": "Quattordici giorni con sessioni di forza negli ultimi trenta",
      "body": "Negli ultimi 30 giorni sono presenti 14 giorni con sessioni di forza registrate. L'assenza di sessioni aerobiche etichettate non documenta sedentarietà o inattività.",
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
        "Classificazione della forza basata su euristiche dei dati registrati",
        "L'assenza di sessioni aerobiche etichettate non documenta sedentarietà o inattività",
        "Nessun giudizio sull'adeguatezza o sul volume complessivo di allenamento"
      ],
      "selectionIndex": 3
    }
  ],
  "coach": null,
  "mastheadTeaser": "Il punto su ritmo del sonno, tracciamento settimanale dei nutrienti e continuità delle sessioni registrate."
};
}
