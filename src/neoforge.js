// Instalador de NeoForge.
//
// NeoForge es el fork de Forge para 1.20.4+. Usa el mismo patron que Forge:
//   1. Bajar el installer .jar desde Maven.
//   2. Correrlo con `java -jar installer.jar -installClient <dir>`.
//
// Las URLs son:
//   https://maven.neoforged.net/releases/net/neoforged/neoforge/<version>/neoforge-<version>-installer.jar
//
// El version ID que declara NeoForge en su version.json tiene el formato:
//   <mc>-neoforge-<ver>  (igual que Forge: <mc>-forge-<ver>)
//
// Ejemplo: para neoforge "21.5.65-beta" sobre MC 1.21.5, el id es "1.21.5-neoforge-21.5.65-beta".

const fs = require('fs');
const path = require('path');
const { downloadToFile } = require('./download');
const { ensureLauncherProfile } = require('./launcherProfile');

function neoforgeInstallerUrl(neoforgeVersion) {
  return `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoforgeVersion}/neoforge-${neoforgeVersion}-installer.jar`;
}

function runProcess(bin, args, cwd, onLog) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const proc = spawn(bin, args, { cwd: cwd || process.cwd(), windowsHide: true });
    let stderr = '';
    proc.stdout.on('data', (d) => {
      const text = d.toString();
      process.stdout.write(`[neoforge] ${text}`);
      if (onLog) onLog(text.trim(), false);
    });
    proc.stderr.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      process.stderr.write(`[neoforge] ${text}`);
      if (onLog) onLog(text.trim(), true);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`NeoForge installer salio con codigo ${code}\n${stderr}`));
    });
  });
}

// La logica para saber si NeoForge ya esta instalado requiere conocer la MC version.
// Pero la API de instances.js nos pasa solo el loaderVersion. Asi que hacemos una
// busqueda: miramos todas las subcarpetas de versions/ que terminen en "-neoforge-<loaderVersion>"
// y contienen un .json valido.
function findInstalledNeoForge(instanceDir, neoforgeVersion) {
  const versionsDir = path.join(instanceDir, 'versions');
  if (!fs.existsSync(versionsDir)) return null;
  const suffix = `-neoforge-${neoforgeVersion}`;
  const entries = fs.readdirSync(versionsDir);
  for (const entry of entries) {
    if (!entry.endsWith(suffix)) continue;
    const json = path.join(versionsDir, entry, `${entry}.json`);
    if (fs.existsSync(json)) return entry;
  }
  return null;
}

function isNeoForgeInstalled(instanceDir, neoforgeVersion) {
  return findInstalledNeoForge(instanceDir, neoforgeVersion) !== null;
}

async function installNeoForge(javaBin, instanceDir, neoforgeVersion, onLog) {
  if (isNeoForgeInstalled(instanceDir, neoforgeVersion)) {
    return;
  }

  // NeoForge installer tambien exige launcher_profiles.json.
  ensureLauncherProfile(instanceDir);

  const tempInstaller = path.join(instanceDir, `neoforge-${neoforgeVersion}-installer.jar`);
  const url = neoforgeInstallerUrl(neoforgeVersion);

  await downloadToFile(url, tempInstaller);

  // Mismo flag que Forge: -installClient (con un guion).
  await runProcess(javaBin, ['-jar', tempInstaller, '-installClient', instanceDir], instanceDir, onLog);

  try { fs.unlinkSync(tempInstaller); } catch (_) {}
}

module.exports = {
  installNeoForge,
  neoforgeInstallerUrl,
  isNeoForgeInstalled,
  findInstalledNeoForge,
};