const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherAPI', {
  // Sesion Microsoft
  getSession: () => ipcRenderer.invoke('auth:getSession'),
  login: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // Instancias
  listInstances: () => ipcRenderer.invoke('instances:list'),
  addInstanceByCode: (code) => ipcRenderer.invoke('instances:addByCode', code),
  createCustomInstance: (payload) => ipcRenderer.invoke('instances:createCustom', payload),
  removeInstance: (instanceId, deleteFiles) => ipcRenderer.invoke('instances:remove', instanceId, deleteFiles),
  renameInstance: (instanceId, newName) => ipcRenderer.invoke('instances:rename', instanceId, newName),
  updateInstanceSettings: (instanceId, settings) => ipcRenderer.invoke('instances:updateSettings', instanceId, settings),
  openInstanceFolder: (instanceId, subfolder) => ipcRenderer.invoke('instances:openFolder', instanceId, subfolder),
  openUserData: () => ipcRenderer.invoke('instances:openUserData'),
  syncInstance: (instanceId) => ipcRenderer.invoke('instances:sync', instanceId),
  playInstance: (instanceId) => ipcRenderer.invoke('instances:play', instanceId),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),

  // Metadata para el modal "Personalizado"
  listMinecraftVersions: () => ipcRenderer.invoke('meta:minecraftVersions'),
  listLoaderVersions: (minecraftVersion, loader) =>
    ipcRenderer.invoke('meta:loaderVersions', { minecraftVersion, loader }),

  // Modrinth search
  modrinthSearch: (params) => ipcRenderer.invoke('modrinth:search', params),
  modrinthGetProject: (idOrSlug) => ipcRenderer.invoke('modrinth:getProject', idOrSlug),
  modrinthGetVersions: (idOrSlug, loader, gameVersion) =>
    ipcRenderer.invoke('modrinth:getVersions', { idOrSlug, loader, gameVersion }),
  modrinthInstall: (instanceId, versionId) =>
    ipcRenderer.invoke('modrinth:install', { instanceId, versionId }),

  // CurseForge search
  curseforgeHasKey: () => ipcRenderer.invoke('curseforge:hasKey'),
  curseforgeSearch: (params) => ipcRenderer.invoke('curseforge:search', params),
  curseforgeGetProject: (projectId) => ipcRenderer.invoke('curseforge:getProject', { projectId }),
  curseforgeGetFiles: (projectId, instanceId) =>
    ipcRenderer.invoke('curseforge:getFiles', { projectId, instanceId }),
  curseforgeInstall: (instanceId, projectId, fileId) =>
    ipcRenderer.invoke('curseforge:install', { instanceId, projectId, fileId }),

  // Mod manager
  modsList: (instanceId) => ipcRenderer.invoke('mods:list', instanceId),
  modsToggle: (instanceId, filename) => ipcRenderer.invoke('mods:toggle', instanceId, filename),
  modsDelete: (instanceId, filename) => ipcRenderer.invoke('mods:delete', instanceId, filename),

  // Java detection
  javaDetect: () => ipcRenderer.invoke('java:detect'),
  javaSuggestFor: (mcVersion) => ipcRenderer.invoke('java:suggestFor', mcVersion),
  javaBrowse: () => ipcRenderer.invoke('java:browse'),

  // Logs & crash reports
  logsList: (instanceId) => ipcRenderer.invoke('logs:list', instanceId),
  logsRead: (instanceId, filename, lines) => ipcRenderer.invoke('logs:read', instanceId, filename, lines),
  crashReportsList: (instanceId) => ipcRenderer.invoke('crashreports:list', instanceId),
  crashReportsRead: (instanceId, filename) => ipcRenderer.invoke('crashreports:read', instanceId, filename),


  // Discord OAuth
  discordLogin: () => ipcRenderer.invoke('discord:login'),
  discordLogout: () => ipcRenderer.invoke('discord:logout'),
  discordGetSession: () => ipcRenderer.invoke('discord:getSession'),
  discordRegisterEvent: (eventId) => ipcRenderer.invoke('discord:registerEvent', eventId),
  discordUnregisterEvent: (eventId) => ipcRenderer.invoke('discord:unregisterEvent', eventId),
  discordGetMyEvents: () => ipcRenderer.invoke('discord:getMyEvents'),
  // Community
  eventsList: () => ipcRenderer.invoke('events:list'),
  eventGetParticipants: (eventId) => ipcRenderer.invoke('events:participants', eventId),
  communityServerStatus: (address) => ipcRenderer.invoke('community:serverStatus', address),
  communityNewsFeed: (feedUrl, limit) => ipcRenderer.invoke('community:newsFeed', feedUrl, limit),
  communityCopyToClipboard: (text) => ipcRenderer.invoke('community:copyToClipboard', text),

  // Eventos desde el main
  onSyncProgress: (callback) => {
    ipcRenderer.on('instances:syncProgress', (_event, data) => callback(data));
  },
  onPlayStatus: (callback) => {
    ipcRenderer.on('instances:playStatus', (_event, data) => callback(data));
  },
  onUpdateReady: (callback) => {
    ipcRenderer.on('update:ready', (_event, data) => callback(data));
  },
  onModrinthInstallProgress: (callback) => {
    ipcRenderer.on('modrinth:installProgress', (_event, data) => callback(data));
  },

  installUpdate: () => ipcRenderer.invoke('update:install')
});
