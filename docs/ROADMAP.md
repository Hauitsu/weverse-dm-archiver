# Roadmap

| # | milestone | content | status |
| --- | --- | --- | --- |
| M1 | i18n | `src/i18n.mjs` + EN/KO/ID dictionaries, renderer ported to `src/render.mjs` | **done** (3 languages x 58 keys; render byte-identical to the reference) |
| M2 | launcher | `START.bat` (Windows): opens its own browser profile + local GUI at `127.0.0.1:8787` | todo |
| M3 | batch | harvest several rooms in a row, one at a time, fixed delay | todo |
| M4 | share | `wdm share` -> one zip per room (full quality), ready to send | todo |
| M5 | publish gate | `tools/publish.ps1`: file selection + secret scan + commit | **done** (push-tested 30 Sep 2026) |
| M6 | docs/demo | README + 3 screenshots + synthetic demo archive | todo |

Engine already in place: resumable JSONL page fetching (`src/net.mjs`), room registry (`src/rooms.mjs`),
config loading (`src/config.mjs`), and the renderer (`src/render.mjs`) that writes HTML + Markdown +
`messages.jsonl`. The export always points at the original photos and videos, so there is no quality knob.
Reference numbers for one room: 18 months of history, 1,496 media files, about 2.5 GB. A compact variant
stays optional, for people who need a smaller package to send.

## Non-negotiable rules

1. GET only, no POST/PUT/DELETE.
2. Human pacing (1.5-3 s) with jitter, one room at a time.
3. Stop on 429/403, never force a retry.
4. Never read tokens/cookies, never touch the tab the user is logged in on.
5. Never ask the user for a timezone: reports follow the machine zone (`auto`).
