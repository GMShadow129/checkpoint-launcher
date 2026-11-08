// scripts/install-electron.js
// Script robusto para descargar Electron manualmente, sin depender de @electron/get ni lifecycle scripts de npm.
// Se ejecuta automaticamente despues de npm install (definido en package.json -> scripts.postinstall).

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const version = require('../node_modules/electron/package.json').version;

// Detectar plataforma
function detectPlatform() {
  const p = process.platform;
  if (p === 'win32') return { os: 'win32', archive: 'zip', exe: 'electron.exe' };
  if (p === 'darwin') return { os: 'darwin', archive: 'zip', exe: 'Electron.app/Contents/MacOS/Electron' };
  return { os: 'linux', archive: 'zip', exe: 'electron' };
}

const { os: electronOs, archive, exe: electronExeName } = detectPlatform();
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

const electronRoot = path.resolve(__dirname, '..', 'node_modules', 'electron');
const distPath = path.join(electronRoot, 'dist');
const electronExe = path.join(distPath, electronExeName);
const stampFile = path.join(electronRoot, 'install-version-stamp');

console.log(`\n[install-electron] Versión requerida: ${version}`);
console.log(`[install-electron] Plataforma: ${electronOs}-${arch}`);

// Verificar si ya está instalado y validar tamaño
if (fs.existsSync(electronExe) && fs.existsSync(stampFile)) {
  try {
    const installedVersion = fs.readFileSync(stampFile, 'utf8').trim();
    if (installedVersion === version) {
      const stat = fs.statSync(electronExe);
      // Electron.exe vale ~180 MB. Si es menor a 50 MB, está corrupto.
      if (stat.size > 50 * 1024 * 1024) {
        console.log(`[install-electron] ✓ Electron ${version} ya está instalado en:`);
        console.log(`[install-electron]   ${electronExe} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
        process.exit(0);
      } else {
        console.log(`[install-electron] El binario existe pero es demasiado pequeño (${stat.size} bytes). Re-descargando...`);
      }
    }
  } catch (_) {}
}

// Borrar path.txt si existe (Electron a veces lo crea y apunta a otro lado)
const pathTxt = path.join(electronRoot, 'path.txt');
if (fs.existsSync(pathTxt)) {
  try {
    fs.unlinkSync(pathTxt);
    console.log(`[install-electron] ⚠ Eliminado path.txt previo (puede haber tenido contenido incorrecto).`);
  } catch (_) {}
}

// Validar también que el path.txt actual (si existe) apunta al binario correcto
if (fs.existsSync(pathTxt) && fs.existsSync(electronExe)) {
  try {
    const currentPathTxtContent = fs.readFileSync(pathTxt, 'utf8').trim();
    if (currentPathTxtContent !== electronExeName) {
      console.log(`[install-electron] ⚠ path.txt contiene "${currentPathTxtContent}" pero debería ser "${electronExeName}". Se va a corregir.`);
    }
  } catch (_) {}
}

console.log(`[install-electron] No se encontró binario. Descargando...`);

// Construir URL del release
const downloadUrl = `https://github.com/electron/electron/releases/download/v${version}/electron-v${version}-${electronOs}-${arch}.${archive}`;
console.log(`[install-electron] URL: ${downloadUrl}`);

// Asegurar que la carpeta dist existe
fs.mkdirSync(distPath, { recursive: true });

const zipPath = path.join(distPath, `electron.${archive}`);

// Limpiar dist previo para empezar limpio
if (fs.existsSync(distPath)) {
  try {
    const entries = fs.readdirSync(distPath);
    for (const entry of entries) {
      const full = path.join(distPath, entry);
      try {
        fs.rmSync(full, { recursive: true, force: true });
      } catch (_) {}
    }
  } catch (_) {}
}

// Descargar con PowerShell (BITS o Invoke-WebRequest como fallback)
console.log(`[install-electron] Descargando ${downloadUrl} ...`);
const downloadCmd = process.platform === 'win32'
  ? `powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { [System.Net.WebClient]::new().DownloadFile('${downloadUrl}', '${zipPath.replace(/\\/g, '\\\\')}') } catch { try { Invoke-WebRequest -Uri '${downloadUrl}' -OutFile '${zipPath.replace(/\\/g, '\\\\')}' -UseBasicParsing } catch { exit 1 } }; if (-not (Test-Path '${zipPath.replace(/\\/g, '\\\\')}')) { exit 1 }; Write-Host 'Descarga OK'"`
  : `curl -L "${downloadUrl}" -o "${zipPath}"`;

const dl = spawnSync(downloadCmd, { stdio: 'inherit', shell: true });
if (dl.status !== 0) {
  console.error(`[install-electron] ERROR: la descarga falló (exit ${dl.status}).`);
  console.error(`[install-electron] Verificá tu conexión a internet.`);
  try { fs.unlinkSync(zipPath); } catch (_) {}
  process.exit(1);
}

if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size < 100000) {
  console.error(`[install-electron] ERROR: el archivo descargado no parece válido (tamaño muy pequeño).`);
  try { fs.unlinkSync(zipPath); } catch (_) {}
  process.exit(1);
}

console.log(`[install-electron] Descarga completa. Extrayendo...`);

// Extraer
let extractOk = false;
if (process.platform === 'win32') {
  const extractCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '${zipPath.replace(/\\/g, '\\\\')}' -DestinationPath '${distPath.replace(/\\/g, '\\\\')}' -Force"`;
  const ex = spawnSync(extractCmd, { stdio: 'inherit', shell: true });
  extractOk = ex.status === 0;
} else {
  try {
    execSync(`unzip -o "${zipPath}" -d "${distPath}"`, { stdio: 'inherit' });
    extractOk = true;
  } catch (_) {
    extractOk = false;
  }
}

if (!extractOk) {
  console.error(`[install-electron] ERROR: no se pudo extraer el zip.`);
  try { fs.unlinkSync(zipPath); } catch (_) {}
  process.exit(1);
}

// Limpiar zip
try { fs.unlinkSync(zipPath); } catch (_) {}

// Limpiar carpetas "extra" si quedaron (Electron a veces mete stuff en subcarpetas)
try {
  const entries = fs.readdirSync(distPath);
  // Si Electron metió todo dentro de dist/, movelo un nivel arriba
  if (entries.length === 1 && fs.statSync(path.join(distPath, entries[0])).isDirectory()) {
    const inner = path.join(distPath, entries[0]);
    const innerEntries = fs.readdirSync(inner);
    for (const ie of innerEntries) {
      fs.renameSync(path.join(inner, ie), path.join(distPath, ie));
    }
    fs.rmdirSync(inner);
    console.log(`[install-electron] Estructura de carpetas normalizada.`);
  }
} catch (_) {}

// Verificar que el ejecutable existe y tiene tamaño razonable
if (!fs.existsSync(electronExe)) {
  console.error(`[install-electron] ERROR: después de la extracción, no se encontró ${electronExe}`);
  process.exit(1);
}
const finalStat = fs.statSync(electronExe);
if (finalStat.size < 50 * 1024 * 1024) {
  console.error(`[install-electron] ERROR: el binario descargado es demasiado pequeño (${finalStat.size} bytes). Probablemente se descargó una página HTML de error en vez del zip real.`);
  process.exit(1);
}

// Asegurarnos que NO existe path.txt viejo (puede hacer que Electron busque en otro lado)
if (fs.existsSync(pathTxt)) {
  try { fs.unlinkSync(pathTxt); } catch (_) {}
}

// CRÍTICO: electron's index.js REQUIERE un path.txt que diga el nombre del binario dentro de dist/.
// Sin este archivo, index.js tira 'Electron failed to install correctly' aunque el binario esté ahí.
// (El postinstall oficial de electron lo crea; nosotros tenemos que hacerlo manualmente.)
fs.writeFileSync(pathTxt, electronExeName, 'utf8');
console.log(`[install-electron] ✓ Creado path.txt con contenido: "${electronExeName}"`);

// Escribir stamp
fs.writeFileSync(stampFile, version, 'utf8');

console.log(`\n[install-electron] ✓✓✓ Electron ${version} instalado correctamente:`);
console.log(`[install-electron]   ${electronExe}\n`);