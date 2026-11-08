// Helper de descarga compartido.
//
// Usado por java.js, minecraft.js, forge.js, neoforge.js y fabric.js.
// Maneja redirects (301, 302, 303, 307, 308) y reporta progreso opcional.

const fs = require('fs');
const path = require('path');
const https = require('https');

// Codigos de redirect que seguimos automaticamente.
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 10;

function downloadToFile(url, destPath, onProgress, redirectCount) {
  redirectCount = redirectCount || 0;
  if (redirectCount > MAX_REDIRECTS) {
    return Promise.reject(new Error(`Demasiados redirects (>${MAX_REDIRECTS}) empezando en ${url}`));
  }

  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const file = fs.createWriteStream(destPath);
    let downloaded = 0;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      file.close();
      try { fs.unlinkSync(destPath); } catch (_) {}
      reject(err);
    };

    https.get(url, (res) => {
      // Redirect.
      if (REDIRECT_CODES.has(res.statusCode)) {
        res.resume();
        file.close();
        const next = res.headers.location;
        if (!next) {
          fail(new Error(`HTTP ${res.statusCode} sin Location header desde ${url}`));
          return;
        }
        // Algunos servers mandan Location relativo. Resolvemos contra el URL original.
        const absolute = next.startsWith('http') ? next : new URL(next, url).toString();
        // Limpiamos el archivo vacio antes de reintentar.
        try { fs.unlinkSync(destPath); } catch (_) {}
        downloadToFile(absolute, destPath, onProgress, redirectCount + 1)
          .then(resolve, reject);
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        fail(new Error(`HTTP ${res.statusCode} al bajar ${url}`));
        return;
      }

      const total = parseInt(res.headers['content-length'] || '0', 10);
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress) onProgress(downloaded, total);
      });
      res.on('error', fail);
      res.pipe(file);
      file.on('finish', () => {
        if (settled) return;
        settled = true;
        file.close(() => resolve(destPath));
      });
      file.on('error', fail);
    }).on('error', fail);
  });
}

module.exports = { downloadToFile };