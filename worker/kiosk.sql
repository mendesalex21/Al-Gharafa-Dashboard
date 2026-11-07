-- The players' wellness and RPE answers (Cloudflare D1 "al-gharafa-kiosk", binding KIOSK), one row per date + player
-- as in the old Google pages; player_id = the kiosk id (the Players sheet maps it to the site's id).
-- mirrored = 0 until the row is copied to the Google sheet (CheckIns / RPE) for the physical coach.
CREATE TABLE IF NOT EXISTS checkins (date TEXT NOT NULL, player_id TEXT NOT NULL, player_name TEXT, fatigue REAL, soreness REAL,
  sleep REAL, energy REAL, recovery REAL, average REAL, ts TEXT, mirrored INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (date, player_id));
CREATE TABLE IF NOT EXISTS rpe (date TEXT NOT NULL, player_id TEXT NOT NULL, player_name TEXT, rpe REAL, ts TEXT, by TEXT,
  mirrored INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (date, player_id));
-- The injuries' medical details entered on Workload › Injuries (health data: medical staff and admin only), one row per
-- player + day of the injury; days = days out for an injury under 5 days (the longer ones come from the GPS statuses).
CREATE TABLE IF NOT EXISTS injuries (pid TEXT NOT NULL, date TEXT NOT NULL, days INTEGER, type TEXT, region TEXT, side TEXT, onset TEXT,
  mechanism TEXT, place TEXT, severity TEXT, recur TEXT, by TEXT, ts TEXT, PRIMARY KEY (pid, date));
