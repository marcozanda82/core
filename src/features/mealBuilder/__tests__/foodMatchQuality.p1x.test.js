/**
 * P1X — Ranking exact > prefix > contains; piatti composti non battono alimento base.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyFoodMatchQuality,
  decideFoodMatchResolution,
  findExactFoodMatchesInCatalog,
  findStrongFoodMatchesInCatalog,
  hasImplausibleEnergyDensityGap,
  isStrongFoodMatchQuality,
  sortCandidatesByMatchQuality,
} from '../utils/foodMatchQuality.js';
/**
 * Cascata allineata a foodResolver.tryExactDbMatchFastPath / fastPathMealResolve
 * (senza import Vite extensionless).
 */
function chatTextStrongResolve(query, { personalDb, kentuItDb }) {
  const layers = [
    { db: personalDb, source: 'personal' },
    { db: kentuItDb, source: 'kentu_it' },
  ];
  for (const layer of layers) {
    const hits = findStrongFoodMatchesInCatalog(query, layer.db, { limit: 1 });
    if (hits[0]) {
      return {
        foodName: hits[0].name,
        foodDbKey: hits[0].fdcId,
        matchQuality: hits[0].matchQuality,
        source: layer.source,
      };
    }
  }
  return null;
}

/**
 * Merge L1 come pushFastHits: strong personali + strong Kentu, poi rank qualità.
 */
function level1StrongMerge(query, personalDb, kentuItDb) {
  const pool = [
    ...findStrongFoodMatchesInCatalog(query, personalDb, { limit: 12 }).map((h) => ({
      name: h.name,
      matchQuality: h.matchQuality,
      source: 'personal',
      confidenceScore: h.matchQuality === 'exact' ? 1 : 0.94,
      fdcId: h.fdcId,
      row: h.row,
    })),
    ...findStrongFoodMatchesInCatalog(query, kentuItDb, { limit: 12 }).map((h) => ({
      name: h.name,
      matchQuality: h.matchQuality,
      source: 'kentu',
      confidenceScore: h.matchQuality === 'exact' ? 1 : 0.94,
      fdcId: h.fdcId,
      row: h.row,
    })),
  ];
  // contains personali (rumore tipico) — non devono battere strong
  for (const [id, row] of Object.entries(personalDb || {})) {
    const name = String(row.desc || row.name || '').trim();
    if (!name) continue;
    const mq = classifyFoodMatchQuality(name, query);
    if (mq === 'exact' || mq === 'prefix') continue;
    pool.push({
      name,
      matchQuality: mq,
      source: 'personal',
      confidenceScore: 0.72,
      fdcId: id,
      row,
      usageCount: 20,
    });
  }
  return sortCandidatesByMatchQuality(pool);
}

function cand(name, extras = {}) {
  return {
    name,
    confidenceScore: extras.confidenceScore ?? 0.9,
    source: extras.source || 'personal',
    matchQuality: extras.matchQuality || classifyFoodMatchQuality(name, extras.query || ''),
    usageCount: extras.usageCount || 0,
    row: extras.row || { desc: name, kcal: extras.kcal ?? 100 },
  };
}

describe('foodMatchQuality classify P1X', () => {
  it('spinaci: exact Spinaci > prefix Spinaci crudi > contains ravioli', () => {
    assert.equal(classifyFoodMatchQuality('Spinaci', 'spinaci'), 'exact');
    assert.equal(classifyFoodMatchQuality('Spinaci crudi', 'spinaci'), 'prefix');
    assert.equal(classifyFoodMatchQuality('Ravioli di ricotta e spinaci', 'spinaci'), 'contains');
    assert.equal(classifyFoodMatchQuality('Spinaci surgelati', 'spinaci'), 'prefix');
  });

  it('casi regressione ingredienti vs base', () => {
    assert.equal(classifyFoodMatchQuality('Pomodoro', 'pomodoro'), 'exact');
    assert.equal(classifyFoodMatchQuality('Pasta al pomodoro', 'pomodoro'), 'contains');
    assert.equal(classifyFoodMatchQuality('Mela', 'mela'), 'exact');
    assert.equal(classifyFoodMatchQuality('Torta di mele', 'mela'), 'contains');
    assert.equal(classifyFoodMatchQuality('Latte', 'latte'), 'exact');
    assert.equal(classifyFoodMatchQuality('Caffellatte', 'latte'), 'contains');
    assert.equal(classifyFoodMatchQuality('Riso', 'riso'), 'exact');
    // risotto inizia con "riso" ma non è prima parola separata → contains/fuzzy, non prefix
    assert.notEqual(classifyFoodMatchQuality('Risotto', 'riso'), 'exact');
    assert.notEqual(classifyFoodMatchQuality('Risotto', 'riso'), 'prefix');
  });
});

describe('foodMatchQuality ranking + decide P1X', () => {
  const cases = [
    {
      query: 'spinaci',
      compound: 'Ravioli di ricotta e spinaci',
      simple: 'Spinaci',
      compoundKcal: 214,
      simpleKcal: 23,
    },
    {
      query: 'pomodoro',
      compound: 'Pasta al pomodoro',
      simple: 'Pomodoro',
      compoundKcal: 150,
      simpleKcal: 18,
    },
    {
      query: 'mela',
      compound: 'Torta di mele',
      simple: 'Mela',
      compoundKcal: 280,
      simpleKcal: 52,
    },
    {
      query: 'latte',
      compound: 'Caffellatte',
      simple: 'Latte',
      compoundKcal: 60,
      simpleKcal: 46,
    },
    {
      query: 'riso',
      compound: 'Risotto allo zafferano',
      simple: 'Riso',
      compoundKcal: 160,
      simpleKcal: 130,
    },
  ];

  for (const tc of cases) {
    it(`"${tc.query}" → ${tc.simple} batte ${tc.compound} (anche se recente)`, () => {
      const compound = cand(tc.compound, {
        query: tc.query,
        confidenceScore: 0.96,
        source: 'personal',
        usageCount: 20,
        kcal: tc.compoundKcal,
      });
      const simple = cand(tc.simple, {
        query: tc.query,
        confidenceScore: 0.85,
        source: 'kentu',
        usageCount: 0,
        kcal: tc.simpleKcal,
      });

      assert.equal(compound.matchQuality, 'contains');
      assert.ok(isStrongFoodMatchQuality(simple.matchQuality));

      const ranked = sortCandidatesByMatchQuality([compound, simple]);
      assert.equal(ranked[0].name, tc.simple);

      const decision = decideFoodMatchResolution(ranked, { autoAcceptThreshold: 0.8 });
      assert.equal(decision.needsDisambiguation, false);
      assert.equal(decision.match?.name, tc.simple);
      assert.ok(isStrongFoodMatchQuality(decision.matchQuality));
    });
  }

  it('solo contains (ravioli nei recenti, niente Spinaci) → chiede conferma, non auto', () => {
    const onlyCompound = cand('Ravioli di ricotta e spinaci', {
      query: 'spinaci',
      confidenceScore: 0.96,
      source: 'personal',
      usageCount: 12,
      kcal: 214,
    });
    const ranked = sortCandidatesByMatchQuality([onlyCompound]);
    const decision = decideFoodMatchResolution(ranked, { autoAcceptThreshold: 0.8 });
    assert.equal(decision.needsDisambiguation, true);
    assert.equal(decision.reason, 'weak_match_quality');
    assert.equal(decision.match, null);
  });

  it('densità energetica >3× tra candidato e match exact', () => {
    const compound = cand('Ravioli di ricotta e spinaci', {
      query: 'spinaci',
      confidenceScore: 0.96,
      kcal: 214,
    });
    const simple = cand('Spinaci', { query: 'spinaci', confidenceScore: 0.9, kcal: 23 });
    assert.equal(hasImplausibleEnergyDensityGap(compound, simple), true);
    assert.equal(hasImplausibleEnergyDensityGap(simple, simple), false);
  });

  it('close race tra due prefix → disambiguazione', () => {
    const a = cand('Spinaci crudi', { query: 'spinaci', confidenceScore: 0.94, source: 'kentu' });
    const b = cand('Spinaci surgelati', { query: 'spinaci', confidenceScore: 0.93, source: 'off' });
    const ranked = sortCandidatesByMatchQuality([a, b]);
    const decision = decideFoodMatchResolution(ranked, { autoAcceptThreshold: 0.8 });
    assert.equal(decision.needsDisambiguation, true);
    assert.ok(['close_race', 'weak_match_quality'].includes(decision.reason) || decision.needsDisambiguation);
  });
});

function buildPersonalSpinaciNoise(count = 50) {
  /** @type {Record<string, object>} */
  const personal = {};
  for (let i = 0; i < count; i += 1) {
    personal[`noise_${i}`] = {
      id: `noise_${i}`,
      fdcId: `noise_${i}`,
      desc: `Ravioli di ricotta e spinaci #${i}`,
      name: `Ravioli di ricotta e spinaci #${i}`,
      kcal: 214,
    };
  }
  return personal;
}

describe('CREA exact/prefix sempre trovato (scan intero + italianName)', () => {
  it('exact letterale in fondo al catalogo non è perso da cap/early-exit', () => {
    /** @type {Record<string, object>} */
    const db = {};
    for (let i = 0; i < 60; i += 1) {
      db[`pad_${i}`] = {
        id: `pad_${i}`,
        desc: `Ravioli con spinaci pad ${i}`,
        kcal: 200,
      };
    }
    db.crea_exact = {
      id: 'crea_exact',
      fdcId: 'crea_exact',
      desc: 'Spinaci',
      kcal: 23,
    };
    const exact = findExactFoodMatchesInCatalog('spinaci', db, { limit: 5 });
    assert.ok(exact.some((h) => h.fdcId === 'crea_exact'));
    assert.equal(exact[0].matchQuality, 'exact');
  });

  it('"spinaci" trova CREA italianName "Spinaci, crudi" anche con 50 personali contains', () => {
    const personal = buildPersonalSpinaciNoise(50);
    const kentu = {
      '213': {
        id: '213',
        fdcId: '213',
        // CREA grezzo: niente desc, solo italianName (bug storico dello scan).
        italianName: 'Spinaci, crudi',
        name: 'Spinach, fresh, raw',
        kcal: 35,
      },
    };

    const strong = findStrongFoodMatchesInCatalog('spinaci', { ...personal, ...kentu }, { limit: 12 });
    assert.ok(
      strong.some((h) => String(h.name).toLowerCase().includes('spinaci')
        && (h.matchQuality === 'exact' || h.matchQuality === 'prefix')),
      'atteso strong CREA Spinaci',
    );
    assert.ok(
      strong.some((h) => h.fdcId === '213' || /spinaci,\s*crudi/i.test(h.name)),
      'atteso hit id 213 / Spinaci, crudi',
    );
    assert.ok(
      !strong.every((h) => /ravioli/i.test(h.name)),
      'i contains ravioli non devono monopolizzare i strong',
    );
  });

  it('L1: 50 personali contains + CREA Spinaci → top è strong CREA', () => {
    const personalDb = buildPersonalSpinaciNoise(50);
    const kentuItDb = {
      '213': {
        id: '213',
        fdcId: '213',
        italianName: 'Spinaci, crudi',
        name: 'Spinach, fresh, raw',
        kcal: 35,
      },
    };
    const ranked = level1StrongMerge('spinaci', personalDb, kentuItDb);
    assert.ok(ranked.length > 0);
    assert.ok(isStrongFoodMatchQuality(ranked[0].matchQuality));
    assert.match(String(ranked[0].name), /spinaci/i);
    assert.doesNotMatch(String(ranked[0].name), /ravioli/i);
    assert.equal(String(ranked[0].fdcId), '213');
  });
});

/**
 * Coerenza percorsi (file regola):
 * - Wizard McDrive → multiDbFoodResolver.js (decideFoodMatchResolution) + mcdriveWizard.js
 * - Chat testo → foodResolver.js (tryExactDbMatchFastPath / findStrong…) + chatNewFoodPipeline.js
 * - Voce / Fast-Path → fastPathMealResolve.js (findStrongFoodMatchesInCatalog)
 * - Sequential wizard → sequentialFoodWizard.js (classifyFoodMatchQuality)
 * - Preferenze utente → userFoodPreferenceContext.js (solo strong)
 * - Inbox/bozze commit → canonicalMealCommit.js (sourceText/matchQuality) + CommandTerminalController.js
 * - Ricerca manuale FastMealLogger → useUniversalSearchEngine.js (mergeAndRank + strong inject)
 */
describe('Percorsi inserimento: chat testo + ricerca manuale', () => {
  it('chat testo: cascata strong (come tryExactDbMatchFastPath) preferisce CREA vs 50 contains', () => {
    const personalDb = buildPersonalSpinaciNoise(50);
    const kentuItDb = {
      '213': {
        id: '213',
        fdcId: '213',
        italianName: 'Spinaci, crudi',
        name: 'Spinach, fresh, raw',
        kcal: 35,
      },
    };
    const hit = chatTextStrongResolve('spinaci', { personalDb, kentuItDb });
    assert.ok(hit);
    assert.ok(isStrongFoodMatchQuality(hit.matchQuality));
    assert.match(String(hit.foodName), /spinaci/i);
    assert.doesNotMatch(String(hit.foodName), /ravioli/i);
    assert.equal(String(hit.foodDbKey), '213');
    assert.equal(hit.source, 'kentu_it');
  });

  it('ricerca manuale: qualità match (come mergeAndRank) mette CREA sopra 50 contains', () => {
    const personalItems = Array.from({ length: 50 }, (_, i) => cand(
      `Ravioli di ricotta e spinaci #${i}`,
      {
        query: 'spinaci',
        confidenceScore: 0.9,
        source: 'personal',
        usageCount: 20,
        kcal: 214,
      },
    ));
    const crea = cand('Spinaci, crudi', {
      query: 'spinaci',
      confidenceScore: 0.85,
      source: 'kentu',
      usageCount: 0,
      kcal: 35,
    });
    // Inject strong come searchCatalogDbChunked (findStrongFoodMatchesInCatalog).
    const strongInject = findStrongFoodMatchesInCatalog('spinaci', {
      '213': {
        id: '213',
        fdcId: '213',
        italianName: 'Spinaci, crudi',
        name: 'Spinach, fresh, raw',
        kcal: 35,
      },
    }, { limit: 1 }).map((h) => cand(h.name, {
      query: 'spinaci',
      matchQuality: h.matchQuality,
      confidenceScore: 0.94,
      source: 'kentu',
      kcal: 35,
    }));
    const ranked = sortCandidatesByMatchQuality([...personalItems, crea, ...strongInject]);
    assert.ok(ranked.length > 0);
    assert.ok(isStrongFoodMatchQuality(ranked[0].matchQuality));
    assert.match(String(ranked[0].name), /spinaci/i);
    assert.doesNotMatch(String(ranked[0].name), /ravioli/i);
  });
});
