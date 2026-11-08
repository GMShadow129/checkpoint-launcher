// Instalador de Vanilla Minecraft.
//
// Descarga e instala una version vanilla completa:
//   1. version.json de Mojang (que dice que libraries/assets/client.jar bajar)
//   2. libraries (filtrando por OS via rules)
//   3. natives (extrayendo los .jar nativos correctos para Windows)
//   4. assets (assets/index.json + cada asset object)
//   5. client.jar (el jar del juego en si)
//
// Lo usan: fabric.js (como base) e instances.js (para instancias vanilla y como base para modloaders).
//
// API:
//   installVanilla(instanceDir, mcVersion, onProgress?)
//     - onProgress(stage, current, total, label)
//       - stage === 'assets' : current/total son cuentas de assets
//       - stage es un numero : bytes descargados del client jar
//   isVanillaInstalled(instanceDir, mcVersion) -> bool
//   vanillaVersionId(mcVersion) -> string (mismo id que usa Mojang)

const fs = require('fs');
const path = require('path');
const https = require('https');
const { downloadToFile } = require('./download');

const MOJANG_VERSION_MANIFEST = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
const RESOURCES_BASE = 'https://resources.download.minecraft.net';
const MOJANG_LIBRARIES_BASE = 'https://libraries.minecraft.net';

// Igual que en otros lados: el id de la version es la MC version (ej: "1.20.1").
function vanillaVersionId(mcVersion) {
  return mcVersion;
}

function httpGetJson(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const doRequest = (u, redirectsLeft) => {
      https.get(u, { headers: { 'User-Agent': 'CheckpointLauncher/0.5' } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          if (redirectsLeft <= 0) return reject(new Error(`Demasiados redirects en ${u}`));
          const next = res.headers.location;
          res.resume();
          if (!next) return reject(new Error(`Redirect sin location en ${u}`));
          return doRequest(next, redirectsLeft - 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} al bajar ${u}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
          catch (e) { reject(e); }
        });
        res.on('error', reject);
      }).on('error', reject);
    };
    doRequest(url, maxRedirects);
  });
}

function libraryPath(lib) {
  // name = group:artifact:version[:classifier]
  const parts = lib.name.split(':');
  if (parts.length < 3) return null;
  const group = parts[0].replace(/\./g, '/');
  const artifact = parts[1];
  const version = parts[2];
  const classifier = parts[3] ? `-${parts[3]}` : '';
  return `${group}/${artifact}/${version}/${artifact}-${version}${classifier}.jar`;
}

function libraryFullUrl(lib) {
  // Preferir URL declarada por Mojang en lib.downloads.artifact.url.
  // Si no esta, armarla a mano.
  if (lib.downloads && lib.downloads.artifact && lib.downloads.artifact.url) {
    return lib.downloads.artifact.url;
  }
  const rel = libraryPath(lib);
  if (!rel) return null;
  return `${MOJANG_LIBRARIES_BASE}/${rel}`;
}

// Determina si una library aplica en este OS segun sus rules.
function libAllowedOnCurrentOs(lib) {
  if (!lib.rules) return true;
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
  let allowed = false;
  let matched = false;
  for (const rule of lib.rules) {
    const action = rule.action; // 'allow' o 'disallow'
    if (rule.os) {
      const osMatch =
        (!rule.os.name || rule.os.name === os) &&
        (!rule.os.arch || rule.os.arch === (process.arch === 'x64' ? 'x86_64' : process.arch));
      if (osMatch) {
        matched = true;
        allowed = (action === 'allow');
      }
    } else {
      // Sin OS, aplica a todos
      matched = true;
      allowed = (action === 'allow');
    }
  }
  return allowed;
}

// Extrae un .jar a una carpeta y devuelve los archivos extraidos.
function extractJar(jarPath, destDir) {
  return new Promise((resolve, reject) => {
    // Usar PowerShell en Windows para extraer (mas simple que agregar adm-zip).
    const cmd = process.platform === 'win32'
      ? `powershell -NoProfile -Command "Add-Type -A System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${jarPath.replace(/'/g, "''")}', '${destDir.replace(/'/g, "''")}')"`
      : `unzip -o "${jarPath}" -d "${destDir}"`;
    const { spawnSync } = require('child_process');
    const r = spawnSync(cmd, { stdio: 'ignore', shell: true });
    if (r.status === 0) resolve();
    else reject(new Error(`No se pudo extraer ${jarPath}`));
  });
}

async function downloadIfMissing(url, dest, onProgress) {
  if (fs.existsSync(dest)) {
    if (onProgress) onProgress(fs.statSync(dest).size);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await downloadToFile(url, dest, onProgress);
}

// Punto de entrada principal.
async function installVanilla(instanceDir, mcVersion, onProgress) {
  const versionId = vanillaVersionId(mcVersion);
  const versionsDir = path.join(instanceDir, 'versions', versionId);
  const versionJsonPath = path.join(versionsDir, `${versionId}.json`);
  const clientJarPath = path.join(versionsDir, `${versionId}.jar`);

  // Si ya esta instalado, salir rapido.
  if (fs.existsSync(versionJsonPath) && fs.existsSync(clientJarPath)) {
    if (onProgress) onProgress(fs.statSync(clientJarPath).size);
    return;
  }

  fs.mkdirSync(versionsDir, { recursive: true });

  // 1) Bajar el version manifest de Mojang y encontrar nuestra version.
  let manifest;
  try {
    manifest = await httpGetJson(MOJANG_VERSION_MANIFEST);
  } catch (e) {
    throw new Error(`No se pudo obtener el manifest de Mojang: ${e.message}`);
  }
  const entry = manifest.versions.find((v) => v.id === mcVersion);
  if (!entry) throw new Error(`Version de Minecraft "${mcVersion}" no encontrada en Mojang.`);

  // 2) Bajar version.json.
  const vJson = await httpGetJson(entry.url);
  fs.writeFileSync(versionJsonPath, JSON.stringify(vJson, null, 2));

  // 3) Bajar client.jar (el jar del juego).
  const clientInfo = vJson.downloads && vJson.downloads.client;
  if (!clientInfo || !clientInfo.url) {
    throw new Error(`version.json no incluye downloads.client para ${mcVersion}`);
  }
  await downloadIfMissing(clientInfo.url, clientJarPath, (bytes) => {
    if (onProgress) onProgress(bytes);
  });

  // 4) Bajar libraries.
  const libsDir = path.join(instanceDir, 'libraries');
  fs.mkdirSync(libsDir, { recursive: true });
  for (const lib of vJson.libraries || []) {
    if (!libAllowedOnCurrentOs(lib)) continue;
    const url = libraryFullUrl(lib);
    if (!url) continue;
    const rel = libraryPath(lib);
    if (!rel) continue;
    const dest = path.join(libsDir, rel);
    await downloadIfMissing(url, dest);
  }

  // 5) Bajar assets.
  const assetIndexInfo = vJson.assetIndex;
  if (assetIndexInfo && assetIndexInfo.url) {
    const assetsDir = path.join(instanceDir, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    const indexDir = path.join(assetsDir, 'indexes');
    fs.mkdirSync(indexDir, { recursive: true });
    const indexPath = path.join(indexDir, assetIndexInfo.id || mcVersion);

    let assetIndex;
    if (fs.existsSync(indexPath)) {
      assetIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } else {
      assetIndex = await httpGetJson(assetIndexInfo.url);
      fs.writeFileSync(indexPath, JSON.stringify(assetIndex, null, 2));
    }

    const objectsDir = path.join(assetsDir, 'objects');
    fs.mkdirSync(objectsDir, { recursive: true });

    const entries = Object.entries(assetIndex.objects || {});
    let i = 0;
    for (const [name, info] of entries) {
      const hash = info.hash;
      const prefix = hash.substring(0, 2);
      const objPath = path.join(objectsDir, prefix, hash);
      const url = `${RESOURCES_BASE}/${prefix}/${hash}`;
      await downloadIfMissing(url, objPath);
      i++;
      if (onProgress && (i % 50 === 0 || i === entries.length)) {
        onProgress('assets', i, entries.length, name);
      }
    }
  }

  // 6) Extraer natives (solo para MC < 1.19; en 1.19+ los natives van metidos en libraries).
  if (vJson.natives && process.platform === 'win32') {
    const nativesDest = path.join(versionsDir, 'natives-windows');
    fs.mkdirSync(nativesDest, { recursive: true });
    for (const lib of vJson.libraries || []) {
      if (!lib.natives || !lib.natives.windows) continue;
      if (!libAllowedOnCurrentOs(lib)) continue;
      const classifier = lib.natives.windows.replace(/\$\{arch\}/g, process.arch === 'arm64' ? 'arm64' : '64');
      const parts = lib.name.split(':');
      parts[3] = classifier;
      const libWithClassifier = { name: parts.join(':') };
      const url = libraryFullUrl(libWithClassifier);
      if (!url) continue;
      const rel = libraryPath(libWithClassifier);
      if (!rel) continue;
      const jarPath = path.join(libsDir, rel);
      if (!fs.existsSync(jarPath)) continue;
      try {
        await extractJar(jarPath, nativesDest);
      } catch (_) {}
    }
  }

  if (onProgress) onProgress(fs.statSync(clientJarPath).size);
}

function isVanillaInstalled(instanceDir, mcVersion) {
  const versionId = vanillaVersionId(mcVersion);
  const versionsDir = path.join(instanceDir, 'versions', versionId);
  return fs.existsSync(path.join(versionsDir, `${versionId}.json`))
    && fs.existsSync(path.join(versionsDir, `${versionId}.jar`));
}

module.exports = {
  installVanilla,
  isVanillaInstalled,
  vanillaVersionId,
};