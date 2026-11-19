var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/features/kentuFocus/product/loadFocusCatalogsNode.js
async function loadFocusCatalogsFromPublic(root = process.cwd(), options = {}) {
  const includeOff = options.includeOff !== false;
  const dataDir = options.dataDir ? String(options.dataDir) : null;
  const cacheKey = `${dataDir || root}|off:${includeOff ? 1 : 0}`;
  if (cached && cached.key === cacheKey) return cached.value;
  const resolveFile = (name) => dataDir ? import_node_path.default.join(dataDir, name) : import_node_path.default.join(root, "public", name);
  const [kentuIt, globalDb, offDb] = await Promise.all([
    readIndex(resolveFile(FILE_NAMES.kentuIt), "kentu_it"),
    readIndex(resolveFile(FILE_NAMES.global), "global"),
    includeOff ? readIndex(resolveFile(FILE_NAMES.off), "off") : Promise.resolve({})
  ]);
  for (const key of Object.keys(kentuIt)) delete globalDb[key];
  const value = {
    personalDb: {},
    kentuItDb: kentuIt,
    globalDb,
    offDb,
    offReady: includeOff && Object.keys(offDb).length > 0
  };
  cached = { key: cacheKey, value };
  return value;
}
async function readIndex(absolutePath, source) {
  const json = JSON.parse(await (0, import_promises.readFile)(absolutePath, "utf8"));
  return indexRecords(extractRecords(json), source);
}
function extractRecords(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  for (const key of ["foods", "items", "data", "records", "entries"]) {
    if (Array.isArray(json[key])) return json[key];
  }
  const values = Object.values(json);
  if (values.length > 0 && values.every((value) => value && typeof value === "object")) return values;
  return [];
}
function indexRecords(records, source) {
  const db = {};
  records.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    if (source === "off" && !hasUsableKcal(raw)) return;
    const key = recordKey(raw, index);
    if (!key || db[key]) return;
    db[key] = {
      ...raw,
      source,
      ...source === "off" ? { _source: "off" } : {}
    };
  });
  return db;
}
function recordKey(record, index) {
  const raw = record.dedupKey ?? record.id ?? record.fdcId ?? record.fdc_id ?? record.creaCode ?? record.food_code ?? record.code;
  if (raw != null && String(raw).trim()) return String(raw).trim();
  return `kentu_${index}`;
}
function hasUsableKcal(record) {
  const raw = record.kcal ?? record.cal ?? record.calories ?? record.energy_kcal ?? record.energy ?? record.kcalPer100g;
  if (raw == null || raw === "") return false;
  const parsed = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0;
}
var import_promises, import_node_path, FILE_NAMES, cached;
var init_loadFocusCatalogsNode = __esm({
  "src/features/kentuFocus/product/loadFocusCatalogsNode.js"() {
    import_promises = require("node:fs/promises");
    import_node_path = __toESM(require("node:path"), 1);
    FILE_NAMES = Object.freeze({
      kentuIt: "kentu_smart_master_db.json",
      global: "kentu_smart_master_usda_FINAL.json",
      off: "kentu_off_master_db.json"
    });
    cached = null;
  }
});

// functions/mcp/loadServerCatalogs.js
var loadServerCatalogs_exports = {};
__export(loadServerCatalogs_exports, {
  clearServerCatalogsCache: () => clearServerCatalogsCache,
  loadServerCatalogs: () => loadServerCatalogs,
  resolveMcpDataDir: () => resolveMcpDataDir,
  setMcpDataDirForTests: () => setMcpDataDirForTests
});
function setMcpDataDirForTests(absoluteDir) {
  dataDirOverride = absoluteDir ? String(absoluteDir) : null;
}
function resolveMcpDataDir() {
  if (dataDirOverride) return dataDirOverride;
  if (typeof __dirname === "string") {
    const besideBundle = import_node_path2.default.join(__dirname, "catalog-data");
    if ((0, import_node_fs.existsSync)(import_node_path2.default.join(besideBundle, "kentu_smart_master_db.json"))) {
      return besideBundle;
    }
    const legacy = import_node_path2.default.join(__dirname, "../data");
    if ((0, import_node_fs.existsSync)(import_node_path2.default.join(legacy, "kentu_smart_master_db.json"))) return legacy;
    return besideBundle;
  }
  throw new Error(
    "MCP data dir non risolvibile: manca __dirname (bundle CJS) e nessun setMcpDataDirForTests"
  );
}
function clearServerCatalogsCache() {
  loading = null;
  cached2 = null;
}
async function loadServerCatalogs() {
  if (cached2) return cached2;
  if (loading) return loading;
  loading = (async () => {
    const dataDir = resolveMcpDataDir();
    const catalogs = await loadFocusCatalogsFromPublic(process.cwd(), {
      dataDir,
      includeOff: false
    });
    const result = {
      ...catalogs,
      offDb: {},
      offReady: false,
      offExcluded: true,
      warnings: [OFF_WARNING]
    };
    cached2 = result;
    return result;
  })();
  try {
    return await loading;
  } catch (error) {
    loading = null;
    throw error;
  }
}
var import_node_path2, import_node_fs, dataDirOverride, OFF_WARNING, loading, cached2;
var init_loadServerCatalogs = __esm({
  "functions/mcp/loadServerCatalogs.js"() {
    import_node_path2 = __toESM(require("node:path"));
    import_node_fs = require("node:fs");
    init_loadFocusCatalogsNode();
    dataDirOverride = null;
    OFF_WARNING = "Catalogo OFF non incluso sul server MCP: lookup solo su CREA, USDA e DB personale. Se un alimento del diario esisteva solo in OFF, il match catalogo pu\xF2 mancare.";
    loading = null;
    cached2 = null;
  }
});

// src/features/dayStatus/dayStatusRecord.js
function isIsoDate2(value) {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}
function normalizeDayStatusRecord(raw) {
  if (raw == null) return null;
  if (typeof raw !== "object") return null;
  const confirmed = raw.confirmed === true;
  const approximate = raw.approximate === true;
  const paused = raw.paused === true;
  const confirmedAt = finiteEpoch(raw.confirmedAt);
  const loggedLateAt = finiteEpoch(raw.loggedLateAt);
  const pauseReason = PAUSE_REASONS.includes(raw.pauseReason) ? raw.pauseReason : null;
  return {
    confirmed,
    confirmedAt: confirmed ? confirmedAt : null,
    approximate,
    paused,
    pauseReason: paused ? pauseReason : null,
    loggedLateAt
  };
}
function finiteEpoch(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1e12) return Math.round(n);
  if (n >= 1e9) return Math.round(n * 1e3);
  return null;
}
var PAUSE_REASONS, ISO_DATE_RE;
var init_dayStatusRecord = __esm({
  "src/features/dayStatus/dayStatusRecord.js"() {
    PAUSE_REASONS = Object.freeze(["vacanza", "malattia", "altro"]);
    ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  }
});

// src/features/kentuFocus/score/dayScoreRecord.js
var dayScoreRecord_exports = {};
__export(dayScoreRecord_exports, {
  dayScorePath: () => dayScorePath,
  decodeDayScoreFromRtdb: () => decodeDayScoreFromRtdb,
  encodeDayScoreForRtdb: () => encodeDayScoreForRtdb,
  hashDayFacts: () => hashDayFacts
});
function dayScorePath(uid, date) {
  const id = String(uid || "").trim();
  if (!id) throw new Error("uid mancante");
  if (!isIsoDate2(date)) throw new Error("data non valida");
  return `users/${id}/focus_day_scores/${date}`;
}
function hashDayFacts(value) {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
function encodeDayScoreForRtdb(record) {
  if (!record || typeof record !== "object") return null;
  const out = {
    version: record.version,
    reliability: record.reliability,
    cylinders: encodeCylindersForRtdb(record.cylinders),
    dataVersion: record.dataVersion
  };
  if (record.score == null) out.scoreIsNull = true;
  else out.score = record.score;
  return out;
}
function encodeCylindersForRtdb(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of Object.keys(source)) {
    const cylinder3 = source[key] && typeof source[key] === "object" ? source[key] : {};
    const value = Number(cylinder3.value);
    out[key] = {
      status: cylinder3.status ?? "no_data",
      keyFact: String(cylinder3.keyFact ?? ""),
      signals: asArray(cylinder3.signals),
      value: Number.isFinite(value) ? value : null
    };
  }
  return out;
}
function decodeDayScoreFromRtdb(raw) {
  if (!raw || typeof raw !== "object") return null;
  const score = raw.scoreIsNull === true || raw.score == null ? null : Number(raw.score);
  return {
    version: raw.version ?? null,
    score: Number.isFinite(score) ? score : null,
    reliability: raw.reliability ?? null,
    cylinders: normalizeCylinders(raw.cylinders),
    dataVersion: raw.dataVersion ?? null
  };
}
function normalizeCylinders(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of ["alimentazione", "sonno", "movimento", "forza", "cardio"]) {
    const cylinder3 = source[key] && typeof source[key] === "object" ? source[key] : {};
    const value = Number(cylinder3.value);
    out[key] = {
      status: cylinder3.status ?? "no_data",
      keyFact: cylinder3.keyFact ?? "",
      signals: asArray(cylinder3.signals),
      value: Number.isFinite(value) ? value : null
    };
  }
  return out;
}
function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (value && typeof value === "object") {
    return Object.keys(value).sort((a, b) => Number(a) - Number(b)).map((key) => String(value[key]));
  }
  return [];
}
function stableStringify(value) {
  if (value == null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return "null";
}
var init_dayScoreRecord = __esm({
  "src/features/kentuFocus/score/dayScoreRecord.js"() {
    init_dayStatusRecord();
  }
});

// src/activityCatalog.js
function normalizeMuscleGroupLabel(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return MUSCLE_ALIAS_TO_ID.get(s.toLowerCase()) ?? s;
}
function normalizeMuscleGroupArray(muscles) {
  const list = Array.isArray(muscles) ? muscles : muscles != null && String(muscles).trim() !== "" ? [muscles] : [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const m of list) {
    const c = normalizeMuscleGroupLabel(m);
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}
var WORKOUT_MUSCLE_GROUP_DEFS, WORKOUT_MUSCLE_MACRO_SECTIONS, WORKOUT_MUSCLE_GROUP_IDS, MUSCLE_ALIAS_TO_ID, WORKOUT_ACTIVITY_TYPE_DEFS, ACTIVITY_BY_ID, WORKOUT_ACTIVITY_SELECTOR_IDS;
var init_activityCatalog = __esm({
  "src/activityCatalog.js"() {
    WORKOUT_MUSCLE_GROUP_DEFS = [
      { id: "Petto", label: "Petto", macroGroup: "chest" },
      { id: "Dorso", label: "Dorso", aliases: ["Schiena", "schiena"], macroGroup: "back_shoulders" },
      { id: "Gambe", label: "Gambe", macroGroup: "legs" },
      { id: "Spalle", label: "Spalle", macroGroup: "back_shoulders" },
      { id: "abs", label: "ABS", macroGroup: "core" },
      { id: "bicipiti", label: "Bicipiti", macroGroup: "arms" },
      { id: "tricipiti", label: "Tricipiti", macroGroup: "arms" },
      { id: "avambracci", label: "Avambracci", macroGroup: "arms" },
      { id: "Core", label: "Core", aliases: ["Addominali", "addominali"], macroGroup: "core" },
      { id: "Total Body", label: "Total Body", aliases: ["Full Body", "full body", "totalbody"], macroGroup: "total" }
    ];
    WORKOUT_MUSCLE_MACRO_SECTIONS = Object.freeze([
      { id: "legs", label: "Gambe" },
      { id: "chest", label: "Petto" },
      { id: "back_shoulders", label: "Schiena e Spalle" },
      { id: "arms", label: "Braccia" },
      { id: "core", label: "Abs e Core" },
      { id: "total", label: "Full body" }
    ]);
    WORKOUT_MUSCLE_GROUP_IDS = WORKOUT_MUSCLE_GROUP_DEFS.map((d) => d.id);
    MUSCLE_ALIAS_TO_ID = /* @__PURE__ */ new Map();
    for (const d of WORKOUT_MUSCLE_GROUP_DEFS) {
      MUSCLE_ALIAS_TO_ID.set(String(d.id).toLowerCase(), d.id);
      for (const a of d.aliases || []) {
        MUSCLE_ALIAS_TO_ID.set(String(a).toLowerCase(), d.id);
      }
    }
    WORKOUT_ACTIVITY_TYPE_DEFS = [
      {
        id: "pesi",
        label: "Sollevamento pesi",
        category: "strength",
        nodeKind: "workout",
        icon: "\u{1F3CB}\uFE0F",
        selectorButtonLabel: "\u{1F3CB}\uFE0F PESI",
        showInActivitySelector: true
      },
      {
        id: "cardio",
        label: "Cardio",
        category: "cardio",
        nodeKind: "workout",
        icon: "\u{1F493}",
        selectorButtonLabel: "\u{1F493} CARDIO",
        showInActivitySelector: true
      },
      {
        id: "hiit",
        label: "HIIT / Circuito",
        category: "hiit",
        nodeKind: "workout",
        icon: "\u{1F525}",
        selectorButtonLabel: "\u{1F525} HIIT",
        showInActivitySelector: true
      },
      {
        id: "camminata",
        label: "Camminata",
        category: "cardio",
        nodeKind: "workout",
        icon: "\u{1F6B6}",
        selectorButtonLabel: "\u{1F6B6} CAMMINATA",
        showInActivitySelector: true
      },
      {
        id: "corsa",
        label: "Corsa",
        category: "cardio",
        nodeKind: "workout",
        icon: "\u{1F3C3}",
        selectorButtonLabel: "\u{1F3C3} CORSA",
        showInActivitySelector: true
      },
      {
        id: "corpo_libero",
        label: "Corpo libero",
        category: "strength",
        nodeKind: "workout",
        icon: "\u{1F938}",
        selectorButtonLabel: "\u{1F938} CORPO LIBERO",
        showInActivitySelector: true
      },
      {
        id: "elastici",
        label: "Elastici",
        category: "strength",
        nodeKind: "workout",
        icon: "\u{1FAA2}",
        selectorButtonLabel: "\u{1FAA2} ELASTICI",
        showInActivitySelector: true
      },
      {
        id: "lavori_pesanti",
        label: "Lavori pesanti",
        category: "strength",
        nodeKind: "workout",
        icon: "\u{1F9F0}",
        selectorButtonLabel: "\u{1F9F0} LAVORI PESANTI",
        showInActivitySelector: true
      },
      {
        id: "scale",
        label: "Scale",
        category: "strength",
        nodeKind: "workout",
        icon: "\u{1FA9C}",
        selectorButtonLabel: "\u{1FA9C} SCALE",
        showInActivitySelector: true
      },
      {
        id: "alzate_sedia",
        label: "Alzate dalla sedia",
        category: "strength",
        nodeKind: "workout",
        icon: "\u{1FA91}",
        selectorButtonLabel: "\u{1FA91} ALZATE",
        showInActivitySelector: true
      },
      {
        id: "lavoro",
        label: "Attivit\xE0 lavorativa",
        category: "work",
        nodeKind: "work",
        icon: "\u{1F4BC}",
        selectorButtonLabel: "\u{1F4BC} LAVORO",
        showInActivitySelector: false
      },
      {
        id: "studio",
        label: "Studio",
        category: "cognitive",
        nodeKind: "cognitive",
        icon: "\u{1F4DA}",
        selectorButtonLabel: "\u{1F4DA} STUDIO",
        showInActivitySelector: false,
        cognitiveMet: 1.3
      },
      {
        id: "lavoro_pc",
        label: "Lavoro PC",
        category: "cognitive",
        nodeKind: "cognitive",
        icon: "\u{1F4BB}",
        selectorButtonLabel: "\u{1F4BB} LAVORO PC",
        showInActivitySelector: false,
        cognitiveMet: 1.5
      },
      {
        id: "misto",
        label: "Misto",
        category: "mixed",
        nodeKind: "workout",
        icon: "\u{1F3CB}\uFE0F",
        selectorButtonLabel: "\u{1F3CB}\uFE0F MISTO",
        showInActivitySelector: false
      }
    ];
    ACTIVITY_BY_ID = new Map(WORKOUT_ACTIVITY_TYPE_DEFS.map((d) => [d.id, d]));
    WORKOUT_ACTIVITY_SELECTOR_IDS = Object.freeze([
      "pesi",
      "corpo_libero",
      "elastici",
      "lavori_pesanti",
      "scale",
      "alzate_sedia",
      "cardio",
      "hiit",
      "camminata",
      "corsa"
    ]);
  }
});

// src/features/kentuFocus/normalize/focusDateUtils.js
function isIsoDateString(value) {
  if (typeof value !== "string" || !ISO_DATE_RE2.test(value)) return false;
  const d = /* @__PURE__ */ new Date(`${value}T12:00:00`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function addCalendarDays(dateStr, n) {
  const d = /* @__PURE__ */ new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
}
function wrap24(h) {
  let x = Number(h);
  if (!Number.isFinite(x)) return null;
  x %= 24;
  if (x < 0) x += 24;
  return Math.round(x * 1e3) / 1e3;
}
function parseDecimalHour(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return wrap24(raw);
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{1,2}:\d{2}/.test(s)) {
    const [hh, mm] = s.split(":");
    const h = Number(hh);
    const m = Number(mm);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return wrap24(h + m / 60);
  }
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return wrap24(n);
}
function computeBedtimeFromWakeAndDuration(wakeDec, durationHours) {
  const wake = Number(wakeDec);
  const hours = Number(durationHours);
  if (!Number.isFinite(wake) || !Number.isFinite(hours) || hours <= 0) return null;
  return wrap24(wake - hours);
}
function formatFocusHoursIt(hours) {
  const n = Number(hours);
  if (!Number.isFinite(n) || n < 0) return null;
  const totalMin = Math.round(n * 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (mins <= 0) return `${h} h`;
  return `${h} h ${String(mins).padStart(2, "0")}`;
}
var ISO_DATE_RE2, ISO_WEEKDAY_LABELS_IT, MONTHS_IT;
var init_focusDateUtils = __esm({
  "src/features/kentuFocus/normalize/focusDateUtils.js"() {
    ISO_DATE_RE2 = /^\d{4}-\d{2}-\d{2}$/;
    ISO_WEEKDAY_LABELS_IT = Object.freeze([
      null,
      "luned\xEC",
      "marted\xEC",
      "mercoled\xEC",
      "gioved\xEC",
      "venerd\xEC",
      "sabato",
      "domenica"
    ]);
    MONTHS_IT = Object.freeze([
      "gennaio",
      "febbraio",
      "marzo",
      "aprile",
      "maggio",
      "giugno",
      "luglio",
      "agosto",
      "settembre",
      "ottobre",
      "novembre",
      "dicembre"
    ]);
  }
});

// src/features/kentuFocus/normalize/expandTrackerDayLog.js
function asLogCollectionArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter((e) => e && typeof e === "object");
  if (typeof raw === "object") {
    return Object.values(raw).filter((e) => e && typeof e === "object");
  }
  return [];
}
function inferFolderMealType(entry) {
  const candidate = entry?.mealType ?? entry?.mealId ?? entry?.id ?? "";
  const s = String(candidate).trim();
  return s || "unknown";
}
function expandTrackerLogEntries(rawLog) {
  const out = [];
  const list = asLogCollectionArray(rawLog);
  list.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    if (entry.type === "meal") {
      const folderMealType = inferFolderMealType(entry);
      const items = asLogCollectionArray(entry.items);
      items.forEach((subItem, subIndex) => {
        if (!subItem || typeof subItem !== "object") return;
        const itemType = subItem.type === "recipe" ? "recipe" : "food";
        const itemMt = subItem.mealType != null && String(subItem.mealType).trim() !== "" ? String(subItem.mealType).trim() : folderMealType;
        out.push({
          ...subItem,
          type: itemType,
          mealType: itemMt,
          id: subItem.id != null && String(subItem.id) !== "" ? subItem.id : `food_${index}_${subIndex}_${itemMt}`,
          kcal: subItem.kcal ?? subItem.cal ?? 0
        });
      });
      return;
    }
    if (entry.type === "single" || entry.type == null || entry.type === "") {
      const mealType = inferFolderMealType(entry);
      out.push({
        ...entry,
        type: "food",
        mealType,
        id: entry.id != null && String(entry.id) !== "" ? entry.id : `food_${index}_${mealType}`,
        kcal: entry.kcal ?? entry.cal ?? 0
      });
      return;
    }
    out.push({
      ...entry,
      kcal: entry.kcal ?? entry.cal ?? 0
    });
  });
  return out;
}
function pickDayLogRaw(node) {
  if (!node || typeof node !== "object") return null;
  if (node.log != null) return node.log;
  if (node.dati && typeof node.dati === "object" && node.dati.log != null) {
    return node.dati.log;
  }
  return null;
}
var init_expandTrackerDayLog = __esm({
  "src/features/kentuFocus/normalize/expandTrackerDayLog.js"() {
  }
});

// src/features/kentuFocus/costanza/muscleIds.mm-1.js
var MUSCLE_MAP_VERSION, MUSCLE_IDS, MUSCLE_LABELS, COSTANZA_UI_GROUPS, FORCE_CI_GROUP_IDS, DEFAULT_WEEKLY_GOAL_DAYS, WEEKLY_GOAL_CHOICES;
var init_muscleIds_mm_1 = __esm({
  "src/features/kentuFocus/costanza/muscleIds.mm-1.js"() {
    MUSCLE_MAP_VERSION = "mm-1";
    MUSCLE_IDS = Object.freeze([
      "pettorali",
      "dorsali",
      "trapezi_romboidi",
      "deltoidi_anteriori",
      "deltoidi_laterali",
      "deltoidi_posteriori",
      "bicipiti",
      "tricipiti",
      "avambracci",
      "addominali",
      "obliqui",
      "lombari",
      "glutei",
      "quadricipiti",
      "femorali",
      "adduttori",
      "polpacci"
    ]);
    MUSCLE_LABELS = Object.freeze({
      pettorali: "Pettorali",
      dorsali: "Dorsali",
      trapezi_romboidi: "Trapezi / romboidi",
      deltoidi_anteriori: "Deltoidi anteriori",
      deltoidi_laterali: "Deltoidi laterali",
      deltoidi_posteriori: "Deltoidi posteriori",
      bicipiti: "Bicipiti",
      tricipiti: "Tricipiti",
      avambracci: "Avambracci",
      addominali: "Addominali",
      obliqui: "Obliqui",
      lombari: "Lombari",
      glutei: "Glutei",
      quadricipiti: "Quadricipiti",
      femorali: "Femorali",
      adduttori: "Adduttori",
      polpacci: "Polpacci"
    });
    COSTANZA_UI_GROUPS = Object.freeze([
      {
        id: "petto",
        label: "Petto",
        forceCi: true,
        muscleIds: Object.freeze(["pettorali"])
      },
      {
        id: "schiena",
        label: "Schiena",
        forceCi: true,
        muscleIds: Object.freeze(["dorsali", "trapezi_romboidi", "lombari"])
      },
      {
        id: "spalle",
        label: "Spalle",
        forceCi: true,
        muscleIds: Object.freeze(["deltoidi_anteriori", "deltoidi_laterali", "deltoidi_posteriori"])
      },
      {
        id: "braccia",
        label: "Braccia",
        forceCi: false,
        muscleIds: Object.freeze(["bicipiti", "tricipiti", "avambracci"])
      },
      {
        id: "gambe",
        label: "Gambe",
        forceCi: true,
        muscleIds: Object.freeze(["quadricipiti", "glutei", "femorali", "adduttori", "polpacci"])
      },
      {
        id: "core",
        label: "Core",
        forceCi: true,
        muscleIds: Object.freeze(["addominali", "obliqui", "lombari"])
      }
    ]);
    FORCE_CI_GROUP_IDS = Object.freeze(
      COSTANZA_UI_GROUPS.filter((g) => g.forceCi).map((g) => g.id)
    );
    DEFAULT_WEEKLY_GOAL_DAYS = 2;
    WEEKLY_GOAL_CHOICES = Object.freeze([2, 3, 4]);
  }
});

// src/features/kentuFocus/costanza/muscleMap.mm-1.js
function mapChipToMuscles(chipId) {
  const id = String(chipId || "").trim();
  if (!id) return Object.freeze([]);
  const hit = CHIP_MAP[id];
  if (hit) return hit;
  if (/^schiena$/i.test(id)) return CHIP_MAP.Dorso;
  return Object.freeze([]);
}
function mergeMuscleWeights(contributions) {
  const out = {};
  for (const row of contributions || []) {
    const id = String(row?.muscleId || "").trim();
    const w = Number(row?.weight);
    if (!id || !Number.isFinite(w) || w <= 0) continue;
    const prev = out[id] || 0;
    out[id] = Math.max(prev, w >= 1 ? 1 : w);
  }
  for (const id of Object.keys(out)) {
    if (out[id] > 1) out[id] = 1;
  }
  return out;
}
function resolveSessionChips(entry) {
  if (!entry || typeof entry !== "object") return [];
  if (classifyWorkoutByType(entry).kind !== "strength") return [];
  const raw = entry.muscles ?? entry.muscleGroups ?? entry.groups ?? [];
  const chips = normalizeMuscleGroupArray(Array.isArray(raw) ? raw : [raw]);
  if (chips.length > 0) return chips;
  const typeId = workoutTypeId(entry);
  const fallback = TYPE_FALLBACK_CHIPS[typeId];
  return fallback ? [...fallback] : [];
}
function sessionMuscleWeights(entry) {
  const chips = resolveSessionChips(entry);
  if (chips.length === 0) return {};
  const rows = [];
  for (const chip of chips) {
    for (const row of mapChipToMuscles(chip)) rows.push(row);
  }
  return mergeMuscleWeights(rows);
}
function sessionTrainedMuscleIds(entry) {
  const weights = sessionMuscleWeights(entry);
  return Object.keys(weights).filter((id) => weights[id] >= 1).sort();
}
var CHIP_MAP, TYPE_FALLBACK_CHIPS;
var init_muscleMap_mm_1 = __esm({
  "src/features/kentuFocus/costanza/muscleMap.mm-1.js"() {
    init_activityCatalog();
    init_workoutMovement();
    init_muscleIds_mm_1();
    CHIP_MAP = Object.freeze({
      Petto: Object.freeze([
        { muscleId: "pettorali", weight: 1 },
        { muscleId: "tricipiti", weight: 0.5 },
        { muscleId: "deltoidi_anteriori", weight: 0.5 }
      ]),
      Dorso: Object.freeze([
        { muscleId: "dorsali", weight: 1 },
        { muscleId: "trapezi_romboidi", weight: 1 },
        { muscleId: "bicipiti", weight: 0.5 },
        { muscleId: "deltoidi_posteriori", weight: 0.5 },
        { muscleId: "avambracci", weight: 0.5 },
        { muscleId: "lombari", weight: 0.5 }
      ]),
      Spalle: Object.freeze([
        { muscleId: "deltoidi_anteriori", weight: 1 },
        { muscleId: "deltoidi_laterali", weight: 1 },
        { muscleId: "deltoidi_posteriori", weight: 1 },
        { muscleId: "tricipiti", weight: 0.5 },
        { muscleId: "trapezi_romboidi", weight: 0.5 }
      ]),
      Gambe: Object.freeze([
        { muscleId: "quadricipiti", weight: 1 },
        { muscleId: "glutei", weight: 1 },
        { muscleId: "femorali", weight: 0.5 },
        { muscleId: "adduttori", weight: 0.5 },
        { muscleId: "polpacci", weight: 0.5 },
        { muscleId: "lombari", weight: 0.5 }
      ]),
      bicipiti: Object.freeze([
        { muscleId: "bicipiti", weight: 1 },
        { muscleId: "avambracci", weight: 0.5 }
      ]),
      tricipiti: Object.freeze([
        { muscleId: "tricipiti", weight: 1 }
      ]),
      avambracci: Object.freeze([
        { muscleId: "avambracci", weight: 1 }
      ]),
      abs: Object.freeze([
        { muscleId: "addominali", weight: 1 },
        { muscleId: "obliqui", weight: 1 }
      ]),
      Core: Object.freeze([
        { muscleId: "addominali", weight: 1 },
        { muscleId: "obliqui", weight: 1 },
        { muscleId: "lombari", weight: 1 },
        { muscleId: "glutei", weight: 0.5 }
      ]),
      "Total Body": Object.freeze(
        MUSCLE_IDS.map((muscleId) => Object.freeze({ muscleId, weight: 0.5 }))
      )
    });
    TYPE_FALLBACK_CHIPS = Object.freeze({
      scale: ["Gambe"],
      alzate_sedia: ["Gambe"]
    });
  }
});

// src/features/kentuFocus/costanza/costanzaForza.js
function dayRawLog(fullHistory, dateKey) {
  const node = fullHistory?.[`trackerStorico_${dateKey}`];
  if (!node || typeof node !== "object") return [];
  if (node.log != null) return node.log;
  if (node.dati && typeof node.dati === "object" && node.dati.log != null) return node.dati.log;
  return [];
}
function normalizeWeeklyGoalDays(raw) {
  const n = Number(raw);
  if (WEEKLY_GOAL_CHOICES.includes(n)) return n;
  return DEFAULT_WEEKLY_GOAL_DAYS;
}
function weekMondayOf(iso) {
  if (!isIsoDateString(iso)) return null;
  const d = /* @__PURE__ */ new Date(`${iso}T12:00:00`);
  const day = d.getDay();
  const back = day === 0 ? 6 : day - 1;
  return addCalendarDays(iso, -back);
}
function weekSundayOf(monday) {
  if (!isIsoDateString(monday)) return null;
  return addCalendarDays(monday, 6);
}
function datesInclusive(from, to) {
  if (!isIsoDateString(from) || !isIsoDateString(to) || from > to) return [];
  const out = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addCalendarDays(cur, 1);
  }
  return out;
}
function strengthSessionsByDay(fullHistory, asOfDate, lookbackDays = 90) {
  const map = /* @__PURE__ */ new Map();
  if (!isIsoDateString(asOfDate)) return map;
  const span = Math.max(1, Math.floor(Number(lookbackDays) || 90));
  const minDate = addCalendarDays(asOfDate, -(span - 1));
  const byId = /* @__PURE__ */ new Map();
  let anonymous = 0;
  for (let back = 0; back < span; back += 1) {
    const dateKey = addCalendarDays(asOfDate, -back);
    if (dateKey < minDate) break;
    for (const entry of expandTrackerLogEntries(dayRawLog(fullHistory, dateKey))) {
      if (!entry || typeof entry !== "object") continue;
      if (entry.isGhost === true) continue;
      const kind = String(entry.type || "").trim().toLowerCase();
      if (kind && kind !== "workout") continue;
      const typed = { ...entry, type: "workout", __dateKey: dateKey };
      if (classifyWorkoutByType(typed).kind !== "strength") continue;
      if (resolveSessionChips(typed).length === 0) continue;
      const id = String(entry.id || entry.nodeId || "").trim();
      const key = id || `${dateKey}:anon:${anonymous}`;
      anonymous += 1;
      if (byId.has(key)) continue;
      byId.set(key, typed);
    }
  }
  for (const entry of byId.values()) {
    const day = String(entry.__dateKey || "").slice(0, 10);
    const list = map.get(day) || [];
    list.push(entry);
    map.set(day, list);
  }
  return map;
}
function strengthDaySet(byDay) {
  return new Set(byDay.keys());
}
function forceDaysInCalendarWeek(strengthDays, asOfDate) {
  const monday = weekMondayOf(asOfDate);
  const sunday = weekSundayOf(monday);
  const days = datesInclusive(monday, sunday).filter((d) => strengthDays.has(d) && d <= asOfDate);
  return { monday, sunday, days, count: days.length };
}
function computeWeekStreak(strengthDays, asOfDate, weeklyGoal) {
  const goal = normalizeWeeklyGoalDays(weeklyGoal);
  const thisMonday = weekMondayOf(asOfDate);
  if (!thisMonday) return 0;
  const thisSunday = weekSundayOf(thisMonday);
  const weekClosed = asOfDate >= thisSunday;
  let streak = 0;
  let monday = weekClosed ? thisMonday : addCalendarDays(thisMonday, -7);
  for (let i = 0; i < 52; i += 1) {
    const sunday = weekSundayOf(monday);
    const count = datesInclusive(monday, sunday).filter((d) => strengthDays.has(d)).length;
    if (count >= goal) {
      streak += 1;
      monday = addCalendarDays(monday, -7);
      continue;
    }
    break;
  }
  return streak;
}
function sumMuscleWeightsInRange(byDay, from, to) {
  const sums = {};
  for (const id of MUSCLE_IDS) sums[id] = 0;
  for (const day of datesInclusive(from, to)) {
    for (const entry of byDay.get(day) || []) {
      const w = sessionMuscleWeights(entry);
      for (const [id, weight] of Object.entries(w)) {
        sums[id] = (sums[id] || 0) + weight;
      }
    }
  }
  return sums;
}
function lastTrainedDate(byDay, muscleId, asOfDate) {
  const days = [...byDay.keys()].filter((d) => d <= asOfDate).sort().reverse();
  for (const day of days) {
    for (const entry of byDay.get(day) || []) {
      const w = sessionMuscleWeights(entry)[muscleId] || 0;
      if (w >= 1) return day;
    }
  }
  return null;
}
function coverageStatusFromSum(sum) {
  const s = Number(sum) || 0;
  if (s >= 1) return "coperto";
  if (s > 0) return "toccato";
  return "vuoto";
}
function computeCostanzaForza(input) {
  const asOfDate = String(input?.asOfDate || "").slice(0, 10);
  const weeklyGoal = normalizeWeeklyGoalDays(input?.weeklyGoalDays);
  const byDay = strengthSessionsByDay(input?.fullHistory, asOfDate);
  const strengthDays = strengthDaySet(byDay);
  const week = forceDaysInCalendarWeek(strengthDays, asOfDate);
  const streak = computeWeekStreak(strengthDays, asOfDate, weeklyGoal);
  const windowFrom = addCalendarDays(asOfDate, -6);
  const sums7 = sumMuscleWeightsInRange(byDay, windowFrom, asOfDate);
  const lookback30From = addCalendarDays(asOfDate, -29);
  const muscles = {};
  for (const id of MUSCLE_IDS) {
    const sum7 = sums7[id] || 0;
    const last = lastTrainedDate(byDay, id, asOfDate);
    let daysSince = null;
    if (last) {
      const a = /* @__PURE__ */ new Date(`${last}T12:00:00`);
      const b = /* @__PURE__ */ new Date(`${asOfDate}T12:00:00`);
      daysSince = Math.round((b - a) / 864e5);
    }
    const trainedIn30 = last != null && last >= lookback30From;
    muscles[id] = {
      status: coverageStatusFromSum(sum7),
      sum7,
      lastTrained: last,
      daysSinceTrained: daysSince,
      neverIn30: !trainedIn30
    };
  }
  const groups = {};
  for (const g of COSTANZA_UI_GROUPS) {
    let best = "vuoto";
    for (const mid of g.muscleIds) {
      const st = muscles[mid]?.status || "vuoto";
      if (st === "coperto") best = "coperto";
      else if (st === "toccato" && best === "vuoto") best = "toccato";
    }
    groups[g.id] = { status: best, muscleIds: [...g.muscleIds] };
  }
  const forceCiCovered = FORCE_CI_GROUP_IDS.filter((gid) => groups[gid]?.status === "coperto").length;
  return {
    version: MUSCLE_MAP_VERSION,
    asOfDate,
    weeklyGoalDays: weeklyGoal,
    forceDaysThisWeek: week.count,
    forceDayDatesThisWeek: week.days,
    weekMonday: week.monday,
    weekSunday: week.sunday,
    weekStreak: streak,
    muscles,
    groups,
    forceCiCoveredCount: forceCiCovered,
    forceCiGroupTotal: FORCE_CI_GROUP_IDS.length,
    uiGroups: COSTANZA_UI_GROUPS
  };
}
var init_costanzaForza = __esm({
  "src/features/kentuFocus/costanza/costanzaForza.js"() {
    init_focusDateUtils();
    init_expandTrackerDayLog();
    init_workoutMovement();
    init_muscleIds_mm_1();
    init_muscleMap_mm_1();
  }
});

// src/features/trendHub/utils/muscleSpillover.js
var muscleSpilloverMatrix, SPILLOVER_MUSCLE_KEYS;
var init_muscleSpillover = __esm({
  "src/features/trendHub/utils/muscleSpillover.js"() {
    init_costanzaForza();
    muscleSpilloverMatrix = Object.freeze({
      petto: Object.freeze({ petto: 50, spalle: 20, braccia: 25 }),
      schiena: Object.freeze({ schiena: 50, spalle: 15, braccia: 25 }),
      gambe: Object.freeze({ gambe: 50, core: 30 }),
      spalle: Object.freeze({ spalle: 50, braccia: 20, core: 10 }),
      braccia: Object.freeze({ braccia: 50 }),
      core: Object.freeze({ core: 50 })
    });
    SPILLOVER_MUSCLE_KEYS = Object.freeze([
      "petto",
      "schiena",
      "gambe",
      "spalle",
      "braccia",
      "core"
    ]);
  }
});

// src/features/commandTerminal/context/workoutMovement.js
function durationAmountToMinutes(amount) {
  const dur = Number(amount);
  if (!Number.isFinite(dur) || dur <= 0) return 0;
  return dur > 5 ? dur : dur * 60;
}
function resolveWorkoutDurationMinutes(entry) {
  if (typeof entry === "number") return durationAmountToMinutes(entry);
  if (!entry || typeof entry !== "object") return 0;
  const explicit = Number(entry.durationMinutes ?? entry.durationMin);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return durationAmountToMinutes(entry.duration ?? entry.minutes ?? entry.hours);
}
function workoutTypeId(entry) {
  if (!entry || typeof entry !== "object") return "";
  const candidates = [entry.workoutType, entry.subType, entry.activityType];
  if (typeof entry.activity === "string") candidates.push(entry.activity);
  for (const raw of candidates) {
    const id = String(raw || "").trim().toLowerCase();
    if (id && id !== "workout" && id !== "activity") return id;
  }
  return "";
}
function workoutLabel(entry) {
  return String(entry?.name || entry?.desc || entry?.label || entry?.title || "").trim();
}
function classifyWorkoutByType(entry) {
  const typeId = workoutTypeId(entry);
  if (WALK_TYPE_IDS.has(typeId)) return { kind: "walk", typeId, source: "workoutType" };
  if (VIGOROUS_TYPE_IDS.has(typeId)) return { kind: "vigorous", typeId, source: "workoutType" };
  if (STRENGTH_TYPE_IDS.has(typeId)) return { kind: "strength", typeId, source: "workoutType" };
  const label = workoutLabel(entry);
  if (!label) return { kind: "other", typeId, source: "none" };
  if (STRENGTH_LABEL.test(label)) return { kind: "strength", typeId, source: "label" };
  if (WALK_LABEL.test(label)) return { kind: "walk", typeId, source: "label" };
  if (VIGOROUS_LABEL.test(label)) return { kind: "vigorous", typeId, source: "label" };
  return { kind: "other", typeId, source: "label" };
}
function equivalentAerobicMinutes(entry) {
  const minutes = resolveWorkoutDurationMinutes(entry);
  if (!(minutes > 0)) return 0;
  const kind = classifyWorkoutByType(entry).kind;
  if (kind === "walk") return minutes;
  if (kind === "vigorous") return minutes * VIGOROUS_EQUIVALENT_FACTOR;
  return 0;
}
var VIGOROUS_EQUIVALENT_FACTOR, WALK_TYPE_IDS, VIGOROUS_TYPE_IDS, STRENGTH_TYPE_IDS, STRENGTH_TYPE_PRIMARIES, STRENGTH_LABEL, WALK_LABEL, VIGOROUS_LABEL;
var init_workoutMovement = __esm({
  "src/features/commandTerminal/context/workoutMovement.js"() {
    init_activityCatalog();
    init_muscleSpillover();
    VIGOROUS_EQUIVALENT_FACTOR = 2;
    WALK_TYPE_IDS = /* @__PURE__ */ new Set([
      "camminata",
      "walking",
      "passi",
      "walk",
      "passeggio",
      "liss",
      "zona2",
      "z2"
    ]);
    VIGOROUS_TYPE_IDS = /* @__PURE__ */ new Set([
      "corsa",
      "running",
      "run",
      "jog",
      "jogging",
      "bici",
      "bike",
      "cycling",
      "ciclismo",
      "cyclette",
      "spinning",
      "indoor_bike",
      "nuoto",
      "swim",
      "swimming",
      "cardio",
      "hiit",
      "ellittica",
      "elliptical",
      "remo",
      "rowing",
      "rower",
      "tapis",
      "tapis_roulant",
      "treadmill"
    ]);
    STRENGTH_TYPE_IDS = /* @__PURE__ */ new Set([
      "pesi",
      "corpo_libero",
      "elastici",
      "lavori_pesanti",
      "scale",
      "alzate_sedia",
      "spinta",
      "trazione",
      "gambe",
      "push",
      "pull",
      "legs",
      "strength",
      "hypertrophy",
      "ipertrofia",
      "forza"
    ]);
    STRENGTH_TYPE_PRIMARIES = Object.freeze({
      scale: ["gambe"],
      alzate_sedia: ["gambe"]
    });
    STRENGTH_LABEL = /(?:^|[^a-z0-9àèéìòù])(pesi|palestra|squat|corpo libero|elastici|lavori pesanti|scale|alzate|bicipit|tricipit|sollevamento|manubri|bilanciere|strength|ipertrof|forza)(?:[^a-z0-9àèéìòù]|$)/i;
    WALK_LABEL = new RegExp("(?:^|[^a-z0-9\xE0\xE8\xE9\xEC\xF2\xF9])(camminat\\p{L}*|passeggiat\\p{L}*|walking|walk)(?=[^a-z0-9\xE0\xE8\xE9\xEC\xF2\xF9]|$)", "iu");
    VIGOROUS_LABEL = new RegExp("(?:^|[^a-z0-9\xE0\xE8\xE9\xEC\xF2\xF9])(hiit|corsa|running|jog\\p{L}*|bici|bike|cicl\\p{L}*|nuoto|swim\\p{L}*|ellitt\\p{L}*|cardio|remo|rowing|rower|tapis|treadmill|cyclette|spinning)(?=[^a-z0-9\xE0\xE8\xE9\xEC\xF2\xF9]|$)", "iu");
  }
});

// functions/mcp/shims/getTrackerDayNode.js
function isIsoDateString2(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}
function getTrackerDayNode(fullHistory, date) {
  if (!fullHistory || typeof fullHistory !== "object" || !isIsoDateString2(date)) {
    return null;
  }
  const key = `trackerStorico_${date}`;
  const node = fullHistory[key];
  return node && typeof node === "object" ? node : null;
}
var init_getTrackerDayNode = __esm({
  "functions/mcp/shims/getTrackerDayNode.js"() {
  }
});

// functions/mcp/shims/draftParser.js
var init_draftParser = __esm({
  "functions/mcp/shims/draftParser.js"() {
  }
});

// src/utils/mealDraftStatus.js
function isUnresolvedMealDraftItem(item) {
  if (!item || typeof item !== "object") return false;
  return MEAL_DRAFT_UNRESOLVED_STATUSES.has(String(item.status || "").toLowerCase());
}
var MEAL_DRAFT_UNRESOLVED_STATUSES;
var init_mealDraftStatus = __esm({
  "src/utils/mealDraftStatus.js"() {
    init_draftParser();
    MEAL_DRAFT_UNRESOLVED_STATUSES = /* @__PURE__ */ new Set([
      "raw",
      "pending",
      "pending_enrichment",
      "requires_disambiguation",
      "processing",
      "validating"
    ]);
  }
});

// src/utils/computeTotaliCore.js
function readLogItemNutrient(item, key) {
  if (!item || typeof item !== "object") return null;
  if (key === "fatTotal") {
    const fat = item.fatTotal ?? item.fat ?? item.fatTot;
    return fat != null && typeof fat === "number" && Number.isFinite(fat) ? fat : null;
  }
  const direct = item[key];
  if (direct != null && typeof direct === "number" && Number.isFinite(direct)) return direct;
  for (const alias of LOG_ITEM_NUTRIENT_ALIASES[key] || []) {
    const raw = item[alias];
    if (raw == null || typeof raw !== "number" || !Number.isFinite(raw)) continue;
    if (key === "na" && alias === "sale") {
      return Math.round(raw * SALT_G_TO_SODIUM_MG * 100) / 100;
    }
    return raw;
  }
  return null;
}
function buildEmptyTotali() {
  const init = { kcal: 0, workout: 0 };
  ALL_NUTRIENT_KEYS.forEach((k) => {
    init[k] = 0;
  });
  return init;
}
function computeTotali(dailyLog) {
  const totali = buildEmptyTotali();
  let workoutKcal = 0;
  const log = Array.isArray(dailyLog) ? dailyLog : [];
  log.forEach((item) => {
    if (item.type === "food" || item.type === "recipe") {
      if (isUnresolvedMealDraftItem(item)) return;
      totali.kcal += Number(item.kcal || item.cal || 0) || 0;
      ALL_NUTRIENT_KEYS.forEach((k) => {
        const raw = readLogItemNutrient(item, k);
        if (raw != null) totali[k] += raw;
      });
    } else if (item.type === "stimulant" || item.type === "energizer") {
      const kcal = Number(item.kcal || item.cal || 0) || 0;
      const carb = Number(item.carb || item.carbs || 0) || 0;
      if (item.isFastingSafe === true || kcal <= 5 && carb <= 0) return;
      totali.kcal += kcal;
      ALL_NUTRIENT_KEYS.forEach((k) => {
        const raw = readLogItemNutrient(item, k);
        if (raw != null) totali[k] += raw;
      });
    } else if (item.type === "workout") {
      workoutKcal += Number(item.kcal || item.cal || 0) || 0;
    }
  });
  totali.workout = workoutKcal;
  return totali;
}
var TARGETS, ALL_NUTRIENT_KEYS, LOG_ITEM_NUTRIENT_ALIASES, SALT_G_TO_SODIUM_MG;
var init_computeTotaliCore = __esm({
  "src/utils/computeTotaliCore.js"() {
    init_mealDraftStatus();
    TARGETS = {
      macro: { prot: 140, carb: 300, fatTotal: 85, fibre: 30 },
      amino: { leu: 2900, iso: 1500, val: 1900, lys: 2200, met: 1100, phe: 1800, thr: 1100, trp: 300, his: 750 },
      vit: { vitA: 900, vitB1: 1.2, vitB2: 1.3, vitB3: 16, vitB5: 5, vitB6: 1.3, b9: 400, vitB12: 2.4, vitc: 90, vitD: 15, vitE: 15, vitK: 120 },
      min: { ca: 1e3, fe: 18, mg: 420, p: 700, k: 3400, na: 2e3, zn: 11, cu: 0.9, se: 55 },
      fat: { fatSat: 20, fatTrans: 2, fatMono: 45, fatPoly: 20, omega3: 2, omega6: 10, colest: 300 }
    };
    ALL_NUTRIENT_KEYS = Object.values(TARGETS).flatMap((g) => Object.keys(g));
    LOG_ITEM_NUTRIENT_ALIASES = {
      vitB2: ["b2"],
      vitB6: ["b6"],
      fibre: ["fibreTotali", "fiber"],
      na: ["sodium", "sale"],
      fatTotal: ["fat", "fatTot"]
    };
    SALT_G_TO_SODIUM_MG = 393.4;
  }
});

// src/features/kentuFocus/contracts/focusDossier.v1.js
function focusMetric(value, opts) {
  const provenance = opts?.provenance;
  if (!FOCUS_PROVENANCE[provenance]) {
    throw new Error(`focusMetric: provenance non valida: ${provenance}`);
  }
  const metric = {
    value: value === void 0 ? null : value,
    provenance
  };
  if (opts.unit != null) metric.unit = opts.unit;
  if (opts.certainty != null) metric.certainty = opts.certainty;
  if (opts.source != null) metric.source = opts.source;
  if (opts.measuredOn !== void 0) metric.measuredOn = opts.measuredOn;
  return metric;
}
function missingMetric(unit) {
  return focusMetric(null, {
    unit,
    provenance: FOCUS_PROVENANCE.missing
  });
}
var FOCUS_PROVENANCE, FOCUS_CERTAINTY, FOCUS_MEAL_TYPES;
var init_focusDossier_v1 = __esm({
  "src/features/kentuFocus/contracts/focusDossier.v1.js"() {
    FOCUS_PROVENANCE = Object.freeze({
      recorded: "recorded",
      /** @deprecated Preferire `derived` per bedtime = wake−hours. */
      calculated: "calculated",
      /** Valore ricavato da altri campi recorded (es. bedtime = wakeTime − hours). */
      derived: "derived",
      estimated: "estimated",
      missing: "missing",
      /** Origine non ricostruibile (micronutrienti / legacy); non usare per bedtime nuovi. */
      ambiguous: "ambiguous"
    });
    FOCUS_CERTAINTY = Object.freeze({
      high: "high",
      medium: "medium",
      low: "low"
    });
    FOCUS_MEAL_TYPES = Object.freeze([
      "colazione",
      "pranzo",
      "cena",
      "snack",
      "unknown"
    ]);
  }
});

// src/features/kentuFocus/normalize/logUtils.js
function getLogArray(node) {
  return expandTrackerLogEntries(pickDayLogRaw(node));
}
function getManualNodesArray(node) {
  if (!node || typeof node !== "object") return [];
  return expandTrackerLogEntries(node.manualNodes);
}
function dedupeById(items, getId) {
  return dedupeByIdWithStats(items, getId).items;
}
function dedupeByIdWithStats(items, getId) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const duplicateIds = [];
  for (const item of items) {
    const id = getId(item);
    if (id != null && id !== "") {
      const key = String(id);
      if (seen.has(key)) {
        duplicateIds.push(key);
        continue;
      }
      seen.add(key);
    }
    out.push(item);
  }
  return {
    items: out,
    duplicatesRemoved: duplicateIds.length,
    duplicateIds
  };
}
function finiteNumber(n) {
  if (n == null || n === "") return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}
var init_logUtils = __esm({
  "src/features/kentuFocus/normalize/logUtils.js"() {
    init_expandTrackerDayLog();
  }
});

// src/features/kentuFocus/normalize/focusMealSlots.js
function getMealSlotBase(raw) {
  const str = String(raw ?? "").trim().toLowerCase();
  if (!str) return "";
  if (ALIAS_TO_CANONICAL[str]) return str;
  if (!str.includes("_")) return str;
  const idx = str.indexOf("_");
  const base = str.slice(0, idx);
  const suffix = str.slice(idx + 1);
  if (/^\d+(\.\d+)?$/.test(suffix)) return base || str;
  return str;
}
function canonicalizeMealType(raw) {
  const base = getMealSlotBase(raw);
  if (!base) return "unknown";
  if (ALIAS_TO_CANONICAL[base]) return ALIAS_TO_CANONICAL[base];
  if (base === "colazione" || base === "pranzo" || base === "cena" || base === "snack") {
    return base;
  }
  return "unknown";
}
function resolveFocusMealIdentity(item) {
  const raw = item?.mealType ?? item?.mealId ?? item?.mealSlotId ?? "";
  const mealSlotId = String(raw || "").trim() || "unknown";
  return {
    mealSlotId,
    canonicalMealType: canonicalizeMealType(mealSlotId)
  };
}
function resolveFoodClockHourDetailed(item, mealTimes) {
  const direct = parseDecimalHour(item?.mealTime ?? item?.time ?? item?.clockHour);
  if (direct != null) {
    return { hour: direct, source: "item.mealTime" };
  }
  const times = mealTimes && typeof mealTimes === "object" ? mealTimes : null;
  if (!times) return { hour: null, source: null };
  const { mealSlotId, canonicalMealType } = resolveFocusMealIdentity(item);
  const base = getMealSlotBase(mealSlotId);
  if (times[mealSlotId] != null) {
    const h = parseDecimalHour(times[mealSlotId]);
    if (h != null) return { hour: h, source: "mealTimes.exact_slot" };
  }
  if (base && base !== mealSlotId && times[base] != null) {
    const h = parseDecimalHour(times[base]);
    if (h != null) return { hour: h, source: "mealTimes.slot_base" };
  }
  if (canonicalMealType !== "unknown" && canonicalMealType !== mealSlotId && canonicalMealType !== base && times[canonicalMealType] != null) {
    const h = parseDecimalHour(times[canonicalMealType]);
    if (h != null) return { hour: h, source: "mealTimes.canonical" };
  }
  return { hour: null, source: null };
}
var ALIAS_TO_CANONICAL;
var init_focusMealSlots = __esm({
  "src/features/kentuFocus/normalize/focusMealSlots.js"() {
    init_focusDateUtils();
    ALIAS_TO_CANONICAL = Object.freeze({
      colazione: "colazione",
      merenda1: "colazione",
      pranzo: "pranzo",
      cena: "cena",
      snack: "snack",
      spuntino: "snack",
      merenda_am: "snack",
      merenda_pm: "snack",
      merenda2: "snack",
      merenda: "snack"
    });
  }
});

// src/features/kentuFocus/normalize/focusNutritionPlausibility.js
var FOCUS_NUTRITION_PLAUSIBILITY;
var init_focusNutritionPlausibility = __esm({
  "src/features/kentuFocus/normalize/focusNutritionPlausibility.js"() {
    init_logUtils();
    init_mealDraftStatus();
    FOCUS_NUTRITION_PLAUSIBILITY = Object.freeze({
      recorded: "recorded",
      suspect: "suspect",
      insufficient_evidence: "insufficient_evidence"
    });
  }
});

// src/features/kentuFocus/normalize/normalizeFoodEvents.js
function collectDayLogForNutrition(analysisDayNode) {
  return collectDayLogForNutritionWithQuality(analysisDayNode).dayLog;
}
function collectDayLogForNutritionWithQuality(analysisDayNode) {
  const log = getLogArray(analysisDayNode);
  const manual = getManualNodesArray(analysisDayNode);
  const raw = [...log, ...manual];
  const deduped = dedupeByIdWithStats(raw, (e) => e?.id);
  const totalsRaw = computeTotali(raw);
  const totalsDeduped = computeTotali(deduped.items);
  const nutritionTotalsAffectedByDedupe = Number(totalsRaw.kcal) !== Number(totalsDeduped.kcal) || Number(totalsRaw.prot) !== Number(totalsDeduped.prot);
  return {
    dayLog: deduped.items,
    quality: {
      duplicatesRemoved: deduped.duplicatesRemoved,
      duplicateIds: deduped.duplicateIds,
      nutritionTotalsAffectedByDedupe,
      kcalBeforeDedupe: Number(totalsRaw.kcal) || 0,
      kcalAfterDedupe: Number(totalsDeduped.kcal) || 0
    }
  };
}
var init_normalizeFoodEvents = __esm({
  "src/features/kentuFocus/normalize/normalizeFoodEvents.js"() {
    init_computeTotaliCore();
    init_mealDraftStatus();
    init_focusDossier_v1();
    init_logUtils();
    init_focusMealSlots();
    init_focusNutritionPlausibility();
    init_focusMealSlots();
  }
});

// src/features/dayStatus/dayStatus.js
function getDayStatus(date, context = {}) {
  if (!isIsoDate2(date) || !isIsoDateString(date)) return null;
  const today = String(context.today || "").slice(0, 10);
  if (!isIsoDate2(today)) return null;
  const record = normalizeDayStatusRecord(
    context.record !== void 0 ? context.record : context.records?.[date]
  );
  if (record?.paused) return "paused";
  if (date > today) return "future";
  if (date === today) return "in_progress";
  if (record?.approximate) return "approximate";
  const dayNode4 = getTrackerDayNode(context.fullHistory, date);
  if (isLoggedLate(date, dayNode4, record)) return "late";
  if (record?.confirmed) return "closed";
  if (dayHasRegistration(dayNode4)) return "unconfirmed";
  return "hole";
}
function detectDayGaps(date, context = {}) {
  const empty = {
    date: isIsoDate2(date) ? date : null,
    hasGaps: false,
    reasons: [],
    mainMeals: [],
    mainMealCount: 0,
    lastMealHour: null,
    kcal: 0,
    targetKcal: finiteTarget(context.targetKcal),
    energyRatio: null,
    hasFood: false
  };
  if (!isIsoDate2(date)) return empty;
  const dayNode4 = getTrackerDayNode(context.fullHistory, date);
  const foods = foodEntries(dayNode4);
  const mainMeals = [...new Set(
    foods.map((item) => resolveFocusMealIdentity(item).canonicalMealType).filter((meal) => MAIN_MEALS.has(meal))
  )].sort((a, b) => MAIN_MEAL_ORDER.indexOf(a) - MAIN_MEAL_ORDER.indexOf(b));
  const hours = foods.map((item) => resolveFoodClockHourDetailed(item, dayNode4?.mealTimes).hour).filter((hour) => hour != null && Number.isFinite(hour));
  const lastMealHour2 = hours.length ? Math.max(...hours) : null;
  const kcal = Math.round(Number(computeTotali(foods).kcal) || 0);
  const targetKcal = finiteTarget(context.targetKcal);
  const energyRatio = targetKcal != null && targetKcal > 0 ? Math.round(kcal / targetKcal * 1e3) / 1e3 : null;
  const reasons = [];
  if (foods.length > 0 && mainMeals.length === 1) reasons.push("singleMainMeal");
  if (foods.length > 0 && (lastMealHour2 == null || lastMealHour2 <= GAP_EVENING_HOUR)) {
    reasons.push("noMealAfter17");
  }
  if (foods.length > 0 && energyRatio != null && energyRatio < GAP_ENERGY_RATIO) {
    reasons.push("lowEnergy");
  }
  return {
    date,
    hasGaps: reasons.length > 0,
    reasons,
    mainMeals,
    mainMealCount: mainMeals.length,
    lastMealHour: lastMealHour2,
    kcal,
    targetKcal,
    energyRatio,
    hasFood: foods.length > 0
  };
}
function lateThresholdMs(date) {
  const end = /* @__PURE__ */ new Date(`${addCalendarDays(date, 1)}T00:00:00`);
  return end.getTime() + LATE_AFTER_HOURS * 60 * 60 * 1e3;
}
function isLoggedLate(date, dayNode4, record) {
  if (record?.loggedLateAt != null) return true;
  const earliest = earliestLogEpoch(dayNode4);
  if (earliest == null) return false;
  return earliest > lateThresholdMs(date);
}
function earliestLogEpoch(dayNode4) {
  let min = null;
  for (const item of collectDayLogForNutrition(dayNode4)) {
    const stamp = finiteEpoch(item?.loggedAt ?? item?.createdAt ?? item?.timestamp);
    if (stamp == null) continue;
    if (min == null || stamp < min) min = stamp;
  }
  return min;
}
function dayHasRegistration(dayNode4) {
  if (!dayNode4 || typeof dayNode4 !== "object") return false;
  if (dayNode4.isIntentionalFast === true) return true;
  return collectDayLogForNutrition(dayNode4).some((item) => {
    const type = String(item?.type || "").toLowerCase();
    if (REGISTERED_TYPES.has(type)) return true;
    if (!type && (item?.kcal != null || item?.cal != null || item?.desc || item?.name)) return true;
    return false;
  });
}
function foodEntries(dayNode4) {
  return collectDayLogForNutrition(dayNode4).filter((item) => {
    const type = String(item?.type || "food").toLowerCase();
    return type === "food" || type === "recipe";
  });
}
function finiteTarget(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
var DAY_STATUSES, MAIN_MEAL_ORDER, MAIN_MEALS, REGISTERED_TYPES, LATE_AFTER_HOURS, GAP_ENERGY_RATIO, GAP_EVENING_HOUR;
var init_dayStatus = __esm({
  "src/features/dayStatus/dayStatus.js"() {
    init_getTrackerDayNode();
    init_normalizeFoodEvents();
    init_focusMealSlots();
    init_computeTotaliCore();
    init_focusDateUtils();
    init_dayStatusRecord();
    DAY_STATUSES = Object.freeze([
      "future",
      "in_progress",
      "closed",
      "unconfirmed",
      "hole",
      "paused",
      "late",
      "approximate"
    ]);
    MAIN_MEAL_ORDER = ["colazione", "pranzo", "cena"];
    MAIN_MEALS = new Set(MAIN_MEAL_ORDER);
    REGISTERED_TYPES = /* @__PURE__ */ new Set(["food", "recipe", "meal", "sleep", "workout"]);
    LATE_AFTER_HOURS = 48;
    GAP_ENERGY_RATIO = 0.5;
    GAP_EVENING_HOUR = 17;
  }
});

// src/features/kentuFocus/normalize/resolveMainNightSleep.js
function sleepHoursFromEntry(entry) {
  return finiteNumber(
    entry?.hours ?? entry?.duration ?? entry?.sleepHours ?? entry?.sleepDuration
  );
}
function entryTimestamp(entry) {
  const raw = entry?.updatedAt ?? entry?.ts ?? entry?.createdAt ?? entry?.timestamp;
  if (raw == null) return null;
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? t : null;
}
function dedupeSleepEntries(sleepEntries) {
  const list = Array.isArray(sleepEntries) ? sleepEntries.filter(Boolean) : [];
  const byId = /* @__PURE__ */ new Map();
  const noId = [];
  list.forEach((entry, index) => {
    const id = entry.id != null && String(entry.id).trim() ? String(entry.id) : "";
    if (!id) {
      noId.push(entry);
      return;
    }
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, { entry, index });
      return;
    }
    const prevTs = entryTimestamp(prev.entry);
    const nextTs = entryTimestamp(entry);
    if (prevTs != null && nextTs != null) {
      if (nextTs >= prevTs) byId.set(id, { entry, index });
      return;
    }
    if (index >= prev.index) byId.set(id, { entry, index });
  });
  return [...noId, ...[...byId.values()].map((x) => x.entry)];
}
function hasReliableTimeline(entry) {
  const wake = parseDecimalHour(entry?.wakeTime ?? entry?.sleepEnd);
  const bed = parseDecimalHour(entry?.bedtime ?? entry?.sleepStart);
  const hours = sleepHoursFromEntry(entry);
  if (wake != null && bed != null) return true;
  if (wake != null && hours != null && hours >= NIGHT_SLEEP_MIN_HOURS) return true;
  return false;
}
function looksLikeUncertainOvernightFragment(entry) {
  const hours = sleepHoursFromEntry(entry);
  if (hours == null || hours >= NIGHT_SLEEP_MIN_HOURS) return false;
  const wake = parseDecimalHour(entry?.wakeTime ?? entry?.sleepEnd);
  const bed = parseDecimalHour(entry?.bedtime ?? entry?.sleepStart);
  if (wake == null && bed == null) return false;
  if (bed != null && bed >= 18) return true;
  if (bed != null && wake != null && bed > wake) return true;
  return false;
}
function resolveMainNightSleep(sleepEntries) {
  const raw = Array.isArray(sleepEntries) ? sleepEntries.filter((e) => e && e.type === "sleep") : [];
  const deduped = dedupeSleepEntries(raw);
  const candidateCount = deduped.length;
  if (candidateCount === 0) {
    return {
      entry: null,
      status: MAIN_NIGHT_STATUS.absent,
      reason: "no_sleep_entries",
      candidateCount: 0,
      nightCandidateCount: 0,
      napCount: 0,
      dedupedCount: 0
    };
  }
  const nights = [];
  const naps = [];
  for (const e of deduped) {
    const h = sleepHoursFromEntry(e);
    if (h != null && h >= NIGHT_SLEEP_MIN_HOURS) nights.push(e);
    else naps.push(e);
  }
  if (nights.length === 0) {
    const napHoursSum = naps.reduce((s, e) => s + (sleepHoursFromEntry(e) ?? 0), 0);
    if (naps.length >= 2 && napHoursSum >= NIGHT_SLEEP_MIN_HOURS) {
      return {
        entry: null,
        status: MAIN_NIGHT_STATUS.ambiguous,
        reason: "fragmented_sleep_sum_reaches_night_threshold",
        candidateCount,
        nightCandidateCount: 0,
        napCount: naps.length,
        dedupedCount: deduped.length
      };
    }
    if (naps.some(looksLikeUncertainOvernightFragment)) {
      return {
        entry: null,
        status: MAIN_NIGHT_STATUS.ambiguous,
        reason: "short_episode_with_overnight_timeline",
        candidateCount,
        nightCandidateCount: 0,
        napCount: naps.length,
        dedupedCount: deduped.length
      };
    }
    return {
      entry: null,
      status: MAIN_NIGHT_STATUS.only_naps,
      reason: "only_entries_below_night_min_hours",
      candidateCount,
      nightCandidateCount: 0,
      napCount: naps.length,
      dedupedCount: deduped.length
    };
  }
  if (nights.length === 1) {
    return {
      entry: nights[0],
      status: MAIN_NIGHT_STATUS.selected,
      reason: "single_night_candidate",
      candidateCount,
      nightCandidateCount: 1,
      napCount: naps.length,
      dedupedCount: deduped.length
    };
  }
  const ranked = [...nights].sort(
    (a, b) => (sleepHoursFromEntry(b) ?? 0) - (sleepHoursFromEntry(a) ?? 0)
  );
  const top = ranked[0];
  const second = ranked[1];
  const topH = sleepHoursFromEntry(top) ?? 0;
  const secondH = sleepHoursFromEntry(second) ?? 0;
  const gap = topH - secondH;
  const complete = ranked.filter(hasReliableTimeline);
  if (complete.length === 1 && gap < HOURS_CLEAR_GAP) {
    return {
      entry: complete[0],
      status: MAIN_NIGHT_STATUS.selected,
      reason: "prefer_complete_timeline",
      candidateCount,
      nightCandidateCount: nights.length,
      napCount: naps.length,
      dedupedCount: deduped.length
    };
  }
  if (gap >= HOURS_CLEAR_GAP) {
    return {
      entry: top,
      status: MAIN_NIGHT_STATUS.selected,
      reason: "longest_night_clear_gap",
      candidateCount,
      nightCandidateCount: nights.length,
      napCount: naps.length,
      dedupedCount: deduped.length
    };
  }
  return {
    entry: null,
    status: MAIN_NIGHT_STATUS.ambiguous,
    reason: complete.length > 1 ? "multiple_comparable_nights" : "comparable_nights_unreliable_timestamps",
    candidateCount,
    nightCandidateCount: nights.length,
    napCount: naps.length,
    dedupedCount: deduped.length
  };
}
var NIGHT_SLEEP_MIN_HOURS, HOURS_CLEAR_GAP, MAIN_NIGHT_STATUS;
var init_resolveMainNightSleep = __esm({
  "src/features/kentuFocus/normalize/resolveMainNightSleep.js"() {
    init_focusDateUtils();
    init_logUtils();
    NIGHT_SLEEP_MIN_HOURS = 3;
    HOURS_CLEAR_GAP = 1;
    MAIN_NIGHT_STATUS = Object.freeze({
      selected: "selected",
      absent: "absent",
      only_naps: "only_naps",
      ambiguous: "ambiguous"
    });
  }
});

// src/features/kentuFocus/normalize/normalizeSleepNight.js
function resolveBedtimeProvenance(entry, wakeTime, hours) {
  const explicit = String(
    entry?.bedtimeProvenance ?? entry?.bedtimeSource ?? entry?._bedtimeOrigin ?? ""
  ).trim().toLowerCase();
  const bedtimeRaw = parseDecimalHour(entry?.bedtime ?? entry?.sleepStart);
  const wakeOk = wakeTime != null && Number.isFinite(Number(wakeTime));
  const hoursOk = hours != null && Number.isFinite(Number(hours)) && Number(hours) > 0;
  const expected = wakeOk && hoursOk ? computeBedtimeFromWakeAndDuration(wakeTime, hours) : null;
  const looksMidnight = bedtimeRaw != null && (bedtimeRaw === 0 || bedtimeRaw >= 23.95 || bedtimeRaw < 0.05);
  if (explicit === "recorded" || explicit === "user" || explicit === "manual") {
    if (bedtimeRaw == null) {
      return { value: null, provenance: FOCUS_PROVENANCE.missing };
    }
    return {
      value: bedtimeRaw,
      provenance: FOCUS_PROVENANCE.recorded,
      source: "explicit_bedtime_flag"
    };
  }
  if (explicit === "derived" || explicit === "calculated" || explicit === "formula") {
    if (expected == null) {
      return {
        value: null,
        provenance: FOCUS_PROVENANCE.missing,
        source: "derived_flag_without_wake_hours"
      };
    }
    return {
      value: bedtimeRaw != null ? bedtimeRaw : expected,
      provenance: FOCUS_PROVENANCE.derived,
      source: "explicit_bedtime_flag"
    };
  }
  if (expected != null) {
    if (bedtimeRaw == null) {
      return {
        value: expected,
        provenance: FOCUS_PROVENANCE.derived,
        source: "computeBedtimeFromWakeAndDuration"
      };
    }
    const delta = circularAbsHourDelta(bedtimeRaw, expected);
    if (delta != null && delta <= BEDTIME_FORMULA_MATCH_EPS_H) {
      return {
        value: bedtimeRaw,
        provenance: FOCUS_PROVENANCE.derived,
        source: "wake_minus_hours"
      };
    }
    return {
      value: bedtimeRaw,
      provenance: FOCUS_PROVENANCE.recorded,
      source: "sleep_entry_bedtime_field"
    };
  }
  if (bedtimeRaw == null || looksMidnight) {
    return {
      value: null,
      provenance: FOCUS_PROVENANCE.missing,
      source: "wake_or_hours_missing"
    };
  }
  return {
    value: bedtimeRaw,
    provenance: FOCUS_PROVENANCE.recorded,
    source: "bedtime_without_wake_hours"
  };
}
function circularAbsHourDelta(a, b) {
  const wa = wrap24(a);
  const wb = wrap24(b);
  if (wa == null || wb == null) return null;
  let d = Math.abs(wa - wb);
  if (d > 12) d = 24 - d;
  return d;
}
function pickMainNightSleepEntry(sleepEntries) {
  return resolveMainNightSleep(sleepEntries).entry;
}
function normalizeQualityStars(raw) {
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return Math.round(n);
  const label = String(raw ?? "").trim().toLowerCase();
  if (!label) return null;
  if (label.includes("ottim") || label.includes("eccell") || label === "good") return 5;
  if (label.includes("buon")) return 4;
  if (label === "ok" || label.includes("discret")) return 3;
  if (label.includes("scars")) return 2;
  if (label.includes("pess") || label === "poor" || label.includes("bad")) return 1;
  return null;
}
function qualityBandFromStars(stars) {
  if (stars == null) return null;
  if (stars >= 4) return "good";
  if (stars === 3) return "ok";
  if (stars >= 1) return "poor";
  return null;
}
function isDefaultSleepStagePlaceholder(entry, deepMin, remMin) {
  if (deepMin !== DEFAULT_SLEEP_STAGE_PLACEHOLDER_MIN) return false;
  if (remMin !== DEFAULT_SLEEP_STAGE_PLACEHOLDER_MIN) return false;
  const hr = finiteNumber(entry?.hr);
  const qualityScore = finiteNumber(entry?.qualityScore);
  const wearableHint = hr != null && hr > 0 || qualityScore != null && qualityScore > 5 || entry?.source === "wearable" || entry?.source === "WEARABLE";
  return !wearableHint;
}
function computeDinnerSleepBufferH(bedtime, lastMealHour2) {
  if (!Number.isFinite(bedtime) || !Number.isFinite(lastMealHour2)) return null;
  let delta = bedtime - lastMealHour2;
  if (delta < 0) delta += 24;
  if (delta > 18) return null;
  return Math.round(delta * 100) / 100;
}
function normalizeSleepNight(publicationDayNode, opts) {
  const publicationDate = opts.publicationDate;
  const sleepEntries = getLogArray(publicationDayNode).filter(
    (e) => e && e.type === "sleep"
  );
  const selection = resolveMainNightSleep(sleepEntries);
  const entry = selection.entry;
  const sleepAmbiguous = selection.status === MAIN_NIGHT_STATUS.ambiguous;
  if (!entry) {
    return {
      sleepAvailable: false,
      sleepPartial: false,
      sleepAmbiguous,
      sleepSelection: selection,
      sleep: {
        linkedToPublicationDate: true,
        storageDate: publicationDate,
        hours: missingMetric("h"),
        wakeTime: missingMetric("hour_decimal"),
        bedtime: missingMetric("hour_decimal"),
        qualityStars: missingMetric(),
        qualityBand: missingMetric(),
        deepMin: missingMetric("min"),
        remMin: missingMetric("min"),
        dinnerSleepBufferH: missingMetric("h"),
        napsIncludedInHours: false,
        mainNightStatus: selection.status,
        mainNightReason: selection.reason
      }
    };
  }
  const hours = sleepHoursFromEntry(entry);
  const wakeTime = parseDecimalHour(entry.wakeTime ?? entry.sleepEnd);
  const bedtimeResolved = resolveBedtimeProvenance(entry, wakeTime, hours);
  const bedtime = bedtimeResolved.value;
  const bedtimeProvenance = bedtimeResolved.provenance;
  const qualityStars = normalizeQualityStars(entry.quality ?? entry.sleepQuality ?? entry.rating);
  const qualityBand = qualityBandFromStars(qualityStars);
  const deepMin = finiteNumber(entry.deepMin ?? entry.deepMinutes ?? entry.deep);
  const remMin = finiteNumber(entry.remMin ?? entry.remMinutes ?? entry.rem);
  const stagesUnreliable = isDefaultSleepStagePlaceholder(entry, deepMin, remMin);
  const sleepPartial = hours == null || hours <= 0 || wakeTime == null || bedtime == null;
  const buffer = computeDinnerSleepBufferH(
    bedtime,
    opts.lastMealHour == null ? null : Number(opts.lastMealHour)
  );
  return {
    sleepAvailable: hours != null && hours > 0,
    sleepPartial,
    sleepAmbiguous: false,
    sleepSelection: selection,
    sleep: {
      linkedToPublicationDate: true,
      storageDate: publicationDate,
      hours: hours == null || hours <= 0 ? missingMetric("h") : focusMetric(hours, {
        unit: "h",
        provenance: FOCUS_PROVENANCE.recorded
      }),
      wakeTime: wakeTime == null ? missingMetric("hour_decimal") : focusMetric(wakeTime, {
        unit: "hour_decimal",
        provenance: FOCUS_PROVENANCE.recorded
      }),
      bedtime: bedtime == null ? missingMetric("hour_decimal") : focusMetric(bedtime, {
        unit: "hour_decimal",
        provenance: bedtimeProvenance,
        source: bedtimeResolved.source,
        certainty: bedtimeResolved.certainty
      }),
      qualityStars: qualityStars == null ? missingMetric() : focusMetric(qualityStars, { provenance: FOCUS_PROVENANCE.recorded }),
      qualityBand: qualityBand == null ? missingMetric() : focusMetric(qualityBand, {
        provenance: FOCUS_PROVENANCE.calculated,
        source: "qualityBandFromStars"
      }),
      deepMin: stagesUnreliable ? focusMetric(null, {
        unit: "min",
        provenance: FOCUS_PROVENANCE.missing,
        source: "form_placeholder_60_suppressed"
      }) : deepMin == null ? missingMetric("min") : focusMetric(deepMin, {
        unit: "min",
        provenance: FOCUS_PROVENANCE.recorded,
        certainty: FOCUS_CERTAINTY.medium
      }),
      remMin: stagesUnreliable ? focusMetric(null, {
        unit: "min",
        provenance: FOCUS_PROVENANCE.missing,
        source: "form_placeholder_60_suppressed"
      }) : remMin == null ? missingMetric("min") : focusMetric(remMin, {
        unit: "min",
        provenance: FOCUS_PROVENANCE.recorded,
        certainty: FOCUS_CERTAINTY.medium
      }),
      dinnerSleepBufferH: buffer == null ? missingMetric("h") : focusMetric(buffer, {
        unit: "h",
        provenance: FOCUS_PROVENANCE.calculated,
        source: "computeDinnerSleepBufferH"
      }),
      napsIncludedInHours: false,
      mainNightStatus: selection.status,
      mainNightReason: selection.reason
    }
  };
}
var BEDTIME_FORMULA_MATCH_EPS_H, DEFAULT_SLEEP_STAGE_PLACEHOLDER_MIN;
var init_normalizeSleepNight = __esm({
  "src/features/kentuFocus/normalize/normalizeSleepNight.js"() {
    init_focusDossier_v1();
    init_focusDateUtils();
    init_logUtils();
    init_resolveMainNightSleep();
    BEDTIME_FORMULA_MATCH_EPS_H = 0.05;
    DEFAULT_SLEEP_STAGE_PLACEHOLDER_MIN = 60;
  }
});

// src/features/kentuFocus/normalize/normalizeWorkoutEvents.js
function durationToMinutes(durationRaw) {
  if (durationRaw && typeof durationRaw === "object") {
    const minutes = resolveWorkoutDurationMinutes(durationRaw);
    return minutes > 0 ? minutes : null;
  }
  const dur = finiteNumber(durationRaw);
  if (dur == null || dur < 0) return null;
  if (dur === 0) return 0;
  return resolveWorkoutDurationMinutes(dur) || null;
}
function workoutLabel2(entry) {
  return String(entry?.name || entry?.desc || entry?.workoutType || entry?.label || "").trim();
}
function extractRecordedMuscleGroups(entry) {
  const raw = entry?.muscles ?? entry?.muscleGroups ?? entry?.groups ?? null;
  if (raw == null || Array.isArray(raw) && raw.length === 0) return [];
  try {
    return normalizeMuscleGroupArray(raw);
  } catch {
    const list = Array.isArray(raw) ? raw : [raw];
    return list.map((m) => String(m || "").trim()).filter(Boolean);
  }
}
function extractWorkoutClockHour(entry) {
  const t = finiteNumber(entry?.time ?? entry?.mealTime ?? entry?.startTime ?? entry?.hour);
  if (t == null || t < 0 || t >= 24) return null;
  return Math.round(t * 100) / 100;
}
function extractWorkoutTypeId(entry) {
  const raw = String(
    entry?.workoutType || entry?.subType || entry?.activityType || entry?.activity || ""
  ).trim();
  return raw || null;
}
function classifyFocusActivity(entry) {
  const movement = classifyWorkoutByType(entry);
  if (movement.source === "none") {
    return {
      kind: "unclassified",
      isWalking: false,
      provenance: FOCUS_PROVENANCE.missing,
      source: "no_label"
    };
  }
  if (movement.kind === "strength") {
    return {
      kind: "strength",
      isWalking: false,
      provenance: FOCUS_PROVENANCE.calculated,
      source: movement.source === "workoutType" ? "workout_type" : "strength_patterns_precede_aerobic"
    };
  }
  if (movement.kind === "walk" || movement.kind === "vigorous") {
    return {
      kind: "aerobic",
      isWalking: movement.kind === "walk",
      provenance: FOCUS_PROVENANCE.calculated,
      source: movement.kind === "walk" ? "walking_patterns" : "aerobic_patterns"
    };
  }
  return {
    kind: "other_activity",
    isWalking: false,
    provenance: FOCUS_PROVENANCE.calculated,
    source: "label_present_no_forced_class"
  };
}
function resolveRecordedIntensityMinutes(entry, durationMin) {
  if (durationMin == null || !(durationMin > 0)) {
    return {
      moderateIntensityMinutes: null,
      vigorousIntensityMinutes: null,
      intensitySupported: false
    };
  }
  const intensityRaw = String(
    entry?.intensity ?? entry?.effort ?? entry?.intensityZone ?? entry?.zone ?? ""
  ).trim().toLowerCase();
  const mets = finiteNumber(entry?.mets ?? entry?.MET ?? entry?.met);
  const hr = finiteNumber(entry?.hr ?? entry?.avgHr ?? entry?.heartRate);
  let band = null;
  if (intensityRaw.includes("vigor") || intensityRaw.includes("high") || intensityRaw === "hard") {
    band = "vigorous";
  } else if (intensityRaw.includes("moder") || intensityRaw === "medium" || intensityRaw === "tempo") {
    band = "moderate";
  } else if (mets != null && mets >= 6) {
    band = "vigorous";
  } else if (mets != null && mets >= 3) {
    band = "moderate";
  } else if (hr != null && hr >= 150) {
    band = "vigorous";
  } else if (hr != null && hr >= 110) {
    band = "moderate";
  }
  if (!band) {
    return {
      moderateIntensityMinutes: null,
      vigorousIntensityMinutes: null,
      intensitySupported: false
    };
  }
  return {
    moderateIntensityMinutes: band === "moderate" ? durationMin : null,
    vigorousIntensityMinutes: band === "vigorous" ? durationMin : null,
    intensitySupported: true
  };
}
function detailLevel(entry) {
  if (entry?.exercises || entry?.sets || entry?.structured === true) return "structured";
  const note = String(entry?.note || entry?.notes || entry?.desc || "").trim();
  if (note || workoutLabel2(entry)) return "note";
  return "none";
}
function normalizeWorkoutEvents(analysisDayNode) {
  const fromLog = getLogArray(analysisDayNode).filter((e) => e && e.type === "workout");
  const fromManual = getManualNodesArray(analysisDayNode).filter((e) => e && e.type === "workout");
  const merged = dedupeById([...fromLog, ...fromManual], (e) => e.id);
  let workoutKcalTotal = 0;
  let aerobicMinutes = 0;
  let walkingMinutes = 0;
  let moderateIntensityMinutes = 0;
  let vigorousIntensityMinutes = 0;
  let anyKcal = false;
  let anyAerobic = false;
  let anyWalking = false;
  let anyModerate = false;
  let anyVigorous = false;
  const workouts = merged.map((entry) => {
    const durationMin = durationToMinutes(entry);
    const kcalBurn = finiteNumber(entry.kcal ?? entry.cal ?? entry.kcalBurn);
    const classification = classifyFocusActivity(entry);
    const intensity = resolveRecordedIntensityMinutes(entry, durationMin);
    const muscleGroups = extractRecordedMuscleGroups(entry);
    const clockHour = extractWorkoutClockHour(entry);
    const workoutTypeId2 = extractWorkoutTypeId(entry);
    if (kcalBurn != null) {
      anyKcal = true;
      workoutKcalTotal += kcalBurn;
    }
    if (classification.kind === "aerobic" && durationMin != null) {
      anyAerobic = true;
      aerobicMinutes += durationMin;
    }
    if (classification.isWalking && durationMin != null) {
      anyWalking = true;
      walkingMinutes += durationMin;
    }
    if (intensity.moderateIntensityMinutes != null) {
      anyModerate = true;
      moderateIntensityMinutes += intensity.moderateIntensityMinutes;
    }
    if (intensity.vigorousIntensityMinutes != null) {
      anyVigorous = true;
      vigorousIntensityMinutes += intensity.vigorousIntensityMinutes;
    }
    return {
      id: entry.id != null ? String(entry.id) : void 0,
      label: workoutLabel2(entry) || void 0,
      durationMin: durationMin == null ? missingMetric() : focusMetric(Math.round(durationMin * 10) / 10, {
        unit: "min",
        provenance: FOCUS_PROVENANCE.recorded
      }),
      kcalBurn: kcalBurn == null ? missingMetric() : focusMetric(kcalBurn, {
        unit: "kcal",
        provenance: FOCUS_PROVENANCE.recorded
      }),
      clockHour: clockHour == null ? missingMetric() : focusMetric(clockHour, {
        unit: "hour",
        provenance: FOCUS_PROVENANCE.recorded,
        source: "workout.time|mealTime"
      }),
      muscleGroups: {
        value: muscleGroups,
        provenance: muscleGroups.length > 0 ? FOCUS_PROVENANCE.recorded : FOCUS_PROVENANCE.missing,
        source: "muscles|muscleGroups|groups"
      },
      workoutTypeId: workoutTypeId2 ? {
        value: workoutTypeId2,
        provenance: FOCUS_PROVENANCE.recorded,
        source: "workoutType|subType"
      } : {
        value: null,
        provenance: FOCUS_PROVENANCE.missing,
        source: "workoutType|subType"
      },
      activityKind: {
        value: classification.kind,
        provenance: classification.provenance,
        source: classification.source
      },
      isWalking: focusMetric(classification.isWalking, {
        provenance: FOCUS_PROVENANCE.calculated,
        source: classification.source
      }),
      intensitySupported: intensity.intensitySupported,
      intensityBand: intensity.intensitySupported ? intensity.vigorousIntensityMinutes != null ? "vigorous" : "moderate" : null,
      detailLevel: detailLevel(entry),
      // Serie/ripetizioni/carichi: non estratti — assenti o non affidabili qui.
      setsRepsLoadsInvented: false
    };
  });
  return {
    hasWorkout: workouts.length > 0,
    workoutIds: workouts.map((w) => w.id).filter(Boolean),
    activity: {
      workouts,
      workoutKcalTotal: workouts.length === 0 ? missingMetric() : focusMetric(anyKcal ? Math.round(workoutKcalTotal * 10) / 10 : null, {
        provenance: anyKcal ? FOCUS_PROVENANCE.calculated : FOCUS_PROVENANCE.missing,
        source: "normalizeWorkoutEvents"
      }),
      /**
       * Minuti classificati come aerobici (hint label). Non implica intensità moderata verificata.
       * Alias storico: cardioMinutes.
       */
      aerobicMinutes: workouts.length === 0 ? missingMetric() : focusMetric(anyAerobic ? Math.round(aerobicMinutes * 10) / 10 : 0, {
        unit: "min",
        provenance: FOCUS_PROVENANCE.calculated,
        source: "normalizeWorkoutEvents",
        certainty: "low"
      }),
      cardioMinutes: workouts.length === 0 ? missingMetric() : focusMetric(anyAerobic ? Math.round(aerobicMinutes * 10) / 10 : 0, {
        unit: "min",
        provenance: FOCUS_PROVENANCE.calculated,
        source: "normalizeWorkoutEvents",
        certainty: "low"
      }),
      walkingMinutes: workouts.length === 0 ? missingMetric() : focusMetric(anyWalking ? Math.round(walkingMinutes * 10) / 10 : 0, {
        unit: "min",
        provenance: FOCUS_PROVENANCE.calculated,
        source: "normalizeWorkoutEvents",
        certainty: "low"
      }),
      moderateIntensityMinutes: workouts.length === 0 ? missingMetric() : focusMetric(
        anyModerate ? Math.round(moderateIntensityMinutes * 10) / 10 : null,
        {
          unit: "min",
          provenance: anyModerate ? FOCUS_PROVENANCE.recorded : FOCUS_PROVENANCE.missing,
          source: "resolveRecordedIntensityMinutes"
        }
      ),
      vigorousIntensityMinutes: workouts.length === 0 ? missingMetric() : focusMetric(
        anyVigorous ? Math.round(vigorousIntensityMinutes * 10) / 10 : null,
        {
          unit: "min",
          provenance: anyVigorous ? FOCUS_PROVENANCE.recorded : FOCUS_PROVENANCE.missing,
          source: "resolveRecordedIntensityMinutes"
        }
      )
    }
  };
}
var init_normalizeWorkoutEvents = __esm({
  "src/features/kentuFocus/normalize/normalizeWorkoutEvents.js"() {
    init_focusDossier_v1();
    init_logUtils();
    init_activityCatalog();
    init_workoutMovement();
  }
});

// src/features/kentuFocus/product/assessNova4CritiqueProfile.js
function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function readNutriScoreGrade(row) {
  if (!row || typeof row !== "object") return null;
  const raw = row.nutriscore_grade ?? row.nutrition_grades ?? row.nutriscoreGrade ?? row.nutritionGrade ?? row.nutriments?.["nutrition-score-fr"] ?? null;
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  const letter = s.replace(/^en:/, "").charAt(0);
  if ("abcde".includes(letter)) return (
    /** @type {'a'|'b'|'c'|'d'|'e'} */
    letter
  );
  return null;
}
function nutrientPer100g(row, keys) {
  if (!row || typeof row !== "object") return null;
  const nutriments = row.nutriments && typeof row.nutriments === "object" ? row.nutriments : null;
  for (const k of keys) {
    const direct = finiteOrNull(row[k]);
    if (direct != null) return direct;
    if (nutriments) {
      const n = finiteOrNull(nutriments[k] ?? nutriments[`${k}_100g`]);
      if (n != null) return n;
    }
  }
  return null;
}
function isDarkChocolateGe70(name) {
  const n = String(name || "");
  if (!/\b(cioccolat\w*|chocolate|cacao|excellence|lindt|fondente|dark)\b/i.test(n)) return false;
  return /\b(7[0-9]|8[0-9]|9[0-9]|100)\s*%/.test(n);
}
function assessNova4CritiqueProfile(input) {
  const name = String(input?.name || "").trim();
  const favorableDarkChocolate = isDarkChocolateGe70(name);
  if (favorableDarkChocolate) {
    return {
      critiqueWorthy: false,
      reason: "favorable_dark_chocolate_ge_70",
      nutriScoreGrade: readNutriScoreGrade(input?.catalogRow),
      sugarsGPortion: null,
      satFatGPortion: null,
      favorableDarkChocolate: true
    };
  }
  const grade = readNutriScoreGrade(input?.catalogRow);
  if (grade === "d" || grade === "e") {
    return {
      critiqueWorthy: true,
      reason: `nutri_score_${grade}`,
      nutriScoreGrade: grade,
      sugarsGPortion: null,
      satFatGPortion: null,
      favorableDarkChocolate: false
    };
  }
  const grams = finiteOrNull(input?.grams);
  let sugarsPortion = finiteOrNull(input?.sugarsG);
  let satPortion = finiteOrNull(input?.satFatG);
  if (sugarsPortion == null && input?.catalogRow && grams != null && grams > 0) {
    const per100 = nutrientPer100g(input.catalogRow, [
      "sugars",
      "sugars_100g",
      "sugar",
      "zuccheri"
    ]);
    if (per100 != null) sugarsPortion = Math.round(per100 * grams / 100 * 10) / 10;
  }
  if (satPortion == null && input?.catalogRow && grams != null && grams > 0) {
    const per100 = nutrientPer100g(input.catalogRow, [
      "saturated-fat",
      "saturated_fat",
      "saturated-fat_100g",
      "fatSat",
      "grassi_saturi"
    ]);
    if (per100 != null) satPortion = Math.round(per100 * grams / 100 * 10) / 10;
  }
  if (sugarsPortion != null && sugarsPortion >= 15) {
    return {
      critiqueWorthy: true,
      reason: "sugars_ge_15g_portion",
      nutriScoreGrade: grade,
      sugarsGPortion: sugarsPortion,
      satFatGPortion: satPortion,
      favorableDarkChocolate: false
    };
  }
  if (satPortion != null && satPortion >= 5) {
    return {
      critiqueWorthy: true,
      reason: "sat_fat_ge_5g_portion",
      nutriScoreGrade: grade,
      sugarsGPortion: sugarsPortion,
      satFatGPortion: satPortion,
      favorableDarkChocolate: false
    };
  }
  return {
    critiqueWorthy: false,
    reason: grade ? `nutri_score_${grade}_not_adverse` : sugarsPortion == null && satPortion == null ? "insufficient_profile_data" : "profile_not_adverse",
    nutriScoreGrade: grade,
    sugarsGPortion: sugarsPortion,
    satFatGPortion: satPortion,
    favorableDarkChocolate: false
  };
}
var init_assessNova4CritiqueProfile = __esm({
  "src/features/kentuFocus/product/assessNova4CritiqueProfile.js"() {
  }
});

// src/features/kentuFocus/product/focusAiCoachCatalogLookup.js
function catalogDbNonEmpty(db, cache) {
  if (!db || typeof db !== "object") return false;
  if (cache instanceof WeakMap && cache.has(db)) return cache.get(db);
  let nonEmpty = false;
  for (const _k in db) {
    if (Object.prototype.hasOwnProperty.call(db, _k)) {
      nonEmpty = true;
      break;
    }
  }
  if (cache instanceof WeakMap) cache.set(db, nonEmpty);
  return nonEmpty;
}
function createFocusCatalogLookupSession(catalogs) {
  const memo = /* @__PURE__ */ new Map();
  const emptyCache = /* @__PURE__ */ new WeakMap();
  const layers = [
    { db: catalogs?.personalDb, label: "personal" },
    { db: catalogs?.kentuItDb, label: "crea" },
    { db: catalogs?.globalDb, label: "usda" },
    { db: catalogs?.offDb, label: "off" }
  ];
  const dbNonEmpty = (db) => catalogDbNonEmpty(db, emptyCache);
  function lookup(key) {
    const k = String(key || "").trim();
    if (!k) return null;
    if (memo.has(k)) return memo.get(k);
    let hit = null;
    for (const layer of layers) {
      if (!layer.db || typeof layer.db !== "object") continue;
      if (layer.label === "off" && !dbNonEmpty(layer.db)) continue;
      const row = layer.db[k];
      if (!row) continue;
      hit = { row, sourceLabel: `catalog:${layer.label}`, layer: layer.label };
      break;
    }
    memo.set(k, hit);
    return hit;
  }
  return {
    lookup,
    dbNonEmpty,
    memoSize: () => memo.size
  };
}
function withFocusCatalogLookupSession(catalogs) {
  if (!catalogs || typeof catalogs !== "object") {
    return { catalogs: null, lookupSession: createFocusCatalogLookupSession(null) };
  }
  if (catalogs.__focusLookupSession) {
    return { catalogs, lookupSession: catalogs.__focusLookupSession };
  }
  const lookupSession = createFocusCatalogLookupSession(catalogs);
  const next = { ...catalogs, __focusLookupSession: lookupSession };
  return { catalogs: next, lookupSession };
}
var init_focusAiCoachCatalogLookup = __esm({
  "src/features/kentuFocus/product/focusAiCoachCatalogLookup.js"() {
  }
});

// src/features/kentuFocus/product/buildFocusFoodQualityBlock.js
function finiteOrNull2(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function readNovaGroup(tags) {
  if (!tags || typeof tags !== "object") return null;
  const raw = tags.novaGroup ?? tags.nova ?? tags.NOVA ?? null;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
function foodDisplayName(item) {
  return String(item?.name || item?.desc || item?.label || item?.foodName || "").trim();
}
function foodDbKeyOf(item) {
  const raw = item?.foodDbKey ?? item?.matchedKey ?? item?.dbKey ?? null;
  const key = raw != null ? String(raw).trim() : "";
  return key || null;
}
function mealLabelOf(mealType) {
  const key = String(mealType || "").trim().toLowerCase().split("_")[0];
  return MEAL_LABELS[key] || MEAL_LABELS.unknown;
}
function resolveOffCatalogStatus(catalogs) {
  if (!catalogs || typeof catalogs !== "object") {
    return {
      status: OFF_CATALOG_STATUS.absent,
      note: "Nessun catalogo passato al builder: lookup OFF non eseguito; item senza tag restano unclassified."
    };
  }
  if (catalogs.offReady === false) {
    return {
      status: OFF_CATALOG_STATUS.not_ready,
      note: "OFF ancora in caricamento: senza match su CREA/USDA/personale la classificazione resta unclassified (off_catalog_not_ready)."
    };
  }
  if (catalogs.offReady === true || catalogDbNonEmpty(catalogs.offDb)) {
    return {
      status: OFF_CATALOG_STATUS.ready,
      note: "OFF disponibile per lookup per foodDbKey."
    };
  }
  if (catalogs.offReady === true) {
    return {
      status: OFF_CATALOG_STATUS.ready,
      note: "OFF segnalato ready (mappa vuota o gi\xE0 consultata)."
    };
  }
  return {
    status: OFF_CATALOG_STATUS.absent,
    note: "OFF non fornito al builder."
  };
}
function classificationFromCatalogRow(row, sourceLabel) {
  if (!row || typeof row !== "object") {
    return { nova: null, semanticTags: null, provenance: null, source: null, row: null };
  }
  const tags = row.semanticTags && typeof row.semanticTags === "object" ? row.semanticTags : null;
  const fromTags = readNovaGroup(tags);
  if (fromTags != null) {
    return {
      nova: fromTags,
      semanticTags: tags,
      provenance: FOOD_QUALITY_PROVENANCE.documented,
      source: sourceLabel,
      row
    };
  }
  const estimated = finiteOrNull2(row.novaScore ?? row.nova_score);
  if (estimated != null) {
    return {
      nova: estimated,
      semanticTags: tags,
      provenance: FOOD_QUALITY_PROVENANCE.estimated,
      source: `${sourceLabel}:novaScore`,
      row
    };
  }
  return { nova: null, semanticTags: tags, provenance: null, source: null, row };
}
function lookupCatalogRow(catalogs, key) {
  if (!key || !catalogs || typeof catalogs !== "object") return null;
  if (catalogs.__focusLookupSession?.lookup) {
    return catalogs.__focusLookupSession.lookup(key);
  }
  const layers = [
    { db: catalogs.personalDb, label: "personal" },
    { db: catalogs.kentuItDb, label: "crea" },
    { db: catalogs.globalDb, label: "usda" },
    { db: catalogs.offDb, label: "off" }
  ];
  for (const layer of layers) {
    if (!layer.db || typeof layer.db !== "object") continue;
    if (layer.label === "off" && !catalogDbNonEmpty(layer.db)) continue;
    const row = layer.db[key];
    if (!row) continue;
    return { row, sourceLabel: `catalog:${layer.label}`, layer: layer.label };
  }
  return null;
}
function resolveFoodItemClassification(item, catalogs, offStatus) {
  const name = foodDisplayName(item);
  const key = foodDbKeyOf(item);
  const diaryTags = item?.semanticTags && typeof item.semanticTags === "object" ? item.semanticTags : null;
  const diaryNova = readNovaGroup(diaryTags);
  if (diaryNova != null) {
    const hit = key ? lookupCatalogRow(catalogs, key) : null;
    return {
      name,
      foodDbKey: key,
      novaGroup: diaryNova,
      semanticTags: diaryTags,
      provenance: FOOD_QUALITY_PROVENANCE.documented,
      source: "diary_semanticTags",
      reason: null,
      catalogRow: hit?.row || null,
      catalogLayer: hit?.layer || null
    };
  }
  const estimatedOnItem = finiteOrNull2(item?.novaScore);
  if (estimatedOnItem != null && estimatedOnItem > 0) {
    const hit = key ? lookupCatalogRow(catalogs, key) : null;
    return {
      name,
      foodDbKey: key,
      novaGroup: estimatedOnItem,
      semanticTags: diaryTags,
      provenance: FOOD_QUALITY_PROVENANCE.estimated,
      source: "diary_novaScore",
      reason: null,
      catalogRow: hit?.row || null,
      catalogLayer: hit?.layer || null
    };
  }
  if (!key || !catalogs || typeof catalogs !== "object") {
    return {
      name,
      foodDbKey: key,
      novaGroup: null,
      semanticTags: diaryTags,
      provenance: FOOD_QUALITY_PROVENANCE.unclassified,
      source: null,
      reason: key ? "catalogs_absent" : "missing_foodDbKey_and_tags",
      catalogRow: null,
      catalogLayer: null
    };
  }
  const cached3 = lookupCatalogRow(catalogs, key);
  if (cached3?.row) {
    const hit = classificationFromCatalogRow(cached3.row, cached3.sourceLabel);
    if (hit.provenance) {
      return {
        name,
        foodDbKey: key,
        novaGroup: hit.nova,
        semanticTags: hit.semanticTags || diaryTags,
        provenance: hit.provenance,
        source: hit.source,
        reason: null,
        catalogRow: cached3.row,
        catalogLayer: cached3.layer
      };
    }
    return {
      name,
      foodDbKey: key,
      novaGroup: null,
      semanticTags: hit.semanticTags || diaryTags,
      provenance: FOOD_QUALITY_PROVENANCE.unclassified,
      source: hit.source || cached3.sourceLabel,
      reason: "catalog_without_nova",
      catalogRow: cached3.row,
      catalogLayer: cached3.layer
    };
  }
  const offConsultable = catalogs.offReady === true || (catalogs.__focusLookupSession?.dbNonEmpty ? catalogs.__focusLookupSession.dbNonEmpty(catalogs.offDb) : catalogDbNonEmpty(catalogs.offDb));
  if (offStatus?.status === OFF_CATALOG_STATUS.not_ready && !offConsultable) {
    return {
      name,
      foodDbKey: key,
      novaGroup: null,
      semanticTags: diaryTags,
      provenance: FOOD_QUALITY_PROVENANCE.unclassified,
      source: null,
      reason: "off_catalog_not_ready",
      catalogRow: null,
      catalogLayer: null
    };
  }
  return {
    name,
    foodDbKey: key,
    novaGroup: null,
    semanticTags: diaryTags,
    provenance: FOOD_QUALITY_PROVENANCE.unclassified,
    source: null,
    reason: "no_catalog_match",
    catalogRow: null,
    catalogLayer: null
  };
}
function categoryTokensFromRow(row) {
  const out = [];
  const push = (v) => {
    const s = String(v || "").trim().toLowerCase();
    if (s) out.push(s);
  };
  if (Array.isArray(row?.categories_tags)) {
    for (const t of row.categories_tags) push(t);
  }
  if (typeof row?.categories === "string") {
    for (const part of row.categories.split(",")) push(part);
  }
  push(row?.category);
  push(row?.food_group);
  push(row?.foodGroup);
  push(row?.group);
  push(row?.gruppo);
  push(row?.categoria);
  push(row?.crea_group);
  push(row?.creaGroup);
  push(row?.codice_gruppo);
  push(row?.groupCode);
  if (Array.isArray(row?.groups)) {
    for (const g of row.groups) push(g);
  }
  return out;
}
function plantRoleFromCatalogCategories(row, layer) {
  const tokens = categoryTokensFromRow(row).join(" | ");
  if (!tokens) return null;
  if (SWEET_OR_DRINK_CATEGORY_RE.test(tokens)) return null;
  const source = `catalog_category:${layer}`;
  if (/\b(legumi|legumes?|pulses?|beans?|lentils?|chickpeas?|fagioli|lenticchie|ceci)\b/i.test(tokens)) {
    return { role: "legume", provenance: FOOD_QUALITY_PROVENANCE.documented, source };
  }
  if (/\b(frutta|fruits?|fresh-fruits|fruits-and-products)\b/i.test(tokens) && !/\b(juices?|succhi|nectars?)\b/i.test(tokens)) {
    return { role: "fruit", provenance: FOOD_QUALITY_PROVENANCE.documented, source };
  }
  if (/\b(verdura|verdure|vegetables?|ortaggi|fresh-vegetables)\b/i.test(tokens)) {
    return { role: "vegetable", provenance: FOOD_QUALITY_PROVENANCE.documented, source };
  }
  if (/\b(cereali\s*integr|whole.?grain|wholemeal|integrali?)\b/i.test(tokens)) {
    return { role: "whole_grain", provenance: FOOD_QUALITY_PROVENANCE.documented, source };
  }
  return null;
}
function omega3FromCatalogRow(row) {
  const candidates = [
    row?.omega3,
    row?.omega_3,
    row?.n3,
    row?.fatty_acids_n3,
    row?.fattyAcidsN3,
    row?.nutriments?.["omega-3"],
    row?.nutriments?.omega_3
  ];
  for (const c of candidates) {
    const n = finiteOrNull2(c);
    if (n != null && n > 0) return n;
  }
  return null;
}
function plantRoleFromDisplayName(name, novaGroup) {
  const n = String(name || "");
  if (novaGroup != null && novaGroup >= 4) return null;
  if (SWEET_OR_DRINK_NAME_RE.test(n)) return null;
  for (const row of NAME_ROLE_PATTERNS) {
    if (row.re.test(n)) {
      return {
        role: row.role,
        provenance: FOOD_QUALITY_PROVENANCE.name_pattern,
        source: "display_name_pattern"
      };
    }
  }
  return null;
}
function buildDayFoodQuality(fullHistory, date, catalogs, offStatus) {
  const node = getTrackerDayNode(fullHistory, date);
  if (!node) {
    return {
      date,
      hasFood: false,
      nova4Items: [],
      fiberGTotal: null,
      omega3Sources: [],
      plantFoods: [],
      wholeGrainFoods: [],
      provenanceCounts: {
        documented: 0,
        estimated: 0,
        name_pattern: 0,
        unclassified: 0
      },
      itemCount: 0,
      offUnresolvedCount: 0
    };
  }
  const dayLog2 = collectDayLogForNutrition(node);
  const foods = dayLog2.filter(
    (e) => e && (e.type === "food" || e.type === "recipe" || !e.type)
  );
  const nova4Items = [];
  const omega3Sources = [];
  const plantFoods = [];
  const wholeGrainFoods = [];
  const provenanceCounts = {
    documented: 0,
    estimated: 0,
    name_pattern: 0,
    unclassified: 0
  };
  let fiberGTotal = 0;
  let fiberAny = false;
  let offUnresolvedCount = 0;
  for (const item of foods) {
    const identity = resolveFocusMealIdentity(item);
    const mealLabel = mealLabelOf(identity.canonicalMealType);
    const kcal = finiteOrNull2(item.kcal ?? item.cal);
    const fiber = finiteOrNull2(item.fibre ?? item.fiber ?? item.fiberG);
    if (fiber != null) {
      fiberGTotal += fiber;
      fiberAny = true;
    }
    const classified = resolveFoodItemClassification(item, catalogs, offStatus);
    if (classified.reason === "off_catalog_not_ready") offUnresolvedCount += 1;
    if (classified.provenance === FOOD_QUALITY_PROVENANCE.documented) {
      provenanceCounts.documented += 1;
    } else if (classified.provenance === FOOD_QUALITY_PROVENANCE.estimated) {
      provenanceCounts.estimated += 1;
    } else {
      provenanceCounts.unclassified += 1;
    }
    if (classified.novaGroup != null && classified.novaGroup >= 4) {
      const grams = finiteOrNull2(item.grams ?? item.g ?? item.qty);
      const critique = assessNova4CritiqueProfile({
        name: classified.name,
        grams,
        catalogRow: classified.catalogRow,
        sugarsG: finiteOrNull2(item.sugars ?? item.sugar ?? item.sugarG),
        satFatG: finiteOrNull2(item.satFat ?? item.fatSat ?? item.saturatedFat)
      });
      nova4Items.push({
        name: classified.name,
        mealLabel,
        mealType: identity.canonicalMealType,
        kcal,
        grams,
        novaGroup: classified.novaGroup,
        provenance: classified.provenance,
        source: classified.source,
        reason: classified.reason,
        critiqueWorthy: critique.critiqueWorthy,
        critiqueReason: critique.reason,
        nutriScoreGrade: critique.nutriScoreGrade,
        sugarsGPortion: critique.sugarsGPortion,
        satFatGPortion: critique.satFatGPortion
      });
    }
    const diaryOmega3 = finiteOrNull2(item.omega3 ?? item.omega_3);
    if (diaryOmega3 != null && diaryOmega3 > 0) {
      omega3Sources.push({
        name: classified.name,
        mealLabel,
        omega3G: diaryOmega3,
        provenance: FOOD_QUALITY_PROVENANCE.documented,
        source: "diary_omega3_field"
      });
    } else if (classified.catalogRow) {
      const catOmega = omega3FromCatalogRow(classified.catalogRow);
      if (catOmega != null && catOmega > 0) {
        const grams = finiteOrNull2(item.grams ?? item.g ?? item.qty);
        const scaled = grams != null && grams > 0 ? catOmega * grams / 100 : catOmega;
        const layer = classified.catalogLayer || "unknown";
        omega3Sources.push({
          name: classified.name,
          mealLabel,
          omega3G: Math.round(scaled * 1e3) / 1e3,
          provenance: layer === "usda" || layer === "crea" || layer === "personal" ? FOOD_QUALITY_PROVENANCE.documented : FOOD_QUALITY_PROVENANCE.estimated,
          source: `catalog_${layer}_omega3`
        });
      }
    }
    let plant = null;
    if (classified.catalogRow && classified.catalogLayer) {
      plant = plantRoleFromCatalogCategories(classified.catalogRow, classified.catalogLayer);
    }
    if (!plant) {
      plant = plantRoleFromDisplayName(classified.name, classified.novaGroup);
    }
    if (plant && (plant.role === "fruit" || plant.role === "vegetable") && classified.novaGroup != null && classified.novaGroup >= 4) {
      plant = null;
    }
    if (plant) {
      const entry = {
        name: classified.name,
        mealLabel,
        role: plant.role,
        provenance: plant.provenance,
        source: plant.source
      };
      if (plant.role === "whole_grain") {
        wholeGrainFoods.push(entry);
      } else {
        plantFoods.push(entry);
      }
      if (plant.provenance === FOOD_QUALITY_PROVENANCE.name_pattern) {
        provenanceCounts.name_pattern += 1;
      }
    }
  }
  return {
    date,
    hasFood: foods.length > 0,
    nova4Items,
    fiberGTotal: fiberAny ? Math.round(fiberGTotal * 10) / 10 : null,
    omega3Sources,
    plantFoods,
    wholeGrainFoods,
    provenanceCounts,
    itemCount: foods.length,
    offUnresolvedCount
  };
}
function buildFocusFoodQualityBlock(input) {
  const fullHistory = input?.fullHistory && typeof input.fullHistory === "object" ? input.fullHistory : null;
  const analysisDate = String(input?.analysisDate || "").trim();
  if (!fullHistory || !isIsoDateString(analysisDate)) {
    return {
      available: false,
      reason: "missing_history_or_date",
      day: null,
      recent: null,
      catalogStatus: resolveOffCatalogStatus(input?.catalogs),
      completeness: "complete",
      completenessReason: null,
      policy: {
        noInferenceBeyondTagsAndCatalog: true,
        offNotReadyMarksUnclassified: true,
        plantRolesPreferCatalogCategories: true,
        namePatternIsIndicative: true,
        sweetDrinkExcludedFromFruitVegetable: true
      }
    };
  }
  const { catalogs } = withFocusCatalogLookupSession(input.catalogs || null);
  const offStatus = input.offStatusOverride && typeof input.offStatusOverride === "object" ? input.offStatusOverride : resolveOffCatalogStatus(catalogs);
  const day = buildDayFoodQuality(fullHistory, analysisDate, catalogs, offStatus);
  const recentDays = Math.max(
    1,
    Number(input.recentDays) || (input.periodId === "mese" ? 30 : input.periodId === "settimana" ? 7 : 7)
  );
  const recentDaysBuilt = [];
  let fiberSum = 0;
  let fiberDays = 0;
  let nova4Occasions = 0;
  let omega3Occasions = 0;
  let plantOccasions = 0;
  let wholeGrainOccasions = 0;
  let offUnresolvedTotal = day.offUnresolvedCount || 0;
  const recentProvenance = {
    documented: 0,
    estimated: 0,
    name_pattern: 0,
    unclassified: 0
  };
  for (let i = recentDays - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(analysisDate, -i);
    const row = buildDayFoodQuality(fullHistory, date, catalogs, offStatus);
    if (!row.hasFood) continue;
    recentDaysBuilt.push({
      date: row.date,
      nova4Count: row.nova4Items.length,
      fiberGTotal: row.fiberGTotal,
      omega3Count: row.omega3Sources.length,
      plantCount: row.plantFoods.length,
      wholeGrainCount: row.wholeGrainFoods.length,
      provenanceCounts: row.provenanceCounts,
      offUnresolvedCount: row.offUnresolvedCount || 0
    });
    if (row.fiberGTotal != null) {
      fiberSum += row.fiberGTotal;
      fiberDays += 1;
    }
    nova4Occasions += row.nova4Items.length;
    omega3Occasions += row.omega3Sources.length;
    plantOccasions += row.plantFoods.length;
    wholeGrainOccasions += row.wholeGrainFoods.length;
    offUnresolvedTotal += date === analysisDate ? 0 : row.offUnresolvedCount || 0;
    recentProvenance.documented += row.provenanceCounts.documented;
    recentProvenance.estimated += row.provenanceCounts.estimated;
    recentProvenance.name_pattern += row.provenanceCounts.name_pattern || 0;
    recentProvenance.unclassified += row.provenanceCounts.unclassified;
  }
  const incompleteOff = offUnresolvedTotal > 0 && offStatus.status === OFF_CATALOG_STATUS.not_ready;
  return {
    available: day.hasFood || recentDaysBuilt.length > 0,
    reason: null,
    catalogStatus: offStatus,
    completeness: incompleteOff ? "partial" : "complete",
    completenessReason: incompleteOff ? "off_catalog_not_ready" : null,
    offUnresolvedItemCount: offUnresolvedTotal,
    day: {
      analysisDate,
      nova4Items: day.nova4Items,
      fiberGTotal: day.fiberGTotal,
      omega3Sources: day.omega3Sources,
      plantFoods: day.plantFoods,
      wholeGrainFoods: day.wholeGrainFoods,
      provenanceCounts: day.provenanceCounts,
      itemCount: day.itemCount,
      offUnresolvedCount: day.offUnresolvedCount || 0
    },
    recent: {
      windowDays: recentDays,
      daysWithFood: recentDaysBuilt.length,
      meanFiberG: fiberDays > 0 ? Math.round(fiberSum / fiberDays * 10) / 10 : null,
      nova4Occasions,
      omega3Occasions,
      plantOccasions,
      wholeGrainOccasions,
      provenanceCounts: recentProvenance,
      byDay: recentDaysBuilt
    },
    policy: {
      noInferenceBeyondTagsAndCatalog: true,
      offNotReadyMarksUnclassified: true,
      plantRolesPreferCatalogCategories: true,
      namePatternIsIndicative: true,
      sweetDrinkExcludedFromFruitVegetable: true,
      estimatedMeansHealthAnalyzerNovaScore: true
    }
  };
}
var FOOD_QUALITY_PROVENANCE, FOOD_QUALITY_PROVENANCE_CODE, OFF_CATALOG_STATUS, MEAL_LABELS, NAME_ROLE_PATTERNS, SWEET_OR_DRINK_NAME_RE, SWEET_OR_DRINK_CATEGORY_RE;
var init_buildFocusFoodQualityBlock = __esm({
  "src/features/kentuFocus/product/buildFocusFoodQualityBlock.js"() {
    init_focusDateUtils();
    init_getTrackerDayNode();
    init_normalizeFoodEvents();
    init_focusMealSlots();
    init_assessNova4CritiqueProfile();
    init_focusAiCoachCatalogLookup();
    FOOD_QUALITY_PROVENANCE = Object.freeze({
      documented: "documented",
      estimated: "estimated",
      name_pattern: "name_pattern",
      unclassified: "unclassified"
    });
    FOOD_QUALITY_PROVENANCE_CODE = Object.freeze({
      documented: "d",
      estimated: "e",
      name_pattern: "n",
      unclassified: "u"
    });
    OFF_CATALOG_STATUS = Object.freeze({
      ready: "ready",
      not_ready: "not_ready",
      absent: "absent"
    });
    MEAL_LABELS = Object.freeze({
      colazione: "Colazione",
      pranzo: "Pranzo",
      cena: "Cena",
      snack: "Spuntino",
      spuntino: "Spuntino",
      merenda: "Merenda",
      unknown: "Pasto"
    });
    NAME_ROLE_PATTERNS = Object.freeze([
      { role: "legume", re: /\b(fagiol\w*|lenticch\w*|ceci|pisell\w*|edamame|fave|soia)\b/i },
      { role: "fruit", re: /\b(mela|mele|banan\w*|arancia|arance|kiwi|fragol\w*|mirtill\w*|pera|pere|uva|pesca|pesche|albicocc\w*|cilieg\w*|melone|anguria|ananas|mango|frutta|avocado)\b/i },
      { role: "vegetable", re: /\b(insalat\w*|verdure?|broccoli|spinac\w*|zucchine?|carot\w*|peperon\w*|cetriol\w*|melanzan\w*|pomodor\w*|finocchi|rucola|bieta|cicoria|cavol\w*)\b/i },
      { role: "whole_grain", re: /\b(integrale|integrali|avena|fiocchi\s+d['']?avena|quinoa|farro|orzo\s+mondo|con\s+semi|semi\s+di)\b/i }
    ]);
    SWEET_OR_DRINK_NAME_RE = /\b(torta|torte|biscott\w*|cookie|muffin|croissant|gelato|budino|crema\s+pasticcera|marmellata|confettura|succo|spremuta|bevanda|drink|soda|cola|sciroppo|caramell\w*|cioccolat\w*|snack\s+dolce|merendin\w*)\b/i;
    SWEET_OR_DRINK_CATEGORY_RE = /\b(beverage|bevande|drink|succhi|juices?|nectars?|sodas?|soft-drinks|dolci|dessert|sweets?|cakes?|biscuits?|confetteria|cioccolato|ice-creams?)\b/i;
  }
});

// src/features/kentuFocus/product/focusMealEnergySignals.js
function assessHeavyLateMeal(dinnerKcal, dayKcal, targetKcal) {
  const dinner = Number(dinnerKcal);
  const day = Number(dayKcal);
  const target = Number(targetKcal);
  const hasDinner = Number.isFinite(dinner) && dinner > 0;
  const hasDay = Number.isFinite(day) && day > 0;
  const hasTarget = Number.isFinite(target) && target > 0;
  const shareOfDay = hasDinner && hasDay ? Math.round(dinner / day * 1e3) / 1e3 : null;
  const targetAbs = hasTarget ? Math.round(target * HEAVY_LATE_MEAL_ABS_TARGET_SHARE) : null;
  const absoluteOk = hasDinner && (dinner >= HEAVY_LATE_MEAL_ABS_KCAL || targetAbs != null && dinner >= targetAbs);
  const shareOk = shareOfDay != null && shareOfDay >= HEAVY_LATE_MEAL_DAY_SHARE;
  const active = Boolean(absoluteOk && shareOk);
  const absoluteThresholdKcal = hasTarget ? Math.min(
    HEAVY_LATE_MEAL_ABS_KCAL,
    targetAbs != null ? targetAbs : HEAVY_LATE_MEAL_ABS_KCAL
  ) : HEAVY_LATE_MEAL_ABS_KCAL;
  let detail;
  let inactiveReason = null;
  if (!hasDinner) {
    detail = "Nessuna cena con kcal utilizzabili.";
    inactiveReason = "no_dinner_kcal";
  } else if (active) {
    detail = `Cena abbondante: ${Math.round(dinner)} kcal` + (shareOfDay != null ? ` (${Math.round(shareOfDay * 100)}% del giorno)` : "") + ` \u2014 soglia assoluta \u2265${HEAVY_LATE_MEAL_ABS_KCAL} kcal o \u2265${Math.round(HEAVY_LATE_MEAL_ABS_TARGET_SHARE * 100)}% target e \u2265${Math.round(HEAVY_LATE_MEAL_DAY_SHARE * 100)}% del totale giornaliero.`;
  } else if (!absoluteOk && shareOk) {
    detail = `Cena ${Math.round(dinner)} kcal \xE8 una quota ampia del giorno` + (shareOfDay != null ? ` (${Math.round(shareOfDay * 100)}%)` : "") + `, ma sotto la soglia assoluta (\u2265${HEAVY_LATE_MEAL_ABS_KCAL} kcal o \u2265${Math.round(HEAVY_LATE_MEAL_ABS_TARGET_SHARE * 100)}% del target` + (targetAbs != null ? ` = ${targetAbs} kcal` : "") + "): non segnalata come abbondante.";
    inactiveReason = "below_absolute_threshold";
  } else if (absoluteOk && !shareOk) {
    detail = `Cena ${Math.round(dinner)} kcal supera la soglia assoluta ma \xE8 sotto il ${Math.round(HEAVY_LATE_MEAL_DAY_SHARE * 100)}% del totale giornaliero.`;
    inactiveReason = "below_day_share";
  } else {
    detail = `Cena ${Math.round(dinner)} kcal: n\xE9 soglia assoluta n\xE9 quota giorno (\u2265${Math.round(HEAVY_LATE_MEAL_DAY_SHARE * 100)}%).`;
    inactiveReason = "below_thresholds";
  }
  return {
    active,
    dinnerKcal: hasDinner ? Math.round(dinner) : null,
    dayIntakeKcal: hasDay ? Math.round(day) : null,
    targetKcal: hasTarget ? Math.round(target) : null,
    shareOfDay,
    absoluteThresholdKcal,
    absoluteOk,
    shareOk,
    detail,
    inactiveReason
  };
}
function assessEnergyLowDay(dayKcal, targetKcal, opts = {}) {
  const day = Number(dayKcal);
  const target = Number(targetKcal);
  const hasDay = Number.isFinite(day) && day > 0;
  const hasTarget = Number.isFinite(target) && target > 0;
  const firstMealHour = Number.isFinite(Number(opts.firstMealHour)) ? Number(opts.firstMealHour) : null;
  const overnightFastHours = Number.isFinite(Number(opts.overnightFastHours)) ? Number(opts.overnightFastHours) : null;
  const longFastThreshold = Number.isFinite(Number(opts.longFastThresholdHours)) ? Number(opts.longFastThresholdHours) : 14;
  const deficitKcal = hasDay && hasTarget ? Math.round(target - day) : null;
  const deficitRatio = hasDay && hasTarget && target > 0 ? Math.round((target - day) / target * 1e3) / 1e3 : null;
  const active = Boolean(
    deficitRatio != null && deficitRatio > ENERGY_LOW_DAY_DEFICIT_RATIO
  );
  const firstMealAfter13 = firstMealHour != null && firstMealHour >= LATE_FIRST_MEAL_HOUR;
  const overnightFastOver14h = overnightFastHours != null && overnightFastHours > longFastThreshold;
  const preferMorningAction = Boolean(active && (firstMealAfter13 || overnightFastOver14h));
  let detail;
  let inactiveReason = null;
  if (!hasDay || !hasTarget) {
    detail = "Introito o target non disponibili per energy_low_day.";
    inactiveReason = "missing_intake_or_target";
  } else if (active) {
    detail = `Giorno sotto target di ${Math.round(deficitRatio * 100)}% (${Math.round(day)} vs ${Math.round(target)} kcal; soglia >${Math.round(ENERGY_LOW_DAY_DEFICIT_RATIO * 100)}%).` + (preferMorningAction ? " Priorit\xE0 azione sul primo pasto (digiuno lungo o primo pasto dopo le 13)." : "");
  } else {
    detail = `Introito ${Math.round(day)} kcal vs target ${Math.round(target)} (scostamento ${Math.round((deficitRatio || 0) * 100)}%, soglia >${Math.round(ENERGY_LOW_DAY_DEFICIT_RATIO * 100)}%).`;
    inactiveReason = "within_energy_band";
  }
  return {
    active,
    dayIntakeKcal: hasDay ? Math.round(day) : null,
    targetKcal: hasTarget ? Math.round(target) : null,
    deficitRatio,
    deficitKcal,
    thresholdRatio: ENERGY_LOW_DAY_DEFICIT_RATIO,
    firstMealHour,
    firstMealAfter13,
    overnightFastHours,
    overnightFastOver14h,
    preferMorningAction,
    detail,
    inactiveReason
  };
}
var HEAVY_LATE_MEAL_ABS_KCAL, HEAVY_LATE_MEAL_ABS_TARGET_SHARE, HEAVY_LATE_MEAL_DAY_SHARE, ENERGY_LOW_DAY_DEFICIT_RATIO, LATE_FIRST_MEAL_HOUR, SUBSTANTIAL_MEAL_MIN_KCAL;
var init_focusMealEnergySignals = __esm({
  "src/features/kentuFocus/product/focusMealEnergySignals.js"() {
    HEAVY_LATE_MEAL_ABS_KCAL = 900;
    HEAVY_LATE_MEAL_ABS_TARGET_SHARE = 0.4;
    HEAVY_LATE_MEAL_DAY_SHARE = 0.45;
    ENERGY_LOW_DAY_DEFICIT_RATIO = 0.25;
    LATE_FIRST_MEAL_HOUR = 13;
    SUBSTANTIAL_MEAL_MIN_KCAL = 50;
  }
});

// src/features/kentuFocus/score/scoreConfig.kds-1.js
var SCORE_VERSION, CYLINDER_POINTS, CYLINDER_WEIGHTS, MIN_CYLINDERS_WITH_DATA, NULL_SCORE_STATUSES, LOW_RELIABILITY_STATUSES, PERIOD_MEAN_STATUSES, ENERGY_BANDS, SLEEP_BANDS, STRENGTH_WINDOW, CARDIO_WINDOW, NOVA4_CRITIQUE_SIGNAL_ID;
var init_scoreConfig_kds_1 = __esm({
  "src/features/kentuFocus/score/scoreConfig.kds-1.js"() {
    SCORE_VERSION = "kds-1";
    CYLINDER_POINTS = Object.freeze({
      /** In linea con la soglia del cilindro. */
      on_track: 1,
      /** A metà strada: entra nel punteggio, non è un giorno sulla rotta. */
      halfway: 0.55,
      /** Fuori soglia. Resta nel punteggio, pesa poco. */
      off_track: 0.15
    });
    CYLINDER_WEIGHTS = Object.freeze({
      /** Il giorno si legge prima dall'energia. */
      alimentazione: 0.4,
      /** Durata della notte e distanza dall'ultimo pasto. */
      sonno: 0.25,
      /** Minuti degli ultimi 7 giorni, non il singolo giorno. */
      cardio: 0.2,
      /** Finestra mobile dei gruppi, non la seduta di oggi. */
      forza: 0.15
    });
    MIN_CYLINDERS_WITH_DATA = 2;
    NULL_SCORE_STATUSES = Object.freeze([
      "future",
      "in_progress",
      "hole",
      "paused"
    ]);
    LOW_RELIABILITY_STATUSES = Object.freeze([
      "unconfirmed",
      "approximate"
    ]);
    PERIOD_MEAN_STATUSES = Object.freeze(["closed", "late"]);
    ENERGY_BANDS = Object.freeze({
      /** Entro ±15% dell'obiettivo: on_track. Il 15% è incluso. */
      onTrackMaxDeviation: 0.15,
      /** Tra il 15% escluso e il 25% incluso: halfway. Oltre il 25%: off_track. */
      halfwayMaxDeviation: 0.25
    });
    SLEEP_BANDS = Object.freeze({
      /** Da 7 ore in su, 7 incluso: on_track. */
      onTrackMinHours: 7,
      /** Da 6 ore incluso fino a 7 escluso: halfway. Sotto le 6: off_track. */
      halfwayMinHours: 6,
      /** Ultimo pasto a meno di 2 ore dall'addormentamento: il cilindro peggiora di un livello. */
      mealBufferPenaltyHours: 2,
      /** Il segnale già esistente meal_within_3h_of_bedtime scatta sotto le 3 ore. Non sposta il livello kds-1. */
      existingMealSignalHours: 3,
      /** L'orario di addormentamento conta se è registrato o ricavato. calculated è l'alias storico di derived. */
      usableBedtimeProvenance: Object.freeze(["recorded", "derived", "calculated"])
    });
    STRENGTH_WINDOW = Object.freeze({
      /** Sessioni guardate all'indietro, oggi incluso. */
      windowDays: 30,
      /** Stimolo negli ultimi 7 giorni (distanza 0–7). */
      onTrackMaxDaysSince: 7,
      /** Primo giorno della fascia halfway: fermo da 8 giorni. */
      halfwayMinDaysSince: 8,
      /** Ultimo giorno della fascia halfway: fermo da 10. Da 11 in poi è off_track. */
      halfwayMaxDaysSince: 10,
      /**
       * Mappatura chip → macro.
       * Parte alta: Petto, Dorso, Spalle, bicipiti, tricipiti, avambracci.
       * Parte bassa: Gambe.
       * Core, facoltativo: abs, Core.
       */
      macros: Object.freeze({
        parte_bassa: Object.freeze(["Gambe"]),
        parte_alta: Object.freeze(["Petto", "Dorso", "Spalle", "bicipiti", "tricipiti", "avambracci"]),
        core: Object.freeze(["abs", "Core"])
      }),
      /** Solo questi macro, se compaiono negli ultimi 30 giorni, devono essere freschi. */
      obligationMacros: Object.freeze(["parte_bassa", "parte_alta"]),
      macroLabels: Object.freeze({
        parte_bassa: "parte bassa",
        parte_alta: "parte alta",
        core: "core"
      }),
      /** Una seduta Total Body copre parte alta e parte bassa, quel giorno. Non obbliga il core. */
      totalBodyGroup: "Total Body"
    });
    CARDIO_WINDOW = Object.freeze({
      windowDays: 7,
      /** Da 150 minuti in su: on_track. 150 è incluso. */
      onTrackMinMinutes: 150,
      /** Da 75 incluso a 149: halfway. Sotto 75: off_track. */
      halfwayMinMinutes: 75
    });
    NOVA4_CRITIQUE_SIGNAL_ID = "nova4_critique";
  }
});

// src/features/kentuFocus/score/scoreConfig.kds-2.js
var SCORE_VERSION2, CYLINDER_WEIGHTS2, MIN_CYLINDERS_WITH_DATA2, NULL_SCORE_STATUSES2, LOW_RELIABILITY_STATUSES2, ENERGY_CURVE, SLEEP_CURVE, STRENGTH_CURVE, CARDIO_CURVE, NOVA4_CRITIQUE_SIGNAL_ID2, PERIOD_RULES;
var init_scoreConfig_kds_2 = __esm({
  "src/features/kentuFocus/score/scoreConfig.kds-2.js"() {
    SCORE_VERSION2 = "kds-2";
    CYLINDER_WEIGHTS2 = Object.freeze({
      alimentazione: 0.4,
      sonno: 0.25,
      cardio: 0.2,
      forza: 0.15
    });
    MIN_CYLINDERS_WITH_DATA2 = 2;
    NULL_SCORE_STATUSES2 = Object.freeze([
      "future",
      "in_progress",
      "hole",
      "paused"
    ]);
    LOW_RELIABILITY_STATUSES2 = Object.freeze([
      "unconfirmed",
      "approximate"
    ]);
    ENERGY_CURVE = Object.freeze({
      fullCreditDeviation: 0.1,
      floorDeviation: 0.35,
      floorValue: 0.15,
      ultraProcessedFactor: 0.8,
      lateMealPenalty: 0.15,
      lateMealHours: 2,
      usableBedtimeProvenance: Object.freeze(["recorded", "derived", "calculated"])
    });
    SLEEP_CURVE = Object.freeze({
      fullMinHours: 7,
      fullMaxHours: 9,
      shortFloorHours: 5,
      longFloorHours: 11,
      floorValue: 0.15,
      qualityFactor: Object.freeze({ 5: 1, 4: 1, 3: 0.9, 2: 0.8, 1: 0.7 })
    });
    STRENGTH_CURVE = Object.freeze({
      windowDays: 30,
      fullMaxDaysSince: 7,
      floorDaysSince: 12,
      floorValue: 0.15,
      obligationMacros: Object.freeze(["parte_bassa", "parte_alta"]),
      macroLabels: Object.freeze({
        parte_bassa: "parte bassa",
        parte_alta: "parte alta"
      }),
      macros: Object.freeze({
        parte_bassa: Object.freeze(["Gambe"]),
        parte_alta: Object.freeze(["Petto", "Dorso", "Spalle", "bicipiti", "tricipiti", "avambracci"])
      }),
      totalBodyGroup: "Total Body"
    });
    CARDIO_CURVE = Object.freeze({
      windowDays: 7,
      fullMinutes: 150,
      halfwayMinMinutes: 75
    });
    NOVA4_CRITIQUE_SIGNAL_ID2 = "nova4_critique";
    PERIOD_RULES = Object.freeze({
      minCoverage: 0.6,
      onTrackMinScore: 0.75,
      breakBelowScore: 0.5,
      minPublishedStreak: 3
    });
  }
});

// src/features/kentuFocus/score/scoreConfig.kds-3.js
function pillarStatusFromValue(value) {
  if (value == null || value === "") return "no_data";
  const n = Number(value);
  if (!Number.isFinite(n)) return "no_data";
  if (n >= PILLAR_STATUS.onTrackMin) return "on_track";
  if (n >= PILLAR_STATUS.halfwayMin) return "halfway";
  return "off_track";
}
function isPeriodDataStatus(dayStatus) {
  return PERIOD_DATA_STATUSES.includes(dayStatus);
}
function periodDayWeight(dayStatus) {
  return dayStatus === "unconfirmed" ? UNCONFIRMED_PERIOD_WEIGHT : 1;
}
var SCORE_VERSION3, CYLINDER_WEIGHTS3, MIN_CYLINDERS_WITH_DATA3, ON_TRACK_SCORE, NULL_SCORE_STATUSES3, LOW_RELIABILITY_STATUSES3, MOVEMENT_CURVE, PILLAR_STATUS, ACTION_PILLAR_WEIGHTS, PERIOD_RULES2, PERIOD_DATA_STATUSES, UNCONFIRMED_PERIOD_WEIGHT, MEAL_PENALTY_CAP, SCORE_COLORS;
var init_scoreConfig_kds_3 = __esm({
  "src/features/kentuFocus/score/scoreConfig.kds-3.js"() {
    SCORE_VERSION3 = "kds-3";
    CYLINDER_WEIGHTS3 = Object.freeze({
      alimentazione: 0.45,
      sonno: 0.3,
      movimento: 0.25
    });
    MIN_CYLINDERS_WITH_DATA3 = 2;
    ON_TRACK_SCORE = 0.75;
    NULL_SCORE_STATUSES3 = Object.freeze([
      "future",
      "in_progress",
      "hole",
      "paused"
    ]);
    LOW_RELIABILITY_STATUSES3 = Object.freeze([
      "approximate"
    ]);
    MOVEMENT_CURVE = Object.freeze({
      dailyWalkMinutes: 30,
      stepsUnder60: 8e3,
      stepsFrom60: 6500,
      ageThreshold: 60,
      weeklyEquivalentMinutes: 150,
      vigorousFactor: 2,
      dailyWeight: 0.5,
      weeklyWeight: 0.5,
      windowDays: 7,
      onTrackMinValue: 0.75,
      halfwayMinValue: 0.45,
      checkInMinutes: Object.freeze({
        poco: 10,
        mezzora: 30,
        ora: 60
      })
    });
    PILLAR_STATUS = Object.freeze({
      onTrackMin: 0.75,
      halfwayMin: 0.45
    });
    ACTION_PILLAR_WEIGHTS = Object.freeze({
      alimentazione: 0.45,
      sonno: 0.3,
      movimento: 0.25,
      forza: 0.15
    });
    PERIOD_RULES2 = Object.freeze({
      minCoverage: 0.6,
      onTrackMinScore: 0.75,
      breakBelowScore: 0.5,
      minPublishedStreak: 3
    });
    PERIOD_DATA_STATUSES = Object.freeze([
      "closed",
      "unconfirmed",
      "approximate",
      "late"
    ]);
    UNCONFIRMED_PERIOD_WEIGHT = 0.8;
    MEAL_PENALTY_CAP = 0.2;
    SCORE_COLORS = Object.freeze({
      orangeRed: "#C2410C",
      lightBlue: "#93C5FD",
      electricBlue: "#2563EB",
      missing: "#111111"
    });
  }
});

// src/features/kentuFocus/score/scoreConfig.kds-4.js
var SCORE_VERSION4;
var init_scoreConfig_kds_4 = __esm({
  "src/features/kentuFocus/score/scoreConfig.kds-4.js"() {
    init_scoreConfig_kds_3();
    init_scoreConfig_kds_2();
    SCORE_VERSION4 = "kds-4";
  }
});

// src/features/kentuFocus/score/scoreConfig.kds-5.js
var SCORE_VERSION5;
var init_scoreConfig_kds_5 = __esm({
  "src/features/kentuFocus/score/scoreConfig.kds-5.js"() {
    init_scoreConfig_kds_3();
    init_scoreConfig_kds_2();
    SCORE_VERSION5 = "kds-5";
  }
});

// src/utils/profileAge.js
function calculateAge(dobString) {
  if (!dobString) return null;
  const today = /* @__PURE__ */ new Date();
  const birthDate = new Date(dobString);
  if (Number.isNaN(birthDate.getTime())) return null;
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || m === 0 && today.getDate() < birthDate.getDate()) {
    age--;
  }
  return age;
}
var init_profileAge = __esm({
  "src/utils/profileAge.js"() {
  }
});

// src/calendarDateUtils.js
function addDays(dateStr, n) {
  const d = /* @__PURE__ */ new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
var init_calendarDateUtils = __esm({
  "src/calendarDateUtils.js"() {
  }
});

// src/features/commandTerminal/context/recentWorkoutLogs.js
function localToday() {
  const now = /* @__PURE__ */ new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
function dayRawLog2(fullHistory, dateKey) {
  const node = fullHistory?.[`trackerStorico_${dateKey}`];
  if (!node || typeof node !== "object") return [];
  if (node.log != null) return node.log;
  if (node.dati && typeof node.dati === "object" && node.dati.log != null) return node.dati.log;
  return [];
}
function collectRecentWorkoutLogs(fullHistory = {}, activeLog = [], activeDate = "") {
  const anchor = String(activeDate || "").slice(0, 10) || localToday();
  const byId = /* @__PURE__ */ new Map();
  let anonymous = 0;
  const ingestDay = (dateKey, rawLog) => {
    for (const entry of expandTrackerLogEntries(rawLog)) {
      if (!entry || typeof entry !== "object") continue;
      if (entry.isGhost === true) continue;
      const kind = String(entry.type || "").trim().toLowerCase();
      if (kind && kind !== "workout") continue;
      const id = String(entry.id || entry.nodeId || "").trim();
      const key = id || `${dateKey}:anon:${anonymous}`;
      anonymous += 1;
      if (byId.has(key)) continue;
      byId.set(key, { ...entry, type: "workout", __dateKey: dateKey });
    }
  };
  for (let back = 0; back <= 8; back += 1) {
    const dateKey = addDays(anchor, -back);
    if (back === 0 && Array.isArray(activeLog) && activeLog.length > 0) {
      ingestDay(dateKey, activeLog);
    } else {
      ingestDay(dateKey, dayRawLog2(fullHistory, dateKey));
    }
  }
  const all = [...byId.values()];
  const cardioLogs = [];
  const workoutLogs = [];
  for (const entry of all) {
    const typeId = String(entry.workoutType || entry.subType || entry.activityType || "").trim().toLowerCase();
    if (typeId === "cardio" || typeId === "hiit" || typeId === "liss") cardioLogs.push(entry);
    else workoutLogs.push(entry);
  }
  return { cardioLogs, workoutLogs, all };
}
var init_recentWorkoutLogs = __esm({
  "src/features/commandTerminal/context/recentWorkoutLogs.js"() {
    init_calendarDateUtils();
    init_expandTrackerDayLog();
  }
});

// src/features/kentuFocus/costanza/versions.js
var init_versions = __esm({
  "src/features/kentuFocus/costanza/versions.js"() {
  }
});

// src/features/kentuFocus/costanza/forceConsistency.ci-1.js
function forceLoadConsistency(date, fullHistory, opts = {}) {
  const asOf = String(date || "").slice(0, 10);
  const snap = computeCostanzaForza({
    fullHistory,
    asOfDate: asOf,
    weeklyGoalDays: normalizeWeeklyGoalDays(opts.weeklyGoalDays)
  });
  const goal = snap.weeklyGoalDays;
  const dayPart = goal > 0 ? Math.min(1, snap.forceDaysThisWeek / goal) : 0;
  const coverPart = snap.forceCiGroupTotal > 0 ? snap.forceCiCoveredCount / snap.forceCiGroupTotal : 0;
  const value = 0.5 * dayPart + 0.5 * coverPart;
  return Math.min(1, Math.round(value * 1e3) / 1e3);
}
var init_forceConsistency_ci_1 = __esm({
  "src/features/kentuFocus/costanza/forceConsistency.ci-1.js"() {
    init_versions();
    init_costanzaForza();
  }
});

// src/features/kentuFocus/score/scoreMovement.js
function scoreMovimento(date, fullHistory, context = {}) {
  const days = datesEnding(date, MOVEMENT_CURVE.windowDays);
  const byDay = workoutsByDay(fullHistory, date);
  const age = resolveAge(context);
  let weeklyEquivalent = 0;
  let sawDiary = fullHistory && typeof fullHistory === "object";
  let todayWalkMin = 0;
  let todaySteps = null;
  let todayEstimated = false;
  let todayFromDiary = false;
  for (const day of days) {
    const node = dayNode(fullHistory, day);
    const steps = readSteps(node);
    const entries = byDay.get(day) || [];
    const parts = movementParts(entries);
    const checkIn = readCheckIn(context, day);
    const diaryMovement = parts.walkMin > 0 || parts.vigorousMin > 0;
    if (diaryMovement || steps != null) sawDiary = true;
    let walkMin = parts.walkMin;
    let dayEquivalent = entries.reduce((sum, entry) => sum + equivalentAerobicMinutes(entry), 0);
    if (!diaryMovement && checkIn != null) {
      walkMin = checkIn;
      dayEquivalent = checkIn;
      if (day === date) todayEstimated = true;
    }
    weeklyEquivalent += dayEquivalent;
    if (day === date) {
      todaySteps = steps;
      todayWalkMin = walkMin;
      todayFromDiary = diaryMovement;
    }
  }
  if (!sawDiary && todaySteps == null && !todayEstimated && !(todayWalkMin > 0)) {
    return cylinder("no_data", "non registrato", [], null);
  }
  const dailyRatio = todaySteps != null ? Math.min(1, todaySteps / stepReference(age)) : Math.min(1, todayWalkMin / MOVEMENT_CURVE.dailyWalkMinutes);
  const weeklyRatio = Math.min(1, weeklyEquivalent / MOVEMENT_CURVE.weeklyEquivalentMinutes);
  const value = MOVEMENT_CURVE.dailyWeight * dailyRatio + MOVEMENT_CURVE.weeklyWeight * weeklyRatio;
  let status = "off_track";
  if (value >= MOVEMENT_CURVE.onTrackMinValue) status = "on_track";
  else if (value >= MOVEMENT_CURVE.halfwayMinValue) status = "halfway";
  const todayFact = todaySteps != null ? `oggi ${Math.round(todaySteps)} passi` : `oggi ${formatMinutes(todayWalkMin)}${todayEstimated ? " stimati" : ""}`;
  const weekFact = `${formatMinutes(weeklyEquivalent)} eq / 7 giorni`;
  const signals = [];
  if (todayEstimated) signals.push("walk_estimated");
  if (todayFromDiary) signals.push("diary_movement");
  if (todaySteps != null) signals.push("steps");
  return {
    ...cylinder(status, `${todayFact} \xB7 ${weekFact}`, signals, value),
    acuteValue: Math.round(dailyRatio * 1e3) / 1e3,
    weeklyEquivalentMinutes: Math.round(weeklyEquivalent)
  };
}
function forceLoad(date, fullHistory, context = {}) {
  return forceLoadConsistency(date, fullHistory, {
    weeklyGoalDays: normalizeWeeklyGoalDays(context?.cylinders?.forza?.weeklyGoalDays)
  });
}
function forzaEnabled(context) {
  return context?.cylinders?.forza?.enabled === true;
}
function workoutsByDay(fullHistory, date) {
  const map = /* @__PURE__ */ new Map();
  const { all } = collectRecentWorkoutLogs(fullHistory, [], date);
  for (const entry of all) {
    const day = String(entry.__dateKey || "").slice(0, 10);
    if (!day) continue;
    const list = map.get(day) || [];
    list.push(entry);
    map.set(day, list);
  }
  return map;
}
function movementParts(entries) {
  let walkMin = 0;
  let vigorousMin = 0;
  for (const entry of entries) {
    const kind = classifyWorkoutByType(entry).kind;
    const minutes = equivalentAerobicMinutes(entry);
    if (!(minutes > 0)) continue;
    if (kind === "walk") walkMin += minutes;
    else if (kind === "vigorous") vigorousMin += minutes / 2;
  }
  return { walkMin, vigorousMin };
}
function readSteps(node) {
  if (!node || typeof node !== "object") return null;
  const direct = [node.steps, node.stepCount, node.passi, node.activity?.steps, node.activity?.stepCount];
  for (const candidate of direct) {
    const value = finiteSteps(candidate);
    if (value != null) return value;
  }
  for (const entry of getLogArray(node)) {
    const type = String(entry?.type || "").toLowerCase();
    if (type !== "steps" && type !== "passi") continue;
    const value = finiteSteps(entry.steps ?? entry.stepCount ?? entry.passi ?? entry.count ?? entry.value);
    if (value != null) return value;
  }
  return null;
}
function readCheckIn(context, date) {
  const raw = context?.movementCheckins?.[date] ?? context?.walkEstimates?.[date];
  if (raw == null) return null;
  if (typeof raw === "number") return raw > 0 ? raw : null;
  const minutes = Number(raw.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes;
}
function stepReference(age) {
  if (age != null && age >= MOVEMENT_CURVE.ageThreshold) return MOVEMENT_CURVE.stepsFrom60;
  return MOVEMENT_CURVE.stepsUnder60;
}
function resolveAge(context) {
  const direct = Number(
    context?.age ?? context?.profile?.age ?? context?.profile_targets?.profile?.age ?? context?.profile_targets?.age
  );
  if (Number.isFinite(direct) && direct > 0 && direct < 120) return direct;
  const birth = context?.profile?.birthDate || context?.profile_targets?.profile?.birthDate || context?.profile_targets?.birthDate || null;
  const years = calculateAge(birth);
  return Number.isFinite(years) && years > 0 ? years : null;
}
function finiteSteps(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
function formatMinutes(minutes) {
  return formatFocusHoursIt(Number(minutes) / 60) || "0 min";
}
function datesEnding(date, count) {
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(addCalendarDays(date, -i));
  return out;
}
function dayNode(fullHistory, date) {
  return getTrackerDayNode(fullHistory, date);
}
function cylinder(status, keyFact, signals, value) {
  const rounded = value == null ? null : Math.round(value * 1e3) / 1e3;
  return { status, keyFact, signals, value: rounded };
}
var init_scoreMovement = __esm({
  "src/features/kentuFocus/score/scoreMovement.js"() {
    init_profileAge();
    init_focusDateUtils();
    init_focusDateUtils();
    init_getTrackerDayNode();
    init_logUtils();
    init_recentWorkoutLogs();
    init_workoutMovement();
    init_forceConsistency_ci_1();
    init_costanzaForza();
    init_scoreConfig_kds_3();
  }
});

// src/features/kentuFocus/score/movementBattery.js
function stepBattery(battery, charge) {
  const b = Number.isFinite(battery) && battery > 0 ? battery : 0;
  const c = Number.isFinite(charge) && charge > 0 ? charge : 0;
  return b * BATTERY_DECAY + c;
}
function batteryLevel(battery) {
  const b = Number.isFinite(battery) && battery > 0 ? battery : 0;
  return Math.min(1, b / BATTERY_FULL_LEVEL);
}
function batteryStatusFromLevel(level) {
  return pillarStatusFromValue(level);
}
function entryIsDiaryCardio(entry) {
  const kind = classifyWorkoutByType(entry).kind;
  return kind === "walk" || kind === "vigorous";
}
function dayMovementCharge(date, fullHistory, movementCheckins = null) {
  if (!isIsoDateString(date)) {
    return { charge: 0, diaryEq: 0, checkInMin: 0, usedCheckIn: false, hasDiaryCardio: false };
  }
  const { all } = collectRecentWorkoutLogs(fullHistory || {}, [], date);
  let diaryEq = 0;
  let hasDiaryCardio = false;
  for (const entry of all) {
    if (String(entry?.__dateKey || "").slice(0, 10) !== date) continue;
    const eq = equivalentAerobicMinutes(entry);
    if (eq > 0) {
      diaryEq += eq;
      hasDiaryCardio = true;
    } else if (entryIsDiaryCardio(entry)) {
      hasDiaryCardio = true;
    }
  }
  let checkInMin = 0;
  let usedCheckIn = false;
  if (!hasDiaryCardio) {
    const raw = movementCheckins?.[date] ?? null;
    const minutes = typeof raw === "number" ? raw : Number(raw?.minutes);
    if (Number.isFinite(minutes) && minutes > 0) {
      checkInMin = Math.min(BATTERY_CHECKIN_CAP_MIN, minutes);
      usedCheckIn = checkInMin > 0;
    }
  }
  return {
    charge: diaryEq + (usedCheckIn ? checkInMin : 0),
    diaryEq: Math.round(diaryEq * 10) / 10,
    checkInMin,
    usedCheckIn,
    hasDiaryCardio
  };
}
function chargeSeriesEnding(date, fullHistory, movementCheckins = null, lookback = BATTERY_LOOKBACK_DAYS) {
  if (!isIsoDateString(date)) return [];
  const n = Math.max(1, Math.round(Number(lookback) || BATTERY_LOOKBACK_DAYS));
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const day = addCalendarDays(date, -i);
    const row = dayMovementCharge(day, fullHistory, movementCheckins);
    out.push({
      date: day,
      charge: row.charge,
      diaryEq: row.diaryEq,
      usedCheckIn: row.usedCheckIn
    });
  }
  return out;
}
function simulateBattery(charges, startBattery = 0) {
  let B = Number.isFinite(startBattery) && startBattery > 0 ? startBattery : 0;
  const levels = [];
  const batteries = [];
  for (const c of charges) {
    B = stepBattery(B, c);
    batteries.push(B);
    levels.push(batteryLevel(B));
  }
  return { battery: B, level: batteryLevel(B), levels, batteries };
}
function firstTrackerDate(fullHistory) {
  if (!fullHistory || typeof fullHistory !== "object") return null;
  let first = null;
  for (const key of Object.keys(fullHistory)) {
    if (!key.startsWith("trackerStorico_")) continue;
    const date = key.slice("trackerStorico_".length);
    if (!isIsoDateString(date)) continue;
    if (!first || date < first) first = date;
  }
  return first;
}
function isMovementBatteryReady(fullHistory, date, context = {}) {
  if (context.calibration?.active === true || context.calibrating === true) return false;
  if (context.movementBatteryReady === false) return false;
  if (context.movementBatteryReady === true) return true;
  if (!isIsoDateString(date)) return false;
  const first = firstTrackerDate(fullHistory);
  if (!first || first > date) return false;
  let span = 0;
  for (let d = first; d <= date; d = addCalendarDays(d, 1)) {
    span += 1;
    if (span >= BATTERY_READY_MIN_SPAN_DAYS) return true;
  }
  return span >= BATTERY_READY_MIN_SPAN_DAYS;
}
function computeMovementBattery(date, fullHistory, context = {}) {
  const checkins = context.movementCheckins || context.walkEstimates || null;
  const ready = isMovementBatteryReady(fullHistory, date, context);
  const series = chargeSeriesEnding(date, fullHistory, checkins, BATTERY_LOOKBACK_DAYS);
  const sim = simulateBattery(series.map((row) => row.charge), 0);
  const today = series[series.length - 1] || { charge: 0, diaryEq: 0, usedCheckIn: false };
  const level = ready ? round3(sim.level) : null;
  const status = level == null ? "no_data" : batteryStatusFromLevel(level);
  return {
    ready,
    level,
    battery: round3(sim.battery),
    status,
    charge: round3(today.charge),
    diaryEq: today.diaryEq,
    usedCheckIn: Boolean(today.usedCheckIn),
    decay: BATTERY_DECAY,
    fullLevel: round3(BATTERY_FULL_LEVEL),
    capacity: round3(BATTERY_CAPACITY),
    lookbackDays: BATTERY_LOOKBACK_DAYS,
    series,
    fillPercent: level == null ? null : Math.round(level * 100),
    copy: BATTERY_DECAY_COPY
  };
}
function scoreMovimentoBattery(date, fullHistory, context = {}) {
  const bat = computeMovementBattery(date, fullHistory, context);
  if (!bat.ready || bat.level == null) {
    return {
      status: "no_data",
      keyFact: "in calibrazione",
      signals: ["battery_calibrating"],
      value: null,
      battery: bat
    };
  }
  const pct = Math.round(bat.level * 100);
  const signals = [];
  if (bat.usedCheckIn) signals.push("walk_estimated");
  if (bat.diaryEq > 0) signals.push("diary_movement");
  signals.push("movement_battery");
  return {
    status: bat.status,
    keyFact: `batteria ${pct}% \xB7 ${BATTERY_DECAY_COPY}`,
    signals,
    value: bat.level,
    acuteValue: null,
    weeklyEquivalentMinutes: Math.round(
      bat.series.reduce((sum, row) => sum + row.diaryEq, 0)
    ),
    battery: bat
  };
}
function round3(value) {
  return Math.round(Number(value) * 1e3) / 1e3;
}
var BATTERY_HALF_LIFE_DAYS, BATTERY_DECAY, BATTERY_WEEKLY_TARGET_EQ_MIN, BATTERY_DAILY_TARGET_EQ_MIN, BATTERY_CAPACITY, BATTERY_FULL_FRACTION, BATTERY_FULL_LEVEL, BATTERY_LOOKBACK_DAYS, BATTERY_READY_MIN_SPAN_DAYS, BATTERY_CHECKIN_CAP_MIN, BATTERY_DECAY_COPY;
var init_movementBattery = __esm({
  "src/features/kentuFocus/score/movementBattery.js"() {
    init_focusDateUtils();
    init_recentWorkoutLogs();
    init_workoutMovement();
    init_scoreConfig_kds_3();
    BATTERY_HALF_LIFE_DAYS = 3;
    BATTERY_DECAY = 2 ** (-1 / BATTERY_HALF_LIFE_DAYS);
    BATTERY_WEEKLY_TARGET_EQ_MIN = 150;
    BATTERY_DAILY_TARGET_EQ_MIN = BATTERY_WEEKLY_TARGET_EQ_MIN / 7;
    BATTERY_CAPACITY = BATTERY_DAILY_TARGET_EQ_MIN / (1 - BATTERY_DECAY);
    BATTERY_FULL_FRACTION = 0.8;
    BATTERY_FULL_LEVEL = BATTERY_CAPACITY * BATTERY_FULL_FRACTION;
    BATTERY_LOOKBACK_DAYS = 14;
    BATTERY_READY_MIN_SPAN_DAYS = 7;
    BATTERY_CHECKIN_CAP_MIN = 30;
    BATTERY_DECAY_COPY = "senza cardio si scarica di circa il 20% al giorno";
  }
});

// src/features/kentuFocus/safety/safetyConfig.sfv-1.js
var SAFETY_VERSION, CLOSED_LOOKBACK_DAYS, ENERGY_WINDOW_DAYS, ENERGY_SUSTAINED_RATIO, ENERGY_VERY_LOW_RATIO, ENERGY_VERY_LOW_DAYS, ENERGY_UNDER_BASAL_DAYS, ENERGY_ACT_SCORE_CAP, WEIGHT_MIN_SAMPLES, WEIGHT_SAMPLE_DAYS, WEIGHT_BLOCK_DAYS, WEIGHT_WEEKLY_LOSS_RATIO, PROTEIN_DEFICIT_RATIO, PROTEIN_GRAMS_PER_KG, REST_STREAK_WATCH_DAYS, REST_STREAK_ACT_DAYS, DISTRICT_RECOVERY_HOURS, DISTRICT_SHORT_RECOVERY_TIMES, TRAINING_WINDOW_DAYS, LOAD_BASELINE_WEEKS, LOAD_SPIKE_RATIO, SHORT_SLEEP_HOURS, LOW_MORNING_SCORE, MORNING_CLUSTER_HITS, MORNING_CLUSTER_DAYS, OVERREACHING_CLUSTERS, RESTRICTIVE_WINDOW_DAYS, RESTRICTIVE_DAYS, SAFETY_AREAS;
var init_safetyConfig_sfv_1 = __esm({
  "src/features/kentuFocus/safety/safetyConfig.sfv-1.js"() {
    SAFETY_VERSION = "sfv-3";
    CLOSED_LOOKBACK_DAYS = 28;
    ENERGY_WINDOW_DAYS = 7;
    ENERGY_SUSTAINED_RATIO = 0.75;
    ENERGY_VERY_LOW_RATIO = 0.6;
    ENERGY_VERY_LOW_DAYS = 3;
    ENERGY_UNDER_BASAL_DAYS = 2;
    ENERGY_ACT_SCORE_CAP = 0.74;
    WEIGHT_MIN_SAMPLES = 4;
    WEIGHT_SAMPLE_DAYS = 14;
    WEIGHT_BLOCK_DAYS = 7;
    WEIGHT_WEEKLY_LOSS_RATIO = 0.01;
    PROTEIN_DEFICIT_RATIO = 0.1;
    PROTEIN_GRAMS_PER_KG = 1.2;
    REST_STREAK_WATCH_DAYS = 6;
    REST_STREAK_ACT_DAYS = 8;
    DISTRICT_RECOVERY_HOURS = 48;
    DISTRICT_SHORT_RECOVERY_TIMES = 2;
    TRAINING_WINDOW_DAYS = 7;
    LOAD_BASELINE_WEEKS = 4;
    LOAD_SPIKE_RATIO = 1.5;
    SHORT_SLEEP_HOURS = 6;
    LOW_MORNING_SCORE = 2;
    MORNING_CLUSTER_HITS = 2;
    MORNING_CLUSTER_DAYS = 3;
    OVERREACHING_CLUSTERS = 2;
    RESTRICTIVE_WINDOW_DAYS = 14;
    RESTRICTIVE_DAYS = 5;
    SAFETY_AREAS = Object.freeze({
      energia: "Energia",
      peso: "Peso",
      proteine: "Proteine",
      allenamento: "Allenamento",
      sovraccarico: "Sovraccarico",
      rapporto: "Rapporto con il cibo"
    });
  }
});

// src/features/kentuFocus/safety/computeSafety.js
var computeSafety_exports = {};
__export(computeSafety_exports, {
  computeSafety: () => computeSafety,
  estimateBasalKcal: () => estimateBasalKcal
});
function computeSafety(date, context = {}) {
  const empty = blank();
  if (!isIsoDateString(date)) return empty;
  const statusOf = makeStatus(date, context);
  if (statusOf(date) !== "closed") return empty;
  const history = context.fullHistory;
  const targetKcal = resolveTargetKcal(context);
  const profile = profileOf(context);
  const basal = estimateBasalKcal(profile);
  const weighIns = collectWeighIns(context);
  const days = indexDays(history);
  const signals = [];
  signals.push(...energySignals(date, statusOf, history, targetKcal, basal));
  const weight = weightSignal(date, weighIns);
  if (weight) signals.push(weight);
  const protein = proteinSignal(date, statusOf, history, targetKcal, profile, weighIns);
  if (protein) signals.push(protein);
  const training = trainingSignals(date, statusOf, days);
  signals.push(...training);
  const over = overreachingSignal(date, statusOf, days, training);
  if (over) signals.push(over);
  const restrictive = restrictiveSignal(date, statusOf, history, targetKcal, basal);
  if (restrictive) signals.push(restrictive);
  const level = signals.some((item) => item.level === "act") ? "act" : signals.length > 0 ? "watch" : "none";
  return {
    version: SAFETY_VERSION,
    level,
    signals,
    suppressNumbers: signals.some((item) => item.id === "restrictive_pattern")
  };
}
function energySignals(date, statusOf, history, targetKcal, basal) {
  if (!(targetKcal > 0)) return [];
  const recent = lastClosedIntake(date, ENERGY_WINDOW_DAYS, statusOf, history);
  const out = [];
  if (recent.length === ENERGY_WINDOW_DAYS) {
    const mean = average(recent.map((day) => day.kcal));
    if (mean < targetKcal * ENERGY_SUSTAINED_RATIO) {
      out.push(signal("energy_deficit_sustained", SAFETY_AREAS.energia, "watch", {
        days: recent.length,
        meanKcal: Math.round(mean),
        targetKcal: Math.round(targetKcal),
        ratio: round32(mean / targetKcal)
      }));
    }
  }
  const veryLow = recent.filter((day) => day.kcal < targetKcal * ENERGY_VERY_LOW_RATIO).length;
  const underBasal = basal > 0 ? recent.filter((day) => day.kcal < basal).length : 0;
  if (veryLow >= ENERGY_VERY_LOW_DAYS || underBasal >= ENERGY_UNDER_BASAL_DAYS) {
    out.push(signal("energy_very_low_repeated", SAFETY_AREAS.energia, "act", {
      days: recent.length,
      underTargetDays: veryLow,
      underBasalDays: underBasal,
      basalKcal: basal > 0 ? Math.round(basal) : null,
      targetKcal: Math.round(targetKcal)
    }));
  }
  return out;
}
function weightSignal(date, weighIns) {
  const sampleFrom = addCalendarDays(date, -(WEIGHT_SAMPLE_DAYS - 1));
  const samples = weighIns.filter((row) => row.date >= sampleFrom && row.date <= date);
  if (samples.length < WEIGHT_MIN_SAMPLES) return null;
  const recent = meanBetween(weighIns, addCalendarDays(date, -(WEIGHT_BLOCK_DAYS - 1)), date);
  const previous = meanBetween(
    weighIns,
    addCalendarDays(date, -(WEIGHT_BLOCK_DAYS * 2 - 1)),
    addCalendarDays(date, -WEIGHT_BLOCK_DAYS)
  );
  const prior = meanBetween(
    weighIns,
    addCalendarDays(date, -(WEIGHT_BLOCK_DAYS * 3 - 1)),
    addCalendarDays(date, -(WEIGHT_BLOCK_DAYS * 2))
  );
  if (!(recent > 0) || !(previous > 0) || !(prior > 0)) return null;
  const lossRecent = (previous - recent) / previous;
  const lossPrevious = (prior - previous) / prior;
  if (!(lossRecent > WEIGHT_WEEKLY_LOSS_RATIO) || !(lossPrevious > WEIGHT_WEEKLY_LOSS_RATIO)) {
    return null;
  }
  return signal("weight_loss_fast", SAFETY_AREAS.peso, "act", {
    weighIns: samples.length,
    recentKg: round32(recent),
    previousKg: round32(previous),
    priorKg: round32(prior),
    weeklyLoss: round32(lossRecent)
  });
}
function proteinSignal(date, statusOf, history, targetKcal, profile, weighIns) {
  if (!(targetKcal > 0)) return null;
  const recent = lastClosedIntake(date, ENERGY_WINDOW_DAYS, statusOf, history);
  if (recent.length < ENERGY_WINDOW_DAYS) return null;
  const weight = weightKgOn(date, weighIns, profile);
  if (!(weight > 0)) return null;
  const meanKcal = average(recent.map((day) => day.kcal));
  const meanProtein = average(recent.map((day) => day.prot));
  const gramsPerKg = meanProtein / weight;
  const deficit = (targetKcal - meanKcal) / targetKcal;
  if (!(deficit > PROTEIN_DEFICIT_RATIO) || !(gramsPerKg < PROTEIN_GRAMS_PER_KG)) return null;
  return signal("protein_low_in_deficit", SAFETY_AREAS.proteine, "watch", {
    days: recent.length,
    meanKcal: Math.round(meanKcal),
    targetKcal: Math.round(targetKcal),
    meanProteinG: Math.round(meanProtein),
    gramsPerKg: round32(gramsPerKg),
    weightKg: round32(weight)
  });
}
function trainingSignals(date, statusOf, days) {
  const out = [];
  let streak = 0;
  for (let back = 0; back < CLOSED_LOOKBACK_DAYS; back += 1) {
    const day = addCalendarDays(date, -back);
    if (statusOf(day) !== "closed") break;
    if (!hasHardSession(days.get(day))) break;
    streak += 1;
  }
  if (streak >= REST_STREAK_ACT_DAYS) {
    out.push(signal("no_rest_streak", SAFETY_AREAS.allenamento, "act", { days: streak }));
  } else if (streak >= REST_STREAK_WATCH_DAYS) {
    out.push(signal("no_rest_streak", SAFETY_AREAS.allenamento, "watch", { days: streak }));
  }
  const district = shortRecovery(date, statusOf, days);
  if (district) {
    out.push(signal("same_district_no_recovery", SAFETY_AREAS.allenamento, "watch", district));
  }
  const spike = loadSpike(date, statusOf, days);
  if (spike) out.push(signal("load_spike", SAFETY_AREAS.allenamento, "watch", spike));
  return out;
}
function overreachingSignal(date, statusOf, days, training) {
  const load = (training || []).filter((item) => item.id === "no_rest_streak" || item.id === "load_spike");
  if (load.length === 0) return null;
  const mornings = [];
  for (let back = 0; back < MORNING_CLUSTER_DAYS; back += 1) {
    const day = addCalendarDays(date, -back);
    if (statusOf(day) !== "closed") continue;
    mornings.push(readMorning(days.get(day)));
  }
  const shortNights = mornings.filter((item) => item.hours != null && item.hours < SHORT_SLEEP_HOURS).length;
  const lowWake = mornings.filter((item) => item.wakeEnergy != null && item.wakeEnergy <= LOW_MORNING_SCORE).length;
  const lowQuality = mornings.filter((item) => item.quality != null && item.quality <= LOW_MORNING_SCORE).length;
  const clusters = [
    shortNights >= MORNING_CLUSTER_HITS,
    lowWake >= MORNING_CLUSTER_HITS,
    lowQuality >= MORNING_CLUSTER_HITS
  ].filter(Boolean).length;
  if (clusters < OVERREACHING_CLUSTERS) return null;
  return signal("overreaching", SAFETY_AREAS.sovraccarico, "act", {
    training: load.map((item) => item.id),
    shortNights,
    lowWakeEnergy: lowWake,
    lowSleepQuality: lowQuality
  });
}
function restrictiveSignal(date, statusOf, history, targetKcal, basal) {
  if (!(targetKcal > 0)) return null;
  let days = 0;
  for (let back = 0; back < RESTRICTIVE_WINDOW_DAYS; back += 1) {
    const day = addCalendarDays(date, -back);
    if (statusOf(day) !== "closed") continue;
    const intake = readIntake(history, day);
    if (!intake) continue;
    const underTarget = intake.kcal < targetKcal * ENERGY_VERY_LOW_RATIO;
    const underBasal = basal > 0 && intake.kcal < basal;
    if (underTarget || underBasal) days += 1;
  }
  if (days < RESTRICTIVE_DAYS) return null;
  return signal("restrictive_pattern", SAFETY_AREAS.rapporto, "act", {
    days,
    windowDays: RESTRICTIVE_WINDOW_DAYS
  });
}
function lastClosedIntake(date, count, statusOf, history) {
  const out = [];
  for (let back = 0; back < CLOSED_LOOKBACK_DAYS && out.length < count; back += 1) {
    const day = addCalendarDays(date, -back);
    if (statusOf(day) !== "closed") continue;
    const intake = readIntake(history, day);
    if (!intake) continue;
    out.push(intake);
  }
  return out;
}
function readIntake(history, date) {
  const foods = collectDayLogForNutrition(getTrackerDayNode(history, date)).filter((item) => {
    const type = String(item?.type || "food").toLowerCase();
    return FOOD_TYPES.has(type);
  });
  if (foods.length === 0) return null;
  const totals = computeTotali(foods);
  const kcal = Math.round(Number(totals.kcal) || 0);
  if (!(kcal > 0)) return null;
  return { date, kcal, prot: Number(totals.prot) || 0 };
}
function hasHardSession(node) {
  return workoutsOf(node).some((entry) => {
    const kind = classifyWorkoutByType(entry).kind;
    return kind === "strength" || kind === "vigorous";
  });
}
function hardMinutes(node) {
  let minutes = 0;
  for (const entry of workoutsOf(node)) {
    const kind = classifyWorkoutByType(entry).kind;
    if (kind !== "strength" && kind !== "vigorous") continue;
    minutes += resolveWorkoutDurationMinutes(entry);
  }
  return minutes;
}
function shortRecovery(date, statusOf, days) {
  const instants = /* @__PURE__ */ new Map();
  for (let back = 0; back < TRAINING_WINDOW_DAYS; back += 1) {
    const day = addCalendarDays(date, -back);
    if (statusOf(day) !== "closed") continue;
    for (const entry of workoutsOf(days.get(day))) {
      if (classifyWorkoutByType(entry).kind !== "strength") continue;
      const at = sessionMs(day, entry);
      for (const district of districtsOf(entry)) {
        const list = instants.get(district) || [];
        list.push(at);
        instants.set(district, list);
      }
    }
  }
  const limit = DISTRICT_RECOVERY_HOURS * 60 * 60 * 1e3;
  let worst = null;
  for (const [district, stamps] of instants) {
    const sorted = [...stamps].sort((a, b) => a - b);
    let gaps = 0;
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i] - sorted[i - 1] < limit) gaps += 1;
    }
    if (gaps >= DISTRICT_SHORT_RECOVERY_TIMES && (!worst || gaps > worst.shortGaps)) {
      worst = { district, shortGaps: gaps };
    }
  }
  return worst;
}
function loadSpike(date, statusOf, days) {
  const current = weekMinutes(date, 0, statusOf, days);
  const baselines = [];
  for (let week = 1; week <= LOAD_BASELINE_WEEKS; week += 1) {
    const block = weekBlock(date, week, statusOf, days);
    if (!block.closed) return null;
    baselines.push(block.minutes);
  }
  const baseline = average(baselines);
  if (!(baseline > 0)) return null;
  if (!(current > baseline * LOAD_SPIKE_RATIO)) return null;
  return {
    weekMinutes: Math.round(current),
    baselineMinutes: Math.round(baseline),
    ratio: round32(current / baseline)
  };
}
function weekMinutes(date, weeksBack, statusOf, days) {
  return weekBlock(date, weeksBack, statusOf, days).minutes;
}
function weekBlock(date, weeksBack, statusOf, days) {
  const end = addCalendarDays(date, -weeksBack * TRAINING_WINDOW_DAYS);
  let minutes = 0;
  let closed = false;
  for (let back = 0; back < TRAINING_WINDOW_DAYS; back += 1) {
    const day = addCalendarDays(end, -back);
    if (statusOf(day) !== "closed") continue;
    closed = true;
    minutes += hardMinutes(days.get(day));
  }
  return { minutes, closed };
}
function readMorning(node) {
  const night = normalizeSleepNight(node, { publicationDate: "1970-01-01" });
  const hours = night?.sleepAvailable ? Number(night.sleep?.hours?.value) : null;
  const quality = night?.sleep?.qualityStars?.provenance === "recorded" ? Number(night.sleep.qualityStars.value) : null;
  const entry = pickMainNightSleepEntry(
    expandTrackerLogEntries(pickDayLogRaw(node)).filter((item) => item?.type === "sleep")
  );
  let wakeEnergy = null;
  for (const field of WAKE_ENERGY_FIELDS) {
    const value = Number(entry?.[field]);
    if (Number.isFinite(value)) {
      wakeEnergy = value;
      break;
    }
  }
  const stars = quality != null ? quality : normalizeQualityStars(entry?.quality ?? entry?.sleepQuality ?? entry?.rating);
  return {
    hours: hours > 0 ? hours : null,
    quality: Number.isFinite(stars) ? stars : null,
    wakeEnergy
  };
}
function districtsOf(entry) {
  return sessionTrainedMuscleIds(entry);
}
function workoutsOf(node) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of expandTrackerLogEntries(pickDayLogRaw(node))) {
    if (!entry || entry.isGhost === true) continue;
    if (String(entry.type || "").toLowerCase() !== "workout") continue;
    const id = String(entry.id || "");
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(entry);
  }
  return out;
}
function sessionMs(date, entry) {
  const hour = Number(entry?.mealTime ?? entry?.time ?? entry?.startHour);
  const clock = Number.isFinite(hour) ? hour : 12;
  return (/* @__PURE__ */ new Date(`${date}T00:00:00`)).getTime() + clock * 60 * 60 * 1e3;
}
function collectWeighIns(context) {
  const bags = [
    context.bodyMetrics,
    context.profile_targets?.bodyMetrics,
    context.fullHistory?.body_metrics,
    context.fullHistory?.bodyMetrics
  ];
  const seen = /* @__PURE__ */ new Set();
  const rows = [];
  for (const bag of bags) {
    const list = Array.isArray(bag) ? bag : bag && typeof bag === "object" ? Object.values(bag) : [];
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const day = String(entry.date || entry.effectiveDate || "").slice(0, 10);
      const kg = Number(entry.weight ?? entry.weightKg);
      if (!isIsoDateString(day) || !(kg > 0)) continue;
      const key = `${day}|${Math.round(kg * 1e3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ date: day, kg });
    }
  }
  return rows;
}
function weightKgOn(date, weighIns, profile) {
  const prior = weighIns.filter((row) => row.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  if (prior.length > 0) return prior[prior.length - 1].kg;
  const weight = Number(profile?.weight ?? profile?.peso);
  return weight > 0 ? weight : null;
}
function meanBetween(rows, from, to) {
  const found = rows.filter((row) => row.date >= from && row.date <= to);
  if (found.length === 0) return null;
  return average(found.map((row) => row.kg));
}
function estimateBasalKcal(profile) {
  const stored = Number(profile?.bmr ?? profile?.BMR);
  if (stored > 0) return stored;
  const weight = Number(profile?.weight ?? profile?.peso);
  const height = Number(profile?.height ?? profile?.altezza);
  const age = Number(profile?.age ?? profile?.eta);
  if (!(weight > 0) || !(height > 0) || !(age > 0)) return null;
  const gender = String(profile?.gender || profile?.sesso || "").trim().toUpperCase();
  const offset = gender === "F" || gender === "FEMALE" || gender === "DONNA" ? -161 : gender === "N" || gender === "NEUTRO" ? -78 : 5;
  const bmr = 10 * weight + 6.25 * height - 5 * age + offset;
  return bmr > 0 ? Math.round(bmr) : null;
}
function profileOf(context) {
  return context.profile || context.userProfile || context.profile_targets?.profile || null;
}
function resolveTargetKcal(context) {
  const candidates = [
    context.targetKcal,
    context.userTargets?.kcal,
    context.profile_targets?.targetCalories,
    context.profile_targets?.targets?.kcal
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}
function makeStatus(date, context) {
  return (day) => getDayStatus(day, day === date ? context : {
    today: context.today,
    fullHistory: context.fullHistory,
    records: context.records
  });
}
function indexDays(history) {
  const days = /* @__PURE__ */ new Map();
  if (!history || typeof history !== "object") return days;
  for (const [key, node] of Object.entries(history)) {
    if (!key.startsWith("trackerStorico_")) continue;
    const date = key.slice("trackerStorico_".length);
    if (!isIsoDateString(date) || !node || typeof node !== "object") continue;
    days.set(date, node);
  }
  return days;
}
function signal(id, area, level, evidence) {
  return { id, area, level, evidence };
}
function blank() {
  return {
    version: SAFETY_VERSION,
    level: "none",
    signals: [],
    suppressNumbers: false
  };
}
function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function round32(value) {
  return Math.round(value * 1e3) / 1e3;
}
var FOOD_TYPES, WAKE_ENERGY_FIELDS;
var init_computeSafety = __esm({
  "src/features/kentuFocus/safety/computeSafety.js"() {
    init_dayStatus();
    init_getTrackerDayNode();
    init_normalizeFoodEvents();
    init_expandTrackerDayLog();
    init_focusDateUtils();
    init_normalizeSleepNight();
    init_workoutMovement();
    init_muscleMap_mm_1();
    init_computeTotaliCore();
    init_safetyConfig_sfv_1();
    FOOD_TYPES = /* @__PURE__ */ new Set(["food", "recipe"]);
    WAKE_ENERGY_FIELDS = ["wakeEnergy", "morningEnergy", "energyOnWake", "energiaRisveglio"];
  }
});

// src/features/mealEngine/computeEffectiveDailyTargetKcal.js
function roundKcal(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}
function computeEffectiveDailyTargetKcal(parts = {}) {
  return Math.max(
    0,
    roundKcal(parts.settingsBaseKcal) + roundKcal(parts.burnKcal) + roundKcal(parts.strategyDeltaKcal) + roundKcal(parts.compensationKcal) + roundKcal(parts.autopilotKcal)
  );
}
var init_computeEffectiveDailyTargetKcal = __esm({
  "src/features/mealEngine/computeEffectiveDailyTargetKcal.js"() {
  }
});

// src/features/kentuFocus/server/reader/resolveFocusProfileData.js
function isValidIsoDate(value) {
  if (typeof value !== "string") return false;
  const iso = value.trim().slice(0, 10);
  if (!ISO_DATE_RE3.test(iso)) return false;
  const d = /* @__PURE__ */ new Date(`${iso}T12:00:00`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}
function resolveVerifiableDate(entry) {
  if (!entry || typeof entry !== "object") return null;
  const candidate = typeof entry.effectiveDate === "string" ? entry.effectiveDate.trim().slice(0, 10) : typeof entry.date === "string" ? entry.date.trim().slice(0, 10) : "";
  if (isValidIsoDate(candidate)) return candidate;
  const ts = Number(entry.timestamp);
  if (Number.isFinite(ts) && ts > 0) {
    const fromTs = new Date(ts).toISOString().slice(0, 10);
    if (isValidIsoDate(fromTs)) return fromTs;
  }
  return null;
}
function resolveTargetsForAnalysisDate(targetsNode, analysisDate) {
  if (!isIsoDateString(analysisDate)) {
    return {
      resolved: {},
      timelineApplied: 0,
      lastEffectiveDate: null,
      skippedUndated: 0
    };
  }
  const history = Array.isArray(targetsNode?.targetHistory) ? targetsNode.targetHistory : [];
  let skippedUndated = 0;
  const timeline = history.map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const effectiveDate = resolveVerifiableDate(entry);
    if (!effectiveDate) {
      skippedUndated += 1;
      return null;
    }
    return {
      effectiveDate,
      targets: entry.targets && typeof entry.targets === "object" ? entry.targets : {},
      source: entry.source || "targetHistory"
    };
  }).filter(Boolean).sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)));
  let resolved = {};
  let timelineApplied = 0;
  let lastEffectiveDate = null;
  for (const entry of timeline) {
    if (entry.effectiveDate > analysisDate) break;
    resolved = { ...resolved, ...entry.targets };
    timelineApplied += 1;
    lastEffectiveDate = entry.effectiveDate;
  }
  return { resolved, timelineApplied, lastEffectiveDate, skippedUndated };
}
var ISO_DATE_RE3, FOCUS_TARGET_WEIGHT_POLICY;
var init_resolveFocusProfileData = __esm({
  "src/features/kentuFocus/server/reader/resolveFocusProfileData.js"() {
    init_focusDateUtils();
    init_logUtils();
    ISO_DATE_RE3 = /^\d{4}-\d{2}-\d{2}$/;
    FOCUS_TARGET_WEIGHT_POLICY = Object.freeze({
      targets: [
        "targetHistory con effectiveDate|timestamp verificabile \u2264 analysisDate",
        "nessuna base da targets correnti non datati",
        "profile.targetCalories/proteinTarget senza data \u2192 non storici",
        "assenza storia datata \u2192 missing"
      ],
      weight: [
        "body_metrics date \u2264 analysisDate",
        "attribution: recorded_on_analysis_date | last_available_on_or_before",
        "profile.weight non attribuito al giorno",
        "mai zero silenzioso"
      ]
    });
  }
});

// src/features/mealEngine/resolveDayTargetKcal.js
function roundKcal2(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
function inferKcalSource(workout) {
  const raw = String(workout?.kcalSource || workout?.kcal_source || "").trim().toLowerCase();
  if (raw === KCAL_SOURCE.DEVICE || raw === "health_connect" || raw === "healthconnect") {
    return KCAL_SOURCE.DEVICE;
  }
  if (raw === KCAL_SOURCE.USER || raw === "manual" || raw === "entered") {
    return KCAL_SOURCE.USER;
  }
  if (raw === KCAL_SOURCE.ESTIMATED || raw === "estimate" || raw === "ai" || raw === "default") {
    return KCAL_SOURCE.ESTIMATED;
  }
  return KCAL_SOURCE.ESTIMATED;
}
function kcalSourceFactor(source) {
  const key = String(source || "").trim().toLowerCase();
  if (key === KCAL_SOURCE.DEVICE) return KCAL_SOURCE_FACTOR[KCAL_SOURCE.DEVICE];
  if (key === KCAL_SOURCE.USER) return KCAL_SOURCE_FACTOR[KCAL_SOURCE.USER];
  return KCAL_SOURCE_FACTOR[KCAL_SOURCE.ESTIMATED];
}
function countWorkoutBurnKcal(workout) {
  const raw = Math.max(0, roundKcal2(workout?.kcal ?? workout?.cal ?? workout?.estimatedKcal));
  const source = inferKcalSource(workout);
  const factor = kcalSourceFactor(source);
  return {
    raw,
    counted: Math.max(0, Math.round(raw * factor)),
    source,
    factor
  };
}
function sumWorkoutBurnFromLog(log) {
  const sessions = [];
  let burnRaw = 0;
  let burnCounted = 0;
  const list = Array.isArray(log) ? log : [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const type = String(entry.type || "").trim().toLowerCase();
    if (type && !WORKOUTISH.has(type)) continue;
    const hasKcal = entry.kcal != null || entry.cal != null || entry.estimatedKcal != null;
    if (type !== "workout" && !hasKcal) continue;
    if (type !== "workout" && type !== "cognitive") continue;
    const counted = countWorkoutBurnKcal(entry);
    if (counted.raw <= 0 && type !== "workout") continue;
    burnRaw += counted.raw;
    burnCounted += counted.counted;
    sessions.push({
      id: String(entry.id || ""),
      raw: counted.raw,
      counted: counted.counted,
      source: counted.source
    });
  }
  let dominantSource = KCAL_SOURCE.ESTIMATED;
  if (sessions.some((s) => s.source === KCAL_SOURCE.DEVICE)) dominantSource = KCAL_SOURCE.DEVICE;
  else if (sessions.some((s) => s.source === KCAL_SOURCE.USER)) dominantSource = KCAL_SOURCE.USER;
  return { burnRaw, burnCounted, sessions, dominantSource };
}
function dayNode2(fullHistory, date) {
  if (!fullHistory || typeof fullHistory !== "object" || !date) return null;
  return fullHistory[`trackerStorico_${date}`] || null;
}
function dayLog(fullHistory, date) {
  const node = dayNode2(fullHistory, date);
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node.log)) return node.log;
  if (node.dati && typeof node.dati === "object" && Array.isArray(node.dati.log)) return node.dati.log;
  return [];
}
function readSnapshot(fullHistory, date) {
  const node = dayNode2(fullHistory, date);
  const snap = node?.dayTargetSnapshot;
  if (!snap || typeof snap !== "object") return null;
  if (!Number.isFinite(Number(snap.total))) return null;
  return snap;
}
function resolveSettingsBaseKcalForDate(input = {}) {
  const explicit = roundKcal2(input.settingsBaseKcal);
  if (explicit > 0) {
    return { base: explicit, source: "settingsBaseKcal" };
  }
  const date = String(input.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { base: null, source: null };
  }
  const targetsNode = input.targets || input.profile_targets?.targets || (input.userTargets?.targetHistory ? input.userTargets : null) || null;
  const { resolved, timelineApplied, lastEffectiveDate } = resolveTargetsForAnalysisDate(
    targetsNode,
    date
  );
  if (timelineApplied > 0) {
    const fromHistory = roundKcal2(resolved.kcal ?? resolved.targetKcal);
    if (fromHistory > 0) {
      return {
        base: fromHistory,
        source: `targetHistory.kcal@${lastEffectiveDate || date}`
      };
    }
  }
  return { base: null, source: null };
}
function resolveDayTargetKcal(input = {}) {
  const date = String(input.date || "").slice(0, 10);
  const preferSnapshot = input.preferSnapshot !== false;
  if (preferSnapshot && date) {
    const snap = readSnapshot(input.fullHistory, date);
    if (snap) {
      return {
        ...normalizeSnapshot(snap),
        fromSnapshot: true,
        frozen: true,
        baseMissing: false,
        baseSource: "dayTargetSnapshot"
      };
    }
  }
  const resolvedBase = resolveSettingsBaseKcalForDate(input);
  const settingsBaseKcal = resolvedBase.base;
  const log = Array.isArray(input.liveLog) && input.liveLog.length > 0 ? input.liveLog : dayLog(input.fullHistory, date);
  const burn = sumWorkoutBurnFromLog(log);
  const strategyDeltaKcal = roundKcal2(input.strategyDeltaKcal);
  const includeCompensation = input.includeCompensation !== false;
  const includeAutopilot = input.includeAutopilot !== false;
  const compensationKcal = includeCompensation ? roundKcal2(input.compensationKcal) : 0;
  let autopilotKcal = includeAutopilot ? roundKcal2(input.autopilotKcal) : 0;
  if (includeAutopilot && input.autopilotKcal == null && date) {
    const node = dayNode2(input.fullHistory, date);
    if (node && node.autopilotCorrection != null) {
      autopilotKcal = roundKcal2(node.autopilotCorrection);
    }
  }
  if (!(settingsBaseKcal > 0)) {
    return {
      base: null,
      burnRaw: burn.burnRaw,
      burnCounted: burn.burnCounted,
      kcalSource: burn.dominantSource,
      sessions: burn.sessions,
      strategy: strategyDeltaKcal,
      compensation: compensationKcal,
      autopilot: autopilotKcal,
      total: null,
      rulesVersion: DAY_TARGET_RULES_VERSION,
      fromSnapshot: false,
      frozen: false,
      baseMissing: true,
      baseSource: null
    };
  }
  const total = computeEffectiveDailyTargetKcal({
    settingsBaseKcal,
    burnKcal: burn.burnCounted,
    strategyDeltaKcal,
    compensationKcal,
    autopilotKcal
  });
  return {
    base: settingsBaseKcal,
    burnRaw: burn.burnRaw,
    burnCounted: burn.burnCounted,
    kcalSource: burn.dominantSource,
    sessions: burn.sessions,
    strategy: strategyDeltaKcal,
    compensation: compensationKcal,
    autopilot: autopilotKcal,
    total,
    rulesVersion: DAY_TARGET_RULES_VERSION,
    fromSnapshot: false,
    frozen: false,
    baseMissing: false,
    baseSource: resolvedBase.source
  };
}
function normalizeSnapshot(snap) {
  return {
    base: roundKcal2(snap.base),
    burnRaw: roundKcal2(snap.burnRaw),
    burnCounted: roundKcal2(snap.burnCounted),
    kcalSource: inferKcalSource({ kcalSource: snap.kcalSource }),
    sessions: Array.isArray(snap.sessions) ? snap.sessions : [],
    strategy: roundKcal2(snap.strategy),
    compensation: roundKcal2(snap.compensation),
    autopilot: roundKcal2(snap.autopilot),
    total: roundKcal2(snap.total),
    rulesVersion: String(snap.rulesVersion || DAY_TARGET_RULES_VERSION)
  };
}
var DAY_TARGET_RULES_VERSION, KCAL_SOURCE, KCAL_SOURCE_FACTOR, WORKOUTISH;
var init_resolveDayTargetKcal = __esm({
  "src/features/mealEngine/resolveDayTargetKcal.js"() {
    init_computeEffectiveDailyTargetKcal();
    init_resolveFocusProfileData();
    DAY_TARGET_RULES_VERSION = "dtr-1";
    KCAL_SOURCE = Object.freeze({
      DEVICE: "device",
      USER: "user",
      ESTIMATED: "estimated"
    });
    KCAL_SOURCE_FACTOR = Object.freeze({
      [KCAL_SOURCE.DEVICE]: 1,
      [KCAL_SOURCE.USER]: 0.75,
      [KCAL_SOURCE.ESTIMATED]: 0.5
    });
    WORKOUTISH = /* @__PURE__ */ new Set(["workout", "cognitive", "work"]);
  }
});

// src/features/kentuFocus/score/computeDayScore.js
var computeDayScore_exports = {};
__export(computeDayScore_exports, {
  computeDayScore: () => computeDayScore
});
function computeDayScore(date, context = {}) {
  const version = context.scoreVersion === SCORE_VERSION ? SCORE_VERSION : context.scoreVersion === SCORE_VERSION2 ? SCORE_VERSION2 : context.scoreVersion === SCORE_VERSION3 ? SCORE_VERSION3 : context.scoreVersion === SCORE_VERSION4 ? SCORE_VERSION4 : context.scoreVersion === SCORE_VERSION5 ? SCORE_VERSION5 : SCORE_VERSION5;
  const isK3Plus = version === SCORE_VERSION3 || version === SCORE_VERSION4 || version === SCORE_VERSION5;
  const isK4Plus = version === SCORE_VERSION4 || version === SCORE_VERSION5;
  const weights = version === SCORE_VERSION ? CYLINDER_WEIGHTS : version === SCORE_VERSION2 ? CYLINDER_WEIGHTS2 : CYLINDER_WEIGHTS3;
  const minCylinders = version === SCORE_VERSION ? MIN_CYLINDERS_WITH_DATA : version === SCORE_VERSION2 ? MIN_CYLINDERS_WITH_DATA2 : MIN_CYLINDERS_WITH_DATA3;
  const nullStatuses = version === SCORE_VERSION ? NULL_SCORE_STATUSES : version === SCORE_VERSION2 ? NULL_SCORE_STATUSES2 : NULL_SCORE_STATUSES3;
  const lowStatuses = version === SCORE_VERSION ? LOW_RELIABILITY_STATUSES : version === SCORE_VERSION2 ? LOW_RELIABILITY_STATUSES2 : LOW_RELIABILITY_STATUSES3;
  const cylinderKeys = isK3Plus ? ["alimentazione", "sonno", "movimento"] : CYLINDER_KEYS;
  const dayTarget = isK4Plus ? resolveDayTargetForScore(date, context) : null;
  const targetKcal = dayTarget?.baseMissing ? null : dayTarget?.total > 0 ? dayTarget.total : resolveTargetKcal2(context);
  const dayStatus = getDayStatus(date, {
    today: context.today,
    fullHistory: context.fullHistory,
    records: context.records,
    record: context.record,
    targetKcal
  });
  const gaps = detectDayGaps(date, {
    fullHistory: context.fullHistory,
    targetKcal
  });
  const facts = readDayFacts(date, context.fullHistory, targetKcal);
  const curveVersion = version === SCORE_VERSION ? SCORE_VERSION : SCORE_VERSION2;
  const cylinders = isK3Plus ? {
    alimentazione: scoreAlimentazione(
      curveVersion,
      date,
      context,
      facts,
      targetKcal,
      version,
      dayTarget
    ),
    sonno: scoreSonno(curveVersion, facts),
    movimento: version === SCORE_VERSION5 ? scoreMovimentoBattery(date, context.fullHistory, context) : scoreMovimento(date, context.fullHistory, context),
    forza: forzaEnabled(context) ? scoreForza(curveVersion, date, context.fullHistory, context) : cylinder2("inactive", "Forza \xB7 non attiva", [], null)
  } : {
    alimentazione: scoreAlimentazione(version, date, context, facts, targetKcal),
    sonno: scoreSonno(version, facts),
    forza: scoreForza(version, date, context.fullHistory, context),
    cardio: scoreCardio(version, date, context.fullHistory)
  };
  const safety = isK3Plus ? computeSafety(date, { ...context, targetKcal }) : null;
  const withData = cylinderKeys.filter((key) => cylinders[key].status !== "no_data" && cylinders[key].status !== "inactive");
  let score = null;
  if (withData.length >= minCylinders) {
    const weightSum = withData.reduce((sum, key) => sum + weights[key], 0);
    const weighted = withData.reduce((sum, key) => {
      const points = version === SCORE_VERSION ? CYLINDER_POINTS[cylinders[key].status] : cylinders[key].value;
      return sum + points * weights[key];
    }, 0);
    score = round33(weighted / weightSum);
  }
  if (nullStatuses.includes(dayStatus)) score = null;
  const reliability = reliabilityOf(version, dayStatus, gaps, lowStatuses);
  const result = {
    version,
    score,
    reliability,
    cylinders,
    dayStatus,
    dataVersion: hashDayFacts({
      targetKcal,
      dayStatus,
      gaps: gaps.reasons,
      facts,
      movementCheckin: context.movementCheckins?.[date] ?? null,
      forzaEnabled: forzaEnabled(context),
      safety: safety ? safety.signals.map((item) => `${item.id}:${item.level}`) : null,
      movementBattery: version === SCORE_VERSION5 ? cylinders.movimento?.battery?.level ?? null : null
    })
  };
  if (safety?.signals.some((item) => item.area === "Energia" && item.level === "act") && score != null) {
    score = Math.min(score, ENERGY_ACT_SCORE_CAP);
    result.score = score;
  }
  if (safety?.suppressNumbers) result.suppressNumbers = true;
  if (isK3Plus) {
    const load = forzaEnabled(context) ? forceLoad(date, context.fullHistory, context) : 0;
    result.forceIntensity = score != null && score >= ON_TRACK_SCORE ? load : 0;
  }
  if (isK4Plus) {
    for (const key of Object.keys(cylinders)) {
      const cylinder3 = cylinders[key];
      if (!cylinder3 || typeof cylinder3 !== "object") continue;
      if (cylinder3.status === "no_data" || cylinder3.status === "inactive") continue;
      if (cylinder3.value == null || !Number.isFinite(Number(cylinder3.value))) continue;
      if (version === SCORE_VERSION5 && key === "movimento") continue;
      cylinders[key] = {
        ...cylinder3,
        status: pillarStatusFromValue(cylinder3.value)
      };
    }
    result.cylinders = cylinders;
    result.scoreStatus = score == null ? null : pillarStatusFromValue(score);
  }
  if (dayTarget) result.dayTarget = dayTarget;
  return result;
}
function scoreAlimentazione(version, date, context, facts, targetKcal, scoreVersion = version, dayTarget = null) {
  const kcal = facts.kcal;
  if (!(kcal > 0) || !(targetKcal > 0)) {
    return cylinder2("no_data", `${Math.round(kcal || 0)} kcal`, [], null);
  }
  const deviation = Math.abs(kcal - targetKcal) / targetKcal;
  const signals = [];
  const energy = assessEnergyLowDay(kcal, targetKcal, {
    firstMealHour: facts.firstSubstantialHour
  });
  if (energy.active) signals.push("energy_low_day");
  const k3PlusNutrition = scoreVersion === SCORE_VERSION3 || scoreVersion === SCORE_VERSION4 || scoreVersion === SCORE_VERSION5;
  if (k3PlusNutrition && facts.firstSubstantialHour != null && facts.firstSubstantialHour >= LATE_FIRST_MEAL_HOUR) {
    signals.push("late_first_meal");
  }
  const heavy = assessHeavyLateMeal(facts.dinnerKcal, kcal, targetKcal);
  if (heavy.active) signals.push("heavy_late_meal");
  const critique = countAdverseUltraProcessed(date, context);
  if (version === SCORE_VERSION) {
    let status2 = "off_track";
    if (deviation <= ENERGY_BANDS.onTrackMaxDeviation) status2 = "on_track";
    else if (deviation <= ENERGY_BANDS.halfwayMaxDeviation) status2 = "halfway";
    if (critique > 0) {
      status2 = downgrade(status2);
      signals.push(NOVA4_CRITIQUE_SIGNAL_ID);
    }
    return cylinder2(status2, energyKeyFact(kcal, targetKcal), signals, CYLINDER_POINTS[status2]);
  }
  let status = "off_track";
  if (deviation <= ENERGY_CURVE.fullCreditDeviation) status = "on_track";
  else if (deviation < ENERGY_CURVE.floorDeviation) status = "halfway";
  let value = energyCurveValue(deviation);
  if (critique > 0) {
    value *= ENERGY_CURVE.ultraProcessedFactor;
    signals.push(NOVA4_CRITIQUE_SIGNAL_ID2);
  }
  let fact = scoreVersion === SCORE_VERSION4 || scoreVersion === SCORE_VERSION5 ? energyKeyFactDayTarget(kcal, dayTarget || { total: targetKcal }) : energyKeyFact(kcal, targetKcal);
  const bedtimeUsable = ENERGY_CURVE.usableBedtimeProvenance.includes(facts.bedtimeProvenance);
  const buffer = facts.sleepBufferH;
  let penalty = 0;
  if (k3PlusNutrition && heavy.active) penalty += ENERGY_CURVE.lateMealPenalty;
  if (bedtimeUsable && buffer != null && buffer < ENERGY_CURVE.lateMealHours) {
    penalty += ENERGY_CURVE.lateMealPenalty;
    signals.push("late_meal_before_sleep");
    fact = `${fact} \xB7 ultimo pasto a ${formatDuration(buffer)}`;
  }
  if (k3PlusNutrition) penalty = Math.min(penalty, MEAL_PENALTY_CAP);
  value -= penalty;
  return {
    ...cylinder2(status, fact, signals, clamp01(value)),
    intakeKcal: Math.round(kcal)
  };
}
function scoreSonno(version, facts) {
  const hours = facts.sleepHours;
  if (!(hours > 0)) return cylinder2("no_data", "non registrato", [], null);
  if (version === SCORE_VERSION) {
    let status2 = "off_track";
    if (hours >= SLEEP_BANDS.onTrackMinHours) status2 = "on_track";
    else if (hours >= SLEEP_BANDS.halfwayMinHours) status2 = "halfway";
    const signals2 = [];
    if (hours < SLEEP_BANDS.onTrackMinHours) signals2.push("sleep_under_7h");
    const buffer = facts.sleepBufferH;
    const bedtimeUsable = SLEEP_BANDS.usableBedtimeProvenance.includes(facts.bedtimeProvenance);
    if (bedtimeUsable && buffer != null && buffer < SLEEP_BANDS.existingMealSignalHours) {
      signals2.push("meal_within_3h_of_bedtime");
    }
    let fact = formatDuration(hours);
    if (bedtimeUsable && buffer != null && buffer < SLEEP_BANDS.mealBufferPenaltyHours) {
      status2 = downgrade(status2);
      fact = `${fact} \xB7 ultimo pasto a ${formatDuration(buffer)}`;
    }
    return cylinder2(status2, fact, signals2, CYLINDER_POINTS[status2]);
  }
  let status = "off_track";
  if (hours >= SLEEP_CURVE.fullMinHours && hours <= SLEEP_CURVE.fullMaxHours) status = "on_track";
  else if (hours > SLEEP_CURVE.shortFloorHours && hours < SLEEP_CURVE.longFloorHours) status = "halfway";
  const signals = [];
  if (hours < SLEEP_CURVE.fullMinHours) signals.push("sleep_under_7h");
  if (hours > SLEEP_CURVE.fullMaxHours) signals.push("sleep_over_9h");
  let value = sleepCurveValue(hours);
  const stars = facts.sleepQualityStars;
  if (stars != null && SLEEP_CURVE.qualityFactor[stars] != null) {
    value *= SLEEP_CURVE.qualityFactor[stars];
    signals.push("sleep_quality");
  }
  return {
    ...cylinder2(status, formatDuration(hours), signals, clamp01(value)),
    sleepHours: hours
  };
}
function scoreForza(version, date, fullHistory, context = {}) {
  const cfg = version === SCORE_VERSION ? STRENGTH_WINDOW : STRENGTH_CURVE;
  if (!fullHistory || typeof fullHistory !== "object") {
    return cylinder2("no_data", "0 sessioni in 30 giorni", [], null);
  }
  const todayIso = String(context?.today || "").slice(0, 10);
  const reportIso = String(date || "").slice(0, 10);
  const relativeToReportDay = Boolean(todayIso) && reportIso !== todayIso;
  const trainedOn = /* @__PURE__ */ new Map();
  let sessions = 0;
  for (const day of datesEnding2(date, cfg.windowDays)) {
    for (const workout of strengthWorkouts(dayNode3(fullHistory, day))) {
      sessions += 1;
      for (const macroId of obligationMacrosOf(workout, cfg)) {
        const dates = trainedOn.get(macroId) || [];
        dates.push(day);
        trainedOn.set(macroId, dates);
      }
    }
  }
  if (sessions === 0) return cylinder2("no_data", "0 sessioni in 30 giorni", [], null);
  if (trainedOn.size === 0) {
    const value2 = version === SCORE_VERSION ? CYLINDER_POINTS.on_track : 1;
    return cylinder2("on_track", `${sessions} sessioni \xB7 nessuna parte alta o bassa`, [], value2);
  }
  let status = "on_track";
  const lastSince = /* @__PURE__ */ new Map();
  let worst = 0;
  for (const [macroId, dates] of trainedOn) {
    const unique = [...new Set(dates)].sort();
    const since = calendarDaysBetween(unique[unique.length - 1], date);
    lastSince.set(macroId, since);
    if (since > worst) worst = since;
    const band = version === SCORE_VERSION ? strengthBand(since) : strengthBandK2(since);
    if (bandRank(band) > bandRank(status)) status = band;
  }
  const fact = cfg.obligationMacros.filter((macroId) => lastSince.has(macroId)).map((macroId) => `${cfg.macroLabels[macroId]} ${agoPhrase(lastSince.get(macroId), { relativeToReportDay })}`).join(" \xB7 ");
  const value = version === SCORE_VERSION ? CYLINDER_POINTS[status] : strengthCurveValue(worst);
  return cylinder2(status, fact, [], value);
}
function scoreCardio(version, date, fullHistory) {
  const windowDays = version === SCORE_VERSION ? CARDIO_WINDOW.windowDays : CARDIO_CURVE.windowDays;
  if (!fullHistory || typeof fullHistory !== "object") {
    return cylinder2("no_data", "0 min / 7 giorni", [], null);
  }
  let minutes = 0;
  for (const day of datesEnding2(date, windowDays)) {
    minutes += cardioMinutesOf(dayNode3(fullHistory, day));
  }
  minutes = Math.round(minutes * 10) / 10;
  let status = "off_track";
  if (version === SCORE_VERSION) {
    if (minutes >= CARDIO_WINDOW.onTrackMinMinutes) status = "on_track";
    else if (minutes >= CARDIO_WINDOW.halfwayMinMinutes) status = "halfway";
    return cylinder2(status, `${formatMinutes2(minutes)} min / 7 giorni`, [], CYLINDER_POINTS[status]);
  }
  if (minutes >= CARDIO_CURVE.fullMinutes) status = "on_track";
  else if (minutes >= CARDIO_CURVE.halfwayMinMinutes) status = "halfway";
  const value = Math.min(1, minutes / CARDIO_CURVE.fullMinutes);
  return cylinder2(status, `${formatMinutes2(minutes)} min / 7 giorni`, [], round33(value));
}
function countAdverseUltraProcessed(date, context) {
  if (!context.fullHistory || !isIsoDateString(date)) return 0;
  const block = buildFocusFoodQualityBlock({
    fullHistory: context.fullHistory,
    analysisDate: date,
    catalogs: context.catalogs || null,
    recentDays: 1
  });
  const items = block?.day?.nova4Items;
  if (!Array.isArray(items)) return 0;
  return items.filter((item) => item?.critiqueWorthy === true).length;
}
function readDayFacts(date, fullHistory, targetKcal) {
  const node = dayNode3(fullHistory, date);
  const foods = foodEntries2(node);
  const kcal = Math.round(Number(computeTotali(foods).kcal) || 0);
  const hours = foods.map((item) => resolveFoodClockHourDetailed(item, node?.mealTimes).hour).filter((hour) => hour != null && Number.isFinite(hour));
  const lastMealHour2 = hours.length ? Math.max(...hours) : null;
  const substantial = foods.filter((item) => Number(item.kcal ?? item.cal) >= SUBSTANTIAL_MEAL_MIN_KCAL).map((item) => resolveFoodClockHourDetailed(item, node?.mealTimes).hour).filter((hour) => hour != null && Number.isFinite(hour));
  const dinnerKcal = Math.round(foods.reduce((sum, item) => {
    const meal = resolveFocusMealIdentity(item).canonicalMealType;
    if (meal !== "cena") return sum;
    return sum + (Number(item.kcal ?? item.cal) || 0);
  }, 0));
  const night = readNight(fullHistory, date, lastMealHour2);
  const sleepHours = night?.sleepAvailable ? Number(night.sleep?.hours?.value) : null;
  const bedtimeProvenance = night?.sleep?.bedtime?.provenance ?? null;
  const bedtime = Number(night?.sleep?.bedtime?.value);
  const sleepBufferH = Number.isFinite(bedtime) ? computeDinnerSleepBufferH(bedtime, lastMealHour2) : null;
  return {
    kcal,
    targetKcal: targetKcal ?? null,
    lastMealHour: lastMealHour2,
    firstSubstantialHour: substantial.length ? Math.min(...substantial) : null,
    dinnerKcal,
    foodIds: foods.map((item) => String(item.id || item.name || "")).sort(),
    sleepHours: sleepHours > 0 ? sleepHours : null,
    sleepStorageDate: night?.sleep?.storageDate ?? null,
    sleepQualityStars: night?.sleep?.qualityStars?.provenance === "recorded" ? night.sleep.qualityStars.value : null,
    bedtimeProvenance,
    sleepBufferH
  };
}
function readNight(fullHistory, date, lastMealHour2) {
  if (!isIsoDateString(date)) return null;
  const publicationDate = addCalendarDays(date, 1);
  return normalizeSleepNight(dayNode3(fullHistory, publicationDate), {
    publicationDate,
    lastMealHour: lastMealHour2
  });
}
function strengthWorkouts(node) {
  const pack = normalizeWorkoutEvents(node);
  return (pack?.activity?.workouts || []).filter(
    (workout) => workout?.activityKind?.value === "strength"
  );
}
function obligationMacrosOf(workout, cfg) {
  const recorded = Array.isArray(workout?.muscleGroups?.value) ? workout.muscleGroups.value : [];
  const macros = /* @__PURE__ */ new Set();
  if (recorded.includes(cfg.totalBodyGroup)) {
    for (const macroId of cfg.obligationMacros) macros.add(macroId);
  }
  for (const macroId of cfg.obligationMacros) {
    const groups = cfg.macros[macroId] || [];
    if (recorded.some((group) => groups.includes(group))) macros.add(macroId);
  }
  return [...macros];
}
function agoPhrase(days, opts = {}) {
  const relative = opts.relativeToReportDay === true;
  if (days === 0) return relative ? "quel giorno" : "oggi";
  if (days === 1) return relative ? "il giorno prima" : "1 giorno fa";
  return relative ? `${days} giorni prima` : `${days} giorni fa`;
}
function strengthBand(daysSince) {
  if (daysSince <= STRENGTH_WINDOW.onTrackMaxDaysSince) return "on_track";
  if (daysSince >= STRENGTH_WINDOW.halfwayMinDaysSince && daysSince <= STRENGTH_WINDOW.halfwayMaxDaysSince) {
    return "halfway";
  }
  if (daysSince > STRENGTH_WINDOW.halfwayMaxDaysSince) return "off_track";
  return "halfway";
}
function cardioMinutesOf(node) {
  const pack = normalizeWorkoutEvents(node);
  const metric = pack?.activity?.cardioMinutes;
  const value = Number(metric?.value);
  return Number.isFinite(value) && value > 0 ? value : 0;
}
function energyKeyFact(kcal, targetKcal) {
  const rounded = Math.round(kcal);
  const delta = Math.round(rounded - targetKcal);
  if (delta < 0) return `${rounded} kcal \xB7 ${Math.abs(delta)} sotto`;
  if (delta > 0) return `${rounded} kcal \xB7 ${delta} sopra`;
  return `${rounded} kcal \xB7 0 di scarto`;
}
function downgrade(status) {
  if (status === "on_track") return "halfway";
  if (status === "halfway") return "off_track";
  return status;
}
function bandRank(status) {
  if (status === "off_track") return 2;
  if (status === "halfway") return 1;
  return 0;
}
function cylinder2(status, keyFact, signals, value) {
  return { status, keyFact, signals, value: value == null ? null : round33(value) };
}
function energyCurveValue(deviation) {
  const { fullCreditDeviation, floorDeviation, floorValue } = ENERGY_CURVE;
  if (deviation <= fullCreditDeviation) return 1;
  if (deviation >= floorDeviation) return floorValue;
  const span = floorDeviation - fullCreditDeviation;
  const t = (deviation - fullCreditDeviation) / span;
  return 1 - t * (1 - floorValue);
}
function sleepCurveValue(hours) {
  const { fullMinHours, fullMaxHours, shortFloorHours, longFloorHours, floorValue } = SLEEP_CURVE;
  if (hours >= fullMinHours && hours <= fullMaxHours) return 1;
  if (hours <= shortFloorHours || hours >= longFloorHours) return floorValue;
  if (hours < fullMinHours) {
    const t2 = (fullMinHours - hours) / (fullMinHours - shortFloorHours);
    return 1 - t2 * (1 - floorValue);
  }
  const t = (hours - fullMaxHours) / (longFloorHours - fullMaxHours);
  return 1 - t * (1 - floorValue);
}
function strengthCurveValue(daysSince) {
  const { fullMaxDaysSince, floorDaysSince, floorValue } = STRENGTH_CURVE;
  if (daysSince <= fullMaxDaysSince) return 1;
  if (daysSince >= floorDaysSince) return floorValue;
  const t = (daysSince - fullMaxDaysSince) / (floorDaysSince - fullMaxDaysSince);
  return 1 - t * (1 - floorValue);
}
function strengthBandK2(daysSince) {
  if (daysSince <= STRENGTH_CURVE.fullMaxDaysSince) return "on_track";
  if (daysSince >= STRENGTH_CURVE.floorDaysSince) return "off_track";
  return "halfway";
}
function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}
function reliabilityOf(version, dayStatus, gaps, lowStatuses) {
  if (version === SCORE_VERSION3) {
    if (dayStatus === "approximate" || gaps.hasGaps) return "low";
    if (dayStatus === "unconfirmed") return "medium";
    return "high";
  }
  return lowStatuses.includes(dayStatus) || gaps.hasGaps ? "low" : "high";
}
function formatDuration(hours) {
  return formatFocusHoursIt(hours) || "non registrato";
}
function formatMinutes2(minutes) {
  const rounded = Math.round(Number(minutes) * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return text.replace(".", ",");
}
function foodEntries2(node) {
  return collectDayLogForNutrition(node).filter((item) => {
    const type = String(item?.type || "food").toLowerCase();
    return FOOD_TYPES2.has(type);
  });
}
function dayNode3(fullHistory, date) {
  return getTrackerDayNode(fullHistory, date);
}
function datesEnding2(date, count) {
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(addCalendarDays(date, -i));
  return out;
}
function calendarDaysBetween(from, to) {
  const start = (/* @__PURE__ */ new Date(`${from}T12:00:00`)).getTime();
  const end = (/* @__PURE__ */ new Date(`${to}T12:00:00`)).getTime();
  return Math.round((end - start) / 864e5);
}
function resolveTargetKcal2(context) {
  const candidates = [
    context.targetKcal,
    context.userTargets?.kcal,
    context.profile_targets?.targetCalories,
    context.profile_targets?.targets?.kcal
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}
function resolveDayTargetForScore(date, context) {
  const liveLog = context.todayLiveLog && String(context.today || "").slice(0, 10) === String(date).slice(0, 10) ? context.todayLiveLog : null;
  const node = context.fullHistory?.[`trackerStorico_${date}`];
  const autopilot = node?.autopilotCorrection != null ? Number(node.autopilotCorrection) : context.autopilotKcal ?? null;
  const explicitBase = Number(context.settingsBaseKcal);
  return resolveDayTargetKcal({
    date,
    fullHistory: context.fullHistory,
    settingsBaseKcal: Number.isFinite(explicitBase) && explicitBase > 0 ? explicitBase : null,
    userTargets: context.userTargets,
    profile_targets: context.profile_targets,
    targets: context.targets || context.profile_targets?.targets || null,
    strategyDeltaKcal: context.strategyDeltaKcal ?? 0,
    compensationKcal: context.compensationKcal ?? 0,
    autopilotKcal: autopilot,
    liveLog,
    preferSnapshot: true
  });
}
function energyKeyFactDayTarget(kcal, dayTarget) {
  const intake = Math.round(Number(kcal) || 0);
  const total = Math.round(Number(dayTarget?.total) || 0);
  const base = Math.round(Number(dayTarget?.base) || 0);
  const burnRaw = Math.round(Number(dayTarget?.burnRaw) || 0);
  const burnCounted = Math.round(Number(dayTarget?.burnCounted) || 0);
  const autopilot = Math.round(Number(dayTarget?.autopilot) || 0);
  const strategy = Math.round(Number(dayTarget?.strategy) || 0);
  const parts = [`base ${base}`];
  if (burnRaw > 0) {
    void burnCounted;
    parts.push(`allenamento ${burnRaw}`);
  }
  if (strategy !== 0) parts.push(`strategia ${strategy > 0 ? "+" : ""}${strategy}`);
  if (autopilot !== 0) parts.push(`autopilota ${autopilot > 0 ? "+" : ""}${autopilot}`);
  return `${intake} su ${total} (${parts.join(" + ")})`;
}
function round33(value) {
  return Math.round(value * 1e3) / 1e3;
}
var CYLINDER_KEYS, FOOD_TYPES2;
var init_computeDayScore = __esm({
  "src/features/kentuFocus/score/computeDayScore.js"() {
    init_dayStatus();
    init_getTrackerDayNode();
    init_focusDateUtils();
    init_focusMealSlots();
    init_normalizeFoodEvents();
    init_normalizeSleepNight();
    init_normalizeWorkoutEvents();
    init_buildFocusFoodQualityBlock();
    init_focusMealEnergySignals();
    init_focusDateUtils();
    init_computeTotaliCore();
    init_dayScoreRecord();
    init_scoreConfig_kds_1();
    init_scoreConfig_kds_2();
    init_scoreConfig_kds_3();
    init_scoreConfig_kds_4();
    init_scoreConfig_kds_5();
    init_scoreMovement();
    init_movementBattery();
    init_computeSafety();
    init_safetyConfig_sfv_1();
    init_resolveDayTargetKcal();
    CYLINDER_KEYS = ["alimentazione", "sonno", "forza", "cardio"];
    FOOD_TYPES2 = /* @__PURE__ */ new Set(["food", "recipe"]);
  }
});

// src/features/kentuFocus/score/computePeriodScore.js
var computePeriodScore_exports = {};
__export(computePeriodScore_exports, {
  computePeriodScore: () => computePeriodScore
});
function computePeriodScore(from, to, context = {}) {
  const days = [];
  const precomputed = context.precomputedDays && typeof context.precomputedDays === "object" ? context.precomputedDays : null;
  const allowFallback = context.allowComputeFallback !== false;
  if (isIsoDateString(from) && isIsoDateString(to) && from <= to) {
    let cursor = from;
    while (cursor <= to && days.length < 400) {
      let scored = precomputed?.[cursor] || null;
      if (!scored && allowFallback) scored = computeDayScore(cursor, context);
      if (!scored) {
        scored = { score: null, dayStatus: cursor >= context.today ? "future" : "hole" };
      }
      const past = isPastDay(cursor, context.today, scored.dayStatus);
      days.push({
        date: cursor,
        score: scored.score,
        dayStatus: scored.dayStatus,
        past
      });
      cursor = addCalendarDays(cursor, 1);
    }
  }
  const pastDays = days.filter((day) => day.past);
  const eligible = pastDays.filter(
    (day) => day.score != null && isPeriodDataStatus(day.dayStatus)
  );
  const coverage = pastDays.length === 0 ? 0 : round34(eligible.length / pastDays.length);
  const weight = eligible.reduce((sum, day) => sum + periodDayWeight(day.dayStatus), 0);
  const score = coverage < PERIOD_COVERAGE_MIN || eligible.length === 0 || weight === 0 ? null : round34(eligible.reduce((sum, day) => sum + day.score * periodDayWeight(day.dayStatus), 0) / weight);
  const onTrackDays = pastDays.filter(
    (day) => day.score != null && day.score >= ON_TRACK_DAY_SCORE
  ).length;
  const streaks = collectStreaks(pastDays);
  return {
    version: SCORE_VERSION3,
    from,
    to,
    score,
    coverage,
    pastDays: pastDays.length,
    eligibleDays: eligible.length,
    onTrackDays,
    longestStreak: streaks.reduce((max, streak) => Math.max(max, streak.length), 0),
    streaks
  };
}
function collectStreaks(pastDays) {
  const streaks = [];
  let run = [];
  let pauses = 0;
  const close = () => {
    const onDays = run.filter((item) => item.kind === "on");
    if (onDays.length >= STREAK_MIN_DAYS) {
      streaks.push({
        from: onDays[0].date,
        to: onDays[onDays.length - 1].date,
        length: onDays.length
      });
    }
    run = [];
    pauses = 0;
  };
  for (const day of pastDays) {
    if (day.score != null && day.score >= ON_TRACK_DAY_SCORE) {
      run.push({ date: day.date, kind: "on" });
      continue;
    }
    const pausesStreak = day.score != null && day.score >= STREAK_PAUSE_SCORE_MIN && day.score < ON_TRACK_DAY_SCORE;
    if (pausesStreak && run.some((item) => item.kind === "on") && pauses < STREAK_MAX_PAUSE_DAYS) {
      pauses += 1;
      run.push({ date: day.date, kind: "pause" });
      continue;
    }
    close();
  }
  close();
  return streaks;
}
function isPastDay(date, today, dayStatus) {
  if (isIsoDateString(today)) return date < today;
  return dayStatus !== "future" && dayStatus !== "in_progress";
}
function round34(value) {
  return Math.round(value * 1e3) / 1e3;
}
var ON_TRACK_DAY_SCORE, PERIOD_COVERAGE_MIN, STREAK_MAX_PAUSE_DAYS, STREAK_MIN_DAYS, STREAK_PAUSE_SCORE_MIN;
var init_computePeriodScore = __esm({
  "src/features/kentuFocus/score/computePeriodScore.js"() {
    init_focusDateUtils();
    init_computeDayScore();
    init_scoreConfig_kds_3();
    ON_TRACK_DAY_SCORE = PERIOD_RULES2.onTrackMinScore;
    PERIOD_COVERAGE_MIN = PERIOD_RULES2.minCoverage;
    STREAK_MAX_PAUSE_DAYS = 1;
    STREAK_MIN_DAYS = PERIOD_RULES2.minPublishedStreak;
    STREAK_PAUSE_SCORE_MIN = PERIOD_RULES2.breakBelowScore;
  }
});

// src/foodSearch.js
var foodSearch_exports = {};
__export(foodSearch_exports, {
  MATCH_TIER_RANK: () => MATCH_TIER_RANK,
  SCORE_STEM_GUARANTEED: () => SCORE_STEM_GUARANTEED,
  bestFuzzyMatch: () => bestFuzzyMatch,
  compareFoodSearchHits: () => compareFoodSearchHits,
  countQueryTokenCoverage: () => countQueryTokenCoverage,
  default: () => foodSearch_default,
  foldItalianSttConfusables: () => foldItalianSttConfusables,
  foodNameCoversAllQueryTokens: () => foodNameCoversAllQueryTokens,
  foodNameMatchesQuery: () => foodNameMatchesQuery,
  getFoodUsageCount: () => getFoodUsageCount,
  isExactNormalizedFoodName: () => isExactNormalizedFoodName,
  italianSingularPluralForms: () => italianSingularPluralForms,
  levenshteinDistance: () => levenshteinDistance,
  maxFuzzyDistanceForQuery: () => maxFuzzyDistanceForQuery,
  normalizeSearchKeywords: () => normalizeSearchKeywords,
  normalizeSearchText: () => normalizeSearchText,
  searchFoods: () => searchFoods,
  searchFoodsDetailed: () => searchFoodsDetailed,
  searchFoodsWithKeywords: () => searchFoodsWithKeywords,
  shouldDiscloseSynonymMapping: () => shouldDiscloseSynonymMapping,
  textMatchesSearchQuery: () => textMatchesSearchQuery,
  tokenSharesStem: () => tokenSharesStem
});
function normalizeSearchText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
}
function isExactNormalizedFoodName(nameA, nameB) {
  const a = normalizeSearchText(nameA);
  const b = normalizeSearchText(nameB);
  return Boolean(a) && a === b;
}
function getFoodUsageCount(food) {
  if (!food || typeof food !== "object") return 0;
  const explicit = Number(food.usageCount ?? food.count);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  const stats = food.usageStats;
  if (stats && typeof stats === "object") {
    const sum = ["morning", "afternoon", "evening", "night"].reduce((acc, key) => acc + Math.max(0, Number(stats[key]) || 0), 0);
    if (sum > 0) return sum;
  }
  return 0;
}
function levenshteinDistance(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  if (Math.abs(s.length - t.length) > 2) return Math.abs(s.length - t.length);
  const prev = new Array(t.length + 1);
  const curr = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j += 1) prev[j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= t.length; j += 1) prev[j] = curr[j];
  }
  return prev[t.length];
}
function maxFuzzyDistanceForQuery(query) {
  const len = String(query || "").length;
  if (len <= 0) return 0;
  if (len <= 4) return 1;
  if (len <= 8) return 2;
  return 3;
}
function foldItalianSttConfusables(value) {
  return String(value || "").toLowerCase().replace(/ph/g, "f").replace(/v/g, "b").replace(/w/g, "b").replace(/y/g, "i").replace(/k/g, "c").replace(/j/g, "g");
}
function bestFuzzyMatch(normalizedQuery, normalizedName, itemWords = []) {
  const q = String(normalizedQuery || "");
  const name = String(normalizedName || "");
  if (!q || !name) return null;
  const maxDist = maxFuzzyDistanceForQuery(q);
  let best = levenshteinDistance(q, name);
  const qFold = foldItalianSttConfusables(q);
  const nameFold = foldItalianSttConfusables(name);
  if (qFold && nameFold) {
    best = Math.min(best, levenshteinDistance(qFold, nameFold));
  }
  const qWords = q.split(" ").filter(Boolean);
  const nWords = itemWords.length ? itemWords : name.split(" ").filter(Boolean);
  if (qWords.length === 1) {
    for (let i = 0; i < itemWords.length; i += 1) {
      const w = itemWords[i];
      if (!w) continue;
      if (Math.abs(w.length - q.length) > maxDist + 1) continue;
      best = Math.min(best, levenshteinDistance(q, w));
      const wFold = foldItalianSttConfusables(w);
      if (qFold && wFold) {
        best = Math.min(best, levenshteinDistance(qFold, wFold));
      }
    }
  }
  if (qWords.length > 1 && nWords.length > 0) {
    let tokenDistSum = 0;
    let tokensOk = true;
    const used = /* @__PURE__ */ new Set();
    for (let qi = 0; qi < qWords.length; qi += 1) {
      const qw = qWords[qi];
      const qwMax = maxFuzzyDistanceForQuery(qw);
      let localBest = Infinity;
      let localIdx = -1;
      for (let ni = 0; ni < nWords.length; ni += 1) {
        if (used.has(ni)) continue;
        const nw = nWords[ni];
        if (Math.abs(nw.length - qw.length) > qwMax + 1) continue;
        let d = levenshteinDistance(qw, nw);
        d = Math.min(
          d,
          levenshteinDistance(foldItalianSttConfusables(qw), foldItalianSttConfusables(nw))
        );
        if (d < localBest) {
          localBest = d;
          localIdx = ni;
        }
      }
      if (!(localBest <= qwMax)) {
        tokensOk = false;
        break;
      }
      if (localIdx >= 0) used.add(localIdx);
      tokenDistSum += localBest;
    }
    if (tokensOk) {
      best = Math.min(best, tokenDistSum);
    }
  }
  if (!Number.isFinite(best) || best < 0) return null;
  if (best === 0) {
    if (q === name) return null;
    return { distance: 1, score: SCORE_FUZZY_DIST_1 };
  }
  if (best > maxDist) return null;
  return {
    distance: best,
    score: best === 1 ? SCORE_FUZZY_DIST_1 : SCORE_FUZZY_DIST_2
  };
}
function loadRecentFoodEntries() {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_FOODS_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const name = String(entry.name || "").trim();
      const id = String(entry.id ?? name).trim();
      const lastUsed = Number(entry.lastUsedAt ?? entry.lastUsed ?? entry.timestamp);
      const count = Number(entry.usageCount ?? entry.count);
      if (!id || !name || !Number.isFinite(lastUsed)) return null;
      return {
        id,
        name,
        lastUsed,
        lastUsedAt: lastUsed,
        count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1,
        usageCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1
      };
    }).filter(Boolean);
  } catch (_) {
    return [];
  }
}
function getRecencyScore(lastUsed, now) {
  const ageMs = now - Number(lastUsed);
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0;
  if (ageMs <= RECENT_FOOD_HIGH_WINDOW_MS) return 1;
  if (ageMs <= 2 * RECENT_FOOD_HIGH_WINDOW_MS) return 0.8;
  if (ageMs <= 7 * RECENT_FOOD_HIGH_WINDOW_MS) return 0.6;
  return 0.3;
}
function getFrequencyScore(count, maxCount) {
  const normalizedCount = Math.max(1, Number(count) || 1);
  const normalizedMaxCount = Math.max(1, Number(maxCount) || 1);
  const rawScore = normalizedCount / normalizedMaxCount;
  return Math.max(0.2, Math.min(1, rawScore));
}
function buildRecentFoodScoreMap() {
  const now = Date.now();
  const recentEntries = loadRecentFoodEntries();
  const scores = /* @__PURE__ */ new Map();
  const maxCount = recentEntries.reduce(
    (max, entry) => Math.max(max, Math.max(1, Number(entry?.count) || 1)),
    1
  );
  for (let i = 0; i < recentEntries.length; i += 1) {
    const entry = recentEntries[i];
    const recencyScore = getRecencyScore(entry.lastUsed, now);
    const frequencyScore = getFrequencyScore(entry.count, maxCount);
    const scorePayload = { recencyScore, frequencyScore };
    const idKey = String(entry.id || "").trim();
    const nameKey = normalizeSearchText(entry.name);
    if (idKey) scores.set(idKey, scorePayload);
    if (nameKey) scores.set(nameKey, scorePayload);
  }
  return scores;
}
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function expandQueryWords(queryWord) {
  const base = String(queryWord || "");
  const out = /* @__PURE__ */ new Set([base, ...SEARCH_SYNONYMS[base] || []]);
  for (const stem of italianSingularPluralForms(base)) {
    out.add(stem);
    for (const syn of SEARCH_SYNONYMS[stem] || []) out.add(syn);
  }
  return [...out].filter(Boolean);
}
function italianSingularPluralForms(word) {
  const w = String(word || "").trim().toLowerCase();
  if (w.length < 3) return w ? [w] : [];
  const forms = /* @__PURE__ */ new Set([w]);
  if (w.endsWith("i") && w.length > 3) {
    forms.add(`${w.slice(0, -1)}o`);
    forms.add(`${w.slice(0, -1)}e`);
  }
  if (w.endsWith("o") && w.length > 3) forms.add(`${w.slice(0, -1)}i`);
  if (w.endsWith("a") && w.length > 3) forms.add(`${w.slice(0, -1)}e`);
  if (w.endsWith("e") && w.length > 3) {
    forms.add(`${w.slice(0, -1)}a`);
    forms.add(`${w.slice(0, -1)}i`);
  }
  if (w.endsWith("chi")) forms.add(`${w.slice(0, -3)}co`);
  if (w.endsWith("co")) forms.add(`${w.slice(0, -2)}chi`);
  if (w.endsWith("ghi")) forms.add(`${w.slice(0, -3)}go`);
  if (w.endsWith("go")) forms.add(`${w.slice(0, -2)}ghi`);
  if (w.endsWith("s") && w.length > 3 && !w.endsWith("ss")) forms.add(w.slice(0, -1));
  if (!w.endsWith("s")) forms.add(`${w}s`);
  return [...forms];
}
function tokenSharesStem(nameToken, queryToken) {
  const a = String(nameToken || "");
  const b = String(queryToken || "");
  if (!a || !b) return false;
  if (a === b || a.startsWith(b) || b.startsWith(a)) return true;
  const forms = italianSingularPluralForms(b);
  if (forms.some((f) => f && (a === f || a.startsWith(f) || a.includes(f)))) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 4) return false;
  const stemLen = Math.max(4, minLen - 1);
  return a.slice(0, stemLen) === b.slice(0, stemLen);
}
function countQueryTokenCoverage(foodName, query) {
  const nameNorm = normalizeSearchText(foodName);
  const queryNorm = normalizeSearchText(query);
  if (!nameNorm || !queryNorm) return 0;
  const queryWords = queryNorm.split(" ").filter(Boolean);
  if (queryWords.length === 0) return 0;
  const nameWords = nameNorm.split(" ").filter(Boolean);
  let covered = 0;
  for (let i = 0; i < queryWords.length; i += 1) {
    const token = queryWords[i];
    if (!token) continue;
    if (nameNorm.includes(token)) {
      covered += 1;
      continue;
    }
    const forms = italianSingularPluralForms(token);
    if (forms.some((f) => f && nameNorm.includes(f))) {
      covered += 1;
      continue;
    }
    if (nameWords.some((word) => tokenSharesStem(word, token))) covered += 1;
  }
  return covered;
}
function foodNameCoversAllQueryTokens(foodName, query) {
  const queryWords = normalizeSearchText(query).split(" ").filter(Boolean);
  if (queryWords.length === 0) return false;
  return countQueryTokenCoverage(foodName, query) >= queryWords.length;
}
function foodNameMatchesQuery(foodName, query) {
  const nameNorm = normalizeSearchText(foodName);
  const queryNorm = normalizeSearchText(query);
  if (!nameNorm || !queryNorm) return false;
  if (nameNorm === queryNorm) return true;
  const tokens = queryNorm.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    if (nameNorm.includes(queryNorm)) return true;
    const nameWords2 = nameNorm.split(/\s+/).filter(Boolean);
    return tokens.every((token) => {
      if (nameNorm.includes(token)) return true;
      const forms = italianSingularPluralForms(token);
      if (forms.some((f) => f && nameNorm.includes(f))) return true;
      return nameWords2.some((word) => tokenSharesStem(word, token));
    });
  }
  if (nameNorm.startsWith(queryNorm) || queryNorm.startsWith(nameNorm)) return true;
  if (nameNorm.includes(queryNorm) || queryNorm.includes(nameNorm)) return true;
  if (tokens.length === 0) return false;
  const nameWords = nameNorm.split(/\s+/).filter(Boolean);
  return tokens.every((token) => {
    if (nameNorm.includes(token)) return true;
    const forms = italianSingularPluralForms(token);
    if (forms.some((f) => f && nameNorm.includes(f))) return true;
    return nameWords.some((word) => tokenSharesStem(word, token));
  });
}
function textMatchesSearchQuery(text, query) {
  const queryNorm = normalizeSearchText(query);
  if (!queryNorm) return true;
  const nameNorm = normalizeSearchText(text);
  if (!nameNorm) return false;
  if (nameNorm === queryNorm) return true;
  if (nameNorm.includes(queryNorm) || queryNorm.includes(nameNorm)) return true;
  const queryTokens = queryNorm.split(/\s+/).filter(Boolean);
  const nameWords = nameNorm.split(/\s+/).filter(Boolean);
  if (queryTokens.length === 0) return false;
  return queryTokens.every((queryToken) => {
    if (nameNorm.includes(queryToken)) return true;
    const forms = italianSingularPluralForms(queryToken);
    if (forms.some((f) => f && nameNorm.includes(f))) return true;
    return nameWords.some((nameWord) => tokenSharesStem(nameWord, queryToken));
  });
}
function hasWordBoundaryMatch(normalizedText, queryWord) {
  if (!queryWord || !normalizedText) return false;
  const re = new RegExp(`\\b${escapeRegex(queryWord)}\\b`, "i");
  return re.test(normalizedText);
}
function scoreQueryToken(normalizedName, itemWords, queryWord) {
  const candidates = expandQueryWords(queryWord);
  let best = 0;
  for (let c = 0; c < candidates.length; c += 1) {
    const qw = candidates[c];
    if (!qw) continue;
    if (normalizedName === qw) {
      best = Math.max(best, SCORE_EXACT_OR_PREFIX);
      continue;
    }
    if (normalizedName.startsWith(qw) && normalizedName !== qw) {
      best = Math.max(best, SCORE_PREFIX);
      continue;
    }
    if (itemWords.some((word) => word === qw)) {
      best = Math.max(best, SCORE_TOKEN_EXACT);
      continue;
    }
    if (itemWords.some((word) => word.startsWith(qw) && word !== qw)) {
      best = Math.max(best, SCORE_WORD_BOUNDARY);
      continue;
    }
    if (hasWordBoundaryMatch(normalizedName, qw)) {
      best = Math.max(best, SCORE_WORD_BOUNDARY);
      continue;
    }
    if (normalizedName.includes(qw)) {
      best = Math.max(best, SCORE_SUBSTRING);
      continue;
    }
    if (itemWords.some((word) => tokenSharesStem(word, qw))) {
      best = Math.max(best, SCORE_TOKEN_EXACT);
    }
  }
  return best;
}
function tierFromTokenScore(tokenScore, isFullNameExact) {
  if (isFullNameExact || tokenScore >= SCORE_EXACT_OR_PREFIX) return "exact";
  if (tokenScore >= SCORE_PREFIX) return "prefix";
  if (tokenScore >= SCORE_TOKEN_EXACT) return "token_exact";
  if (tokenScore >= SCORE_WORD_BOUNDARY) return "word_boundary";
  if (tokenScore >= SCORE_SUBSTRING) return "substring";
  return "none";
}
function calculateMatchScore(normalizedName, itemWords, queryWords) {
  if (queryWords.length === 0) {
    return { strictScore: 0, matchTier: "none", allTokensMatch: false };
  }
  const fullQuery = queryWords.join(" ");
  if (normalizedName === fullQuery) {
    return { strictScore: SCORE_EXACT_OR_PREFIX, matchTier: "exact", allTokensMatch: true };
  }
  if (normalizedName.startsWith(fullQuery)) {
    return { strictScore: SCORE_PREFIX, matchTier: "prefix", allTokensMatch: true };
  }
  if (hasWordBoundaryMatch(normalizedName, fullQuery) && fullQuery.includes(" ")) {
    return { strictScore: SCORE_WORD_BOUNDARY, matchTier: "word_boundary", allTokensMatch: true };
  }
  if (normalizedName.includes(fullQuery) && fullQuery.includes(" ")) {
    return { strictScore: SCORE_COMPOUND_CONTAINED, matchTier: "compound", allTokensMatch: true };
  }
  if (queryWords.length === 1) {
    const tokenScore = scoreQueryToken(normalizedName, itemWords, queryWords[0]);
    if (tokenScore < MIN_MATCH_SCORE) {
      return { strictScore: 0, matchTier: "none", allTokensMatch: false };
    }
    return {
      strictScore: tokenScore,
      matchTier: tierFromTokenScore(tokenScore, false),
      allTokensMatch: true
    };
  }
  let minTokenScore = SCORE_EXACT_OR_PREFIX;
  let maxTokenScore = 0;
  let bestTier = "none";
  for (let i = 0; i < queryWords.length; i += 1) {
    const tokenScore = scoreQueryToken(normalizedName, itemWords, queryWords[i]);
    if (tokenScore < MIN_MATCH_SCORE) {
      return { strictScore: 0, matchTier: "none", allTokensMatch: false };
    }
    minTokenScore = Math.min(minTokenScore, tokenScore);
    maxTokenScore = Math.max(maxTokenScore, tokenScore);
    const tier = tierFromTokenScore(tokenScore, false);
    if ((MATCH_TIER_RANK[tier] || 0) > (MATCH_TIER_RANK[bestTier] || 0)) bestTier = tier;
  }
  const strictScore = Math.round(minTokenScore * 0.7 + maxTokenScore * 0.3);
  return { strictScore, matchTier: bestTier, allTokensMatch: true };
}
function isAutocompletePrefix(normalizedName, itemWords, normalizedQuery) {
  if (!normalizedQuery) return false;
  if (normalizedName.startsWith(normalizedQuery)) return true;
  return itemWords.some((word) => word.startsWith(normalizedQuery));
}
function usageBoostFromCount(usageCount, maxUsageInDb) {
  const count = Math.max(0, Number(usageCount) || 0);
  if (count <= 0) return 0;
  const maxU = Math.max(1, Number(maxUsageInDb) || 1);
  return count / maxU * 100 * USAGE_COUNT_SCORE_WEIGHT;
}
function searchFoodsDetailed(foodDb, query, options = {}) {
  if (!foodDb || typeof foodDb !== "object") return [];
  const trimmedQuery = String(query ?? "").trim();
  const normalizedQuery = normalizeSearchText(trimmedQuery);
  if (!normalizedQuery) return [];
  const includeUserHistory = options.includeUserHistory !== false;
  const mode = options.mode || "search";
  const enableFuzzy = options.enableFuzzy !== false && mode !== "autocomplete";
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.floor(options.limit) : DEFAULT_SEARCH_LIMIT;
  const maxEntriesToScan = Number.isFinite(options.maxEntriesToScan) && options.maxEntriesToScan > 0 ? Math.floor(options.maxEntriesToScan) : null;
  const earlyExitOnStrong = options.earlyExitOnStrong === true;
  const queryWords = normalizedQuery.split(" ").filter(Boolean);
  if (queryWords.length === 0) return [];
  const results = [];
  const entries = Object.entries(foodDb);
  const scanLimit = maxEntriesToScan != null ? Math.min(entries.length, maxEntriesToScan) : entries.length;
  const recentFoodScores = includeUserHistory ? buildRecentFoodScoreMap() : /* @__PURE__ */ new Map();
  let maxUsageInDb = 1;
  if (includeUserHistory) {
    for (let i = 0; i < scanLimit; i += 1) {
      maxUsageInDb = Math.max(maxUsageInDb, getFoodUsageCount(entries[i][1]));
    }
  }
  let strongHitCount = 0;
  for (let i = 0; i < scanLimit; i += 1) {
    const [id, food] = entries[i];
    const descName = String(food?.desc || "").trim();
    const altName = String(food?.name || "").trim();
    const keyAsName = String(id || "").trim();
    const keyLooksLikeName = keyAsName.length >= 2 && !/^\d+$/.test(keyAsName) && !/^food[_-]?\d+/i.test(keyAsName) && /[\p{L}]/u.test(keyAsName);
    const brandRaw = String(food?.brand || food?.brands || food?.marca || "").trim();
    const name = descName || altName || (keyLooksLikeName ? keyAsName.replace(/[_-]+/g, " ") : "");
    if (!name && !brandRaw) continue;
    const normalizedName = normalizeSearchText(name);
    const normalizedAlt = altName && altName !== name ? normalizeSearchText(altName) : "";
    const normalizedKey = keyLooksLikeName && keyAsName !== name ? normalizeSearchText(keyAsName.replace(/[_-]+/g, " ")) : "";
    const normalizedBrand = brandRaw ? normalizeSearchText(brandRaw) : "";
    if (!normalizedName && !normalizedAlt && !normalizedKey && !normalizedBrand) continue;
    const primaryNorm = normalizedName || normalizedAlt || normalizedKey || normalizedBrand;
    const itemWords = primaryNorm.split(" ").filter(Boolean);
    if (itemWords.length === 0) continue;
    if (mode === "autocomplete" && !isAutocompletePrefix(primaryNorm, itemWords, normalizedQuery)) {
      continue;
    }
    let { strictScore, matchTier, allTokensMatch } = calculateMatchScore(
      primaryNorm,
      itemWords,
      queryWords
    );
    const altCandidates = [
      normalizedAlt && normalizedAlt !== primaryNorm ? { norm: normalizedAlt, words: normalizedAlt.split(" ").filter(Boolean) } : null,
      normalizedKey && normalizedKey !== primaryNorm && normalizedKey !== normalizedAlt ? { norm: normalizedKey, words: normalizedKey.split(" ").filter(Boolean) } : null,
      normalizedBrand && normalizedBrand !== primaryNorm && normalizedBrand !== normalizedAlt && normalizedBrand !== normalizedKey ? { norm: normalizedBrand, words: normalizedBrand.split(" ").filter(Boolean) } : null
    ].filter(Boolean);
    for (let a = 0; a < altCandidates.length; a += 1) {
      const altMatch = calculateMatchScore(altCandidates[a].norm, altCandidates[a].words, queryWords);
      if (altMatch.strictScore > strictScore) {
        strictScore = altMatch.strictScore;
        matchTier = altMatch.matchTier;
        allTokensMatch = altMatch.allTokensMatch;
      }
    }
    if (primaryNorm === normalizedQuery || normalizedAlt === normalizedQuery || normalizedKey === normalizedQuery || normalizedBrand === normalizedQuery) {
      strictScore = SCORE_EXACT_OR_PREFIX;
      matchTier = "exact";
      allTokensMatch = true;
    }
    if (matchTier !== "exact" && queryWords.length === 1) {
      const qForms = new Set(italianSingularPluralForms(queryWords[0]));
      const nameForms = italianSingularPluralForms(primaryNorm);
      if (nameForms.some((f) => qForms.has(f))) {
        strictScore = SCORE_EXACT_OR_PREFIX;
        matchTier = "exact";
        allTokensMatch = true;
      } else if (itemWords.some((w) => italianSingularPluralForms(w).some((f) => qForms.has(f)))) {
        strictScore = Math.max(strictScore, SCORE_TOKEN_EXACT);
        if ((MATCH_TIER_RANK[matchTier] || 0) < MATCH_TIER_RANK.token_exact) {
          matchTier = "token_exact";
        }
        allTokensMatch = true;
      }
    }
    if (foodNameMatchesQuery(name, trimmedQuery) || brandRaw && foodNameMatchesQuery(brandRaw, trimmedQuery)) {
      if (strictScore < SCORE_STEM_GUARANTEED) {
        strictScore = SCORE_STEM_GUARANTEED;
        if ((MATCH_TIER_RANK[matchTier] || 0) < MATCH_TIER_RANK.token_exact) {
          matchTier = "token_exact";
        }
        allTokensMatch = true;
      }
    }
    if (strictScore < MIN_MATCH_SCORE) continue;
    const usageCount = getFoodUsageCount(food);
    const historyScores = includeUserHistory ? recentFoodScores.get(String(id).trim()) || recentFoodScores.get(primaryNorm) || null : null;
    const recencyScore = historyScores?.recencyScore ?? 0;
    const frequencyScore = historyScores?.frequencyScore ?? 0;
    const historyBoost = includeUserHistory ? (recencyScore * 0.6 + frequencyScore * 0.4) * 100 * HISTORY_SCORE_WEIGHT : 0;
    const usageBoost = usageBoostFromCount(usageCount, maxUsageInDb);
    const score = strictScore + (usageBoost + historyBoost) * 0.01;
    const matchScore = strictScore / 100;
    const displayName = name || brandRaw;
    results.push({
      id,
      name: displayName,
      matchScore,
      recencyScore,
      frequencyScore,
      usageCount,
      score,
      strictScore,
      matchTier,
      allTokensMatch,
      queryTokenCoverage: countQueryTokenCoverage(
        [name, brandRaw].filter(Boolean).join(" "),
        trimmedQuery
      ),
      lastUsedAt: Number(food?.lastUsedAt ?? food?.lastUsed ?? 0) || 0
    });
    if (matchTier === "exact" || matchTier === "prefix" || matchTier === "token_exact" || Number(strictScore) >= 75) {
      strongHitCount += 1;
    }
    if (earlyExitOnStrong && strongHitCount >= limit && results.length >= limit) {
      break;
    }
  }
  const hasStrongMatch = results.some((r) => {
    const tier = String(r.matchTier || "");
    return tier === "exact" || tier === "prefix" || tier === "token_exact" || tier === "word_boundary" || Number(r.strictScore) >= 75;
  });
  if (!hasStrongMatch && enableFuzzy) {
    const existingIds = new Set(results.map((r) => String(r.id)));
    const fuzzyScanLimit = scanLimit;
    let fuzzyAdded = 0;
    for (let i = 0; i < fuzzyScanLimit; i += 1) {
      const [id, food] = entries[i];
      if (existingIds.has(String(id))) continue;
      const descName = String(food?.desc || "").trim();
      const altName = String(food?.name || "").trim();
      const keyAsName = String(id || "").trim();
      const keyLooksLikeName = keyAsName.length >= 2 && !/^\d+$/.test(keyAsName) && !/^food[_-]?\d+/i.test(keyAsName) && /[\p{L}]/u.test(keyAsName);
      const name = descName || altName || (keyLooksLikeName ? keyAsName.replace(/[_-]+/g, " ") : "");
      if (!name) continue;
      const normalizedName = normalizeSearchText(name);
      const normalizedAlt = altName && altName !== name ? normalizeSearchText(altName) : "";
      const primaryNorm = normalizedName || normalizedAlt;
      if (!primaryNorm) continue;
      const itemWords = primaryNorm.split(" ").filter(Boolean);
      let fuzzy = bestFuzzyMatch(normalizedQuery, primaryNorm, itemWords);
      if (normalizedAlt && normalizedAlt !== primaryNorm) {
        const altFuzzy = bestFuzzyMatch(
          normalizedQuery,
          normalizedAlt,
          normalizedAlt.split(" ").filter(Boolean)
        );
        if (altFuzzy && (!fuzzy || altFuzzy.distance < fuzzy.distance)) {
          fuzzy = altFuzzy;
        }
      }
      let fuzzyTier = "fuzzy";
      let fuzzyStrict = fuzzy?.score ?? 0;
      if (!fuzzy && queryWords.length === 1) {
        const qForms = italianSingularPluralForms(normalizedQuery);
        if (qForms.includes(primaryNorm)) {
          fuzzy = { distance: 0, score: SCORE_EXACT_OR_PREFIX };
          fuzzyTier = "exact";
          fuzzyStrict = SCORE_EXACT_OR_PREFIX;
        } else if (itemWords.some((w) => qForms.includes(w))) {
          fuzzy = { distance: 0, score: SCORE_TOKEN_EXACT };
          fuzzyTier = "token_exact";
          fuzzyStrict = SCORE_TOKEN_EXACT;
        }
      } else if (fuzzy) {
        if (fuzzy.distance === 0 && primaryNorm === normalizedQuery) {
          fuzzyTier = "exact";
          fuzzyStrict = SCORE_EXACT_OR_PREFIX;
        } else if (fuzzy.distance === 0) {
          fuzzyTier = "token_exact";
          fuzzyStrict = SCORE_TOKEN_EXACT;
        } else {
          fuzzyStrict = fuzzy.score;
        }
      }
      if (!fuzzy) continue;
      const usageCount = getFoodUsageCount(food);
      const usageBoost = usageBoostFromCount(usageCount, maxUsageInDb);
      results.push({
        id,
        name,
        matchScore: fuzzyStrict / 100,
        recencyScore: 0,
        frequencyScore: 0,
        usageCount,
        score: fuzzyStrict + usageBoost * 0.01,
        strictScore: fuzzyStrict,
        matchTier: fuzzyTier,
        allTokensMatch: foodNameCoversAllQueryTokens(name, trimmedQuery),
        queryTokenCoverage: countQueryTokenCoverage(name, trimmedQuery),
        fuzzyDistance: fuzzy.distance,
        lastUsedAt: Number(food?.lastUsedAt ?? food?.lastUsed ?? 0) || 0
      });
      fuzzyAdded += 1;
      if (fuzzyAdded >= Math.max(limit, 5) || earlyExitOnStrong && fuzzyAdded >= limit) {
        break;
      }
    }
  }
  results.sort(compareFoodSearchHits);
  return results.slice(0, limit).map(
    ({
      id,
      name,
      matchScore,
      recencyScore,
      frequencyScore,
      usageCount,
      score,
      strictScore,
      matchTier,
      allTokensMatch,
      queryTokenCoverage,
      lastUsedAt
    }) => ({
      id,
      name,
      matchScore,
      recencyScore,
      frequencyScore,
      usageCount,
      textScore: score / 100,
      strictScore,
      matchTier,
      allTokensMatch,
      queryTokenCoverage,
      lastUsedAt
    })
  );
}
function compareFoodSearchHits(a, b) {
  const aAll = a?.allTokensMatch === true;
  const bAll = b?.allTokensMatch === true;
  if (aAll !== bAll) return aAll ? -1 : 1;
  const aCov = Number(a?.queryTokenCoverage) || 0;
  const bCov = Number(b?.queryTokenCoverage) || 0;
  if (bCov !== aCov) return bCov - aCov;
  const aStrict = Number(a?.strictScore) || 0;
  const bStrict = Number(b?.strictScore) || 0;
  if (bStrict !== aStrict) return bStrict - aStrict;
  const aTier = MATCH_TIER_RANK[String(a?.matchTier || "none")] || 0;
  const bTier = MATCH_TIER_RANK[String(b?.matchTier || "none")] || 0;
  if (bTier !== aTier) return bTier - aTier;
  const aUsage = Number(a?.usageCount) || 0;
  const bUsage = Number(b?.usageCount) || 0;
  if (bUsage !== aUsage) return bUsage - aUsage;
  const aRecency = Number(a?.recencyScore) || 0;
  const bRecency = Number(b?.recencyScore) || 0;
  if (bRecency !== aRecency) return bRecency - aRecency;
  const aLast = Number(a?.lastUsedAt) || 0;
  const bLast = Number(b?.lastUsedAt) || 0;
  if (bLast !== aLast) return bLast - aLast;
  return String(a?.name || "").localeCompare(String(b?.name || ""), "it");
}
function searchFoods(foodDb, query, options = {}) {
  return searchFoodsDetailed(foodDb, query, options).map(({ id, name }) => ({ id, name }));
}
function normalizeSearchKeywords(foodName, searchKeywords) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (value) => {
    const raw = String(value || "").trim();
    if (!raw || raw.length > 64) return;
    const key = normalizeSearchText(raw);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(raw);
  };
  push(foodName);
  (Array.isArray(searchKeywords) ? searchKeywords : []).forEach(push);
  const primaryNorm = normalizeSearchText(foodName);
  const firstToken = primaryNorm.split(" ").filter(Boolean)[0] || "";
  if (firstToken) {
    italianSingularPluralForms(firstToken).forEach(push);
    for (const syn of SEARCH_SYNONYMS[firstToken] || []) push(syn);
  }
  return out.slice(0, 12);
}
function searchFoodsWithKeywords(foodDb, keywordsOrQuery, options = {}) {
  const originalQuery = String(
    options.originalQuery || (Array.isArray(keywordsOrQuery) ? keywordsOrQuery[0] || "" : keywordsOrQuery || "")
  ).trim();
  const originalNorm = normalizeSearchText(originalQuery);
  const originalWords = originalNorm.split(" ").filter(Boolean);
  const isSpecificQuery = originalWords.length >= 2;
  const keywords = Array.isArray(keywordsOrQuery) ? keywordsOrQuery.map((k) => String(k || "").trim()).filter(Boolean) : normalizeSearchKeywords(keywordsOrQuery, options.searchKeywords);
  if (keywords.length === 0 && !originalNorm) return [];
  if (!isSpecificQuery && keywords.length === 1) {
    return searchFoodsDetailed(foodDb, keywords[0], options);
  }
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.floor(options.limit) : DEFAULT_SEARCH_LIMIT;
  const perQueryLimit = Math.max(limit, 12);
  const byId = /* @__PURE__ */ new Map();
  const mergeHit = (hit, kw, fromFullQuery) => {
    const id = String(hit.id);
    const kwNorm = normalizeSearchText(kw);
    const isFullQueryKw = Boolean(originalNorm) && kwNorm === originalNorm;
    const coverage = countQueryTokenCoverage(hit.name, originalQuery || kw);
    const coversAll = isSpecificQuery ? coverage >= originalWords.length : hit.allTokensMatch !== false;
    let next = {
      ...hit,
      matchedKeyword: kw,
      queryTokenCoverage: coverage,
      allTokensMatch: coversAll
    };
    if (isSpecificQuery && !fromFullQuery && !isFullQueryKw) {
      next.keywordExact = false;
      next.matchTier = hit.matchTier === "exact" || hit.matchTier === "prefix" ? "token_exact" : hit.matchTier;
      next.strictScore = Math.min(
        Number(hit.strictScore) || 0,
        coversAll ? SCORE_COMPOUND_CONTAINED : SCORE_SUBSTRING
      );
    } else {
      const isExact = coversAll && (String(hit.matchTier || "") === "exact" || Number(hit.strictScore) >= SCORE_EXACT_OR_PREFIX);
      next.keywordExact = isExact;
      next.strictScore = isExact ? SCORE_EXACT_OR_PREFIX : Number(hit.strictScore) || 0;
      next.matchTier = isExact ? "exact" : hit.matchTier;
    }
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, next);
      return;
    }
    const betterCoverage = (Number(next.queryTokenCoverage) || 0) > (Number(prev.queryTokenCoverage) || 0);
    const betterStrict = (Number(next.strictScore) || 0) > (Number(prev.strictScore) || 0);
    if (betterCoverage || next.allTokensMatch && !prev.allTokensMatch || !betterCoverage && betterStrict && next.allTokensMatch === prev.allTokensMatch) {
      byId.set(id, {
        ...next,
        keywordExact: Boolean(prev.keywordExact && coversAll) || next.keywordExact
      });
    }
  };
  if (originalNorm) {
    const fullHits = searchFoodsDetailed(foodDb, originalQuery, {
      ...options,
      limit: perQueryLimit
    });
    for (let h = 0; h < fullHits.length; h += 1) {
      mergeHit(fullHits[h], originalQuery, true);
    }
  }
  const seenKw = new Set(originalNorm ? [originalNorm] : []);
  for (let i = 0; i < keywords.length; i += 1) {
    const kw = keywords[i];
    const kwNorm = normalizeSearchText(kw);
    if (!kwNorm || seenKw.has(kwNorm)) continue;
    seenKw.add(kwNorm);
    const hits = searchFoodsDetailed(foodDb, kw, {
      ...options,
      limit: perQueryLimit
    });
    for (let h = 0; h < hits.length; h += 1) {
      mergeHit(hits[h], kw, false);
    }
  }
  let list = [...byId.values()];
  if (isSpecificQuery) {
    const complete = list.filter((hit) => hit.allTokensMatch === true);
    if (complete.length > 0) list = complete;
  }
  return list.sort(compareFoodSearchHits).slice(0, limit);
}
function shouldDiscloseSynonymMapping(spokenName, dbName) {
  const s = normalizeSearchText(spokenName);
  const d = normalizeSearchText(dbName);
  if (!s || !d) return false;
  if (s === d) return false;
  if (d.includes(s) || s.includes(d)) return false;
  const sTok = s.split(" ").filter(Boolean)[0] || "";
  const dTok = d.split(" ").filter(Boolean)[0] || "";
  const sForms = new Set(italianSingularPluralForms(sTok));
  const dForms = italianSingularPluralForms(dTok);
  if (dForms.some((f) => sForms.has(f))) return false;
  if ([...sForms].some((f) => d.includes(f))) return false;
  return true;
}
var RECENT_FOODS_STORAGE_KEY, RECENT_FOOD_HIGH_WINDOW_MS, SEARCH_SYNONYMS, SCORE_EXACT_OR_PREFIX, SCORE_PREFIX, SCORE_COMPOUND_CONTAINED, SCORE_TOKEN_EXACT, SCORE_WORD_BOUNDARY, SCORE_SUBSTRING, SCORE_FUZZY_DIST_1, SCORE_FUZZY_DIST_2, MIN_MATCH_SCORE, DEFAULT_SEARCH_LIMIT, HISTORY_SCORE_WEIGHT, USAGE_COUNT_SCORE_WEIGHT, MATCH_TIER_RANK, SCORE_STEM_GUARANTEED, foodSearch_default;
var init_foodSearch = __esm({
  "src/foodSearch.js"() {
    RECENT_FOODS_STORAGE_KEY = "recent_foods";
    RECENT_FOOD_HIGH_WINDOW_MS = 24 * 60 * 60 * 1e3;
    SEARCH_SYNONYMS = {
      arrosto: ["cotto"],
      pollo: ["chicken"],
      pomodoro: ["pomodori", "pomodorini"],
      pomodori: ["pomodoro", "pomodorini"],
      uovo: ["uova"],
      uova: ["uovo"],
      // Fallback lessicale IT (l'LLM può espandere ulteriormente via searchKeywords).
      cocomero: ["anguria"],
      anguria: ["cocomero"],
      arachidi: ["noccioline"],
      noccioline: ["arachidi"],
      brioche: ["cornetto"],
      cornetto: ["brioche"]
    };
    SCORE_EXACT_OR_PREFIX = 100;
    SCORE_PREFIX = 99;
    SCORE_COMPOUND_CONTAINED = 92;
    SCORE_TOKEN_EXACT = 80;
    SCORE_WORD_BOUNDARY = 75;
    SCORE_SUBSTRING = 50;
    SCORE_FUZZY_DIST_1 = 70;
    SCORE_FUZZY_DIST_2 = 65;
    MIN_MATCH_SCORE = SCORE_SUBSTRING;
    DEFAULT_SEARCH_LIMIT = 30;
    HISTORY_SCORE_WEIGHT = 0.08;
    USAGE_COUNT_SCORE_WEIGHT = 0.35;
    MATCH_TIER_RANK = Object.freeze({
      exact: 100,
      prefix: 90,
      compound: 85,
      token_exact: 80,
      word_boundary: 70,
      substring: 50,
      fuzzy: 30,
      none: 0
    });
    SCORE_STEM_GUARANTEED = 90;
    foodSearch_default = searchFoods;
  }
});

// src/features/mealBuilder/utils/foodMatchQuality.js
var foodMatchQuality_exports = {};
__export(foodMatchQuality_exports, {
  ENERGY_DENSITY_CONFIRM_RATIO: () => ENERGY_DENSITY_CONFIRM_RATIO,
  FOOD_MATCH_QUALITY: () => FOOD_MATCH_QUALITY,
  FOOD_MATCH_QUALITY_RANK: () => FOOD_MATCH_QUALITY_RANK,
  annotateCandidatesMatchQuality: () => annotateCandidatesMatchQuality,
  catalogRowDisplayNames: () => catalogRowDisplayNames,
  classifyFoodMatchQuality: () => classifyFoodMatchQuality,
  decideFoodMatchResolution: () => decideFoodMatchResolution,
  estimateKcalPer100g: () => estimateKcalPer100g,
  exactQueryNormForms: () => exactQueryNormForms,
  findExactFoodMatchesInCatalog: () => findExactFoodMatchesInCatalog,
  findStrongFoodMatchesInCatalog: () => findStrongFoodMatchesInCatalog,
  foodMatchQualityRank: () => foodMatchQualityRank,
  hasImplausibleEnergyDensityGap: () => hasImplausibleEnergyDensityGap,
  isExactFoodNameMatch: () => isExactFoodNameMatch,
  isStrongFoodMatchQuality: () => isStrongFoodMatchQuality,
  levelHasStrongMatch: () => levelHasStrongMatch,
  normalizeFoodMatchQuality: () => normalizeFoodMatchQuality,
  sortCandidatesByMatchQuality: () => sortCandidatesByMatchQuality,
  tokensMatchNormalized: () => tokensMatchNormalized
});
function normalizeFoodMatchQuality(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "exact" || v === "prefix" || v === "contains" || v === "fuzzy") return v;
  return FOOD_MATCH_QUALITY.FUZZY;
}
function isStrongFoodMatchQuality(quality) {
  const q = normalizeFoodMatchQuality(quality);
  return q === FOOD_MATCH_QUALITY.EXACT || q === FOOD_MATCH_QUALITY.PREFIX;
}
function tokensMatchNormalized(a, b) {
  const x = normalizeSearchText(a);
  const y = normalizeSearchText(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const forms = new Set(italianSingularPluralForms(y));
  if (forms.has(x)) return true;
  return italianSingularPluralForms(x).some((f) => f === y || forms.has(f));
}
function classifyFoodMatchQuality(candidateName, query) {
  const name = normalizeSearchText(candidateName);
  const q = normalizeSearchText(query);
  if (!name || !q) return FOOD_MATCH_QUALITY.FUZZY;
  const nameWords = name.split(/\s+/).filter(Boolean);
  const qWords = q.split(/\s+/).filter(Boolean);
  if (nameWords.length === 0 || qWords.length === 0) return FOOD_MATCH_QUALITY.FUZZY;
  if (name === q) return FOOD_MATCH_QUALITY.EXACT;
  if (qWords.length === 1 && nameWords.length === 1 && tokensMatchNormalized(nameWords[0], qWords[0])) {
    return FOOD_MATCH_QUALITY.EXACT;
  }
  const qForms = qWords.length === 1 ? italianSingularPluralForms(qWords[0]) : [];
  if (qForms.some((f) => f && name === f)) return FOOD_MATCH_QUALITY.EXACT;
  if (name.startsWith(`${q} `)) return FOOD_MATCH_QUALITY.PREFIX;
  if (qWords.length === 1 && tokensMatchNormalized(nameWords[0], qWords[0])) {
    return FOOD_MATCH_QUALITY.PREFIX;
  }
  if (qForms.some((f) => f && name.startsWith(`${f} `))) return FOOD_MATCH_QUALITY.PREFIX;
  const hayTokens = nameWords;
  const queryTokensToFind = qWords.length === 1 ? [qWords[0], ...qForms] : qWords;
  if (qWords.length === 1) {
    const hit = hayTokens.some((t) => queryTokensToFind.some((qt) => tokensMatchNormalized(t, qt)));
    if (hit) return FOOD_MATCH_QUALITY.CONTAINS;
    if (qForms.some((f) => f && f.length >= 4 && name.includes(f)) || name.includes(q)) {
      return FOOD_MATCH_QUALITY.CONTAINS;
    }
    return FOOD_MATCH_QUALITY.FUZZY;
  }
  const allTokensPresent = qWords.every((qt) => hayTokens.some((t) => tokensMatchNormalized(t, qt)) || name.includes(qt));
  if (allTokensPresent) return FOOD_MATCH_QUALITY.CONTAINS;
  return FOOD_MATCH_QUALITY.FUZZY;
}
function foodMatchQualityRank(quality) {
  const q = normalizeFoodMatchQuality(quality);
  return FOOD_MATCH_QUALITY_RANK[q] ?? FOOD_MATCH_QUALITY_RANK.fuzzy;
}
function annotateCandidatesMatchQuality(query, candidates = []) {
  return (Array.isArray(candidates) ? candidates : []).map((c) => {
    if (!c || typeof c !== "object") return c;
    const name = String(c.name || c.desc || c.row?.desc || c.row?.name || "").trim();
    return { ...c, matchQuality: classifyFoodMatchQuality(name, query) };
  });
}
function levelHasStrongMatch(candidates = []) {
  return (Array.isArray(candidates) ? candidates : []).some((c) => isStrongFoodMatchQuality(c?.matchQuality));
}
function sortCandidatesByMatchQuality(list = [], sourcePriorityFn = null) {
  const srcPri = typeof sourcePriorityFn === "function" ? sourcePriorityFn : (c) => c?.source === "personal" ? 0 : c?.source === "kentu" || c?.source === "kentu_it" ? 1 : 2;
  return [...Array.isArray(list) ? list : []].sort((a, b) => {
    const qa = foodMatchQualityRank(a?.matchQuality);
    const qb = foodMatchQualityRank(b?.matchQuality);
    if (qa !== qb) return qa - qb;
    const scoreDiff = (Number(b?.confidenceScore) || 0) - (Number(a?.confidenceScore) || 0);
    if (Math.abs(scoreDiff) > 1e-3) return scoreDiff;
    const usageDiff = (Number(b?.usageCount) || 0) - (Number(a?.usageCount) || 0);
    if (usageDiff !== 0) return usageDiff;
    const recencyDiff = (Number(b?.recencyScore) || Number(b?.lastUsedAt) || 0) - (Number(a?.recencyScore) || Number(a?.lastUsedAt) || 0);
    if (recencyDiff !== 0) return recencyDiff;
    return srcPri(a) - srcPri(b);
  });
}
function estimateKcalPer100g(row) {
  if (!row || typeof row !== "object") return null;
  const direct = Number(row.kcal ?? row.cal ?? row.energyKcal);
  if (Number.isFinite(direct) && direct > 0 && direct < 1200) return direct;
  const servingKcal = Number(row.servingMacros?.kcal);
  const servingG = Number(row.servingGrams || row.defaultUnitWeight);
  if (Number.isFinite(servingKcal) && servingKcal > 0 && Number.isFinite(servingG) && servingG > 0) {
    return servingKcal / servingG * 100;
  }
  return null;
}
function hasImplausibleEnergyDensityGap(chosen, referenceStrong, ratio = ENERGY_DENSITY_CONFIRM_RATIO) {
  const a = estimateKcalPer100g(chosen?.row);
  const b = estimateKcalPer100g(referenceStrong?.row);
  if (a == null || b == null || a <= 0 || b <= 0) return false;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return hi / lo > ratio;
}
function decideFoodMatchResolution(candidates = [], opts = {}) {
  const autoThreshold = Number.isFinite(Number(opts.autoAcceptThreshold)) ? Number(opts.autoAcceptThreshold) : 0.8;
  const closeRaceMargin = Number.isFinite(Number(opts.closeRaceMargin)) ? Number(opts.closeRaceMargin) : 0.08;
  const list = Array.isArray(candidates) ? candidates.filter((c) => c?.row || c?.name) : [];
  const top = list[0] || null;
  const second = list[1] || null;
  if (!top) {
    return {
      needsDisambiguation: true,
      match: null,
      confidenceScore: 0,
      matchQuality: null,
      reason: "no_candidates"
    };
  }
  const topQuality = normalizeFoodMatchQuality(top.matchQuality);
  const topScore = Number(top.confidenceScore) || 0;
  const secondScore = Number(second?.confidenceScore) || 0;
  const secondQuality = second ? normalizeFoodMatchQuality(second.matchQuality) : null;
  const strongRef = list.find((c) => isStrongFoodMatchQuality(c.matchQuality)) || null;
  const energyGap = Boolean(
    strongRef && strongRef !== top && hasImplausibleEnergyDensityGap(top, strongRef)
  );
  const closeRace = Boolean(
    second && foodMatchQualityRank(topQuality) === foodMatchQualityRank(secondQuality) && topScore < 0.98 && secondScore >= autoThreshold - 0.05 && topScore - secondScore < closeRaceMargin
  );
  const weakMatch = !isStrongFoodMatchQuality(topQuality);
  const belowThreshold = topScore < autoThreshold;
  const needsDisambiguation = weakMatch || belowThreshold || closeRace || energyGap;
  if (needsDisambiguation) {
    return {
      needsDisambiguation: true,
      match: null,
      confidenceScore: topScore,
      matchQuality: topQuality,
      reason: energyGap ? "energy_density_gap" : weakMatch ? "weak_match_quality" : closeRace ? "close_race" : "below_threshold"
    };
  }
  return {
    needsDisambiguation: false,
    match: top,
    confidenceScore: topScore,
    matchQuality: topQuality,
    reason: "auto_strong_match"
  };
}
function exactQueryNormForms(query) {
  const q = normalizeSearchText(query);
  const forms = /* @__PURE__ */ new Set();
  if (!q) return forms;
  forms.add(q);
  italianSingularPluralForms(q).forEach((f) => {
    if (f) forms.add(normalizeSearchText(f));
  });
  return forms;
}
function isExactFoodNameMatch(candidateName, query) {
  return classifyFoodMatchQuality(candidateName, query) === FOOD_MATCH_QUALITY.EXACT;
}
function catalogRowDisplayNames(id, food) {
  if (!food || typeof food !== "object") return [];
  const descName = String(food.desc || "").trim();
  const altName = String(food.name || "").trim();
  const italianName = String(food.italianName || "").trim();
  const keyAsName = String(id || "").trim();
  const keyLooksLikeName = keyAsName.length >= 2 && !/^\d+$/.test(keyAsName) && !/^food[_-]?\d+/i.test(keyAsName) && /[\p{L}]/u.test(keyAsName);
  return [
    italianName,
    descName,
    altName,
    keyLooksLikeName ? keyAsName.replace(/[_-]+/g, " ") : ""
  ].filter(Boolean);
}
function findExactFoodMatchesInCatalog(foodName, foodDb, opts = {}) {
  const needleForms = exactQueryNormForms(foodName);
  if (needleForms.size === 0 || !foodDb || typeof foodDb !== "object") return [];
  const limit = Number.isFinite(opts.limit) && opts.limit > 0 ? Math.floor(opts.limit) : 20;
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const [id, food] of Object.entries(foodDb)) {
    if (!food || typeof food !== "object") continue;
    const nameCandidates = catalogRowDisplayNames(id, food);
    let matchedName = null;
    for (const candidate of nameCandidates) {
      const norm = normalizeSearchText(candidate);
      if (!norm) continue;
      if (needleForms.has(norm)) {
        matchedName = candidate;
        break;
      }
      const words = norm.split(/\s+/).filter(Boolean);
      if (words.length === 1 && needleForms.has(words[0])) {
        matchedName = candidate;
        break;
      }
    }
    if (!matchedName) continue;
    const displayName = String(food.italianName || food.desc || food.name || matchedName).trim();
    const fdcId = String(food.fdcId ?? food.id ?? food.foodDbKey ?? id ?? "").trim() || String(id);
    if (seen.has(fdcId)) continue;
    seen.add(fdcId);
    out.push({
      fdcId,
      name: displayName,
      confidence: "high",
      reason: "Match letterale esatto",
      matchKind: "exact",
      matchQuality: FOOD_MATCH_QUALITY.EXACT,
      row: {
        ...food,
        id: food.id ?? id,
        fdcId,
        foodDbKey: food.foodDbKey ?? fdcId,
        desc: food.desc || displayName,
        name: food.name || displayName
      }
    });
    if (out.length >= limit) break;
  }
  return out;
}
function findStrongFoodMatchesInCatalog(foodName, foodDb, opts = {}) {
  const q = normalizeSearchText(foodName);
  if (!q || !foodDb || typeof foodDb !== "object") return [];
  const limit = Number.isFinite(opts.limit) && opts.limit > 0 ? Math.floor(opts.limit) : 24;
  const exact = findExactFoodMatchesInCatalog(foodName, foodDb, { limit });
  const seen = new Set(exact.map((h) => h.fdcId));
  const prefix = [];
  for (const [id, food] of Object.entries(foodDb)) {
    if (!food || typeof food !== "object") continue;
    const nameCandidates = catalogRowDisplayNames(id, food);
    let bestName = null;
    let bestQuality = null;
    for (const candidate of nameCandidates) {
      const quality = classifyFoodMatchQuality(candidate, foodName);
      if (!isStrongFoodMatchQuality(quality)) continue;
      if (!bestQuality || foodMatchQualityRank(quality) < foodMatchQualityRank(bestQuality)) {
        bestQuality = quality;
        bestName = candidate;
      }
    }
    if (!bestName || bestQuality === FOOD_MATCH_QUALITY.EXACT) continue;
    const displayName = String(food.italianName || food.desc || food.name || bestName).trim();
    const fdcId = String(food.fdcId ?? food.id ?? food.foodDbKey ?? id ?? "").trim() || String(id);
    if (seen.has(fdcId)) continue;
    seen.add(fdcId);
    prefix.push({
      fdcId,
      name: displayName,
      confidence: "high",
      reason: "Match prefisso forte",
      matchKind: "starts_with",
      matchQuality: FOOD_MATCH_QUALITY.PREFIX,
      row: {
        ...food,
        id: food.id ?? id,
        fdcId,
        foodDbKey: food.foodDbKey ?? fdcId,
        desc: food.desc || displayName,
        name: food.name || displayName
      }
    });
    if (exact.length + prefix.length >= limit) break;
  }
  return [...exact, ...prefix].slice(0, limit);
}
var FOOD_MATCH_QUALITY, FOOD_MATCH_QUALITY_RANK, ENERGY_DENSITY_CONFIRM_RATIO;
var init_foodMatchQuality = __esm({
  "src/features/mealBuilder/utils/foodMatchQuality.js"() {
    init_foodSearch();
    FOOD_MATCH_QUALITY = Object.freeze({
      EXACT: "exact",
      PREFIX: "prefix",
      CONTAINS: "contains",
      FUZZY: "fuzzy"
    });
    FOOD_MATCH_QUALITY_RANK = Object.freeze({
      exact: 0,
      prefix: 1,
      contains: 2,
      fuzzy: 3
    });
    ENERGY_DENSITY_CONFIRM_RATIO = 3;
  }
});

// functions/mcp/httpHandler.js
var httpHandler_exports = {};
__export(httpHandler_exports, {
  handleKentuMcpHttp: () => handleKentuMcpHttp
});
module.exports = __toCommonJS(httpHandler_exports);
var import_streamableHttp = require("@modelcontextprotocol/sdk/server/streamableHttp.js");

// functions/mcp/hashToken.js
var import_node_crypto = require("node:crypto");
function sha256Hex(value) {
  return (0, import_node_crypto.createHash)("sha256").update(String(value), "utf8").digest("hex");
}

// functions/mcp/auth.js
var RATE_LIMIT_PER_HOUR = 60;
var MIN_TOKEN_LEN = 32;
function hourBucket(now = Date.now()) {
  return Math.floor(now / 36e5);
}
function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") {
    return String(headers.get(name) || headers.get(name.toLowerCase()) || "").trim();
  }
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() !== want) continue;
    if (Array.isArray(value)) return String(value[0] || "").trim();
    return String(value || "").trim();
  }
  return "";
}
function extractMcpCredential(headersOrAuthorization) {
  if (typeof headersOrAuthorization === "string") {
    headersOrAuthorization = { authorization: headersOrAuthorization };
  }
  const candidates = [
    { name: "authorization", value: headerValue(headersOrAuthorization, "authorization") },
    { name: "x-api-key", value: headerValue(headersOrAuthorization, "x-api-key") },
    { name: "x-auth-token", value: headerValue(headersOrAuthorization, "x-auth-token") }
  ];
  let sawAny = false;
  for (const { name, value } of candidates) {
    if (!value) continue;
    sawAny = true;
    const bearer = /^Bearer\s+(\S+)\s*$/i.exec(value);
    if (bearer) {
      return { token: bearer[1], source: `${name}_bearer`, reason: null };
    }
    if (/^Bearer\s*$/i.test(value)) {
      return { token: null, source: name, reason: "bearer_empty" };
    }
    if (!/\s/.test(value)) {
      return { token: value, source: `${name}_raw`, reason: null };
    }
    return { token: null, source: name, reason: "authorization_malformed" };
  }
  return {
    token: null,
    source: null,
    reason: sawAny ? "authorization_malformed" : "missing_credential"
  };
}
function authError(message, reason) {
  const err = new Error(message);
  err.code = reason === "rate_limited" ? "rate_limited" : "unauthorized";
  err.reason = reason;
  return err;
}
async function resolveMcpBearer(db, headersOrAuthorization) {
  const extracted = extractMcpCredential(headersOrAuthorization);
  if (!extracted.token) {
    throw authError("Autenticazione richiesta", extracted.reason || "missing_credential");
  }
  const token = extracted.token;
  if (token.length < MIN_TOKEN_LEN) {
    throw authError("Gettone non valido", "token_too_short");
  }
  const hash = sha256Hex(token);
  const lookupSnap = await db.ref(`mcp_token_lookup/${hash}`).get();
  if (!lookupSnap.exists()) {
    throw authError("Gettone non riconosciuto", "token_not_found");
  }
  const lookup = lookupSnap.val() || {};
  const uid = String(lookup.uid || "").trim();
  const tokenId = String(lookup.tokenId || "").trim();
  if (!uid || !tokenId) {
    throw authError("Gettone non valido", "lookup_incomplete");
  }
  const tokenRef = db.ref(`users/${uid}/mcp_tokens/${tokenId}`);
  const tokenSnap = await tokenRef.get();
  if (!tokenSnap.exists()) {
    throw authError("Gettone revocato o assente", "token_missing");
  }
  const record = tokenSnap.val() || {};
  if (record.revoked === true) {
    throw authError("Gettone revocato", "revoked");
  }
  if (String(record.hash || "") !== hash) {
    throw authError("Gettone non valido", "hash_mismatch");
  }
  const now = Date.now();
  const bucket = hourBucket(now);
  let count = Number(record.requestCountHour) || 0;
  let storedBucket = Number(record.hourBucket);
  if (!Number.isFinite(storedBucket) || storedBucket !== bucket) {
    storedBucket = bucket;
    count = 0;
  }
  if (count >= RATE_LIMIT_PER_HOUR) {
    throw authError("Limite richieste orarie superato", "rate_limited");
  }
  await tokenRef.update({
    lastUsedAt: now,
    hourBucket: storedBucket,
    requestCountHour: count + 1
  });
  return { uid, tokenId, source: extracted.source || "unknown" };
}
function uidLogTag(uid) {
  return sha256Hex(uid).slice(0, 8);
}

// functions/mcp/createServer.js
var import_mcp = require("@modelcontextprotocol/sdk/server/mcp.js");
var z = __toESM(require("zod/v4"));

// functions/mcp/instructions.js
var MCP_INSTRUCTIONS = [
  "Sei collegato a Kentu, diario metabolico personale in sola lettura.",
  "Riporta i numeri restituiti dagli strumenti Kentu cos\xEC come sono: non ricalcolarli, non stimarli e non inventarli.",
  "Un singolo episodio (es. cena salata e risveglio) \xE8 un\u2019ipotesi da verificare, non una prova causale.",
  "Proponi piccoli esperimenti osservabili invece di conclusioni definitive.",
  "Non fare diagnosi mediche e non prescrivere terapie, diete cliniche o farmaci.",
  "Se risvegli per bagno o sete sono frequenti e persistenti, suggerisci di parlarne con un medico.",
  "Se i dati mancano o sono incompleti, dillo chiaramente invece di colmare i buchi.",
  "Se suppressNumbers \xE8 attivo (pattern restrittivo), non citare calorie, peso, grammi, sodio o porzioni.",
  "Usa gli strumenti per ogni fatto quantitativo; non basarti sulla memoria della conversazione per i valori.",
  "Per ragionare su sera e sonno preferisci kentu_get_evenings; per un giorno singolo usa kentu_get_day."
].join(" ");

// functions/mcp/dates.js
var TZ = "Europe/Rome";
function partsInRome(now = /* @__PURE__ */ new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  });
  const bag = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    iso: `${bag.year}-${bag.month}-${bag.day}`,
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    weekday: bag.weekday
    // Mon, Tue, …
  };
}
function addDaysIso(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d) + days * 864e5;
  const dt = new Date(utc);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
var WEEKDAY_TO_OFFSET = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6
};
function mondayOfWeek(iso, weekdayShort) {
  const offset = WEEKDAY_TO_OFFSET[weekdayShort];
  if (offset == null) throw new Error(`weekday sconosciuto: ${weekdayShort}`);
  return addDaysIso(iso, -offset);
}
function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}
function resolveDayRef(ref, now = /* @__PURE__ */ new Date()) {
  const raw = String(ref || "").trim().toLowerCase();
  const { iso } = partsInRome(now);
  if (raw === "today" || raw === "oggi") return { date: iso };
  if (raw === "yesterday" || raw === "ieri") return { date: addDaysIso(iso, -1) };
  if (isIsoDate(ref)) return { date: String(ref).trim() };
  throw new Error(`data non valida: usa today, yesterday o YYYY-MM-DD`);
}
function resolvePeriodRef(kind, now = /* @__PURE__ */ new Date()) {
  const key = String(kind || "").trim().toLowerCase();
  const rome = partsInRome(now);
  const today = rome.iso;
  if (key === "this_week" || key === "last_week") {
    const thisMonday = mondayOfWeek(today, rome.weekday);
    const monday = key === "this_week" ? thisMonday : addDaysIso(thisMonday, -7);
    const sunday = addDaysIso(monday, 6);
    const analysisDate = key === "this_week" ? today : sunday;
    return {
      kind: "week",
      periodId: "settimana",
      analysisDate,
      from: monday,
      to: sunday
    };
  }
  if (key === "this_month" || key === "last_month") {
    let year = rome.year;
    let month = rome.month;
    if (key === "last_month") {
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
    }
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const analysisDate = key === "this_month" ? today : to;
    return {
      kind: "month",
      periodId: "mese",
      analysisDate,
      from,
      to
    };
  }
  throw new Error("periodo non valido: this_week, last_week, this_month, last_month");
}
function todayInRome(now = /* @__PURE__ */ new Date()) {
  return partsInRome(now).iso;
}

// functions/mcp/redact.js
var SENSITIVE_KEY = /^(kcal|cal|calorie|calories|peso|weight|grams|grammi|qta|qty|sodium|na|sodiumMg|fatTotal|prot|carb|fat|fibre|fiber|dinnerKcal|dinnerGrams|dinnerSodiumMg|eveningSodiumMg|liquidsAfter18Ml|alcoholPureG|caffeineMg|caffeineAfter14Mg|ml|pureAlcoholG|abv)$/i;
function redactSensitiveNumbers(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveNumbers(item));
  }
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = null;
      continue;
    }
    out[key] = redactSensitiveNumbers(item);
  }
  return out;
}

// functions/mcp/loadUserContext.js
function emptyCatalogs(personalDb = {}) {
  return {
    personalDb,
    kentuItDb: {},
    globalDb: {},
    offDb: {},
    offReady: false,
    offExcluded: true,
    warnings: []
  };
}
async function loadUserFocusContext(db, uid) {
  const id = String(uid || "").trim();
  if (!id) throw new Error("uid mancante");
  const [
    trackerSnap,
    profileSnap,
    dayStatusSnap,
    checkinSnap,
    forzaSnap
  ] = await Promise.all([
    db.ref(`users/${id}/tracker_data`).get(),
    db.ref(`users/${id}/profile_targets`).get(),
    db.ref(`users/${id}/day_status`).get(),
    db.ref(`users/${id}/movement_checkin`).get(),
    db.ref(`users/${id}/cylinders/forza`).get()
  ]);
  const tracker = trackerSnap.val() && typeof trackerSnap.val() === "object" ? trackerSnap.val() : {};
  const personalDb = tracker.trackerFoodDatabase && typeof tracker.trackerFoodDatabase === "object" ? tracker.trackerFoodDatabase : {};
  const fullHistory = { ...tracker };
  delete fullHistory.trackerFoodDatabase;
  const profile_targets = profileSnap.val() && typeof profileSnap.val() === "object" ? profileSnap.val() : {};
  const userTargets = profile_targets.targets && typeof profile_targets.targets === "object" ? profile_targets.targets : profile_targets.profile || {};
  const warnings = [];
  let catalogs = emptyCatalogs(personalDb);
  try {
    const { loadServerCatalogs: loadServerCatalogs2 } = await Promise.resolve().then(() => (init_loadServerCatalogs(), loadServerCatalogs_exports));
    const loaded = await loadServerCatalogs2();
    catalogs = {
      ...loaded,
      personalDb
    };
    for (const w of loaded.warnings || []) warnings.push(w);
  } catch (error) {
    const msg = String(error?.message || error).slice(0, 160);
    warnings.push(
      `Cataloghi CREA/USDA non caricati (${msg}). Dettaglio pasti/notte dal diario; classificazione cibo limitata al DB personale.`
    );
    console.warn("[kentuMcp] catalogs degrade", msg);
    catalogs = emptyCatalogs(personalDb);
  }
  return {
    today: todayInRome(),
    fullHistory,
    userTargets,
    profile_targets,
    records: dayStatusSnap.val() && typeof dayStatusSnap.val() === "object" ? dayStatusSnap.val() : {},
    movementCheckins: checkinSnap.val() && typeof checkinSnap.val() === "object" ? checkinSnap.val() : {},
    catalogs,
    catalogWarnings: warnings,
    // Abilitata solo se esplicitamente true (nodo boolean o { enabled: true }).
    forzaEnabled: (() => {
      const raw = forzaSnap.val();
      if (raw === true) return true;
      if (raw && typeof raw === "object" && raw.enabled === true) return true;
      return false;
    })(),
    personalDb
  };
}
async function readStoredDayScore(db, uid, date) {
  const snap = await db.ref(`users/${uid}/focus_day_scores/${date}`).get();
  if (!snap.exists()) return null;
  const { decodeDayScoreFromRtdb: decodeDayScoreFromRtdb2 } = await Promise.resolve().then(() => (init_dayScoreRecord(), dayScoreRecord_exports));
  return decodeDayScoreFromRtdb2(snap.val());
}

// functions/mcp/nutrientRead.js
var ANIMAL_NO_FIBRE = /(?:^|[^a-z0-9àèéìòù])(merluzzo|pesce|filett|tonno|salmone|pollo|tacchino|manzo|vitello|maiale|carne|bresaola|prosciutto|speck|wurstel|wudy|salsicc|uovo|uova|egg|formaggio|mozzarella|parmigiano|grana|yogurt\s*greco|ricotta|burrata)(?=[^a-z0-9àèéìòù]|$)/iu;
function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function looksLikeAnimalNoFibre(name) {
  return ANIMAL_NO_FIBRE.test(String(name || ""));
}
function readFibreGrams(entry) {
  if (!entry || typeof entry !== "object") return { value: null, reason: "missing" };
  const totali = finite(entry.fibreTotali);
  const fibre = finite(entry.fibre ?? entry.fiber);
  const name = entry.name || entry.foodName || entry.desc || "";
  let value = null;
  let reason = null;
  if (totali != null) {
    value = totali;
  } else if (fibre != null) {
    value = fibre;
  } else {
    return { value: null, reason: "missing" };
  }
  if (looksLikeAnimalNoFibre(name) && value > 0.05) {
    return { value: null, reason: "animal_fibre_suspicious" };
  }
  if (value < 0) return { value: null, reason: "missing" };
  return { value, reason: null };
}
function readSodiumMg(entry) {
  if (!entry || typeof entry !== "object") return { value: null, reason: "missing" };
  const na = finite(entry.na ?? entry.sodium ?? entry.sodiumMg);
  const sale = finite(entry.sale);
  const fromSale = sale != null && sale > 0 ? Math.round(sale * 393.4 * 10) / 10 : null;
  if (na == null || na === 0) {
    if (fromSale != null) return { value: fromSale, reason: null };
    return { value: null, reason: "missing" };
  }
  if (na > 0 && na < 5) {
    if (fromSale != null && Math.abs(fromSale - na * 1e3) / fromSale < 0.55) {
      return { value: Math.round(na * 1e3 * 10) / 10, reason: null };
    }
    if (fromSale != null) return { value: fromSale, reason: null };
    return { value: Math.round(na * 1e3 * 10) / 10, reason: null };
  }
  if (fromSale != null && na < fromSale * 0.05) {
    return { value: fromSale, reason: null };
  }
  return { value: na, reason: null };
}
function readMacroGrams(entry, key) {
  if (!entry || typeof entry !== "object") return null;
  if (key === "prot") return finite(entry.prot ?? entry.protein ?? entry.proteins);
  if (key === "carb") return finite(entry.carb ?? entry.carbs ?? entry.carbohydrates);
  if (key === "fat") return finite(entry.fat ?? entry.fatTotal ?? entry.fatTot ?? entry.fats);
  return finite(entry[key]);
}

// functions/mcp/dayDetail.js
var DINNER_KEYS = /^(cena|dinner)/i;
var EVENING_HOUR = 18;
var CAFFEINE_AFTER_HOUR = 14;
var MAX_EVENINGS_DAYS = 90;
function trackerNode(fullHistory, date) {
  return fullHistory?.[`trackerStorico_${date}`] || null;
}
function asArray2(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}
function flattenDiaryEntries(node) {
  const out = [];
  for (const entry of asArray2(node?.log || node?.dati?.log)) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.type === "meal" && Array.isArray(entry.items)) {
      for (const item of entry.items) {
        if (!item || typeof item !== "object") continue;
        out.push({
          ...item,
          mealType: item.mealType || entry.mealId || entry.mealType || null,
          mealTime: item.mealTime ?? entry.mealTime ?? null
        });
      }
      continue;
    }
    out.push(entry);
  }
  for (const entry of asArray2(node?.manualNodes)) {
    if (entry && typeof entry === "object") out.push(entry);
  }
  return out;
}
function round1(value) {
  const n = finite(value);
  return n == null ? null : Math.round(n * 10) / 10;
}
function hourOf(entry, mealTimes = null) {
  const direct = finite(entry?.mealTime ?? entry?.time ?? entry?.hour);
  if (direct != null && direct >= 0 && direct <= 24) return direct;
  const slot = String(entry?.mealType || entry?.mealId || "").trim();
  if (slot && mealTimes && mealTimes[slot] != null) {
    const fromMap = finite(mealTimes[slot]);
    if (fromMap != null) return fromMap;
  }
  return null;
}
function isFoodLike(entry) {
  const type = String(entry?.type || "").toLowerCase();
  if (type === "food" || type === "recipe") return true;
  if (type === "water" || type === "alcohol" || type === "sleep" || type === "workout") return false;
  if (entry?.foodName || entry?.kcal != null || entry?.condimentKind) return true;
  return false;
}
function isDinner(entry) {
  const slot = String(entry?.mealType || entry?.mealId || "").trim();
  if (DINNER_KEYS.test(slot)) return true;
  const h = hourOf(entry);
  return h != null && h >= EVENING_HOUR;
}
function buildDayMealsDetail(fullHistory, date) {
  const node = trackerNode(fullHistory, date);
  const mealTimes = node?.mealTimes && typeof node.mealTimes === "object" ? node.mealTimes : {};
  const entries = flattenDiaryEntries(node);
  const meals = [];
  const foodsMissingSodium = [];
  const foodsMissingFibre = [];
  let caffeineMg = 0;
  let caffeineKnown = false;
  for (const entry of entries) {
    if (!isFoodLike(entry)) continue;
    const grams = finite(entry.grams ?? entry.qta ?? entry.weight ?? entry.qty);
    const kcal = finite(entry.kcal ?? entry.cal);
    const prot = readMacroGrams(entry, "prot");
    const carb = readMacroGrams(entry, "carb");
    const fat = readMacroGrams(entry, "fat");
    const fibreRead = readFibreGrams(entry);
    const sodiumRead = readSodiumMg(entry);
    const name = entry.name || entry.foodName || entry.desc || "Alimento";
    const caffeine = finite(entry.caffeineMg);
    if (caffeine != null && caffeine > 0) {
      caffeineMg += caffeine;
      caffeineKnown = true;
    }
    if (sodiumRead.value == null) foodsMissingSodium.push(name);
    if (fibreRead.value == null) foodsMissingFibre.push(name);
    meals.push({
      name,
      mealType: entry.mealType || entry.mealId || null,
      time: hourOf(entry, mealTimes),
      grams,
      kcal,
      prot,
      carb,
      fat,
      fibre: fibreRead.value,
      sodiumMg: sodiumRead.value,
      caffeineMg: caffeine,
      condimentKind: entry.condimentKind || null,
      foodDbKey: entry.foodDbKey || entry.matchedKey || entry.id || null,
      source: entry.source || entry.entrySource || null
    });
  }
  const liquids = [];
  for (const entry of entries) {
    const type = String(entry?.type || "").toLowerCase();
    if (type === "water") {
      liquids.push({
        kind: "water",
        ml: finite(entry.ml),
        time: hourOf(entry)
      });
      continue;
    }
    if (type === "alcohol") {
      liquids.push({
        kind: "alcohol",
        ml: finite(entry.ml),
        abv: finite(entry.abv),
        pureAlcoholG: finite(entry.pureAlcohol),
        kcal: finite(entry.kcal ?? entry.cal),
        time: hourOf(entry),
        subtype: entry.subtype || null
      });
    }
  }
  return {
    meals,
    liquids,
    caffeineMg: caffeineKnown ? round1(caffeineMg) : null,
    coverage: {
      foodsMissingSodium: foodsMissingSodium.slice(0, 12),
      foodsMissingFibre: foodsMissingFibre.slice(0, 12),
      missingSodiumCount: foodsMissingSodium.length,
      missingFibreCount: foodsMissingFibre.length
    }
  };
}
function pickMainSleep(entries) {
  let best = null;
  let bestHours = -1;
  for (const entry of entries) {
    if (String(entry?.type || "").toLowerCase() !== "sleep") continue;
    const hours = finite(entry.hours ?? entry.duration ?? entry.sleepHours) || 0;
    if (hours > bestHours) {
      best = entry;
      bestHours = hours;
    }
  }
  return best;
}
function deriveBedtime(entry) {
  const recorded = finite(entry?.bedtime ?? entry?.sleepStart);
  const wake = finite(entry?.wakeTime ?? entry?.sleepEnd);
  const hours = finite(entry?.hours ?? entry?.duration ?? entry?.sleepHours);
  if (wake != null && hours != null && hours > 0) {
    let derived = wake - hours;
    while (derived < 0) derived += 24;
    while (derived >= 24) derived -= 24;
    if (recorded == null) {
      return { bedtime: round1(derived), bedtimeProvenance: "derived" };
    }
    const delta = Math.min(Math.abs(recorded - derived), 24 - Math.abs(recorded - derived));
    if (delta <= 0.35) {
      return { bedtime: round1(recorded), bedtimeProvenance: "derived" };
    }
    return { bedtime: round1(recorded), bedtimeProvenance: "recorded" };
  }
  if (recorded != null) {
    return { bedtime: round1(recorded), bedtimeProvenance: "recorded" };
  }
  return { bedtime: null, bedtimeProvenance: "missing" };
}
function buildDaySleepDetail(fullHistory, date, options = {}) {
  const storageDate = options.sameDay ? date : addDaysIso(date, 1);
  const node = trackerNode(fullHistory, storageDate);
  const entries = flattenDiaryEntries(node);
  const entry = pickMainSleep(entries);
  if (!entry) {
    return null;
  }
  const { bedtime, bedtimeProvenance } = deriveBedtime(entry);
  const notes = String(entry.notes ?? entry.note ?? entry.details ?? "").trim() || null;
  const quality = finite(entry.quality ?? entry.sleepQuality ?? entry.rating);
  const qualityStars = quality != null && quality >= 1 && quality <= 5 ? Math.round(quality) : null;
  const qualityScore = finite(entry.qualityScore);
  return {
    hours: finite(entry.hours ?? entry.duration ?? entry.sleepHours),
    wakeTime: finite(entry.wakeTime ?? entry.sleepEnd),
    bedtime,
    bedtimeProvenance,
    qualityStars,
    notes,
    deepMin: finite(entry.deepMin),
    remMin: finite(entry.remMin),
    hr: finite(entry.hr),
    qualityScore: qualityScore != null && qualityScore > 5 ? Math.round(qualityScore) : null,
    storageDate
  };
}
function dinnerStats(meals) {
  let kcal = 0;
  let grams = 0;
  let sodiumMg = 0;
  let hasDinner = false;
  for (const meal of meals) {
    if (!isDinner(meal)) continue;
    hasDinner = true;
    if (meal.kcal != null) kcal += meal.kcal;
    if (meal.grams != null) grams += meal.grams;
    if (meal.sodiumMg != null) sodiumMg += meal.sodiumMg;
  }
  if (!hasDinner) return { kcal: null, grams: null, sodiumMg: null };
  return {
    kcal: round1(kcal),
    grams: round1(grams),
    sodiumMg: round1(sodiumMg)
  };
}
function lastMealHour(meals) {
  let last = null;
  for (const meal of meals) {
    const h = finite(meal.time);
    if (h == null) continue;
    if (last == null || h > last) last = h;
  }
  return last;
}
function hoursBeforeSleep(lastMeal, bedtime) {
  if (lastMeal == null || bedtime == null) return null;
  let delta = bedtime - lastMeal;
  if (delta < 0) delta += 24;
  if (delta > 18) return null;
  return round1(delta);
}
function buildEveningRow(fullHistory, date) {
  const detail = buildDayMealsDetail(fullHistory, date);
  const sleep = buildDaySleepDetail(fullHistory, date);
  const dinner = dinnerStats(detail.meals);
  const lastMeal = lastMealHour(detail.meals);
  let liquidsAfter18Ml = 0;
  let alcoholPureG = 0;
  let hasLiquid = false;
  let hasAlcohol = false;
  for (const liq of detail.liquids) {
    const t = finite(liq.time);
    if (liq.kind === "water" && t != null && t >= EVENING_HOUR) {
      hasLiquid = true;
      liquidsAfter18Ml += liq.ml || 0;
    }
    if (liq.kind === "alcohol") {
      hasAlcohol = true;
      alcoholPureG += liq.pureAlcoholG || 0;
    }
  }
  let caffeineAfter14 = 0;
  let caffeineAfter14Known = false;
  for (const meal of detail.meals) {
    const t = finite(meal.time);
    const c = finite(meal.caffeineMg);
    if (c == null || c <= 0) continue;
    if (t != null && t >= CAFFEINE_AFTER_HOUR) {
      caffeineAfter14 += c;
      caffeineAfter14Known = true;
    }
  }
  let eveningSodium = 0;
  let eveningSodiumKnown = false;
  for (const meal of detail.meals) {
    const t = finite(meal.time);
    if (t == null || t < EVENING_HOUR) continue;
    if (meal.sodiumMg != null) {
      eveningSodium += meal.sodiumMg;
      eveningSodiumKnown = true;
    }
  }
  return {
    date,
    lastMealHour: lastMeal,
    hoursBeforeSleep: hoursBeforeSleep(lastMeal, sleep?.bedtime ?? null),
    dinnerKcal: dinner.kcal,
    dinnerGrams: dinner.grams,
    dinnerSodiumMg: dinner.sodiumMg,
    eveningSodiumMg: eveningSodiumKnown ? round1(eveningSodium) : null,
    liquidsAfter18Ml: hasLiquid ? round1(liquidsAfter18Ml) : null,
    alcoholPureG: hasAlcohol ? round1(alcoholPureG) : null,
    caffeineAfter14Mg: caffeineAfter14Known ? round1(caffeineAfter14) : null,
    night: sleep ? {
      hours: sleep.hours,
      qualityStars: sleep.qualityStars,
      notes: sleep.notes,
      bedtime: sleep.bedtime,
      wakeTime: sleep.wakeTime
    } : null
  };
}
function assertEveningsRange(from, to) {
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new Error("from/to devono essere YYYY-MM-DD");
  }
  if (from > to) throw new Error("from non pu\xF2 essere dopo to");
  let days = 0;
  for (let d = from; d <= to; d = addDaysIso(d, 1)) {
    days += 1;
    if (days > MAX_EVENINGS_DAYS) {
      throw new Error(`intervallo massimo ${MAX_EVENINGS_DAYS} giorni`);
    }
  }
  return days;
}
function buildEvenings(fullHistory, from, to) {
  const days = assertEveningsRange(from, to);
  const rows = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) {
    rows.push(buildEveningRow(fullHistory, d));
  }
  return { from, to, days, evenings: rows };
}

// functions/mcp/tools.js
init_workoutMovement();
function summarizeMovement(fullHistory, date) {
  const entries = flattenDiaryEntries(trackerNode(fullHistory, date));
  const byId = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const type = String(entry.type || "").toLowerCase();
    if (type !== "workout" && type !== "cardio" && type !== "activity") continue;
    const id = String(entry.id || `${entry.name || ""}_${entry.time || ""}`);
    const prev = byId.get(id);
    if (!prev || entry.durationMinutes != null && prev.durationMinutes == null) {
      byId.set(id, entry);
    }
  }
  const movement = [];
  for (const entry of byId.values()) {
    const minutes = resolveWorkoutDurationMinutes(entry);
    const kind = classifyWorkoutByType(entry).kind;
    movement.push({
      type: entry.workoutType || entry.subType || entry.type || kind,
      name: entry.name || entry.workoutType || entry.activityType || entry.type,
      durationMinutes: minutes > 0 ? minutes : null,
      kind
    });
  }
  return movement;
}
function scoreContext(base) {
  const forzaOn = base.forzaEnabled === true;
  return {
    today: base.today,
    fullHistory: base.fullHistory,
    // Niente targetKcal/base correnti inventati: resolveDayTargetKcal usa
    // dayTargetSnapshot o targetHistory per la data (dtr-1, no fallback 2000).
    userTargets: base.userTargets,
    profile_targets: base.profile_targets,
    targets: base.profile_targets?.targets || base.userTargets || null,
    records: base.records,
    movementCheckins: base.movementCheckins,
    catalogs: base.catalogs,
    forzaEnabled: forzaOn,
    // computeDayScore.forzaEnabled legge context.cylinders.forza.enabled
    cylinders: {
      forza: { enabled: forzaOn }
    },
    scoreVersion: "kds-5"
  };
}
function pillarSummary(cylinders) {
  if (!cylinders || typeof cylinders !== "object") return null;
  const out = {};
  for (const key of ["alimentazione", "sonno", "movimento", "forza"]) {
    const c = cylinders[key];
    if (!c) continue;
    out[key] = {
      status: c.status ?? null,
      value: c.value ?? null,
      keyFact: c.keyFact ?? null,
      signals: Array.isArray(c.signals) ? c.signals : [],
      ...key === "movimento" && c.battery ? {
        batteryLevel: c.battery.level ?? c.value ?? null,
        batteryCopy: c.battery.copy ?? null
      } : {}
    };
  }
  return out;
}
async function toolGetDay(db, uid, dateRef) {
  const { date } = resolveDayRef(dateRef);
  const base = await loadUserFocusContext(db, uid);
  const ctx = scoreContext(base);
  const { computeDayScore: computeDayScore2 } = await Promise.resolve().then(() => (init_computeDayScore(), computeDayScore_exports));
  const { computeSafety: computeSafety2 } = await Promise.resolve().then(() => (init_computeSafety(), computeSafety_exports));
  const live = computeDayScore2(date, ctx);
  const stored = await readStoredDayScore(db, uid, date);
  const useStored = stored && stored.version === live.version && stored.dataVersion === live.dataVersion;
  const score = useStored ? {
    ...live,
    score: stored.score,
    reliability: stored.reliability,
    cylinders: stored.cylinders,
    source: "rtdb"
  } : { ...live, source: "computed" };
  const safety = computeSafety2(date, ctx);
  const mealsDetail = buildDayMealsDetail(base.fullHistory, date);
  const sleep = buildDaySleepDetail(base.fullHistory, date);
  const missingDiary = !trackerNode(base.fullHistory, date);
  let payload = {
    date,
    missingDiary,
    dayStatus: score.dayStatus ?? null,
    score: score.score,
    reliability: score.reliability,
    version: score.version,
    scoreSource: score.source,
    pillars: pillarSummary(score.cylinders),
    meals: mealsDetail.meals,
    liquids: mealsDetail.liquids,
    caffeineMg: mealsDetail.caffeineMg,
    nutrientCoverage: mealsDetail.coverage,
    sleep,
    movement: summarizeMovement(base.fullHistory, date),
    safety: {
      level: safety.level,
      signals: (safety.signals || []).map((s) => ({
        id: s.id,
        level: s.level,
        area: s.area
      })),
      suppressNumbers: Boolean(safety.suppressNumbers || score.suppressNumbers)
    },
    action: lowestPillarAction(score.cylinders, safety),
    warnings: [...base.catalogWarnings || []]
  };
  if (payload.safety.suppressNumbers) {
    payload = redactSensitiveNumbers(payload);
    payload.safety.suppressNumbers = true;
  }
  return payload;
}
function lowestPillarAction(cylinders, safety) {
  const act = (safety?.signals || []).find((s) => s.level === "act");
  if (act) {
    return { kind: "safety", id: act.id, area: act.area || null };
  }
  const order = ["alimentazione", "sonno", "movimento", "forza"];
  let best = null;
  for (const id of order) {
    const status = cylinders?.[id]?.status ?? null;
    if (status === "inactive" || status === "no_data") continue;
    const value = Number(cylinders?.[id]?.value);
    if (!Number.isFinite(value)) continue;
    if (!best || value < best.value) best = { id, value, status };
  }
  return best ? { kind: "pillar", pillar: best.id, status: best.status, value: best.value } : null;
}
async function toolGetPeriod(db, uid, periodRef) {
  const period = resolvePeriodRef(periodRef);
  const base = await loadUserFocusContext(db, uid);
  const ctx = scoreContext(base);
  const { computePeriodScore: computePeriodScore2 } = await Promise.resolve().then(() => (init_computePeriodScore(), computePeriodScore_exports));
  const { computeSafety: computeSafety2 } = await Promise.resolve().then(() => (init_computeSafety(), computeSafety_exports));
  const { computeDayScore: computeDayScore2 } = await Promise.resolve().then(() => (init_computeDayScore(), computeDayScore_exports));
  const periodScore = computePeriodScore2(period.from, period.to, ctx);
  const anchor = computeDayScore2(period.analysisDate, ctx);
  const safety = computeSafety2(period.analysisDate, ctx);
  const holes = Math.max(0, (periodScore.pastDays || 0) - (periodScore.eligibleDays || 0));
  let payload = {
    kind: period.kind,
    periodId: period.periodId,
    from: periodScore.from,
    to: periodScore.to,
    analysisDate: period.analysisDate,
    score: periodScore.score,
    coverage: periodScore.coverage,
    pastDays: periodScore.pastDays,
    eligibleDays: periodScore.eligibleDays,
    holes,
    longestStreak: periodScore.longestStreak,
    streaks: periodScore.streaks,
    reliability: periodScore.coverage != null && periodScore.coverage < 0.6 ? "low" : "high",
    pillars: pillarSummary(anchor.cylinders),
    safety: {
      level: safety.level,
      signals: (safety.signals || []).map((s) => ({
        id: s.id,
        level: s.level,
        area: s.area
      })),
      suppressNumbers: Boolean(safety.suppressNumbers)
    },
    action: lowestPillarAction(anchor.cylinders, safety)
  };
  if (payload.safety.suppressNumbers) {
    payload = redactSensitiveNumbers(payload);
    payload.safety.suppressNumbers = true;
  }
  return payload;
}
async function toolGetEvenings(db, uid, range) {
  const from = String(range?.from || "").trim();
  const to = String(range?.to || "").trim();
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new Error("from e to devono essere YYYY-MM-DD");
  }
  const base = await loadUserFocusContext(db, uid);
  const payload = buildEvenings(base.fullHistory, from, to);
  const { computeSafety: computeSafety2 } = await Promise.resolve().then(() => (init_computeSafety(), computeSafety_exports));
  const ctx = scoreContext(base);
  let suppress = false;
  for (const row of payload.evenings) {
    const safety = computeSafety2(row.date, ctx);
    if (safety?.suppressNumbers) {
      suppress = true;
      break;
    }
  }
  let out = {
    ...payload,
    suppressNumbers: suppress,
    warnings: [...base.catalogWarnings || []]
  };
  if (suppress) {
    out = redactSensitiveNumbers(out);
    out.suppressNumbers = true;
  }
  return out;
}
async function toolSearchFood(db, uid, query) {
  const q = String(query || "").trim();
  if (q.length < 2) {
    return { query: q, results: [], note: "Digita almeno 2 caratteri." };
  }
  const base = await loadUserFocusContext(db, uid);
  const { searchFoodsDetailed: searchFoodsDetailed2 } = await Promise.resolve().then(() => (init_foodSearch(), foodSearch_exports));
  const { annotateCandidatesMatchQuality: annotateCandidatesMatchQuality2 } = await Promise.resolve().then(() => (init_foodMatchQuality(), foodMatchQuality_exports));
  const foodDb = {
    ...base.catalogs?.globalDb || {},
    ...base.catalogs?.offDb || {},
    ...base.catalogs?.kentuItDb || {},
    ...base.personalDb || {}
  };
  const hits = searchFoodsDetailed2(foodDb, q, { limit: 12 });
  const annotated = annotateCandidatesMatchQuality2(q, hits);
  return {
    query: q,
    warnings: [...base.catalogWarnings || []],
    results: (annotated || []).slice(0, 12).map((hit) => ({
      name: hit.name || hit.desc || hit.label || null,
      matchQuality: hit.matchQuality || null,
      kcal100: hit.kcal ?? hit.calories ?? null,
      source: hit.source || hit._source || null,
      id: hit.id || hit.key || hit.foodDbKey || null
    }))
  };
}

// functions/mcp/createServer.js
function createKentuMcpServer({ uid, db }) {
  const server = new import_mcp.McpServer(
    {
      name: "kentu",
      version: "1.0.0"
    },
    {
      instructions: MCP_INSTRUCTIONS
    }
  );
  server.registerTool(
    "kentu_get_day",
    {
      description: 'Legge un giorno Kentu (kds-5): pilastri, pasti dettagliati (orario, grammi, kcal, P/C/F, fibre, sodio), liquidi/alcol con orario, caffeina se presente, notte (letto, sveglia, durata, stelle, note), salvavita e azione. Parametro date: "today", "yesterday" oppure YYYY-MM-DD (Europe/Rome). Sola lettura.',
      inputSchema: {
        date: z.string().describe("today | yesterday | YYYY-MM-DD")
      }
    },
    async ({ date }) => {
      const payload = await toolGetDay(db, uid, date);
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }]
      };
    }
  );
  server.registerTool(
    "kentu_get_evenings",
    {
      description: "Serie compatta sera\u2192notte (max 90 giorni): ultimo pasto, ore prima del sonno, cena (kcal/grammi), sodio serale, liquidi dopo le 18, alcol, caffeina dopo le 14, esito notte (durata, stelle, note). from/to in YYYY-MM-DD (Europe/Rome). Sola lettura. Un episodio \xE8 un\u2019ipotesi, non una prova.",
      inputSchema: {
        from: z.string().describe("YYYY-MM-DD inizio (incluso)"),
        to: z.string().describe("YYYY-MM-DD fine (incluso)")
      }
    },
    async ({ from, to }) => {
      const payload = await toolGetEvenings(db, uid, { from, to });
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }]
      };
    }
  );
  server.registerTool(
    "kentu_get_period",
    {
      description: "Aggregati Focus su una settimana o un mese: copertura, pilastri, scie/buchi, salvavita e azione. Parametro period: this_week | last_week | this_month | last_month (Europe/Rome). Sola lettura.",
      inputSchema: {
        period: z.string().describe("this_week | last_week | this_month | last_month")
      }
    },
    async ({ period }) => {
      const payload = await toolGetPeriod(db, uid, period);
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }]
      };
    }
  );
  server.registerTool(
    "kentu_search_food",
    {
      description: "Cerca alimenti nei cataloghi Kentu e nel DB personale. Restituisce nome, matchQuality e kcal/100g. Sola lettura.",
      inputSchema: {
        query: z.string().describe("Testo di ricerca (almeno 2 caratteri)")
      }
    },
    async ({ query }) => {
      const payload = await toolSearchFood(db, uid, query);
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }]
      };
    }
  );
  return server;
}

// functions/mcp/httpHandler.js
function denyCors(res) {
  res.setHeader("Vary", "Origin");
  res.removeHeader("Access-Control-Allow-Origin");
}
function jsonRpcError(res, status, code, message) {
  if (res.headersSent) return;
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null
  });
}
function requestPath(req) {
  try {
    return String(req.path || req.url || "/").split("?")[0];
  } catch {
    return "/";
  }
}
function parseBody(raw) {
  if (raw == null || raw === "") return void 0;
  if (Buffer.isBuffer(raw)) {
    const text = raw.toString("utf8").trim();
    if (!text) return void 0;
    return JSON.parse(text);
  }
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return void 0;
    return JSON.parse(text);
  }
  return raw;
}
async function handleKentuMcpHttp(req, res, { db }) {
  const t0 = Date.now();
  const method = String(req.method || "GET").toUpperCase();
  const path3 = requestPath(req);
  denyCors(res);
  if (method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.status(204).end();
    return;
  }
  if (method === "GET") {
    console.info("[kentuMcp]", JSON.stringify({
      method,
      path: path3,
      status: 405,
      ms: Date.now() - t0,
      reason: "sse_not_supported"
    }));
    res.setHeader("Allow", "POST, OPTIONS");
    jsonRpcError(res, 405, -32e3, "Method Not Allowed");
    return;
  }
  if (method !== "POST") {
    console.info("[kentuMcp]", JSON.stringify({
      method,
      path: path3,
      status: 405,
      ms: Date.now() - t0,
      reason: "method_not_allowed"
    }));
    res.setHeader("Allow", "POST, OPTIONS");
    jsonRpcError(res, 405, -32e3, "Method Not Allowed");
    return;
  }
  if (req.query && (req.query.token || req.query.access_token || req.query.key)) {
    jsonRpcError(res, 400, -32600, "Il gettone non pu\xF2 essere passato in query string");
    return;
  }
  let auth;
  try {
    auth = await resolveMcpBearer(db, req.headers);
  } catch (error) {
    const status = error?.code === "rate_limited" ? 429 : 401;
    console.info("[kentuMcp]", JSON.stringify({
      method,
      path: path3,
      status,
      ms: Date.now() - t0,
      reason: error?.reason || error?.code || "unauthorized"
    }));
    jsonRpcError(res, status, -32001, error?.message || "Non autorizzato");
    return;
  }
  let parsedBody;
  try {
    parsedBody = parseBody(req.body);
  } catch {
    console.info("[kentuMcp]", JSON.stringify({
      method,
      path: path3,
      status: 400,
      ms: Date.now() - t0,
      reason: "invalid_json_body",
      uid: uidLogTag(auth.uid)
    }));
    jsonRpcError(res, 400, -32700, "Parse error");
    return;
  }
  const server = createKentuMcpServer({ uid: auth.uid, db });
  const transport = new import_streamableHttp.StreamableHTTPServerTransport({
    sessionIdGenerator: void 0,
    // JSON response mode: adatto a Cloud Functions (niente SSE lungo).
    enableJsonResponse: true
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
    console.info("[kentuMcp]", JSON.stringify({
      uid: uidLogTag(auth.uid),
      method,
      path: path3,
      status: res.statusCode || 200,
      ms: Date.now() - t0,
      authSource: auth.source
    }));
  } catch (error) {
    console.error("[kentuMcp]", JSON.stringify({
      uid: uidLogTag(auth.uid),
      method,
      path: path3,
      status: 500,
      ms: Date.now() - t0,
      err: String(error?.message || error).slice(0, 120)
    }));
    jsonRpcError(res, 500, -32603, "Errore interno MCP");
  } finally {
    try {
      await transport.close();
    } catch {
    }
    try {
      await server.close();
    } catch {
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handleKentuMcpHttp
});
//# sourceMappingURL=mcpHttp.cjs.map
