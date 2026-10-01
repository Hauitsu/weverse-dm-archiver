# FAQ

## Can my account get banned for this?

Honest answer: nobody outside Weverse can promise anything. What this tool does is stay inside
what a normal reader does - it only GETs the same two endpoints the app itself calls, paces
requests 1.5-3 seconds apart with jitter, reads one room at a time, and stops immediately on
429/403 instead of retrying. It never posts, never deletes, never follows, and never touches
the tab you are logged in on. It does use the session token - the API only answers signed
requests - but only inside its own browser window: never written to disk, never logged, never
read by the program outside that window, and never sent anywhere except Weverse.

If you are nervous, archive one room per day, or stop and continue later. A backup can always be
finished later: every page is written to disk as it arrives, so stopping costs you nothing.

## Do I need to know how to code, or open DevTools?

No. You double-click `START.bat`, the local page opens, you tick a room and press Start, you log
in in the window the tool opens and you press **I'm logged in - continue**. Everything else is a
progress bar. There is a command line too (`wdm ...`) if you happen to like typing.

## Why does it need Node.js installed?

The tool is JavaScript, and Node is the engine that runs it. Shipping Node inside the zip would
add about 90 MB to the download; `START.bat` checks for it and opens the download page if it is
missing. That is the only prerequisite.

## Will it close my browser or log me out?

No. It starts its **own** browser window with its own profile under
`%LOCALAPPDATA%\weverse-dm-archiver\profile`. The window and profile you normally use are never
read, reloaded, navigated or closed by this tool.

## Google says "this browser or app may not be secure"

That message comes from Google, not from Weverse, and it is about the browser rather than your
account: Google refuses to sign anyone in from a browser that is being driven over the DevTools
protocol, which is exactly how the tool reads the page. No flag talks it out of that, so the tool
splits the job in two. Every run starts with a plain window that has no debugging port at all. You
sign in **there** - Google is happy with an ordinary window - and once you press the button on the
page (or close that window) the tool closes it, starts its automated window on the same profile and
takes over the session that sign-in left behind. The archive itself is unchanged: same session, still
kept in `%LOCALAPPDATA%\weverse-dm-archiver\profile` for next time. It asks for that click even when
the profile already holds a session from an earlier run: a stored login can be stale, and only you
can see whether the window really is signed in.
If the session is still not there when you press the button, the sign-in window simply opens again - the
tool cycles instead of failing, and only **Stop** ends it, so a login that never arrives is never reported
as an error.

## Can I keep using Weverse while it runs?

Yes. The tool works in its own window, so nothing you do in your normal browser interferes. Just
do not run two archives of the same room at the same time from two copies of the tool.

## How big is the result?

About 2.5 GB for a room at full quality - the page quotes up to 3 GB until that room has been
archived once. Measured on an 18-month room: 9,574 unique messages
(4,119 from the artist, 5,455 from the account owner) and 1,478 media files. The page alone is 2.5 MB of
HTML, plus 970 KB of Markdown and 8.2 MB of JSONL. Photos and videos are saved exactly as Weverse served them - the archive itself has no quality knob:
what Weverse gave, it keeps. Size is traded only in the share zip, and only when you ask for it:
**Low quality** in a room's **Share** popup re-compresses the copies inside that zip (1280px on
the long side, h264 video, 64 kbps audio) with the `ffmpeg` on your `PATH`. Anything that would not get smaller keeps its
original bytes, and `rooms/` and `media/` are never touched.

If you only want to *send* the archive to someone, use the share zip: it is the same data (artist
messages and media only - your own messages are left out), but one file per room instead of
thousands.

## What timezone are the timestamps in?

Yours, detected from your machine (`auto`). The API only sends absolute UTC timestamps, and the
Weverse app renders them in the viewer device zone, so this matches what you already see in the
app. You can pin a zone in the page or with `DM_TZ=Asia/Jakarta` if you want a fixed one.

## What is the difference between `rooms/` and `rooms-public/`?

Every render writes both, from the same archive, so there is nothing to choose up front:

| | `rooms/` (private) | `rooms-public/` (public) |
| --- | --- | --- |
| messages | both sides | artist side only |
| bookmarks | whatever your settings say | never |
| date jump & translation switch | yes | yes (the same panel, minus the bookmark tab) |
| your nickname | exactly as harvested | always `EverAfter` |
| `publicRename` | ignored, the real text is kept | applied |
| goes into the zip | no | yes |

## Does the zip contain my nickname?

Not as a sender: the zip is built from the **public** export, so none of your messages appear. Your
nickname is still written down, though, because the artist's messages are stored word for word - if
they typed your name in a sentence, that sentence contains it exactly as it appears in the app. So
the public export replaces it. The archive already records your nickname (every message you sent
carries it), so nothing has to be typed or configured: every occurrence becomes `EverAfter`. A
nickname you changed at some point is hidden as well. `"publicRename"` is there for extra
`find=replace` pairs, and your own `rooms/` copy always keeps the harvested text. The run reports
`render: public export checked, the hidden name is gone` when the scan comes back clean, and a
warning with a count when it does not.

## Where does the room name in the header come from?

From `rowLabel` in `rooms.unis.json`: the text the DM list shows for that room, emoji included. It
is what the page calls the room - the row under the meta line, next to the artist's picture, and the
name above the artist's bubbles. The `<h1>` is the fixed title `Weverse DM Archive` and the room id
leads the grey meta line underneath it (`room WRA2W0P &middot; ...`). The DM API does not carry the
artist's own name (every message, on both sides, is labelled
with *your* nickname), so the list page is the only place to read it. `wdm labels` also saves the profile pictures the rows point at as `media/avatars/<room>-artist`,
which is what puts a face next to the messages. `wdm labels` reads the names
off `https://dm.weverse.io/` in the tool's own browser window; `wdm labels --snippet` prints that
probe if you would rather paste it into DevTools yourself, and `wdm labels --from names.json`
imports the result. Re-render afterwards (`wdm render --room <slug>`), and rebuild any zip that
already exists.

## How do I send a finished room to someone else?

Use **Share** on the room row. A room is only offered onward when its archive really starts at the
beginning of the group's history (April 2025) and still reaches the current month; the collector
already holds one of the eight rooms himself, so only the others are worth asking about. When the room
qualifies, the popup shows **Share to Hauitsu**: pressing it brings up his short message and a button
that opens the shared drive folder, and you drop the zip in there. For reference, one room is about
2.5 GB at full quality and about 350 MB re-compressed, and eight rooms at full size come to roughly
20 GB, more than a free Drive holds.

## Can I stop a zip once it is running?

Press **Cancel** in the Share popup. While a job is running that button stops it instead of closing the
window: the log at the bottom says what it killed, the file being re-compressed is ended, the half-built
package in the temp folder is deleted, and every Share button comes back as soon as the job has unwound.
A zip that was already finished is never touched, and no partial archive is left for you to clean up.

## What is inside the zip?

One folder per room, holding the page and everything it needs. With **Low quality** the
media inside are re-compressed copies, made by `ffmpeg`; the tree is identical either way:

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

It is always built from `rooms-public/<room>.html`, so the other side of the conversation can never
end up in it, and only the media that page really points at is copied in: files nothing references
are left out.

Everything is offline: the page reads the files next to it and never touches the network.

## Where do the emoji and the avatar circles come from?

The emoji font ships with the repo in `media/fonts/` (Noto Color Emoji, OFL-1.1), so the page looks
the same on every machine instead of depending on what the visitor has installed, and nothing is
fetched from a CDN. The avatar circles are optional: `wdm labels` saves the picture each room shows
as `media/avatars/<room>-artist.<ext>`, and you can also drop a shared `media/avatars/artist.png`
(plus `me.png` for your own side) there before rendering. Without any of those files the page is
rendered without avatars - no broken image, just no avatar.

The page prefers Apple's emoji: `media/fonts/apple-emoji.woff2` ships with the repo, cut down to
the emoji that appear in your archives (~3 MB). `node tools/get-apple-emoji.mjs` rebuilds it from
a release of [samuelngs/apple-emoji-ttf](https://github.com/samuelngs/apple-emoji-ttf), and
`--remove` deletes it so the page falls back to the Noto Color Emoji that also ships here. Emoji
newer than the shipped cut fall back to the reader's own emoji font instead of an empty box.
Apple's designs belong to Apple (the upstream repository states educational use only), so keep
the archive for personal use. Carrying the font here is a deliberate choice: if this repository is
ever made public, Apple can ask for its removal. To drop that risk instead, run
`node tools/get-apple-emoji.mjs --remove` and the bundled Noto font takes over.

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

## Which file do I send?

Only the `.zip`. It is self-contained: `index.html`, `README.txt` and `manifest.json` are already
inside it, so the recipient just unpacks it and opens `index.html`.

The `.sha256` and `.manifest.json` in `verify/` (next to `share/`) are for you, not for them. The checksum is
worth keeping when a big zip travels through cloud storage or a slow connection: re-check it on the
other end and you know the file arrived complete instead of truncated. Nothing in the zip needs it.
