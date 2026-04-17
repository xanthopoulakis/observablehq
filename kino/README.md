# kino

Observable notebook source bundle and research appendix for the KINO article.

## Use from Observable

In a JavaScript cell in Observable, import the article module from the GitHub-backed CDN:

```js
import {createKinoArticle} from "https://cdn.jsdelivr.net/gh/xanthopoulakis/observablehq@main/kino/article.js"
```

Then render it in another JavaScript cell:

```js
article = await createKinoArticle({Inputs, html, md})
```

The module automatically loads its sibling files from the same folder:

- `i18n.json`
- `styles.css`
- `data/kino.csv`

So once the repo is updated, the notebook stays in sync without re-uploading attachments.

## Folder layout

- `article.js`: GitHub-importable Observable article module
- `article-single-cell.ojs`: legacy single-cell Observable source
- `i18n.json`: bilingual copy for the article
- `styles.css`: presentation layer
- `data/kino.csv`: historical KINO dataset used by the article
- `research/code/`: Python analysis scripts used during the investigation
- `research/outputs/`: generated outputs that support the methodology and findings

## Notes

- The live notebook should import `article.js`; the `.ojs` file is kept as a fallback snapshot.
- The research outputs are intentionally included to support reproducibility and the article's methodology claims.
