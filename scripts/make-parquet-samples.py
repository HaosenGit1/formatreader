"""Writes small Parquet samples (made-up wind-turbine SCADA readings) with pyarrow.

Run in an environment that has pyarrow: python3 scripts/make-parquet-samples.py
"""
import datetime as dt
import random

import pyarrow as pa
import pyarrow.parquet as pq

random.seed(7)
n = 3000
t0 = dt.datetime(2026, 1, 1)
table = pa.table({
    'timestamp': pa.array([t0 + dt.timedelta(minutes=10 * i) for i in range(n)], pa.timestamp('ms')),
    'turbine': pa.array([f'WTG{i % 12 + 1:02d}' for i in range(n)]).dictionary_encode(),
    'wind_speed_ms': pa.array([round(random.uniform(2, 18), 2) for _ in range(n)], pa.float32()),
    'power_kw': pa.array([round(random.uniform(0, 3000), 1) for _ in range(n)]),
    'energy_kwh': pa.array([i * 412 for i in range(n)], pa.int64()),
    'available': pa.array([random.random() > 0.03 for _ in range(n)]),
    'alarm_code': pa.array([None if random.random() > 0.05 else random.choice([101, 2203, 4410]) for _ in range(n)], pa.int32()),
    'note': pa.array(['风机正常' if i % 500 == 0 else None for i in range(n)]),
    'tags': pa.array([['grid', 'yaw'] if i % 700 == 0 else [] for i in range(n)], pa.list_(pa.string())),
})
pq.write_table(table, 'samples/parquet/scada-10min-snappy.parquet', compression='snappy', row_group_size=1000)
pq.write_table(table.slice(0, 500), 'samples/parquet/scada-10min-zstd.parquet', compression='zstd')
pq.write_table(table.slice(0, 500), 'samples/parquet/scada-10min-gzip.parquet', compression='gzip')
