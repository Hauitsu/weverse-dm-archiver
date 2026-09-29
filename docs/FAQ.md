# FAQ

## Can my account get banned for this?

Honest answer: nobody outside Weverse can promise anything. What this tool does is stay inside
what a normal reader does - it only GETs the same two endpoints the app itself calls, paces
requests 1.5-3 seconds apart with jitter, reads one room at a time, and stops immediately on
429/403 instead of retrying. It never posts, never deletes, never follows, never reads your
tokens, and never touches the tab you are logged in on.

If you are nervous, archive one room per day, or stop and continue later. A backup can always be
finished later: every page is written to disk as it arrives, so stopping costs you nothing.

## Do I need to know how to code, or open DevTools?

No. You double-click `START.bat`, a browser window and a local page open, you log in once, you
tick a room and press Start. Everything else is a progress bar. There is a command line too
(`wdm ...`) if you happen to like typing.

## Why does it need Node.js installed?

The tool is JavaScript, and Node is the engine that runs it. Shipping Node inside the zip would
add about 90 MB to the download; `START.bat` checks for it and opens the download page if it is
missing. That is the only prerequisite.

## Will it close my browser or log me out?

No. It starts its **own** browser window with its own profile under
`%LOCALAPPDATA%\weverse-dm-archiver\profile`. The window and profile you normally use are never
read, reloaded, navigated or closed by this tool.

## Can I keep using Weverse while it runs?

Yes. The tool works in its own window, so nothing you do in your normal browser interferes. Just
do not run two archives of the same room at the same time from two copies of the tool.

## How big is the result?

About 2.5 GB for a room at full quality. Measured on an 18-month room: 9,574 unique messages,
4,119 of them kept after the artist-only filter, 1,478 media files. The page alone is 2.5 MB of
HTML, plus 970 KB of Markdown and 8.2 MB of JSONL. Photos and videos are saved exactly as Weverse served them - there is no quality
knob in this build. A compact variant (480p video, webp photos) is on the roadmap but is
deliberately not part of this release.

If you only want to *send* the archive to someone, use the share zip: it is the same data, but
one file per room instead of thousands.

## What timezone are the timestamps in?

Yours, detected from your machine (`auto`). The API only sends absolute UTC timestamps, and the
Weverse app renders them in the viewer device zone, so this matches what you already see in the
app. You can pin a zone in the page or with `DM_TZ=Asia/Jakarta` if you want a fixed one.

## Does the zip contain my nickname?

Your own messages are not in it: an export keeps only the **artist side** of the conversation by
default, so your messages never appear and your nickname is never used as a sender. The artist's
messages are stored word for word, though - if the artist typed your nickname in a message, that
sentence contains it, exactly as it appears in the app.

## What is inside the zip?

One folder per room, holding the page and everything it needs:

```
weverse-dm-<room>/
  index.html          opens the page (or double-click chat/<room>.html yourself)
  README.txt          what this is, in English, Korean and Indonesian
  manifest.json       room, artist, file counts, media size
  chat/<room>.html    the readable archive
  chat/<room>.md      the same conversation as plain text
  chat/<room>.jsonl   one JSON object per message, for scripts
  chat/summary.json   counts, date range, per-month totals
  chat/fonts/         the emoji font the page uses
  media/photos/       photos, exactly as Weverse served them
  media/video/        videos and voice messages
```

Everything is offline: the page reads the files next to it and never touches the network.

## Can I reuse an archive I made earlier?

Yes. Put the old part files in their own folder under `downloads/`, named after the room:

```
downloads/yunha/   <- every weverse-dm-*-part*.jsonl that belongs to that room
```

then run `wdm render --room yunha`. The renderer merges every part file in that folder and drops
duplicate messages by id, and a later harvest resumes from the oldest message it finds there.

## Do I need a Weverse account with DM access?

Yes - you can only archive rooms you are already a member of, with your own account. The tool
does not bypass any membership or paywall.

## Does it work for other artists or groups?

The engine is generic: it needs a room id (`WR` + five characters). The repo ships 8 UNIS rooms in
`rooms.unis.json` as an example - add your own entries with a `slug`, a `roomId` and the visible
name, and they show up in the page and in `wdm rooms`.

## What if it stops halfway?

Run it again. Each page is appended to `downloads/<room>/` as it arrives, and the next run starts
from the oldest message already on disk. Duplicate messages are dropped by id, so finishing a
half-done room never doubles anything. Photos and videos already downloaded are skipped too, and
once a room is complete the media step does not even open a browser. Finishing later stays cheap.

## Is anything uploaded?

No. Everything stays on your computer: no telemetry, no server of ours, no account of ours. The
archive is plain files - copy them to a drive, share them, or delete them.

## Is this affiliated with Weverse?

No. It is an unofficial fan tool, MIT licensed, with no affiliation to Weverse or HYBE.
