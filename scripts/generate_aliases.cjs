/**
 * Genera sinonimi italiani colloquiali per gli alimenti CREA via OpenAI, a batch.
 * Riprende da food_aliases.json (chiavi già presenti = saltate).
 * Richiede: OPENAI_API_KEY nell'ambiente.
 */
const fs = require('fs');
const path = require('path');

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const ROOT = path.join(__dirname);
const LITE_PATH = path.join(ROOT, '../src/data/crea_foods_lite.json');
const ALIASES_PATH = path.join(ROOT, 'food_aliases.json');

/** Quanti alimenti per richiesta (abbassa se superi i rate limit). */
const BATCH_SIZE = 12;

async function callOpenAIForBatch(names) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('Imposta OPENAI_API_KEY nell’ambiente (es. PowerShell: $env:OPENAI_API_KEY="sk-..." )');
  }

  const prompt = `Sei un nutrizionista italiano. Per ogni nome ufficiale CREA (chiave esatta), proponi 2 o 3 sinonimi o modi in cui un utente italiano potrebbe cercarlo in linguaggio comune (non ripetere il nome ufficiale).
Regole:
- Solo italiano, minuscolo dove ha senso, niente spiegazioni.
- Array di 2-3 stringhe per chiave.
- Le chiavi nell'output JSON devono essere IDENTICHE alle stringhe fornite (carattere per carattere).

Nomi da processare (JSON array):
${JSON.stringify(names, null, 0)}

Rispondi SOLO con un oggetto JSON: chiavi = nomi ufficiali esatti, valori = array di 2-3 sinonimi.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Rispondi solo con JSON valido. Chiavi = nomi alimenti esatti forniti dall’utente. Valori = array di 2-3 sinonimi italiani.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${t.slice(0, 500)}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Risposta OpenAI vuota');
  const parsed = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('JSON non oggetto');
  return parsed;
}

function loadExistingAliases() {
  if (!fs.existsSync(ALIASES_PATH)) return {};
  try {
    const txt = fs.readFileSync(ALIASES_PATH, 'utf8');
    const j = JSON.parse(txt);
    return typeof j === 'object' && j !== null && !Array.isArray(j) ? j : {};
  } catch {
    return {};
  }
}

function saveAliases(obj) {
  fs.writeFileSync(ALIASES_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

async function main() {
  const lite = JSON.parse(fs.readFileSync(LITE_PATH, 'utf8'));
  if (!Array.isArray(lite)) {
    console.error('crea_foods_lite.json non è un array');
    process.exit(1);
  }

  let existingAliases = loadExistingAliases();
  const allNames = lite.map((e) => e.name).filter(Boolean);
  const total = allNames.length;

  const pending = allNames.filter((n) => !Object.prototype.hasOwnProperty.call(existingAliases, n));

  console.log(`Totale alimenti nel lite: ${total}`);
  console.log(`Già in food_aliases.json: ${total - pending.length}`);
  console.log(`Da generare: ${pending.length}`);

  if (pending.length === 0) {
    console.log('Niente da fare. Uscita.');
    return;
  }

  const batches = [];
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    batches.push(pending.slice(i, i + BATCH_SIZE));
  }

  let batchIndex = 0;
  for (const batch of batches) {
    batchIndex += 1;
    const remainingBefore = pending.filter(
      (n) => !Object.prototype.hasOwnProperty.call(existingAliases, n)
    ).length;
    console.log(
      `\nBatch ${batchIndex}/${batches.length}: ${batch.length} nomi — ancora da fare (prima di questo batch): ${remainingBefore}`
    );

    try {
      const chunk = await callOpenAIForBatch(batch);
      let added = 0;
      for (const name of batch) {
        const arr = chunk[name];
        if (Array.isArray(arr) && arr.length >= 2) {
          existingAliases[name] = arr
            .map((s) => String(s).trim())
            .filter(Boolean)
            .slice(0, 3);
          added += 1;
        } else if (Array.isArray(arr) && arr.length === 1) {
          existingAliases[name] = [arr[0], arr[0]];
          added += 1;
        }
      }
      saveAliases(existingAliases);
      const stillTodo = pending.filter((n) => !Object.prototype.hasOwnProperty.call(existingAliases, n)).length;
      console.log(
        `Salvato. Aggiunti/aggiornati in questo batch: ${added}. Totale chiavi nel file: ${Object.keys(existingAliases).length}. Restano da generare: ${stillTodo}`
      );
    } catch (err) {
      console.error('Errore batch:', err.message || err);
      console.error('Ultimo stato salvato in food_aliases.json — rilancia lo script per riprendere.');
      process.exit(1);
    }

    if (batchIndex < batches.length) {
      console.log('Pausa 5s per rate limit...');
      await delay(5000);
    }
  }

  const stillMissing = allNames.filter((n) => !Object.prototype.hasOwnProperty.call(existingAliases, n));
  console.log(`\nFatto. Chiavi totali: ${Object.keys(existingAliases).length}. Ancora senza alias: ${stillMissing.length}`);
  if (stillMissing.length) {
    console.log('(Riesegui lo script o controlla batch falliti per i nomi mancanti.)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
