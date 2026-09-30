# Weverse DM Archiver

Back up your own Weverse artist chat (DM) into **one offline HTML file**, plus a Markdown copy
and a data file: every message, photo, video and timestamp, in your own timezone.

It reads the history the way you would read it yourself - read-only GET requests, human
pacing, one room at a time. It never posts, never deletes, never follows, never reads your
login tokens, and never touches the tab you are logged in on.

> **Status: ready to use.** Double-click `START.bat`, log in once, pick a room, press Start.
> A real room has already been through it: 9,574 unique messages across 18 months, 4,119 of them
> from the artist side, 1,478 media files (1,444 photos, 30 videos, 4 audio), about 2.5 GB.

## What you get

- `rooms/<room>.html` - the **private** export: every message from both sides, one self-contained
  page that opens offline in any browser, with day sections, artist highlighting,
  deleted-message markers and bookmarks
- `rooms-public/<room>.html` - the **public** export: the artist side only, never any bookmarks and no
  panel, and your own nickname replaced by `EverAfter` - the copy that is safe to hand to someone else
- day headings read the way the app writes them - `Sat, Sep 26, 2026`, in the page and in the
  markdown, with the plain `2026-09-26` kept off-screen in the page so find-on-page still works
- a light theme for the page itself, switched from the round button in the bottom-right corner: there your own
  bubble is near-white (`#f2f3f7`) and the artist's starts on the pastel cyan (`#bbf3f6`), while the dark
  theme shows that same pick deep (`#016268` with white letters, beside your `#1f1f1f`), and it paints the
  page behind them pure black (`#000`) - the sticky day band wears the same black, so nothing shows through
  under the date; one nickname grey (`#666666`) on both sides in both themes, and the choice is remembered
  per browser - dark stays the default
- two round icon buttons in the top-right corner open one panel from the right: the date jump first,
  your bookmarks second (the ★ carries the count as a small badge, both carry a tooltip). The panel
  closes on its own button, on ✕, on Esc, and on any click outside it. The month chips are a list of
  links there instead of a row under the title, the bookmark tab carries the JSON export and import, and
  on a wide window the page box narrows by the width of the panel so the reading column recentres to the
  left of it instead of sitting behind it (the column keeps its auto margins - a fixed width would only
  push it right and leave the gap on the left)
- the days-together chip the app shows at the top of a conversation: it stays pinned while the page
  scrolls, parking just under the day header so the two read as one HUD. The number is **live** -
  every day you open the archive it says one more - and behind it sit the app's ten bubble colours:
  the heart or the number opens the swatch row, the words after it are yours to rename
  (15 characters). Only the artist bubble takes the colour, only in that room, and only in your
  browser - see [Bubble colour and the days chip](#bubble-colour-and-the-days-chip)
- a header that names the backup instead of the room: `Weverse DM backup` with a grey `by Hauitsu`, and the
  room sits right under that grey line - the artist's own picture, round and 96px wide (`--pf`, one line of
  CSS, and the file itself is 256x256 if you want it 1:1) with the room name beside it. The room id rides in
  the grey line under the title, at the front. The tab title is the room name followed by `DM`, so a row of
  open archives reads as the rooms themselves
- a message that is nothing but a photo or a video gets no bubble at all - the rounded media is
  the message, like in the app. A voice note keeps its bubble (the player needs a body), and so do
  gifts and anything with a caption
- gift bubbles stay covered exactly like in the app - the pink box with the ribbon and bow -
  and a single tap opens them to reveal the photo, video or voice note inside. No `[gift] NORMAL`
  caption sits on the cover: it stays in the page for screen readers and find-on-page only, and the
  cover itself carries no tooltip
- `rooms/<room>.md` and `rooms/<room>.jsonl` - the same conversation as text and as data, written
  in both folders
- `media/` - every photo, video and audio file the conversation links to, at the quality
  Weverse served
- timestamps in **your** timezone, detected from the machine
- optionally `share/weverse-dm-<room>.zip` - one file per room, built from the **public** export
  plus exactly the media that page points at, with a three-language `README.txt` for whoever you
  send it to

## Quick start

1. Install **Node.js 20 or newer** if you do not have it. `START.bat` opens the download page
   when it cannot find Node.
2. Double-click **`START.bat`**. Two windows appear: a browser using its own private profile, and
   the local page (usually `http://127.0.0.1:8787`; if that port is taken by the system, the tool
   picks another one and the console prints the address it used).
3. Log in to Weverse once in that browser window.
4. Tick a room and press **Start** - the popup explains the separate browser window first (hovering
   the button says the same) - then confirm. Progress streams page by page.
5. When it finishes: **Open chat**, **Open folder**, or take the share zip from `share/` - it is made
   by default, and the picker can ask for a re-compressed one instead, or for none at all.

Every room row carries its own **Share** button next to **Open**: it packs that single room into
`share/` on the spot - full quality or re-compressed - and once a zip exists the same popup opens
the folder that holds it. A room that was never run says so instead, because a zip is built from
the public export and nothing else.

Press **Stop** at any moment, or close everything. Every page is written to disk as it arrives,
so running it again continues where it stopped instead of starting over. The full walkthrough,
including what each message means, is in `docs/QUICK-START.md`.

## Command line

`wdm.bat` (or `node src/cli.mjs`) does the same work without the page:

| command | what it does |
| --- | --- |
| `wdm rooms` | list the rooms in `rooms.unis.json` and what is already archived |
| `wdm labels` | read the room names off the DM list into `rooms.unis.json` (emoji and all), and saves each room's profile picture |
| `wdm harvest --room yunha` | walk the history backwards (starts the private browser) |
| `wdm render --room yunha` | build both exports (private + public) from what is on disk |
| `wdm media --room yunha` | download the photos and video the export points at |
| `wdm share --room yunha` | one zip in `share/`, built from the public export |
| `wdm all --room yunha --share` | all of the above, in order |
| `wdm doctor` | check node, browser, rooms and folders |

The name the page shows for a room comes from `rowLabel` in `rooms.unis.json` - the text the room
list in the app displays, emoji included. `wdm labels` fills it in: it opens the tool's own browser
window, reads the names off the DM list page (`https://dm.weverse.io/`) and writes them back.
`wdm labels --snippet` prints the same probe for pasting into DevTools instead, and
`wdm labels --from names.json` imports that result. The DM API never carries the artist's own name,
only your nickname, so the list itself is where the names come from.

## Output layout

```
rooms/               private export: <room>.html, <room>.md, <room>.jsonl, summary.json, fonts/
rooms-public/        public export: the same files for the artist side only
media/               photos/, video/, avatars/, fonts/ at original quality
downloads/<room>/    one JSONL line per page of history (this is what makes it resumable)
share/                share zips: weverse-dm-<room>.zip, one per room
verify/               .sha256 + .manifest.json of each zip (nothing to send)
```

Rooms never share a folder under `downloads/`, so one room history can never leak into another
room export. The export always points at the original media, so there is no quality knob: one
room is roughly 2.5 GB, almost all of it photos and video.

`media/fonts/` and `media/avatars/<room>-artist.*` are the exception to "media is downloaded output":
the emoji fonts and the artist pictures ship with the repo (Apple Color Emoji, with Noto Color Emoji as
the OFL-1.1 fallback), so a fresh clone renders the page the same way on every machine and never loads a
font or a face from the internet. The full-size originals stay in `media/avatar-src/` (not published). The avatar circles are
optional: `wdm labels` saves one picture per room as `media/avatars/<room>-artist.<ext>`, and a shared
`media/avatars/artist.png` / `me.png` still works as the fallback. With none of those files the page is
simply rendered without avatars.

Apple's emoji are what the page uses: `media/fonts/apple-emoji.woff2` ships with the repo, cut
down to the emoji your archives actually use (about 3 MB), so a fresh clone renders with Apple
emoji without running anything. `node tools/get-apple-emoji.mjs` rebuilds that cut from a release
of [samuelngs/apple-emoji-ttf](https://github.com/samuelngs/apple-emoji-ttf), and `--remove`
deletes it so the page falls back to the Noto Color Emoji (OFL-1.1) that also ships here. Apple's
emoji designs belong to Apple - the upstream repository states educational use only - so treat the
archive as personal use.

## Safety rules this tool follows

| rule | why |
| --- | --- |
| GET only - `/dm/v2.0/messages` and the video `download-info` endpoint | no write reaches your account, ever |
| pacing 1.5-3 s apart with jitter, one room at a time | it looks like a human scrolling |
| stop on HTTP 429/403, no forced retry | never hammer the API |
| never read or copy tokens/cookies | an archive cannot leak what was never read |
| its own browser window and profile | the session you browse with is never reloaded, closed or navigated |

Nothing can promise zero risk. `docs/FAQ.md` has the honest version, including what to do if you
are nervous.

## Privacy

Everything stays on your computer. Nothing is uploaded, there is no telemetry and no account of
ours; the archive is plain files you can copy to a drive, share or delete.

Every render writes two exports, because they answer two different questions. `rooms/` is yours:
both sides of the conversation, bookmarks included, real text. `rooms-public/` keeps only the artist
side, never writes bookmarks, and hides your own nickname as well. The archive already records that
name - every message you sent carries it - so each occurrence is replaced without you typing
anything, including the sentences where the artist typed it. It always becomes `EverAfter`, so there
is no setting to get wrong; `"publicRename"` in `config.json` stays available for extra
`find=replace` pairs. The share zip is always built from the public export,
and only the media that page points at is copied into it, so nothing you sent is packaged for
someone else. If you would rather not share anything, `share/` is just a folder you can delete.

## Limits

- Node.js 20 or newer, and a Chromium browser (Chrome, Edge, Brave or Vivaldi; point
  `browserPath` in `config.json` at anything unusual).
- Only rooms your own account can already read - this bypasses no membership and no paywall.
- One room is around 2.5 GB at full quality (hovering the selected-rooms line quotes a 3 GB ceiling
  until a room has been archived once). The share zip can be built from re-compressed copies instead
  ("Yes but Low Quality": 1280px on the long side, h264 video, 64 kbps audio), which needs an
  `ffmpeg` on `PATH`; the archive on disk keeps its originals either way.
- Windows is the tested path (`START.bat`, `wdm.bat`). The JavaScript modules run wherever Node
  runs; only the launchers are Windows-specific.

## Contributing

Room ids for other groups, UI translations (English, Korean and Indonesian ship today) and bug
reports are welcome - see `docs/ROADMAP.md`.

## License

MIT - see `LICENSE`.

## Bubble colour and the days chip

Every conversation opens with the same pill the app puts there: a heart, the number of days you have
been talking, and the words after it. The pill is sticky, so it rides along the top-right of the page
the way the day header rides the top-left - it settles exactly below that header, never on top of the
date. Only the pill takes clicks: the strip beside it lets the mouse through to the message
underneath.

* **The number** counts from the first message in the archive to **today**, in your own timezone, and
  it is counted in the page itself: leave the archive alone for a month, open it, and it says a month
  more. An archive of a conversation that has ended keeps growing, which is what
  `+546 days together` means in the app.
* **The heart, or the number** - opens the ten bubble colours, in the app's own order. Picking one
  recolours that room's artist bubbles and remembers it in this browser only
  (`localStorage["wdm-bub"]`, keyed by room).
* **The words after the number** - click to rename them: anything, up to 15 characters, and the
  default fits that budget too ("days together" is 13, "hari bersama" is 12). Enter saves, Esc drops
  the edit. They start out in the page's language ("days together", "일 함께", "hari bersama").

A room starts on **cyan**, the leftmost swatch, and there is nothing to reset: one pick covers both
themes, so switching to light mode keeps the choice and just uses the pastel of it.

The swatches keep the app's vivid colours in both themes - that is the row the picker shows in the
app, and it does not move when you pick. The bubble is what changes: the deep version in dark mode,
where the letters are always white, and the pastel of the same choice in light mode.

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
Your own bubble carries no outline at all - the 1px stays there but transparent, so both sides keep the same
box and nothing shifts. The artist's edge is one nudge toward white (dark) or black (light), tuned to land
the same 1.25:1 step against every fill; the constant is `OUTLINE_KONTRAS` in `src/render.mjs`.
the picker closed.

Nothing else is touched. Your own bubble keeps its colour, gift covers keep their brand pink, and a
message that is nothing but media has no bubble to colour. Cyan is simply where the app starts too,
so an archive nobody has picked a colour in still looks like the app.

The chip ships in **both** exports - it is a reading preference like the theme button, and it carries
none of your chat data. `src/ui.js` builds it after the page loads, so the markup stays lean.

## Bookmarks

Bookmarks are yours to make, inside the page. Every message carries the same three-dot button the
app has - it fades in when the pointer is on that row (and stays out of the way otherwise, with the
space always reserved so nothing shifts), and on a touch screen, where there is no hover, it is
always there. It offers

* **Bookmark this message** - the message gets a star and a line in the bookmarks panel, the ★ button in
  the top-right corner (its first tab is the date jump),
* **Copy text** - the words to the clipboard (or the media link, or what kind of media it was),
* **Copy date and time** - the stamp, for quoting a message somewhere else.

The list starts empty and lives in your browser only: `localStorage`, per room, on your own
machine. Nothing is sent anywhere and no file is rewritten. `src/bm.js` builds the buttons after the
page loads, so the markup stays lean - the three-dot buttons for 9,574 messages cost no HTML at all.

**Keeping a list beyond the browser**

* **Export JSON** saves `bookmarks-<slug>.json`, the same shape the renderer reads.
* **Import JSON** reads one back, skipping anything the room does not have or already carries.

Drop an exported file next to the room as `downloads/<slug>/bookmarks.json` and the next render
bakes it in as the starting list. Unstarring a message only hides it from the list - the message stays
in the archive - and starring it again brings it back. The `x` on a row you added yourself throws that
single bookmark away.

Bookmarks only ever appear in the **private** export (`rooms/<slug>.html`). The public export
carries none at all, and nothing here touches your nickname.

Each row in the list has two jumps on purpose: the text goes to the message bubble, the date goes to
that day divider. The bubble jump carries a 44px scroll margin so the sticky day header never covers
the message you asked for.
