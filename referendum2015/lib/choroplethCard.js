import { choropleth } from "./choropleth.js";
import { Legend, Swatches } from "./legend.js";

function isOrdinal(colorScale) {
  return !colorScale.interpolate && !colorScale.interpolator && !colorScale.invertExtent;
}

/**
 * Builds a self-contained "card" wrapping {@link choropleth}: an optional
 * title/subtitle, a color legend, and the map, styled with the site's
 * `.card` class. Centralizes the card markup so pages don't each re-declare
 * their own title/subtitle/legend/figure boilerplate around the map.
 *
 * The legend is rendered separately from the map itself (via
 * {@link Legend}/{@link Swatches}) because the same {@link choropleth}
 * instance is reused across very different KPIs — winning party (ordinal),
 * vote share or turnout (continuous) — and each needs a different legend
 * shape. Pass whichever color scale produced each unit's `fill` to
 * `.update(units, colorScale)` and the right legend renders automatically:
 * an ordinal scale (`d3.scaleOrdinal`) defaults to {@link Swatches} (a
 * row of labeled color boxes — for an open-ended list like "which party
 * won"), everything else to {@link Legend}. Pass `legendStyle: "bar"` to
 * force an ordinal scale through {@link Legend} instead — its own ordinal
 * branch renders a labeled color *strip* (ColorBrewer-style), which reads
 * better for a short, inherently-ordered domain like rank or seat-count
 * bands ("1st", "2nd", ..., "5th+").
 *
 * `unitLevel` is an `.update()`-time argument, not a constructor option —
 * see {@link choropleth} for why (switching levels reuses the same map
 * instance instead of rebuilding it).
 *
 * @param {object} [options]
 * @param {string} [options.title] - Card heading. Omitted if not given.
 * @param {string} [options.subtitle] - Card subheading. Omitted if not given.
 * @param {number} [options.width=800] - Map width in pixels.
 * @param {number} [options.height] - Map height in pixels. Defaults to `width / φ`.
 * @param {(feature: object, index: number) => boolean} [options.topofilter] -
 *   Forwarded to {@link choropleth}.
 * @param {string} [options.legendTitle] - Default title shown above a
 *   continuous/bar legend. Overridable per `.update()` call, for KPIs
 *   whose legend title is itself data-dependent (e.g. naming the two
 *   parties in a margin map).
 * @param {string|Function} [options.legendTickFormat] - Default tick
 *   format, forwarded to {@link Legend}. Overridable per `.update()` call,
 *   for KPIs whose ticks aren't percentages (e.g. plain rank/seat counts).
 *   Ignored for a `Swatches` legend.
 * @returns {HTMLDivElement & {update: (units: Iterable, colorScale: Function, options?: {subtitle?: string, unitLevel?: string, legendTitle?: string, legendTickFormat?: (string|Function), legendStyle?: "swatches"|"bar", legendTickSize?: number}) => void}}
 *   The card's root DOM node. Call `.update(units, colorScale, options?)`
 *   to (re)render the map and its legend in place — the underlying
 *   {@link choropleth} instance (and its DOM) is created once and reused
 *   across calls, so shapes transition between states instead of
 *   remounting. Pass `options.subtitle` to also update the card's
 *   subheading (e.g. when it names a KPI-dependent value like the selected
 *   party). `options.legendTitle`/`legendTickFormat` override the
 *   constructor's defaults for this call only; omitted options fall back
 *   to those defaults (or, for `legendStyle`, to auto-detecting from
 *   `colorScale`).
 */
export function choroplethCard({
  title,
  subtitle,
  width = 800,
  height = width / 1.618,
  topofilter,
  legendTitle: defaultLegendTitle,
  legendTickFormat: defaultLegendTickFormat,
} = {}) {
  const card = document.createElement("div");
  card.className = "card";

  if (title) {
    const h2 = document.createElement("h2");
    h2.textContent = title;
    card.append(h2);
  }

  const h3 = document.createElement("h3");
  h3.textContent = subtitle ?? "";
  h3.hidden = !subtitle;
  card.append(h3);

  const legendContainer = document.createElement("div");
  card.append(legendContainer);

  const figure = document.createElement("figure");
  figure.style.maxWidth = "none";
  card.append(figure);

  const chart = choropleth(width, height, topofilter);
  figure.append(chart);

  return Object.assign(card, {
    update(units, colorScale, {
      subtitle,
      unitLevel,
      legendTitle = defaultLegendTitle,
      legendTickFormat = defaultLegendTickFormat,
      legendStyle,
      legendTickSize = 6,
    } = {}) {
      if (subtitle !== undefined) {
        h3.textContent = subtitle;
        h3.hidden = false;
      }
      const useSwatches = legendStyle === "swatches" || (legendStyle === undefined && isOrdinal(colorScale));
      legendContainer.replaceChildren(
        useSwatches
          ? Swatches(colorScale, {})
          : Legend(colorScale, { title: legendTitle, tickFormat: legendTickFormat, tickSize: legendTickSize, width: Math.min(320, width) }),
      );
      chart.update(units, unitLevel);
    },
  });
}
