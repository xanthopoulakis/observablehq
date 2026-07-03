import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

function ramp(color, n = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  for (let i = 0; i < n; ++i) {
    context.fillStyle = color(i / (n - 1));
    context.fillRect(i, 0, 1, 1);
  }
  return canvas;
}

/**
 * Renders a color legend for a D3 scale — a continuous ramp for
 * linear/sequential/diverging scales, a stepped bar for threshold/quantile
 * scales, or a row of swatches for ordinal/band scales. Ported from
 * Observable's "d3: Color legend" notebook (`@d3/color-legend`), which isn't
 * published as an npm package.
 *
 * @param {d3.ScaleContinuousNumeric|Function} color - The scale to render a
 *   legend for.
 * @param {object} [options]
 * @param {string} [options.title] - Legend title, shown above the axis.
 * @param {number} [options.width=320]
 * @param {number} [options.height]
 * @param {number} [options.ticks] - Approximate tick count.
 * @param {string|Function} [options.tickFormat]
 * @param {Array} [options.tickValues]
 * @returns {SVGSVGElement}
 */
export function Legend(color, {
  title,
  tickSize = 6,
  width = 320,
  height = 44 + tickSize,
  marginTop = 18,
  marginRight = 0,
  marginBottom = 16 + tickSize,
  marginLeft = 0,
  ticks = width / 64,
  tickFormat,
  tickValues,
} = {}) {
  const svg = d3.create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .style("overflow", "visible")
    .style("display", "block");

  let tickAdjust = (g) => g.selectAll(".tick line").attr("y1", marginTop + marginBottom - height);
  let x;

  if (color.interpolate) {
    // Continuous scale (e.g. scaleLinear with a color interpolator range).
    const n = Math.min(color.domain().length, color.range().length);

    x = color.copy().rangeRound(d3.quantize(d3.interpolate(marginLeft, width - marginRight), n));

    svg.append("image")
      .attr("x", marginLeft)
      .attr("y", marginTop)
      .attr("width", width - marginLeft - marginRight)
      .attr("height", height - marginTop - marginBottom)
      .attr("preserveAspectRatio", "none")
      .attr("xlink:href", ramp(color.copy().domain(d3.quantize(d3.interpolate(0, 1), n))).toDataURL());
  } else if (color.interpolator) {
    // Sequential or diverging scale.
    x = Object.assign(
      color.copy().interpolator(d3.interpolateRound(marginLeft, width - marginRight)),
      { range() { return [marginLeft, width - marginRight]; } },
    );

    svg.append("image")
      .attr("x", marginLeft)
      .attr("y", marginTop)
      .attr("width", width - marginLeft - marginRight)
      .attr("height", height - marginTop - marginBottom)
      .attr("preserveAspectRatio", "none")
      .attr("xlink:href", ramp(color.interpolator()).toDataURL());

    if (!x.ticks) {
      if (tickValues === undefined) {
        const n = Math.round(ticks + 1);
        tickValues = d3.range(n).map((i) => d3.quantile(color.domain(), i / (n - 1)));
      }
      if (typeof tickFormat !== "function") {
        tickFormat = d3.format(tickFormat === undefined ? ",f" : tickFormat);
      }
    }
  } else if (color.invertExtent) {
    // Threshold or quantile scale.
    const thresholds = color.thresholds ? color.thresholds()
      : color.quantiles ? color.quantiles()
        : color.domain();

    const thresholdFormat = tickFormat === undefined ? (d) => d
      : typeof tickFormat === "string" ? d3.format(tickFormat)
        : tickFormat;

    x = d3.scaleLinear()
      .domain([-1, color.range().length - 1])
      .rangeRound([marginLeft, width - marginRight]);

    svg.append("g")
      .selectAll("rect")
      .data(color.range())
      .join("rect")
      .attr("x", (d, i) => x(i - 1))
      .attr("y", marginTop)
      .attr("width", (d, i) => x(i) - x(i - 1))
      .attr("height", height - marginTop - marginBottom)
      .attr("fill", (d) => d);

    tickValues = d3.range(thresholds.length);
    tickFormat = (i) => thresholdFormat(thresholds[i], i);
  } else {
    // Ordinal or band scale.
    x = d3.scaleBand()
      .domain(color.domain())
      .rangeRound([marginLeft, width - marginRight]);

    svg.append("g")
      .selectAll("rect")
      .data(color.domain())
      .join("rect")
      .attr("x", x)
      .attr("y", marginTop)
      .attr("width", Math.max(0, x.bandwidth() - 1))
      .attr("height", height - marginTop - marginBottom)
      .attr("fill", color);

    tickAdjust = () => {};
  }

  svg.append("g")
    .attr("transform", `translate(0,${height - marginBottom})`)
    .call(d3.axisBottom(x)
      .ticks(ticks, typeof tickFormat === "string" ? tickFormat : undefined)
      .tickFormat(typeof tickFormat === "function" ? tickFormat : undefined)
      .tickSize(tickSize)
      .tickValues(tickValues))
    .call(tickAdjust)
    .call((g) => g.select(".domain").remove())
    .call((g) => g.append("text")
      .attr("x", marginLeft)
      .attr("y", marginTop + marginBottom - height - 6)
      .attr("fill", "currentColor")
      .attr("text-anchor", "start")
      .attr("font-weight", "bold")
      .attr("class", "title")
      .text(title));

  return svg.node();
}

/**
 * Renders a row of labeled color swatches for an ordinal scale — the
 * categorical counterpart to {@link Legend}'s continuous ramp. Ported from
 * the same `@d3/color-legend` notebook, using plain DOM instead of `htl`
 * (which this project doesn't otherwise depend on).
 *
 * @param {d3.ScaleOrdinal} color - The ordinal scale to render swatches for.
 * @param {object} [options]
 * @param {Function} [options.format] - Formats each domain value into a label.
 * @param {number} [options.swatchSize=15]
 * @returns {HTMLDivElement}
 */
export function Swatches(color, { format = (d) => d, swatchSize = 15 } = {}) {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexWrap = "wrap";
  wrapper.style.alignItems = "center";
  wrapper.style.font = "10px var(--sans-serif)";

  for (const value of color.domain()) {
    const item = document.createElement("div");
    item.style.display = "flex";
    item.style.alignItems = "center";
    item.style.marginRight = "1em";
    item.style.marginBottom = "2px";

    const swatch = document.createElement("div");
    swatch.style.width = `${swatchSize}px`;
    swatch.style.height = `${swatchSize}px`;
    swatch.style.marginRight = "0.5em";
    swatch.style.background = color(value);
    item.append(swatch);

    const label = document.createElement("div");
    label.textContent = format(value);
    item.append(label);

    wrapper.append(item);
  }

  return wrapper;
}
