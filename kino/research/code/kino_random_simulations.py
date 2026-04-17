#!/usr/bin/env python3
"""Monte Carlo simulations for random KINO tickets and side bets.

The script uses the official payout coefficients already encoded in
`kino_backtest.py` and simulates:
- Plain KINO games 1-12 with random number selections.
- KINO BONUS games 1-12 with random number selections.
- KINO PARA1 and KINO PARA1+BONUS games 2-9 with random number selections.
- Parity side bets (odd, even, draw) and a random single-column side bet.
- Portfolio combinations that stack a ticket variant with `draw` and `column`.

Outputs:
- A summary CSV with mean/median/min/max final profit and RTP per strategy.
- A pick-only summary CSV for plain KINO games 1-12, including payout frequency.
- A sample cumulative-profit path for simulation 1.
- The mean cumulative-profit path across all simulations.
- Pick-only sample/mean cumulative-profit CSVs for the plain KINO games.
- Portfolio-only summary and cumulative-profit CSVs.
"""

from __future__ import annotations

import argparse
import csv
import random
import statistics
from pathlib import Path

from kino_backtest import (
    BONUS_PAYOUTS,
    COLUMNS,
    COLUMN_MULTIPLIER,
    NUMBER_PAYOUTS,
    PARA1_PAYOUTS,
    PARA1_BONUS_PAYOUTS,
    PARITY_MULTIPLIERS,
)


NUMBERS = tuple(range(1, 81))
PARITY_NAMES = ("odd", "even", "draw")
PLAIN_GAMES = tuple(range(1, 13))
BONUS_GAMES = tuple(range(1, 13))
PARA1_GAMES = tuple(range(2, 10))
PARA1_BONUS_GAMES = tuple(range(2, 10))
PLAIN_STAKE = 0.50
BONUS_TOTAL_STAKE = 1.00
PARA1_TOTAL_STAKE = 1.00
PARA1_BONUS_TOTAL_STAKE = 1.50


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--simulations", type=int, default=100, help="Number of Monte Carlo runs.")
    parser.add_argument("--draws", type=int, default=5000, help="Draws per simulation.")
    parser.add_argument("--seed", type=int, default=20260415, help="Random seed.")
    parser.add_argument(
        "--starting-bankroll",
        type=float,
        default=500.0,
        help="Starting bankroll used for bankroll-path metrics (default: 500.0).",
    )
    parser.add_argument(
        "--side-market-stake",
        type=float,
        default=1.0,
        help="Stake per parity or column side bet (default: 1.0).",
    )
    parser.add_argument(
        "--portfolio-picks",
        default="2,5,7",
        help="Comma-separated pick sizes to use for combined portfolios (default: 2,5,7).",
    )
    parser.add_argument(
        "--outdir",
        default=None,
        help="Output directory. Defaults to <script_dir>/simulation_outputs/random_<draws>x<simulations>.",
    )
    return parser.parse_args()


def resolve_outdir(args: argparse.Namespace) -> Path:
    if args.outdir:
        return Path(args.outdir).expanduser().resolve()
    script_dir = Path(__file__).resolve().parent
    return script_dir / "simulation_outputs" / f"random_{args.draws}x{args.simulations}"


def strategy_names() -> list[str]:
    names: list[str] = []
    names.extend(f"plain_kino_{game}" for game in PLAIN_GAMES)
    names.extend(f"bonus_kino_{game}" for game in BONUS_GAMES)
    names.extend(f"para1_kino_{game}" for game in PARA1_GAMES)
    names.extend(f"para1_bonus_kino_{game}" for game in PARA1_BONUS_GAMES)
    names.extend(f"parity_{name}" for name in PARITY_NAMES)
    names.append("column_random")
    return names


def plain_pick_names() -> list[str]:
    return [f"plain_kino_{game}" for game in PLAIN_GAMES]


def parse_pick_list(raw: str) -> tuple[int, ...]:
    picks = []
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        picks.append(int(item))
    return tuple(dict.fromkeys(picks))


def component_stakes(side_market_stake: float) -> dict[str, float]:
    stakes = {f"plain_kino_{game}": PLAIN_STAKE for game in PLAIN_GAMES}
    stakes.update({f"bonus_kino_{game}": BONUS_TOTAL_STAKE for game in BONUS_GAMES})
    stakes.update({f"para1_kino_{game}": PARA1_TOTAL_STAKE for game in PARA1_GAMES})
    stakes.update({f"para1_bonus_kino_{game}": PARA1_BONUS_TOTAL_STAKE for game in PARA1_BONUS_GAMES})
    stakes.update({f"parity_{name}": side_market_stake for name in PARITY_NAMES})
    stakes["column_random"] = side_market_stake
    return stakes


def portfolio_definitions(portfolio_picks: tuple[int, ...]) -> dict[str, tuple[str, ...]]:
    definitions: dict[str, tuple[str, ...]] = {}
    for pick in portfolio_picks:
        definitions[f"portfolio_plain_draw_column_{pick}"] = (
            f"plain_kino_{pick}",
            "parity_draw",
            "column_random",
        )
        definitions[f"portfolio_bonus_draw_column_{pick}"] = (
            f"bonus_kino_{pick}",
            "parity_draw",
            "column_random",
        )
        if pick in PARA1_GAMES:
            definitions[f"portfolio_para1_draw_column_{pick}"] = (
                f"para1_kino_{pick}",
                "parity_draw",
                "column_random",
            )
            definitions[f"portfolio_para1_bonus_draw_column_{pick}"] = (
                f"para1_bonus_kino_{pick}",
                "parity_draw",
                "column_random",
            )
    return definitions


def draw_outcome(rng: random.Random) -> tuple[set[int], str, int, int]:
    draw_sequence = rng.sample(NUMBERS, 20)
    draw_set = set(draw_sequence)

    odd_count = sum(number % 2 for number in draw_sequence)
    if odd_count > 10:
        parity = "odd"
    elif odd_count < 10:
        parity = "even"
    else:
        parity = "draw"

    column_counts = {column: 0 for column in COLUMNS}
    for number in draw_sequence:
        column_counts[((number - 1) % 10) + 1] += 1
    best_count = max(column_counts.values())
    tied_columns = {column for column, count in column_counts.items() if count == best_count}
    winning_column = next(((number - 1) % 10) + 1 for number in draw_sequence if (((number - 1) % 10) + 1) in tied_columns)
    bonus_number = draw_sequence[-1]

    return draw_set, parity, winning_column, bonus_number


def prefix_hits(ticket_numbers: list[int], draw_set: set[int]) -> list[int]:
    hits = [0]
    running = 0
    for number in ticket_numbers:
        if number in draw_set:
            running += 1
        hits.append(running)
    return hits


def plain_kino_profit(game: int, hits: int) -> tuple[float, float]:
    gross = PLAIN_STAKE * NUMBER_PAYOUTS[game].get(hits, 0.0)
    return gross - PLAIN_STAKE, gross


def bonus_kino_profit(game: int, hits: int, has_bonus: bool) -> tuple[float, float]:
    multipliers = BONUS_PAYOUTS if has_bonus else NUMBER_PAYOUTS
    gross = PLAIN_STAKE * multipliers[game].get(hits, 0.0)
    return gross - BONUS_TOTAL_STAKE, gross


def para1_kino_profit(game: int, hits: int) -> tuple[float, float]:
    # The official examples show that PARA1 replaces the plain game's second-tier
    # payout rather than stacking on top of it.
    if hits == game - 1:
        gross = PLAIN_STAKE * PARA1_PAYOUTS[game][hits]
    else:
        gross = PLAIN_STAKE * NUMBER_PAYOUTS[game].get(hits, 0.0)
    return gross - PARA1_TOTAL_STAKE, gross


def para1_bonus_kino_profit(game: int, hits: int, has_bonus: bool) -> tuple[float, float]:
    second_category = game - 1
    if has_bonus:
        if hits == second_category:
            gross = PLAIN_STAKE * PARA1_BONUS_PAYOUTS[game][hits]
        else:
            gross = PLAIN_STAKE * BONUS_PAYOUTS[game].get(hits, 0.0)
    else:
        if hits == second_category:
            gross = PLAIN_STAKE * PARA1_PAYOUTS[game][hits]
        else:
            gross = PLAIN_STAKE * NUMBER_PAYOUTS[game].get(hits, 0.0)
    return gross - PARA1_BONUS_TOTAL_STAKE, gross


def parity_profit(target: str, actual: str, stake: float) -> tuple[float, float]:
    gross = stake * PARITY_MULTIPLIERS[target] if target == actual else 0.0
    return gross - stake, gross


def column_profit(choice: int, actual: int, stake: float) -> tuple[float, float]:
    gross = stake * COLUMN_MULTIPLIER if choice == actual else 0.0
    return gross - stake, gross


def write_summary(
    path: Path,
    names: list[str],
    stakes_per_draw: dict[str, float],
    final_profit_runs: dict[str, list[float]],
    final_gross_runs: dict[str, list[float]],
    payout_hit_counts: dict[str, int],
    positive_round_counts: dict[str, int],
    final_bankroll_runs: dict[str, list[float]],
    min_bankroll_runs: dict[str, list[float]],
    max_bankroll_runs: dict[str, list[float]],
    max_drawdown_runs: dict[str, list[float]],
    max_round_profit_runs: dict[str, list[float]],
    ruin_runs: dict[str, list[bool]],
    simulations: int,
    draws: int,
    starting_bankroll: float,
    categories: dict[str, str],
) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        fieldnames = [
            "strategy",
            "category",
            "stake_per_draw",
            "starting_bankroll",
            "mean_profit_per_draw",
            "mean_final_profit",
            "mean_final_bankroll",
            "median_final_bankroll",
            "stdev_final_profit",
            "min_final_profit",
            "max_final_profit",
            "payout_hit_pct",
            "positive_round_pct",
            "profitable_run_pct",
            "ruin_run_pct",
            "mean_min_bankroll",
            "mean_max_bankroll",
            "mean_max_drawdown",
            "mean_max_round_profit",
            "max_round_profit_observed",
            "mean_rtp",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for name in names:
            profits = final_profit_runs[name]
            grosses = final_gross_runs[name]
            total_stake = stakes_per_draw[name] * draws
            writer.writerow(
                {
                    "strategy": name,
                    "category": categories[name],
                    "stake_per_draw": stakes_per_draw[name],
                    "starting_bankroll": starting_bankroll,
                    "mean_profit_per_draw": round(statistics.fmean(profits) / draws, 6),
                    "mean_final_profit": round(statistics.fmean(profits), 4),
                    "mean_final_bankroll": round(statistics.fmean(final_bankroll_runs[name]), 4),
                    "median_final_bankroll": round(statistics.median(final_bankroll_runs[name]), 4),
                    "stdev_final_profit": round(statistics.pstdev(profits), 4),
                    "min_final_profit": round(min(profits), 4),
                    "max_final_profit": round(max(profits), 4),
                    "payout_hit_pct": round(100.0 * payout_hit_counts[name] / (simulations * draws), 4),
                    "positive_round_pct": round(100.0 * positive_round_counts[name] / (simulations * draws), 4),
                    "profitable_run_pct": round(100.0 * sum(profit > 0 for profit in profits) / simulations, 2),
                    "ruin_run_pct": round(100.0 * sum(ruin_runs[name]) / simulations, 2),
                    "mean_min_bankroll": round(statistics.fmean(min_bankroll_runs[name]), 4),
                    "mean_max_bankroll": round(statistics.fmean(max_bankroll_runs[name]), 4),
                    "mean_max_drawdown": round(statistics.fmean(max_drawdown_runs[name]), 4),
                    "mean_max_round_profit": round(statistics.fmean(max_round_profit_runs[name]), 4),
                    "max_round_profit_observed": round(max(max_round_profit_runs[name]), 4),
                    "mean_rtp": round(statistics.fmean(grosses) / total_stake, 6),
                }
            )


def run_simulations(args: argparse.Namespace) -> Path:
    outdir = resolve_outdir(args)
    outdir.mkdir(parents=True, exist_ok=True)

    component_names = strategy_names()
    portfolio_picks = parse_pick_list(args.portfolio_picks)
    portfolios = portfolio_definitions(portfolio_picks)
    all_names = component_names + list(portfolios.keys())
    categories = {name: "component" for name in component_names}
    categories.update({name: "portfolio" for name in portfolios})

    per_draw_stakes = component_stakes(args.side_market_stake)
    per_draw_stakes.update(
        {
            name: sum(per_draw_stakes[component] for component in components)
            for name, components in portfolios.items()
        }
    )

    mean_path_sums = {name: [0.0] * args.draws for name in all_names}
    sample_path_rows: list[dict[str, float]] = []
    final_profit_runs = {name: [] for name in all_names}
    final_gross_runs = {name: [] for name in all_names}
    payout_hit_counts = {name: 0 for name in all_names}
    positive_round_counts = {name: 0 for name in all_names}
    final_bankroll_runs = {name: [] for name in all_names}
    min_bankroll_runs = {name: [] for name in all_names}
    max_bankroll_runs = {name: [] for name in all_names}
    max_drawdown_runs = {name: [] for name in all_names}
    max_round_profit_runs = {name: [] for name in all_names}
    ruin_runs = {name: [] for name in all_names}

    for sim_index in range(args.simulations):
        rng = random.Random(args.seed + sim_index)
        cumulative_profit = {name: 0.0 for name in all_names}
        cumulative_gross = {name: 0.0 for name in all_names}
        peak_bankroll = {name: args.starting_bankroll for name in all_names}
        min_bankroll = {name: args.starting_bankroll for name in all_names}
        max_bankroll = {name: args.starting_bankroll for name in all_names}
        max_drawdown = {name: 0.0 for name in all_names}
        max_round_profit = {name: float("-inf") for name in all_names}
        ruined = {name: False for name in all_names}

        for draw_index in range(args.draws):
            draw_set, actual_parity, actual_column, bonus_number = draw_outcome(rng)
            ticket_numbers = rng.sample(NUMBERS, 12)
            hit_counts = prefix_hits(ticket_numbers, draw_set)
            random_column = rng.choice(COLUMNS)
            round_profit = {}
            round_gross = {}

            for game in PLAIN_GAMES:
                profit, gross = plain_kino_profit(game, hit_counts[game])
                name = f"plain_kino_{game}"
                round_profit[name] = profit
                round_gross[name] = gross

            for game in BONUS_GAMES:
                has_bonus = bonus_number in ticket_numbers[:game]
                profit, gross = bonus_kino_profit(game, hit_counts[game], has_bonus)
                name = f"bonus_kino_{game}"
                round_profit[name] = profit
                round_gross[name] = gross

            for game in PARA1_GAMES:
                profit, gross = para1_kino_profit(game, hit_counts[game])
                name = f"para1_kino_{game}"
                round_profit[name] = profit
                round_gross[name] = gross

            for game in PARA1_BONUS_GAMES:
                has_bonus = bonus_number in ticket_numbers[:game]
                profit, gross = para1_bonus_kino_profit(game, hit_counts[game], has_bonus)
                name = f"para1_bonus_kino_{game}"
                round_profit[name] = profit
                round_gross[name] = gross

            for target in PARITY_NAMES:
                profit, gross = parity_profit(target, actual_parity, args.side_market_stake)
                name = f"parity_{target}"
                round_profit[name] = profit
                round_gross[name] = gross

            profit, gross = column_profit(random_column, actual_column, args.side_market_stake)
            round_profit["column_random"] = profit
            round_gross["column_random"] = gross

            for name, components in portfolios.items():
                round_profit[name] = sum(round_profit[component] for component in components)
                round_gross[name] = sum(round_gross[component] for component in components)

            for name in all_names:
                cumulative_profit[name] += round_profit[name]
                cumulative_gross[name] += round_gross[name]
                bankroll = args.starting_bankroll + cumulative_profit[name]
                peak_bankroll[name] = max(peak_bankroll[name], bankroll)
                min_bankroll[name] = min(min_bankroll[name], bankroll)
                max_bankroll[name] = max(max_bankroll[name], bankroll)
                max_drawdown[name] = max(max_drawdown[name], peak_bankroll[name] - bankroll)
                max_round_profit[name] = max(max_round_profit[name], round_profit[name])
                ruined[name] = ruined[name] or bankroll <= 0.0
                if round_gross[name] > 0.0:
                    payout_hit_counts[name] += 1
                if round_profit[name] > 0.0:
                    positive_round_counts[name] += 1
                mean_path_sums[name][draw_index] += cumulative_profit[name]

            if sim_index == 0:
                row = {"draw": draw_index + 1}
                for name in all_names:
                    row[name] = round(cumulative_profit[name], 4)
                sample_path_rows.append(row)

        for name in all_names:
            final_profit_runs[name].append(cumulative_profit[name])
            final_gross_runs[name].append(cumulative_gross[name])
            final_bankroll_runs[name].append(args.starting_bankroll + cumulative_profit[name])
            min_bankroll_runs[name].append(min_bankroll[name])
            max_bankroll_runs[name].append(max_bankroll[name])
            max_drawdown_runs[name].append(max_drawdown[name])
            max_round_profit_runs[name].append(max_round_profit[name])
            ruin_runs[name].append(ruined[name])

    summary_path = outdir / "summary.csv"
    write_summary(
        path=summary_path,
        names=all_names,
        stakes_per_draw=per_draw_stakes,
        final_profit_runs=final_profit_runs,
        final_gross_runs=final_gross_runs,
        payout_hit_counts=payout_hit_counts,
        positive_round_counts=positive_round_counts,
        final_bankroll_runs=final_bankroll_runs,
        min_bankroll_runs=min_bankroll_runs,
        max_bankroll_runs=max_bankroll_runs,
        max_drawdown_runs=max_drawdown_runs,
        max_round_profit_runs=max_round_profit_runs,
        ruin_runs=ruin_runs,
        simulations=args.simulations,
        draws=args.draws,
        starting_bankroll=args.starting_bankroll,
        categories=categories,
    )

    pick_names = plain_pick_names()
    pick_summary_path = outdir / "pick_summary.csv"
    write_summary(
        path=pick_summary_path,
        names=pick_names,
        stakes_per_draw=per_draw_stakes,
        final_profit_runs=final_profit_runs,
        final_gross_runs=final_gross_runs,
        payout_hit_counts=payout_hit_counts,
        positive_round_counts=positive_round_counts,
        final_bankroll_runs=final_bankroll_runs,
        min_bankroll_runs=min_bankroll_runs,
        max_bankroll_runs=max_bankroll_runs,
        max_drawdown_runs=max_drawdown_runs,
        max_round_profit_runs=max_round_profit_runs,
        ruin_runs=ruin_runs,
        simulations=args.simulations,
        draws=args.draws,
        starting_bankroll=args.starting_bankroll,
        categories={name: "plain_pick" for name in pick_names},
    )

    sample_path_file = outdir / "sample_cumulative_profit.csv"
    with sample_path_file.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["draw", *all_names])
        writer.writeheader()
        writer.writerows(sample_path_rows)

    mean_path_file = outdir / "mean_cumulative_profit.csv"
    with mean_path_file.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["draw", *all_names])
        writer.writeheader()
        for draw_index in range(args.draws):
            row = {"draw": draw_index + 1}
            for name in all_names:
                row[name] = round(mean_path_sums[name][draw_index] / args.simulations, 4)
            writer.writerow(row)

    pick_sample_path_file = outdir / "pick_sample_cumulative_profit.csv"
    with pick_sample_path_file.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["draw", *pick_names])
        writer.writeheader()
        for row in sample_path_rows:
            writer.writerow({"draw": row["draw"], **{name: row[name] for name in pick_names}})

    pick_mean_path_file = outdir / "pick_mean_cumulative_profit.csv"
    with pick_mean_path_file.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["draw", *pick_names])
        writer.writeheader()
        for draw_index in range(args.draws):
            row = {"draw": draw_index + 1}
            for name in pick_names:
                row[name] = round(mean_path_sums[name][draw_index] / args.simulations, 4)
            writer.writerow(row)

    portfolio_names = list(portfolios.keys())
    portfolio_summary_path = outdir / "portfolio_summary.csv"
    write_summary(
        path=portfolio_summary_path,
        names=portfolio_names,
        stakes_per_draw=per_draw_stakes,
        final_profit_runs=final_profit_runs,
        final_gross_runs=final_gross_runs,
        payout_hit_counts=payout_hit_counts,
        positive_round_counts=positive_round_counts,
        final_bankroll_runs=final_bankroll_runs,
        min_bankroll_runs=min_bankroll_runs,
        max_bankroll_runs=max_bankroll_runs,
        max_drawdown_runs=max_drawdown_runs,
        max_round_profit_runs=max_round_profit_runs,
        ruin_runs=ruin_runs,
        simulations=args.simulations,
        draws=args.draws,
        starting_bankroll=args.starting_bankroll,
        categories={name: "portfolio" for name in portfolio_names},
    )

    portfolio_sample_path_file = outdir / "portfolio_sample_cumulative_profit.csv"
    with portfolio_sample_path_file.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["draw", *portfolio_names])
        writer.writeheader()
        for row in sample_path_rows:
            writer.writerow({"draw": row["draw"], **{name: row[name] for name in portfolio_names}})

    portfolio_mean_path_file = outdir / "portfolio_mean_cumulative_profit.csv"
    with portfolio_mean_path_file.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["draw", *portfolio_names])
        writer.writeheader()
        for draw_index in range(args.draws):
            row = {"draw": draw_index + 1}
            for name in portfolio_names:
                row[name] = round(mean_path_sums[name][draw_index] / args.simulations, 4)
            writer.writerow(row)

    return outdir


def main() -> None:
    args = parse_args()
    outdir = run_simulations(args)
    print(f"Simulation outputs written to {outdir}")


if __name__ == "__main__":
    main()
