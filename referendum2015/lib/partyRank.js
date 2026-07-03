import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

// Greek-only fork of election-atlas's `partiesRow` (renamed here to
// `partyRank`, matching what this project's article calls it) — the
// locale/i18n plumbing was dropped since this project only ever renders in
// Greek, not ported wholesale.
const numberFormat = { decimal: ",", thousands: ".", grouping: [3], currency: ["€", ""] };
const OTHER_PARTY_LABEL = "Λοιπά";
const NO_DATA_LABEL = "Δεν υπάρχουν διαθέσιμα αποτελέσματα";

function placeholderLogoDataUrl(width, height, text) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<rect width="${width}" height="${height}" fill="#FFF"/>`
    + `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#1b1e23" font-family="sans-serif" font-size="14">${text}</text>`
    + `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Creates the ranked-party-row chart shell: a row of result cards, each
 * showing a party's logo, vote share, seats won, and vote count. Parties
 * below 3% vote share are collapsed into a single "Other" card.
 *
 * The chart is created once and fed data via `.update(results)` — reusing
 * the same DOM nodes (keyed by `party_id`) across calls, so boxes that
 * persist between two elections reposition/recolor in place instead of
 * exiting and re-entering. Width is not a constructor argument: the chart
 * fills its parent's width and repositions itself automatically whenever
 * that parent is resized (via a `ResizeObserver` on the wrapper element),
 * so it can be dropped into any container without knowing its size upfront.
 * If the container is too narrow to fit every box at its fixed size, the
 * chart scrolls horizontally instead of clipping or overlapping boxes.
 *
 * @param {number} height - SVG height in pixels. Defaults to 200.
 * @returns {HTMLDivElement & {update: (results: Iterable) => void}} The
 *   wrapper DOM node. Call `.update(results)` with a row iterable (each row
 *   exposing `party_id`, `party_percentage`, `votes`, `seats`, `party_color`,
 *   `party_logo`) to (re)render it.
 */
export function partyRank(height = 200) {
  const formatPerc = d3.formatLocale(numberFormat).format(".2%");
  const formatVotes = d3.formatLocale(numberFormat).format(",d");
  const formatSeats = d3.formatLocale(numberFormat).format(".0f");

  const phi = (1 + Math.sqrt(5)) / 2;
  const boxWidth = 96, boxGap = 10, boxHeight = boxWidth * phi, vGap = (height - boxHeight) / 2, padding = 10;
  const duration = 1000;

  const otherPartyLogo = placeholderLogoDataUrl(
    boxWidth - 2 * padding,
    boxHeight / phi - padding,
    OTHER_PARTY_LABEL,
  );

  let width = 0;
  let lastResults = [];

  let wrapper = d3.create("div").style("width", "100%").style("overflow-x", "auto").style("overflow-y", "hidden");
  let svg = wrapper.append("svg").attr("height", height).style("display", "block").style("background", "#FFF");
  let container = svg.append("g").attr("class", "container");

  svg
    .append("text")
    .attr("class", "no-data")
    .attr("text-anchor", "middle")
    .attr("opacity", 0)
    .text(NO_DATA_LABEL);

  function render() {
    if (!width) return;

    svg.select("text.no-data").attr("transform", `translate(${[width / 2, height / 2]})`);

    let allParties = Array.from(lastResults, d => ({
      party_id: +d.party_id,
      party_percentage: +d.party_percentage,
      votes: +d.votes,
      seats: +d.seats,
      color: d.party_color,
      logo: d.party_logo,
    }));
    let outsideParties = allParties.filter(d => d.party_percentage < 0.03);
    let parties = allParties.filter(d => d.party_percentage >= 0.03);

    outsideParties.length > 0 && parties.push({
      party_id: 0,
      party_percentage: d3.sum(outsideParties, d => d.party_percentage),
      votes: d3.sum(outsideParties, d => d.votes),
      seats: 0,
      color: "#dae0e5",
      logo: otherPartyLogo,
    });

    // contentWidth grows past the visible `width` (enabling horizontal
    // scroll on the wrapper) instead of squeezing boxes into a negative
    // margin when there isn't enough room to fit them all at fixed size.
    let requiredWidth = parties.length * boxWidth + Math.max(parties.length - 1, 0) * boxGap;
    let contentWidth = Math.max(width, requiredWidth);
    let margin = (contentWidth - requiredWidth) / 2;

    svg.attr("width", contentWidth);
    svg.select("text.no-data").attr("opacity", parties.length > 0 ? 0 : 1);

    container
      .transition()
      .ease(d3.easeSinOut)
      .duration(duration)
      .attr("opacity", 1)
      .attr("transform", `translate(${[margin, vGap]})`);

    let boxes = container.selectAll("g.box-container").data(parties, d => d.party_id);

    boxes
      .enter()
      .append("g")
      .attr("class", "box-container")
      .attr("opacity", 0)
      .attr("transform", (d, i) => `translate(${[contentWidth, 0]})`)
      .transition()
      .ease(d3.easeSinOut)
      .duration(duration)
      .attr("opacity", 1)
      .attr("transform", (d, i) => `translate(${[i * (boxWidth + boxGap), 0]})`);

    boxes
      .transition()
      .ease(d3.easeSinOut)
      .duration(duration)
      .attr("opacity", 1)
      .attr("transform", (d, i) => `translate(${[i * (boxWidth + boxGap), 0]})`);

    boxes
      .exit()
      .transition()
      .ease(d3.easeSinOut)
      .duration(duration)
      .attr("opacity", 0)
      .attr("transform", (d, i) => `translate(${[contentWidth, 0]})`)
      .remove();

    container.selectAll("g.box-container").selectAll("rect.box")
      .data(d => [d])
      .enter()
      .append("rect")
      .attr("class", "box")
      .attr("width", boxWidth)
      .attr("height", boxHeight)
      .attr("stroke", d => d.color)
      .attr("fill", "#FFF")
      .attr("rx", 4)
      .attr("stroke-width", 2);

    container.selectAll("g.box-container").selectAll("image.party-image")
      .data(d => [d])
      .enter()
      .append("image")
      .attr("class", "party-image")
      .attr("x", padding)
      .attr("y", padding)
      .attr("href", d => d.logo)
      .attr("width", boxWidth - 2 * padding)
      .attr("height", boxHeight / phi - padding);

    let percentageTexts = container.selectAll("g.box-container").selectAll("text.percentage").data(d => [d]);

    percentageTexts
      .enter()
      .append("text")
      .attr("class", "percentage")
      .attr("x", boxWidth / 2)
      .attr("y", boxHeight / phi + padding)
      .attr("text-anchor", "middle")
      .style("fill", "#333")
      .style("font", "0.9em var(--sans-serif)")
      .style("font-weight", "bold")
      .style("pointer-events", "none")
      .attr("alignment-baseline", "middle")
      .attr("current", 0)
      .transition()
      .duration(duration)
      .textTween(function (d) {
        const i = d3.interpolate(+d3.select(this).attr("current") || 0, d.party_percentage);
        return function (t) { return formatPerc(this._current = i(t)); };
      })
      .on("end", function (d) {
        d3.select(this).attr("current", d.party_percentage);
      });

    percentageTexts
      .transition()
      .duration(duration)
      .textTween(function (d) {
        const i = d3.interpolate(+d3.select(this).attr("current") || 0, d.party_percentage);
        return function (t) { return formatPerc(this._current = i(t)); };
      })
      .on("end", function (d) {
        d3.select(this).attr("current", d.party_percentage);
      });

    let seatsTexts = container.selectAll("g.box-container").selectAll("text.seats").data(d => [d]);

    seatsTexts
      .enter()
      .append("text")
      .attr("class", "seats")
      .attr("x", boxWidth / 2)
      .attr("y", boxHeight - 3 * padding)
      .attr("text-anchor", "middle")
      .style("opacity", d => d.seats > 0 ? 1 : 0)
      .style("fill", "#333")
      .style("font", "0.9em var(--sans-serif)")
      .style("pointer-events", "none")
      .attr("alignment-baseline", "middle")
      .attr("current", 0)
      .transition()
      .duration(duration)
      .textTween(function (d) {
        const i = d3.interpolate(+d3.select(this).attr("current") || 0, d.seats);
        return function (t) { return formatSeats(this._current = i(t)); };
      })
      .on("end", function (d) {
        d3.select(this).attr("current", d.seats);
      });

    seatsTexts
      .style("opacity", d => d.seats > 0 ? 1 : 0)
      .transition()
      .duration(duration)
      .textTween(function (d) {
        const i = d3.interpolate(+d3.select(this).attr("current") || 0, d.seats);
        return function (t) { return formatSeats(this._current = i(t)); };
      })
      .on("end", function (d) {
        d3.select(this).attr("current", d.seats);
      });

    let votesTexts = container.selectAll("g.box-container").selectAll("text.votes").data(d => [d]);

    votesTexts
      .enter()
      .append("text")
      .attr("class", "votes")
      .attr("x", boxWidth / 2)
      .attr("y", boxHeight - padding)
      .attr("text-anchor", "middle")
      .style("fill", "#333")
      .style("font", "0.9em var(--sans-serif)")
      .style("pointer-events", "none")
      .attr("alignment-baseline", "middle")
      .attr("current", 0)
      .transition()
      .duration(duration)
      .textTween(function (d) {
        const i = d3.interpolate(+d3.select(this).attr("current") || 0, d.votes);
        return function (t) { return formatVotes(this._current = i(t)); };
      })
      .on("end", function (d) {
        d3.select(this).attr("current", d.votes);
      });

    votesTexts
      .transition()
      .duration(duration)
      .textTween(function (d) {
        const i = d3.interpolate(+d3.select(this).attr("current") || 0, d.votes);
        return function (t) { return formatVotes(this._current = i(t)); };
      })
      .on("end", function (d) {
        d3.select(this).attr("current", d.votes);
      });
  }

  const resizeObserver = new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width);
    if (w > 0 && w !== width) {
      width = w;
      render();
    }
  });
  resizeObserver.observe(wrapper.node());

  return Object.assign(wrapper.node(), {
    update(results) {
      lastResults = results;
      render();
    },
  });
}
