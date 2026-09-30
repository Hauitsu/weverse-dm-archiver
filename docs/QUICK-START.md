# Quick start

This is the long version of the README. Nothing here asks you to open developer tools, edit a
file, or type a command - but every command is listed too, in case you prefer that.

## 0. What you need

- Windows 10 or 11 (macOS and Linux work too if you run the commands by hand).
- **Node.js 20 or newer.** If you do not have it, double-clicking `START.bat` opens the download
  page and stops; install the LTS version and run `START.bat` again.
- Chrome, Edge, Brave or Vivaldi. The tool starts its own window of whichever it finds first.
- Disk space: about 3 GB per room, plus the same again if you also make the share zip.

## 1. Start it

Extract the folder anywhere (for example `D:\weverse-archive`) and double-click **`START.bat`**.

Two things open:

- a browser window that uses its own profile - it is a separate session, not the browser you
  normally use, so nothing you are logged into elsewhere is affected;
- the local page, usually at `http://127.0.0.1:8787` (only on your own machine). If Windows has
  reserved that port, the tool picks another and the console prints which one it used.

A small console window also appears (minimised). It prints the same progress as the page; it is
safe to close, and closing it stops the tool.

## 2. Log in once

In the browser window that opened, log in to Weverse the normal way and open the artist you want.
The page shows "Waiting for a Weverse login" until the session is live. You only do this once:
the profile is kept in `%LOCALAPPDATA%\weverse-dm-archiver\profile`.

The tool never sees or stores your password, and never reads your login token.

## 3. Pick rooms and press Start

Each row is one DM room, with its size. A room that has been archived once shows what it really
uses; the rest show the ceiling for a whole conversation (up to 3 GB). Tick one or more rooms
and press **Start**. A popup repeats the note about the separate browser window before anything
starts; confirm it. Rooms are archived one after another, never at the same time, with 1.5-3
seconds between pages.

Options:

- **Language (top of the page)** - English, Korean or Indonesian. It switches the whole tool at
  once: the page, the log lines and the exported chat all follow it. `auto` in `config.json`
  follows the Windows language instead.
- **If the login finished but the tool does not notice** - after a minute of waiting, the line reads
  "login success but not detected?" and the **I'm logged in - continue** button appears. It only asks
  for the next check right away (2.5 s becomes 0.25 s); it cannot skip the token check, so a wrong
  press simply keeps waiting.
- **Also make a shareable zip** - ticked by default. After the room is done it writes
  `dist/weverse-dm-<room>.zip` with the public chat, its media and a README in three languages. Only
  artist messages and media are inside; your own messages are left out.
- **Estimated size** - the line under the list adds up every room you tick. It is a ceiling, not a
  promise: this group's conversation starts April 2025, a room that has never been saved is quoted as
  up to `estimateGb` (3 GB), a saved room is projected from its own measured rate, and ticking the
  shareable zip (on by default) adds roughly the same again.
- **Advanced settings** - collapsed, so you can ignore it. The time zone lives there: `auto`
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

- **Open chat** - `rooms/<room>.html` in your normal browser. It works offline. That is your own
  copy (both sides, your harvested nickname); the shareable twin is `rooms/public/<room>.html`,
  where that nickname reads `EverAfter`.
- **Open folder** - the folder holding the archive.
- **Open dist folder** - where the share zips live.

Keep a room folder together: the HTML file links to the photos and videos next to it. Copying
the whole `rooms/` + `media/` pair, or the zip, keeps it working.

## Doing it without the page

```
wdm rooms
wdm all --room yunha --share
```

The first one lists the rooms and what is already archived; the second harvests, renders,
downloads the media and packs the zip. `wdm doctor` explains the environment when something
does not work.

## If something goes wrong

- **"Node.js 20 or newer is required"** - install it from the link that just opened, then start
  `START.bat` again.
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

## Where everything lives

```
rooms/               the private export: html, md, jsonl, summary.json, fonts/ (both sides)
rooms/public/        the public export: artist side only, nickname hidden, no bookmarks
media/               photos/, video/, avatars/, fonts/
downloads/<room>/    the raw pages, one JSONL line each - delete only if you want to start over
dist/                share zips with their .sha256 and .manifest.json
config.json          optional settings (language, tz, browserPath, output, publicRename, pacing)
```

`media/fonts/` already comes with the repo (the emoji font the page links to); everything else
under `media/` is downloaded output. Add `media/avatars/artist.png` and `media/avatars/me.png`
yourself if you want the avatar circles next to the messages.
