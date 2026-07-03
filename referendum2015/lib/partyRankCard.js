import { partyRank } from "./partyRank.js";

/**
 * Builds a self-contained "card" wrapping {@link partyRank}: an optional
 * title/subtitle plus the chart, styled with the site's `.card` class.
 * Centralizes the card markup so pages don't each re-declare their own
 * title/subtitle/figure boilerplate around the chart.
 *
 * @param {object} [options]
 * @param {string} [options.title] - Card heading. Omitted if not given.
 * @param {string} [options.subtitle] - Card subheading. Omitted if not given.
 * @param {number} [options.height=200] - Chart height in pixels.
 * @returns {HTMLDivElement & {update: (results: Iterable) => void}} The card's
 *   root DOM node. Call `.update(results)` to (re)render the chart inside it.
 */
export function partyRankCard({ title, subtitle, height = 200 } = {}) {
  const card = document.createElement("div");
  card.className = "card";

  if (title) {
    const h2 = document.createElement("h2");
    h2.textContent = title;
    card.append(h2);
  }

  if (subtitle) {
    const h3 = document.createElement("h3");
    h3.textContent = subtitle;
    card.append(h3);
  }

  const figure = document.createElement("figure");
  figure.style.maxWidth = "none";
  card.append(figure);

  const chart = partyRank(height);
  figure.append(chart);

  return Object.assign(card, {
    update(results) {
      chart.update(results);
    },
  });
}
