/**
 * Crea l'utente di prova sull'Auth Emulator e un diario finto di 45 giorni
 * sul Realtime Database Emulator. Non tocca il progetto reale.
 */
import { EMULATOR_PROJECT_ID, EMULATOR_USER } from '../src/config/emulatorUser.js';

const AUTH_ORIGIN = 'http://127.0.0.1:9099';
const DB_ORIGIN = 'http://127.0.0.1:9000';
const DIARY_DAYS = 45;

function iso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shift(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return iso(date);
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(seed, list) {
  return list[seed % list.length];
}

function meal(id, mealType, mealTime, name, grams, kcal, prot, carb, fat, foodDbKey, extra = {}) {
  return {
    id,
    type: 'food',
    mealType,
    mealTime,
    foodName: name,
    name,
    grams,
    kcal,
    prot,
    carb,
    fat,
    foodDbKey,
    novaScore: foodDbKey === 'yogurt_greco' ? 1 : foodDbKey === 'pane' ? 3 : 1,
    ...extra,
  };
}

/**
 * Caso noto permanente per Controlla alimenti sospetti:
 * wizard ha registrato un piatto composto partendo da sourceText "spinaci".
 * Densità ~280 kcal/100g vs Spinaci ~23 → ratio > 3.
 */
function compoundAuditFixtureMeal(date) {
  return meal(
    `${date}-ravioli-audit`,
    'pranzo',
    13,
    'Ravioli di ricotta e spinaci',
    350,
    980,
    38,
    110,
    32,
    null,
    {
      entrySource: 'wizard',
      sourceText: 'spinaci',
      matchQuality: 'contains',
      desc: 'Ravioli di ricotta e spinaci',
    },
  );
}

function sleepEntry(date, hours, wake) {
  let bedtime = Math.round((wake - hours) * 10) / 10;
  if (bedtime < 0) bedtime = Math.round((bedtime + 24) * 10) / 10;
  return {
    id: `sleep-${date}`,
    type: 'sleep',
    hours,
    wakeTime: wake,
    bedtime,
    bedtimeProvenance: 'recorded',
    quality: hours < 6.2 ? 2 : hours >= 7.5 ? 4 : 3,
  };
}

function placeSleep(tracker, date, hours, wake, skip) {
  if (skip) return;
  const wakeDate = shift(date, 1);
  const wakeKey = `trackerStorico_${wakeDate}`;
  const wakeNode = tracker[wakeKey] || { data: wakeDate, log: [] };
  wakeNode.log = [...(wakeNode.log || []).filter((e) => e?.type !== 'sleep'), sleepEntry(date, hours, wake)];
  tracker[wakeKey] = wakeNode;
}

/** Profilo calorico ~1500–3200 con giorni in fascia, sopra e sotto. */
function dayEnergyProfile(back, date) {
  const seed = hash(date);
  // Settimana irregolare: back 15–21
  if (back >= 15 && back <= 21) {
    const irregular = [1680, 3100, 1520, 2900, 1750, 3200, 1600];
    return { kcal: irregular[back - 15], band: 'irregular', lateDinner: back % 2 === 0 };
  }
  if (back === 2 || back === 28) return { kcal: 3180, band: 'over', lateDinner: true };
  if (back === 5 || back === 33) return { kcal: 1560, band: 'under', lateDinner: false };
  if (back === 8 || back === 25) return { kcal: 2280, band: 'in', lateDinner: false };
  const palette = [
    { kcal: 1520, band: 'under', lateDinner: false },
    { kcal: 1780, band: 'under', lateDinner: false },
    { kcal: 2050, band: 'in', lateDinner: false },
    { kcal: 2240, band: 'in', lateDinner: true },
    { kcal: 2380, band: 'in', lateDinner: false },
    { kcal: 2620, band: 'over', lateDinner: true },
    { kcal: 2850, band: 'over', lateDinner: false },
    { kcal: 3050, band: 'over', lateDinner: true },
  ];
  return pick(seed, palette);
}

function buildMeals(date, profile) {
  const seed = hash(`${date}-meals`);
  const dinnerHour = profile.lateDinner ? pick(seed, [21.5, 22, 22.5, 23]) : pick(seed, [19, 19.5, 20, 20.5]);
  const lunchHour = pick(seed >> 3, [12.5, 13, 13.5, 14]);
  const breakfastHour = pick(seed >> 5, [7, 7.5, 8, 8.5]);
  const total = profile.kcal;
  const c = Math.round(total * 0.22);
  const p = Math.round(total * 0.38);
  const n = total - c - p;
  return [
    meal(`${date}-c`, 'colazione', breakfastHour, pick(seed, ['Avena', 'Yogurt greco', 'Pane e uova']), 70, c, Math.round(c * 0.08 / 4), Math.round(c * 0.55 / 4), Math.round(c * 0.25 / 9), 'avena'),
    meal(`${date}-p`, 'pranzo', lunchHour, pick(seed >> 2, ['Riso e pollo', 'Pasta', 'Insalata e tonno']), 280, p, Math.round(p * 0.22 / 4), Math.round(p * 0.4 / 4), Math.round(p * 0.22 / 9), 'pollo'),
    meal(`${date}-n`, 'cena', dinnerHour, pick(seed >> 4, ['Verdure e uova', 'Pesce e verdure', 'Pollo grigliato']), 250, n, Math.round(n * 0.25 / 4), Math.round(n * 0.2 / 4), Math.round(n * 0.35 / 9), 'uova'),
  ];
}

function sleepHoursFor(date, kind) {
  if (kind === 'short') return 5.5;
  const seed = hash(`${date}-sleep`);
  const options = [5.5, 6, 6.5, 7, 7.2, 7.5, 7.8, 8, 8.3, 8.5];
  return pick(seed, options);
}

function buildWorkouts(date, back, noLegs) {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const seed = hash(`${date}-wo`);
  const log = [];

  // 2–3 sessioni di pesi/settimana, alta/bassa alternate; 10 giorni senza gambe (back 20–29)
  const upperDays = new Set([1, 4]); // lun, gio
  const lowerDays = new Set([2, 5]); // mar, ven
  if (upperDays.has(weekday) || (weekday === 3 && seed % 3 === 0)) {
    log.push({
      id: `wo-up-${date}`,
      type: 'workout',
      workoutType: 'pesi',
      duration: 40 + (seed % 3) * 5,
      durationMinutes: 40 + (seed % 3) * 5,
      muscleGroups: pick(seed, [['Petto', 'Spalle'], ['Dorso', 'Bicipiti'], ['Petto', 'Tricipiti']]),
    });
  } else if (lowerDays.has(weekday) && !noLegs) {
    log.push({
      id: `wo-lo-${date}`,
      type: 'workout',
      workoutType: 'pesi',
      duration: 35 + (seed % 2) * 10,
      durationMinutes: 35 + (seed % 2) * 10,
      muscleGroups: ['Gambe'],
    });
  }

  // Camminate in circa metà dei giorni (10–60 min)
  if (seed % 2 === 0) {
    const minutes = pick(seed >> 1, [10, 15, 20, 30, 40, 45, 50, 60]);
    log.push({
      id: `walk-${date}`,
      type: 'workout',
      workoutType: 'camminata',
      duration: minutes,
      durationMinutes: minutes,
    });
  }

  // Una corsa ogni tanto
  if (back === 7 || back === 19 || back === 31 || back === 42) {
    log.push({
      id: `run-${date}`,
      type: 'workout',
      workoutType: 'corsa',
      duration: 25 + (seed % 3) * 5,
      durationMinutes: 25 + (seed % 3) * 5,
    });
  }

  return log;
}

export function buildEmulatorDiary(today = iso(new Date())) {
  const tracker = {
    trackerFoodDatabase: {
      avena: { name: 'Avena', novaScore: 1, inflammationFactor: -1, hasSaturatedFats: false },
      pollo: { name: 'Pollo', novaScore: 1, inflammationFactor: 0, hasSaturatedFats: false },
      uova: { name: 'Uova', novaScore: 1, inflammationFactor: 0, hasSaturatedFats: true },
      yogurt_greco: { name: 'Yogurt greco', novaScore: 1, inflammationFactor: 0, hasSaturatedFats: false },
      pane: { name: 'Pane', novaScore: 3, inflammationFactor: 0, hasSaturatedFats: false },
    },
  };
  const checkin = {};
  const dayStatus = {};

  // Tre buchi, una pausa di 4 giorni
  const gapOffsets = new Set([6, 18, 35]);
  const pauseOffsets = new Set([10, 11, 12, 13]);
  // Dieci giorni senza gambe
  const noLegsOffsets = new Set([20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);

  for (let back = 1; back <= DIARY_DAYS; back += 1) {
    const date = shift(today, -back);
    if (gapOffsets.has(back)) continue;

    if (pauseOffsets.has(back)) {
      tracker[`trackerStorico_${date}`] = { data: date, log: [] };
      placeSleep(tracker, date, 7.2, 7, gapOffsets.has(back - 1));
      dayStatus[date] = {
        confirmed: false,
        approximate: false,
        paused: true,
        pauseReason: 'vacanza',
      };
      continue;
    }

    const profile = dayEnergyProfile(back, date);
    const sleepH = sleepHoursFor(date, back === 27 ? 'short' : 'normal');
    const wake = 6.25 + (hash(date) % 5) * 0.25;
    const log = [
      ...buildMeals(date, profile),
      ...buildWorkouts(date, back, noLegsOffsets.has(back)),
    ];
    // Caso noto audit: ieri (back=1), sempre presente e dentro la finestra 90 giorni.
    if (back === 1) {
      log.push(compoundAuditFixtureMeal(date));
    }
    tracker[`trackerStorico_${date}`] = { data: date, log };
    placeSleep(tracker, date, sleepH, wake, gapOffsets.has(back - 1));

    // Check-in in circa due terzi dei giorni (esclusi buchi/pause)
    if (hash(`${date}-ci`) % 3 !== 0) {
      const minutes = pick(hash(`${date}-cim`), [10, 20, 30, 45, 60]);
      checkin[date] = {
        walked: minutes <= 15 ? 'poco' : minutes <= 35 ? 'mezzora' : 'ora',
        minutes,
        estimated: true,
        answeredAt: Date.parse(`${date}T08:30:00`),
      };
    }
  }

  // Registrato da abbastanza giorni: taratura conclusa, baseline disponibile.
  const registeredAt = `${shift(today, -(DIARY_DAYS - 1))}T09:00:00.000Z`;
  return {
    profile_targets: {
      profile: {
        displayName: EMULATOR_USER.displayName,
        firstSetupCompleted: true,
        registeredAt,
        onboardingCompletedAt: registeredAt,
        outcome: 'forma',
        forzaEnabled: true,
        weight: 72,
        height: 176,
        age: 36,
        gender: 'M',
        targetCalories: 2300,
        proteinTarget: 130,
      },
      targets: { kcal: 2300, prot: 130, carb: 250, fat: 70 },
    },
    tracker_data: tracker,
    movement_checkin: checkin,
    day_status: dayStatus,
    cylinders: { forza: { enabled: true } },
  };
}

async function authAccount() {
  const signUp = await fetch(
    `${AUTH_ORIGIN}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: EMULATOR_USER.email,
        password: EMULATOR_USER.password,
        returnSecureToken: true,
      }),
    },
  );
  const created = await signUp.json();
  if (signUp.ok && created.localId) return created;
  const signIn = await fetch(
    `${AUTH_ORIGIN}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: EMULATOR_USER.email,
        password: EMULATOR_USER.password,
        returnSecureToken: true,
      }),
    },
  );
  const session = await signIn.json();
  if (!signIn.ok || !session.localId) {
    throw new Error(session?.error?.message || 'accesso emulatore non riuscito');
  }
  return session;
}

export async function seedEmulatorUser() {
  const session = await authAccount();
  const diary = buildEmulatorDiary();
  const url = `${DB_ORIGIN}/users/${session.localId}.json?ns=${EMULATOR_PROJECT_ID}&auth=${encodeURIComponent(session.idToken)}`;
  const write = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(diary),
  });
  if (!write.ok) {
    const body = await write.text();
    throw new Error(`scrittura diario emulatore rifiutata (${write.status}) ${body.slice(0, 180)}`);
  }
  const days = Object.keys(diary.tracker_data).filter((key) => key.startsWith('trackerStorico_')).length;
  console.log(`[emulator] utente di prova pronto, ${days} giorni nel diario (${DIARY_DAYS} richiesti)`);
  return { uid: session.localId, days };
}

if (process.argv[1] && process.argv[1].endsWith('seedEmulatorUser.mjs')) {
  seedEmulatorUser().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
