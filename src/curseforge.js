// Wrapper de la API de CurseForge v1 (https://docs.curseforge.com).
// REQUIERE API key obligatoria (header x-api-key). Sin key, devuelve 403.
//
// Rate limit: sin key documentado, pero ~600 req/h sugerido.
// Endpoint base: https://api.curseforge.com
//
// Mod IDs en CurseForge no son iguales a los de Modrinth. Cada proyecto tiene
// un `id` numerico y un `slug`. La busqueda devuelve resultados con `id` y
// distintos metadatos.

const https = require('https');

const API_BASE = 'https://api.curseforge.com';
const USER_AGENT = 'CheckpointLauncher/0.5.1 (contact: checkpoint@example.com)';

// Mapeo de loaders Checkpoint Launcher -> CurseForge modLoaderType.
// IDs oficiales de CurseForge:
//   1 = Forge
//   4 = Fabric
//   6 = NeoForge (desde 2024)
//   5 = Quilt
//   0 = Any
const LOADER_TYPE_MAP = {
  forge: 1,
  fabric: 4,
  neoforge: 6,
  vanilla: 0,
};
const LOADER_TYPE_INVERSE = { 1: 'forge', 4: 'fabric', 6: 'neoforge', 0: 'vanilla' };

// projectType IDs de CurseForge:
//   6 = Mod
//   4471 = Modpack
//   12 = Resource Pack
//   6552 = Shader (addon packs)
const PROJECT_TYPE_MOD = 6;
const PROJECT_TYPE_MODPACK = 4471;
const PROJECT_TYPE_RESOURCEPACK = 12;
const PROJECT_TYPE_SHADER = 6552;
const PROJECT_TYPE_INVERSE = {
  6: 'mod', 4471: 'modpack', 12: 'resourcepack', 6552: 'shader',
};

function cfGet(path, apiKey, query) {
  return new Promise((resolve, reject) => {
    if (!apiKey) {
      return reject(new Error('Falta la API key de CurseForge. Configurala en Configuracion.'));
    }
    const qs = query ? '?' + new URLSearchParams(query).toString() : '';
    const url = API_BASE + path + qs;
    const req = https.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'x-api-key': apiKey,
      },
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        const next = res.headers.location;
        if (!next) return reject(new Error(`Redirect sin location desde ${url}`));
        return cfGetRaw(next, apiKey).then(resolve, reject);
      }
      if (res.statusCode === 403) {
        return reject(new Error('API key de CurseForge invalida o sin permisos'));
      }
      if (res.statusCode === 429) {
        return reject(new Error('CurseForge rate limit alcanzado'));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`CurseForge HTTP ${res.statusCode} en ${path}`));
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

function cfGetRaw(url, apiKey, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': USER_AGENT, 'x-api-key': apiKey },
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        const next = res.headers.location;
        if (!next) return reject(new Error('Redirect sin location'));
        if (redirectsLeft <= 0) return reject(new Error('Demasiados redirects'));
        return cfGetRaw(next, apiKey, redirectsLeft - 1).then(resolve, reject);
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
// `searchFilter` es el texto libre, `gameId` es 432 (Minecraft) o 0 para any.
// CurseForge acepta filtros como query params directamente en /v1/mods/search.
async function searchProjects({ apiKey, query = '', gameId = 432, projectTypeId, modLoaderType, gameVersion, sortField = 2, sortOrder = 'desc', pageSize = 25, index = 0 } = {}) {
  const q = {
    gameId: String(gameId),
    searchFilter: query,
    pageSize: String(pageSize),
    index: String(index),
    sortField: String(sortField),
    sortOrder,
  };
  if (projectTypeId != null) q.classId = String(projectTypeId);
  if (modLoaderType != null) q.modLoaderType = String(modLoaderType);
  if (gameVersion) q.gameVersion = gameVersion;
  const data = await cfGet('/v1/mods/search', apiKey, q);
  return { data: data.data || [], pagination: data.pagination };
}

// Detalle de un proyecto por id.
async function getProject(apiKey, projectId) {
  const data = await cfGet('/v1/mods/' + encodeURIComponent(projectId), apiKey);
  return data.data;
}

// Archivos (versiones) de un proyecto. Se puede filtrar por gameVersion y modLoaderType.
async function getProjectFiles(apiKey, projectId, { gameVersion, modLoaderType } = {}) {
  const query = {};
  if (gameVersion) query.gameVersion = gameVersion;
  if (modLoaderType != null) query.modLoaderType = String(modLoaderType);
  const data = await cfGet('/v1/mods/' + encodeURIComponent(projectId) + '/files', apiKey, query);
  return data.data || [];
}

// URL de descarga directa de un archivo. CurseForge redirige a CDN.
// `file.downloadUrl` puede ser null (si el mod es de pago o restringido);
// en ese caso usamos `https://edge.forgecdn.net/files/{first4}/{rest}/{fileName}`.
function fileDownloadUrl(file) {
  if (!file) return null;
  if (file.downloadUrl) return file.downloadUrl;
  // CDN URL: https://edge.forgecdn.net/files/<id_first_4>/<id_rest>/<filename>
  const id = String(file.id || '');
  if (id.length < 4 || !file.fileName) return null;
  return `https://edge.forgecdn.net/files/${id.slice(0, 4)}/${id.slice(4)}/${file.fileName}`;
}

// Detalle de un archivo especifico.
async function getFile(apiKey, projectId, fileId) {
  const data = await cfGet('/v1/mods/' + encodeURIComponent(projectId) + '/files/' + encodeURIComponent(fileId), apiKey);
  return data.data;
}

// Construye filtros para una instancia dada.
function buildFiltersForInstance(instance, projectType) {
  const projectTypeId = {
    mod: PROJECT_TYPE_MOD, modpack: PROJECT_TYPE_MODPACK,
    resourcepack: PROJECT_TYPE_RESOURCEPACK, shader: PROJECT_TYPE_SHADER,
  }[projectType || 'mod'];
  const modLoaderType = instance && instance.loader ? LOADER_TYPE_MAP[instance.loader] : undefined;
  const gameVersion = instance && instance.minecraftVersion ? instance.minecraftVersion : undefined;
  return { projectTypeId, modLoaderType, gameVersion };
}

module.exports = {
  LOADER_TYPE_MAP,
  LOADER_TYPE_INVERSE,
  PROJECT_TYPE_MOD, PROJECT_TYPE_MODPACK, PROJECT_TYPE_RESOURCEPACK, PROJECT_TYPE_SHADER,
  PROJECT_TYPE_INVERSE,
  searchProjects,
  getProject,
  getProjectFiles,
  getFile,
  fileDownloadUrl,
  buildFiltersForInstance,
  API_BASE,
  cfGet,
};