# I4-E — Criterio notte principale

Implementazione: `normalize/resolveMainNightSleep.js` (usata da `normalizeSleepNight`).

## Fonti

- Solo `log` entries `type === 'sleep'` sul giorno di **storage** (`publicationDate`).
- **Non** usa `sleep_logs` legacy.
- Writer del diario **non** modificati.

## Passi

1. Filtra sleep dal log.
2. **Dedup per `id`**: prevale l’ultima occorrenza (timestamp `updatedAt`/`ts`/`createdAt` se attendibili; altrimenti ordine array = correzione tardiva).
3. Classifica:
   - **notte** se ore ≥ `NIGHT_SLEEP_MIN_HOURS` (3), allineato a coreEngine senza importarlo;
   - altrimenti **nap** (non compete).
4. 0 notti → `absent` o `only_naps` → nessuna notte principale.
5. 1 notte → `selected`.
6. ≥2 notti:
   - se una sola ha timeline affidabile (bedtime+wake, o wake+duration) e il gap ore è &lt; 1h → preferisci quella;
   - se gap ore ≥ `HOURS_CLEAR_GAP` (1h) → seleziona la più lunga;
   - altrimenti → **`ambiguous`** (entry `null`, non inventare certezza).

## Gate pubblicazione (pipeline)

`runFocusEditionPipeline` con `requireSleep` (default true):

- `sleep_required` / `sleep_ambiguous` → **nessuna** pubblicazione.
- Bypass solo se `explicitRegen && allowPublishWithoutSleep` (documentato in report notes).
