# Process overview

A reading-guide to how the work came together --- a map to your process, not an
essay about it.

## What I built

A scrollable timeline of the money and transactions running through the AI
circlejerk --- funding rounds, acquisitions, chip deals, foundation gifts ---
rendered on a single `<canvas>` element that you scrub through rather than a
list of DOM cards, backed by a hand-assembled dataset of dated events.

## The moments that mattered

1. **Building a dataset an LLM can't just make up in one pass.** A single
   prompt to "list AI money events" gives a plausible but patchy timeline:
   clustered around famous deals, gaps everywhere else. Instead of accepting
   that first pass, I re-prompted specifically for the dates that fell
   *between* what had already been found, treating the existing timeline as
   a gap map rather than a finished list, and cross-checked names against a
   saved scrape of Forbes' AI 50 (`top_ai_companies.txt`) rather than
   trusting a generated list unverified. I judged it "comprehensive enough"
   by checking density along the date axis rather than event count --- no
   multi-year silent gaps once the sources were merged into
   `data/timeline.json`
   ([`a05da5c`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Da-W1nn3r/commit/a05da5c)).

2. **Putting the project's intent in the harness, not in another prompt.**
   Rather than re-explaining "this is a scrollable AI-transactions timeline,
   render it with Canvas" at the top of every session, I added it to
   `CLAUDE.md` directly --- the difference between a fact I'd keep
   re-supplying and one the agent starts every session already knowing
   ([`4e47252`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Da-W1nn3r/commit/4e47252)).

3. **Making the slider and the canvas agree on what "smooth" means.** The
   obvious way to wire a wheel-driven slider is to set the timeline cursor
   directly from the scroll delta, but wheel events arrive in uneven bursts
   and read as jittery jumps. `Scrubber` (`src/scrub.ts`) instead splits the
   value in two: wheel input moves a target instantly, and the displayed
   `current` value chases it each frame with an exponential ease, so a burst
   of discrete events reads as one continuous motion. Nodes have the same
   problem: instead of snapping to a new layout slot the instant the
   established set changes, `CanvasRenderer` eases position the same way,
   but gives a newly-established node's *size* its own fixed-duration
   grow-in curve so it visibly pops in rather than fading on the same curve
   as everything else. Label placement took three discarded attempts before
   landing on checking real 2D distance between markers instead of treating
   x and y independently --- the only version that didn't just relocate the
   collision to mobile width or a denser cluster. I checked this by
   scrubbing rapidly across the densest clusters at both 1920×1080 and
   390×844 watching for jitter or overlapping labels, plus `model.test.ts`
   and `dates.test.ts`
   ([`d703fe4`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Da-W1nn3r/commit/d703fe4)).

4. **Theme and headline following the scrub position, not fighting it.**
   The obvious theme approach reads `prefers-color-scheme` once at load;
   instead `theme.ts` keeps an explicit user override in `localStorage` and
   only follows a live OS change when that override is empty, so the site's
   own toggle can't be silently undone by the OS flipping in the background.
   For the headline, rather than a static caption above a constantly-moving
   canvas, `currentHeadline` (`src/headline.ts`) picks whichever
   transaction, event, or release is most recent at-or-before the scrubbed
   time, so it reads as commentary tied to wherever you've scrubbed to. I
   verified both by hand --- toggling OS dark mode with an override set, and
   scrubbing to known dates to confirm the headline flips exactly on the
   next event's date --- plus `headline.test.ts`
   ([`d703fe4`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Da-W1nn3r/commit/d703fe4)).
