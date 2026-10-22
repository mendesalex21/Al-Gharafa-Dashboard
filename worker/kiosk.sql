-- The players' wellness and RPE answers (Cloudflare D1 "al-gharafa-kiosk", binding KIOSK), one row per date + player
-- as in the old Google pages; player_id = the kiosk id (the Players sheet maps it to the site's id).
-- mirrored = 0 until the row is copied to the Google sheet (CheckIns / RPE) for the physical coach.
CREATE TABLE IF NOT EXISTS checkins (date TEXT NOT NULL, player_id TEXT NOT NULL, player_name TEXT, fatigue REAL, soreness REAL,
  sleep REAL, energy REAL, recovery REAL, average REAL, ts TEXT, mirrored INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (date, player_id));
CREATE TABLE IF NOT EXISTS rpe (date TEXT NOT NULL, player_id TEXT NOT NULL, player_name TEXT, rpe REAL, ts TEXT, by TEXT,
  mirrored INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (date, player_id));
