# Roadmap

| # | milestone | content | status |
| --- | --- | --- | --- |
| M1 | i18n | `src/i18n.mjs` + EN/KO/ID dictionaries, renderer ported to `src/render.mjs` | **done** (3 languages x 92 keys; render byte-identical to the reference) |
| M2 | launcher | `START.bat` + local GUI (defaults to `127.0.0.1:8787`, walks to the next free port when the system reserves it), private browser profile, live log | **done** |
| M3 | batch | several rooms from the picker, one at a time, resumable per room | **done** |
| M4 | share | one zip per room (full quality, `store`), `.sha256` + `.manifest.json` + 3-language README | **done** (exercised on a real 2.5 GB room: 1,507 entries, every media reference resolves, an extracted photo is byte-identical, checksum confirmed with `Get-FileHash`) |
| M5 | publish gate | `tools/publish.ps1`: file selection + secret scan + commit | **done** |
| M6 | docs/demo | README, quick start, FAQ and roadmap updated; still open: screenshots, and a small synthetic demo archive to try the tool without an account | partial |
| M7 | optional light package | 480p video + webp photos for people who need something small enough to send | optional, deliberately not in this build |

Engine already in place: resumable JSONL page fetching (`src/net.mjs`), room registry
(`src/rooms.mjs`), config loading (`src/config.mjs`), browser discovery and CDP
(`src/browser.mjs`, `src/cdp.mjs`), the history walk (`src/harvest.mjs`), media download
(`src/media.mjs`), the renderer (`src/render.mjs`), the order of operations (`src/pipeline.mjs`),
the page (`src/gui.mjs`), the command line (`src/cli.mjs`) and a dependency-free ZIP writer
(`src/zip.mjs`).

The export always points at the original photos and videos, so there is no quality knob. Reference
numbers for one room: 18 months of history, 9,574 unique messages (4,119 kept after the artist-only
filter), 1,478 media files at about 2.5 GB, and 2.5 MB of HTML + 970 KB of Markdown + 8.2 MB of
JSONL out of 12 page files.

## Non-negotiable rules

1. GET only, no POST/PUT/DELETE.
2. Human pacing (1.5-3 s) with jitter, one room at a time.
3. Stop on 429/403, never force a retry.
4. Never read tokens/cookies, never touch the tab the user is logged in on.
5. Never ask the user for a timezone: the default is the machine zone (`auto`). Pinning one is
   available, but it is never a question the tool insists on.
6. No runtime dependency: everything runs on Node itself, with no package to install.
