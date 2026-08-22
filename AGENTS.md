# ibLedger

Read `docs/CONTEXT.md` before any non-trivial change. It holds the domain
model, the invariants, and the known debt.

## Rules specific to this repo

- **Money is dollars in a `double precision` column, never cents.**
  `src/app/tracker/lib/cents.ts` is input masking, not storage. Compare
  balances with `holdsMoney()` from `src/lib/money.ts`, never `=== 0`.
- **Every query filters on `userId`.** There is no row-level security.
  `requireUser()` is the only auth entry point; `/api/bootstrap` is the one
  deliberate exception.
- **Never issue direct database writes.** The dev Neon branch was branched
  from prod and holds copies of real users' ledgers. Drive changes through the
  UI or the API instead.
- **Migrations are applied by hand, before pushing.** Netlify runs
  `next build` and nothing else. Schema first, push second.
- **Explanation goes on the How to use page**, never as prose in the app UI.
  If a control needs explaining, it goes in
  `src/app/how-to-use/guide.tsx` — not as helper text, card descriptions, or
  intro paragraphs. Terse validation errors and disabled-control reasons are
  fine.

## Verifying

```
bun run typecheck && bun run lint && bun run test
```

Check exit codes directly — piping `tsc` through `tail` reports the pipe's
status, not tsc's. Don't run a build while a dev server is up; both write
`.next/` and the dev server then 500s on every route.

To test real user flows, a dedicated dev account exists. Run the
`dev-real-user` config in `.claude/launch.json` (gitignored) and sign in with
it; the credentials are local, so ask the owner if you don't have them. That
account is yours to write through — via the UI or the API, never direct SQL.
