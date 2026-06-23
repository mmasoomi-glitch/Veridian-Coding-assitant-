# Veridian — Windows App (Edge WebView2 app-mode)

A lightweight, native-feeling Windows wrapper for the Veridian web app. **No Electron, no
Rust, no extra runtime** — it reuses the Microsoft Edge engine already installed on Windows
via Edge's `--app=` (app-mode) flag, which opens a chromeless, single-purpose window that
looks and behaves like its own desktop application.

## Files

| File | Purpose |
|------|---------|
| `veridian.ico` | Multi-resolution app icon (16/32/48/64/128/256 px) generated from `Mira logo.png`. |
| `launch-veridian.cmd` | Starts the Veridian server (if needed) and opens the Edge app window. |
| `install-shortcut.ps1` | Creates the Desktop + Start Menu "Veridian" shortcuts. |
| `README.md` | This file. |

## How it works

1. **Launcher** (`launch-veridian.cmd`):
   - Checks whether port **3000** is already `LISTENING` (via `netstat`).
   - If not, it sets `VERIDIAN_WATCH_DIR` and `TELEMETRY_POLL_MS=30000`, then starts the dev
     server in a **minimized/hidden** console: `start "" /min cmd /c "... npm run dev"`
     from `C:\Users\HI\veridian`.
   - Waits up to ~30 seconds for the port to come up (polling `netstat`).
   - Opens the chromeless window:
     ```
     msedge --app=http://localhost:3000 --window-size=1400,900 --user-data-dir="%LOCALAPPDATA%\VeridianApp"
     ```
   - `--app=` removes the address bar/tabs (native-looking window). `--user-data-dir`
     isolates the profile so Veridian behaves as its own app (own history, own taskbar
     grouping) and does not disturb your normal Edge browser.
   - It is **idempotent**: if the server is already running (e.g. started elsewhere), it
     skips startup and just opens the window. If Edge is in the default install location it
     uses the full path; otherwise it falls back to `msedge` on `PATH`.

2. **Shortcuts** (`install-shortcut.ps1`):
   - Uses a `WScript.Shell` COM object to write two `.lnk` files named **Veridian**:
     - Desktop: `%USERPROFILE%\Desktop\Veridian.lnk`
     - Start Menu: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Veridian.lnk`
   - Each shortcut: **Target** = `launch-veridian.cmd`, **Working dir** = the veridian
     folder, **Icon** = `veridian.ico`, window style = minimized (so the launcher console
     does not steal focus).

## Install

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\HI\veridian\windows-app\install-shortcut.ps1"
```

Then double-click **Veridian** on the Desktop or find it in the Start Menu.

## Uninstall

Just delete the two shortcuts (the app itself is only these scripts — nothing is installed
into the system):

```powershell
Remove-Item "$([Environment]::GetFolderPath('Desktop'))\Veridian.lnk" -Force
Remove-Item "$([Environment]::GetFolderPath('Programs'))\Veridian.lnk" -Force
```

Optionally remove the isolated Edge profile created on first launch:

```powershell
Remove-Item "$env:LOCALAPPDATA\VeridianApp" -Recurse -Force
```

The `windows-app` folder can be deleted entirely to remove everything.

## Notes / troubleshooting

- **Port:** Veridian must serve on `http://localhost:3000` (the `npm run dev` default). If
  the port is busy with something else, the window will open against whatever is on 3000.
- **Server window:** the dev server runs in a separate minimized console. Closing the Edge
  app window does **not** stop the server; close that console (or leave it running for next
  launch).
- **Icon not updating:** Windows caches icons. If the old icon lingers, sign out/in or clear
  the icon cache.
- **Rebuild the icon** from a new source PNG:
  ```powershell
  # see the System.Drawing snippet used to generate veridian.ico (multi-size PNG-encoded ICO)
  ```
