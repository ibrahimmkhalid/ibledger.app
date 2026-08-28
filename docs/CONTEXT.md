# ibLedger context

What the system is, what must stay true about it, and what is known to be
wrong with it. Written for someone changing the code. For the product story,
what a fund is and how a transfer works, read `src/app/how-to-use/guide.tsx`,
which is the same explanation the app gives its users.

## What this is

A personal finance tracker at [ibledger.app](https://ibledger.app). Built for
the owner first; a handful of family and friends have accounts and real
financial records in it.

That framing decides most of the tradeoffs below. There is no on-call, no
error tracking, no rate limiting, and no support channel. The data is real to
the people who entered it, so losing or corrupting it is the failure that
matters.

Next.js 15 (App Router) · Drizzle ORM · Neon Postgres · Clerk auth ·
Tailwind 4 · Netlify · Bun.

## Domain model

Money is tracked along two axes at once, over the same dollars:

- A **wallet** is where money physically sits: Checking, Cash, a card.
- A **fund** is what it is earmarked for: Rent, Groceries, Savings.

Every dollar is in exactly one wallet and assigned to exactly one fund, so
wallet balances and fund balances are two views of one pot.

### Events and postings

`transactions` holds both, discriminated by `isPosting`:

- `isPosting = true` is a **posting**. Carries money. Either a standalone
  single-line event, or a child line belonging to a parent.
- `isPosting = false` is a **parent event**. Holds no money itself (`amount` is
  0); its children do. Identified by `parentId IS NULL` with children pointing
  back at it.

A single-line transaction is one row. A multi-line transaction is a parent row
plus one child posting per line. `parentId` is a self-referencing foreign key.

Some shapes worth recognising:

- A **transfer** is one event with two lines on the _same fund_, opposite
  signs, different wallets. Wallet balances move, fund balances don't, the
  event nets to zero.
- **Income** is one event whose children each carry a non-null `incomePull`,
  the fund's share percentage at the moment it was recorded. All children are
  positive and land in a single wallet. `isIncomeLike()` in
  `src/app/tracker/lib/events.ts` is the canonical test.
- **Pending** (`isPending`) means recorded but not yet cleared. Balances are
  computed both ways: cleared-only, and cleared-plus-pending.

### Income shares

`funds.pullPercentage`, called "Income share" everywhere in the UI and never
by its column name, decides how an income event splits across funds. Shares are
capped at 100% in total. The cap is enforced under a per-user Postgres
advisory lock (`FUND_LOCK_NAMESPACE`), because two concurrent writes would
otherwise each validate against the same pre-update state and together commit
an over-100% total.

### The savings fund

Exactly one fund per user carries `isSavings`. It is the leftover bucket, and
it absorbs overspending: for display, non-savings funds clamp at zero and
every deficit is subtracted from savings, which may go negative.
`applySavingsDeficitClamp()` does this and is total-preserving:
`sum(clamped) === sum(raw)`. It also returns the unclamped figures, because
the delete guards and overspent badges need the real numbers.

Savings sorts last in every list. `FUND_DISPLAY_ORDER` is the one ordering;
spread it into a query rather than writing an `orderBy` by hand.

## Invariants

Break one of these and the ledger is lying:

1. **`sum(wallet balances) === sum(fund balances)`.** True by construction:
   every posting writes one amount against one wallet and one fund. Any change
   to the write path has to preserve it.
2. **Exactly one savings fund per user.** `applySavingsDeficitClamp` throws
   rather than return numbers it can't reconcile; the route turns that into a 500. A ledger that silently totals wrong is worse than one that errors.
3. **Every query filters on `userId`.** There is no row-level security. A
   missing filter is one user reading another's ledger.
4. **`requireUser()` is the only auth door.** Nine of ten API routes use it.
   `/api/bootstrap` is the deliberate exception, since it is what creates the
   user row.
5. **Fund shares total at most 100%,** validated under the advisory lock.

## Money is a float

Every amount column is `double precision`, holding **dollars, not cents**.
`src/app/tracker/lib/cents.ts` is modal input masking only. Nothing is stored
in cents.

This leaks. `0.1 + 0.2 - 0.3` lands on `5.55e-17` rather than zero, so
"is this wallet empty" cannot be `=== 0`. `MONEY_TOLERANCE` (half a cent) and
`holdsMoney()` in `src/lib/money.ts` are the guard: anything smaller is dust,
not money. `holdsMoney` fails closed on NaN and Infinity, so a broken balance
computation blocks a destructive action rather than reading as "holds
nothing". Float dust is load-bearing in a few other places too:
`nullif(sum, 0)`, `walletDelta !== 0`.

This is an accepted tradeoff, not an oversight. **The migration target is
integer cents**, stored as an integer and converted at the API boundary, so the
value in a JS variable is always exact. (`numeric` is rejected: Drizzle
returns it as a string, so every arithmetic site changes anyway and float math
creeps back the first time someone calls `Number()`.)

**Trigger: the first time a user reports a balance wrong by a cent.** Until
then the tolerance guard holds and the migration isn't worth the churn.

### Amount input masking

Amount fields are cents-first: the user types digits, they fill in from the
right, and `value` is a plain cents string ("4200") shown as "$42.00". What
follows is what `src/app/tracker/lib/cents.ts` and `components/amount-input.tsx`
do not say on their face.

An empty amount has to render as an empty string rather than "$0.00". Content
in the field hides the placeholder, and because the text is right-aligned, a
caret clicked into the empty left margin prepends: typing 4200 at index 0 of
"$0.00" gives $42,000.00. For the same reason all-zero digits count as empty,
so the last backspace clears the field instead of bottoming out at "$0.00".

`MAX_CENTS_DIGITS` is 15 because that is the most digits of cents a double
holds exactly. At 16, `9999999999999999` comes back as `10000000000000000` and
the field shows a figure nobody typed; past 21, `String()` switches to
exponential and puts "1e+21" in a value meant to be digits. The ceiling is
$9,999,999,999,999.99.

`AmountInput` pins the caret to the end after every masked change. The mask
rewrites the whole string on each keystroke and thousands grouping changes its
length ("$999.99" becomes "$9,999.99"), so React's restore-by-index would land
two characters short and insert the next digit before the last two.

## How it runs

### Deploy

Netlify builds on push to `main`. `netlify.toml` pins the build command so the
deploy doesn't depend on Netlify auto-detecting the package manager. There is
no staging environment. `main` is production.

### Database

One Neon project, two branches: **prod** and **dev**. They are separate
databases, but **dev was branched from prod and contains copies of real users'
ledgers.** That is why direct database writes are off limits during
development, and why "it's only dev" is not a reason to be careless.

`DATABASE_URL` in `.env` points at the dev branch. The prod credentials sit in
the same file, commented out.

Backup and recovery is Neon's own branch history. There is no separate export.

### Migrations are applied by hand

The Netlify build runs `next build` and nothing else. It does **not** apply
Drizzle migrations. The order matters:

1. Generate the migration and check it in.
2. Apply it to the prod branch yourself.
3. _Then_ push to `main`.

Push first and production runs new code against an old schema until you get
back to a terminal.

`drizzle/meta/` is gitignored by choice, so the journal is local only. The
migration chain skips `0006`; both branches were checked against `schema.ts`
and neither shows a difference, so whatever it was no longer exists.

### DEV_TESTING

`DEV_TESTING=true` removes Clerk from the request path and resolves every
request to a hardcoded test user. It is gated on `NODE_ENV !== "production"`,
so setting it on a production deploy cannot open the app.

## Verification

There is no test database and no end-to-end suite. The gate is
`bun run typecheck && bun run lint && bun run test`, run in CI on every pull
request to `main`.

`bun run test` is Vitest over the pure arithmetic: the balance clamp, the
dust tolerance, the share validators, the event display math, the currency
formatters, the amount input masking. That is the code with no type-level
protection and the most room for a float bug.

Two traps worth knowing:

- **Check real exit codes.** `tsc --noEmit | tail` reports the pipe's status,
  not tsc's, and will silently "pass".
- **Never run a build while a dev server is up.** Both write `.next/`, and the
  build's chunk hashes replace the dev server's, so every route then 500s with
  `Cannot find module './NNNN.js'`. Restarting the dev server fixes it.
- **A stale `.next/` fails typecheck.** `tsconfig.json` includes
  `.next/types/**/*.ts`, so generated types for a route that no longer exists
  report as `TS2307` in a clean tree. Delete `.next/` and rebuild. CI never
  hits this, since it checks out fresh.

## Known debt

Recorded so it isn't rediscovered from scratch. None of it is urgent; all of
it is real.

**Money as a float.** See above. Migrate to integer cents on the first
wrong-cent report.

**Deep pagination.** `/api/transactions` uses `OFFSET page * pageSize` plus an
exact `count(*)`. Fine for early pages; deep pages get progressively more
expensive because Postgres still walks the skipped rows, and exact counts add
latency on broad filters. The fix is keyset pagination. The existing
`transactions_events_page_idx` on `(user_id, occurred_at desc, id desc)`
already matches the required ordering, so the query is a `WHERE (occurred_at,
id) < (cursor)` away. The cost is UI: cursors give next/previous, not numbered
pages.

**Analytics aggregates in Node.** `/api/analytics` fetches every matching
posting for the selected filters and builds summaries, period totals, wallet
and fund series, and top expenses in application code. Work grows linearly
with matching rows. The fix is `GROUP BY` with `date_trunc()` in Postgres and
a small result set back. No schema change, and the endpoint contract stays.

**Unindexed fuzzy search.** Search builds patterns like `%c%o%f%f%e%e%` and
LIKEs them against descriptions, which no B-tree index can serve. The
direction is `pg_trgm` with a GIN index, which suits merchant-name and
misspelling search better than full-text, which is built for word tokens and
ranking. Needs an extension and a migration; confirm the extension is
available on Neon before writing one.

**Balances recomputed on every read.** Every dashboard, fund page, wallet page
and overview request re-scans postings to aggregate the same balances. If this
becomes a problem, the first step is a materialized view for wallet and fund
balances. It sits outside the write path entirely, so create/edit/delete
semantics don't change, at the cost of staleness between refreshes. A rollup
table updated transactionally is the better long-term ledger design and the
much larger change.

**`textSearchSql` is defined twice**, in `src/app/api/analytics/route.ts` and
`src/app/api/transactions/event-filters.ts`. Same knowledge in two places, so
the two search behaviours can drift apart.

**No test database.** Route handlers, the SQL in `src/db/balances.ts`, and
every ownership check are covered by nothing but typecheck and manual use.

**Tracker pages fetch themselves on mount.** All four nav pages are `"use client"` and
call `apiJson` from an effect, which costs a round trip per navigation and a
loading state per page. The App Router answer is to fetch in a server
component. That is also what the five
`eslint-disable-next-line react-hooks/set-state-in-effect` comments are
waiting on: `eslint.config.mjs` has the rule on, and every disable except the
theme-toggle mount gate sits on one of these fetches. Deleting them is the
signal the migration is done. The cost is that it rewrites four pages, so it is
a direction rather than a task.

**Client responses are cast, not parsed.** `apiJson<T>` in
`src/app/tracker/lib/api.ts` ends in `return data as T`, so all 14 call sites
trust the server's shape and find out otherwise by reading a field that isn't
there. Real boundary parsing means a validator dependency and a schema per
response type. Weighed and left alone: client and server live in one repo and
deploy together, so a shape mismatch between them is close to unreachable.
Revisit if an endpoint ever gains a consumer that does not ship with it.
