// Helper para descargar e instalar mods de eventos automaticamente
// Soporta:
// 1. URLs de Modrinth (https://modrinth.com/mod/slug)
// 2. URLs de CurseForge (https://www.curseforge.com/minecraft/mc-mods/slug)
// 3. URLs directas a archivos .jar
// 4. Slugs / nombres simples de mods

const fs = require('fs');
const path = require('path');
const { downloadToFile } = require('./download');
const modrinth = require('./modrinth');
const curseforge = require('./curseforge');

function getModsDir(instanceDir) {
  const dir = path.join(instanceDir, 'mods');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extractModrinthSlug(input) {
  const m = input.match(/modrinth\.com\/mod\/([a-zA-Z0-9_\-]+)/i);
  return m ? m[1] : null;
}

function extractCurseForgeSlug(input) {
  const m = input.match(/curseforge\.com\/minecraft\/mc-mods\/([a-zA-Z0-9_\-]+)/i);
  return m ? m[1] : null;
}

async function installFromModrinth(slug, instance, modsDir, onProgress) {
  const mcVersion = instance.minecraftVersion || '1.20.1';
  const loader = (instance.loader || 'fabric').toLowerCase();

  const versions = await modrinth.getProjectVersions(slug, {
    loader: loader === 'vanilla' ? undefined : loader,
    gameVersion: mcVersion,
  });

  if (!versions || versions.length === 0) {
    throw new Error(`No se encontró versión compatible en Modrinth para MC ${mcVersion} (${loader})`);
  }

  // Tomamos la primera versión compatible (más reciente)
  const ver = versions[0];
  const url = modrinth.primaryDownloadUrl(ver);
  const filename = modrinth.primaryFilename(ver);

  if (!url || !filename) {
    throw new Error('La versión no incluye archivo de descarga');
  }

  const dest = path.join(modsDir, filename);
  if (fs.existsSync(dest) || fs.existsSync(dest + '.disabled')) {
    return { ok: true, skipped: true, filename };
  }

  await downloadToFile(url, dest, (down, total) => {
    if (onProgress && total) {
      onProgress(Math.round((down / total) * 100), `Descargando ${filename}...`);
    }
  });

  return { ok: true, filename };
}

async function installFromCurseForge(slug, instance, apiKey, modsDir, onProgress) {
  if (!apiKey) {
    throw new Error('Falta la API Key de CurseForge en Ajustes ⚙️ para descargar mods de CurseForge');
  }

  const mcVersion = instance.minecraftVersion || '1.20.1';
  const loader = (instance.loader || 'fabric').toLowerCase();
  const cfLoaderType = curseforge.LOADER_TYPE_MAP[loader] || 0;

  // 1. Buscar el proyecto por slug
  const searchRes = await curseforge.searchProjects({
    apiKey,
    query: slug,
    projectTypeId: curseforge.PROJECT_TYPE_MOD,
    modLoaderType: cfLoaderType !== 0 ? cfLoaderType : undefined,
    gameVersion: mcVersion,
    pageSize: 10,
  });

  const projects = searchRes.data || [];
  const project = projects.find(p => p.slug && p.slug.toLowerCase() === slug.toLowerCase()) || projects[0];

  if (!project) {
    throw new Error(`Mod "${slug}" no encontrado en CurseForge`);
  }

  // 2. Obtener archivos compatibles
  const files = await curseforge.getProjectFiles(apiKey, project.id, {
    gameVersion: mcVersion,
    modLoaderType: cfLoaderType !== 0 ? cfLoaderType : undefined,
  });

  if (!files || files.length === 0) {
    throw new Error(`Sin archivos compatibles en CurseForge para MC ${mcVersion}`);
  }

  const file = files[0];
  const url = curseforge.fileDownloadUrl(file);
  const filename = file.fileName;

  if (!url || !filename) {
    throw new Error('El archivo de CurseForge no tiene URL de descarga válida');
  }

  const dest = path.join(modsDir, filename);
  if (fs.existsSync(dest) || fs.existsSync(dest + '.disabled')) {
    return { ok: true, skipped: true, filename };
  }

  await downloadToFile(url, dest, (down, total) => {
    if (onProgress && total) {
      onProgress(Math.round((down / total) * 100), `Descargando ${filename}...`);
    }
  });

  return { ok: true, filename };
}

async function installDirectJar(url, modsDir, onProgress) {
  let filename = 'mod-' + Date.now() + '.jar';
  try {
    const parsed = new URL(url);
    const base = path.basename(parsed.pathname);
    if (base && base.endsWith('.jar')) filename = base;
  } catch (_) {}

  const dest = path.join(modsDir, filename);
  if (fs.existsSync(dest) || fs.existsSync(dest + '.disabled')) {
    return { ok: true, skipped: true, filename };
  }

  await downloadToFile(url, dest, (down, total) => {
    if (onProgress && total) {
      onProgress(Math.round((down / total) * 100), `Descargando ${filename}...`);
    }
  });

  return { ok: true, filename };
}

async function installEventMods(instanceDir, instance, modsList, apiKey, statusCallback) {
  if (!modsList || !Array.isArray(modsList) || modsList.length === 0) {
    return { ok: true, count: 0 };
  }

  const modsDir = getModsDir(instanceDir);
  const cleanedList = modsList.map(s => String(s).trim()).filter(Boolean);

  if (cleanedList.length === 0) return { ok: true, count: 0 };

  const results = [];
  const total = cleanedList.length;

  for (let i = 0; i < total; i++) {
    const raw = cleanedList[i];
    const itemNum = i + 1;
    const progressLabel = (p, label) => {
      if (statusCallback) {
        statusCallback('mods', itemNum, total, `Mod ${itemNum}/${total}: ${label}`);
      }
    };

    progressLabel(0, `Analizando ${raw}...`);

    try {
      if (raw.startsWith('http://') || raw.startsWith('https://')) {
        const mrSlug = extractModrinthSlug(raw);
        const cfSlug = extractCurseForgeSlug(raw);

        if (mrSlug) {
          progressLabel(10, `Buscando ${mrSlug} en Modrinth...`);
          const r = await installFromModrinth(mrSlug, instance, modsDir, (pct, txt) => progressLabel(pct, txt));
          results.push({ item: raw, ok: true, name: r.filename, skipped: !!r.skipped });
        } else if (cfSlug) {
          progressLabel(10, `Buscando ${cfSlug} en CurseForge...`);
          const r = await installFromCurseForge(cfSlug, instance, apiKey, modsDir, (pct, txt) => progressLabel(pct, txt));
          results.push({ item: raw, ok: true, name: r.filename, skipped: !!r.skipped });
        } else if (raw.toLowerCase().includes('.jar')) {
          progressLabel(10, `Descargando archivo directo...`);
          const r = await installDirectJar(raw, modsDir, (pct, txt) => progressLabel(pct, txt));
          results.push({ item: raw, ok: true, name: r.filename, skipped: !!r.skipped });
        } else {
          // URL genérica, intentar primero con Modrinth
          const slug = path.basename(new URL(raw).pathname);
          try {
            const r = await installFromModrinth(slug, instance, modsDir, (pct, txt) => progressLabel(pct, txt));
            results.push({ item: raw, ok: true, name: r.filename });
          } catch (_) {
            const r = await installFromCurseForge(slug, instance, apiKey, modsDir, (pct, txt) => progressLabel(pct, txt));
            results.push({ item: raw, ok: true, name: r.filename });
          }
        }
      } else {
        // Nombre o slug directo (ej: "sodium" o "jei")
        const slug = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '');
        let installed = false;
        try {
          progressLabel(10, `Buscando ${slug} en Modrinth...`);
          const r = await installFromModrinth(slug, instance, modsDir, (pct, txt) => progressLabel(pct, txt));
          results.push({ item: raw, ok: true, name: r.filename });
          installed = true;
        } catch (_) {}

        if (!installed) {
          progressLabel(10, `Buscando ${slug} en CurseForge...`);
          const r = await installFromCurseForge(slug, instance, apiKey, modsDir, (pct, txt) => progressLabel(pct, txt));
          results.push({ item: raw, ok: true, name: r.filename });
        }
      }
    } catch (err) {
      console.warn(`[eventMods] Error instalando mod ${raw}:`, err.message);
      results.push({ item: raw, ok: false, error: err.message });
      if (statusCallback) {
        statusCallback('mods', itemNum, total, `Aviso en mod ${itemNum}: ${err.message}`);
      }
    }
  }

  return { ok: true, results };
}

module.exports = {
  installEventMods,
  extractModrinthSlug,
  extractCurseForgeSlug,
};