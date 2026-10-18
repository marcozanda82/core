# I4-C — Ambiente di verifica

## Java (emulatori) — RISOLTO in sessione

- PATH di sistema: Java 8 (insufficiente).
- Usato per la sessione (non permanente):
  `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr` → **OpenJDK 21.0.10**
- Comando:
  ```powershell
  $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
  $env:PATH = "$env:JAVA_HOME\bin;" + $env:PATH
  npm run test:focus:i4c
  ```

## Node 20 (smoke Functions) — VERIFICATO (opzione B)

- PATH di progetto resta **Node v24.15.0**.
- Portatile (fuori repo, no PATH permanente):
  `C:\Users\marco\AppData\Local\node-v20.19.5\node-v20.19.5-win-x64\node.exe`
- Versione: **v20.19.5** (SHA256 verificato vs `SHASUMS256.txt` ufficiale nodejs.org).
- Smoke: `node20 functions/smokeFocusPackage.cjs` → `SMOKE_OK { node: 'v20.19.5', ... }`.
