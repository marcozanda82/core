import Papa from 'papaparse';
import { enrichDbRowWithFoodUnits } from './foodUnits';

function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (value == null) return 0;

  const normalized = String(value).trim().replace(',', '.');
  if (!normalized) return 0;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickFirst(row, keys, fallback = '') {
  for (const key of keys) {
    const value = row?.[key];
    if (value != null && String(value).trim() !== '') {
      return value;
    }
  }
  return fallback;
}

function mapRowToFood(row) {
  const id = String(pickFirst(row, ['food_code', 'id', 'code'], '')).trim();
  const desc = String(pickFirst(row, ['name', 'desc', 'food_name'], '')).trim();

  if (!id || !desc) return null;

  return {
    id,
    value: {
      desc,
      kcal: toNumber(pickFirst(row, ['energy_kcal', 'kcal', 'energy'])),
      prot: toNumber(pickFirst(row, ['proteins', 'prot', 'protein'])),
      carb: toNumber(pickFirst(row, ['available_carbohydrates', 'carb', 'carbohydrates'])),
      fat: toNumber(pickFirst(row, ['lipids', 'fat', 'fatTotal'])),
      fibre: toNumber(pickFirst(row, ['total_fiber', 'fibre', 'fiber'])),
      zuccheri: toNumber(pickFirst(row, ['soluble_sugars', 'zuccheri', 'sugars'])),
      na: toNumber(pickFirst(row, ['sodium', 'na'])),
      k: toNumber(pickFirst(row, ['potassium', 'k'])),
    },
  };
}

export async function loadFoodDbFromCSV(url = '/crea_food_composition_tables.csv') {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load CSV: ${res.status}`);
    }

    const csvText = await res.text();
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    const rows = Array.isArray(parsed?.data) ? parsed.data : [];
    const foodDb = {};

    rows.forEach((row) => {
      const mapped = mapRowToFood(row);
      if (!mapped) return;
      foodDb[mapped.id] = enrichDbRowWithFoodUnits(mapped.value, mapped.id);
    });

    console.log('[foodLoader] loaded foods', Object.keys(foodDb).length);
    return foodDb;
  } catch (error) {
    console.error('[foodLoader] failed to load food DB from CSV', error);
    return {};
  }
}
