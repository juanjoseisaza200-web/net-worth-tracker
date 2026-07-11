# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install      # install dependencies
npm run dev      # start Vite dev server on http://localhost:3000
npm run build    # tsc type-check, then vite build -> dist/
npm run preview  # serve the production build locally
npm run lint     # eslint . --ext ts,tsx --max-warnings 0
npm test         # vitest run — unit tests for the pure utils
```

Tests are Vitest unit tests over the pure logic in `src/utils` (`*.test.ts` next to the code under test: currency, calculations, automations, number, date). There are no component/DOM tests. Beyond `npm test`, verify changes via `npm run build` (type errors) and `npm run lint`, and by exercising the UI in a browser. CI (`.github/workflows/ci.yml`) runs lint + build + test on every push to `main` and on PRs.

## Architecture

This is a client-only PWA (Vite + React 18 + TypeScript + Tailwind + react-router-dom v6) with Firebase as the only backend — no custom server. `vite-plugin-pwa` (see `vite.config.ts`) handles the manifest/service worker.

### Data model and persistence flow

Everything the app tracks lives in a single `AppData` object (`src/types.ts`): `accounts`, `expenses`, `incomes`, `recurringIncomes`, `automations`, `activityLogs`, `stocks`, `crypto`, `fixedIncome`, `variableInvestments`, `debts`, `netWorthHistory`, `baseCurrency`, `settings`. This whole object is the unit of persistence — one Firestore document per user at `users/{uid}`, mirrored to `localStorage` (`utils/storage.ts`) as an offline cache, not a separate source of truth. Firestore is configured with IndexedDB persistence (`initializeFirestore` + `persistentLocalCache` in `src/firebase.ts`) so reads work offline and offline writes are queued.

`handleCloudSave` records a daily net-worth snapshot into `netWorthHistory` via `recordNetWorthSnapshot` (`utils/calculations.ts`, deduped per `YYYY-MM-DD`) as a side effect of every explicit save; the Dashboard "Net Worth Trend" widget charts it with recharts. Access control lives in `firestore.rules` (version-controlled) — deploy with `firebase deploy --only firestore:rules`.

`App.tsx` is the sole owner of `data` state and hands it down to every route as `data` + a `setData` callback (see the `<Route>` list at the bottom of `App.tsx`). There are two distinct save paths, and using the wrong one is a real footgun:
- `handleCloudSave` — optimistic local update, then push to Firestore. Guarded by an `isCloudSynced` flag that blocks any cloud write until the initial `subscribeToData` snapshot has been received, specifically to prevent a stale tab from overwriting newer cloud data on load. Use this for anything the user explicitly edits.
- `handleLocalSave` — local/localStorage only, no Firestore write. Used for background price refreshes (e.g. Investments auto-updating stock/crypto prices) so they don't spam cloud writes or fight with the sync guard.

Real-time sync is push-based: `subscribeToData` (Firestore `onSnapshot`) fires on every remote change, and each incoming snapshot is piped through `processAutomations` (`utils/automations.ts`) before being applied to state — automations and recurring incomes are evaluated as a side effect of data loading, not via a server-side scheduled job. If automations fire, the result is written back to Firestore immediately and the user sees an alert summarizing what ran.

`migrateData` in `utils/storage.ts` is the one place old/partial data shapes get backfilled (e.g. synthesizing a default checking account for pre-`accounts` data and re-pointing historical expenses/incomes at it). Any new required `AppData` field needs a corresponding backfill there, since existing Firestore docs won't have it.

### Currency handling

Every monetary value carries its own `Currency` (`USD | COP`). `utils/currency.ts` converts everything through USD as a pivot. Hardcoded approximate rates are the default; `fetchExchangeRates()` overwrites them with live rates from `open.er-api.com` once on app boot (not persisted — refetched every load). `migrateData` (`utils/storage.ts`) coerces any legacy/unsupported currency code on stored records to `USD`, since `convertCurrency` returns `NaN` for a currency missing from the rate table.

Separately, `App.tsx` keeps a `viewCurrencies` map (one entry per tab) distinct from the persisted `data.baseCurrency`. This lets a user view, say, Expenses in COP while the stored global default and Dashboard stay in USD — don't conflate "the view currency for this screen" with "the base currency setting."

### External price/search data

`utils/priceFetcher.ts` and `utils/stockSearch.ts` / `utils/cryptoSearch.ts` call public, unauthenticated third-party APIs directly from the browser: Yahoo Finance (via the `api.allorigins.win` CORS proxy, since Yahoo has no CORS headers) for stocks, CoinGecko for crypto. All of these fail silently to a fallback (static `POPULAR_STOCKS`/`POPULAR_CRYPTO` lists for search, `null` for price lookups) and only log via `console.warn`/`console.error` — expect rate limiting and treat failures as expected, not exceptional.

### Automations engine

`processAutomations` in `utils/automations.ts` is a pure function `(data: AppData) => { newData, messages }` covering two things: scheduled `Automation`s (`sweep`/`transfer` between accounts) and `RecurringIncome` deposits. Each tracks its own `lastRunMonth` (`YYYY-MM`) to avoid double-firing; a `dayOfMonth` of `0` means "last day of the month." Because this only runs when data is loaded/synced (see above), it's an at-most-once-per-session check, not a real cron — don't assume it fires exactly on the scheduled day if the app isn't open.

### Component structure

Each route is one large, mostly self-contained component under `src/components` (`Dashboard`, `Accounts`, `Expenses`, `Investments`, `Debts`, `Settings`, `Login`, `Header` — ranging from ~150 to ~1500 lines). They manage their own local form/modal state inline rather than sharing form or modal primitives. `AutocompleteInput.tsx` is the one genuinely reusable component (debounced symbol search used by both stock and crypto forms in `Investments.tsx`).

Auth is an all-or-nothing gate: `App.tsx` renders only `<Login />` when there's no Firebase user — there is no anonymous/local-only mode. `src/firebase.ts` contains the Firebase web config (API key etc.) committed in source; this is expected for Firebase web apps (access is enforced by Firestore security rules, not by secrecy of this config) so don't treat it as a leaked credential to redact.

### Conventions specific to this codebase

- IDs are generated with `Date.now().toString()` (occasionally + a random suffix), not `uuid` — follow this pattern for new records rather than introducing a new ID scheme.
- Dates are stored as plain `YYYY-MM-DD` strings and must be parsed by splitting on `-` and using the local-time `Date(y, m, d)` constructor (see `utils/date.ts` and the date filters in `utils/calculations.ts`) — passing the raw string straight to `new Date(dateString)` shifts the day in some timezones.
- `@typescript-eslint/no-explicit-any` is disabled project-wide; `any` is used freely, especially when parsing/migrating Firestore data.
