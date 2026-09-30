<#
  publish.ps1 - publication gate for the weverse-dm-archiver folder.

  Flow:
    1. make sure this folder contains no nested git repo (a gitlink means the content is NOT backed up)
    2. copy this folder to the stage folder, skipping large/local files
    3. scan the copied files: tokens, cookies, real nicknames, personal paths
    4. prepare the git repo in the stage folder (init + remote) and print a summary
    5. ONLY with -Push: commit + push to the public repo

  Examples:
    powershell -File tools/publish.ps1                  # dry run, never touches the network
    powershell -File tools/publish.ps1 -Push            # really send it to the public repo
    powershell -File tools/publish.ps1 -Reset           # drop the stage folder first (if its history is broken)
    powershell -File tools/publish.ps1 -Push -Force     # force-with-lease when the remote history was rewritten
#>
[CmdletBinding()]
param(
  [string]$Stage   = (Join-Path $env:USERPROFILE "weverse-dm-archiver-pub"),
  [string]$Remote  = "https://github.com/Hauitsu/weverse-dm-archiver.git",
  [string]$Branch  = "main",
  [string]$Message = "Update weverse-dm-archiver",
  [switch]$Push,
  [switch]$Reset,
  [switch]$Force
)
$ErrorActionPreference = "Stop"
$Src = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Write-Host ("source : " + $Src)
Write-Host ("stage  : " + $Stage)
Write-Host ("remote : " + $Remote + " (" + $Branch + ")")

# 1. no gitlink / nested repo allowed inside this folder
$link = @(git -C $Src ls-files -s -- . 2>$null | Select-String "^160000")
if ($link.Count -gt 0) { throw ("FOUND " + $link.Count + " gitlink(s) in this folder; remove the nested .git first so the content is really backed up.") }

# 2. forbidden patterns (file content)
$forbidden = @(
  "we2_access_token", "we2_refresh_token", "we2_device_id", "we2_",
  "_GSD", "AF_SESSION", "_GUSM", "Authorization:", "Bearer ",
  "C:\Users\", "@gmail.com", "@naver.com"
)
# 2b. private deny-list, kept OUTSIDE this folder so the published copy can never leak it.
#     One pattern per line, "#" starts a comment: <parent of this folder>\publish-private.txt
$privateList = Join-Path $Src "..\publish-private.txt"
if (Test-Path $privateList) {
  $extra = @(Get-Content -LiteralPath $privateList -Encoding utf8 | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" -and -not $_.StartsWith("#") })
  $forbidden += $extra
  Write-Host ("deny-list : " + $forbidden.Count + " patterns (" + $extra.Count + " from the private list)")
} else {
  Write-Host ("WARNING: private deny-list not found at " + $privateList + " - only the generic patterns are checked") -ForegroundColor Yellow
}
# 3. what is never copied (work output / large / local)
# 3. what is never copied (work output / large / local)
$skipDir = @(".git", "node_modules", "profile", "media", "downloads", "rooms", "dist", "share", ".vscode", "verify", "rooms-public")
$skipPattern = @("^export", "\.log$", "\.zip$", "^config\.json$", "^\.env")
# media/ is work output and can be gigabytes, but media/fonts/ is a shipped asset (the emoji font the
# page links to). It is the only exempt path: everything else under media/ stays local.
$keepRel     = @("media/fonts/")

if ($Reset -and (Test-Path $Stage)) { Remove-Item $Stage -Recurse -Force }
if (Test-Path $Stage) {
  # keep .git: the stage repo is reused so the remote history stays connected
  Get-ChildItem -Path $Stage -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force
} else {
  New-Item -ItemType Directory -Path $Stage -Force | Out-Null
}

$all = Get-ChildItem -Path $Src -Recurse -File | ForEach-Object {
  [pscustomobject]@{ Abs = $_.FullName; Rel = $_.FullName.Substring($Src.Length + 1).Replace("\", "/") }
}
$selected = $all | Where-Object {
  $rel = $_.Rel
  $parts = $rel.Split("/")
  $badDir = $false
  foreach ($d in $parts[0..([Math]::Max(0, $parts.Count - 2))]) { if ($skipDir -contains $d) { $badDir = $true } }
  if ($badDir) { foreach ($k in $keepRel) { if ($rel.StartsWith($k)) { $badDir = $false; break } } }
  $badPattern = $false
  foreach ($p in $skipPattern) { if ($rel -match $p) { $badPattern = $true } }
  (-not $badDir) -and (-not $badPattern)
}
if (-not $selected) { throw "no files to publish" }

foreach ($f in $selected) {
  $target = Join-Path $Stage $f.Rel
  New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $f.Abs -Destination $target -Force
}
Write-Host ("copied: " + $selected.Count + " files, " + [Math]::Round(((Get-ChildItem $Stage -Recurse -File | Measure-Object Length -Sum).Sum / 1KB), 1) + " KB")

# 4. scan the copied files
$findings = @()
foreach ($f in Get-ChildItem -Path $Stage -Recurse -File) {
  if ($f.Name -eq "publish.ps1") { continue }   # generic patterns only; the private list lives outside
  if (@(".woff2", ".woff", ".ttf", ".otf") -contains $f.Extension) { continue }   # font binaries carry no text
  $text = Get-Content -LiteralPath $f.FullName -Raw -Encoding utf8
  foreach ($p in $forbidden) { if ($text -like ("*" + $p + "*")) { $findings += ($f.FullName.Substring($Stage.Length + 1) + "  <-  " + $p) } }
}
if ($findings.Count -gt 0) {
  Write-Host ""
  Write-Host "REJECTED - clean these findings first:" -ForegroundColor Red
  $findings | Sort-Object -Unique | ForEach-Object { Write-Host ("  " + $_) }
  throw "publication aborted"
}
Write-Host "scan: clean" -ForegroundColor Green

# 5. repo in the stage folder
# git writes progress/hints to stderr and PowerShell 5.1 treats that as an error. In this part
# the preference is silenced and the exit code is checked by hand, so a normal run stays
# uncolored while a real failure still surfaces as an explicit error.
$ErrorActionPreference = "SilentlyContinue"
function G {
  param([string[]]$Arg)
  $text = (git -C $Stage @Arg 2>$null | Out-String)
  if ($LASTEXITCODE -ne 0) {
    $code = $LASTEXITCODE
    $ErrorActionPreference = "Continue"   # failure path only: show the original git message
    Write-Host ((git -C $Stage @Arg 2>&1 | Out-String).Trim())
    throw ("git " + ($Arg -join " ") + " failed (code " + $code + ")")
  }
  return $text
}

if (-not (Test-Path (Join-Path $Stage ".git"))) {
  G @("init", "-b", $Branch) | Out-Null
  G @("remote", "add", "origin", $Remote) | Out-Null
  Write-Host "git: new repo created in the stage folder"
} else {
  $current = (git -C $Stage remote get-url origin 2>$null)
  if ($current -ne $Remote) { G @("remote", "set-url", "origin", $Remote) | Out-Null }
  Write-Host ("git: reusing the existing stage repo (" + $current + ")")
}
# 5b. the stage repo has no commit while the remote does -> adopt the remote history first
$commitCount = [int](G @("rev-list", "--all", "--count"))
$remoteLine = (G @("ls-remote", "origin", $Branch)).Trim()
if ($commitCount -eq 0 -and $remoteLine.Length -gt 0) {
  Write-Host "git: adopting the remote history (fetch + reset --mixed)"
  G @("fetch", "origin", $Branch) | Out-Null
  G @("reset", "--mixed", "FETCH_HEAD") | Out-Null
}

G @("add", "-A") | Out-Null
$changes = @(git -C $Stage status --porcelain 2>$null | Where-Object { $_ })
if ($changes.Count -eq 0) {
  Write-Host "git: no changes in the stage folder"
} else {
  Write-Host ("git: " + $changes.Count + " change(s)")
  $changes | Select-Object -First 20 | ForEach-Object { Write-Host ("  " + $_) }
  if ($changes.Count -gt 20) { Write-Host ("  ... and " + ($changes.Count - 20) + " more") }
}

if (-not $Push) {
  Write-Host ""
  Write-Host "DRY RUN finished - nothing was sent. Run with -Push to send." -ForegroundColor Yellow
  return
}

if ($changes.Count -gt 0) { Write-Host ((G @("commit", "-m", $Message)).Trim()) }

if ($Force) { Write-Host ((G @("push", "--force-with-lease", "-u", "origin", $Branch)).Trim()) }
else        { Write-Host ((G @("push", "-u", "origin", $Branch)).Trim()) }

Write-Host ("DONE - sent to " + $Remote) -ForegroundColor Green
Write-Host ((G @("log", "--oneline", "-1")).Trim())
Write-Host ("files in commit: " + @(git -C $Stage ls-tree -r HEAD --name-only).Count)
