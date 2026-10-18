# I4-C — Assunzioni I4-B vs garanzie RTDB

## Cosa MemoryFocusPersistence garantisce solo in-process

| Invariante | Memory | RTDB reale |
|------------|--------|------------|
| Mutex `withLock` su job | Promise chain locale | **Non esiste** → serve `transaction` |
| Create-only revisione | `Map.has` | **Transaction** create-only (abort se esiste) |
| Publish atomico meta+index+job | stesso tick del lock | **`update()` multi-path** (una sola scrittura atomica) |
| Owner/lease al commit | check sotto lock | Transaction → `committing`, poi multi-path; **oppure** fail + repair |
| Lease TTL da solo | non modellato come sufficiente | **Non sufficiente** anche su RTDB |

## Gap da colmare nell’adapter Admin

1. Due Cloud Functions isolate non condividono il mutex in-memory.
2. Una sequenza `set(meta); set(archive); set(job)` **non** è atomica: un client può leggere meta senza archive (o viceversa).
3. `transaction` opera su **un** nodo: non può da sola scrivere meta+archive+job; il commit usa `update()` multi-path dopo un gate transazionale su `jobs/{date}`.
4. Finestra crash: job in `committing` / `succeeded` senza meta → richiede `repairPublishPointers` / ripresa orchestratore.
5. RTDB non ha row-level “IF NOT EXISTS” fuori da transaction.

## Cosa RTDB garantisce (usato da AdminRtdbFocusPersistence)

- `transaction` su `jobs/{publicationDate}` → claim / owner / lease / gate `committing`
- `transaction` su `editions/.../rev/{n}` → create-only
- `update()` multi-path → meta + archive_index + campi job (stesso commit)
- `transaction` su `editorial_memory` → idempotenza `lastAppliedEdition`

## Nota emulator/Admin (verifica I4-C)

Il primo pulse di `transaction` può essere `null` anche se il nodo esiste.
Abortire su quel pulse impedisce il retry. Per gli update (`updateJobIfOwner`,
publish gate, memory) l’adapter usa `prime: true` (get + coalescing) con
`applyLocally=false`, così il protocollo ritenta con i dati server.
