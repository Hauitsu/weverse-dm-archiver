# Quick start

This is the long version of the README. Nothing here asks you to open developer tools, edit a
file, or type a command - but every command is listed too, in case you prefer that.

## 0. What you need

- Windows 10 or 11 (macOS and Linux work too if you run the commands by hand).
- **Nothing to install.** The download carries Node.js 20 in `runtime\node\` with ffmpeg next to
  it in `runtime\ffmpeg\`, and `START.bat`/`wdm.bat` run those copies. Only a source copy falls back
  to the `node` on your `PATH` - and then `START.bat` opens the Node download page and stops until
  you install it.
- Chrome, Edge, Brave or Vivaldi. The tool starts its own window of whichever it finds first.
- Disk space: about 3 GB per room, plus the same again if you also make the share zip (a
  re-compressed one is a fraction of that).

## 1. Start it

Get the zip - **Node.js and ffmpeg are already inside it** - from the
[release download](https://github.com/Hauitsu/weverse-dm-archiver/releases/latest/download/weverse-dm-archiver.zip),
extract the folder anywhere (for example `D:\weverse-archive`) and double-click **`START.bat`**.

Two things open:

- the local page, usually at `http://127.0.0.1:8787` (only on your own machine). If Windows has
  reserved that port, the tool picks another and the console prints which one it used;
- a small console window (minimised). It prints the same progress as the page; it is safe to close,
  and closing it stops the tool.

The browser window the archive is made from comes later, when you press **Start** (section 3). It
uses its own profile - a separate session, not the browser you normally use - so nothing you are
logged into elsewhere is affected.

## 2. Sign in

The window you type in is the tool's own, and it opens when you press **Start** (section 3). Signing
in with **Google** works, but it is Google's rule that this window has to be a plain one: Google
refuses to sign anyone in from a browser that is being automated ("this browser or app may not be
secure"), so the window that opens has no debugging port.

Log in to Weverse there, then press **I'm logged in - continue** on the local page (or just close that
window): the tool closes it and takes over the session it left in the profile. That press also starts a
short cooldown (about fifteen seconds, counted down on the page): the window is already opening again, the
button simply stays busy until the cooldown ends, so a second press cannot race the hand-over.
It asks for that press on **every** run, even when the profile still has a session from last time: a
stored login can be stale, and only you can see whether the window really is signed in. If the session
is still not there after a press, the tool does not give up and it does not fail: the sign-in window
comes back, again and again, until you press **Stop**. A login that never arrives is your call, never
an error.

You only sign in once - the profile is kept in `%LOCALAPPDATA%\weverse-dm-archiver\profile` - and
later runs only need that button press.

The tool never sees or stores your password. It does use the session you signed in with: the API
token is read in memory to sign its own GET requests, never written to disk and never logged.

## 3. Pick rooms and press Start

Each row is one DM room, with its size. A room that already has an archive also gets an **Open**
button on the right, which jumps straight to its saved chat page. A room that has been archived
once shows what it really uses; the rest show the ceiling for a whole conversation (up to 3 GB).
Choose one or more rooms
and press **Start**. A popup explains it again - its own profile, sign in in the window that opens,
then press **I'm logged in - continue** - before anything starts; confirm it. Rooms are archived one after another, never at the same time, with 1.5-3
seconds between pages.

The lower half of the page - the size estimate, the zip choice, the Start button - stays hidden
until at least one room is chosen.

Options:

- **Language (top of the page)** - English, Korean or Indonesian. It switches the whole tool at
  once: the page, the log lines and the exported chat all follow it. `auto` in `config.json`
  follows the Windows language instead.
- **If you pressed the button but the session is not found** - the tool looks for a minute, then the
  normal window comes back with the same button, ready for another try. A press cannot skip the session
  check, so one that does not land simply keeps waiting. A minute after a press the button turns into
  **Retry** - nothing retries on its own, you decide when it is worth another look.
- **Signing in with Google** - the button above is also the "done" signal for the normal sign-in
  window; the moment you press it the tool closes that window and takes the session over - and if that session still is not there, the sign-in window comes back instead of the run ending.
- **Also make a shareable zip** - two choices, remembered in `config.json`. **Yes** (the default)
  writes `share/weverse-dm-<room>.zip` with the public chat, its media and a README in three
  languages; only artist messages and media are inside, your own messages are left out. **No** skips
  the zip entirely. A re-compressed zip is not a batch choice: ask for it per room, in that room's
  **Share** popup (next bullet), which is where **Low quality** lives - 1280px on the long side, h264
  video, 64 kbps audio, needing `ffmpeg` (the portable download keeps one in `runtime\ffmpeg\`, and
  that copy is tried first; otherwise your `PATH`). The archive in `rooms/` and `media/` keeps its
  originals either way.
- **Share** (on a room row) - packs that one room on the spot, without touching the others. The
  popup says what the zip is expected to weigh, counted from the files that would go in, and the
  number changes with the quality choice in the same popup.
  **Cancel** closes the popup - and while a zip is being built it stops that job instead: the log in
  the same window says so, the encoder in flight is ended, the half-built package in the temp folder is
  deleted, and the Share buttons come back as soon as the job has unwound.
  The list keeps itself current: once a run ends, the row sizes, the total and the Open and Share
  buttons update within a second, and a room added to `rooms.unis.json` appears on its own.
  A room backed up from the very start of the group's history (April 2025, and still reaching this
  month) also gets **Share to <name>** in that popup: pressing it shows the collector's short message
  and a button that opens the shared drive folder to drop the zip into. A room that has no zip yet
  says so in that same message, pointing back at **Generate zip** in the window behind it. The same
  message comes up on its own once per install, right after the first run that leaves you holding
  such a room. Holding any such room in full is what counts, whichever room it is; `collectOwned` in
  `config.json` can leave slugs out.
- **Estimated size** - the line under the list adds up every room you choose; hover it for the
  reasoning. The estimate is a ceiling, not a promise: this group's conversation starts April 2025, a
  room that has never been saved is quoted as up to `estimateGb` (3 GB), a saved room is projected
  from its own measured rate, and the shareable zip adds roughly the same again at **Yes** - a
  re-compressed one adds far less, and **No** adds nothing.
- **Advanced settings** - collapsed, so you can ignore it. Two settings live in `config.json`
  rather than here: `ffmpegPath`, for when `ffmpeg` is neither the copy inside `runtime\` nor on your
  `PATH`, and `estimateGb`. The file
  is read again whenever it changes, so an edit takes effect on the next poll - no restart needed. The time
  zone lives there in the picker: `auto`
  follows the machine, or pick a zone from the list (`Asia/Jakarta`) to pin one. The timestamps in the
  archive are the only thing it changes.

## 4. Watch, or walk away

The log shows what is happening: how many pages have been read, how many messages are unique so
far, and how many media files are done. Closing the page does not stop the tool; closing the
console window does.

If you press **Stop**, the tool finishes the page it is on and stops. Nothing is lost: every page
is appended to `downloads/<room>/` as it arrives, and the next run continues from the oldest
message already on disk.

## 5. Open the result

When it finishes, the Result panel offers:

- **Open DM** - `rooms/<room>.html` in your normal browser. It works offline. That is your own
  copy (both sides, your harvested nickname); the shareable twin is `rooms-public/<room>.html`,
  where that nickname reads `EverAfter`.
- **Open folder** - the folder holding the archive.
- **Open share folder** - where the share zips live.
- **Open** (on a room row) - the same saved chat page, for a room you are not archiving again.

Keep a room folder together: the HTML file links to the photos and videos next to it. Copying
the whole `rooms/` + `media/` pair, or the zip, keeps it working.

The pill at the top of the conversation follows you down the page and settles under the day heading.
The `+548` counts from the first message to today and goes up by itself as the days pass. Click the
**heart** (or that number) for the app's ten colours - a room starts on cyan, the leftmost one, and
one choice covers both themes - or click the **words** after the number to rename them (15
characters). Both the colour and the words are remembered per room in that browser. Nothing is
uploaded and no file changes.

The three-dot bookmark button only appears on the row your pointer is on.

## Doing it without the page

```
wdm rooms
wdm all --room yunha --share
wdm share --room yunha --low     # a re-compressed zip, needs ffmpeg
```

The first one lists the rooms and what is already archived; the second harvests, renders,
downloads the media and packs the zip. `wdm doctor` explains the environment when something
does not work.

## If something goes wrong

- **"Node.js 20 or newer is required"** - you are running the source copy: the portable download
  carries Node.js in `runtime\node\` and never shows this. Install it from the link that just
  opened, then start `START.bat` again.
- **"No Chrome or Edge found"** - install one, or add `"browserPath": "C:/path/to/browser.exe"`
  to `config.json` (copy `config.example.json` to `config.json` first).
- **The page did not open, or the address looks different** - Windows reserves whole port ranges when
  Hyper-V, WSL or Docker is installed (8572-9871 is a common one). The tool walks past a busy or
  reserved port and prints the address it settled on in the console window; that is the page to use.
- **It stops with "http 403" or "http 429"** - that is the tool protecting your account: it stops
  by itself instead of retrying. Wait a few hours and press Start again; it resumes.
- **"page is not older than the previous one"** - the history is finished, or the cursor went
  stale. Run it again: it restarts from the oldest message on disk.
- **A photo is missing from the page** - run `wdm media --room <room>` again; only the gaps are
  filled. Files already downloaded are left alone.
- **"the archive would need ZIP64"** - one room is over 4 GB. Zip each room separately (the
  default) rather than all of them at once.

## Room names (emoji included)

The room row under the meta line shows the name the DM list shows for the room, emoji and all,
beside the artist's own profile picture. It lives in
`rowLabel` in `rooms.unis.json`, and `node src/cli.mjs labels` fills it in: it opens the tool's own
browser window at `https://dm.weverse.io/`, reads each row, and writes the names back. Prefer to do
it by hand? `node src/cli.mjs labels --snippet` prints a probe for the DevTools console of that page;
save what it prints and run `node src/cli.mjs labels --from <file>`. Re-render the room afterwards so
the headers pick the new name up.

## Where everything lives

```
rooms/               the private export: html, md, jsonl, summary.json, fonts/ (both sides)
rooms-public/        the public export: artist side only, nickname hidden, no bookmarks
media/               photos/, video/, avatars/, fonts/
downloads/<room>/    the raw pages, one JSONL line each - delete only if you want to start over
share/                the zips you send, one per room
verify/               .sha256 + .manifest.json of each zip (nothing to send)
config.json          optional settings (language, tz, browserPath, output, publicRename, pacing)
```

`media/fonts/` already comes with the repo (the emoji font the page links to); everything else
under `media/` is downloaded output. The avatar circles come from `media/avatars/<room>-artist.<ext>`
(what `wdm labels` saves) or a shared `artist.png` / `me.png`. The emoji font the page links to
already ships in `media/fonts/` (Apple); `node tools/get-apple-emoji.mjs` re-cuts it from upstream
and `--remove` falls back to the bundled Noto font (see the FAQ).

## Bookmarks (optional)

Nothing to harvest: bookmarks are made inside the page. Open a private export, press the three dots
next to a message and pick **Bookmark this message** - the message gets a star and a line in the
bookmarks panel, behind the ⋯ button in the top-right corner (that panel's second tab, its first is the
date jump and its last, when the room has translations, is the reading switch). The list starts empty
and lives in your
browser (`localStorage`, per room);
**Export JSON** in that list saves it as `bookmarks-<slug>.json` and **Import JSON** reads one back.

To bake a list into every future render, drop that file next to the room:

    downloads/<slug>/bookmarks.json

`node src/cli.mjs render --room <slug>` then starts the page with those bookmarks already there, and
you can still add or hide them one by one in the browser. The public export never carries a bookmark.
See the README, section Bookmarks.
