// Manejo del runtime de Java.
//
// Minecraft 1.18 - 1.20.4 necesita Java 17.
// Minecraft 1.20.5+ y 1.21.x necesita Java 21 (algunos packs 1.20.5 tambien piden 21).
// Para Forge/Fabric nunca hace falta JDK completo, alcanza con JRE.
// Usamos Adoptium Temurin (Eclipse) porque es el JRE que Mojang recomienda oficialmente
// para Minecraft y la URL es estable.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { downloadToFile } = require('./download');

// Devuelve el numero mayor de Java que necesita una version de Minecraft.
// Si el manifest no lo especifica, lo inferimos por version de MC.
function requiredJavaMajor(mcVersion) {
  // Parsea "1.20.1" -> { major: 1, minor: 20, patch: 1 }
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(mcVersion);
  if (!m) return 17;
  const minor = parseInt(m[2], 10);
  const patch = parseInt(m[3] || '0', 10);

  // 1.20.5+ pide Java 21 (Forge 1.20.5 lo confirma).
  if (minor > 20) return 21;
  if (minor === 20 && patch >= 5) return 21;
  return 17;
}

// Carpeta local donde guardamos los JRE descargados.
// Queda asi: userData/runtime/jre-<major>/
function runtimeDir(javaMajor) {
  return path.join(app.getPath('userData'), 'runtime', `jre-${javaMajor}`);
}

// Path al binario java dentro de la carpeta extraida.
// Adoptium zip tiene estructura: jdk-17.0.X/bin/java.exe (Windows)
//                                jdk-17.0.X/Contents/Home/bin/java (macOS)
//                                jdk-17.0.X/bin/java (Linux)
// Nosotros descargamos JRE asi que es: jre-17.0.X/bin/java.exe
function javaBinaryPath(javaMajor) {
  const dir = runtimeDir(javaMajor);
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir);
  // El primer subdirectorio es el root del JRE/JDK.
  const root = entries.find((e) => fs.statSync(path.join(dir, e)).isDirectory());
  if (!root) return null;
  const binDir = path.join(dir, root, 'bin');
  if (!fs.existsSync(binDir)) return null;

  // Preferimos el binario de nuestra plataforma; si no esta, probamos el otro.
  // Esto cubre casos como: zip de Windows bajado en sandbox Linux durante testing.
  const candidates = process.platform === 'win32'
    ? ['java.exe', 'java']
    : ['java', 'java.exe'];
  for (const name of candidates) {
    const p = path.join(binDir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Devuelve la URL del JRE Adoptium para Windows x64.
// Adoptium expone una API que redirige al binario mas reciente del major pedido.
function adoptiumUrl(javaMajor) {
  return `https://api.adoptium.net/v3/binary/latest/${javaMajor}/ga/windows/x64/jre/hotspot/normal/eclipse?project=jdk`;
}

// Download via shared helper (handles 301/302/303/307/308).

// Asegura que el JRE este descargado y devuelve el path a java.exe.
// Si ya estaba descargado, lo devuelve sin re-descargar.
// onProgress(bytes, totalBytes) se llama durante la descarga.
async function ensureJava(mcVersion, onProgress) {
  const major = requiredJavaMajor(mcVersion);
  const existing = javaBinaryPath(major);
  if (existing && fs.existsSync(existing)) {
    return existing;
  }

  const dir = runtimeDir(major);
  const zipPath = path.join(dir, `jre-${major}.zip`);
  const url = adoptiumUrl(major);

  // Descargamos el zip entero.
  await downloadToFile(url, zipPath, (bytes) => {
    if (onProgress) onProgress(bytes, 0);
  });

  // Extraemos el zip. Adoptium pone todo dentro de un unico directorio
  // raiz (jre-17.0.X/), asi que extraemos en la misma carpeta.
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(dir, /* overwrite */ true);

  // Borramos el zip para no ocupar espacio innecesario.
  try { fs.unlinkSync(zipPath); } catch (_) {}

  const bin = javaBinaryPath(major);
  if (!bin || !fs.existsSync(bin)) {
    throw new Error(`No se encontro java.exe despues de extraer el JRE en ${dir}`);
  }
  return bin;
}

module.exports = {
  requiredJavaMajor,
  ensureJava,
  javaBinaryPath,
  // Exportado por si otra pieza necesita el directorio.
  runtimeDir
};