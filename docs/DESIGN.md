# The design of the page

This file is the plan of the look and the behavior of bossmode. It names the
subject, the tokens, the layout, the primitives, and the principles. Section
11 assigns the screens of the next stage. The owner approved the direction
from a mockup of three artboards: the bridge channel, the fleet, and the
channel in the graphite theme. This plan follows the mockup, and section 3
names each place where it departs and why.

## 1. The subject and the audience

The subject is an operator who runs a fleet of agents the way a shift lead
runs a floor. Most workers work. A few need a decision now. The page is a
workplace chat client whose members are agents: bridges are channels, seats
are members, and the manager is one more conversation.

The audience is the operator: an engineer or a team lead. The operator keeps
the page open all day beside other tools and looks at it for a few seconds at
a time. Then the operator acts: allow a command, answer a question, send a
seat back to work, or fire a seat. A second reader opens the wiki and gives a heart to the work that
helped.

The first job of the page is to show who needs you, and to let you decide
without leaving the conversation. Every choice below serves that job first.

## 2. The idea

The page borrows the vernacular of a lab instrument. It has a platinum
chassis and a snow-white faceplate. A band of fine grooves marks the place
where a hand grips a panel. Square status lights sit beside printed words.
Slots for input sit below the surface, and keys with a hard edge stand above
it. One key on the panel is signal orange. It is
the key that makes something happen.

The boldness sits in one place: the decision. A card that needs you has the
only hard black edge in the channel, the only light that breathes, and the
only orange key. Everything around it is quiet text on snow.

## 3. Review against the generic defaults

Before any code, the first draft of this plan was checked against what a
generated chat client looks like by default. Each line names the default, what
the plan does instead, and why.

| The default | This plan | Why |
|---|---|---|
| A system font stack, or a popular neutral sans | Archivo, a variable grotesque, in the build. The two titles are set wide. | The wide cut reads as engraved panel lettering, and it gives the titles a voice without a second family. |
| Rounded cards at 8 to 16 pixels with one soft grey shadow | 4-pixel radius everywhere, flat panes, and hard 1 or 2 pixel drops on things you press | A soft blur under every box makes every box equal. A hard drop marks the few things that act. |
| A round presence dot on the corner of an avatar | A 9-pixel square light beside a word, in the row, never on the face | The word carries the meaning, the light only repeats it, and a face stays a face. |
| A pulsing dot for "live" or "online" | Only the amber light breathes, and only for "needs you" | Motion is for the one state that asks for an action. A live stream stays still. |
| The unread badge in the brand color | A black count chip (snow in graphite) | The accent stays reserved for the primary action, the active tab, and the heart. |
| Uppercase section labels such as "BRIDGES" and "PLACES" | A sentence-case heading with its count as a chip on the same line | Uppercase labels with wide tracking are a template tell, and a count under a heading costs a line. |
| Meta strings joined with middle dots, such as "5 members · working" | A gap between parts, a light beside its word, and nothing between them | The gap and the light already separate the parts. |
| The accent on link hover (the mockup did this) | An underline on hover, in ink | The accent appears in three places and nowhere else. |
| Stripes as a background fill | One 8-pixel groove band under each pane header, and a faint groove on the app bar | The groove marks where a pane begins, as a grip line marks a panel. It never fills empty space. |
| An identicon that the server draws for every agent | The page draws the mark from the hash of the name. The picture of the server shows only for a custom face. | One request less per agent, and the mark follows the theme. |
| Monospace for small labels, such as worker names | Monospace only for text that a person can type into a shell: commands, paths, code | A worker name is a name. |
| A timestamp on every row of every list | A clock time on a message, a short meta such as "14 min" in a list, and the full time in a tooltip | People read a chat by its clock. A list needs only freshness. |
| 11-pixel labels under the app bar icons (the mockup) | 12 pixels | 11 pixels at weight 600 is too small for a label that names a place. |
| The graphite error word #FF6B61 (the mockup) | #FF7B72 | #FF6B61 gives 4.4 to 1 on the graphite pane, under the 4.5 to 1 of body text. #FF7B72 gives 4.9 to 1. |
| A soft wide shadow and a hairline under the same popover | Only floating layers (menus, the picker, dialogs) carry the soft shadow, below their hard edge | A soft shadow solves a real layering problem only where a layer floats over content. |
| Decorative entrance motion on each section | Three motions: the amber light breathes, an arriving decision card settles once, and the reply chip slides in | Motion that answers a change shows what changed. Motion on load says nothing. |
| A sentence of help under every field and in every footer | A label, a limit in the error at the moment the person hits it, and a definition behind a question mark | The operator learns the page once and reads it a thousand times. |
| Glyphs of the mockup that are not symmetric, such as the marks of writer and scribe | Every mark mirrors around its middle column | A symmetric mark reads as a face at 20 pixels. |
| `4 Tasks awake` at the foot of the list (the mockup) | `4 workers awake` | The page never says Task or pool to an operator. |
| A soft wash under a selected member and a needs-you row of `#FFF7E8` without a token (the mockup) | `--wash-need`, light and graphite, only for a row that needs you | A color without a token drifts. |
| A decided card with the same hard edge as a waiting one | A decided card turns quiet: a line edge, no drop, no light | Only what waits keeps the hard edge. |
| The usage of a bridge at the foot of the members (the mockup), against the contract, which showed none | The foot shows turns, cost, and pages from `usage`, for runs that report it | The owner approved the mockup, and `GET /v1/bridges/{id}` carries `usage`. |
| One flat list of bridges | Open bridges, then a Closed group behind a toggle, and a filter field once the list grows | Collapsed sections and a filter keep hundreds of bridges in reach. |

The groove band deserves one more word, because repeating stripes are a
known tell of generated pages. The band here is 8 pixels tall. It sits only at
the top edge of a pane or a card, under its header. Its lines have the color
of the pane edge. It is the texture of the panel, in the place where a
panel has its grip, and it carries one meaning: a new surface starts here.

## 4. Tokens

The tokens are CSS custom properties on `:root`, in `src/styles/tokens.css`.
`prefers-color-scheme: dark` redefines them for graphite, unless the person
picked a theme. The attribute `data-theme="light"` or `data-theme="dark"` on
the root element pins a theme. The accent and the logo come from the
deployment (section 8).

### 4.1 Color

The base palette has six named values per theme.

| Token | Role | Light: snow | Graphite |
|---|---|---|---|
| `--paper` | The panes: list, main, details | Snow `#F3F3EF` | `#353532` |
| `--chrome` | The app bar, the frame of the page | Platinum `#DCDCD6` | `#2A2A28` |
| `--line` | Pane edges, control edges, groove lines | Fog `#C4C4BC` | `#4A4A46` |
| `--recess` | Inputs, the composer, command blocks | `#ECECE7` | `#2E2E2B` |
| `--ink` | Text, and the hard edge of a key in light | Black `#000000` | `#F3F3EF` |
| `--muted` | Secondary text | `#55554F` | `#B8B8B0` |

Derived values, each with one job:

| Token | Job | Light | Graphite |
|---|---|---|---|
| `--line-soft` | Separators between rows | `#E2E2DC` | `#3E3E3B` |
| `--raised` | A selected row, a mark well, inline code | `#DCDCD6` | `#44443F` |
| `--raised-line` | The edge of a selected row and of a mark | `#C4C4BC` | `#55554F` |
| `--sheen` | The light top line of a raised surface | `#FFFFFF` | `#55554F` |
| `--key` | The ground of a secondary key | `#F3F3EF` | `#44443F` |
| `--edge` | The hard edge of a key or a card | `#000000` | `#1A1A18` |
| `--drop` | The hard drop under a key or a card | `#000000` | `#000000` |
| `--groove-chrome` | The faint groove of the app bar | `#D2D2CC` | `#323230` |
| `--card` | The ground of a card | `#F3F3EF` | `#3B3B38` |
| `--card-groove` | The ground of the groove band of a card | `#DCDCD6` | `#2E2E2B` |
| `--on-ink` | Text on an ink ground: a count, a person's initials | `#F3F3EF` | `#000000` |
| `--placeholder` | The dashed edge and the mark of an empty logo well | `#8A8A82` | `#8A8A82` |
| `--wash-need` | The ground of a row that needs you | `#FFF7E8` | `#3F3828` |

Status lights. A light never stands alone: a word stands beside it, in the
word color.

| Status | Light | Word, light | Word, graphite | Motion |
|---|---|---|---|---|
| Working, live, awake | `--led-green` `#1E9E45` | `--word-green` `#177A36` | `#4CCB70` | none |
| Needs you | `--led-amber` `#F0A400` | `--word-amber` `#8A5500` | `#F0A400` | breathes, 2.4 s |
| Error | `--led-red` `#D1281F` | `--word-red` `#A8201A` | `#FF7B72` | none |
| Idle, asleep, closed, waiting for a worker | `--led-grey` `#9A9A92`, graphite `#6E6E68` | `--muted` | `--muted` | none |
| Fired | `--led-grey`, no glow | `--muted`, struck through | same | none |

A lit light (green, amber, red) glows in its own color: `0 0 5px` of the
color. A grey light has no glow. Every light has an inner ring of
`rgba(0,0,0,.25)` so its edge holds on any ground.

The accent:

| Token | Value | Where |
|---|---|---|
| `--accent` | Signal orange `#FF4D00`, or the accent of the deployment | The primary key, the bar under the active tab, the fill of a heart. Nowhere else. |
| `--on-accent` | `#000000` or `#FFFFFF`, whichever gives the higher contrast on the accent | The label of the primary key |

Black on signal orange gives 6.3 to 1. The bar of the active tab gives 3.0 to
1 on snow and 3.7 to 1 on graphite. The tab also turns ink and bold, so the
bar is never the only signal.

The marks of agents use eight hues, deep on platinum and light on graphite,
each at least 3 to 1 on its well. The manager takes ink, so it reads apart
from every member.

| Token | Light | Graphite |
|---|---|---|
| `--mark-0` blue | `#2B4A8C` | `#7FA1E8` |
| `--mark-1` rust | `#B5531E` | `#E8905A` |
| `--mark-2` green | `#3F7A3A` | `#7CC47A` |
| `--mark-3` violet | `#6B4C9A` | `#B89AE0` |
| `--mark-4` ochre | `#8C6A1E` | `#D9B45A` |
| `--mark-5` teal | `#1F6B73` | `#6CC4CC` |
| `--mark-6` crimson | `#9C2F52` | `#E88AA8` |
| `--mark-7` slate | `#4D5866` | `#A9B6C6` |
| `--mark-ink` the manager | `--ink` | `--ink` |

Focus is a 2-pixel ink outline with a 2-pixel offset, never the accent.

### 4.2 Type

One family, Archivo, with its width and weight axes. Code uses the
monospace of the system. The page sets the width with `font-stretch`, the
basic property of the `wdth` axis. The value `font-stretch: 110%` gives the
same letters as `font-variation-settings: 'wdth' 110`. The basic property
keeps the weight free, and the low-level property overrides it.

| Token | Size / line | Weight | Width | Tracking | Use |
|---|---|---|---|---|---|
| `--t-title` | 22 / 28 | 800 | 110% | -0.025em | The title of the main pane: a bridge, a member, a page |
| `--t-heading` | 18 / 24 | 800 | 108% | -0.02em | The heading of a list pane or a details pane, the title of a card |
| `--t-sub` | 15 / 22 | 700 | 100% | 0 | A section inside a pane, a name in a row |
| `--t-body` | 15 / 22 | 400 | 100% | 0 | Messages, page text, fields |
| `--t-meta` | 13 / 18 | 400 to 600 | 100% | 0 | Times, tasks, secondary lines, status words |
| `--t-caption` | 12 / 16 | 600 to 700 | 100% | 0 | Chips, group labels, app bar labels |
| `--t-code` | 13 / 18 | 400 | | 0 | Commands, paths, code, in the monospace of the system |
| `--t-control` | 14 / 20 | 400 to 700 | 100% | 0 | Keys, fields, tabs, menu items, and the figures of a foot, such as the turns and the cost of a bridge |

Body is 15 pixels. That is one step above the 14-pixel body of the
reference ramp of a workplace design system. Archivo sets smaller than its
em, and an operator reads long agent messages. Weights are 400, 600, 700, and 800, and
nothing lighter: the panel is printed, not etched.

### 4.3 Space, size, and radius

Everything sits on an 8-pixel rhythm, with 4 pixels as the half step.

| Token | Value | Use |
|---|---|---|
| `--s-1` | 4px | Inside a chip, between a light and its word |
| `--s-2` | 8px | Between items in a row, the groove band |
| `--s-3` | 12px | Row padding, between a mark and its text |
| `--s-4` | 16px | Pane padding in lists and details |
| `--s-5` | 24px | Main pane padding |
| `--s-6` | 32px | Between sections of a pane |
| `--h-header` | 56px | Every pane header and the logo well row |
| `--h-row` | 44px | The smallest row and every target on touch |
| `--h-control` | 36px | Keys and fields |
| `--h-small` | 32px | Small keys in a header, the More key |
| `--w-appbar` | 76px | The app bar |
| `--w-list` | 300px | The list pane |
| `--w-details` | 340px | The details pane |
| `--r` | 4px | Every corner |
| `--r-led` | 2px | The status light |

### 4.4 Elevation

The page has four levels, and three of them use no blur.

| Token | Value, light | Value, graphite | Use |
|---|---|---|---|
| Flat | none | none | Panes, rows, lists. Lines separate them. |
| `--e-key` | `0 1px 0 var(--drop)` | `0 1px 0 #000, inset 0 1px 0 var(--sheen)` | A secondary key |
| `--e-primary` | `0 2px 0 var(--drop), inset 0 1px 0 rgba(255,255,255,.45)`, and the key sits 1px higher | same | The primary key |
| `--e-card` | `0 2px 0 var(--drop)` | same | A card |
| `--e-chip` | `0 1px 0 var(--line)` | `0 1px 0 #000` | A reaction chip |
| `--e-recess` | `inset 0 1px 2px rgba(0,0,0,.14)` | `inset 0 1px 2px rgba(0,0,0,.4)` | Inputs, the composer, command blocks |
| `--e-overlay` | `0 2px 0 var(--drop), 0 12px 24px rgba(0,0,0,.14)` | `... rgba(0,0,0,.4)` | Menus, the picker, dialogs: the only soft shadow |
| `--e-selected` | `inset 0 1px 0 var(--sheen)` | same | A selected row, the active place of the app bar |

A pressed key drops its offset: it moves down by its drop, and the drop goes
to zero.

### 4.5 Motion

Three things move, and only these.

| Token | Value | What |
|---|---|---|
| `--m-breathe` | 2.4s ease-in-out, forever | The glow of the amber light grows from 3 to 10 pixels and back |
| `--m-settle` | 0.24s ease-out, once | A decision card that arrives on the stream rises 6 pixels into place |
| `--m-slide` | 0.16s ease-out, once | The reply chip of the composer comes in from 6 pixels to the left |

Nothing moves on load. Hover changes color and nothing else, with no
transition. `prefers-reduced-motion: reduce` turns all three off: the amber
light holds a steady glow, and the card and the chip appear in place.

### 4.6 Layers

| Token | Value | Use |
|---|---|---|
| `--z-menu` | 30 | Menus and the picker |
| `--z-notice` | 40 | The notice of a failed action |
| `--z-dialog` | 50 | The dialog that asks before a destructive action |

## 5. The layout

The page has four columns: the app bar, the list pane, the main pane, and the
details pane. The route picks the focus column: the column that a narrow
window shows.

Wide, 1200 pixels and more: the app bar and three panes. A place without
details gives the space to the main pane.

```
+------+------------------+---------------------------------------+----------------+
|[logo]| Bridges [3]  New | Migrate the remaining...  Posts Wiki  | Members [5] Add|
|------|//////////////////|///////////////////////////////////////|////////////////|
| Act. |[> Migrate the...]|  [mark] migrator-1  8:19 PM           | [mark] mig-1   |
|  (3) |  5 members ■ 1 n.|  While nginx waits, I read ...        |  ■ working     |
|[Brid]|  Migrate logrot. |                                       |  Migrate cron  |
| Fleet|  Release notes   |  [mark] migrator-2                    | [mark] mig-2   |
| Wiki |                  |  +=====================================+|  ■ needs you   |
| Mgr  |                  |  |///////////////////////////////////||                |
|      |                  |  | ■ Needs your decision             ||                |
|      |                  |  | [git push origin migrate/nginx]   ||                |
|      |                  |  |       Deny  Always allow [Run cmd]||                |
|      |                  |  +=====================================+|                |
|      |                  | [Replying to reviewer x]               |                |
| (AL) | ■ Live  4 awake  | [ Message reviewer          [Send] ]   | This bridge    |
+------+------------------+---------------------------------------+----------------+
  76px       300px                   the rest, at least 480px            340px
```

Medium, 800 to 1199 pixels: the app bar and two panes. With the focus on the
list or the main pane, the list and the main pane show. With the focus on the
details pane, the main pane and the details pane show. Thus the channel stays
in sight beside the members of its bridge.

```
+------+------------------+-------------------------+      +------+-------------------------+----------------+
|[logo]| Bridges [3]  New | Migrate the...  Members |      |[logo]| Migrate the...          | Members [5] Add|
|------|//////////////////|/////////////////////////|      |------|/////////////////////////|////////////////|
| Act. |[> Migrate the...]|  messages               |  or  | Act. |  messages               | member rows    |
|[Brid]|                  |                         |      |[Brid]|                         |                |
| ...  |                  | [ composer      [Send] ]|      | ...  | [ composer      [Send] ]|                |
+------+------------------+-------------------------+      +------+-------------------------+----------------+
```

Narrow, under 800 pixels: one pane at a time. Under a list, the app bar
becomes a bar of places at the bottom edge. In a conversation, the bar
leaves, and the composer takes the bottom edge. Each pane header has
a back link to the column before.

```
+---------------------------+   +---------------------------+   +---------------------------+
| Bridges [3]           New |   | < Bridges  Migrate...  [5]|   | < Channel   Members [5] Add|
|///////////////////////////|   |///////////////////////////|   |///////////////////////////|
|[> Migrate the remaining..]|   |  messages                 |   |  member rows              |
|  Migrate logrotate     (2)|   |                           |   |                           |
|  Release notes for 2.4    |   |                           |   |                           |
|                           |   |                           |   |                           |
|---------------------------|   | [ Message...      [Send] ]|   |                           |
| Act. Brid. Fleet Wiki Mgr |   +---------------------------+   +---------------------------+
+---------------------------+
```

Alignment: text is left aligned everywhere. System lines in a channel are
centered, because they are not anyone's voice. Numbers in chips are centered
in the chip. Nothing is justified.

The places of the app bar, top to bottom: the logo well, Activity, Bridges,
Fleet, Skills, Wiki, Manager, and the account at the foot. Each place has a 22-pixel
icon over a 12-pixel label. The active place sits on paper with a line edge
and a sheen, as a key that is pressed in. A count on Activity is a black chip
at the top right of the icon.

| Place | List pane | Main pane | Details pane |
|---|---|---|---|
| Activity | The inbox: what needs you first, then what is new | The item you picked | none |
| Bridges | Bridges, open first, each with its count and its light | The channel, with the tabs Posts, Wiki, and Decisions | The members, with Add |
| Fleet | People: the seats grouped by bridge, then Not on a bridge | A direct conversation with a member, with the tabs Chat, Run, and Files, or the board | The profile of the agent |
| Skills | The skills by origin (Imported, Local, one group per server), then the tools (Built in, one group per server) | The text of a skill or the description of a tool, and the agents that can load it | Add skill, and the actions on the item |
| Wiki | The tree and the search | A page, its history, or the editor | none |
| Manager | none at first | The conversation | none at first |

A pane with nothing picked keeps its header row and its groove band. Thus
the bands of the three panes stay in one line. The invitation to act sits in
the middle of the pane. The account key opens a menu with the name of the person, the
theme (Match the system, Light, Graphite), Connections, and Sign out.

## 6. The primitives

The primitives live in `src/ui/primitives/`, their styles in
`src/styles/primitives.css`, and their tests in
`src/ui/primitives/primitives.test.tsx`. A screen builds from them and adds no
color, radius, shadow, or type size of its own.

| Primitive | What it draws | States |
|---|---|---|
| `Help` | A 22-pixel question mark that opens a definition in a small layer | open, closed by Escape or a click elsewhere. The layer opens toward the end of the line and flips toward the start where it would run past the edge of its pane. |
| `Menu` | A key with the glyph More that opens a list of actions, in `common.tsx` | quiet in a row, secondary on the header of a pane; a danger item for Fire and Remove |
| `Led` | A 9-pixel square light and its word | Green, amber (breathes), red, and grey. Struck for fired. Quiet: no word on screen, the word in a tooltip and the accessible name. Still: the amber light holds, for a status that waits for nothing. |
| `LineLed` | The bare light of a line whose text is its word: a system line, a decided line | The four tones. It never breathes. |
| `Mark` | The face of an agent: a 5 by 5 symmetric glyph from the hash of the name on a raised square, or the custom picture of the backend | Sizes 20, 32, 36, and 72. A halo of a status color in the header of a member conversation. Selected: the well turns paper. |
| `Avatar` | A person: initials in on-ink on an ink square | sizes 20, 32, 36 |
| `Chip` | A count or a short state on a heading line | plain (line edge, muted), ink (unread), amber (decisions), with an optional `Led` inside |
| `Button` | A key | Primary: accent, 2px edge, raised 1px. Secondary: key ground, 1px edge, 1px drop. Quiet: no edge, no ground. Danger: a secondary key with the red word, for Fire and Remove. Sizes 36 and 32, and 44 on touch. Disabled, pressed, and a link with `href`. Its ref reaches the element, so a layer can give the focus back to it. `IconButton` is a key with one glyph and a name. |
| `Recess` | `Input`, `TextArea`, `Command`, and `Field`: a label, the control, and the reason of a failure. `Find`: the field that narrows a list, with the glyph of a search and a name for a screen reader | focus, invalid, disabled. `Find` is 32 pixels at the top of a list and 36 in the picker. |
| `Choices` | A visible choice of two or three: radio rows under a legend, the picked one on the ground of a selected row | picked, hover, the reason of a failure |
| `Advanced` | The one disclosure that holds the fields that most people never change | open, closed |
| `GrooveBand` | The 8-pixel band of fine grooves | on paper, on a card |
| `PaneHeader` | The 56-pixel header of a pane: a back link, the heading, its chip, the actions, and the groove band under it | Title (main pane) or heading (list and details). The back link shows where its column is out of sight (`to: 'list'` or `'main'`), or always (`to: 'here'`). |
| `Card` | A surface with a hard edge, a groove band, a title with an optional light, a body, and actions at the end | Settle: once, on arrival. Quiet: a line edge, no drop, no breath, for a card that waits for nothing. |
| `Tabs` | Tabs on a header line, each with an optional count chip | current (ink, bold, the accent bar), hover (ink) |
| `ReactionChip` | A thumb up, a thumb down, or a heart with its count | mine (the line turns ink), the heart filled with the accent |
| `LogoWell` | The 44-pixel square at the top of the app bar | empty (dashed edge, a neutral mark), a logo from the deployment |

## 7. Principles

1. Attention first. What needs you is amber, breathes, sits first in every
   list, and has the only orange key on the screen.
2. A status is a word. The light repeats the word and never replaces it. The
   one exception is the halo behind the mark in the header of a member
   conversation. There the word is in the tooltip and the accessible name.
3. Counts live on the heading line, as chips.
4. The accent has three uses: the primary key, the active tab, the heart. A
   deployment changes its color, never its uses.
5. Hard edges act, lines separate, and recesses take input. A thing you can
   press has a drop under it. A thing you type into sits below the surface.
6. The chrome never explains. A label names a thing. A limit shows in the
   error at the moment the person hits it. A definition sits behind a
   question mark.
7. One name for one thing through the whole flow: the key that says Seat
   makes a seat, and the channel then says "seated".
8. Nothing moves unless something changed, and only three things move.
9. Every target is 44 pixels on touch, every action has a key path, and
   reduced motion stops all motion.
10. Skills and tools live in their own place. Elsewhere they show only in
    three spots. The first is the picker of skills on the new-agent screen
    and on the profile. The second is the slash menu of a one-on-one
    composer. The third is the one line of a profile that counts them.
11. The page loads nothing from another origin: the typeface, the marks, and
    the icons are part of the build.

## 8. The theme of a deployment

`GET /v1/bossmode` can carry a theme:

```json
{ "theme": { "accent": "#FF4D00", "name": "Example Org", "logo": "/v1/bossmode/logo" } }
```

The page reads it at boot, in `src/lib/theme.ts`:

- `accent` must be a hex color of 3 or 6 digits. The page sets `--accent` to
  it and `--on-accent` to black or white, whichever gives the higher contrast.
  Any other value, or no theme, keeps signal orange.
- `logo` must be a path on this origin under `/v1/`. The page reads it with
  the bearer token, as it reads a face, and shows it as a blob URL in an
  image inside the logo well. Any other value, a failed read, or no theme
  keeps the empty well.
- `name` labels the logo well and the sign-in. Without it, the page says
  bossmode.

The person picks Match the system, Light, or Graphite in the account menu.
The page keeps that choice in `localStorage` under `fw.bossmode.theme`, a
convenience of one browser. The token stays the only thing in
`sessionStorage` that the page needs to work.

## 9. The typeface

Archivo is under the SIL Open Font License 1.1. The page bundles it from the
npm package `@fontsource-variable/archivo`, so no font comes from another
origin. `src/styles/fonts.css` declares one face per script subset of the
package. Each face holds the width and the weight axes in one file, with its
`unicode-range`. Thus a browser downloads only the subsets of the text on the
screen. An English screen loads one 90 KB file. A browser loads an italic
face only for italic text. The Vietnamese subset of the italic face is left
out, and such text falls back to a synthesized slant.

Further cuts, such as a subset of the Latin file to the characters of the
page, need a font tool in the build. The gain is small for a page that loads
once a day, so the build takes the files of the package as they are.

## 10. Sources

The research for this plan, at most ten searches, read these pages:

- Fluent 2, Typography: the type ramp of a workplace design system, from 10/14 to 68/92, with 14/20 as body. https://fluent2.microsoft.design/typography
- Fluent 2, Shapes: 4 pixels as the default radius, 2 pixels under 32 pixels, and stroke widths of 1 to 4. https://fluent2.microsoft.design/shapes
- Fluent 2, Elevation: a low ramp and a high ramp of key and ambient shadows, with stronger key shadows in dark themes. https://fluent2.microsoft.design/elevation
- Fluent 2, Color: neutrals for surfaces, the brand color for buttons and selected states only, and status colors always paired with another signal. https://fluent2.microsoft.design/color
- PatternFly, Notification badge: an unread state that shows most of the time loses its effect. A count gives the volume. https://www.patternfly.org/components/notification-badge/design-guidelines
- W3C, Badging API: reserve a badge for a state that merits attention, and avoid values that change fast. https://www.w3.org/TR/2025/WD-badging-20251006
- KDE Human Interface Guidelines, Emblem: no emblem for a normal state. https://develop.kde.org/hig/components/assistance/emblem/
- SaaS chat and messaging patterns: group consecutive messages of one sender, keep timestamps out of every line, set system notices apart, and anchor the view at the newest message. https://www.saasui.design/blog/saas-chat-messaging-ux-patterns
- The visible tells of AI design: repeating stripes as fill, a pulsing status dot on a still state, a label above a heading, a hairline edge with a wide shadow. https://www.impeccable.style/slop
- MDN, font-variation-settings: a low-level property for axes that have no basic property. It overrides `font-weight` and `font-stretch`. https://developer.mozilla.org/en-US/docs/Web/CSS/font-variation-settings
- Fontsource, Variable fonts: the axis files and the `unicode-range` subsets of a package. https://fontsource.org/docs/getting-started/variable

## 11. Screens for the next stage

Three screens rework the page in parallel, on top of this branch. Each one
owns a set of files and never edits a file of another screen. The lead owns
the shared files. The shell already routes every screen: `src/ui/App.tsx`
names the component of each pane for each route, and each component lives
in a file of one screen. A first cut of each new screen is in place, so the
page works end to end from the start.

### 11.1 Rules for every screen

1. Build from the primitives of section 6. Add no color, radius, shadow,
   type size, or motion. For a missing token or primitive, write the need in
   the report, and the lead adds it.
2. Follow `docs/COPY.md` for every string of your files, and the words of
   its section 2. The word pool never appears. A status is a word.
3. Keep the rules of the page: one token in `sessionStorage`, the sign-in
   flow, a word beside every light, keyboard reach for every action, 44-pixel
   targets on touch, reduced motion, no external asset, and no browser
   dialog. Ask before a destructive action with `Confirm` of `common.tsx`.
4. A new route of the API, a new type, a new action, or a new piece of state
   goes in a new file that you own, such as `src/state/activity.ts`, never in
   `src/api/routes.ts`, `src/api/types.ts`, `src/state/actions.ts`, or
   `src/state/reducer.ts`. The lead folds them in after the merge.
5. A new glyph goes in a file of your own. The lead moves it into
   `src/ui/icons.tsx` after the merge.
6. A fake route goes in your file `fake/routes-<a|b|c>.mjs`. It gets the
   helpers of `fake/server.mjs` through `register`.
7. As a file of yours moves to the primitives, it drops the classes of
   `src/styles/legacy.css`. Once no screen uses that file, the lead removes
   it.
8. Tests sit beside your files. `npm run build` and `npm test` pass before
   each commit.
9. A change to a route, to the panes of a route, or to a shared file goes in
   your report. Do not edit `src/lib/route.ts` or `src/ui/App.tsx`.

### 11.2 Screen A: the bridges

Files: `src/ui/BridgeList.tsx`, `src/ui/Channel.tsx`, `src/ui/Message.tsx`,
`src/ui/Decision.tsx`, `src/ui/Composer.tsx`, `src/ui/Roster.tsx`,
`src/styles/channel.css`, and `fake/routes-a.mjs`. New files of A, such as
`src/ui/Picker.tsx` for the picker of Add, belong to A.

The work:

- The list of bridges. Rows as the mockup draws them: the title, the unread
  count as an ink chip, the members, and the light of what needs you. Open
  bridges first, the Closed group behind its toggle, and a filter field
  above the list once it holds more than ten bridges.
- The header of the channel. The title, the tabs Posts, Wiki, and Decisions
  with the amber count of the decisions that wait, the key Close bridge, and
  the More menu with What the manager can do and Reopen. The tab Wiki lists
  the pages under `bridges/<id>/`. The tab Decisions lists the cards of the
  bridge, waiting first. The routes are `#bridge/<id>/wiki` and
  `#bridge/<id>/decisions`.
- The entries. Reaction chips at the top right of an entry, with
  `ReactionChip`. A system line with the light of its event: green for
  started, amber for needs you and asked, red for failed, grey for the rest,
  including `finished`. An entry from the handle `manager` draws the mark of
  the manager.
- The folding of system lines and agent chatter. Three or more system lines
  in a row fold into one line, such as `5 updates`, that opens in place.
  Messages that agents send only to agents fold into one line, such as
  `migrator-1 and reviewer: 4 messages`. A decision card never folds.
- The decision card. `Card` with the title Needs your decision and the amber
  light. Its body holds the sentence of `decisionTitle`, the command in
  `Command`, the rule label of `whyWords`, Details, and the Note field. Its
  keys are Deny, Always allow, and the label of the decision. A card that
  arrives on the stream after the channel loaded settles once. A card on
  load never moves.
- The composer. The words of COPY.md for the address line.
- The capacity line. A bridge whose seats outnumber the workers of their
  agents gets one line in its channel: `Runs in waves: N seats share M
  workers.` The counts come from `workersOf` of `src/lib/workers.ts`.
- The members pane. Rows of the mockup: the mark at 36, the handle, the
  status, the task, the phrase of the activity, and the reason of an error,
  such as `Stopped at 40 turns`. The status comes from `seatLight`, which
  says waiting for a worker for a queued run. A row that needs you takes `--wash-need`. The More
  menu holds Open conversation (to `#member/<bridge>/<handle>`), Mute, Seat
  again, Change task, and Fire. The foot shows This bridge with turns, cost,
  and pages from `usage`, for runs that report it.
- The picker of Add. One field, Who, with the placeholder `Who?`. A list of
  agents with their marks, their taglines, and their workers: `N free` with
  a green light, or `waiting for a worker` with a grey one. Two groups: On
  this bridge, then Everyone else. A click puts a new seat row at the top of the
  members. The row holds the handle of `nextHandle` and the task, filled
  from the goal of the bridge, with the keys Seat and Cancel. Advanced opens the full form: handle, agent, and task, with the
  reason of `handleReason`. New agent opens `#new-agent`.

### 11.3 Screen B: the fleet and the people

Files: `src/ui/Fleet.tsx`, `src/ui/Member.tsx`, `src/ui/Board.tsx`,
`src/ui/Activity.tsx`, `src/ui/RunPane.tsx`, `src/ui/Conversation.tsx`,
`src/styles/fleet.css`, and `fake/routes-b.mjs`. New files of B, such as
`src/ui/Profile.tsx`, belong to B. B imports `DecisionCard` of A and
`SkillPicker` of C and edits neither.

The work:

- The people list, in the list pane of Fleet. The seats of every open
  bridge, grouped by bridge, each group with the title of its bridge as a
  link and a count chip. Each row: the mark at 32, the handle, its status,
  and its task. Then Not on a bridge, last: the agents with no seat, with
  the state of their workers. A Find a member field on top. The header has
  the count chip, an `N awake` chip with a green light, and the key New
  agent. The list loads the record of each open bridge, and the stream
  keeps it current.
- The member conversation, at `#member/<bridge>/<handle>`. The header has
  the mark at 36 with the halo of its status. The word of the status is in
  the tooltip and the accessible name. The handle is the title, and
  `in <bridge>` is a link. The tabs are Chat, Run, and Files, with the count
  of files. The More key opens the menu of the seat. Chat shows the transcript of the runs of the seat in
  the look of the channel, with the composer `Message <handle>`. Its slash
  menu offers the skills of the agent through the `commands` of `Composer`.
  Run shows the result, what it did, the limits, and the reactions. Files
  shows the files and the viewer. The `activity` of `GET /v1/runs/{id}` has
  no phrase, so the phrase comes from the member of the bridge.
- The profile of the agent, in the details pane. The mark at 72, the
  tagline, the tools as chips, a rule as an amber word, and the key New
  face. What people liked, from `agents/<agent>/learned.md`, with a count
  chip and Open page. Workers, with its chip, the question mark What is a
  worker, and Keep as a number field in place. Each worker: its name, its
  status, and the seat it serves or the time it slept, as `since()` gives
  it. The one line `N skills`, and the picker of skills of C. Today: runs,
  cost, and decisions.
- Activity. The inbox in the order of attention: the decisions that wait,
  then the errors, then the messages to you, then the rest. j and k move,
  Enter opens, a allows, d denies, and r replies. A decision shows as the
  card of A.
- The board, at `#board`. One light per member, grouped by bridge, as small
  tiles of a mark, a handle, and a light with its word for a screen reader,
  for a fleet too large for a list. A key on the header of the people list
  switches between the list and the board.
- Open in the contract: the route that changes Keep, and the counts of
  Today. B serves them in `fake/routes-b.mjs` and names them in its report.

### 11.4 Screen C: what you make

Files: `src/ui/Pages.tsx`, `src/ui/Manager.tsx`, `src/ui/NewBridge.tsx`,
`src/ui/NewAgent.tsx`, `src/ui/Appearance.tsx`, `src/ui/Skills.tsx`,
`src/styles/wiki.css`, and `fake/routes-c.mjs`. New files of C, such as
`src/ui/SkillPicker.tsx` and `src/ui/AddSkill.tsx`, belong to C.

The work:

- The wiki. The tree with its folders as groups, each row with its name and
  `since()`, the search, the page with its meta as parts, the history, and
  the editor with the conflict of a 412.
- The manager conversation. The look of the channel, the status waking with
  a grey light while the Task of the manager wakes, and New conversation. A
  manager that runs on the front gets no `run` event, so the screen polls
  `GET /v1/runs/{id}` while the run works. Without a manager, the screen
  says `No manager is set up.` with a question mark that names the setting.
- New bridge. One question first: the goal. The placement is a visible
  choice of two: Keep warm workers, the default (`queue`), and Fresh sandbox
  per seat (`spawn`), which needs a manager. The seats come from the picker
  of A once it lands, and until then from the rows of today. Advanced holds
  the title, the handles, and what the manager can do.
- New agent, at `#new-agent`. One question first: the name. Then How many
  can work at once?, with 2 as the default, which the profile shows as Keep.
  Advanced holds the description, the tools, the skills with the
  `SkillPicker`, and the rules. The route that makes an agent is open in the
  contract. C serves it in `fake/routes-c.mjs` and names it in its report.
- The Skills place, at `#skills`. The list of section 5, the text of a skill
  as Markdown with its front matter keys as chips, the description of a
  tool, and the agents that can load it. The details pane holds one key,
  Add skill, which opens a small chooser of four avenues: from a marketplace
  that the admin configured, from an address, a pasted SKILL.md, and
  uploaded files. Each avenue ends in a preview that the admin reads before
  Install. The details pane also holds the actions on the item: Remove for
  an imported skill, and Copy of the slash command. The routes are in
  section 12 of `docs/CONTRACT.md`.
- `SkillPicker`. A list of skills with check boxes and descriptions,
  grouped by origin, with a search. The new-agent screen and the profile of
  B use it. Its props: `skills`, `value` (the names that are on), and
  `onChange`.
- Appearance, at `#appearance`. The theme of the person, as in the account
  menu, and the theme of the deployment: the accent and the logo.

### 11.5 The shared files of the lead

Only the lead edits these files:

| Area | Files |
|---|---|
| The build | `index.html`, `package.json`, `package-lock.json`, `vite.config.ts`, `src/main.tsx` |
| The look | `src/styles/` except `channel.css`, `fleet.css`, and `wiki.css`, and all of `src/ui/primitives/` |
| The shell | `src/ui/Shell.tsx`, `src/ui/App.tsx`, `src/ui/common.tsx`, `src/ui/icons.tsx`, `src/ui/keys.ts`, `src/ui/notice.ts`, `src/ui/Signin.tsx` |
| The data | all of `src/lib/`, `src/state/`, and `src/api/` |
| The fake | `fake/server.mjs`, `fake/data.mjs`, `fake/faces.mjs`, `fake/skills.mjs` |
| The documents | `README.md` and all of `docs/` |

The shared libraries hold what two screens need, so no screen waits for
another:

| Need | Where |
|---|---|
| Faces | `markOf` in `src/lib/mark.ts`, and `Mark` |
| Statuses | `seatLight`, `WAITING`, `phaseOf`, and `runStatus` in `src/lib/presence.ts` |
| Capacity | `workersOf` and `awakeWorkers` in `src/lib/workers.ts` |
| Seats | `nextHandle` and `handleReason` in `src/lib/handles.ts` |
| Times | `since` in `src/lib/words.ts` |
| The slash menu | `slashAt` in `src/lib/mention.ts`, and the `commands` of `Composer` |
| Skills | `loadSkills` and `state.skills` |
| A cut card on the stream | `completeEvent` in `src/state/actions.ts`, already in the stream |

### 11.6 Screenshots

`docs/shots/` holds the shell against the fake server, at 1440 by 900, 1024
by 768, and 390 by 844, in both themes.

| File | What |
|---|---|
| `wide-light-channel.png` | The channel with a decision that waits, the bridges, and the members |
| `wide-graphite-channel.png` | The same in graphite |
| `wide-light-theme.png` | A deployment with a logo and a green accent, after a decision, read again from a cut card |
| `wide-light-fleet.png` | The fleet with the workers of each agent and the profile of an agent |
| `wide-graphite-skills.png` | The Skills place in graphite |
| `medium-graphite-members.png` | Two panes: the channel and the members |
| `narrow-light-list.png` | One pane: the bridges, with the places at the bottom |
| `narrow-graphite-channel.png` | One pane: the channel, with the back link and the composer |
