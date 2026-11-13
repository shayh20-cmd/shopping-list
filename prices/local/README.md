# Price loader on a home computer

Victory and Carrefour (with Yeinot Bitan and Quik) block GitHub's servers, so the GitHub
workflow never loads them. This folder runs the same loader (`prices/load.py` from `main`)
on a computer in Israel, where they load.

- `install-task.ps1` — run once. Registers the Windows task **BASKET price loader**, daily at
  23:00 and again at 08:00, and creates `%LOCALAPPDATA%\basket-prices\loader.env`.
- `run-loader.ps1` — what the task runs (from a copy in `%LOCALAPPDATA%\basket-prices`).
  The 08:00 run does nothing when a run succeeded in the last 12 hours.

After installing, paste the Supabase secret key into `loader.env`
(Supabase → Project Settings → API Keys → Secret keys). Logs are in
`%LOCALAPPDATA%\basket-prices\logs`.

The task runs while you are signed in to Windows (a locked screen is fine). The GitHub workflow
keeps running for the other chains; a chain it can't reach keeps the prices this computer loaded.
After changing `run-loader.ps1`, run `install-task.ps1` again to update the copy.
