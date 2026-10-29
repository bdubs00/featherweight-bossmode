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

**New.** The build writes the element
`<meta name="bossmode-build" content="<build>">` into the head of
`index.html`. The build is a hash of the rest of `index.html`, which names
each file of the build by its hash, so each new build has a new one. The
page in development has no build. Section 10 says how the page uses it.

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

**New.** `gone` is true when no worker of the fleet holds the newest run of
the seat, as the channel said with the line lost. A read of that run
answers 404, so the page does not ask for it, and the tabs Run and Files
say that the run is gone. A front before this key leaves it out.

`presence` is one word of the table of section 6.5 of the plan: `working`,
`needs-you`, `waiting`, `not-started`, `idle`, `asleep`, `limit`, `error`,
or `fired`. **New.** `limit` is a seat whose newest run stopped at a limit
of its budget, `budget exceeded` in the error of the run: no fault, and
Continue goes on with the run (section 5.4). The page derives it from a
run in the state `failed` with that error.
A seat with no run is `waiting` while its job waits on the queue of its agent
or the manager of its spawn bridge still runs, and `not-started` when that
manager stopped before it seated the member. On a closed bridge, a seat
with no run is `not-started`, and a seat whose newest run the front no
longer holds is `idle`. A message to a `not-started`
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
raises the cap, and the channel says `The channel reached its cap of <n>
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
- **New.** `files` names the files of a message of a person:
  `[{"name": "team.csv", "size": 25, "mediaType": "text/plain"}]`, or
  absent. The front sniffs the media type from the bytes. The channel holds
  no bytes, and no route of the page reads them: the workspace of each run
  that got the message holds them under `attachments/`. The page shows each
  file by its name and its size under the text, and an entry with files and
  no text names its files for a screen reader.
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
    <id>: the fleet no longer holds it`.
  - A later front writes each line as one fact with no advice and no end
    mark, such as `<handle> went to sleep`. The page reads both forms.
  - A front of the chat-first page says channel and agent in its lines,
    such as `<name> opened the channel with <n> members`, `<name> closed the
    channel`, `<name> reopened the channel`, `<name> took <handle> off the
    channel`, `<name> started <handle> again on its task: <task>`, `The
    server failed to start <handle>: <error>`, and `The channel reached its
    cap of <n> messages`, where an older front said bridge, fired, and
    seated. The page reads both words (`src/lib/lines.ts`).
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
"skill", "files"}`. `to`, `replyTo`, `pinned`, `skill`, and `files` are
optional, and without `to` the message goes to every active member. `skill`
is a slash command, `{"name", "args"}`, and with it `text` is optional: it
is the text of the person that follows the skill. A one-on-one conversation
with a seat sends its slash commands this way, to that seat alone. The
answer is 201 with the entry. An unknown skill answers 404, a skill that is
not for people 400, and a message over 64 KB 413. A handle in `to` that is
not on the roster, or that is fired, answers 400. The handle `operator` in
`to` answers 400 too: an agent can address the operator, and a person
cannot. A closed bridge answers 409.

**New.** `files` attaches files to the message, in the shape of `POST
/v1/runs` of the kernel: `[{"name": "team.csv", "data": "bmFtZSxyb2xl"}]`,
where `data` is base64 without the prefix of a data URL. With files, `text`
is optional. The front takes at most 20 files, each with bytes, at most 32
MiB of bytes together, and names of at most 255 bytes without a slash, a
backslash, or a control character. More files, an empty file, and a bad
name answer 400, more bytes 413, and a body over 32 MiB in base64 and 1 MB
more 413. A pinned message and a slash command take no files and answer
400. Each delivery gives the files to the run of the member, whose kernel
keeps them under `attachments/` and applies the rules of its workspace,
such as 8 MiB per file by default. A file that the workspace refuses
reaches no member, and the channel says so with a line `failed`.

The channel keeps no bytes for a later run, so a message with files goes
out only when each member that it reaches has a run that takes it now.
When a member has no run yet, its run failed, or a cap of the bridge holds
the message back, the post answers 409 and changes nothing: no entry, no
cap, no delivery. The detail says what to do, such as `files go only to a
member with a run, and reviewer has none yet: send them once it works, or
address another member`. The front also answers 409 while it still sends
the files of earlier messages, 64 MiB on one replica. The page keeps the
text and the files of a refused post, shows the sentence of the detail,
and words a 413 itself, because a proxy that refuses a large body sends no
sentence: `The files are too large to send. Remove some, and send again.`
A 413 of the front that names a file keeps its sentence, such as a file
over `tools.files.maxFileBytes` of the workers of a member.

Every composer that sends to an agent takes files from the key Attach
files, a drop, and a paste, and checks the count and the size before it
takes them: the composer of a bridge, of the manager, of the quick chat,
of an agent in Fleet, and of a member. The quick chat and an agent in
Fleet send the files in `files` of `POST /v1/runs` for the first message
and of `POST /v1/runs/{id}/messages` for a follow-up (section 7.1). A
member sends them through its bridge, to that member alone. A slash
command takes no files, and the page says so:
`A command takes no files. Send the files in a message of their own.` The files of a draft stay in the memory of the tab, so a move
to another screen keeps them and a reload drops them.

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
conversation, and the next message starts a new run. **New.** A message
with files carries `files` in either body, in the shape of section 6.3, and
`input` or `content` can then be empty. The front passes the files on as the
person sent them, and the kernel of the manager run keeps them under
`attachments/`, with the limits of section 6.3 and of its workspace. The
kernel answers a file that it refuses with 400 at once. The transcript
names the files of a user item in `files`, `[{"path", "name", "mediaType",
"size", "sha256"}]`, and the page shows their names and sizes. A slash
command takes no files, so the page sends none with it and says so. While the run is
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
- **New.** The answer of the stream carries the header `Fw-Page-Build`,
  the build of the page that the front serves, from the element of section
  3. The page compares it with the element of its own `index.html` at each
  start of the stream: at boot, after each end of a stream, and after a
  replica stops in a deploy. When they differ, a deploy put out a new page,
  and the page shows one line in the place of the notice,
  `A new version of bossmode is out.`, with Reload and Dismiss. A notice of
  a failed action takes the place first. The page never reloads on its own,
  so no draft goes. A front without the header, or a page without the
  element, gives no line.

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
| `knowhow` | `{"kind": "knowhow", "agent": "triage"}`, on each change of a note, the journal, the switch, or what waits, at most one per agent in 2 seconds. Section 19. |

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
| `GET /v1/fleet/orphans` | `{"orphans": [...], "removeAfter": n}`, for an admin: the child Tasks whose parent Task is gone, each with `member`, `parent`, `phase`, `pool`, `createdAt`, and `open`, the runs that have not ended. `removeAfter` is the seconds that an orphan sleeps before the front removes it, `0` when the front does not. Another caller gets 403, and the Fleet list then shows no note. |
| `DELETE /v1/fleet/orphans` | Removes the orphans at once, for an admin, after Confirm: `{"removed": [...], "failed": [{"member", "error"}]}`. |
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
| `GET /v1/routines` | `{"routines": [<record>]}`, newest change first, without `evidence`. The list pane calls it without `agent`, and the workbench answers the routines of every agent that the person can view. `?agent=<name>` narrows it to one agent. A 404 means that the front keeps no routines: `workbench.routines.enabled` is false, or the bus keeps no store. The place then says `Routines are off.` |
| `GET /v1/routines/{agent}/{name}` | The record with `evidence`, always present and empty for a new version. The list leaves out evidence, and a row needs it for its meta line, so the page reads each routine that is not retired. A 404 says in place that the routine is gone. |
| `POST /v1/routines/{agent}/{name}/standing` | `{"standing", "note", "version"}`. `version` is `routine.version` of the record that the person read, on every move. The page leaves out an empty note. The answer is the record, and the page reads the record again with its evidence. A 409 means that the routine changed: a newer version, or another standing. The page then reads the record again and shows it under the quiet line `This routine changed. Read it again.`, with no notice. A sign-off by the static token answers 403, and the notice shows its sentence. |
| `GET /v1/routines/summary?agent=<name>&days=7` | The week of the agent in the details pane. A 404 leaves the week out. |
| `GET /v1/pages/agents/{agent}/routines/{name}.md` | The tab Runbook of a routine with `signedOff`. The front writes the page on a sign-off. A 404 shows the runbook that the page renders. |

Reading needs the right to view the agent, else 404. A move needs the
right to edit it, else 403. The page offers the moves where `roles` of
`GET /v1/whoami` names the person `owner` of the agent. A run of a
disagreement links to its chat on this page, `#chat/<id>`, as a card of
Work opens a run.

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
  act. The card of a sign-off shows `agreed / acted` with `acted`, such as
  `97.6% of 1,432`.
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
ticket`. It calls a run of a routine a run, because a routine belongs to
a duty of any kind of work, and the word of one kind, such as ticket, is
wrong for the others. A field for a title can give a routine the words
that its name cannot hold. A field for the noun of the work of an agent
can give each agent its own word.

The stream sends `routine` events (section 10), coalesced within 2
seconds. While a pane of the place shows, an event reads that routine
again. It also reads the week of the agent that the details pane shows. A
`reset` reads the list again.

## 16. Duties

A duty is what an agent does on its own: who, when, what, and its limits.
The Duties place reads the routes of the duties of the workbench, after the
contract of the build, `reports/Duties contract 2026-10-23.md`. Section 2 of
that file names the routes, section 1 names the record, and section 10
holds the additions of the second wave, which win over the rest. Section
11 holds the channels of notification, which replace its section 5.
`src/api/routes.ts` holds the calls, and `src/api/types.ts` holds the
shapes. `fake/routes-e.mjs` serves the same shapes, with the places of
each person, the playbooks, and the inbox.

Each call of a route under `/v1/duties` sends the header `X-Time-Zone`,
with the IANA time zone of the browser, such as `America/New_York`. The
front reads the words of a person in that zone. A schedule without
`timeZone` also takes that zone.

| Route | What the page does with it |
|---|---|
| `GET /v1/duties` | `{"duties": [<duty>], "paused": false}`. The list pane and the profile of an agent call it. With `paused` true, the list says `Every duty is paused.` A 404 means that the front keeps no duties. The place then says `This workbench keeps no duties.` |
| `GET /v1/duties/{name}` | The duty with `history`, the last 50 runs, newest first. The page of a duty and the editor call it. A 404 says in place that the duty is gone. |
| `PUT /v1/duties/{name}?dryRun=true` | The editor sends the whole form. It calls the route after each change of When, for the words of a person, and on Save duty. The page shows `readback`, the first five times of `next`, and `problems`. |
| `PUT /v1/duties/{name}?dryRun=true&test=true` | The key Try the check. The page shows the count of `check`, whether the items wake the agent, and each item of `found`. |
| `GET /v1/duties/options` | `{"secrets": [{"name", "hosts"}], "events": [...], "actions": [...], "looks": [...]}`. The editor reads it once per load and offers no other choice. `events` are kinds such as `bridge.closed`, `run.failed`, `question.waiting`, `page.changed`, `routine.ready`, and `cap.reached`. `actions` are among `ask`, `post`, `open`, and `manager`. `looks` are among `http` and `tool`. A duty keeps a choice that it holds, so an edit never drops it. For a 404, or any failure, the page offers what the first wave offered: the action `ask`, both looks, no event, and no secret. |
| `PUT /v1/duties/{name}` | Save duty, in the dialog that shows the readback and the next five times. The answer is 201 for a new duty and 200 for a change. The page then opens the duty. |
| `PATCH /v1/duties/{name}` | `{"paused": true}` or `{"paused": false}`, from the keys Pause and Resume. |
| `DELETE /v1/duties/{name}` | Delete, in the menu More, after a dialog that asks first. The page then opens the list. |
| `POST /v1/duties/{name}/run` | Run now, with the body `{}`. For 202 `{"run": "<id>"}`, the page says `A run started.` and links the run. A duty that posts in a bridge or opens one starts no run of an agent: for 202 `{"run": ""}`, the page says `Started. See the history for what it did.` with no link. For 200 `{"skipped": "<reason>"}`, the page shows the reason. |
| `POST /v1/duties/{name}/write-check` | `{"words": "...", "agent": "..."}`, from the key Write the check for me. `agent` is the agent of the editor, which a duty that is not saved yet needs. For a saved duty, the front uses the agent of the duty. The key stays off until the editor has an agent. The call takes up to two minutes: the page says so, counts the seconds, and offers Cancel, which aborts the request. The answer `{"checkFirst", "readback", "check"}` fills the fields of the check. A 422 is a problem document whose `error` holds the reason, the same text as `detail`: the page shows it whole under the words. When the 422 carries `checkFirst` and `readback`, the record that the agent wrote and that did not work, the page shows them under `What <agent> tried`, as words, and does not take them into the form. A 400 carries `problems`, such as `words: ...` or `agent: ...`: a problem of the words shows under the words, and one of the agent under the agent picker of Who. A 504 says that the agent did not answer within two minutes. For a 404 or a 501, the key goes, and the fields by hand show. |
| `PATCH /v1/duties` | `{"paused": true, "reason": "..."}` or `{"paused": false}`. This is the switch that pauses every duty. If `whoami` says `admin`, the page shows it. Before a pause, a dialog asks first. |
| `GET /v1/notifications` | The settings of the person who is signed in, as section 11.1 of the contract of the build shows them: `{"channels": [<place>], "quietHours": {"from", "to", "timeZone"}, "offered": [{"kind", "label"}], "shared": [{"name", "kind", "label"}], "off": "...", "serverDefault": "..."}`. The dialog Where to reach me of the account menu reads it when it opens. `offered` names the kinds of Add a place: the page offers no other kind, and no kind that it does not know. `shared` fills the choice of a shared channel, and Tell me about of a duty. `off`, the reason in words that no place reaches the person, shows above a list that holds a place. An empty list says `Nothing goes out until you add a place. Activity always shows what needs you.` instead. `serverDefault` is the ntfy server of the front, the placeholder of an empty server. A 404 or a 501 says `This workbench sends no notifications.` |
| `PUT /v1/notifications` | `{"channels", "quietHours"}`, without `offered`, `shared`, `off`, and `serverDefault`. Save sends the switches and the quiet hours. Add place, Save in a place, and Remove send the whole list at once, as it stands. A place holds only the fields of its kind. A new place goes without `id`, and the answer gives it one. `url`, `secret`, and `ntfy.token` go as `"set"` to keep the stored value, `""` to clear it (the key Remove of the field), or the new value. Quiet hours that are off go as `"from": ""` and `"to": ""`. An answer without `channels` makes the page read the settings again, so each place has its id. A 400 `{"problems": [...]}` names a field as `channels[<i>].<path>`, such as `channels[1].url: ...`: the text shows under the row of that place, and beside its field in Edit. A problem of `quietHours` shows beside the quiet hours, and a problem with no path, or with another path, shows at the top. In the dialog of a place, a problem of another place shows at the top, after the name of that place. |
| `POST /v1/notifications/test` | `{"channel": "<id>"}`, from Send a test of one place, after a save of a change. The answer `{"results": [{"channel", "sent", "error"}]}` shows under the row of the place: `Sent to <name>. Look for it there.`, or `Not sent to <name>.` and the error. A 400, such as for an unknown place, says `The test failed.` and the error. The page never sends the empty body, which tests every place. |
| `GET /v1/playbooks` | `{"playbooks": [{"name", "goal", "placement", "seats", "revision", "owner", "updatedAt"}]}`, newest change first. New bridge, the action open of a duty, and Save as playbook read it. A 404 means that the front keeps no playbooks: New bridge offers none, and the action open says `This workbench keeps no playbooks.` |
| `GET /v1/playbooks/{name}` | The playbook with `caps` and `delegation`. New bridge reads it to fill its form. |
| `PUT /v1/playbooks/{name}` | `{"goal", "placement", "seats", "caps", "delegation"}`: the form of New bridge without the title, with its seats as `seats`, each `{"handle", "agent", "task"}`, and `revision` when the name holds a playbook already. The front refuses an unknown field, such as `members`, with 400. Save as playbook in the menu More of a bridge sends it, and a save says `Saved the playbook <name>.` in the notice of the page. A 409 says `This playbook changed since you opened it. Try again.` A 400 `{"problems"}` shows under the name. |
| `DELETE /v1/playbooks/{name}` | 204. Delete, in the list See the playbooks of the action open, after a dialog that asks first. |
| `GET /v1/inbox` | `{"items": [{"kind", "run", "approval", "duty", "agent", "bridge", "text", "since"}]}`, `kind` `approval`, `question`, `failure`, or `paused`. `approval` is the id of the approval that the run waits for, or `""` for a question of a seat in a bridge and for a failure or a paused duty. `run` is `""` for a failure of a start that the queue never took, and its row then links no run. The count on the app bar counts its items, so the page reads it when it starts, each minute on every place, when Activity opens, and after a reset of the stream. See the rules of Activity below. |

A duty, as a read answers it. The page writes the same record without
`owner`, `source`, `readback`, `next`, `state`, and `history`:

```json
{
  "name": "daily-report", "agent": "scribe", "owner": "alice@example.com",
  "when": { "schedule": { "repeat": "weekdays", "times": ["09:00"], "timeZone": "America/New_York" } },
  "checkFirst": { "look": { "http": { "url": "https://example.com/api/queue" } }, "items": "result.records", "key": "number", "wake": { "when": "new" } },
  "do": { "ask": { "message": "Write the report of {date}. The last report is {last.title}." } },
  "limits": { "budget": { "maxCostUSD": 0.5, "maxTurns": 40 }, "perDayUSD": 2, "overlap": "skip", "catchUp": "1h" },
  "whileAway": { "decider": "manager", "timeout": "2h", "then": "deny" },
  "notify": { "failure": ["owner"], "needsYou": ["owner"] },
  "runAs": "duty", "paused": false, "source": "store", "revision": 7,
  "readback": "Every weekday at 9:00 AM, New York time.",
  "next": ["2026-10-26T13:00:00Z"],
  "state": { "lastRun": { "at": "2026-10-23T13:00:00Z", "run": "01K...", "state": "completed", "costUSD": 0.12 }, "todayUSD": 0.12, "failuresInRow": 0, "pausedReason": "" }
}
```

An entry of `history` has the shape of `lastRun`: `at`, `slot`, `run`,
`state`, `costUSD`, `found`, `woke`, `reason`, `start`, `attempt`, and
`title`. **New:** it also has `decided`, the questions of the run that
somebody decided while the person was away:

```json
{ "decided": [{ "at": "2026-10-23T13:05:00Z", "by": "manager", "verdict": "allow", "tool": "shell.exec", "reason": "It only reads the disk." }] }
```

`by` is `manager`, `timeout`, or the subject of a person. `verdict` is
`allow`, `deny`, or `cancel`.

The rules of the page:

- A person never sees cron or the syntax of a template. When is a sentence
  with choices, five presets, and a box for words. Each schedule shows as
  the readback of the front and the next five times, in the zone of the
  browser.
- The page sends the words of a person as `{"when": {"say": "..."}}` with
  the rest of the form. The schedule of the answer, `duty.when.schedule`,
  fills the sentence. If the answer has a readback but no schedule, the
  page keeps the words and saves them as `say`.
- **New:** the budget follows the action. A new duty that asks the agent
  or the manager sends no budget of its own. Before any call, Save duty
  refuses such a form without the most that a run can cost. A post spends
  nothing of its own: the page sends no `limits.budget` and no
  `limits.perDayUSD`, and asks for neither. An open sends only
  `limits.budget.maxTurns`, the most turns of the whole bridge, and no
  `limits.perDayUSD`. Before any call, Save duty refuses an open without
  it, with the words of the front: `A duty that opens a bridge needs the
  most turns of the whole bridge, such as 40.` Overlap, catch up, and
  `retries` stay for every action. The front never fills a budget for the
  page.
- **New:** a change sends the `revision` of the duty that the person read.
  For a 409, the page says `This duty changed since you opened it. Open it
  again, then make your change.`
- The page never sends `owner`. It keeps each field that the form does not
  show. These fields are `pool` and a start by a call of another app.
  They are also `maxTokens` and `maxToolCalls` of a duty that asks,
  `retries`, `runAs`, `paused`, and other people in `notify`.
- **New:** When is a schedule or, where `options.events` lists one, an
  event: `{"event": {"kind", "agent", "after", "path"}}` with only the
  fields of its kind. `bridge.closed`, `run.failed`, and `routine.ready`
  take an agent. `question.waiting` takes `after`, a span, and an agent.
  `page.changed` takes `path`. Each kind shows in words, such as `When a
  bridge closes`. A schedule takes `start` and `end`, two dates, behind the
  switch `Only between two dates`.
- **New:** What is one of the actions of `options.actions`: `ask`,
  `{"post": {"bridge", "to", "message"}}` with an open bridge and the
  handles of its members (none is everyone), `{"open": {"playbook",
  "goal"}}` with an optional goal, and `{"manager": {"message"}}`.
- **New:** Check first calls a tool of the agent where `options.looks`
  holds `tool`. The tool is a choice among the tools of the profile of the
  agent, `GET /v1/agents/{name}`, each with its phrase. A server that the
  profile names whole, such as `servicenow.*`, gives each tool of the
  catalog of `GET /v1/tools` under it. The input is a list of names and
  values. A secret of an address is a choice among the secrets of
  `options.secrets` with a pattern in `hosts` that matches the host of the
  address. A pattern follows `path.Match` of Go, as the front does, against
  the host name in lower case, without the port: `*` matches any run of
  characters, dots too, so `*.example.com` matches `a.b.example.com` and
  not `example.com`. `?` matches one character, and `[...]` one character
  of a class, with `^` first for a class that negates. A pattern that Go
  calls bad matches nothing. `src/lib/glob.ts` follows the code of Go step
  by step. Nobody types a secret. The filters of
  `where` are rows of a field, a test, and a value, which the person adds,
  changes, and removes.
- **New:** `new` is the draft of a duty without a name. Until the message
  or the field Name gives a valid name, a dry run of a new duty goes to
  `PUT /v1/duties/new?dryRun=true`, with `&test=true` for Try the check,
  and the front skips the problem of the name there. Write the check for
  me of a duty that is not saved yet posts to
  `/v1/duties/new/write-check`, with the agent of the editor, whatever name
  the person typed. A dry run saves nothing. The front refuses to save a
  duty named `new` or `options`, so the field Name says, as the person
  types and before any save, `The names new and options are kept for the
  page. Pick another name.`
- **New:** a problem of a dry run, and of a 400 of a save, is a string. A
  problem that concerns a field starts with its dotted path and a colon,
  such as `when.schedule: ...` or `do.post.bridge: ...`. The page shows the
  text after the colon beside the field: `agent` under Who, `when` in the
  readback of When, `checkFirst` in Check first, which opens, `do.*.message`,
  `do.post.bridge`, `do.post.to`, `do.open.playbook`, and `do.open.goal`
  beside their fields, `limits.budget` beside the cost, `limits.budget.maxTurns`
  beside the turns, `limits.perDayUSD` beside the most per day, `whileAway`
  and `notify` in their sections, and `name` beside the name. For an open,
  each problem of `limits.budget` shows beside the turns of the bridge. A
  problem with no path, or with a path that the form does not show, shows
  at the top of the form. A post shows no budget and an open no most per
  day, so their problems show at the top.
- **New:** Make this a duty, in the menu More of a quick chat, of the
  manager, of a conversation with an agent, and of a bridge, opens
  `#duties/new?agent=<agent>&do=<action>&message=<text>`, or with
  `bridge=<id>` or `playbook=<name>`. A reload keeps it. The message is the
  first message of the person in the conversation, cut at 2000
  characters. The manager gives the action `manager`, and a bridge that is
  open gives `post` in that bridge. A closed bridge first saves a playbook
  under a name that the person types, then gives `open` from it. The agent
  is the agent of the conversation, or of the first seat of the bridge. The
  budget stays empty. An action that the front does not serve becomes `ask`
  with the same message.
- **New:** Activity. A run whose metadata holds `workbench.duty` shows the
  name of its duty as a chip that opens `#duties/<name>`. The items of
  `GET /v1/inbox` of kind `failure` and `paused` show as rows, each with
  the agent, the light `failed` or `paused`, the text, and the chip. An item
  of kind `approval` or `question` of a bridge has its row in the bridge
  already, so the page leaves it out. One of a run on no bridge shows a
  card with Allow and Deny at once, from its `approval` and its text, with
  no read of the run. A question takes its text as the question and a free
  answer. Once the page holds the run, the run gives the whole card, with
  the call and its rule. Only an item whose `approval` is `""` makes the
  page read the run, and it shows a line that waits until then. After a
  decision on such a card, the page reads the inbox again. A failure of a run that a row of a seat shows
  gives that row its chip, and no second row.
- **New:** the history of a duty shows `decided` under each run, in words:
  `The manager allowed shell.exec: <reason>`, `Nobody answered in time, so
  git.push was denied.`, or `You stopped the run at bash: <reason>`.
- **New:** the server imports each entry of `workbench.sources` once, as
  an ordinary duty (the contract Sources into duties of 2026-10-26). Such
  a duty has `origin` `{"kind": "config", "name"}`, and its page says
  `First set up in the configuration of the server.` It opens in the
  editor as any duty does.
- A duty whose message comes from the setup of the server has `template`
  true, or it asks its agent with no message. No route shows that
  message. The editor starts with an empty field. A save with an empty
  field sends `ask` with no `message`, and the server keeps its message.
  A message of the person replaces it. In place of the message,
  the page shows `The message comes from the setup of the server. Write a
  message to replace it.`
- A duty with `locked` true takes no change, no pause, and no delete: the
  server answers 409 with `This duty is locked by the setup of this
  server. The person who runs the server can change it.` The page shows
  that sentence, Run now, and no key that changes the duty. An older
  server marks such an entry with `source` `file`, and the page shows it
  locked too.
- The readback of the front says when a duty starts and, for a duty with a
  check, what the check looks for. The page says each fact once: with a
  readback, the page of a duty shows no section Check first, and the
  dialog of a save shows no words of the check. Without a readback, the
  page says the check in its own words.
- Catch up a missed time concerns a schedule only. The editor shows it
  only for a start on a schedule, and the limits of a duty say nothing of
  a missed time for an event or another app. If the last run still works
  stays for every start.
- The name that the editor makes from the message takes its first six
  words, at most 40 characters, and cuts between words. It never ends on a
  small joining word, such as in, of, or the.
- A start whose `run` is `""` has no run: the queue never took it, such as
  a start that failed before any run existed. Its line in the history and
  its row in Activity link no run, and the page reads none.
- The page offers Pause, Edit, and Delete to an admin, to an owner of the
  agent, and to the owner of the duty. The front decides with 403.
- A run links to the page at `/ui`, as `/ui#run/<id>`, as a heart does.
- The stream carries no event of a duty. When the place opens, the page
  reads the list. It reads the list again after each action and after a
  reset of the stream. If a run of its history changes its state in the
  store, the page of a duty reads the duty again.

The placeholders of a message show as words in brackets. A chip inserts
the words, and the page stores the placeholder. Nobody types a brace.

| Words on the page | Placeholder |
|---|---|
| `[Today's date]` | `{date}` |
| `[The time]` | `{time}` |
| `[What the check found]` | `{found}`, offered once the duty has a check |
| `[The last run's title]` | `{last.title}` |
| `[The last run]` | `{last.run}` |
| `[How the last run ended]` | `{last.state}` |
| `[This duty's name]` | `{duty}` |
| `[What happened]` | `{event}`, offered once an event starts the duty |

The light of a run of a duty:

| `state` of the run | Word | Light |
|---|---|---|
| `completed` | finished | grey |
| `completed` with `woke` false | slept | grey |
| `running`, `suspended` | working | green |
| `queued` | waiting for a worker | grey |
| `input-required` | needs you | amber |
| `failed` | failed | red |
| `retrying` | retrying, with the reason under the run in the history, such as `The run failed: <reason>. It goes again.` | amber that holds still, because it waits for nothing from the person |
| `skipped` | skipped | grey |
| `canceled` | stopped | grey |

A duty with `paused` true, or every duty under the switch, shows `paused`.
The list puts the duties in this order: a duty that needs you, a failed
duty, a duty that works or retries, and then the rest by their next time.
A paused duty comes last.

A place, as a read answers it. Each kind holds only its own fields:

```json
{ "id": "ha", "kind": "webhook", "label": "Home Assistant",
  "send": { "questions": true, "failures": true, "digest": false },
  "url": "set", "secret": "set" }
```

| `kind` | The form of the place | Checks of the page before a save |
|---|---|---|
| `ntfy` | `Server` (`ntfy.server`, with `serverDefault` as its placeholder), `Topic`, and `Token` (`ntfy.token`) | A topic, with no space and no slash. A server is an address. With `serverDefault` `""`, the front has no server, so the place needs one. |
| `slack` | `Address` (`url`) | The address starts with `https://hooks.slack.com/`. |
| `discord` | `Address` (`url`) | The address starts with `https://discord.com/api/webhooks/` or `https://discordapp.com/api/webhooks/`. |
| `teams` | `Address` (`url`) | The address starts with `https://`, or with `http://` on a host that the operator lists. The front decides the second case. |
| `webhook` | `Address` (`url`) and `Secret` (`secret`), with the header of the signature | The address starts with `https://`, or with `http://` on a host that the operator lists. The front decides the second case. |
| `email` | `Email address` (`email.to`) | An email address. |
| `agent` | `Agent` (`agent.agent`), `How should it reach you?` (`agent.how`), and `The most a message can cost` (`agent.budget.maxCostUSD`) | An agent that the person can run: an owner or an operator of it, or a role that the page cannot tell. The words. A budget above 0, which the person writes. The page fills no amount, and keeps the other limits of `agent.budget`. |
| `shared` | `Channel` (`shared`), a choice of `shared` by label | A pick. The label of the channel fills an empty name. |

The rules of the places:

- Every place needs a name, its `label`.
- A new place sends questions and failures, and no digest, until the
  person changes the switches of the dialog.
- A write-only field never shows its value. With a stored value it shows
  `Saved` and the key Replace, which opens an empty field. The token of
  ntfy and the secret of a webhook also have the key Remove, which clears
  the value on save, and `Keep it` brings it back. The address of a place
  has no Remove, because the place needs one: Remove of the place stops
  it.
- A place of a kind that the page does not know shows its name, its
  switches, Send a test, and Remove, without Edit, and the page sends it
  back as it came.
- A person keeps at most 10 places. Add a place then says `You keep 10
  places, the most there is. Remove one to add another.`
- The keys that open a dialog, Add a place, Edit, and Remove, stay enabled
  while a save runs, so the focus goes back to them when the dialog closes.
  They wait for the save.
- **New:** Tell me about of a duty reads `shared` once per load and offers
  each shared channel by its label, such as `The Ops room channel`, with
  Failures and Questions. A check stores `channel:<name>` in `failure` or
  `needsYou` of `notify`. A shared channel that the duty names and the
  settings no longer list shows with its name, so an edit keeps it. The
  page of a duty says which channel hears of what, such as `The Ops room
  channel hears of failures.`, and reads the settings only for a duty that
  names a shared channel.

**Open:** the shape of the notifications names no way to turn quiet hours
off. The page sends two empty times.

**Open:** section 11.1 of the contract of the build leaves out
`serverDefault`, which the front of the second wave answers. The page
still reads it for the placeholder of the server. Without it, the page
cannot tell whether the front has a server, so it leaves that check to the
front.

## 17. Packages

The Packages plan of 2026-10-25 (section 6.5) names these routes. The
section Packages of the profile of an agent calls them.
`src/ui/Packages.tsx` holds the section, and `src/lib/packages.ts` holds
its rules.

| Route | Answer |
|---|---|
| `GET /v1/bossmode` | **New:** `packages`. With a package mirror in the deployment, it is true. False or missing hides the section on every profile. |
| `GET /v1/pools/{name}/packages` | `{"pool", "available", "on", "ask", "python", "tools", "applying", "workers"}`. Each item of `python` and `tools` is `{"name", "by", "at"}`, and an approval adds `agent` and `run`. Each worker is `{"task", "state", "at", "digest", "installed", "failure"}`, with the state `pending`, `materializing`, `ready`, `failed`, or `unknown`. A 404 or a 403 hides the section. |
| `PUT /v1/pools/{name}/packages` | Takes `{"on", "ask", "python", "tools"}` and answers as GET. **Page choice:** both lists name the packages as strings, as the configuration of a pool writes them, such as `["ansible-lint", "pyyaml>=6"]`. The front keeps `by` and `at` of a package that stays. With `?dryRun=true`, the front checks the body and changes nothing. The roles of `PATCH /v1/pools/{name}` apply, so only an owner sees the controls. |

The page finds the pool of an agent in this order. First it reads the
field `pool` of `GET /v1/agents`. Next it reads `pool` of
`GET /v1/agents/{name}`. Last it takes the pool of the fleet view that runs
the agent. A profile with `front` true has no section. An agent that no
pool runs has no section either.

Turn on packages sends `ask: true`. Each package shows the version that
the first ready worker names in `installed`. The state line counts each
worker that is `pending` or `materializing`, as `Updating on <n> of <m>
workers`. A running worker takes a change in place (section 11 of the
plan), so no line waits for an idle worker. The index of the mirror can
lack a new Python package. The front then answers 400 with the detail
`There is no Python package named X`, and the section shows that
sentence.

When the section opens, it reads the route once. While `applying` is true,
or while packages are on and a worker is not `ready`, it reads the route
again every 5 seconds. The page accepts an answer with missing fields: a
missing list is empty, and a missing `on`, `ask`, or `applying` is false.
An item that is a plain string stands for an item of that name.

The input of a call of the tool `env` is `{"command", "manager",
"package"}`. Its card says the package in plain words and offers Deny and
Allow. It never offers Always allow, because a person approves each
package.

**Open:** section 6.3 of the plan names `GET /v1/bossmode/config`. The page
reads `GET /v1/bossmode`, so the front must add `packages` to that answer.

## 18. Runs of the archive

Section 11.3 of the Packages plan of 2026-10-25 names the archive of the
runs. When no worker holds a run, `GET /v1/fleet/runs` and
`GET /v1/runs/{id}` answer it from the archive with `"archived": true`. A
message to such a run answers 409 with `The worker of this conversation
was replaced, so the conversation is read-only. Start a new one.`

The page treats an archived run as a run that ended:

- The Manager list, Past conversations, and the history of the Chat place
  list it. A run of the archive that had not finished shows `ended`.
- The Manager place, the conversation with an agent, and the quick chat
  show it with the line `This conversation is from a worker that was
  replaced. You can read it, and your next message starts a new
  conversation.` The next message starts a new run.
- If a message answers 409, the page reads the run again. When the run is
  archived, failed, or canceled, the message starts a new run.
- An archived run keeps no worker busy, takes no decision, and the page
  reads it once, with no poll and no live answer.


## 19. Work: the board and the door

A front that serves the routes of this section and of section 20 sends
`work: true` in `GET /v1/bossmode`. The page then shows the places Work and
Results. It opens on Work, the home, for a person who can start work: an
admin, a person who can create agents, a person with the role owner or
operator on an agent, the static token, and a person whose roles name no
agent. A person who can only view, such as a sponsor, opens on Results.
An address that names a place keeps it. Without `work`, the page is the
page of before.

| Route | What the page does with it |
|---|---|
| `GET /v1/work?days=7&all=false` | The board under the door. The page reads it at the open of Work and every 30 seconds. It also reads it two seconds after a change of the store, after a start at the door, and after Looks right or Needs work. `all=true` comes from the key Everyone. `days` is 7, 30, or 90. The MCP tool `work` gives the same answer. |
| `POST /v1/work/plan` | `{"words", "agent"?, "tell"?}`, with the header `X-Time-Zone`. Read it back sends the words. A change of Someone else sends `agent`, and a change of You hear of it sends `tell`. The answer is the plan below. A 400 `{"problems": ["words: ..."]}` shows under the door. The route starts nothing and saves nothing. The MCP tool `work_plan` gives the same answer. Make this a job sends `bridge`, the channel, and `handle`, the agent of the channel that runs the job. The answer then holds `members`, the agents of the channel to pick from, `who[0].handle`, and `cost.per: "channel"`: the job posts in the channel to that agent (`start.duty.do.post`) and spends nothing of its own, so the dialog asks for no amount. |

The board:

```json
{"sentence": "11 tasks are open. ...", "days": 7,
 "lanes": [{"stage": "needs-you", "count": 1, "yours": 1, "oldest": "..."}],
 "cards": [{"id": "bridge:br-1", "kind": "bridge", "title": "...",
            "from": {"kind": "person", "name": "...", "via": "bridge"},
            "stage": "needs-you", "next": "you", "reason": "scribe asks: ...",
            "opened": "...", "since": "...", "ended": null, "agents": ["scribe"],
            "parts": {"needsYou": 1, "review": 1, "total": 2},
            "links": {"bridge": "br-1", "run": "...", "approval": "", "duty": "", "runs": ["..."]},
            "costUSD": 0.12, "lost": false, "verdict": "unchecked"}]}
```

- The stages, in the order of the flow, and their words on the page:
  `waiting` Coming up, `working` Working, `needs-you` Needs you, `stopped`
  Stopped, `review` To check, and `done` Done. The backend decides the
  stage. The page only shows it.
- `review`: the run ended well, and its owner asked to check each result.
  The run carries the metadata `workbench.review` = `1`, or its duty has
  `review: true`. The card leaves review on the first thumb. A heart keeps
  a result on the wiki, and it is no check. To check and Done show the
  newest card first.
- **New:** `verdict` of a done card: `accepted` (a thumb up),
  `checked` (the done check of the agent passed, `done: checked` from the
  kernel, and the pass was not weak: a check that only reads a file is no
  check), `sent-back` (a thumb down), or `unchecked`. The page shows the
  word beside a light: green for accepted and checked, red for sent back,
  and grey for unchecked.
- **Merge A:** `waiting` of the board is the one count of the work that
  needs the person: `{"count", "needsYou", "toCheck", "notes"}`. `needsYou`
  and `toCheck` are the cards of Needs you and To check whose `next` is
  `you`, and `notes` the notes of Know-how that wait for the person to keep
  them. `count` is their sum. `GET /v1/inbox` answers the same `waiting`.
  The count of the app bar, the head of Activity, the line on top of Work,
  and Results read it, so they never disagree. A front that answers none
  leaves the page to count the rows of Activity, as before. The line on top
  of Work names the notes, `2 notes wait for you`, and opens Know-how.
- **Merge A:** `done` of the board counts the done cards that completed,
  without the canceled cards and the cards that were let go, as Results
  counts done tasks. The head of Done shows it, with the label `130 done,
  44 canceled or let go`.
- **Merge A:** a card that stopped seven days ago and that nobody moved
  lets itself go: it is in Done with `let-go` and the reason `It stopped 7
  days ago and nobody moved it, so it let itself go.`. A reason of a card
  never says worker: a lost part says `The agent that held it is gone.`.
- **New:** `waiting` also holds the start that comes next of a duty of the
  caller, with `since` at that start. The page then shows the time of the
  start, not an age.
- A kind is `conversation`, `bridge`, `duty`, `job`, or `event`. The page
  says Chat, Team, Duty, Batch, and Event. `next` is `worker`, `agent`,
  `you`, `person`, `manager`, or empty for a done card. The page tags
  `you` as Your move and `manager` as Manager decides.
- If the pool replaced the worker of a part that had not ended, `lost` is
  true, and the card says Lost.
- The title of a card opens its bridge, its duty or its run of a duty,
  Activity for a card that needs the person, or its conversation. A card
  whose next move is the person's and that sits on no bridge opens its item
  of Activity: `#activity/d:<run>/<approval>` for a decision, and
  `#activity/v:<run>` for a result to check.

A plan:

```json
{
  "words": "Every night, check the web hosts for drift. Tell me only when something drifted.",
  "kind": "repeat",
  "title": "Check the web hosts for drift",
  "who": [{ "agent": "ops", "name": "Ops", "does": "does it" }],
  "others": [{ "agent": "writer", "name": "Writer" }],
  "when": { "said": "every night", "readback": "Every day at 2:00 AM, New York time.", "next": ["2026-10-28T06:00:00Z"] },
  "cost": { "basis": "Runs of Ops cost $0.02 to $0.15 in the last 30 days.", "per": "run", "runsPerMonth": 30 },
  "asks": ["Before it changes a host", "When it is not sure what you mean. The question waits for you"],
  "quiet": ["While it works", "When it finds nothing: one line in Done, and no message"],
  "tell": "found",
  "result": "A page in the wiki for each run, and a card in Done",
  "gaps": [],
  "problems": [],
  "start": { "duty": { "name": "check-the-web-hosts-for-drift", "agent": "ops", "when": { "schedule": { "repeat": "daily", "times": ["02:00"] } }, "do": { "ask": { "message": "..." } }, "limits": { "budget": {}, "overlap": "skip", "catchUp": "6h" }, "whileAway": { "decider": "nobody", "timeout": "24h", "then": "deny" }, "notify": { "failure": ["owner"], "needsYou": ["owner"], "result": ["owner"], "resultWhen": "found" } } },
  "open": "#duties/check-the-web-hosts-for-drift"
}
```

- `kind` is `once`, `repeat`, or `team`. `start` holds one of `duty` (the
  record of `PUT /v1/duties/{name}`), `bridge` (the body of
  `POST /v1/bridges`), or `run` (`member` and the body of
  `POST /v1/runs?member=`). Start sends it to that route, with the cost of
  the person: `limits.budget.maxCostUSD` of a duty, `caps.maxCostUSD` of a
  bridge, and `budget.maxCostUSD` of a run.
- The plan never names a cost. `cost.basis` says what runs of the agent
  cost, and `runsPerMonth` lets the page say the most a month can cost.
  Start stays refused until the person types a cost.
- A duty that the plan makes takes the default of every duty while the
  person is away: `whileAway` `{"decider": "nobody", "timeout": "2h",
  "then": "deny"}`. New duty starts from the same default, and the page
  keeps the manager only for a duty that names it. **Merge A:** `away` of
  a plan of the kind `repeat` says it in words, and the readback shows it
  in the row While you are away, after You hear of it. An older front
  sends no `away`, and the page words `whileAway` of the duty itself. When
  the words ask to see the work, such as show me, the duty has `review: true`
  and a run has the metadata `workbench.review` = `1`.
- **New for the duties:** `notify.result` (who hears of each result) and
  `notify.resultWhen` (`always` or `found`), and `review`. The editor of a
  duty keeps all three, and the page of a duty shows them.
- **New for the bridges:** `caps.maxCostUSD`.

### 19.1 Round 2 (2026-10-28)

The round 2 contract adds these shapes. The workbench serves them on
`drive/r2-wb`, and the fake serves them too.

| Shape | What the page does with it |
|---|---|
| `from.display` of a card | The name of the person beside the subject in `from.name`, which can be an id. The page shows it in place of the subject, such as `Manager for Dana Reyes`. The person who reads the board stays `You`. |
| `verdict: "let-go"` of a done card | The word `let go` with a grey light. It is a word of the board only, and Results does not count it. |
| `POST /v1/work/review` with `{"bridge", "verdict", "note"?}` | Looks right and Needs work on a team in To check whose next move is the person's. `verdict` is `up` or `down`. The answer is `{"bridge", "reaction", "followUp", "closed"}`. `up` closes the bridge with the verdict accepted. `down` needs a note, posts `Needs work: <note>` to every seat, and keeps the bridge open. The page never reacts on one seat run for a team. It reads the board again after either key. |
| `POST /v1/work/letgo` with `{"card"}` | Let it go on a stopped card. The answer is the card. A second call answers the card as it is, and a card that is not stopped answers 409. The card moves to Done with `let-go` and the reason `Let go by you.` for the caller, or `Let go by <name>.` for another person. |
| A found result | A run of a duty with `notify.resultWhen: found` carries the metadata `workbench.found` = `1`. An answer that starts with `Found:` found something. Its card then waits in To check with that line as its reason. The inbox gives an item of the kind `result` with the text `<title>: it found something.`. Looks right and Needs work go through the reaction route of section 21. |
| `cost.low` and `cost.high` of a plan | Dollars for the whole task: one run of the agent, or every seat of a team. Both are absent while no run of the agents has a price. |
| `same` of a plan, `{"duty", "title"}` | Only on a plan of the kind `repeat`: a duty of the person that does the same work. The readback says `Your duty <title> does this already.` and offers Open it beside Start, to `#duties/<duty>`. |

The page chose these where the contract left a choice:

- **Let it go.** The key shows on a stopped card whose `next` is `you`,
  and on a stopped card of an agent whose role for the person is `owner`.
  It shows to an admin too. The front decides: a 403 shows as a notice.
  The key asks nothing first, because the card only moves to Done. The
  runs keep their state.
- **A cost below the cheapest run.** The page rounds `cost.low` up to the
  next cent, and compares the typed cost with that amount. Under it, a
  line with an amber light says `One run can cost $0.14. The task stops at
  your limit.`, or for a team `The whole team can cost $0.50. The task
  stops at your limit.`. The line is a warning. Start still works.
- **A cost below one cent.** Whatever the basis says, a typed cost below
  $0.01, such as 0.001, shows the line `That is less than one cent. A run
  stops at such a limit almost at once. Say at least 0.01.` as the person
  types, and Start refuses it with the same words. A basis of `under $0.01`
  gives no low bound, so this line is the only warning there.
- **A found result in Activity.** The page knows a found result by the
  end of its item text, `: it found something.`. Its card then says `It
  found something.` above the task.
- **Change the details** of a plan of a duty keeps the record of
  `plan.start.duty` in the storage of the tab, under
  `fw.bossmode.duty.door`, with the cost that the person typed in
  `limits.budget.maxCostUSD`. It opens `#duties/new?agent=<agent>&do=ask&from=door&message=<words>`.
  The editor opens on that record: the schedule, the cost, `notify`
  (You hear of it), `review`, and `whileAway`, and says `From the door`.
  A save forgets the record. Without the record, the editor opens with the
  agent and the words of the seed.

## 20. Results

The Results place reads what the work of the agents gave and took over a
window. The workbench answers from its package `value`. The page keeps the
types in `src/api/value.ts`.

| Route | Answer |
|---|---|
| `GET /v1/value?days=7` | The value of the window. `days` is 7, 30, or 90, and 30 without it. Another number answers 400. |
| `PUT /v1/value/estimates` | Body `{"line", "minutes"}`. It answers the line with its `estimate`. Zero minutes removes the estimate. A line that the person does not see in 90 days answers 404. A person who does not own the agent of the line gets 403. Minutes past 2400 answer 400. |

The value:

```json
{"days": 30, "since": "...", "until": "...", "sentence": "In the last 30 days, ...",
 "work": {"pieces": 394, "done": 373, "failed": 17, "stopped": 3, "open": 1},
 "checks": {"accepted": 44, "checked": 30, "sentBack": 14, "unchecked": 285},
 "people": {"actions": 172, "noPerson": 270, "reworked": 9, "waitSeconds": 498756, "waitingNow": 1, "handled": 0},
 "lead": {"measured": 373, "medianSeconds": 134, "waitShare": 0.676},
 "spend": {"usd": 29.04, "perDone": 0.078, "failedUSD": 1.65, "coordinationUSD": 1.43, "unpriced": 2, "atLeast": true},
 "estimated": {"minutes": 4525, "lines": 2, "pieces": 64},
 "periods": [{"start", "end", "done", "accepted", "checked", "sentBack", "unchecked", "failed", "usd"}],
 "lines": [{"key": "duty:daily-release-notes", "kind": "duty", "name": "daily-release-notes", "agent": "scribe",
            "work": {...}, "checks": {...}, "actions": 3, "noPerson": 10, "medianLeadSeconds": 420,
            "usd": 0.81, "perDone": 0.04, "unpriced": 0,
            "estimate": {"minutes": 25, "by": "bob@example.com", "at": "..."}, "estimatedMinutes": 450}],
 "partial": false, "unknown": 0}
```

- A task is a run without a parent that is no branch, no check run, and no
  run of the manager or of the quick chat. The JSON keeps the key
  `pieces`.
- `checks` splits the done tasks by their verdict: the newest thumb or
  receipt of a person, as on the board, then the done check of the agent.
  A grade of a model is no verdict, and a heart is none either. A run that
  continues a conversation is a part of its task, as on the board.
- `checked` needs a done check that looked at the work: a pass that the
  kernel marks weak, such as a check that only reads a file, is unchecked.
  The profile of an agent says so under How it knows it is done, beside
  each such check: `This check only reads a file and looks for nothing in
  it, so a run that did nothing passes it. Results does not count such a
  run as checked. Name what the file must hold.`. The rule of the page: a
  check whose tool only reads a file (`files`, `memory`, or the text editor
  with the command `view` or `read`, or a tool named such as `read_file`)
  and that names no `contains` and no `lacks`. The page has no editor of
  the checks, so the warning shows where the owner reads them.
- The figures `N to check` and `N waiting for you` are the parts of the
  one count of the work that needs the person (section 19): `toCheck`, and
  `needsYou` with `notes`. Each links the first row of its kind in
  Activity.
- **New:** `checked` counts the done tasks whose `fw.run.finished` carries
  `done: checked`. An older front leaves it out, and the page counts it as
  0. The figure Checked adds accepted, checked, and sent back. The bar
  shows checked as its own segment: a green ring.
- If runs have tokens without a price, `spend.atLeast` is true. The page
  then says at least.
- If a person set the minutes of a task of a line, `estimated` and
  `estimate` exist. Otherwise the page shows Not set.

## 21. A result to check

A run whose owner asked to check each result waits in two places: the lane
To check of the board, and Activity, where `GET /v1/inbox` gives it an item
of the kind `result`:

```json
{"kind": "result", "run": "duty-notes-0", "approval": "", "duty": "daily-release-notes",
 "agent": "scribe", "bridge": "", "text": "Release notes of yesterday is ready to check.", "since": "..."}
```

- Activity shows a row with the light `to check`, and the app bar counts
  it, as it needs a person. The main pane shows the answer of the run, a
  link to the run, Needs work, and Looks right.
- **Merge A:** a team whose agents finished is an item of the kind
  `result` with `bridge` and no `run`. Activity shows it as a row to check
  with the name of the team, and its newest message is the result: the
  team has no row of a message, and no key Done. The main pane shows that
  message, Open the team, Needs work, and Looks right, which go to
  `POST /v1/work/review` with the bridge, as on the board.
- **Merge A:** a note of Know-how that waits for the person under ask first
  is an item of the kind `note`, with `agent`, `run`, `note` (the id of the
  waiting change), and a text such as `triage wrote a note, ports.md. Keep
  it?`. Activity shows a row that needs you. Its card opens what the agent
  learned, `#knowhow/<agent>`, where Keep this? decides it.
- **Merge A:** a question of a seat that the front calls `gone` makes no
  row: nobody can move the seat by an answer, and the board shows it
  stopped and lost.
- Looks right sends `POST /v1/runs/{id}/reactions` with
  `{"seq": 0, "reaction": "up"}`.
- Needs work opens a note. Send back refuses an empty note and a note past
  1 KB, then sends `{"seq": 0, "reaction": "down", "note": "..."}`.
- **New for the front:** a reaction with `seq` 0 on a run in review goes on
  the `fw.run.finished` of the run, so the kernel records a receipt and
  the verdict counts. After a thumb down with a note, the front sends the
  note to the agent as a follow-up message. The run then works again, and
  its new answer is a new result to check.
- The item leaves the inbox on the first thumb. A heart is no check.
- **Round 2.** The history of a duty says the verdict of each result where
  the page knows one, with these words:

  | Word | Light | When |
  |---|---|---|
  | `to check` | amber, still | The run has an item of the kind `result`, or it carries `workbench.review` and has no reaction yet. |
  | `accepted` | green | A thumb up. A run that a person sent back and accepted after its new answer reads accepted. |
  | `sent back` | red | A thumb down. |
  | `unchecked` | grey | The duty has `review`, and nobody checked the result. |
 The page reads the runs of the 10 newest lines, from the
  view of the fleet, which wakes no worker.

## 22. A run at a limit of its budget

A run whose error starts with `budget exceeded` stopped at a limit of its
budget. That is no fault: the page says `at its limit` with a grey light,
and the plain line names the limit, such as `Stopped at its turn limit`.

| Route | What the page does with it |
|---|---|
| `PATCH /v1/runs/{id}/budget` | Continue with more room, at the end of a chat or a conversation with an agent at its limit. The body sets the limit that the run hit. The answer holds `budget` and `run`. |
| `POST /v1/runs/{id}/messages` | After the change, one follow-up: `You stopped at a limit of your budget, and I gave you more room. Go on from where you stopped.` |

- Each limit counts the whole run, so the same room again is twice what
  the run used: `maxTurns` from `usage.turns`, `maxToolCalls` from
  `usage.toolCalls`, and `maxTokens` from the input and the output tokens.
  The line under the key says how much, such as `It gets 8 more turns and
  goes on where it stopped.`.
- A limit of cost is money, so the page fills no amount. The person types
  the most that the run can cost in all, which must be more than
  `usage.costUSD`, and the page sends it as `maxCostUSD`.
- A limit that the page cannot measure, such as `deadline`, offers no key.
  The next message starts a new chat, as before.

## 23. Keys of a person who only views

The page shows no key that the front refuses. It reads the roles of
`GET /v1/whoami`.

- A person whose roles name agents, none of them as owner or operator, and
  who is no admin, views every agent and operates none, such as a sponsor.
  The profile of an agent reads no page of the wiki for that person,
  because the wiki refuses them.
- A person whose role on an agent is `viewer` gets no composer and no menu
  that starts a run in the conversation of that agent. The pane says
  `You can follow <agent>. Only an owner or an operator of it can talk to
  it.`.
- `canCreate: false` gives no New agent.
- A person who can start no run (section 19, `mayStart`) gets no New and
  no Open a team in the place Teams. A bridge needs its operator or the
  operator role on every agent of its seats, so such a person sees no
  bridge either.
- A duty needs the owner role on its agent. A person who is no admin and
  owns no agent gets no New duty. A person who cannot change a duty gets
  no Run now, no Pause, and no Edit.

## 24. Know-how

The Know-how place reads the routes of section 5.3 of `docs/KNOWHOW.md` of
the kernel, as the package `knowhow` of the workbench serves them
(`routes.go`, `summary.go`, `journal.go`, and `access.go`). Those files
are the authority for every shape below. `src/api/knowhow.ts` holds the
calls and the types, and `fake/routes-k.mjs` serves the same shapes. The
page never calls `GET /v1/knowhow/runs`, which is for the kernel.

| Route | What the page does with it |
|---|---|
| `GET /v1/knowhow/notes?agent=<name>` | `{"agent", "notes": [<item>]}`. The page sends no scope and no principal, so the server lists every note that the person can read: the agent notes, the notes of the person, and, for an operator, the notes of the duties. An item is the note without its text, with `agent`, `scope` (`{"kind", "principal"}`), `revision`, and `sources` as a count. The list leaves out a note that was put away. |
| `GET /v1/knowhow/notes/{agent}/{scope}/{name}?principal=` | The note with `text`, `sources`, and `outOfDate`. `{scope}` is `agent` or `principal`, and the name keeps its slashes. The page sends `principal` with every principal note. |
| `PUT /v1/knowhow/notes/{agent}/{scope}/{name}?principal=` | `{"text", "ifHash", "sources"}`, with the sources of the note that the page read. The server takes `by` from the person. The answer is `{"note", "waiting"}`. A write that waits for a person answers 202 with `waiting`. A write by the access token of the fleet waits under the switch. The page then says `The change waits for a decision in What it learned.` A 412 reads the note again. The page shows the newer text above the draft, and the next Save sends the newer hash. |
| `DELETE /v1/knowhow/notes/{agent}/{scope}/{name}?principal=&ifHash=` | Put away. The answer is 200 with `{"note"}`, or 202 with `waiting`. A 412 reads the note again. |
| `GET /v1/knowhow/journal?agent=<name>&limit=50&before=<id>` | `{"agent", "entries": [<entry>]}`, newest first. `before` is the public id of the oldest entry that the page holds. A full page of 50 entries offers Show older. |
| `POST /v1/knowhow/journal/{id}/undo` | No body. The answer is `{"entry", "undone"}`. The page offers Undo on an entry with `undo` and without `undoneBy`, and never on an entry `out-of-date`: such an undo would make the agent trust the note over its source again. A 409 means that a later change touched the note or the routine, or that the entry was taken back already. The page says so under the entry. A 409 with `outOfDate: true` means that the note went out of date since. The page then says `This note went out of date since. Edit it or put it away in Notes.`, with Notes as a link to the tab. |
| `GET` and `PUT /v1/knowhow/settings/{agent}` | `{"agent", "askFirst", "review": {"on", "agent", "every", "reason"}}`. The PUT sends `{"askFirst"}`. With `review.on` false, the header says the reason, such as `The after-work review is off: no agent is set.` |
| `GET /v1/knowhow/waiting?agent=<name>` | `{"agent", "waiting": [<change>]}`. A change holds the fields of an entry without `undo`, with `text`, `sources`, and `pin`. |
| `GET /v1/knowhow/waiting` | **Added to the workbench** for the page: without `agent`, `{"waiting": [<change>]}` lists the changes of every agent that the person can view and read. The list of agents reads it once to mark the agents that need you. |
| `POST /v1/knowhow/waiting/{id}` | `{"keep": true}` for Keep and `{"keep": false}` for Not now. The answer is `{"kept", "entry"}`. Not now drops the change, and a new note that waited is put away. A 409 means that the note changed since. The change stays until a person drops it, and a quiet line says so above the cards. |
| `GET /v1/knowhow/summary?agent=<name>&days=7` | See below. |
| `POST /v1/knowhow/review/{agent}` | **Added to the workbench**: starts the after-work review of the agent now. No body. 202 with `{"agent", "started": true, "run", "profile"}`, or 200 with `started: false` and `reason` when the agent has nothing to review. The header offers it to an owner as Review now while `review.on`, and says `The after-work review of <agent> started. What it keeps shows here.` or the reason. Without a review profile, 409 with the reason. |

The summary of `summary.go`:

- `costPerJob` holds `usd`, the mean cost of the finished runs, with
  `runs`, `previousUsd` of the days before, and `trend`. The trend is
  `down`, `up`, or `flat` within 5%. From 20 runs, the page adds the
  change in percent, such as `down 9%`, and it says `about the same` for
  `flat`.
- `doneByRoutines` holds `runs`, `byRoutine`, and `share`, over the normal
  runs. The page shows the share from 20 runs, such as `2% of 1,817`, and
  counts below that, such as `4 of 12`.
- `normal` and `heldBack` hold `runs`, `doneWell`, `byRoutine`, and
  `costPerJobUsd`.
- `compare` holds `enough`, `heldBack`, `normal`, `oneIn`,
  `doneWellWithout`, `doneWellWith`, and `line`. The server applies the
  rule of 20 and words the line. The page shows `line`. With `enough`, it
  adds `Cost per job: $0.021 without, $0.020 with.` from the two splits.

Every id of an entry or of a change is public: the id of the bucket, a
dash, and the agent in base64url. The page treats it as opaque.

A subject is `{"note", "scope", "principal"}` for a note, where `scope`
is `agent` or `principal`, or `{"routine"}`.

The rights follow `access.go`, read from `roles` of `GET /v1/whoami`. A
person changes the notes of their own principal with the operator role.
The agent notes and the notes of a duty need the owner role, and so does
a routine. The page offers Edit and Put away on the notes of the person:
their own scope, and a note that they wrote in a scope that they can
change. It also offers them on a note that went out of date, in a scope
that the person can change, because such a note has no undo: the owner
corrects it. The server gives the source that changed its version of now
on such a correction. It offers Undo and Keep on a change of a note or a
routine that the person can change. Only an owner sees the switch and
Review now.

A run of an entry, of a change, or of a source opens in its chat on this
page, `#chat/<id>`, as a card of Work opens a run, never on the page at
`/ui`. A source page links to the wiki only for a person who may read it:
an admin, the token of the fleet, or an operator or an owner of an agent
(`operates` of `Shell.tsx`). For anyone else, such as a viewer of every
agent, the page names the source in words, with no link that the wiki
would refuse.

A 404 whose detail starts with `Know-how is off` means that the server
keeps no know-how. The place then says `Know-how is off on this server.`,
with the reason of the server behind a question mark. Another 404, such
as for an agent that the person cannot view, shows in place. The tab
Routines still reads section 15.

The page reads the agent again on each `knowhow` event while a pane of the
place shows, and every agent again after a reset.

An entry of the journal:

```json
{
  "id": "01K8R2Q5W6ZJ3N7Y0D4F9H1C2B-dHJpYWdl", "at": "2026-10-26T02:27:00Z", "agent": "triage",
  "what": "learned",
  "subject": { "note": "gotchas/gitea-labels.md", "scope": "agent" },
  "why": "Two runs failed on a label with a space and passed without it.",
  "runs": ["01K8..."], "by": "review", "undo": { "revision": 0, "after": 1 }
}
```

The summary of triage in the fake:

```json
{
  "agent": "triage", "days": 7, "since": "2026-10-21T05:04:43Z",
  "costPerJob": { "usd": 0.0197, "runs": 1912, "previousUsd": 0.0215, "trend": "down" },
  "doneByRoutines": { "runs": 1817, "byRoutine": 41, "share": 0.0226 },
  "notesCorrected": 3,
  "normal": { "runs": 1817, "doneWell": 1653, "byRoutine": 41, "costPerJobUsd": 0.0196 },
  "heldBack": { "runs": 95, "doneWell": 78, "byRoutine": 0, "costPerJobUsd": 0.021 },
  "compare": { "enough": true, "heldBack": 95, "normal": 1311, "oneIn": 15, "doneWellWithout": 0.821, "doneWellWith": 0.91,
    "line": "Held back 1 in 15 runs. Done well: 82% without what it learned, 91% with it." }
}
```

