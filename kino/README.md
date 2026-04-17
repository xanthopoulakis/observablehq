# kino

Observable notebook source bundle and research appendix for the KINO article.

## Use from Observable

In a normal Observable JavaScript cell, use dynamic `import()` rather than a top-level `import` statement.

### Full article

```js
kinoArticleModule = await import("https://cdn.jsdelivr.net/gh/xanthopoulakis/observablehq@main/kino/article.js")
```

```js
article = await kinoArticleModule.createKinoArticle({Inputs, html, md})
```

### Individual embeddable plots and sections

```js
kinoEmbeds = await import("https://cdn.jsdelivr.net/gh/xanthopoulakis/observablehq@main/kino/embeds.js")
```

```js
pickVariance = await kinoEmbeds.create_pick_variance_section({Inputs, html, md, lang: "el"})
```

```js
gaPlot = await kinoEmbeds.create_ga_plot({Inputs, html, md, lang: "en", width: 900})
```

Localized editorial metadata for those embeds is available too:

```js
catalog = await kinoEmbeds.get_embed_catalog("el")
```

The module automatically loads its sibling files from the same folder:

- `i18n.json`
- `styles.css`
- `data/kino.csv`

So once the repo is updated, the notebook stays in sync without re-uploading attachments.

## Folder layout

- `article.js`: GitHub-importable Observable article module
- `embeds.js`: embeddable plot and section builders for iframes, social cards, and standalone notebook cells
- `shared.js`: common data loading, formatting, and statistical helpers
- `EMBEDS_NOTEBOOK.md`: ready-made cell layout for a dedicated embeds notebook
- `article-single-cell.ojs`: legacy single-cell Observable source
- `i18n.json`: bilingual copy for the article
- `styles.css`: presentation layer
- `data/kino.csv`: historical KINO dataset used by the article
- `research/code/`: Python analysis scripts used during the investigation
- `research/outputs/`: generated outputs that support the methodology and findings

## Notes

- The live notebook can import `article.js` for the full essay and `embeds.js` for standalone sections.
- The `.ojs` file is kept as a fallback snapshot.
- The research outputs are intentionally included to support reproducibility and the article's methodology claims.
