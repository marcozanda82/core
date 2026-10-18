# P2 — Script ultima notte (esecuzione nel tuo PowerShell)

Lo script **non** va lanciato dal processo agent. Usalo nella PowerShell dove hai già `FOCUS_PILOT_UID`.

File: `scripts/focusPilotFindLastNight.mjs`

## 1) Ottenere un ID token (app Kentu, Auth modulare)

Con `npm run dev` e account già loggato, apri DevTools → Console:

```js
const { auth } = await import('/src/firebaseConfig.js');
const user = auth.currentUser;
if (!user) throw new Error('non autenticato');
const token = await user.getIdToken(/* forceRefresh */ true);
await navigator.clipboard.writeText(token);
console.log('ID token copiato negli appunti (lunghezza)', token.length);
```

- Non incollare il token in chat.
- Non salvarlo in file del repo.
- Il token scade (~1 h): usalo subito.

## 2) Trasferirlo alla stessa PowerShell (solo Process)

Nella PowerShell del pilota (dove `FOCUS_PILOT_UID` è già impostato):

```powershell
# Token solo in memoria di processo — da clipboard, non da file
$env:FOCUS_ID_TOKEN = (Get-Clipboard).Trim()

# Opzionale: allinea allowlist di sessione (solo Process)
$env:FOCUS_ADMIN_ALLOWED_UIDS = $env:FOCUS_PILOT_UID

# Verifica presenza senza stampare valori
if (-not $env:FOCUS_PILOT_UID) { throw 'FOCUS_PILOT_UID mancante' }
if (-not $env:FOCUS_ID_TOKEN) { throw 'FOCUS_ID_TOKEN mancante' }
'env_ready uid_len=' + $env:FOCUS_PILOT_UID.Length + ' token_len=' + $env:FOCUS_ID_TOKEN.Length
```

## 3) Eseguire la ricerca (sola lettura)

```powershell
cd C:\Users\marco\Desktop\GhostApp
node scripts/focusPilotFindLastNight.mjs
```

Atteso: JSON con `subject` mascherato, `publicationDate`, `analysisDate`, `nightStatus`, `reads`, `writes: 0`.

## 4) Pulizia immediata

```powershell
Remove-Item Env:FOCUS_ID_TOKEN -ErrorAction SilentlyContinue
# opzionale: svuota clipboard
Set-Clipboard -Value ''
```

## Cosa rifiuta lo script

- `GOOGLE_APPLICATION_CREDENTIALS` / `FIREBASE_TOKEN` (Admin/CLI)
- Emulator host impostato
- Project ≠ `mio-tracker` o database URL diverso da quello autorizzato
- Token assente o passato in argv

## Dopo il report

Incolla in chat **solo** l’output JSON dello script (già senza UID/token/diario), oppure scrivi «P2 eseguito» e i campi data/esito.
