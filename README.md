# featherweight-bossmode

The page of bossmode: a chat client for an operator over a fleet of
featherweight agents. The workbench, `fw-workbench`, serves the built page at
`/bossmode` and answers it over JSON and one event stream.

The plan is `docs/BOSSMODE_2026-10-21.md` in the workbench repository,
featherweight-workbench. Sections 5 to 7 of that plan hold the contract that
this page builds against. Where the plan gives no JSON, the page chose a
shape, and `docs/CONTRACT.md` names each one for the backend team.

## Stack

TypeScript, Preact, and Vite. The build writes `dist/`, which the workbench
copies into `surface/web/bossmode/` for an embedded build, or serves from
`workbench.bossmode.dir`. The page has no server of its own. A fake server
under `fake/` serves the same JSON as the workbench, so the page grows beside
the backend.

## Rules

- One token in `sessionStorage`, as the page at `/ui` keeps it. On a 401 with
  `signin`, the page goes to `/ui/signin` and comes back.
- Every status has a word beside its light. The light only repeats it.
- Every action is reachable from the keyboard, and `prefers-reduced-motion`
  turns motion off.
- No external asset: no font, no script, and no image from another origin.
  The typeface, Archivo, comes from an npm package into the build.
- Comments and documentation follow plain English: short sentences, active
  voice, only the modal verbs can, will, and must, and no contractions.

## Design

`docs/DESIGN.md` is the plan of the look: the subject, the tokens, the
layout at three widths, the primitives, and the screens of the next stage.
`docs/COPY.md` audits every string of the page. `docs/shots/` holds
screenshots of every screen against the fake server, in both themes and at
three widths.

The code of the look:

| Path | What |
|---|---|
| `src/styles/tokens.css` | The tokens of both themes, as CSS custom properties |
| `src/styles/fonts.css`, `base.css` | The typeface and the base styles |
| `src/ui/primitives/` | The primitives, with `primitives.css` and their tests |
| `src/ui/Shell.tsx`, `src/styles/shell.css` | The app bar and the three panes |
| `src/styles/channel.css`, `fleet.css`, `wiki.css`, `chat.css`, `routines.css`, `duties.css` | The styles of the screens: the bridges, the fleet and the people, what you make, the quick chat, the routines, and the duties |

## Build

The build needs Node 22 or newer and npm. Install the packages from the lock
file, then build:

```
npm ci
npm run build
```

`npm run build` checks the types with TypeScript and writes the page to
`dist/`. The page expects to live at `/bossmode/`.

`npm test` runs the unit tests with vitest. They test the API client, the
presence lights, the `@` completion, the reducer of the stream, and the
routes. They test the question forms and the Markdown sanitizer against
hostile input. They test the live answer of a run, the quick chat, and the
agents of the fleet. They test the statuses of the workers and the seats,
and the reads of a worker that sleeps. They test the words and the folds of
a system line, and the links of every screen of the page. They test the
Routines place: the groups, the sign-off card and its moves, the evidence,
the runbook, and the week of an agent. They test the Duties place: the list,
the page of a duty with the decisions of its history, the editor with its
readback, its events, its actions, its tools, secrets, and filters of a
check, Write the check for me with Cancel, the problems of the front beside
their fields, and the switch of an admin. They also test the playbooks,
Make this a duty, the duties in Activity, the dialog Where to reach me with
its places, and the shared channels in Tell me about of a duty.

## Run against the fake server

The fake server in `fake/` is for development only. It keeps its data in
memory, trusts any token that starts with `fake-`, and checks nothing that a
real workbench checks. It serves every route of `docs/CONTRACT.md` with
sample data. The data holds two bridges, a channel of forty entries, an
approval card, and a question card. It also holds a manager conversation
and a quick chat with a history of six chats. Last come a fleet with two
pools, a wiki of eight pages, and a face for every agent. The Routines place
has nine routines of three agents: one needs your sign-off, four are live,
one rehearses, one is proposed, and two are retired. The Duties place has
five duties, and three duties that the server imported from its
configuration: one with a message from the setup, one with a message of
its own, and one that the setup locks. One duty reports
each weekday, and its last start goes again after a failed run. One
restores a backup each night and needs you. One watches a queue with a
check that mostly sleeps, and the manager decided a question of one of its
runs. One paused itself after three failed runs. The last one posts in a
bridge when a bridge of the migrator closes, and its last start failed
before the queue took a run. Another app calls one source, and the other
looks at an address. The fake
also serves the options of the duties, Write the check after a short wait
(words that hold slow wait until the front gives up), a playbook of weekly
patching, the places of each person, and the inbox of the duties. alice
reaches her phone by ntfy and Home Assistant by a webhook, every kind is
offered, and an admin shares the channel Ops room, which the watch of the
queue tells of its failures. A test of a place whose topic or address holds
fail fails, as the test of Home Assistant does.
Timers move members between
presences, with their runs and their workers, and post messages every few
seconds. It takes the files of a message with the limits of the front,
refuses them with 409 when a member that the message reaches has no run or a
failed run, and names them in the entry and in the transcript of each run
that got them. It keeps no bytes.

1. Start the fake server: `npm run fake`. It listens on
   http://127.0.0.1:8787.
2. In a second terminal, start the page: `npm run dev`. Vite serves the page
   at http://localhost:5173/bossmode/ and sends `/v1` and `/ui` to the fake
   server.
3. Open http://localhost:5173/bossmode/. The page goes to the fake sign-in,
   which signs you in as alice@example.com and comes back.

The fake server also serves `dist/`, at the address
`http://127.0.0.1:8787/bossmode/`. It sends the content security policy of
the page, so you can check a build under that policy after `npm run build`.
Each stream names the build of `dist/` in the header `Fw-Page-Build`, as the
workbench does. After a new build, an open tab offers a reload at its next
stream.

Variables of the fake server:

| Variable | Effect |
|---|---|
| `FAKE_PORT` | The port, 8787 by default |
| `FAKE_SIGNIN=0` | A 401 names no sign-in route, so the page shows the token form. Paste `fake-alice` or `fake-bob`. |
| `FAKE_QUIET=1` | No timers |
| `FAKE_TICK` | The time between two timer steps in milliseconds, 5000 by default |
| `FAKE_STREAM_MS` | The life of one stream in milliseconds before the fake server closes it, 15 minutes by default, as the workbench does |
| `FAKE_THEME=0` | The theme of `GET /v1/bossmode` names no organization, as the theme of a deployment without one |
| `FAKE_ACCENT` | The accent of the theme, `#FF4D00` by default |
| `FAKE_ORG` | The name of the organization of the theme, Example Org by default |
| `FAKE_LOGO=1` | The theme names a logo, served at `/v1/bossmode/logo` |
| `FAKE_PARTIAL=1` | A card goes out on the stream without its input and its schema, as the backend can send it, so the page reads it again |
| `FAKE_ADMIN=1` | `whoami` says that the person is an admin, who adds and removes skills and pauses every duty |
| `FAKE_A=1` | The sample data shows each state of the bridges screen: a seat that waits for a worker, a fired seat, folds, a card in the state unknown, a second open bridge, and a closed one. The second open bridge also holds a message that asks the operator, and a seat that failed with the raw error of a model provider. |
| `FAKE_LIVE=1` | `GET /v1/runs/{id}/live` streams each answer outside a bridge in pieces, as the model writes it. The quick chat calls one tool first. Without it, the route sends no piece. It sends `idle` once the run stops working. |
| `FAKE_LIVE_MS` | The time between two pieces of a live answer in milliseconds, 120 by default |
| `FAKE_LIVE_HOLD=1` | A live answer stops near its middle and waits there, for a screenshot of an answer that streams in |
| `FAKE_ASK=<tool>` | The manager waits for a decision on one call: `bridge_open`, `pages_write`, `spawn_task`, `create_issue`, or `env`. An allowed `bridge_open` opens the bridge, and the manager names it by its id. An allowed `env` adds `ansible-lint` to the packages of the manager. |
| `FAKE_WORK=0` | The settings name no work, so the page shows no Work and no Results, and every place of the app bar, as a workbench without the routes of the work does. |
| `FAKE_PACKAGES=0` | The settings say that the deployment has no package mirror, so no profile shows Packages. Without it, the workers of migrator have two packages, and every other agent starts with packages off. A change installs on each worker for a few seconds, one worker after the other. A program named `does-not-exist` fails with a short output. A new Python package whose name starts with `does-not-exist` gets a 400, as the front answers a name that the index does not know. alice also has four conversations whose worker was replaced: two with the manager, one with migrator, and one quick chat. They carry `archived`, and a message to one answers 409. |

A sign-in at `/ui/signin?as=bob` signs you in as bob@example.com.

## Run against a workbench

There are two ways.

- Development. Start the page with the address of the workbench:
  `FW_URL=http://localhost:8080 npm run dev`. Vite sends `/v1` and `/ui` to
  the workbench. The browser sign-in of the workbench returns to the address
  of the workbench, not to Vite. So paste an access token in the token form
  of the page instead.
- A build. Run `npm run build`, and set `workbench.bossmode.dir` (or
  `FW_WORKBENCH_BOSSMODE_DIR`) to the `dist/` directory. The workbench then
  serves the page at `/bossmode/` behind its own sign-in. An embedded build
  copies `dist/` into `surface/web/bossmode/` of the workbench.

The workbench must serve the routes and the stream of `docs/CONTRACT.md`.

## Dependencies

The page has four dependencies at run time. The build bundles them, so the
page loads nothing from another origin.

| Package | Why |
|---|---|
| `preact` | Draws the components. It is small, and it has the component model of React. |
| `marked` | Turns the Markdown of agents and of the wiki into HTML. The page shows raw HTML in the Markdown as text. |
| `dompurify` | Removes from that HTML every tag and attribute outside a short allow list. A message or a page thus holds no script, no event attribute, no style, no SVG, and no image. |
| `@fontsource-variable/archivo` | The typeface Archivo, under the SIL Open Font License 1.1, with the width and the weight axes. The build copies its files into `dist/assets`. |

The build and the tests use four more packages. None of them reaches the
browser.

| Package | Why |
|---|---|
| `vite` | Builds `dist/` and serves the page in development, with a proxy to the API |
| `typescript` | Checks the types |
| `vitest` | Runs the unit tests |
| `jsdom` | Gives the tests a DOM, which DOMPurify needs |
