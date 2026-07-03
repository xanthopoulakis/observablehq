# referendum2015

Observable notebook source bundle for an article on the 5 July 2015 Greek
referendum: the national result looks like an OXI landslide on any map, but
the municipality/community-level data tells a much more textured story.

## Use from Observable

In a normal Observable JavaScript cell, use dynamic `import()` rather than a top-level `import` statement.

```js
article = {
  const {createReferendum2015Article} = await import("https://cdn.jsdelivr.net/gh/xanthopoulakis/observablehq@main/referendum2015/article.js");
  return createReferendum2015Article({Inputs, html, md});
}
```

The module fetches its own data and stylesheet from the same folder at
import time, so once the repo is updated the notebook stays in sync without
re-uploading attachments:

- `styles.css`
- `data/parties.json`, `data/national.json`
- `data/units_kallikratis.json`, `data/units_kapodistrias.json`, `data/units_eklogiki_perifereia0.json`
- `data/geo/kapodistrias.topojson.json`

### Individual embeddable charts and maps

```js
r2015Embeds = await import("https://cdn.jsdelivr.net/gh/xanthopoulakis/observablehq@main/referendum2015/embeds.js")
```

```js
winnerKallikratis = await r2015Embeds.create_winner_map_embed({Inputs, html, md, level: "kallikratis"})
```

Each embed is a single, self-contained title+chart node — meant to be
published on its own (a tweet's image, an iframe in a media article, a
standalone Observable share URL) rather than as part of the full essay. The
full catalog (id, factory function, args, title, one-line hook) is available
as:

```js
catalog = await r2015Embeds.get_embed_catalog()
```

A ready-made notebook source for this modular workflow is included as
`embeds-notebook.ojs` — see `EMBEDS_NOTEBOOK.md` for the cell-by-cell layout
and publishing tips (downloading a cell as a PNG for Twitter/X, embedding an
iframe, etc).

## Folder layout

- `article.js`: GitHub-importable Observable article module (the entry point above)
- `embeds.js`: embeddable chart/map builders for standalone publishing (iframes, social cards, individual notebook cells)
- `EMBEDS_NOTEBOOK.md`: ready-made cell layout for a dedicated embeds notebook
- `embeds-notebook.ojs`: ready-to-paste Observable notebook source for the embeds notebook
- `shared.js`: data/library loader (`load_bundle()`) and small DOM/block helpers
- `lib/`: election-atlas's map/chart components, forked to run standalone (no
  Observable Framework, no DuckDB) — see "Provenance" below
- `data/`: flat JSON data files + the kapodistrias topology, written by `scripts/export_data.rb`
- `scripts/export_data.rb`: collects the data in this repo from
  election-atlas's `common/raw/ypes/r2015` scrape + registries. Re-run after
  any upstream correction to the r2015 data or to the OXI/NAI color/logo/key
  in `common/data/registry/parties.yml`:

  ```sh
  ruby scripts/export_data.rb
  # or, if election-atlas isn't checked out as a sibling of this repo:
  ELECTION_ATLAS_ROOT=/path/to/election-atlas ruby scripts/export_data.rb
  ```

- `styles.css`: presentation layer (self-contained; no dependency on
  Observable Framework's theme CSS)

## Provenance

`lib/` is a Greek-only, standalone fork of these election-atlas modules
(`apps/framework/src/{components,helpers}/`), current as of the commit that
added the referendum choropleth/statisticsTrail work:

| here | election-atlas |
| --- | --- |
| `lib/choropleth.js` | `components/choropleth.js` (topojson loaded via `fetch`, not `FileAttachment`) |
| `lib/choroplethCard.js` | `components/choroplethCard.js` |
| `lib/choroplethKpis.js` | `helpers/choroplethKpis.js` (unchanged) |
| `lib/legend.js` | `helpers/legend.js` (unchanged) |
| `lib/mapTooltip.js` | `components/mapTooltip.js` (unchanged) |
| `lib/partyRank.js` | `components/partiesRow.js`, renamed, i18n stripped (Greek-only) |
| `lib/partyRankCard.js` | `components/partiesRowCard.js`, renamed, i18n stripped |

Only the import statements (`npm:d3` → a jsDelivr `+esm` URL,
`observablehq:stdlib`'s `FileAttachment` → plain `fetch`) and the
locale/i18n plumbing changed — the actual chart/map logic is untouched.

## Notes

- No language toggle: unlike `kino`, this article is Greek-only.
- The data (`data/*.json`) is the *only* place this repo derives numbers from
  — every stat named in the article's copy was computed from those files
  (see `scripts/export_data.rb`'s output), not estimated.
