"""Generate reference JSON once with SciPy, never during package tests.

Run with an isolated Python environment containing SciPy. The fixture records
the installed versions so a future refresh remains explicit and reviewable.
"""

import json
from pathlib import Path

import numpy as np
import scipy
from scipy import stats


def pearson_case(name, predictor, outcome):
    result = stats.pearsonr(predictor, outcome)
    interval = result.confidence_interval(confidence_level=0.95)
    return {
        "name": name,
        "predictor": list(predictor),
        "outcome": list(outcome),
        "coefficient": float(result.statistic),
        "confidenceInterval": {"lower": float(interval.low), "upper": float(interval.high)},
    }


def binary_case(name, group_zero, group_one):
    predictor = [0] * len(group_zero) + [1] * len(group_one)
    outcome = list(group_zero) + list(group_one)
    result = stats.ttest_ind(group_one, group_zero, equal_var=False)
    interval = result.confidence_interval(confidence_level=0.95)
    variance_zero = np.var(group_zero, ddof=1)
    variance_one = np.var(group_one, ddof=1)
    return {
        "name": name,
        "groupZero": list(group_zero),
        "groupOne": list(group_one),
        "coefficient": float(stats.pointbiserialr(predictor, outcome).statistic),
        "groupZeroMean": float(np.mean(group_zero)),
        "groupOneMean": float(np.mean(group_one)),
        "difference": float(np.mean(group_one) - np.mean(group_zero)),
        "standardError": float(np.sqrt(variance_zero / len(group_zero) + variance_one / len(group_one))),
        "degreesOfFreedom": float(result.df),
        "confidenceInterval": {"lower": float(interval.low), "upper": float(interval.high)},
    }


def main():
    continuous = [
        pearson_case("negative-seven-observations", [1, 2, 3, 4, 5, 6, 7], [10, 9, 2.5, 6, 4, 3, 2]),
        pearson_case("positive-fourteen-observations", list(range(14)), [3, 2, 4, 6, 5, 8, 7, 10, 9, 10, 13, 11, 14, 12]),
        pearson_case("zero-correlation", [-3, -2, -1, 0, 1, 2, 3], [9, 4, 1, 0, 1, 4, 9]),
        pearson_case("perfect-positive", list(range(7)), list(range(7))),
        pearson_case("perfect-negative", list(range(7)), list(range(6, -1, -1))),
        pearson_case("large-scale", [1e100 * value for value in range(1, 8)], [1e100 * value for value in [7, 3, 4, 2, 5, 1, 6]]),
    ]
    binary = [
        binary_case("five-per-group", [0, 1, 0, 2, 1], [2, 4, 1, 3, 3]),
        binary_case("unequal-variance-and-sample-count", [0, 1, 0, 1, 2], [0, 8, 1, 5, 12, 3, 10]),
        binary_case("negative-difference", [5, 6, 4, 8, 7], [1, 0, 2, 1, 3]),
        binary_case("one-constant-group", [2, 2, 2, 2, 2], [1, 2, 3, 4, 5]),
        binary_case("two-per-group", [0, 1], [1, 9]),
        binary_case("equal-means", [0, 1, 2, 3, 4], [0, 2, 2, 2, 4]),
        binary_case("thirty-day-window", list(range(15)), [value / 3 for value in range(15)]),
    ]
    rng = np.random.default_rng(20261004)
    for index in range(12):
        size = 7 + index
        predictor = rng.uniform(0, 120, size=size)
        outcome = predictor / 40 + rng.normal(0, 3, size=size)
        continuous.append(pearson_case(f"seeded-continuous-{index}", predictor.tolist(), outcome.tolist()))
        zero = rng.normal(2, 0.5 + index, size=5 + index)
        one = rng.normal(3, 1 + index / 2, size=5 + index % 7)
        binary.append(binary_case(f"seeded-binary-{index}", zero.tolist(), one.tolist()))
    fixture = {
        "reference": {
            "implementation": "SciPy",
            "scipyVersion": scipy.__version__,
            "numpyVersion": np.__version__,
            "confidenceLevel": 0.95,
            "differenceOrientation": "groupOne-minus-groupZero",
            "generator": "scripts/generate-statistics-fixtures.py",
            "pearsonDocumentation": "https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.pearsonr.html",
            "pointBiserialDocumentation": "https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.pointbiserialr.html",
            "welchDocumentation": "https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.ttest_ind.html",
        },
        "continuous": continuous,
        "binary": binary,
    }
    output = Path(__file__).resolve().parents[1] / "packages/domain/test/fixtures/statistics.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(fixture, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Generated {len(continuous)} continuous and {len(binary)} binary SciPy fixtures at {output}")


if __name__ == "__main__":
    main()
