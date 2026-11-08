// Metadata de versiones para instancias personalizadas.
//
// Centraliza los fetcher de manifests de:
//   - Vanilla Minecraft (Mojang)
//   - Forge
//   - NeoForge
//   - Fabric
//
// Todos cachean en memoria por un rato para no pegarle a las APIs cada vez que
// el user abre el modal. Si Mojang/Forge se caen, devolvemos el cache aunque
// este vencido (mejor mostrar versiones viejas que un modal vacio).

const MOJANG_VERSION_MANIFEST = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
const FORGE_MAVEN_METADATA = 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml';
const NEOFORGE_MAVEN_METADATA = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';
const FABRIC_LOADER_BASE = 'https://meta.fabricmc.net/v2/versions/loader';
const FABRIC_YARN_BASE = 'https://meta.fabricmc.net/v2/versions/yarn';

const TTL_MS = 30 * 60 * 1000; // 30 minutos

const cache = {
  mojang: { ts: 0, data: null },
  forge: { ts: 0, data: null },
  neoforge: { ts: 0, data: null }
};

function isFresh(entry) {
  return entry.data && Date.now() - entry.ts < TTL_MS;
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} al bajar ${url}`);
  return r.json();
}

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} al bajar ${url}`);
  return r.text();
}

// Parsea un maven-metadata.xml y devuelve { versions: ['1.20.1-47.3.0', ...], latest: '...' }.
function parseMavenMetadata(xml) {
  const versions = [];
  const versionMatches = [...xml.matchAll(/<version>([^<]+)<\/version>/g)];
  for (const m of versionMatches) versions.push(m[1]);
  const latestMatch = xml.match(/<latest>([^<]+)<\/latest>/);
  const releaseMatch = xml.match(/<release>([^<]+)<\/release>/);
  return {
    versions,
    latest: latestMatch ? latestMatch[1] : (versions[versions.length - 1] || null),
    release: releaseMatch ? releaseMatch[1] : null
  };
}

// Devuelve [{ id, type, releaseTime }, ...] filtrado a releases.
// Por defecto Mojang devuelve snapshots, old_beta y old_alpha tambien.
async function listMinecraftVersions() {
  if (isFresh(cache.mojang)) return cache.mojang.data;
  try {
    const manifest = await fetchJson(MOJANG_VERSION_MANIFEST);
    const data = (manifest.versions || [])
      .filter((v) => v.type === 'release')
      .map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }));
    cache.mojang = { ts: Date.now(), data };
    return data;
  } catch (err) {
    if (cache.mojang.data) return cache.mojang.data; // fallback a cache viejo
    throw err;
  }
}

// Devuelve los Forge versions disponibles para una MC version dada.
// Forge usa 'mc-forgeVer' (ej: '1.20.1-47.3.0') como id de version.
async function listForgeVersions(mcVersion) {
  if (!isFresh(cache.forge)) {
    try {
      const xml = await fetchText(FORGE_MAVEN_METADATA);
      cache.forge = { ts: Date.now(), data: parseMavenMetadata(xml) };
    } catch (err) {
      if (cache.forge.data) {
        // seguimos con cache viejo
      } else {
        throw err;
      }
    }
  }
  const prefix = `${mcVersion}-`;
  const matching = cache.forge.data.versions.filter((v) => v.startsWith(prefix));
  // Tambien devolvemos 'latest' (Forge suele marcar uno como latest).
  return {
    versions: matching,
    recommended: matching.includes(cache.forge.data.release) ? cache.forge.data.release : null,
    latest: matching.includes(cache.forge.data.latest) ? cache.forge.data.latest : null
  };
}

// Mapeo oficial NeoForge: prefix de version -> MC version.
// Source: https://neoforged.net (documentacion oficial y changelogs).
// NeoForge NO tiene versiones para 1.20.1 (arranco en 1.20.2). Si sale
// una nueva MC version, agregala aca.
const NEOFORGE_PREFIX_TO_MC = {
  '20.2': '1.20.2',
  '20.3': '1.20.3',
  '20.4': '1.20.4',
  '20.5': '1.20.5',
  '20.6': '1.20.6',
  '21.0': '1.21.0',
  '21.1': '1.21.1',
  '21.2': '1.21.2',
  '21.3': '1.21.3',
  '21.4': '1.21.4',
  '21.5': '1.21.5',
  '21.6': '1.21.6',
  '21.7': '1.21.7',
  '21.8': '1.21.8',
  '21.9': '1.21.9',
  '21.10': '1.21.10',
  '21.11': '1.21.11'
};

// Filtra las versiones de NeoForge para una MC version dada.
async function listNeoForgeVersions(mcVersion) {
  if (!isFresh(cache.neoforge)) {
    try {
      const xml = await fetchText(NEOFORGE_MAVEN_METADATA);
      cache.neoforge = { ts: Date.now(), data: parseMavenMetadata(xml) };
    } catch (err) {
      if (cache.neoforge.data) {
        // seguimos
      } else {
        throw err;
      }
    }
  }
  // Filtramos versiones cuyo prefix corresponde a mcVersion.
  // Formato version: '47.3.5' -> prefix '47.3'.
  const matching = cache.neoforge.data.versions.filter((v) => {
    // Tomamos los primeros dos segmentos numericos del version.
    const m = /^(\d+\.\d+)\./.exec(v);
    if (!m) return false;
    const prefix = m[1];
    return NEOFORGE_PREFIX_TO_MC[prefix] === mcVersion;
  });
  return {
    versions: matching.slice().reverse(), // mas recientes primero
    recommended: matching.includes(cache.neoforge.data.release) ? cache.neoforge.data.release : null,
    latest: matching.includes(cache.neoforge.data.latest) ? cache.neoforge.data.latest : null
  };
}

// Devuelve los Fabric loader versions disponibles para una MC version.
// Devuelve [] si Fabric no soporta esa version.
async function listFabricLoaderVersions(mcVersion) {
  const url = `${FABRIC_LOADER_BASE}/${encodeURIComponent(mcVersion)}`;
  try {
    const arr = await fetchJson(url);
    return (arr || []).map((e) => ({
      version: e.loader.version,
      stable: e.loader.stable
    }));
  } catch (err) {
    if (err.message && err.message.includes('404')) return [];
    throw err;
  }
}

module.exports = {
  listMinecraftVersions,
  listForgeVersions,
  listNeoForgeVersions,
  listFabricLoaderVersions,
  // Exportados por si utiles desde otros modulos.
  FABRIC_LOADER_BASE,
  FABRIC_YARN_BASE
};