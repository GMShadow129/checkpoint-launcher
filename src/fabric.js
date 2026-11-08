// Instalador de Fabric.
//
// Fabric NO usa un installer .jar como Forge/NeoForge. En su lugar:
//   1. Pedimos un "profile" JSON a la API de Fabric Meta.
//   2. Ese profile dice que hereda de la MC version vanilla, incluye libs
//      adicionales (asm, fabric-loader, sponge-mixin, intermediary) y declara
//      su propio mainClass.
//   3. Nosotros: instalamos vanilla, bajamos las libs adicionales, y armamos
//      el launch con el mainClass de Fabric.

const fs = require('fs');
const path = require('path');
const { installVanilla } = require('./minecraft');
const { downloadToFile } = require('./download');

const FABRIC_PROFILE_URL = (mcVersion, loaderVersion) =>
  `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`;

function fabricId(mcVersion, loaderVersion) {
  return `fabric-loader-${loaderVersion}-${mcVersion}`;
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} al bajar ${url}`);
  return r.json();
}

// Construye la URL de un artifact Maven a partir de su coordenada y un base URL.
// 'https://maven.fabricmc.net/' + 'org/ow2/asm/asm/9.6' + '/' + 'asm-9.6.jar'.
function mavenJarUrl(baseUrl, coord) {
  const parts = coord.split(':');
  if (parts.length < 3) return null;
  const group = parts[0].replace(/\./g, '/');
  const artifact = parts[1];
  const version = parts[2];
  const cleanedBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  return `${cleanedBase}${group}/${artifact}/${version}/${artifact}-${version}.jar`;
}

// Instala Fabric en instanceDir. mcVersion y loaderVersion son obligatorios.
// Asume que installVanilla ya bajo vanilla. Igual lo llamamos si falta.
async function installFabric(instanceDir, mcVersion, loaderVersion) {
  const fId = fabricId(mcVersion, loaderVersion);
  const fDir = path.join(instanceDir, 'versions', fId);
  const fJsonPath = path.join(fDir, `${fId}.json`);

  if (!fs.existsSync(fJsonPath)) {
    // 1) Vanilla primero (Fabric hereda de el).
    await installVanilla(instanceDir, mcVersion);

    // 2) Bajar el profile JSON de Fabric.
    const profile = await fetchJson(FABRIC_PROFILE_URL(mcVersion, loaderVersion));
    fs.mkdirSync(fDir, { recursive: true });
    fs.writeFileSync(fJsonPath, JSON.stringify(profile, null, 2));

    // 3) Bajar libs adicionales en libraries/.
    const libsDir = path.join(instanceDir, 'libraries');
    for (const lib of profile.libraries || []) {
      const baseUrl = lib.url || 'https://maven.fabricmc.net/';
      // Si la lib trae downloads.artifact.url lo usamos.
      let url = (lib.downloads && lib.downloads.artifact && lib.downloads.artifact.url) || null;
      if (!url) url = mavenJarUrl(baseUrl, lib.name);
      if (!url) continue;

      const parts = lib.name.split(':');
      const dest = path.join(libsDir, `${parts[1]}-${parts[2]}.jar`);
      // Algunos fabric libs terminan en .pom en vez de .jar; nos aseguramos .jar.
      if (!dest.endsWith('.jar')) continue;
      if (fs.existsSync(dest)) continue;
      await downloadToFile(url, dest);
    }
  }
}

function isFabricInstalled(instanceDir, mcVersion, loaderVersion) {
  const fId = fabricId(mcVersion, loaderVersion);
  return fs.existsSync(path.join(instanceDir, 'versions', fId, `${fId}.json`));
}

module.exports = {
  installFabric,
  fabricId,
  isFabricInstalled,
  FABRIC_PROFILE_URL
};