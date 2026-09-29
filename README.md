# Weverse DM Archiver

Back up your own Weverse artist chat (DM) into **one offline HTML file** plus a Markdown
copy: every message, photo, video and timestamp, in your own timezone.

The tool reads your DM history the way you would read it yourself - read-only GET
requests, human pacing, one room at a time. It never posts, never deletes, never follows,
and never touches your login tokens.

> **Status: work in progress.** The export engine and the three-language UI (English,
> Korean, Indonesian) are finished and have already produced a 9,574-message, 18-month
> archive with 1,496 media files. The double-click launcher and the local GUI are next - see
> `docs/ROADMAP.md`.

## What you get

- one self-contained `.html` that opens offline in any browser, plus a `.md` copy
- photos, videos and audio downloaded next to it at original quality
- timestamps in **your** timezone (auto-detected; no question asked)
- day sections, member highlighting, deleted-message markers, bookmarks

## Safety rules this tool follows

| rule | why |
| --- | --- |
| GET only - `/dm/v2.0/messages` and the video `download-info` endpoint | no write reaches your account, ever |
| pacing 1.5-3 s apart with jitter, one room at a time | it looks like a human scrolling |
| stop on HTTP 429/403, no forced retry | never hammer the API |
| never read or copy tokens/cookies | an archive cannot leak what was never read |
| never reload, close or navigate your tab | your session stays exactly as you left it |

Nothing can promise zero risk. `docs/FAQ.md` has the honest version, including what to do
if you are nervous.

## Quick start (coming with M2)

1. Double-click `START.bat`. A browser window opens with its own profile, plus a local page.
2. Log in to Weverse once, pick a member (or "all members"), press Start.
3. Wait. When it is done, press "Open result" - the HTML opens offline.

No terminal, no DevTools, no editing of config files. See `docs/QUICK-START.md`.

## Output layout

```
rooms/            <room>.html, <room>.md, <room>.jsonl, summary.json, fonts/
media/            photos, videos and audio at original quality
downloads/        one JSONL per page of history (resumable)
```

The export always points at the original media, so there is no quality knob: one room is
roughly 2.5 GB, mostly photos and video.

## Privacy

Everything stays on your computer. Nothing is uploaded anywhere, there is no telemetry,
and the archive is plain files you can copy to a drive or delete. If you choose to share an
export with other fans, the renderer can replace nicknames with neutral ones first.

## Contributing

Room ids for other groups, UI translations (English, Korean and Indonesian ship today) and
bug reports are welcome once M2 lands - see `docs/ROADMAP.md`.

## License

MIT - see `LICENSE`.
