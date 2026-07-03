import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

function localized(row, locale, elKey, enKey) {
  return locale === "en" ? row[enKey] : row[elKey];
}

// Always shows a sign, including "+0.0%" — unlike formatPercent alone,
// which only shows "-" for negatives — so a deviation/margin row reads
// unambiguously as a signed quantity even at small values.
function signedPercent(value, formatPercent) {
  return (value >= 0 ? "+" : "") + formatPercent(value);
}

// `extra` rows (e.g. the selected KPI's own value/deviation) are prepended
// ahead of the generic top-`limit` party breakdown, so a tooltip leads with
// the metric actually being visualized while keeping the party context
// beneath it.
function buildListings(unitRows, locale, formatPercent, limit = 5, extra = []) {
  const validVotes = +unitRows[0].valid_votes;
  const partyListings = unitRows
    .slice()
    .sort((a, b) => +b.votes - +a.votes)
    .slice(0, limit)
    .map((row) => ({
      id: row.party_id,
      title: localized(row, locale, "party_name_el", "party_name_en"),
      value: formatPercent(validVotes > 0 ? +row.votes / validVotes : 0),
    }));
  return [...extra, ...partyListings];
}

/**
 * Reduces {@link choroplethForElection}'s flat unit×party rows into one
 * `{id, title, fill, listings}` entry per unit — the shape {@link choropleth}
 * expects — colored by whichever party placed `rank`-th *within that unit*
 * (not by a single nationally-chosen party). `rank = 1` is the winning
 * party, `rank = 2` the runner-up in each unit, and so on — this is the
 * "view by: 1st/2nd/3rd party" control's data source, generalizing what was
 * previously always the winner.
 *
 * A unit with fewer than `rank` candidates (rare, but possible in very
 * small units) is simply omitted, so it'll show unfilled in the map.
 *
 * @param {Iterable} rows - Rows from {@link choroplethForElection}.
 * @param {number} rank - 1-indexed placement within each unit to color by.
 * @param {string} locale - `"el"` or `"en"`, selects which title/name columns to use.
 * @param {(fraction: number) => string} formatPercent - Formats a 0–1 fraction for tooltip listings.
 * @returns {Array<{id: number, title: string, fill: string, listings: Array}>}
 */
export function rankedPartyUnits(rows, rank, locale, formatPercent) {
  return Array.from(
    d3.rollup(rows, (unitRows) => {
      const ranked = unitRows.slice().sort((a, b) => +b.votes - +a.votes)[rank - 1];
      if (!ranked) return null;
      return {
        id: +ranked.unit_id,
        title: localized(ranked, locale, "title_el", "title_en"),
        // The party actually shown (`fill`'s party) — distinct from
        // `listings[0]`, which is always the unit's *winner* regardless of
        // `rank`, and so can't be used to label this unit's legend swatch.
        partyName: localized(ranked, locale, "party_name_el", "party_name_en"),
        fill: ranked.party_color,
        listings: buildListings(unitRows, locale, formatPercent),
      };
    }, (d) => +d.unit_id).values(),
  ).filter((d) => d !== null);
}

/**
 * Reduces {@link choroplethForElection}'s flat unit×party rows into one
 * `{id, title, fill, listings}` entry per unit, colored by each unit's
 * winning party. Equivalent to {@link rankedPartyUnits} with `rank = 1`.
 *
 * @param {Iterable} rows - Rows from {@link choroplethForElection}.
 * @param {string} locale - `"el"` or `"en"`, selects which title/name columns to use.
 * @param {(fraction: number) => string} formatPercent - Formats a 0–1 fraction for tooltip listings.
 * @returns {Array<{id: number, title: string, fill: string, listings: Array}>}
 */
export function winningPartyUnits(rows, locale, formatPercent) {
  return rankedPartyUnits(rows, 1, locale, formatPercent);
}

/**
 * Builds the ordinal (party name → color) scale for a {@link rankedPartyUnits}/
 * {@link winningPartyUnits} result — used to render a legend. Takes the
 * *scope* of units to include (e.g. only the units inside one regional
 * pleth) so a small map's legend doesn't list parties that never actually
 * appear at that rank within it.
 *
 * @param {Array<{fill: string, partyName: string}>} units -
 *   A ({@link rankedPartyUnits} result, or a subset of one).
 * @returns {d3.ScaleOrdinal<string, string>}
 */
export function winningPartyLegendScale(units) {
  const byParty = new Map(units.map((d) => [d.partyName, d.fill]));
  return d3.scaleOrdinal().domain([...byParty.keys()]).range([...byParty.values()]);
}

/**
 * Generic per-unit "value vs national" reducer — the shared data source
 * behind every diverging-scale KPI ({@link partyShareVsNationalUnits},
 * {@link scalarStatisticVsNationalUnits}, {@link belowThresholdShareVsNationalUnits}).
 * Each unit's `vs_national_pct` is `unitValue(unitRows) - nationalValue`.
 *
 * `fill` is deliberately not set here: the diverging color scale needs the
 * nationwide spread of `vs_national_pct` to pick its domain first — see
 * {@link divergingLegendScale} — so callers build that scale from this
 * function's output, then attach `fill` themselves.
 *
 * @param {Iterable} rows - Rows from {@link choroplethForElection}.
 * @param {(unitRows: object[]) => number} unitValue - Computes one unit's
 *   raw value (a 0–1 fraction) from that unit's rows.
 * @param {number} nationalValue - The same quantity's actual nationwide value (0–1 fraction).
 * @param {string} locale - `"el"` or `"en"`, selects which title/name columns to use.
 * @param {(fraction: number) => string} formatPercent - Formats a 0–1 fraction for tooltip listings.
 * @param {(unitRows: object[], vsNationalPct: number) => Array} [extraListings] -
 *   Builds tooltip rows specific to this KPI (its own value, its deviation),
 *   prepended ahead of the generic top-party breakdown — see
 *   {@link buildListings}. Defaults to none.
 * @returns {Array<{id: number, title: string, vs_national_pct: number, listings: Array}>}
 */
export function statisticVsNationalUnits(rows, unitValue, nationalValue, locale, formatPercent, extraListings = () => []) {
  return Array.from(
    d3.rollup(rows, (unitRows) => {
      const rawValue = unitValue(unitRows);
      const vsNationalPct = rawValue - nationalValue;
      return {
        id: +unitRows[0].unit_id,
        title: localized(unitRows[0], locale, "title_el", "title_en"),
        // The unit's own absolute value, alongside the vs-national deviation
        // derived from it — {@link absoluteLegendScale} reads this so the
        // "absolute value" display mode doesn't need to reconstruct it from
        // `vs_national_pct + nationalValue` at every call site.
        value: rawValue,
        vs_national_pct: vsNationalPct,
        listings: buildListings(unitRows, locale, formatPercent, 5, extraListings(unitRows, vsNationalPct)),
      };
    }, (d) => +d.unit_id).values(),
  );
}

/**
 * {@link statisticVsNationalUnits} specialized to a single party's vote
 * share — each unit's percentage-point deviation from that party's actual
 * nationwide result (not a plain average of each unit's own percentage,
 * which would weight small and large units equally). Tooltips lead with
 * that party's own share in the unit and its deviation, ahead of the
 * generic top-5 breakdown.
 *
 * @param {Iterable} rows - Rows from {@link choroplethForElection}.
 * @param {number} partyId - The party whose share-vs-national to compute.
 * @param {number} nationalSharePct - That party's actual nationwide vote share (0–1 fraction).
 * @param {string} locale - `"el"` or `"en"`, selects which title/name columns to use.
 * @param {(fraction: number) => string} formatPercent - Formats a 0–1 fraction for tooltip listings.
 * @param {string} [deviationLabel="Deviation"] - Localized label for the deviation tooltip row.
 * @returns {Array<{id: number, title: string, vs_national_pct: number, listings: Array}>}
 */
export function partyShareVsNationalUnits(rows, partyId, nationalSharePct, locale, formatPercent, deviationLabel = "Deviation") {
  const shareOfUnit = (unitRows) => {
    const validVotes = +unitRows[0].valid_votes;
    const partyRow = unitRows.find((d) => +d.party_id === partyId);
    return partyRow && validVotes > 0 ? +partyRow.votes / validVotes : 0;
  };
  return statisticVsNationalUnits(
    rows,
    shareOfUnit,
    nationalSharePct,
    locale,
    formatPercent,
    (unitRows, vsNationalPct) => {
      const partyRow = unitRows.find((d) => +d.party_id === partyId);
      if (!partyRow) return [];
      return [
        { id: "kpi-value", title: localized(partyRow, locale, "party_name_el", "party_name_en"), value: formatPercent(shareOfUnit(unitRows)) },
        { id: "kpi-deviation", title: deviationLabel, value: signedPercent(vsNationalPct, formatPercent) },
      ];
    },
  );
}

function ballotStats(row) {
  const registered = +row.registered;
  const valid = +row.valid_votes;
  const invalid = +row.invalid_votes;
  const blank = +row.blank_votes;
  return { registered, valid, invalid, blank, voted: valid + invalid + blank };
}

// Each function takes a single row exposing registered/valid_votes/
// invalid_votes/blank_votes (either one unit's first row, or the single
// nationwide row) and returns a 0–1 fraction — the shared basis behind both
// a unit's own value and the national value it's compared against.
const scalarStatistics = {
  turnout: (row) => {
    const s = ballotStats(row);
    return s.registered > 0 ? s.voted / s.registered : 0;
  },
  abstention: (row) => {
    const s = ballotStats(row);
    return s.registered > 0 ? (s.registered - s.voted) / s.registered : 0;
  },
  blank: (row) => {
    const s = ballotStats(row);
    return s.voted > 0 ? s.blank / s.voted : 0;
  },
  invalid: (row) => {
    const s = ballotStats(row);
    return s.voted > 0 ? s.invalid / s.voted : 0;
  },
  invalidBlank: (row) => {
    const s = ballotStats(row);
    return s.voted > 0 ? (s.invalid + s.blank) / s.voted : 0;
  },
};

/** Keys accepted by {@link scalarStatisticVsNationalUnits}, in menu order. */
export const SCALAR_STATISTIC_KEYS = Object.keys(scalarStatistics);

/**
 * A {@link SCALAR_STATISTIC_KEYS} value's actual nationwide result — the
 * reference number a legend or subtitle prints alongside "deviation from
 * national", and the baseline {@link scalarStatisticVsNationalUnits}
 * compares every unit against.
 *
 * @param {string} key - One of {@link SCALAR_STATISTIC_KEYS}.
 * @param {object} nationalRow - Any single row carrying the nationwide
 *   registered/valid_votes/invalid_votes/blank_votes totals.
 * @returns {number} 0–1 fraction.
 */
export function nationalStatisticValue(key, nationalRow) {
  return scalarStatistics[key](nationalRow);
}

/**
 * {@link statisticVsNationalUnits} specialized to a ballot-level statistic
 * — turnout, abstention, blank, invalid, or invalid+blank combined — the
 * counterpart to {@link partyShareVsNationalUnits} for KPIs that aren't
 * about a specific party. Tooltips lead with that statistic's own value in
 * the unit and its deviation, ahead of the generic top-5 breakdown.
 *
 * @param {Iterable} rows - Rows from {@link choroplethForElection}.
 * @param {string} key - One of {@link SCALAR_STATISTIC_KEYS}.
 * @param {object} nationalRow - Any single row carrying the nationwide
 *   registered/valid_votes/invalid_votes/blank_votes totals (e.g. from
 *   {@link statisticsTrailForUnit} at the `"globe"` level).
 * @param {string} locale - `"el"` or `"en"`, selects which title/name columns to use.
 * @param {(fraction: number) => string} formatPercent - Formats a 0–1 fraction for tooltip listings.
 * @param {string} [statLabel="Value"] - Localized label for this statistic's tooltip row (e.g. "Turnout").
 * @param {string} [deviationLabel="Deviation"] - Localized label for the deviation tooltip row.
 * @returns {Array<{id: number, title: string, vs_national_pct: number, listings: Array}>}
 */
export function scalarStatisticVsNationalUnits(rows, key, nationalRow, locale, formatPercent, statLabel = "Value", deviationLabel = "Deviation") {
  const compute = scalarStatistics[key];
  return statisticVsNationalUnits(
    rows,
    (unitRows) => compute(unitRows[0]),
    compute(nationalRow),
    locale,
    formatPercent,
    (unitRows, vsNationalPct) => [
      { id: "kpi-value", title: statLabel, value: formatPercent(compute(unitRows[0])) },
      { id: "kpi-deviation", title: deviationLabel, value: signedPercent(vsNationalPct, formatPercent) },
    ],
  );
}

function belowThresholdPartyIds(nationalRowsArray, threshold) {
  return new Set(nationalRowsArray.filter((d) => +d.party_percentage < threshold).map((d) => +d.party_id));
}

/**
 * The combined nationwide vote share of every party below `threshold` — the
 * reference number a legend or subtitle prints alongside "deviation from
 * national", and the baseline {@link belowThresholdShareVsNationalUnits}
 * compares every unit against.
 *
 * @param {Iterable} nationalRows - Rows exposing `party_id`/`party_percentage`
 *   at the nationwide level, e.g. from `partiesRowForUnit` at the `"globe"` level.
 * @param {number} [threshold=0.03] - National vote-share cutoff (0–1 fraction).
 * @returns {number} 0–1 fraction.
 */
export function nationalBelowThresholdValue(nationalRows, threshold = 0.03) {
  const nationalRowsArray = Array.from(nationalRows);
  const belowThresholdIds = belowThresholdPartyIds(nationalRowsArray, threshold);
  return d3.sum(nationalRowsArray.filter((d) => belowThresholdIds.has(+d.party_id)), (d) => +d.party_percentage);
}

/**
 * {@link statisticVsNationalUnits} specialized to the combined vote share
 * of every party *below* a national vote-share threshold (e.g. Greece's 3%
 * parliamentary entry threshold) — "how big is the fragmented/
 * non-parliamentary vote in this unit, vs nationwide". Threshold membership
 * is decided once at the national level via `nationalRows`, not per unit,
 * so a party doesn't flip in/out of the bucket unit by unit. Tooltips lead
 * with this aggregate's own value in the unit and its deviation, ahead of
 * the generic top-5 breakdown.
 *
 * @param {Iterable} rows - Rows from {@link choroplethForElection}.
 * @param {Iterable} nationalRows - Rows exposing `party_id`/`party_percentage`
 *   at the nationwide level, e.g. from `partiesRowForUnit` at the `"globe"` level.
 * @param {number} [threshold=0.03] - National vote-share cutoff (0–1 fraction).
 * @param {string} locale - `"el"` or `"en"`, selects which title/name columns to use.
 * @param {(fraction: number) => string} formatPercent - Formats a 0–1 fraction for tooltip listings.
 * @param {string} [statLabel="Value"] - Localized label for this aggregate's tooltip row.
 * @param {string} [deviationLabel="Deviation"] - Localized label for the deviation tooltip row.
 * @returns {Array<{id: number, title: string, vs_national_pct: number, listings: Array}>}
 */
export function belowThresholdShareVsNationalUnits(rows, nationalRows, threshold = 0.03, locale, formatPercent, statLabel = "Value", deviationLabel = "Deviation") {
  const nationalRowsArray = Array.from(nationalRows);
  const belowThresholdIds = belowThresholdPartyIds(nationalRowsArray, threshold);
  const nationalValue = nationalBelowThresholdValue(nationalRowsArray, threshold);
  const shareOfUnit = (unitRows) => {
    const validVotes = +unitRows[0].valid_votes;
    const belowVotes = d3.sum(unitRows.filter((d) => belowThresholdIds.has(+d.party_id)), (d) => +d.votes);
    return validVotes > 0 ? belowVotes / validVotes : 0;
  };
  return statisticVsNationalUnits(
    rows,
    shareOfUnit,
    nationalValue,
    locale,
    formatPercent,
    (unitRows, vsNationalPct) => [
      { id: "kpi-value", title: statLabel, value: formatPercent(shareOfUnit(unitRows)) },
      { id: "kpi-deviation", title: deviationLabel, value: signedPercent(vsNationalPct, formatPercent) },
    ],
  );
}

/**
 * Builds a diverging color *legend* scale from a diverging-KPI result:
 * negative ← neutral → positive, symmetric around 0 so equal-magnitude
 * values on either side get equal-sized bands. Deliberately a *discrete*
 * `scaleThreshold` (a handful of solid color bands) rather than a
 * continuous ramp — much easier to read at a glance ("clearly positive" /
 * "about even" / "clearly negative") than a smooth gradient, where
 * neighboring shades are hard to tell apart. Bands are evenly spaced from
 * the nationwide spread of the data, so a given band always means the same
 * magnitude across pleths sharing one scale (see `election.md`).
 *
 * Used both for "vs national average" KPIs ({@link partyShareVsNationalUnits}
 * and friends, reading `vs_national_pct`) and for {@link partyMarginUnits}
 * (reading `margin`, which is already a naturally zero-centered quantity —
 * no national baseline to subtract).
 *
 * @param {Array<object>} units
 * @param {ReadonlyArray<string>} [colors] - Colors from the negative
 *   extreme to the positive extreme, e.g. a ColorBrewer diverging scheme,
 *   or `d3.quantize(customInterpolator, n)` for KPI-specific colors (see
 *   the "margin" KPI, which uses the two parties' own brand colors).
 *   Defaults to ColorBrewer's 6-class RdYlBu, reversed so blue reads as
 *   negative/below and red as positive/above.
 * @param {(unit: object) => number} [value] - Reads the diverging value off
 *   a unit. Defaults to `vs_national_pct`.
 * @returns {d3.ScaleThreshold<number, string>}
 */
export function divergingLegendScale(units, colors = [...d3.schemeRdYlBu[6]].reverse(), value = (d) => d.vs_national_pct) {
  const maxAbs = d3.max(units, (d) => Math.abs(value(d))) || 1;
  const n = colors.length;
  const thresholds = d3.range(1, n).map((i) => -maxAbs + (2 * maxAbs * i) / n);
  return d3.scaleThreshold().domain(thresholds).range(colors);
}

// Classic Fisher–Jenks "natural breaks": the optimal partition of `n` sorted
// values into `numClasses` contiguous groups minimizing the sum of each
// group's internal variance (equivalently, 1-D k-means). This is the
// standard DP formulation (as popularized by Tom MacWright's port of
// geostats.js's implementation) — O(numClasses × n²), which is fine for a
// one-off classification on a selection change (a few thousand rows at
// most: kapodistrias, the finest level here) but isn't meant to run per frame.
function jenksBreaks(values, numClasses) {
  const data = values.slice().sort((a, b) => a - b);
  const n = data.length;

  // Fewer distinct rows than classes: every value gets its own band instead
  // of dividing by a class count the data can't actually support.
  if (n <= numClasses) return d3.range(numClasses + 1).map((i) => data[Math.min(i, n - 1)]);

  const lowerClassLimits = Array.from({ length: n + 1 }, () => new Array(numClasses + 1).fill(0));
  const varianceCombinations = Array.from({ length: n + 1 }, () => new Array(numClasses + 1).fill(Infinity));

  for (let i = 1; i <= numClasses; i++) {
    lowerClassLimits[1][i] = 1;
    varianceCombinations[1][i] = 0;
  }

  for (let l = 2; l <= n; l++) {
    let sum = 0, sumSquares = 0, w = 0, variance = 0;
    for (let m = 1; m <= l; m++) {
      const lowerClassLimit = l - m + 1;
      const val = data[lowerClassLimit - 1];
      w++;
      sum += val;
      sumSquares += val * val;
      variance = sumSquares - (sum * sum) / w;
      const i4 = lowerClassLimit - 1;
      if (i4 !== 0) {
        for (let j = 2; j <= numClasses; j++) {
          if (varianceCombinations[l][j] >= variance + varianceCombinations[i4][j - 1]) {
            lowerClassLimits[l][j] = lowerClassLimit;
            varianceCombinations[l][j] = variance + varianceCombinations[i4][j - 1];
          }
        }
      }
    }
    lowerClassLimits[l][1] = 1;
    varianceCombinations[l][1] = variance;
  }

  const breaks = new Array(numClasses + 1);
  breaks[numClasses] = data[n - 1];
  breaks[0] = data[0];
  let k = n;
  for (let countNum = numClasses; countNum >= 2; countNum--) {
    const idx = lowerClassLimits[k][countNum] - 2;
    breaks[countNum - 1] = data[idx];
    k = lowerClassLimits[k][countNum] - 1;
  }
  return breaks;
}

/**
 * Builds an "absolute value" legend scale — the counterpart to
 * {@link divergingLegendScale} for the same share/statistic/belowThreshold
 * KPIs, used when the user picks the "absolute value" display mode instead
 * of "compared to national value". Unlike the diverging scale's evenly
 * spaced bands around 0, this classifies the raw values themselves into
 * `colors.length` Jenks natural-breaks bands — each band boundary falls
 * where the data actually clusters, rather than at a fixed fraction of the
 * range.
 *
 * @param {Array<object>} units
 * @param {ReadonlyArray<string>} [colors=d3.schemeBlues[6]] - One color per
 *   band, lightest first — a sequential (not diverging) ramp, since an
 *   absolute value has no natural negative side.
 * @param {(unit: object) => number} [value] - Reads the absolute value off a
 *   unit. Defaults to `value` (see {@link statisticVsNationalUnits}).
 * @returns {d3.ScaleThreshold<number, string>}
 */
export function absoluteLegendScale(units, colors = d3.schemeBlues[6], value = (d) => d.value) {
  const breaks = jenksBreaks(units.map(value), colors.length);
  const thresholds = breaks.slice(1, -1);
  return d3.scaleThreshold().domain(thresholds).range(colors);
}

/**
 * Reduces {@link choroplethForElection}'s flat unit×party rows into one
 * `{id, title, margin, listings}` entry per unit: the percentage-point gap
 * between two specific parties' vote shares in that unit (`shareOf(partyAId)
 * - shareOf(partyBId)`) — typically the nationally 1st- and 2nd-placed
 * parties, to map how competitive the race between them is region by
 * region. Positive values favor `partyAId`, negative favor `partyBId`.
 *
 * Unlike the other diverging KPIs, this isn't compared against a national
 * average — the value is already naturally centered at 0 (a tied race
 * between the two) — so `margin` plugs directly into
 * {@link divergingLegendScale} (pass `(d) => d.margin` as its `value`
 * accessor). `fill` is left unset for the same reason as the others: the
 * scale needs the nationwide spread of `margin` first.
 *
 * Tooltips lead with both parties' own shares in the unit and the margin
 * between them, ahead of the generic top-5 breakdown.
 *
 * @param {Iterable} rows - Rows from {@link choroplethForElection}.
 * @param {number} partyAId - The party favored by *positive* margins.
 * @param {number} partyBId - The party favored by *negative* margins.
 * @param {string} locale - `"el"` or `"en"`, selects which title/name columns to use.
 * @param {(fraction: number) => string} formatPercent - Formats a 0–1 fraction for tooltip listings.
 * @param {string} [marginLabel="Margin"] - Localized label for the margin tooltip row.
 * @returns {Array<{id: number, title: string, margin: number, listings: Array}>}
 */
export function partyMarginUnits(rows, partyAId, partyBId, locale, formatPercent, marginLabel = "Margin") {
  return Array.from(
    d3.rollup(rows, (unitRows) => {
      const validVotes = +unitRows[0].valid_votes;
      const rowOf = (partyId) => unitRows.find((d) => +d.party_id === partyId);
      const shareOf = (partyId) => {
        const row = rowOf(partyId);
        return row && validVotes > 0 ? +row.votes / validVotes : 0;
      };
      const margin = shareOf(partyAId) - shareOf(partyBId);
      const rowA = rowOf(partyAId);
      const rowB = rowOf(partyBId);
      const kpiListings = [
        rowA && { id: "kpi-a", title: localized(rowA, locale, "party_name_el", "party_name_en"), value: formatPercent(shareOf(partyAId)) },
        rowB && { id: "kpi-b", title: localized(rowB, locale, "party_name_el", "party_name_en"), value: formatPercent(shareOf(partyBId)) },
        { id: "kpi-margin", title: marginLabel, value: signedPercent(margin, formatPercent) },
      ].filter(Boolean);
      return {
        id: +unitRows[0].unit_id,
        title: localized(unitRows[0], locale, "title_el", "title_en"),
        margin,
        listings: buildListings(unitRows, locale, formatPercent, 5, kpiListings),
      };
    }, (d) => +d.unit_id).values(),
  );
}

/**
 * Reduces {@link choroplethForElection}'s flat unit×party rows into one
 * `{id, title, rank, listings}` entry per unit: the 1-indexed placement a
 * single party achieved *within that unit* (1 = won there), independent of
 * its overall national placement — "where did this specific party do
 * well or poorly". A unit where the party has no rows at all (didn't run
 * there) is omitted, so it'll show unfilled in the map.
 *
 * `fill` is left unset — pair with {@link partyRankLegendScale}, whose
 * bands are fixed (1st/2nd/3rd/4th/5th-or-worse) regardless of the data,
 * unlike the diverging KPIs' data-driven scale.
 *
 * @param {Iterable} rows - Rows from {@link choroplethForElection}.
 * @param {number} partyId - The party whose per-unit placement to compute.
 * @param {string} locale - `"el"` or `"en"`, selects which title/name columns to use.
 * @param {(fraction: number) => string} formatPercent - Formats a 0–1 fraction for tooltip listings.
 * @param {string} [rankLabel="Rank"] - Localized label for the rank tooltip row.
 * @returns {Array<{id: number, title: string, rank: number, listings: Array}>}
 */
export function partyRankUnits(rows, partyId, locale, formatPercent, rankLabel = "Rank") {
  return Array.from(
    d3.rollup(rows, (unitRows) => {
      const sorted = unitRows.slice().sort((a, b) => +b.votes - +a.votes);
      const index = sorted.findIndex((d) => +d.party_id === partyId);
      if (index < 0) return null;
      const rank = index + 1;
      const partyRow = sorted[index];
      const validVotes = +unitRows[0].valid_votes;
      const share = validVotes > 0 ? +partyRow.votes / validVotes : 0;
      return {
        id: +unitRows[0].unit_id,
        title: localized(unitRows[0], locale, "title_el", "title_en"),
        rank,
        listings: buildListings(unitRows, locale, formatPercent, 5, [
          { id: "kpi-value", title: localized(partyRow, locale, "party_name_el", "party_name_en"), value: formatPercent(share) },
          { id: "kpi-rank", title: rankLabel, value: `#${rank}` },
        ]),
      };
    }, (d) => +d.unit_id).values(),
  ).filter((d) => d !== null);
}

/**
 * Builds a fixed-band *ordinal* legend scale for {@link partyRankUnits}: a
 * qualitative ColorBrewer palette (`d3.schemeSet2` by default) gives each
 * placement band its own clearly-distinct hue — "which band is this unit
 * in" reads faster from unrelated colors than from graded shades of one
 * color, which is why this isn't tinted from the party's own brand color
 * (that party-color version, tried first, made adjacent bands hard to
 * tell apart at a glance). `bandLabels` is both the scale's domain
 * (rendered by {@link Legend} as one labeled color segment per entry,
 * like a ColorBrewer swatch strip — not a numeric axis) and the lookup
 * table `.bandFor(rank)` uses to bucket a raw rank into one of them, so a
 * rank past the last labeled band collapses into it automatically.
 *
 * @param {ReadonlyArray<string>} bandLabels - Ordered labels from 1st place
 *   to the open-ended last band, e.g. `["1st", ..., "8th+"]`.
 * @param {ReadonlyArray<string>} [colors=d3.schemeSet2] - One color per
 *   `bandLabels` entry.
 * @returns {d3.ScaleOrdinal<string, string> & {bandFor(rank: number): string}}
 */
export function partyRankLegendScale(bandLabels, colors = d3.schemeSet2) {
  const scale = d3.scaleOrdinal(bandLabels, colors.slice(0, bandLabels.length));
  scale.bandFor = (rank) => bandLabels[Math.min(rank, bandLabels.length) - 1];
  return scale;
}

/**
 * Reduces {@link choroplethForElection}'s flat unit×party rows into one
 * `{id, title, seats, listings}` entry per unit: the seats a single party
 * won *in that unit*. Only meaningful where `rows` come from the
 * `"eklogiki_perifereia"` level — Greece allocates parliamentary seats per
 * electoral district, not per municipality/community, so `seats` is 0
 * (not simply unknown) at finer levels. Unlike {@link partyRankUnits}, a
 * unit with 0 seats is *not* omitted — 0 is a normal, meaningful value here.
 *
 * `fill` is left unset — pair with {@link partySeatsLegendScale}.
 *
 * @param {Iterable} rows - Rows from {@link choroplethForElection} at the `"eklogiki_perifereia"` level.
 * @param {number} partyId - The party whose per-unit seat count to compute.
 * @param {string} locale - `"el"` or `"en"`, selects which title/name columns to use.
 * @param {(fraction: number) => string} formatPercent - Formats a 0–1 fraction for tooltip listings.
 * @param {string} [seatsLabel="Seats"] - Localized label for the seats tooltip row.
 * @returns {Array<{id: number, title: string, seats: number, listings: Array}>}
 */
export function partySeatsUnits(rows, partyId, locale, formatPercent, seatsLabel = "Seats") {
  return Array.from(
    d3.rollup(rows, (unitRows) => {
      const partyRow = unitRows.find((d) => +d.party_id === partyId);
      const seats = partyRow ? +partyRow.seats : 0;
      const validVotes = +unitRows[0].valid_votes;
      const share = partyRow && validVotes > 0 ? +partyRow.votes / validVotes : 0;
      return {
        id: +unitRows[0].unit_id,
        title: localized(unitRows[0], locale, "title_el", "title_en"),
        seats,
        listings: buildListings(unitRows, locale, formatPercent, 5, partyRow ? [
          { id: "kpi-value", title: localized(partyRow, locale, "party_name_el", "party_name_en"), value: formatPercent(share) },
          { id: "kpi-seats", title: seatsLabel, value: String(seats) },
        ] : []),
      };
    }, (d) => +d.unit_id).values(),
  );
}

/**
 * Builds a *ordinal* legend scale for {@link partySeatsUnits}: 0 seats gets
 * a near-white tint, the nationwide-highest seat count for this party gets
 * its own full-strength color — the seat-count counterpart to
 * {@link partyRankLegendScale} (reversed: here a *higher* number is
 * strong, not lower). One labeled band per whole seat count ("0", "1",
 * "2", ...), capped at `maxBands` (the last band becomes open-ended,
 * "N+") so a party that occasionally wins many seats in one district
 * doesn't blow up the legend into dozens of near-identical shades.
 * `.bandFor(seats)` buckets a raw seat count into one of the returned
 * scale's labeled bands.
 *
 * @param {Array<{seats: number}>} units - A {@link partySeatsUnits} result
 *   (pass the *nationwide* set, not one pleth's subset, so the scale's
 *   upper end — and hence every pleth sharing it — reflects the same
 *   nationwide maximum).
 * @param {string} partyColor - The party's brand color (hex), used at the
 *   highest-seats (darkest) end.
 * @param {number} [maxBands=8]
 * @returns {d3.ScaleOrdinal<string, string> & {bandFor(seats: number): string}}
 */
export function partySeatsLegendScale(units, partyColor, maxBands = 8) {
  const maxSeats = d3.max(units, (d) => d.seats) || 0;
  const bands = Math.max(1, Math.min(maxSeats + 1, maxBands));
  const capped = bands - 1 < maxSeats;
  const labels = d3.range(bands).map((i) => (capped && i === bands - 1 ? `${i}+` : `${i}`));
  // d3.quantize divides by (n - 1), so a single band (every unit tied at
  // the same seat count, most commonly 0) needs its own no-op path rather
  // than feeding it 1 and hitting a 0/0 division.
  const colors = bands === 1 ? ["#f2f2f2"] : d3.quantize((t) => d3.interpolateRgb("#f2f2f2", partyColor)(t), bands);
  const scale = d3.scaleOrdinal(labels, colors);
  scale.bandFor = (seats) => labels[Math.min(seats, bands - 1)];
  return scale;
}
