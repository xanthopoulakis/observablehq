#!/usr/bin/env python3

from __future__ import annotations

import csv
import math
import random
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA_CSV = ROOT / "data" / "kino.csv"
OUTPUT_CSV = ROOT / "research" / "outputs" / "pick_trajectory_focus_101952.csv"
ASSETS_DIR = ROOT / "assets"
OUTPUT_SVG = ASSETS_DIR / "pick-strategy-thumbnail.svg"

FOCUS_PICKS = [2, 5, 7, 9]
STAKE = 0.5
SAMPLE_EVERY = 100
SEED_BASE = 20260418
COLORS = {
    2: "#4C78A8",
    5: "#7A5195",
    7: "#E45756",
    9: "#1F9D8A",
}

NUMBER_PAYOUTS = {
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
    12: {12: 1000000.0, 11: 25000.0, 10: 2500.0, 9: 1000.0, 8: 150.0, 7: 25.0, 6: 5.0, 0: 4.0},
}


def read_draws() -> list[set[int]]:
    draws: list[set[int]] = []
    with DATA_CSV.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            draws.append({int(row[f"d{i}"]) for i in range(20)})
    return draws


def simulate() -> list[dict[str, float | int]]:
    draws = read_draws()
    total_draws = len(draws)
    rngs = {pick: random.Random(SEED_BASE + pick) for pick in FOCUS_PICKS}
    cumulative = {pick: 0.0 for pick in FOCUS_PICKS}
    rows: list[dict[str, float | int]] = []

    for draw_index, draw_numbers in enumerate(draws, start=1):
        for pick in FOCUS_PICKS:
            chosen = rngs[pick].sample(range(1, 81), pick)
            hits = sum(1 for number in chosen if number in draw_numbers)
            gross = NUMBER_PAYOUTS[pick].get(hits, 0.0) * STAKE
            net = gross - STAKE
            cumulative[pick] += net
            if draw_index == 1 or draw_index % SAMPLE_EVERY == 0 or draw_index == total_draws:
                rows.append(
                    {
                        "draw": draw_index,
                        "pick": pick,
                        "cumulative_profit": round(cumulative[pick], 2),
                        "roi": round(cumulative[pick] / (draw_index * STAKE), 6),
                    }
                )
    return rows


def write_csv(rows: list[dict[str, float | int]]) -> None:
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["draw", "pick", "cumulative_profit", "roi"])
        writer.writeheader()
        writer.writerows(rows)


def polyline_points(rows: list[dict[str, float | int]], pick: int, x_scale, y_scale) -> str:
    return " ".join(
        f"{x_scale(row['draw']):.1f},{y_scale(row['cumulative_profit']):.1f}"
        for row in rows
        if row["pick"] == pick
    )


def build_svg(rows: list[dict[str, float | int]]) -> str:
    width, height = 1200, 630
    margin_left, margin_right = 96, 170
    margin_top, margin_bottom = 108, 82
    plot_width = width - margin_left - margin_right
    plot_height = height - margin_top - margin_bottom

    max_draw = max(int(row["draw"]) for row in rows)
    min_profit = min(float(row["cumulative_profit"]) for row in rows)
    max_profit = max(float(row["cumulative_profit"]) for row in rows)
    lower = math.floor(min(min_profit, 0) / 5000) * 5000
    upper = math.ceil(max(max_profit, 0) / 5000) * 5000
    if lower == upper:
        upper = lower + 5000

    def x_scale(draw_value: float) -> float:
        return margin_left + (draw_value / max_draw) * plot_width

    def y_scale(profit_value: float) -> float:
        return margin_top + (1 - ((profit_value - lower) / (upper - lower))) * plot_height

    grid_values = []
    step = 10000
    current = lower
    while current <= upper:
        grid_values.append(current)
        current += step

    x_ticks = [0, 20000, 40000, 60000, 80000, 100000]
    last_rows = {}
    for row in rows:
        last_rows[int(row["pick"])] = row

    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#f7f4ee"/>',
        '<text x="96" y="58" fill="#b81d24" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="2">ΚΙΝΟ, ΠΙΘΑΝΟΤΗΤΕΣ ΚΑΙ ΑΥΤΑΠΑΤΕΣ</text>',
        '<text x="96" y="96" fill="#1d2433" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="800">Άλλη ταχύτητα, ίδιο τέλος</text>',
        '<text x="96" y="126" fill="#5d6678" font-family="Inter, Arial, sans-serif" font-size="20">Μια σταθερή προσομοίωση των Pick 2, 5, 7 και 9 σε 101.952 κληρώσεις</text>',
        f'<rect x="{margin_left}" y="{margin_top}" width="{plot_width}" height="{plot_height}" fill="#ffffff" stroke="#d7d2c8"/>'
    ]

    for value in grid_values:
        y = y_scale(value)
        stroke = "#2c2c2c" if value == 0 else "#d9d9d9"
        dash = ' stroke-dasharray="6,4"' if value == 0 else ""
        svg_parts.append(
            f'<line x1="{margin_left}" y1="{y:.1f}" x2="{margin_left + plot_width}" y2="{y:.1f}" stroke="{stroke}" stroke-width="1"{dash}/>'
        )
        svg_parts.append(
            f'<text x="{margin_left - 14}" y="{y + 5:.1f}" text-anchor="end" fill="#5d6678" font-family="Inter, Arial, sans-serif" font-size="14">{int(value):,}</text>'
        )

    for tick in x_ticks:
        x = x_scale(tick)
        svg_parts.append(
            f'<line x1="{x:.1f}" y1="{margin_top + plot_height}" x2="{x:.1f}" y2="{margin_top + plot_height + 6}" stroke="#6b7280" stroke-width="1"/>'
        )
        svg_parts.append(
            f'<text x="{x:.1f}" y="{margin_top + plot_height + 26}" text-anchor="middle" fill="#5d6678" font-family="Inter, Arial, sans-serif" font-size="14">{tick:,}</text>'
        )

    svg_parts.extend(
        [
            f'<text x="{margin_left + plot_width / 2:.1f}" y="{height - 24}" text-anchor="middle" fill="#5d6678" font-family="Inter, Arial, sans-serif" font-size="16">Κληρώσεις</text>',
            f'<text x="28" y="{margin_top + plot_height / 2:.1f}" transform="rotate(-90 28 {margin_top + plot_height / 2:.1f})" text-anchor="middle" fill="#5d6678" font-family="Inter, Arial, sans-serif" font-size="16">Σωρευτικό καθαρό αποτέλεσμα (€)</text>',
        ]
    )

    for pick in FOCUS_PICKS:
        svg_parts.append(
            f'<polyline fill="none" stroke="{COLORS[pick]}" stroke-width="3" points="{polyline_points(rows, pick, x_scale, y_scale)}"/>'
        )

    legend_x = width - 150
    legend_y = 170
    for idx, pick in enumerate(FOCUS_PICKS):
        y = legend_y + idx * 28
        last_row = last_rows[pick]
        roi = float(last_row["roi"]) * 100
        svg_parts.append(f'<line x1="{legend_x}" y1="{y}" x2="{legend_x + 20}" y2="{y}" stroke="{COLORS[pick]}" stroke-width="4"/>')
        svg_parts.append(
            f'<text x="{legend_x + 30}" y="{y + 5}" fill="#1d2433" font-family="Inter, Arial, sans-serif" font-size="15">Pick {pick} ({roi:.1f}%)</text>'
        )

    svg_parts.append("</svg>")
    return "".join(svg_parts)


def main() -> None:
    rows = simulate()
    write_csv(rows)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_SVG.write_text(build_svg(rows), encoding="utf-8")
    print(f"Wrote {OUTPUT_CSV}")
    print(f"Wrote {OUTPUT_SVG}")


if __name__ == "__main__":
    main()
