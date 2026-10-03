/**
 * Session Plan — StatSports exports (S##_Full.csv, S##_Drills.csv) → rows in the club's Excel format
 * (Data_Full / Data_Drills: same columns, same order, same rounding). Pure functions: also run by Node to check them
 * against the season's Excel rows.
 */
const SP_FULL_COLS = ['Date', 'N° Session', 'Week', 'WeeK MD Session', 'MD Session', 'Players', 'Position', 'Time', 'Type', 'N°Exercice', 'DT', 'm min',
  'HIT DT', 'HIT DT m min', 'HIT count', 'Sprint DT', 'Sprint m min', 'Sprint count', 'Speed Max (km.h)', 'HIT Acc', 'HIT Dec', 'Acc 3-4.5', 'Dec 2.5-4',
  'HIT Acc - HIT Dec', 'Acc 2.5-4 - Dec 2.5-4', 'BodyLoad', 'RPE', 'Carga RPE', 'AVG Heart Rate', 'MAX Heart Rate', 'Time HR over 85%',
  'Time HR over 85% Session', 'Running DT >10kmh', 'Speed AVG', 'MED Acc', 'MED Dec', 'Total Metabolic Power', 'HIT > 15', 'HIT/min > 15', 'AMPM',
  'Max Acc', 'Max Dec', 'DSL', 'DT zone5 Relative', 'DT zone6 Relative', 'DT zone5+6 Relative', 'Count Zone5 Relative', 'Count zone6 Relative'];
const SP_DRILL_COLS = SP_FULL_COLS.map((c) => (c === 'Acc 3-4.5' ? 'Acc 2.5-4' : c)); // the drills file names it so
const SP_SESSION_TYPES = new Set(['ProTraining']); // their Time = the session's duration, as in the club's files (others: their own minutes)

/** The session's duration: the most common GPS time, in whole minutes. */
function spSessionTime(fullCsvRows) {
  const n = {};
  fullCsvRows.forEach((r) => { const t = Math.floor(spNum(r['Total Time']) + 1e-9); if (t > 0) n[t] = (n[t] || 0) + 1; });
  const best = Object.entries(n).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return best ? Number(best[0]) : 0;
}

/** CSV text → array of objects (header row; quotes and "" escapes handled; BOM removed). */
function spParseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some((c) => c !== '')) rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const spNum = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
const spRound = (v, d = 0) => { const k = 10 ** d; return Math.round((v + Number.EPSILON) * k) / k; };
const spName = (s) => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();
/** "29/09/2026" → "2026-09-29" */
function spIsoDate(s) { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || '').trim()); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; }

/** The metric columns of one StatSports row, for `time` minutes (full session: whole minutes; drill: planned minutes). */
function spMetrics(r, time) {
  const z4 = spNum(r['Distance Zone 4 (Absolute)']), z5 = spNum(r['Distance Zone 5 (Absolute)']), z6 = spNum(r['Distance Zone 6 (Absolute)']);
  const e5 = spNum(r['Entries Zone 5 (Absolute)']), e6 = spNum(r['Entries Zone 6 (Absolute)']);
  const acc = spNum(r['Accelerations Zone 4 - Zone 6 (Absolute)']), dec = spNum(r['Decelerations Zone 4 - Zone 6 (Absolute)']);
  const acc3 = spNum(r['Accelerations Zone 3 (Absolute)']), dec3 = spNum(r['Decelerations Zone 3 (Absolute)']);
  const td = spNum(r['Total Distance']), per = (v) => (time > 0 ? spRound(v / time) : 0);
  return {
    DT: spRound(td), 'm min': per(td), 'HIT DT': spRound(z5 + z6), 'HIT DT m min': per(z5 + z6), 'HIT count': e5 + e6,
    'Sprint DT': spRound(z6), 'Sprint m min': per(z6), 'Sprint count': e6, 'Speed Max (km.h)': spRound(spNum(r['Max Speed']), 1),
    'HIT Acc': acc, 'HIT Dec': dec, 'Acc 3-4.5': acc3, 'Acc 2.5-4': acc3, 'Dec 2.5-4': dec3, 'HIT Acc - HIT Dec': acc - dec, 'Acc 2.5-4 - Dec 2.5-4': acc3 - dec3,
    BodyLoad: acc + dec + e5 + e6, 'AVG Heart Rate': spRound(spNum(r['Average Heart Rate'])), 'MAX Heart Rate': spNum(r['Max Heart Rate']),
    'Time HR over 85%': spNum(r['Time In Heart Rate Zone 4 - Zone 6 (Absolute)']), 'Time HR over 85% Session': spNum(r['Time In Heart Rate Zone 4 - Zone 6 (Absolute)']),
    'Running DT >10kmh': spRound(spNum(r['Distance Zone 3 - Zone 6 (Absolute)'])), 'Speed AVG': spRound(spNum(r['Average Speed']), 1),
    'MED Acc': spNum(r['Accelerations Zone 1 (Absolute)']) + spNum(r['Accelerations Zone 2 (Absolute)']),
    'MED Dec': spNum(r['Decelerations Zone 1 (Absolute)']) + spNum(r['Decelerations Zone 2 (Absolute)']),
    'Total Metabolic Power': spRound(spNum(r['Total Metabolic Power'])), 'HIT > 15': spRound(z4 + z5 + z6), 'HIT/min > 15': per(z4 + z5 + z6),
    'Max Acc': spRound(spNum(r['Max Acceleration']), 2), 'Max Dec': spRound(spNum(r['Max Deceleration']), 2), DSL: spRound(spNum(r['Dynamic Stress Load']), 2),
    'DT zone5 Relative': spNum(r['Distance Zone 5 (Relative)']), 'DT zone6 Relative': spNum(r['Distance Zone 6 (Relative)']),
    'DT zone5+6 Relative': spNum(r['Distance Zone 5+Zone 6 Relative']), 'Count Zone5 Relative': spNum(r['Entries Zone 5 (Relative)']),
    'Count zone6 Relative': spNum(r['Entries Zone 6 (Relative)']),
  };
}

/**
 * The session's rows. ctx = { date, sid, week, label, md, ampm, sessionTime, players: {GPSNAME: {name, pos, type}}, extra: [{name, pos, type}]
 * (players without GPS: injured, NT…), rpe: {GPSNAME: n}, drills: {title: {no, name, min}} with optional per-player names
 * (rehab / individual work inside a drill), drillName(player, drill) }.
 * Returns { full: [row], drills: [row], issues: [text] } — rows are objects keyed by the Excel column names.
 */
function spBuildRows(fullCsv, drillsCsv, ctx) {
  const issues = [];
  const head = (pname) => {
    const p = ctx.players[pname] || {};
    return { Date: ctx.date, 'N° Session': ctx.sid, Week: ctx.week, 'WeeK MD Session': ctx.label, 'MD Session': ctx.md, Players: p.name || pname, Position: p.pos || '' };
  };
  const full = [], rows = spParseCsv(fullCsv), session = ctx.sessionTime || spSessionTime(rows);
  rows.forEach((r) => {
    const pn = spName(r['Player First Name']);
    if (!pn) return;
    if (!ctx.players[pn]) issues.push(`${pn}: not in the squad list`);
    const type = (ctx.players[pn] || {}).type || 'ProTraining';
    const time = SP_SESSION_TYPES.has(type) && session ? session : Math.floor(spNum(r['Total Time']) + 1e-9);
    const rpe = ctx.rpe && ctx.rpe[pn] != null && ctx.rpe[pn] !== '' ? Number(ctx.rpe[pn]) : null;
    full.push({ ...head(pn), Time: time, Type: type, 'N°Exercice': 1, ...spMetrics(r, time), RPE: rpe, 'Carga RPE': rpe != null ? rpe * time : null, AMPM: ctx.ampm || 'PM' });
  });
  (ctx.extra || []).forEach((p) => {
    full.push({ Date: ctx.date, 'N° Session': ctx.sid, Week: ctx.week, 'WeeK MD Session': ctx.label, 'MD Session': ctx.md, Players: p.name, Position: p.pos || '', Time: 0, Type: p.type, 'N°Exercice': 1, AMPM: ctx.ampm || 'PM' });
  });
  const drills = [];
  if (drillsCsv) {
    spParseCsv(drillsCsv).forEach((r) => {
      const pn = spName(r['Player First Name']), title = String(r['Drill Title'] || '').trim();
      if (!pn || !title) return;
      const d = (ctx.drills || {})[title];
      if (!d) { issues.push(`drill "${title}": not in the plan`); return; }
      // planned minutes (a 2 × 10' game is 20'), but individual / rehab work keeps the player's own minutes
      const time = d.own ? Math.floor(spNum(r['Total Time']) + 1e-9) : d.min, rpe = ctx.rpe && ctx.rpe[pn] != null && ctx.rpe[pn] !== '' ? Number(ctx.rpe[pn]) : null;
      const name = ctx.drillName ? ctx.drillName(pn, d) : d.name;
      drills.push({ ...head(pn), Time: time, Type: name, 'N°Exercice': d.no, ...spMetrics(r, time), RPE: rpe, 'Carga RPE': rpe != null ? rpe * time : null, AMPM: ctx.ampm || 'PM' });
    });
  }
  const pick = (cols) => (row) => Object.fromEntries(cols.map((c) => [c, row[c] ?? null]));
  return { full: full.map(pick(SP_FULL_COLS)), drills: drills.map(pick(SP_DRILL_COLS)), issues: [...new Set(issues)] };
}

if (typeof module !== 'undefined') module.exports = { SP_FULL_COLS, SP_DRILL_COLS, spParseCsv, spMetrics, spBuildRows, spSessionTime, spIsoDate, spName, spNum, spRound };
