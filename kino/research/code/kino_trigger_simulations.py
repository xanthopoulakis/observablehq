#!/usr/bin/env python3
"""Trigger-based KINO backtests with flat and capped-martingale staking.

The script backtests "bet only when overdue" strategies on historical KINO draws.
It focuses on the side-market use case discussed in this thread:
- parity targets: odd, even, draw
- columns: the oldest absent column
- numbers: the oldest absent number

Rules modeled:
- Base stake defaults to 1.00 EUR per activated bet, matching the side-market
  minimum participation discussed on the official OPAP/Allwyn rules pages.
- Number bets are also normalized to 1.00 EUR total stake for comparability.
- Martingale doubles after each loss, capped at a configurable number of doublings.
- Once a trigger fires, the strategy keeps betting the same target until it wins
  or the bankroll can no longer fund the next step.

Outputs:
- summary.csv: one row per strategy
- selected_paths.csv: cumulative-profit paths for the top and bottom strategies
- In train/test mode: separate train/test summaries plus a joined leaderboard.
- In walk-forward mode: chosen-strategy segments and the live traded path.
"""

from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from pathlib import Path

from kino_backtest import (
    COLUMNS,
    COLUMN_MULTIPLIER,
    NUMBER_PAYOUTS,
    PARITY_MULTIPLIERS,
    PARITY_STATES,
    Draw,
    load_draws,
)


NUMBERS = tuple(range(1, 81))
NUMBER_MULTIPLIER = NUMBER_PAYOUTS[1][1]


@dataclass(frozen=True)
class StrategySpec:
    name: str
    market: str
    selector: str
    threshold: int
    progression: str
    max_doublings: int | None
    base_stake: float
    fixed_target: int | str | None = None


@dataclass
class StrategyOutcome:
    spec: StrategySpec
    bets: int
    wins: int
    cycles: int
    final_profit: float
    total_stake: float
    total_gross: float
    max_drawdown: float
    max_stake: float
    ruin: bool
    ruin_draw: int | None
    ending_bankroll: float

    @property
    def hit_rate(self) -> float:
        return 0.0 if self.bets == 0 else self.wins / self.bets

    @property
    def rtp(self) -> float:
        return 0.0 if self.total_stake == 0.0 else self.total_gross / self.total_stake

    @property
    def bet_rate(self) -> float:
        return 0.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "csv_path",
        nargs="?",
        default=None,
        help="Path to kino.csv. Defaults to <script_dir>/kino.csv.",
    )
    parser.add_argument(
        "--outdir",
        default=None,
        help="Output directory. Defaults to <script_dir>/simulation_outputs/trigger_historical.",
    )
    parser.add_argument(
        "--bankroll",
        type=float,
        default=500.0,
        help="Starting bankroll per strategy (default: 500).",
    )
    parser.add_argument(
        "--base-stake",
        type=float,
        default=1.0,
        help="Base stake per activated bet (default: 1.0).",
    )
    parser.add_argument(
        "--parity-thresholds",
        default="4,5,6,7,8,9,10,11,12",
        help="Comma-separated miss thresholds for parity strategies.",
    )
    parser.add_argument(
        "--column-thresholds",
        default="10,15,20,25,30,35,40,50",
        help="Comma-separated miss thresholds for column strategies.",
    )
    parser.add_argument(
        "--number-thresholds",
        default="6,8,10,12,15,20,25,30",
        help="Comma-separated miss thresholds for number strategies.",
    )
    parser.add_argument(
        "--progressions",
        default="flat,martingale",
        help="Comma-separated staking modes: flat,martingale",
    )
    parser.add_argument(
        "--max-doublings",
        default="3,5",
        help="Comma-separated martingale caps used when progression includes martingale.",
    )
    parser.add_argument(
        "--fixed-number",
        type=int,
        default=None,
        help="Optional specific number to test in addition to number_oldest.",
    )
    parser.add_argument(
        "--top-paths",
        type=int,
        default=5,
        help="How many best and worst strategies to include in selected_paths.csv.",
    )
    parser.add_argument(
        "--train-test",
        action="store_true",
        help="Run a chronological train/test split and report whether train leaders survive on unseen draws.",
    )
    parser.add_argument(
        "--train-ratio",
        type=float,
        default=0.8,
        help="Fraction of draws used for the training segment in train/test mode (default: 0.8).",
    )
    parser.add_argument(
        "--leaderboard-size",
        type=int,
        default=10,
        help="How many top train-selected strategies to print in train/test mode (default: 10).",
    )
    parser.add_argument(
        "--walk-forward",
        action="store_true",
        help="Run a rolling train/select/test process with one live bankroll carried across test blocks.",
    )
    parser.add_argument(
        "--wf-train-draws",
        type=int,
        default=20000,
        help="Training-window size for walk-forward mode (default: 20000).",
    )
    parser.add_argument(
        "--wf-test-draws",
        type=int,
        default=5000,
        help="Test-block size for walk-forward mode (default: 5000).",
    )
    parser.add_argument(
        "--wf-step-draws",
        type=int,
        default=5000,
        help="Window step size for walk-forward mode (default: 5000).",
    )
    return parser.parse_args()


def parse_int_list(raw: str) -> list[int]:
    values = [int(part.strip()) for part in raw.split(",") if part.strip()]
    if not values:
        raise ValueError("Expected at least one integer value.")
    return values


def parse_text_list(raw: str) -> list[str]:
    values = [part.strip() for part in raw.split(",") if part.strip()]
    if not values:
        raise ValueError("Expected at least one string value.")
    return values


def resolve_csv_path(args: argparse.Namespace) -> Path:
    if args.csv_path:
        return Path(args.csv_path).expanduser().resolve()
    return Path(__file__).resolve().parent / "kino.csv"


def resolve_outdir(args: argparse.Namespace) -> Path:
    if args.outdir:
        return Path(args.outdir).expanduser().resolve()
    return Path(__file__).resolve().parent / "simulation_outputs" / "trigger_historical"


def stable_tiebreak(value: int | str) -> tuple[int, str]:
    if isinstance(value, int):
        return (0, f"{value:03d}")
    return (1, str(value))


def generate_specs(args: argparse.Namespace) -> list[StrategySpec]:
    parity_thresholds = parse_int_list(args.parity_thresholds)
    column_thresholds = parse_int_list(args.column_thresholds)
    number_thresholds = parse_int_list(args.number_thresholds)
    progressions = parse_text_list(args.progressions)
    max_doublings = parse_int_list(args.max_doublings)

    specs: list[StrategySpec] = []

    def add_specs(
        market: str,
        selector: str,
        thresholds: list[int],
        fixed_target: int | str | None = None,
    ) -> None:
        label_target = "oldest" if fixed_target is None else str(fixed_target)
        for threshold in thresholds:
            for progression in progressions:
                if progression == "flat":
                    specs.append(
                        StrategySpec(
                            name=f"{market}_{selector}_{label_target}_t{threshold}_flat",
                            market=market,
                            selector=selector,
                            threshold=threshold,
                            progression="flat",
                            max_doublings=None,
                            base_stake=args.base_stake,
                            fixed_target=fixed_target,
                        )
                    )
                elif progression == "martingale":
                    for cap in max_doublings:
                        specs.append(
                            StrategySpec(
                                name=f"{market}_{selector}_{label_target}_t{threshold}_mg{cap}",
                                market=market,
                                selector=selector,
                                threshold=threshold,
                                progression="martingale",
                                max_doublings=cap,
                                base_stake=args.base_stake,
                                fixed_target=fixed_target,
                            )
                        )
                else:
                    raise ValueError(f"Unsupported progression: {progression}")

    for parity in PARITY_STATES:
        add_specs("parity", "fixed", parity_thresholds, fixed_target=parity)
    add_specs("parity", "oldest", parity_thresholds)

    add_specs("column", "oldest", column_thresholds)
    add_specs("number", "oldest", number_thresholds)
    if args.fixed_number is not None:
        add_specs("number", "fixed", number_thresholds, fixed_target=args.fixed_number)

    return specs


def market_targets(spec: StrategySpec) -> tuple[int | str, ...]:
    if spec.market == "parity":
        return PARITY_STATES
    if spec.market == "column":
        return COLUMNS
    if spec.market == "number":
        return NUMBERS
    raise ValueError(f"Unsupported market: {spec.market}")


def market_multiplier(spec: StrategySpec, target: int | str) -> float:
    if spec.market == "parity":
        return PARITY_MULTIPLIERS[str(target)]
    if spec.market == "column":
        return COLUMN_MULTIPLIER
    if spec.market == "number":
        return NUMBER_MULTIPLIER
    raise ValueError(f"Unsupported market: {spec.market}")


def draw_hits_target(draw: Draw, spec: StrategySpec, target: int | str) -> bool:
    if spec.market == "parity":
        return draw.parity == target
    if spec.market == "column":
        return draw.column == target
    if spec.market == "number":
        return int(target) in draw.number_set
    raise ValueError(f"Unsupported market: {spec.market}")


def update_ages(ages: dict[int | str, int | None], draw: Draw, spec: StrategySpec) -> None:
    for target in ages:
        hit = draw_hits_target(draw, spec, target)
        if hit:
            ages[target] = 0
        elif ages[target] is not None:
            ages[target] += 1


def update_market_ages(ages: dict[int | str, int | None], market: str, draw: Draw) -> None:
    if market == "parity":
        outcome = draw.parity
        for target in ages:
            if target == outcome:
                ages[target] = 0
            elif ages[target] is not None:
                ages[target] += 1
        return

    if market == "column":
        outcome = draw.column
        for target in ages:
            if target == outcome:
                ages[target] = 0
            elif ages[target] is not None:
                ages[target] += 1
        return

    if market == "number":
        current_numbers = draw.number_set
        for target in ages:
            if int(target) in current_numbers:
                ages[target] = 0
            elif ages[target] is not None:
                ages[target] += 1
        return

    raise ValueError(f"Unsupported market: {market}")


def pick_target(spec: StrategySpec, ages: dict[int | str, int | None]) -> int | str | None:
    if spec.selector == "fixed":
        age = ages[spec.fixed_target]
        return spec.fixed_target if age is not None and age >= spec.threshold else None

    eligible = [
        target for target, age in ages.items() if age is not None and age >= spec.threshold
    ]
    if not eligible:
        return None
    max_age = max(ages[target] for target in eligible)
    oldest = [target for target in eligible if ages[target] == max_age]
    return min(oldest, key=stable_tiebreak)


def stake_for(spec: StrategySpec, loss_streak: int) -> float:
    if spec.progression == "flat":
        return spec.base_stake
    assert spec.max_doublings is not None
    steps = min(loss_streak, spec.max_doublings)
    return spec.base_stake * (2 ** steps)


def simulate_strategy(
    draws: list[Draw],
    spec: StrategySpec,
    bankroll: float,
    record_path: bool = False,
    initial_ages: dict[int | str, int | None] | None = None,
) -> tuple[StrategyOutcome, list[float] | None]:
    ages = (
        dict(initial_ages)
        if initial_ages is not None
        else {target: None for target in market_targets(spec)}
    )
    active_target: int | str | None = None
    loss_streak = 0
    available = bankroll
    cumulative_profit = 0.0
    peak_profit = 0.0
    max_drawdown = 0.0
    total_stake = 0.0
    total_gross = 0.0
    max_stake = 0.0
    bets = 0
    wins = 0
    cycles = 0
    ruin = False
    ruin_draw: int | None = None
    path: list[float] | None = [] if record_path else None

    for draw_index, draw in enumerate(draws, start=1):
        if active_target is None:
            chosen = pick_target(spec, ages)
            if chosen is not None:
                active_target = chosen
                loss_streak = 0
                cycles += 1

        if active_target is not None and not ruin:
            stake = stake_for(spec, loss_streak)
            if available + 1e-9 < stake:
                ruin = True
                ruin_draw = draw_index
            else:
                available -= stake
                total_stake += stake
                bets += 1
                max_stake = max(max_stake, stake)
                if draw_hits_target(draw, spec, active_target):
                    gross = stake * market_multiplier(spec, active_target)
                    profit = gross - stake
                    total_gross += gross
                    available += gross
                    cumulative_profit += profit
                    wins += 1
                    active_target = None
                    loss_streak = 0
                else:
                    cumulative_profit -= stake
                    loss_streak += 1

                peak_profit = max(peak_profit, cumulative_profit)
                max_drawdown = max(max_drawdown, peak_profit - cumulative_profit)

        update_ages(ages, draw, spec)

        if path is not None:
            path.append(round(cumulative_profit, 4))

        if ruin:
            if path is not None:
                while len(path) < len(draws):
                    path.append(round(cumulative_profit, 4))
            break

    outcome = StrategyOutcome(
        spec=spec,
        bets=bets,
        wins=wins,
        cycles=cycles,
        final_profit=round(cumulative_profit, 4),
        total_stake=round(total_stake, 4),
        total_gross=round(total_gross, 4),
        max_drawdown=round(max_drawdown, 4),
        max_stake=round(max_stake, 4),
        ruin=ruin,
        ruin_draw=ruin_draw,
        ending_bankroll=round(bankroll + cumulative_profit, 4),
    )
    return outcome, path


def write_summary(path: Path, outcomes: list[StrategyOutcome], total_draws: int) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "strategy",
                "market",
                "selector",
                "threshold",
                "progression",
                "max_doublings",
                "base_stake",
                "bets",
                "bet_rate",
                "wins",
                "hit_rate",
                "cycles",
                "total_stake",
                "total_gross",
                "rtp",
                "final_profit",
                "max_drawdown",
                "max_stake",
                "ending_bankroll",
                "ruin",
                "ruin_draw",
            ],
        )
        writer.writeheader()
        for outcome in outcomes:
            writer.writerow(
                {
                    "strategy": outcome.spec.name,
                    "market": outcome.spec.market,
                    "selector": outcome.spec.selector,
                    "threshold": outcome.spec.threshold,
                    "progression": outcome.spec.progression,
                    "max_doublings": outcome.spec.max_doublings,
                    "base_stake": outcome.spec.base_stake,
                    "bets": outcome.bets,
                    "bet_rate": round(outcome.bets / total_draws, 6),
                    "wins": outcome.wins,
                    "hit_rate": round(outcome.hit_rate, 6),
                    "cycles": outcome.cycles,
                    "total_stake": outcome.total_stake,
                    "total_gross": outcome.total_gross,
                    "rtp": round(outcome.rtp, 6),
                    "final_profit": outcome.final_profit,
                    "max_drawdown": outcome.max_drawdown,
                    "max_stake": outcome.max_stake,
                    "ending_bankroll": outcome.ending_bankroll,
                    "ruin": outcome.ruin,
                    "ruin_draw": outcome.ruin_draw,
                }
            )


def write_selected_paths(
    path: Path,
    draws: list[Draw],
    selected: list[tuple[StrategyOutcome, list[float]]],
) -> None:
    fieldnames = ["draw", *[outcome.spec.name for outcome, _ in selected]]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for index in range(len(draws)):
            row = {"draw": index + 1}
            for outcome, profits in selected:
                row[outcome.spec.name] = profits[index]
            writer.writerow(row)


def build_age_snapshots(
    draws: list[Draw],
    boundaries: set[int],
) -> dict[str, dict[int, dict[int | str, int | None]]]:
    snapshots = {"parity": {}, "column": {}, "number": {}}
    parity_ages = {state: None for state in PARITY_STATES}
    column_ages = {column: None for column in COLUMNS}
    number_ages = {number: None for number in NUMBERS}

    ordered_boundaries = sorted(boundaries)
    boundary_index = 0

    def maybe_store(current_index: int) -> None:
        nonlocal boundary_index
        while boundary_index < len(ordered_boundaries) and ordered_boundaries[boundary_index] == current_index:
            snapshots["parity"][current_index] = dict(parity_ages)
            snapshots["column"][current_index] = dict(column_ages)
            snapshots["number"][current_index] = dict(number_ages)
            boundary_index += 1

    maybe_store(0)
    for current_index, draw in enumerate(draws, start=1):
        update_market_ages(parity_ages, "parity", draw)
        update_market_ages(column_ages, "column", draw)
        update_market_ages(number_ages, "number", draw)
        maybe_store(current_index)

    return snapshots


def sort_outcomes(outcomes: list[StrategyOutcome]) -> list[StrategyOutcome]:
    return sorted(
        outcomes,
        key=lambda outcome: (
            outcome.final_profit,
            -outcome.max_drawdown,
            outcome.ending_bankroll,
            -outcome.max_stake,
        ),
        reverse=True,
    )


def evaluate_specs(draws: list[Draw], specs: list[StrategySpec], bankroll: float) -> list[StrategyOutcome]:
    outcomes: list[StrategyOutcome] = []
    for spec in specs:
        outcome, _ = simulate_strategy(draws, spec, bankroll=bankroll, record_path=False)
        outcomes.append(outcome)
    return sort_outcomes(outcomes)


def evaluate_specs_with_snapshots(
    draws: list[Draw],
    specs: list[StrategySpec],
    bankroll: float,
    snapshot_by_market: dict[str, dict[int | str, int | None]] | None = None,
) -> list[StrategyOutcome]:
    outcomes: list[StrategyOutcome] = []
    for spec in specs:
        initial_ages = None if snapshot_by_market is None else snapshot_by_market[spec.market]
        outcome, _ = simulate_strategy(
            draws,
            spec,
            bankroll=bankroll,
            record_path=False,
            initial_ages=initial_ages,
        )
        outcomes.append(outcome)
    return sort_outcomes(outcomes)


def split_draws(draws: list[Draw], train_ratio: float) -> tuple[list[Draw], list[Draw]]:
    split_index = int(len(draws) * train_ratio)
    if split_index <= 0 or split_index >= len(draws):
        raise ValueError("train_ratio must leave at least one draw in both train and test segments.")
    return draws[:split_index], draws[split_index:]


def generate_walk_forward_segments(
    total_draws: int,
    train_draws: int,
    test_draws: int,
    step_draws: int,
) -> list[tuple[int, int, int, int, int]]:
    if train_draws <= 0 or test_draws <= 0 or step_draws <= 0:
        raise ValueError("Walk-forward train/test/step draw counts must all be positive.")

    segments: list[tuple[int, int, int, int, int]] = []
    train_start = 0
    segment_id = 1
    while train_start < total_draws:
        train_end = train_start + train_draws
        if train_end >= total_draws:
            break
        test_start = train_end
        test_end = min(test_start + test_draws, total_draws)
        if test_end <= test_start:
            break
        segments.append((segment_id, train_start, train_end, test_start, test_end))
        if test_end == total_draws:
            break
        train_start += step_draws
        segment_id += 1
    return segments


def write_train_test_leaderboard(
    path: Path,
    train_outcomes: list[StrategyOutcome],
    test_lookup: dict[str, StrategyOutcome],
) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "strategy",
                "market",
                "selector",
                "threshold",
                "progression",
                "max_doublings",
                "train_bets",
                "train_hit_rate",
                "train_rtp",
                "train_profit",
                "train_max_drawdown",
                "train_ruin",
                "test_bets",
                "test_hit_rate",
                "test_rtp",
                "test_profit",
                "test_max_drawdown",
                "test_ruin",
                "profit_delta_test_minus_train",
            ],
        )
        writer.writeheader()
        for train in train_outcomes:
            test = test_lookup[train.spec.name]
            writer.writerow(
                {
                    "strategy": train.spec.name,
                    "market": train.spec.market,
                    "selector": train.spec.selector,
                    "threshold": train.spec.threshold,
                    "progression": train.spec.progression,
                    "max_doublings": train.spec.max_doublings,
                    "train_bets": train.bets,
                    "train_hit_rate": round(train.hit_rate, 6),
                    "train_rtp": round(train.rtp, 6),
                    "train_profit": train.final_profit,
                    "train_max_drawdown": train.max_drawdown,
                    "train_ruin": train.ruin,
                    "test_bets": test.bets,
                    "test_hit_rate": round(test.hit_rate, 6),
                    "test_rtp": round(test.rtp, 6),
                    "test_profit": test.final_profit,
                    "test_max_drawdown": test.max_drawdown,
                    "test_ruin": test.ruin,
                    "profit_delta_test_minus_train": round(test.final_profit - train.final_profit, 4),
                }
            )


def write_walk_forward_segments(path: Path, rows: list[dict[str, object]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "segment",
                "train_start",
                "train_end",
                "test_start",
                "test_end",
                "chosen_strategy",
                "market",
                "selector",
                "threshold",
                "progression",
                "max_doublings",
                "bankroll_before",
                "train_profit",
                "train_rtp",
                "train_bets",
                "test_profit",
                "test_rtp",
                "test_bets",
                "test_hit_rate",
                "test_max_drawdown",
                "test_max_stake",
                "test_ruin",
                "test_ruin_draw_global",
                "bankroll_after",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def write_walk_forward_path(path: Path, rows: list[dict[str, object]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "global_draw",
                "segment",
                "chosen_strategy",
                "cumulative_profit",
                "bankroll",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def run_full_history_mode(
    draws: list[Draw],
    specs: list[StrategySpec],
    bankroll: float,
    outdir: Path,
    top_paths: int,
) -> list[StrategyOutcome]:
    outcomes = evaluate_specs(draws, specs, bankroll=bankroll)
    write_summary(outdir / "summary.csv", outcomes, total_draws=len(draws))

    selected_outcomes = outcomes[:top_paths] + outcomes[-top_paths:]
    seen_names: set[str] = set()
    selected_paths: list[tuple[StrategyOutcome, list[float]]] = []
    for outcome in selected_outcomes:
        if outcome.spec.name in seen_names:
            continue
        seen_names.add(outcome.spec.name)
        _, profits = simulate_strategy(draws, outcome.spec, bankroll=bankroll, record_path=True)
        assert profits is not None
        selected_paths.append((outcome, profits))

    write_selected_paths(outdir / "selected_paths.csv", draws, selected_paths)
    return outcomes


def run_walk_forward_mode(
    draws: list[Draw],
    specs: list[StrategySpec],
    bankroll: float,
    outdir: Path,
    train_draws: int,
    test_draws: int,
    step_draws: int,
) -> tuple[list[dict[str, object]], list[dict[str, object]], float, bool]:
    segments = generate_walk_forward_segments(
        total_draws=len(draws),
        train_draws=train_draws,
        test_draws=test_draws,
        step_draws=step_draws,
    )
    boundaries: set[int] = set()
    for _segment_id, train_start, _train_end, test_start, _test_end in segments:
        boundaries.add(train_start)
        boundaries.add(test_start)
    snapshots = build_age_snapshots(draws, boundaries)

    segment_rows: list[dict[str, object]] = []
    path_rows: list[dict[str, object]] = []
    current_bankroll = bankroll
    cumulative_profit = 0.0
    ruined = False

    for segment_id, train_start, train_end, test_start, test_end in segments:
        train_slice = draws[train_start:train_end]
        test_slice = draws[test_start:test_end]
        train_snapshot = {market: snapshots[market][train_start] for market in snapshots}
        test_snapshot = {market: snapshots[market][test_start] for market in snapshots}

        train_outcomes = evaluate_specs_with_snapshots(
            train_slice,
            specs,
            bankroll=current_bankroll,
            snapshot_by_market=train_snapshot,
        )
        chosen_train = train_outcomes[0]
        test_outcome, profits = simulate_strategy(
            test_slice,
            chosen_train.spec,
            bankroll=current_bankroll,
            record_path=True,
            initial_ages=test_snapshot[chosen_train.spec.market],
        )
        assert profits is not None

        bankroll_before = current_bankroll
        current_bankroll += test_outcome.final_profit
        cumulative_profit += test_outcome.final_profit
        global_ruin_draw = None
        if test_outcome.ruin and test_outcome.ruin_draw is not None:
            global_ruin_draw = test_start + test_outcome.ruin_draw
            ruined = True

        segment_rows.append(
            {
                "segment": segment_id,
                "train_start": train_start + 1,
                "train_end": train_end,
                "test_start": test_start + 1,
                "test_end": test_end,
                "chosen_strategy": chosen_train.spec.name,
                "market": chosen_train.spec.market,
                "selector": chosen_train.spec.selector,
                "threshold": chosen_train.spec.threshold,
                "progression": chosen_train.spec.progression,
                "max_doublings": chosen_train.spec.max_doublings,
                "bankroll_before": round(bankroll_before, 4),
                "train_profit": chosen_train.final_profit,
                "train_rtp": round(chosen_train.rtp, 6),
                "train_bets": chosen_train.bets,
                "test_profit": test_outcome.final_profit,
                "test_rtp": round(test_outcome.rtp, 6),
                "test_bets": test_outcome.bets,
                "test_hit_rate": round(test_outcome.hit_rate, 6),
                "test_max_drawdown": test_outcome.max_drawdown,
                "test_max_stake": test_outcome.max_stake,
                "test_ruin": test_outcome.ruin,
                "test_ruin_draw_global": global_ruin_draw,
                "bankroll_after": round(current_bankroll, 4),
            }
        )

        for offset, block_profit in enumerate(profits, start=1):
            path_rows.append(
                {
                    "global_draw": test_start + offset,
                    "segment": segment_id,
                    "chosen_strategy": chosen_train.spec.name,
                    "cumulative_profit": round((current_bankroll - bankroll) - (test_outcome.final_profit - block_profit), 4),
                    "bankroll": round(bankroll + ((current_bankroll - bankroll) - (test_outcome.final_profit - block_profit)), 4),
                }
            )

        if ruined or current_bankroll <= 0.0:
            break

    write_walk_forward_segments(outdir / "walk_forward_segments.csv", segment_rows)
    write_walk_forward_path(outdir / "walk_forward_path.csv", path_rows)
    return segment_rows, path_rows, round(cumulative_profit, 4), ruined


def run_train_test_mode(
    draws: list[Draw],
    specs: list[StrategySpec],
    bankroll: float,
    outdir: Path,
    top_paths: int,
    train_ratio: float,
    leaderboard_size: int,
) -> tuple[list[StrategyOutcome], list[StrategyOutcome], list[Draw], list[Draw]]:
    train_draws, test_draws = split_draws(draws, train_ratio)
    train_outcomes = evaluate_specs(train_draws, specs, bankroll=bankroll)
    test_outcomes = evaluate_specs(test_draws, specs, bankroll=bankroll)
    test_lookup = {outcome.spec.name: outcome for outcome in test_outcomes}

    write_summary(outdir / "train_summary.csv", train_outcomes, total_draws=len(train_draws))
    write_summary(outdir / "test_summary.csv", test_outcomes, total_draws=len(test_draws))
    write_train_test_leaderboard(outdir / "train_test_leaderboard.csv", train_outcomes, test_lookup)

    selected_train = train_outcomes[:top_paths] + train_outcomes[-top_paths:]
    seen_names: set[str] = set()
    selected_paths: list[tuple[StrategyOutcome, list[float]]] = []
    for train_outcome in selected_train:
        if train_outcome.spec.name in seen_names:
            continue
        seen_names.add(train_outcome.spec.name)
        test_outcome = test_lookup[train_outcome.spec.name]
        _, profits = simulate_strategy(test_draws, test_outcome.spec, bankroll=bankroll, record_path=True)
        assert profits is not None
        selected_paths.append((test_outcome, profits))

    write_selected_paths(outdir / "selected_test_paths.csv", test_draws, selected_paths)

    print(
        f"Train/test split: {len(train_draws):,} train draws | {len(test_draws):,} test draws "
        f"| ratio={train_ratio:.2f}"
    )
    print(f"Top {leaderboard_size} train-selected strategies and their unseen test results")
    for train in train_outcomes[:leaderboard_size]:
        test = test_lookup[train.spec.name]
        train_ruin = f", train_ruin@{train.ruin_draw}" if train.ruin else ""
        test_ruin = f", test_ruin@{test.ruin_draw}" if test.ruin else ""
        print(
            f"{train.spec.name}: train profit={train.final_profit:.2f}, train RTP={100*train.rtp:.2f}%"
            f"{train_ruin} | test profit={test.final_profit:.2f}, test RTP={100*test.rtp:.2f}%{test_ruin}"
        )

    return train_outcomes, test_outcomes, train_draws, test_draws


def main() -> None:
    args = parse_args()
    csv_path = resolve_csv_path(args)
    outdir = resolve_outdir(args)
    outdir.mkdir(parents=True, exist_ok=True)

    draws = load_draws(str(csv_path))
    specs = generate_specs(args)
    print(f"Loaded {len(draws):,} draws from {csv_path}")
    print(f"Evaluated {len(specs)} trigger strategies with bankroll {args.bankroll:.2f}")

    if args.walk_forward:
        segment_rows, _path_rows, cumulative_profit, ruined = run_walk_forward_mode(
            draws,
            specs,
            bankroll=args.bankroll,
            outdir=outdir,
            train_draws=args.wf_train_draws,
            test_draws=args.wf_test_draws,
            step_draws=args.wf_step_draws,
        )
        print(
            f"Walk-forward segments traded: {len(segment_rows)} | cumulative profit={cumulative_profit:.2f} "
            f"| ending bankroll={args.bankroll + cumulative_profit:.2f}"
        )
        print("First 10 chosen segments")
        for row in segment_rows[:10]:
            ruin_text = (
                f", ruin@{row['test_ruin_draw_global']}"
                if row["test_ruin"]
                else ""
            )
            print(
                f"seg {row['segment']}: {row['chosen_strategy']} | train={row['train_profit']:.2f} "
                f"| test={row['test_profit']:.2f} | bankroll={row['bankroll_before']:.2f}->{row['bankroll_after']:.2f}{ruin_text}"
            )
        if ruined:
            print("Walk-forward run ended due to ruin.")
    elif args.train_test:
        train_outcomes, test_outcomes, _train_draws, _test_draws = run_train_test_mode(
            draws,
            specs,
            bankroll=args.bankroll,
            outdir=outdir,
            top_paths=args.top_paths,
            train_ratio=args.train_ratio,
            leaderboard_size=args.leaderboard_size,
        )
        print("Best unseen test outcomes among all strategies")
        for outcome in test_outcomes[:5]:
            ruin_text = f", ruin@{outcome.ruin_draw}" if outcome.ruin else ""
            print(
                f"{outcome.spec.name}: profit={outcome.final_profit:.2f}, bets={outcome.bets}, "
                f"hit={100*outcome.hit_rate:.2f}%, RTP={100*outcome.rtp:.2f}%, "
                f"maxDD={outcome.max_drawdown:.2f}, maxStake={outcome.max_stake:.2f}{ruin_text}"
            )
    else:
        outcomes = run_full_history_mode(
            draws,
            specs,
            bankroll=args.bankroll,
            outdir=outdir,
            top_paths=args.top_paths,
        )
        print("Top 5 strategies by final profit")
        for outcome in outcomes[:5]:
            ruin_text = f", ruin@{outcome.ruin_draw}" if outcome.ruin else ""
            print(
                f"{outcome.spec.name}: profit={outcome.final_profit:.2f}, bets={outcome.bets}, "
                f"hit={100*outcome.hit_rate:.2f}%, RTP={100*outcome.rtp:.2f}%, "
                f"maxDD={outcome.max_drawdown:.2f}, maxStake={outcome.max_stake:.2f}{ruin_text}"
            )
        print("Worst 5 strategies by final profit")
        for outcome in outcomes[-5:]:
            ruin_text = f", ruin@{outcome.ruin_draw}" if outcome.ruin else ""
            print(
                f"{outcome.spec.name}: profit={outcome.final_profit:.2f}, bets={outcome.bets}, "
                f"hit={100*outcome.hit_rate:.2f}%, RTP={100*outcome.rtp:.2f}%, "
                f"maxDD={outcome.max_drawdown:.2f}, maxStake={outcome.max_stake:.2f}{ruin_text}"
            )
    print(f"Outputs written to {outdir}")


if __name__ == "__main__":
    main()
