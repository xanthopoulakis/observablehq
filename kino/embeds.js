import {
  build_system_rows,
  compute_parity_window_stats,
  create_text,
  create_kino_env,
  ensure_stylesheet,
  load_kino_bundle,
  parity_break_even,
  plain_rtp,
  plain_win_prob,
  resolve_lang
} from "./shared.js";

function create_embed_shell({html, title = null, body = null}) {
  const shell = html`<section class="kino-article kino-embed"></section>`;
  if (title) shell.append(html`<h2>${title}</h2>`);
  if (body) shell.append(html`<p>${body}</p>`);
  return shell;
}

export async function create_fairness_parity_plot({html, md, Inputs, lang = null, width = null, height = 340} = {}) {
  const env = await create_kino_env({Inputs, html, md, lang});
  const {plot, d3, draws, parity_states, p_parity, text} = env;
  const chart_width = width ?? env.half_width;
  const parity_actual = parity_states.map((state) => ({
    label: text(`options.${state}`),
    actual: d3.mean(draws, (row) => (row.parity === state ? 1 : 0)),
    expected: state === "draw" ? p_parity.draw : p_parity.odd
  }));
  return plot.plot({
    width: chart_width,
    height,
    y: {percent: true, grid: true, label: text("charts.fairness.share_of_draws")},
    x: {label: null},
    marks: [
      plot.barY(parity_actual, {x: "label", y: "actual", fill: "#4C78A8"}),
      plot.dot(parity_actual, {x: "label", y: "expected", r: 7, stroke: "black", fill: "white", strokeWidth: 2})
    ],
    caption: text("charts.fairness.parity_caption")
  });
}

export async function create_fairness_columns_plot({html, md, Inputs, lang = null, width = null, height = 340} = {}) {
  const env = await create_kino_env({Inputs, html, md, lang});
  const {plot, d3, draws, text} = env;
  const chart_width = width ?? env.half_width;
  const column_actual = d3.range(1, 11).map((column) => ({
    column: String(column),
    actual: d3.mean(draws, (row) => (row.column === column ? 1 : 0))
  }));
  return plot.plot({
    width: chart_width,
    height,
    y: {percent: true, grid: true, label: text("charts.fairness.share_of_draws")},
    x: {label: text("charts.fairness.column")},
    marks: [
      plot.barY(column_actual, {x: "column", y: "actual", fill: "#72B7B2"}),
      plot.ruleY([0.10], {stroke: "firebrick", strokeDasharray: "6,4"})
    ],
    caption: text("charts.fairness.column_caption")
  });
}

export async function create_surrogate_fit_plot({html, md, Inputs, lang = null, width = null, height = 380} = {}) {
  const env = await create_kino_env({Inputs, html, md, lang});
  const {plot, surrogate_fit, text} = env;
  const chart_width = width ?? env.full_width;
  return plot.plot({
    title: text("charts.surrogate.title"),
    width: chart_width,
    height,
    x: {label: text("charts.surrogate.x_label"), grid: true},
    y: {label: null},
    marks: [
      plot.barX(surrogate_fit, {
        x: "rmse",
        y: (row) => text(`models.${row.id}`),
        sort: {y: "x", reverse: true},
        fill: (row) => row.id === "uniform_shuffle" ? "#1f8f55" : row.id === "best_evolved_surrogate" ? "#b81d24" : "#9aa1ac"
      })
    ]
  });
}

export async function create_overdue_numbers_plot({html, md, Inputs, lang = null, width = null, height = 360} = {}) {
  const env = await create_kino_env({Inputs, html, md, lang});
  const {plot, number_age_stats, text} = env;
  const chart_width = width ?? env.full_width;
  return plot.plot({
    width: chart_width,
    height,
    y: {percent: true, grid: true, label: text("charts.myth1.y_label")},
    x: {label: text("charts.myth1.x_label")},
    marks: [
      plot.barY(number_age_stats, {x: "bucket", y: "hit_rate", fill: "#72B7B2"}),
      plot.ruleY([0.25], {stroke: "firebrick", strokeDasharray: "6,4"})
    ],
    caption: text("charts.myth1.caption")
  });
}

export async function create_hot_cold_plot({html, md, Inputs, lang = null, width = null, height = 360} = {}) {
  const env = await create_kino_env({Inputs, html, md, lang});
  const {plot, recent_frequency_stats, text} = env;
  const chart_width = width ?? env.full_width;
  return plot.plot({
    width: chart_width,
    height,
    x: {label: text("charts.myth2.x_label")},
    y: {percent: true, grid: true, label: text("charts.myth2.y_label")},
    marks: [
      plot.lineY(recent_frequency_stats, {x: "recent_hits", y: "hit_rate", stroke: "#1f8f55"}),
      plot.dot(recent_frequency_stats, {x: "recent_hits", y: "hit_rate", fill: "#1f8f55"}),
      plot.ruleY([0.25], {stroke: "firebrick", strokeDasharray: "6,4"})
    ]
  });
}

export async function create_parity_window_plot({
  html,
  md,
  Inputs,
  lang = null,
  width = null,
  height = 360,
  parity_target = "draw",
  parity_window = 100
} = {}) {
  const env = await create_kino_env({Inputs, html, md, lang});
  const {plot, draws, p_parity, text} = env;
  const chart_width = width ?? env.full_width;
  const stats = compute_parity_window_stats({draws, p_parity, parity_target, parity_window});
  return plot.plot({
    width: chart_width,
    height,
    y: {percent: true, grid: true, label: text("charts.myth3.y_label")},
    x: {label: text("charts.myth3.x_label")},
    marks: [
      plot.barY(stats, {x: "bucket", y: "hit_rate", fill: "#E45756"}),
      plot.ruleY([p_parity[parity_target]], {stroke: "black", strokeDasharray: "6,4"}),
      plot.ruleY([parity_break_even(parity_target)], {stroke: "firebrick", strokeDasharray: "2,6"})
    ],
    caption: text("charts.myth3.caption")
  });
}

export async function create_pick_tradeoff_plot({html, md, Inputs, lang = null, width = null, height = 380} = {}) {
  const env = await create_kino_env({Inputs, html, md, lang});
  const {plot, d3, text} = env;
  const chart_width = width ?? env.full_width;
  const pick_tradeoff = d3.range(1, 13).map((pick) => ({
    pick,
    win_prob: plain_win_prob(pick),
    rtp: plain_rtp(pick)
  }));
  return plot.plot({
    width: chart_width,
    height,
    x: {percent: true, grid: true, label: text("charts.myth4.x_label")},
    y: {percent: true, grid: true, label: text("charts.myth4.y_label")},
    marks: [
      plot.ruleY([1], {stroke: "firebrick", strokeDasharray: "6,4"}),
      plot.dot(pick_tradeoff, {x: "win_prob", y: "rtp", r: 8, fill: "#4C78A8"}),
      plot.text(pick_tradeoff, {x: "win_prob", y: "rtp", text: (row) => String(row.pick), dy: -10, fill: "#1d2433"})
    ],
    caption: text("charts.myth4.caption")
  });
}

export async function create_pick_variance_plot({html, md, Inputs, lang = null, width = null, height = 360} = {}) {
  const env = await create_kino_env({Inputs, html, md, lang});
  const {plot, pick_variance_summary, text} = env;
  const chart_width = width ?? env.full_width;
  const rows = pick_variance_summary.map((row) => ({
    ...row,
    jackpot_scale: Math.log10(row.top_net_win + 1)
  }));
  return plot.plot({
    width: chart_width,
    height,
    x: {label: null, tickFormat: (d) => String(d), domain: Array.from({length: 9}, (_, i) => i + 1)},
    y: {grid: true, label: text("charts.myth4.variance_y_label")},
    r: {range: [5, 24]},
    marks: [
      plot.lineY(rows, {x: "pick", y: "median_rounds", stroke: "#4C78A8", strokeWidth: 2}),
      plot.dot(rows, {
        x: "pick",
        y: "median_rounds",
        r: "jackpot_scale",
        fill: "#E45756",
        fillOpacity: 0.75,
        stroke: "#1d2433"
      }),
      plot.text(rows, {
        x: "pick",
        y: "median_rounds",
        text: (row) => String(row.pick),
        dy: -16,
        fill: "#1d2433"
      })
    ],
    caption: text("charts.myth4.variance_caption")
  });
}

export async function create_pick_trajectory_plot({html, md, Inputs, lang = null, width = null, height = 390} = {}) {
  const env = await create_kino_env({Inputs, html, md, lang});
  const {plot, d3, pick_trajectory_focus, pick_trajectory_colors, text, fmt_num, money_label} = env;
  const chart_width = width ?? env.full_width;
  const rows = pick_trajectory_focus.map((row) => ({
    ...row,
    label: `${text("tables.pick")} ${row.pick}`,
    color: pick_trajectory_colors[row.pick]
  }));
  const last_rows = d3
    .rollups(rows, (values) => values[values.length - 1], (row) => row.pick)
    .map(([pick, row]) => ({
      ...row,
      label: `${text("tables.pick")} ${pick}`
    }));

  return plot.plot({
    width: chart_width,
    height,
    marginRight: 120,
    x: {label: text("charts.myth4.trajectory_x_label"), grid: true},
    y: {
      grid: true,
      label: text("charts.myth4.trajectory_y_label"),
      tickFormat: (value) => fmt_num(value)
    },
    color: {
      domain: last_rows.map((row) => row.label),
      range: last_rows.map((row) => row.color),
      legend: false
    },
    marks: [
      plot.ruleY([0], {stroke: "#2c2c2c", strokeDasharray: "6,4"}),
      plot.lineY(rows, {
        x: "draw",
        y: "cumulative_profit",
        stroke: "label",
        strokeWidth: 3
      }),
      plot.dot(rows, {
        x: "draw",
        y: "cumulative_profit",
        fill: "label",
        r: 2.6,
        opacity: 0.22,
        tip: true,
        title: (row) =>
          `${row.label}\n${text("charts.myth4.trajectory_x_label")}: ${fmt_num(row.draw)}\n${text("charts.myth4.trajectory_y_label")}: ${money_label(row.cumulative_profit)}`
      }),
      plot.dot(last_rows, {
        x: "draw",
        y: "cumulative_profit",
        fill: "label",
        r: 4
      }),
      plot.text(last_rows, {
        x: "draw",
        y: "cumulative_profit",
        text: "label",
        fill: "label",
        dx: 10,
        textAnchor: "start",
        fontWeight: 700
      })
    ],
    caption: text("charts.myth4.trajectory_caption")
  });
}

export async function create_portfolio_scatter_plot({html, md, Inputs, lang = null, width = null, height = 360} = {}) {
  const env = await create_kino_env({Inputs, html, md, lang});
  const {plot, portfolio_monte_carlo, text} = env;
  const chart_width = width ?? env.full_width;
  return plot.plot({
    width: chart_width,
    height,
    x: {percent: true, grid: true, label: text("charts.myth5.scatter_x_label")},
    y: {percent: true, grid: true, label: text("charts.myth5.scatter_y_label")},
    marks: [
      plot.ruleY([1], {stroke: "firebrick", strokeDasharray: "6,4"}),
      plot.dot(portfolio_monte_carlo, {x: "payout_hit", y: "rtp", r: 10, fill: "#B279A2"}),
      plot.text(portfolio_monte_carlo, {x: "payout_hit", y: "rtp", text: (row) => text(`strategies.${row.id}`), dy: -12})
    ]
  });
}

export async function create_portfolio_bankroll_plot({
  html,
  md,
  Inputs,
  lang = null,
  width = null,
  height = 360,
  horizon = 5000
} = {}) {
  const env = await create_kino_env({Inputs, html, md, lang});
  const {plot, portfolio_monte_carlo, text} = env;
  const chart_width = width ?? env.full_width;
  const path = portfolio_monte_carlo.map((row) => ({
    label: text(`strategies.${row.id}`),
    bankroll: 500 + row.final_profit * (horizon / 10000)
  }));
  return plot.plot({
    width: chart_width,
    height,
    y: {grid: true, label: text("charts.myth5.bankroll_y_label")},
    x: {label: null},
    marks: [
      plot.ruleY([0], {stroke: "firebrick", strokeDasharray: "6,4"}),
      plot.barY(path, {x: "label", y: "bankroll", fill: "#F58518"}),
      plot.ruleY([500], {stroke: "black", strokeDasharray: "6,4"})
    ],
    caption: text("charts.myth5.bankroll_caption")
  });
}

export async function create_coverage_systems_plot({html, md, Inputs, lang = null, width = null, height = 360} = {}) {
  const env = await create_kino_env({Inputs, html, md, lang});
  const {plot, draws, d3, text} = env;
  const chart_width = width ?? env.full_width;
  const system_rows = build_system_rows({draws, d3, text});
  return plot.plot({
    width: chart_width,
    height,
    y: {grid: true, label: text("charts.myth6.y_label")},
    x: {label: text("charts.myth6.x_label")},
    marks: [
      plot.barY(system_rows, {x: "label", y: "expected_loss_per_draw", fill: "#E45756"}),
      plot.text(system_rows, {
        x: "label",
        y: "expected_loss_per_draw",
        text: (row) => `€${d3.format(",.0f")(row.expected_loss_per_draw)}`,
        dy: -8
      })
    ]
  });
}

export async function create_ga_plot({html, md, Inputs, lang = null, width = null, height = 380} = {}) {
  const env = await create_kino_env({Inputs, html, md, lang});
  const {plot, ga_window_examples, text} = env;
  const chart_width = width ?? env.full_width;
  const rows = ga_window_examples.map((row) => ({
    window: row.window,
    model_label: text(`tables.${row.model}`),
    regime_label: text(`tables.${row.regime}`),
    profit: row.profit
  }));
  return plot.plot({
    width: chart_width,
    height,
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
      plot.dot(rows, {
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
  });
}

export async function create_pick_variance_section({html, md, Inputs, lang = null, width = null} = {}) {
  const env = await create_kino_env({Inputs, html, md, lang});
  ensure_stylesheet(html, env.stylesheet);
  const shell = create_embed_shell({
    html,
    title: env.text("article.myth4.variance_title"),
    body: env.text("article.myth4.variance_body")
  });
  shell.append(await create_pick_variance_plot({html, md, Inputs, lang: env.lang, width}));
  shell.append(html`<h3>${env.text("article.myth4.trajectory_title")}</h3>`);
  shell.append(html`<p>${env.text("article.myth4.trajectory_body")}</p>`);
  shell.append(await create_pick_trajectory_plot({html, md, Inputs, lang: env.lang, width}));
  return shell;
}

export async function create_ga_section({html, md, Inputs, lang = null, width = null} = {}) {
  const env = await create_kino_env({Inputs, html, md, lang});
  ensure_stylesheet(html, env.stylesheet);
  const shell = create_embed_shell({
    html,
    title: env.text("article.myth7.title"),
    body: env.text("article.myth7.body")
  });
  shell.append(await create_ga_plot({html, md, Inputs, lang: env.lang, width}));
  return shell;
}

export async function create_fairness_section({html, md, Inputs, lang = null, width = null} = {}) {
  const env = await create_kino_env({Inputs, html, md, lang});
  ensure_stylesheet(html, env.stylesheet);
  const shell = create_embed_shell({
    html,
    title: env.text("article.intro.title"),
    body: env.text("article.intro.body")
  });
  const row = html`<div class="plot-row"></div>`;
  row.append(
    await create_fairness_parity_plot({html, md, Inputs, lang: env.lang, width: width ? Math.max(320, Math.floor((width - 32) / 2)) : env.half_width}),
    await create_fairness_columns_plot({html, md, Inputs, lang: env.lang, width: width ? Math.max(320, Math.floor((width - 32) / 2)) : env.half_width})
  );
  shell.append(row);
  return shell;
}

export const embed_catalog = [
  {id: "fairness", factory: "create_fairness_section", title_key: "embeds.fairness.title", hook_key: "embeds.fairness.hook"},
  {id: "surrogate_fit", factory: "create_surrogate_fit_plot", title_key: "embeds.surrogate_fit.title", hook_key: "embeds.surrogate_fit.hook"},
  {id: "overdue_numbers", factory: "create_overdue_numbers_plot", title_key: "embeds.overdue_numbers.title", hook_key: "embeds.overdue_numbers.hook"},
  {id: "hot_cold", factory: "create_hot_cold_plot", title_key: "embeds.hot_cold.title", hook_key: "embeds.hot_cold.hook"},
  {id: "parity_window", factory: "create_parity_window_plot", title_key: "embeds.parity_window.title", hook_key: "embeds.parity_window.hook"},
  {id: "pick_tradeoff", factory: "create_pick_tradeoff_plot", title_key: "embeds.pick_tradeoff.title", hook_key: "embeds.pick_tradeoff.hook"},
  {id: "pick_variance", factory: "create_pick_variance_section", title_key: "embeds.pick_variance.title", hook_key: "embeds.pick_variance.hook"},
  {id: "pick_trajectory", factory: "create_pick_trajectory_plot", title_key: "embeds.pick_trajectory.title", hook_key: "embeds.pick_trajectory.hook"},
  {id: "portfolio_scatter", factory: "create_portfolio_scatter_plot", title_key: "embeds.portfolio_scatter.title", hook_key: "embeds.portfolio_scatter.hook"},
  {id: "portfolio_bankroll", factory: "create_portfolio_bankroll_plot", title_key: "embeds.portfolio_bankroll.title", hook_key: "embeds.portfolio_bankroll.hook"},
  {id: "coverage_systems", factory: "create_coverage_systems_plot", title_key: "embeds.coverage_systems.title", hook_key: "embeds.coverage_systems.hook"},
  {id: "ga", factory: "create_ga_section", title_key: "embeds.ga.title", hook_key: "embeds.ga.hook"}
];

export async function get_embed_catalog(lang = null) {
  const bundle = await load_kino_bundle();
  const resolved_lang = resolve_lang(lang);
  const text = create_text(bundle.copy, resolved_lang);
  return embed_catalog.map((item) => ({
    ...item,
    lang: resolved_lang,
    title: text(item.title_key),
    hook: text(item.hook_key)
  }));
}
