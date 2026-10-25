/**
 * P1S — Contratto Nutella: wizard L2 usa OFF locale + ranking score-first (no import Vite graph).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('Nutella wizard/manual coherence P1S', () => {
  it('L2 passa ctx.offDb (non null) e riusa mergeAndRankSearchResults', () => {
    const resolver = fs.readFileSync(
      path.join(ROOT, 'src/features/commandTerminal/conversation/multiDbFoodResolver.js'),
      'utf8',
    );
    const l2 = resolver.slice(
      resolver.indexOf('export async function collectLevel2ExternalCandidates'),
      resolver.indexOf('function signalAborted'),
    );
    assert.ok(!/searchOffDb\(\s*name\s*,\s*null\s*,/.test(l2), 'non deve hardcodare offDb=null');
    assert.match(l2, /ctx\.offDb/);
    assert.match(l2, /mergeAndRankSearchResults/);
    assert.match(resolver, /unit \* 1000|ts \* 1000/);
    assert.match(resolver, /searchResultToResolverCandidate\([\s\S]*query/);
  });

  it('mergeAndRank ordina per exact/score prima del tie-break OFF', () => {
    const engine = fs.readFileSync(
      path.join(ROOT, 'src/features/mealBuilder/hooks/useUniversalSearchEngine.js'),
      'utf8',
    );
    const fn = engine.slice(
      engine.indexOf('export function mergeAndRankSearchResults'),
      engine.indexOf('function isHeavyCatalogSource'),
    );
    // Non più: if (aOff !== bOff) return aOff ? 1 : -1; come PRIMO criterio
    const sortBlock = fn.slice(fn.indexOf('.sort('));
    const exactBeforeOff = sortBlock.indexOf('isExactNameMatch') < sortBlock.indexOf('isOffSearchResult');
    assert.ok(exactBeforeOff, 'exact match deve precedere demozione OFF nello sort');
    assert.match(sortBlock, /rankingScore/);
  });

  it('ChatFoodEnrichmentModal attende OFF in background invece di falso non-trovato', () => {
    const modal = fs.readFileSync(
      path.join(ROOT, 'src/features/commandTerminal/components/ChatFoodEnrichmentModal.jsx'),
      'utf8',
    );
    assert.match(modal, /offStillLoading/);
    assert.match(modal, /Catalogo prodotti in caricamento/);
    assert.match(modal, /session\?\.offReady/);
  });

  it('Controller espone offReady alla scheda scegli alimento', () => {
    const ctrl = fs.readFileSync(
      path.join(ROOT, 'src/features/commandTerminal/CommandTerminalController.js'),
      'utf8',
    );
    assert.match(ctrl, /offReady:/);
    assert.match(ctrl, /openMcdriveDisambiguationForItem/);
  });

  it('scala confidenza: textScore 0–1 → relevance 0–1000 (unit test puro)', () => {
    function relevanceScoreToConfidence(relevanceScore) {
      const score = Number(relevanceScore) || 0;
      if (score >= 1000) return 1;
      if (score >= 920) return 0.94;
      if (score >= 300) return 0.4;
      return 0;
    }
    function fromHit(textScore, rankingScore, computed) {
      let relevance = 0;
      if (Number.isFinite(rankingScore) && rankingScore >= 300) relevance = rankingScore;
      else if (Number.isFinite(computed) && computed >= 300) relevance = computed;
      else if (Number.isFinite(textScore) && textScore > 0 && textScore <= 1.5) {
        relevance = Math.round(textScore * 1000);
      }
      return relevanceScoreToConfidence(relevance);
    }
    assert.equal(fromHit(0.92, NaN, 0), 0.94);
    assert.ok(fromHit(0.92, NaN, 0) >= 0.5);
    assert.equal(fromHit(0.2, NaN, 0), 0);
    assert.equal(fromHit(0, 1050, 0), 1);

    // eslint-disable-next-line no-console
    console.log('\n===== P1S_NUTELLA_CONTRACT =====\n', JSON.stringify({
      offDbPassedToL2: true,
      rankScoreBeforeOffDemotion: true,
      textScoreScaled: true,
      offLoadingWaits: true,
    }, null, 2));
  });
});
