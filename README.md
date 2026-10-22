# featherweight-bossmode

The page of bossmode: a chat client for an operator over a fleet of
featherweight agents. The workbench, `fw-workbench`, serves the built page at
`/bossmode` and answers it over JSON and one event stream.

The plan is `docs/BOSSMODE_2026-10-21.md` in the workbench repository,
featherweight-workbench. Sections 5 to 7 of that plan hold the contract that
this page builds against. Nothing here is built yet.

## Stack

TypeScript, Preact, and Vite. The build writes `dist/`, which the workbench
copies into `surface/web/bossmode/` for an embedded build, or serves from
`workbench.bossmode.dir`. The page has no server of its own. A fake server
under `fake/` serves the same JSON as the workbench, so the page grows beside
the backend.

## Rules

- One token in `sessionStorage`, as the page at `/ui` keeps it. On a 401 with
  `signin`, the page goes to `/ui/signin` and comes back.
- Every status has a word and an icon beside its color.
- Every action is reachable from the keyboard, and `prefers-reduced-motion`
  turns motion off.
- No external asset: no font, no script, and no image from another origin.
- Comments and documentation follow plain English: short sentences, active
  voice, only the modal verbs can, will, and must, and no contractions.
