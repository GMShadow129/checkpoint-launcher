// Instala Forge usando su instalador oficial (forge-<mc>-<ver>-installer.jar).
// Forge expone un modo CLI: `java -jar <installer>.jar -installClient <dir>`
// que arma todo: copia el vanilla.jar, descarga las libraries extra de Forge,
// y deja el perfil listo para correr.
//
// Esto es mas robusto que parsear el perfil de Forge a mano, porque Forge hace
// validaciones (sha1, exclusion de libraries duplicadas, etc.) que son faciles
// de romper artesanalmente.

const fs = require('fs');
const path = require('path');
const https = require('https');
const { downloadToFile } = require('./download');
const { ensureLauncherProfile } = require('./launcherProfile');

// (downloadToFile viene del helper compartido que maneja 301/302/303/307/308.)

// URL del Maven de Forge. El patron es:
// https://maven.minecraftforge.net/net/minecraftforge/forge/<mc>-<ver>/forge-<mc>-<ver>-installer.jar
function forgeInstallerUrl(mcVersion, forgeVersion) {
  return `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeVersion}/forge-${mcVersion}-${forgeVersion}-installer.jar`;
}

function forgeUniversalUrl(mcVersion, forgeVersion) {
  return `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeVersion}/forge-${mcVersion}-${forgeVersion}-universal.jar`;
}

function runProcess(bin, args, cwd, onLog) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const proc = spawn(bin, args, { cwd: cwd || process.cwd(), windowsHide: true });
    let stderr = '';
    proc.stdout.on('data', (d) => {
      const text = d.toString();
      process.stdout.write(`[forge] ${text}`);
      if (onLog) onLog(text.trim(), false);
    });
    proc.stderr.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      process.stderr.write(`[forge] ${text}`);
      if (onLog) onLog(text.trim(), true);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Forge installer salio con codigo ${code}\n${stderr}`));
    });
  });
}

// Verifica que Forge ya este instalado mirando si existe el archivo de version
// que Forge genera tras correr el installer. Para Forge 1.20.1+, el jar
// binpatcheado esta en libraries/, no en versions/, asi que solo chequeamos el .json.
function isForgeInstalled(instanceDir, mcVersion, forgeVersion) {
  const fId = forgeVersionId(mcVersion, forgeVersion);
  const dir = path.join(instanceDir, 'versions', fId);
  const jsonPath = path.join(dir, `${fId}.json`);
  return fs.existsSync(jsonPath);
}

// Corre `java -jar <installer> -installClient <instanceDir>`.
// Necesita el path absoluto al binario java (de src/java.js).
async function installForge(javaBin, instanceDir, mcVersion, forgeVersion, onLog) {
  if (isForgeInstalled(instanceDir, mcVersion, forgeVersion)) {
    return;
  }

  // Forge installer exige que exista launcher_profiles.json; sin el aborta.
  ensureLauncherProfile(instanceDir);

  const tempInstaller = path.join(instanceDir, `forge-${mcVersion}-${forgeVersion}-installer.jar`);
  const url = forgeInstallerUrl(mcVersion, forgeVersion);

  await downloadToFile(url, tempInstaller);

  // Forge installer's CLI flag es `-installClient` (con un guion), no `--installClient`.
  await runProcess(javaBin, ['-jar', tempInstaller, '-installClient', instanceDir], instanceDir, onLog);

  // Limpiamos el installer; ya no lo necesitamos.
  try { fs.unlinkSync(tempInstaller); } catch (_) {}
}

// Devuelve el ID de version que Forge declara en su version.json.
// Forge usa el formato "<mc>-forge-<ver>" (ej: "1.20.1-forge-47.2.0").
function forgeVersionId(mcVersion, forgeVersion) {
  return `${mcVersion}-forge-${forgeVersion}`;
}

module.exports = {
  installForge,
  forgeInstallerUrl,
  forgeUniversalUrl,
  forgeVersionId,
  isForgeInstalled
};