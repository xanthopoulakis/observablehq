#!/usr/bin/env python3
"""Backtest age-based and hot/cold KINO heuristics on a CSV export.

The script is dependency-free and evaluates:
- Age-conditioning: whether "time since last appearance" changes next-draw odds.
- Sequential heuristics for numbers, parity, and winning columns.
- Actual return vs the fair-game expectation implied by official payout rules.
- Exact theoretical returns for plain KINO, KINO BONUS, KINO PARA1, and PARA1 + BONUS.
"""

from __future__ import annotations

import argparse
import csv
import math
from collections import Counter, deque
from dataclasses import dataclass
from math import comb
from typing import Callable, Iterable


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

BONUS_PAYOUTS = {
    1: {1: 52.5},
    2: {2: 70.0, 1: 16.0},
    3: {3: 175.0, 2: 18.0, 1: 8.0},
    4: {4: 600.0, 3: 24.0, 2: 8.0, 1: 5.0},
    5: {5: 1350.0, 4: 90.0, 3: 17.0, 2: 5.0, 1: 3.0},
    6: {6: 4100.0, 5: 300.0, 4: 27.0, 3: 9.0, 2: 3.0, 1: 2.0},
    7: {7: 15000.0, 6: 400.0, 5: 80.0, 4: 13.0, 3: 8.0, 2: 3.0, 1: 2.0},
    8: {8: 40000.0, 7: 3000.0, 6: 200.0, 5: 30.0, 4: 7.0, 3: 4.0, 2: 3.0, 1: 2.0},
    9: {9: 100000.0, 8: 10000.0, 7: 500.0, 6: 70.0, 5: 15.0, 4: 6.0, 3: 4.0, 2: 3.0, 1: 2.0},
    10: {10: 250000.0, 9: 25000.0, 8: 1500.0, 7: 180.0, 6: 60.0, 5: 7.0, 4: 4.0, 3: 3.0, 2: 2.5, 1: 2.0},
    11: {11: 1200000.0, 10: 31000.0, 9: 3500.0, 8: 550.0, 7: 105.0, 6: 25.0, 5: 6.0, 4: 4.0, 3: 3.0, 2: 2.5, 1: 2.0},
    12: {12: 2000000.0, 11: 75000.0, 10: 5500.0, 9: 2200.0, 8: 350.0, 7: 50.0, 6: 10.0, 5: 4.0, 4: 3.5, 3: 3.0, 2: 2.5, 1: 2.0},
}

PARA1_PAYOUTS = {
    2: {1: 3.0},
    3: {2: 7.5},
    4: {3: 20.0},
    5: {4: 80.0},
    6: {5: 280.0},
    7: {6: 1000.0},
    8: {7: 5200.0},
    9: {8: 24000.0},
}

PARA1_BONUS_PAYOUTS = {
    2: {1: 18.0},
    3: {2: 23.0},
    4: {3: 40.0},
    5: {4: 150.0},
    6: {5: 530.0},
    7: {6: 1300.0},
    8: {7: 7200.0},
    9: {8: 30000.0},
}

PARITY_STATES = ("odd", "even", "draw")
PARITY_MULTIPLIERS = {"odd": 2.0, "even": 2.0, "draw": 4.0}
P_DRAW = comb(40, 10) * comb(40, 10) / comb(80, 20)
P_PARITY = {"odd": (1 - P_DRAW) / 2, "even": (1 - P_DRAW) / 2, "draw": P_DRAW}
COLUMN_MULTIPLIER = 8.0
COLUMNS = tuple(range(1, 11))
SIDE_MARKETS = (
    ("odd/even", P_PARITY["odd"], 2.0 * P_PARITY["odd"], 2.0, 0.5),
    ("draw", P_PARITY["draw"], 4.0 * P_PARITY["draw"], 4.0, 0.25),
    ("column", 0.1, 0.1 * COLUMN_MULTIPLIER, COLUMN_MULTIPLIER, 0.125),
)


@dataclass(frozen=True)
class Draw:
    draw_id: int
    date: str
    time: str
    numbers: tuple[int, ...]
    number_set: frozenset[int]
    parity: str
    column: int


@dataclass
class StrategyResult:
    name: str
    market: str
    tickets: int
    actual_rtp: float
    expected_rtp: float
    excess_rtp: float
    z_score: float
    win_rate: float | None = None
    hit_rate: float | None = None
    extra: str = ""
    total_profit: float | None = None
    max_drawdown: float | None = None
    bet_rate: float | None = None


@dataclass(frozen=True)
class OfficialRtpRow:
    pick_size: int
    plain_rtp: float
    bonus_total_rtp: float
    bonus_addon_rtp: float
    para1_total_rtp: float | None
    para1_addon_rtp: float | None
    para1_bonus_total_rtp: float | None
    para1_bonus_incremental_rtp: float | None
    plain_win_prob: float
    bonus_win_prob: float
    para1_win_prob: float | None
    para1_bonus_win_prob: float | None


@dataclass(frozen=True)
class PatternReportRow:
    pattern: tuple[int | str, ...]
    train_count: int
    train_expected: float
    train_ratio: float
    train_z: float
    test_count: int
    test_expected: float
    test_ratio: float
    test_z: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", help="Path to the KINO CSV file.")
    parser.add_argument(
        "--pick-sizes",
        default="1,5,10",
        help="Comma-separated pick sizes to test for number heuristics (default: 1,5,10).",
    )
    parser.add_argument(
        "--hot-windows",
        default="20,100",
        help="Comma-separated rolling windows for hot/cold heuristics (default: 20,100).",
    )
    parser.add_argument(
        "--decision-only",
        action="store_true",
        help="Print only the compact decision summary for side markets and staking.",
    )
    parser.add_argument(
        "--bankroll",
        type=float,
        default=100.0,
        help="Bankroll to use in the decision summary (default: 100.0).",
    )
    parser.add_argument(
        "--base-stake",
        type=float,
        default=0.5,
        help="Base stake to use for flat-stake and doubling examples (default: 0.5).",
    )
    parser.add_argument(
        "--martingale-cycles",
        type=int,
        default=100,
        help="Number of doubling cycles for the ruin approximation in decision mode (default: 100).",
    )
    return parser.parse_args()


def load_draws(path: str) -> list[Draw]:
    draws: list[Draw] = []
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            numbers = tuple(int(row[f"d{i}"]) for i in range(20))
            draws.append(
                Draw(
                    draw_id=int(row["id"]),
                    date=row["date"],
                    time=row["tiodde"],
                    numbers=numbers,
                    number_set=frozenset(numbers),
                    parity=row["parity"],
                    column=int(row["col"]),
                )
            )
    return draws


def format_pct(value: float) -> str:
    return f"{100 * value:6.2f}%"


def exact_plus_bucket(age: int, exact_max: int) -> str:
    return str(age) if age <= exact_max else f"{exact_max + 1}+"


def range_bucket(age: int, edges: list[int]) -> str:
    lower = 0
    for upper in edges:
        if age <= upper:
            return f"{lower}-{upper}"
        lower = upper + 1
    return f"{lower}+"


def stable_top(items: Iterable[int], key_fn: Callable[[int], tuple[float, int]], limit: int) -> tuple[int, ...]:
    ranked = sorted(items, key=key_fn, reverse=True)
    return tuple(ranked[:limit])


def stable_bottom(items: Iterable[int], key_fn: Callable[[int], tuple[float, int]], limit: int) -> tuple[int, ...]:
    ranked = sorted(items, key=key_fn)
    return tuple(ranked[:limit])


def compute_max_drawdown(increments: Iterable[float]) -> float:
    cumulative = 0.0
    peak = 0.0
    max_drawdown = 0.0
    for increment in increments:
        cumulative += increment
        peak = max(peak, cumulative)
        max_drawdown = max(max_drawdown, peak - cumulative)
    return max_drawdown


def split_index(length: int, ratio: float = 0.8) -> int:
    return int(length * ratio)


def sequence_probabilities(sequence: list[int | str], states: Iterable[int | str]) -> dict[int | str, float]:
    counts = Counter(sequence)
    total = len(sequence)
    return {state: counts[state] / total for state in states}


def pattern_probability(pattern: tuple[int | str, ...], probs: dict[int | str, float]) -> float:
    probability = 1.0
    for state in pattern:
        probability *= probs[state]
    return probability


def pattern_stats(
    counter: Counter[tuple[int | str, ...]],
    probs: dict[int | str, float],
    pattern: tuple[int | str, ...],
    sample_size: int,
) -> tuple[int, float, float, float]:
    count = counter[pattern]
    probability = pattern_probability(pattern, probs)
    expected = sample_size * probability
    if expected <= 0.0:
        return count, expected, 0.0, 0.0
    variance = expected * (1.0 - probability)
    z_score = 0.0 if variance <= 0.0 else (count - expected) / math.sqrt(variance)
    ratio = count / expected
    return count, expected, ratio, z_score


def top_pattern_rows(
    sequence: list[int | str],
    states: Iterable[int | str],
    pattern_length: int,
    topn: int = 5,
) -> list[PatternReportRow]:
    train_end = split_index(len(sequence))
    train_seq = sequence[:train_end]
    test_seq = sequence[train_end:]
    train_probs = sequence_probabilities(train_seq, states)
    test_probs = sequence_probabilities(test_seq, states)
    train_counter = Counter(zip(*(train_seq[offset:] for offset in range(pattern_length))))
    test_counter = Counter(zip(*(test_seq[offset:] for offset in range(pattern_length))))
    train_sample_size = len(train_seq) - pattern_length + 1
    test_sample_size = len(test_seq) - pattern_length + 1

    ranked_patterns = []
    for pattern in train_counter:
        train_count, train_expected, train_ratio, train_z = pattern_stats(
            train_counter, train_probs, pattern, train_sample_size
        )
        ranked_patterns.append((train_z, pattern, train_count, train_expected, train_ratio))
    ranked_patterns.sort(key=lambda item: item[0], reverse=True)

    rows: list[PatternReportRow] = []
    for train_z, pattern, train_count, train_expected, train_ratio in ranked_patterns[:topn]:
        test_count, test_expected, test_ratio, test_z = pattern_stats(
            test_counter, test_probs, pattern, test_sample_size
        )
        rows.append(
            PatternReportRow(
                pattern=pattern,
                train_count=train_count,
                train_expected=train_expected,
                train_ratio=train_ratio,
                train_z=train_z,
                test_count=test_count,
                test_expected=test_expected,
                test_ratio=test_ratio,
                test_z=test_z,
            )
        )
    return rows


def format_pattern(pattern: tuple[int | str, ...]) -> str:
    return "-".join(str(part) for part in pattern)


def hit_probability(pick_size: int, hits: int) -> float:
    return comb(20, hits) * comb(60, pick_size - hits) / comb(80, pick_size)


def bonus_hit_probability(hits: int) -> float:
    return 0.0 if hits <= 0 else hits / 20.0


def theoretical_number_stats(pick_size: int) -> tuple[float, float]:
    payouts = NUMBER_PAYOUTS[pick_size]
    mean = 0.0
    second_moment = 0.0
    for hits in range(0, pick_size + 1):
        probability = hit_probability(pick_size, hits)
        payout = payouts.get(hits, 0.0)
        mean += payout * probability
        second_moment += payout * payout * probability
    variance = second_moment - mean * mean
    return mean, variance


def expected_plain_gross(pick_size: int) -> float:
    return theoretical_number_stats(pick_size)[0]


def expected_bonus_total_gross(pick_size: int) -> float:
    total = 0.0
    for hits in range(0, pick_size + 1):
        probability = hit_probability(pick_size, hits)
        bonus_probability = bonus_hit_probability(hits)
        total += probability * (
            bonus_probability * BONUS_PAYOUTS[pick_size].get(hits, 0.0)
            + (1.0 - bonus_probability) * NUMBER_PAYOUTS[pick_size].get(hits, 0.0)
        )
    return total


def expected_para1_total_gross(pick_size: int) -> float | None:
    if pick_size not in PARA1_PAYOUTS:
        return None

    second_category = pick_size - 1
    total = 0.0
    for hits in range(0, pick_size + 1):
        probability = hit_probability(pick_size, hits)
        payout = PARA1_PAYOUTS[pick_size][hits] if hits == second_category else NUMBER_PAYOUTS[pick_size].get(hits, 0.0)
        total += probability * payout
    return total


def expected_para1_bonus_total_gross(pick_size: int) -> float | None:
    if pick_size not in PARA1_PAYOUTS:
        return None

    second_category = pick_size - 1
    total = 0.0
    for hits in range(0, pick_size + 1):
        probability = hit_probability(pick_size, hits)
        bonus_probability = bonus_hit_probability(hits)
        if hits == second_category:
            payout_with_bonus = PARA1_BONUS_PAYOUTS[pick_size][hits]
            payout_without_bonus = PARA1_PAYOUTS[pick_size][hits]
        else:
            payout_with_bonus = BONUS_PAYOUTS[pick_size].get(hits, 0.0)
            payout_without_bonus = NUMBER_PAYOUTS[pick_size].get(hits, 0.0)
        total += probability * (
            bonus_probability * payout_with_bonus
            + (1.0 - bonus_probability) * payout_without_bonus
        )
    return total


def plain_win_probability(pick_size: int) -> float:
    total = 0.0
    for hits in range(0, pick_size + 1):
        if NUMBER_PAYOUTS[pick_size].get(hits, 0.0) > 0.0:
            total += hit_probability(pick_size, hits)
    return total


def bonus_total_win_probability(pick_size: int) -> float:
    total = 0.0
    for hits in range(0, pick_size + 1):
        probability = hit_probability(pick_size, hits)
        bonus_probability = bonus_hit_probability(hits)
        if NUMBER_PAYOUTS[pick_size].get(hits, 0.0) > 0.0:
            total += probability * (1.0 - bonus_probability)
        if BONUS_PAYOUTS[pick_size].get(hits, 0.0) > 0.0:
            total += probability * bonus_probability
    return total


def para1_total_win_probability(pick_size: int) -> float | None:
    if pick_size not in PARA1_PAYOUTS:
        return None
    return plain_win_probability(pick_size)


def para1_bonus_total_win_probability(pick_size: int) -> float | None:
    if pick_size not in PARA1_PAYOUTS:
        return None

    second_category = pick_size - 1
    total = 0.0
    for hits in range(0, pick_size + 1):
        probability = hit_probability(pick_size, hits)
        bonus_probability = bonus_hit_probability(hits)
        if hits == second_category:
            total += probability
            continue
        if NUMBER_PAYOUTS[pick_size].get(hits, 0.0) > 0.0:
            total += probability * (1.0 - bonus_probability)
        if BONUS_PAYOUTS[pick_size].get(hits, 0.0) > 0.0:
            total += probability * bonus_probability
    return total


def official_rtp_rows() -> list[OfficialRtpRow]:
    rows: list[OfficialRtpRow] = []
    for pick_size in range(1, 13):
        plain_gross = expected_plain_gross(pick_size)
        bonus_gross = expected_bonus_total_gross(pick_size)
        para1_gross = expected_para1_total_gross(pick_size)
        para1_bonus_gross = expected_para1_bonus_total_gross(pick_size)

        rows.append(
            OfficialRtpRow(
                pick_size=pick_size,
                plain_rtp=plain_gross,
                bonus_total_rtp=bonus_gross / 2.0,
                bonus_addon_rtp=bonus_gross - plain_gross,
                para1_total_rtp=None if para1_gross is None else para1_gross / 2.0,
                para1_addon_rtp=None if para1_gross is None else para1_gross - plain_gross,
                para1_bonus_total_rtp=None if para1_bonus_gross is None else para1_bonus_gross / 3.0,
                para1_bonus_incremental_rtp=None if para1_bonus_gross is None or para1_gross is None else para1_bonus_gross - para1_gross,
                plain_win_prob=plain_win_probability(pick_size),
                bonus_win_prob=bonus_total_win_probability(pick_size),
                para1_win_prob=para1_total_win_probability(pick_size),
                para1_bonus_win_prob=para1_bonus_total_win_probability(pick_size),
            )
        )
    return rows


def number_age_conditioning(draws: list[Draw]) -> list[tuple[str, int, float]]:
    last_seen = [None] * 81
    bucket_stats: dict[str, list[int]] = {}
    for idx, draw in enumerate(draws):
        current = draw.number_set
        for number in range(1, 81):
            if last_seen[number] is None:
                continue
            age = idx - last_seen[number] - 1
            bucket = exact_plus_bucket(age, 9)
            trials, hits = bucket_stats.setdefault(bucket, [0, 0])
            trials += 1
            if number in current:
                hits += 1
            bucket_stats[bucket] = [trials, hits]
        for number in current:
            last_seen[number] = idx
    ordered_buckets = [str(i) for i in range(10)] + ["10+"]
    return [
        (bucket, bucket_stats[bucket][0], bucket_stats[bucket][1] / bucket_stats[bucket][0])
        for bucket in ordered_buckets
        if bucket in bucket_stats
    ]


def event_age_conditioning(
    outcomes: list[int | str],
    states: Iterable[int | str],
    bucket_fn: Callable[[int], str],
) -> dict[int | str, list[tuple[str, int, float]]]:
    last_seen = {state: None for state in states}
    bucket_stats: dict[int | str, dict[str, list[int]]] = {state: {} for state in states}
    for idx, outcome in enumerate(outcomes):
        for state in states:
            if last_seen[state] is None:
                continue
            age = idx - last_seen[state] - 1
            bucket = bucket_fn(age)
            trials, hits = bucket_stats[state].setdefault(bucket, [0, 0])
            trials += 1
            if outcome == state:
                hits += 1
            bucket_stats[state][bucket] = [trials, hits]
        last_seen[outcome] = idx
    ordered: dict[int | str, list[tuple[str, int, float]]] = {}
    for state in states:
        items = []
        for bucket, (trials, hits) in bucket_stats[state].items():
            items.append((bucket, trials, hits / trials))
        ordered[state] = items
    return ordered


def evaluate_number_overdue(draws: list[Draw], pick_size: int, warmup: int = 200) -> StrategyResult:
    last_seen = [None] * 81
    for idx in range(warmup):
        for number in draws[idx].number_set:
            last_seen[number] = idx

    theoretical_mean, theoretical_var = theoretical_number_stats(pick_size)
    total_gross = 0.0
    total_hits = 0
    tickets = 0

    for idx in range(warmup, len(draws)):
        choices = stable_top(
            range(1, 81),
            lambda number: (
                float(idx) if last_seen[number] is None else float(idx - last_seen[number] - 1),
                -number,
            ),
            pick_size,
        )
        hits = len(draws[idx].number_set.intersection(choices))
        total_hits += hits
        total_gross += NUMBER_PAYOUTS[pick_size].get(hits, 0.0)
        tickets += 1
        for number in draws[idx].number_set:
            last_seen[number] = idx

    expected_total = tickets * theoretical_mean
    variance_total = tickets * theoretical_var
    z_score = 0.0 if variance_total <= 0 else (total_gross - expected_total) / math.sqrt(variance_total)
    return StrategyResult(
        name=f"numbers-overdue-pick{pick_size}",
        market="numbers",
        tickets=tickets,
        actual_rtp=total_gross / tickets,
        expected_rtp=theoretical_mean,
        excess_rtp=(total_gross / tickets) - theoretical_mean,
        z_score=z_score,
        hit_rate=total_hits / (tickets * pick_size),
    )


def evaluate_number_hot_cold(
    draws: list[Draw],
    pick_size: int,
    window: int,
    hottest: bool,
) -> StrategyResult:
    counts = Counter()
    window_draws: deque[tuple[int, ...]] = deque()
    for idx in range(window):
        numbers = draws[idx].numbers
        window_draws.append(numbers)
        counts.update(numbers)

    theoretical_mean, theoretical_var = theoretical_number_stats(pick_size)
    total_gross = 0.0
    total_hits = 0
    tickets = 0

    chooser = stable_top if hottest else stable_bottom
    label = "hot" if hottest else "cold"

    for idx in range(window, len(draws)):
        choices = chooser(range(1, 81), lambda number: (counts[number], -number), pick_size)
        hits = len(draws[idx].number_set.intersection(choices))
        total_hits += hits
        total_gross += NUMBER_PAYOUTS[pick_size].get(hits, 0.0)
        tickets += 1

        outgoing = window_draws.popleft()
        for number in outgoing:
            counts[number] -= 1
        incoming = draws[idx].numbers
        window_draws.append(incoming)
        counts.update(incoming)

    expected_total = tickets * theoretical_mean
    variance_total = tickets * theoretical_var
    z_score = 0.0 if variance_total <= 0 else (total_gross - expected_total) / math.sqrt(variance_total)
    return StrategyResult(
        name=f"numbers-{label}{window}-pick{pick_size}",
        market="numbers",
        tickets=tickets,
        actual_rtp=total_gross / tickets,
        expected_rtp=theoretical_mean,
        excess_rtp=(total_gross / tickets) - theoretical_mean,
        z_score=z_score,
        hit_rate=total_hits / (tickets * pick_size),
    )


def evaluate_parity_overdue(draws: list[Draw], warmup: int = 20) -> StrategyResult:
    last_seen = {state: None for state in PARITY_STATES}
    for idx in range(warmup):
        last_seen[draws[idx].parity] = idx

    total_gross = 0.0
    expected_total = 0.0
    variance_total = 0.0
    wins = 0
    tickets = 0
    choice_counter = Counter()

    for idx in range(warmup, len(draws)):
        choice = max(
            PARITY_STATES,
            key=lambda state: (
                float(idx) if last_seen[state] is None else float(idx - last_seen[state] - 1),
                PARITY_MULTIPLIERS[state],
                state == "draw",
            ),
        )
        choice_counter[choice] += 1
        probability = P_PARITY[choice]
        multiplier = PARITY_MULTIPLIERS[choice]
        expected_total += probability * multiplier
        variance_total += probability * multiplier * multiplier - (probability * multiplier) ** 2

        if draws[idx].parity == choice:
            wins += 1
            total_gross += multiplier
        tickets += 1
        last_seen[draws[idx].parity] = idx

    z_score = 0.0 if variance_total <= 0 else (total_gross - expected_total) / math.sqrt(variance_total)
    return StrategyResult(
        name="parity-overdue",
        market="parity",
        tickets=tickets,
        actual_rtp=total_gross / tickets,
        expected_rtp=expected_total / tickets,
        excess_rtp=(total_gross - expected_total) / tickets,
        z_score=z_score,
        win_rate=wins / tickets,
        extra=f"mix={dict(choice_counter)}",
    )


def evaluate_parity_hot(draws: list[Draw], window: int) -> StrategyResult:
    counts = Counter(draw.parity for draw in draws[:window])
    history: deque[str] = deque(draw.parity for draw in draws[:window])

    total_gross = 0.0
    expected_total = 0.0
    variance_total = 0.0
    wins = 0
    tickets = 0
    choice_counter = Counter()

    for idx in range(window, len(draws)):
        choice = max(
            PARITY_STATES,
            key=lambda state: (PARITY_MULTIPLIERS[state] * counts[state], PARITY_MULTIPLIERS[state]),
        )
        choice_counter[choice] += 1
        probability = P_PARITY[choice]
        multiplier = PARITY_MULTIPLIERS[choice]
        expected_total += probability * multiplier
        variance_total += probability * multiplier * multiplier - (probability * multiplier) ** 2

        if draws[idx].parity == choice:
            wins += 1
            total_gross += multiplier
        tickets += 1

        outgoing = history.popleft()
        counts[outgoing] -= 1
        incoming = draws[idx].parity
        history.append(incoming)
        counts[incoming] += 1

    z_score = 0.0 if variance_total <= 0 else (total_gross - expected_total) / math.sqrt(variance_total)
    return StrategyResult(
        name=f"parity-hot{window}",
        market="parity",
        tickets=tickets,
        actual_rtp=total_gross / tickets,
        expected_rtp=expected_total / tickets,
        excess_rtp=(total_gross - expected_total) / tickets,
        z_score=z_score,
        win_rate=wins / tickets,
        extra=f"mix={dict(choice_counter)}",
    )


def evaluate_parity_repeat(draws: list[Draw]) -> StrategyResult:
    total_gross = 0.0
    expected_total = 0.0
    variance_total = 0.0
    wins = 0
    tickets = 0
    choice_counter = Counter()

    for idx in range(1, len(draws)):
        choice = draws[idx - 1].parity
        choice_counter[choice] += 1
        probability = P_PARITY[choice]
        multiplier = PARITY_MULTIPLIERS[choice]
        expected_total += probability * multiplier
        variance_total += probability * multiplier * multiplier - (probability * multiplier) ** 2

        if draws[idx].parity == choice:
            wins += 1
            total_gross += multiplier
        tickets += 1

    z_score = 0.0 if variance_total <= 0 else (total_gross - expected_total) / math.sqrt(variance_total)
    return StrategyResult(
        name="parity-repeat-last",
        market="parity",
        tickets=tickets,
        actual_rtp=total_gross / tickets,
        expected_rtp=expected_total / tickets,
        excess_rtp=(total_gross - expected_total) / tickets,
        z_score=z_score,
        win_rate=wins / tickets,
        extra=f"mix={dict(choice_counter)}",
    )


def evaluate_column_overdue(draws: list[Draw], warmup: int = 50) -> StrategyResult:
    last_seen = {column: None for column in COLUMNS}
    for idx in range(warmup):
        last_seen[draws[idx].column] = idx

    total_gross = 0.0
    wins = 0
    tickets = 0
    choice_counter = Counter()
    expected_rtp = 0.1 * COLUMN_MULTIPLIER
    variance_per_ticket = 0.1 * COLUMN_MULTIPLIER * COLUMN_MULTIPLIER - expected_rtp**2

    for idx in range(warmup, len(draws)):
        choice = max(
            COLUMNS,
            key=lambda column: (
                float(idx) if last_seen[column] is None else float(idx - last_seen[column] - 1),
                -column,
            ),
        )
        choice_counter[choice] += 1
        if draws[idx].column == choice:
            wins += 1
            total_gross += COLUMN_MULTIPLIER
        tickets += 1
        last_seen[draws[idx].column] = idx

    expected_total = tickets * expected_rtp
    variance_total = tickets * variance_per_ticket
    z_score = 0.0 if variance_total <= 0 else (total_gross - expected_total) / math.sqrt(variance_total)
    return StrategyResult(
        name="column-overdue",
        market="column",
        tickets=tickets,
        actual_rtp=total_gross / tickets,
        expected_rtp=expected_rtp,
        excess_rtp=(total_gross / tickets) - expected_rtp,
        z_score=z_score,
        win_rate=wins / tickets,
        extra=f"mix={dict(choice_counter)}",
    )


def evaluate_column_hot(draws: list[Draw], window: int) -> StrategyResult:
    counts = Counter(draw.column for draw in draws[:window])
    history: deque[int] = deque(draw.column for draw in draws[:window])
    total_gross = 0.0
    wins = 0
    tickets = 0
    choice_counter = Counter()
    expected_rtp = 0.1 * COLUMN_MULTIPLIER
    variance_per_ticket = 0.1 * COLUMN_MULTIPLIER * COLUMN_MULTIPLIER - expected_rtp**2

    for idx in range(window, len(draws)):
        choice = max(COLUMNS, key=lambda column: (counts[column], -column))
        choice_counter[choice] += 1
        if draws[idx].column == choice:
            wins += 1
            total_gross += COLUMN_MULTIPLIER
        tickets += 1

        outgoing = history.popleft()
        counts[outgoing] -= 1
        incoming = draws[idx].column
        history.append(incoming)
        counts[incoming] += 1

    expected_total = tickets * expected_rtp
    variance_total = tickets * variance_per_ticket
    z_score = 0.0 if variance_total <= 0 else (total_gross - expected_total) / math.sqrt(variance_total)
    return StrategyResult(
        name=f"column-hot{window}",
        market="column",
        tickets=tickets,
        actual_rtp=total_gross / tickets,
        expected_rtp=expected_rtp,
        excess_rtp=(total_gross / tickets) - expected_rtp,
        z_score=z_score,
        win_rate=wins / tickets,
        extra=f"mix={dict(choice_counter)}",
    )


def evaluate_column_repeat(draws: list[Draw]) -> StrategyResult:
    total_gross = 0.0
    wins = 0
    tickets = 0
    choice_counter = Counter()
    expected_rtp = 0.1 * COLUMN_MULTIPLIER
    variance_per_ticket = 0.1 * COLUMN_MULTIPLIER * COLUMN_MULTIPLIER - expected_rtp**2

    for idx in range(1, len(draws)):
        choice = draws[idx - 1].column
        choice_counter[choice] += 1
        if draws[idx].column == choice:
            wins += 1
            total_gross += COLUMN_MULTIPLIER
        tickets += 1

    expected_total = tickets * expected_rtp
    variance_total = tickets * variance_per_ticket
    z_score = 0.0 if variance_total <= 0 else (total_gross - expected_total) / math.sqrt(variance_total)
    return StrategyResult(
        name="column-repeat-last",
        market="column",
        tickets=tickets,
        actual_rtp=total_gross / tickets,
        expected_rtp=expected_rtp,
        excess_rtp=(total_gross / tickets) - expected_rtp,
        z_score=z_score,
        win_rate=wins / tickets,
        extra=f"mix={dict(choice_counter)}",
    )


def evaluate_parity_age_gate(draws: list[Draw], target: str, threshold: int, warmup: int = 20) -> StrategyResult:
    last_seen = {state: None for state in PARITY_STATES}
    for idx in range(warmup):
        last_seen[draws[idx].parity] = idx

    total_gross = 0.0
    expected_total = 0.0
    variance_total = 0.0
    wins = 0
    tickets = 0
    increments: list[float] = []
    opportunities = len(draws) - warmup

    for idx in range(warmup, len(draws)):
        age = float(idx) if last_seen[target] is None else float(idx - last_seen[target] - 1)
        if age >= threshold:
            multiplier = PARITY_MULTIPLIERS[target]
            probability = P_PARITY[target]
            tickets += 1
            expected_total += probability * multiplier
            variance_total += probability * multiplier * multiplier - (probability * multiplier) ** 2
            if draws[idx].parity == target:
                wins += 1
                total_gross += multiplier
                increments.append(multiplier - 1.0)
            else:
                increments.append(-1.0)
        else:
            increments.append(0.0)
        last_seen[draws[idx].parity] = idx

    if tickets == 0:
        return StrategyResult(
            name=f"parity-age-{target}-{threshold}",
            market="parity-sweep",
            tickets=0,
            actual_rtp=0.0,
            expected_rtp=0.0,
            excess_rtp=0.0,
            z_score=0.0,
            win_rate=None,
            total_profit=0.0,
            max_drawdown=0.0,
            bet_rate=0.0,
        )

    z_score = 0.0 if variance_total <= 0 else (total_gross - expected_total) / math.sqrt(variance_total)
    return StrategyResult(
        name=f"parity-age-{target}-{threshold}",
        market="parity-sweep",
        tickets=tickets,
        actual_rtp=total_gross / tickets,
        expected_rtp=expected_total / tickets,
        excess_rtp=(total_gross - expected_total) / tickets,
        z_score=z_score,
        win_rate=wins / tickets,
        total_profit=total_gross - tickets,
        max_drawdown=compute_max_drawdown(increments),
        bet_rate=tickets / opportunities,
    )


def evaluate_parity_window_deficit(draws: list[Draw], target: str, window: int, z_threshold: float) -> StrategyResult:
    history: deque[str] = deque(draw.parity for draw in draws[:window])
    counts = Counter(history)
    total_gross = 0.0
    expected_total = 0.0
    variance_total = 0.0
    wins = 0
    tickets = 0
    increments: list[float] = []
    opportunities = len(draws) - window
    target_probability = P_PARITY[target]
    sigma = math.sqrt(window * target_probability * (1.0 - target_probability))

    for idx in range(window, len(draws)):
        expected_count = window * target_probability
        deficit_z = 0.0 if sigma == 0.0 else (expected_count - counts[target]) / sigma
        if deficit_z >= z_threshold:
            multiplier = PARITY_MULTIPLIERS[target]
            probability = P_PARITY[target]
            tickets += 1
            expected_total += probability * multiplier
            variance_total += probability * multiplier * multiplier - (probability * multiplier) ** 2
            if draws[idx].parity == target:
                wins += 1
                total_gross += multiplier
                increments.append(multiplier - 1.0)
            else:
                increments.append(-1.0)
        else:
            increments.append(0.0)

        outgoing = history.popleft()
        counts[outgoing] -= 1
        incoming = draws[idx].parity
        history.append(incoming)
        counts[incoming] += 1

    if tickets == 0:
        return StrategyResult(
            name=f"parity-window-{target}-{window}-z{z_threshold}",
            market="parity-sweep",
            tickets=0,
            actual_rtp=0.0,
            expected_rtp=0.0,
            excess_rtp=0.0,
            z_score=0.0,
            win_rate=None,
            total_profit=0.0,
            max_drawdown=0.0,
            bet_rate=0.0,
        )

    z_score = 0.0 if variance_total <= 0 else (total_gross - expected_total) / math.sqrt(variance_total)
    return StrategyResult(
        name=f"parity-window-{target}-{window}-z{z_threshold}",
        market="parity-sweep",
        tickets=tickets,
        actual_rtp=total_gross / tickets,
        expected_rtp=expected_total / tickets,
        excess_rtp=(total_gross - expected_total) / tickets,
        z_score=z_score,
        win_rate=wins / tickets,
        total_profit=total_gross - tickets,
        max_drawdown=compute_max_drawdown(increments),
        bet_rate=tickets / opportunities,
    )


def evaluate_column_age_gate(draws: list[Draw], threshold: int, warmup: int = 50) -> StrategyResult:
    last_seen = {column: None for column in COLUMNS}
    for idx in range(warmup):
        last_seen[draws[idx].column] = idx

    total_gross = 0.0
    wins = 0
    tickets = 0
    increments: list[float] = []
    opportunities = len(draws) - warmup
    expected_rtp = 0.1 * COLUMN_MULTIPLIER
    variance_per_ticket = 0.1 * COLUMN_MULTIPLIER * COLUMN_MULTIPLIER - expected_rtp**2

    for idx in range(warmup, len(draws)):
        ages = {
            column: (float(idx) if last_seen[column] is None else float(idx - last_seen[column] - 1))
            for column in COLUMNS
        }
        choice = max(COLUMNS, key=lambda column: (ages[column], -column))
        if ages[choice] >= threshold:
            tickets += 1
            if draws[idx].column == choice:
                wins += 1
                total_gross += COLUMN_MULTIPLIER
                increments.append(COLUMN_MULTIPLIER - 1.0)
            else:
                increments.append(-1.0)
        else:
            increments.append(0.0)
        last_seen[draws[idx].column] = idx

    if tickets == 0:
        return StrategyResult(
            name=f"column-age-oldest-{threshold}",
            market="column-sweep",
            tickets=0,
            actual_rtp=0.0,
            expected_rtp=0.0,
            excess_rtp=0.0,
            z_score=0.0,
            win_rate=None,
            total_profit=0.0,
            max_drawdown=0.0,
            bet_rate=0.0,
        )

    expected_total = tickets * expected_rtp
    variance_total = tickets * variance_per_ticket
    z_score = 0.0 if variance_total <= 0 else (total_gross - expected_total) / math.sqrt(variance_total)
    return StrategyResult(
        name=f"column-age-oldest-{threshold}",
        market="column-sweep",
        tickets=tickets,
        actual_rtp=total_gross / tickets,
        expected_rtp=expected_rtp,
        excess_rtp=(total_gross / tickets) - expected_rtp,
        z_score=z_score,
        win_rate=wins / tickets,
        total_profit=total_gross - tickets,
        max_drawdown=compute_max_drawdown(increments),
        bet_rate=tickets / opportunities,
    )


def evaluate_column_window_deficit(draws: list[Draw], window: int, z_threshold: float) -> StrategyResult:
    history: deque[int] = deque(draw.column for draw in draws[:window])
    counts = Counter(history)
    total_gross = 0.0
    wins = 0
    tickets = 0
    increments: list[float] = []
    opportunities = len(draws) - window
    probability = 0.1
    expected_count = window * probability
    sigma = math.sqrt(window * probability * (1.0 - probability))
    expected_rtp = probability * COLUMN_MULTIPLIER
    variance_per_ticket = probability * COLUMN_MULTIPLIER * COLUMN_MULTIPLIER - expected_rtp**2

    for idx in range(window, len(draws)):
        choice = min(COLUMNS, key=lambda column: (counts[column], column))
        deficit_z = 0.0 if sigma == 0.0 else (expected_count - counts[choice]) / sigma
        if deficit_z >= z_threshold:
            tickets += 1
            if draws[idx].column == choice:
                wins += 1
                total_gross += COLUMN_MULTIPLIER
                increments.append(COLUMN_MULTIPLIER - 1.0)
            else:
                increments.append(-1.0)
        else:
            increments.append(0.0)

        outgoing = history.popleft()
        counts[outgoing] -= 1
        incoming = draws[idx].column
        history.append(incoming)
        counts[incoming] += 1

    if tickets == 0:
        return StrategyResult(
            name=f"column-window-cold-{window}-z{z_threshold}",
            market="column-sweep",
            tickets=0,
            actual_rtp=0.0,
            expected_rtp=0.0,
            excess_rtp=0.0,
            z_score=0.0,
            win_rate=None,
            total_profit=0.0,
            max_drawdown=0.0,
            bet_rate=0.0,
        )

    expected_total = tickets * expected_rtp
    variance_total = tickets * variance_per_ticket
    z_score = 0.0 if variance_total <= 0 else (total_gross - expected_total) / math.sqrt(variance_total)
    return StrategyResult(
        name=f"column-window-cold-{window}-z{z_threshold}",
        market="column-sweep",
        tickets=tickets,
        actual_rtp=total_gross / tickets,
        expected_rtp=expected_rtp,
        excess_rtp=(total_gross / tickets) - expected_rtp,
        z_score=z_score,
        win_rate=wins / tickets,
        total_profit=total_gross - tickets,
        max_drawdown=compute_max_drawdown(increments),
        bet_rate=tickets / opportunities,
    )


def print_conditioning_table(title: str, baseline: float, rows: list[tuple[str, int, float]]) -> None:
    print(title)
    print(f"{'bucket':>8} {'trials':>12} {'hit_rate':>10} {'uplift':>10}")
    for bucket, trials, hit_rate in rows:
        print(f"{bucket:>8} {trials:12d} {format_pct(hit_rate):>10} {format_pct(hit_rate - baseline):>10}")
    print()


def print_strategy_table(title: str, results: list[StrategyResult]) -> None:
    print(title)
    print(
        f"{'strategy':<24} {'tickets':>8} {'actual':>10} {'expected':>10} "
        f"{'excess':>10} {'z':>7} {'win/hit':>10}"
    )
    for result in results:
        ratio = result.win_rate if result.win_rate is not None else result.hit_rate
        ratio_text = "   n/a   " if ratio is None else format_pct(ratio)
        print(
            f"{result.name:<24} {result.tickets:8d} {format_pct(result.actual_rtp):>10} "
            f"{format_pct(result.expected_rtp):>10} {format_pct(result.excess_rtp):>10} "
            f"{result.z_score:7.2f} {ratio_text:>10}"
        )
    print()


def format_optional_pct(value: float | None) -> str:
    return "    -    " if value is None else format_pct(value)


def print_official_economics(rows: list[OfficialRtpRow]) -> None:
    print("Official game economics from the payout tables")
    print(
        f"{'game':>4} {'plain':>10} {'bonus':>10} {'para1':>10} {'p1+bonus':>10} "
        f"{'plain win':>10} {'bonus win':>10}"
    )
    for row in rows:
        print(
            f"{row.pick_size:>4d} {format_pct(row.plain_rtp):>10} {format_pct(row.bonus_total_rtp):>10} "
            f"{format_optional_pct(row.para1_total_rtp):>10} {format_optional_pct(row.para1_bonus_total_rtp):>10} "
            f"{format_pct(row.plain_win_prob):>10} {format_pct(row.bonus_win_prob):>10}"
        )
    print()

    print("Incremental value of the add-ons on the extra stake only")
    print(f"{'game':>4} {'bonus add':>10} {'para1 add':>10} {'bonus on p1':>12}")
    for row in rows:
        print(
            f"{row.pick_size:>4d} {format_pct(row.bonus_addon_rtp):>10} "
            f"{format_optional_pct(row.para1_addon_rtp):>10} {format_optional_pct(row.para1_bonus_incremental_rtp):>12}"
        )
    print()


def print_filtered_sweep_table(title: str, results: list[StrategyResult], min_tickets: int = 200, limit: int = 8) -> None:
    filtered = [result for result in results if result.tickets >= min_tickets]
    filtered.sort(key=lambda result: (result.excess_rtp, result.z_score, result.tickets), reverse=True)
    print(title)
    print(
        f"{'strategy':<30} {'bets':>8} {'bet%':>8} {'actual':>10} {'expected':>10} "
        f"{'excess':>10} {'profit':>10} {'maxDD':>10} {'z':>7}"
    )
    for result in filtered[:limit]:
        bet_rate = "   n/a   " if result.bet_rate is None else format_pct(result.bet_rate)
        profit = "   n/a   " if result.total_profit is None else f"{result.total_profit:10.1f}"
        max_dd = "   n/a   " if result.max_drawdown is None else f"{result.max_drawdown:10.1f}"
        print(
            f"{result.name:<30} {result.tickets:8d} {bet_rate:>8} {format_pct(result.actual_rtp):>10} "
            f"{format_pct(result.expected_rtp):>10} {format_pct(result.excess_rtp):>10} "
            f"{profit} {max_dd} {result.z_score:7.2f}"
        )
    if not filtered:
        print("(no strategies met the minimum ticket count)")
    print()


def print_pattern_report(title: str, rows: list[PatternReportRow]) -> None:
    print(title)
    print(
        f"{'pattern':<16} {'train cnt':>10} {'train/exp':>10} {'train z':>8} "
        f"{'test cnt':>10} {'test/exp':>10} {'test z':>8}"
    )
    for row in rows:
        print(
            f"{format_pattern(row.pattern):<16} {row.train_count:10d} {row.train_ratio:10.3f} {row.train_z:8.2f} "
            f"{row.test_count:10d} {row.test_ratio:10.3f} {row.test_z:8.2f}"
        )
    if not rows:
        print("(no patterns)")
    print()


def strategy_target(result: StrategyResult) -> str | None:
    if result.name.startswith("parity-"):
        if "-draw-" in result.name:
            return "draw"
        if "-odd-" in result.name:
            return "odd"
        if "-even-" in result.name:
            return "even"
    if result.name.startswith("column-"):
        return "column"
    return None


def break_even_hit_rate(target: str) -> float:
    if target == "draw":
        return 0.25
    if target in {"odd", "even"}:
        return 0.5
    if target == "column":
        return 0.125
    raise ValueError(f"Unsupported target: {target}")


def select_best_result(
    results: list[StrategyResult],
    key_fn: Callable[[StrategyResult], float],
    min_tickets: int = 200,
    predicate: Callable[[StrategyResult], bool] | None = None,
    reverse: bool = True,
) -> StrategyResult | None:
    filtered = [result for result in results if result.tickets >= min_tickets]
    if predicate is not None:
        filtered = [result for result in filtered if predicate(result)]
    if not filtered:
        return None
    return max(filtered, key=key_fn) if reverse else min(filtered, key=key_fn)


def print_sweep_summary(title: str, results: list[StrategyResult], min_tickets: int = 200) -> None:
    print(title)

    best_rtp = select_best_result(results, key_fn=lambda result: result.actual_rtp, min_tickets=min_tickets)
    best_profit = select_best_result(
        results,
        key_fn=lambda result: float("-inf") if result.total_profit is None else result.total_profit,
        min_tickets=min_tickets,
    )
    lowest_drawdown = select_best_result(
        results,
        key_fn=lambda result: float("inf") if result.max_drawdown is None else result.max_drawdown,
        min_tickets=min_tickets,
        reverse=False,
    )

    def render_result(label: str, result: StrategyResult | None) -> None:
        if result is None:
            print(f"{label}: none")
            return
        bet_rate = "n/a" if result.bet_rate is None else format_pct(result.bet_rate)
        profit = "n/a" if result.total_profit is None else f"{result.total_profit:.1f}"
        max_dd = "n/a" if result.max_drawdown is None else f"{result.max_drawdown:.1f}"
        print(
            f"{label}: {result.name} | bets={result.tickets} | bet%={bet_rate} | "
            f"RTP={format_pct(result.actual_rtp)} | profit={profit} | maxDD={max_dd}"
        )

    render_result("best RTP", best_rtp)
    render_result("best profit", best_profit)
    render_result("lowest maxDD", lowest_drawdown)

    for target_label, predicate in (
        ("best odd/even hit gap", lambda result: strategy_target(result) in {"odd", "even"}),
        ("best draw hit gap", lambda result: strategy_target(result) == "draw"),
        ("best column hit gap", lambda result: strategy_target(result) == "column"),
    ):
        best_gap_result = select_best_result(
            results,
            key_fn=lambda result: float("-inf")
            if result.win_rate is None or strategy_target(result) is None
            else result.win_rate - break_even_hit_rate(strategy_target(result)),
            min_tickets=min_tickets,
            predicate=predicate,
        )
        if best_gap_result is None or best_gap_result.win_rate is None:
            print(f"{target_label}: none")
            continue
        target = strategy_target(best_gap_result)
        gap = best_gap_result.win_rate - break_even_hit_rate(target)
        print(
            f"{target_label}: {best_gap_result.name} | hit={format_pct(best_gap_result.win_rate)} | "
            f"break-even={format_pct(break_even_hit_rate(target))} | gap={format_pct(gap)}"
        )
    print()


def financed_martingale_losses(bankroll: float, base_stake: float) -> int:
    if bankroll <= 0.0 or base_stake <= 0.0:
        return 0

    losses = 0
    cumulative = 0.0
    next_stake = base_stake
    while cumulative + next_stake <= bankroll + 1e-12:
        cumulative += next_stake
        losses += 1
        next_stake *= 2.0
    return losses


def print_decision_summary(bankroll: float, base_stake: float, martingale_cycles: int) -> None:
    print("Decision summary for side markets")
    print(
        f"bankroll={bankroll:.2f} | base_stake={base_stake:.2f} | "
        f"martingale_cycles={martingale_cycles}"
    )
    print()

    best_hit = max(SIDE_MARKETS, key=lambda market: market[1])
    best_rtp = max(SIDE_MARKETS, key=lambda market: market[2])
    wealth_optimal = 0.0
    entertainment_cap = max(0.0, bankroll * 0.005)

    print(
        f"best hit-rate market = {best_hit[0]} | hit={format_pct(best_hit[1])} | "
        f"RTP={format_pct(best_hit[2])}"
    )
    print(
        f"best RTP market = {best_rtp[0]} | hit={format_pct(best_rtp[1])} | "
        f"RTP={format_pct(best_rtp[2])}"
    )
    print(f"wealth-optimal flat stake = {wealth_optimal:.2f}")
    print(
        f"forced-play entertainment cap = {entertainment_cap:.2f} "
        f"(0.5% of bankroll heuristic, not an edge)"
    )
    print()

    financed_losses = financed_martingale_losses(bankroll, base_stake)
    if financed_losses == 0:
        print("Bankroll is below the base stake, so a doubling plan cannot start.")
        print()
        return

    total_committed = base_stake * (2**financed_losses - 1)
    print(
        f"doubling plan can absorb {financed_losses} consecutive losses before bankroll exhaustion "
        f"(total committed {total_committed:.2f})"
    )
    print(
        f"{'market':<10} {'hit':>8} {'RTP':>10} {'cycle ruin':>12} {'{0} cycles ruin'.format(martingale_cycles):>16}"
    )
    for name, hit_rate, rtp, _multiplier, _break_even in SIDE_MARKETS:
        miss_rate = 1.0 - hit_rate
        cycle_ruin = miss_rate**financed_losses
        horizon_ruin = 1.0 - (1.0 - cycle_ruin) ** martingale_cycles
        print(
            f"{name:<10} {format_pct(hit_rate):>8} {format_pct(rtp):>10} "
            f"{format_pct(cycle_ruin):>12} {format_pct(horizon_ruin):>16}"
        )
    print()

    print("Break-even hit-rate gaps")
    for name, hit_rate, _rtp, _multiplier, break_even in SIDE_MARKETS:
        print(
            f"{name:<10} actual={format_pct(hit_rate)} | break-even={format_pct(break_even)} | "
            f"gap={format_pct(hit_rate - break_even)}"
        )
    print()


def main() -> None:
    args = parse_args()
    pick_sizes = [int(value.strip()) for value in args.pick_sizes.split(",") if value.strip()]
    hot_windows = [int(value.strip()) for value in args.hot_windows.split(",") if value.strip()]
    draws = load_draws(args.csv_path)
    parities = [draw.parity for draw in draws]
    columns = [draw.column for draw in draws]
    official_rows = official_rtp_rows()

    print(f"Loaded {len(draws):,} draws from {draws[0].date} to {draws[-1].date}")
    print(f"Source: {args.csv_path}")
    print()

    print_decision_summary(args.bankroll, args.base_stake, args.martingale_cycles)
    if args.decision_only:
        return

    print_official_economics(official_rows)

    best_total = max(
        (
            ("plain", row.pick_size, row.plain_rtp)
            for row in official_rows
        ),
        key=lambda item: item[2],
    )
    best_total = max(
        [best_total]
        + [("bonus", row.pick_size, row.bonus_total_rtp) for row in official_rows]
        + [("para1", row.pick_size, row.para1_total_rtp) for row in official_rows if row.para1_total_rtp is not None]
        + [("para1+bonus", row.pick_size, row.para1_bonus_total_rtp) for row in official_rows if row.para1_bonus_total_rtp is not None],
        key=lambda item: item[2],
    )
    best_addon = max(
        [("bonus", row.pick_size, row.bonus_addon_rtp) for row in official_rows]
        + [("para1", row.pick_size, row.para1_addon_rtp) for row in official_rows if row.para1_addon_rtp is not None]
        + [
            ("bonus-on-para1", row.pick_size, row.para1_bonus_incremental_rtp)
            for row in official_rows
            if row.para1_bonus_incremental_rtp is not None
        ],
        key=lambda item: item[2],
    )

    print("Best theoretical choices among the official number-pick variants")
    print(
        f"least-bad total ticket = {best_total[0]} on game {best_total[1]} "
        f"with RTP {format_pct(best_total[2])}"
    )
    print(
        f"best add-on only = {best_addon[0]} on game {best_addon[1]} "
        f"with RTP {format_pct(best_addon[2])} on the extra stake"
    )
    print()

    print_conditioning_table(
        "Number next-draw hit rate by age (baseline 25.00%)",
        0.25,
        number_age_conditioning(draws),
    )

    parity_conditioning = event_age_conditioning(
        parities,
        PARITY_STATES,
        lambda age: exact_plus_bucket(age, 5),
    )
    combined_majority_rows = []
    majority_a = {bucket: [0, 0.0] for bucket, _, _ in parity_conditioning["odd"]}
    for state in ("odd", "even"):
        for bucket, trials, hit_rate in parity_conditioning[state]:
            majority_a.setdefault(bucket, [0, 0.0])
            majority_a[bucket][0] += trials
            majority_a[bucket][1] += hit_rate * trials
    for bucket in [str(i) for i in range(6)] + ["6+"]:
        if bucket not in majority_a or majority_a[bucket][0] == 0:
            continue
        trials, weighted_hits = majority_a[bucket]
        combined_majority_rows.append((bucket, trials, weighted_hits / trials))
    print_conditioning_table(
        "Odd/even next-draw hit rate by age (baseline 39.84%)",
        P_PARITY["odd"],
        combined_majority_rows,
    )
    print_conditioning_table(
        "Draw next-draw hit rate by age (baseline 20.32%)",
        P_PARITY["draw"],
        [
            (bucket, trials, hit_rate)
            for bucket, trials, hit_rate in parity_conditioning["draw"]
            if bucket in [str(i) for i in range(6)] + ["6+"]
        ],
    )

    column_conditioning = event_age_conditioning(
        columns,
        COLUMNS,
        lambda age: range_bucket(age, [4, 9, 14]),
    )
    combined_column = {}
    for state in COLUMNS:
        for bucket, trials, hit_rate in column_conditioning[state]:
            combined_column.setdefault(bucket, [0, 0.0])
            combined_column[bucket][0] += trials
            combined_column[bucket][1] += hit_rate * trials
    print_conditioning_table(
        "Column next-draw hit rate by age (baseline 10.00%)",
        0.10,
        [
            (bucket, combined_column[bucket][0], combined_column[bucket][1] / combined_column[bucket][0])
            for bucket in ("0-4", "5-9", "10-14", "15+")
            if bucket in combined_column
        ],
    )

    print_pattern_report("Parity lag-1 patterns (train leaders, checked on test)", top_pattern_rows(parities, PARITY_STATES, 2))
    print_pattern_report("Parity lag-2 patterns (train leaders, checked on test)", top_pattern_rows(parities, PARITY_STATES, 3))
    print_pattern_report("Column lag-1 patterns (train leaders, checked on test)", top_pattern_rows(columns, COLUMNS, 2))
    print_pattern_report("Column lag-2 patterns (train leaders, checked on test)", top_pattern_rows(columns, COLUMNS, 3))

    number_results: list[StrategyResult] = []
    for pick_size in pick_sizes:
        number_results.append(evaluate_number_overdue(draws, pick_size))
        for window in hot_windows:
            number_results.append(evaluate_number_hot_cold(draws, pick_size, window, hottest=True))
            number_results.append(evaluate_number_hot_cold(draws, pick_size, window, hottest=False))
    print_strategy_table("Number strategy backtest", number_results)

    parity_results = [evaluate_parity_overdue(draws), evaluate_parity_repeat(draws)]
    for window in hot_windows:
        parity_results.append(evaluate_parity_hot(draws, window))
    print_strategy_table("Parity strategy backtest", parity_results)

    column_results = [evaluate_column_overdue(draws), evaluate_column_repeat(draws)]
    for window in hot_windows:
        column_results.append(evaluate_column_hot(draws, window))
    print_strategy_table("Column strategy backtest", column_results)

    parity_age_sweep = []
    for threshold in range(1, 13):
        parity_age_sweep.append(evaluate_parity_age_gate(draws, "draw", threshold))
    for threshold in range(1, 8):
        parity_age_sweep.append(evaluate_parity_age_gate(draws, "odd", threshold))
        parity_age_sweep.append(evaluate_parity_age_gate(draws, "even", threshold))
    parity_sweeps = parity_age_sweep[:]
    print_filtered_sweep_table("Parity age-threshold sweep", parity_age_sweep)

    parity_window_sweep = []
    for window in (25, 50, 100, 200):
        for z_threshold in (0.5, 1.0, 1.5, 2.0):
            for target in PARITY_STATES:
                parity_window_sweep.append(evaluate_parity_window_deficit(draws, target, window, z_threshold))
    parity_sweeps.extend(parity_window_sweep)
    print_filtered_sweep_table("Parity rolling-deficit sweep", parity_window_sweep)
    print_sweep_summary("Parity sweep summary", parity_sweeps)

    column_age_sweep = [evaluate_column_age_gate(draws, threshold) for threshold in range(5, 21)]
    column_sweeps = column_age_sweep[:]
    print_filtered_sweep_table("Column age-threshold sweep", column_age_sweep)

    column_window_sweep = []
    for window in (25, 50, 100, 200):
        for z_threshold in (0.5, 1.0, 1.5, 2.0):
            column_window_sweep.append(evaluate_column_window_deficit(draws, window, z_threshold))
    column_sweeps.extend(column_window_sweep)
    print_filtered_sweep_table("Column rolling-deficit sweep", column_window_sweep)
    print_sweep_summary("Column sweep summary", column_sweeps)

    all_results = number_results + parity_results + column_results
    best = max(all_results, key=lambda result: result.excess_rtp)
    worst = min(all_results, key=lambda result: result.excess_rtp)
    print("Extremes among tested heuristics")
    print(
        f"best  = {best.name} | actual {format_pct(best.actual_rtp)} vs expected {format_pct(best.expected_rtp)} "
        f"| excess {format_pct(best.excess_rtp)} | z={best.z_score:.2f}"
    )
    print(
        f"worst = {worst.name} | actual {format_pct(worst.actual_rtp)} vs expected {format_pct(worst.expected_rtp)} "
        f"| excess {format_pct(worst.excess_rtp)} | z={worst.z_score:.2f}"
    )


if __name__ == "__main__":
    main()
