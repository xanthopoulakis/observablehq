import { load_bundle, ensure_stylesheet } from "./shared.js";
import {
  rankedPartyUnits,
  winningPartyLegendScale,
  partyShareVsNationalUnits,
  scalarStatisticVsNationalUnits,
  nationalStatisticValue,
  partyMarginUnits,
  divergingLegendScale,
  absoluteLegendScale,
} from "./lib/choroplethKpis.js";
import { choroplethCard } from "./lib/choroplethCard.js";
import { partyRankCard } from "./lib/partyRankCard.js";

const OXI_ID = 101;
const NAI_ID = 102;

const LEVEL_TITLES = {
  eklogiki_perifereia0: "Νικητής ανά εκλογική περιφέρεια",
  kallikratis: "Νικητής ανά δήμο",
  kapodistrias: "Νικητής ανά κοινότητα",
};

function create_embed_shell({ html, title, caption }) {
  const shell = html`<section class="r2015-article r2015-embed"></section>`;
  if (title) shell.append(html`<h2>${title}</h2>`);
  if (caption) shell.append(html`<p>${caption}</p>`);
  return shell;
}

/**
 * "Αποτελέσματα" — the national OXI/NAI results cards (votes, %, logos).
 * @param {object} [options]
 * @param {number} [options.width=640] - Chart height reference; the card itself fills its container's width.
 */
export async function create_party_rank_embed({ html, md, Inputs, width = 640 } = {}) {
  const bundle = await load_bundle();
  ensure_stylesheet(html, bundle.stylesheet);
  const shell = create_embed_shell({
    html,
    title: "Δημοψήφισμα 2015: Αποτελέσματα",
    caption: "Το ΟΧΙ κέρδισε με 61,31% έναντι 38,69% — τα πανελλαδικά αποτελέσματα κατά ψήφους.",
  });
  const chart = partyRankCard({ height: 200 });
  chart.update(bundle.national.parties);
  const figure = html`<div style="max-width: ${width}px"></div>`;
  figure.append(chart);
  shell.append(figure);
  return shell;
}

/**
 * The winner-per-unit map at one of three zoom levels — see
 * `LEVEL_TITLES` for supported `level` values.
 * @param {object} [options]
 * @param {"eklogiki_perifereia0"|"kallikratis"|"kapodistrias"} [options.level="kallikratis"]
 * @param {number} [options.width=640]
 */
export async function create_winner_map_embed({ html, md, Inputs, level = "kallikratis", width = 640 } = {}) {
  const bundle = await load_bundle();
  const { d3, parties, unitsByLevel } = bundle;
  ensure_stylesheet(html, bundle.stylesheet);
  const formatPercent = d3.format(".2%");

  const winners = rankedPartyUnits(unitsByLevel[level], 1, "el", formatPercent);
  const naiWins = winners.filter((d) => d.fill === parties.nai.color).length;

  const shell = create_embed_shell({
    html,
    title: LEVEL_TITLES[level],
    caption: `Το ΝΑΙ κέρδισε σε ${naiWins} από τις ${winners.length} περιοχές αυτού του επιπέδου.`,
  });
  const map = choroplethCard({ width });
  const scale = winningPartyLegendScale(winners);
  map.update(winners, scale, { legendStyle: "swatches", unitLevel: level });
  shell.append(map);
  return shell;
}

/**
 * Ποσοστό ΟΧΙ, either as an absolute (Jenks) map or a national-relative
 * (diverging) map — same underlying number, different color logic.
 * @param {object} [options]
 * @param {"absolute"|"relative"} [options.mode="absolute"]
 * @param {number} [options.width=640]
 */
export async function create_oxi_share_embed({ html, md, Inputs, mode = "absolute", width = 640 } = {}) {
  const bundle = await load_bundle();
  const { d3, national, unitsByLevel } = bundle;
  ensure_stylesheet(html, bundle.stylesheet);
  const formatPercent = d3.format(".2%");
  const nationalOxiShare = national.parties.find((p) => p.party_id === OXI_ID).party_percentage;

  const rows = partyShareVsNationalUnits(unitsByLevel.kallikratis, OXI_ID, nationalOxiShare, "el", formatPercent, "Απόκλιση");
  const useAbsolute = mode === "absolute";
  const scale = useAbsolute ? absoluteLegendScale(rows, d3.schemeOranges[6]) : divergingLegendScale(rows, [...d3.schemeRdYlBu[6]].reverse());
  const value = useAbsolute ? (d) => d.value : (d) => d.vs_national_pct;

  const shell = create_embed_shell({
    html,
    title: useAbsolute ? "Ποσοστό ΟΧΙ — απόλυτη τιμή" : "Ποσοστό ΟΧΙ — σε σχέση με την εθνική τιμή",
    caption: useAbsolute
      ? "Πού το ΟΧΙ ήταν πραγματικά ισχυρό, δήμο-δήμο."
      : "Ποιες περιοχές ξεπέρασαν ή υπολειτούργησαν σε σχέση με το εθνικό 61,31%.",
  });
  const map = choroplethCard({ width });
  map.update(
    rows.map((d) => ({ ...d, fill: scale(value(d)) })),
    scale,
    {
      legendTitle: `${useAbsolute ? "Απόλυτη Τιμή" : "Σε σχέση με Εθνική Τιμή"} (${formatPercent(nationalOxiShare)})`,
      legendTickFormat: useAbsolute ? ".1%" : "+.1%",
      unitLevel: "kallikratis",
    },
  );
  shell.append(map);
  return shell;
}

/** Η διαφορά ΟΧΙ-ΝΑΙ (head-to-head margin, colored in the parties' own colors). */
export async function create_margin_embed({ html, md, Inputs, width = 640 } = {}) {
  const bundle = await load_bundle();
  const { d3, parties, unitsByLevel } = bundle;
  ensure_stylesheet(html, bundle.stylesheet);
  const formatPercent = d3.format(".2%");

  const rows = partyMarginUnits(unitsByLevel.kallikratis, OXI_ID, NAI_ID, "el", formatPercent, "Διαφορά");
  const colors = d3.quantize(d3.piecewise(d3.interpolateRgb, [parties.nai.color, "white", parties.oxi.color]), 6);
  const scale = divergingLegendScale(rows, colors, (d) => d.margin);

  const shell = create_embed_shell({
    html,
    title: "Η διαφορά ΟΧΙ - ΝΑΙ",
    caption: "Πόσο κοντά ήταν η μάχη σε κάθε δήμο — όχι απλά ποιος κέρδισε.",
  });
  const map = choroplethCard({ width });
  map.update(
    rows.map((d) => ({ ...d, fill: scale(d.margin) })),
    scale,
    { legendTitle: "ΝΑΙ ← → ΟΧΙ", legendTickFormat: "+.0%", unitLevel: "kallikratis" },
  );
  shell.append(map);
  return shell;
}

/** Λευκά + Άκυρα, in absolute values — where the record-high rate concentrated. */
export async function create_invalid_blank_embed({ html, md, Inputs, width = 640 } = {}) {
  const bundle = await load_bundle();
  const { d3, national, unitsByLevel } = bundle;
  ensure_stylesheet(html, bundle.stylesheet);
  const formatPercent = d3.format(".2%");
  const nationalValue = nationalStatisticValue("invalidBlank", national.stats);

  const rows = scalarStatisticVsNationalUnits(unitsByLevel.kallikratis, "invalidBlank", national.stats, "el", formatPercent, "Λευκά + Άκυρα", "Απόκλιση");
  const scale = absoluteLegendScale(rows, d3.schemePurples[6]);

  const shell = create_embed_shell({
    html,
    title: "Λευκά + Άκυρα: ένα ιστορικό ρεκόρ",
    caption: `${formatPercent(nationalValue)} λευκών/άκυρων — το υψηλότερο ποσοστό σε πανελλαδική αναμέτρηση από το 1996 έως το 2024.`,
  });
  const map = choroplethCard({ width });
  map.update(
    rows.map((d) => ({ ...d, fill: scale(d.value) })),
    scale,
    { legendTitle: `Απόλυτη Τιμή (${formatPercent(nationalValue)})`, legendTickFormat: ".1%", unitLevel: "kallikratis" },
  );
  shell.append(map);
  return shell;
}

/** Αποχή, at the finer kapodistrias level — where turnout was worst. */
export async function create_abstention_embed({ html, md, Inputs, width = 640 } = {}) {
  const bundle = await load_bundle();
  const { d3, national, unitsByLevel } = bundle;
  ensure_stylesheet(html, bundle.stylesheet);
  const formatPercent = d3.format(".2%");
  const nationalValue = nationalStatisticValue("abstention", national.stats);

  const rows = scalarStatisticVsNationalUnits(unitsByLevel.kapodistrias, "abstention", national.stats, "el", formatPercent, "Αποχή", "Απόκλιση");
  const scale = absoluteLegendScale(rows, d3.schemeGreys[6]);

  const shell = create_embed_shell({
    html,
    title: "Αποχή: η γεωγραφία της απουσίας",
    caption: "Παραμεθόριες, ορεινές και νησιωτικές κοινότητες είχαν την υψηλότερη αποχή της χώρας.",
  });
  const map = choroplethCard({ width });
  map.update(
    rows.map((d) => ({ ...d, fill: scale(d.value) })),
    scale,
    { legendTitle: `Απόλυτη Τιμή (${formatPercent(nationalValue)})`, legendTickFormat: ".1%", unitLevel: "kapodistrias" },
  );
  shell.append(map);
  return shell;
}

/**
 * Catalog of every standalone embed this module offers — the shared list
 * behind both `embeds-notebook.ojs` and `get_embed_catalog()`, so a
 * dedicated "embeds" Observable notebook can loop over it instead of
 * hardcoding each title/caption a second time.
 */
export const embed_catalog = [
  { id: "party_rank", factory: "create_party_rank_embed", title: "Αποτελέσματα", hook: "Το ΟΧΙ κέρδισε με 61,31% έναντι 38,69%." },
  { id: "winner_perifereies", factory: "create_winner_map_embed", args: { level: "eklogiki_perifereia0" }, title: LEVEL_TITLES.eklogiki_perifereia0, hook: "Σε επίπεδο εκλογικής περιφέρειας, ο χάρτης είναι απόλυτα ομοιόμορφος." },
  { id: "winner_kallikratis", factory: "create_winner_map_embed", args: { level: "kallikratis" }, title: LEVEL_TITLES.kallikratis, hook: "Ο χάρτης που όλοι θυμούνται." },
  { id: "winner_kapodistrias", factory: "create_winner_map_embed", args: { level: "kapodistrias" }, title: LEVEL_TITLES.kapodistrias, hook: "Ένα βήμα πιο κοντά: 82 κοινότητες ψήφισαν αντίθετα από τον δικό τους δήμο." },
  { id: "oxi_absolute", factory: "create_oxi_share_embed", args: { mode: "absolute" }, title: "Ποσοστό ΟΧΙ — απόλυτη τιμή", hook: "Πού το ΟΧΙ ήταν πραγματικά ισχυρό." },
  { id: "oxi_relative", factory: "create_oxi_share_embed", args: { mode: "relative" }, title: "Ποσοστό ΟΧΙ — σχετική τιμή", hook: "Ποιες περιοχές ξεπέρασαν ή υπολειτούργησαν σε σχέση με το εθνικό ποσοστό." },
  { id: "margin", factory: "create_margin_embed", title: "Η διαφορά ΟΧΙ - ΝΑΙ", hook: "Πόσο κοντά ήταν η μάχη σε κάθε δήμο." },
  { id: "invalid_blank", factory: "create_invalid_blank_embed", title: "Λευκά + Άκυρα: ένα ιστορικό ρεκόρ", hook: "Το υψηλότερο ποσοστό λευκών/άκυρων από το 1996 έως το 2024." },
  { id: "abstention", factory: "create_abstention_embed", title: "Αποχή: η γεωγραφία της απουσίας", hook: "Παραμεθόριες, ορεινές και νησιωτικές περιοχές είχαν την υψηλότερη αποχή." },
];

export async function get_embed_catalog() {
  return embed_catalog;
}
