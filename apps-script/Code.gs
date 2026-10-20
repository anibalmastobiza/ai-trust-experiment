/**
 * Receives responses from the "Trust in AI assistants" experiment.
 * Paste into Extensions > Apps Script of the spreadsheet and deploy as a
 * web app (Execute as: Me; Who has access: Anyone).
 *
 * Writes two tabs:
 *   participants: one row per participant (wide format).
 *   cards: one row per rated listing (long format, 8 per participant).
 */

// Spreadsheet "AI trust experiment - responses".
var SPREADSHEET_ID = "1GAQ4YaDsvSRpLqDaO9803m2qjf4FMIaWBKBbhNEb76Y";

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = JSON.parse(e.postData.contents);
    var received = new Date().toISOString();
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    var p = data.participant || {};
    p.ts_server = received;
    appendObjects_(ss, "participants", [p]);

    var cards = (data.cards || []).map(function (c) {
      c.ts_server = received;
      return c;
    });
    appendObjects_(ss, "cards", cards);

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Column headers, in the order sent by app.js.
var BASE_COLS = ["pid", "prolific_pid", "cond_anchor", "cond_frame", "cond_decoy", "feature_order"];
var PARTICIPANT_COLS = BASE_COLS.concat([
  "study", "prolific_study_id", "prolific_session_id", "ts_start", "ts_consent", "ts_end", "duration_s",
  "choice", "choice_target", "choice_order", "choice_rt_ms",
  "age", "gender", "education", "country", "ai_use", "ai_knowledge", "tech_trust",
  "attention", "attention_ok", "screen", "mobile"
]);
for (var t = 1; t <= 8; t++) {
  PARTICIPANT_COLS.push("t" + t + "_profile", "t" + t + "_trust", "t" + t + "_follow");
}
PARTICIPANT_COLS.push("ts_server");
var CARD_COLS = BASE_COLS.concat([
  "trial", "name", "domain", "consistency", "transparency", "explainability",
  "trust", "follow", "rt_ms", "first_move_ms", "ts_server"
]);

/**
 * Run once from the Apps Script editor (select setupSheet, then Run).
 * Creates the "participants" and "cards" tabs with their column headers
 * and removes the empty default tab. Running it also triggers the
 * authorisation prompt needed before deploying the web app.
 */
function setupSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  [["participants", PARTICIPANT_COLS], ["cards", CARD_COLS]].forEach(function (x) {
    var sh = ss.getSheetByName(x[0]) || ss.insertSheet(x[0]);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, x[1].length).setValues([x[1]]).setFontWeight("bold");
      sh.setFrozenRows(1);
    }
  });
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (name !== "participants" && name !== "cards" && sh.getLastRow() === 0 && ss.getSheets().length > 2) {
      ss.deleteSheet(sh);
    }
  });
}

function doGet() {
  return json_({ ok: true, message: "Service running" });
}

function appendObjects_(ss, sheetName, objs) {
  if (!objs.length) return;
  var sh = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  var lastCol = sh.getLastColumn();
  var headers = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];

  var changed = false;
  objs.forEach(function (o) {
    Object.keys(o).forEach(function (k) {
      if (headers.indexOf(k) === -1) { headers.push(k); changed = true; }
    });
  });
  if (changed) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }

  var rows = objs.map(function (o) {
    return headers.map(function (h) { return clean_(o[h]); });
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

// Prevents participant-typed text from being interpreted as a formula.
function clean_(v) {
  if (v === undefined || v === null) return "";
  if (typeof v === "string" && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
