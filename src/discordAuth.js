// src/discordAuth.js
// Cliente Discord OAuth para Checkpoint Launcher.
// Usa el flujo de tickets (polling) para evitar abrir un servidor HTTP local
// que dispararia alertas de Windows Defender Firewall.

const https = require('https');
const http = require('http');
const { shell } = require('electron');

const API_BASE_URL = (process.env.API_BASE_URL || 'https://checkpoint-backend-gcs2.onrender.com').replace(/\/+$/, '');
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos

// ============================================================================
// Helpers HTTP genericos (sin dependencias externas)
// ============================================================================

function apiRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const headers = {
      'User-Agent': 'CheckpointLauncher/0.5.1',
      'Accept': 'application/json',
    };
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const postData = body ? JSON.stringify(body) : null;
    if (postData) headers['Content-Length'] = Buffer.byteLength(postData);

    const req = lib.request({
      method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf-8');
          const data = JSON.parse(text);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error((data && data.error) || `HTTP ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error('Respuesta invalida del servidor'));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });

    if (postData) req.write(postData);
    req.end();
  });
}

// ============================================================================
// Login con Discord (flujo de ticket + polling)
// ============================================================================

async function loginWithDiscord() {
  // 1. Crear ticket en el backend
  const initRes = await apiRequest('POST', '/api/auth/discord/init', {});
  if (!initRes.ok) throw new Error(initRes.error || 'No se pudo iniciar login');

  const { ticket, authUrl } = initRes;

  // 2. Abrir el navegador del sistema con la URL de autorizacion de Discord
  shell.openExternal(authUrl);

  // 3. Hacer polling hasta que el ticket se resuelva (done/error) o expire
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const poll = async () => {
      if (Date.now() - startTime > POLL_TIMEOUT_MS) {
        return reject(new Error('Tiempo de espera agotado. Intentalo de nuevo.'));
      }

      try {
        const res = await apiRequest('GET', `/api/auth/discord/poll?ticket=${encodeURIComponent(ticket)}`);
        if (res.done) {
          return resolve({
            token: res.token,
            user: res.user,
          });
        }
        if (res.error) {
          return reject(new Error(res.error));
        }
        // Todavia pending, seguir polling
        setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        // Si el ticket no se encontro, probablemente expiro
        if (err.message && err.message.includes('404')) {
          return reject(new Error('Ticket expirado. Intentalo de nuevo.'));
        }
        // Error de red temporal, reintentar
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();
  });
}

// ============================================================================
// Sesion del usuario (JWT guardado en electron-store)
// ============================================================================

async function getDiscordSession(store) {
  const data = store.get('discordSession', null);
  if (!data || !data.token) return null;

  // Verificar que el token siga siendo valido contra /me
  try {
    const res = await apiRequest('GET', '/api/auth/me', null, data.token);
    if (res.ok && res.user) {
      // Actualizar datos por si cambiaron username/avatar
      const updated = {
        token: data.token,
        user: {
          id: res.user.id,
          discordId: res.user.discordId,
          username: res.user.username,
          avatar: res.user.avatar,
        },
      };
      store.set('discordSession', updated);
      return updated;
    }
  } catch (_) {
    // Token invalido o expirado
  }
  store.delete('discordSession');
  return null;
}

function logoutDiscord(store) {
  store.delete('discordSession');
  return true;
}

// ============================================================================
// Registro de asistencia a eventos
// ============================================================================

async function registerEvent(eventId, mcUsernameOrStore, maybeStore) {
  let store = maybeStore;
  let mcUsername = mcUsernameOrStore;

  if (mcUsernameOrStore && typeof mcUsernameOrStore.get === 'function' && !maybeStore) {
    store = mcUsernameOrStore;
    mcUsername = null;
  }

  if (!store || typeof store.get !== 'function') {
    throw new Error('Store no proporcionado');
  }

  if (!mcUsername) {
    const mcSession = store.get('session', null);
    if (mcSession && mcSession.name) {
      mcUsername = mcSession.name;
    }
  }

  const session = store.get('discordSession', null);
  if (!session || !session.token) throw new Error('No has iniciado sesion con Discord');

  const body = mcUsername ? { mcUsername } : {};
  const res = await apiRequest('POST', `/api/events/${eventId}/register`, body, session.token);
  return res;
}

async function unregisterEvent(eventId, store) {
  const session = store.get('discordSession', null);
  if (!session || !session.token) throw new Error('No has iniciado sesion con Discord');

  const res = await apiRequest('DELETE', `/api/events/${eventId}/register`, null, session.token);
  return res;
}

// Obtener IDs de eventos a los que el usuario esta registrado
async function getUserRegisteredEvents(store) {
  const session = store.get('discordSession', null);
  if (!session || !session.token) return [];

  try {
    const res = await apiRequest('GET', '/api/events/my-registrations', null, session.token);
    if (res.ok) return res.eventIds || [];
  } catch (_) {}
  return [];
}

module.exports = {
  loginWithDiscord,
  getDiscordSession,
  logoutDiscord,
  registerEvent,
  unregisterEvent,
  getUserRegisteredEvents,
};
