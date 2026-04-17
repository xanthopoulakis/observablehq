#!/usr/bin/env python3
"""Evolve KINO-like surrogate generators with a genetic algorithm.

The candidate generator family is intentionally simple:
- weighted sampling without replacement from 1..80
- weights depend on a small parameter vector and recent generated context

The GA objective is statistical fit to historical KINO behavior, not betting
profit. Candidates are scored on how closely their synthetic draws match:
- number frequencies
- parity distribution
- winning-column distribution
- sum/range/gap/odd-count moments
- parity transition behavior
"""

from __future__ import annotations

import argparse
import csv
import math
import random
import statistics
from pathlib import Path

from kino_backtest import COLUMNS, load_draws


NUMBERS = tuple(range(1, 81))
PARITY_STATES = ("odd", "even", "draw")
COLUMN_OF_NUMBER = {number: ((number - 1) % 10) + 1 for number in NUMBERS}
NUMBER_CENTER = {number: (number - 40.5) / 39.5 for number in NUMBERS}
ODD_SIGN = {number: (1.0 if number % 2 else -1.0) for number in NUMBERS}
DIGIT_SUM = {number: sum(int(ch) for ch in str(number)) for number in NUMBERS}
MEAN_DIGIT = statistics.fmean(DIGIT_SUM.values())
SD_DIGIT = statistics.pstdev(DIGIT_SUM.values())
DIGIT_Z = {number: (DIGIT_SUM[number] - MEAN_DIGIT) / SD_DIGIT for number in NUMBERS}

PARAM_SPECS = [
    ("recency_strength", -1.5, 1.5),
    ("parity_after_odd", -1.0, 1.0),
    ("parity_after_even", -1.0, 1.0),
    ("parity_after_draw", -1.0, 1.0),
    ("repeat_column_strength", -1.0, 1.0),
    ("sum_bucket_0_tilt", -1.0, 1.0),
    ("sum_bucket_1_tilt", -1.0, 1.0),
    ("sum_bucket_2_tilt", -1.0, 1.0),
    ("sum_bucket_3_tilt", -1.0, 1.0),
    ("digit_sum_strength", -0.75, 0.75),
    ("global_number_tilt", -0.75, 0.75),
    ("temperature", 0.35, 2.0),
]


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
        help="Output directory. Defaults to <script_dir>/simulation_outputs/ga_surrogate.",
    )
    parser.add_argument(
        "--train-ratio",
        type=float,
        default=0.8,
        help="Chronological training fraction (default: 0.8).",
    )
    parser.add_argument(
        "--population",
        type=int,
        default=16,
        help="Population size (default: 16).",
    )
    parser.add_argument(
        "--generations",
        type=int,
        default=10,
        help="Number of GA generations (default: 10).",
    )
    parser.add_argument(
        "--elite",
        type=int,
        default=4,
        help="Elite survivors per generation (default: 4).",
    )
    parser.add_argument(
        "--mutation-rate",
        type=float,
        default=0.25,
        help="Per-gene mutation probability (default: 0.25).",
    )
    parser.add_argument(
        "--sim-draws",
        type=int,
        default=2000,
        help="Synthetic draws used per fitness evaluation (default: 2000).",
    )
    parser.add_argument(
        "--burn-in",
        type=int,
        default=500,
        help="Synthetic burn-in draws before collecting summaries (default: 500).",
    )
    parser.add_argument(
        "--eval-repeats",
        type=int,
        default=3,
        help="Independent repeated simulations averaged per train fitness evaluation (default: 3).",
    )
    parser.add_argument(
        "--seed-stride",
        type=int,
        default=9973,
        help="Seed gap between repeated simulation runs (default: 9973).",
    )
    parser.add_argument(
        "--final-sim-draws",
        type=int,
        default=None,
        help="Synthetic draws for final holdout evaluation. Defaults to --sim-draws.",
    )
    parser.add_argument(
        "--final-burn-in",
        type=int,
        default=None,
        help="Burn-in draws for final holdout evaluation. Defaults to --burn-in.",
    )
    parser.add_argument(
        "--final-repeats",
        type=int,
        default=None,
        help="Repeated simulations for final holdout evaluation. Defaults to --eval-repeats.",
    )
    parser.add_argument(
        "--top-candidates",
        type=int,
        default=5,
        help="How many best candidates to save and test (default: 5).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=20260415,
        help="Base random seed (default: 20260415).",
    )
    return parser.parse_args()


def resolve_csv_path(args: argparse.Namespace) -> Path:
    if args.csv_path:
        return Path(args.csv_path).expanduser().resolve()
    return Path(__file__).resolve().parent / "kino.csv"


def resolve_outdir(args: argparse.Namespace) -> Path:
    if args.outdir:
        return Path(args.outdir).expanduser().resolve()
    return Path(__file__).resolve().parent / "simulation_outputs" / "ga_surrogate"


def clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def split_draws(draws, ratio: float):
    split = int(len(draws) * ratio)
    if split <= 0 or split >= len(draws):
        raise ValueError("train_ratio must leave at least one draw in both train and test.")
    return draws[:split], draws[split:]


def parity_from_sequence(sequence: list[int]) -> str:
    odd_count = sum(number % 2 for number in sequence)
    if odd_count > 10:
        return "odd"
    if odd_count < 10:
        return "even"
    return "draw"


def winning_column_from_sequence(sequence: list[int]) -> int:
    counts = {column: 0 for column in COLUMNS}
    for number in sequence:
        counts[COLUMN_OF_NUMBER[number]] += 1
    best_count = max(counts.values())
    tied = {column for column, count in counts.items() if count == best_count}
    return next(COLUMN_OF_NUMBER[number] for number in sequence if COLUMN_OF_NUMBER[number] in tied)


def quartiles(values: list[int | float]) -> tuple[float, float, float]:
    ordered = sorted(values)
    return (
        float(ordered[len(ordered) // 4]),
        float(ordered[len(ordered) // 2]),
        float(ordered[(3 * len(ordered)) // 4]),
    )


def bucket(value: float, cuts: tuple[float, float, float]) -> int:
    q1, q2, q3 = cuts
    if value <= q1:
        return 0
    if value <= q2:
        return 1
    if value <= q3:
        return 2
    return 3


def historical_summary(draws) -> dict[str, object]:
    number_counts = [0] * 81
    parity_counts = {state: 0 for state in PARITY_STATES}
    column_counts = {column: 0 for column in COLUMNS}
    sums = []
    ranges = []
    gap_maxes = []
    odd_counts = []
    parity_transitions = {state: {target: 0 for target in PARITY_STATES} for state in PARITY_STATES}

    previous_parity = None
    for draw in draws:
        sequence = list(draw.numbers)
        ordered = sorted(sequence)
        draw_sum = sum(ordered)
        draw_range = ordered[-1] - ordered[0]
        gap_max = max(b - a for a, b in zip(ordered, ordered[1:]))
        odd_count = sum(number % 2 for number in sequence)
        parity = draw.parity
        column = draw.column

        for number in draw.number_set:
            number_counts[number] += 1
        parity_counts[parity] += 1
        column_counts[column] += 1
        sums.append(draw_sum)
        ranges.append(draw_range)
        gap_maxes.append(gap_max)
        odd_counts.append(odd_count)
        if previous_parity is not None:
            parity_transitions[previous_parity][parity] += 1
        previous_parity = parity

    count = len(draws)
    return {
        "count": count,
        "number_probs": [0.0] + [number_counts[number] / count for number in NUMBERS],
        "parity_probs": {state: parity_counts[state] / count for state in PARITY_STATES},
        "column_probs": {column: column_counts[column] / count for column in COLUMNS},
        "sum_mean": statistics.fmean(sums),
        "sum_sd": statistics.pstdev(sums),
        "range_mean": statistics.fmean(ranges),
        "range_sd": statistics.pstdev(ranges),
        "gap_max_mean": statistics.fmean(gap_maxes),
        "gap_max_sd": statistics.pstdev(gap_maxes),
        "odd_count_mean": statistics.fmean(odd_counts),
        "odd_count_sd": statistics.pstdev(odd_counts),
        "parity_transition_probs": transition_probs(parity_transitions),
        "sum_cuts": quartiles(sums),
    }


def transition_probs(counts: dict[str, dict[str, int]]) -> dict[str, dict[str, float]]:
    probs = {state: {target: 0.0 for target in PARITY_STATES} for state in PARITY_STATES}
    for state in PARITY_STATES:
        total = sum(counts[state].values())
        if total == 0:
            continue
        for target in PARITY_STATES:
            probs[state][target] = counts[state][target] / total
    return probs


class ParametricGenerator:
    def __init__(self, params: list[float], sum_cuts: tuple[float, float, float]) -> None:
        self.params = params
        self.sum_cuts = sum_cuts
        self.ages = [0.0] + [0.0] * 80
        self.last_parity: str | None = None
        self.last_column: int | None = None
        self.last_sum_bucket: int | None = None

    def scores(self) -> list[float]:
        scores = [0.0] * 81
        age_total = 0.0
        for number in NUMBERS:
            age_total += self.ages[number]
        mean_age = age_total / len(NUMBERS)
        age_var = 0.0
        for number in NUMBERS:
            diff = self.ages[number] - mean_age
            age_var += diff * diff
        sd_age = math.sqrt(age_var / len(NUMBERS)) or 1.0

        recency_strength = self.params[0]
        parity_bias = {
            "odd": self.params[1],
            "even": self.params[2],
            "draw": self.params[3],
        }
        repeat_column_strength = self.params[4]
        sum_bucket_tilt = self.params[5:9]
        digit_sum_strength = self.params[9]
        global_number_tilt = self.params[10]
        temperature = max(self.params[11], 0.1)

        for number in NUMBERS:
            age_z = (self.ages[number] - mean_age) / sd_age
            score = recency_strength * age_z
            if self.last_parity is not None:
                score += parity_bias[self.last_parity] * ODD_SIGN[number]
            if self.last_column is not None and COLUMN_OF_NUMBER[number] == self.last_column:
                score += repeat_column_strength
            if self.last_sum_bucket is not None:
                score += sum_bucket_tilt[self.last_sum_bucket] * NUMBER_CENTER[number]
            score += digit_sum_strength * DIGIT_Z[number]
            score += global_number_tilt * NUMBER_CENTER[number]
            scores[number] = score / temperature
        return scores

    def weighted_draw(self, rng: random.Random) -> list[int]:
        current_scores = self.scores()
        keys = []
        for number in NUMBERS:
            weight = math.exp(current_scores[number])
            key = rng.random() ** (1.0 / max(weight, 1e-12))
            keys.append((key, number))
        keys.sort(reverse=True)
        return [number for _key, number in keys[:20]]

    def observe_sequence(self, sequence: list[int]) -> None:
        picked = set(sequence)
        for number in NUMBERS:
            if number in picked:
                self.ages[number] = 0.0
            else:
                self.ages[number] += 1.0
        self.last_parity = parity_from_sequence(sequence)
        self.last_column = winning_column_from_sequence(sequence)
        self.last_sum_bucket = bucket(float(sum(sequence)), self.sum_cuts)


def simulate_summary(params: list[float], target_summary: dict[str, object], sim_draws: int, burn_in: int, seed: int) -> dict[str, object]:
    generator = ParametricGenerator(params, target_summary["sum_cuts"])
    rng = random.Random(seed)

    number_counts = [0] * 81
    parity_counts = {state: 0 for state in PARITY_STATES}
    column_counts = {column: 0 for column in COLUMNS}
    sums = []
    ranges = []
    gap_maxes = []
    odd_counts = []
    parity_transitions = {state: {target: 0 for target in PARITY_STATES} for state in PARITY_STATES}

    previous_parity = None
    total = burn_in + sim_draws
    for draw_index in range(total):
        sequence = generator.weighted_draw(rng)
        generator.observe_sequence(sequence)
        if draw_index < burn_in:
            continue
        ordered = sorted(sequence)
        draw_sum = sum(ordered)
        draw_range = ordered[-1] - ordered[0]
        gap_max = max(b - a for a, b in zip(ordered, ordered[1:]))
        odd_count = sum(number % 2 for number in sequence)
        parity = generator.last_parity
        column = generator.last_column

        for number in sequence:
            number_counts[number] += 1
        parity_counts[parity] += 1
        column_counts[column] += 1
        sums.append(draw_sum)
        ranges.append(draw_range)
        gap_maxes.append(gap_max)
        odd_counts.append(odd_count)
        if previous_parity is not None:
            parity_transitions[previous_parity][parity] += 1
        previous_parity = parity

    return {
        "count": sim_draws,
        "number_probs": [0.0] + [number_counts[number] / sim_draws for number in NUMBERS],
        "parity_probs": {state: parity_counts[state] / sim_draws for state in PARITY_STATES},
        "column_probs": {column: column_counts[column] / sim_draws for column in COLUMNS},
        "sum_mean": statistics.fmean(sums),
        "sum_sd": statistics.pstdev(sums),
        "range_mean": statistics.fmean(ranges),
        "range_sd": statistics.pstdev(ranges),
        "gap_max_mean": statistics.fmean(gap_maxes),
        "gap_max_sd": statistics.pstdev(gap_maxes),
        "odd_count_mean": statistics.fmean(odd_counts),
        "odd_count_sd": statistics.pstdev(odd_counts),
        "parity_transition_probs": transition_probs(parity_transitions),
    }


def summary_loss(candidate: dict[str, object], target: dict[str, object]) -> tuple[float, dict[str, float]]:
    number_rmse = math.sqrt(
        statistics.fmean(
            (candidate["number_probs"][number] - target["number_probs"][number]) ** 2 for number in NUMBERS
        )
    )
    parity_tv = 0.5 * sum(
        abs(candidate["parity_probs"][state] - target["parity_probs"][state]) for state in PARITY_STATES
    )
    column_tv = 0.5 * sum(
        abs(candidate["column_probs"][column] - target["column_probs"][column]) for column in COLUMNS
    )
    sum_mean_z = abs(candidate["sum_mean"] - target["sum_mean"]) / max(target["sum_sd"], 1e-9)
    sum_sd_z = abs(candidate["sum_sd"] - target["sum_sd"]) / max(target["sum_sd"], 1e-9)
    range_mean_z = abs(candidate["range_mean"] - target["range_mean"]) / max(target["range_sd"], 1e-9)
    range_sd_z = abs(candidate["range_sd"] - target["range_sd"]) / max(target["range_sd"], 1e-9)
    gap_mean_z = abs(candidate["gap_max_mean"] - target["gap_max_mean"]) / max(target["gap_max_sd"], 1e-9)
    odd_mean_z = abs(candidate["odd_count_mean"] - target["odd_count_mean"]) / max(target["odd_count_sd"], 1e-9)
    transition_tv = 0.0
    for state in PARITY_STATES:
        transition_tv += 0.5 * sum(
            abs(candidate["parity_transition_probs"][state][target_state] - target["parity_transition_probs"][state][target_state])
            for target_state in PARITY_STATES
        )
    transition_tv /= len(PARITY_STATES)

    loss = (
        120.0 * number_rmse
        + 20.0 * parity_tv
        + 20.0 * column_tv
        + 3.0 * sum_mean_z
        + 3.0 * sum_sd_z
        + 2.0 * range_mean_z
        + 2.0 * range_sd_z
        + 2.0 * gap_mean_z
        + 2.0 * odd_mean_z
        + 5.0 * transition_tv
    )
    metrics = {
        "number_rmse": round(number_rmse, 6),
        "parity_tv": round(parity_tv, 6),
        "column_tv": round(column_tv, 6),
        "sum_mean_z": round(sum_mean_z, 6),
        "sum_sd_z": round(sum_sd_z, 6),
        "range_mean_z": round(range_mean_z, 6),
        "range_sd_z": round(range_sd_z, 6),
        "gap_mean_z": round(gap_mean_z, 6),
        "odd_mean_z": round(odd_mean_z, 6),
        "transition_tv": round(transition_tv, 6),
    }
    return loss, metrics


def evaluate_candidate(
    params: list[float],
    target_summary: dict[str, object],
    sim_draws: int,
    burn_in: int,
    seed: int,
    repeats: int,
    seed_stride: int,
) -> dict[str, object]:
    losses = []
    metric_rows = []
    for repeat_index in range(repeats):
        summary = simulate_summary(
            params,
            target_summary,
            sim_draws,
            burn_in,
            seed + repeat_index * seed_stride,
        )
        loss, metrics = summary_loss(summary, target_summary)
        losses.append(loss)
        metric_rows.append(metrics)

    metric_names = tuple(metric_rows[0].keys())
    mean_metrics = {
        name: round(statistics.fmean(metrics[name] for metrics in metric_rows), 6)
        for name in metric_names
    }
    metric_sds = {
        f"{name}_sd": round(
            statistics.pstdev(metrics[name] for metrics in metric_rows) if repeats > 1 else 0.0,
            6,
        )
        for name in metric_names
    }
    return {
        "loss": statistics.fmean(losses),
        "loss_sd": statistics.pstdev(losses) if repeats > 1 else 0.0,
        "loss_min": min(losses),
        "loss_max": max(losses),
        "metrics": mean_metrics,
        "metric_sds": metric_sds,
        "repeats": repeats,
        "sim_draws": sim_draws,
        "burn_in": burn_in,
    }


def random_candidate(rng: random.Random) -> list[float]:
    return [rng.uniform(low, high) for _name, low, high in PARAM_SPECS]


def neutral_candidate() -> list[float]:
    params = [0.0] * len(PARAM_SPECS)
    params[-1] = 1.0
    return params


def crossover(a: list[float], b: list[float], rng: random.Random) -> list[float]:
    child = []
    for index, (_name, low, high) in enumerate(PARAM_SPECS):
        mix = rng.random()
        value = mix * a[index] + (1.0 - mix) * b[index]
        child.append(clamp(value, low, high))
    return child


def mutate(params: list[float], mutation_rate: float, rng: random.Random) -> list[float]:
    mutated = params[:]
    for index, (_name, low, high) in enumerate(PARAM_SPECS):
        if rng.random() < mutation_rate:
            span = high - low
            sigma = span * 0.12
            mutated[index] = clamp(mutated[index] + rng.gauss(0.0, sigma), low, high)
    return mutated


def evaluate_population(
    population: list[list[float]],
    target_summary: dict[str, object],
    sim_draws: int,
    burn_in: int,
    seed: int,
    repeats: int,
    seed_stride: int,
):
    evaluated = []
    for index, params in enumerate(population):
        evaluation = evaluate_candidate(
            params,
            target_summary,
            sim_draws=sim_draws,
            burn_in=burn_in,
            seed=seed + index * repeats * seed_stride,
            repeats=repeats,
            seed_stride=seed_stride,
        )
        evaluated.append({"params": params, **evaluation})
    evaluated.sort(key=lambda item: item["loss"])
    return evaluated


def tournament_select(evaluated, rng: random.Random, k: int = 3):
    entrants = rng.sample(evaluated, k)
    entrants.sort(key=lambda item: item["loss"])
    return entrants[0]["params"]


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    if not rows:
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def params_to_row(
    rank: int,
    label: str,
    evaluation: dict[str, object],
    params: list[float],
) -> dict[str, object]:
    row = {
        "rank": rank,
        "label": label,
        "loss": round(float(evaluation["loss"]), 6),
        "loss_sd": round(float(evaluation["loss_sd"]), 6),
        "loss_min": round(float(evaluation["loss_min"]), 6),
        "loss_max": round(float(evaluation["loss_max"]), 6),
        "eval_repeats": int(evaluation["repeats"]),
        "eval_sim_draws": int(evaluation["sim_draws"]),
        "eval_burn_in": int(evaluation["burn_in"]),
    }
    row.update(evaluation["metrics"])
    row.update(evaluation["metric_sds"])
    for (name, _low, _high), value in zip(PARAM_SPECS, params):
        row[name] = round(value, 6)
    return row


def main() -> None:
    args = parse_args()
    csv_path = resolve_csv_path(args)
    outdir = resolve_outdir(args)
    outdir.mkdir(parents=True, exist_ok=True)

    draws = load_draws(str(csv_path))
    train_draws, test_draws = split_draws(draws, args.train_ratio)
    train_summary = historical_summary(train_draws)
    test_summary = historical_summary(test_draws)
    final_sim_draws = args.final_sim_draws or args.sim_draws
    final_burn_in = args.final_burn_in if args.final_burn_in is not None else args.burn_in
    final_repeats = args.final_repeats or args.eval_repeats

    rng = random.Random(args.seed)
    population = [neutral_candidate()] + [random_candidate(rng) for _ in range(args.population - 1)]

    history_rows: list[dict[str, object]] = []
    last_evaluated = None
    for generation in range(args.generations):
        evaluated = evaluate_population(
            population,
            train_summary,
            sim_draws=args.sim_draws,
            burn_in=args.burn_in,
            seed=args.seed + generation * 1000,
            repeats=args.eval_repeats,
            seed_stride=args.seed_stride,
        )
        last_evaluated = evaluated
        losses = [item["loss"] for item in evaluated]
        best = evaluated[0]
        history_rows.append(
            {
                "generation": generation,
                "best_loss": round(best["loss"], 6),
                "best_loss_sd": round(best["loss_sd"], 6),
                "median_loss": round(statistics.median(losses), 6),
                "worst_loss": round(losses[-1], 6),
                **best["metrics"],
                **best["metric_sds"],
            }
        )
        print(
            f"generation {generation + 1}/{args.generations}: "
            f"best_loss={best['loss']:.6f} +/- {best['loss_sd']:.6f}",
            flush=True,
        )

        elites = [item["params"][:] for item in evaluated[: args.elite]]
        next_population = elites[:]
        while len(next_population) < args.population:
            parent_a = tournament_select(evaluated, rng)
            parent_b = tournament_select(evaluated, rng)
            child = crossover(parent_a, parent_b, rng)
            child = mutate(child, args.mutation_rate, rng)
            next_population.append(child)
        population = next_population

    assert last_evaluated is not None
    top_train = last_evaluated[: args.top_candidates]
    candidate_rows: list[dict[str, object]] = []
    test_rows: list[dict[str, object]] = []

    uniform_params = neutral_candidate()
    uniform_evaluation = evaluate_candidate(
        uniform_params,
        test_summary,
        sim_draws=final_sim_draws,
        burn_in=final_burn_in,
        seed=args.seed + 999999,
        repeats=final_repeats,
        seed_stride=args.seed_stride,
    )
    test_rows.append(params_to_row(0, "uniform_baseline", uniform_evaluation, uniform_params))

    for rank, item in enumerate(top_train, start=1):
        candidate_rows.append(params_to_row(rank, "train_best", item, item["params"]))
        test_evaluation = evaluate_candidate(
            item["params"],
            test_summary,
            sim_draws=final_sim_draws,
            burn_in=final_burn_in,
            seed=args.seed + 200000 + rank,
            repeats=final_repeats,
            seed_stride=args.seed_stride,
        )
        test_rows.append(params_to_row(rank, "test_eval", test_evaluation, item["params"]))

    write_csv(outdir / "evolution_history.csv", history_rows)
    write_csv(outdir / "top_candidates_train.csv", candidate_rows)
    write_csv(outdir / "top_candidates_test.csv", test_rows)

    print(f"Loaded {len(draws):,} draws from {csv_path}")
    print(f"Train/test split: {len(train_draws):,} / {len(test_draws):,}")
    print(
        f"GA: population={args.population}, generations={args.generations}, sim_draws={args.sim_draws}, "
        f"burn_in={args.burn_in}, eval_repeats={args.eval_repeats}"
    )
    best = top_train[0]
    print(
        f"Best train candidate loss={best['loss']:.6f} +/- {best['loss_sd']:.6f} | "
        f"num_rmse={best['metrics']['number_rmse']} | parity_tv={best['metrics']['parity_tv']} | "
        f"column_tv={best['metrics']['column_tv']}"
    )
    best_test = min((row for row in test_rows if row["label"] == "test_eval"), key=lambda row: row["loss"])
    print(
        f"Best evolved test loss={best_test['loss']:.6f} +/- {best_test['loss_sd']:.6f} | "
        f"num_rmse={best_test['number_rmse']} | parity_tv={best_test['parity_tv']} | "
        f"column_tv={best_test['column_tv']}"
    )
    print(
        f"Uniform test loss={uniform_evaluation['loss']:.6f} +/- {uniform_evaluation['loss_sd']:.6f} | "
        f"num_rmse={uniform_evaluation['metrics']['number_rmse']} | "
        f"parity_tv={uniform_evaluation['metrics']['parity_tv']} | "
        f"column_tv={uniform_evaluation['metrics']['column_tv']}"
    )
    print(
        f"Final holdout evaluation: sim_draws={final_sim_draws}, burn_in={final_burn_in}, "
        f"repeats={final_repeats}"
    )
    print(f"Outputs written to {outdir}")


if __name__ == "__main__":
    main()
