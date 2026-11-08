// Wrapper de la API publica de Modrinth v2 (https://docs.modrinth.com).
// Sin auth, sin dependencias externas, 300 req/min. Si lo excedes, devuelve
// 429 y nosotros propagamos el error al UI para que lo maneje.
//
// User-Agent es REQUERIDO por Modrinth (sino devuelve 403).

const https = require('https');

const API_BASE = 'https://api.modrinth.com';
const USER_AGENT = 'CheckpointLauncher/0.5.1 (contact: checkpoint@example.com)';

// Mapeo de loaders de Checkpoint Launcher a loaders de Modrinth.
const LOADER_MAP = {
  forge: 'forge',
  neoforge: 'neoforge',
  fabric: 'fabric',
  vanilla: '',  // vanilla no es un loader real en Modrinth
};

// Mapeo inverso para mostrar al user.
const LOADER_DISPLAY = {
  forge: 'Forge',
  neoforge: 'NeoForge',
  fabric: 'Fabric',
  vanilla: 'Vanilla',
};

function modrinthGet(path, query) {
  return new Promise((resolve, reject) => {
    const qs = query ? '?' + new URLSearchParams(query).toString() : '';
    const url = API_BASE + path + qs;
    const req = https.get(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' }
    }, (res) => {
      // Redirects (Modrinth usa CDN en algunos casos).
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        const next = res.headers.location;
        if (!next) return reject(new Error(`Redirect sin location desde ${url}`));
        return modrinthGetRaw(next).then(resolve, reject);
      }
      if (res.statusCode === 429) {
        return reject(new Error('Modrinth rate limit alcanzado. Espera un momento.'));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Modrinth HTTP ${res.statusCode} en ${path}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(e); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

function modrinthGetRaw(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        const next = res.headers.location;
        if (!next) return reject(new Error('Redirect sin location'));
        if (redirectsLeft <= 0) return reject(new Error('Demasiados redirects'));
        return modrinthGetRaw(next, redirectsLeft - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} bajando ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Busca proyectos (mods, modpacks, etc).
// `query` es la query libre del user. `facets` es array de arrays (formato Modrinth).
async function searchProjects({ query = '', facets = [], index = 'relevance', limit = 20 } = {}) {
  const data = await modrinthGet('/v2/search', {
    query,
    // Modrinth espera facets como JSON serializado.
    facets: JSON.stringify(facets),
    index,
    limit: String(limit),
  });
  return data;
}

// Detalle de un proyecto (mod) por id o slug.
async function getProject(idOrSlug) {
  return modrinthGet('/v2/project/' + encodeURIComponent(idOrSlug));
}

// Versiones de un proyecto, filtrables por loader y MC version.
// Devuelve TODAS las versiones; el caller filtra si quiere.
async function getProjectVersions(idOrSlug, { loader, gameVersion } = {}) {
  const query = {};
  if (loader) query.loader = loader;
  if (gameVersion) query.game_versions = JSON.stringify([gameVersion]);
  return modrinthGet('/v2/project/' + encodeURIComponent(idOrSlug) + '/version', query);
}

// Detalle de una version especifica (incluye URL de descarga directa).
async function getVersion(versionId) {
  return modrinthGet('/v2/version/' + encodeURIComponent(versionId));
}

// Devuelve la URL de descarga del archivo principal de una version.
function primaryDownloadUrl(version) {
  if (!version || !version.files || version.files.length === 0) return null;
  // El primer file suele ser el primary. Si no, agarramos cualquiera.
  const primary = version.files.find((f) => f.primary) || version.files[0];
  return primary.url;
}

function primaryFilename(version) {
  if (!version || !version.files || version.files.length === 0) return null;
  const primary = version.files.find((f) => f.primary) || version.files[0];
  return primary.filename;
}

// Helper: construye facets para filtrar por loader + MC version de una instancia.
function buildFacetsForInstance(instance, projectType = 'mod') {
  const facets = [['project_type:' + projectType]];
  if (instance && instance.minecraftVersion) {
    facets.push(['versions:' + instance.minecraftVersion]);
  }
  if (instance && instance.loader && LOADER_MAP[instance.loader]) {
    facets.push(['loaders:' + LOADER_MAP[instance.loader]]);
  }
  return facets;
}

module.exports = {
  LOADER_MAP,
  LOADER_DISPLAY,
  searchProjects,
  getProject,
  getProjectVersions,
  getVersion,
  primaryDownloadUrl,
  primaryFilename,
  buildFacetsForInstance,
  API_BASE,
  USER_AGENT,
};