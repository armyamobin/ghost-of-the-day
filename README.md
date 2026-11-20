# 👻 Ghost of the Day

A **daily ghost-hunting puzzle that lives inside a Reddit post**. Everyone in the
world gets the same haunted mansion at 00:00 UTC, six candles, and one ghost to
find. Streaks, a daily leaderboard, and a Wordle-style result grid you can post
straight into the thread.

Built on the [Reddit Developer Platform (Devvit Web)](https://developers.reddit.com/docs)
with TypeScript, no UI framework, and Redis for state.

---

## Screenshots

| In-feed post | The mansion | Caught |
| --- | --- | --- |
| ![inline post](assets/screenshots/01-inline-post.png) | ![mansion](assets/screenshots/02-mansion.png) | ![result](assets/screenshots/03-result.png) |

---

## How the game works

- The mansion is a **7 × 7 grid of rooms**.
- A ghost hides in one room. You get **6 candle sweeps**.
- Each sweep reports how loud the ghost's presence is in that room, as a distance
  band through the mansion:
  - 👻 **IT IS HERE** — you caught it
  - 🔥 **SCORCHING** — 1–3 rooms away
  - 🌡️ **WARM** — 4–6 rooms away
  - 🧊 **FREEZING** — 7+ rooms away
- Sweep all six candles without a catch and the ghost escapes until tomorrow.
- Catch it and your **streak** grows; it resets the moment you miss a day.

Difficulty was tuned by simulation, not vibes: on this grid and budget a careful
solver catches the ghost **~98%** of the time in an average of **4.5 candles**, a
careless one **~83%**. Most players win, everyone sweats, nobody wins on luck alone.

### Same ghost for everyone, stored nowhere

The ghost's room is derived from the UTC date with a seeded PRNG
(`mulberry32(fnv1a("ghost-of-the-day:v1:" + day))`). No puzzle table, no cron job
that has to run before people can play, no way for a late player to get a
different ghost — and the server never sends the room to the client until the
player's day is over.

---

## Run it

### Play the design right now (no Reddit account needed)

```bash
npm install
npm run preview      # builds the app + a single-file playable preview
```

Then open `preview/ghost-of-the-day-preview.html` in any browser. That file is
the **real shipped client bundle** talking to a mock `fetch` layer, so what you
see is what players get.

### Run it as a real Reddit app

```bash
npm install
npm run dev          # esbuild watchers for client + server
devvit login         # one-time, opens the browser
devvit playtest <your-test-subreddit>   # installs into your test sub
```

`devvit playtest` gives you a live link where every change hot-reloads. When it
looks right:

```bash
npm run upload       # private/unlisted version for review
npm run publish      # public app
```

`devvit.json` uses the standard Devvit Web layout: `post.entrypoints` for the
webviews, `server: {}` for the bundled node server, plus `redis`, a Reddit API
permission, a mod menu item, an install trigger, and a midnight cron.

---

## Project layout

```text
ghost-of-the-day/
├── devvit.json                 # entry points, permissions, cron, menu, triggers
├── public/                     # the webview ships from here
│   ├── splash.html             # inline post view (the "poster")
│   ├── game.html               # expanded, playable view
│   ├── ghost.css               # all styling, zero external assets
│   └── game.js / splash.js     # esbuild output (gitignored)
├── src/
│   ├── shared/
│   │   ├── daily.ts            # ⭐ the rules: dates, seeded ghost, bands, share text
│   │   └── api.ts              # the client ⇄ server contract (paths + payloads)
│   ├── server/
│   │   ├── index.ts            # createServer(onReq)
│   │   ├── server.ts           # router: /api/* and /internal/*
│   │   ├── game.ts             # authoritative rules, streaks, book-keeping
│   │   └── db.ts               # every Redis key, in one place
│   └── client/
│       ├── splash.ts           # poster → requestExpandedMode(ev, 'game')
│       ├── game.ts             # the mansion, candles, result card
│       ├── ui.ts               # DOM helpers + renderers
│       └── api.ts              # typed fetch wrappers
├── preview/                    # offline playable build (demo + design review)
└── src/shared/daily.test.ts    # rule tests (determinism, bands, day math, share text)
```

### Server is authoritative

The client never decides anything. It asks `GET /api/state`, and every tap sends
`POST /api/probe { i }`; the server re-derives the ghost from the date, computes
the reading, spends the candle, and returns the new state. Refreshing the page,
editing the JS, or replaying a request cannot buy an extra candle or a streak —
`finalize()` is idempotent per player per day.

### Redis keys (per subreddit installation)

| Key | Type | Holds |
| --- | --- | --- |
| `play:{day}` | hash | `userId → { probes, status }` |
| `stats` | hash | `userId → { streak, best, last, wins, plays }` |
| `board:{day}` | zset | today's catches, score = `6 − candles used` |
| `board:streak` | zset | longest active streaks |
| `daystat:{day}` | hash | community plays / catches / candles (14-day TTL) |
| `post:{day}` | string | today's post id + url, so cron/install never double-post |

Devvit Redis cannot be scanned, so every key name is derived from a day or a user
and each collection is a single hash or sorted set.

---

## The social layer (the bit that makes it a Reddit game)

- **Share to thread** posts the player's result as a comment on the very post they
  are playing in — with the grid wrapped in Reddit spoiler tags (`>!…!<`) so the
  evening crowd can still play the day. Posted as the player (`runAs: 'USER'`),
  falling back to the app account if that is refused.
- **Tonight's fastest** (`zRange … reverse`) and **🔥 Longest streaks** give the
  subreddit something to defend.
- **Community stats** — hunters today, catch rate, average candles — turn a solo
  puzzle into a shared daily event, and they are computed with atomic `hIncrBy`
  counters.
- **Midnight cron** posts `👻 Ghost of the Day #N` automatically; the mod menu item
  `👻 Post today's ghost hunt` makes one on demand. Both are idempotent per day.

---

## Checks

```bash
npm test          # tsc --build (client + server + shared) then the rule tests
npm run build     # esbuild client + server bundles
```

The rule tests cover the things that would silently ruin a daily game: the ghost
is deterministic and in range every day, band boundaries match the mansion
geometry, `+1 day` always means `+1 day number` across month and year ends, and
the share text never leaks the answer outside a spoiler tag.

---

## Tuning knobs

Everything lives at the top of `src/shared/daily.ts`:

| Knob | Default | Effect |
| --- | --- | --- |
| `GRID` | 7 | mansion size (7 × 7 = 49 rooms) |
| `CANDLES` | 6 | tries per day |
| `BAND_MAX` | `[0, 3, 6]` | distance bands — wider bands = harder |
| `EPOCH_DAY` | `2026-01-01` | day #1, so the post number reads nicely |

Want it harder? Shrink the bands (`[0, 2, 4]`) or drop to five candles. Want it
gentler for week one? Add a candle. Re-run the check in `preview/` and listen to
yourself play it.

---

## Notes / limits

- **One ghost per UTC day, for everyone.** That is deliberate — a shared puzzle is
  what makes the comment thread worth reading.
- Streaks require a per-user read-modify-write on `finalize()`. It is guarded by
  `stats.last === day`, so a double submit cannot double-count, but two *truly*
  simultaneous finishes from one user are theoretically last-write-wins. Fine for
  a daily game; switch to `redis.watch()` transactions if you ever care.
- Guests (logged out) can see the poster and the leaderboard but cannot probe.
- `daily.ts` is the only place rules live. `preview/mock-server.js` deliberately
  duplicates them for the offline demo — it never ships to Reddit.
