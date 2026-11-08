const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { listInstances, addInstanceByCode, createCustomInstance, syncInstance, prepareAndLaunch, removeInstance, renameInstance, updateInstanceSettings, instanceMinecraftDir } = require('./src/instances');
const { loginWithMicrosoft, describeAuthError } = require('./src/auth');
const meta = require('./src/meta');
const modrinth = require('./src/modrinth');
const curseforge = require('./src/curseforge');
const { downloadToFile } = require('./src/download');
const modManager = require('./src/modManager');
const javaDetector = require('./src/javaDetector');
const logsViewer = require('./src/logsViewer');
const community = require('./src/community');
const events = require('./src/events');
const discordAuth = require('./src/discordAuth');
const fs = require('fs');

// Configuracion global de la app.
app.setName('Checkpoint Launcher');
app.setAppUserModelId('com.checkpoint.launcher');

let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
} catch (e) {
  console.log('[update] electron-updater no disponible:', e.message);
}

const store = new Store();
let mainWindow = null;
let splashWindow = null;

function createSplashWindow() {
  // Splash: ventana sin marco, fija, mas chica que la principal.
  splashWindow = new BrowserWindow({
    width: 480,
    height: 360,
    frame: false,
    transparent: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    backgroundColor: '#0c0d10',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  splashWindow.loadFile(path.join(__dirname, 'renderer', 'splash.html'));
  splashWindow.once('ready-to-show', () => {
    if (splashWindow) splashWindow.show();
  });
  // Solo bloqueamos el cierre si el main window todavía no existe (cierre temprano).
  // Si ya existe, dejamos que el splash se cierre normalmente para no dejarlo zombie.
  splashWindow.on('close', (e) => {
    if (mainWindow === null) {
      e.preventDefault();
    }
  });
  // Cuando el video del splash termine, cerramos el splash.
  // Si el video falla o tarda demasiado, hay un fallback de 8s.
  splashWindow.webContents.once('did-finish-load', () => {
    splashWindow.webContents.executeJavaScript(`
      (function() {
        const v = document.getElementById('splash-video');
        if (!v) return;
        // Si el video ya terminó (carga muy rapida), cerramos ya.
        if (v.ended) {
          window.splashDone = true;
        } else {
          v.addEventListener('ended', () => { window.splashDone = true; });
          // Fallback: si el video no carga o no termina, cerramos tras 8s.
          setTimeout(() => { window.splashDone = true; }, 8000);
        }
      })();
    `).catch(() => { });
  });
}

// Polling simple para chequear si el splash termino su animacion.
function waitForSplashDone() {
  return new Promise((resolve) => {
    if (!splashWindow) return resolve();
    const check = async () => {
      try {
        const done = await splashWindow.webContents.executeJavaScript('window.splashDone === true');
        if (done) return resolve();
      } catch (_) { return resolve(); }
      setTimeout(check, 100);
    };
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 600,
    minWidth: 820,
    minHeight: 520,
    frame: true,
    backgroundColor: '#111214',
    title: 'Checkpoint Launcher',
    icon: path.join(__dirname, 'build', 'icon-256.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Cuando la ventana principal esta lista, cerrar el splash y mostrar la principal.
  // Cuando la ventana principal esta lista, esperar a que termine el splash
  // y despues cerrar el splash + mostrar la principal.
  // Esto deja que el video se reproduzca entero antes de cambiar al main window.
  mainWindow.once('ready-to-show', async () => {
    await waitForSplashDone();
    mainWindow.show();
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
  });
}

app.whenReady().then(() => {
  createSplashWindow();
  createWindow();

  if (autoUpdater && app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.log('[update] check fallo:', err.message);
    });
    autoUpdater.on('update-downloaded', (info) => {
      if (mainWindow) {
        mainWindow.webContents.send('update:ready', {
          version: info.version,
          releaseNotes: info.releaseNotes
        });
      }
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSplashWindow();
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC: sesion ----
ipcMain.handle('auth:getSession', () => store.get('session', null));

ipcMain.handle('auth:login', async () => {
  try {
    const session = await loginWithMicrosoft(mainWindow);
    store.set('session', session);
    return { ok: true, session };
  } catch (err) {
    console.error('Error de login:', err);
    return { ok: false, error: describeAuthError(err) };
  }
});

ipcMain.handle('auth:logout', () => {
  store.delete('session');
  return true;
});

// ---- IPC: instancias ----
ipcMain.handle('instances:list', () => listInstances(store));

ipcMain.handle('instances:addByCode', async (_event, code) => addInstanceByCode(store, code));

ipcMain.handle('instances:createCustom', (_event, payload) => createCustomInstance(store, payload));

ipcMain.handle('instances:remove', (_event, instanceId, deleteFiles) => removeInstance(store, instanceId, deleteFiles));

ipcMain.handle('instances:rename', (_event, instanceId, newName) => renameInstance(store, instanceId, newName));

ipcMain.handle('instances:updateSettings', (_event, instanceId, settings) => updateInstanceSettings(store, instanceId, settings));

ipcMain.handle('instances:openFolder', (_event, instanceId, subfolder) => {
  const dir = instanceMinecraftDir(instanceId);
  if (!require('fs').existsSync(dir)) {
    return { ok: false, error: 'La instancia aun no esta instalada. Juega primero para crearla.' };
  }
  const target = subfolder === 'root' ? dir : path.join(dir, subfolder);
  require('fs').mkdirSync(target, { recursive: true });
  shell.openPath(target);
  return { ok: true, path: target };
});

ipcMain.handle('instances:openUserData', () => {
  shell.openPath(app.getPath('userData'));
  return { ok: true };
});

ipcMain.handle('instances:sync', async (_event, instanceId) => {
  try {
    return await syncInstance(store, instanceId, (current, total, modName) => {
      mainWindow.webContents.send('instances:syncProgress', { current, total, modName });
    });
  } catch (err) {
    console.error('Error de sincronizacion:', err);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('instances:play', async (_event, instanceId) => {
  const session = store.get('session', null);
  return prepareAndLaunch(store, instanceId, session, (status) => {
    mainWindow.webContents.send('instances:playStatus', { instanceId, ...status });
  });
});

// ---- IPC: settings globales ----
ipcMain.handle('settings:get', () => {
  const defaults = {
    ramMb: 4096,
    javaPathOverride: null,
    closeOnLaunch: false,
    curseforgeApiKey: '',
    cfOnboardingDismissed: false,
    communityServerAddress: '',
    communityDiscordInvite: '',
    communityNewsFeed: '',
    communityWebsite: ''
  };
  const cur = store.get('settings', null) || {};
  // Nunca devolver la API key al renderer (es un secret). Enviamos solo si existe.
  return { ...defaults, ...cur, curseforgeApiKey: cur.curseforgeApiKey ? '••••••' + (cur.curseforgeApiKey.slice(-4) || '') : '' };
});

ipcMain.handle('settings:set', (_event, partial) => {
  const cur = store.get('settings', null) || {};
  const next = { ...cur, ...partial };
  if (typeof next.ramMb !== 'number' || next.ramMb < 1024 || next.ramMb > 32768) {
    return { ok: false, error: 'RAM debe estar entre 1 GB y 32 GB' };
  }
  // Si llega el placeholder "••••••" no pisar la key real.
  if (typeof next.curseforgeApiKey === 'string' && next.curseforgeApiKey.startsWith('••••••')) {
    next.curseforgeApiKey = cur.curseforgeApiKey || '';
  }
  store.set('settings', next);
  // Devolvemos la version enmascarada.
  return { ok: true, settings: { ...next, curseforgeApiKey: next.curseforgeApiKey ? '••••••' + (next.curseforgeApiKey.slice(-4) || '') : '' } };
});

// ---- IPC: metadata ----
ipcMain.handle('meta:minecraftVersions', async () => {
  try {
    const list = await meta.listMinecraftVersions();
    return { ok: true, list };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('meta:loaderVersions', async (_event, { minecraftVersion, loader }) => {
  try {
    let result;
    if (loader === 'forge') result = await meta.listForgeVersions(minecraftVersion);
    else if (loader === 'neoforge') result = await meta.listNeoForgeVersions(minecraftVersion);
    else if (loader === 'fabric') result = await meta.listFabricLoaderVersions(minecraftVersion);
    else if (loader === 'vanilla') result = { versions: [], recommended: null, latest: null };
    else return { ok: false, error: `Loader desconocido: ${loader}` };
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

// ---- IPC: update ----
ipcMain.handle('update:install', () => {
  if (autoUpdater) {
    autoUpdater.quitAndInstall();
  }
  return false;
});

// ---- IPC: Modrinth search ----
ipcMain.handle('modrinth:search', async (_event, { query, facets, index, limit, projectType }) => {
  try {
    const f = (facets && facets.length > 0) ? facets : [['project_type:' + (projectType || 'mod')]];
    const data = await modrinth.searchProjects({ query, facets: f, index, limit });
    return { ok: true, hits: data.hits || [], total: data.total_hits || 0 };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('modrinth:getProject', async (_event, idOrSlug) => {
  try {
    const p = await modrinth.getProject(idOrSlug);
    return { ok: true, project: p };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('modrinth:getVersions', async (_event, { idOrSlug, loader, gameVersion }) => {
  try {
    const versions = await modrinth.getProjectVersions(idOrSlug, { loader, gameVersion });
    return { ok: true, versions };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('modrinth:install', async (_event, { instanceId, versionId }) => {
  try {
    const instances = listInstances(store);
    const inst = instances.find((i) => i.id === instanceId);
    if (!inst) return { ok: false, error: 'Instancia no encontrada' };

    const version = await modrinth.getVersion(versionId);
    const url = modrinth.primaryDownloadUrl(version);
    const filename = modrinth.primaryFilename(version);
    if (!url || !filename) {
      return { ok: false, error: 'La version no tiene archivo de descarga' };
    }

    // Decidimos la subcarpeta segun el project_type del archivo.
    // (Modrinth incluye project_type en el version, asi sabemos si es mod, modpack, etc.)
    const projectType = (version.project_type || 'mod');
    let targetDir;
    switch (projectType) {
      case 'mod':
        targetDir = 'mods';
        break;
      case 'modpack':
        targetDir = 'modpacks';
        break;
      case 'resourcepack':
        targetDir = 'resourcepacks';
        break;
      case 'shader':
        targetDir = 'shaderpacks';
        break;
      default:
        targetDir = 'mods';
    }

    const modsDir = path.join(instanceMinecraftDir(instanceId), targetDir);
    fs.mkdirSync(modsDir, { recursive: true });
    const dest = path.join(modsDir, filename);

    if (fs.existsSync(dest)) {
      return { ok: true, alreadyInstalled: true, path: dest };
    }

    if (mainWindow) {
      mainWindow.webContents.send('modrinth:installProgress', {
        instanceId, versionId, filename, stage: 'downloading', percent: 0,
      });
    }
    await downloadToFile(url, dest, (downloaded, total) => {
      if (mainWindow && total) {
        mainWindow.webContents.send('modrinth:installProgress', {
          instanceId, versionId, filename, stage: 'downloading',
          percent: Math.round((downloaded / total) * 100),
        });
      }
    });
    if (mainWindow) {
      mainWindow.webContents.send('modrinth:installProgress', {
        instanceId, versionId, filename, stage: 'done', percent: 100,
      });
    }
    return { ok: true, path: dest, projectType };
  } catch (err) {
    console.error('Error instalando mod:', err);
    return { ok: false, error: err.message || String(err) };
  }
});
// ---- IPC: CurseForge ----
ipcMain.handle('curseforge:hasKey', () => {
  const s = store.get('settings', null) || {};
  return !!s.curseforgeApiKey;
});

ipcMain.handle('curseforge:search', async (_event, { query, projectType, instanceId, pageSize, index }) => {
  try {
    const s = store.get('settings', null) || {};
    if (!s.curseforgeApiKey) {
      return { ok: false, error: 'Falta la API key de CurseForge. Configurala en Configuracion.' };
    }
    const inst = instanceId ? listInstances(store).find((i) => i.id === instanceId) : null;
    const projectTypeId = {
      mod: curseforge.PROJECT_TYPE_MOD, modpack: curseforge.PROJECT_TYPE_MODPACK,
      resourcepack: curseforge.PROJECT_TYPE_RESOURCEPACK, shader: curseforge.PROJECT_TYPE_SHADER,
    }[projectType || 'mod'];
    const modLoaderType = inst && inst.loader ? curseforge.LOADER_TYPE_MAP[inst.loader] : undefined;
    const gameVersion = inst && inst.minecraftVersion ? inst.minecraftVersion : undefined;
    const data = await curseforge.searchProjects({
      apiKey: s.curseforgeApiKey,
      query, projectTypeId, modLoaderType, gameVersion, pageSize, index,
    });
    // Adaptamos los hits a un formato similar a Modrinth para reutilizar UI.
    const hits = (data.data || []).map((p) => ({
      slug: String(p.id),
      project_id: String(p.id),
      title: p.name,
      author: (p.authors && p.authors[0] && p.authors[0].name) || 'desconocido',
      description: p.summary || '',
      icon_url: p.logo ? (p.logo.thumbnailUrl || p.logo.url) : '',
      downloads: p.downloadCount || 0,
      follows: 0,
    }));
    return { ok: true, hits, total: (data.pagination && data.pagination.totalCount) || hits.length };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('curseforge:getProject', async (_event, { projectId }) => {
  try {
    const s = store.get('settings', null) || {};
    if (!s.curseforgeApiKey) {
      return { ok: false, error: 'Falta la API key de CurseForge' };
    }
    const p = await curseforge.getProject(s.curseforgeApiKey, projectId);
    return {
      ok: true,
      project: {
        id: String(p.id),
        title: p.name,
        slug: p.slug,
        description: p.summary || '',
        icon_url: p.logo ? (p.logo.thumbnailUrl || p.logo.url) : '',
        downloads: p.downloadCount || 0,
        followers: 0,
        author: (p.authors && p.authors[0] && p.authors[0].name) || 'desconocido',
        license: p.license ? p.license.name : '?',
        body: p.body || p.summary || '',
      },
    };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('curseforge:getFiles', async (_event, { projectId, instanceId }) => {
  try {
    const s = store.get('settings', null) || {};
    if (!s.curseforgeApiKey) {
      return { ok: false, error: 'Falta la API key de CurseForge' };
    }
    const inst = instanceId ? listInstances(store).find((i) => i.id === instanceId) : null;
    const modLoaderType = inst && inst.loader ? curseforge.LOADER_TYPE_MAP[inst.loader] : undefined;
    const gameVersion = inst && inst.minecraftVersion ? inst.minecraftVersion : undefined;
    const files = await curseforge.getProjectFiles(s.curseforgeApiKey, projectId, {
      gameVersion, modLoaderType,
    });
    const versions = (files || []).map((f) => ({
      id: String(f.id),
      name: f.displayName || f.fileName,
      version_number: f.fileName,
      game_versions: [f.gameVersion].filter(Boolean),
      loaders: [curseforge.LOADER_TYPE_INVERSE[f.modLoader] || ''].filter(Boolean),
      files: [{
        url: curseforge.fileDownloadUrl(f),
        filename: f.fileName,
        primary: true,
        size: f.fileLength || 0,
      }],
    }));
    return { ok: true, versions };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('curseforge:install', async (_event, { instanceId, projectId, fileId }) => {
  try {
    const s = store.get('settings', null) || {};
    if (!s.curseforgeApiKey) {
      return { ok: false, error: 'Falta la API key de CurseForge' };
    }
    const instances = listInstances(store);
    const inst = instances.find((i) => i.id === instanceId);
    if (!inst) return { ok: false, error: 'Instancia no encontrada' };
    if (!projectId || !fileId) return { ok: false, error: 'Falta projectId o fileId' };
    const file = await curseforge.getFile(s.curseforgeApiKey, projectId, fileId);
    if (!file) return { ok: false, error: 'No se pudo obtener el archivo de CurseForge' };
    const url = curseforge.fileDownloadUrl(file);
    const filename = file.fileName;
    if (!url || !filename) return { ok: false, error: 'El archivo no tiene URL de descarga' };

    // Determinar carpeta segun el classId del mod. Como no tenemos el project
    // aqui, usamos el modLoaderType del file: 1/4/6 = mod, 4471 = modpack, etc.
    // Simplificacion: si el filename contiene "modpack" o el loader es raro, va a modpacks.
    // Por default va a mods/.
    const lc = filename.toLowerCase();
    let targetDir = 'mods';
    if (lc.includes('shader') || lc.endsWith('.zip') && file.modLoader === 0) {
      // Heuristica: shaders suelen ser .zip. Si no estamos seguros, a mods.
      targetDir = 'mods';
    }
    const modsDir = path.join(instanceMinecraftDir(instanceId), targetDir);
    fs.mkdirSync(modsDir, { recursive: true });
    const dest = path.join(modsDir, filename);
    if (fs.existsSync(dest)) {
      return { ok: true, alreadyInstalled: true, path: dest };
    }
    if (mainWindow) {
      mainWindow.webContents.send('modrinth:installProgress', {
        instanceId, versionId: String(fileId), filename, stage: 'downloading', percent: 0,
      });
    }
    await downloadToFile(url, dest, (downloaded, total) => {
      if (mainWindow && total) {
        mainWindow.webContents.send('modrinth:installProgress', {
          instanceId, versionId: String(fileId), filename, stage: 'downloading',
          percent: Math.round((downloaded / total) * 100),
        });
      }
    });
    if (mainWindow) {
      mainWindow.webContents.send('modrinth:installProgress', {
        instanceId, versionId: String(fileId), filename, stage: 'done', percent: 100,
      });
    }
    return { ok: true, path: dest };
  } catch (err) {
    console.error('Error instalando mod de CurseForge:', err);
    return { ok: false, error: err.message || String(err) };
  }
});

// ---- IPC: Mod manager ----
ipcMain.handle('mods:list', (_event, instanceId) => {
  try {
    return { ok: true, mods: modManager.listMods(instanceId) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('mods:toggle', (_event, instanceId, filename) => {
  try {
    return modManager.toggleMod(instanceId, filename);
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('mods:delete', (_event, instanceId, filename) => {
  try {
    return modManager.deleteMod(instanceId, filename);
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

// ---- IPC: Java detection ----
ipcMain.handle('java:detect', async () => {
  try {
    const list = await javaDetector.detectAllJava();
    return { ok: true, list };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('java:suggestFor', (_event, mcVersion) => {
  return {
    suggestedMajor: javaDetector.suggestedJavaMajor(mcVersion),
    best: null, // se calcula en el cliente con la lista detectada
  };
});

ipcMain.handle('java:browse', async () => {
  // Abrimos un dialog para que el user elija java.exe manualmente.
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Elegir java.exe',
    properties: ['openFile'],
    filters: [
      { name: 'Ejecutables de Java', extensions: ['exe'] },
      { name: 'Todos los archivos', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };
  const p = result.filePaths[0];
  return { ok: true, path: p };
});

// ---- IPC: Logs viewer ----
ipcMain.handle('logs:list', (_event, instanceId) => {
  try {
    return { ok: true, logs: logsViewer.listLogs(instanceId) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('logs:read', (_event, instanceId, filename, lines) => {
  try {
    return logsViewer.readLogTail(instanceId, filename, lines || 500);
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('crashreports:list', (_event, instanceId) => {
  try {
    return { ok: true, reports: logsViewer.listCrashReports(instanceId) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('crashreports:read', (_event, instanceId, filename) => {
  try {
    return logsViewer.readCrashReport(instanceId, filename);
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

// ---- IPC: Community features ----
ipcMain.handle('events:list', async () => {
  return await events.fetchEvents();
});

ipcMain.handle('events:participants', async (_event, eventId) => {
  return await events.fetchEventParticipants(eventId);
});

// ---- IPC: Discord OAuth ----
ipcMain.handle('discord:login', async () => {
  try {
    const result = await discordAuth.loginWithDiscord();
    store.set('discordSession', result);
    return { ok: true, session: result };
  } catch (err) {
    console.error('Discord login error:', err);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('discord:logout', () => {
  discordAuth.logoutDiscord(store);
  return { ok: true };
});

ipcMain.handle('discord:getSession', async () => {
  try {
    const session = await discordAuth.getDiscordSession(store);
    return { ok: true, session };
  } catch (err) {
    return { ok: true, session: null };
  }
});

ipcMain.handle('discord:registerEvent', async (_event, eventId) => {
  try {
    const res = await discordAuth.registerEvent(eventId, store);
    return { ok: true, ...res };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('discord:unregisterEvent', async (_event, eventId) => {
  try {
    const res = await discordAuth.unregisterEvent(eventId, store);
    return { ok: true, ...res };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('discord:getMyEvents', async () => {
  try {
    const eventIds = await discordAuth.getUserRegisteredEvents(store);
    return { ok: true, eventIds };
  } catch (err) {
    return { ok: true, eventIds: [] };
  }
});

ipcMain.handle('community:serverStatus', async (_event, address) => {
  return community.fetchServerStatus(address);
});

ipcMain.handle('community:newsFeed', async (_event, feedUrl, limit) => {
  return await community.fetchNewsFeed(feedUrl, limit);
});

ipcMain.handle('community:copyToClipboard', async (_event, text) => {
  try {
    const { clipboard } = require('electron');
    clipboard.writeText(text);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('shell:openExternal', async (_event, url) => {
  try {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url);
      return { ok: true };
    }
    return { ok: false, error: 'URL no permitida' };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

