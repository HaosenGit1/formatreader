"""Generates samples/db/wind-farm.sqlite (run: python3 scripts/make-db-samples.py)."""
import os, sqlite3, random
path = os.path.join(os.path.dirname(__file__), '..', 'samples', 'db', 'wind-farm.sqlite')
if os.path.exists(path):
    os.remove(path)
db = sqlite3.connect(path)
db.executescript('''
CREATE TABLE turbines (id TEXT PRIMARY KEY, model TEXT, rated_kw INTEGER, site TEXT, commissioned DATE);
CREATE TABLE readings (ts TEXT, turbine_id TEXT REFERENCES turbines(id), power_kw REAL, wind_ms REAL, status TEXT);
CREATE TABLE events (id INTEGER PRIMARY KEY, turbine_id TEXT, ts TEXT, message TEXT);
CREATE VIEW daily_energy AS SELECT turbine_id, substr(ts, 1, 10) AS day, round(sum(power_kw) / 6.0, 1) AS kwh FROM readings GROUP BY 1, 2;
''')
db.executemany('INSERT INTO turbines VALUES (?,?,?,?,?)', [
    ('WTG-01', 'GW155-4.5', 4500, '风场 A', '2023-06-01'),
    ('WTG-02', 'GW155-4.5', 4500, '风场 A', '2023-06-15'),
    ('WTG-03', 'V150-4.2', 4200, 'Site B', '2024-02-20'),
])
random.seed(1)
rows = []
for i in range(600):
    t = ['WTG-01', 'WTG-02', 'WTG-03'][i % 3]
    wind = round(random.uniform(3, 14), 2)
    rows.append((f'2026-10-{1 + i // 144:02d} {(i // 6) % 24:02d}:{(i % 6) * 10:02d}', t, round(min(4500, wind ** 3 * 1.6), 1), wind, 'Running' if t != 'WTG-03' or i < 300 else 'Stopped 停机'))
db.executemany('INSERT INTO readings VALUES (?,?,?,?,?)', rows)
db.executemany('INSERT INTO events (turbine_id, ts, message) VALUES (?,?,?)', [
    ('WTG-03', '2026-10-03 02:10', 'Gearbox oil temperature high 齿轮箱油温过高'),
    ('WTG-03', '2026-10-03 02:40', 'Stopped by protection 保护停机'),
])
db.commit()
db.close()
print('written', os.path.abspath(path))
