const module_root_url = new URL(".", import.meta.url);

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

function ensure_stylesheet(html, stylesheet) {
  const existing = document.querySelector('style[data-kino-article="true"]');
  if (existing) return existing;
  const style = html`<style data-kino-article="true">${stylesheet}</style>`;
  document.head.append(style);
  return style;
}

export async function createKinoArticle({Inputs, html, md}) {

  const plot = await import("https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm");
  const d3 = await import("https://cdn.jsdelivr.net/npm/d3@7/+esm");
  const copy = await fetch_json(new URL("i18n.json", import.meta.url));
  const stylesheet = await fetch_text(new URL("styles.css", import.meta.url));

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

  const portfolio_monte_carlo = [
    {id: "pick_2_draw_column", payout_hit: 0.598073, positive_rounds: 0.283142, rtp: 0.78156, ruin: 1.0, final_profit: -5460.9933},
    {id: "pick_5_draw_column", payout_hit: 0.352314, positive_rounds: 0.292235, rtp: 0.785031, ruin: 1.0, final_profit: -5374.23},
    {id: "pick_7_draw_column", payout_hit: 0.452459, positive_rounds: 0.289881, rtp: 0.785501, ruin: 1.0, final_profit: -5362.485},
    {id: "pick_7_bonus_draw_column", payout_hit: 0.487231, positive_rounds: 0.316058, rtp: 0.771027, ruin: 0.9967, final_profit: -6869.1883}
  ];

  const walk_forward_summary = {
    final_bankroll: 464,
    initial_bankroll: 500
  };

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

  function comb(n, k) {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    let result = 1;
    for (let i = 1; i <= k; i++) result = result * (n - k + i) / i;
    return result;
  }

  function hit_prob(pick_size, hits) {
    return comb(20, hits) * comb(60, pick_size - hits) / comb(80, pick_size);
  }

  function plain_rtp(pick_size) {
    let mean = 0;
    for (let hits = 0; hits <= pick_size; hits++) {
      mean += hit_prob(pick_size, hits) * (number_payouts[pick_size][hits] ?? 0);
    }
    return mean;
  }

  function plain_win_prob(pick_size) {
    let total = 0;
    for (let hits = 0; hits <= pick_size; hits++) {
      if ((number_payouts[pick_size][hits] ?? 0) > 0) total += hit_prob(pick_size, hits);
    }
    return total;
  }

  const p_draw = comb(40, 10) * comb(40, 10) / comb(80, 20);
  const p_parity = {
    odd: (1 - p_draw) / 2,
    even: (1 - p_draw) / 2,
    draw: p_draw
  };

  function parity_break_even(state) {
    return state === "draw" ? 0.25 : 0.5;
  }

  function age_bucket(age) {
    if (age === 0) return "0";
    if (age <= 2) return "1-2";
    if (age <= 5) return "3-5";
    if (age <= 10) return "6-10";
    if (age <= 20) return "11-20";
    return "21+";
  }

  function z_bucket(z) {
    if (z <= -2) return "<= -2";
    if (z <= -1) return "-2 to -1";
    if (z <= 0) return "-1 to 0";
    if (z <= 1) return "0 to 1";
    if (z <= 2) return "1 to 2";
    return ">= 2";
  }

  function lookup(object, path) {
    return path.split(".").reduce((value, part) => value?.[part], object);
  }

  const raw = await d3.csv(new URL("data/kino.csv", import.meta.url).toString(), d3.autoType);
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

  let lang = (() => {
    const candidate = new URLSearchParams(location.search).get("lang");
    return candidate === "el" || candidate === "en" ? candidate : "en";
  })();
  let parity_target = "draw";
  let parity_window = 100;
  let portfolio_horizon = 5000;

  const fmt_pct = d3.format(".2%");
  const fmt_pct1 = d3.format(".1%");
  const fmt_num = d3.format(",");
  const fmt_money = d3.format(",.2f");

  function money_label(value) {
    return `€${fmt_money(value)}`;
  }

  function text(key, vars = {}) {
    const template = lookup(copy[lang], key) ?? key;
    return String(template).replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? `{${name}}`);
  }

  function notebook_url_for(next_lang) {
    try {
      const url = new URL(window.top.location.href);
      url.searchParams.set("lang", next_lang);
      return url.toString();
    } catch {
      return `?lang=${next_lang}`;
    }
  }

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

  function model_name(id) {
    return text(`models.${id}`);
  }

  function strategy_name(id) {
    return text(`strategies.${id}`);
  }

  function system_name(id) {
    return text(`systems.codes.${id}`);
  }

  function compute_number_age_stats() {
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

  function compute_recent_frequency_stats() {
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

  function compute_parity_window_stats() {
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

  const number_age_stats = compute_number_age_stats();
  const recent_frequency_stats = compute_recent_frequency_stats();
  const root = html`<div class="kino-article"></div>`;

  function render() {
    const full_width = Math.min(1180, Math.max(860, window.innerWidth - 180));
    const half_width = Math.max(420, Math.floor((full_width - 32) / 2));
    const share_url = notebook_url_for(lang);

    const parity_actual = parity_states.map((state) => ({
      label: text(`options.${state}`),
      actual: d3.mean(draws, (row) => (row.parity === state ? 1 : 0)),
      expected: state === "draw" ? p_parity.draw : p_parity.odd
    }));

    const column_actual = d3.range(1, 11).map((column) => ({
      column: String(column),
      actual: d3.mean(draws, (row) => (row.column === column ? 1 : 0))
    }));

    const number_actual = d3.range(1, 81).map((number) => ({
      number,
      actual: d3.mean(draws, (row) => (row.num_set.has(number) ? 1 : 0)),
      expected: 0.25
    }));

    const pick_tradeoff = d3.range(1, 13).map((pick) => ({
      pick,
      win_prob: plain_win_prob(pick),
      rtp: plain_rtp(pick)
    }));

    const pick_variance_rows = pick_variance_summary.map((row) => ({
      ...row,
      jackpot_scale: Math.log10(row.top_net_win + 1)
    }));

    const parity_window_stats = compute_parity_window_stats();

    const portfolio_path = portfolio_monte_carlo.map((row) => ({
      label: strategy_name(row.id),
      bankroll: 500 + row.final_profit * (portfolio_horizon / 10000)
    }));

    const ga_chart_rows = ga_window_examples.map((row) => ({
      window: row.window,
      model_label: text(`tables.${row.model}`),
      regime_label: text(`tables.${row.regime}`),
      profit: row.profit
    }));

    const ga_summary_rows = ["real_history", "null_history"].map((regime) => {
      const row = {window_label: text(`tables.${regime}`)};
      for (const metric of ["ga_pick5", "ga_combined"]) {
        const match = ga_validation_summary.find((item) => item.label === regime && item.metric === metric);
        row[metric] = match?.value ?? null;
      }
      return row;
    });

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

    const system_rows = system_specs.map((spec) => {
      const cost = spec.columns * 0.5;
      let ge9 = 0;
      for (const draw of draws) {
        const hits = draw.numbers.filter((n) => n <= spec.pool).length;
        if (hits >= 9) ge9 += 1;
      }
      return {
        id: spec.id,
        label: system_name(spec.id),
        pool: spec.pool,
        columns: spec.columns,
        cost,
        fair_trigger_prob: d3.sum(d3.range(9, spec.pool + 1), (hits) => hit_prob(spec.pool, hits)),
        hist_trigger_prob: ge9 / draws.length,
        expected_loss_per_draw: cost * (1 - plain_rtp(10))
      };
    });

    const body = html`<div></div>`;
    const style = html`<style>${stylesheet}</style>`;

    const language_input = Inputs.radio(
      new Map([
        [text("ui.language_option_en"), "en"],
        [text("ui.language_option_el"), "el"]
      ]),
      {
        label: text("ui.language_label"),
        value: lang
      }
    );
    language_input.addEventListener("input", () => {
      lang = language_input.value;
      render();
    });

    const parity_target_input = Inputs.radio(
      new Map([
        [text("options.odd"), "odd"],
        [text("options.even"), "even"],
        [text("options.draw"), "draw"]
      ]),
      {
        label: text("ui.target_outcome"),
        value: parity_target
      }
    );
    parity_target_input.addEventListener("input", () => {
      parity_target = parity_target_input.value;
      render();
    });

    const parity_window_input = Inputs.range([20, 200], {
      label: text("ui.rolling_window"),
      step: 10,
      value: parity_window
    });
    parity_window_input.addEventListener("input", () => {
      parity_window = +parity_window_input.value;
      render();
    });

    const portfolio_horizon_input = Inputs.range([100, 10000], {
      label: text("ui.draw_horizon"),
      step: 100,
      value: portfolio_horizon
    });
    portfolio_horizon_input.addEventListener("input", () => {
      portfolio_horizon = +portfolio_horizon_input.value;
      render();
    });

    body.append(block(language_input, "kino-toolbar"));

    body.append(html`<section class="hero">
      <div class="kicker">${text("article.hero.kicker")}</div>
      <h1>${text("article.hero.title")}</h1>
      <div class="deck">${text("article.hero.deck")}</div>
      <div class="meta">${text("article.hero.meta", {draw_count: fmt_num(draws.length)})}</div>
      <div class="sharebox"><a href="${share_url}" target="_blank" rel="noopener noreferrer">${text("ui.share_link")}</a></div>
    </section>`);

    body.append(markdown_block("article.lede"));

    body.append(html`<div class="mini-grid">
      <div class="mini-card">
        <div class="label">${text("article.cards.dataset")}</div>
        <div class="value">${fmt_num(draws.length)}</div>
      </div>
      <div class="mini-card">
        <div class="label">${text("article.cards.best_side_market_rtp")}</div>
        <div class="value">${fmt_pct(0.8135)}</div>
      </div>
      <div class="mini-card">
        <div class="label">${text("article.cards.best_plain_pick_rtp")}</div>
        <div class="value">${fmt_pct(0.6999)}</div>
      </div>
      <div class="mini-card">
        <div class="label">${text("article.cards.best_surrogate_model")}</div>
        <div class="value">${text("article.cards.uniform_draw")}</div>
      </div>
    </div>`);

    body.append(heading_block("article.intro.title"));
    body.append(markdown_block("article.intro.body"));

    const fairness_row = html`<div class="plot-row"></div>`;
    fairness_row.append(
      plot.plot({
        width: half_width,
        height: 340,
        y: {percent: true, grid: true, label: text("charts.fairness.share_of_draws")},
        x: {label: null},
        marks: [
          plot.barY(parity_actual, {
            x: "label",
            y: "actual",
            fill: "#4C78A8",
            tip: true,
            title: (row) => `${row.label}\n${text("charts.fairness.share_of_draws")}: ${fmt_pct(row.actual)}\n${lang === "el" ? "Αναμενόμενο" : "Expected"}: ${fmt_pct(row.expected)}`
          }),
          plot.dot(parity_actual, {x: "label", y: "expected", r: 7, stroke: "black", fill: "white", strokeWidth: 2})
        ],
        caption: text("charts.fairness.parity_caption")
      })
    );
    fairness_row.append(
      plot.plot({
        width: half_width,
        height: 340,
        y: {percent: true, grid: true, label: text("charts.fairness.share_of_draws")},
        x: {label: text("charts.fairness.column")},
        marks: [
          plot.barY(column_actual, {
            x: "column",
            y: "actual",
            fill: "#72B7B2",
            tip: true,
            title: (row) => `${text("charts.fairness.column")} ${row.column}\n${text("charts.fairness.share_of_draws")}: ${fmt_pct(row.actual)}`
          }),
          plot.ruleY([0.10], {stroke: "firebrick", strokeDasharray: "6,4"})
        ],
        caption: text("charts.fairness.column_caption")
      })
    );
    body.append(block(fairness_row, "plot-block"));

    body.append(
      block(
        plot.plot({
          width: full_width,
          height: 360,
          y: {percent: true, grid: true, label: text("charts.fairness.share_of_draws")},
          x: {label: text("charts.fairness.number"), tickRotate: -90, tickFormat: (d) => String(d)},
          marks: [
            plot.barY(number_actual, {
              x: "number",
              y: "actual",
              fill: "#9aa1ac",
              tip: true,
              title: (row) => `${lang === "el" ? "Αριθμός" : "Number"} ${row.number}\n${text("charts.fairness.share_of_draws")}: ${fmt_pct(row.actual)}\n${lang === "el" ? "Αναμενόμενο" : "Expected"}: ${fmt_pct(row.expected)}`
            }),
            plot.ruleY([0.25], {stroke: "firebrick", strokeDasharray: "6,4"})
          ],
          caption: text("charts.fairness.number_caption")
        }),
        "plot-block"
      )
    );

    body.append(heading_block("article.opening_evidence.title", 3));
    body.append(markdown_block("article.opening_evidence.body"));

    body.append(
      block(
        plot.plot({
          width: full_width,
          height: 380,
          marginLeft: 240,
          x: {label: text("charts.surrogate.x_label"), grid: true},
          y: {label: null},
          marks: [
            plot.barX(surrogate_fit, {
              x: "rmse",
              y: (row) => model_name(row.id),
              sort: {y: "x", reverse: true},
              fill: (row) => row.id === "uniform_shuffle" ? "#1f8f55" : row.id === "best_evolved_surrogate" ? "#b81d24" : "#9aa1ac",
              tip: true,
              title: (row) => `${model_name(row.id)}\n${text("charts.surrogate.x_label")}: ${row.rmse.toFixed(6)}`
            })
          ]
        }),
        "plot-block"
      )
    );

    body.append(heading_block("article.simple_model.title", 3));
    body.append(markdown_block("article.simple_model.body"));

    body.append(
      html`<div class="callout">
        <strong>${text("charts.surrogate.callout_title")}</strong>
        ${text("charts.surrogate.callout_body")}
      </div>`
    );

    body.append(heading_block("article.myth1.title"));
    body.append(markdown_block("article.myth1.body"));
    body.append(
      block(
        plot.plot({
          width: full_width,
          height: 360,
          y: {percent: true, grid: true, label: text("charts.myth1.y_label")},
          x: {label: text("charts.myth1.x_label")},
          marks: [
            plot.barY(number_age_stats, {
              x: "bucket",
              y: "hit_rate",
              fill: "#72B7B2",
              tip: true,
              title: (row) => `${text("charts.myth1.x_label")}: ${row.bucket}\n${text("charts.myth1.y_label")}: ${fmt_pct(row.hit_rate)}`
            }),
            plot.ruleY([0.25], {stroke: "firebrick", strokeDasharray: "6,4"})
          ],
          caption: text("charts.myth1.caption")
        }),
        "plot-block"
      )
    );

    body.append(heading_block("article.myth2.title"));
    body.append(markdown_block("article.myth2.body"));
    body.append(
      block(
        plot.plot({
          width: full_width,
          height: 360,
          x: {label: text("charts.myth2.x_label")},
          y: {percent: true, grid: true, label: text("charts.myth2.y_label")},
          marks: [
            plot.lineY(recent_frequency_stats, {x: "recent_hits", y: "hit_rate", stroke: "#1f8f55"}),
            plot.dot(recent_frequency_stats, {
              x: "recent_hits",
              y: "hit_rate",
              fill: "#1f8f55",
              tip: true,
              title: (row) => `${text("charts.myth2.x_label")}: ${row.recent_hits}\n${text("charts.myth2.y_label")}: ${fmt_pct(row.hit_rate)}`
            }),
            plot.ruleY([0.25], {stroke: "firebrick", strokeDasharray: "6,4"})
          ]
        }),
        "plot-block"
      )
    );

    body.append(heading_block("article.myth3.title"));
    body.append(markdown_block("article.myth3.body"));

    const parity_controls = html`<div class="control-row"></div>`;
    parity_controls.append(parity_target_input, parity_window_input);
    body.append(block(parity_controls, "control-block"));
    body.append(
      block(
        plot.plot({
          width: full_width,
          height: 360,
          y: {percent: true, grid: true, label: text("charts.myth3.y_label")},
          x: {label: text("charts.myth3.x_label")},
          marks: [
            plot.barY(parity_window_stats, {
              x: "bucket",
              y: "hit_rate",
              fill: "#E45756",
              tip: true,
              title: (row) => `${text("charts.myth3.x_label")}: ${row.bucket}\n${text("charts.myth3.y_label")}: ${fmt_pct(row.hit_rate)}`
            }),
            plot.ruleY([p_parity[parity_target]], {stroke: "black", strokeDasharray: "6,4"}),
            plot.ruleY([parity_break_even(parity_target)], {stroke: "firebrick", strokeDasharray: "2,6"})
          ],
          caption: text("charts.myth3.caption")
        }),
        "plot-block"
      )
    );

    body.append(heading_block("article.myth4.title"));
    body.append(markdown_block("article.myth4.body"));
    body.append(
      block(
        plot.plot({
          width: full_width,
          height: 380,
          x: {percent: true, grid: true, label: text("charts.myth4.x_label")},
          y: {percent: true, grid: true, label: text("charts.myth4.y_label")},
          marks: [
            plot.ruleY([1], {stroke: "firebrick", strokeDasharray: "6,4"}),
            plot.dot(pick_tradeoff, {
              x: "win_prob",
              y: "rtp",
              r: 8,
              fill: "#4C78A8",
              tip: true,
              title: (row) => `${text("tables.pick")} ${row.pick}\n${text("charts.myth4.x_label")}: ${fmt_pct(row.win_prob)}\n${text("charts.myth4.y_label")}: ${fmt_pct(row.rtp)}`
            }),
            plot.text(pick_tradeoff, {x: "win_prob", y: "rtp", text: (row) => String(row.pick), dy: -10, fill: "#1d2433"})
          ],
          caption: text("charts.myth4.caption")
        }),
        "plot-block"
      )
    );

    body.append(
      block(
        Inputs.table(
          pick_monte_carlo.map((row) => ({
            [text("tables.pick")]: row.pick,
            [text("tables.hit_frequency")]: fmt_pct(row.hit_freq),
            [text("tables.rtp")]: fmt_pct(row.rtp),
            [text("tables.mean_final_profit")]: fmt_money(row.mean_final_profit)
          }))
        ),
        "table-block"
      )
    );

    body.append(heading_block("article.myth4.variance_title", 3));
    body.append(markdown_block("article.myth4.variance_body"));
    body.append(
      block(
        plot.plot({
          width: full_width,
          height: 360,
          x: {label: null, tickFormat: (d) => String(d), domain: d3.range(1, 10)},
          y: {grid: true, label: text("charts.myth4.variance_y_label")},
          r: {range: [5, 24]},
          marks: [
            plot.lineY(pick_variance_rows, {x: "pick", y: "median_rounds", stroke: "#4C78A8", strokeWidth: 2}),
            plot.dot(pick_variance_rows, {
              x: "pick",
              y: "median_rounds",
              r: "jackpot_scale",
              fill: "#E45756",
              fillOpacity: 0.75,
              stroke: "#1d2433",
              tip: true,
              title: (row) => `${text("tables.pick")} ${row.pick}\n${text("tables.median_rounds_1000")}: ${fmt_num(row.median_rounds)}\n${text("tables.top_net_win")}: ${money_label(row.top_net_win)}\n${text("tables.profitable_ever")}: ${fmt_pct(row.profitable_ever)}`
            }),
            plot.text(pick_variance_rows, {
              x: "pick",
              y: "median_rounds",
              text: (row) => String(row.pick),
              dy: -16,
              fill: "#1d2433"
            })
          ],
          caption: text("charts.myth4.variance_caption")
        }),
        "plot-block"
      )
    );

    body.append(
      block(
        Inputs.table(
          pick_variance_rows.map((row) => ({
            [text("tables.pick")]: row.pick,
            [text("tables.hit_frequency")]: fmt_pct(row.hit_freq),
            [text("tables.rtp")]: fmt_pct(row.rtp),
            [text("tables.top_net_win")]: fmt_money(row.top_net_win),
            [text("tables.median_rounds_1000")]: fmt_num(row.median_rounds),
            [text("tables.profitable_ever")]: fmt_pct(row.profitable_ever)
          }))
        ),
        "table-block"
      )
    );

    body.append(heading_block("article.myth5.title"));
    body.append(markdown_block("article.myth5.body"));
    body.append(
      block(
        plot.plot({
          width: full_width,
          height: 360,
          x: {percent: true, grid: true, label: text("charts.myth5.scatter_x_label")},
          y: {percent: true, grid: true, label: text("charts.myth5.scatter_y_label")},
          marks: [
            plot.ruleY([1], {stroke: "firebrick", strokeDasharray: "6,4"}),
            plot.dot(portfolio_monte_carlo, {
              x: "payout_hit",
              y: "rtp",
              r: 10,
              fill: "#B279A2",
              tip: true,
              title: (row) => `${strategy_name(row.id)}\n${text("charts.myth5.scatter_x_label")}: ${fmt_pct(row.payout_hit)}\n${text("charts.myth5.scatter_y_label")}: ${fmt_pct(row.rtp)}\n${lang === "el" ? "Μέσο τελικό αποτέλεσμα" : "Average final result"}: ${money_label(row.final_profit)}`
            }),
            plot.text(portfolio_monte_carlo, {x: "payout_hit", y: "rtp", text: (row) => strategy_name(row.id), dy: -12})
          ]
        }),
        "plot-block"
      )
    );

    body.append(block(portfolio_horizon_input, "control-block"));
    body.append(
      block(
        plot.plot({
          width: full_width,
          height: 360,
          y: {grid: true, label: text("charts.myth5.bankroll_y_label")},
          x: {label: null},
          marks: [
            plot.ruleY([0], {stroke: "firebrick", strokeDasharray: "6,4"}),
            plot.barY(portfolio_path, {
              x: "label",
              y: "bankroll",
              fill: "#F58518",
              tip: true,
              title: (row) => `${row.label}\n${text("charts.myth5.bankroll_y_label")}: ${money_label(row.bankroll)}`
            }),
            plot.ruleY([500], {stroke: "black", strokeDasharray: "6,4"})
          ],
          caption: text("charts.myth5.bankroll_caption")
        }),
        "plot-block"
      )
    );

    body.append(heading_block("article.myth6.title"));
    body.append(markdown_block("article.myth6.body"));
    body.append(
      block(
        plot.plot({
          width: full_width,
          height: 360,
          y: {grid: true, label: text("charts.myth6.y_label")},
          x: {label: text("charts.myth6.x_label")},
          marks: [
            plot.barY(system_rows, {
              x: "label",
              y: "expected_loss_per_draw",
              fill: "#E45756",
              tip: true,
              title: (row) => `${row.label}\n${text("tables.cost_per_draw")}: ${money_label(row.cost)}\n${text("charts.myth6.y_label")}: ${money_label(row.expected_loss_per_draw)}\n${text("tables.fair_chance_pool_contains_9_plus")}: ${fmt_pct1(row.fair_trigger_prob)}`
            }),
            plot.text(system_rows, {
              x: "label",
              y: "expected_loss_per_draw",
              text: (row) => `€${d3.format(",.0f")(row.expected_loss_per_draw)}`,
              dy: -8
            })
          ]
        }),
        "plot-block"
      )
    );

    body.append(
      block(
        Inputs.table(
          system_rows.map((row) => ({
            [text("tables.system")]: row.label,
            [text("tables.pool_size")]: row.pool,
            [text("tables.columns")]: fmt_num(row.columns),
            [text("tables.cost_per_draw")]: fmt_money(row.cost),
            [text("tables.fair_chance_pool_contains_9_plus")]: fmt_pct1(row.fair_trigger_prob),
            [text("tables.historical_trigger_rate")]: fmt_pct1(row.hist_trigger_prob)
          }))
        ),
        "table-block"
      )
    );

    body.append(heading_block("article.myth7.title"));
    body.append(markdown_block("article.myth7.body"));

    body.append(html`<div class="mini-grid">
      <div class="mini-card">
        <div class="label">${text("article.myth7.cards.can_fit_history")}</div>
        <div class="value">${text("article.myth7.cards.can_fit_history_value")}</div>
      </div>
      <div class="mini-card">
        <div class="label">${text("article.myth7.cards.cannot_validate_edge")}</div>
        <div class="value">${text("article.myth7.cards.cannot_validate_edge_value")}</div>
      </div>
      <div class="mini-card">
        <div class="label">${text("article.myth7.cards.null_runs_look_good")}</div>
        <div class="value">${text("article.myth7.cards.null_runs_look_good_value")}</div>
      </div>
    </div>`);

    body.append(heading_block("article.myth7.hypothesis_title", 3));
    body.append(markdown_block("article.myth7.hypothesis_body"));
    body.append(heading_block("article.myth7.results_title", 3));
    body.append(markdown_block("article.myth7.results_body"));

    body.append(
      block(
        plot.plot({
          width: full_width,
          height: 380,
          x: {label: text("tables.window")},
          y: {grid: true, label: "€"},
          fx: {label: null},
          color: {
            legend: true,
            label: null,
            domain: [text("tables.real_history"), text("tables.null_history")],
            range: ["#b81d24", "#9aa1ac"]
          },
          marks: [
            plot.ruleY([0], {stroke: "black", strokeDasharray: "6,4"}),
            plot.dot(ga_chart_rows, {
              fx: "model_label",
              x: "window",
              y: "profit",
              fill: "regime_label",
              stroke: "regime_label",
              r: 7,
              tip: true
            })
          ],
          caption: text("article.myth7.chart_caption")
        }),
        "plot-block"
      )
    );

    body.append(
      block(
        Inputs.table(
          ga_summary_rows.map((row) => ({
            [text("tables.window")]: row.window_label,
            [text("tables.ga_pick5")]: fmt_money(row.ga_pick5),
            [text("tables.ga_combined")]: fmt_money(row.ga_combined)
          }))
        ),
        "table-block"
      )
    );

    body.append(
      html`<div class="callout">
        <strong>${text("article.myth7.callout_title")}</strong>
        ${text("article.myth7.callout_body")}
      </div>`
    );

    body.append(
      html`<div class="callout">
        <strong>${text("article.live_rule.title")}</strong>
        ${text("article.live_rule.body", {
          final_bankroll: walk_forward_summary.final_bankroll,
          initial_bankroll: walk_forward_summary.initial_bankroll
        })}
      </div>`
    );

    body.append(heading_block("article.closing.title"));
    body.append(markdown_block("article.closing.body"));

    body.append(heading_block("article.methodology.title", 3));
    body.append(markdown_block("article.methodology.body", {draw_count: fmt_num(draws.length)}));
    body.append(heading_block("article.sources.title", 3));
    body.append(markdown_block("article.sources.body"));
    body.append(heading_block("article.appendix.title", 3));
    body.append(markdown_block("article.appendix.body"));

    root.replaceChildren(body);
  }

  ensure_stylesheet(html, stylesheet);
  render();
  return root;

}

export const repo_base_url = module_root_url.href;
