# KINO embeds notebook scaffold

This file is a practical layout for a dedicated Observable notebook whose only job is to host embeddable sections and plots.

The pattern is:

1. one import cell
2. one language selector cell
3. one catalog helper cell
4. then, for each embed:
   - one markdown cell for the recommended headline and hook
   - one JavaScript cell that renders the embeddable node

## Cell 1: load the embeds module

```js
kinoEmbeds = await import("https://cdn.jsdelivr.net/gh/xanthopoulakis/observablehq@main/kino/embeds.js")
```

## Cell 2: language selector

```js
viewof lang = Inputs.radio(
  new Map([
    ["Ελληνικά", "el"],
    ["English", "en"]
  ]),
  {label: "Γλώσσα / Language", value: "el"}
)
```

## Cell 3: localized catalog

```js
catalog = await kinoEmbeds.get_embed_catalog(lang)
```

## Cell 4: fairness

```md
## ${catalog.find(d => d.id === "fairness").title}

${catalog.find(d => d.id === "fairness").hook}
```

```js
fairness = await kinoEmbeds.create_fairness_section({Inputs, html, md, lang})
```

## Cell 5: surrogate fit

```md
## ${catalog.find(d => d.id === "surrogate_fit").title}

${catalog.find(d => d.id === "surrogate_fit").hook}
```

```js
surrogateFit = await kinoEmbeds.create_surrogate_fit_plot({Inputs, html, md, lang, width: 960})
```

## Cell 6: overdue numbers

```md
## ${catalog.find(d => d.id === "overdue_numbers").title}

${catalog.find(d => d.id === "overdue_numbers").hook}
```

```js
overdueNumbers = await kinoEmbeds.create_overdue_numbers_plot({Inputs, html, md, lang, width: 960})
```

## Cell 7: hot and cold

```md
## ${catalog.find(d => d.id === "hot_cold").title}

${catalog.find(d => d.id === "hot_cold").hook}
```

```js
hotCold = await kinoEmbeds.create_hot_cold_plot({Inputs, html, md, lang, width: 960})
```

## Cell 8: parity windows

```md
## ${catalog.find(d => d.id === "parity_window").title}

${catalog.find(d => d.id === "parity_window").hook}
```

```js
parityWindow = await kinoEmbeds.create_parity_window_plot({
  Inputs,
  html,
  md,
  lang,
  width: 960,
  parity_target: "draw",
  parity_window: 100
})
```

## Cell 9: pick tradeoff

```md
## ${catalog.find(d => d.id === "pick_tradeoff").title}

${catalog.find(d => d.id === "pick_tradeoff").hook}
```

```js
pickTradeoff = await kinoEmbeds.create_pick_tradeoff_plot({Inputs, html, md, lang, width: 960})
```

## Cell 10: pick variance

```md
## ${catalog.find(d => d.id === "pick_variance").title}

${catalog.find(d => d.id === "pick_variance").hook}
```

```js
pickVariance = await kinoEmbeds.create_pick_variance_section({Inputs, html, md, lang, width: 960})
```

## Cell 11: combined strategies

```md
## ${catalog.find(d => d.id === "portfolio_scatter").title}

${catalog.find(d => d.id === "portfolio_scatter").hook}
```

```js
portfolioScatter = await kinoEmbeds.create_portfolio_scatter_plot({Inputs, html, md, lang, width: 960})
```

## Cell 12: bankroll path

```md
## ${catalog.find(d => d.id === "portfolio_bankroll").title}

${catalog.find(d => d.id === "portfolio_bankroll").hook}
```

```js
portfolioBankroll = await kinoEmbeds.create_portfolio_bankroll_plot({Inputs, html, md, lang, width: 960, horizon: 5000})
```

## Cell 13: coverage systems

```md
## ${catalog.find(d => d.id === "coverage_systems").title}

${catalog.find(d => d.id === "coverage_systems").hook}
```

```js
coverageSystems = await kinoEmbeds.create_coverage_systems_plot({Inputs, html, md, lang, width: 960})
```

## Cell 14: genetic algorithm

```md
## ${catalog.find(d => d.id === "ga").title}

${catalog.find(d => d.id === "ga").hook}
```

```js
gaSection = await kinoEmbeds.create_ga_section({Inputs, html, md, lang, width: 960})
```

## Suggested use

- For Protagon embeds: keep the markdown heading cell immediately above the graphic cell.
- For Twitter / LinkedIn cards: use just the heading text and one plot cell per notebook.
- For a newsroom workflow: duplicate the notebook and remove every cell except the one chart you want to publish.
