# P3.4.1 — Comando Console anteprima (eseguire solo dopo approvazione)

Date: `analysisDate=2026-10-17`, `publicationDate=2026-10-18`, `horizon=d30`.

Moduli Vite: `/src/features/kentuFocus/preview/runFocusLocalPreview.js`, `renderFocusPreviewSafe.js`.

Timeout: blocca **nuove** letture; non annulla la `get()` già avviata (`timeoutCancelsInFlightGet: false`).

Report Console: solo codici (`rtdb_timeout`, `rtdb_read_failed`, `unhandled`, …) — mai `err.message`.

**STOP:** non eseguire finché non arriva autorizzazione esplicita alle letture (max 63).
