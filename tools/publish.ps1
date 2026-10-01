<#
  publish.ps1 - publication gate for the weverse-dm-archiver folder.

  Flow:
    1. make sure this folder contains no nested git repo (a .git here, or a gitlink in the private repo,
       means the content is NOT backed up), then lock the stage folder: two runs at once overwrite each
       other's copies and one of them reports a bogus "no changes"
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

# 1. this folder must stay plain content of the private repo. A .git inside it (folder or file) or a
#    gitlink entry in the private repo means the folder is recorded as a SHA only: the files are NOT
#    backed up and cloning the private repo gives an empty folder.
$nestedGit = @()
if (Test-Path -LiteralPath (Join-Path $Src ".git")) { $nestedGit += ".git" }
if ($nestedGit.Count -gt 0) {
  throw ("nested git metadata found in this folder (" + ($nestedGit -join ", ") + "); delete it first - with a .git here the private repo records a gitlink (mode 160000) and the content is NOT backed up.")
}
# git writes to stderr when this folder sits outside any repo, and PowerShell 5.1 turns that into a
# terminating error while $ErrorActionPreference is "Stop". This probe is allowed to come back empty.
$probe = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
$owner = (git -C $Src rev-parse --show-toplevel 2>$null | Select-Object -First 1)
$ErrorActionPreference = $probe
if (-not $owner) {
  Write-Host "WARNING: no git repo above this folder - the gitlink check is skipped" -ForegroundColor Yellow
} elseif (($owner.Trim() -replace "/", "\") -eq $Src.TrimEnd("\")) {
  # git answers with this folder itself -> it IS its own repo (a .git we did not see, e.g. a worktree
  # link). Publishing from it would change which repo "owns" the files, so stop instead of guessing.
  throw ("this folder is its own git repo (git rev-parse --show-toplevel = " + $owner.Trim() + "); remove the nested .git first so the content is really backed up.")
} else {
  $link = @(git -C $Src ls-files -s -- . 2>$null | Select-String "^160000")
  if ($link.Count -gt 0) { throw ("FOUND " + $link.Count + " gitlink(s) in this folder; remove the nested .git first so the content is really backed up.") }
  Write-Host ("git    : tracked by " + $owner.Trim())
}

# 1b. the stage folder is shared state outside this repo and it is reused on every run. Two runs at the
#     same time copy over each other, and then one of them can look at a half-built stage and print
#     "no changes in the stage folder" - a wrong answer that looks like a real result. One run at a time.
#     The lock is a directory: creating an already existing directory fails on every PowerShell version.
$lock = $Stage.TrimEnd("\") + ".lock"
if (Test-Path $lock) {
  $lockRaw = (Get-Content -LiteralPath (Join-Path $lock "pid") -Raw -ErrorAction SilentlyContinue)
  $lockPid = ""
  $alive = $false
  if ($lockRaw) {
    $lockPid = (($lockRaw.Trim() -split "\s+") | Select-Object -First 1)
    if ($lockPid -match "^\d+$") { $alive = [bool](Get-Process -Id ([int]$lockPid) -ErrorAction SilentlyContinue) }
  }
  if ($alive) {
    throw ("another publish run is active (pid " + $lockPid + ", " + $lockRaw.Trim() + "); wait for it to finish, or delete " + $lock + " if you are sure that run is dead.")
  }
  Write-Host ("WARNING: stale stage lock (" + $(if ($lockRaw) { $lockRaw.Trim() } else { "no pid recorded" }) + ") - taking it over") -ForegroundColor Yellow
  Remove-Item -LiteralPath $lock -Recurse -Force
}
New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null
Set-Content -LiteralPath (Join-Path $lock "pid") -Value ($PID.ToString() + " " + (Get-Date).ToString("s")) -Encoding ascii
try {

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
$skipDir = @(".git", "node_modules", "profile", "media", "downloads", "rooms", "dist", "share", ".vscode", "verify", "rooms-public", "runtime", "build")
$skipPattern = @("^export", "\.log$", "\.zip$", "^config\.json$", "^\.env", "-me\.png$", "-src\.")
# media/ is work output and can be gigabytes, but media/fonts/ is a shipped asset (the emoji font the
# page links to). It is the only exempt path: everything else under media/ stays local.
$keepRel     = @("media/fonts/", "media/avatars/", "media/gift/")

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


# 3b. the shipped link. config.json is never published, so a build whose users should be able to
#     upload has to carry the folder id somewhere, and it is not written into any file whose name the
#     code mentions: the id sits in a data file that src/collect.mjs finds by its byte size alone
#     (zoner(BLOB_SIZE)). The author makes that file once with tools/make-blob.mjs; here the copy in
#     the stage is checked against the code - and its size moved if another published file already
#     uses it - so what ships is readable. No carrier in the source tree means no carrier is shipped.
$blobOut = (node (Join-Path $Src "tools\check-blob.mjs") --root $Stage --fix 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw ("blob check failed: " + $blobOut) }
Write-Host ("link   : " + ($blobOut -replace "`r?`n", "; "))

# 4. scan the copied files
$findings = @()
foreach ($f in Get-ChildItem -Path $Stage -Recurse -File) {
  if ($f.Name -eq "publish.ps1") { continue }   # generic patterns only; the private list lives outside
  if ($f.Name -eq "wv-blob.wvb") { continue }   # written on purpose by make-blob: it holds the drive id and nothing else
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
} finally {
  # always release the stage lock, including on an early return (dry run) or an aborted scan
  Remove-Item -LiteralPath $lock -Recurse -Force -ErrorAction SilentlyContinue
}
