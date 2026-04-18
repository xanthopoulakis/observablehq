const module_root_url = new URL(".", import.meta.url);

const number_payouts = {
  1: {1: 2.5},
  2: {2: 5.0, 1: 1.0},
  3: {3: 25.0, 2: 2.5},
  4: {4: 100.0, 3: 4.0, 2: 1.0},
  5: {5: 450.0, 4: 20.0, 3: 2.0},
  6: {6: 1600.0, 5: 50.0, 4: 7.0, 3: 1.0},
  7: {7: 5000.0, 6: 100.0, 5: 20.0, 4: 3.0, 3: 1.0},
  8: {8: 15000.0, 7: 1000.0, 6: 50.0, 5: 10.0, 4: 2.0},
  9: {9: 40000.0, 8: 4000.0, 7: 200.0, 6: 25.0, 5: 5.0, 4: 1.0},
  10: {10: 100000.0, 9: 10000.0, 8: 500.0, 7: 80.0, 6: 20.0, 5: 2.0, 0: 2.0},
  11: {11: 500000.0, 10: 15000.0, 9: 1500.0, 8: 250.0, 7: 50.0, 6: 10.0, 5: 1.0, 0: 2.0},
  12: {12: 1000000.0, 11: 25000.0, 10: 2500.0, 9: 1000.0, 8: 150.0, 7: 25.0, 6: 5.0, 0: 4.0}
};

const surrogate_fit = [
  {id: "uniform_shuffle", rmse: 0.004041, parity_tv: 0.00168, column_tv: 0.008865, loss: 1.142604},
  {id: "global_frequency", rmse: 0.004241, parity_tv: 0.007914, column_tv: 0.006067, loss: null},
  {id: "recent_frequency", rmse: 0.005133, parity_tv: 0.00928, column_tv: 0.013559, loss: null},
  {id: "prev_parity_conditional", rmse: 0.004415, parity_tv: 0.00177, column_tv: 0.0089, loss: null},
  {id: "prev_sum_quartile_conditional", rmse: 0.004361, parity_tv: 0.00188, column_tv: 0.00595, loss: null},
  {id: "prev_gap_quartile_conditional", rmse: 0.004061, parity_tv: 0.003064, column_tv: 0.007047, loss: null},
  {id: "best_evolved_surrogate", rmse: 0.003895, parity_tv: 0.005586, column_tv: 0.01097, loss: 1.28032}
];

const pick_monte_carlo = [
  {pick: 1, hit_freq: 0.249964, rtp: 0.62491, mean_final_profit: -1875.45},
  {pick: 2, hit_freq: 0.439709, rtp: 0.67973, mean_final_profit: -1601.349},
  {pick: 3, hit_freq: 0.15248, rtp: 0.693815, mean_final_profit: -1530.925},
  {pick: 4, hit_freq: 0.258617, rtp: 0.689952, mean_final_profit: -1550.241},
  {pick: 5, hit_freq: 0.096528, rtp: 0.698908, mean_final_profit: -1505.462},
  {pick: 6, hit_freq: 0.161284, rtp: 0.691471, mean_final_profit: -1542.644},
  {pick: 7, hit_freq: 0.236119, rtp: 0.70226, mean_final_profit: -1488.698},
  {pick: 8, hit_freq: 0.102111, rtp: 0.70058, mean_final_profit: -1497.102},
  {pick: 9, hit_freq: 0.152754, rtp: 0.716634, mean_final_profit: -1416.829},
  {pick: 10, hit_freq: 0.110414, rtp: 0.692405, mean_final_profit: -1537.976},
  {pick: 11, hit_freq: 0.13087, rtp: 0.683554, mean_final_profit: -1582.232},
  {pick: 12, hit_freq: 0.063409, rtp: 0.70734, mean_final_profit: -1463.3}
];

const pick_variance_summary = [
  {pick: 1, hit_freq: 0.25, rtp: 0.625, top_net_win: 0.75, median_rounds: 5330, profitable_ever: 0.552},
  {pick: 2, hit_freq: 0.439873, rtp: 0.68038, top_net_win: 2.0, median_rounds: 6256, profitable_ever: 0.455},
  {pick: 3, hit_freq: 0.152629, rtp: 0.693768, top_net_win: 12.0, median_rounds: 6495, profitable_ever: 0.644},
  {pick: 4, hit_freq: 0.258947, rtp: 0.691966, top_net_win: 49.5, median_rounds: 6280, profitable_ever: 0.596},
  {pick: 5, hit_freq: 0.096672, rtp: 0.699933, top_net_win: 224.5, median_rounds: 5773, profitable_ever: 0.67},
  {pick: 6, hit_freq: 0.161582, rtp: 0.690743, top_net_win: 799.5, median_rounds: 4234, profitable_ever: 0.617},
  {pick: 7, hit_freq: 0.236579, rtp: 0.699557, top_net_win: 2499.5, median_rounds: 4758, profitable_ever: 0.52},
  {pick: 8, hit_freq: 0.102338, rtp: 0.690009, top_net_win: 7499.5, median_rounds: 4178, profitable_ever: 0.589},
  {pick: 9, hit_freq: 0.153051, rtp: 0.697778, top_net_win: 19999.5, median_rounds: 4378, profitable_ever: 0.543}
];

const pick_trajectory_colors = {
  2: "#4C78A8",
  5: "#7A5195",
  7: "#E45756",
  9: "#1F9D8A"
};

const portfolio_monte_carlo = [
  {id: "pick_2_draw_column", payout_hit: 0.598073, positive_rounds: 0.283142, rtp: 0.78156, ruin: 1.0, final_profit: -5460.9933},
  {id: "pick_5_draw_column", payout_hit: 0.352314, positive_rounds: 0.292235, rtp: 0.785031, ruin: 1.0, final_profit: -5374.23},
  {id: "pick_7_draw_column", payout_hit: 0.452459, positive_rounds: 0.289881, rtp: 0.785501, ruin: 1.0, final_profit: -5362.485},
  {id: "pick_7_bonus_draw_column", payout_hit: 0.487231, positive_rounds: 0.316058, rtp: 0.771027, ruin: 0.9967, final_profit: -6869.1883}
];

const ga_validation_summary = [
  {label: "real_history", metric: "ga_pick5", value: -64.8},
  {label: "real_history", metric: "ga_combined", value: 75.3},
  {label: "null_history", metric: "ga_pick5", value: -58.1},
  {label: "null_history", metric: "ga_combined", value: 68.9}
];

const ga_window_examples = [
  {window: "W1", model: "ga_combined", profit: 127.73, regime: "real_history"},
  {window: "W2", model: "ga_combined", profit: 330.55, regime: "real_history"},
  {window: "W3", model: "ga_combined", profit: -56.0, regime: "real_history"},
  {window: "W4", model: "ga_combined", profit: -101.0, regime: "real_history"},
  {window: "N1", model: "ga_combined", profit: 95.0, regime: "null_history"},
  {window: "N2", model: "ga_combined", profit: -72.0, regime: "null_history"},
  {window: "W1", model: "ga_pick5", profit: -77.0, regime: "real_history"},
  {window: "W2", model: "ga_pick5", profit: -62.0, regime: "real_history"},
  {window: "W3", model: "ga_pick5", profit: -54.0, regime: "real_history"},
  {window: "W4", model: "ga_pick5", profit: -66.0, regime: "real_history"}
];

const parity_states = ["odd", "even", "draw"];

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
  const existing = document.querySelector('style[data-kino-article="true"]');
  if (existing) return existing;
  const style = html`<style data-kino-article="true">${stylesheet}</style>`;
  document.head.append(style);
  return style;
}

export function resolve_lang(lang = null) {
  if (lang === "el" || lang === "en") return lang;
  const candidate = new URLSearchParams(location.search).get("lang");
  return candidate === "el" || candidate === "en" ? candidate : "en";
}

export function lookup(object, path) {
  return path.split(".").reduce((value, part) => value?.[part], object);
}

export function create_text(copy, lang) {
  return function text(key, vars = {}) {
    const template = lookup(copy[lang], key) ?? key;
    return String(template).replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? `{${name}}`);
  };
}

export function create_block_helpers({html, md, text}) {
  function block(node, class_name = "prose-block") {
    const wrapper = html`<div class="${class_name}"></div>`;
    wrapper.append(node);
    return wrapper;
  }

  function markdown_block(key, vars = {}) {
    return block(md`${text(key, vars)}`, "prose-block");
  }

  function heading_block(key, level = 2, vars = {}) {
    const prefix = "#".repeat(level);
    return block(md`${prefix} ${text(key, vars)}`, "prose-block");
  }

  return {block, markdown_block, heading_block};
}

export function create_formatters(d3) {
  const formatters = {
    fmt_pct: d3.format(".2%"),
    fmt_pct1: d3.format(".1%"),
    fmt_num: d3.format(","),
    fmt_money: d3.format(",.2f")
  };
  return {
    ...formatters,
    money_label(value) {
      return `€${formatters.fmt_money(value)}`;
    }
  };
}

export function comb(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= k; i++) result = result * (n - k + i) / i;
  return result;
}

export function hit_prob(pick_size, hits) {
  return comb(20, hits) * comb(60, pick_size - hits) / comb(80, pick_size);
}

export function plain_rtp(pick_size) {
  let mean = 0;
  for (let hits = 0; hits <= pick_size; hits++) {
    mean += hit_prob(pick_size, hits) * (number_payouts[pick_size][hits] ?? 0);
  }
  return mean;
}

export function plain_win_prob(pick_size) {
  let total = 0;
  for (let hits = 0; hits <= pick_size; hits++) {
    if ((number_payouts[pick_size][hits] ?? 0) > 0) total += hit_prob(pick_size, hits);
  }
  return total;
}

export function parity_break_even(state) {
  return state === "draw" ? 0.25 : 0.5;
}

export function age_bucket(age) {
  if (age === 0) return "0";
  if (age <= 2) return "1-2";
  if (age <= 5) return "3-5";
  if (age <= 10) return "6-10";
  if (age <= 20) return "11-20";
  return "21+";
}

export function z_bucket(z) {
  if (z <= -2) return "<= -2";
  if (z <= -1) return "-2 to -1";
  if (z <= 0) return "-1 to 0";
  if (z <= 1) return "0 to 1";
  if (z <= 2) return "1 to 2";
  return ">= 2";
}

function compute_number_age_stats(draws) {
  const labels = ["0", "1-2", "3-5", "6-10", "11-20", "21+"];
  const stats = new Map(labels.map((label) => [label, {bucket: label, total: 0, hits: 0}]));
  const ages = new Array(81).fill(0);

  for (const draw of draws) {
    for (let n = 1; n <= 80; n++) {
      const bucket = age_bucket(ages[n]);
      const row = stats.get(bucket);
      row.total += 1;
      if (draw.num_set.has(n)) row.hits += 1;
    }
    for (let n = 1; n <= 80; n++) {
      ages[n] = draw.num_set.has(n) ? 0 : ages[n] + 1;
    }
  }

  return labels.map((label) => {
    const row = stats.get(label);
    return {bucket: label, hit_rate: row.hits / row.total};
  });
}

function compute_recent_frequency_stats(draws) {
  const window_size = 50;
  const counts = new Array(81).fill(0);
  const queue = [];
  const stats = Array.from({length: window_size + 1}, (_, count) => ({
    recent_hits: count,
    total: 0,
    hits: 0
  }));

  for (let i = 0; i < draws.length; i++) {
    if (queue.length === window_size) {
      const hit_set = draws[i].num_set;
      for (let n = 1; n <= 80; n++) {
        stats[counts[n]].total += 1;
        if (hit_set.has(n)) stats[counts[n]].hits += 1;
      }
      const old = queue.shift();
      for (const n of old) counts[n] -= 1;
    }
    queue.push(draws[i].numbers);
    for (const n of draws[i].numbers) counts[n] += 1;
  }

  return stats
    .filter((row) => row.total > 0)
    .map((row) => ({recent_hits: row.recent_hits, hit_rate: row.hits / row.total}));
}

export function compute_parity_window_stats({draws, p_parity, parity_target, parity_window}) {
  const expected_probability = p_parity[parity_target];
  const counts = {odd: 0, even: 0, draw: 0};
  const queue = [];
  const labels = ["<= -2", "-2 to -1", "-1 to 0", "0 to 1", "1 to 2", ">= 2"];
  const bins = new Map(labels.map((label) => [label, {bucket: label, total: 0, hits: 0}]));

  for (let i = 0; i < draws.length; i++) {
    if (queue.length === parity_window) {
      const expected = parity_window * expected_probability;
      const sigma = Math.sqrt(parity_window * expected_probability * (1 - expected_probability));
      const z = sigma === 0 ? 0 : (counts[parity_target] - expected) / sigma;
      const bucket = z_bucket(z);
      const row = bins.get(bucket);
      row.total += 1;
      if (draws[i].parity === parity_target) row.hits += 1;

      const old = queue.shift();
      counts[old] -= 1;
    }
    queue.push(draws[i].parity);
    counts[draws[i].parity] += 1;
  }

  return labels
    .map((label) => {
      const row = bins.get(label);
      return {bucket: label, hit_rate: row.total ? row.hits / row.total : null};
    })
    .filter((row) => row.hit_rate != null);
}

export async function load_kino_bundle() {
  if (bundle_promise) return bundle_promise;

  bundle_promise = (async () => {
    const plot = await import("https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm");
    const d3 = await import("https://cdn.jsdelivr.net/npm/d3@7/+esm");
    const copy = await fetch_json(new URL("i18n.json", import.meta.url));
    const stylesheet = await fetch_text(new URL("styles.css", import.meta.url));
    const raw = await d3.csv(new URL("data/kino.csv", import.meta.url).toString(), d3.autoType);
    const pick_trajectory_focus = await d3.csv(
      new URL("research/outputs/pick_trajectory_focus_101952.csv", import.meta.url).toString(),
      d3.autoType
    );

    const draws = raw.map((row, index) => {
      const numbers = d3.range(20).map((j) => +row[`d${j}`]).sort((a, b) => a - b);
      const num_set = new Set(numbers);
      const odd_count = numbers.reduce((sum, n) => sum + (n % 2), 0);
      const parity = row.parity ?? (odd_count > 10 ? "odd" : odd_count < 10 ? "even" : "draw");

      return {
        index,
        id: +row.id,
        date: row.date,
        time: row.tiodde,
        numbers,
        num_set,
        odd_count,
        parity,
        column: +row.col,
        sum: d3.sum(numbers),
        digit_sum: d3.sum(numbers, (n) => [...String(n)].reduce((a, c) => a + +c, 0)),
        range: numbers[numbers.length - 1] - numbers[0],
        gap_max: d3.max(numbers.slice(1), (n, idx) => n - numbers[idx])
      };
    });

    const p_draw = comb(40, 10) * comb(40, 10) / comb(80, 20);
    const p_parity = {
      odd: (1 - p_draw) / 2,
      even: (1 - p_draw) / 2,
      draw: p_draw
    };

    return {
      module_root_url,
      plot,
      d3,
      copy,
      stylesheet,
      draws,
      number_payouts,
      surrogate_fit,
      pick_monte_carlo,
      pick_variance_summary,
      pick_trajectory_focus,
      pick_trajectory_colors,
      portfolio_monte_carlo,
      ga_validation_summary,
      ga_window_examples,
      parity_states,
      p_parity,
      number_age_stats: compute_number_age_stats(draws),
      recent_frequency_stats: compute_recent_frequency_stats(draws)
    };
  })();

  return bundle_promise;
}

export function notebook_url_for(next_lang) {
  try {
    const url = new URL(window.top.location.href);
    url.searchParams.set("lang", next_lang);
    return url.toString();
  } catch {
    return `?lang=${next_lang}`;
  }
}

export async function create_kino_env({Inputs, html, md, lang = null}) {
  const bundle = await load_kino_bundle();
  const resolved_lang = resolve_lang(lang);
  const text = create_text(bundle.copy, resolved_lang);
  const formatters = create_formatters(bundle.d3);
  const blocks = create_block_helpers({html, md, text});

  return {
    ...bundle,
    ...formatters,
    ...blocks,
    Inputs,
    html,
    md,
    lang: resolved_lang,
    text,
    share_url: notebook_url_for(resolved_lang),
    full_width: Math.min(1180, Math.max(860, window.innerWidth - 180)),
    half_width: Math.max(420, Math.floor((Math.min(1180, Math.max(860, window.innerWidth - 180)) - 32) / 2))
  };
}

export function build_system_rows({draws, d3, text}) {
  const system_specs = [
    {id: "c_1", pool: 12, columns: 6},
    {id: "c_2", pool: 13, columns: 13},
    {id: "c_3", pool: 14, columns: 42},
    {id: "c_4", pool: 15, columns: 98},
    {id: "c_5", pool: 16, columns: 228},
    {id: "c_6", pool: 17, columns: 447},
    {id: "c_7", pool: 18, columns: 917},
    {id: "c_8", pool: 19, columns: 1840},
    {id: "c_9", pool: 20, columns: 3125},
    {id: "c_10", pool: 21, columns: 6080}
  ];

  return system_specs.map((spec) => {
    const cost = spec.columns * 0.5;
    let ge9 = 0;
    for (const draw of draws) {
      const hits = draw.numbers.filter((n) => n <= spec.pool).length;
      if (hits >= 9) ge9 += 1;
    }
    return {
      id: spec.id,
      label: text(`systems.codes.${spec.id}`),
      pool: spec.pool,
      columns: spec.columns,
      cost,
      fair_trigger_prob: d3.sum(d3.range(9, spec.pool + 1), (hits) => hit_prob(spec.pool, hits)),
      hist_trigger_prob: ge9 / draws.length,
      expected_loss_per_draw: cost * (1 - plain_rtp(10))
    };
  });
}
