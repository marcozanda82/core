/**
 * P6.6.4 — arrotondamenti numerici naturali (offline).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateFocusWrittenEdition,
} from '../editorial/writing/index.js';
import { detectMetricUnitMismatches } from '../editorial/writing/focusMetricUnitGuard.js';
import { buildSunday1810V2AuthorizedSelection } from './fixtures/focusGeminiRawSunday1810.v2.minimized.js';
import {
  FOCUS_GEMINI_RAW_SUNDAY_1810_V3_META,
  buildSunday1810V3AuthorizedSelection,
  buildSunday1810V3RejectedRawEdition,
} from './fixtures/focusGeminiRawSunday1810.v3.minimized.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const REAL_CANDIDATES = [
  path.join(ROOT, 'geminiRawResponse_20261020_052304.txt'),
  path.join(ROOT, 'geminiRawResponse_20261020.txt'),
];

const NUM_RE = /\d+(?:[.,]\d+)?/g;

function tokensIn(text) {
  return [...String(text || '').matchAll(NUM_RE)].map((m) => m[0]);
}

describe('P6.6.4 diagnosi token 145 (prima del significato del fix)', () => {
  it('145 nasce dal titolo; 145,06 nel corpo è un unico token', () => {
    const raw = buildSunday1810V3RejectedRawEdition();
    const a = raw.articles[1];
    assert.match(a.title, /\b145\b/);
    assert.match(a.body, /145,06/);
    const titleTok = tokensIn(a.title);
    const bodyTok = tokensIn(a.body);
    assert.deepEqual(titleTok.filter((t) => t === '145' || t.startsWith('145')), ['145']);
    assert.ok(bodyTok.includes('145,06'));
    assert.equal(bodyTok.includes('145'), false, '145,06 non va spezzato in 145');
    assert.equal(Math.round(145.06), 145);
  });

  it('senza arrotondamento naturale, lo stesso titolo sarebbe unauthorized:145', () => {
    // Allowlist pre-P6.6.4: valori esatti + varianti virgola/punto, senza Math.round
    const allow = new Set(['145.06', '145,06', '12.1', '12,1', '7', '-12.1', '-12,1']);
    const titleTok = tokensIn(buildSunday1810V3RejectedRawEdition().articles[1].title);
    const bad = titleTok.filter((t) => !allow.has(t) && !allow.has(t.replace(',', '.')));
    assert.deepEqual(bad, ['145']);
  });
});

describe('P6.6.4 arrotondamento 145.06 → 145 ammesso', () => {
  it('edizione v3 (titolo «145 grammi» + corpo 145,06) passa dopo il fix', () => {
    const sel = buildSunday1810V3AuthorizedSelection();
    const raw = buildSunday1810V3RejectedRawEdition();
    const v = validateFocusWrittenEdition(raw, { selection: sel });
    assert.equal(
      v.errors.some((e) => e.includes('unauthorized_number_in_prose')),
      false,
      v.errors.join(' | '),
    );
    assert.equal(v.ok, true, v.errors.join(' | '));
  });

  it('145,06 grammi esatto resta ammesso', () => {
    const sel = buildSunday1810V3AuthorizedSelection();
    const raw = buildSunday1810V3RejectedRawEdition();
    raw.articles[1].title = 'Calo proteico settimanale rispetto alla finestra precedente';
    raw.articles[1].body = raw.articles[1].body.replace(
      '145,06 g/giorno',
      '145,06 grammi al giorno',
    );
    const v = validateFocusWrittenEdition(raw, { selection: sel });
    assert.equal(v.ok, true, v.errors.join(' | '));
  });

  it('numero completamente estraneo resta respinto', () => {
    const sel = buildSunday1810V3AuthorizedSelection();
    const raw = buildSunday1810V3RejectedRawEdition();
    raw.articles[1].body += ' Valore inventato 999 kcal.';
    const v = validateFocusWrittenEdition(raw, { selection: sel });
    assert.ok(v.errors.some((e) => /unauthorized_number_in_prose:.*999/.test(e)));
  });

  it('intero vicino non autorizzato (144) resta respinto', () => {
    const sel = buildSunday1810V3AuthorizedSelection();
    const raw = buildSunday1810V3RejectedRawEdition();
    raw.articles[1].title = 'Apporto proteico medio settimanale a 144 grammi';
    const v = validateFocusWrittenEdition(raw, { selection: sel });
    assert.ok(v.errors.some((e) => /unauthorized_number_in_prose:.*144/.test(e)));
  });

  it('unità errata (giorni → sessioni) resta respinta', () => {
    const sel = buildSunday1810V3AuthorizedSelection();
    const raw = buildSunday1810V3RejectedRawEdition();
    raw.articles[3].title =
      'Quattordici sessioni di forza registrate nell\'arco di trenta giorni';
    const v = validateFocusWrittenEdition(raw, { selection: sel });
    assert.ok(v.errors.includes('metric_unit_mismatch'), v.errors.join(' | '));
    const hits = detectMetricUnitMismatches(
      sel.features[0],
      raw.articles[3].title,
      raw.articles[3].body,
    );
    assert.ok(hits.includes('metric_unit_mismatch'));
  });

  it('Δ principale omesso resta respinto', () => {
    const sel = buildSunday1810V3AuthorizedSelection();
    const raw = buildSunday1810V3RejectedRawEdition();
    raw.articles[1].body =
      'Nel periodo 11–17 ottobre la media proteica registrata è 145,06 g/giorno '
      + 'rispetto alla finestra equivalente 4–10 ottobre. '
      + 'Il confronto usa una finestra di eguale lunghezza immediatamente precedente, non un mese solare. '
      + 'La rilevazione non definisce un deficit nutrizionale. '
      + 'Nessuna causalità tra domini senza evidenza dedicata.';
    raw.articles[1].metricsCited = raw.articles[1].metricsCited.filter(
      (m) => m.path !== 'edition.week.comparison.deltas.avgProteinG',
    );
    raw.articles[1].evidenceIds = raw.articles[1].evidenceIds.filter(
      (id) => id !== 'edition.week.comparison.deltas.avgProteinG',
    );
    const v = validateFocusWrittenEdition(raw, { selection: sel });
    assert.ok(v.errors.includes('main_story_fact_missing'), v.errors.join(' | '));
  });
});

describe('P6.6.4 raw reale opzionale (se presente in repo)', () => {
  it('se esiste export 05:23, centerpiece ha 145 in titolo e valida senza unauthorized 145', () => {
    const hit = REAL_CANDIDATES.map((p) => {
      if (!fs.existsSync(p)) return null;
      const clip = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (!clip?.geminiRawResponse) return null;
      const exportedAt = String(clip.exportedAt || '');
      const raw = JSON.parse(clip.geminiRawResponse);
      const center = (raw.articles || []).find((a) => a.role === 'centerpiece')
        || raw.articles?.[1];
      if (!center) return null;
      const has145Title = /\b145\b/.test(center.title || '')
        && /grammi/i.test(center.title || '');
      if (exportedAt.includes('05:23') || has145Title) {
        return { path: p, clip, raw, center };
      }
      return null;
    }).find(Boolean);

    if (!hit) {
      assert.equal(
        FOCUS_GEMINI_RAW_SUNDAY_1810_V3_META.historicalValidationErrors[0],
        'articles[1]_unauthorized_number_in_prose:145',
      );
      return;
    }

    const titleTok = tokensIn(hit.center.title);
    const bodyTok = tokensIn(hit.center.body);
    assert.ok(titleTok.includes('145'), `title tokens: ${titleTok.join(',')}`);
    assert.equal(bodyTok.includes('145'), false, 'corpo non deve spezzare 145,06');
    assert.ok(bodyTok.some((t) => t === '145,06' || t === '145.06'));

    const sel = buildSunday1810V3AuthorizedSelection();
    const v = validateFocusWrittenEdition(hit.raw, { selection: sel });
    assert.equal(
      v.errors.some((e) => /unauthorized_number_in_prose:.*\b145\b/.test(e)),
      false,
      v.errors.join(' | '),
    );
  });
});
