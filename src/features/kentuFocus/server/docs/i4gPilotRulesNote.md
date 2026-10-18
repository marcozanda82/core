# I4-G — Regole RTDB `kentu_focus`

## Stato

- Blocco `kentu_focus` aggiunto a `database.rules.json` (file locale repo).
- Specchio di verifica emulator: `database.rules.focus.local.json` (invariato nella sostanza).
- **Nessun deploy delle regole eseguito in I4-G.**

## Garanzie

- Write client: negato su tutto `kentu_focus`.
- Read: solo owner su `meta`, `rev/{currentRevision}`, `archive_index`.
- Parent `editions/$date`, `jobs`, `dossiers`, `editorial_memory`: `.read: false`.
- Nessuna lettura anonima.

## Deploy (richiede approvazione)

```bash
# NON eseguire senza approvazione esplicita
firebase deploy --only database
```
