/**
 * Genera food_aliases.json: chiave = name CREA esatto, valore = 2–3 sinonimi in italiano colloquiale.
 * Euristiche + piccolo dizionario di varianti; nessuna API esterna.
 */
const fs = require('fs');
const path = require('path');

const litePath = path.join(__dirname, '../src/data/crea_foods_lite.json');
const outPath = path.join(__dirname, 'food_aliases.json');

const foods = JSON.parse(fs.readFileSync(litePath, 'utf8'));

/** Normalizza per confronti */
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Rimuovi ripetizioni e sinonimi troppo simili al nome ufficiale */
function uniqueEnough(nameOfficial, list) {
  const no = norm(nameOfficial);
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const n = norm(x);
    if (!n || n.length < 2) continue;
    if (n === no) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(x.trim());
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * Sinonimi da segmento principale (prima virgola) + code.
 */
function buildAliases(entry) {
  const name = entry.name;
  const category = entry.category || '';
  const parts = name.split(',').map((s) => s.trim()).filter(Boolean);
  const head = parts[0] || name;
  const tail = parts.slice(1).join(', ');

  const candidates = [];

  // "A o B" / "A e B" → prima alternativa come nome comune
  const orMatch = head.match(/^(.+?)\s+o\s+(.+)$/i);
  if (orMatch) {
    candidates.push(orMatch[1].trim());
    candidates.push(orMatch[2].trim());
  }
  const eMatch = head.match(/^(.+?)\s+e\s+(.+)$/i);
  if (eMatch && !orMatch) {
    candidates.push(eMatch[1].trim());
    candidates.push(eMatch[2].trim());
  }

  // Prime 1–2 parole del head (ricerca tipo "pollo", "riso basmati")
  const hw = head.split(/\s+/);
  if (hw.length >= 2) {
    candidates.push(`${hw[0]} ${hw[1]}`.toLowerCase());
  }
  if (hw.length >= 1 && hw[0].length > 3) {
    candidates.push(hw[0].toLowerCase());
  }

  // Head intero minuscolo (linguaggio elenco)
  if (head.length <= 55) {
    candidates.push(head.toLowerCase());
  }

  // Combinazioni con cottura dal tail (linguaggio comune)
  if (tail) {
    const t = tail.toLowerCase();
    const shortHead = hw.slice(0, 2).join(' ');
    if (t.includes('bollit') || t.includes('less')) {
      candidates.push(`${shortHead} lesso`.toLowerCase());
    }
    if (t.includes('forno') || t.includes('al forno')) {
      candidates.push(`${shortHead} al forno`.toLowerCase());
    }
    if (t.includes('crud')) {
      candidates.push(`${shortHead} crudo`.toLowerCase());
    }
    if (t.includes('cott') && !t.includes('micro')) {
      candidates.push(`${shortHead} cotto`.toLowerCase());
    }
    if (t.includes('padella') || t.includes('tegamino')) {
      candidates.push(`${shortHead} in padella`.toLowerCase());
    }
    if (t.includes('micro')) {
      candidates.push(`${shortHead} al microonde`.toLowerCase());
    }
  }

  // Suggerimenti per categoria
  if (category.includes('Cereali')) {
    if (/riso/i.test(head)) candidates.push('riso cotto', 'riso in bianco');
    if (/pasta|paste|spaghetti|penne|fusilli/i.test(head)) candidates.push('pasta', 'paste');
    if (/farro/i.test(head)) candidates.push('farro', 'grano farro');
    if (/orzo/i.test(head)) candidates.push('orzo perlato', 'orzo');
    if (/couscous|cous/i.test(head)) candidates.push('cous cous', 'cuscus');
    if (/quinoa/i.test(head)) candidates.push('quinoa');
    if (/avena/i.test(head)) candidates.push('fiocchi avena', 'avena');
  }
  if (category.includes('Carne') || category.includes('Pollame') || /bovino|suino|ovino|pollame|tacchino|coniglio/i.test(head)) {
    if (/pollo|gallina/i.test(head)) candidates.push('pollo', 'petto pollo');
    if (/manzo|bovino|vitellone|vitello/i.test(head)) candidates.push('manzo', 'carne manzo');
    if (/maiale|suino/i.test(head)) candidates.push('maiale', 'carne suino');
    if (/tacchino/i.test(head)) candidates.push('tacchino', 'petto tacchino');
  }
  if (category.includes('Pesce') || /pesce|merluzzo|salmone|tonno|acciuga|gamber/i.test(head)) {
    candidates.push('pesce', 'filetto');
  }
  if (category.includes('Latte') || /latte|yogurt|formaggio|mozzarella|ricotta/i.test(head)) {
    if (/latte/i.test(head)) candidates.push('latte intero', 'latte fresco');
    if (/yogurt/i.test(head)) candidates.push('yogurt', 'yaourt');
  }
  if (category.includes('Verdure') || category.includes('Ortaggi') || /insalata|pomodoro|zucchina|melanzana/i.test(head)) {
    if (/pomodoro/i.test(head)) candidates.push('pomodori', 'pelati');
    if (/patate/i.test(head)) candidates.push('patate', 'patata');
  }
  if (category.includes('Frutta') || /mela|pera|banana|arancia|uva/i.test(head)) {
    if (/mela/i.test(head)) candidates.push('mele', 'mela');
  }
  if (/olio|oliva/i.test(head)) {
    candidates.push('olio evo', 'olio d\'oliva');
  }
  if (/uovo|uova/i.test(head)) {
    candidates.push('uova', 'uovo');
  }

  // Pulizia candidati: stringa troppo lunga → accorcia
  const cleaned = candidates
    .map((c) => String(c).replace(/\s+/g, ' ').trim())
    .filter((c) => c.length >= 2 && c.length <= 80);

  return uniqueEnough(name, cleaned);
}

function main() {
  const out = {};
  let withAliases = 0;
  for (const entry of foods) {
    const name = entry.name;
    if (!name) continue;
    const aliases = buildAliases(entry);
    if (aliases.length >= 2) {
      out[name] = aliases.slice(0, 3);
      withAliases++;
    } else if (aliases.length === 1) {
      // Aggiungi varianti generiche per arrivare a 2
      const parts = name.split(',').map((s) => s.trim());
      const h = parts[0] || name;
      const extra = [];
      if (h.split(/\s+/).length >= 2) {
        extra.push(h.split(/\s+/).slice(0, 2).join(' ').toLowerCase());
      }
      extra.push(h.toLowerCase());
      out[name] = uniqueEnough(name, [...aliases, ...extra]).slice(0, 3);
      if (out[name].length >= 2) withAliases++;
    } else {
      // Fallback minimo: prime parole + minuscolo
      const parts = name.split(',').map((s) => s.trim());
      const h = parts[0] || name;
      const w = h.split(/\s+/);
      const fb = uniqueEnough(name, [
        w.length >= 2 ? `${w[0]} ${w[1]}`.toLowerCase() : h.toLowerCase(),
        h.toLowerCase(),
        w[0].length > 3 ? w[0].toLowerCase() : `${h}`.toLowerCase(),
      ]);
      if (fb.length >= 2) {
        out[name] = fb.slice(0, 3);
        withAliases++;
      }
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Scritto ${outPath}`);
  console.log(`Chiavi: ${Object.keys(out).length} / ${foods.length} (con >=2 sinonimi utili)`);
}

main();
