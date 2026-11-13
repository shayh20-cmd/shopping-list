# Runs the nightly price loader on this computer. Started by the "BASKET price loader" task
# (install-task.ps1) at 23:00 and again at 08:00; the 08:00 run does nothing when the 23:00
# run already succeeded. Victory and Carrefour block GitHub's servers, so they only load here.
# -Extra passes loader flags for a check by hand, e.g. -Extra '--dry-run --home 32.08,34.80'.
param([Parameter(Mandatory = $true)][string]$Repo, [string]$Extra = '')
$dry = $Extra -match '--dry-run'

$base = Join-Path $env:LOCALAPPDATA 'basket-prices'
$work = Join-Path $base 'work'
$logs = Join-Path $base 'logs'
$stamp = Join-Path $base 'last-success.txt'
New-Item -ItemType Directory -Force $work, $logs | Out-Null
$log = Join-Path $logs ((Get-Date -Format 'yyyy-MM-dd_HHmm') + '.log')
function Say($m) { Add-Content -Path $log -Value ((Get-Date -Format 'HH:mm:ss') + ' ' + $m) }

# The 08:00 retry: skip when a run succeeded in the last 12 hours.
if (-not $dry -and (Test-Path $stamp) -and ((Get-Date) - (Get-Item $stamp).LastWriteTime).TotalHours -lt 12) {
  Say 'already loaded in the last 12 hours, nothing to do'
  exit 0
}

# Supabase keys: KEY=VALUE lines in loader.env, never in the repository.
$envFile = Join-Path $base 'loader.env'
foreach ($line in (Get-Content $envFile -ErrorAction SilentlyContinue)) {
  if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$') { Set-Item -Path ('env:' + $Matches[1]) -Value $Matches[2] }
}
if (-not $dry -and (-not $env:SUPABASE_URL -or -not $env:SUPABASE_SERVICE_KEY)) {
  Say "SUPABASE_URL or SUPABASE_SERVICE_KEY missing in $envFile"
  exit 1
}

# The loader as it is on main, so this runs whatever the repo's checkout is doing.
$load = Join-Path $work 'load.py'
cmd /c "git -C `"$Repo`" fetch -q origin main 2>nul"
cmd /c "git -C `"$Repo`" show origin/main:prices/load.py > `"$load.new`" 2>nul"
if ($LASTEXITCODE -eq 0 -and (Get-Item "$load.new").Length -gt 0) { Move-Item -Force "$load.new" $load }
elseif (Test-Path $load) { Say 'could not read load.py from origin/main; using the last copy' }
else { Say 'could not read load.py from origin/main'; exit 1 }

# Python environment, made once.
$py = Join-Path $base 'venv\Scripts\python.exe'
if (-not (Test-Path $py)) {
  Say 'creating the Python environment'
  cmd /c "python -m venv `"$base\venv`" >> `"$log`" 2>&1"
  cmd /c "`"$py`" -m pip install -q il-supermarket-scraper==1.0.19 requests lxml >> `"$log`" 2>&1"
  if ($LASTEXITCODE -ne 0) { Say 'pip install failed'; Remove-Item -Recurse -Force "$base\venv"; exit 1 }
}

# Yesterday's downloads would be read again, so start clean.
Remove-Item -Recurse -Force (Join-Path $work 'dumps') -ErrorAction SilentlyContinue
Say 'loading prices'
Push-Location $work
cmd /c "`"$py`" -I -X utf8 `"$load`" $Extra >> `"$log`" 2>&1"
$code = $LASTEXITCODE
Pop-Location
Remove-Item -Recurse -Force (Join-Path $work 'dumps') -ErrorAction SilentlyContinue

if ($code -eq 0 -and -not $dry) { Set-Content -Path $stamp -Value (Get-Date -Format o); Say 'done' }
elseif ($code -ne 0) { Say "loader failed with exit code $code" }
else { Say 'dry run done' }

# Keep a month of logs.
Get-ChildItem $logs -Filter *.log | Sort-Object Name -Descending | Select-Object -Skip 60 | Remove-Item -Force
exit $code
