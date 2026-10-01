# Internals and the reader page

The detail behind `README.md`: what the two exports contain, how the reader page behaves, the ten
bubble colours, the translation modes, how bookmarks are stored, and the small print of the output
folders. Read this if you want to change the renderer, or if you are curious about a specific pixel.

## The reader page in detail

Both exports are one self-contained page per room, built for offline reading:

- **Private** (`rooms/<room>.html`) - every message from both sides, day sections, the artist's
messages
  highlighted, deleted-message markers and your bookmarks.
- **Public** (`rooms-public/<room>.html`) - the artist's side only, never any bookmarks, and your
nickname
replaced by `EverAfter` everywhere the archive records it (including the sentences the artist typed
it
  in). `"publicRename"` in `config.json` stays available for extra `find=replace` pairs.
- **Day headings** read the way the app writes them - `Sat, Sep 26, 2026` - in the page and in the
markdown,
  with the plain `2026-09-26` kept off-screen in the page so find-on-page still works.
- **Theme** - dark is the default; the round button in the bottom-right corner switches to light.
Your own
bubble is near-white (`#f2f3f7`) in light mode with the artist on pastel cyan (`#bbf3f6`); dark mode
paints the page pure black (`#000`), your bubble `#1f1f1f` and the artist's deep cyan (`#016268`)
with
white letters. The sticky day band wears the same black so nothing shows through under the date, one
  nickname grey (`#666666`) on both sides, and the choice is remembered per browser.
- **The ⋯ panel** opens from the right: the date jump as its first tab, your bookmarks as its second
in
the private export (the count rides on the button as a small badge, and the button and the tabs
carry
tooltips) and the translation as the last one whenever the room carries it. The panel closes on that
button, on ✕, on Esc and on any click outside it. The month chips are a list of links in there
instead
of a row under the title, the bookmark tab carries the JSON export and import, and on a wide window
  the page box narrows by the width of the panel so the reading column recentres to the left of it
  instead of sitting behind it.
- **The header** names the archive instead of the room: `Weverse DM Archive` with a grey `by
Hauitsu`, the
room id in the line under it, and the artist's own picture round and 96px wide (`--pf`, one line of
CSS;
the file itself is 256x256 if you want it 1:1) with the room name beside it. The tab title is the
room
  name followed by `DM`, so a row of open archives reads as the rooms themselves.
- **A message that is nothing but a photo or a video gets no bubble at all** - the rounded media is
the
message, like in the app. A voice note keeps its bubble (the player needs a body), and so do gifts
and
  anything with a caption.
- **Gift bubbles** stay covered exactly like in the app - the pink box with the ribbon and bow - and
a
single tap opens them to the photo, video or voice note inside. No `[gift] NORMAL` caption sits on
the
  cover: it stays in the page for screen readers and find-on-page only.
- **The same conversation as text and as data** - `rooms/<room>.md` and `rooms/<room>.jsonl`,
written in both
folders - and **`media/`** holds every photo, video and audio file the conversation links to, at the
quality
  Weverse served. Timestamps use the timezone the tool detected on the machine.

## Bubble colour and the days chip

Every conversation opens with the same pill the app puts there: a heart, the number of days you have
been talking, and the words after it. The pill is sticky, riding the top-right of the page the way
the
day header rides the top-left, and it settles exactly below that header - never on top of the date.
Only the pill takes clicks; the strip beside it lets the mouse through to the message underneath.

* **The number** counts from the first message in the archive to **today**, in your own timezone,
and it is
counted in the page itself: leave the archive alone for a month, open it, and it says a month more.
An
archive of a conversation that has ended keeps growing, which is what `+546 days together` means in
the
  app.
* **The heart, or the number** opens the ten bubble colours, in the app's own order. Picking one
recolours
that room's artist bubbles and remembers it in this browser only (`localStorage["wdm-bub"]`, keyed
by room).
* **The words after the number** - click to rename them: anything, up to 15 characters, and the
default
fits that budget too ("days together" is 13, "hari bersama" is 12). Enter saves, Esc drops the edit.
  They start out in the page's language ("days together", "일 함께", "hari bersama").

A room starts on **cyan**, the leftmost swatch, and there is nothing to reset: one pick covers both
themes,
so switching to light mode keeps the choice and just uses the pastel of it. The swatches keep the
app's
vivid colours in both themes - that is the row the picker shows in the app, and it does not move
when you
pick. The bubble is what changes: the deep version in dark mode, where the letters are always white,
and
the pastel of the same choice in light mode.

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
of a
hand-kept list: the renderer measures each pastel and picks black or white, so the grey ends up
white on
grey while the pastels stay dark - and the message, its translation and its links all move together.
The
heart button in the bar wears whatever colour is picked, so the choice is visible with the picker
closed.
Your own bubble carries no outline at all - the 1px stays there but transparent, so both sides keep
the
same box and nothing shifts. The artist's edge is one nudge toward white (dark) or black (light),
tuned
to land the same 1.25:1 step against every fill; the constant is `OUTLINE_KONTRAS` in
`src/render.mjs`.

Nothing else is touched. Your own bubble keeps its colour, gift covers keep their brand pink, and a
message that is nothing but media has no bubble to colour. Cyan is simply where the app starts too,
so an
archive nobody has picked a colour in still looks like the app. The chip ships in **both** exports -
it is a
reading preference like the theme button, and it carries none of your chat data. `src/ui.js` builds
it after
the page loads, so the markup stays lean.

## Original text and the built-in translation

An artist message can carry two texts: the one the artist typed and the English line Weverse shows
under
it. The page prints both - the translation as a smaller italic line inside the same bubble.

How that pair is read is one page-wide choice, not a per-message one. The **Translation** tab in the
panel
picks between

* **Original + English** - both, the default,
* **Original** - the words the artist typed, translation hidden,
* **English** - the translation only.

The same three modes are on the ⋯ menu next to any message in the private export (the panel is the
only
way in for the public one). The choice is kept in `localStorage`, so it is per browser and per
archive, and it
is set on `<html>` before the first paint - a page you read in English mode never flashes the
original
first. Bubbles with nothing to translate keep their text in every mode; only messages that really
have
both change. The markdown export prints the pair the same way, the italic line under the original.

The renderer only emits the tab and the menu item when the room carries translations at all, so an
archive without them has no switch and no dead space. `src/ui.js` builds the buttons - the file
carries both
texts already, and a mode never loads or rewrites anything.

## Bookmarks

Bookmarks are yours to make, inside the page. Every message carries the same three-dot button the
app
has - it fades in when the pointer is on that row (and stays out of the way otherwise, with the
space
always reserved so nothing shifts), and on a touch screen, where there is no hover, it is always
there.
It offers

* **Bookmark this message** - the message gets a star and a line in the bookmarks panel, behind the
⋯ button
  in the top-right corner (that panel's second tab, its first is the date jump),
* **Translation** - the same three reading modes as the panel's translation tab (see above); the
menu item is
  only a way in, the choice it makes covers the whole page,
* **Copy text** - the words to the clipboard (or the media link, or what kind of media it was),
* **Copy date and time** - the stamp, for quoting a message somewhere else.

The list starts empty and lives in your browser only: `localStorage`, per room, on your own machine.
Nothing
is sent anywhere and no file is rewritten. `src/bm.js` builds the buttons after the page loads, so
the markup
stays lean - the three-dot buttons for 9,574 messages cost no HTML at all.

**Keeping a list beyond the browser**

* **Export JSON** saves `bookmarks-<slug>.json`, the same shape the renderer reads.
* **Import JSON** reads one back, skipping anything the room does not have or already carries.

Drop an exported file next to the room as `downloads/<slug>/bookmarks.json` and the next render
bakes it in as the
starting list. Unstarring a message only hides it from the list - the message stays in the archive -
and
starring it again brings it back. The `x` on a row you added yourself throws that single bookmark
away.

## Offering a complete room to the collector

A room backed up from the very start of the group's history can be handed back to the person who
collects
them. The **Share** popup then grows a **Share to Hauitsu** button; pressing it shows his own short
message and
a single button that opens the shared drive folder, where the zip can be dropped. Only a room whose
archive starts at April 2025 and still reaches the current month is offered - a backup that stops
three
months ago is missing exactly the part nobody can fetch back later. Holding any such room in full is
what
counts, whichever room it is; `collectOwned` in `config.json` can leave slugs out if you would
rather not be
asked for them. The link itself is not written out in this repository: it is stitched together when
the
button is pressed, which keeps it out of a search box, though not away from anyone who reads the
source.
`collectUrl` in `config.json` replaces it. After the first run that leaves you holding such a room,
that
message also comes up on its own - once per install. While working on the popup itself,
`collectDebug: true` in `config.json` offers the button on every room, complete archive or not, and
shows the
message after every finished run.

## Fonts, avatars and media

`media/fonts/` and `media/avatars/<room>-artist.*` are the exception to "media is downloaded
output": the emoji
fonts and the artist pictures ship with the repo (Apple Color Emoji, with Noto Color Emoji as the
OFL-1.1
fallback), so a fresh clone renders the page the same way on every machine and never loads a font or
a
face from the internet. Apple's emoji are what the page uses: `media/fonts/apple-emoji.woff2` ships
cut down
to the emoji your archives actually use (about 3 MB), and `node tools/get-apple-emoji.mjs` rebuilds
that cut
from a release of [samuelngs/apple-emoji-ttf](https://github.com/samuelngs/apple-emoji-ttf)
(`--remove` deletes it
so the page falls back to Noto). Apple's emoji designs belong to Apple - the upstream repository
states
educational use only - so treat the archive as personal use.

The full-size originals stay in `media/avatar-src/` (not published). The avatar circles are
optional:
`wdm labels` saves one picture per room as `media/avatars/<room>-artist.<ext>`, and a shared
`media/avatars/artist.png` / `me.png` still works as the fallback. With none of those files the page
is simply
rendered without avatars.

## Room names in the room list

The name the page shows for a room comes from `rowLabel` in `rooms.unis.json` - the text the room
list in the
app displays, emoji included. `wdm labels` fills it in: it opens the tool's own browser window,
reads the names
off the DM list page (`https://dm.weverse.io/`) and writes them back. `wdm labels --snippet` prints
the same
probe for pasting into DevTools instead, and `wdm labels --from names.json` imports that result. The
DM API
never carries the artist's own name, only your nickname, so the list itself is where the names come
from.

## Where the tool keeps its own files

The archive is written inside the folder the tool lives in. The tool's own browser profile - the
window
you log in in, kept separate from your normal browser - lives under `%LOCALAPPDATA%` on Windows.
