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
   prompt to "list AI money events" gets you a plausible-looking but patchy
   timeline: clustered around a few famous deals with big gaps everywhere
   else. Instead of accepting that first pass, I went back and prompted
   specifically for the dates that fell *between* what had already been
   found, treating the existing timeline as a gap map rather than a finished
   list. I also did manual research alongside it --- including saving a
   scrape of Forbes' AI 50 list (`top_ai_companies.txt`) to cross-check
   company names and founding details by hand rather than trusting a
   generated list unverified. I judged the result "comprehensive enough" by
   checking density along the date axis rather than event count: no
   multi-year silent gaps left once the two CSVs were merged into
   `data/timeline.json`
   ([`a05da5c`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Da-W1nn3r/commit/a05da5c)).

2. **Putting the project's intent in the harness, not in another prompt.**
   Rather than re-explaining "this is a scrollable AI-transactions timeline,
   render it with Canvas" at the top of every session, I added it to
   `CLAUDE.md` directly. That's the difference between a fact I'd have to
   keep re-supplying and a fact the agent starts every session already
   knowing --- the harness carries the intent instead of me
   ([`4e47252`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Da-W1nn3r/commit/4e47252)).

3. **Making the slider and the canvas agree on what "smooth" means.**
   Built in this order: the scrub/slider input first, then the canvas motion
   it drives. The obvious way to wire a wheel-driven slider is to set the
   timeline cursor directly from the scroll delta, but wheel events arrive in
   uneven bursts, so that reads as jittery jumps rather than scrolling.
   `Scrubber` (`src/scrub.ts`) instead splits the value in two: wheel input
   moves a target instantly, and the displayed `current` value chases it each
   frame with an exponential ease, so a burst of discrete events still reads
   as one continuous motion. The canvas side of that same problem was nodes:
   the obvious approach snaps a node straight to its new layout slot the
   instant the established set changes; instead `CanvasRenderer` eases a
   node's *position* toward its target the same way the scrubber does, but
   gives a newly-established node's *size* a separate, fixed-duration
   grow-in curve (`easeOutCubic` over `GROW_DURATION_SECONDS`) so it visibly
   pops into existence rather than fading in on the same asymptotic curve as
   everything else --- and a node that scrubs back past its establishing
   date shrinks back out on its own (faster) curve instead of vanishing.
   Getting label/marker placement right on the timeline track took three
   discarded attempts before this shape, each of which fixed one overlap
   case and reintroduced another (documented in the `dodgeOffsets` comment
   in `src/renderer.ts`) --- I kept the version that checks real 2D distance
   between markers instead of treating x and y as independent, because it
   was the only one that didn't just move the collision to mobile width or a
   denser cluster. I checked all of this by scrubbing rapidly back and forth
   across the densest date clusters at both 1920×1080 and 390×844 and
   watching for jitter, popping, or overlapping labels, plus the underlying
   math in `model.test.ts` and `dates.test.ts`
   ([`d703fe4`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Da-W1nn3r/commit/d703fe4)).

4. **Theme and headline following the scrub position, not fighting it.**
   Last two pieces, in order: light/dark mode, then the scrolling headline.
   For theme, the obvious approach reads `prefers-color-scheme` once at
   load; instead `theme.ts` keeps an explicit user override in
   `localStorage` and only follows a live OS theme change when
   `storedTheme()` is empty, so toggling the site's own switch can't get
   silently undone by the OS flipping in the background. For the headline, I
   didn't want a static caption sitting above a canvas that's constantly
   moving, so `currentHeadline` (`src/headline.ts`) picks whichever
   transaction, event, or release is most recent at-or-before the scrubbed
   time `t`, with a deterministic tie-break for same-date candidates and a
   fallback line before the first event --- so the headline reads as
   commentary tied to wherever you've scrubbed to, not a fixed subtitle. I
   verified both by hand (toggling OS dark mode with a manual override set,
   and scrubbing to known dates to confirm the headline text flips exactly
   when the next event's date is crossed) and via `headline.test.ts`
   ([`d703fe4`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Da-W1nn3r/commit/d703fe4)).
