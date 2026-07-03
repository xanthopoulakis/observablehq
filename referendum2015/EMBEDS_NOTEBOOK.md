# referendum2015 embeds notebook scaffold

This file is a practical layout for a dedicated Observable notebook whose
only job is to host embeddable charts/maps — the same principle as kino's
`EMBEDS_NOTEBOOK.md`, adapted for this (Greek-only) project.

The pattern is:

1. one import cell
2. one catalog helper cell
3. then, for each embed: one markdown cell for the recommended headline and
   hook, followed by one JavaScript cell that renders the embeddable node

## Cell 1: load the embeds module

```js
r2015Embeds = await import("https://cdn.jsdelivr.net/gh/xanthopoulakis/observablehq@main/referendum2015/embeds.js")
```

## Cell 2: catalog

```js
catalog = await r2015Embeds.get_embed_catalog()
embed = (id) => catalog.find((d) => d.id === id)
```

## Cells 3+: one per embed

```md
## ${embed("winner_kallikratis").title}

${embed("winner_kallikratis").hook}
```

```js
winnerKallikratis = await r2015Embeds.create_winner_map_embed({Inputs, html, md, level: "kallikratis", width: 640})
```

Repeat for every id in `embeds.js`'s `embed_catalog`:

| id | factory | args |
| --- | --- | --- |
| `party_rank` | `create_party_rank_embed` | — |
| `winner_perifereies` | `create_winner_map_embed` | `{level: "eklogiki_perifereia0"}` |
| `winner_kallikratis` | `create_winner_map_embed` | `{level: "kallikratis"}` |
| `winner_kapodistrias` | `create_winner_map_embed` | `{level: "kapodistrias"}` |
| `oxi_absolute` | `create_oxi_share_embed` | `{mode: "absolute"}` |
| `oxi_relative` | `create_oxi_share_embed` | `{mode: "relative"}` |
| `margin` | `create_margin_embed` | — |
| `invalid_blank` | `create_invalid_blank_embed` | — |
| `abstention` | `create_abstention_embed` | — |

A ready-made notebook source with every cell already written out is in
`embeds-notebook.ojs`.

## Suggested use

- **For Twitter/X or LinkedIn**: duplicate the notebook and keep just the
  heading markdown cell and the one chart cell you want to publish. Use the
  cell's `···` menu → "Download PNG" (or "Copy image") to get a static image
  to attach to a post, or Share → Embed for a live iframe.
- **For a newsroom/media embed**: keep the markdown heading immediately
  above the chart cell so an `<iframe>` of that cell range includes both.
- Every embed loads its own data/stylesheet independently (via
  `shared.js`'s `load_bundle()`, memoized), so cells can be copied into a
  fresh notebook without carrying over anything else from the main article
  notebook.
