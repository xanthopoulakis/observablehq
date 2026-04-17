#!/usr/bin/env python3
"""Fit and evaluate surrogate KINO RNG models on historical draws.

The script does two things:
1. Fits several observable-behavior surrogate models on a training segment and
   checks how closely they reproduce held-out draw statistics.
2. Uses the models online on unseen draws to rank numbers and derived markets,
   then measures whether those rankings improve actual betting outcomes.

This is intentionally a surrogate output model, not an attempt to reconstruct
the hidden OPAP/Allwyn internal RNG.
"""

from __future__ import annotations

import argparse
import copy
import csv
import math
import random
import statistics
from collections import Counter
from pathlib import Path

from kino_backtest import COLUMNS, NUMBER_PAYOUTS, load_draws


NUMBERS = tuple(range(1, 81))
PICK_SIZES = (1, 5, 10)
NUMBER_STAKE = 0.50
PARITY_STAKE = 1.00
COLUMN_STAKE = 1.00


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
        help="Output directory. Defaults to <script_dir>/simulation_outputs/surrogate_rng_eval.",
    )
    parser.add_argument(
        "--train-ratio",
        type=float,
        default=0.8,
        help="Chronological training fraction (default: 0.8).",
    )
    parser.add_argument(
        "--sim-draws",
        type=int,
        default=20000,
        help="Synthetic draws per surrogate for the distribution-validation report (default: 20000).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=20260415,
        help="Seed for surrogate simulations (default: 20260415).",
    )
    return parser.parse_args()


def resolve_csv_path(args: argparse.Namespace) -> Path:
    if args.csv_path:
        return Path(args.csv_path).expanduser().resolve()
    return Path(__file__).resolve().parent / "kino.csv"


def resolve_outdir(args: argparse.Namespace) -> Path:
    if args.outdir:
        return Path(args.outdir).expanduser().resolve()
    return Path(__file__).resolve().parent / "simulation_outputs" / "surrogate_rng_eval"


def split_draws(draws, ratio: float):
    split = int(len(draws) * ratio)
    if split <= 0 or split >= len(draws):
        raise ValueError("train_ratio must leave at least one draw in both train and test.")
    return draws[:split], draws[split:]


def digit_sum(number: int) -> int:
    return sum(int(ch) for ch in str(number))


def parity_from_sequence(sequence: list[int]) -> str:
    odd_count = sum(number % 2 for number in sequence)
    if odd_count > 10:
        return "odd"
    if odd_count < 10:
        return "even"
    return "draw"


def winning_column_from_sequence(sequence: list[int]) -> int:
    column_counts = {column: 0 for column in COLUMNS}
    for number in sequence:
        column_counts[((number - 1) % 10) + 1] += 1
    best_count = max(column_counts.values())
    tied = {column for column, count in column_counts.items() if count == best_count}
    return next(((number - 1) % 10) + 1 for number in sequence if (((number - 1) % 10) + 1) in tied)


def draw_feature_summary(numbers: list[int]) -> dict[str, float | int | str]:
    ordered = sorted(numbers)
    gaps = [b - a for a, b in zip(ordered, ordered[1:])]
    return {
        "sum": sum(ordered),
        "digit_sum": sum(digit_sum(number) for number in ordered),
        "range": ordered[-1] - ordered[0],
        "gap_max": max(gaps),
        "odd_count": sum(number % 2 for number in ordered),
        "parity": parity_from_sequence(numbers),
        "column": winning_column_from_sequence(numbers),
    }


def quartiles(values: list[float | int]) -> tuple[float | int, float | int, float | int]:
    ordered = sorted(values)
    return (
        ordered[len(ordered) // 4],
        ordered[len(ordered) // 2],
        ordered[(3 * len(ordered)) // 4],
    )


def bucket(value: float | int, cuts: tuple[float | int, float | int, float | int]) -> int:
    q1, q2, q3 = cuts
    if value <= q1:
        return 0
    if value <= q2:
        return 1
    if value <= q3:
        return 2
    return 3


class SurrogateModel:
    name = "base"

    def predict_scores(self) -> list[float]:
        raise NotImplementedError

    def observe(self, draw) -> None:
        raise NotImplementedError

    def advance_context_from_sequence(self, sequence: list[int]) -> None:
        return None


class UniformModel(SurrogateModel):
    name = "uniform_shuffle"

    def predict_scores(self) -> list[float]:
        return [0.0] + [1.0] * 80

    def observe(self, draw) -> None:
        return None


class GlobalFrequencyModel(SurrogateModel):
    name = "global_frequency"

    def __init__(self, alpha: float = 1.0) -> None:
        self.counts = [0.0] + [alpha] * 80

    def predict_scores(self) -> list[float]:
        return self.counts

    def observe(self, draw) -> None:
        for number in draw.number_set:
            self.counts[number] += 1.0


class RecentFrequencyModel(SurrogateModel):
    name = "recent_frequency"

    def __init__(self, half_life: int = 5000, alpha: float = 1.0) -> None:
        self.decay = 0.5 ** (1.0 / half_life)
        self.weights = [0.0] + [alpha] * 80

    def predict_scores(self) -> list[float]:
        return self.weights

    def observe(self, draw) -> None:
        for number in NUMBERS:
            self.weights[number] *= self.decay
        for number in draw.number_set:
            self.weights[number] += 1.0


class PrevParityConditionalModel(SurrogateModel):
    name = "prev_parity_conditional"

    def __init__(self, alpha: float = 1.0) -> None:
        self.counts = {state: [0.0] + [alpha] * 80 for state in ("odd", "even", "draw")}
        self.last_state: str | None = None

    def predict_scores(self) -> list[float]:
        return [0.0] + [1.0] * 80 if self.last_state is None else self.counts[self.last_state]

    def observe(self, draw) -> None:
        if self.last_state is not None:
            current = self.counts[self.last_state]
            for number in draw.number_set:
                current[number] += 1.0
        self.last_state = draw.parity

    def advance_context_from_sequence(self, sequence: list[int]) -> None:
        self.last_state = parity_from_sequence(sequence)


class PrevSumQuartileConditionalModel(SurrogateModel):
    name = "prev_sum_quartile_conditional"

    def __init__(self, cuts: tuple[int, int, int], alpha: float = 1.0) -> None:
        self.cuts = cuts
        self.counts = {bucket_id: [0.0] + [alpha] * 80 for bucket_id in range(4)}
        self.last_bucket: int | None = None

    def current_bucket(self, draw_sum: int) -> int:
        return bucket(draw_sum, self.cuts)

    def predict_scores(self) -> list[float]:
        return [0.0] + [1.0] * 80 if self.last_bucket is None else self.counts[self.last_bucket]

    def observe(self, draw) -> None:
        if self.last_bucket is not None:
            current = self.counts[self.last_bucket]
            for number in draw.number_set:
                current[number] += 1.0
        self.last_bucket = self.current_bucket(sum(draw.numbers))

    def advance_context_from_sequence(self, sequence: list[int]) -> None:
        self.last_bucket = self.current_bucket(sum(sequence))


class PrevGapMaxQuartileConditionalModel(SurrogateModel):
    name = "prev_gapmax_quartile_conditional"

    def __init__(self, cuts: tuple[int, int, int], alpha: float = 1.0) -> None:
        self.cuts = cuts
        self.counts = {bucket_id: [0.0] + [alpha] * 80 for bucket_id in range(4)}
        self.last_bucket: int | None = None

    def current_bucket(self, sequence: list[int]) -> int:
        ordered = sorted(sequence)
        gap_max = max(b - a for a, b in zip(ordered, ordered[1:]))
        return bucket(gap_max, self.cuts)

    def predict_scores(self) -> list[float]:
        return [0.0] + [1.0] * 80 if self.last_bucket is None else self.counts[self.last_bucket]

    def observe(self, draw) -> None:
        if self.last_bucket is not None:
            current = self.counts[self.last_bucket]
            for number in draw.number_set:
                current[number] += 1.0
        self.last_bucket = self.current_bucket(list(draw.numbers))

    def advance_context_from_sequence(self, sequence: list[int]) -> None:
        self.last_bucket = self.current_bucket(sequence)


def build_models(train_draws) -> list[SurrogateModel]:
    sum_cuts = quartiles([sum(draw.numbers) for draw in train_draws])
    gapmax_cuts = quartiles(
        [max(b - a for a, b in zip(sorted(draw.numbers), sorted(draw.numbers)[1:])) for draw in train_draws]
    )
    models: list[SurrogateModel] = [
        UniformModel(),
        GlobalFrequencyModel(),
        RecentFrequencyModel(),
        PrevParityConditionalModel(),
        PrevSumQuartileConditionalModel(sum_cuts),
        PrevGapMaxQuartileConditionalModel(gapmax_cuts),
    ]
    for draw in train_draws:
        for model in models:
            model.observe(draw)
    return models


def top_numbers(scores: list[float], pick_size: int) -> list[int]:
    ranked = sorted(NUMBERS, key=lambda number: (-scores[number], number))
    return ranked[:pick_size]


def parity_choice(scores: list[float]) -> str:
    odd_score = sum(scores[number] for number in NUMBERS if number % 2 == 1)
    even_score = sum(scores[number] for number in NUMBERS if number % 2 == 0)
    return "odd" if odd_score >= even_score else "even"


def column_choice(scores: list[float]) -> int:
    column_scores = {
        column: sum(scores[number] for number in NUMBERS if ((number - 1) % 10) + 1 == column)
        for column in COLUMNS
    }
    return max(COLUMNS, key=lambda column: (column_scores[column], -column))


def evaluate_online_predictions(models: list[SurrogateModel], test_draws) -> list[dict[str, object]]:
    task_stats: dict[tuple[str, str], dict[str, float]] = {}

    def ensure(model_name: str, task: str) -> dict[str, float]:
        return task_stats.setdefault(
            (model_name, task),
            {"bets": 0.0, "gross": 0.0, "profit": 0.0, "hits": 0.0, "correct": 0.0},
        )

    for draw in test_draws:
        for model in models:
            scores = model.predict_scores()

            for pick_size in PICK_SIZES:
                choice = top_numbers(scores, pick_size)
                hits = sum(number in draw.number_set for number in choice)
                gross = NUMBER_STAKE * NUMBER_PAYOUTS[pick_size].get(hits, 0.0)
                stat = ensure(model.name, f"game_{pick_size}")
                stat["bets"] += 1
                stat["gross"] += gross
                stat["profit"] += gross - NUMBER_STAKE
                stat["hits"] += hits

            parity_pick = parity_choice(scores)
            parity_gross = PARITY_STAKE * 2.0 if draw.parity == parity_pick else 0.0
            parity_stat = ensure(model.name, "parity_odd_even")
            parity_stat["bets"] += 1
            parity_stat["gross"] += parity_gross
            parity_stat["profit"] += parity_gross - PARITY_STAKE
            parity_stat["correct"] += 1 if draw.parity == parity_pick else 0

            column_pick = column_choice(scores)
            column_gross = COLUMN_STAKE * 8.0 if draw.column == column_pick else 0.0
            column_stat = ensure(model.name, "column")
            column_stat["bets"] += 1
            column_stat["gross"] += column_gross
            column_stat["profit"] += column_gross - COLUMN_STAKE
            column_stat["correct"] += 1 if draw.column == column_pick else 0

        for model in models:
            model.observe(draw)

    rows: list[dict[str, object]] = []
    for (model_name, task), stat in sorted(task_stats.items()):
        if task.startswith("game_"):
            stake_per_bet = NUMBER_STAKE
        elif task == "parity_odd_even":
            stake_per_bet = PARITY_STAKE
        else:
            stake_per_bet = COLUMN_STAKE
        row = {
            "model": model_name,
            "task": task,
            "bets": int(stat["bets"]),
            "gross": round(stat["gross"], 4),
            "profit": round(stat["profit"], 4),
            "rtp": round(stat["gross"] / (stat["bets"] * stake_per_bet), 6) if stat["bets"] else 0.0,
        }
        if task.startswith("game_"):
            pick_size = int(task.split("_")[1])
            row["avg_hits"] = round(stat["hits"] / stat["bets"], 6) if stat["bets"] else 0.0
            row["stake_per_bet"] = stake_per_bet
            row["baseline_rtp"] = round(expected_game_rtp(pick_size), 6)
        elif task == "parity_odd_even":
            row["hit_rate"] = round(stat["correct"] / stat["bets"], 6) if stat["bets"] else 0.0
            row["stake_per_bet"] = stake_per_bet
            row["baseline_rtp"] = round(2.0 * (1.0 - draw_probability()) / 2.0, 6)
        else:
            row["hit_rate"] = round(stat["correct"] / stat["bets"], 6) if stat["bets"] else 0.0
            row["stake_per_bet"] = stake_per_bet
            row["baseline_rtp"] = 0.8
        rows.append(row)
    return rows


def draw_probability() -> float:
    from math import comb

    return comb(40, 10) * comb(40, 10) / comb(80, 20)


def expected_game_rtp(pick_size: int) -> float:
    from math import comb

    expected = 0.0
    for hits in range(pick_size + 1):
        probability = comb(20, hits) * comb(60, pick_size - hits) / comb(80, pick_size)
        expected += probability * NUMBER_PAYOUTS[pick_size].get(hits, 0.0)
    return expected


def weighted_sample_sequence(scores: list[float], rng: random.Random) -> list[int]:
    keys = []
    for number in NUMBERS:
        weight = max(scores[number], 1e-12)
        key = rng.random() ** (1.0 / weight)
        keys.append((key, number))
    keys.sort(reverse=True)
    return [number for _key, number in keys[:20]]


def summarize_actual_draws(draws) -> dict[str, object]:
    number_counts = Counter()
    parity_counts = Counter()
    column_counts = Counter()
    sums = []
    ranges = []
    odd_counts = []
    gap_maxes = []
    for draw in draws:
        info = draw_feature_summary(list(draw.numbers))
        sums.append(info["sum"])
        ranges.append(info["range"])
        odd_counts.append(info["odd_count"])
        gap_maxes.append(info["gap_max"])
        parity_counts[draw.parity] += 1
        column_counts[draw.column] += 1
        number_counts.update(draw.number_set)
    return {
        "count": len(draws),
        "sum_mean": statistics.fmean(sums),
        "range_mean": statistics.fmean(ranges),
        "odd_count_mean": statistics.fmean(odd_counts),
        "gap_max_mean": statistics.fmean(gap_maxes),
        "parity_probs": {state: parity_counts[state] / len(draws) for state in ("odd", "even", "draw")},
        "column_probs": {column: column_counts[column] / len(draws) for column in COLUMNS},
        "number_probs": {number: number_counts[number] / len(draws) for number in NUMBERS},
    }


def simulate_validation(models: list[SurrogateModel], test_summary: dict[str, object], sim_draws: int, seed: int) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for index, model in enumerate(models):
        sim_model = copy.deepcopy(model)
        rng = random.Random(seed + index)
        number_counts = Counter()
        parity_counts = Counter()
        column_counts = Counter()
        sums = []
        ranges = []
        odd_counts = []
        gap_maxes = []

        for _ in range(sim_draws):
            sequence = weighted_sample_sequence(sim_model.predict_scores(), rng)
            info = draw_feature_summary(sequence)
            sums.append(info["sum"])
            ranges.append(info["range"])
            odd_counts.append(info["odd_count"])
            gap_maxes.append(info["gap_max"])
            parity_counts[info["parity"]] += 1
            column_counts[info["column"]] += 1
            number_counts.update(sequence)
            sim_model.advance_context_from_sequence(sequence)

        parity_tv = 0.5 * sum(
            abs((parity_counts[state] / sim_draws) - test_summary["parity_probs"][state])
            for state in ("odd", "even", "draw")
        )
        column_tv = 0.5 * sum(
            abs((column_counts[column] / sim_draws) - test_summary["column_probs"][column])
            for column in COLUMNS
        )
        number_rmse = math.sqrt(
            statistics.fmean(
                ((number_counts[number] / sim_draws) - test_summary["number_probs"][number]) ** 2
                for number in NUMBERS
            )
        )

        rows.append(
            {
                "model": model.name,
                "sim_draws": sim_draws,
                "sum_mean_diff": round(statistics.fmean(sums) - test_summary["sum_mean"], 6),
                "range_mean_diff": round(statistics.fmean(ranges) - test_summary["range_mean"], 6),
                "odd_count_mean_diff": round(statistics.fmean(odd_counts) - test_summary["odd_count_mean"], 6),
                "gap_max_mean_diff": round(statistics.fmean(gap_maxes) - test_summary["gap_max_mean"], 6),
                "parity_tv_distance": round(parity_tv, 6),
                "column_tv_distance": round(column_tv, 6),
                "number_freq_rmse": round(number_rmse, 6),
            }
        )
    return rows


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    if not rows:
        return
    fieldnames: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for key in row.keys():
            if key not in seen:
                seen.add(key)
                fieldnames.append(key)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    args = parse_args()
    csv_path = resolve_csv_path(args)
    outdir = resolve_outdir(args)
    outdir.mkdir(parents=True, exist_ok=True)

    draws = load_draws(str(csv_path))
    train_draws, test_draws = split_draws(draws, args.train_ratio)

    train_models = build_models(train_draws)
    frozen_models = copy.deepcopy(train_models)
    predictive_rows = evaluate_online_predictions(train_models, test_draws)
    validation_rows = simulate_validation(frozen_models, summarize_actual_draws(test_draws), args.sim_draws, args.seed)

    write_csv(outdir / "predictive_summary.csv", predictive_rows)
    write_csv(outdir / "simulation_validation.csv", validation_rows)

    print(f"Loaded {len(draws):,} draws from {csv_path}")
    print(f"Train/test split: {len(train_draws):,} / {len(test_draws):,}")
    print("Best predictive rows by profit")
    for row in sorted(predictive_rows, key=lambda item: item["profit"], reverse=True)[:10]:
        extra = (
            f"avg_hits={row['avg_hits']:.4f}" if "avg_hits" in row else f"hit_rate={row['hit_rate']:.4f}"
        )
        print(
            f"{row['model']} {row['task']}: profit={row['profit']:.2f}, RTP={100*row['rtp']:.2f}%, "
            f"{extra}, baseline={100*row['baseline_rtp']:.2f}%"
        )
    print("Best distribution fits by number_freq_rmse")
    for row in sorted(validation_rows, key=lambda item: item["number_freq_rmse"])[:5]:
        print(
            f"{row['model']}: num_rmse={row['number_freq_rmse']:.6f}, parity_tv={row['parity_tv_distance']:.6f}, "
            f"column_tv={row['column_tv_distance']:.6f}"
        )
    print(f"Outputs written to {outdir}")


if __name__ == "__main__":
    main()
