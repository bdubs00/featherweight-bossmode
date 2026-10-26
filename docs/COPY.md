# The copy of the page

This file audits every string of the page, file by file. Each row says to
keep a string, to change it, or to remove it, and gives the new text. The
column Who names the screen that applies the change (section 11 of
`docs/DESIGN.md` assigns the files), or Lead for a file of the lead. A row
marked done is in the code already.

## 1. The rules

1. A status is a word, such as `working`, `needs you`, or `waiting for a
   worker`. A light repeats the word and never replaces it.
2. A time in a list is a short meta, such as `14 min`, from `since()` in
   `src/lib/words.ts`. A message shows its clock time. The full time sits in
   a tooltip.
3. No sentence of instruction or explanation sits in the chrome. A limit
   shows in the error at the moment the person hits it. A definition sits
   behind a question mark, in the `Help` primitive. These strings, and any
   like them, go: `To fire a member, drag it out of the roster, or pick Fire
   in its menu.`, `The member starts a run on the queue of the pool of its
   agent, as you.`, `Drop or paste files here · 20 files, 32 MiB total. Agent
   workspace limits also apply.`, `Your conversation`, `Checked 2 minutes
   ago`, and `Asleep since 14 minutes. A request wakes it.`
4. An action keeps its name through the flow. The key that says Seat makes a
   seat, and the channel then says seated. The key that says Fire leads to a
   dialog whose key says Fire, and the channel says fired.
5. An error says what happened and what to do, in one or two short
   sentences, with no apology.
6. An empty screen invites an action, with the key that does it.
7. Sentence case everywhere. No uppercase label, no middle dot between the
   parts of a meta string, and no arrow after a link or a key.
8. The word pool never appears for an operator. An agent has workers. Keep is
   the number of workers that an agent keeps. A worker is awake or asleep.
   The word Task, for a worker, also stays out of the page.
9. No text that a person sees says front. A sentence names the server, or
   it names no actor. The rule holds for a label, a tooltip, a name for a
   screen reader, and an error of the page. The name of a tool, such as
   `front.pages_write`, is code, and a tooltip or Details can show it as
   it is. Two examples are `A setting of the server` and `No check ran.`

## 2. The words

| Thing | The word on the page | Never |
|---|---|---|
| A job split into seats, with one channel | bridge | room, project, job |
| One seat on a bridge | seat, and the handle of the seat, such as migrator-2 | slot, instance |
| The agent behind a seat | member, in a roster | bot |
| A profile that workers run | agent | profile |
| A Task that runs the work of an agent | worker | pool, Task, crew, pod |
| The number of workers an agent keeps | Keep | wanted, replicas |
| A placement `queue` | keep warm workers | queue, intake |
| A placement `spawn` | fresh sandbox per seat | spawn, child Task |
| An approval or a question that waits | decision | permission, approval request |
| What the operator asks of a member | task | prompt |
| A Markdown file of the wiki | page | doc, note |
| A SKILL.md that an agent can load | skill | plugin, extension |
| A function that an agent can call | tool | function, capability |
| The person who runs the page | you | the operator, the user |
| A message that each delivery pins, so it survives every compaction of the runs | pinned, a quiet chip on the entry | sticky, starred, saved |
| A seat whose newest run stopped at a limit of its budget | at its limit, with a grey light, and the key Continue | error, failed, out of budget |
| Going on with the run of a seat at its limit, with more room | Continue, and the channel then says continued | resume, retry, top up |
| Clearing a message of Activity for you | Done | archive, dismiss, mark as read |

The statuses of a seat: `working`, `needs you`, `waiting for a worker`,
`not started`, `idle`, `asleep`, `at its limit`, `error`, and `fired`. The statuses of a
worker: `awake`, `asleep`, `starting`, `failed`, and `stopping`. The readout
of the fleet also counts `working`, a worker that is awake and holds an open
run. The statuses of a run: `waiting for a worker`, `working`, `needs you`,
`ready`, `ended`, `failed`, and `stopped`.

Capacity shows where seating happens:

- The picker of Add shows each agent with `1 free`, `2 free`, or `waiting
  for a worker`.
- A seat past capacity shows the status `waiting for a worker`.
- The profile of an agent shows Keep with its number, inline, and changes it
  in place.
- A bridge with more seats than workers gets one system line in its channel:
  `Runs in waves: 5 seats share 3 workers.`

## 3. The shell and the files of the lead

### index.html

| Now | Verdict | New text | Who |
|---|---|---|---|
| `bossmode` (title) | keep | | Lead |
| `Bossmode needs JavaScript.` | keep | | Lead |
| `bossmode` (the title of the document) | change | `Bossmode`, until the shell writes the title of the tab | done |

### src/ui/App.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Loading bossmode.` | keep | | done |
| `No bridge is open. Open a bridge, or ask the manager to open one.` | change | `No bridge is open. Open one, or ask the manager to open one.` and the key `Open a bridge` | done |
| `Pick a bridge in the rail.` | remove | the main pane opens a bridge where two panes show | done |
| `Pick a page in the tree, or search the wiki.` | change | `Pick a page in the list, or search the wiki.` and the key `New page` | done |
| `That access token did not work.` | change | `That access token did not work. Check it, or sign in.` | done |
| `The workbench did not answer.` | change | `The workbench did not answer. Check the connection, then try again.` | done |
| `Bossmode` (heading of a failed boot) | keep | | done |
| `Try again` | keep | | done |
| `Dismiss` | keep | | done |
| `Failed` (the word of the notice) | keep | | done |
| new | add | `A new version of bossmode is out.`, in the place of the notice, with the keys `Reload` and `Dismiss`, when the stream names a build of the page that is not the build of the tab. It stays through a move to another screen, a notice of a failed action takes the place first, and Dismiss hides it until a later build. | done |
| `Loading bossmode.` | change | `Loading the page.` | done |
| `A new version of bossmode is out.` | change | `A new version of this page is ready.`, with `Reload` and `Dismiss` | done |
| `The workbench refused one request. You are still signed in. Try again.` | change | `The server refused one request. You are still signed in. Try again.` | done |
| `The workbench did not answer. Check the connection, then try again.` | change | `The server did not answer. Check the connection, then try again.` | done |

### src/ui/Shell.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Activity`, `Bridges`, `Fleet`, `Skills`, `Wiki`, `Manager` | keep | | done |
| `Chat` (the place between Activity and Bridges, with a speech bubble) | add | the quick chat of section 7 | done |
| `Routines` (the place between Skills and Wiki, with two arrows that turn back into each other) | add | the Routines place of section 8 | done |
| `1 member needs you`, `N members need you` (count of Activity) | change | `1 item needs you`, `N items need you`: the count takes the rows of Activity that need you, also the failed runs and the paused duties, which are no members | done |
| `<name>, account` (account key) | keep | | done |
| `Match the system`, `Light`, `Graphite` | keep | | done |
| `Connections`, `Sign out` | keep | | done |
| `Live` | remove | The stream is live in the normal state, so the word said nothing. The readout of the fleet takes the foot of the Bridges list. | done |
| `Connecting`, `Offline` | keep | the words of the readout while the stream is down, with `The page connects to the workbench again.` and `The page gets no updates.` in the tooltip. `Connecting` shows only after 6 seconds down, and `Offline` at once. | done |
| `Updates arrive as they happen.` (tooltip) | remove | | done |
| `N workers awake` | change | the readout of the fleet: the caption `N workers`, `1 worker`, or `No workers`, and the figures `N failed`, `N working`, `N awake`, `N starting`, `N asleep`, `N stopping`, in that order, each only when its count is not 0 | done |
| new | add | `<agent>, <worker>: <status>`, the tooltip of a lamp, such as `migrator, crew-0: working`, and `N <status>` for a share of a large fleet | done |
| new | add | `Fleet: <caption>, <figures>`, the name of the readout for a screen reader, such as `Fleet: 9 workers, 2 working, 7 asleep` | done |
| `<name>, home` (logo well) | keep | | done |
| the dashed well with a picture where the deployment names no logo | change | the monogram of the name of the organization, such as `H` for Homelab, else a muted `B` for bossmode. The letters are hidden from a screen reader, which reads `<name>, home`. | done |
| new | add | the title of the tab: the count of what needs you, the place, and the deployment, such as `(2) Activity - Homelab`, or `Bridges - Bossmode` without a theme | done |
| new | add | `Skip to the content`, the first link of the page, which shows only while it holds the focus | done |
| `Graphite` (the theme in the account menu) | change | `Dark`, also in Appearance | done |
| `token, account`, `TO`, and `token` over `token` in the menu head, for the access token of the fleet | change | `Your account`, a figure for the key, and `You` over `Signed in with an access token` | done |
| `The page connects to the workbench again.` | change | `The page connects to the server again.` | done |

### src/ui/Signin.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Sign in` | keep | `Sign in to <name>` for a theme with a name | done |
| `Your sign-in ended. Sign in again to go on. Your drafts stay.` | change | `Your sign-in ended. Sign in again, and your drafts stay.` | done |
| `Sign in to run your fleet.` | keep | | done |
| `The sign-in did not finish. Sign in again, or use an access token.` | new | the lede after a return from a sign-in without a session, with the token way open | done |
| `Paste your access token to run your fleet.` | keep | | done |
| `Use an access token` | keep | | done |
| `Access token` | keep | | done |
| `Continue` | keep | | done |
| `Sign in` (the heading before the settings load) | change | `Sign in to Bossmode`, or `Sign in to <name>` with a theme, and the title of the tab `Sign in - <name>` | done |

### src/ui/common.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Cancel` (dialog) | keep | | done |
| `Back to <place>` (back link) | keep | the old back link said only the place, beside an arrow | done |
| `More` (the name of a menu key on a header), `More for <handle>` (in a row) | add | the screen-reader name of the key of a menu | done |
| `Back to <handle>`, `Back to <agent>` (the back link of a profile) | add | the profile goes back to the conversation that opened it | done |

### src/ui/primitives

| Now | Verdict | New text | Who |
|---|---|---|---|
| the name of a `Find` field, such as `Find a member` | add | the placeholder takes the name unless a screen gives a shorter one | done |
| `Advanced` (the summary of the disclosure) | keep | one word, in every form | done |

### src/ui/notice.ts, src/api/client.ts

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Something failed.` | change | `The action failed. Try it again.` | done |
| `Your access token did not work.` | keep | | Lead |
| `The workbench did not answer. Check the connection and try again.` | keep | | Lead |
| `The workbench answered with something that is not JSON.` | change | `The workbench answered with something that is not JSON. Reload the page.` | done |
| the notice stays until Dismiss or the next action that works | change | when the person moves to another screen, the notice also clears | done |
| new | add | a notice of an action that worked, such as `Saved the playbook <name>.`, a status with the key `Dismiss`. It goes after six seconds, stays through a move to another screen, and gives way to a notice of a failed action | done |
| `The workbench did not answer. Check the connection and try again.` | change | `The server did not answer. Check the connection and try again.` | done |

### src/lib/presence.ts

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Works on its task now.` | keep | | done |
| `Waits for an approval, an answer, or a connection.` | change | `Waits for your approval, your answer, or a connection.` | done |
| `Finished its turn. Its Task is live.` | change | `Finished its turn. A message starts the next one.` | done |
| `Its Task sleeps. A message wakes it.` | change | `Its worker sleeps. A message wakes it.` | done |
| `Its newest run failed, or its Task stopped.` | change | `Its newest run failed, or its worker stopped.` | done |
| `Its seat is fired. It gets no message.` | change | `Fired. It gets no message.` | done |
| `running` (phase) | change | `awake` | done |
| `The Task is up.`, `The Task sleeps. A request wakes it.`, `The Task starts.` | change | `The worker is up.`, `The worker sleeps. A request wakes it.`, `The worker starts.` | done |
| `canceled` (run) | change | `stopped`, the word of the Stop key | done |
| `Is queued, running, or paused.` | change | `waiting for a worker` for queued, and `Runs, or pauses between two steps.` for running | done |
| new | add | `waiting for a worker`, with `Every worker of its agent is busy. It starts when one is free.` | done |
| new | add | `waiting for a worker` for a seat with no run whose job or manager will seat it (presence `waiting`), with `It has no run yet. It starts when a worker takes it.` | done |
| new | add | `at its limit` for a seat whose newest run stopped at a limit of its budget (presence `limit`, or a failed run whose error starts with `budget exceeded`), with a grey light and `Stopped at a limit of its budget. Continue gives it more room.` It is no error: the key is Continue, and a bridge does not count it as failed | Lead |
| new | add | `not started` for a seat with no run that nothing will seat, because the manager of its spawn bridge stopped first (presence `not-started`), with `The manager stopped before it seated this member. A message starts it.` | done |
| the word of a status from three sources: the presence of the bridge, the phases of the stream, and the read of the pool | change | one word for one status on every screen, from `statusOf` of `src/lib/status.ts`. The counts `N awake` and `N workers awake` take it, and so do the people list and the board. The halo of a conversation, a row of the members, the run pane, and the Workers of a profile take it too. The words stay the words of this section. | done |

### src/lib/words.ts

| Now | Verdict | New text | Who |
|---|---|---|---|
| `This tool can change things, so it waits for you.` | change | `Rule: ask before a tool that changes things` | done |
| `A rule of this agent asks you first.` | change | `Rule: ask before git push`, from the rule itself | done |
| `The policy of this agent asks you first.` | change | `Rule: ask first` | done |
| `3 minutes ago` (ago) | change | `since()` gives `14 min`, `3 h`, and `2 d` | done, and the screens move to it |
| `<who> wants to run a command` | keep | | Lead |
| `<who> asks for your permission` | change | `<who> asks for your decision` | done |
| `<who> asks for your decision` (any call that is not a shell command) | change | the action of the tool: `<who> wants to open a bridge`, `<who> wants to write a page`, `<who> wants to hand off a task to <agent>` (or `a task` with no agent), `<who> wants to <label>` for a label of the backend, and `<who> wants to use <tool>` for any other tool. `<who> asks for your decision` stays only for a call whose tool the page does not know. | done |
| `Rule: ask before front.bridge_open` | change | `Rule: ask before bridge_open`: a rule that names a tool of the front names it without `front.` | done |
| the preview of a message, which dropped every underscore, so `bridge_read` read `bridgeread` | change | `plainText()` drops the marks of Markdown at the edges of words and keeps an underscore inside a word | done |
| `Today`, `Yesterday` | keep | | Lead |
| `someone`, `bossmode` (sender of a system line) | keep | | Lead |

### src/lib/runerror.ts

| Now | Verdict | New text | Who |
|---|---|---|---|
| the whole error of a run, such as `model: anthropic: stream claude-haiku-5-5: POST "http://...": 400 Bad Request (Request-ID: ...) {"type":"error",...}`, cut to one red line in a row and in full in the run | change | one plain line from `plainError`, without an end mark: `The model refused the request` (a 4xx), `The model provider refused the key` (401), `The model provider refused access` (403), `The model provider does not know this model` (404), `The conversation is too long for the model`, `The model was busy` (429, or overloaded), `The model provider had an error` (5xx), and `The model did not answer in time`. An error of another service says `A service` in place of the model and its provider, and `A step did not finish in time` | done |
| `budget exceeded: maxTurns` and the other limits of the budget | change | `Stopped at its turn limit`, `Stopped at its token limit`, `Stopped at its cost limit`, `Stopped at its time limit`, `Stopped at its tool call limit`, `Stopped: it kept repeating one step`, and `Stopped at its budget` for another limit. The older words keep the number: `The run reached its limit of 40 turns.` gives `Stopped at 40 turns`, and so does a limit of the result, such as `Stopped at the limit of 40 turns.`, or `Stopped at 2.00 USD` | done |
| `canceled`, `context canceled` | change | `Stopped before it finished`, where the status does not say stopped already | done |
| `<handle> lost its run <id>: no worker of the fleet holds it` | change | `Lost its worker` | done |
| any other error | change | its first sentence, without addresses, request ids, long ids of runs and bridges, JSON, the package names in front, or an end mark, at most 100 characters. `The run failed` when nothing is left | done |
| the message of the provider inside its JSON, such as `This model does not support assistant message prefill. The conversation must end with a user message.` | add | `providerMessage` gives it: the tooltip of the plain line, and a muted line under it in the run | done |

### src/lib/steps.ts

| Now | Verdict | New text | Who |
|---|---|---|---|
| `front.pages_write` (a step of the run that the kernel names by its tool), `Used pages_write` (a step line of a thread) | change | the step as a person says it, with its target: `Wrote <path>`, `Read <path>`, `Read the history of <path>`, `Searched the wiki for "<words>"`, `Listed the pages`, `Listed the pages under <prefix>`, `Posted to the bridge`, `Posted to <a> and <b>`, `Read the channel`, `Listed the bridges`, `Opened a bridge`, `Seated <handle>`, `Fired <handle>`, `Closed the bridge`, and `Asked you`. Without a target: `Wrote a page`, `Read a page`, `Seated a member`, and the like | done |
| `Ran "<command>"`, `Wrote <path>`, and the other words of the kernel for a step | keep | the command shows as code | done |
| `Used <tool>` | keep | only for a tool that the page does not know and that the kernel names only by its name | done |

### src/lib/handles.ts, src/lib/pagepath.ts

| Now | Verdict | New text | Who |
|---|---|---|---|
| the reasons of a handle | keep | they show only in the error of a bad handle | done |
| `The handle <h> is reserved. Pick another.` | keep | | done |
| `A page needs a path, such as notes/plan.md.` and the other reasons of a path | keep | they show only in the error | Lead |

## 4. Screen A

### src/ui/BridgeList.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Bridges` with the count chip | keep | | done |
| `New` | keep | | done |
| `N members` | keep | | done |
| `closed`, `1 needs you`, `N need you` | keep | | done |
| `working` for a bridge with a failed seat | change | `1 failed`, `N failed` with a red light, after needs you and before working, the order of attention. The list reads the members of each open bridge for it, as Activity does. `1 member failed`, `N members failed` for a screen reader | done |
| the unread count of a closed bridge | remove | a closed bridge did its work, so its row shows no count chip | done |
| `No bridge is open.` | keep | with the key `Open a bridge` | done |
| `Loading the bridges.` | keep | | A |
| `Closed` with the count chip | keep | the chip counts the closed bridges | done |
| `Find a bridge` | add | the field above a list of more than ten bridges | done |
| `working` (a bridge where a seat works) | keep | the light and the word when a seat works and nothing needs you or failed, after them in the order of attention | done |
| new | add | the freshness of the newest entry of the channel at the end of the meta line, from `since()`: `now`, `14 min`, `3 h`, `2 d`, with the full time in its tooltip. `last entry 14 minutes ago` for a screen reader, from `ago()`, and `working` there when a seat works. A bridge without an entry shows none | A |
| `2000+` | add | the unread count past the bound of the backend | done |
| `Manager` row and `Your conversation` | remove | Manager is a place of the app bar | done |
| `Places`, `Fleet`, `Pages` rows | remove | places of the app bar | done |
| new | add | `No bridge matches <filter>.` with the key `Clear`, for a filter that matches no bridge. While a filter shows, `Closed` is a heading over the closed bridges that match, not a toggle. | done |

### src/ui/Channel.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| the goal under the title | remove from the header | the goal opens the channel, at its first entry | done |
| `Closed. ` before the goal | change | the status `closed` beside the title | done |
| `The start of the bridge <title>.` | change | the goal of the bridge | done |
| `Members` key with the count | keep | it shows only where the members pane is out of sight | done |
| `Bridge settings` | change | `Close bridge` as a key on the header, and `What the manager can do` in the menu of More | A |
| `What the manager can do here` (dialog title) | keep | | A |
| `Approve the calls of members` | change | `Decide for members` | A |
| `Change the budgets of members` | keep | | A |
| `Add and remove members` | keep | | A |
| `Write a report to the wiki when the bridge closes` | change | `Write a report on close` | A |
| `The manager acts for you only where you let it. A decision of the manager shows in the channel.` | remove | | A |
| `Save` | keep | | A |
| `Open the bridge again` | change | `Reopen` | A |
| `Close the bridge` | change | `Close bridge`, the same on the key, the dialog, and its last key | A |
| `Close <title>?` | keep | | A |
| `A close cancels nothing. The members finish what they do, and the channel takes no new message. The manager writes a report to the wiki.` | change | `Members finish what they do. The channel takes no new message.` and, with the report, `The manager writes a report.` | A |
| `Load earlier messages` | change | `Earlier messages` | A |
| `Loading` | keep | | A |
| `Loading the channel.` | keep | | A |
| `This bridge is not here, or you cannot see it.` | change | `This bridge is not here. It was removed, or you cannot see it.` and the key `Bridges` | A |
| `New messages below` | change | `New below`, the key at the foot of the list while something new waits under the fold, the same in the channel and in every conversation. The list follows new entries while the person reads at the end or within a screen of it, so a card that needs the person comes into view | done |
| `Message the bridge` (placeholder) | keep | was `Message every member, or @ one member` | done |
| `This bridge is closed. Open it again to send.` | change | `Closed. Reopen it to send.` | A |
| `Messages of <title>` (log label) | keep | | A |
| new | add | the tabs `Posts`, `Wiki`, `Decisions` with the count of decisions | A |
| new | add | the system line `Runs in waves: N seats share M workers.` once per bridge | done |
| `Bridge` (the name of the screen for a screen reader, and the title of a bridge that is not here) | add | | done |
| `N updates`, `N failed` (a fold of system lines, with a red light for the failures) | add | | done |
| `<a> and <b>: N messages` (a fold of the chatter of agents) | add | | done |
| `More` (the menu of the header) | add | it holds `What the manager can do`, `Reopen`, and, below 1500 pixels, `Close bridge`, so the title keeps its room | done |
| the empty tab Decisions | add | `Nothing needs you.`, the words of Activity | done |
| the tab Wiki | add | `Loading the pages.` and `New page`, the words of the wiki | done |
| the pages under `bridges/<id>/` alone, by name (the tab Wiki) | change | every page of the work of the bridge: the title, then the seat that wrote it with its face, the path (without `bridges/<id>/` for a page of that folder), and `14 min`. A page that no seat wrote names its writer, such as `alice`. `Pages of this bridge` for a screen reader | done |
| the tab Wiki with only `New page` | change | `No page yet. The members keep their notes and reports here, and you can write one too.` with the key `New page` | done |
| new | add | `Nothing waits for you. The cards below were decided or answered.` above the cards of the tab Decisions when none waits | done |
| `Members finish what they do. The channel takes no new message.` (Close bridge) | change | the same, then `You can reopen it from More.` | done |

### src/ui/Message.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Thumb up`, `Thumb down`, `Heart` | keep | | A |
| `Thumb up: <label>`, `Thumb down: Deny` | keep | | A |
| `Heart: keep this in the wiki` (tooltip) | keep | | A |
| `What made this useful? The wiki keeps the heart with your note. The note is optional.` | change | `What made this useful?` with the placeholder `Optional` | A |
| `Save heart` | change | `Heart`, the name of the reaction | A |
| `Cancel` | keep | | A |
| `Reply`, `Reply to <who>` | keep | | A |
| `Go to the message`, `Load earlier messages to see it` | change | `Go to the message`, `Earlier messages hold it` | A |
| `An earlier message` | keep | | A |
| `The channel holds the first 4 KB. The run holds the whole text.` | change | a quiet key `Show all` at the cut, which shows the whole entry in place. `Cut at 4 KB.` with the link `Whole text` to the run stays only for an old entry whose start alone was kept | done |
| `to @a, @b` (address line) | change | `to a and b` | A |
| new | add | `pinned`, a quiet chip after the clock time of a pinned message, which keeps its header after a message of the same sender | done |
| the id of a bridge in a message, such as `The bridge is open: 01m5kpw79kyq9j8nbpnhvtwm95` | change | a link with the title of the bridge, open or closed, that opens the bridge, in a code span and in plain text, in a channel, a thread, a conversation, and Activity | done |
| the path of a page of the wiki in a message, such as `k3s/monitoring/runbook-memory-pressure.md` | change | a link that opens the page in the Wiki place. A path in a code span keeps its code look inside the link. The page links a path that the wiki holds, from the list of the wiki that it reads once. If that read fails, a path that follows the rules of a page path links. | done |
| `Question from <who>`, `Permission for <who>` (labels) | change | `Question from <who>`, `Decision for <who>` | A |
| system lines: the icon before the line | change | the light of the event: green for started, amber for needs you, red for failed, grey for the rest | A |
| the sentence of the backend on a system line, such as `migrator-2 went to sleep. A message wakes its Task.` | change | the words of the page for the event of the line, in the channel and in the thread of a seat. `lineWords` of `src/lib/lines.ts` gives them. The sentence sits in a tooltip where the words leave part of it out. A line of an event that the page does not know keeps the sentence. | done |
| `<handle> woke up` (started, for a worker that wakes again) | add | | done |
| `<handle> took the seat` (any other started) | add | never the task | done |
| `<handle> went to sleep` (asleep) | add | no second sentence | done |
| `<handle> slept and woke up`, `<handle> slept and woke up N times` (a sleep line and a wake line of one seat with nothing between them, and a run of such pairs) | add | one quiet line with a grey light, in the channel and in the thread of a seat, at the clock time of its last line. It does not open. A sleep line that no wake line follows stays, because it says where the worker is now. In a fold of lines, the quiet line counts as one update. | done |
| `<by> allowed <handle>'s command`, `<by> denied <handle>'s command`, `<by> answered <handle>`, `<by> declined <handle>'s question`, `<by> decided` (decided) | add | only where the view does not hold the card that the line decides. The card shows the decision, and the note stays on the card. | done |
| `<by> allowed <handle>'s file change`, `<by> denied <handle>'s file change`, `<by> allowed <handle>'s call of <tool>`, `<by> denied <handle>'s call of <tool>` (decided, the plain facts of a later front) | add | the tool without the prefix `front.`. The note stays on the card. A later front names the decider by its subject. The token of the fleet thus reads `token`, and You for the person who signed in with it. The page also reads the older sentences of a decision. | done |
| `<handle> lost its worker` (lost) | add | a quiet line with a grey light. The fleet lost the run of the seat, as after a roll of its workers. The sentence of the backend, with the id of the run, sits in the tooltip. | done |
| the sentence of the backend as one fact with no advice and no end mark, such as `migrator-2 went to sleep` | add | the same words as the older sentence of the same event | done |
| `<by> opened the bridge`, `<by> closed the bridge`, `<by> reopened the bridge`, `The bridge opened`, `The bridge closed`, `The bridge opened again` | add | | done |
| `<by> seated <handle>` (joined) | add | the word of the key Seat | done |
| `<by> fired <handle>`, `<handle> is fired` | add | | done |
| `<by> muted <handle>`, `<by> unmuted <handle>`, `A member is muted` | add | | done |
| `<handle> has a new task`, `<by> seated <handle> again` (task) | add | | done |
| `<by> continued <handle>` (task), such as `You continued reviewer` | add | the line of Continue | A |
| `The report is in the wiki` with the link of the page, `<by> changed the settings`, `<who> changed a page` with the link of the page, `No report`, `The bridge changed` (changed) | add | | done |
| `<handle> finished` | add | | done |
| `<handle> stopped`, `<by> stopped <handle>` (canceled) | add | the word of the key Stop | done |
| `<handle> needs you`, `<handle> asks you` (a line of needs-you or asked without its card) | add | | done |
| `<handle> failed`, `<handle> did not take the seat`, `<handle> did not get a message`, `<handle> did not stop`, `<handle> did not start`, `<handle> stopped waiting for its decision`, `The report failed`, `Failed` (failed) | add | the tooltip of `<handle> failed` holds the plain line of `plainError` and the message of the provider, never the raw error | done |
| `The bridge reached its cap of N turns` (cap) | add | the cap of the turns of every run of the bridge | A |
| `The bridge reached its cap of N messages`, `The bridge reached its cap of N a minute`, `<handle> stopped at a limit`, `<handle> cannot take messages`, `<a> and <b> reached their cap`, `The bridge reached a cap` (cap) | add | | done |
| `You` (the author line of a message of the person who reads the page, a person of a line, and a decided card) | add | the subject or the name of `/v1/whoami` matches the sender or the decider. A person who signs in with the token of the fleet thus never reads `token` for themself. | done |
| `Someone`, `token` (a line whose sentence names nobody, or the token of the fleet for another person) | add | | done |
| `to operator` (the address line of a message to the person) | change | `to you` | done |

### src/ui/Decision.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Permission` (kicker) | remove | `Needs your decision` with the amber light | done |
| `<who> wants to run a command` (title) | change | the first line of the card, as a sentence | done |
| `Details`, `Tool:` | keep | Details holds the tool and the raw input | done |
| `Reason: rule: ask destructive` | remove | the rule line says it in words, such as `Rule: ask before a tool that changes things`. No rule id of the backend shows. | done |
| the raw JSON of the input as the only account of a call that is not a shell command | change | the plan of the call, before Details. `bridge_open`: the title, the goal from its start, cut with an ellipsis past 280 characters, `Fresh sandbox per seat` for a spawn bridge, and one line per seat: the handle, the agent where the handle does not name it, and the task cut to one line. `pages_write`: the path, the summary, and the first four lines of the text after its front matter. `spawn_task`: the task. Any other tool: its top-level fields, each value cut to one line, `N items` for a list, `N fields` for an object, `none`, `empty`, and `N more fields` past six. JSON shows only in Details. | done |
| `Note for <who>, if you want` | change | `Note` with the placeholder `Optional` | done |
| `Deny`, `Always allow`, `<label>` or `Allow` | change | the primary key names the action in a verb: `Open bridge`, `Write page`, `Hand off`, else the label of the backend, such as `Run command`, and `Allow` only as the last fallback | done |
| `Always allow needs an owner of the agent. Allow once instead.` | new | the notice when the backend refuses the rule with 403, in place of its sentence with the subject of the caller | done |
| new | add | `Waits for a decision` with a still amber light, and `An operator of <agent> decides it.`, the quiet card of a decision that the person may not make. It offers no key and no Note. | done |
| `Allow this call, and let <who> use <tool> from now on without asking` | change | `Allow <tool> for <who> from now on`, the tool without `front.` | done |
| `No decision: <note>` | keep | | A |
| `<who> answered: <answer>`, `<who> declined the question`, `<who> allowed this`, `<who> denied this` | keep | | A |
| `. Note: <note>` | change | the note on a line of its own | A |
| `Question from <who>` (kicker) | change | `Needs your answer` with the amber light, and `<who> asks: <question>` | done |
| `A question for you` | keep | | A |
| `Your answer`, `None`, `Decline`, `Answer` | keep | | A |
| the plan of a large call, such as a playbook with check false and a files map, as the top-level fields cut to one line, or no input at all | change | the short fields first (`hosts`, `check`, `become`, `module`), a text of several lines as a short block of code with its name and the quiet key `Show all`, then `Show less`, and a map of files as a list of file names, each a key that opens its text. No JSON outside Details | done |
| `Deny`, `Allow` on the card of the channel, `Deny`, `Always allow`, `Allow` on the card of Activity for the same decision | change | the same keys on every surface: Always allow only by the rule of the front, never for a rule with a pattern such as `check=false` | done |
| new | add | the card of a question of a seat: `Needs your answer` with the amber light, the words of the seat, one key per choice, `Your answer`, and `Answer`. `Question from <who>` names the card for a screen reader, and `Answers for <who>` the group of the keys. Once a person answers, or the seat posts again, the entry reads as a message | done |

### src/ui/Composer.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Reply to <who>: <excerpt>` | change | the chip `Replying to <who>` with `Stop replying` | done |
| `Cancel the reply` | change | `Stop replying` | done |
| `To every active member`, `To @a and @b` | change | `To everyone`, `To a and b` | A |
| `Ctrl+Enter`, `⌘+Enter` | keep | `⌘+Enter` on a Mac, from the platform hint of the browser. A touch screen (a coarse pointer) has no such key, so the composer names none there | done |
| `Send` | keep | | done |
| `Members` (list label) | keep | and `Commands` for the slash menu | done |
| the argument hint of a command, such as `<module>` | add | in a slot of its own: beside the name in the slash menu, and as `/<name> <hint>` in the address line while the person types the arguments | done |
| `Message <who>` (placeholder of a reply) | keep | | done |
| `Attach files` (the key with the paper clip, in a bridge and in the manager) | add | the name of the key for a screen reader and its tooltip. The composer takes files from the key, a drop, and a paste, and says no limit until the person hits it | done |
| `Files to send`, `Remove <name>` | add | the list of the files of the draft, each by its name and its size, such as `team.csv 25 B`, with its key | done |
| `A message holds at most 20 files. Pick fewer.`, `<name> is empty. Pick another file.`, `The files of a message hold at most 32 MB together. Pick smaller files.` | add | in the composer, at the moment of the pick that passes the limit. The pick then adds nothing | done |
| `The page cannot read <name>. Pick it again.` | add | in the composer, when the browser cannot read a file at the send | done |
| `The files are too large to send. Remove some, and send again.` | add | the notice of a 413 for a message with files. The draft and its files stay | done |
| the sentence of a 409 for files, such as `Files go only to a member with a run, and reviewer has none yet: send them once it works, or address another member.` | add | the notice, in the words of the front. The draft and its files stay | done |
| `A command takes no files. Send the files in a message of their own.` | add | the notice of a slash command with files in the manager. Nothing goes out | done |

### src/ui/Roster.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Roster` | change | `Members` | done |
| `N members` under the heading | change | the count chip on the heading line | done |
| `Add` | keep | it opens the picker | done |
| `<handle>, <word>. <task>. <phrase>. Open its run.` (label) | change | `<handle>, <word>. <task>. Open its conversation.`, and `<handle>, <word>. <task>. <plain line>. Open its conversation.` for a failure | done |
| `muted` (tag) | keep | | A |
| `More for <handle>` | keep | | A |
| `Open its run` | change | `Open conversation` | A |
| `Mute`, `Unmute` | keep | | A |
| `It gets the messages of the channel again.`, `It gets no broadcast, only a message to it.` | remove | | A |
| `Seat again` | keep | a small secondary key on the row of a seat whose newest run failed or stopped, under its text, and the item of More. One click sends the task unchanged, with no dialog. Change task changes the task first | done |
| new | add | `Seat <handle> again`, the screen-reader name of the key of a row | done |
| `Continue` | add | the key in place of Seat again on the row of a seat at its limit, and an item of More before Seat again. One click goes on with the same run with more room, with no dialog, and the channel says `<by> continued <handle>`. `Continue <handle>` for a screen reader. The row shows `at its limit` with a grey light and the plain line of the limit, such as `Stopped at its turn limit`, in ink | A |
| the reason of an error in red, such as the raw error cut to one line | change | the plain line of `plainError` in ink, with the message of the provider in its tooltip. The light and the word `error` carry the red | done |
| `Its newest run stopped, so it gets no message. A new run starts with its task.` | remove | the status `error` says it | A |
| `Change its task` | change | `Change task` | A |
| `Fire` | keep | | A |
| `Its open runs stop. Its Task stays in its pool.` | remove | | A |
| `Add a member` (dialog) | change | the picker: the field `Who` with the placeholder `Who?`, the groups `On this bridge` and `Everyone else`, and the links `Advanced` and `New agent` | A |
| `Handle, such as reviewer or migrator-3` | change | `Handle`, in Advanced | A |
| `Agent`, `Task` | keep | in Advanced | A |
| `Add and start` | change | `Seat` | A |
| `The member starts a run on the queue of the pool of its agent, as you.` | remove | | A |
| new seat row | add | `<handle>` with `new seat`, the task field, `Seat`, and `Cancel` | A |
| `Seat <handle> again`, `A new task for <handle>` | change | `Change the task of <handle>`. Seat again has no dialog | done |
| `Seat again`, `Save the task` | change | `Change task` | done |
| `A new run of <handle> starts with this task, and the channel reaches it again. You can change the task first.` | remove | | A |
| `This bridge has no member.` | change | `No one has a seat yet.` with the key `Add` | A |
| `Loading the roster.` | change | `Loading the members.` | A |
| `To fire a member, drag it out of the roster, or pick Fire in its menu.` | remove | the drag target says `Fire` while a member drags | done |
| `Fire <handle>?`, `Fire <handle>` | keep | | A |
| `The open runs of <handle> in this bridge stop, and its seat gets no more messages. Its Task stays in its pool, so other bridges can still use it.` | change | `Its open runs stop, and it gets no more messages.` | A |
| `Drop here to fire` | change | `Fire` | done |
| new | add | the footer `This bridge` with turns, cost, and pages, from `usage`, for a bridge whose runs report usage. The pages are the pages of the work of the bridge, as the tab Wiki lists them, wherever its agents wrote them | done |
| `N turns`, `$N so far`, `N pages` (the figures of the foot, at `--t-control`) | add | `1 turn` and `1 page` for one. A cost below one cent reads `under $0.01 so far`, never `$0.00`, from `src/lib/cost.ts` | done |
| `Add` (the screen-reader name of the picker) | add | the picker carries the name of the key that opens it | done |
| `Mute`, `Unmute` | change | the same, with the hints `It gets only the messages that name it.` and `It gets every message again.` A closed bridge offers `Open conversation` alone. | done |
| `Back to Channel` | change | `Back to <bridge title>` | done |

### src/ui/Picker.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Who` with the placeholder `Who?` | add | the field of the picker | done |
| `On this bridge`, `Everyone else` | add | the two groups. On the new-bridge screen, On this bridge holds the agents of the seats of the form. | done |
| `N free`, `waiting for a worker` | add | the capacity of an agent, with a green or a grey light. The name stays on one line. Where the name of the agent and the word do not fit side by side, the status shrinks to its light, and the word stays in the tooltip and the accessible name | done |
| the manager, the agent of the quick chat, and the profiles of old tests in Everyone else | remove | Everyone else holds the agents that can work a seat: a pool runs it, or a worker of a pool holds it. The manager and the agent of `chat` in the settings are no workers for a bridge | done |
| `Advanced`, `New agent` | add | `Advanced` shows only in the members pane, where the picker seats on a bridge that exists | done |
| `Handle`, `Agent`, `Task`, `Seat`, `Cancel` (the full form of Advanced) | add | | done |

## 5. Screen B

### src/ui/Activity.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Activity` with the count chip | change | the chip counts the rows of the list, `1 item` and `N items` for a screen reader, so it never says 0 beside three rows. What needs you shows by its lights, and the count on the app bar, `N items need you`, counts it from the same rows: every row less the new messages, which take Done and need nobody | done |
| `Thumb up: <label>`, `Thumb down: Deny`, `Always allow` (the keys of a decision in its row) | remove | a thumb means a reaction to a result elsewhere. The row of a decision has no key: a click shows its card, which says what the action does, with Deny and the verb of the action. a and d still decide from the list. | done |
| the command of a decision under its row | change | the one line of its plan: the command or the path as code, the title of a bridge or the task of a hand-off as words | done |
| `<handle> asks: <text>` | change | the row of a question of a seat, which the front names on the seat (`question`), whatever the read mark says: the status `needs you`, without an `@operator` that opens it, and `<handle> asks you` until the page holds the entry. The main pane shows the card of the question, as the channel does, which answers in the bridge, to that member, in reply to the question. The row leaves once you answer, or the seat posts again. With a front that names no question, the row of a message of an agent to `operator`, or with the word `@operator`, after the read mark | done |
| the raw error of a failed seat, such as `model: anthropic: stream ...: POST "http://...": 400 Bad Request (Request-ID ...) {json}` | change | the plain line of `plainError()`, the words of `src/lib/runerror.ts` above, with the message of the provider in its tooltip, and in the main pane as a muted line under the plain line | done |
| `Seat again` (a dialog with the task) | change | the key `Seat again` on the row, in the main pane, and the key s, each at once with the task unchanged, as on the members. `Seat <handle> again` for a screen reader on a row | done |
| `New messages` (meta of a row) | change | the sender and an excerpt of the newest entry | B |
| `Nothing needs you. New decisions and messages land here first.` | change | `Nothing needs you.` | B |
| `Pick an item in the list to decide or to read it.` | change | `Pick an item to decide or to read it.` Where the main pane shows beside the list, it opens the item that needs you and waits longest, so the line shows only when nothing needs you | done |
| the empty main pane after a decision | change | the next item that needs you opens. When none is left, the decided card stays, settled: quiet, with `You allowed this` or the answer, and no key | B |
| `Done` | add | a small secondary key on the row of a message, under its text, and in the head of the main pane, and the key e. It clears the message for you: the read mark of its bridge moves to the message. `Done with <name>` for a screen reader on a row. A decision and a message that asks you have no Done | B |
| `at its limit` (a seat whose newest run stopped at a limit) | add | its row, after the errors: the plain line of the limit, such as `Stopped at its turn limit`, and the key `Continue`, also in the main pane, and the key c. `Continue <handle>` for a screen reader on a row | B |

### src/ui/Fleet.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Fleet` with the count chip, `New agent` | keep | | done |
| `Pools` | remove | | done |
| `N pools, N Tasks, N agents` | remove | the count chip | done |
| `Runs <agent> from the queue <intake>` | change | `Keep <n>` | done |
| `N of M ready` | change | `N ready` | done |
| `The fleet has no pool that you can see.` | change | `No agent has a worker that you can see.` | done |
| `older configuration` (tag) | change | `old setup`, with the tooltip `It takes the new setup of the agent when it starts again.` | done |
| `Checked 2 minutes ago` | remove | | B |
| `Read again` | remove | the stream keeps the fleet current | B |
| `Agents`, `Tasks` (sections) | remove | the people list grouped by bridge, then `Not on a bridge` | B |
| `You are <role>` | remove | | B |
| `N waiting for input` | change | the status `needs you` | B |
| `You can see no agent.` | change | `No agent yet.` with the key `New agent` | B |
| `A person drew this face.`, `A pattern from the name. No model drew it.` | remove | | B |
| `Display name, at most 64 characters` | change | `Name` | B |
| `Tagline, at most 140 characters` | change | `Tagline` | B |
| `A new face: an SVG file of at most 32 KB. The workbench refuses a face with a script, a link, or an image inside.` | change | the picture of the agent as the key, with a pen in its corner and the name `Change the picture of <agent>` for a screen reader, and the limit in the error | B |
| `A face holds at most 32 KB.` | change | `This face is over 32 KB. Pick a smaller SVG.` | B |
| `Use the pattern again` | change | `Use the mark`, then `Use the default picture`, because the walk read Use the mark as unclear | done |
| `Only an owner of <agent> can change its face.` | remove | the Edit key does not show | B |
| `Saved.`, `The new face is up.` | keep | | B |
| new | add | the profile: `Workers` with its chip, `Keep`, and the question mark `What is a worker` with `A worker runs the work of one agent, one seat at a time. Keep is how many it keeps ready.` | B |
| new | add | `What people liked` with its chip and `Open page`, only for an agent with a heart: an agent with none has no section | done |
| one sentence per heart, from `agents/<agent>/learned.md` | change | the parts of the entry, newest first, as the front writes them. What the agent did is the main line, and what the person asked is a muted line. Then come the note of the person and the link `Open the run` to the run pane of the bridge. An entry without a note leaves it out. | done |
| `Open the run` | add | the link of a heart to its run | done |
| new | add | `Today` with runs, cost, and decisions | B |
| new | add | `N skills`, the one line of the profile that counts them | done |
| `Find a member` | add | the field above the people list | done |
| `Not on a bridge` | add | the last group of the people list | done |
| `N awake` (a chip with a green light), with `N workers awake` for a screen reader | add | the chip shows only while a worker is awake. A green light never stands for zero, so `0 awake` never shows. | done |
| `N free`, `Keep N` (a person who is not an owner reads Keep as a number) | change | `1 worker free`, `N workers free` on the row of an agent in the people list. The picker of Add keeps `1 free`. | done |
| `Keep 0` (the placeholder of the composer of an agent with no member) | change | the reason in words: `The worker of <agent> is starting.`, `Every worker of <agent> failed. Its profile says more.`, `<agent> has no worker. Set Keep on its profile.`, or `Loading the workers.` | done |
| new | add | `This agent no longer exists.` with the key `Back to Fleet`, for the address of an agent that neither the fleet nor the profiles name | done |
| new | add | `Start a conversation with <name>.` and the tagline or the description, in an empty conversation with an agent | done |
| new | add | `No member matches “<words>”.` with the key `Clear the search`, and `N members match` for a screen reader | done |
| new | add | the gaps of the workers: `Some changes have not reached the workers of this agent yet. An admin can read why.`, with the words of the server in the fold `Details` | done |
| `<n> min` beside a sleeping worker | remove | it was the age of the read of the fleet, not the time asleep | done |
| new | add | a heart: `Liked because: <note>`, `Asked: <task>`, `Answer: <answer>`, and `Show more` and `Show less` for an answer over 240 characters | done |
| new | add | `Skills: <name>, <name>`, each a link to its page, under What it can do | done |
| `Keep 0` (the row of an agent with no worker in Not on a bridge) | remove | the row shows no words for an agent with no worker. The list holds the agents of the fleet, so a profile of the front with no pool and no run shows nowhere. | done |
| `asks before <pattern>`, `asks first` (an amber word for a rule of the profile) | change | the rule as a person reads it, in an amber line under What it can do: `Asks before git push` for `bash: git push*`, `Asks before a real Ansible run` for `ansible.playbook: check=false`, `Asks before a tool that changes things`, `Asks first when <field> is <value>`, `Asks first: <ability>`, and `Asks first`. Two patterns with one meaning make one line. The patterns sit in the tooltip. | done |
| `Tools and rules` (the list of chips) | add | an accessible name, now of the list of What it can do | done |
| the tools of a profile as chips of raw names, such as `front.pages_read` | change | `What it can do`, a section of the profile with one plain line per ability: the phrase of the tool in the catalog of `GET /v1/tools`, such as `Run shell commands`. The tools of the wiki make one line, `Read and write the wiki`, `Read the wiki`, or `Write the wiki`, and the tools of the bridges make one line, `Read and post in bridges`, `Read bridges`, or `Post in bridges`. A whole server is `Use the tools of <server>`, and `*` is `Every tool`. The raw names sit in the tooltip. `N skills` moves to the end of the heading line of the section. | done |
| `Edit` (the key of an owner on the profile) | add | | done |
| `Keep is a whole number, 0 or more.` | add | the error of the Keep field | done |
| `Remove workers`, with the dialog `Remove the workers of <agent>?`, `Every worker of <agent> stops. A seat of <agent> waits for a worker.`, and the key `Remove workers` | change | an owner only, as the danger item of the menu `More for workers` beside Keep, so no destructive key sits in plain sight | done |
| `N runs`, `$N`, `N decisions` (Today) | add | `1 run` and `1 decision` for one. If a run reports no cost, `$N so far`. A cost below one cent reads `under $0.01`, never `$0.00`, from `src/lib/cost.ts`. | done |

### src/ui/RunPane.tsx and src/ui/Conversation.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Roster` (back) | change | `Members` | done |
| `Stop`, `Stop the run of <who>?`, `Stop the run` | change | `Stop`, `Stop <who>?`, `Stop` | B |
| `The run stops now. The seat stays on the roster, and a message to it starts a new turn.` | change | `The seat stays. A message starts a new turn.` | B |
| `The run` | keep | | B |
| ` · started <time>` | change | the clock time alone, without the middle dot | B |
| `Files`, `What it did`, `N steps` | change | the tabs `Chat`, `Run`, `Files` of the member | B |
| `Error`, `Done`, `No result` | keep | | B |
| the whole error of a failed run, in large red text above the result | change | the plain line of `plainError` under the status, the message of the provider as a muted line, `Seat again` for the newest run of a seat, and the whole error behind the quiet key `Details`, in monospace. A stopped run says it in its status and has no line | done |
| `front.pages_write`, `front.bridge_post`, `front.bridge_read` (the steps of What it did) | change | the words of `stepWords`, such as `Wrote k3s/monitoring/manifests/prometheusrule.md`, `Posted to the bridge`, and `Read the channel`, with the target from the transcript | done |
| the tab Files of a run that changed no file: an empty pane with a stray rule | change | `No files changed in this run.` | done |
| new | add | `Wiki pages` with its count chip (`1 page`, `N pages` for a screen reader), the pages that the run wrote, each a link to the page in the Wiki. The count of the tab Files counts them too | done |
| `Close the file` | keep | | B |
| `Loading the file.`, `The file does not exist now.` | keep | | B |
| `This file is not text, or it is too large to show here.` | change | `This file is not text, or it is too large to show.` | B |
| `The view shows the first part of the file.` | change | `The first part of the file.` | B |
| `Was this useful?` | remove | the reaction chips say it | B |
| `Thumb up: accept the result`, `Thumb down: reject the result` | keep | | B |
| `What made this useful? The note is optional.` | change | `What made this useful?` with `Optional` | B |
| `Your heart is recorded.`, `Your thumb is recorded.` | change | `Heart recorded.`, `Thumb recorded.` | B |
| `Took N steps` | keep | | B |
| `Ran "<command>"`, `Created`, `Edited`, `Removed`, `Used <tool>` | keep | | B |
| `Used bridge_open` and the other tools of the front | change | what happened, in plain words: `Opened the bridge <title>`, a link to the bridge with its title, `Closed the bridge <title>`, `Posted to the bridge <title>`, `Read the channel`, `Wrote <path>` and `Read <path>`, the path a link once the call reached it, `Handed off a task to <agent>`, and `Read the fleet`, the words of `stepWords` that What it did of the run also shows. While the call runs: `Opening the bridge`, `Writing <path>`, and so on. A call that failed: `Did not open the bridge`, `Did not write <path>`, with no `Error` after it. Any other tool takes the words of `stepWords`, such as `Searched the wiki for "<words>"` | done |
| a step line before the card of its decision, such as `Used bridge_open` | change | a call that waits for a decision makes no step line: the card, or `Asked for a decision`, says what it asks. Its step line follows the decision, at the time of its result. | done |
| `Asked you a question`, `Asked for permission` | change | `Asked you`, `Asked for a decision` | done |
| `<who> allowed it`, `<who> denied it` | keep | | done |
| `The turn failed` | keep | | done |
| `The turn ended` | remove | the answer above it says it. A turn that failed keeps its line. | done |
| `Took N steps` (a fold of three or more steps) | keep | | done |
| `Load earlier messages` | change | `Earlier messages` | B |
| `Loading the conversation.` | keep | | B |
| new | add | `This run is gone.`, in place of a conversation whose run the fleet does not hold, as after a worker that held it was replaced. A read that the page starts on its own never raises the notice. The sentence of another failure shows in the same place. | done |
| new | add | `This read wakes the worker.`, one short line in place while the worker that holds the run sleeps. It shows on the tabs Run and Files of a seat and in the run pane of a bridge. The tab reads the run because the person opened it, and the line goes once the worker is awake. The Chat tab reads nothing of a worker that sleeps, so it needs no such line. The line is the one sentence of explanation of these views: without it, a worker that wakes for a read looks like a fault. | done |
| the start time of a run beside its status, which read as its end | change | `started <time>`, and `started <time>, ended <time>` for a run that ended | done |
| `[bridge "<title>" <id>] @<handle> from operator: ` and `Answer to your question in entry <n>: ` in the conversation of a run | remove | the words of the sender alone, under `You` or the handle of the seat that sent them | done |

### src/ui/Member.tsx and src/ui/Board.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `<handle> has no seat on this bridge, or no run yet.` | keep | | B |
| `Loading the member.` | keep | | B |
| `Board` | keep | | done |
| `The board shows one light per member. It comes with the next stage.` | remove | the board | done |
| `Statuses of <bridge>` (the strip of a group of the board) | add | an accessible name. Each key of the strip says its count and its status, such as `2 working`, with its light. | done |
| `Messages with <handle>` (the log of a seat), `Conversation with <handle>` (its tabs) | add | accessible names | done |
| `Profile of <agent>, <status>` (the mark at the head of a conversation) | add | the name of the link to the profile, which a window narrower than three panes keeps out of sight | done |
| `Profile` (the first item of the More menu of a seat) | add | a narrow window hides the mark, so the menu reaches the profile there | done |
| `stopped` (a seat whose newest run was canceled) | add | the status beside `error`, with a grey light, and the key `Seat again` | done |
| `at its limit` (a seat whose newest run stopped at a limit) | add | the status with a grey light over the composer, the plain line that names the limit, such as `Stopped at its turn limit`, and the key `Continue`. The More menu holds Continue before Seat again | B |
| the reason of the bar over the composer of a stopped seat: a limit of the result, or the whole error, cut | change | the plain line of a failure, in ink, with the message of the provider in its tooltip, and the key `Seat again`, which acts at once. A stopped seat shows only its status and the key | done |
| `Back to Fleet` (a seat that a bridge opened) | change | `Back to the members of <bridge title>`. The Fleet place keeps `Back to Fleet`. | done |

## 6. Screen C

### src/ui/Pages.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Pages` and its line `The wiki of the fleet. Agents write it, and people read it.` | change | `Wiki` with the count chip | done |
| `New` | keep | | done |
| `Search the wiki` | keep | | C |
| `<name> · <time>` (row meta) | change | `<name>` and `14 min`, with a gap and no dot | C |
| the path of a folder as the head of its group, such as `bridges/01m5h96ejx8yh5fqkg` | change | the title of the bridge for `bridges/<id>`, such as `Harden the lab hosts`, and the name of the agent for `agents/<agent>`, such as `docs-scribe`, with the path in the tooltip. A bridge that the page does not know keeps the path. | done |
| `No page holds those words.` | change | `No page holds those words. Try fewer words.` | C |
| `The search read part of the wiki. Use more words to find the rest.` | change | `Partial: more words find the rest.` | C |
| `The wiki has no page.` | change | `The wiki is empty.` with the key `New page` | C |
| `Loading the pages.`, `Loading the page.`, `Loading the history.` | keep | | C |
| `No page <path> is here.`, `Create <path>` | keep | | C |
| `History`, `Edit` | keep | | done |
| `This is version N, by <by>, <time>. Read the current page.` | change | `Version N, by <by>, 14 min.` and the link `Current page` | C |
| `<by> saved a newer version. The page shows it.` | change | `<by> saved a newer version.` | C |
| `Version N by <by>, 3 hours ago: <summary>` | change | `Version N`, `<by>`, `3 h`, and the summary, as parts with gaps | C |
| `History` (heading) | change | `History of <page>` | done |
| `Version N, the current one: <title>` | change | `Version N`, with the chip `current` | C |
| `Removed` | keep | | C |
| `New page`, `Edit` (heading) | change | `New page`, `Edit <page>`, where the page is its title, such as `Edit Upgrade k3s on jucs-k3s`, and its name only without a title. The back link takes the same name. | done |
| `<by> saved this page while you edited it, <time>. Your text is still here, and nothing is lost.` | change | `<by> saved this page while you edited it. Your text is still here.` | C |
| `See their version` | keep | | C |
| `Drop my text and take theirs`, `Save mine over theirs` | change | `Take theirs`, `Keep mine` | C |
| `Path, such as runbooks/deploy.md. The page adds .md when you leave it out.` | change | `Name` with the placeholder `runbooks/deploy`. A space between words becomes a hyphen, and the hint `The page will be <path>.` names the path | done |
| `The page will be <path>.` | keep | | C |
| `Markdown`, `What changed, in a few words` | change | `Text`, `What changed` | C |
| `Cancel`, `Create the page`, `Save` | change | `Cancel`, `Create page`, `Save` | C |
| `Cmd or Ctrl+Enter saves. A save that meets a newer version stops and asks you.` | change | `Ctrl+Enter` beside the key, `⌘+Enter` on a Mac, and no key on a touch screen, from `keyWords` and `useCoarse` of the composer | done |
| `A page with this path exists already. Pick another path, or edit that page.` | change | `A page with this name exists already. Pick another name, or edit that page.`, under the field Name, with the link `Edit <path>` | done |
| `the fleet token`, `run <id>` (writers) | keep | | C |

### src/ui/Manager.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Manager` | keep | | done |
| `It reads the fleet, opens bridges, and decides only what you delegate.` | remove | | done |
| `New conversation` | keep | | done |
| `Where the manager is set up` (the name of the question mark) and `The setting workbench.bossmode.manager names the agent of the manager.` | add | the definition behind the question mark of `No manager is set up.` | done |
| `waking` with `Waking the manager` in the tooltip, `working` with the phrase of the step | add | the status of an answer on its way | done |
| the thread | change | the conversation of a run that the member and the agent screens show, so its words are the words of `src/ui/Conversation.tsx` | done |
| `This workbench has no manager. An operator sets the profile of the manager in workbench.bossmode.manager.` | change | `No manager is set up.` with a question mark that names `workbench.bossmode.manager` | C |
| `Ask the manager about the fleet, or ask it to open a bridge. The first answer takes a few seconds, because its Task wakes for it.` | change | `Ask about the fleet, or ask for a bridge.` | C |
| `Waking the manager. Its Task sleeps between messages, so the first answer takes a few seconds.` | change | the status `waking` with a grey light | C |
| `The manager works: <phrase>.`, `The manager works on an answer.` | change | the status `working` with the phrase beside it | C |
| `This conversation stopped. Your next message starts a new one.` | change | `Stopped. Your next message starts a new conversation.` | C |
| `Ask the manager` (placeholder) | keep | | C |
| `Attached files` (a list) | add | the files of a sent message, each by its name and its size, under the text of an entry, a message of a thread, and a message of a conversation. A file opens nothing, because the workspace of the run holds the bytes | done |
| `Message to the manager` (label) | keep | | C |

### src/ui/NewBridge.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Open a bridge` and its line `One job, split into tasks, with one agent on each.` | change | `Open a bridge`, and the one question first: `What is the job?` | C |
| `Title`, `Goal` | change | `Goal` first, and `Title` in Advanced, filled from the goal | C |
| `Members`, `Handle`, `Agent`, `Task`, `Add a member`, `Remove member N` | change | the picker of screen A, then `Seat` | C |
| `Placement` with `Queue. Each member runs on a worker of the pool of its agent.` and `Spawn. The manager seats each member in a child Task of its own, and its budget bounds the whole bridge.` | change | a choice with two options under Advanced: `Keep warm workers` (the default) and `Fresh sandbox per seat`. It is a choice of the deployer more than of a person, so the first view holds only the job and the seats. A placement that cannot open, a fresh sandbox without a manager, opens Advanced with its reason. | done |
| `What the manager can do here` and its four rows | change | in Advanced, with the words of screen A | C |
| `Each member starts a run as you. A bridge spends through the budgets of the pools of its members.` | remove | | C |
| `Cancel`, `Open the bridge` | change | `Cancel`, `Open bridge` | done |
| `Open bridge` while the manager splits the job | change | `Ask the manager`: the key sends the job to the conversation of the manager, which plans the seats there, and the person lands in that conversation with the job in view. The message reads as the words of the person, the job first: `<job>`, a blank line, and `Please open a bridge for this and pick the seats.`, then `Give each seat a fresh sandbox (spawn).` or `Use the warm workers (queue).` only when the placement is not the default of the deployment, and `Call it "<title>".` only when the person gave a title. `Open bridge` stays for the path where the person picks the seats. | done |
| `Seats`, `Pick the seats`, `Let the manager split it` | add | if the settings name a manager, the choice of who seats the bridge | done |
| `Add a seat` (the heading of the seats beside that choice), `Add` (the key that opens the picker of the members pane) | change | `Add a seat`, the key that opens the picker, under the choice `Seats`, with no heading of its own. Without a manager, the heading `Seats` stands above the rows and the key. | done |
| `Placement`, `Title`, `Caps`, `Most messages`, `Most messages a minute`, `Most messages between two members` | add | Title, Placement, and Caps in Advanced | done |
| `Most turns` | add | the cap of the turns of every run of the bridge together, after Most messages in Caps. Empty keeps the default of the workbench | C |
| `Write a whole number.` | add | the error of a cap | done |
| `The bridge needs a title.`, `The bridge needs a goal.` | change | `Write the goal of the bridge.` | C |
| `Member N needs a handle of lower-case letters, digits, dots, dashes, or underscores.` | change | the reason of `handleReason()` | C |
| `The handle <h> is there twice.` | change | `<h> has a seat on this bridge already. Pick another handle.` | C |
| `Member N needs an agent.`, `Member N needs a task.` | keep | | C |
| `A spawn bridge needs a manager, and this workbench has none.` | change | `A fresh sandbox per seat needs a manager. Pick keep warm workers, or set up a manager.` | C |
| `Keep warm workers`, `Fresh sandbox per seat` | add | the lines `Each seat starts at once on a worker that its agent keeps.` and `The manager starts a new worker for each seat, so a seat starts later.` | done |
| `Caps` | add | the question mark `What the caps are` with `Each cap counts the whole bridge. The bridge stops at a cap until you raise it. An empty field keeps the usual cap of the server.`, and the placeholder `Usual` in each cap | done |
| `Cancel` on a filled form | add | the dialog `Throw away this bridge?` with `The job and the seats that you wrote go. No bridge opens.` and the key `Throw away` | done |
| Caps and `What the manager can do here` while the manager splits the job | remove | the manager picks them when it opens the bridge | done |

### src/ui/NewAgent.tsx, src/ui/Appearance.tsx, src/ui/Skills.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `New agent` | keep | | done |
| `A new agent starts with a name and the number of workers it keeps. The form comes with the next stage.` | remove | the form: `Name` first, then `How many can work at once?` with 2 as the default, and Advanced | done |
| `Name`, `What it handles`, `How many can work at once?`, `Template`, `Skills` | add | the fields before Advanced. The skills sit outside Advanced. | done |
| `Model`, `Effort`, `Default`, `Budget of a run`, `Turns`, `Tokens`, `Cost in dollars` | add | in Advanced | done |
| `Context compaction`, `Compact at, in tokens`, `Compaction model`, `Rules`, `Ask before`, `Never run`, `Time zone` | add | in Advanced | done |
| `Create agent`, `Preview`, `saved`, `Open <name>`, `Workers`, `N workers start when you create the agent.` | add | | done |
| `Write the name of the agent.`, `A name holds letters, digits, dots, dashes, or underscores, at most 64.`, `An agent named <name> exists. Pick another name.`, `Pick a number from 1 to 32.`, `Write a whole number.`, `Write an amount in dollars, such as 2.50.`, `Write a whole number of tokens, at least 1024.` | add | the errors, each at the moment the person hits it | done |
| `Appearance`, `Theme`, `Match the system`, `Light`, `Graphite` | keep | | C |
| `<name> sets the accent <hex>.`, `The accent is <hex>.` | remove | Appearance holds the theme of the person only, and the accent belongs to the deployment | done |
| `Skills` with the count chip, `Imported`, `Local`, `<server>`, `Tools`, `Built in` | keep | | done |
| `Agents that can load it` with the count chip | keep | for a skill. A tool says `Agents that can use it`, and names the agents whose tool list gives it. A tool leads with its plain phrase in the list and as its title, with its name as code. | done |
| `Pick a skill or a tool in the list.` | keep | where two panes show, the place opens the first skill of the list, else its first tool, so this line shows only while the catalog loads. With nothing in the list, the main pane stays empty, because the list says `No skill yet.` | done |
| the front matter of a skill as chips, such as `user-invocable true`, `argument-hint [task]`, and `arguments task` | change | how a person calls the skill, as one line of code under its description, such as `/proxmox-ops [task]`, and nothing else of the front matter. A skill that only a model loads shows no such line. | done |
| the details pane of Skills with nothing picked, the list of the imported skills | change | the details pane holds `Add skill` alone. It lists the imported skills only beside the chooser of Add skill, where an install can replace one. With a skill open, it holds its keys alone: `Copy /<name>` and `Remove`. | done |
| `This skill is not here. It can be removed, or it was renamed.` | keep | | done |
| `No skill yet. Add one from a marketplace, an address, or a SKILL.md.` | change | `No skill yet.` with the key `Add skill` | C |
| `Copy /<name>`, `Copied /<name>` | keep | | done |
| `Remove`, `Remove <name>?`, `Remove <name>` | keep | | done |
| `No agent can load it after this.` | keep | | done |
| new | add | `Add skill` and its chooser: `From a marketplace`, `From an address`, `Paste a SKILL.md`, `Upload files`, then the preview and `Install` | done |
| `Find a skill` (with the name `Find a skill or a tool`), `No skill holds those words.`, `Loading the skill.`, `Loading the skills.` | add | | done |
| `Address`, `Preview`, `Pick files`, `Pick a folder`, `SKILL.md`, `Files`, `Close` | add | the keys and fields of the chooser | done |
| `Loading the marketplaces.`, `No marketplace is set up.`, `Loading the preview.` | add | | done |
| `An installed skill is a set of instructions that an agent loads when its work needs them. Every agent can load it, unless the list of skills of the agent leaves it out.` | add | behind the question mark `What an install does` beside the name of the preview, because the chrome never explains. It said profile before. | done |
| `replaces <name>` (a grey light), `blocks` (red), `note` (grey) | add | the status words of a preview and its problems | done |
| `Replace <name>` | add | the key after a 409 for the name of an imported skill. A 409 for a source that changed shows its reason, and a new preview. | done |
| `imported`, `local`, `built in`, and the name of a server | add | the origin of a skill or a tool | done |
| `Write an https address of a SKILL.md, of the folder of a skill, or of a zip file.`, `Pick at most 64 files.` | add | the errors of the address and the upload | done |

## 7. The quick chat and the live answer

### src/ui/Chat.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| new | add | `Chat` with the count chip, `1 chat` and `N chats` for a screen reader | done |
| new | add | `New`, the key of a new chat on the header of the list, the word of the other lists | done |
| new | add | `Find a chat`, the field above the history | done |
| new | add | `Today`, `Yesterday`, and the date, such as `Monday, October 19`, the quiet heading of each day of the history | done |
| new | add | a row of the history: the title of the run, the status of the run, and `since()`, such as `25 min`. The status is a light with its word: `working`, `waiting for a worker`, `needs you`, `answered`, `closed` (for a conversation of a replaced worker, with a muted title), `ended`, `failed`, or `stopped`. `ready` read as a call for the person, so a list of conversations never says it. The name for a screen reader says the time in words, such as `3 days ago`. A run without a title shows the start of its first message, else `Chat`. | done |
| new | add | `Loading the chats.`, `No chat holds those words.` | done |
| new | add | `No chat yet.` with the key `New chat` | done |
| the key `New chat` under `No chat yet.` | remove | the key `New` of the header starts a chat, and the main pane already holds a new chat, so the empty list holds no second key | done |
| new | add | `New chat`, the title of a chat before its first message | done |
| the mark of the agent beside `New chat` | remove | the header of a new chat holds its title alone. The mark of a chat links to This chat, which a new chat does not have yet. | done |
| the picks above the composer | change | a new chat is a question first: the composer, and right above it one quiet line that opens the picks, such as `Can use files, memory, the time, the wiki, and 2 skills`. The line names each tool by a short noun, counts the tools without one as `N more tools`, and counts the skills. It reads `Tools and skills` when the page cannot tell the tools, and `Loading the tools.` while they load. The picks open when the person turns every tool off. | done |
| new | add | `Tools`, `Skills`, the two headings of the picks. Each has the count chip of the picks that are on, with `N of M` for a screen reader. | done |
| the picks of `Tools` from the catalog of the front | change | `Tools` holds the tool list of the profile of the agent: each tool of the catalog that an entry names, and an entry that names none, such as `front.pages_*`. Every row of the profile starts on. | done |
| a pick by its raw name, such as `front.pages_list` | change | each row of `Tools` in plain words, as the profile says it: the phrase of the catalog, such as `Read and change files in the workspace`, and one row for the tools of the wiki, `Read and write the wiki`, and one for the tools of the bridges. The raw names sit in the tooltip. A row of `Skills` holds the name of the skill and its description below it. | done |
| `More tools` | remove | the other tools of the catalog follow the tools of the profile in the same list, below a line, and start off. Its count chip said 0 beside eight tools. `spawn_task`, `await_task`, `propose_agent`, and `ask_user` never start on, so they sit there. | done |
| new | add | `Find a tool`, `Find a skill`, the fields of a row of picks that holds more than twelve | done |
| new | add | `Loading the tools.`, while the picks wait for the catalogs | done |
| new | add | `A chat needs at least one tool. Pick one.`, the error of the picks with every tool off. An empty tool list gives a run every tool. | done |
| new | add | `Ask a question` (placeholder), `Message to <agent>` (label) | done |
| new | add | `working`, or `waiting for a worker`, with the phrase of the step, the status of an answer on its way | done |
| new | add | `Stopped. Your next message starts a new chat.` | done |
| new | add | `This chat`, the heading of the details, and `This chat, <status>`, the name of the mark that opens it | done |
| new | add | `Tools`, `Skills` with the count chip, `1 tool` and `N tools`, `1 skill` and `N skills` for a screen reader | done |
| the tools and the skills of This chat as chips of raw names | change | `What it can do`, as on the profile of an agent: one plain line per ability, the tools of the wiki as one line, the raw names in the tooltip, and `for this chat` on a tool that the picks gave. The skills follow in one line, such as `2 skills: notes and plan`, or `5 skills: a, b, and 3 more`. | done |
| `Tools 0` (This chat of a chat whose picks the page cannot tell) | remove | `Tools` names the tools that the chat started with. They come from the resolved profile of the run, the picks of the tab, or the first event of the run. Else they are the list of the profile with the tools for this chat. The section leaves out where the page cannot tell. | done |
| new | add | `for this chat`, the quiet word on the chip of a tool that the picks gave beyond the list of the agent | done |
| new | add | `Model`, with the model of the resolved profile. It shows only for a run object that carries it. | done |
| new | add | `Usage`, with `N turns`, `N tokens`, and `$N`, and `so far` while the run works. `1 turn` and `1 token` for one. A cost below one cent reads `under $0.01`, never `$0.00`. | done |
| new | add | `No quick chat is set up.` with the question mark `Where the quick chat is set up` and `The setting workbench.bossmode.chat names the agent of the quick chat.` | done |
| `Rename`, `Save as agent` | remove | the backend has no route that sets the title of a run, and the new-agent screen takes no run to start from | done |

### src/ui/Live.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| new | add | `Working: <tool>`, a quiet line while the model calls a tool, without the prefix `front.`. When the model call ends, it goes. | done |
| new | add | `Live view is busy`, a quiet line while the run has as many live clients as it takes, and the view reads the run with its poll | done |
| new | add | the pending answer: the face and the name of the agent, and the text as the model writes it, with no clock time | done |

### src/ui/Profile.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| new | add | `More for workers`, the name of the menu key of the section of the workers, for an owner | done |

## 8. The Routines place

The words of `docs/ROUTINES.md` of the kernel hold here. A routine
rehearses, a person signs it off, and a ticket that the world rejects comes
back sent back. These words never show: procedure, rung, shadow, decider,
calibration, receipt, template, hole, memory, compile, and matched. The
column Now names the string of the approved boards where one changed.

### src/ui/Routines.tsx: the list

| Now | Verdict | New text | Who |
|---|---|---|---|
| new | add | `Routines` with the count chip of the routines that are not retired, and `1 routine` or `N routines` for a screen reader | done |
| new | add | `N live`, a chip with a green light, and `1 routine live` or `N routines live` for a screen reader | done |
| new | add | `Find a routine`, the field above the list | done |
| new | add | the heads of the groups, each with its count chip. `Needs you` comes first, with an amber chip. Then come `Live`, `Rehearsing`, `Proposed`, and `Paused`. | done |
| new | add | `Retired` with its count chip, the toggle of the last group | done |
| new | add | the statuses of a routine, each a light with its word: `needs you` (amber, breathes), `live` (green), `rehearsing`, `proposed`, and `paused` (grey), and `retired` (grey, struck) | done |
| new | add | the meta line of a row. A routine that needs you says `triage, rehearsed 1,480 tickets`. A live one says `identity-desk, 96 this week`. A rehearsing one says `triage, 84% agreed over 150 tickets`. A proposed, paused, or retired one says the agent and `since()`, such as `triage, 2 d`. | done |
| `triage, from 14 tickets` (a proposed row of the board) | change | `triage, 2 d`, the time of the proposal. The card of the routine says `Proposed from 14 tickets`, so the number shows once. | done |
| `triage, signed off just now` (a row of the board) | change | `triage, 0 this week`, the meta of every live row. The quiet card says when. | done |
| new | add | `Loading the routines.`, `No routine yet.`, `No routine holds those words.`, `Pick a routine.` | done |
| new | add | `Routines are off.` with the question mark `Where routines are turned on` and `The setting workbench.routines.enabled turns them on. The server keeps them on its bus, which must be nats or mem.`, on a front that answers 404 to the list | done |
| `The setting workbench.routines.enabled turns them on. The server keeps them on its bus, which must be nats or mem.` | change | `An admin turns routines on in the setup of the server, with the setting workbench.routines.enabled.` The definition opens under the line, in the width of the list, so a narrow list never cuts it. | done |
| `Routines are off.` in the main pane beside the list | change | `A routine does work that an agent repeats, in the same steps and without the model, once a person signs it off.`, so the two panes never say the same. A routine address says `This routine does not show while routines are off.`, and `Routines are off.` where the main pane is the only pane. After the 404, the page asks the server nothing more until it loads again. | done |

### src/ui/Routines.tsx: a routine

| Now | Verdict | New text | Who |
|---|---|---|---|
| new | add | the title of a routine from its name: `acknowledge-a-new-ticket` is `Acknowledge a new ticket`, and a short word such as VPN keeps its capitals | done |
| new | add | `Steps`, `Evidence`, `Runbook`, the tabs, with the title of the routine as the name of the tab list | done |
| new | add | `More`, with `Pause`, `Resume`, and `Retire` as the moves allow. A window that hides the details pane adds the name of the agent. | done |
| new | add | `Retire <title>?`, `A retired routine stays retired.`, and the keys `Cancel` and `Retire` | done |
| new | add | `Loading the routine.`, `This routine is not here. It was removed, or you cannot see it.` | done |
| new | add | `This routine changed. Read it again.`, a quiet line above the routine after a move that met a newer version or another standing. The page reads the routine again, and shows no notice. | done |
| `A routine of triage. Proposed 11 Oct from 212 tickets.` (the line under the header) | remove | the agent is in the details pane, and Made from is on the Evidence tab | done |
| `Needs your sign-off` | keep | `Needs a sign-off` for a person who does not own the agent, who gets no key | done |
| `Triage rehearsed this routine on 1,480 tickets over 12 days. It still handed each ticket to the agent, and the two were compared.` | remove | the row says the size of the rehearsal, and the Evidence tab says the rest | done |
| `97.6%` `agreed with the agent`, `48` `handed to the agent`, `0` `sent back by a requester` | change | `agreed with the agent`, `handed to the agent`, `sent back`, the three figures of the card | done |
| `97.6%` (the first figure of the card) | change | `97.6% of 1,432`: the share, and the tickets that the routine would have acted on, so the sample shows beside the share | done |
| `Signed off, it handles these tickets on its own. The agent still checks 1 in 20.` | remove | the chrome never explains | done |
| `Note` | keep | the field of the decision card, with the placeholder `Optional` | done |
| `Not yet`, `Sign off` | keep | the two keys of the card. Sign off is the primary key. | done |
| `Kept for later` and `It stays under Needs you, and triage keeps rehearsing.` | change | `Kept for later` alone, the quiet line that the card turns into after Not yet, for this visit of the routine. Not yet sends nothing, and the row keeps `needs you`. | done |
| `Signed off` and `By you, just now. Live from the next ticket, with the agent checking 1 in 20.` | change | `Signed off`, a quiet card with `By you, today.` or `By grace, Oct 2.`, and the note of the sign-off | done |
| new | add | `Proposed from N tickets`, the card of a proposed routine, with the keys `Retire` and `Rehearse` | done |
| `Steps` with a count chip | change | `Steps` alone. The numbers of the steps give the count. | done |
| new | add | the words of a step: the method of its call, such as `Add labels`, or the tool, with the answers that it uses as slots, and the tool as meta | done |
| `What it decides` with a count chip, and `Question`, `Answers`, `Acts when` | change | `What it decides` alone, with the same columns | done |
| the whole instructions of a question in the column Question | change | the first sentence, cut at a word past 80 characters with `…`. The question mark `The whole question` beside it holds the rest, and so does the tooltip. The choices come first by name, then the yes or no questions. | done |
| `Under those, the agent decides, with the answers of the routine in hand.` | change | behind the question mark `When it is not sure`: `When an answer is under its mark, the agent handles the ticket, with the answers of the routine in hand.` | done |
| `85% sure`, `95% sure it is no` | keep | and `, not other` for an answer that keeps the routine from acting, or `always` for a question without a mark | done |
| `Afterward` | keep | the check: the read, such as `Get issue`, then `holds` and `and not` with the strings as slots, and a hole as `…` | done |
| `Made from` on the Steps tab | remove | it lives on the Evidence tab only | done |

### src/ui/RoutineEvidence.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Rehearsal` with the chips `12 days` and `1,480 tickets` | change | `Rehearsal` alone. The axis gives the days, and the row of the list gives the tickets. | done |
| `Triage handled every ticket. The routine answered beside it, and the two were compared.` | remove | | done |
| `agreed with the agent`, `disagreed`, `handed to the agent` with their totals | keep | the legend, and `<day>: N agreed, N disagreed, N handed to the agent` in the tooltip of a bar | done |
| `Of the 1,432 tickets it would have acted on, it agreed on 97.6%.` | remove | the figure is on the card of the Steps tab | done |
| new | add | `Rehearsal per day` with `Day` and the three words, the table of the chart for a screen reader | done |
| `Past tickets` with a count chip, and `212 of 212 past tickets matched` | change | `Past tickets` alone, and `212 of 212 past tickets, handled the same way` | done |
| `Open the tickets` | remove | the replay of the workbench keeps no list of the past tickets. The key comes back with a later change that adds the list. | done |
| `How sure it was` with the question mark `How sureness is measured` | change | the question mark `How it counts` with `Each answer of the routine comes with how sure it was. Each row counts the tickets at that level, and how often the agent chose the same answer.` | done |
| `It said`, `Tickets`, `It was right`, `90% sure or more`, `85 to 90% sure`, `under 85% sure`, `98.4% of the time`, `handed to the agent` | change | `95% sure or more`, `85% to 95% sure`, and `under 85% sure`, with a percent at each end of a band. A band without a ticket stays out, and the bands under the mark join in the row `handed to the agent`. The question heads its rows where the routine has more than one. | done |
| `Where it disagreed` with its count chip, and `Ticket`, `The routine said`, `The agent chose`, `Afterward` | keep | `91% sure` beside what it said, and `none` where the agent chose nothing | done |
| `requester accepted`, `a person relabeled it identity` | change | the verification of the receipt of the run: `accepted`, `checked`, `sent back`, or `no answer yet` | done |
| `Open all 35` | change | `Show all`, then `Show fewer`, after the five newest | done |
| `None of the 1,397 tickets where both agreed came back from a requester.` | change | `Sent back` with its count chip. A count above zero adds `N where it acted` and `N where it agreed with the agent`. A routine that never ran beside the agent shows no Sent back. | done |
| `Tickets that triage handled between 14 Sep and 21 Oct, each accepted by its requester.` with `Open the tickets` | change | `Made from` with `212 tickets of triage, Sep 14 to Oct 10` and `Proposed by fw routine propose` | done |
| new | add | `Loading the evidence.` | done |

### src/ui/Routines.tsx: the runbook

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Signed off by you, 23 Oct`, `Live since today, the agent checks 1 in 20`, `Rehearsed 1,480 tickets, 97.6% agreed` | remove | the page of the wiki holds what the front writes | done |
| new | add | `Not yet signed off` above the runbook that the page renders before a sign-off, and `Not signed off` for a retired routine | done |
| new | add | the runbook that the page renders: `What it decides`, `Steps`, `Afterward`, and `Where it comes from`, in the words of the Steps tab | done |
| `Open in wiki` | keep | | done |
| `Propose to Confluence`, `In Confluence`, `A runbook disagrees`, `Open the 40 tickets`, `Propose a change` | remove | Confluence is a later change | done |
| new | add | `Loading the runbook.`, and `Runbook of <title>` for a screen reader | done |

### src/ui/Routines.tsx: the week of the agent

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Triage` with the chip `agent`, and `Profile` | keep | the name of the face of the agent | done |
| `Routines: 4 live, 1 rehearsing, 1 proposed` | remove | the list says it | done |
| `This week` with the chip `1,912 tickets` | change | `This week` with `1,912` in the chip, and `1,912 tickets` for a screen reader | done |
| `by routines`, `by the agent`, `by a person` | change | `by routines`, `by the agent`, `with a person`, the words of the summary | done |
| `Per ticket` with `by a routine`, `by the agent`, and `7 min by a person, on average` | change | `Per ticket` with `by a routine` and `by the agent`. The summary has no time of a person. | done |
| `Sent back` with its chip and `7 of 1,912 tickets came back from a requester this week, all handled by the agent or a person.` | change | `Sent back` with its chip | done |
| `$0.001` `by a routine`, `$0.02` `by the agent` | keep | the averages of the summary as they come, two decimals from a cent and the first digit that counts below it | done |
| `Signed off by` with the names of people | remove | who signed a routine off lives on the routine | done |
| `Proposed by agents` and `Open in Confluence` | remove | Confluence is a later change | done |
| new | add | `Loading the week.` | done |

## 9. The Duties place, the second wave

The rule of the owner holds for every string: a person never writes cron,
a regular expression, a template, or code. A schedule, an event, and a
check are words with a readback. These words never show: cron, regex,
template, payload, webhook, and JSON. The one exception is Add a place:
another app calls its setting an incoming webhook, a webhook, or a JSON
post, so the line of a kind and its question mark use those words, and the
person finds the setting there. A word in brackets, such as `<agent>`,
stands for a value.

### src/ui/DutyEditor.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| the placeholder `0.50` of `The most a run can cost` | change | `Required, such as 0.50`, so nobody reads a default amount | done |
| `Catch up a missed time` for a start by an event or by another app | remove | it shows for a schedule only. `If the last run still works` stays | done |
| a name that ends on a joining word, such as `list-the-new-helpdesk-tickets-in` | change | the name ends on a word that carries the meaning: `list-the-new-helpdesk-tickets` | done |
| the header `Everyone else` over the only group of the picker of Who | remove | a lone group has no header | done |
| new | add | `On a schedule`, `When something happens`, the choice of When, with `What starts the duty` for a screen reader | done |
| new | add | `What happens` with `Pick what happens` and the events in words: `When a bridge closes`, `When a run of an agent fails`, `When a question waits too long`, `When a page changes`, `When a routine is ready`, `When a cap is reached`, and `When something happens in the fleet` for a kind that the page does not know | done |
| new | add | `Of the agent` with `Any agent`, `Waits longer than` with `15 minutes` to `a day`, and `Pages under` with the placeholder `Every page` | done |
| new | add | the readback of an event: `When a bridge of <agent> closes.`, `When a run of <agent> fails.`, `When a question waits longer than <span>.`, `When a page under <path> changes.`, `When a routine of <agent> is ready.` | done |
| new | add | `Only between two dates`, `First day`, `Last day`, and the errors `The last day comes before the first day.` and `Pick what starts the duty.` | done |
| new | add | `Ask the agent`, `Post in a bridge`, `Open a bridge from a playbook`, and `Ask the manager`, the choice of What, with `What the duty does` for a screen reader | done |
| new | add | `Bridge` with `Pick a bridge`, `No bridge is open`, `<title>, closed`, and `A bridge that you cannot see`. `Send to` with a handle per seat, and `Everyone on the bridge reads it.`, `1 member reads it.`, or `<n> members read it.` | done |
| new | add | `Message` with the placeholder `Review what changed since [The last run].`, and the errors `Pick the bridge.` and `Write the message for the bridge.` | done |
| new | add | `Goal` with the placeholder `The goal of the playbook`, and the error `Pick a playbook.` | done |
| new | add | `The names new and options are kept for the page. Pick another name.` under Name, as the person types | done |
| new | add | `Ask the manager` with the placeholder `Check the backups of [Today's date] and tell me what failed.`, and the error `Write what the manager does.` | done |
| `[What happened]` with no chip | change | the chip `What happened`, once an event starts the duty | done |
| `The duty cannot save yet.` above Save duty | change | the same box at the top of the form, for a problem of the front with no field. A problem of a field shows beside the field, with the text after its path. | done |
| `The most a run can cost`, `Most turns`, and `The most per day` for every action | change | they show for Ask the agent and Ask the manager only. Post in a bridge shows `A post spends nothing of its own. The seats of the bridge spend from their own budgets.` in their place. Open a bridge from a playbook shows `The most turns of the bridge` with the placeholder `Required, such as 40`, and the error `A duty that opens a bridge needs the most turns of the whole bridge, such as 40.` | done |

### src/ui/DutyCheck.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Write the check` | change | `Write the check for me`. The key stays off until the editor has an agent, with `Pick the agent first. It writes the check.` under it. | done |
| new | add | `<agent> writes the check, then tries it once. This can take up to two minutes.` and `<n> seconds so far.` or `1 minute 5 seconds so far.`, with the key `Cancel` | done |
| new | add | `Stopped. The check did not change.` after Cancel, and `<agent> did not answer within two minutes. Try again, or set the check up by hand.` for a 504 | done |
| new | add | for a 422, the whole reason of the front under the words, and `What <agent> tried` with the readback of the record that the agent wrote, which the form does not take. A problem of a 400 shows under the words, or under the agent picker for `agent`. | done |
| `Tool`, a field of text with a list of the tools | change | `Tool`, a choice with `Pick a tool`, `Loading the tools`, or `This agent has no tool to call`, each tool as `<phrase>, <tool>`. Without an agent: `Pick the agent first. Its tools show here.` | done |
| new | add | `What the tool gets`, the head of the names and values of the input | done |
| `Secret`, a field of text with the placeholder `Optional` | change | `Secret`, a choice with `No secret` and the secrets for the host of the address, and `<name>, not for this address` for a secret that the check names. The question mark `What the secret is` says `A setting of the server that holds the token of the address. The page never sees the token. Only the secrets for the host of the address show.` | done |
| `Keeps the items where <filters>.` and `Remove the filters` | change | `Keep the items where`, a row per filter: a field, the test `is`, `is not`, `is one of`, `holds`, `is at least`, or `is at most`, and a value, with `Remove filter <n>` and `Add a filter`. The error is `At least and at most need a number.` | done |

### src/ui/Duties.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| new | add | `Started. See the history for what it did.` after Run now of a duty that posts in a bridge or opens one, with no link | done |
| the title of a duty of another action | change | `<agent> posts in <bridge>` and ` to <handles>`, `<agent> opens a bridge from the playbook <title>`, or `Ask the manager`, then its message or its goal | done |
| new | add | under a run of the history, `Decided while you were away` for a screen reader, and one line per decision: `The manager allowed <tool>: <reason>`, `The manager denied <tool>.`, `<person> stopped the run at <tool>.`, `You allowed <tool>.`, `Nobody answered in time, so <tool> was denied.`, or `Nobody answered in time, so the run stopped at <tool>.` | done |
| `working` for a start that goes again | change | `retrying`, with an amber light that holds still, and under the run the reason of the front, such as `The run failed: <reason>. It goes again.`, or `The run failed, and it goes again.` without one | done |
| `This duty comes from the settings of the front. Change it there.` and the page of a source with no key | remove | a duty that the server imported opens as any duty, with `Edit`. At the top of its page: `First set up in the configuration of the server.` | done |
| new | add | in place of a message that comes from the setup of the server: `The message comes from the setup of the server. Write a message to replace it.` The editor shows it under the empty field of the message. A locked duty leaves out the second sentence. | done |
| new | add | a locked duty: `This duty is locked by the setup of this server. The person who runs the server can change it.`, with `Run now` and no key that changes the duty. Its editor shows only that sentence. | done |
| Check first beside a readback that says the check | remove | the readback says the check once. Check first shows only without a readback | done |
| `Open the run` for a start with no run | remove | a start that the queue never took links no run, in the history and in Activity | done |
| `A run gets at most <limits>.` under Limits of a post or an open | change | a post says `A post spends nothing of its own. The seats of the bridge spend from their own budgets.`, and an open says `The bridge gets at most <n> turns.` Neither says the most per day | done |

### src/ui/Playbooks.tsx, src/ui/Channel.tsx, src/ui/NewBridge.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| new | add | `Save as playbook` and `Make this a duty` in the menu More of a bridge | done |
| new | add | `Saved the playbook <name>.` in the notice of the page after a save | done |
| new | add | the dialog `Save as playbook` with `Name`, `It keeps the goal, <n> seats, the placement, the caps, and what the manager can do.`, `A playbook of this name exists. Saving replaces it.`, and the key `Save playbook`, or `Save and make a duty` from Make this a duty | done |
| new | add | the errors `Give the playbook a name.`, `A name holds 1 to 63 of a to z, 0 to 9, hyphens, and underscores.`, `This bridge has no seat to save.`, and `This playbook changed since you opened it. Try again.` | done |
| new | add | `Playbook` with `Pick a playbook`, `Loading the playbooks`, `No playbook yet`, and `<title>, not here`, each playbook as `<title>: <first line of its goal>`. Under it, `Save one from a bridge: open More, then Save as playbook.` A front without playbooks says `This workbench keeps no playbooks.` | done |
| new | add | `See the playbooks`, each with its title, its goal, `1 seat` or `<n> seats`, and `Delete`. The dialog says `Delete <title>?` and `A duty that opens a bridge from it stops until you pick another playbook.` | done |
| new | add | `Start from a playbook` with `No playbook`, at the top of New bridge, for a person with playbooks | done |

### src/ui/Chat.tsx, src/ui/Manager.tsx, src/ui/Fleet.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| new | add | `More` with `Make this a duty` on the header of a quick chat, of the manager, and of a conversation with an agent, once the conversation exists | done |

### src/ui/Activity.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| new | add | the chip of a duty, its name in words, such as `Nightly restore test`, with the tooltip `Open the duty <name>` | done |
| new | add | a row of a duty: the agent, the light `failed` or `paused`, the text of the front, and the chip. Its main pane adds `Open the run`. | done |
| new | add | a question of a duty on no bridge: the text of the front as the line of the row and above its card, such as `backup wants to run restic restore.`, and the card `<agent> asks for your decision` with Deny and Allow | done |

### src/ui/Shell.tsx, src/ui/Notifications.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Notifications` in the account menu, and the dialog `Notifications` | change | `Where to reach me` in the account menu, and the dialog `Where to reach me` with `Loading your settings.` or `This workbench sends no notifications.` | done |
| `Server`, `Topic`, and `Token` in the dialog | change | they move to the form of an ntfy place, in the dialog of a place | done |
| `Send a test`, `Sent. Look for it on your phone.`, `The front sent nothing. Check the topic and the server.`, and `The test failed. <reason>` | change | `Send a test` on each place, named `Send a test to <name>` for a screen reader, then under its row `Sending.`, `Sent to <name>. Look for it there.`, `Not sent to <name>. <reason>`, `Nothing went to <name>.`, `The test failed. <reason>`, or `The test failed. The server gave this place no id.` | done |
| new | add | `Nothing goes out until you add a place. Activity always shows what needs you.`, the empty list | done |
| new | add | a place: its name, and where it reaches in words: `ntfy, topic <topic>`, `Slack`, `Discord`, `Teams`, `Webhook`, `Email to <address>`, `Through <agent>`, or `<label>, shared by an admin`. The list is `Your places` for a screen reader. | done |
| new | add | the switches `Questions`, `Failures`, and `A daily digest` on each place, the group `What goes to <name>` for a screen reader, and the keys `Edit` and `Remove`, named `Edit <name>` and `Remove <name>` | done |
| new | add | `Add a place`, and the error `You keep 10 places, the most there is. Remove one to add another.` | done |
| new | add | the dialog `Remove <name>?` with `Nothing goes to <name> after this.` and the key `Remove` | done |
| new | add | a problem of the front under the row of its place, and at the top of the dialog of another place as `<name>: <text>` or `Quiet hours: <text>` | done |
| `Tell me about` with the switches `Questions`, `Failures`, and `A daily digest` | change | the same switches on each place, and in the dialog of a place | done |
| `Quiet hours` with `Hold notifications at night`, `From`, `To`, and `Time zone`, and the error `Pick both times.` | keep | | done |
| `This workbench sends no notifications.` | change | `The server sends no notifications.` | done |
| `Save` with no change | change | `Save` stays off until something changes, and `Cancel` closes the dialog | done |

### src/ui/ChannelDialog.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| new | add | the dialog `Add a place` with `What kind of place` and the key `Add place`, or `Edit <name>` with the name of its kind and the key `Save`. A front that offers nothing: `This workbench offers no place yet. Ask an admin.` | done |
| new | add | the kinds, each with its line: `ntfy`, `The ntfy app on your phone, through a topic that it follows.` `Slack`, `A channel of your Slack workspace, through an incoming webhook.` `Discord`, `A channel of your Discord server, through its webhook.` `Teams`, `A channel of Microsoft Teams, through a workflow.` `Webhook`, `Any app that takes a JSON post, such as Home Assistant, n8n, or Zapier.` `Email`, `A plain mail to an address that you name.` `Through an agent`, `An agent of the fleet delivers it with its own tools, as you describe in words.` `A shared channel`, `A channel that an admin shares, such as the room of your team.` | done |
| new | add | `Name`, with the placeholder `My phone`, `Ops room`, `Team server`, `Ops team`, `Home Assistant`, `Work mail`, or `Signal` by kind | done |
| new | add | ntfy: `Server`, with the server of the front as its placeholder, else `https://ntfy.sh`, `Topic` with the question mark `What the topic is`: `The name that the ntfy app on your phone follows. Pick a name that is hard to guess.`, and `Token` with the placeholder `Optional` | done |
| new | add | `Address` with the question mark `Where to find it`: `In Slack, add the app Incoming Webhooks to the channel, then copy the address that it gives you.`, `In Discord, open the settings of the channel, then Integrations, then Webhooks. Make one and copy its address.`, `In Teams, add the workflow that posts to a channel when a webhook request is received, then copy its address.`, or `The app that takes the post gives the address, such as an automation of Home Assistant or a flow of n8n.` The placeholders `https://hooks.slack.com/services/…`, `https://discord.com/api/webhooks/…`, and `https://…` | done |
| new | add | `Secret` with the placeholder `Optional`, and the line `With a secret, each post carries the header X-Featherweight-Signature. It holds sha256= and the HMAC of the body, keyed by the secret.` | done |
| new | add | a saved field: `Saved` with `Replace`, and `Remove` for the token and the secret, named `Replace the <field>` and `Remove the <field>`. After Replace, the placeholder `A new <field>` and `The saved <field> stays until you write a new one.` with `Keep it`. After Remove, `The saved <field> goes when you save.` with `Keep it`. | done |
| new | add | `Email address` with the placeholder `you@example.com` | done |
| new | add | `Agent` with `Pick an agent` or `No agent that you can run`, `How should it reach you?` with the placeholder `Send it to me on Signal.`, and `The most a message can cost` with `$` and the placeholder `Required, such as 0.02` | done |
| new | add | `Channel` with `Pick a channel`, each shared channel by its label, and `<name>, no longer shared` | done |
| new | add | `Tell me about` with the switches `Questions`, `Failures`, and `A daily digest` | done |
| new | add | the errors `Pick a kind of place.`, `Give the place a name.`, `Write the address of the server, such as https://ntfy.sh.`, `This workbench has no ntfy server of its own. Write the address of one, such as https://ntfy.sh.`, `Write the topic that your phone follows.`, `A topic holds no space and no slash.`, `Paste the address from Slack.` (and Discord and Teams), `Paste the address of the app.`, `A Slack address starts with https://hooks.slack.com/.`, `A Discord address starts with https://discord.com/api/webhooks/.`, `The address starts with https://.`, `Write the address to mail.`, `Write an email address, such as you@example.com.`, `Pick the agent that reaches you.`, `Say how the agent should reach you.`, `A place through an agent needs a budget. Write the most a message can cost, such as 0.02.`, `Write an amount above 0, such as 0.02.`, and `Pick a shared channel.` | done |
| `This workbench offers no place yet. Ask an admin.` | change | `The server offers no place yet. Ask an admin.` | done |

### src/ui/DutyEditor.tsx and src/ui/Duties.tsx: the shared channels

| Now | Verdict | New text | Who |
|---|---|---|---|
| new | add | in Tell me about, once the settings list a shared channel: `You`, then each shared channel as `The <label> channel`, each with `Failures` and `Questions` | done |
| `Failures and questions.` (the readback of Tell me about on the page of a duty) | change | the same, then for each shared channel that the duty names `The <label> channel hears of failures.`, `of questions.`, or `of failures and questions.` | done |

### The walk of 2026-10-26: Duties, Check first, and the playbooks

| Now | Verdict | New text | Who |
|---|---|---|---|
| the title of a duty, the first line of its message, such as `In one line, name one thing you check first in a review.` | change | the name of the duty in words, such as `Daily report`, in the list, on its page, in `Delete <name>?`, and on a profile. What it does stays under What it does, and Find a duty still reads it. Two names that read the same show their short names in the meta. | done |
| `Name` with the placeholder `daily-report` and `A name holds 1 to 63 of a to z, 0 to 9, hyphens, and underscores.` for `Walk Duty 1` | change | `Name` in words with the placeholder `Daily report`, and under it `It saves as walk-duty-1.` The page makes the short name. The errors `Give the duty a name.` and `A name needs at least one letter from a to z, or a digit.` | done |
| new | add | `Your unsaved changes are back.` with the key `Discard them`, over a form that a person left without Save or Cancel, and `Your unsaved changes are back. The duty changed since you made them, and Save puts yours in its place.` for an edit of a duty that changed since | done |
| `When a cap is reached` | change | `When a duty reaches its most per day` | done |
| `default` and `triage` in `Of the agent`, and an agent without a face in lower case | change | only the agents that workers run, each by its face, else by its name with a capital, such as `Triage`, as the picker shows it. The same holds for Who, the words of an event, and Check first. | done |
| `1 free` in the picker of Who | remove | a duty runs later, so the free workers of now say nothing | done |
| `When another app calls. The page keeps this start.` | change | `When another app calls the server. You cannot change this start here.` | done |
| `End 2026-12-01 is before start 2026-12-10.` (the server, under a readback of the old schedule) | change | `The last day comes before the first day.` under Last day as soon as both days are set. The page asks the server nothing for those days, and an empty readback does not show. | done |
| the readback of the sentence under a problem of the words of the box | remove | the readback hides while the words hold a problem, and comes back at the next change | done |
| a first day that earlier words set, such as the anchor of every other Tuesday, kept by the next words | change | the next words set the days. Only days that the person set by hand stay. `Only between two dates` shows on whenever the sentence holds a day. | done |
| `Add a time` adds the same time again | change | it adds the next hour that the sentence does not hold | done |
| new | add | the question marks `What a turn is` (`A turn is one step of the agent: it thinks once, then uses its tools. The run stops after this many turns.`), `When this happens` beside If the last run still works, `What a missed time is`, `What away means`, `Where you hear of it` (`Activity always shows a failure and a question. Where to reach me, in the menu of your account, also sends them to your phone or your chat.`), and `What the agent does here` beside Who for a post, an open, and Ask the manager | done |
| `Write the report of [Today's date] to the wiki.` (the placeholder over the message that comes from the setup of the server) | remove | the field stays empty, and the line under it says where the message comes from | done |
| `The goal of the playbook` (the placeholder after a pick) | change | the first line of the goal of the playbook, with `An empty goal keeps the goal of the playbook.` | done |
| Cancel and Back of New duty from Make this a duty go to Duties | change | they go back to where Make this a duty came from: `Back to the chat`, `Back to the manager`, `Back to the bridge`, or `Back to the conversation`. A message that names when, such as every Monday at 8am, goes to Say it in your own words and the sentence, and an amount, such as $0.05, to The most a run can cost. | done |
| `A time that comes while the last run works runs anyway.` for a duty that an event or another app starts | change | `A start that comes while the last run works runs anyway.`, and `is skipped.` or `runs after it.` | done |
| a duty of ask or manager without a cost limit, whose Limits said nothing of it | add | `A run has no cost limit.` | done |
| new | add | `Deleted the duty <name>.` and `Deleted the playbook <name>.`, the notice of a delete | done |
| `Find incidents, servicenow.query_incidents` and `Run shell commands, bash` in Tool, and `front.pages_list` for a tool without words | change | `Find incidents` and `Run shell commands`, with the name of the tool in the tooltip, `<phrase> (<tool>)` for two tools that say the same, and `pages_list` for a tool without words | done |
| the placeholders `result.records` and `number` of Where the list is and What makes an item new | change | `The whole answer` and `The whole item`, with the question marks `How to name the list` and `How to name the field` | done |
| `Call the tool front.pages_list of Docs Scribe.` | change | `Call a tool of Docs Scribe: list the pages of the wiki.` for a tool with words, else the name without `front.` | done |
| `Name` of Save as playbook, with the placeholder `weekly-patching` | change | the name in words with the placeholder `Weekly patching`, `It saves as weekly-patching.`, and `Saved the playbook Weekly patching.` | done |
| `Open the duty <name>` (the tooltip of the chip of a duty in Activity) | change | `Open the duty <name in words>` | done |
| the grey lights `not run yet`, `paused`, and `finished` | change | the same words, with a hollow light for not run yet and the two bars of a pause for paused | done |

## 10. Packages

The section uses the words package, Python package, and Program. These
words never show: uv, pixi, conda-forge, PyPI, lock file, manifest, mirror,
egress, and pool. The fold of a failed install shows the output of the
install as it is, which can hold any word.

### src/ui/Packages.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| new | add | the heading `Packages`, and for an owner the small key `Turn off` while packages are on | done |
| new | add | off: `This agent has only the programs that it came with.` (image was a word of a developer), and for an owner the key `Turn on packages` | done |
| new | add | `Turn off packages?` with `The workers of <agent> lose <names>.` and the key `Turn off`, when a list holds a package | done |
| new | add | the add row: the field `Package name` with the placeholder `such as ansible-lint`, the choice `Kind of package` of `Python package` and `Program`, and the key `Add` | done |
| new | add | the lists `Python packages` and `Programs`, each package with the key `Remove <name>` | done |
| new | add | the state line: `Ready on <n> of <m> workers.`, `Updating on <n> of <m> workers.`, `The change waits for its worker to wake up.` or `The change waits for <n> workers to wake up.` when every worker that takes it sleeps, which hides the note, or `The install failed on <worker>.` with the fold `Show the output` | done |
| new | add | the note `Workers take a change in about a minute. Work in progress does not stop.` | done |
| new | add | the version that a ready worker installed, in muted words after the name of each package | done |
| new | add | the refusal of the front `There is no Python package named <name>.` | done |
| new | add | the switch `The agent can ask for a package. You approve each one.` | done |
| new | add | the errors `Write the name of a package.`, `A package name cannot start with a dash.`, `A package name cannot hold a control character.`, `A package name holds 200 characters at most.`, `<name> is in the list already.`, `A list holds 100 packages at most.`, `That is not the name of a Python package. Write a name such as pyyaml, with a version such as >=6 when you need one.`, and `That is not the name of a program. Write a name such as jq, with a version such as =1.7 when you need one.` | done |

### src/ui/Decision.tsx and src/lib/words.ts: the card of a package

| Now | Verdict | New text | Who |
|---|---|---|---|
| `<agent> wants to run a command` (a call of env read as a shell call) | change | `<agent> wants the Python package <name>.`, `<agent> wants the program <name>.`, or `<agent> wants to remove the Python package <name>.` | done |
| new | add | under it: `Allow installs it now and keeps it for every worker of this agent.`, or `Allow removes it now and from every worker of this agent.` The keys stay `Deny` and `Allow`, with no rule line and no Details. | done |
| `Ran add` (the step of a call of env) | change | `Added the Python package <name>`, `Removed the program <name>`, or `Listed the packages` | done |
| `Asks first when command is add` (the rule of env) | change | `Asks before it adds or removes a package` | done |

### src/ui/Manager.tsx, src/ui/Chat.tsx, src/ui/Fleet.tsx: a run of the archive

| Now | Verdict | New text | Who |
|---|---|---|---|
| new | add | the line `This conversation closed when its agent restarted. You can read it, and your next message starts a new conversation.` under an archived conversation. It said worker that was replaced before. | done |
| `working` (an archived run that had not finished) | change | `ended`, with the tooltip `Its worker was replaced. You can read it.` | done |

## 11. No front in the words of the page

Rule 9 of section 1 holds for every string of the page.

| Now | Verdict | New text | Who |
|---|---|---|---|
| `The front ran no check.` | change | `No check ran.` | done |
| `The front reports <word>.` (the tooltip of the state of a run of a duty) | change | `The server reports <word>.` | done |
| `Finished. Its texts show once the front reads its worker.` | change | `Finished. Its messages show once its worker answers.` | done |
| `The front removes each one once it sleeps for <span>, and Remove removes them now.` | change | `The server removes each one once it sleeps for <span>, and Remove removes them now.` | done |
| `Front matter` (the name of the fields of a skill for a screen reader) | change | `The fields of the skill` | done |

