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

The statuses of a seat: `working`, `needs you`, `waiting for a worker`,
`idle`, `asleep`, `error`, and `fired`. The statuses of a worker: `awake`,
`asleep`, `starting`, `failed`, and `stopping`. The statuses of a run:
`waiting for a worker`, `working`, `needs you`, `ready`, `ended`, `failed`,
and `stopped`.

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

### src/ui/Shell.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Activity`, `Bridges`, `Fleet`, `Skills`, `Wiki`, `Manager` | keep | | done |
| `Chat` (the place between Activity and Bridges, with a speech bubble) | add | the quick chat of section 7 | done |
| `1 member needs you`, `N members need you` (count of Activity) | keep | | done |
| `<name>, account` (account key) | keep | | done |
| `Match the system`, `Light`, `Graphite` | keep | | done |
| `Connections`, `Sign out` | keep | | done |
| `Live`, `Connecting`, `Offline` | keep | | done |
| `Live updates arrive.` (tooltip) | change | `Updates arrive as they happen.` | done |
| `N workers awake` | keep | replaces `4 Tasks awake` of the mockup | done |
| `<name>, home` (logo well) | keep | | done |

### src/ui/Signin.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Sign in` | keep | `Sign in to <name>` for a theme with a name | done |
| `Your sign-in ended. Sign in again to go on. Your drafts stay.` | change | `Your sign-in ended. Sign in again, and your drafts stay.` | done |
| `Sign in to run your fleet.` | keep | | done |
| `Paste your access token to run your fleet.` | keep | | done |
| `Use an access token` | keep | | done |
| `Access token` | keep | | done |
| `Continue` | keep | | done |

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

### src/lib/words.ts

| Now | Verdict | New text | Who |
|---|---|---|---|
| `This tool can change things, so it waits for you.` | change | `Rule: ask before a tool that changes things` | done |
| `A rule of this agent asks you first.` | change | `Rule: ask before git push`, from the rule itself | done |
| `The policy of this agent asks you first.` | change | `Rule: ask first` | done |
| `3 minutes ago` (ago) | change | `since()` gives `14 min`, `3 h`, and `2 d` | done, and the screens move to it |
| `<who> wants to run a command` | keep | | Lead |
| `<who> asks for your permission` | change | `<who> asks for your decision` | done |
| `Today`, `Yesterday` | keep | | Lead |
| `someone`, `bossmode` (sender of a system line) | keep | | Lead |

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
| `No bridge is open.` | keep | with the key `Open a bridge` | done |
| `Loading the bridges.` | keep | | A |
| `Closed` with the count chip | keep | | done |
| `Find a bridge` | add | the field above a list of more than ten bridges | done |
| `2000+` | add | the unread count past the bound of the backend | done |
| `Manager` row and `Your conversation` | remove | Manager is a place of the app bar | done |
| `Places`, `Fleet`, `Pages` rows | remove | places of the app bar | done |

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
| `New messages below` | change | `New messages` | A |
| `Message the bridge` (placeholder) | keep | was `Message every member, or @ one member` | done |
| `This bridge is closed. Open it again to send.` | change | `Closed. Reopen it to send.` | A |
| `Messages of <title>` (log label) | keep | | A |
| new | add | the tabs `Posts`, `Wiki`, `Decisions` with the count of decisions | A |
| new | add | the system line `Runs in waves: N seats share M workers.` once per bridge | done |
| `Bridge` (the name of the screen for a screen reader, and the title of a bridge that is not here) | add | | done |
| `N updates`, `N failed` (a fold of system lines, with a red light for the failures) | add | | done |
| `<a> and <b>: N messages` (a fold of the chatter of agents) | add | | done |
| `More` (the menu of the header) | add | it holds `What the manager can do`, `Reopen`, and, below 1200 pixels, `Close bridge` | done |
| the empty tab Decisions | add | `Nothing needs you.`, the words of Activity | done |
| the tab Wiki | add | `Loading the pages.` and `New page`, the words of the wiki | done |

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
| `The channel holds the first 4 KB. The run holds the whole text.` | change | `Cut at 4 KB.` with the link `Whole text` to the run | A |
| `to @a, @b` (address line) | change | `to a and b` | A |
| new | add | `pinned`, a quiet chip after the clock time of a pinned message, which keeps its header after a message of the same sender | done |
| `Question from <who>`, `Permission for <who>` (labels) | change | `Question from <who>`, `Decision for <who>` | A |
| system lines: the icon before the line | change | the light of the event: green for started, amber for needs you, red for failed, grey for the rest | A |

### src/ui/Decision.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Permission` (kicker) | remove | `Needs your decision` with the amber light | done |
| `<who> wants to run a command` (title) | change | the first line of the card, as a sentence | done |
| `Details`, `Tool:`, `Reason:` | keep | | A |
| `Note for <who>, if you want` | change | `Note` with the placeholder `Optional` | done |
| `Deny`, `Always allow`, `<label>` or `Allow` | keep | | done |
| `Allow this call, and let <who> use <tool> from now on without asking` | change | `Allow <tool> for <who> from now on` | A |
| `No decision: <note>` | keep | | A |
| `<who> answered: <answer>`, `<who> declined the question`, `<who> allowed this`, `<who> denied this` | keep | | A |
| `. Note: <note>` | change | the note on a line of its own | A |
| `Question from <who>` (kicker) | change | `Needs your answer` with the amber light, and `<who> asks: <question>` | done |
| `A question for you` | keep | | A |
| `Your answer`, `None`, `Decline`, `Answer` | keep | | A |

### src/ui/Composer.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Reply to <who>: <excerpt>` | change | the chip `Replying to <who>` with `Stop replying` | done |
| `Cancel the reply` | change | `Stop replying` | done |
| `To every active member`, `To @a and @b` | change | `To everyone`, `To a and b` | A |
| `Ctrl+Enter`, `⌘+Enter` | keep | | A |
| `Send` | keep | | done |
| `Members` (list label) | keep | and `Commands` for the slash menu | done |
| the argument hint of a command, such as `<module>` | add | in a slot of its own: beside the name in the slash menu, and as `/<name> <hint>` in the address line while the person types the arguments | done |
| `Message <who>` (placeholder of a reply) | keep | | done |

### src/ui/Roster.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Roster` | change | `Members` | done |
| `N members` under the heading | change | the count chip on the heading line | done |
| `Add` | keep | it opens the picker | done |
| `<handle>, <word>. <task>. <phrase>. Open its run.` (label) | change | `<handle>, <word>. <task>. Open its conversation.` | A |
| `muted` (tag) | keep | | A |
| `More for <handle>` | keep | | A |
| `Open its run` | change | `Open conversation` | A |
| `Mute`, `Unmute` | keep | | A |
| `It gets the messages of the channel again.`, `It gets no broadcast, only a message to it.` | remove | | A |
| `Seat again` | keep | | A |
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
| `Seat <handle> again`, `A new task for <handle>` | change | `Seat <handle> again`, `Change the task of <handle>` | A |
| `Seat again`, `Save the task` | change | `Seat again`, `Change task` | A |
| `A new run of <handle> starts with this task, and the channel reaches it again. You can change the task first.` | remove | | A |
| `This bridge has no member.` | change | `No one has a seat yet.` with the key `Add` | A |
| `Loading the roster.` | change | `Loading the members.` | A |
| `To fire a member, drag it out of the roster, or pick Fire in its menu.` | remove | the drag target says `Fire` while a member drags | done |
| `Fire <handle>?`, `Fire <handle>` | keep | | A |
| `The open runs of <handle> in this bridge stop, and its seat gets no more messages. Its Task stays in its pool, so other bridges can still use it.` | change | `Its open runs stop, and it gets no more messages.` | A |
| `Drop here to fire` | change | `Fire` | done |
| new | add | the footer `This bridge` with turns, cost, and pages, from `usage`, for a bridge whose runs report usage | done |
| `N turns`, `$N so far`, `N pages` (the figures of the foot, at `--t-control`) | add | `1 turn` and `1 page` for one | done |
| `Add` (the screen-reader name of the picker) | add | the picker carries the name of the key that opens it | done |

### src/ui/Picker.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Who` with the placeholder `Who?` | add | the field of the picker | done |
| `On this bridge`, `Everyone else` | add | the two groups. On the new-bridge screen, On this bridge holds the agents of the seats of the form. | done |
| `N free`, `waiting for a worker` | add | the capacity of an agent, with a green or a grey light | done |
| `Advanced`, `New agent` | add | `Advanced` shows only in the members pane, where the picker seats on a bridge that exists | done |
| `Handle`, `Agent`, `Task`, `Seat`, `Cancel` (the full form of Advanced) | add | | done |

## 5. Screen B

### src/ui/Activity.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Activity` with the count chip | keep | | done |
| `New messages` (meta of a row) | change | the sender and an excerpt of the newest entry | B |
| `Nothing needs you. New decisions and messages land here first.` | change | `Nothing needs you.` | B |
| `Pick an item in the list to decide or to read it.` | change | `Pick an item to decide or to read it.` | B |

### src/ui/Fleet.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Fleet` with the count chip, `New agent` | keep | | done |
| `Pools` | remove | | done |
| `N pools, N Tasks, N agents` | remove | the count chip | done |
| `Runs <agent> from the queue <intake>` | change | `Keep <n>` | done |
| `N of M ready` | change | `N ready` | done |
| `The fleet has no pool that you can see.` | change | `No agent has a worker that you can see.` | done |
| `older configuration` (tag) | change | `old setup` | B |
| `Checked 2 minutes ago` | remove | | B |
| `Read again` | remove | the stream keeps the fleet current | B |
| `Agents`, `Tasks` (sections) | remove | the people list grouped by bridge, then `Not on a bridge` | B |
| `You are <role>` | remove | | B |
| `N waiting for input` | change | the status `needs you` | B |
| `You can see no agent.` | change | `No agent yet.` with the key `New agent` | B |
| `A person drew this face.`, `A pattern from the name. No model drew it.` | remove | | B |
| `Display name, at most 64 characters` | change | `Name` | B |
| `Tagline, at most 140 characters` | change | `Tagline` | B |
| `A new face: an SVG file of at most 32 KB. The workbench refuses a face with a script, a link, or an image inside.` | change | the key `New face`, and the limit in the error | B |
| `A face holds at most 32 KB.` | change | `This face is over 32 KB. Pick a smaller SVG.` | B |
| `Use the pattern again` | change | `Use the mark` | B |
| `Only an owner of <agent> can change its face.` | remove | the Edit key does not show | B |
| `Saved.`, `The new face is up.` | keep | | B |
| new | add | the profile: `Workers` with its chip, `Keep`, and the question mark `What is a worker` with `A worker runs the work of one agent, one seat at a time. Keep is how many it keeps ready.` | B |
| new | add | `What people liked` with its chip and `Open page` | B |
| new | add | `Today` with runs, cost, and decisions | B |
| new | add | `N skills`, the one line of the profile that counts them | done |
| `Find a member` | add | the field above the people list | done |
| `Not on a bridge` | add | the last group of the people list | done |
| `N awake` (a chip with a green light), with `N workers awake` for a screen reader | add | | done |
| `N free`, `Keep N` (a person who is not an owner reads Keep as a number) | add | | done |
| `asks before <pattern>`, `asks first` (an amber word for a rule of the profile) | add | | done |
| `Tools and rules` (the list of chips) | add | an accessible name | done |
| `Edit` (the key of an owner on the profile) | add | | done |
| `Keep is a whole number, 0 or more.` | add | the error of the Keep field | done |
| `Remove workers`, with Confirm: `Remove the workers of <agent>?`, `Every worker of <agent> stops. A seat of <agent> waits for a worker.`, and the key `Remove workers` | change | an owner only, as the danger item of the menu `More for workers` beside Keep, so no destructive key sits in plain sight | done |
| `N runs`, `$N`, `N decisions` (Today) | add | `1 run` and `1 decision` for one, and `$N so far` when a run reports no cost | done |

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
| `Asked you a question`, `Asked for permission` | change | `Asked you`, `Asked for a decision` | done |
| `<who> allowed it`, `<who> denied it` | keep | | done |
| `The turn failed` | keep | | done |
| `The turn ended` | remove | the answer above it says it. A turn that failed keeps its line. | done |
| `Took N steps` (a fold of three or more steps) | keep | | done |
| `Load earlier messages` | change | `Earlier messages` | B |
| `Loading the conversation.` | keep | | B |

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

## 6. Screen C

### src/ui/Pages.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Pages` and its line `The wiki of the fleet. Agents write it, and people read it.` | change | `Wiki` with the count chip | done |
| `New` | keep | | done |
| `Search the wiki` | keep | | C |
| `<name> · <time>` (row meta) | change | `<name>` and `14 min`, with a gap and no dot | C |
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
| `New page`, `Edit` (heading) | change | `New page`, `Edit <page>` | done |
| `<by> saved this page while you edited it, <time>. Your text is still here, and nothing is lost.` | change | `<by> saved this page while you edited it. Your text is still here.` | C |
| `See their version` | keep | | C |
| `Drop my text and take theirs`, `Save mine over theirs` | change | `Take theirs`, `Keep mine` | C |
| `Path, such as runbooks/deploy.md. The page adds .md when you leave it out.` | change | `Path` with the placeholder `runbooks/deploy.md` | C |
| `The page will be <path>.` | keep | | C |
| `Markdown`, `What changed, in a few words` | change | `Text`, `What changed` | C |
| `Cancel`, `Create the page`, `Save` | change | `Cancel`, `Create page`, `Save` | C |
| `Cmd or Ctrl+Enter saves. A save that meets a newer version stops and asks you.` | change | `Ctrl+Enter` beside the key, as in the composer | C |
| `A page with this path exists already. Pick another path, or edit that page.` | keep | | C |
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
| `Message to the manager` (label) | keep | | C |

### src/ui/NewBridge.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `Open a bridge` and its line `One job, split into tasks, with one agent on each.` | change | `Open a bridge`, and the one question first: `What is the job?` | C |
| `Title`, `Goal` | change | `Goal` first, and `Title` in Advanced, filled from the goal | C |
| `Members`, `Handle`, `Agent`, `Task`, `Add a member`, `Remove member N` | change | the picker of screen A, then `Seat` | C |
| `Placement` with `Queue. Each member runs on a worker of the pool of its agent.` and `Spawn. The manager seats each member in a child Task of its own, and its budget bounds the whole bridge.` | change | a visible choice with two options: `Keep warm workers` (the default) and `Fresh sandbox per seat` | C |
| `What the manager can do here` and its four rows | change | in Advanced, with the words of screen A | C |
| `Each member starts a run as you. A bridge spends through the budgets of the pools of its members.` | remove | | C |
| `Cancel`, `Open the bridge` | change | `Cancel`, `Open bridge` | done |
| `Seats`, `Pick the seats`, `Let the manager split it` | add | the choice of who seats the bridge, when the settings name a manager | done |
| `Add a seat` (the heading of the seats beside that choice), `Add` (the key that opens the picker of the members pane) | add | | done |
| `Placement`, `Title`, `Caps`, `Most messages`, `Most messages a minute`, `Most messages between two members` | add | Title and Caps in Advanced | done |
| `Write a whole number.` | add | the error of a cap | done |
| `The bridge needs a title.`, `The bridge needs a goal.` | change | `Write the goal of the bridge.` | C |
| `Member N needs a handle of lower-case letters, digits, dots, dashes, or underscores.` | change | the reason of `handleReason()` | C |
| `The handle <h> is there twice.` | change | `<h> has a seat on this bridge already. Pick another handle.` | C |
| `Member N needs an agent.`, `Member N needs a task.` | keep | | C |
| `A spawn bridge needs a manager, and this workbench has none.` | change | `A fresh sandbox per seat needs a manager. Pick keep warm workers, or set up a manager.` | C |

### src/ui/NewAgent.tsx, src/ui/Appearance.tsx, src/ui/Skills.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| `New agent` | keep | | done |
| `A new agent starts with a name and the number of workers it keeps. The form comes with the next stage.` | remove | the form: `Name` first, then `How many can work at once?` with 2 as the default, and Advanced | done |
| `Name`, `What it handles`, `How many can work at once?`, `Template`, `Skills` | add | the fields before Advanced. The skills sit outside Advanced. | done |
| `Model`, `Effort`, `Default`, `Budget of a run`, `Turns`, `Tokens`, `Cost in dollars`, `Context compaction`, `Compact at, in tokens`, `Compaction model`, `Rules`, `Ask before`, `Never run`, `Time zone` | add | in Advanced | done |
| `Create agent`, `Preview`, `saved`, `Open <name>`, `Workers`, `N workers start when you create the agent.` | add | | done |
| `Write the name of the agent.`, `A name holds letters, digits, dots, dashes, or underscores, at most 64.`, `An agent named <name> exists. Pick another name.`, `Pick a number from 1 to 32.`, `Write a whole number.`, `Write an amount in dollars, such as 2.50.`, `Write a whole number of tokens, at least 1024.` | add | the errors, each at the moment the person hits it | done |
| `Appearance`, `Theme`, `Match the system`, `Light`, `Graphite` | keep | | C |
| `<name> sets the accent <hex>.`, `The accent is <hex>.` | remove | Appearance holds the theme of the person only, and the accent belongs to the deployment | done |
| `Skills` with the count chip, `Imported`, `Local`, `<server>`, `Tools`, `Built in` | keep | | done |
| `Agents that can load it` with the count chip | keep | | done |
| `Pick a skill or a tool in the list.` | keep | | done |
| `This skill is not here. It can be removed, or it was renamed.` | keep | | done |
| `No skill yet. Add one from a marketplace, an address, or a SKILL.md.` | change | `No skill yet.` with the key `Add skill` | C |
| `Copy /<name>`, `Copied /<name>` | keep | | done |
| `Remove`, `Remove <name>?`, `Remove <name>` | keep | | done |
| `No agent can load it after this.` | keep | | done |
| new | add | `Add skill` and its chooser: `From a marketplace`, `From an address`, `Paste a SKILL.md`, `Upload files`, then the preview and `Install` | done |
| `Find a skill` (with the name `Find a skill or a tool`), `No skill holds those words.`, `Loading the skill.`, `Loading the skills.` | add | | done |
| `Address`, `Preview`, `Pick files`, `Pick a folder`, `SKILL.md`, `Files`, `Close` | add | the keys and fields of the chooser | done |
| `Loading the marketplaces.`, `No marketplace is set up.`, `Loading the preview.` | add | | done |
| `An installed skill is instructions for every agent of a profile that allows it.` | add | behind the question mark `What an install does` beside the name of the preview, because the chrome never explains | done |
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
| new | add | a row of the history: the title of the run, the status of the run as a light with its word (`working`, `waiting for a worker`, `needs you`, `ready`, `ended`, `failed`, `stopped`), and `since()`, such as `25 min`. A run without a title shows the start of its first message, else `Chat`. | done |
| new | add | `Loading the chats.`, `No chat holds those words.` | done |
| new | add | `No chat yet.` with the key `New chat` | done |
| new | add | `New chat`, the title of a chat before its first message | done |
| new | add | `Tools`, `Skills`, the two headings of the picks, each with the count chip of the picks that are on, `N of M` for a screen reader | done |
| new | add | `Find a tool`, `Find a skill`, the fields of a row of picks that holds more than twelve | done |
| new | add | `Loading the tools.`, while the picks wait for the catalogs | done |
| new | add | `A chat needs at least one tool. Pick one.`, the error of the picks when every tool is off, because an empty tool list gives a run every tool | done |
| new | add | `Ask a question` (placeholder), `Message to <agent>` (label) | done |
| new | add | `working`, or `waiting for a worker`, with the phrase of the step, the status of an answer on its way | done |
| new | add | `Stopped. Your next message starts a new chat.` | done |
| new | add | `This chat`, the heading of the details, and `This chat, <status>`, the name of the mark that opens it | done |
| new | add | `Tools`, `Skills` with the count chip, `1 tool` and `N tools`, `1 skill` and `N skills` for a screen reader | done |
| new | add | `for this chat`, the quiet word on the chip of a tool that the picks gave beyond the list of the agent | done |
| new | add | `Model`, with the model of the resolved profile, when the run object carries it | done |
| new | add | `Usage`, with `N turns`, `N tokens`, and `$N`, and `so far` while the run works. `1 turn` and `1 token` for one. | done |
| new | add | `No quick chat is set up.` with the question mark `Where the quick chat is set up` and `The setting workbench.bossmode.chat names the agent of the quick chat.` | done |
| `Rename`, `Save as agent` | remove | the backend has no route that sets the title of a run, and the new-agent screen takes no run to start from | done |

### src/ui/Live.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| new | add | `Working: <tool>`, a quiet line while the model calls a tool, without the prefix `front.`. It goes when the model call ends. | done |
| new | add | `Live view is busy`, a quiet line while the run has as many live clients as it takes, and the view reads the run with its poll | done |
| new | add | the pending answer: the face and the name of the agent, and the text as the model writes it, with no clock time | done |

### src/ui/Profile.tsx

| Now | Verdict | New text | Who |
|---|---|---|---|
| new | add | `More for workers`, the name of the menu key of the section of the workers, for an owner | done |
