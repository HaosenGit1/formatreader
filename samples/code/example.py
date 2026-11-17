#!/usr/bin/env python3
"""Read turbine data and print the average power."""
import csv


def average_power(path: str) -> float:
    with open(path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    values = [float(r["Power (kW)"]) for r in rows]
    return sum(values) / len(values)  # 平均功率


if __name__ == "__main__":
    print(f"{average_power('report.csv'):.1f} kW")
