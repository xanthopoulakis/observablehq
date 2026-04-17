# KINO publication playbook

This file suggests a practical editorial order for reusing the KINO notebook assets across:

- a long-form Protagon article with embedded charts
- an X / Twitter thread
- a LinkedIn post or carousel-style sequence

The ids below correspond to the embed builders in `embeds.js` and the localized labels in `i18n.json`.

## 1. Protagon embed order

Goal: preserve the article’s narrative arc.

Recommended order:

1. `fairness`
Why first:
- It establishes the boring baseline.
- It immediately tells the reader that the draw already looks close to fair.

2. `overdue_numbers`
Why second:
- This is the most familiar myth.
- It gives the audience an early emotional payoff: the classic “it’s due” story fails quickly.

3. `hot_cold`
Why third:
- It upgrades the discussion from superstition to “more sophisticated” pattern-hunting.
- It keeps the reader moving from intuition to evidence.

4. `parity_window`
Why fourth:
- This is where the language of statistics enters.
- Good for readers who believe the serious mistake is not folk wisdom but incomplete quantification.

5. `pick_tradeoff`
Why fifth:
- It reframes the game from “which number?” to “which structure?”
- It gives a useful transition from myths to product design.

6. `pick_variance`
Why sixth:
- This is the best place to discuss “slow bleed versus roller coaster”.
- It works especially well after the reader has already seen there is no positive EV.

7. `portfolio_scatter`
Why seventh:
- It addresses the “maybe combinations fix it” intuition.
- It introduces the idea that activity is not the same as edge.

8. `coverage_systems`
Why eighth:
- It deals with the strongest marketing claim.
- It is ideal late in the piece because by then the audience already understands why guarantees are not enough.

9. `ga`
Why ninth:
- This is the modern climax.
- It lets the article say: even when we upgraded superstition into machine learning, the evidence still bent back toward randomness.

Suggested Protagon subset if space is limited:
- `fairness`
- `overdue_numbers`
- `parity_window`
- `pick_variance`
- `ga`

That five-chart arc is the cleanest “journalistic” version of the story.

## 2. X / Twitter thread order

Goal: short, escalating, punchy.

Recommended order:

1. `overdue_numbers`
Opening angle:
- “The most common KINO belief is also the easiest to test.”

2. `hot_cold`
Second move:
- “Even ‘hot’ and ‘cold’ numbers mostly look like noise in costume.”

3. `pick_tradeoff`
Third move:
- “There is no golden pick size. Some picks feel better. None crosses 100% RTP.”

4. `pick_variance`
Fourth move:
- “High variance buys spike potential, not a better edge.”

5. `coverage_systems`
Fifth move:
- “Coverage is not profit.”

6. `ga`
Final move:
- “Even the machine-learning version of the fantasy still bent back toward randomness.”

Why this works:
- It starts with the myth everyone already recognizes.
- It ends with the most modern and surprising claim.
- It gives the thread a rising curve instead of a flat one.

Suggested X thread length:
- 5 to 7 posts
- one chart per post
- one declarative sentence on top
- one evidence sentence under it

Best compact X thread:
- `overdue_numbers`
- `parity_window`
- `pick_variance`
- `ga`

## 3. LinkedIn order

Goal: more reflective and explanatory than X, but shorter and sharper than Protagon.

Recommended order:

1. `fairness`
Use it to establish credibility.

2. `pick_tradeoff`
This is the best transition from “belief” to “game design”.

3. `pick_variance`
This is the most reusable chart for a managerial or strategic audience because it speaks about survival, variance, and tradeoffs.

4. `portfolio_scatter`
Useful for the “diversification does not rescue negative EV” argument.

5. `ga`
Strong closer, especially for audiences interested in AI.

Why this works:
- LinkedIn readers tolerate a little more argument.
- They respond well to “here is the tradeoff, here is the result, here is the managerial lesson.”

Best LinkedIn subset:
- `pick_tradeoff`
- `pick_variance`
- `ga`

That trio is the most portable across audiences.

## 4. The strongest chart for each use case

If you can publish only one:

- For Protagon: `pick_variance`
- For X / Twitter: `overdue_numbers`
- For LinkedIn: `ga`

Why:
- `pick_variance` is the cleanest bridge between feeling and arithmetic.
- `overdue_numbers` is the most instantly recognizable myth to demolish.
- `ga` is the most contemporary hook and broadens the article beyond gambling folklore.

## 5. Recommended notebook strategy

Use two Observable notebooks:

1. Main essay notebook
- imports `article.js`
- keeps the long-form magazine structure intact

2. Embeds notebook
- imports `embeds.js`
- one markdown cell plus one graphic cell per embed
- cleaner for iframe publishing and social reuse

That way:
- the narrative notebook stays elegant
- the embeds notebook stays modular
- both remain in sync because they share the same repo assets

## 6. Suggested editorial wrappers

Use the localized catalog from `embeds.js`:

```js
catalog = await kinoEmbeds.get_embed_catalog(lang)
```

Then for each embed:

```js
catalog.find(d => d.id === "pick_variance").title
catalog.find(d => d.id === "pick_variance").hook
```

This keeps:
- Protagon headings
- social hooks
- bilingual wording

in one place, instead of rewriting them manually per notebook.
