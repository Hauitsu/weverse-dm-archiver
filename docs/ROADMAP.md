# Roadmap

| # | milestone | content | status |
| --- | --- | --- | --- |
| M1 | i18n | `src/i18n.mjs` + EN/KO/ID dictionaries, renderer ported to `src/render.mjs` | **done** (3 languages x 109 keys; render byte-identical to the reference) |
| M2 | launcher | `START.bat` + local GUI (defaults to `127.0.0.1:8787`, walks to the next free port when the system reserves it), private browser profile, live log | **done** |
| M3 | batch | several rooms from the picker, one at a time, resumable per room | **done** |
| M4 | share | one zip per room (full quality, `store`), built from the public export, `.sha256` + `.manifest.json` + 3-language README | **done** (exercised on a real 2.5 GB room: 1,507 entries, every media reference resolves, an extracted photo is byte-identical, checksum confirmed with `Get-FileHash`; the "Yes but Low Quality" choice was added later on top of `src/quality.mjs`) |
| M5 | publish gate | `tools/publish.ps1`: file selection + secret scan + commit | **done** |
| M6 | docs/demo | README, quick start, FAQ and roadmap updated; still open: screenshots, and a small synthetic demo archive to try the tool without an account | partial |
| M7 | optional light package | smaller media for people who need something small enough to send | **done** as the zip's "Yes but Low Quality" (`src/quality.mjs`: 1280px on the long side, h264 video, 64 kbps audio, via `ffmpeg`); the archive keeps its originals |

Engine already in place: resumable JSONL page fetching (`src/net.mjs`), room registry
(`src/rooms.mjs`), config loading (`src/config.mjs`), browser discovery and CDP
(`src/browser.mjs`, `src/cdp.mjs`), the history walk (`src/harvest.mjs`), media download
(`src/media.mjs`), the renderer (`src/render.mjs`), the order of operations (`src/pipeline.mjs`),
the page (`src/gui.mjs`), the command line (`src/cli.mjs`) and a dependency-free ZIP writer
(`src/zip.mjs`).

Every render writes two exports from the same archive: `rooms/` (private - both sides, bookmarks
per your setting) and `rooms/public/` (artist side only, your nickname replaced by EverAfter,
bookmarks off). The zip is always built from the public one, and its media can be re-compressed on
the way in.

The export itself always points at the original photos and videos. The one quality knob is the
share zip's "Yes but Low Quality", which shrinks the copies that travel inside it and leaves the
archive untouched. Reference
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
