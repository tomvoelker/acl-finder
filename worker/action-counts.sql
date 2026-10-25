-- Last seven days. Sampling weights preserve estimated totals at higher volume.
SELECT
  blob1 AS action,
  SUM(_sample_interval * double1) AS count
FROM emnlp_finder_events
WHERE timestamp >= NOW() - INTERVAL '7' DAY
GROUP BY action
ORDER BY count DESC
