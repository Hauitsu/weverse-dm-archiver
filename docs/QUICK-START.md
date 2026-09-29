# Quick start

> Draft - follows M2 in `docs/ROADMAP.md`. Until M2 ships, the steps below describe the
> intended shape, not buttons that exist yet.

## 1. Download

Download the ZIP from the Releases page and extract it anywhere (for example `D:\weverse-archive`).
No need to install Node, Python or anything else: the launcher brings what it needs.

## 2. Run

Double-click `START.bat`. Two things open:

- a dedicated archive browser window (separate profile, your normal browser is untouched),
- the local GUI page at `http://127.0.0.1:8787`.

## 3. Log in and pick a member

Log in to Weverse once in that window. The GUI lists your DM rooms; pick one member (or
"all members") and press **Start**.

Progress is shown page by page. You can close the GUI at any time - every page is written to
disk as it arrives, so running it again resumes from the last page.

## 4. Open the result

When it finishes, press **Open result**. The file `export/<member>.html` opens offline:
text, photos, videos and timestamps in your own timezone.

## 5. If you want to share it

Press **Create compact package**: 480p video, webp photos, your nickname replaced with a
neutral one. The result is about 86 MB for a 16-month archive - small enough to send in a chat.

## If something goes wrong

- Stopped halfway: run it again, nothing is lost.
- A 429/403 warning appears: the tool stops on its own. Wait a few hours, then continue.
- Disk space: compact mode needs ~100 MB, full mode ~2.5 GB per room.
