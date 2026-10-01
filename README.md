# Weverse DM Archiver (UNIS Exclusive)

![Weverse DM Archiver - your Weverse DMs, saved as a page that opens offline](assets/01-hero.svg)

Your Weverse DMs live in the app and nowhere else. This tool saves them onto your own computer as a
page you can open any time: offline, in any browser, with every message, photo, video and voice note
in it, and the conversation in the order it happened.

Nothing is uploaded anywhere, and there is no account to make. When a run finishes you are holding
plain files on your own disk - keep them, copy them to a drive, or delete them whenever you like.

> **Ready to use.** Double-click `START.bat`, tick a room, press **Start**, log in in the window
> that opens, then press **I'm logged in - continue**. A real room has already been through it:
> 9,574 unique messages across 18 months, 4,119 of them from the artist side, 1,478 media files
> (1,444 photos, 30 videos, 4 audio), about 2.5 GB.

## What you get

![One run leaves a private page, a public page, the media files and a share zip](assets/03-what-you-get.svg)

One room in, one page out - plus a few extras:

- **A page with the whole conversation in it.** Your messages and the artist's, in order, with the
  photos, videos and voice notes where they were sent, and the times in your own timezone. One file
  per room: double-click it and it opens in your browser, no internet needed.
- **A second copy you can share.** The artist's side only, and your own nickname is replaced, so
  it is safe to hand to someone else.
- **A zip of the whole room**, if you would rather send one file than a folder - it comes with a
  short `README.txt` in three languages for whoever receives it.
- **A text version and a data version** of the same conversation (one Markdown file, one data file
  per room), for anyone who would rather read or process it another way.

Everything lands in the folder the tool lives in - `rooms/`, `rooms-public/`, `media/`, `share/`.
The tool's own browser profile (the window you log in in) is kept separately under `%LOCALAPPDATA%`,
away from your normal browser.

## Quick start

![Four steps: double-click START.bat, pick a room, press Start, log in, open the DM](assets/02-how-it-works.svg)

1. **Install Node.js 20 or newer** if you do not have it. `START.bat` opens the download page
   when it cannot find Node.
2. **Double-click `START.bat`.** The tool's own page opens in your browser - usually
   `http://127.0.0.1:8787`; if that port is taken it picks another one and the small console window
   prints the address it used.
3. **Tick a room and press Start.** A popup repeats these steps first, then a separate browser
   window opens on a fresh Weverse page. **Log in there**, stay on the Home page and **do not close
   it**, then come back and press **I'm logged in - continue**. It asks for that press on every run,
   even when the profile already holds a session.
4. **Wait.** The progress walks backwards through the history, page by page. When it says done,
   press **Open chat** to read the archive, **Open folder** to see the files, or take the zip from
   the **Share** button on that room's row.

Press **Stop** at any moment, or close everything: every page of history is written to disk as it
arrives, so running it again continues where it stopped instead of starting over.

## Is it safe? What does it do to my account?

![The private export keeps both sides; the public export keeps the artist side and hides your nickname](assets/05-private-public.svg)

- **It only reads.** It asks Weverse for the messages your account can already see, the same way
  the app asks for them. It never posts, never deletes, never reacts and never follows.
- **It is slow on purpose.** Pages are fetched 1.5-3 seconds apart, one room at a time, like a
  person scrolling. If Weverse answers "too many requests", it stops instead of pushing harder.
- **It uses its own browser window.** That window has its own profile, so the tab you are logged
  in on is never reloaded, closed or navigated. Your login is used inside that window and is never
  written to a file or to a log.
- **Nothing leaves your computer.** No upload, no telemetry, no account of ours. The archive is
  files on your disk, and you decide who gets them.
- **What you share is already cleaned.** In the public copy your nickname is replaced everywhere
  the archive records it - including the sentences the artist typed your name in - and bookmarks are
  not written at all.

The exact list of rules is in [Safety rules this tool follows](#safety-rules-this-tool-follows)
below. `docs/FAQ.md` has the honest version, including what to do if you are nervous.

## What the page can do

![Features in every room page: date jump, translation, days together, message options, media, themes](assets/07-same-in-every-room.svg)

- **Jump to a date.** A real room is thousands of messages long, so the ⋯ button in the top-right
  corner opens a panel whose first tab is the date: pick a month and you are there.
- **Translation.** When the artist writes in Korean and Weverse shows an English line, the page
  prints both and you choose the mode: original + English, original only, or English only.
- **Days together.** The same pill the app shows at the top of a conversation, and still counting:
  open the archive a month later and it says one month more.
- **Bookmarks.** Star any message and it appears in the panel's second tab. The list lives in your
  browser, you can export it as a file, and a later render can bake it back in.
- **Message options.** Copy the text of a message, copy its date and time, or switch the
  translation mode for the whole page.
- **Photos, videos, voice notes and gifts.** Click a photo for full size, with prev/next; gifts
  keep the cover the app shows and open to whatever is inside; voice notes play in the page.
- **Themes and bubble colour.** Light or dark, and the app's ten bubble colours for the artist's
  side, picked from the heart in the days chip.

## What you need, and what it will not do

- **Windows is the tested path** (`START.bat`, `wdm.bat`). The JavaScript modules run wherever
  Node runs; only the launchers are Windows-specific.
- **Node.js 20 or newer**, and a Chromium browser (Chrome, Edge, Brave or Vivaldi; `browserPath`
  in `config.json` points at anything unusual).
- **Only rooms your own account can already read.** This bypasses no membership and no paywall.
- **One room is around 2.5 GB** at full quality (the selected-rooms line quotes a 3 GB ceiling
  until a room has been archived once). The share zip can be built from re-compressed copies instead
  ("Low quality" in a room's **Share** popup: 1280px on the long side, h264 video, 64 kbps audio),
  which needs an `ffmpeg` on `PATH`; the archive on disk keeps its originals either way.
- **Nothing is posted, deleted or changed** on Weverse, and no message can be edited through the
  archive: it is a copy to read.

## Questions people ask

**Does it cost anything?** No. It is a free, open-source tool (MIT licence) with no account, no
subscription and nothing to sign up for.

**Do I need to know anything technical?** No. Install Node.js, double-click `START.bat`, tick a room
and press Start. Everything else is buttons.

**Do you get my Weverse password?** No. You type it into the browser window the tool opens, the way
you would in any browser. It is never written to a file, never logged and never sent to us - there
is nothing of ours to send it to.

**What if it stops halfway, or I close the window?** Nothing is lost. Every page of history is saved
as it arrives, so the next run carries on from there.

**Can I move the archive to another computer?** Yes: copy the whole tool folder. The page is a
normal HTML file, but it points at the media files beside it, so the folder has to travel with it.

**How much space do I need?** About 2.5 GB per room at full quality, most of it photos and video.

More detail: `docs/QUICK-START.md` for the steps, `docs/FAQ.md` for the honest answers,
`docs/ROADMAP.md` for what is planned. The technical detail is folded at the bottom of this file.

---

## The technical part

The short version ends here. This part is how it talks to Weverse, what it writes and where; the
reader page itself - theme colours, the ten bubble colours, the translation modes, how bookmarks are
stored - is folded into the blocks at the end of this file.

### How it works

It reads the history the way you would read it yourself - read-only `GET` requests, human pacing,
one room at a time. It never posts, never deletes, never follows, and never touches the tab you are
logged in on. It does have to sign those requests the way the app does, so the session token is used
**inside its own browser window**: never written to disk, never logged, and never read by the
program outside that window.

A run is five phases (`gui.phase.*` in `src/lang/*.json`):

1. **Starting the browser** - `START.bat` checks Node, then `node src\gui.mjs` serves the local
   page and opens the browser window.
2. **Walking the history backwards** - one JSONL line per page of history into
   `downloads/<room>/`, which is what makes a run resumable.
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
export. The export always points at the original media, so there is no quality knob: one room is
roughly 2.5 GB, almost all of it photos and video. What ships with the repo (fonts, avatars) and
what each file holds is in the folded blocks at the end of this file.

### The reader page, in full

Each block below is folded away - open the one you need.

<details>
<summary><b>The reader page in detail</b></summary>

Both exports are one self-contained page per room, built for offline reading:

- **Private** (`rooms/<room>.html`) - every message from both sides, day sections, the artist's
  messages highlighted, deleted-message markers and your bookmarks.
- **Public** (`rooms-public/<room>.html`) - the artist's side only, never any bookmarks, and your
  nickname replaced by `EverAfter` everywhere the archive records it (including the sentences the
  artist typed it in). `"publicRename"` in `config.json` stays available for extra `find=replace`
  pairs.
- **Day headings** read the way the app writes them - `Sat, Sep 26, 2026` - in the page and in the
  markdown, with the plain `2026-09-26` kept off-screen in the page so find-on-page still works.
- **Theme** - dark is the default; the round button in the bottom-right corner switches to light.
  Your own bubble is near-white (`#f2f3f7`) in light mode with the artist on pastel cyan
  (`#bbf3f6`); dark mode paints the page pure black (`#000`), your bubble `#1f1f1f` and the artist's
  deep cyan (`#016268`) with white letters. The sticky day band wears the same black so nothing
  shows through under the date, one nickname grey (`#666666`) on both sides, and the choice is
  remembered per browser.
- **The ⋯ panel** opens from the right: the date jump as its first tab, your bookmarks as its
  second in the private export (the count rides on the button as a small badge, and the button and
  the tabs carry tooltips) and the translation as the last one whenever the room carries it. The
  panel closes on that button, on ✕, on Esc and on any click outside it. The month chips are a list
  of links in there instead of a row under the title, the bookmark tab carries the JSON export and
  import, and on a wide window the page box narrows by the width of the panel so the reading column
  recentres to the left of it instead of sitting behind it.
- **The header** names the archive instead of the room: `Weverse DM Archive` with a grey `by
  Hauitsu`, the room id in the line under it, and the artist's own picture round and 96px wide
  (`--pf`, one line of CSS; the file itself is 256x256 if you want it 1:1) with the room name beside
  it. The tab title is the room name followed by `DM`, so a row of open archives reads as the rooms
  themselves.
- **A message that is nothing but a photo or a video gets no bubble at all** - the rounded media
  is the message, like in the app. A voice note keeps its bubble (the player needs a body), and so
  do gifts and anything with a caption.
- **Gift bubbles** stay covered exactly like in the app - the pink box with the ribbon and bow -
  and a single tap opens them to the photo, video or voice note inside. No `[gift] NORMAL` caption
  sits on the cover: it stays in the page for screen readers and find-on-page only.
- **The same conversation as text and as data** - `rooms/<room>.md` and `rooms/<room>.jsonl`,
  written in both folders - and **`media/`** holds every photo, video and audio file the
  conversation links to, at the quality Weverse served. Timestamps use the timezone the tool
  detected on the machine.

</details>

<details>
<summary><b>Bubble colour and the days chip</b></summary>

Every conversation opens with the same pill the app puts there: a heart, the number of days you have
been talking, and the words after it. The pill is sticky, riding the top-right of the page the way
the day header rides the top-left, and it settles exactly below that header - never on top of the
date. Only the pill takes clicks; the strip beside it lets the mouse through to the message
underneath.

* **The number** counts from the first message in the archive to **today**, in your own timezone,
  and it is counted in the page itself: leave the archive alone for a month, open it, and it says a
  month more. An archive of a conversation that has ended keeps growing, which is what `+546 days
  together` means in the app.
* **The heart, or the number** opens the ten bubble colours, in the app's own order. Picking one
  recolours that room's artist bubbles and remembers it in this browser only
  (`localStorage["wdm-bub"]`, keyed by room).
* **The words after the number** - click to rename them: anything, up to 15 characters, and the
  default fits that budget too ("days together" is 13, "hari bersama" is 12). Enter saves, Esc drops
  the edit. They start out in the page's language ("days together", "일 함께", "hari bersama").

A room starts on **cyan**, the leftmost swatch, and there is nothing to reset: one pick covers both
themes, so switching to light mode keeps the choice and just uses the pastel of it. The swatches
keep the app's vivid colours in both themes - that is the row the picker shows in the app, and it
does not move when you pick. The bubble is what changes: the deep version in dark mode, where the
letters are always white, and the pastel of the same choice in light mode.

| choice | dark mode | light mode |
|---|---|---|
| cyan | `#016268` | `#bbf3f6` |
| green | `#0b5b1e` | `#DAFDDA` |
| blue | `#00456e` | `#D9EFFF` |
| purple | `#3f3494` | `#E4E3FD` |
| pink | `#6b236f` | `#FDE0FE` |
| yellow | `#6c5301` | `#FFEDC6` |
| orange | `#7e4323` | `#FFE3D6` |
| pink-red | `#79253c` | `#FEDFE4` |
| red | `#7b241b` | `#FFE0DB` |
| grey | `#44474e` | `#45474F` |

The dark set is white-lettered by design. In light mode the letter colour follows the bubble instead
of a hand-kept list: the renderer measures each pastel and picks black or white, so the grey ends up
white on grey while the pastels stay dark - and the message, its translation and its links all move
together. The heart button in the bar wears whatever colour is picked, so the choice is visible with
the picker closed. Your own bubble carries no outline at all - the 1px stays there but transparent,
so both sides keep the same box and nothing shifts. The artist's edge is one nudge toward white
(dark) or black (light), tuned to land the same 1.25:1 step against every fill; the constant is
`OUTLINE_KONTRAS` in `src/render.mjs`.

Nothing else is touched. Your own bubble keeps its colour, gift covers keep their brand pink, and a
message that is nothing but media has no bubble to colour. Cyan is simply where the app starts too,
so an archive nobody has picked a colour in still looks like the app. The chip ships in **both**
exports - it is a reading preference like the theme button, and it carries none of your chat data.
`src/ui.js` builds it after the page loads, so the markup stays lean.

</details>

<details>
<summary><b>Original text and the built-in translation</b></summary>

An artist message can carry two texts: the one the artist typed and the English line Weverse shows
under it. The page prints both - the translation as a smaller italic line inside the same bubble.

How that pair is read is one page-wide choice, not a per-message one. The **Translation** tab in the
panel picks between

* **Original + English** - both, the default,
* **Original** - the words the artist typed, translation hidden,
* **English** - the translation only.

The same three modes are on the ⋯ menu next to any message in the private export (the panel is the
only way in for the public one). The choice is kept in `localStorage`, so it is per browser and per
archive, and it is set on `<html>` before the first paint - a page you read in English mode never
flashes the original first. Bubbles with nothing to translate keep their text in every mode; only
messages that really have both change. The markdown export prints the pair the same way, the italic
line under the original.

The renderer only emits the tab and the menu item when the room carries translations at all, so an
archive without them has no switch and no dead space. `src/ui.js` builds the buttons - the file
carries both texts already, and a mode never loads or rewrites anything.

</details>

<details>
<summary><b>Bookmarks</b></summary>

Bookmarks are yours to make, inside the page. Every message carries the same three-dot button the
app has - it fades in when the pointer is on that row (and stays out of the way otherwise, with the
space always reserved so nothing shifts), and on a touch screen, where there is no hover, it is
always there. It offers

* **Bookmark this message** - the message gets a star and a line in the bookmarks panel, behind
  the ⋯ button in the top-right corner (that panel's second tab, its first is the date jump),
* **Translation** - the same three reading modes as the panel's translation tab (see above); the
  menu item is only a way in, the choice it makes covers the whole page,
* **Copy text** - the words to the clipboard (or the media link, or what kind of media it was),
* **Copy date and time** - the stamp, for quoting a message somewhere else.

The list starts empty and lives in your browser only: `localStorage`, per room, on your own machine.
Nothing is sent anywhere and no file is rewritten. `src/bm.js` builds the buttons after the page
loads, so the markup stays lean - the three-dot buttons for 9,574 messages cost no HTML at all.

**Keeping a list beyond the browser**

* **Export JSON** saves `bookmarks-<slug>.json`, the same shape the renderer reads.
* **Import JSON** reads one back, skipping anything the room does not have or already carries.

Drop an exported file next to the room as `downloads/<slug>/bookmarks.json` and the next render
bakes it in as the starting list. Unstarring a message only hides it from the list - the message
stays in the archive - and starring it again brings it back. The `x` on a row you added yourself
throws that single bookmark away.

</details>

<details>
<summary><b>Offering a complete room to the collector</b></summary>

A room backed up from the very start of the group's history can be handed back to the person who
collects them. The **Share** popup then grows a **Share to Hauitsu** button; pressing it shows his
own short message and a single button that opens the shared drive folder, where the zip can be
dropped. Only a room whose archive starts at April 2025 and still reaches the current month is
offered - a backup that stops three months ago is missing exactly the part nobody can fetch back
later. Holding any such room in full is what counts, whichever room it is; `collectOwned` in
`config.json` can leave slugs out if you would rather not be asked for them. The link itself is not
written out in this repository: it is stitched together when the button is pressed, which keeps it
out of a search box, though not away from anyone who reads the source. `collectUrl` in `config.json`
replaces it. After the first run that leaves you holding such a room, that message also comes up on
its own - once per install. While working on the popup itself, `collectDebug: true` in `config.json`
offers the button on every room, complete archive or not, and shows the message after every finished
run.

</details>

<details>
<summary><b>Fonts, avatars and media</b></summary>

`media/fonts/` and `media/avatars/<room>-artist.*` are the exception to "media is downloaded
output": the emoji fonts and the artist pictures ship with the repo (Apple Color Emoji, with Noto
Color Emoji as the OFL-1.1 fallback), so a fresh clone renders the page the same way on every
machine and never loads a font or a face from the internet. Apple's emoji are what the page uses:
`media/fonts/apple-emoji.woff2` ships cut down to the emoji your archives actually use (about 3 MB),
and `node tools/get-apple-emoji.mjs` rebuilds that cut from a release of
[samuelngs/apple-emoji-ttf](https://github.com/samuelngs/apple-emoji-ttf) (`--remove` deletes it so
the page falls back to Noto). Apple's emoji designs belong to Apple - the upstream repository states
educational use only - so treat the archive as personal use.

The full-size originals stay in `media/avatar-src/` (not published). The avatar circles are
optional: `wdm labels` saves one picture per room as `media/avatars/<room>-artist.<ext>`, and a
shared `media/avatars/artist.png` / `me.png` still works as the fallback. With none of those files
the page is simply rendered without avatars.

</details>

<details>
<summary><b>Room names in the room list</b></summary>

The name the page shows for a room comes from `rowLabel` in `rooms.unis.json` - the text the room
list in the app displays, emoji included. `wdm labels` fills it in: it opens the tool's own browser
window, reads the names off the DM list page (`https://dm.weverse.io/`) and writes them back. `wdm
labels --snippet` prints the same probe for pasting into DevTools instead, and `wdm labels --from
names.json` imports that result. The DM API never carries the artist's own name, only your nickname,
so the list itself is where the names come from.

</details>

<details>
<summary><b>Where the tool keeps its own files</b></summary>

The archive is written inside the folder the tool lives in. The tool's own browser profile - the
window you log in in, kept separate from your normal browser - lives under `%LOCALAPPDATA%` on
Windows.

</details>

## Contributing

Room ids for other groups, UI translations (English, Korean and Indonesian ship today) and bug
reports are welcome - see `docs/ROADMAP.md`.

## License

MIT - see `LICENSE`.
