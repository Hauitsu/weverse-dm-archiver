# Weverse DM Archiver (UNIS Exclusive)

![Weverse DM Archiver - your Weverse DMs, saved as a page that opens offline](assets/01-hero.svg)

Your Weverse DMs live in the app and nowhere else. This tool saves them onto your own computer as a
page you can open any time: offline, in any browser, with every message, photo, video and voice note
in it, and the conversation in the order it happened.

Nothing is uploaded anywhere, and there is no account to make. When a run finishes you are holding
plain files on your own disk - keep them, copy them to a drive, or delete them whenever you like.

> **Ready to use.** Double-click `START.bat`, tick a room, press **Start**, log in in the window
> that opens, then press **I'm logged in - continue**.
> A real room has already been through it: 9,574 unique messages across 18 months, 4,119 of them
from
> the artist side, 1,478 media files (1,444 photos, 30 videos, 4 audio), about 2.5 GB.

## What you get

![One run leaves a private page, a public page, the media files and a share zip](assets/03-what-you-get.svg)

One room in, one page out - plus a few extras:

- **A page with the whole conversation in it.** Your messages and the artist's, in order, with the
  photos, videos and voice notes where they were sent, and the times in your own timezone. One file
  per room: double-click it and it opens in your browser, no internet needed.
- **A second copy you can share.** The artist's side only, and your own nickname is replaced, so it
is
  safe to hand to someone else.
- **A zip of the whole room**, if you would rather send one file than a folder - it comes with a
short
  `README.txt` in three languages for whoever receives it.
- **A text version and a data version** of the same conversation (one Markdown file, one data file
per
  room), for anyone who would rather read or process it another way.

Everything lands in the folder the tool lives in - `rooms/`, `rooms-public/`, `media/`,
`share/`. The tool's own browser profile (the window you log in in) is kept separately under
`%LOCALAPPDATA%`, away from your normal browser.

## Quick start

![Four steps: double-click START.bat, pick a room, press Start, log in, open the DM](assets/02-how-it-works.svg)

1. **Install Node.js 20 or newer** if you do not have it. `START.bat` opens the download page when
   it cannot find Node.
2. **Double-click `START.bat`.** The tool's own page opens in your browser - usually
   `http://127.0.0.1:8787`; if that port is taken it picks another one and the small console window
   prints the address it used.
3. **Tick a room and press Start.** A popup repeats these steps first, then a separate browser
window
opens on a fresh Weverse page. **Log in there**, stay on the Home page and **do not close it**, then
come back and press **I'm logged in - continue**. It asks for that press on every run, even when the
   profile already holds a session.
4. **Wait.** The progress walks backwards through the history, page by page. When it says done,
press
   **Open chat** to read the archive, **Open folder** to see the files, or take the zip from the
   **Share** button on that room's row.

Press **Stop** at any moment, or close everything: every page of history is written to disk as it
arrives, so running it again continues where it stopped instead of starting over.

## Is it safe? What does it do to my account?

![The private export keeps both sides; the public export keeps the artist side and hides your nickname](assets/05-private-public.svg)

- **It only reads.** It asks Weverse for the messages your account can already see, the same way the
  app asks for them. It never posts, never deletes, never reacts and never follows.
- **It is slow on purpose.** Pages are fetched 1.5-3 seconds apart, one room at a time, like a
person
  scrolling. If Weverse answers "too many requests", it stops instead of pushing harder.
- **It uses its own browser window.** That window has its own profile, so the tab you are logged in
on
is never reloaded, closed or navigated. Your login is used inside that window and is never written
to
  a file or to a log.
- **Nothing leaves your computer.** No upload, no telemetry, no account of ours. The archive is
files
  on your disk, and you decide who gets them.
- **What you share is already cleaned.** In the public copy your nickname is replaced everywhere the
  archive records it - including the sentences the artist typed your name in - and bookmarks are not
  written at all.

The exact list of rules is in [Safety rules this tool follows](#safety-rules-this-tool-follows)
below.
`docs/FAQ.md` has the honest version, including what to do if you are nervous.

## What the page can do

![Features in every room page: date jump, translation, days together, message options, media, themes](assets/07-same-in-every-room.svg)

- **Jump to a date.** A real room is thousands of messages long, so the ⋯ button in the top-right
  corner opens a panel whose first tab is the date: pick a month and you are there.
- **Translation.** When the artist writes in Korean and Weverse shows an English line, the page
prints
  both and you choose the mode: original + English, original only, or English only.
- **Days together.** The same pill the app shows at the top of a conversation, and still counting:
open
  the archive a month later and it says one month more.
- **Bookmarks.** Star any message and it appears in the panel's second tab. The list lives in your
  browser, you can export it as a file, and a later render can bake it back in.
- **Message options.** Copy the text of a message, copy its date and time, or switch the translation
  mode for the whole page.
- **Photos, videos, voice notes and gifts.** Click a photo for full size, with prev/next; gifts keep
  the cover the app shows and open to whatever is inside; voice notes play in the page.
- **Themes and bubble colour.** Light or dark, and the app's ten bubble colours for the artist's
side,
  picked from the heart in the days chip.

## What you need, and what it will not do

- **Windows is the tested path** (`START.bat`, `wdm.bat`). The JavaScript modules run wherever Node
  runs; only the launchers are Windows-specific.
- **Node.js 20 or newer**, and a Chromium browser (Chrome, Edge, Brave or Vivaldi; `browserPath` in
  `config.json` points at anything unusual).
- **Only rooms your own account can already read.** This bypasses no membership and no paywall.
- **One room is around 2.5 GB** at full quality (the selected-rooms line quotes a 3 GB ceiling until
a
  room has been archived once). The share zip can be built from re-compressed copies instead ("Low
  quality" in a room's **Share** popup: 1280px on the long side, h264 video, 64 kbps audio), which
  needs an `ffmpeg` on `PATH`; the archive on disk keeps its originals either way.
- **Nothing is posted, deleted or changed** on Weverse, and no message can be edited through the
  archive: it is a copy to read.

## Questions people ask

**Does it cost anything?**
No. It is a free, open-source tool (MIT licence) with no account, no subscription and nothing to
sign
up for.

**Do I need to know anything technical?**
No. Install Node.js, double-click `START.bat`, tick a room and press Start. Everything else is
buttons.

**Do you get my Weverse password?**
No. You type it into the browser window the tool opens, the way you would in any browser. It is
never
written to a file, never logged and never sent to us - there is nothing of ours to send it to.

**What if it stops halfway, or I close the window?**
Nothing is lost. Every page of history is saved as it arrives, so the next run carries on from
there.

**Can I move the archive to another computer?**
Yes: copy the whole tool folder. The page is a normal HTML file, but it points at the media files
beside it, so the folder has to travel with it.

**How much space do I need?**
About 2.5 GB per room at full quality, most of it photos and video.

More detail: `docs/QUICK-START.md` for the steps, `docs/FAQ.md` for the honest answers,
`docs/ROADMAP.md` for what is planned and `docs/INTERNALS.md` for the technical detail.

---

## The technical part

The short version ends here. This part is how it talks to Weverse, what it writes and where; the
reader
page itself - theme colours, the ten bubble colours, the translation modes, how bookmarks are stored
-
is written up in `docs/INTERNALS.md`.

### How it works

It reads the history the way you would read it yourself - read-only `GET` requests, human pacing,
one room at
a time. It never posts, never deletes, never follows, and never touches the tab you are logged in
on. It
does have to sign those requests the way the app does, so the session token is used **inside its own
browser window**: never written to disk, never logged, and never read by the program outside that
window.

A run is five phases (`gui.phase.*` in `src/lang/*.json`):

1. **Starting the browser** - `START.bat` checks Node, then `node src\gui.mjs` serves the local page
and opens
   the browser window.
2. **Walking the history backwards** - one JSONL line per page of history into `downloads/<room>/`,
which is
   what makes a run resumable.
3. **Building the page** - both exports are rendered from what is on disk; no network here.
4. **Downloading photos and video** - only the media the export points at.
5. **Packing the zip** - only when the picker asked for the share zip.

### Safety rules this tool follows

| rule | why |
| --- | --- |
| GET only - `/dm/v2.0/messages` and the video `download-info` endpoint | no write reaches your account, ever |
| pacing 1.5-3 s apart with jitter, one room at a time | it looks like a human scrolling |
| stop on HTTP 429/403, no forced retry | never hammer the API |
| the API token is read in memory to sign its own GETs | nothing token-shaped is written to disk or logged |
| its own browser window and profile | the session you browse with is never reloaded, closed or navigated |

Nothing can promise zero risk. `docs/FAQ.md` has the honest version, including what to do if you are
nervous.

### Command line

`wdm.bat` (or `node src/cli.mjs`) does the same work without the page:

| command | what it does |
| --- | --- |
| `wdm rooms` | list the rooms in `rooms.unis.json` and what is already archived |
| `wdm labels` | read the room names off the DM list into `rooms.unis.json` (emoji and all) |
| `wdm harvest --room yunha` | walk the history backwards (starts the private browser) |
| `wdm render --room yunha` | build both exports (private + public) from what is on disk |
| `wdm media --room yunha` | download the photos and video the export points at |
| `wdm share --room yunha` | one zip in `share/`, built from the public export |
| `wdm all --room yunha --share` | all of the above, in order |
| `wdm doctor` | check node, browser, rooms and folders |

### Output layout

```
rooms/               private export: <room>.html, <room>.md, <room>.jsonl, summary.json, fonts/
rooms-public/        public export: the same files for the artist side only
media/               photos/, video/, avatars/, fonts/ at original quality
downloads/<room>/    one JSONL line per page of history (this is what makes it resumable)
share/               share zips: weverse-dm-<room>.zip, one per room
verify/              .sha256 + .manifest.json of each zip (nothing to send)
```

Rooms never share a folder under `downloads/`, so one room history can never leak into another room
export. The
export always points at the original media, so there is no quality knob: one room is roughly 2.5 GB,
almost all of it photos and video. What ships with the repo (fonts, avatars) and what each file
holds is
in `docs/INTERNALS.md`.

## Contributing

Room ids for other groups, UI translations (English, Korean and Indonesian ship today) and bug
reports are
welcome - see `docs/ROADMAP.md`.

## License

MIT - see `LICENSE`.
