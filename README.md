# Fluus · فلوس 💸

A local-first monthly spending tracker PWA — set a starting balance, log spendings
under your own categories, and always know what's left, how fast it's going, and
where it went.

**Live app:** https://YOUR-APP.vercel.app <!-- replace with your Vercel URL -->

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vanilla HTML / CSS / JS — no framework, no build step | The app is one screen of state-driven UI; a framework would add a build pipeline and ~100 KB to ship what `innerHTML` render functions do in plain JS. Ships exactly the bytes written. |
| Typography | Outfit (body) + Space Grotesk (numerals/display) | Distinct numeric identity for a money app; `tabular-nums` keeps amounts aligned. |
| Icons | Inline SVG sprite, 38 thin-line glyphs | Zero network requests, colored via `currentColor` so every icon inherits its category color and adapts to both themes. |
| Data | `localStorage` (device) + Supabase Postgres `jsonb` (cloud) | Local-first: the network is never on the critical path. |
| Auth | Supabase email OTP codes | Magic links open in Safari instead of the installed PWA on iOS — codes typed in-app don't have that problem. |
| Hosting | Vercel (static) | No server exists to cold-start, time out, or pay for. |

## How it's managed

### State & rendering
The entire app is one JSON state object — categories, months (starting balance +
transactions), currency, timestamps. Every interaction mutates state, persists to
`localStorage`, and calls targeted render functions that rebuild their DOM section
from template strings. All clicks route through a single delegated listener on
`document` (`data-*` attributes), so re-rendered HTML never needs listeners
re-attached. Transactions store a **snapshot** of their category (name, icon,
color) — deleting a category never breaks history or charts.

### Design system
All colors flow through CSS custom properties defined twice: a dark theme
("Aurora Vault" — animated emerald/violet/cyan orbs over ink-translucent cards)
and a warm-paper light theme. The toggle persists per device, defaults to system
preference, and is applied by an inline `<head>` script before first paint (no
flash). Motion is transform/opacity-only with custom cubic-béziers;
`backdrop-filter` is restricted to fixed overlays (mobile GPU cost);
`prefers-reduced-motion` collapses all animation.

### Offline & PWA
`manifest.webmanifest` makes it installable (standalone fullscreen, home-screen
icon); `sw.js` makes it offline:

| Resource | Strategy |
|---|---|
| App shell (HTML/CSS/JS/icons) | precached, cache-first → instant startup |
| `js/config.js` | network-first → key changes apply immediately |
| Google Fonts + jsDelivr | stale-while-revalidate |
| Navigations | network, offline-fallback to cached shell |

Updates ship by bumping the `CACHE` version string — installed clients swap the
entire shell atomically on next launch. `sw.js` lives at the repo root because a
service worker can only control paths at or below its own.

### Cloud sync
The whole state syncs as **one `jsonb` document per user** in a single
`app_state` table. Every local change schedules a debounced push (~1.5 s); on
sign-in the app pulls and keeps whichever copy has the newer `updatedAt`
(last-write-wins, with an empty local state always deferring to the cloud).
Rationale: the client computes everything — the server is a backup drive, not a
brain — so one upsert replaces an entire row-level sync protocol. Offline edits
push automatically on reconnect.

### Security & privacy
- **Row Level Security** is the entire security model: policies bind every row
  to `auth.uid()`, so the publishable key shipped in `js/config.js` grants a
  stranger access to exactly nothing. The database is the bouncer; there is no
  server code to get wrong.
- **Sign-out wipes the device**: pending changes are force-pushed first (sign-out
  aborts if the flush fails — data is never destroyed unless it's safely in the
  cloud), then `localStorage` is cleared and the app resets to first-run.
- Sessions auto-refresh indefinitely; the installed PWA is exempt from Safari's
  7-day storage purge.

## Structure

```
├── index.html              entry + inline SVG icon sprite
├── sw.js                   service worker (root — scope rule)
├── manifest.webmanifest    PWA identity
├── css/styles.css          theme tokens, styling, motion
├── js/app.js               logic, rendering, sync engine
├── js/config.js            Supabase URL + publishable key
└── icons/                  PWA icons
```
