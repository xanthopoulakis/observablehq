import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import * as topojson from "https://cdn.jsdelivr.net/npm/topojson-client@3/+esm";
import { renderTooltip } from "./mapTooltip.js";

const topology = await (await fetch(new URL("../data/geo/kapodistrias.topojson.json", import.meta.url))).json();

// Maps a `unit_level` (as used throughout db.js) to the topojson property
// that groups the base kapodistrias-level geometries into that level.
const aggregationMapping = {
  globe: "epikrateia_id",
  eklogiki_perifereia: "eklogiki_perifereia_id",
  eklogiki_perifereia0: "eklogiki_perifereia_id0",
  kallikratis: "kallikratis_id",
  kapodistrias: "kapodistrias_id",
};

/**
 * Returns the set of unit ids (at `unitLevel`) that fall within a
 * {@link choropleth} instance's `topofilter` — i.e. which rows of a
 * `units` array that instance will actually draw. Callers use this to scope
 * a legend to only the values present in a pleth (e.g. a regional close-up
 * showing only 3 of the country's 8 parties shouldn't list all 8), without
 * duplicating choropleth's own base-geometry filtering logic.
 *
 * @param {(feature: object, index: number) => boolean} [topofilter] - Same
 *   filter passed to {@link choropleth}.
 * @param {string} [unitLevel="kallikratis"] - Same level passed to {@link choropleth}.
 * @returns {Set<number>}
 */
export function unitIdsInScope(topofilter = () => true, unitLevel = "kallikratis") {
  return new Set(
    topology.objects.collection.geometries
      .filter(topofilter)
      .map((g) => g.properties[aggregationMapping[unitLevel]]),
  );
}

/**
 * Renders a choropleth map of Greece: administrative-unit shapes filled per
 * `.update(units)`, with hover highlighting, a floating tooltip (delegated
 * to {@link renderTooltip}), and pinch/scroll zoom.
 *
 * The underlying topology is always the original kapodistrias-level
 * `kapodistrias.topojson.json` — coarser levels (kallikratis, electoral
 * constituencies, nationwide) are produced at render time by merging that
 * topology's base geometries via `topojson.merge`, grouped by the topojson
 * property named in `aggregationMapping`. This mirrors the source notebook:
 * there is exactly one topology, never a separately pre-dissolved file per
 * level.
 *
 * Coloring and tooltip content are entirely up to the caller: this
 * component only draws the shape a caller's `units` row says to draw. That
 * keeps it usable for any KPI (winning party, vote share, turnout, ...)
 * without knowing anything about elections or parties itself.
 *
 * `unitLevel` (kallikratis, eklogiki_perifereia, kapodistrias, ...) is an
 * `.update()`-time argument rather than fixed at construction: switching it
 * reuses the same SVG/defs/zoom instance and runs through the same
 * enter/update/exit shape join as an election change, instead of tearing
 * down and rebuilding the whole map. `topofilter` (the geographic extent —
 * which region this instance shows) *is* fixed at construction, since it
 * determines the map's projection/extent, computed once up front.
 *
 * @param {number} [width] - SVG width in pixels.
 * @param {number} [height] - SVG height in pixels. Defaults to `width / φ`.
 * @param {(feature: object, index: number) => boolean} [topofilter] - Filters
 *   which base (kapodistrias-level) topojson features/geometries are shown
 *   and used to compute the map's extent, e.g.
 *   `(f) => f.properties.eklogiki_perifereia_id === 22` to zoom into one
 *   electoral constituency. Defaults to showing all of Greece.
 * @returns {SVGSVGElement & {update: (units: Iterable, unitLevel?: string) => void}}
 *   The SVG node. Call `.update(units, unitLevel)` with rows each exposing:
 *   - `id`      — unit id at `unitLevel` (matches `administrative_units.id`)
 *   - `title`   — tooltip header (localized unit name)
 *   - `fill`    — resolved fill color for this unit
 *   - `listings` — tooltip rows: `{id, value, title}[]`
 *   to (re)render it. `unitLevel` defaults to `"kallikratis"` (see
 *   `aggregationMapping` for supported values).
 */
export function choropleth(width = 800, height = width / 1.618, topofilter = () => true) {
  const duration = 450;
  const gap = 10;
  const idSuffix = Math.random().toString(16).slice(2);

  let currentZoomScale = 1;
  let hoveredId = null;
  let tooltip = { pos: [0, 0], text: { header: "" }, listings: [], visible: false };

  // Framework's own `.grid svg { overflow: visible }` rule (meant for Plot
  // charts' axis labels) would otherwise let zoomed/panned shapes spill
  // outside the map's box — pin it back with an inline style, which wins
  // over that class-based rule regardless of stylesheet order.
  const svg = d3.create("svg")
    .attr("width", width)
    .attr("height", height)
    .style("background", "#FFF")
    .style("overflow", "hidden")
    // A fixed-width map (unlike the auto-resizing charts) is often narrower
    // than its card, so it needs to be centered explicitly rather than
    // sitting flush against the card's left edge.
    .style("display", "block")
    .style("margin", "0 auto");

  const topo = topojson.feature(topology, topology.objects.collection);
  topo.features = topo.features.filter(topofilter);

  const projection = d3.geoMercator().fitExtent([[gap, gap], [width - gap, height - gap]], topo);
  const shapeGenerator = d3.geoPath().projection(projection);

  const landBoundary = topojson.merge(topology, topology.objects.collection.geometries.filter(topofilter));

  const defs = svg.append("defs");

  defs
    .append("filter")
    .attr("id", `blur-${idSuffix}`)
    .append("feGaussianBlur")
    .attr("in", "SourceGraphic")
    .attr("stdDeviation", 5);

  svg.append("use")
    .attr("class", "land-glow")
    .style("fill-opacity", 0.2)
    .style("filter", `url(#blur-${idSuffix})`)
    .attr("xlink:href", `#land-${idSuffix}`);

  svg.append("use")
    .attr("class", "land-fill")
    .style("stroke", "#777")
    .style("fill", "whitesmoke")
    .attr("xlink:href", `#land-${idSuffix}`);

  const shapesContainer = svg.append("g").attr("class", "shapes-container");

  function showTooltip(event, d) {
    hoveredId = d.id;
    d3.select(event.currentTarget).attr("stroke", "#ff7f0e").attr("stroke-width", 2 / currentZoomScale).raise();
    tooltip.visible = true;
    tooltip.pos = [event.offsetX + 5, event.offsetY - 11];
    tooltip.text = { header: d.title };
    tooltip.listings = d.listings ?? [];
    renderTooltip(svg, tooltip, { width, height });
  }

  function hideTooltip(event, d) {
    hoveredId = null;
    d3.select(event.currentTarget).attr("stroke", "whitesmoke").attr("stroke-width", 0.5 / currentZoomScale);
    tooltip.visible = false;
    tooltip.listings = [];
    renderTooltip(svg, tooltip, { width, height });
  }

  function render(units, unitLevel) {
    const includedIds = unitIdsInScope(topofilter, unitLevel);
    const filteredUnits = Array.from(units).filter((d) => includedIds.has(d.id));

    let landPath = defs.selectAll("path.land").data([landBoundary]);

    landPath
      .enter()
      .append("path")
      .attr("class", "land")
      .style("stroke", "rgb(204, 204, 204)")
      .style("stroke-width", 0.85 / currentZoomScale)
      .attr("id", `land-${idSuffix}`)
      .merge(landPath)
      .attr("d", shapeGenerator);

    landPath.exit().remove();

    // Keyed by `unitLevel:id`, not just `id` — ids are assigned per-level
    // (e.g. kallikratis id 1 and eklogiki_perifereia id 1 are unrelated
    // units), so switching levels must always exit the old shapes and enter
    // new ones rather than risk a spurious cross-level "update" match.
    let shapes = shapesContainer.selectAll(".shape").data(filteredUnits, (d) => `${unitLevel}:${d.id}`);

    const shapesMerged = shapes
      .enter()
      .append("path")
      .attr("class", "shape")
      .attr("data-id", (d) => d.id)
      .attr("opacity", 0)
      .attr("stroke", "whitesmoke")
      .attr("fill", "white")
      .style("cursor", "pointer")
      .merge(shapes)
      .each((d, i) => {
        // `units` is a fresh array of plain objects on every call (it comes
        // from a db query, not a long-lived registry), so `border`/`order`
        // can't be cached on the datum across renders — recompute always.
        const geometries = topology.objects.collection.geometries.filter(
          (e) => e.properties[aggregationMapping[unitLevel]] === d.id,
        );
        d.border = topojson.merge(topology, geometries);
        // The base kapodistrias-level `order` property (roughly a
        // west-to-east/south-to-north geographic sequence) drives the
        // reveal stagger below, so shapes sweep across the map in a
        // geographically meaningful order rather than in arbitrary
        // query-result order.
        d.order = geometries.length > 0 ? geometries[0].properties.order : i;
      })
      .attr("stroke-width", 0.5 / currentZoomScale)
      .on("mouseover", showTooltip)
      .on("mousemove", showTooltip)
      .on("mouseout", hideTooltip);

    shapesMerged
      .transition()
      .duration(duration)
      .ease(d3.easeSinInOut)
      .delay((d, i) => (i + d.order) / 100.0)
      .attr("d", (d) => shapeGenerator(d.border))
      .attr("opacity", 1)
      .attr("fill", (d) => d.fill);

    shapes
      .exit()
      .transition()
      .duration(duration)
      .ease(d3.easeSinInOut)
      .attr("opacity", 0)
      .remove();

    const zoom = d3.zoom()
      .scaleExtent([1, 8])
      .translateExtent([[0, 0], [width, height]])
      .on("zoom", (e) => {
        currentZoomScale = e.transform.k;
        shapesContainer.attr("transform", e.transform);
        shapesContainer.selectAll("path.shape").attr("stroke-width", 0.5 / currentZoomScale);
        shapesContainer.selectAll("path.shape").filter((k) => k.id === hoveredId).attr("stroke-width", 2 / currentZoomScale);
        svg.select("path.land").attr("transform", e.transform).style("stroke-width", 0.85 / currentZoomScale);
      });

    svg.call(zoom);
  }

  return Object.assign(svg.node(), {
    update(units, unitLevel = "kallikratis") {
      render(units, unitLevel);
    },
  });
}
