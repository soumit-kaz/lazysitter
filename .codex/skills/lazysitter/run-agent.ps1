<#
LazySitter agent runner (Codex adapter) — PowerShell.
Launches ONE context-isolated `codex exec` for a single LazySitter agent.

Usage: pwsh run-agent.ps1 <agent-name> <inputs-file> <output-file>

Env:
  LazySitter_AUTO_GIT=1   downgrade on-request approval to `never` (headless auto-merge)
  LazySitter_DRY_PRINT=1  print the resolved codex command instead of running it
#>
param(
  [Parameter(Mandatory = $true)][string]$Agent,
  [Parameter(Mandatory = $true)][string]$InputsFile,
  [Parameter(Mandatory = $true)][string]$OutputFile
)
$ErrorActionPreference = 'Stop'

$dir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$role = Join-Path $dir "agents/$Agent.md"
$meta = Join-Path $dir "agents/$Agent.meta"

if (-not (Test-Path $role)) { Write-Error "lazysitter: unknown agent '$Agent' (no $role)"; exit 2 }
if (-not (Test-Path $meta)) { Write-Error "lazysitter: missing meta for '$Agent' ($meta)"; exit 2 }
if (-not (Test-Path $InputsFile)) { Write-Error "lazysitter: inputs file not found: $InputsFile"; exit 2 }

# Parse KEY=VALUE lines from a file into a hashtable.
function Read-EnvFile($path) {
  $h = @{}
  if (Test-Path $path) {
    foreach ($line in Get-Content $path) {
      if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
      $k, $v = $line -split '=', 2
      $h[$k.Trim()] = $v.Trim().Trim('"')
    }
  }
  return $h
}

$m = Read-EnvFile $meta
$sandbox  = if ($m.ContainsKey('SANDBOX'))  { $m['SANDBOX'] }  else { 'read-only' }
$approval = if ($m.ContainsKey('APPROVAL')) { $m['APPROVAL'] } else { 'never' }
$tier     = if ($m.ContainsKey('TIER'))     { $m['TIER'] }     else { 'mid' }
$distinct = if ($m.ContainsKey('DISTINCT_MODEL')) { $m['DISTINCT_MODEL'] } else { '0' }

$models = Read-EnvFile (Join-Path $dir 'models.env')
switch ($tier) {
  'high' { $model = $models['MODEL_HIGH'] }
  'mid'  { $model = $models['MODEL_MID'] }
  'low'  { $model = $models['MODEL_LOW'] }
  default { $model = '' }
}
if ($distinct -eq '1') {
  $model = if ($models['MODEL_HIGH_ALT']) { $models['MODEL_HIGH_ALT'] } else { $models['MODEL_HIGH'] }
}

if ($approval -eq 'on-request' -and $env:LazySitter_AUTO_GIT -eq '1') { $approval = 'never' }

$argsList = @('exec', '--sandbox', $sandbox, '--ask-for-approval', $approval,
              '--skip-git-repo-check', '--output-last-message', $OutputFile)
if ($model) { $argsList += @('--model', $model) }

$prompt = (Get-Content $role -Raw) + "`n`n---`n`n# YOUR TASK INPUTS`n`n" + (Get-Content $InputsFile -Raw)

if ($env:LazySitter_DRY_PRINT -eq '1') {
  Write-Output ("codex " + ($argsList -join ' ') + " -")
  exit 0
}

$prompt | codex @argsList -
