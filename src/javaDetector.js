// Detector de instalaciones de Java en Windows.
//
// Busca Java en:
//   1. JAVA_HOME (env var)
//   2. Carpetas comunes de instaladores (Eclipse Adoptium, Microsoft, Oracle, Zulu, etc.)
//   3. PATH (usando `where java`)
//
// Para cada candidato, corre `java -version` y parsea la salida (stderr)
// para extraer la version y el vendor.
//
// Devuelve una lista de { path, version, vendor, source } ordenada por version desc.

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Carpetas comunes donde los instaladores de Java suelen poner JDKs.
const COMMON_JAVA_DIRS = [
  'C:\\Program Files\\Java',
  'C:\\Program Files\\Eclipse Adoptium',
  'C:\\Program Files\\Microsoft',
  'C:\\Program Files\\Zulu',
  'C:\\Program Files\\BellSoft',
  'C:\\Program Files\\Eclipse Foundation',
  'C:\\Program Files\\AdoptOpenJDK',
  'C:\\Program Files (x86)\\Java',
  'C:\\Program Files (x86)\\Eclipse Adoptium',
  'C:\\Program Files (x86)\\Microsoft',
  'C:\\Program Files (x86)\\Zulu',
  'C:\\Program Files (x86)\\BellSoft',
];

// Devuelve la info de un java.exe (o null si no se puede leer).
// Output tipico de `java -version` (en stderr):
//   openjdk version "21.0.2" 2024-01-16
//   OpenJDK Runtime Environment Temurin-21.0.2+13 (build 21.0.2+13)
//   Eclipse Adoptium OpenJDK 64-Bit Server VM Temurin-21.0.2+13 (build 21.0.2+13, mixed mode, sharing)
function getJavaInfo(javaPath) {
  return new Promise((resolve) => {
    try {
      const proc = spawnSync(javaPath, ['-version'], { encoding: 'utf-8' });
      if (proc.status !== 0) return resolve(null);
      const output = (proc.stderr || proc.stdout || '').split('\n');
      const versionLine = output[0] || '';
      const match = versionLine.match(/version "([^"]+)"/);
      const version = match ? match[1] : 'desconocida';
      const full = output.join(' ');
      // Vendor: detectamos por palabras clave comunes.
      let vendor = 'Java';
      if (/Temurin/i.test(full)) vendor = 'Eclipse Temurin';
      else if (/Zulu/i.test(full)) vendor = 'Azul Zulu';
      else if (/Microsoft/i.test(full)) vendor = 'Microsoft';
      else if (/GraalVM/i.test(full)) vendor = 'GraalVM';
      else if (/IBM/i.test(full)) vendor = 'IBM';
      else if (/Corretto/i.test(full)) vendor = 'Amazon Corretto';
      else if (/Semeru/i.test(full)) vendor = 'IBM Semeru';
      else if (/OpenJDK/i.test(full)) vendor = 'OpenJDK';
      else if (/Oracle/i.test(full)) vendor = 'Oracle';
      // Major version para sorting.
      const majorMatch = version.match(/^(\d+)(?:\.(\d+))?/);
      const major = majorMatch ? parseInt(majorMatch[1], 10) : 0;
      resolve({ version, major, vendor, path: javaPath });
    } catch (_) {
      resolve(null);
    }
  });
}

function findJavaExeInDir(dir) {
  // Si `dir` ya es un archivo (java.exe), devolverlo.
  if (fs.existsSync(dir)) {
    const stat = fs.statSync(dir);
    if (stat.isFile() && dir.toLowerCase().endsWith('java.exe')) return dir;
  }
  // Si es directorio, buscar bin\java.exe adentro.
  if (fs.existsSync(dir)) {
    const stat = fs.statSync(dir);
    if (stat.isDirectory()) {
      const exe = path.join(dir, 'bin', 'java.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return null;
}

async function detectAllJava() {
  const found = [];
  const seen = new Set();

  function addIfValid(p, source) {
    if (!p || seen.has(p)) return;
    seen.add(p);
    if (!fs.existsSync(p)) return;
    return getJavaInfo(p).then((info) => {
      if (info) found.push({ ...info, source });
    });
  }

  // 1. JAVA_HOME
  if (process.env.JAVA_HOME) {
    const p = findJavaExeInDir(process.env.JAVA_HOME);
    if (p) await addIfValid(p, 'JAVA_HOME');
  }

  // 2. Carpetas comunes
  const subdirPromises = [];
  for (const dir of COMMON_JAVA_DIRS) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory() && !e.isSymbolicLink()) continue;
        const full = path.join(dir, e.name);
        const exe = path.join(full, 'bin', 'java.exe');
        if (fs.existsSync(exe) && !seen.has(exe)) {
          seen.add(exe);
          subdirPromises.push(getJavaInfo(exe).then((info) => {
            if (info) found.push({ ...info, source: dir });
          }));
        }
      }
    } catch (_) {}
  }
  await Promise.all(subdirPromises);

  // 3. PATH (where java)
  try {
    const where = execSync('where java', { encoding: 'utf-8', shell: true });
    for (const line of where.split('\n')) {
      const p = line.trim();
      if (p && !seen.has(p) && fs.existsSync(p)) {
        seen.add(p);
        const info = await getJavaInfo(p);
        if (info) found.push({ ...info, source: 'PATH' });
      }
    }
  } catch (_) {}

  // Sort por major version desc, despues por vendor.
  found.sort((a, b) => {
    if (a.major !== b.major) return b.major - a.major;
    return a.vendor.localeCompare(b.vendor);
  });

  return found;
}

// Reglas de Minecraft para sugerir una Java:
//   MC <= 1.16.5 -> Java 8
//   MC 1.17 - 1.20.4 -> Java 17
//   MC 1.20.5+ -> Java 21
function suggestedJavaMajor(mcVersion) {
  if (!mcVersion) return 17;
  // Parsear major.minor (1.20.5 -> [1, 20, 5])
  const parts = mcVersion.split('.').map((p) => parseInt(p, 10) || 0);
  if (parts.length < 2) return 17;
  const [major, minor] = parts;
  if (major !== 1) return 17; // Futuras MC usarán 21+
  if (minor < 17) return 8;
  if (minor < 20 || (minor === 20 && parts[2] !== undefined && parts[2] < 5)) return 17;
  return 21;
}

// Devuelve la mejor Java detectada para una MC version dada.
// Si encuentra una con major >= la sugerida, devuelve la primera (mayor).
// Si no, devuelve la mas nueva disponible.
function pickBestJava(detected, mcVersion) {
  if (!detected || detected.length === 0) return null;
  const suggested = suggestedJavaMajor(mcVersion);
  const compatible = detected.filter((j) => j.major >= suggested);
  if (compatible.length > 0) return compatible[0]; // ya esta ordenada por major desc
  return detected[0]; // fallback
}

module.exports = {
  detectAllJava,
  getJavaInfo,
  findJavaExeInDir,
  suggestedJavaMajor,
  pickBestJava,
};