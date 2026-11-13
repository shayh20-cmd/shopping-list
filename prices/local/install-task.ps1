# Sets up the price loader on this computer: a daily task at 23:00, retried at 08:00.
# Run once from Windows PowerShell:  powershell -ExecutionPolicy Bypass -File prices\local\install-task.ps1
# Then put the Supabase secret key in %LOCALAPPDATA%\basket-prices\loader.env.
param([string]$Repo = (Join-Path $PSScriptRoot '..\..'))
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path $Repo).Path
$base = Join-Path $env:LOCALAPPDATA 'basket-prices'
New-Item -ItemType Directory -Force $base | Out-Null

# The task runs a copy, so switching branches in the repo doesn't change or remove it.
Copy-Item -Force (Join-Path $PSScriptRoot 'run-loader.ps1') (Join-Path $base 'run-loader.ps1')

$envFile = Join-Path $base 'loader.env'
if (-not (Test-Path $envFile)) {
  Set-Content -Path $envFile -Encoding ascii -Value @(
    '# Supabase -> Project Settings -> API Keys -> Secret keys. Paste the key after the = sign.',
    'SUPABASE_URL=https://tnfmdelmjlduouaqzqct.supabase.co',
    'SUPABASE_SERVICE_KEY='
  )
}

$script = Join-Path $base 'run-loader.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -Repo `"$repo`"" `
  -WorkingDirectory $base
$triggers = @(
  (New-ScheduledTaskTrigger -Daily -At '23:00'),
  (New-ScheduledTaskTrigger -Daily -At '08:00')
)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'BASKET price loader' -Action $action -Trigger $triggers `
  -Settings $settings -Principal $principal -Force `
  -Description 'Loads store prices for BASKET (Victory and Carrefour block GitHub). prices/local in the shopping-list repo.' | Out-Null

Write-Output "Task 'BASKET price loader' registered: 23:00, retry 08:00."
Write-Output "Key file: $envFile"
Write-Output "Logs: $(Join-Path $base 'logs')"
