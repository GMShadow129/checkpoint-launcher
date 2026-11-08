// Capa de instancias.
//
// Maneja:
//   - listInstances / addInstanceByCode (modpacks de la comunidad desde Drive)
//   - createCustomInstance            (instancia libre con MC + loader a eleccion)
//   - syncInstance                    (mods desde Drive para modpacks de la comunidad)
//   - prepareAndLaunch                (pipeline completo: java -> vanilla -> loader -> play)

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app } = require('electron');
const drive = require('./drive');
const { ensureJava } = require('./java');
const { installVanilla } = require('./minecraft');
const { installForge } = require('./forge');
const { installNeoForge } = require('./neoforge');
const { installFabric } = require('./fabric');
const { launchGame } = require('./launch');
const { refreshSession } = require('./auth');
const { ensureInstanceSettings, validateInstanceSettings, defaultInstanceSettings, resolveInstanceSettings } = require('./instanceSettings');
const meta = require('./meta');
const https = require('https');
const http = require('http');
const { installEventMods } = require('./eventMods');

const API_BASE_URL = (process.env.API_BASE_URL || 'https://checkpoint-backend-gcs2.onrender.com').replace(/\/+$/, '');

function fetchEventInstanceData(code) {
  return new Promise((resolve) => {
    try {
      const url = new URL(`/api/events/instance-code/${encodeURIComponent(code)}`, API_BASE_URL);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;
      const req = lib.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            resolve(data);
          } catch (_) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    } catch (_) { resolve(null); }
  });
}

async function resolveRecommendedLoaderVersion(mcVersion, loader) {
  try {
    if (loader === 'fabric') {
      const list = await meta.listFabricLoaderVersions(mcVersion);
      if (list && list.length) return (list.find(r => r.stable) || list[0]).version;
    } else if (loader === 'forge') {
      const list = await meta.listForgeVersions(mcVersion);
      if (list && list.versions && list.versions.length) return list.recommended || list.versions[0];
    } else if (loader === 'neoforge') {
      const list = await meta.listNeoForgeVersions(mcVersion);
      if (list && list.versions && list.versions.length) return list.versions[0];
    }
  } catch (_) {}
  return null;
}

function listInstances(store) {
  const raw = store.get('instances', []);
  // Migracion retroactiva: asegura que cada instancia tenga el campo settings.
  return raw.map(ensureInstanceSettings);
}

function instanceBasePath(instanceId) {
  return path.join(app.getPath('userData'), 'instances', instanceId);
}

function instanceMinecraftDir(instanceId) {
  return path.join(instanceBasePath(instanceId), '.minecraft');
}

function customInstanceId(mcVersion, loader, loaderVersion) {
  // ID estable para no duplicar. Si no hay loader version (vanilla), no la usamos.
  const slug = loader === 'vanilla' ? mcVersion : `${mcVersion}-${loader}-${loaderVersion}`;
  return `custom-${slug}`.toLowerCase();
}

// Modpacks de la comunidad se agregan con un codigo.
async function addInstanceByCode(store, code) {
  const trimmed = (code || '').trim();
  if (!trimmed) return { ok: false, error: 'Codigo vacio' };

  const instances = listInstances(store);
  const upperTrimmed = trimmed.toUpperCase();
  if (instances.some((i) => i.code && i.code.toUpperCase() === upperTrimmed)) {
    return { ok: false, error: 'Esa instancia ya esta agregada' };
  }

  // 1. Intentar consultar el Backend de Checkpoint por si es un codigo de Evento
  try {
    const eventRes = await fetchEventInstanceData(trimmed);
    if (eventRes && eventRes.ok && eventRes.event) {
      const ev = eventRes.event;
      const loader = (ev.loader || 'vanilla').toLowerCase();
      let loaderVersion = ev.loaderVersion || null;
      if (loader !== 'vanilla' && !loaderVersion) {
        loaderVersion = await resolveRecommendedLoaderVersion(ev.minecraftVersion, loader);
      }

      const instanceId = ('evt-' + (ev.code || ev.id)).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      if (instances.some((i) => i.id === instanceId)) {
        return { ok: false, error: 'Ya tienes una instancia creada para este evento' };
      }

      const newInstance = {
        id: instanceId,
        name: ev.name ? `[Evento] ${ev.name}` : `Evento Checkpoint ${ev.code}`,
        code: ev.code,
        folderId: null,
        minecraftVersion: ev.minecraftVersion || '1.20.1',
        loader,
        loaderVersion,
        installedVersion: 0,
        custom: true,
        serverAddress: ev.serverAddress || null,
        serverPort: ev.serverPort || null,
        settings: defaultInstanceSettings(),
        eventMods: ev.mods || []
      };

      const dir = instanceMinecraftDir(newInstance.id);
      fs.mkdirSync(dir, { recursive: true });
      fs.mkdirSync(path.join(dir, 'mods'), { recursive: true });

      store.set('instances', [...instances, newInstance]);
      return { ok: true, instance: newInstance, eventCreated: true, modsToInstall: ev.mods || [] };
    }
  } catch (err) {
    // Si falla la red o no es un evento, continuamos a buscar en Drive
  }

  // 2. Si no es un codigo de evento, buscar en Google Drive (modpack de la comunidad legacy)
  let folderId;
  let manifest;
  try {
    const index = await drive.getIndex();
    folderId = index[trimmed];
    if (!folderId) return { ok: false, error: 'Ese codigo no existe' };
    manifest = await drive.getManifest(folderId);
  } catch (err) {
    return { ok: false, error: 'No se pudo consultar Drive: ' + (err.message || String(err)) };
  }

  const newInstance = {
    id: trimmed.toLowerCase(),
    name: manifest.name || `Checkpoint Launcher ${trimmed}`,
    code: trimmed,
    folderId,
    minecraftVersion: manifest.minecraftVersion,
    loader: manifest.loader || 'forge',
    loaderVersion: manifest.loaderVersion,
    installedVersion: 0,
    custom: false,
    settings: defaultInstanceSettings()
  };

  store.set('instances', [...instances, newInstance]);
  return { ok: true, instance: newInstance };
}

// Instancias personalizadas: el user elige MC + loader.
function createCustomInstance(store, { name, minecraftVersion, loader, loaderVersion }) {
  if (!minecraftVersion) return { ok: false, error: 'Falta la version de Minecraft' };
  if (!loader) return { ok: false, error: 'Falta el loader' };

  // vanilla no lleva loaderVersion. Los demas si.
  if (loader !== 'vanilla' && !loaderVersion) {
    return { ok: false, error: `El loader ${loader} necesita una version` };
  }

  const validLoaders = ['vanilla', 'forge', 'neoforge', 'fabric'];
  if (!validLoaders.includes(loader)) {
    return { ok: false, error: `Loader no soportado: ${loader}` };
  }

  const id = customInstanceId(minecraftVersion, loader, loaderVersion || '');
  const instances = listInstances(store);
  if (instances.some((i) => i.id === id)) {
    return { ok: false, error: 'Esa combinacion ya esta agregada' };
  }

  const loaderLabel = loader === 'vanilla' ? 'Vanilla' :
                     loader === 'forge' ? `Forge ${loaderVersion}` :
                     loader === 'neoforge' ? `NeoForge ${loaderVersion}` :
                     `Fabric ${loaderVersion}`;

  const newInstance = {
    id,
    name: name || `${minecraftVersion} ${loaderLabel}`,
    code: null,
    folderId: null,
    minecraftVersion,
    loader,
    loaderVersion: loaderVersion || null,
    installedVersion: 0,
    custom: true,
    settings: defaultInstanceSettings()
  };

  store.set('instances', [...instances, newInstance]);
  return { ok: true, instance: newInstance };
}

// Sincroniza mods desde Drive. Solo aplica a modpacks de la comunidad.
async function syncInstance(store, instanceId, onProgress) {
  const instances = listInstances(store);
  const instance = instances.find((i) => i.id === instanceId);
  if (!instance) return { ok: false, error: 'Instancia no encontrada' };

  // Instancias personalizadas: no hay Drive. Decimos "al dia" para que la UI
  // no muestre error.
  if (instance.custom) {
    return { ok: true, updated: false, custom: true };
  }

  if (!instance.folderId) {
    try {
      const index = await drive.getIndex();
      const folderId = index[instance.code];
      if (!folderId) {
        return { ok: false, error: `El codigo "${instance.code}" ya no existe en el indice de Drive` };
      }
      instance.folderId = folderId;
      store.set('instances', instances);
    } catch (err) {
      return { ok: false, error: 'No se pudo consultar Drive: ' + (err.message || String(err)) };
    }
  }

  let manifest;
  try {
    manifest = await drive.getManifest(instance.folderId);
  } catch (err) {
    return { ok: false, error: 'No se pudo consultar Drive: ' + (err.message || String(err)) };
  }

  if (manifest.modpackVersion === instance.installedVersion) {
    return { ok: true, updated: false };
  }

  const mods = manifest.mods || [];
  const modsDir = path.join(instanceMinecraftDir(instance.id), 'mods');
  fs.mkdirSync(modsDir, { recursive: true });

  for (let i = 0; i < mods.length; i++) {
    const mod = mods[i];
    const destPath = path.join(modsDir, mod.name);
    if (fs.existsSync(destPath)) {
      if (onProgress) onProgress(i + 1, mods.length, mod.name);
      continue;
    }
    await drive.downloadFile(mod.fileId, destPath, () => {
      if (onProgress) onProgress(i + 1, mods.length, mod.name);
    });
  }

  instance.installedVersion = manifest.modpackVersion;
  instance.minecraftVersion = manifest.minecraftVersion;
  instance.loader = manifest.loader || 'forge';
  instance.loaderVersion = manifest.loaderVersion;
  store.set('instances', instances);

  return { ok: true, updated: true, modsDownloaded: mods.length };
}

async function prepareAndLaunch(store, instanceId, session, statusCallback) {
  const instances = listInstances(store);
  const instance = instances.find((i) => i.id === instanceId);
  if (!instance) return { ok: false, error: 'Instancia no encontrada' };
  if (!session) return { ok: false, error: 'No hay sesion de Microsoft. Inicia sesion primero.' };

  const report = (stage, current, total, label) => {
    if (statusCallback) statusCallback({ stage, current, total, label });
  };

  try {
    // Paso 0: refrescar sesion si tenemos refreshToken. El mcToken de Minecraft
    // vive pocas horas; sin esto el juego entra en demo mode (401) despues de
    // un rato de haber hecho login.
    if (session.refreshToken) {
      try {
        report('refresh', 0, 0, 'Renovando sesion de Microsoft...');
        const refreshed = await refreshSession(session.refreshToken);
        session = refreshed;
        store.set('session', session);
        console.log('[auth] Sesion refrescada OK');
      } catch (refreshErr) {
        // Si el refresh falla (token revocado), seguimos con la sesion cacheada.
        // El juego tirara demo mode y el user tendra que re-loguearse.
        console.log('[auth] Refresh fallo:', refreshErr.message);
        report('refresh', 0, 0, 'Refresh fallo (se usara sesion cacheada)');
      }
    }

    // Sync (no hace nada para custom; baja mods para modpacks de la comunidad).
    report('sync', 0, 0, instance.custom ? 'Verificando instancia...' : 'Sincronizando mods...');
    const syncResult = await syncInstance(store, instanceId, (current, total, modName) => {
      report('sync', current, total, `Descargando ${modName}`);
    });
    if (!syncResult.ok) return syncResult;

    // Resolver settings efectivos (per-instance + global).
    const globalSettings = store.get('settings', null) || {};
    const effective = resolveInstanceSettings(instance, globalSettings);
    console.log(`[launch] Settings efectivos (origen: ${effective.source}): RAM=${effective.ramMb}MB, javaPath=${effective.javaPath || '(auto)'}, customJvmArgs=${effective.jvmArgs ? 'si' : 'no'}`);

    // Java: si el setting per-instance tiene javaPath, lo usamos directo.
    // Sino, ensureJava descarga/adopta la version correcta.
    report('java', 0, 0, 'Preparando Java...');
    let javaBin;
    if (effective.javaPath && fs.existsSync(effective.javaPath)) {
      javaBin = effective.javaPath;
      report('java', 0, 0, `Usando Java de instancia: ${effective.javaPath}`);
    } else {
      javaBin = await ensureJava(instance.minecraftVersion, (bytes) => {
        report('java', bytes, 0, `Descargando Java (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
      });
    }

    const instanceDir = instanceMinecraftDir(instanceId);
    fs.mkdirSync(instanceDir, { recursive: true });

    // Vanilla (siempre; es lo que el loader envuelve).
    report('minecraft', 0, 0, 'Instalando Minecraft...');
    await installVanilla(instanceDir, instance.minecraftVersion, (stageOrCur, current, total, label) => {
      if (stageOrCur === 'assets') {
        report('assets', current, total, label ? `Asset ${current}/${total}: ${label}` : 'Descargando assets...');
      } else {
        report('minecraft', stageOrCur, 0, 'Descargando archivos del juego...');
      }
    });

    // Loader.
    if (instance.loader === 'forge') {
      report('forge', 0, 0, 'Instalando Forge (puede tardar unos minutos)...');
      await installForge(
        javaBin,
        instanceDir,
        instance.minecraftVersion,
        instance.loaderVersion,
        // Pipeamos el output del installer al renderer para que el user
        // vea progreso real (Forge baja ~100 libraries la primera vez).
        (line, isErr) => {
          if (!line) return;
          // Tomamos la primera linea de cada chunk para no saturar la UI.
          const first = line.split('\n')[0].trim();
          if (first.length > 0) {
            report('forge', 0, 0, `Forge: ${first.slice(0, 90)}`);
          }
        }
      );
      report('forge', 1, 1, 'Forge listo');
    } else if (instance.loader === 'neoforge') {
      report('neoforge', 0, 0, 'Instalando NeoForge (puede tardar unos minutos)...');
      await installNeoForge(
        javaBin,
        instanceDir,
        instance.loaderVersion,
        (line, isErr) => {
          if (!line) return;
          const first = line.split('\n')[0].trim();
          if (first.length > 0) {
            report('neoforge', 0, 0, `NeoForge: ${first.slice(0, 90)}`);
          }
        }
      );
      report('neoforge', 1, 1, 'NeoForge listo');
    } else if (instance.loader === 'fabric') {
      report('fabric', 0, 0, 'Instalando Fabric...');
      await installFabric(instanceDir, instance.minecraftVersion, instance.loaderVersion);
      report('fabric', 1, 1, 'Fabric listo');
    } else if (instance.loader === 'vanilla') {
      // Ya instalamos vanilla arriba, nada mas.
    } else {
      return { ok: false, error: `Loader "${instance.loader}" no soportado todavia` };
    }

    // Si la instancia pertenece a un evento, sincronizar en caliente mods e IP desde el backend
    if (instance.code && instance.code.toUpperCase().startsWith('EVT-')) {
      try {
        report('sync', 0, 0, 'Sincronizando información del evento...');
        const eventRes = await fetchEventInstanceData(instance.code);
        if (eventRes && eventRes.ok && eventRes.event) {
          const ev = eventRes.event;
          let changed = false;
          if (ev.serverAddress && ev.serverAddress !== instance.serverAddress) {
            instance.serverAddress = ev.serverAddress;
            changed = true;
          }
          if (ev.serverPort !== undefined && ev.serverPort !== instance.serverPort) {
            instance.serverPort = ev.serverPort;
            changed = true;
          }
          if (Array.isArray(ev.mods)) {
            const currentMods = instance.eventMods || [];
            if (JSON.stringify(currentMods) !== JSON.stringify(ev.mods)) {
              instance.eventMods = ev.mods;
              changed = true;
            }
          }
          if (changed) {
            const allInstances = listInstances(store);
            const idx = allInstances.findIndex((i) => i.id === instanceId);
            if (idx !== -1) {
              allInstances[idx] = { ...allInstances[idx], ...instance };
              store.set('instances', allInstances);
            }
          }
        }
      } catch (syncErr) {
        console.warn('[instances] Error sincronizando evento antes de lanzar:', syncErr.message);
      }
    }

    // Mods del evento si la instancia tiene lista de mods configurada
    if (instance.eventMods && Array.isArray(instance.eventMods) && instance.eventMods.length > 0) {
      report('mods', 0, instance.eventMods.length, 'Comprobando y descargando mods del evento...');
      const s = store.get('settings', null) || {};
      await installEventMods(instanceDir, instance, instance.eventMods, s.curseforgeApiKey, report);
      report('mods', instance.eventMods.length, instance.eventMods.length, 'Mods del evento listos');
    }

    // Launch. Pasamos el objeto `effective` (resultado de resolveInstanceSettings)
    // que ya tiene ramMb, javaPath, jvmArgs resueltos segun per-instance + global.
    report('launch', 0, 0, 'Arrancando Minecraft...');
    const child = launchGame(
      { ...instance, baseDir: instanceBasePath(instanceId) },
      session,
      javaBin,
      effective
    );
    child.on('exit', (code) => {
      report('exited', code, 0, code === 0 ? 'Juego cerrado' : `Juego salio con codigo ${code}`);
    });

    // Devolvemos SOLO datos primitivos. ChildProcess no se puede clonar por IPC.
    return { ok: true, pid: child.pid };
  } catch (err) {
    console.error('Error lanzando:', err);
    return { ok: false, error: err.message || String(err) };
  }
}

// Elimina una instancia del store. Si deleteFiles es true, borra tambien
// su carpeta en disco (versions, mods, configs, etc).
function removeInstance(store, instanceId, deleteFiles) {
  const instances = listInstances(store);
  const idx = instances.findIndex((i) => i.id === instanceId);
  if (idx === -1) return { ok: false, error: 'Instancia no encontrada' };

  if (deleteFiles) {
    const dir = instanceBasePath(instanceId);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      return { ok: false, error: `No se pudo borrar la carpeta: ${err.message}` };
    }
  }
  instances.splice(idx, 1);
  store.set('instances', instances);
  return { ok: true };
}

// Renombra una instancia.
function renameInstance(store, instanceId, newName) {
  const instances = listInstances(store);
  const inst = instances.find((i) => i.id === instanceId);
  if (!inst) return { ok: false, error: 'Instancia no encontrada' };
  if (!newName || !newName.trim()) return { ok: false, error: 'Nombre vacio' };
  inst.name = newName.trim();
  store.set('instances', instances);
  return { ok: true, instance: inst };
}

// Actualiza los settings per-instance. Valida antes de guardar.
function updateInstanceSettings(store, instanceId, partial) {
  const instances = listInstances(store);
  const inst = instances.find((i) => i.id === instanceId);
  if (!inst) return { ok: false, error: 'Instancia no encontrada' };

  const v = validateInstanceSettings(partial || {});
  if (!v.ok) {
    return { ok: false, error: v.errors.join('; ') };
  }

  inst.settings = v.settings;
  store.set('instances', instances);
  return { ok: true, instance: inst };
}

module.exports = {
  listInstances,
  addInstanceByCode,
  createCustomInstance,
  syncInstance,
  prepareAndLaunch,
  removeInstance,
  renameInstance,
  updateInstanceSettings,
  instanceBasePath,
  instanceMinecraftDir,
  customInstanceId
};