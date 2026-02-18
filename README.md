## ibledger.app

**_readme co-authoured with opencode_**

ibledger.app is a personal money tracker built around two parallel views of the same money:

- **Wallets**: where money is physically/actually located (bank accounts, cash, etc).
- **Funds**: why money is allocated (envelopes/buckets like Groceries, Rent, Fun, etc).

The core goal is that a user can answer both:

- Where did the money move?
- Why did the money move?

And keep those answers consistent across the system.

### Key Concepts (What We Agreed Is “Correct”)

#### Ledger Invariant

Every money movement (a posting line) is categorized by **both** a wallet and a fund.

- A line must have `walletId` AND `fundId`.
- This ensures the raw ledger totals remain consistent:
  - `sum(all wallet balances) == sum(all fund balances)` (raw, before any display-only adjustments).

Note: the current implementation already supports lines that are wallet-only or fund-only in some places, but the intended product behavior is to **hard-disallow** those for non-income transactions.

#### Wallets

Wallets represent real-world locations. Wallet balances are computed from:

- `openingAmount + SUM(postings.amount)`

There are two views of any balance:

- **Cleared**: excludes pending transactions (`isPending=false` only).
- **With pending**: includes pending transactions.

#### Funds

Funds represent purpose/envelope allocation. Funds also have:

- `pullPercentage` (used to auto-allocate income)
- one special fund: **Savings**

Savings is a system fund:

- cannot be deleted
- pull percentage is effectively irrelevant/locked (savings receives the remainder)
- name and opening amount are editable

#### Pending

`isPending=true` behaves like “scheduled/uncleared”. Pending amounts:

- do not count toward **cleared** totals
- do count toward **with pending** totals

#### Transaction Model: Events vs Postings

The database uses a single `transactions` table for both:

- **Events**: root rows (`parentId = null`) that appear in the UI list.
- **Postings**: rows that actually move money (`isPosting = true`).

There are two shapes an event can have:

1. **Posting-only event** (single line)
   - Root row is also the posting (`parentId=null`, `isPosting=true`).

2. **Parent + children** (multi-line)
   - Root row is just a container (`parentId=null`, `isPosting=false`, amount `0`).
   - Each child row is a posting (`parentId=root.id`, `isPosting=true`).

Multi-line transactions exist for grouping under one banner (e.g., “Night out” containing dinner + movies).
They are not required to “balance” like double-entry accounting.

#### Income

Income is a special event type:

- User enters: date, description, wallet, amount, pending.
- The API auto-allocates the income amount across funds based on each fund’s `pullPercentage`.
- Whatever percentage is not allocated to non-savings funds goes to Savings.

Important behavior agreement:

- Editing an income keeps the original allocation percentages stored on the child postings (`incomePull`) so it preserves historical context.
- Calculations stay **full precision** (no rounding in storage); rounding is display-only.
- Any remainder that results from floating point math / final-line adjustment should go to **Savings**.

### Overspending + Savings Absorption (Display Rule)

Funds have a display-only rule used by the API responses:

- Non-savings funds are **clamped at 0** in the UI display.
- Any deficit (raw negative) from non-savings funds is absorbed by Savings.
- Savings may go negative if overall funds are overspent beyond Savings.

This is implemented by returning both:

- `balance` / `balanceWithPending` (display values)
- `rawBalance` / `rawBalanceWithPending` (true ledger values)

We want the UI to clearly surface overspending by showing an **“Overspent $X”** indicator whenever a non-savings fund has a negative raw balance, even if its displayed balance is 0.

### How Transfers / Reallocations Work (Implicitly)

There is no dedicated “transfer” UI yet; the system supports transfers implicitly using multi-line transactions.

- **Wallet-to-wallet move**: two lines using the _same fund_ on both lines.
  - Example: Checking/Groceries `-200`, Cash/Groceries `+200`.

- **Fund-to-fund reallocation**: two lines using the _same wallet_ on both lines.
  - Example: Checking/Fun `-100`, Checking/Rent `+100`.

### UI Routes (Current)

- `/` landing page (currently minimal)
- `/tracker` overview: totals, wallets, funds, recent transactions
- `/tracker/transactions`: paginated events list, pending-only filter, “mark all cleared”, add/edit modals
- `/tracker/funds`: fund CRUD
- `/tracker/wallets`: wallet CRUD

### API Endpoints (Primary)

- `POST /api/bootstrap`
  - upserts the DB user record and ensures Savings fund exists

- `GET/POST/PATCH/DELETE /api/wallets`
  - wallet list & CRUD; delete blocked unless raw balance is 0

- `GET/POST/PATCH/DELETE /api/funds`
  - fund list & CRUD; delete blocked unless raw balance is 0; Savings cannot be deleted

- `GET /api/totals`
  - wallet totals + fund totals + grand totals

- `GET /api/transactions?page=…&pendingOnly=true|false`
  - events list (root events) with child postings embedded

- `POST /api/transactions`
  - create transaction (single-line or multi-line) or income

- `PATCH/DELETE /api/transactions/:id`
  - update/delete an event

- `POST /api/transactions/clear-pending`
  - marks all pending postings (and events) as cleared

Legacy-looking endpoints exist under `src/app/api/tracker/*` and are likely safe to remove later, but should be left untouched for now.

### Auth / Dev Testing

- Uses Clerk for auth.
- If `DEV_TESTING=true`, the app bypasses Clerk and uses a stub user (`src/lib/test_user.ts`).

Environment:

```sh
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
DATABASE_URL=
DEV_TESTING=false
```
