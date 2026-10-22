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
within one minute, and it does not go after the person signs out in the
tab. In those two cases it shows a Sign in link and the token form.

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

**New.** `GET /v1/bossmode` answers the settings that the page reads:

```json
{
  "manager": { "agent": "manager", "member": "default/manager-0", "run": "run-01K..." },
  "placement": "queue",
  "maxMembers": 16
}
```

- `manager` is null when `workbench.bossmode.manager` is empty.
- `manager.member` is the fleet member that runs the manager Task, for
  `POST /v1/runs?member=`.
- `manager.run` is the newest manager run that the caller started, or `""`.
  The page opens that conversation. The front finds it in the fleet view by
  the agent and the principal.
- `placement` and `maxMembers` come from `workbench.bridges`.

A workbench without bossmode answers 404, and the page then shows no manager.

## 5. Bridges

### 5.1 The list and the record

`GET /v1/bridges` answers `{"bridges": [...]}`. Each item is the record of
section 6.1 of the plan without `members`, plus five fields:

| Field | Value |
|---|---|
| `lastSeq` | The seq of the newest entry of the channel |
| `read` | The seq that the caller read last (section 5.2) |
| `unread` | The entries after `read` that count for the caller: a message of a person or an agent, and a card that waits for a decision. A message of the caller and a plain system line do not count. |
| `memberCount` | The number of seats, fired seats included |
| `needsYou` | The number of members with the presence `needs-you` |

The workbench counts `unread` over at most the last 2000 entries of the
channel, so a larger count stops there. The page shows 99+ above 99.

`GET /v1/bridges/{id}` answers the same item with `members` and `usage`.
`usage` sums the usage of the runs of the bridge as the tool `batch` sums a
job: the fields of the usage of a run (`turns`, `toolCalls`, `costUSD`, and
the tokens), plus `reported`, `final`, `missing`, and `partial`, which is true
when a run reports no usage. Only this route carries `usage`. The page shows
no usage, as `/ui` shows none. Each member is the member of the plan plus two
fields:

```json
{
  "handle": "migrator-1", "agent": "migrator", "pool": "crew",
  "task": "Migrate the cron module to an Ansible role",
  "runs": ["run-..."], "fired": false, "muted": false,
  "presence": "working",
  "activity": { "turn": 7, "tool": "bash", "callId": "c4", "phrase": "Ran \"ansible-lint roles/cron\"", "since": "2026-10-21T20:04:00Z" }
}
```

`presence` is one word of the table of section 6.5 of the plan: `working`,
`needs-you`, `idle`, `asleep`, `error`, or `fired`. `activity` is the K4
activity of the newest run of the member, or null.

### 5.2 The read mark

**New.** `PUT /v1/bridges/{id}/read` with `{"seq": 42}` sets the read mark of
the caller for the bridge and answers 204. A smaller seq than the mark leaves
the mark. The page sends it a moment after the person reads the channel.

### 5.3 Open, change, and close

`POST /v1/bridges`:

```json
{
  "title": "Migrate logrotate",
  "goal": "Migrate the logrotate module and review it.",
  "placement": "queue",
  "members": [{ "handle": "migrator-3", "agent": "migrator", "task": "Migrate the logrotate module" }],
  "delegation": { "approve": false, "budget": false, "members": false, "report": true },
  "caps": { "maxMessages": 2000 }
}
```

`delegation` and `caps` are optional and partial: a missing key takes the
default. The answer is 201 with the record and its members. A handle is
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
| `PATCH /v1/bridges/{id}/members/{handle}` | `{"muted": true}` or `{"task": "..."}` or both | 200 with the member |

A fire of a fired member answers 200 with the member and changes nothing.

A seat whose newest run was canceled, failed, or stopped at a limit gets no
delivery from the channel. A `PATCH` with `task` seats it again: a new run
starts with the task. The page offers Seat again in the menu of such a
member, beside Change its task. Seat again opens the task of the member,
which the person can change, and sends it as `task`. The page needs the
workbench to seat the member again also when the text of the task is the
same. The page knows that a newest run stopped from the presence `error`, or
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
  }
}
```

- `from.kind` is `person`, `agent`, or `system`. A person has `name`, the
  subject, and `display`, a name to show, when the front knows one. An agent
  has `handle` and `run`.
- **New.** `event` names what a system line says, so the page picks its icon
  and follows the state of the bridge: `opened`, `closed`, `reopened`,
  `started`, `joined`, `needs-you`, `asked`, `decided`, `failed`, `asleep`,
  `fired`, `canceled`, `muted`, `task`, `changed`, and `cap`. The page sets
  the bridge closed on `closed` and open on `reopened`. In particular:
  - The finished answer of a member is a message of that agent with no
    `event`, and it mirrors the `fw.run.finished` of the run.
  - A member whose Task wakes again posts `event: started` with the text
    `<handle> woke up.`.
  - After a close, the link to the report of the manager comes with
    `event: changed`. The text can hold a Markdown link, such as
    `[bridges/<id>/report.md](bridges/<id>/report.md)`. The page shows every
    system line as one line of Markdown through the sanitizer, so the link
    opens the page of the wiki.
  - A delivery that fails for good posts `event: failed`.
- **New.** `cut` is true when the channel holds only the first 4 KB of the
  text.
- **New.** `decision` is set on the entry that mirrors an approval or a
  question of a member run, and null elsewhere. It holds the fields of
  `dashboard.Decision` (the label, the reason, the effect, the input, and the
  schema of a question), plus:

  | Field | Value |
  |---|---|
  | `run` | The run that waits |
  | `state` | `pending`, `allow`, or `deny` |
  | `decidedBy`, `decidedAt` | The subject and the time of the decision |
  | `note` | The note of the decision |
  | `answer` | The answer to a question, as words |
  | `always` | True when the card can offer Always allow. Without it, the page applies the rule of `/ui` to `reason`. |

  When a decision lands, from any surface, the front changes the same entry
  and sends it again on the stream with the same seq. The page replaces the
  card in place. The front also posts a system line with `event: decided`.

  A card whose run stops waiting without a decision, such as after a fire or
  a cancel, is changed to `state: deny` with no `decidedBy` and a `note` that
  says why. The page shows "No decision" and the note.
- `reactions` holds the subjects of the people per reaction.

### 6.3 A message of the caller

`POST /v1/bridges/{id}/messages` takes `{"text", "to", "replyTo"}`. `to` is
optional, and without it the message goes to every active member. The
answer is 201 with the entry. The page sends no `files` yet. A handle in
`to` that is not on the roster, or that is fired, answers 400. The handle
`operator` in `to` answers 400 too: an agent can address the operator, and a
person cannot. A closed bridge answers 409.

When the person replies to a message of an agent and names no handle, the
page sets `to` to that agent, as section 4.2 of the plan says.

### 6.4 Reactions

`POST /v1/bridges/{id}/messages/{seq}/reactions` takes
`{"reaction": "up" | "down" | "heart", "note": "..."}`, with the note
optional and at most 1 KB, and answers 200 with the changed entry. A second
reaction of the same kind from the same person changes nothing and answers
the entry. The page never removes a reaction.

On a card that waits, the thumbs do not call this route. A thumb up calls
`POST /v1/runs/{run}/approvals/{id}` with `{"decision": "allow"}`, and a
thumb down with `{"decision": "deny"}` (section 7.2).

## 7. Runs

### 7.1 The run, the result, the transcript, and the files

The page reads the existing routes `GET /v1/runs/{id}`,
`GET /v1/runs/{id}/result`, `GET /v1/runs/{id}/transcript`, and
`GET /v1/runs/{id}/files/{path}` with `Accept: application/json`, as `/ui`
reads them. The run object carries two fields of the kernel changes:
`activity` (K4) and `reactions`, the counts of K2.

### 7.2 Decisions

`POST /v1/runs/{id}/approvals/{approval}` takes
`{"decision": "allow" | "deny", "note": "...", "content": {...}}`, as `/ui`
sends it. `content` is the answer of a form or a choice. A free answer goes
in `note`. Always allow calls `POST /v1/runs/{id}/approvals/{approval}/rule`
with `{"note"}` and then allows, as `/ui` does.

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
`queued` or `suspended` and the first answer is missing, the page says
"Waking the manager".

The page follows the run on the stream (`run` events) and reads the new
transcript items with `from`.

## 8. Pages

| Route | Answer |
|---|---|
| `GET /v1/pages` | `{"pages": [<info>]}` |
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
  again at once with `Last-Event-ID`, and the light in the rail stays on
  Live. Only a stream that ends within 5 seconds, or a failed connection,
  makes the page wait and show that it connects again.
- **New.** When the front cannot resume from the id, it sends one event of
  the kind `reset` with `data: null`. The page then reads the bridges, the
  faces, the open channel, and its roster again.
- A comment line, such as `: keep-alive`, every 15 seconds keeps a proxy
  from closing the stream. `retry:` is optional.
- A 401 ends the stream, and the page goes to sign-in.

| Kind | Data |
|---|---|
| `bridge.message` | `{"bridge": "<id>", "message": <entry>}`. A new entry, or a changed one with the same seq. |
| `bridge.member` | `{"bridge": "<id>", "member": <member>}`. A new seat, or a change of a seat: its presence, its activity, its task, muted, or fired. |
| `run` | The run object, with `member`, `activity`, and `reactions`. One event per change of a run that the caller can see. |
| `page` | `{"path", "title", "hash", "by", "at", "size"}`, plus `"deleted": true` for a removed page |
| `face` | The entry of `GET /v1/faces` for that agent |
| `member` | `{"kind": "member", "member": "default/crew-2", "state": "live", "time"}`, or `"gone": true` in place of `state` for a member that left the view |
| `task` | `{"kind": "task", "member": "default/crew-2", "phase": "Running", "time"}`, or `"gone": true` |

The `activity` of a `run` event carries `phrase`. The page uses `member` and
`task` on the Fleet screen: a `member` event changes the state of a fleet
member, and a `task` event changes the phase of the Task of a pool whose
`atespace/name` is `member`. A Task that is gone leaves its pool on the
screen. The page reads `GET /v1/fleet` when the screen opens and after a
`reset`.

A `bridge.message` or `bridge.member` event for a bridge that the page does
not know makes the page read that bridge with `GET /v1/bridges/{id}`. A
bridge that the manager opens therefore shows in the rail.

## 11. What the page does not call yet

- `files` on a message of the channel.
- The budget of a run. The plan offers a button to raise the budget of a
  member that failed at a limit. The page shows the limit and has no button.
- `DELETE /v1/pages/{path}`.
- `usage` of a bridge (section 5.1).
