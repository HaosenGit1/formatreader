-- SQL sample: daily energy per turbine
SELECT turbine_id,
       DATE(ts)            AS day,
       SUM(power_kw) / 6.0 AS energy_kwh   -- 10-minute data
FROM   scada_10min
WHERE  ts >= CURRENT_DATE - INTERVAL '7 days'
GROUP  BY turbine_id, DATE(ts)
ORDER  BY day, turbine_id;
