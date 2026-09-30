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
- `rooms-public/<room>.html` - the **public** export: the artist side only, never any bookmarks,
  and your own nickname replaced by `EverAfter` - the copy that is safe to hand to someone else
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

Press **Stop** at any moment, or close everything. Every page is written to disk as it arrives,
so running it again continues where it stopped instead of starting over. The full walkthrough,
including what each message means, is in `docs/QUICK-START.md`.

## Command line

`wdm.bat` (or `node src/cli.mjs`) does the same work without the page:

| command | what it does |
| --- | --- |
| `wdm rooms` | list the rooms in `rooms.unis.json` and what is already archived |
| `wdm harvest --room yunha` | walk the history backwards (starts the private browser) |
| `wdm render --room yunha` | build both exports (private + public) from what is on disk |
| `wdm media --room yunha` | download the photos and video the export points at |
| `wdm share --room yunha` | one zip in `share/`, built from the public export |
| `wdm all --room yunha --share` | all of the above, in order |
| `wdm doctor` | check node, browser, rooms and folders |

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

`media/fonts/` is the one exception to "media is downloaded output": the emoji font ships with the
repo (Noto Color Emoji, OFL-1.1), so a fresh clone renders the page the same way on every machine
and never loads a font from the internet. The avatar circles are optional - drop your own
`media/avatars/artist.png` and `media/avatars/me.png` there before rendering and the page shows
them next to the messages; without those two files the page is simply rendered without avatars.

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
