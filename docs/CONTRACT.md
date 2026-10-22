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

`GET /v1/bridges/{id}` answers the same item with `members`. Each member is
the member of the plan plus two fields:

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
  `started`, `joined`, `finished`, `needs-you`, `asked`, `decided`, `failed`,
  `asleep`, `fired`, `canceled`, `muted`, `task`, `changed`, and `cap`. The
  page sets the bridge closed on `closed` and open on `reopened`.
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
- `reactions` holds the subjects of the people per reaction.

### 6.3 A message of the caller

`POST /v1/bridges/{id}/messages` takes `{"text", "to", "replyTo"}`. `to` is
optional, and without it the message goes to every active member. The
answer is 201 with the entry. The page sends no `files` yet. A handle in
`to` that is not on the roster, or that is fired, answers 400. A closed
bridge answers 409.

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
`fw.run.finished` of the run, so a thumb on a result records a quality
receipt. **New:** the answer is 201 with
`{"run", "seq", "reaction", "receipt"}`, and the page says whether the thumb
counted as a receipt.

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
| `GET /v1/pages` | `{"pages": [{"path", "title", "hash", "by", "at", "size"}]}` |
| `GET /v1/pages/{path}` | `{"path", "title", "tags", "text", "hash", "by", "at", "summary", "version", "size"}`, with `ETag: "<hash>"` |
| `GET /v1/pages/{path}?version=3` | The same for version 3 |
| `PUT /v1/pages/{path}` | 200 with the page, or 201 for a new page |
| `GET /v1/pages/{path}/history` | `{"path", "versions": [{"version", "hash", "by", "at", "summary", "size"}]}`, newest first |
| `GET /v1/pages/search?q=` | `{"q", "results": [{"path", "title", "snippet"}], "cut": false}` |

- **New.** `PUT` takes `{"text": "...", "summary": "..."}` as JSON. The page
  sends `If-Match: "<hash>"` for an edit and `If-None-Match: *` for a new
  page. A 412 carries `hash`, the current hash, in the problem document. On
  a 412 the page reads the page again and asks the person: keep their own
  text and save over, or take the other version.
- `by` is a subject, `agent:<handle or profile>`, or `bossmode` for a page
  that the front writes, such as `agents/<agent>/learned.md`.
- The page encodes each part of a path on its own. A page named `search`,
  or a path that ends in `/history`, meets a route of its own. The backend
  team decides how to keep those apart, for example by refusing such paths.

## 9. Faces

| Route | Answer |
|---|---|
| **New.** `GET /v1/faces` | `{"faces": [{"agent", "displayName", "tagline", "hash", "custom"}]}` for every agent that the caller can see |
| `GET /v1/faces/{agent}` | `image/svg+xml` with `ETag: "<hash>"` |
| `PUT /v1/faces/{agent}` | The SVG as the body. 200 with the entry of `GET /v1/faces`. A face that fails the sanitizer answers 422 with the reason in `detail`. |
| `PATCH /v1/faces/{agent}` | `{"displayName", "tagline"}`, both optional. 200 with the entry. |
| `DELETE /v1/faces/{agent}` | 200 with the entry, back to the identicon |

`hash` changes when the picture, the name, or the tagline changes. The page
reads a face again when its hash changes. It reads the SVG with the bearer
token and shows it as a blob URL in an `img` element, never as markup.

## 10. The stream

`GET /v1/bossmode/stream` answers `text/event-stream`. The page reads it
with `fetch`, because EventSource cannot send the bearer token, so the
stream route takes the same `Authorization` header as every route.

- Each event has `id:`, `event:`, and one `data:` line of JSON.
- An id is a decimal counter of the front. On a reconnect the page sends
  `Last-Event-ID`, and the front sends every event after that id.
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

A `bridge.message` or `bridge.member` event for a bridge that the page does
not know makes the page read that bridge with `GET /v1/bridges/{id}`. A
bridge that the manager opens therefore shows in the rail.

## 11. What the page does not call yet

- `files` on a message of the channel.
- The budget of a run. The plan offers a button to raise the budget of a
  member that failed at a limit. The page shows the limit and has no button.
- `DELETE /v1/pages/{path}`.
