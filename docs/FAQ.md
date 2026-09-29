# FAQ

## Can my account get banned for this?

Honest answer: nobody outside Weverse can promise anything. What this tool does is stay
inside what a normal reader does - it only GETs the same two endpoints the app itself
calls, paces requests 1.5-3 seconds apart with jitter, one room at a time, and stops
immediately on 429/403 instead of retrying. It never posts, never deletes, never follows,
never reads your tokens, and never touches the tab you are logged in on.

If you are nervous, use the slow pace profile (or archive one room per day). A backup can
always be finished later: every page is written to disk as it arrives, so stopping and
resuming costs you nothing.

## Do I need to know how to code, or open DevTools?

No. That is exactly what M2 (see `docs/ROADMAP.md`) is for: you double-click one file, a
browser opens, you log in, you pick a member, you press Start. Everything else is a
progress bar.

## Will it close my browser or log me out?

No. The tool opens its **own** browser profile with its own window. The tab and profile you
normally use are not touched or read.

## Can I keep using Weverse while it runs?

Yes, for reading. The tool works on its own profile, so nothing you do in your normal
window interferes. Just avoid running two archives of the same room at the same time.

## How big is the result?

About 2.5 GB for a full-quality archive with all media (measured on a 9,574-message,
16-month room with 1,496 media files). The compact mode - 480p video and webp photos -
brings the same archive to ~86 MB, which is what you normally share with friends.

## What timezone are the timestamps in?

Yours, detected automatically from your machine. The API only sends absolute UTC
timestamps, and the Weverse app itself renders them in the viewer device zone, so this is
the same thing you already see in the app. Advanced users can pin a zone with the `DM_TZ`
environment variable (for example `DM_TZ=Asia/Jakarta`).

## Do I need a Weverse account with DM access?

Yes - you can only archive rooms you are already a member of, using your own account.
The tool does not bypass any membership or paywall.

## Will my nickname / user id end up in the archive?

Your own messages carry your nickname, because that is what the room shows. If you share
an export, run the public builder first: it replaces your nickname with a neutral one and
drops everything that is not the artist side of the conversation.

## Does it work for other artists or groups?

The engine is generic - it needs a room id, which you can read from the DM list with a
small read-only snippet (see `docs/room-id.md`). The repo ships 8 UNIS room ids as an example
in `rooms.unis.json`.

## Is this affiliated with Weverse?

No. It is an unofficial fan tool, MIT licensed, with no affiliation to Weverse or HYBE.
