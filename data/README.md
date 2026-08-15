# Adding things to the timeline

`timeline.json` is the only file the app reads at runtime (`src/data.ts` imports
it directly); `ai-money-timeline.csv` and `llm-flagship-releases.csv` are the
original source material it was compiled from and aren't read by the build.
Everything you add goes into `timeline.json`, following the shapes in
`src/types.ts`.

There are four top-level arrays. Add to whichever fits, run `pnpm check`, then
look at it in a real browser before you consider it done (canvas positions and
animation timing aren't visible from the JSON alone) — see
[Verifying a change](#verifying-a-change) below.

## `companies`

```json
{ "id": "openai", "name": "OpenAI" }
```

- `id` is what every `transaction.from`/`to`, `companyEvent.company`, and
  `llmRelease.company` field points at. Pick something short and stable —
  changing it later means updating every reference.
- A company only appears on the canvas once it's *established*: the earliest
  date it's mentioned by any transaction, event, or release
  (`establishedDatesByCompany` in `src/model.ts`). Adding a company with no
  transactions/events/releases yet means it never renders — that's normal, not
  a bug, if you're about to add its first mention right after.
- **Node colour is positional, not chosen.** `src/renderer.ts` colours a node
  by `data.companies.findIndex(...)` into `CATEGORICAL` in `src/palette.ts`,
  an 8-colour list that **wraps** past 8 companies (`index % CATEGORICAL.length`
  in `categoricalColor`). With more than 8 companies some will share a colour —
  expected, not a bug to chase. If two similarly-coloured nodes end up
  confusingly close together, the only lever you have is reordering
  `companies` so they land in different colour slots (moving a company's
  position doesn't affect anything else — colour is the only thing keyed to
  array order).
- **Renaming vs. a new company — pick deliberately.** Two different real-world
  situations map to two different edits:
  - *Same company, new name* (e.g. Facebook → Meta): keep the same `id`, add a
    `renames` entry. The node's cumulative totals carry over untouched, and its
    label switches over automatically:
    ```json
    { "id": "meta", "name": "Facebook", "renames": [{ "date": "2021-10-28", "name": "Meta" }] }
    ```
  - *One company absorbed into another* (a merger/acquisition): don't create a
    second node for the acquirer unless it already has its own independent
    history in this dataset. If the acquirer has no life here beyond this deal,
    model it the same way as a rename — keep the acquired company's `id`, and
    add a `renames` entry dated to the deal closing. New transactions to the
    combined entity after that date should target the *original* `id`, not a
    new one. This is exactly what happened when SpaceX absorbed xAI: there's
    one `xai` company, renamed to `SpaceX` effective 2026-02-02, and Nvidia's
    later top-up transaction targets `"to": "xai"` — so hovering the node shows
    one correct combined total instead of splitting the stake across two
    nodes that never talk to each other. Getting this wrong is easy to miss:
    the JSON stays valid and the build stays green, but the node's tooltip
    total will be quietly short by whatever landed on the "other" id.

## `transactions`

```json
{
  "id": "t29",
  "date": "2026-09",
  "from": "nvidia",
  "to": "openai",
  "paperValue": 5000000000,
  "actualValue": 2000000000,
  "delivered": false,
  "description": "One sentence, presented as fact — no hedging or meta-commentary about the dataset itself. This is what shows in the tooltip and the headline ticker, verbatim."
}
```

- `id` just needs to be unique; the existing convention is `t` + the next
  number in sequence — check the last one in the file rather than assuming.
- `paperValue` is the headline/pledged number; `actualValue` is what's actually
  landed so far. They're often equal (fully delivered) but don't have to be —
  a wide gap is exactly what "still owed money" is meant to visualise on the
  node's ring vs. core.
- `delivered` is a simple boolean flag for the transaction's own circle style
  (filled vs. outlined) — it's independent of the paper/actual split, so a
  transaction can have `actualValue < paperValue` and still be `delivered: true`
  if that's the final number, not a partial one.
- **Never edit a settled transaction to bump its value — add a new one for the
  delta.** If a previously-recorded stake grows (a re-rating, a follow-on
  round, more of a pledge landing), add a second transaction dated when that
  change became known, sized as the *increase only*, and say so in the
  description (see `t15`/`t28`: the original $2B stays as its own entry, and
  the later $19B uplift's description explicitly says it's "on top of the
  already-counted $2B"). Editing the original instead would silently change a
  historical fact and, worse, its animation would replay on today's date
  instead of the date it actually happened.
- Transactions animate: a circle travels from `from` to `to` starting at
  `date`, taking `TRAVEL_DURATION_FRACTION` (3%) of the whole dataset's date
  span to arrive (`src/model.ts`). Until it arrives, the money isn't in the
  receiving node's cumulative total yet (the sender's "given" total updates
  immediately, though — see `cumulativeGivenPaperByCompany`'s doc comment if
  the given/received distinction matters for what you're adding). This means:
  - A transaction dated at or very near the *latest* date in the whole dataset
    needs somewhere to travel to. `src/data.ts`'s `getDateRange` pads the
    scrubber's max out past the raw latest date by exactly one travel
    duration, so this is handled automatically — you don't need to backdate
    anything to "make room."
  - A transaction whose circle overlaps a node early in its flight can look
    invisible for a moment (nodes draw on top of transactions in
    `renderer.ts`). This is normal and self-resolves within the first few
    percent of its travel — don't chase it unless it never separates from the
    node at all as you scrub forward, which would mean something else is
    wrong (e.g. `from`/`to` pointing at the same place, or a duplicate date).

## `companyEvents`

```json
{
  "id": "ce34",
  "date": "2026-09",
  "company": "openai",
  "title": "Short present-tense headline",
  "note": "One or two sentences of context, same voice as transaction descriptions."
}
```

Structural milestones with no money attached (founding, rename, merger,
restructuring) — rendered as small triangle markers on the bottom timeline
track, not scaled by value. `id` follows the same `ce` + next-number
convention. If the event is *also* representable as a merger changing which
company future transactions should target, see the "one company absorbed into
another" guidance under `companies` above — the two often go together (the
event narrates it, the company's `renames` entry and future transactions'
`to`/`from` fields make it actually count).

## `llmReleases`

```json
{ "date": "2025-07-09", "company": "xai", "model": "Grok 4", "note": "One sentence." }
```

Model release markers (diamonds on the timeline track). No `id` field — these
are addressed by array index elsewhere in the code, so don't reorder existing
entries when adding a new one; append instead.

## Dates

Any of `"YYYY"`, `"YYYY-MM"`, or `"YYYY-MM-DD"` (`src/dates.ts`); missing month/day
default to January/the 1st. Use the coarsest precision you actually know —
don't invent a day just to fill the field.

## Verifying a change

1. `node -e "JSON.parse(require('fs').readFileSync('data/timeline.json','utf8'))"` —
   catches a syntax slip before anything else does.
2. `pnpm check` — typecheck, build, lint, and the test suite. This does *not*
   check that a new entry looks right or animates correctly; it only checks
   the file is well-formed and nothing else broke.
3. Run `pnpm dev`, open the page, and scrub to where your new entry lives.
   Confirm the node/circle/marker you expect actually appears, hover it to
   check the tooltip text reads correctly, and if it's a transaction, scrub
   past its arrival to confirm the destination node's total grew by the right
   amount. Reading the JSON is not the same as seeing it render — canvas
   position, colour, and animation timing only show up in the browser.
