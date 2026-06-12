# Fluus · فلوس 💸

Your personal monthly spending tracker — the digital upgrade of the Notes-app ritual.
Set what you're starting the month with, create your own categories, log spendings
under them, and always know exactly what's left.

**Zero-dependency frontend** — plain HTML/CSS/JS, no framework, no build step.
Works fully offline as an installable PWA, with optional cloud sync via Supabase.

## Features

- 🟢 **Animated balance ring** — what's left, % of budget, color shifts as money runs low
- ☀️ **Safe-to-spend today** — remaining ÷ days left, recalculated live
- 🐎 **Pace tracking** — ahead or behind the ideal burn rate, plus projected end-of-month balance
- ⚡ **Quick-add chips** + custom keypad bottom sheet with live "left after" preview
- 🏷️ **Your own categories** — created by each user with a name, icon, and auto-assigned color; remove them anytime via **manage** (past spendings keep their look — every transaction stores a snapshot of its category)
- 🎨 **SVG icon system** — 38 thin-line icons in an inline sprite, colored via `currentColor`; no emoji, no icon font, no requests
- 📊 **Charts** — daily spending bars (today highlighted) + "where it went" donut with tappable legend that filters history
- 🗂️ **History** grouped by day with subtotals, category filters, tap-to-edit, undo delete
- 📅 **Month navigation** — every month is its own notebook; carry over last month's leftover with one tap
- 🌗 **Dark / light themes** — full two-theme token system, toggle in the header, follows system preference by default, persists per device, no flash on load
- ☁️ **Cloud sync** (optional) — email-code sign-in, automatic debounced sync, multi-device
- 🔒 **Privacy on sign-out** — logging out wipes the device after safely flushing to the cloud
- 💾 **Export / import JSON backups** (Settings)
- 📱 **PWA** — installable on iPhone/Android, instant offline startup

## Project structure

```
├── index.html              entry point + inline SVG icon sprite
├── sw.js                   service worker (must stay at root — scope rule)
├── manifest.webmanifest    PWA identity: name, icons, standalone display
├── css/
│   └── styles.css          theme tokens (dark/light), all styling & motion
├── js/
│   ├── app.js              all app logic, rendering, sync engine
│   └── config.js           your Supabase URL + publishable key
└── icons/                  PWA icons (192 / 512 / apple-touch 180)
```

## Architecture

**Local-first.** All data lives in `localStorage` as one JSON state object
(categories, months, transactions, settings). Every interaction reads/writes
memory and re-renders instantly — the network is never on the critical path.

**Cloud sync (optional).** When signed in, the entire state syncs as a single
JSONB document per user in one Supabase table (`app_state`):

- every local change schedules a **debounced push** (~1.5 s after the last edit)
- on sign-in/startup the app **pulls** and keeps whichever copy has the newer
  `updatedAt` (last-write-wins); an empty local state always defers to the cloud
- **Row Level Security** ties each row to `auth.uid()` — the publishable key in
  `js/config.js` is safe to commit because the database itself is the bouncer
- auth uses **email OTP codes** (not magic links — links open in Safari instead
  of the installed PWA on iOS); sessions auto-refresh and never expire
- **signing out wipes the device**: pending changes are force-pushed first (the
  sign-out aborts if that fails), then localStorage is cleared

Why a JSONB blob instead of relational rows? The client computes everything;
the server is a backup drive, not a brain. One upsert replaces an entire sync
protocol. If the app ever needs server-side queries, the blob is sitting in
Postgres ready to be exploded into tables.

**Service worker** (`sw.js`) strategies:

| Resource | Strategy |
|---|---|
| App shell (HTML/CSS/JS/icons) | precached, cache-first → instant offline loads |
| `js/config.js` | network-first → key changes apply immediately |
| Google Fonts + jsDelivr (Supabase client) | stale-while-revalidate |
| Page navigations | network, falling back to cached `index.html` offline |

> ⚠️ **Maintenance rule:** whenever you edit any shell file, bump the `CACHE`
> version at the top of `sw.js` (currently `fluus-v13`). Installed clients only
> refetch when that string changes.

## Run locally

```bash
npx serve .
```

Opening `index.html` directly also works, but the service worker (offline mode)
only activates over `http(s)`.

## Deploy to Vercel (free)

**Option A — GitHub (auto-deploys on every push):**
1. Push this folder to a GitHub repo
2. [vercel.com](https://vercel.com) → Add New Project → import the repo
3. Framework preset: **Other** (static). Deploy.

**Option B — CLI:** `npx vercel --prod`

## Install on your iPhone

1. Open the deployed URL in **Safari**
2. **Share → Add to Home Screen**
3. Launches fullscreen, works offline, exempt from Safari's 7-day storage purge

## Cloud sync setup (Supabase, free)

Fluus works 100% offline with no account. To enable backup + multi-device sync:

### 1. Create the project
[supabase.com](https://supabase.com) → **New project** (free tier)

### 2. Create the table + security policies
**SQL Editor** → run:

```sql
create table public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

create policy "own state select" on public.app_state
  for select using (auth.uid() = user_id);
create policy "own state insert" on public.app_state
  for insert with check (auth.uid() = user_id);
create policy "own state update" on public.app_state
  for update using (auth.uid() = user_id);
```

### 3. Make sign-in emails show a code
**Authentication → Email Templates** → in **both** "Confirm signup" *and*
"Magic Link" templates, include the token:

```html
<h2>Your Fluus sign-in code</h2>
<p style="font-size:28px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
```

(First-ever sign-in for an email uses *Confirm signup*; later ones use *Magic Link*.)

### 4. Set up SMTP (required)
Supabase's built-in mailer is rate-limited and unreliable for real use.
Easiest free option: [resend.com](https://resend.com) → create an API key →
Supabase **Project Settings → Authentication → SMTP Settings**:
host `smtp.resend.com`, port `465`, username `resend`, password = API key,
sender `onboarding@resend.dev`. Without a verified domain Resend only delivers
to your own Resend account email — perfect for a personal app.

### 5. Add your keys
**Project Settings → API** → copy the Project URL and anon/publishable key into
[js/config.js](js/config.js).

Then in the app: **⚙️ Settings → Cloud sync** → email → 6-digit code → done.

## Roadmap ideas

- Monthly budgets per category
- Recurring spendings
- Realtime sync between open devices (Supabase channels)
