const fs = require('fs');
const path = require('path');
const Logger = require('../utils/logger');

const dataDir = path.join(__dirname, '../data');
const backupDir = path.join(dataDir, 'backups');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

const MAX_BACKUP_SETS = Number(process.env.BACKUP_KEEP || 12);
const BACKUP_INTERVAL_MS = Number(process.env.BACKUP_INTERVAL_MINUTES || 60) * 60 * 1000;

/**
 * Writes JSON atomically: serialize -> temp file -> fsync -> rename.
 * A crash mid-write can now only ever leave the untouched original or a stray
 * .tmp file, never a truncated store.
 */
function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  let payload;
  try {
    payload = JSON.stringify(data, null, 2);
  } catch (err) {
    Logger.error(`Refusing to write ${path.basename(filePath)} - could not serialize:`, err);
    return false;
  }

  let handle;
  try {
    handle = fs.openSync(tmpPath, 'w');
    fs.writeFileSync(handle, payload, 'utf8');
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = null;
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch (err) {
    Logger.error(`Failed to save ${path.basename(filePath)}:`, err);
    try { if (handle !== null && handle !== undefined) fs.closeSync(handle); } catch (e) {}
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (e) {}
    return false;
  }
}

function readJsonSafe(filePath, defaultValue = null) {
  if (!fs.existsSync(filePath)) return defaultValue;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    Logger.error(`Failed to parse ${path.basename(filePath)}:`, err);
    const salvaged = restoreFromBackup(path.basename(filePath));
    if (salvaged !== null) {
      Logger.warn(`Recovered ${path.basename(filePath)} from the most recent backup.`);
      return salvaged;
    }
    return defaultValue;
  }
}

/** Clears any .tmp leftovers from a previous crash. */
function cleanStaleTemp() {
  try {
    for (const name of fs.readdirSync(dataDir)) {
      if (name.endsWith('.tmp')) {
        fs.unlinkSync(path.join(dataDir, name));
        Logger.warn(`Removed stale temp file data/${name}`);
      }
    }
  } catch (e) {}
}

function listBackupSets() {
  try {
    return fs.readdirSync(backupDir)
      .filter((name) => /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/.test(name))
      .sort();
  } catch (e) {
    return [];
  }
}

function restoreFromBackup(fileName) {
  const sets = listBackupSets().reverse();
  for (const set of sets) {
    const candidate = path.join(backupDir, set, fileName);
    if (fs.existsSync(candidate)) {
      try {
        return JSON.parse(fs.readFileSync(candidate, 'utf8'));
      } catch (e) {
        // try an older set
      }
    }
  }
  return null;
}

/** Snapshots every data/*.json into data/backups/<timestamp>/ and prunes old sets. */
function createBackup(reason = 'scheduled') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const target = path.join(backupDir, stamp);
  try {
    fs.mkdirSync(target, { recursive: true });
    let copied = 0;
    for (const name of fs.readdirSync(dataDir)) {
      if (!name.endsWith('.json')) continue;
      fs.copyFileSync(path.join(dataDir, name), path.join(target, name));
      copied += 1;
    }

    const sets = listBackupSets();
    while (sets.length > MAX_BACKUP_SETS) {
      const oldest = sets.shift();
      fs.rmSync(path.join(backupDir, oldest), { recursive: true, force: true });
    }
    Logger.info(`Backup (${reason}) saved ${copied} files to data/backups/${stamp}`);
    return target;
  } catch (err) {
    Logger.error('Failed to create data backup:', err);
    return null;
  }
}

let backupTimer = null;
function startBackupSchedule() {
  if (backupTimer) return;
  createBackup('startup');
  backupTimer = setInterval(() => createBackup('scheduled'), BACKUP_INTERVAL_MS);
  if (typeof backupTimer.unref === 'function') backupTimer.unref();
}

/**
 * Debounced writer. High-frequency callers (XP on every message, economy on
 * every spin) coalesce into one disk write per collection per tick window.
 */
function createDebouncedWriter(flushMs = 400) {
  const pending = new Map();
  const timers = new Map();

  function flush(key) {
    const entry = pending.get(key);
    if (!entry) return;
    pending.delete(key);
    const timer = timers.get(key);
    if (timer) {
      clearTimeout(timer);
      timers.delete(key);
    }
    writeJsonAtomic(entry.filePath, entry.getData());
  }

  function flushAll() {
    for (const key of [...pending.keys()]) flush(key);
  }

  function schedule(key, filePath, getData) {
    pending.set(key, { filePath, getData });
    if (timers.has(key)) return;
    const timer = setTimeout(() => flush(key), flushMs);
    if (typeof timer.unref === 'function') timer.unref();
    timers.set(key, timer);
  }

  return { schedule, flush, flushAll };
}

module.exports = {
  dataDir,
  backupDir,
  writeJsonAtomic,
  readJsonSafe,
  cleanStaleTemp,
  createBackup,
  restoreFromBackup,
  listBackupSets,
  startBackupSchedule,
  createDebouncedWriter
};
