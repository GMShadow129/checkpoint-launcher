// Funcionalidades "comunitarias": estado del server, feed de noticias, etc.
//
// Server status: usa la API publica https://mcsrvstat.us que devuelve JSON
// con info del server de Minecraft (online, jugadores, motd, version) sin
// necesitar auth.
//
// News feed: parsea RSS 2.0 simple (regex). Soporta titulo, link, descripcion,
// pubDate. Si el feed no responde o no es RSS valido, devuelve [].

const https = require('https');

const SERVER_STATUS_API = 'https://api.mcsrvstat.us/2';
const REQUEST_TIMEOUT_MS = 10000;

function httpGet(url, redirectCount = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'CheckpointLauncher/0.5.1' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        const next = res.headers.location;
        if (!next) return reject(new Error('Redirect sin location'));
        if (redirectCount <= 0) return reject(new Error('Demasiados redirects'));
        return resolve(httpGet(next, redirectCount - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} en ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

function httpGetJson(url) {
  return httpGet(url).then((s) => {
    try { return JSON.parse(s); } catch (e) { throw new Error('Respuesta no es JSON valido'); }
  });
}

// Devuelve info del server: { online, address, playersOnline, playersMax,
// motd, version, latencyMs, error? }
async function fetchServerStatus(address) {
  if (!address) return { online: false, error: 'Sin direccion' };
  // mcsrvstat.us acepta "host:port" o solo "host".
  const url = `${SERVER_STATUS_API}/${encodeURIComponent(address)}`;
  try {
    const data = await httpGetJson(url);
    if (data.online === false) {
      return { online: false, address, error: 'Server offline' };
    }
    const motd = (data.motd && (data.motd.clean && data.motd.clean[0])) || '';
    return {
      online: true,
      address,
      host: data.hostname || data.ip || address,
      port: data.port || 25565,
      playersOnline: (data.players && data.players.online) || 0,
      playersMax: (data.players && data.players.max) || 0,
      motd,
      version: data.version || '?',
      latencyMs: typeof data.ping === 'number' ? data.ping : null,
    };
  } catch (err) {
    return { online: false, address, error: err.message || String(err) };
  }
}

// Parsea RSS 2.0 basico. Devuelve [{ title, link, description, pubDate }].
function parseRss(xml) {
  const items = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const body = m[1];
    items.push({
      title: extractTag(body, 'title') || '(sin titulo)',
      link: extractTag(body, 'link') || '',
      description: extractTag(body, 'description') || '',
      pubDate: extractTag(body, 'pubDate') || '',
    });
  }
  return items;
}

function extractTag(xml, tag) {
  // Match opening/closing tag with content. CDATA-aware.
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = re.exec(xml);
  if (!m) return '';
  let content = m[1];
  // Si viene en CDATA, sacamos los markers.
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(content.trim());
  if (cdata) return decodeHtmlEntities(cdata[1].trim());
  return decodeHtmlEntities(content.trim());
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Devuelve los ultimos N items de un feed RSS.
async function fetchNewsFeed(feedUrl, limit = 5) {
  if (!feedUrl) return [];
  try {
    const xml = await httpGet(feedUrl);
    const items = parseRss(xml);
    return items.slice(0, limit);
  } catch (_) {
    return [];
  }
}

module.exports = {
  fetchServerStatus,
  fetchNewsFeed,
  parseRss,
};