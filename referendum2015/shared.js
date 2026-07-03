const module_root_url = new URL(".", import.meta.url);

let bundle_promise = null;

async function fetch_json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.json();
}

async function fetch_text(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

export function ensure_stylesheet(html, stylesheet) {
  const existing = document.querySelector('style[data-referendum2015-article="true"]');
  if (existing) return existing;
  const style = html`<style data-referendum2015-article="true">${stylesheet}</style>`;
  document.head.append(style);
  return style;
}

function block(html, node, class_name = "prose-block") {
  const wrapper = html`<div class="${class_name}"></div>`;
  wrapper.append(node);
  return wrapper;
}

export function create_block_helpers({ html, md }) {
  return {
    block: (node, class_name) => block(html, node, class_name),
    markdown_block: (source, class_name = "prose-block") => block(html, md`${source}`, class_name),
    heading_block: (text, level = 2, class_name = "prose-block") =>
      block(html, md`${"#".repeat(level)} ${text}`, class_name),
  };
}

/**
 * Loads (and memoizes) every dataset and library module this article needs:
 * d3, the ported election-atlas choropleth/partyRank components, and the
 * r2015 data files `scripts/export_data.rb` wrote into `data/`.
 *
 * @returns {Promise<object>} A bundle exposing `d3`, `stylesheet`, `parties`
 *   (`{oxi, nai}`), `national` (`{parties, stats}`), and `unitsByLevel`
 *   (keyed `"kallikratis"|"kapodistrias"|"eklogiki_perifereia0"`, each an
 *   array of unit×party rows shaped like election-atlas's
 *   `choroplethForElection` — see `lib/choroplethKpis.js`).
 */
export async function load_bundle() {
  if (bundle_promise) return bundle_promise;

  bundle_promise = (async () => {
    const d3 = await import("https://cdn.jsdelivr.net/npm/d3@7/+esm");
    const stylesheet = await fetch_text(new URL("styles.css", import.meta.url));

    const levels = ["kallikratis", "kapodistrias", "eklogiki_perifereia0"];
    const [parties, national, ...levelRows] = await Promise.all([
      fetch_json(new URL("data/parties.json", import.meta.url)),
      fetch_json(new URL("data/national.json", import.meta.url)),
      ...levels.map((level) => fetch_json(new URL(`data/units_${level}.json`, import.meta.url))),
    ]);

    const unitsByLevel = Object.fromEntries(levels.map((level, i) => [level, levelRows[i]]));

    return { module_root_url, d3, stylesheet, parties, national, unitsByLevel };
  })();

  return bundle_promise;
}
