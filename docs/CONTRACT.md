# The contract of the page

The page of bossmode builds against sections 5 and 6 of the plan,
`docs/BOSSMODE_2026-10-21.md` in the workbench repository. The plan gives the
JSON of some routes and leaves others open. This file names every shape that
the page chose, so the backend team can serve the same JSON. The fake server
in `fake/server.mjs` serves these shapes, and `src/api/types.ts` holds them
as TypeScript types.

A section marked **New** names a route or a field that the plan does not
have. The page needs each one. The backend team can serve another shape, and
then this file and the page change together.

The backend of the branches `boss/bridges`, `boss/pages`, and `boss/fleet`
serves this contract. Where the backend chose another shape, this file
follows the backend, and the page and the fake server follow this file.

## 1. Every call

- The page calls its own origin only, under `/v1`.
- Each call sends `Authorization: Bearer <token>`, with the token from
  `sessionStorage["fw.token"]`, as the page at `/ui` does.
- A JSON body goes with `Content-Type: application/json`. A face goes with
  `Content-Type: image/svg+xml`.
- An error is an RFC 9457 problem document. The page shows the first
  sentence of `detail`, with the package names in front of it removed, as
  `/ui` does. Without `detail`, it shows `title`.
- A 401 with `signin` sends the page to `/ui/signin` (section 2). A 401
  without `signin` shows the token form.

## 2. Sign-in and the way back

**New.** The page goes to `/ui/signin?next=<address>`, where the address is
the path and the fragment of the page, such as `/bossmode/#bridge/br-puppet`.
Today the sign-in of the workbench takes only a fragment that starts with
`#`, and it returns to `/ui` plus that fragment. For bossmode, the sign-in
must also take a `next` that is a path under `/bossmode/`, with no scheme, no
host, no backslash, and no control character. The callback page then
replaces the location with that path. Any other `next` returns to `/ui`, as
today.

The page goes to the sign-in on its own after a 401. It does not go again
within ten minutes, and it does not go after the person signs out in the
tab. In those two cases it shows a Sign in link and the token form. After a
return from a sign-in without a session, the token form is open. A page
that comes back from the cache of the browser, as after Back, starts again.

## 3. The static page and its content security policy

The workbench serves `dist/` at `/bossmode/`, with `index.html` for the path
`/bossmode/` and for any path that names no file. The page needs this policy
and no more:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:;
connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none';
form-action 'self'; frame-ancestors 'none'
```

`img-src blob:` is for the faces (section 9). The build holds no inline
script, no inline style element, and no data URI. The page sets sizes
through the style object of the DOM, which the policy allows.

## 4. The settings of the page

`GET /v1/bossmode` answers the settings that the page reads, with the keys
in this order:

```json
{
  "manager": { "agent": "manager", "member": "default/manager-0", "run": "run-01K..." },
  "placement": "queue",
  "maxMembers": 16,
  "theme": { "accent": "#FF4D00", "name": "Example Org", "logo": "/v1/bossmode/logo" },
  "templates": [{ "name": "general", "default": true }, { "name": "python", "default": false }],
  "chat": { "agent": "chat", "member": "default/manager-0" }
}
```

- `manager` is null when `workbench.bossmode.manager` is empty.
- `manager.member` is the fleet member that runs the manager Task, for
  `POST /v1/runs?member=`, or `""` when the caller sees none.
- `manager.run` is the newest top-level run of the manager that the caller
  started outside a bridge, or `""`. The page opens that conversation.
- `placement` and `maxMembers` come from `workbench.bridges`.
- `theme` carries every key. `accent` is the accent of the deployment, else
  `#FF4D00`. `name` is the name of the organization, else `""`. `logo` is
  `/v1/bossmode/logo` when the deployment names a logo, else `""`. The page
  takes an accent of 3 or 6 hex digits and keeps signal orange for any other
  value. The logo must be a path on this origin under `/v1/`. The page reads
  it with the bearer token, as an image: SVG, PNG, WebP, JPEG, or GIF. An
  empty value keeps the default of the page. `src/lib/theme.ts` holds the
  checks.
- `templates` names the worker templates of the front, in the order of the
  configuration, each with `default`. It is `[]` without templates. The
  new-agent screen offers the choice only when it holds more than one, and
  it picks the default.
- `chat` is null when `workbench.bossmode.chat.agent` is empty. `chat.agent`
  is the profile of the quick chat, and `chat.member` is the fleet member
  that runs it, or `""`. A quick chat is a run of that profile on that
  member, with the metadata `fw.view: quickchat`. The Chat place uses it
  (section 7.7). Without it, the place says that no quick chat is set up.

A workbench without bossmode answers 404, and the page then shows no manager.

## 5. Bridges

### 5.1 The list and the record

`GET /v1/bridges` answers `{"bridges": [...]}`. Each item is the record of
section 6.1 of the plan without `members`, plus five fields:

| Field | Value |
|---|---|
| `lastSeq` | The seq of the newest entry of the channel |
| `lastAt` | **New.** The time of the newest entry of the channel, absent before the first entry. The row of the bridge shows its freshness, such as `14 min`, and an entry on the stream moves it. |
| `read` | The seq that the caller read last (section 5.2) |
| `unread` | The entries after `read` that count for the caller: a message of a person or an agent, and a card that waits for a decision. A message of the caller and a plain system line do not count. |
| `memberCount` | The number of seats, fired seats included |
| `needsYou` | The number of members with the presence `needs-you` |
| `unreadMore` | True when the unread entries reach past the bound of 2000 |

The workbench counts `unread` over at most the last 2000 entries of the
channel, so a larger count stops there, and `unreadMore` says so. The page
shows 99+ above 99, and 2000+ with `unreadMore`.

**New.** A seat asks the person with the tool `bridge_post` and `ask`, and
as a safety net any message of a seat whose `to` holds `operator`, or
whose text holds the word `@operator` anywhere, asks too. The front marks
the entry with `ask` (section 6.2) and names the question on the seat in
`question`, the seq of the entry, until a person answers it or the seat
posts again. While it waits, the presence of the seat is `needs-you`, and
`needsYou` of the bridge counts it, so the row of the bridge, the count of
the app bar, and Activity take it with no read of the channel. The page
shows the entry as a question card in the channel and in Activity, and
reads the entry alone, with `GET /v1/bridges/{id}/messages/{seq}`, when the
loaded part of the channel does not hold it. A front before questions
names no `question`. The page then finds a message of an agent that asks
the person after `read` in the channel, from `to` and the text, and shows
it in Activity until the person sends a message to that handle, to
everyone, or in reply to it, or the seat posts again; Activity reads the
channel of each bridge with `unread` above 0 for it.

`GET /v1/bridges/{id}` answers the same item with `members` and `usage`.
`usage` sums the usage of the runs of the bridge as the tool `batch` sums a
job: the fields of the usage of a run (`turns`, `toolCalls`, `costUSD`, and
the tokens), plus `reported`, `final`, `missing`, and `partial`, which is true
when a run reports no usage. Only this route carries `usage`. The foot of
the members pane shows the turns, the cost, and the pages of the bridge. A
record that arrives without `usage`, such as a list item or the answer of a
`PATCH`, keeps the last sum on the page. Each member is the member of the
plan plus two fields:

```json
{
  "handle": "migrator-1", "agent": "migrator", "pool": "crew",
  "task": "Migrate the cron module to an Ansible role",
  "runs": ["run-..."], "fired": false, "muted": false,
  "presence": "working",
  "activity": { "turn": 7, "tool": "bash", "callId": "c4", "phrase": "Ran \"ansible-lint roles/cron\"", "since": "2026-10-21T20:04:00Z" },
  "question": 0
}
```

**New.** `question` is the seq of the question of the seat that waits for
the person, or 0 (section 5.1).

`presence` is one word of the table of section 6.5 of the plan: `working`,
`needs-you`, `waiting`, `not-started`, `idle`, `asleep`, `limit`, `error`,
or `fired`. **New.** `limit` is a seat whose newest run stopped at a limit
of its budget, `budget exceeded` in the error of the run: no fault, and
Continue goes on with the run (section 5.4). The page derives it from a
run in the state `failed` with that error.
A seat with no run is `waiting` while its job waits on the queue of its agent
or the manager of its spawn bridge still runs, and `not-started` when that
manager stopped before it seated the member. A message to a `not-started`
seat starts it, and so does Seat again. `activity` is the K4
activity of the newest run of the member, or null. The page derives the
presence of a seat itself where it holds the facts (section 10.1), and
takes this field only where it lacks them.

### 5.2 The read mark

**New.** `PUT /v1/bridges/{id}/read` with `{"seq": 42}` sets the read mark of
the caller for the bridge and answers 204. A smaller seq than the mark leaves
the mark. The page sends it a moment after the person reads the channel.

Done on a message in Activity sends the seq of that message, so the message
leaves Activity for this person, and so does every earlier entry of the
bridge, as when the person reads the channel. A decision and a message that
asks the person have no Done: a decision leaves when it is decided, and a
message that asks when the person answers it.

### 5.3 Open, change, and close

`POST /v1/bridges`:

```json
{
  "title": "Migrate logrotate",
  "goal": "Migrate the logrotate module and review it.",
  "placement": "queue",
  "members": [{ "handle": "migrator-3", "agent": "migrator", "task": "Migrate the logrotate module" }],
  "delegation": { "approve": false, "budget": false, "members": false, "report": true },
  "caps": { "maxMessages": 2000, "maxTurns": 1000 }
}
```

`delegation` and `caps` are optional and partial: a missing key takes the
default. **New.** `caps.maxTurns` bounds the turns of every run of the
bridge together, 1000 by default, because each message gives a seat its
allowance again (section 5.4). Past it, nothing fans out until a person
raises the cap, and the channel says `The bridge reached its cap of <n>
turns`. A record of an older workbench answers the default. The answer is 201 with the record and its members. A handle is
lower-case letters, digits, dots, dashes, and underscores, at most 32.

`PATCH /v1/bridges/{id}` takes any of `title`, `delegation` (partial),
`caps` (partial), and `state` (`"closed"` or `"open"`), and answers the
record with its members. A close or an open posts a system line (section
6.2).

### 5.4 Members

| Route | Body | Answer |
|---|---|---|
| `POST /v1/bridges/{id}/members` | `{"handle", "agent", "task"}` | 201 with the member |
| `DELETE /v1/bridges/{id}/members/{handle}` | none | 200 with the fired member |
| `PATCH /v1/bridges/{id}/members/{handle}` | `{"muted": true}` or `{"task": "..."}` or both, or `{"continue": true}` | 200 with the member |

A fire of a fired member answers 200 with the member and changes nothing.

The budget of a seat is its allowance for each message that it handles:
each follow-up of the channel first raises the limits of the run by that
allowance over what the run used, so a seat that takes many messages does
not stop at the arithmetic of a budget that counts the whole run.

A seat whose newest run was canceled or failed gets no delivery from the
channel. A `PATCH` with `task` seats it again: a new run starts with the
task. **New.** A seat whose newest run stopped at a limit of its budget, the
presence `limit`, gets no message of an agent, and a message of a person
continues its run with the allowance. A `PATCH` with `{"continue": true}`
goes on with the same run, so the run keeps what it knows: the run gets the
allowance of its seat over what it used and a short message to go on, and
the channel says `<name> continued <handle>` with the event `task`. A seat
whose newest run did not stop at a limit answers 409, and `continue` with
`task` answers 400. The page offers Continue in place of Seat again on the
row of such a seat, over the composer of its conversation, in Activity, and
in its menu, where Seat again stays. For a seat whose newest run was
canceled or failed, the page offers Seat again on its row and in its menu,
beside Change task. Seat again sends the task of
the member unchanged as `task`, in one click. Change task opens the task,
which the person can change first. The page needs the workbench to seat
the member again also when the text of the task is the same. The page knows that a newest run stopped from the presence `error` or `limit`, or
from the state `failed` or `canceled` of the run on the stream.

## 6. The channel

### 6.1 Pages of the channel

`GET /v1/bridges/{id}/messages?before=&from=&limit=` pages as the transcript
route pages (the workbench architecture, section 2.2), and answers:

```json
{ "bridge": "br-puppet", "messages": [ ... ], "next": 0, "prev": 38 }
```

- Without `from` and `before`, the page holds the last `limit` entries.
  `limit` is 50 by default and 500 at most.
- `prev` is the value of `before` for the page in front, and 0 at the first
  page of the channel.
- `from=<seq>` reads forward. `next` is the seq to ask from, or 0.
- `from` and `before` together answer 400.

### 6.2 An entry

The plan gives the entry. The page reads four more fields:

```json
{
  "seq": 37, "at": "2026-10-21T20:13:00Z",
  "from": { "kind": "system" },
  "to": [], "replyTo": null,
  "text": "migrator-2 wants to run a command.",
  "event": "needs-you",
  "cut": false,
  "mirrors": { "run": "run-...", "seq": 11, "type": "fw.approval.requested" },
  "reactions": { "up": [], "down": [], "heart": ["alice@example.com"] },
  "decision": {
    "run": "run-...", "id": "ap-...", "tool": "bash", "label": "Run command",
    "reason": "rule: ask bash: git push*", "effect": "Runs \"git push origin migrate/nginx\".",
    "input": { "command": "git push origin migrate/nginx" },
    "state": "pending", "always": true
  },
  "pinned": false,
  "page": "",
  "skill": null
}
```

- `pinned` is true when each delivery of the message is pinned, so it
  survives every compaction of the runs of the members. The page shows a
  quiet chip `pinned` on such an entry.
- `page` is the wiki path that a system line is about, when the text of
  the line holds no link to it. The page links it.
- `skill` is the slash command of a message, `{"name", "args"}`, or absent.
- **New.** `ask` marks a message of a seat that asks the person:
  `{"choices": ["Yes", "No"]}`, two to four answers to pick from, or `{}`
  for an answer in words, and absent elsewhere. The entry waits while the
  `question` of its seat is its seq. The page draws it as a question card:
  the words of the seat, a key per choice, and Your answer. A key or Answer
  posts the answer as a message of the person with `to` the seat and
  `replyTo` the question (section 6.3).

- `from.kind` is `person`, `agent`, or `system`. A person has `name`, the
  subject, and `display`, a name to show, when the front knows one. An agent
  has `handle` and `run`.
- **New.** `event` names what a system line says, so the page picks its icon
  and follows the state of the bridge: `opened`, `closed`, `reopened`,
  `started`, `joined`, `needs-you`, `asked`, `decided`, `failed`, `asleep`,
  `fired`, `canceled`, `muted`, `task`, `changed`, `cap`, and `lost`. The page sets
  the bridge closed on `closed` and open on `reopened`. In particular:
  - The finished answer of a member is a message of that agent with no
    `event`, and it mirrors the `fw.run.finished` of the run.
  - A member whose Task wakes again posts `event: started` with the text
    `<handle> woke up.`.
  - After a close, the link to the report of the manager comes with
    `event: changed`. The text can hold a Markdown link, such as
    `[bridges/<id>/report.md](bridges/<id>/report.md)` or
    `[bridges/<id>/report.md](#page/bridges/<id>/report.md)`. The page shows
    every system line as one line of Markdown through the sanitizer. A link
    `#page/<path>` is the route of the page at `/ui`. The page maps it to its
    own route of the wiki, and the link opens the page of the wiki here.
  - The finished answer of a member can also come as a system line with
    `event: finished`.
  - A delivery that fails for good posts `event: failed`.
  - The fleet that lost the run of a seat, as after a roll of its workers,
    posts `event: lost` once per seat. Its text is `<handle> lost its run
    <id>: no worker of the fleet holds it`.
  - A later front writes each line as one fact with no advice and no end
    mark, such as `<handle> went to sleep`. The page reads both forms.
  - A later front writes a decision as `<decider> allowed <handle>'s
    command`, or `denied`, and also `file change` or `call of <tool>` in
    place of `command`. A note adds `, with the note: <note>`. A question
    reads `<decider> answered <handle>'s question: <answer>` or `<decider>
    declined <handle>'s question`. The decider is the subject, so the token
    of the fleet shows as `token`.
- **New.** `cut` is true when the channel holds only the first 4 KB of the
  text. The page then shows a quiet `Show all` at the cut and reads the
  whole entry only when the person presses it (section 6.4).
- **New.** `decision` is set on the entry that mirrors an approval or a
  question of a member run, and null elsewhere. It holds the fields of
  `dashboard.Decision` (the label, the reason, the effect, the input, and the
  schema of a question), plus:

  | Field | Value |
  |---|---|
  | `run` | The run that waits |
  | `state` | `pending`, `allow`, `deny`, or `unknown`: the front cannot tell whether a decision reached the run, such as when the run stopped first |
  | `decidedBy`, `decidedAt` | The subject and the time of the decision |
  | `note` | The note of the decision |
  | `answer` | The answer to a question, as words |
  | `always` | True when the card can offer Always allow. Without it, the page applies the rule of the front to `reason`: a call of one tool on a worker, held by `default` or by a rule that names the tool, never a flag such as `destructive` and never a pattern such as `bash: git push*`. A decision that the page builds from the run, as Activity does before it holds the card, takes the same rule, so both offer the same keys. |

  **New.** `input` is the whole call. The view of the front holds a call
  cut, or no input above 4 KB, so the front reads the run from its owner
  for the card. An input above 32 KB keeps the start of each string with
  the note of a cut, and every field. The card shows the short fields
  first, a text of several lines as a short block of code with Show all,
  and a map of files by name, each of which opens its text.

  When a decision lands, from any surface, the front changes the same entry
  and sends it again on the stream with the same seq. The page replaces the
  card in place. The front also posts a system line with `event: decided`.

  A card whose run stops waiting without a decision, such as after a fire or
  a cancel, is changed to `state: deny` with no `decidedBy` and a `note` that
  says why. The page shows "No decision" and the note.
- `reactions` holds the subjects of the people per reaction.

### 6.3 A message of the caller

`POST /v1/bridges/{id}/messages` takes `{"text", "to", "replyTo", "pinned",
"skill"}`. `to`, `replyTo`, `pinned`, and `skill` are optional, and without
`to` the message goes to every active member. `skill` is a slash command,
`{"name", "args"}`, and with it `text` is optional: it is the text of the
person that follows the skill. A one-on-one conversation with a seat sends
its slash commands this way, to that seat alone. The answer is 201 with the
entry. An unknown skill answers 404, a skill that is not for people 400,
and a message over 64 KB 413. The page sends no `files` yet. A handle in
`to` that is not on the roster, or that is fired, answers 400. The handle
`operator` in `to` answers 400 too: an agent can address the operator, and a
person cannot. A closed bridge answers 409.

When the person replies to a message of an agent and names no handle, the
page sets `to` to that agent, as section 4.2 of the plan says.

**New.** A message of the person that reaches a seat whose question waits
answers the question: a message whose `to` names the seat, a message to
everyone, or a reply to the question. The front ends the question and the
seat gets the message as its answer, which starts its next turn. The body
takes no `ask`: only a seat asks.

### 6.4 One entry, whole

`GET /v1/bridges/{id}/messages/{seq}` answers one entry in the shape of
section 6.2, with `text` the whole text, up to 64 KB. The channel keeps the
whole text of a cut entry, so `cut` stays true only for an old entry whose
start alone was kept. An unknown entry answers 404, and a seq that is no
positive whole number 400.

The page reads the route only when the person presses `Show all` under a
cut entry, never for each entry on load, and keeps the text for the visit,
so a later change of the entry on the stream, such as a reaction, keeps it
whole. An entry that stays cut shows `Cut at 4 KB.` with the link `Whole
text` to the conversation of its agent.

### 6.5 Reactions

`POST /v1/bridges/{id}/messages/{seq}/reactions` takes
`{"reaction": "up" | "down" | "heart", "note": "..."}`, with the note
optional and at most 1 KB, and answers 200 with the changed entry. A second
reaction of the same kind from the same person changes nothing and answers
the entry. The page never removes a reaction.

On a card that waits, the thumbs do not call this route. A thumb up calls
`POST /v1/runs/{run}/approvals/{id}` with `{"decision": "allow"}`, and a
thumb down with `{"decision": "deny"}` (section 7.2).

### 6.6 The pages of a bridge

`GET /v1/bridges/{id}/pages` answers the pages of the wiki that belong to
the work of the bridge, sorted by path:

```json
{
  "bridge": "br-puppet",
  "pages": [
    { "path": "k3s/monitoring/alerts.md", "title": "Alerts of the node", "tags": [], "hash": "8d3c...", "version": 41, "size": 812,
      "by": "agent:migrator", "run": "run-...", "at": "2026-10-23T01:12:00Z", "summary": "The alert rules", "seat": "migrator-1" }
  ],
  "count": 1
}
```

- The list holds each page under `bridges/<id>/`, such as the report, and
  each page whose newest version a run of the bridge wrote, wherever the
  agents put it. The runs of the bridge are the runs of its seats, their
  helpers, and, in a spawn bridge, the manager run and its children. A page
  that somebody wrote again since belongs to its newest writer and leaves
  the list.
- Each page has the fields of `GET /v1/pages` (section 8) and `seat`, the
  handle of the seat whose run wrote it, or `manager`, when the front knows
  it.
- The caller needs the rule of the bridge and the rule of the wiki.

The tab Wiki of the channel lists these pages, each a link to the page in
the Wiki place with the seat that wrote it, and the foot of the members
counts them. The event `page` of the stream carries `run` (section 10), so
the page keeps the list current: a page under `bridges/<id>/` or of a run of
a seat joins, with its seat; a page that a person, the front, or a run of
another bridge wrote last leaves, and so does a removed page. A run that the
page holds names its bridge in its metadata `fw.batch`, as `bridge:<id>`,
and its seat in `fw.bridge.member`. A page of a run that the page cannot
place makes the page read the list again while a screen shows it. A
workbench without the route answers 404, and the page then lists the pages
under `bridges/<id>/` from `GET /v1/pages`.

## 7. Runs

### 7.1 The run, the result, the transcript, and the files

The page reads the existing routes `GET /v1/runs/{id}`,
`GET /v1/runs/{id}/result`, `GET /v1/runs/{id}/transcript`, and
`GET /v1/runs/{id}/files/{path}` with `Accept: application/json`, as `/ui`
reads them. The front sends the last three to the member that holds the
run, and the router of ax wakes a worker that sleeps for them. So the page
reads them only while the worker is awake, or on an action of the person
(section 10.1). A later front will answer `GET /v1/runs/{id}` from its
view for a member that sleeps. Until then, that read wakes the worker too,
so the page polls it only while the run works. The front can know a run
only from its durable index, until it reads the worker. Such a run comes
with no `title`, `input`, or `output`, and its `pending` card has no
`input` or `schema`. The page shows such a run without them and raises no
notice. The card then says that the agent asks for your decision. The run object carries two fields of the kernel changes:
`activity` (K4) and `reactions`, the counts of K2. The quick chat also
reads these fields of the run object:

- `usage`: `inputTokens`, `outputTokens`, `cacheReadTokens`,
  `cacheWriteTokens`, `turns`, `toolCalls`, `costUSD`, and
  `unpricedTokens`. This chat shows the turns, the sum of the tokens, and
  the cost, with `so far` while the run works.
- `extraTools`: the tools that an inline profile gave the run beyond the
  tool list of its agent. This chat marks each one `for this chat`.
- **New.** `resolved`: `{"model", "tools", "skills"}` of the profile that
  the kernel resolved when it queued the run. The kernel records it in
  `fw.run.queued` and does not put it in the run object yet. The page
  shows the model when the field is there, and names the tools and the
  skills of a chat from it. Without it, the page reads the first event of
  the run, `GET /v1/runs/{id}/events?from=1&limit=1` with `Accept:
  application/json`, which answers `{"run", "events", "lines"}`. The event
  `fw.run.queued` holds `profile`, the inline profile of the request,
  `extraTools`, and `resolved`, with `tools`, `skills`, `model`, and
  `policy`. The front sends the call to the member that holds the run, and
  the page reads the event once per run. The fake server sends `resolved`
  in the run object and serves the event.
- The profile of an agent that a pool runs comes from `GET
  /v1/agents/{name}` (section 13). Where the front does not answer it, the
  profile reads the tools and the rules from the first event of the newest
  run of a seat of the agent, when that run has no inline profile.

### 7.2 Decisions

`POST /v1/runs/{id}/approvals/{approval}` takes
`{"decision": "allow" | "deny", "note": "...", "content": {...}}`, as `/ui`
sends it. `content` is the answer of a form or a choice. A free answer goes
in `note`. Always allow calls `POST /v1/runs/{id}/approvals/{approval}/rule`
with `{"note"}` and then allows, as `/ui` does.

**New.** The front decides every action of a person on a run with the
rules of what the person sees, and calls the worker with the credential of
the fleet, naming the person in the header `Fw-On-Behalf-Of`. So a person
who can see a decision and holds the operator role decides it, whichever
worker holds the run, and the ledger names that person as the decider. The
run object that the front answers to a person carries
`"can": {"view": true, "operate": <bool>}`. The page shows the keys of a
card that waits only when `operate` is true or `can` is absent. Otherwise
the card says who decides and offers no key.

### 7.3 Reactions on a run

`POST /v1/runs/{id}/reactions` takes `{"seq", "reaction", "note"}`. The page
sends the seq of the last `end` item of the transcript, which is the
`fw.run.finished` of the run, so a thumb on a result can also record a
quality receipt (K2). The kernel answers 200 with the run object, whose
`reactions` holds the counts per kind. The page takes the counts from that
answer and says that the reaction is recorded. It does not say whether the
reaction recorded a receipt, because the answer does not tell.

### 7.4 The manager

The first message starts a run with
`POST /v1/runs?member=<manager.member>` and
`{"agent": "<manager.agent>", "input": "..."}`, as `/ui` starts a run on a
member. A later message is `POST /v1/runs/{id}/messages` with
`{"content": "..."}`. A run that failed or was canceled ends the
conversation, and the next message starts a new run. While the run is
`queued` or `suspended` and the first answer is missing, the status says
`waking`, with "Waking the manager" in its tooltip.

The page follows the run on the stream (`run` events) and reads the new
transcript items with `from`, at most once every 3 seconds, because a run
that works sends an event per step. A run of the front sends no `run`
event, so the page also reads `GET /v1/runs/{id}` every 3 seconds while the
conversation is open and the run works or an answer is on its way. A run
that a worker of the fleet holds, as its `member` names it, comes on the
stream, so the page never polls it.

A conversation with an agent that sits on no bridge works the same way:
the first message starts a run on a member of the fleet whose agents hold
the agent, a live member first, and a later message follows up.

### 7.5 A slash command in a run

`POST /v1/bossmode/runs/{id}/skill` takes `{"name", "args", "text"}`, with
`args` and `text` optional, and answers 202 with the run object, as
`POST /v1/runs/{id}/messages` answers. The front expands the skill of the
catalog and sends the message pinned. The conversation of the manager, of
an agent on no bridge, and of the quick chat send their slash commands
here. An unknown skill answers 404, and a skill that is not for people
answers 400.

### 7.6 The live answer

`GET /v1/runs/{id}/live` streams the text of a run as the model writes
it, as server-sent events with no ids. The page reads it with `fetch` and
the bearer token, as it reads the stream of section 10, in
`src/api/live.ts`.

| Kind | Data | What the page does |
|---|---|---|
| `delta` | `{"turn", "text"}` | Appends the piece to the pending answer at the end of the thread. A piece of another turn after a `done` starts a new part of it. |
| `tool` | `{"turn", "name", "callId"}` | Shows the quiet line `Working: <tool>`. |
| `done` | `{"turn", "stopReason"}` | Ends the part of the turn and takes the line away. `error`, a call that failed, drops its text. The Chat tab of a seat also drops the text before a tool call (`tool_use`), because its thread shows only the answer that the channel holds. |
| `idle` | `{"state"}` | The run left the running state: the stream stops, and the page reads the run. |

- A comment line every 15 seconds keeps the stream open.
- A client that connects in the middle of a model call gets the pieces from
  then on, with no replay. The page shows what it gets, and the real item
  of the answer takes the place of the pending answer once the view holds
  it: the assistant item of the transcript, or the entry of the seat in
  the channel, with a seq above the newest seq that the view knew when the
  part began.
- The page opens the stream while the run is `queued` or `running`, or
  while an answer to a message of the person is on its way. After a clean
  close it connects again at once while the run works, unless the stream
  lived less than 5 seconds: then it waits first. After a lost connection
  or a 5xx it waits 1, 2, 4, then 8 seconds. It stops on `idle`, and opens
  again once the run moves.
- A run takes 16 clients. The 17th gets 429: the page stops for that run
  in that view, shows `Live view is busy`, and reads the run with its
  poll. Another error answer, such as a 404 of a workbench without the
  route, stops it with no note.
- The stream ends when the run finishes or the client goes. The page
  closes it when the view closes.
- Only a one-on-one view opens it: the quick chat, the manager, an agent
  on no bridge, and the Chat tab of a seat, where the run is the newest
  run of the seat. The bridge channel, the inbox of Activity, the board,
  and the run pane of a bridge never do.
- A run of the front itself sends no `run` event on the stream of section
  10, so its conversation still reads `GET /v1/runs/{id}` every 3 seconds
  while it works (section 7.4). The live route works for it all the same.
  The front relays the route for a run of another fleet member.

### 7.7 The quick chat

The Chat place holds the quick chat of `chat` (section 4). A chat is a run
of `chat.agent` on `chat.member`.

- The history is `GET /v1/fleet/runs?agent=<chat.agent>&principal=<subject>`,
  with the subject of `GET /v1/whoami`. The answer is
  `{"runs": [<run>], "total", "glance"}`, newest first, in the shape of
  `GET /v1/runs` of the kernel. Each row shows `title`, the state, and
  `createdAt`. The kernel titles a run from the first sentence of its
  input, and the front can write a model title later as the annotation
  `fw.title`. A chat that the page starts joins the history through its
  metadata `fw.view: quickchat`.
- The picks of a new chat start from the lists of the agent, from
  `GET /v1/agents/{name}`, `tools` and `skills`. The catalog of the front,
  `GET /v1/tools` (section 12), is not what the agent can run: a worker
  has tools that the front does not, such as `front.pages_*`. So the row
  Tools holds the tool list of the profile, each entry as the tools of the
  catalog that it names, or as one chip by its name where it names none.
  A tool list that is empty or holds `*` gives every tool, and an entry
  can name a whole server, such as `github`, or a glob, such as
  `front.pages_*`. The other tools of the catalog sit under More tools,
  off. `spawn_task`, `await_task`, `propose_agent`, and `ask_user` never
  start on for a quick chat. The skills come from
  `GET /v1/bossmode/skills`, and a skill list of `null` gives every skill.
- The first message starts the run:

  ```
  POST /v1/runs?member=<chat.member>
  {"agent": "<chat.agent>", "input": "...",
   "profile": {"tools": [...], "skills": [...]},
   "metadata": {"fw.view": "quickchat"}}
  ```

  A tool or skill list of the inline profile replaces the list of the
  agent for this run. A tool that the list of the agent leaves out still
  works, and the run object names it in `extraTools`. An empty tool list
  gives a run every tool, so the page asks for at least one tool before it
  starts a chat. A catalog of tools that is empty or did not load offers
  the entries of the tool list of the profile alone. Where neither names a
  tool, or the skill catalog is empty, that list stays out of the inline
  profile, so the list of the agent holds. `title` is optional, and the
  page leaves it out.
- A later message is `POST /v1/runs/{id}/messages` with `{"content"}`. A
  slash command of a chat with a run goes to
  `POST /v1/bossmode/runs/{id}/skill` with `{"name", "args"}` (section
  7.5). On a new chat, a slash command starts the run with its text.
- A chat that failed or was canceled takes no message, so the next message
  starts a new chat with the same picks.
- Reopening a chat of the history is a follow-up conversation on that run.

## 8. Pages

| Route | Answer |
|---|---|
| `GET /v1/pages` | `{"pages": [<info>]}`. `?prefix=` keeps the pages whose path starts with that text, such as `agents/reviewer/`. |
| `GET /v1/pages/{path}` | `<info>` plus `"text"`, with `ETag: "<hash>"` |
| `GET /v1/pages/{path}?version=<version>` | The same for an older version |
| `PUT /v1/pages/{path}` | 200 with the page, or 201 for a new page |
| `GET /v1/pages/{path}/history` | `{"path", "versions": [...]}`, newest first |
| `GET /v1/pages/search?q=` | `{"q", "results": [...], "read", "unread", "cut"}` |

The info of a page:

```json
{
  "path": "runbooks/ansible-style.md", "title": "How we write Ansible", "tags": ["ansible", "style"],
  "hash": "8d3c...", "version": 5, "size": 333,
  "by": "agent:reviewer", "run": "run-...", "at": "2026-10-21T20:00:00Z", "summary": "Add the rule about handlers"
}
```

- `version` is the revision of the store. It grows with each write of the
  wiki, so the versions of one page grow, but they are not consecutive.
- `by` is the subject of a person, `agent:<profile>`, `run:<id>`, `token`
  for the token of the fleet, or `bossmode` for a page that the front
  writes, such as `agents/<agent>/learned.md` and `_index.md`. `run` is the
  run that wrote, when a run wrote.
- A version of the history has `version`, `hash`, `by`, `at`, `summary`, and
  `size`, and optionally `title`, `run`, and `deleted`. A version with
  `deleted` marks a removal and has no text, no hash, and no writer.
- A result of the search has `path`, `title`, `snippet`, `version`, and
  `score`. `cut` is true when the search stopped at its bound before it read
  the whole wiki.

The rule of a path:

- A path is relative, with at most 8 parts and 512 bytes, no empty part, no
  part that starts with a dot, and no control character.
- The last part ends with `.md`, and no other part ends with `.md`.
- The path `search` and a path whose last part is `history` are refused,
  because they meet the routes of the search and of the history.
- The front writes `_index.md` after each change, and nobody else writes it.

The workbench answers 400 for any other path. The page checks the same rule
before it sends a new page, adds `.md` when the person leaves it out, and
shows the names in the tree without `.md`. The page offers no Edit on
`_index.md`.

A link inside a page that names a relative path, such as
`../../runbooks/ansible-style.md` in `bridges/<id>/plan.md`, resolves
against the folder of the page and opens the page of the wiki at
`#pages/<path>`. A link that climbs above the root of the wiki, or that
names a file that is not a page, keeps its text and no address.

Writes:

- `PUT` takes `{"text": "...", "summary": "..."}` as JSON. The page sends
  `If-Match: "<hash>"` for an edit and `If-None-Match: *` for a new page.
- A 412 carries `hash`, the current hash, in the problem document, and an
  `ETag` header when the page exists. On a 412 the page reads the page again
  and asks the person: keep their own text and save over, or take the other
  version.
- A write of the same text makes no new version and answers the page as it
  is.

## 9. Faces

| Route | Answer |
|---|---|
| **New.** `GET /v1/faces` | `{"faces": [{"agent", "displayName", "tagline", "hash", "custom"}]}` for every agent that the caller can see |
| `GET /v1/faces/{agent}` | `image/svg+xml` with `ETag: "<hash>"` |
| `PUT /v1/faces/{agent}` | The SVG as the body. 200 with the entry of `GET /v1/faces`. A body over 32 KB answers 413. A face that fails the sanitizer answers 422 with the reason in `detail`. |
| `PATCH /v1/faces/{agent}` | `{"displayName", "tagline"}`, both optional. 200 with the entry. |
| `DELETE /v1/faces/{agent}` | 200 with the entry, back to the identicon |

Each entry can also carry `by`, `at`, and `version`: who changed the face
last, when, and the revision of the store. `hash` changes when the picture,
the name, or the tagline changes. The page reads a face again when its hash
changes. A `GET /v1/faces/{agent}` for an agent that the caller cannot see
answers the identicon, not a 403, so a face never fails on the page. The
page refuses a file over 32 KB before it sends it. It reads the SVG with the bearer
token and shows it as a blob URL in an `img` element, never as markup.

## 10. The stream

`GET /v1/bossmode/stream` answers `text/event-stream`. The page reads it
with `fetch`, because EventSource cannot send the bearer token, so the
stream route takes the same `Authorization` header as every route.

- Each event has `id:`, `event:`, and one `data:` line of JSON.
- An id is a decimal counter that starts at the start time of the front in
  microseconds, so an id from before a restart of the front gives `reset`.
  The page keeps ids as strings. On a reconnect the page sends
  `Last-Event-ID`, and the front sends every event after that id.
- The front closes a stream on its own after 15 minutes. The page connects
  again at once with `Last-Event-ID`, and the readout of the fleet stays as
  it is. Only a stream that ends within 5 seconds, or a failed connection,
  makes the page wait. The readout says `Connecting` only after the stream
  has been down for 6 seconds, because the reads of the page are fresh
  while it connects.
- **New.** The front writes one comment line, `: connected`, at once after
  the headers, so a proxy that waits for the first bytes of a body passes
  the stream on. The page skips comment lines.
- **New.** When the front cannot resume from the id, it sends one event of
  the kind `reset` with `data: null`. The page then reads the bridges, the
  faces, the open channel, and its roster again.
- A comment line, such as `: keep-alive`, every 15 seconds keeps a proxy
  from closing the stream. `retry:` is optional.
- A 401 ends the stream, and the page goes to sign-in.

| Kind | Data |
|---|---|
| `bridge.message` | `{"bridge": "<id>", "message": <entry>}`. A new entry, or a changed one with the same seq. An event with `"partial": true` beside `bridge` and `message` carries the entry without `decision.input` and `decision.schema`, because the whole entry is larger than an event: the page reads it again with `?from=<seq>&limit=1` and never shows the cut card. An entry can come twice, by the relay of the replica that wrote it and by the catch-up of the replica of the stream, and the page takes the same entry as it is. |
| `bridge.member` | `{"bridge": "<id>", "member": <member>}`. A new seat, or a change of a seat: its presence, its activity, its task, muted, or fired. |
| `run` | The run object, with `member`, `activity`, and `reactions`. One event per change of a run that the caller can see. |
| `page` | The info of the page as `GET /v1/pages` lists it, with `run` when a run wrote it, plus `"deleted": true` for a removed page |
| `face` | The entry of `GET /v1/faces` for that agent |
| `member` | `{"kind": "member", "member": "default/crew-2", "state": "live", "time"}`, or `"gone": true` in place of `state` for a member that left the view |
| `task` | `{"kind": "task", "member": "default/crew-2", "phase": "Running", "time"}`, or `"gone": true` |
| `routine` | `{"kind": "routine", "agent": "triage", "name": "acknowledge-a-new-ticket"}`, on every change of a routine or its evidence, at most one per routine in 2 seconds. Section 15. |

The `activity` of a `run` event carries `phrase`. The `activity` of
`GET /v1/runs/{id}` has no `phrase`, so a screen takes the phrase from the
stream or from the member of a bridge. `run` events come only for the runs
of other fleet members: a run of the front itself, such as a manager that
runs on the front, needs a poll of `GET /v1/runs/{id}`. A `member` event
changes the state of a fleet member. A `task` event changes the phase of
the Task of a pool whose `atespace/name` is `member`. A Task that is gone
leaves its pool on the screen. A `task` event for a Task that the fleet
view does not list makes the page read `GET /v1/fleet` again, so a new
worker shows. The page reads `GET /v1/fleet` at boot and after a `reset`.

A `bridge.message` or `bridge.member` event for a bridge that the page does
not know makes the page read that bridge with `GET /v1/bridges/{id}`. A
bridge that the manager opens therefore shows in the rail.

**New.** The page reads a channel forward, from its newest loaded entry,
where an event says that something waits that the loaded channel lacks: a
`run` event of a seat that waits for a decision with no card of it, a
`bridge.member` event that names a `question` that the channel lacks, and
a `bridge.message` after a gap of seqs. It reads 1.5 seconds later, so the
event can still come, and again after 5 and 15 seconds while the entry
still lacks. The first read of a channel reads on to the `lastSeq` of the
record, for an entry that came while it read, and the tab Decisions reads
forward before it reads back, so it never says `Nothing needs you.` while a
card waits.

### 10.1 One state per worker

The page keeps one state per worker from the stream, and derives every
status from it in `src/lib/status.ts`.

- The phase of its Task comes from the `task` events.
- The state of its member comes from the `member` events.
- The runs that it holds come from the `run` events and from
  `GET /v1/fleet/runs?state=active`. The page reads that route at boot and
  after a `reset`. The state `active` keeps every run that is not
  finished, as on `GET /v1/runs` of the kernel. The front answers it from
  its view, so the read wakes no worker. The page needs `member` on each
  run, as `atespace/name` or the name alone.

The presence of a seat is the presence of section 6.5 of the plan. The
page derives it from the newest run of the seat and the phase of the
worker that holds it. A worker that sleeps or starts counts as asleep, and
a worker that fails, stops, or says that it is blocked counts as an error.
The `presence` of a member of a bridge stands only where the page lacks
the facts. That is a newest run that the page does not hold, or a finished
run on a worker whose phase the page does not know. A run that the fleet
lost counts as missing: a line of `event: lost` names it, or a read of it
answers 404. So does a run on a worker that left the fleet view, as after
a roll of the workers. The page reads a lost run no more, also after a
reset of the stream, until a run event brings it back, and the 404 raises
no notice. A worker is busy while it holds an open run. Until the page reads the open runs, the `active`
count of `GET /v1/fleet` stands in.

A read of the result, the transcript, or the files of a run wakes a worker
that sleeps. The Chat tab of a seat reads nothing of such a worker. It
shows the entries of the channel, the live answer, and the steps that the
page read while the run worked. The inbox reads no result of such a
worker. For a run whose worker sleeps, three views read them: the tab Run
of a seat, the tab Files of a seat, and the run pane of a bridge. Each
reads them as soon as the person opens it, and says so in place:
`This read wakes the worker.`

## 11. Rules of the backend that the page follows

- The sign-in takes a `next` that starts with `/bossmode/`. The page writes
  its own address with the slash, so `/bossmode` becomes `/bossmode/`.
- The handles `operator` and `manager` are reserved, and a handle starts
  with a letter or a digit. `src/lib/handles.ts` checks both before a seat
  goes out.
- An entry can come from the handle `manager`, which is not on the roster.
  The page draws the mark of the manager for it.
- An unknown field in a JSON body answers 400, so the page sends only the
  fields of this contract.

## 12. Skills and tools

The backend serves the skills from its own branch. The catalog names no
agent and no tool, so the page reads the skills of each agent and the
tools of the kernel from routes of their own.

| Route | Answer |
|---|---|
| `GET /v1/bossmode/skills` | `{"skills": [<skill>]}`, every skill that the front knows |
| `GET /v1/agents/{name}/skills` | `{"agent", "pool", "allowlist", "skills": [<ref>]}`: the skills list of the profile, `null` for every skill, and the skills of the catalog that it allows |
| `GET /v1/skills/{name}` | The skill of the kernel: `{"name", "description", "origin", "server", "uri", "body", "files"}`, where `body` is the whole SKILL.md and `files` the paths of the other files. The page escapes the name, because a skill of a server is named `<server>/<name>`. |
| `GET /v1/tools` | `{"tools": [<capability>]}`: each tool of the kernel with `name`, `description`, `source` (`builtin`, or the name of a server), and `text`, its plain phrase |
| `GET /v1/bossmode/marketplaces` | `{"marketplaces": [{"name", "url", "kind", "skills": [{"name", "description"}], "notes", "error", "fetchedAt"}]}`. `error` says why the index of a marketplace did not load. |
| `POST /v1/bossmode/skills/preview` | Takes the fields of a source and answers the preview. Nothing is installed. |
| `POST /v1/bossmode/skills` | Takes the fields of a source, `replace`, and `digest`, and installs the skill |
| `DELETE /v1/bossmode/skills/{name}` | 204. Only an imported skill can go. A skill of the configuration or of a server answers 409. |

A skill of the catalog:

```json
{
  "name": "ansible-style", "description": "Write Ansible roles the way this team writes them.",
  "origin": "imported", "uri": "ansible-style/SKILL.md",
  "userInvocable": true, "modelInvocable": true, "argumentHint": "<role>",
  "arguments": [], "files": ["checklist.md"]
}
```

- `origin` is `local` for a skill of a skills directory, `imported` for a
  skill that an admin imported, or `mcp` for a skill of an MCP server, which
  `server` names. The name of a skill of a server is `<server>/<name>`.
- `userInvocable` is false when the front matter says
  `user-invocable: false`, so no person hands the skill to a run, and the
  slash menus leave it out. `argumentHint` and `arguments` come from the
  front matter. The slash menu shows the hint beside the name.
- "Agents that can load it" on the Skills place comes from
  `GET /v1/agents/{name}/skills` of each agent that the fleet lists. The
  page reads them while the Skills place is open and forgets them when it
  closes. A slash menu reads the skills of its one agent the same way. The
  route answers an agent that a pool runs, a profile that a worker of a
  pool holds, and a profile of the front, and 404 for any other name. So
  the page first reads the fleet and the profiles of the front, and asks
  for no other agent, such as a profile of the process of a member outside
  the pools: that agent loads no skill. A 404 also means no skill, with no
  notice and no second read.

A source names exactly one of these, as top-level fields:

```json
{"url": "https://skills.example.com/release-notes/SKILL.md"}
{"marketplace": "team-skills", "name": "molecule-ci"}
{"text": "---\nname: ...\ndescription: ...\n---\n..."}
{"files": [{"path": "SKILL.md", "text": "..."}]}
```

A URL names a SKILL.md, the directory of a skill in a repository, or a zip
archive. An upload holds at most 64 files and 1 MiB.

The preview answers, in this order:

```json
{
  "name": "molecule-ci", "description": "Run molecule in CI and read its failures.",
  "frontMatter": { "name": "molecule-ci", "description": "...", "license": "MIT" },
  "entry": { "name": "molecule-ci", "origin": "imported", "...": "..." },
  "body": "# molecule-ci\n...",
  "files": [{ "path": "SKILL.md", "size": 230 }],
  "digest": "sha256:...",
  "source": { "kind": "marketplace", "marketplace": "team-skills", "name": "molecule-ci", "digest": "sha256:..." },
  "exists": null,
  "problems": [{ "code": "binary", "path": "logo.png", "text": "...", "blocks": false }],
  "installable": true
}
```

- `exists` names the skill that holds the name: `{"origin", "replaceable"}`.
  Only an imported skill is replaceable.
- A problem that blocks stops an install, such as a missing name. A note,
  such as a binary file that the import leaves out, does not.
- `installable` is false when a problem blocks, except the name of an
  imported skill, which `replace` takes the place of.

The install answers 201 for a new skill, or 200 when it replaced an
imported skill, with `{"skill", "replaced", "preview"}`. The page sends the
digest of the preview that the person read:

- 409 when the name exists and the install does not replace it, or a skill
  of the configuration holds it, or when the source gives another digest
  than the preview. The page offers Replace for the first case, and a new
  preview for the last.
- 400 for a problem that blocks, and for an install from a URL or a
  marketplace without `digest`.
- 413 for a source with too many files or too many bytes.

Only an admin of the process (`access.admins`) previews, installs, and
removes a skill. Another caller gets 403, and the page shows Add skill and
Remove to an admin alone.

## 13. Agents and workers

| Route | Answer |
|---|---|
| `GET /v1/agents` | `{"agents": [<view>]}`: each profile of the front itself, as `name`, `description`, `role`, `tools`, `skills`, and `policy`, among others. The front lists no profile that the workers of a pool run. |
| `GET /v1/agents/{name}` | One agent in the same shape. The profile shows its `tools` as chips and the rules that ask first as amber words, and the picks of a new chat start from its `tools` and `skills`. An agent that the caller cannot view answers 404. **New:** for an agent that a pool runs, the front answers the profile that the workers of the pool run, as the tool `agent_get` does, with `pool` and with no `abilities`. Today the front answers 404 for such an agent, and the page then shows the agent of the fleet with no lists. |
| `PUT /v1/agents/{name}` | Takes the profile and `workers`, `{"template", "replicas"}`, and answers 201 for a new agent or 200, with `{"name", "description", "role", "pool"}`. `pool` is the status of the workers that the front made. With `?dryRun=true` it checks the profile, saves nothing, and adds `exists`, and for an agent that workers run, `workerTools` (their tools for a profile that names none, a server as `<server>.*`) and `workerPolicy` (`{ask, deny}`, which the profile can only tighten). The preview words them as the profile does. An unknown field answers 400. |
| `GET /v1/pools/{name}` | The status of the workers of a pool: `name`, `source`, `template`, `atespace`, `agent`, `intake`, `wanted`, `actual`, `ready`, `hash`, `tasks`, `gaps`, and `checkedAt`. The page names the pool of an agent from the fleet view, else by the rule of the front for a new agent: the name in lower case, with a hyphen for each character that is not a letter or a digit. |
| `PATCH /v1/pools/{name}` | `{"replicas": n}` changes Keep, for an owner. The answer is the status. |
| `DELETE /v1/pools/{name}` | Removes every worker of the agent, for an owner, after Confirm. |
| `GET /v1/bossmode/agents/{agent}/today` | `{"runs", "costUSD", "decisions", "partial"}` of the day of the agent. `partial` is true when a run reports no cost. A workbench without the route answers 404, and the profile then shows no Today. |

The agents of the fleet are the agents that a person can seat, list, and
open. The page reads them from `GET /v1/fleet`: the `agent` of each pool,
and the `agents` of each member other than the front itself (`self`), each
with the `role` of the caller. A profile of `GET /v1/agents` adds its
description and its lists to an agent of the same name. A profile of the
front that no pool runs shows only when the page knows a run of it, such
as a seat, also where a member holds a profile of that name, as a member
of an old test can hold `default`. `src/lib/agents.ts` holds the rule. The
picker of Add, the people list, the new-bridge screen, the Skills place, and
the new-agent screen read this one list. The free workers of an agent come
from its pool.

The page never says pool to a person: the profile says Workers and Keep.
The profile reads `GET /v1/pools/{name}` and Today once when it opens.
The pool gives Keep (`wanted`) and the `gaps`, which no event of the stream
carries. The profile reads the pool again only when the phases of its
workers change on the stream, and Today only when a run of the agent
changes its state, at most once every 5 seconds each, and it keeps both
answers for the next view of the agent. The page reads a pool only once
the fleet view names it, and it stops a read of the pool or of Today that
answered 404. The
profile reads `agents/<agent>/learned.md` only while the list of the wiki,
once loaded, holds it. The workers and their phases come from the stream (section 10.1),
never from that read.

## 14. What the page does not call yet

- `files` on a message of the channel.
- The budget of a run. The plan offers a button to raise the budget of a
  member that failed at a limit. The page shows the limit and has no button.
- `DELETE /v1/pages/{path}`.
- A route that sets the title of a run. The front writes `fw.title` with
  `fw.Agent.Annotate`, and no HTTP route offers the annotation, so the
  Chat place has no Rename.
- A run to start a new agent from. The new-agent screen takes no run,
  such as `#new-agent?fromRun=<id>`, so the Chat place has no Save as
  agent.

## 15. Routines

The Routines place reads the routes of the branch `routines/workbench`,
after section 4.4 of `docs/ROUTINES.md` of the kernel. `src/api/routines.ts`
holds the calls and the types, and `fake/routes-d.mjs` serves the same
shapes. The page never calls `PUT /v1/routines/{agent}/{name}`, which is
for the lab and the manager.

| Route | What the page does with it |
|---|---|
| `GET /v1/routines` | `{"routines": [<record>]}`, newest change first, without `evidence`. The list pane calls it without `agent`, and the workbench answers the routines of every agent that the person can view. `?agent=<name>` narrows it to one agent. |
| `GET /v1/routines/{agent}/{name}` | The record with `evidence`, always present and empty for a new version. The list leaves out evidence, and a row needs it for its meta line, so the page reads each routine that is not retired. A 404 says in place that the routine is gone. |
| `POST /v1/routines/{agent}/{name}/standing` | `{"standing", "note", "version"}`. `version` is `routine.version` of the record that the person read, on every move. The page leaves out an empty note. The answer is the record, and the page reads the record again with its evidence. A 409 means that the routine changed: a newer version, or another standing. The page then reads the record again and shows it under the quiet line `This routine changed. Read it again.`, with no notice. A sign-off by the static token answers 403, and the notice shows its sentence. |
| `GET /v1/routines/summary?agent=<name>&days=7` | The week of the agent in the details pane. A 404 leaves the week out. |
| `GET /v1/pages/agents/{agent}/routines/{name}.md` | The tab Runbook of a routine with `signedOff`. The front writes the page on a sign-off. A 404 shows the runbook that the page renders. |

Reading needs the right to view the agent, else 404. A move needs the
right to edit it, else 403. The page offers the moves where `roles` of
`GET /v1/whoami` names the person `owner` of the agent. A ticket links to
its run on the page at `/ui`, as `/ui#run/<id>`, as a heart does.

A record. Only a routine that was signed off has `signedOff`. `source` and
`routine.canary` show only with a value. The routine never carries a
standing.

```json
{
  "agent": "triage",
  "standing": "rehearsing",
  "ready": true,
  "signedOff": { "by": "ada@example.org", "at": "2026-10-23T09:12:00Z" },
  "history": [{ "at": "2026-10-12T09:12:00Z", "by": "alice", "standing": "rehearsing", "note": "", "version": 1 }],
  "source": { "runs": 212, "from": "2026-09-14", "to": "2026-10-21", "proposedBy": "fw routine propose" },
  "createdAt": "2026-10-11T16:12:00Z",
  "updatedAt": "2026-10-23T09:00:00Z",
  "routine": {
    "name": "acknowledge", "version": 1, "decider": "clef", "canary": 0.05,
    "questions": {
      "type": { "type": "choice", "instructions": "...", "criteria": { "bug": "...", "access": "...", "other": "..." }, "act": 0.85, "expect": ["bug", "access"], "observe": { "answer": "..." } },
      "beyond": { "type": "noul", "instructions": "...", "act": 0.95, "expect": "no" }
    },
    "steps": [{ "tool": "gitea.label_read", "input": "{...}", "as": "labels" }],
    "after": [{ "tool": "gitea.issue_read", "input": "{...}", "contains": ["status/triaged"], "lacks": ["status/new"] }],
    "answer": "..."
  }
}
```

`ready` true on a rehearsing routine is what the page shows as needs you.

The evidence of the current version:

```json
{
  "version": 1,
  "totals": { "decided": 1480, "acted": 1432, "agreed": 1397, "disagreed": 35, "handed": 48, "applied": 0, "failed": 0 },
  "days": [{ "day": "2026-10-23", "decided": 125, "acted": 121, "agreed": 119, "disagreed": 2, "handed": 4, "applied": 0, "failed": 0 }],
  "questions": { "type": [{ "from": 0, "to": 0.5, "runs": 0, "agreed": 0 }, { "from": 0.85, "to": 0.95, "runs": 231, "agreed": 215 }, { "from": 0.95, "to": 1, "runs": 1201, "agreed": 1182 }] },
  "disagreements": [{ "run": "01K...", "at": "2026-10-23T08:40:00Z", "input": "#4821 VPN drops",
    "answers": [{ "question": "type", "said": "bug", "observed": "access", "agree": false, "probability": 0.91 }], "verification": "accepted" }],
  "sentBack": { "applied": 0, "agreed": 0 },
  "replay": { "matched": 212, "total": 212, "at": "2026-10-11T16:12:00Z" },
  "updatedAt": "2026-10-23T09:00:00Z"
}
```

- `totals` counts the version, and `days` holds the last 90 days in UTC.
  On a rehearsing routine `decided` is `acted` plus `handed`. `agreed` and
  `disagreed` count only the runs on which the routine was sure enough to
  act.
  `handed` counts every decision that did not apply, and `applied` and
  `failed` count the live runs. The card of a sign-off and the meta lines
  take their figures from `totals`, and the bars of the rehearsal from
  `days`.
- `questions` holds only the compared questions. Each is the array of its
  bands, cut at 0, 0.5, 0.7, 0.85, and 0.95, and at the `act` of the
  question where it differs. How sure it was shows each band at or above
  the mark that holds a run. It joins the bands under the mark in one row,
  handed to the agent.
- The page orders the questions of a routine: the choices and the scores
  by name, then the yes or no questions by name. The map of the JSON has
  no order. A question shows its first sentence, cut at a word past 80
  characters. A question mark beside it holds the whole question.
- A disagreement lists its answers. The page shows those with `agree`
  false. A run without a receipt has no `verification`.
- Without a replay, the evidence has no `replay`. A replay has no list of
  runs, so the line of Past tickets has no key to open them.
- `costUSD` of the summary is the average cost of one run by a routine and
  of one run by the agent. Per ticket shows them as they come. The page
  does not show `partial`.

The moves: proposed to rehearsing or retired, rehearsing to live,
paused, or retired, live to paused or retired, paused to rehearsing or
live, and retired to nothing. A move to the current standing changes
nothing. The keys of the page follow them: Rehearse and Retire on a
proposed routine, Sign off and Not yet on a ready one, and Pause, Resume,
and Retire in More. Not yet sends no request. The card of the sign-off
turns into the quiet line `Kept for later` for this visit of the routine,
and the row keeps needs you. The page keeps nothing of it.

A move names the version that the person read, so nobody signs off a
version that they did not read:

```json
{ "standing": "live", "note": "Rehearsal is clean.", "version": 3 }
```

A forbidden move answers:

```json
{ "type": "about:blank", "title": "Conflict", "status": 409,
  "detail": "a proposed routine cannot move to live. It can move to rehearsing or retired",
  "instance": "/v1/routines/triage/acknowledge/standing", "standing": "proposed", "allowed": ["rehearsing", "retired"] }
```

The summary:

```json
{ "agent": "triage", "days": 7, "zone": "UTC", "since": "2026-10-17T00:00:00Z", "runs": 1912, "byRoutine": 1358, "byAgent": 459,
  "withPerson": 95, "costUSD": { "routine": 0.001, "agent": 0.02 }, "sentBack": 7, "partial": false }
```

The page keys a routine by `agent` and `routine.name`, and gives it the
title of its name: `acknowledge-a-new-ticket` is `Acknowledge a new
ticket`. It calls a run of a routine a ticket, as the words of section 5
of `docs/ROUTINES.md` do. A field for a title can give a routine the words
that its name cannot hold. A field for the noun of the work of an agent
can give each agent its own word.

The stream sends `routine` events (section 10), coalesced within 2
seconds. While a pane of the place shows, an event reads that routine
again. It also reads the week of the agent that the details pane shows. A
`reset` reads the list again.
