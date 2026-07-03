import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

let measureCanvas;

function measureTextWidth(text, font = "10px sans-serif") {
  measureCanvas ??= document.createElement("canvas");
  const context = measureCanvas.getContext("2d");
  context.font = font;
  return context.measureText(text).width;
}

/**
 * Renders (or updates/hides) a floating tooltip inside a choropleth's SVG —
 * a header line plus a list of `{value, title}` rows, positioned near the
 * cursor and clamped so it never overflows the SVG's bounds.
 *
 * Kept separate from {@link choropleth} because tooltip *content* is
 * entirely KPI-dependent (winning party, vote share, turnout, ...) — the
 * caller builds `obj.text`/`obj.listings` however it likes; this module only
 * knows how to lay a header + listing rows out and animate them in/out.
 *
 * @param {d3.Selection} svg - The choropleth's root `<svg>` selection.
 * @param {object} obj - Tooltip state.
 * @param {[number, number]} obj.pos - Cursor position (SVG coordinates).
 * @param {{header: string}} obj.text - Tooltip header text.
 * @param {Array<{id: *, value: string, title: string}>} obj.listings - Rows
 *   shown below the header, rendered as `"${value}  ${title}"`.
 * @param {boolean} obj.visible - Whether the tooltip should be shown.
 * @param {number} width - SVG width, used to clamp the tooltip on-screen.
 * @param {number} height - SVG height, used to clamp the tooltip on-screen.
 */
export function renderTooltip(svg, obj, { width, height }) {
  const gap = 10;
  const fontCoeff = 1.3;
  const lineHeight = 11;

  const { header } = obj.text;
  const textWidth = 2 * gap + fontCoeff * d3.max(
    [header, ...obj.listings.map((e) => `${e.value}  ${e.title}`)],
    (d) => measureTextWidth(d),
  );
  const boxHeight = 3 * gap + (1.5 * obj.listings.length + 1.5) * lineHeight;
  const diffX = Math.max(0, obj.pos[0] + textWidth - width + gap);
  const diffY = Math.max(0, obj.pos[1] + boxHeight - height);

  let tooltipGroup = svg.selectAll("g.tooltip").data([obj]);

  tooltipGroup = tooltipGroup
    .enter()
    .append("g")
    .attr("class", "tooltip")
    .style("pointer-events", "none")
    .merge(tooltipGroup)
    .attr("transform", `translate(${[obj.pos[0] - diffX, obj.pos[1] - diffY]})`)
    .style("opacity", obj.visible ? 1 : 0);

  let tooltipBg = tooltipGroup.selectAll("rect.tooltip-bg").data((d) => [d]);

  tooltipBg
    .enter()
    .append("rect")
    .attr("class", "tooltip-bg")
    .attr("rx", 5)
    .attr("ry", 5)
    .attr("y", -gap)
    .attr("fill", "rgb(97, 97, 97)")
    .attr("fill-opacity", 0.67)
    .merge(tooltipBg)
    .attr("width", textWidth)
    .attr("height", boxHeight);

  let tooltipHeaderText = tooltipGroup.selectAll("text.tooltip-header-text").data((d) => [d]);

  tooltipHeaderText
    .enter()
    .append("text")
    .attr("class", "tooltip-header-text")
    .attr("dy", gap + lineHeight / 2)
    .attr("dx", gap)
    .attr("text-anchor", "start")
    .style("fill", "#FFF")
    .style("font", "12px/1.5 var(--sans-serif)")
    .style("font-weight", "bold")
    .merge(tooltipHeaderText)
    .text((d) => d.text.header);

  let tooltipHeaderSeparator = tooltipGroup.selectAll("line.separator").data((d) => [d]);

  tooltipHeaderSeparator
    .enter()
    .append("line")
    .attr("class", "separator")
    .style("stroke", "#FFF")
    .style("stroke-width", 1.5)
    .attr("y1", gap + lineHeight)
    .attr("y2", gap + lineHeight)
    .attr("x1", gap)
    .merge(tooltipHeaderSeparator)
    .attr("x2", textWidth - gap);

  let tooltipListings = tooltipGroup.selectAll("text.tooltip-listing").data((d) => d.listings, (d) => d.id);

  tooltipListings
    .enter()
    .append("text")
    .attr("class", "tooltip-listing")
    .attr("dx", gap)
    .attr("text-anchor", "start")
    .style("fill", "#FFF")
    .style("font", "10px/1.5 var(--sans-serif)")
    .style("font-weight", "bold")
    .merge(tooltipListings)
    .attr("transform", (d, i) => `translate(${[0, gap + (1.5 * i + 1.5) * lineHeight]})`)
    .attr("dy", gap)
    .text((d) => `${d.value}  ${d.title}`);

  tooltipListings.exit().remove();
}
