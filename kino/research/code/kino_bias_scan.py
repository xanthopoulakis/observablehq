#!/usr/bin/env python3
"""Scan exact-number and exact-pair frequency biases with walk-forward validation.

The script searches for small persistent deviations from fair KINO frequencies:
- single-number appearance rates
- pair co-appearance rates

For each rolling train/test segment it:
1. Computes one-sided z-scores for positive frequency excess.
2. Applies Benjamini-Hochberg FDR correction.
3. Selects the top train number and top train pair.
4. Measures whether they stay elevated on the next unseen test block.
5. Converts them into pick-1 / pick-2 RTP on the test block.
"""

from __future__ import annotations

import argparse
import csv
import math
import statistics
from pathlib import Path

from kino_backtest import NUMBER_PAYOUTS, load_draws


NUMBERS = tuple(range(1, 81))
PAIRS = [(a, b) for a in range(1, 81) for b in range(a + 1, 81)]
PAIR_COUNT = len(PAIRS)
NUMBER_STAKE = 0.50
PAIR_STAKE = 0.50
NUMBER_P = 20 / 80
PAIR_P = (20 / 80) * (19 / 79)


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
        help="Output directory. Defaults to <script_dir>/simulation_outputs/bias_scan.",
    )
    parser.add_argument(
        "--train-draws",
        type=int,
        default=20000,
        help="Training-window size (default: 20000).",
    )
    parser.add_argument(
        "--test-draws",
        type=int,
        default=5000,
        help="Test-block size (default: 5000).",
    )
    parser.add_argument(
        "--step-draws",
        type=int,
        default=5000,
        help="Walk-forward step size (default: 5000).",
    )
    parser.add_argument(
        "--fdr-alpha",
        type=float,
        default=0.05,
        help="Benjamini-Hochberg target FDR level (default: 0.05).",
    )
    return parser.parse_args()


def resolve_csv_path(args: argparse.Namespace) -> Path:
    if args.csv_path:
        return Path(args.csv_path).expanduser().resolve()
    return Path(__file__).resolve().parent / "kino.csv"


def resolve_outdir(args: argparse.Namespace) -> Path:
    if args.outdir:
        return Path(args.outdir).expanduser().resolve()
    return Path(__file__).resolve().parent / "simulation_outputs" / "bias_scan"


def generate_segments(total_draws: int, train_draws: int, test_draws: int, step_draws: int):
    if min(train_draws, test_draws, step_draws) <= 0:
        raise ValueError("train/test/step draws must all be positive")
    segments = []
    start = 0
    segment_id = 1
    while start + train_draws < total_draws:
        train_start = start
        train_end = start + train_draws
        test_start = train_end
        test_end = min(test_start + test_draws, total_draws)
        if test_end <= test_start:
            break
        segments.append((segment_id, train_start, train_end, test_start, test_end))
        if test_end == total_draws:
            break
        start += step_draws
        segment_id += 1
    return segments


def pair_index(a: int, b: int) -> int:
    return (a - 1) * 80 - ((a - 1) * a) // 2 + (b - a - 1)


def count_window(draws) -> tuple[list[int], list[int]]:
    number_counts = [0] * 81
    pair_counts = [0] * PAIR_COUNT
    for draw in draws:
        ordered = sorted(draw.number_set)
        for number in ordered:
            number_counts[number] += 1
        for i in range(19):
            a = ordered[i]
            for j in range(i + 1, 20):
                b = ordered[j]
                pair_counts[pair_index(a, b)] += 1
    return number_counts, pair_counts


def z_score(count: int, draws_count: int, probability: float) -> float:
    variance = draws_count * probability * (1.0 - probability)
    if variance <= 0.0:
        return 0.0
    return (count - draws_count * probability) / math.sqrt(variance)


def upper_tail_p(z: float) -> float:
    return 0.5 * math.erfc(z / math.sqrt(2.0))


def benjamini_hochberg(p_values: list[float], alpha: float) -> list[bool]:
    indexed = sorted(enumerate(p_values), key=lambda item: item[1])
    threshold_rank = -1
    m = len(p_values)
    for rank, (_idx, p_value) in enumerate(indexed, start=1):
        if p_value <= alpha * rank / m:
            threshold_rank = rank
    significant = [False] * m
    if threshold_rank == -1:
        return significant
    cutoff = indexed[threshold_rank - 1][1]
    for index, p_value in enumerate(p_values):
        significant[index] = p_value <= cutoff
    return significant


def test_number_rtp(number: int, draws) -> tuple[int, float, float]:
    hits = sum(1 for draw in draws if number in draw.number_set)
    gross = NUMBER_STAKE * NUMBER_PAYOUTS[1][1] * hits
    total_stake = NUMBER_STAKE * len(draws)
    return hits, gross / total_stake, gross - total_stake


def test_pair_rtp(pair: tuple[int, int], draws) -> tuple[int, int, float, float]:
    single_hits = 0
    double_hits = 0
    a, b = pair
    for draw in draws:
        hits = int(a in draw.number_set) + int(b in draw.number_set)
        if hits == 1:
            single_hits += 1
        elif hits == 2:
            double_hits += 1
    gross = NUMBER_STAKE * (NUMBER_PAYOUTS[2].get(1, 0.0) * single_hits + NUMBER_PAYOUTS[2].get(2, 0.0) * double_hits)
    total_stake = NUMBER_STAKE * len(draws)
    return single_hits, double_hits, gross / total_stake, gross - total_stake


def summarize_segments(rows: list[dict[str, object]], key: str) -> dict[str, object]:
    test_z_key = f"{key}_test_z"
    profit_key = f"{key}_test_profit"
    rtp_key = f"{key}_test_rtp"
    sig_key = f"{key}_train_sig_count"
    positive_tests = sum(float(row[test_z_key]) > 0.0 for row in rows)
    profitable_tests = sum(float(row[profit_key]) > 0.0 for row in rows)
    return {
        "scan": key,
        "segments": len(rows),
        "avg_train_sig_count": round(statistics.fmean(float(row[sig_key]) for row in rows), 4),
        "avg_test_z": round(statistics.fmean(float(row[test_z_key]) for row in rows), 4),
        "positive_test_z_segments": positive_tests,
        "positive_test_z_pct": round(positive_tests / len(rows), 4),
        "avg_test_rtp": round(statistics.fmean(float(row[rtp_key]) for row in rows), 6),
        "profitable_test_segments": profitable_tests,
        "profitable_test_pct": round(profitable_tests / len(rows), 4),
        "total_test_profit": round(sum(float(row[profit_key]) for row in rows), 4),
    }


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    if not rows:
        return
    fieldnames = list(rows[0].keys())
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
    segments = generate_segments(len(draws), args.train_draws, args.test_draws, args.step_draws)

    segment_rows: list[dict[str, object]] = []
    for segment_id, train_start, train_end, test_start, test_end in segments:
        train_draws = draws[train_start:train_end]
        test_draws = draws[test_start:test_end]
        train_n = len(train_draws)
        test_n = len(test_draws)

        train_number_counts, train_pair_counts = count_window(train_draws)
        test_number_counts, test_pair_counts = count_window(test_draws)

        number_z = [z_score(train_number_counts[number], train_n, NUMBER_P) for number in NUMBERS]
        number_p = [upper_tail_p(z) for z in number_z]
        number_sig = benjamini_hochberg(number_p, args.fdr_alpha)
        top_number = max(NUMBERS, key=lambda number: (number_z[number - 1], -number))

        pair_z = [z_score(train_pair_counts[index], train_n, PAIR_P) for index in range(PAIR_COUNT)]
        pair_p = [upper_tail_p(z) for z in pair_z]
        pair_sig = benjamini_hochberg(pair_p, args.fdr_alpha)
        top_pair_index = max(range(PAIR_COUNT), key=lambda index: (pair_z[index], -index))
        top_pair = PAIRS[top_pair_index]

        number_test_count = test_number_counts[top_number]
        number_test_z = z_score(number_test_count, test_n, NUMBER_P)
        number_hits, number_test_rtp, number_test_profit = test_number_rtp(top_number, test_draws)

        pair_test_count = test_pair_counts[top_pair_index]
        pair_test_z = z_score(pair_test_count, test_n, PAIR_P)
        pair_single_hits, pair_double_hits, pair_test_rtp, pair_test_profit = test_pair_rtp(top_pair, test_draws)

        segment_rows.append(
            {
                "segment": segment_id,
                "train_start": train_start + 1,
                "train_end": train_end,
                "test_start": test_start + 1,
                "test_end": test_end,
                "number_train_sig_count": sum(number_sig),
                "number_top": top_number,
                "number_train_count": train_number_counts[top_number],
                "number_train_z": round(number_z[top_number - 1], 6),
                "number_train_sig": number_sig[top_number - 1],
                "number_test_count": number_test_count,
                "number_test_z": round(number_test_z, 6),
                "number_test_hits": number_hits,
                "number_test_rtp": round(number_test_rtp, 6),
                "number_test_profit": round(number_test_profit, 4),
                "pair_train_sig_count": sum(pair_sig),
                "pair_top": f"{top_pair[0]}-{top_pair[1]}",
                "pair_train_count": train_pair_counts[top_pair_index],
                "pair_train_z": round(pair_z[top_pair_index], 6),
                "pair_train_sig": pair_sig[top_pair_index],
                "pair_test_count": pair_test_count,
                "pair_test_z": round(pair_test_z, 6),
                "pair_test_single_hits": pair_single_hits,
                "pair_test_double_hits": pair_double_hits,
                "pair_test_rtp": round(pair_test_rtp, 6),
                "pair_test_profit": round(pair_test_profit, 4),
            }
        )

    summary_rows = [
        summarize_segments(segment_rows, "number"),
        summarize_segments(segment_rows, "pair"),
    ]

    write_csv(outdir / "segment_scan.csv", segment_rows)
    write_csv(outdir / "summary.csv", summary_rows)

    print(f"Loaded {len(draws):,} draws from {csv_path}")
    print(
        f"Walk-forward segments: {len(segments)} | train={args.train_draws} | "
        f"test={args.test_draws} | step={args.step_draws} | FDR={args.fdr_alpha:.3f}"
    )
    for row in summary_rows:
        print(
            f"{row['scan']}: avg train sig={row['avg_train_sig_count']}, avg test z={row['avg_test_z']}, "
            f"avg test RTP={100*row['avg_test_rtp']:.2f}%, total test profit={row['total_test_profit']:.2f}"
        )
    best_number = max(segment_rows, key=lambda row: float(row["number_test_profit"]))
    best_pair = max(segment_rows, key=lambda row: float(row["pair_test_profit"]))
    print(
        f"Best test number segment: seg {best_number['segment']} | num {best_number['number_top']} | "
        f"test z={best_number['number_test_z']} | RTP={100*float(best_number['number_test_rtp']):.2f}% | "
        f"profit={best_number['number_test_profit']:.2f}"
    )
    print(
        f"Best test pair segment: seg {best_pair['segment']} | pair {best_pair['pair_top']} | "
        f"test z={best_pair['pair_test_z']} | RTP={100*float(best_pair['pair_test_rtp']):.2f}% | "
        f"profit={best_pair['pair_test_profit']:.2f}"
    )
    print(f"Outputs written to {outdir}")


if __name__ == "__main__":
    main()
