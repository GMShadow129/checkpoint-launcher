// Lector de logs de Minecraft: latest.log y crash-reports/.
//
// Devuelve las ultimas N lineas de un log (no el archivo entero) porque pueden
// pesar MBs. Si necesitas mas, el user abre el archivo en el explorador.

const fs = require('fs');
const path = require('path');
const { instanceMinecraftDir } = require('./instances');

function getLogsDir(instanceId) {
  return path.join(instanceMinecraftDir(instanceId), 'logs');
}

function getCrashReportsDir(instanceId) {
  return path.join(instanceMinecraftDir(instanceId), 'crash-reports');
}

// Lista los archivos .log del directorio logs/ (mas reciente primero).
function listLogs(instanceId) {
  const dir = getLogsDir(instanceId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.log') || f.toLowerCase().endsWith('.log.gz'))
    .map((f) => {
      const p = path.join(dir, f);
      const stat = fs.statSync(p);
      return {
        name: f,
        path: p,
        size: stat.size,
        mtime: stat.mtimeMs,
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

// Lee las ultimas N lineas de un log. Para archivos grandes, leemos
// solo el final (offsets) para no cargar todo en memoria.
function readLogTail(instanceId, filename, lines = 500) {
  const p = path.join(getLogsDir(instanceId), filename);
  if (!fs.existsSync(p)) {
    return { ok: false, error: 'Archivo no encontrado' };
  }
  try {
    // Para logs chicos leemos todo. Para grandes (>5MB), leemos el final.
    const stat = fs.statSync(p);
    const MAX_FULL = 5 * 1024 * 1024; // 5 MB
    let content;
    if (stat.size <= MAX_FULL) {
      content = fs.readFileSync(p, 'utf-8');
    } else {
      // Leemos los ultimos 500KB aprox.
      const start = Math.max(0, stat.size - 500 * 1024);
      const fd = fs.openSync(p, 'r');
      const buf = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      fs.closeSync(fd);
      content = buf.toString('utf-8');
    }
    const allLines = content.split(/\r?\n/);
    const tail = allLines.slice(-lines);
    return { ok: true, lines: tail, total: allLines.length, truncated: allLines.length > tail.length };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

// Lista crash-reports (mas recientes primero).
function listCrashReports(instanceId) {
  const dir = getCrashReportsDir(instanceId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.txt') || f.toLowerCase().endsWith('.log'))
    .map((f) => {
      const p = path.join(dir, f);
      const stat = fs.statSync(p);
      return {
        name: f,
        path: p,
        size: stat.size,
        mtime: stat.mtimeMs,
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

// Lee el contenido de un crash report (los .txt suelen ser chicos).
function readCrashReport(instanceId, filename) {
  const p = path.join(getCrashReportsDir(instanceId), filename);
  if (!fs.existsSync(p)) {
    return { ok: false, error: 'Archivo no encontrado' };
  }
  try {
    return { ok: true, content: fs.readFileSync(p, 'utf-8') };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

module.exports = {
  getLogsDir,
  getCrashReportsDir,
  listLogs,
  readLogTail,
  listCrashReports,
  readCrashReport,
};