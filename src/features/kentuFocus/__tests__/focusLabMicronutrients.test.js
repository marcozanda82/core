/**
 * Unità — semantica micronutrienti lab Focus (nessuna I/O).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aggregateDayMicronutrients,
  buildFoodItemCatalogRef,
  buildFoodItemMicronutrients,
  FOCUS_LAB_MICRONUTRIENT_KEYS,
  FOCUS_NUTRIENT_AVAILABILITY,
  resolveMicronutrientPresence,
} from '../lab/focusLabMicronutrients.js';

describe('focusLabMicronutrients', () => {
  it('lista chiusa include omega3/6, k, mg, vitB12 e non EPA/DHA/ALA', () => {
    assert.ok(FOCUS_LAB_MICRONUTRIENT_KEYS.includes('omega3'));
    assert.ok(FOCUS_LAB_MICRONUTRIENT_KEYS.includes('omega6'));
    assert.ok(FOCUS_LAB_MICRONUTRIENT_KEYS.includes('k'));
    assert.ok(FOCUS_LAB_MICRONUTRIENT_KEYS.includes('mg'));
    assert.ok(FOCUS_LAB_MICRONUTRIENT_KEYS.includes('vitB12'));
    assert.equal(FOCUS_LAB_MICRONUTRIENT_KEYS.includes('epa'), false);
    assert.equal(FOCUS_LAB_MICRONUTRIENT_KEYS.includes('dha'), false);
    assert.equal(FOCUS_LAB_MICRONUTRIENT_KEYS.includes('ala'), false);
    assert.equal(FOCUS_LAB_MICRONUTRIENT_KEYS.includes('prot'), false);
  });

  it('distingue present, real_zero, unverified_zero, absent', () => {
    assert.equal(
      resolveMicronutrientPresence({ omega3: 1.2 }, 'omega3').availability,
      FOCUS_NUTRIENT_AVAILABILITY.present,
    );
    assert.equal(
      resolveMicronutrientPresence({
        omega3: 0,
        dbProvidedNutrientKeys: ['omega3'],
      }, 'omega3').availability,
      FOCUS_NUTRIENT_AVAILABILITY.real_zero,
    );
    assert.equal(
      resolveMicronutrientPresence({ omega3: 0 }, 'omega3').availability,
      FOCUS_NUTRIENT_AVAILABILITY.unverified_zero,
    );
    assert.equal(
      resolveMicronutrientPresence({ kcal: 100 }, 'omega3').availability,
      FOCUS_NUTRIENT_AVAILABILITY.absent,
    );
  });

  it('aggregato non somma unverified/absent come zeri; judgement null', () => {
    const agg = aggregateDayMicronutrients([
      { omega3: 1, dbProvidedNutrientKeys: ['omega3'] },
      { omega3: 0, dbProvidedNutrientKeys: ['omega3'] },
      { omega3: 0 },
      {},
    ]);
    const o = agg.byKey.omega3;
    assert.equal(o.value, 1);
    assert.equal(o.itemsKnown, 2);
    assert.equal(o.itemsUnverifiedZero, 1);
    assert.equal(o.itemsAbsent, 1);
    assert.equal(o.judgement, null);
  });

  it('catalogRef controllato: foodDbKey sì, path Firebase no; dbSource solo se noto', () => {
    const ok = buildFoodItemCatalogRef({
      foodDbKey: 'avocado',
      dbSource: 'kentu_it',
      dbProvidedNutrientKeys: ['k'],
    });
    assert.equal(ok.foodDbKey, 'avocado');
    assert.equal(ok.dbSource, 'kentu_it');
    assert.equal(ok.nutrientPresenceEvidence, 'db_provided_keys');

    const bad = buildFoodItemCatalogRef({
      dbSource: 'users/uid/tracker_data',
      matchedKey: 'x',
    });
    assert.equal(bad.foodDbKey, 'x');
    assert.equal(bad.dbSource, null);
    assert.equal(bad.dbSourceProvenance, 'missing');

    const micros = buildFoodItemMicronutrients({ vitB12: 2.4 });
    assert.equal(micros.vitB12.availability, 'present');
    assert.equal(micros.omega3.availability, 'absent');
  });
});
