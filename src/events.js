// src/events.js
// Cliente para consultar eventos comunitarios desde el backend de Checkpoint Launcher
const https = require('https');
const http = require('http');

const API_BASE_URL = (process.env.API_BASE_URL || 'https://checkpoint-backend-gcs2.onrender.com').replace(/\/+$/, '');

function fetchEvents() {
  return new Promise((resolve) => {
    try {
      const url = new URL('/api/events?upcoming=1', API_BASE_URL);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const opts = {
        method: 'GET',
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          'User-Agent': 'CheckpointLauncher/0.5.1',
          'Accept': 'application/json',
        },
      };

      const req = lib.request(opts, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString('utf-8');
            const data = JSON.parse(text);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const events = Array.isArray(data) ? data : (data.events || []);
              resolve({ ok: true, events });
            } else {
              resolve({ ok: false, error: (data && data.error) || `HTTP ${res.statusCode}` });
            }
          } catch (e) {
            resolve({ ok: false, error: 'Respuesta inválida del servidor' });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ ok: false, error: err.message || 'Error de conexión' });
      });

      req.setTimeout(10000, () => {
        req.destroy();
        resolve({ ok: false, error: 'Tiempo de espera agotado' });
      });

      req.end();
    } catch (err) {
      resolve({ ok: false, error: err.message || 'Error inesperado' });
    }
  });
}

function fetchEventParticipants(eventId) {
  return new Promise((resolve) => {
    try {
      const url = new URL(`/api/events/${encodeURIComponent(eventId)}/participants`, API_BASE_URL);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const opts = {
        method: 'GET',
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          'User-Agent': 'CheckpointLauncher/0.5.1',
          'Accept': 'application/json',
        },
      };

      const req = lib.request(opts, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString('utf-8');
            const data = JSON.parse(text);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ ok: true, participants: data.participants || [] });
            } else {
              resolve({ ok: false, error: (data && data.error) || `HTTP ${res.statusCode}` });
            }
          } catch (e) {
            resolve({ ok: false, error: 'Respuesta inválida del servidor' });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ ok: false, error: err.message || 'Error de conexión' });
      });

      req.setTimeout(10000, () => {
        req.destroy();
        resolve({ ok: false, error: 'Tiempo de espera agotado' });
      });

      req.end();
    } catch (err) {
      resolve({ ok: false, error: err.message || 'Error inesperado' });
    }
  });
}

module.exports = {
  fetchEvents,
  fetchEventParticipants,
};
