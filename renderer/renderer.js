let instances = [];
let selectedId = null;
let playing = false;
let mcVersionsCache = null;
let contextInstanceId = null;
let renameInstanceId = null;

// ----------------------------------------------------------------------------
// Particulas flotantes - canvas liviano en el fondo.
// ~50 particulas rosa/verde que se mueven lento y se conectan con lineas tenues
// si estan cerca. Bajo impacto en CPU.
// ----------------------------------------------------------------------------
(function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h;
  let particles = [];
  const PINK = '#ff2a4e';
  const GREEN = '#4dff7c';
  const COUNT = 55;
  const MAX_DIST = 110;

  function resize() {
    w = canvas.width = window.innerWidth * window.devicePixelRatio;
    h = canvas.height = window.innerHeight * window.devicePixelRatio;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    // Rescaleo al re-ocurrir.
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  }

  function makeParticle() {
    return {
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.4 + 0.6,
      color: Math.random() < 0.5 ? PINK : GREEN,
      alpha: Math.random() * 0.5 + 0.25,
    };
  }

  function init() {
    resize();
    particles = [];
    for (let i = 0; i < COUNT; i++) particles.push(makeParticle());
  }

  function step() {
    const W = window.innerWidth, H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);

    // Conexiones entre particulas cercanas.
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < MAX_DIST * MAX_DIST) {
          const alpha = (1 - Math.sqrt(d2) / MAX_DIST) * 0.08;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = a.color;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;

    // Particulas.
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -10) p.x = W + 10;
      if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10;
      if (p.y > H + 10) p.y = -10;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    requestAnimationFrame(step);
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); }, 150);
  });

  init();
  step();
})();

// ----------------------------------------------------------------------------
// Continua con el codigo existente.
// ----------------------------------------------------------------------------

const instanceListEl = document.getElementById('instance-list');
const instanceTitleEl = document.getElementById('instance-title');
const instanceCodeEl = document.getElementById('instance-code');
const playBtn = document.getElementById('play-btn');
const addInstanceBtn = document.getElementById('add-instance-btn');
const modal = document.getElementById('add-instance-modal');
const cancelAddBtn = document.getElementById('cancel-add-btn');
const confirmAddBtn = document.getElementById('confirm-add-btn');
const codeInput = document.getElementById('code-input');
const codeError = document.getElementById('code-error');
const accountNameEl = document.getElementById('account-name');
const accountStatusEl = document.getElementById('account-status');
const accountAvatarEl = document.getElementById('account-avatar');
const loginBtn = document.getElementById('login-btn');
const progressRow = document.getElementById('progress-row');
const progressText = document.getElementById('progress-text');
const progressPercent = document.getElementById('progress-percent');
const progressFill = document.getElementById('progress-fill');
const updateToast = document.getElementById('update-toast');
const updateToastText = document.getElementById('update-toast-text');
const updateToastBtn = document.getElementById('update-toast-btn');
const settingsBtn = document.getElementById('settings-btn');

// Context menu
const contextMenu = document.getElementById('context-menu');

// Confirm modal
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmOk = document.getElementById('confirm-ok');
const confirmCancel = document.getElementById('confirm-cancel');

// Rename modal
const renameModal = document.getElementById('rename-modal');
const renameInput = document.getElementById('rename-input');
const renameOk = document.getElementById('rename-ok');
const renameCancel = document.getElementById('rename-cancel');

// Modal de configuracion de instancia (per-instance settings).
const instSettingsModal = document.getElementById('instance-settings-modal');
const instSettingsSubtitle = document.getElementById('instance-settings-subtitle');
const instSettingsUseGlobal = document.getElementById('inst-settings-use-global');
const instSettingsCustomFields = document.getElementById('inst-settings-custom-fields');
const instSettingsRam = document.getElementById('inst-settings-ram');
const instSettingsRamValue = document.getElementById('inst-settings-ram-value');
const instSettingsJavaPath = document.getElementById('inst-settings-java-path');
const instSettingsJavaSelect = document.getElementById('inst-settings-java-select');
const instSettingsJavaRefresh = document.getElementById('inst-settings-java-refresh');
const instSettingsJavaBrowse = document.getElementById('inst-settings-java-browse');
const instSettingsJavaInfo = document.getElementById('inst-settings-java-info');
const instSettingsJvmArgs = document.getElementById('inst-settings-jvm-args');
let instSettingsDetectedJava = []; // cache del ultimo scan
let instSettingsCurrentMcVersion = null;
const instSettingsError = document.getElementById('inst-settings-error');
const instSettingsOk = document.getElementById('inst-settings-save');
const instSettingsCancel = document.getElementById('inst-settings-cancel');
let instSettingsCurrentId = null;

// Modrinth modal refs.
const modrinthModal = document.getElementById('modrinth-modal');
const modrinthSubtitle = document.getElementById('modrinth-subtitle');
const modrinthQuery = document.getElementById('modrinth-query');
const modrinthSearchBtn = document.getElementById('modrinth-search-btn');
const modrinthLoaderChips = document.getElementById('modrinth-loader-chips');
const modrinthTypeChips = document.getElementById('modrinth-type-chips');
const modrinthResults = document.getElementById('modrinth-results');
const modrinthError = document.getElementById('modrinth-error');
const modrinthClose = document.getElementById('modrinth-close');
const modrinthOpenBtn = document.getElementById('modrinth-open-btn');
const modrinthDetailModal = document.getElementById('modrinth-detail-modal');
const modrinthDetailTitle = document.getElementById('modrinth-detail-title');
const modrinthDetailAuthor = document.getElementById('modrinth-detail-author');
const modrinthDetailBody = document.getElementById('modrinth-detail-body');
const modrinthDetailError = document.getElementById('modrinth-detail-error');
const modrinthDetailBack = document.getElementById('modrinth-detail-back');
const modrinthDetailClose = document.getElementById('modrinth-detail-close');
const modrinthToast = document.getElementById('modrinth-toast');
const modrinthToastText = document.getElementById('modrinth-toast-text');
const modrinthToastFill = document.getElementById('modrinth-toast-fill');

// Onboarding de CurseForge.
const cfOnboardingModal = document.getElementById('cf-onboarding-modal');
const cfOnboardingKeyInput = document.getElementById('cf-onboarding-key');
const cfOnboardingError = document.getElementById('cf-onboarding-error');
const cfOnboardingValidate = document.getElementById('cf-onboarding-validate');
const cfOnboardingSkip = document.getElementById('cf-onboarding-skip');

// Mod manager refs.
const modsListBtn = document.getElementById('mods-list-btn');
const modsListModal = document.getElementById('mods-list-modal');
const modsListSubtitle = document.getElementById('mods-list-subtitle');
const modsListSearch = document.getElementById('mods-list-search');
const modsListStats = document.getElementById('mods-list-stats');
const modsList = document.getElementById('mods-list');
const modsListError = document.getElementById('mods-list-error');
const modsListOpenFolder = document.getElementById('mods-list-open-folder');
const modsListClose = document.getElementById('mods-list-close');
let modsListCurrentInstance = null;
let modsListAllMods = [];

// Logs viewer refs.
const logsOpenBtn = document.getElementById('logs-open-btn');
const logsModal = document.getElementById('logs-modal');
const logsSubtitle = document.getElementById('logs-subtitle');
const logsFileSelect = document.getElementById('logs-file-select');
const logsSearch = document.getElementById('logs-search');
const logsAutoRefresh = document.getElementById('logs-auto-refresh');
const logsContent = document.getElementById('logs-content');
const logsMeta = document.getElementById('logs-meta');
const logsError = document.getElementById('logs-error');
const logsOpenFolder = document.getElementById('logs-open-folder');
const logsRefresh = document.getElementById('logs-refresh');
const logsClose = document.getElementById('logs-close');
const crashListSelect = document.getElementById('crash-list-select');
const crashContent = document.getElementById('crash-content');
let logsCurrentInstance = null;
let logsCurrentFilter = 'all';
let logsCurrentLines = [];
let logsRefreshTimer = null;

// Community refs.
const communityOpenBtn = document.getElementById('community-open-btn');
const communityModal = document.getElementById('community-modal');
const communityServerStatus = document.getElementById('community-server-status');
const communityServerActions = document.getElementById('community-server-actions');
const communityCopyIp = document.getElementById('community-copy-ip');
const communityServerRefresh = document.getElementById('community-server-refresh');
const communityLinks = document.getElementById('community-links');
const communityNews = document.getElementById('community-news');
const communityRefreshAll = document.getElementById('community-refresh-all');
const communityClose = document.getElementById('community-close');
const settingsCommunityServer = document.getElementById('settings-community-server');
const settingsCommunityDiscord = document.getElementById('settings-community-discord');
const settingsCommunityNews = document.getElementById('settings-community-news');
const settingsCommunityWebsite = document.getElementById('settings-community-website');

// Estado del modal de busqueda.
let modrinthSelectedLoader = '';
let modrinthSelectedType = 'mod';
let modrinthSelectedSource = 'modrinth';
let modrinthLastResults = [];
let modrinthCurrentInstanceId = null;
let modrinthCurrentProjectId = null;

// Settings modal
const settingsModal = document.getElementById('settings-modal');
const settingsRam = document.getElementById('settings-ram');
const settingsRamValue = document.getElementById('settings-ram-value');
const settingsCfKey = document.getElementById('settings-cf-key');
const settingsCfChange = document.getElementById('settings-cf-change');
const settingsCfStatus = document.getElementById('settings-cf-status');
const settingsCfTest = document.getElementById('settings-cf-test');
const settingsCloseOnLaunch = document.getElementById('settings-close-on-launch');
const settingsOpenData = document.getElementById('settings-open-data');
const settingsCancel = document.getElementById('settings-cancel');
const settingsSave = document.getElementById('settings-save');
const settingsError = document.getElementById('settings-error');

// Custom tab elements
const customNameEl = document.getElementById('custom-name');
const customMcEl = document.getElementById('custom-mc-version');
const customLoaderEl = document.getElementById('custom-loader');
const customLoaderVerEl = document.getElementById('custom-loader-version');
const customLoaderVerLabel = document.getElementById('custom-loader-version-label');
const customErrorEl = document.getElementById('custom-error');
const cancelCustomBtn = document.getElementById('cancel-custom-btn');
const confirmCustomBtn = document.getElementById('confirm-custom-btn');

// Refresca la lista de instancias desde el backend. Usado despues de cualquier
// operacion que modifique instancias (crear, borrar, renombrar, sync, settings).
async function refreshInstances() {
  instances = await window.launcherAPI.listInstances();
  renderInstanceList();
  // Si la instancia seleccionada dejo de existir, limpiamos.
  if (selectedId && !instances.find((i) => i.id === selectedId)) {
    selectedId = null;
    clearMainPanel();
  }
}

async function init() {
  instances = await window.launcherAPI.listInstances();
  renderInstanceList();
  if (instances.length) selectInstance(instances[0].id);

  const session = await window.launcherAPI.getSession();
  renderAccount(session);

  window.launcherAPI.onUpdateReady((data) => {
    updateToastText.textContent = `Hay una nueva versión disponible (${data.version}).`;
    updateToast.classList.remove('hidden');
  });
  updateToastBtn.addEventListener('click', () => {
    window.launcherAPI.installUpdate();
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  customMcEl.addEventListener('change', refreshLoaderVersions);
  customLoaderEl.addEventListener('change', refreshLoaderVersions);

  // Cerrar context menu si click afuera.
  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) hideContextMenu();
  });
  document.addEventListener('contextmenu', (e) => {
    // Si el click derecho NO fue en una instancia, oculta el menu.
    const item = e.target.closest('.instance-item');
    if (!item) hideContextMenu();
  });

  // Context menu actions.
  contextMenu.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => handleContextAction(btn.dataset.action));
  });

  // Confirm modal.
  confirmCancel.addEventListener('click', () => confirmModal.classList.add('hidden'));
  confirmOk.addEventListener('click', () => {
    const cb = confirmOk._onOk;
    confirmModal.classList.add('hidden');
    if (cb) cb();
  });

  // Rename modal.
  renameCancel.addEventListener('click', () => renameModal.classList.add('hidden'));
  renameOk.addEventListener('click', async () => {

    if (!renameInstanceId) return;
    const result = await window.launcherAPI.renameInstance(renameInstanceId, renameInput.value);
    if (result.ok) {
      const inst = instances.find((i) => i.id === renameInstanceId);
      if (inst) inst.name = result.instance.name;
      renderInstanceList();
      if (selectedId === renameInstanceId) {
        instanceTitleEl.textContent = result.instance.name;
      }
    } else {
      alert('Error: ' + result.error);
    }
    renameModal.classList.add('hidden');
  });

  // Settings modal.
  settingsBtn.addEventListener('click', openSettings);
  settingsCancel.addEventListener('click', () => settingsModal.classList.add('hidden'));
  settingsSave.addEventListener('click', saveSettings);
  settingsOpenData.addEventListener('click', () => window.launcherAPI.openUserData());
  settingsCfChange.addEventListener('click', enableCfKeyEdit);
  settingsCfTest.addEventListener('click', testCurseForgeConnection);
  settingsRam.addEventListener('input', () => {
    settingsRamValue.textContent = settingsRam.value + ' GB';
  });

  // Per-instance settings modal listeners
  instSettingsUseGlobal.addEventListener('change', applyInstanceSettingsCustomVisibility);
  instSettingsRam.addEventListener('input', applyInstanceSettingsCustomVisibility);
  instSettingsCancel.addEventListener('click', () => instSettingsModal.classList.add('hidden'));
  instSettingsOk.addEventListener('click', saveInstanceSettings);
  instSettingsJavaRefresh.addEventListener('click', async () => {
    await loadDetectedJavaList(instSettingsCurrentMcVersion, instSettingsJavaPath.value.trim() || null);
  });
  instSettingsJavaBrowse.addEventListener('click', browseJavaExe);
  instSettingsJavaSelect.addEventListener('change', () => {
    // Si el user eligio algo del dropdown, vaciamos el input custom.
    if (instSettingsJavaSelect.value) {
      instSettingsJavaPath.value = '';
    }
  });

  // Modrinth modal listeners
  modrinthOpenBtn.addEventListener('click', openModrinthModal);
  modrinthClose.addEventListener('click', closeModrinthModal);
  modrinthSearchBtn.addEventListener('click', doModrinthSearch);
  modrinthQuery.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doModrinthSearch();
  });
  modrinthTypeChips.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      modrinthSelectedType = chip.dataset.type;
      renderModrinthChips();
      if (modrinthLastResults.length > 0) doModrinthSearch();
    });
  });
  // Toggle Modrinth / CurseForge
  document.querySelectorAll('.source-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      const source = opt.dataset.source;
      if (source === 'curseforge') {
        // Verificamos que tenga key antes de cambiar.
        window.launcherAPI.curseforgeHasKey().then((has) => {
          if (!has) {
            modrinthError.textContent = 'Necesitas una API key de CurseForge. Configurala en ⚙ Configuracion primero.';
            modrinthError.classList.remove('hidden');
            return;
          }
          modrinthSelectedSource = 'curseforge';
          document.querySelectorAll('.source-option').forEach((o) => o.classList.toggle('active', o.dataset.source === source));
          doModrinthSearch();
        });
      } else {
        modrinthSelectedSource = 'modrinth';
        document.querySelectorAll('.source-option').forEach((o) => o.classList.toggle('active', o.dataset.source === source));
        doModrinthSearch();
      }
    });
  });
  modrinthDetailBack.addEventListener('click', () => {
    modrinthDetailModal.classList.add('hidden');
  });
  modrinthDetailClose.addEventListener('click', closeModrinthModal);

  // Onboarding de CurseForge
  cfOnboardingValidate.addEventListener('click', handleCurseForgeOnboardingValidate);
  cfOnboardingSkip.addEventListener('click', handleCurseForgeOnboardingSkip);
  cfOnboardingKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCurseForgeOnboardingValidate();
  });

  // Mod manager
  modsListBtn.addEventListener('click', openModsListModal);
  modsListClose.addEventListener('click', closeModsListModal);
  modsListOpenFolder.addEventListener('click', async () => {
    if (!modsListCurrentInstance) return;
    const r = await window.launcherAPI.openInstanceFolder(modsListCurrentInstance, 'mods');
    if (!r.ok) alert(r.error);
  });
  modsListSearch.addEventListener('input', () => {
    if (modsListAllMods.length > 0) renderModsList(modsListAllMods);
  });

  // Logs viewer
  logsOpenBtn.addEventListener('click', openLogsModal);
  logsClose.addEventListener('click', closeLogsModal);
  logsRefresh.addEventListener('click', async () => {
    await refreshLogsList();
    await refreshLogsContent();
  });
  logsOpenFolder.addEventListener('click', async () => {
    if (!logsCurrentInstance) return;
    const r = await window.launcherAPI.openInstanceFolder(logsCurrentInstance, 'logs');
    if (!r.ok) alert(r.error);
  });
  logsFileSelect.addEventListener('change', refreshLogsContent);
  logsSearch.addEventListener('input', () => {
    if (logsCurrentLines.length > 0) renderLogsContent();
  });
  document.querySelectorAll('[data-log-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchLogTab(btn.dataset.logTab));
  });
  document.querySelectorAll('#log-tab-logs .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#log-tab-logs .chip').forEach((c) => c.classList.toggle('active', c === chip));
      logsCurrentFilter = chip.dataset.filter;
      renderLogsContent();
    });
  });
  crashListSelect.addEventListener('change', loadSelectedCrash);
  logsAutoRefresh.addEventListener('change', () => {
    if (logsRefreshTimer) {
      clearInterval(logsRefreshTimer);
      logsRefreshTimer = null;
    }
    if (logsAutoRefresh.checked) {
      logsRefreshTimer = setInterval(() => {
        refreshLogsContent();
      }, 3000);
    }
  });

  // Community
  communityOpenBtn.addEventListener('click', openCommunityModal);
  communityClose.addEventListener('click', closeCommunityModal);
  communityRefreshAll.addEventListener('click', refreshCommunityAll);
  communityServerRefresh.addEventListener('click', async () => {
    const s = await window.launcherAPI.getSettings();
    await refreshCommunityServer(s.communityServerAddress || '');
  });
  communityCopyIp.addEventListener('click', copyCommunityServerIp);

  // Progreso de instalacion de mod (toast).
  window.launcherAPI.onModrinthInstallProgress((data) => {
    if (data.stage === 'downloading') {
      modrinthToastText.textContent = `Descargando ${data.filename}...`;
      modrinthToastFill.style.width = (data.percent || 0) + '%';
    } else if (data.stage === 'done') {
      modrinthToastText.textContent = 'Instalado correctamente';
      modrinthToastFill.style.width = '100%';
      setTimeout(() => { modrinthToast.classList.add('hidden'); }, 2500);
    }
  });
}

function renderAccount(session) {
  if (session) {
    accountNameEl.textContent = session.name;
    accountStatusEl.textContent = 'Sesión Microsoft activa';
    accountAvatarEl.textContent = session.name.slice(0, 2).toUpperCase();
    loginBtn.textContent = 'Cerrar sesión';
  } else {
    accountNameEl.textContent = 'Sin sesión';
    accountStatusEl.textContent = 'Sin sesión';
    accountAvatarEl.textContent = '--';
    loginBtn.textContent = 'Iniciar sesión con Microsoft';
  }
}

loginBtn.addEventListener('click', async () => {
  const session = await window.launcherAPI.getSession();
  if (session) {
    await window.launcherAPI.logout();
    renderAccount(null);
    return;
  }
  loginBtn.disabled = true;
  loginBtn.textContent = 'Iniciando sesión...';
  const result = await window.launcherAPI.login();
  loginBtn.disabled = false;
  if (!result.ok) {
    alert('No se pudo iniciar sesión: ' + result.error);
    renderAccount(null);
    return;
  }
  renderAccount(result.session);
});

function loaderLabel(loader) {
  return loader === 'vanilla' ? 'Vanilla' :
         loader === 'forge' ? 'Forge' :
         loader === 'neoforge' ? 'NeoForge' :
         loader === 'fabric' ? 'Fabric' : loader;
}

function renderInstanceList() {
  instanceListEl.innerHTML = '';
  instances.forEach((inst) => {
    const item = document.createElement('div');
    item.className = 'instance-item' + (inst.id === selectedId ? ' active' : '');
    item.dataset.id = inst.id;
    const meta = `${inst.minecraftVersion} · ${loaderLabel(inst.loader)}${inst.loaderVersion ? ' ' + inst.loaderVersion : ''}`;
    // Indicador de settings custom: si useGlobalSettings === false, mostramos un puntito rosa.
    const hasCustomSettings = inst.settings && inst.settings.useGlobalSettings === false;
    item.innerHTML = `
      <div class="instance-icon">🎮</div>
      <div class="instance-info">
        <p class="instance-name">${inst.name}</p>
        <p class="instance-meta">${meta}</p>
      </div>
      <div class="instance-badges">
        ${hasCustomSettings ? '<span class="badge-custom" title="Configuración personalizada">⚙</span>' : ''}
      </div>
      <button class="instance-menu-btn" data-id="${inst.id}" title="Opciones">⋯</button>
    `;
    item.addEventListener('click', (e) => {
      // Si el click fue en el boton "..." dejamos que el otro handler actue.
      if (e.target.classList.contains('instance-menu-btn')) return;
      selectInstance(inst.id);
    });
    item.querySelector('.instance-menu-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      showContextMenu(inst.id, e.clientX, e.clientY);
    });
    // Click derecho abre el menu tambien.
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(inst.id, e.clientX, e.clientY);
    });
    instanceListEl.appendChild(item);
  });
}

function selectInstance(id) {
  closeEventsView();
  selectedId = id;
  const inst = instances.find((i) => i.id === id);
  if (!inst) return;

  instanceTitleEl.textContent = inst.name;
  if (inst.custom) {
    instanceCodeEl.textContent = `Personalizado · ${inst.minecraftVersion} · ${loaderLabel(inst.loader)}${inst.loaderVersion ? ' ' + inst.loaderVersion : ''}`;
  } else {
    instanceCodeEl.textContent = `Código de instalación: ${inst.code} · ${inst.minecraftVersion} · ${loaderLabel(inst.loader)}${inst.loaderVersion ? ' ' + inst.loaderVersion : ''}`;
  }
  playBtn.disabled = playing;
  renderInstanceList();
  syncSelectedInstance(inst);
}

async function syncSelectedInstance(inst) {
  if (playing) return;
  if (inst.custom) return;
  progressRow.classList.remove('hidden');
  progressText.textContent = 'Buscando actualizaciones...';
  progressPercent.textContent = '';
  progressFill.style.width = '0%';
  playBtn.disabled = true;

  const result = await window.launcherAPI.syncInstance(inst.id);

  if (!result.ok) {
    progressText.textContent = 'Error al sincronizar: ' + result.error;
    playBtn.disabled = false;
    return;
  }

  if (!result.updated) {
    progressRow.classList.add('hidden');
  } else {
    progressText.textContent = `Listo (${result.modsDownloaded} mods actualizados)`;
    progressFill.style.width = '100%';
    setTimeout(() => progressRow.classList.add('hidden'), 1500);
  }
  playBtn.disabled = false;
}

window.launcherAPI.onSyncProgress(({ current, total, modName }) => {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  progressText.textContent = `Descargando ${modName}...`;
  progressPercent.textContent = `${current}/${total}`;
  progressFill.style.width = `${pct}%`;
});

window.launcherAPI.onPlayStatus(({ stage, current, total, label }) => {
  progressRow.classList.remove('hidden');
  progressText.textContent = label || stage;
  if (total > 0) {
    progressPercent.textContent = `${current}/${total}`;
    progressFill.style.width = `${Math.round((current / total) * 100)}%`;
  } else if (current > 0 && stage === 'java') {
    progressPercent.textContent = `${(current / 1024 / 1024).toFixed(1)} MB`;
    progressFill.style.width = '40%';
  } else {
    progressPercent.textContent = '';
    progressFill.style.width = '60%';
  }

  if (stage === 'exited') {
    playing = false;
    playBtn.disabled = false;
    playBtn.textContent = 'Jugar';
    setTimeout(() => progressRow.classList.add('hidden'), 2500);
  }
});

// ---- Context menu ----

function showContextMenu(instanceId, x, y) {
  contextInstanceId = instanceId;
  contextMenu.classList.remove('hidden');
  // Posicionar; clamp para que no se salga de la pantalla.
  const w = contextMenu.offsetWidth;
  const h = contextMenu.offsetHeight;
  contextMenu.style.left = Math.min(x, window.innerWidth - w - 8) + 'px';
  contextMenu.style.top = Math.min(y, window.innerHeight - h - 8) + 'px';
}

function hideContextMenu() {
  contextMenu.classList.add('hidden');
  contextInstanceId = null;
}

async function handleContextAction(action) {
  // Capturamos el id ANTES de ocultar el menu, porque hideContextMenu
  // lo limpia.
  const id = contextInstanceId;
  hideContextMenu();
  if (!id) return;
  const inst = instances.find((i) => i.id === id);
  if (!inst) return;

  if (action === 'rename') {
    renameInstanceId = id;
    renameInput.value = inst.name;
    renameModal.classList.remove('hidden');
    setTimeout(() => renameInput.focus(), 50);
  } else if (action === 'settings') {
    openInstanceSettingsModal(inst);
  } else if (action === 'openRoot') {
    const r = await window.launcherAPI.openInstanceFolder(id, 'root');
    if (!r.ok) alert(r.error);
  } else if (action === 'openMods') {
    const r = await window.launcherAPI.openInstanceFolder(id, 'mods');
    if (!r.ok) alert(r.error);
  } else if (action === 'openLogs') {
    const r = await window.launcherAPI.openInstanceFolder(id, 'logs');
    if (!r.ok) alert(r.error);
  } else if (action === 'openSaves') {
    const r = await window.launcherAPI.openInstanceFolder(id, 'saves');
    if (!r.ok) alert(r.error);
  } else if (action === 'delete') {
    confirmTitle.textContent = `Eliminar "${inst.name}"`;
    confirmMessage.innerHTML = `
      ¿Qué querés hacer con los archivos?
      <br /><br />
      <label class="checkbox-row">
        <input type="checkbox" id="delete-files-chk" />
        <span>Borrar tambien los archivos de la instancia (mods, configs, mundos)</span>
      </label>
    `;
    confirmModal.classList.remove('hidden');
    confirmOk._onOk = async () => {
      const deleteFiles = document.getElementById('delete-files-chk').checked;
      const result = await window.launcherAPI.removeInstance(id, deleteFiles);
      if (!result.ok) {
        alert('Error: ' + result.error);
        return;
      }
      instances = instances.filter((i) => i.id !== id);
      if (selectedId === id) {
        selectedId = instances.length ? instances[0].id : null;
        if (selectedId) selectInstance(selectedId);
        else clearMainPanel();
      }
      renderInstanceList();
    };
  }
}

function clearMainPanel() {
  instanceTitleEl.textContent = 'Selecciona una instancia';
  instanceCodeEl.textContent = '';
  playBtn.disabled = true;
}

// ---- Settings modal ----

async function openSettings() {
  settingsError.classList.add('hidden');
  const s = await window.launcherAPI.getSettings();
  // Range slider va en GB (2..12). Default 4.
  const ramGb = Math.round((s.ramMb || 4096) / 1024);
  settingsRam.value = ramGb;
  settingsRamValue.textContent = ramGb + ' GB';
  settingsCloseOnLaunch.checked = !!s.closeOnLaunch;
  // API key de CurseForge: si esta enmascarada, mostramos el placeholder
  // y dejamos el campo vacio. Un boton "Cambiar" permite reemplazarla.
  const hasKey = !!s.curseforgeApiKey;
  if (hasKey) {
    settingsCfKey.value = '';
    settingsCfKey.placeholder = `Key actual: ${s.curseforgeApiKey} (dejala vacia para no cambiar)`;
    settingsCfKey.disabled = true;
    settingsCfChange.style.display = 'flex';
  } else {
    settingsCfKey.value = '';
    settingsCfKey.placeholder = 'Conseguila gratis en console.curseforge.com';
    settingsCfKey.disabled = false;
    settingsCfChange.style.display = 'none';
  }
  settingsCfStatus.textContent = hasKey
    ? `✓ Key configurada: ${s.curseforgeApiKey}`
    : 'Solo se guarda localmente. Si está vacía, el launcher usa solo Modrinth.';
  // Comunidad
  settingsCommunityServer.value = s.communityServerAddress || '';
  settingsCommunityDiscord.value = s.communityDiscordInvite || '';
  settingsCommunityNews.value = s.communityNewsFeed || '';
  settingsCommunityWebsite.value = s.communityWebsite || '';
  settingsModal.classList.remove('hidden');
}

function enableCfKeyEdit() {
  settingsCfKey.disabled = false;
  settingsCfKey.value = '';
  settingsCfKey.placeholder = 'Pegá tu nueva API key';
  settingsCfKey.focus();
  settingsCfChange.style.display = 'none';
}

async function testCurseForgeConnection() {
  settingsCfTest.disabled = true;
  const originalText = settingsCfTest.textContent;
  settingsCfTest.textContent = 'Probando...';
  const has = await window.launcherAPI.curseforgeHasKey();
  if (!has) {
    settingsError.textContent = 'No hay key de CurseForge configurada.';
    settingsError.classList.remove('hidden');
    settingsCfTest.disabled = false;
    settingsCfTest.textContent = originalText;
    return;
  }
  // Probamos con una busqueda real.
  const result = await window.launcherAPI.curseforgeSearch({
    query: 'jei', projectType: 'mod', pageSize: 1, index: 0,
  });
  settingsCfTest.disabled = false;
  settingsCfTest.textContent = originalText;
  if (result.ok) {
    settingsError.textContent = '';
    settingsError.classList.add('hidden');
    alert('✓ Conexión exitosa con CurseForge (' + (result.total || 0) + ' resultados para "jei")');
  } else {
    settingsError.textContent = 'Error: ' + result.error;
    settingsError.classList.remove('hidden');
  }
}

async function saveSettings() {
  const ramGb = parseInt(settingsRam.value, 10);
  const payload = {
    ramMb: ramGb * 1024,
    closeOnLaunch: settingsCloseOnLaunch.checked,
    communityServerAddress: settingsCommunityServer.value.trim() || null,
    communityDiscordInvite: settingsCommunityDiscord.value.trim() || null,
    communityNewsFeed: settingsCommunityNews.value.trim() || null,
    communityWebsite: settingsCommunityWebsite.value.trim() || null,
  };
  // Si escribio algo en el campo de CF, lo guardamos. Si lo dejo vacio, el
  // backend detecta que es el placeholder y no lo cambia.
  if (settingsCfKey.value) {
    payload.curseforgeApiKey = settingsCfKey.value;
  }
  const result = await window.launcherAPI.setSettings(payload);
  if (!result.ok) {
    settingsError.textContent = result.error;
    settingsError.classList.remove('hidden');
    return;
  }
  settingsModal.classList.add('hidden');
}

// ---- Per-instance settings modal ----
function applyInstanceSettingsCustomVisibility() {
  const useGlobal = instSettingsUseGlobal.checked;
  instSettingsCustomFields.style.opacity = useGlobal ? '0.4' : '1';
  instSettingsCustomFields.style.pointerEvents = useGlobal ? 'none' : 'auto';
  // Re-sincronizamos el label del slider para que muestre "(vacío = global)" o no.
  if (useGlobal) {
    instSettingsRamValue.innerHTML = '<span style="opacity:0.6">(usa configuración global)</span>';
  } else {
    const gb = parseInt(instSettingsRam.value, 10);
    instSettingsRamValue.innerHTML = `${gb} GB <span style="opacity:0.6">(vacío = usar global)</span>`;
  }
}

async function openInstanceSettingsModal(inst) {
  instSettingsCurrentId = inst.id;
  instSettingsCurrentMcVersion = inst.minecraftVersion;
  instSettingsSubtitle.textContent = `Ajustes personalizados solo para "${inst.name}"`;
  instSettingsError.classList.add('hidden');

  const s = inst.settings || { useGlobalSettings: true, ramMb: null, javaPath: null, jvmArgs: null };
  instSettingsUseGlobal.checked = s.useGlobalSettings !== false;
  instSettingsRam.value = s.ramMb ? Math.round(s.ramMb / 1024) : 4;
  instSettingsJavaPath.value = s.javaPath || '';
  instSettingsJvmArgs.value = s.jvmArgs || '';

  applyInstanceSettingsCustomVisibility();
  instSettingsModal.classList.remove('hidden');

  // Cargar la lista de Java detectadas y popular el dropdown.
  await loadDetectedJavaList(inst.minecraftVersion, s.javaPath);
}

async function loadDetectedJavaList(mcVersion, currentJavaPath) {
  instSettingsDetectedJava = [];
  instSettingsJavaSelect.innerHTML = '<option value="">Auto (recomendado)</option>';
  instSettingsJavaSelect.disabled = true;
  instSettingsJavaInfo.textContent = 'Escaneando Java del sistema...';

  const result = await window.launcherAPI.javaDetect();
  if (!result.ok) {
    instSettingsJavaInfo.textContent = 'Error al escanear: ' + result.error;
    return;
  }
  instSettingsDetectedJava = result.list || [];
  if (instSettingsDetectedJava.length === 0) {
    instSettingsJavaInfo.textContent = 'No se detectó Java. Pegá un path custom o dejá Auto para que el launcher descargue uno.';
    return;
  }
  // Populamos el select.
  // Calculamos la sugerencia para esta MC version.
  const suggestedMajor = computeSuggestedJavaMajor(mcVersion);
  for (const j of instSettingsDetectedJava) {
    const opt = document.createElement('option');
    opt.value = j.path;
    const star = j.major >= suggestedMajor ? ' ⭐' : '';
    opt.textContent = `${j.vendor} ${j.version} (Java ${j.major})${star}`;
    instSettingsJavaSelect.appendChild(opt);
  }
  instSettingsJavaSelect.disabled = false;
  instSettingsJavaInfo.textContent = `${instSettingsDetectedJava.length} Java(s) detectada(s). ⭐ = ideal para MC ${mcVersion}. Auto = elige automáticamente.`;

  // Si hay un javaPath configurado, lo seleccionamos.
  if (currentJavaPath) {
    const found = instSettingsDetectedJava.find((j) => j.path === currentJavaPath);
    if (found) {
      instSettingsJavaSelect.value = currentJavaPath;
    } else {
      // Path custom que no esta en la lista: lo agregamos al select.
      const opt = document.createElement('option');
      opt.value = currentJavaPath;
      opt.textContent = `Custom: ${currentJavaPath}`;
      opt.selected = true;
      instSettingsJavaSelect.appendChild(opt);
    }
  }
}

function computeSuggestedJavaMajor(mcVersion) {
  if (!mcVersion) return 17;
  const parts = mcVersion.split('.').map((p) => parseInt(p, 10) || 0);
  if (parts.length < 2 || parts[0] !== 1) return 17;
  const minor = parts[1];
  if (minor < 17) return 8;
  if (minor < 20 || (minor === 20 && (parts[2] || 0) < 5)) return 17;
  return 21;
}

async function browseJavaExe() {
  const r = await window.launcherAPI.javaBrowse();
  if (r.ok && r.path) {
    instSettingsJavaPath.value = r.path;
    // Si el path no esta en el select, lo agregamos.
    let exists = false;
    for (const opt of instSettingsJavaSelect.options) {
      if (opt.value === r.path) { exists = true; break; }
    }
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = r.path;
      opt.textContent = `Custom: ${r.path}`;
      opt.selected = true;
      instSettingsJavaSelect.appendChild(opt);
    } else {
      instSettingsJavaSelect.value = r.path;
    }
  }
}

async function saveInstanceSettings() {
  if (!instSettingsCurrentId) return;
  instSettingsError.classList.add('hidden');

  try {
    const useGlobal = instSettingsUseGlobal.checked;
    // Si usa global, mandamos todos los campos como null. Si no, los del form.
    const payload = useGlobal ? {
      useGlobalSettings: true,
      ramMb: null,
      javaPath: null,
      jvmArgs: null
    } : {
      useGlobalSettings: false,
      ramMb: parseInt(instSettingsRam.value, 10) * 1024,
      // Prioridad: input custom si tiene algo, sino el select.
      javaPath: instSettingsJavaPath.value.trim() || instSettingsJavaSelect.value || null,
      jvmArgs: instSettingsJvmArgs.value.trim() || null
    };

    const result = await window.launcherAPI.updateInstanceSettings(instSettingsCurrentId, payload);
    if (!result || !result.ok) {
      instSettingsError.textContent = (result && result.error) || 'Error desconocido al guardar';
      instSettingsError.classList.remove('hidden');
      return;
    }
    // Refrescamos la lista local para que el sidebar muestre el cambio.
    await refreshInstances();
    instSettingsModal.classList.add('hidden');
    instSettingsCurrentId = null;
  } catch (err) {
    console.error('Error guardando instance settings:', err);
    instSettingsError.textContent = 'Error: ' + (err && err.message ? err.message : String(err));
    instSettingsError.classList.remove('hidden');
  }
}

// ---- Modrinth search modal ----

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatNumber(n) {
  if (n == null) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function renderModrinthChips() {
  // Loader chips: Auto + el loader de la instancia (si hay).
  modrinthLoaderChips.innerHTML = '';
  const loaders = [{ value: '', label: 'Auto' }];
  if (modrinthCurrentInstanceId) {
    const inst = instances.find((i) => i.id === modrinthCurrentInstanceId);
    if (inst && inst.loader) {
      const map = { forge: 'Forge', neoforge: 'NeoForge', fabric: 'Fabric', vanilla: 'Vanilla' };
      if (map[inst.loader]) {
        loaders.push({ value: inst.loader, label: map[inst.loader] });
      }
    }
  }
  for (const l of loaders) {
    const chip = document.createElement('span');
    chip.className = 'chip' + (modrinthSelectedLoader === l.value ? ' active' : '');
    chip.dataset.loader = l.value;
    chip.textContent = l.label;
    chip.addEventListener('click', () => {
      modrinthSelectedLoader = l.value;
      renderModrinthChips();
      if (modrinthLastResults.length > 0) doModrinthSearch();
    });
    modrinthLoaderChips.appendChild(chip);
  }

  // Type chips.
  modrinthTypeChips.querySelectorAll('.chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.type === modrinthSelectedType);
  });
}

function renderModrinthResults(hits) {
  modrinthLastResults = hits;
  if (hits.length === 0) {
    modrinthResults.innerHTML = '<p class="modrinth-empty">No se encontraron resultados.</p>';
    return;
  }
  const html = '<div class="modrinth-grid">' + hits.map((h) => {
    const iconUrl = h.icon_url || '';
    const initial = (h.title || h.slug || '?').charAt(0).toUpperCase();
    const desc = h.description || '';
    return `
      <div class="mod-card" data-slug="${escapeHtml(h.slug)}" data-project-id="${escapeHtml(h.project_id)}">
        ${iconUrl
          ? `<img class="mod-card-icon" src="${escapeHtml(iconUrl)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'mod-card-icon-placeholder',textContent:${JSON.stringify(initial)}}))">`
          : `<div class="mod-card-icon-placeholder">${escapeHtml(initial)}</div>`}
        <div class="mod-card-title">${escapeHtml(h.title)}</div>
        <div class="mod-card-author">por ${escapeHtml(h.author || 'desconocido')}</div>
        <div class="mod-card-desc">${escapeHtml(desc)}</div>
        <div class="mod-card-stats">
          <span>⬇ ${formatNumber(h.downloads)}</span>
          <span>★ ${formatNumber(h.follows)}</span>
        </div>
      </div>`;
  }).join('') + '</div>';
  modrinthResults.innerHTML = html;
  modrinthResults.querySelectorAll('.mod-card').forEach((card) => {
    card.addEventListener('click', () => {
      const slug = card.dataset.slug;
      const projectId = card.dataset.projectId;
      modrinthCurrentProjectId = projectId;
      openModrinthDetail(slug || projectId);
    });
  });
}

async function doModrinthSearch() {
  modrinthError.classList.add('hidden');
  const query = modrinthQuery.value.trim();
  modrinthResults.innerHTML = '<p class="modrinth-empty">Buscando...</p>';

  const result = modrinthSelectedSource === 'modrinth'
    ? await window.launcherAPI.modrinthSearch({
        query, index: 'relevance', limit: 30, projectType: modrinthSelectedType,
        facets: buildModrinthFacets(),
      })
    : await window.launcherAPI.curseforgeSearch({
        query, projectType: modrinthSelectedType, instanceId: modrinthCurrentInstanceId, pageSize: 30, index: 0,
      });

  if (!result.ok) {
    modrinthResults.innerHTML = '';
    modrinthError.textContent = result.error;
    modrinthError.classList.remove('hidden');
    return;
  }
  renderModrinthResults(result.hits || []);
}

function buildModrinthFacets() {
  const inst = instances.find((i) => i.id === modrinthCurrentInstanceId);
  const facets = [['project_type:' + modrinthSelectedType]];
  if (inst && inst.minecraftVersion) {
    facets.push(['versions:' + inst.minecraftVersion]);
  }
  if (modrinthSelectedLoader) {
    const map = { forge: 'forge', neoforge: 'neoforge', fabric: 'fabric' };
    const mrLoader = map[modrinthSelectedLoader] || modrinthSelectedLoader;
    facets.push(['loaders:' + mrLoader]);
  }
  return facets;
}

async function openModrinthModal() {
  if (!selectedId) return;
  modrinthCurrentInstanceId = selectedId;
  const inst = instances.find((i) => i.id === selectedId);
  modrinthSubtitle.textContent = inst
    ? `Busca mods compatibles con "${inst.name}" (${inst.minecraftVersion} · ${inst.loader})`
    : 'Busca mods en Modrinth';
  modrinthSelectedLoader = '';
  modrinthSelectedType = 'mod';
  modrinthSelectedSource = 'modrinth';
  modrinthQuery.value = '';
  modrinthResults.innerHTML = '<p class="modrinth-empty">Escribí algo y dale a Buscar para empezar.</p>';
  modrinthError.classList.add('hidden');
  renderModrinthChips();

  // Si nunca vio el onboarding de CF y no tiene key, lo mostramos.
  const s = await window.launcherAPI.getSettings();
  if (!s.cfOnboardingDismissed) {
    openCurseForgeOnboarding();
    return;
  }

  modrinthModal.classList.remove('hidden');
  setTimeout(() => modrinthQuery.focus(), 50);
}

function openCurseForgeOnboarding() {
  cfOnboardingKeyInput.value = '';
  cfOnboardingError.classList.add('hidden');
  cfOnboardingValidate.disabled = false;
  cfOnboardingValidate.textContent = 'Validar y guardar';
  cfOnboardingModal.classList.remove('hidden');
  setTimeout(() => cfOnboardingKeyInput.focus(), 50);
}

async function handleCurseForgeOnboardingValidate() {
  const key = cfOnboardingKeyInput.value.trim();
  if (!key) {
    cfOnboardingError.textContent = 'Pegá tu key primero';
    cfOnboardingError.classList.remove('hidden');
    cfOnboardingKeyInput.focus();
    return;
  }
  cfOnboardingError.classList.add('hidden');
  cfOnboardingValidate.disabled = true;
  cfOnboardingValidate.textContent = 'Validando...';

  // Guardamos la key primero (escrita en el storage).
  const setResult = await window.launcherAPI.setSettings({ curseforgeApiKey: key });
  if (!setResult.ok) {
    cfOnboardingError.textContent = setResult.error || 'No se pudo guardar la key';
    cfOnboardingError.classList.remove('hidden');
    cfOnboardingValidate.disabled = false;
    cfOnboardingValidate.textContent = 'Validar y guardar';
    return;
  }

  // Validamos haciendo una busqueda real. Si funciona, la key es valida.
  const test = await window.launcherAPI.curseforgeSearch({
    query: 'jei', projectType: 'mod', pageSize: 1, index: 0,
  });

  cfOnboardingValidate.disabled = false;
  cfOnboardingValidate.textContent = 'Validar y guardar';

  if (!test.ok) {
    // Revertimos la key invalida.
    await window.launcherAPI.setSettings({ curseforgeApiKey: '' });
    cfOnboardingError.textContent = 'La key no es válida o no tiene permisos. Verificá que la copiaste completa. Error: ' + test.error;
    cfOnboardingError.classList.remove('hidden');
    return;
  }

  // Éxito: marcamos onboarding como visto y abrimos el modal de mods en modo CF.
  await window.launcherAPI.setSettings({ cfOnboardingDismissed: true });
  cfOnboardingModal.classList.add('hidden');
  modrinthSelectedSource = 'curseforge';
  document.querySelectorAll('.source-option').forEach((o) =>
    o.classList.toggle('active', o.dataset.source === 'curseforge')
  );
  modrinthModal.classList.remove('hidden');
  setTimeout(() => modrinthQuery.focus(), 50);
  doModrinthSearch();
}

async function handleCurseForgeOnboardingSkip() {
  // El user eligio usar solo Modrinth. Marcamos como dismissed y abrimos el modal.
  await window.launcherAPI.setSettings({ cfOnboardingDismissed: true });
  cfOnboardingModal.classList.add('hidden');
  modrinthSelectedSource = 'modrinth';
  document.querySelectorAll('.source-option').forEach((o) =>
    o.classList.toggle('active', o.dataset.source === 'modrinth')
  );
  modrinthModal.classList.remove('hidden');
  setTimeout(() => modrinthQuery.focus(), 50);
}

function closeModrinthModal() {
  modrinthModal.classList.add('hidden');
  modrinthDetailModal.classList.add('hidden');
  modrinthCurrentInstanceId = null;
}

async function openModrinthDetail(idOrSlug) {
  modrinthDetailTitle.textContent = 'Cargando...';
  modrinthDetailAuthor.textContent = '';
  modrinthDetailBody.innerHTML = '<p class="modrinth-empty">Cargando...</p>';
  modrinthDetailError.classList.add('hidden');
  modrinthDetailModal.classList.remove('hidden');

  const inst = instances.find((i) => i.id === modrinthCurrentInstanceId) || {};
  const projResult = modrinthSelectedSource === 'modrinth'
    ? await window.launcherAPI.modrinthGetProject(idOrSlug)
    : await window.launcherAPI.curseforgeGetProject(idOrSlug);
  const versionsResult = modrinthSelectedSource === 'modrinth'
    ? await window.launcherAPI.modrinthGetVersions(idOrSlug, inst.loader || undefined, inst.minecraftVersion)
    : await window.launcherAPI.curseforgeGetFiles(idOrSlug, modrinthCurrentInstanceId);

  if (!projResult.ok) {
    modrinthDetailError.textContent = projResult.error;
    modrinthDetailError.classList.remove('hidden');
    modrinthDetailBody.innerHTML = '';
    return;
  }
  if (!versionsResult.ok) {
    modrinthDetailError.textContent = versionsResult.error;
    modrinthDetailError.classList.remove('hidden');
    modrinthDetailBody.innerHTML = '';
    return;
  }
  const project = projResult.project;
  const versions = versionsResult.versions || [];

  modrinthDetailTitle.textContent = project.title || project.slug;
  modrinthDetailAuthor.textContent = `por ${project.author ? (typeof project.author === 'string' ? project.author : (project.author.name || '?')) : '?'}`;

  const initial = (project.title || project.slug || '?').charAt(0).toUpperCase();
  const iconHtml = project.icon_url
    ? `<img class="mod-detail-icon" src="${escapeHtml(project.icon_url)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'mod-detail-icon-placeholder',textContent:${JSON.stringify(initial)}}))">`
    : `<div class="mod-detail-icon-placeholder">${escapeHtml(initial)}</div>`;

  const body = versions.length === 0
    ? '<p class="modrinth-empty">No hay versiones compatibles con esta instancia.</p>'
    : '<p class="mod-detail-versions">Versiones compatibles</p>' + versions.slice(0, 10).map((v) => {
      const loaders = (v.loaders || []).join(', ');
      const versionsMc = (v.game_versions || []).join(', ');
      const fileSizeMB = v.files && v.files[0] ? (v.files[0].size / 1024 / 1024).toFixed(1) : '?';
      return `
        <div class="mod-version-row">
          <div class="mod-version-info">
            <div class="mod-version-name">${escapeHtml(v.name || v.version_number || 'sin nombre')}</div>
            <div class="mod-version-meta">${escapeHtml(loaders)} · ${escapeHtml(versionsMc)} · ${fileSizeMB} MB</div>
          </div>
          <button class="mod-install-btn" data-version-id="${escapeHtml(v.id)}">Instalar</button>
        </div>`;
    }).join('');

  modrinthDetailBody.innerHTML = `
    <div class="mod-detail-header">
      ${iconHtml}
      <div class="mod-detail-info">
        <div class="mod-detail-stats">
          <span>⬇ ${formatNumber(project.downloads)} descargas</span>
          <span>★ ${formatNumber(project.followers)} seguidores</span>
        </div>
        <div class="mod-detail-stats" style="margin-top:8px">
          <span>Licencia: ${escapeHtml(project.license && project.license.name ? project.license.name : (project.license || '?'))}</span>
        </div>
      </div>
    </div>
    <div class="mod-detail-description">${escapeHtml(project.description || 'Sin descripcion.')}</div>
    ${body}`;

  modrinthDetailBody.querySelectorAll('.mod-install-btn').forEach((btn) => {
    btn.addEventListener('click', () => installModrinthVersion(btn.dataset.versionId, btn));
  });
}

async function installModrinthVersion(versionId, btn) {
  if (!modrinthCurrentInstanceId) return;
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Instalando...';
  modrinthToast.classList.remove('hidden');
  modrinthToastText.textContent = 'Instalando mod...';
  modrinthToastFill.style.width = '0%';

  const result = modrinthSelectedSource === 'modrinth'
    ? await window.launcherAPI.modrinthInstall(modrinthCurrentInstanceId, versionId)
    : await window.launcherAPI.curseforgeInstall(modrinthCurrentInstanceId, modrinthCurrentProjectId, versionId);
  btn.disabled = false;
  btn.textContent = originalText;
  if (!result.ok) {
    modrinthDetailError.textContent = result.error;
    modrinthDetailError.classList.remove('hidden');
    modrinthToastText.textContent = 'Error: ' + result.error;
    modrinthToastFill.style.width = '0%';
    modrinthToastFill.style.background = 'linear-gradient(90deg, #e5484d, #c93338)';
    setTimeout(() => { modrinthToast.classList.add('hidden'); modrinthToastFill.style.background = ''; }, 3000);
    return;
  }
  if (result.alreadyInstalled) {
    modrinthToastText.textContent = 'Ya estaba instalado';
  } else {
    modrinthToastText.textContent = 'Instalado correctamente';
  }
  modrinthToastFill.style.width = '100%';
  setTimeout(() => { modrinthToast.classList.add('hidden'); }, 2500);
}

// ---- Mod manager ----

async function openModsListModal() {
  if (!selectedId) return;
  modsListCurrentInstance = selectedId;
  const inst = instances.find((i) => i.id === selectedId);
  modsListSubtitle.textContent = `Activá o desactivá los mods de "${inst ? inst.name : 'esta instancia'}"`;
  modsListSearch.value = '';
  modsListError.classList.add('hidden');
  modsListModal.classList.remove('hidden');
  await refreshModsList();
  setTimeout(() => modsListSearch.focus(), 50);
}

function closeModsListModal() {
  modsListModal.classList.add('hidden');
  modsListCurrentInstance = null;
}

async function refreshModsList() {
  if (!modsListCurrentInstance) return;
  modsListError.classList.add('hidden');
  const result = await window.launcherAPI.modsList(modsListCurrentInstance);
  if (!result.ok) {
    modsListError.textContent = result.error;
    modsListError.classList.remove('hidden');
    modsList.innerHTML = '';
    return;
  }
  modsListAllMods = result.mods || [];
  renderModsList(modsListAllMods);
  updateModsStats(modsListAllMods);
}

function renderModsList(mods) {
  const search = (modsListSearch.value || '').toLowerCase().trim();
  const filtered = search
    ? mods.filter((m) => m.displayName.toLowerCase().includes(search) || m.filename.toLowerCase().includes(search))
    : mods;

  if (filtered.length === 0) {
    modsList.innerHTML = '<p class="modrinth-empty">' + (search ? 'Sin resultados para tu búsqueda.' : 'No hay mods instalados. Andá a 📦 Buscar mods para instalar.') + '</p>';
    return;
  }

  modsList.innerHTML = filtered.map((m) => {
    const sizeMB = (m.size / 1024 / 1024).toFixed(1);
    return `
      <div class="mod-list-row ${m.enabled ? '' : 'disabled'}" data-filename="${escapeHtml(m.filename)}">
        <label class="mod-list-toggle" title="${m.enabled ? 'Desactivar' : 'Activar'}">
          <input type="checkbox" data-action="toggle" ${m.enabled ? 'checked' : ''} />
          <span class="mod-list-slider"></span>
        </label>
        <div class="mod-list-info">
          <div class="mod-list-name" title="${escapeHtml(m.filename)}">${escapeHtml(m.displayName)}</div>
          <div class="mod-list-meta">
            <span>${sizeMB} MB</span>
            <span class="${m.enabled ? 'mod-list-status-enabled' : 'mod-list-status-disabled'}">${m.enabled ? 'Activado' : 'Desactivado'}</span>
          </div>
        </div>
        <button class="mod-list-delete" data-action="delete" title="Eliminar mod">🗑</button>
      </div>`;
  }).join('');

  // Bind events.
  modsList.querySelectorAll('input[data-action="toggle"]').forEach((cb) => {
    cb.addEventListener('change', (e) => handleModToggle(e.target));
  });
  modsList.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', (e) => handleModDelete(e.target));
  });
}

function updateModsStats(mods) {
  const total = mods.length;
  const enabled = mods.filter((m) => m.enabled).length;
  const disabled = total - enabled;
  modsListStats.textContent = `${total} mods · ${enabled} 🟢 · ${disabled} ⚫`;
}

async function handleModToggle(checkbox) {
  if (!modsListCurrentInstance) return;
  const row = checkbox.closest('.mod-list-row');
  const filename = row.dataset.filename;
  checkbox.disabled = true;
  const result = await window.launcherAPI.modsToggle(modsListCurrentInstance, filename);
  checkbox.disabled = false;
  if (!result.ok) {
    modsListError.textContent = 'Error: ' + result.error;
    modsListError.classList.remove('hidden');
    return;
  }
  // Re-fetch la lista para que se actualicen los stats y el orden.
  await refreshModsList();
}

async function handleModDelete(btn) {
  if (!modsListCurrentInstance) return;
  const row = btn.closest('.mod-list-row');
  const filename = row.dataset.filename;
  if (!confirm(`¿Eliminar definitivamente "${filename}"?\n\nEsta acción no se puede deshacer.`)) {
    return;
  }
  btn.disabled = true;
  const result = await window.launcherAPI.modsDelete(modsListCurrentInstance, filename);
  if (!result.ok) {
    btn.disabled = false;
    modsListError.textContent = 'Error: ' + result.error;
    modsListError.classList.remove('hidden');
    return;
  }
  await refreshModsList();
}

// ---- Logs viewer ----

async function openLogsModal() {
  if (!selectedId) return;
  logsCurrentInstance = selectedId;
  const inst = instances.find((i) => i.id === selectedId);
  logsSubtitle.textContent = `Logs de "${inst ? inst.name : 'esta instancia'}"`;
  logsError.classList.add('hidden');
  logsModal.classList.remove('hidden');
  await refreshLogsList();
  await refreshLogsContent();
  switchLogTab('logs');
}

function closeLogsModal() {
  logsModal.classList.add('hidden');
  logsCurrentInstance = null;
  if (logsRefreshTimer) {
    clearInterval(logsRefreshTimer);
    logsRefreshTimer = null;
  }
}

function switchLogTab(tabName) {
  document.querySelectorAll('[data-log-tab]').forEach((b) => b.classList.toggle('active', b.dataset.logTab === tabName));
  document.getElementById('log-tab-logs').classList.toggle('hidden', tabName !== 'logs');
  document.getElementById('log-tab-crashes').classList.toggle('hidden', tabName !== 'crashes');
  if (tabName === 'crashes') refreshCrashList();
}

async function refreshLogsList() {
  if (!logsCurrentInstance) return;
  const r = await window.launcherAPI.logsList(logsCurrentInstance);
  if (!r.ok) {
    logsError.textContent = r.error;
    logsError.classList.remove('hidden');
    return;
  }
  logsFileSelect.innerHTML = '';
  if (r.logs.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(no hay logs)';
    logsFileSelect.appendChild(opt);
    return;
  }
  for (const l of r.logs) {
    const opt = document.createElement('option');
    opt.value = l.name;
    const sizeKB = (l.size / 1024).toFixed(0);
    opt.textContent = `${l.name} (${sizeKB} KB)`;
    logsFileSelect.appendChild(opt);
  }
  // Si hay un latest.log, lo seleccionamos por default.
  const latest = r.logs.find((l) => l.name === 'latest.log') || r.logs[0];
  if (latest) logsFileSelect.value = latest.name;
}

async function refreshLogsContent() {
  if (!logsCurrentInstance) return;
  const filename = logsFileSelect.value;
  if (!filename) {
    logsContent.textContent = '(no hay logs para mostrar)';
    return;
  }
  const r = await window.launcherAPI.logsRead(logsCurrentInstance, filename, 500);
  if (!r.ok) {
    logsError.textContent = r.error;
    logsError.classList.remove('hidden');
    return;
  }
  logsCurrentLines = r.lines || [];
  renderLogsContent();
  const truncatedMsg = r.truncated ? ` (mostrando últimas 500 líneas de ${r.total})` : ` (${r.total} líneas)`;
  logsMeta.textContent = truncatedMsg;
}

function classifyLogLine(line) {
  if (/Exception|Caused by|Error:|FAILURE|FAILED|\[ERROR\]/i.test(line)) return 'log-error';
  if (/\[WARN\]| WARN /i.test(line)) return 'log-warn';
  if (/\[DEBUG\]| DEBUG /i.test(line)) return 'log-debug';
  if (/^\s+at /i.test(line)) return 'log-stack';
  if (/Exception in thread/.test(line)) return 'log-exception';
  return 'log-info';
}

function renderLogsContent() {
  const search = (logsSearch.value || '').toLowerCase().trim();
  let html = '';
  let shown = 0;
  for (const line of logsCurrentLines) {
    // Filtro por tipo.
    if (logsCurrentFilter !== 'all') {
      const cls = classifyLogLine(line);
      const wantsError = logsCurrentFilter === 'error';
      const wantsWarn = logsCurrentFilter === 'warn';
      const wantsInfo = logsCurrentFilter === 'info';
      const isError = cls === 'log-error' || cls === 'log-exception';
      const isWarn = cls === 'log-warn';
      const isInfo = cls === 'log-info' || cls === 'log-debug' || cls === 'log-stack';
      if (wantsError && !isError) continue;
      if (wantsWarn && !isWarn) continue;
      if (wantsInfo && !isInfo) continue;
    }
    // Filtro por busqueda.
    if (search && !line.toLowerCase().includes(search)) continue;
    const cls = classifyLogLine(line);
    let escaped = escapeHtml(line);
    if (search) {
      // Resaltamos las ocurrencias de la busqueda.
      const re = new RegExp('(' + escapeRegExp(search) + ')', 'ig');
      escaped = escaped.replace(re, '<mark>$1</mark>');
    }
    html += `<span class="${cls}">${escaped}</span>\n`;
    shown++;
  }
  if (shown === 0) {
    html = '<span class="logs-empty">No hay líneas que coincidan con el filtro.</span>';
  }
  logsContent.innerHTML = html;
  // Scroll al final.
  logsContent.scrollTop = logsContent.scrollHeight;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function refreshCrashList() {
  if (!logsCurrentInstance) return;
  const r = await window.launcherAPI.crashReportsList(logsCurrentInstance);
  if (!r.ok) {
    crashContent.textContent = 'Error: ' + r.error;
    return;
  }
  crashListSelect.innerHTML = '';
  if (r.reports.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(no hay crash reports)';
    crashListSelect.appendChild(opt);
    crashContent.textContent = 'No hay crash reports en esta instancia.';
    return;
  }
  for (const c of r.reports) {
    const opt = document.createElement('option');
    opt.value = c.name;
    const sizeKB = (c.size / 1024).toFixed(0);
    opt.textContent = `${c.name} (${sizeKB} KB)`;
    crashListSelect.appendChild(opt);
  }
  crashListSelect.value = r.reports[0].name;
  await loadSelectedCrash();
}

async function loadSelectedCrash() {
  if (!logsCurrentInstance) return;
  const filename = crashListSelect.value;
  if (!filename) return;
  const r = await window.launcherAPI.crashReportsRead(logsCurrentInstance, filename);
  if (!r.ok) {
    crashContent.textContent = 'Error: ' + r.error;
    return;
  }
  // Resaltamos la línea "Description:" y los stacks como en los logs.
  let html = '';
  for (const line of r.content.split(/\r?\n/)) {
    const cls = classifyLogLine(line);
    html += `<span class="${cls}">${escapeHtml(line)}</span>\n`;
  }
  crashContent.innerHTML = html;
  crashContent.scrollTop = 0;
}

// ---- Comunidad ----

async function openCommunityModal() {
  communityModal.classList.remove('hidden');
  await refreshCommunityAll();
}

function closeCommunityModal() {
  communityModal.classList.add('hidden');
}

async function refreshCommunityAll() {
  const s = await window.launcherAPI.getSettings();
  await Promise.all([
    refreshCommunityServer(s.communityServerAddress || ''),
    refreshCommunityLinks(s.communityDiscordInvite || '', s.communityWebsite || ''),
    refreshCommunityNews(s.communityNewsFeed || ''),
  ]);
}

async function refreshCommunityServer(address) {
  if (!address) {
    communityServerStatus.innerHTML = '<p class="modrinth-empty">Configurá la dirección del server en ⚙ Configuración.</p>';
    communityServerActions.style.display = 'none';
    return;
  }
  communityServerStatus.innerHTML = `
    <div class="community-server-indicator">
      <span class="community-status-dot checking"></span>
      <div class="community-server-info">
        <div class="community-server-name">Consultando ${escapeHtml(address)}...</div>
      </div>
    </div>`;
  const r = await window.launcherAPI.communityServerStatus(address);
  if (!r || !r.online) {
    const reason = r && r.error ? r.error : 'Sin respuesta';
    communityServerStatus.innerHTML = `
      <div class="community-server-indicator">
        <span class="community-status-dot offline"></span>
        <div class="community-server-info">
          <div class="community-server-name">${escapeHtml(address)}</div>
          <div class="community-server-meta">Server offline (${escapeHtml(reason)})</div>
        </div>
      </div>`;
    communityServerActions.style.display = 'none';
    return;
  }
  const ping = r.latencyMs != null ? `${r.latencyMs}ms` : '?';
  communityServerStatus.innerHTML = `
    <div class="community-server-row">
      <div class="community-server-indicator">
        <span class="community-status-dot online"></span>
        <div class="community-server-info">
          <div class="community-server-name">${escapeHtml(r.address)}</div>
          <div class="community-server-meta">${escapeHtml(r.version)} · ping ${ping}</div>
        </div>
      </div>
      <div class="community-server-players">👥 ${r.playersOnline} / ${r.playersMax}</div>
    </div>
    ${r.motd ? `<div class="community-server-motd">${escapeHtml(r.motd)}</div>` : ''}`;
  communityServerActions.style.display = 'flex';
}

async function refreshCommunityLinks(discord, website) {
  if (!discord && !website) {
    communityLinks.innerHTML = '<p class="modrinth-empty">Configurá Discord y sitio web en ⚙ Configuración.</p>';
    return;
  }
  const links = [];
  if (discord) {
    links.push(`<a class="community-link" href="${escapeHtml(discord)}" target="_blank" rel="noopener"><span class="community-link-icon">💬</span> Discord</a>`);
  }
  if (website) {
    links.push(`<a class="community-link" href="${escapeHtml(website)}" target="_blank" rel="noopener"><span class="community-link-icon">🌍</span> Sitio web</a>`);
  }
  communityLinks.innerHTML = links.join('');
}

async function refreshCommunityNews(feedUrl) {
  if (!feedUrl) {
    communityNews.innerHTML = '<p class="modrinth-empty">Configurá el feed RSS en ⚙ Configuración.</p>';
    return;
  }
  communityNews.innerHTML = '<p class="modrinth-empty">Cargando noticias...</p>';
  const items = await window.launcherAPI.communityNewsFeed(feedUrl, 5);
  if (!items || items.length === 0) {
    communityNews.innerHTML = '<p class="modrinth-empty">No se pudieron cargar noticias (¿URL válida? ¿es RSS 2.0?).</p>';
    return;
  }
  communityNews.innerHTML = items.map((it) => {
    const date = formatNewsDate(it.pubDate);
    const desc = stripHtml(it.description).slice(0, 240);
    const link = it.link ? `href="${escapeHtml(it.link)}" target="_blank" rel="noopener"` : '';
    return `<a class="community-news-item" ${link}>
      ${date ? `<div class="community-news-date">${escapeHtml(date)}</div>` : ''}
      <div class="community-news-title">${escapeHtml(it.title || '(sin titulo)')}</div>
      ${desc ? `<div class="community-news-desc">${escapeHtml(desc)}</div>` : ''}
    </a>`;
  }).join('');
}

function formatNewsDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
}

function stripHtml(s) {
  if (!s) return '';
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function copyCommunityServerIp() {
  const s = await window.launcherAPI.getSettings();
  const addr = s.communityServerAddress;
  if (!addr) return;
  await window.launcherAPI.communityCopyToClipboard(addr);
  communityCopyIp.textContent = '✓ Copiado';
  setTimeout(() => { communityCopyIp.textContent = '📋 Copiar IP'; }, 2000);
}

// ---- Modal "Añadir instancia" ----

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  document.getElementById('tab-code').classList.toggle('hidden', tabName !== 'code');
  document.getElementById('tab-custom').classList.toggle('hidden', tabName !== 'custom');

  if (tabName === 'custom') {
    ensureMinecraftVersionsLoaded();
  }
}

async function ensureMinecraftVersionsLoaded() {
  if (mcVersionsCache) return;
  customMcEl.innerHTML = '<option value="">Cargando...</option>';
  const result = await window.launcherAPI.listMinecraftVersions();
  if (!result.ok) {
    customMcEl.innerHTML = `<option value="">Error: ${result.error}</option>`;
    return;
  }
  mcVersionsCache = result.list;
  const recent = mcVersionsCache.slice(0, 30);
  customMcEl.innerHTML = '<option value="">Elegí una versión</option>' +
    recent.map((v) => `<option value="${v.id}">${v.id}</option>`).join('');
}

async function refreshLoaderVersions() {
  const mcVersion = customMcEl.value;
  const loader = customLoaderEl.value;

  if (loader === 'vanilla') {
    customLoaderVerEl.disabled = true;
    customLoaderVerEl.innerHTML = '<option value="">(no aplica)</option>';
    customLoaderVerLabel.style.display = 'none';
    return;
  }
  customLoaderVerLabel.style.display = '';
  customLoaderVerEl.disabled = true;
  customLoaderVerEl.innerHTML = '<option value="">Cargando...</option>';

  if (!mcVersion) {
    customLoaderVerEl.innerHTML = '<option value="">Elegí una MC version primero</option>';
    return;
  }

  const result = await window.launcherAPI.listLoaderVersions(mcVersion, loader);
  if (!result.ok) {
    customLoaderVerEl.innerHTML = `<option value="">Error: ${result.error}</option>`;
    return;
  }

  if (!result.versions || result.versions.length === 0) {
    customLoaderVerEl.innerHTML = `<option value="">${loader} no soporta MC ${mcVersion}</option>`;
    return;
  }

  let opts = [];
  if (loader === 'forge') {
    const formatted = result.versions.map((v) => {
      const dash = v.indexOf('-');
      const forgePart = dash >= 0 ? v.substring(dash + 1) : v;
      return { raw: v, label: forgePart };
    });
    const recommended = result.recommended
      ? (result.recommended.indexOf('-') >= 0 ? result.recommended.split('-')[1] : result.recommended)
      : null;
    const latest = result.latest
      ? (result.latest.indexOf('-') >= 0 ? result.latest.split('-')[1] : result.latest)
      : null;
    opts = formatted.slice(0, 60).map(({ raw, label }) => {
      const tag = label === recommended ? ' (recomendada)' : label === latest ? ' (latest)' : '';
      return `<option value="${label}">${label}${tag}</option>`;
    });
  } else if (loader === 'neoforge') {
    opts = result.versions.slice(0, 60).map((v) => {
      const tag = v === result.recommended ? ' (recomendada)' : v === result.latest ? ' (latest)' : '';
      return `<option value="${v}">${v}${tag}</option>`;
    });
  } else if (loader === 'fabric') {
    opts = result.versions.slice(0, 60).map((v) => `<option value="${v.version}">${v.version}${v.stable ? '' : ' (beta)'}</option>`);
  }

  customLoaderVerEl.innerHTML = '<option value="">Elegí una versión</option>' + opts.join('');
  customLoaderVerEl.disabled = false;
}

addInstanceBtn.addEventListener('click', () => {
  codeInput.value = '';
  codeError.classList.add('hidden');
  customErrorEl.classList.add('hidden');
  switchTab('code');
  modal.classList.remove('hidden');
  codeInput.focus();
});

cancelAddBtn.addEventListener('click', () => modal.classList.add('hidden'));

const codeNoticeSettingsBtn = document.getElementById('code-notice-settings-btn');
if (codeNoticeSettingsBtn) {
  codeNoticeSettingsBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    openSettings();
  });
}
cancelCustomBtn.addEventListener('click', () => modal.classList.add('hidden'));

confirmAddBtn.addEventListener('click', async () => {
  const result = await window.launcherAPI.addInstanceByCode(codeInput.value);
  if (!result.ok) {
    codeError.textContent = result.error;
    codeError.classList.remove('hidden');
    return;
  }
  instances.push(result.instance);
  modal.classList.add('hidden');
  selectInstance(result.instance.id);
});

confirmCustomBtn.addEventListener('click', async () => {
  customErrorEl.classList.add('hidden');
  const payload = {
    name: customNameEl.value.trim() || undefined,
    minecraftVersion: customMcEl.value,
    loader: customLoaderEl.value,
    loaderVersion: customLoaderVerEl.value
  };
  if (!payload.minecraftVersion) {
    customErrorEl.textContent = 'Elegí una versión de Minecraft';
    customErrorEl.classList.remove('hidden');
    return;
  }
  if (payload.loader !== 'vanilla' && !payload.loaderVersion) {
    customErrorEl.textContent = 'Elegí una versión del loader';
    customErrorEl.classList.remove('hidden');
    return;
  }
  const result = await window.launcherAPI.createCustomInstance(payload);
  if (!result.ok) {
    customErrorEl.textContent = result.error;
    customErrorEl.classList.remove('hidden');
    return;
  }
  instances.push(result.instance);
  modal.classList.add('hidden');
  selectInstance(result.instance.id);
});

playBtn.addEventListener('click', async () => {
  if (playing || !selectedId) return;
  const session = await window.launcherAPI.getSession();
  if (!session) {
    alert('Inicia sesión con Microsoft antes de jugar.');
    return;
  }
  playing = true;
  playBtn.disabled = true;
  playBtn.textContent = 'Lanzando...';

  const result = await window.launcherAPI.playInstance(selectedId);

  if (!result.ok) {
    alert('No se pudo lanzar el juego: ' + result.error);
    playing = false;
    playBtn.disabled = false;
    playBtn.textContent = 'Jugar';
    progressRow.classList.add('hidden');
    return;
  }
  playBtn.textContent = 'Jugando...';
});

init();

// ============================================================================
// GESTION DE EVENTOS DE LA COMUNIDAD (CHECKPOINT LAUNCHER)
// ============================================================================
var isEventsViewOpen = false;

// ---- Discord Session State ----
var discordSession = null;
var myRegisteredEventIds = [];

async function initDiscordSession() {
  try {
    if (!window.launcherAPI || !window.launcherAPI.discordGetSession) return;
    const res = await window.launcherAPI.discordGetSession();
    if (res && res.ok && res.session) {
      discordSession = res.session;
      updateDiscordUI();
      await refreshMyRegistrations();
    }
  } catch (_) {}
}

async function refreshMyRegistrations() {
  try {
    if (!discordSession) { myRegisteredEventIds = []; return; }
    const res = await window.launcherAPI.discordGetMyEvents();
    if (res && res.ok) myRegisteredEventIds = res.eventIds || [];
  } catch (_) { myRegisteredEventIds = []; }
}

function updateDiscordUI() {
  const avatarEl = document.getElementById('discord-avatar');
  const placeholderEl = document.getElementById('discord-avatar-placeholder');
  const usernameEl = document.getElementById('discord-username');
  const tagEl = document.getElementById('discord-tag');
  const linkBtn = document.getElementById('discord-link-btn');
  if (!linkBtn) return;

  if (discordSession && discordSession.user) {
    const u = discordSession.user;
    if (usernameEl) usernameEl.textContent = u.username;
    if (tagEl) tagEl.textContent = 'Vinculado';
    if (avatarEl) {
      const avatarUrl = u.avatar
        ? 'https://cdn.discordapp.com/avatars/' + u.discordId + '/' + u.avatar + '.png?size=64'
        : 'https://cdn.discordapp.com/embed/avatars/0.png';
      avatarEl.src = avatarUrl;
      avatarEl.style.display = 'block';
    }
    if (placeholderEl) placeholderEl.style.display = 'none';
    linkBtn.textContent = 'Desvincular';
    linkBtn.classList.add('linked');
    linkBtn.classList.remove('loading');
  } else {
    if (usernameEl) usernameEl.textContent = 'Discord';
    if (tagEl) tagEl.textContent = 'No vinculado';
    if (avatarEl) avatarEl.style.display = 'none';
    if (placeholderEl) placeholderEl.style.display = 'flex';
    linkBtn.textContent = 'Vincular Discord';
    linkBtn.classList.remove('linked');
    linkBtn.classList.remove('loading');
  }
}

// Discord link/unlink button handler
document.addEventListener('DOMContentLoaded', () => {
  const linkBtn = document.getElementById('discord-link-btn');
  if (linkBtn) {
    linkBtn.addEventListener('click', async () => {
      if (linkBtn.classList.contains('loading')) return;

      if (discordSession) {
        // Unlink
        await window.launcherAPI.discordLogout();
        discordSession = null;
        myRegisteredEventIds = [];
        updateDiscordUI();
        showEventsToast('Discord desvinculado');
        // Re-render event cards if visible
        if (isEventsViewOpen) loadCommunityEvents();
      } else {
        // Link
        linkBtn.textContent = 'Abriendo navegador...';
        linkBtn.classList.add('loading');
        try {
          const res = await window.launcherAPI.discordLogin();
          if (res && res.ok && res.session) {
            discordSession = res.session;
            updateDiscordUI();
            await refreshMyRegistrations();
            showEventsToast('Discord vinculado como ' + res.session.user.username);
            if (isEventsViewOpen) loadCommunityEvents();
          } else {
            showEventsToast(res.error || 'Error al vincular Discord');
            linkBtn.classList.remove('loading');
            linkBtn.textContent = 'Vincular Discord';
          }
        } catch (err) {
          showEventsToast('Error: ' + (err.message || err));
          linkBtn.classList.remove('loading');
          linkBtn.textContent = 'Vincular Discord';
        }
      }
    });
  }
  // Auto-init discord session on load
  initDiscordSession();
});

function showEventsToast(msg) {
  const toast = document.getElementById('events-toast');
  const toastText = document.getElementById('events-toast-text');
  if (!toast || !toastText) return;
  toastText.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2500);
}

function openEventsView() {
  isEventsViewOpen = true;
  const eventsBtn = document.getElementById('events-btn');
  const eventsView = document.getElementById('events-view');
  const cover = document.getElementById('instance-cover');
  const progress = document.getElementById('progress-row');
  const actions = document.getElementById('action-row');

  if (eventsBtn) eventsBtn.classList.add('active');
  if (cover) cover.classList.add('hidden');
  if (progress) progress.classList.add('hidden');
  if (actions) actions.classList.add('hidden');
  if (eventsView) eventsView.classList.remove('hidden');

  document.querySelectorAll('.instance-item').forEach((el) => el.classList.remove('active'));
  loadCommunityEvents();
}

function closeEventsView() {
  if (!isEventsViewOpen) return;
  isEventsViewOpen = false;

  const eventsBtn = document.getElementById('events-btn');
  const eventsView = document.getElementById('events-view');
  const cover = document.getElementById('instance-cover');
  const actions = document.getElementById('action-row');

  if (eventsBtn) eventsBtn.classList.remove('active');
  if (eventsView) eventsView.classList.add('hidden');
  if (cover) cover.classList.remove('hidden');
  if (actions) actions.classList.remove('hidden');
}

async function loadCommunityEvents() {
  const eventsListEl = document.getElementById('events-list');
  const eventsLoadingEl = document.getElementById('events-loading');
  const eventsEmptyEl = document.getElementById('events-empty');
  if (!eventsListEl) return;

  if (eventsLoadingEl) eventsLoadingEl.classList.remove('hidden');
  if (eventsEmptyEl) eventsEmptyEl.classList.add('hidden');
  eventsListEl.innerHTML = '';

  try {
    if (discordSession) {
      await refreshMyRegistrations();
    }
    const res = await window.launcherAPI.eventsList();
    if (eventsLoadingEl) eventsLoadingEl.classList.add('hidden');

    if (!res || !res.ok || !res.events || res.events.length === 0) {
      if (eventsEmptyEl) eventsEmptyEl.classList.remove('hidden');
      return;
    }

    renderCommunityEvents(res.events);
  } catch (err) {
    if (eventsLoadingEl) eventsLoadingEl.classList.add('hidden');
    if (eventsEmptyEl) eventsEmptyEl.classList.remove('hidden');
  }
}

function renderCommunityEvents(events) {
  const eventsListEl = document.getElementById('events-list');
  if (!eventsListEl) return;
  eventsListEl.innerHTML = '';

  events.forEach((ev) => {
    const card = document.createElement('div');
    card.className = 'event-card';

    // Mapeo seguro para soportar snake_case (SQLite/Backend) y camelCase
    const startsAt = ev.starts_at || ev.startsAt;
    const serverAddress = ev.server_address || ev.serverAddress || 'play.checkpoint.gg';
    const serverPort = ev.server_port || ev.serverPort;
    const mcVersion = ev.mc_version || ev.mcVersion || 'Cualquiera';
    const maxParticipants = ev.max_participants || ev.maxParticipants || 50;

    let timeStr = 'Próximamente';
    if (startsAt) {
      try {
        const d = new Date(typeof startsAt === 'number' ? startsAt * 1000 : startsAt);
        timeStr = d.toLocaleDateString('es-ES', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (_) {}
    }

    const serverFull = serverAddress + (serverPort ? ':' + serverPort : '');
    const isLive = ev.status === 'live' || ev.status === 'active';
    const statusClass = isLive ? 'live' : 'scheduled';
    const statusText = isLive ? '● EN VIVO' : 'PROGRAMADO';
    let attendees = ev.participantCount || (ev.participants ? ev.participants.length : 0);

    const eventId = ev.id;
    const isAttending = myRegisteredEventIds && myRegisteredEventIds.some((id) => String(id) === String(eventId));

    let attendBtnHtml = '';
    if (!discordSession) {
      attendBtnHtml = `
        <button class="event-attend-btn no-session" data-event-id="${eventId}" title="Vincula tu cuenta de Discord para inscribirte">
          <span class="attend-icon">🔗</span> Vincular Discord
        </button>
      `;
    } else if (isAttending) {
      attendBtnHtml = `
        <button class="event-attend-btn attending" data-event-id="${eventId}" title="Haz clic para cancelar tu asistencia">
          <span class="attend-icon">✅</span> Asistiendo
        </button>
      `;
    } else {
      attendBtnHtml = `
        <button class="event-attend-btn" data-event-id="${eventId}" title="Confirmar asistencia">
          <span class="attend-icon">✋</span> Asistiré
        </button>
      `;
    }

    // Verificar si ya existe una instancia creada para este evento
    const instanceCode = ev.instance_code || ev.instanceCode || `EVT-${ev.id}`;
    const existingInstance = (instances || []).find((i) =>
      (i.code && i.code.toUpperCase() === instanceCode.toUpperCase()) ||
      (i.id && i.id.toLowerCase() === ('evt-' + instanceCode).toLowerCase().replace(/[^a-z0-9_-]/g, '_')) ||
      (i.id && i.id.toLowerCase() === ('evt-' + ev.id).toLowerCase().replace(/[^a-z0-9_-]/g, '_'))
    );

    let actionBtnHtml = '';
    if (existingInstance) {
      actionBtnHtml = `
        <button class="event-play-btn" data-instance-id="${existingInstance.id}" title="Lanzar este evento">
          ▶️ Jugar
        </button>
      `;
    } else {
      actionBtnHtml = `
        <button class="event-install-btn" data-event-code="${instanceCode}" title="Crear instancia automáticamente con versión, loader y mods">
          📥 Instalar
        </button>
      `;
    }

    card.innerHTML = `
      <div class="event-card-header">
        <span class="event-status-badge ${statusClass}">${statusText}</span>
        <span class="event-time-badge">📅 ${timeStr}</span>
      </div>
      <h3 class="event-name">${ev.name || 'Evento de Minecraft'}</h3>
      <p class="event-desc">${ev.description || 'Evento organizado por la comunidad Checkpoint Launcher.'}</p>
      
      <div class="event-meta">
        <div class="event-meta-row">
          <span class="event-meta-label">Versión de Minecraft:</span>
          <span class="event-meta-val">🎮 ${mcVersion}</span>
        </div>
        <div class="event-meta-row">
          <span class="event-meta-label">Dirección IP:</span>
          <span class="event-meta-val event-ip-val">${serverFull}</span>
        </div>
        <div class="event-meta-row event-attendees-row clickable" data-event-id="${eventId}" data-event-name="${ev.name || ''}" title="Haz clic para ver la lista de asistentes">
          <span class="event-meta-label">Asistentes:</span>
          <span class="event-meta-val event-attendees-val">👥 ${attendees} / ${maxParticipants} <span style="font-size:11px;opacity:0.8;">(ver lista)</span></span>
        </div>
      </div>

      <div class="event-card-actions">
        ${actionBtnHtml}
        <button class="ghost-btn event-copy-btn" data-ip="${serverFull}">
          📋 Copiar IP
        </button>
        ${attendBtnHtml}
      </div>
    `;

    const copyBtn = card.querySelector('.event-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ip = copyBtn.dataset.ip;
        try {
          if (window.launcherAPI && window.launcherAPI.communityCopyToClipboard) {
            await window.launcherAPI.communityCopyToClipboard(ip);
          } else {
            navigator.clipboard.writeText(ip);
          }
          showEventsToast('¡IP ' + ip + ' copiada al portapapeles!');
        } catch (_) {
          showEventsToast('¡IP copiada!');
        }
      });
    }

    const attendBtn = card.querySelector('.event-attend-btn');
    if (attendBtn) {
      attendBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (attendBtn.classList.contains('loading')) return;

        // Si no hay sesion de Discord, abrir el flujo de vinculacion
        if (!discordSession) {
          const linkBtn = document.getElementById('discord-link-btn');
          if (linkBtn) linkBtn.click();
          showEventsToast('Vincula tu Discord primero para inscribirte');
          return;
        }

        const currentlyAttending = myRegisteredEventIds.some((id) => String(id) === String(eventId));
        attendBtn.classList.add('loading');

        try {
          if (currentlyAttending) {
            // Cancelar asistencia
            const res = await window.launcherAPI.discordUnregisterEvent(eventId);
            if (res && res.ok) {
              myRegisteredEventIds = myRegisteredEventIds.filter((id) => String(id) !== String(eventId));
              attendees = Math.max(0, attendees - 1);
              showEventsToast('Has cancelado tu asistencia');
            } else {
              showEventsToast(res.error || 'No se pudo cancelar la asistencia');
            }
          } else {
            // Confirmar asistencia
            const res = await window.launcherAPI.discordRegisterEvent(eventId);
            if (res && res.ok) {
              if (!myRegisteredEventIds.some((id) => String(id) === String(eventId))) {
                myRegisteredEventIds.push(eventId);
              }
              attendees += 1;
              showEventsToast('¡Te has registrado al evento! 🎉');
            } else {
              showEventsToast(res.error || 'No se pudo registrar al evento');
            }
          }

          // Actualizar contador en la tarjeta
          const attendeesValEl = card.querySelector('.event-attendees-val');
          if (attendeesValEl) {
            attendeesValEl.textContent = `👥 ${attendees} / ${maxParticipants}`;
          }

          // Actualizar estado del boton
          const newAttending = myRegisteredEventIds.some((id) => String(id) === String(eventId));
          if (newAttending) {
            attendBtn.className = 'event-attend-btn attending';
            attendBtn.innerHTML = '<span class="attend-icon">✅</span> Asistiendo';
            attendBtn.title = 'Haz clic para cancelar tu asistencia';
          } else {
            attendBtn.className = 'event-attend-btn';
            attendBtn.innerHTML = '<span class="attend-icon">✋</span> Asistiré';
            attendBtn.title = 'Confirmar asistencia';
          }
        } catch (err) {
          showEventsToast('Error: ' + (err.message || err));
        } finally {
          attendBtn.classList.remove('loading');
        }
      });
    }

    
    const installBtn = card.querySelector('.event-install-btn');
    if (installBtn) {
      installBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const code = installBtn.dataset.eventCode;
        installBtn.disabled = true;
        installBtn.textContent = '⏳ Instalando...';
        try {
          const result = await window.launcherAPI.addInstanceByCode(code);
          if (!result.ok) {
            showEventsToast('Error: ' + (result.error || 'No se pudo instalar'));
            installBtn.disabled = false;
            installBtn.innerHTML = '📥 Instalar';
            return;
          }
          instances.push(result.instance);
          renderInstanceList();
          selectInstance(result.instance.id);
          showEventsToast(`¡Instancia "${result.instance.name}" creada! 🎉`);

          installBtn.outerHTML = `
            <button class="event-play-btn" data-instance-id="${result.instance.id}" title="Lanzar este evento">
              ▶️ Jugar
            </button>
          `;
          const newPlayBtn = card.querySelector('.event-play-btn');
          if (newPlayBtn) {
            newPlayBtn.addEventListener('click', (ev2) => {
              ev2.stopPropagation();
              selectInstance(result.instance.id);
              closeEventsView();
            });
          }
        } catch (err) {
          showEventsToast('Error: ' + (err.message || err));
          installBtn.disabled = false;
          installBtn.innerHTML = '📥 Instalar';
        }
      });
    }

    const playBtn = card.querySelector('.event-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const instId = playBtn.dataset.instanceId;
        selectInstance(instId);
        closeEventsView();
      });
    }

    const attendeesRow = card.querySelector('.event-attendees-row.clickable');
    if (attendeesRow) {
      attendeesRow.addEventListener('click', () => {
        const evId = attendeesRow.dataset.eventId;
        const evName = attendeesRow.dataset.eventName;
        openParticipantsModal(evId, evName);
      });
    }

    eventsListEl.appendChild(card);
  });
}

// Inicializar listeners de eventos
const eventsBtnEl = document.getElementById('events-btn');
if (eventsBtnEl) {
  eventsBtnEl.addEventListener('click', () => {
    openEventsView();
  });
}

const eventsRefreshBtnEl = document.getElementById('events-refresh-btn');
if (eventsRefreshBtnEl) {
  eventsRefreshBtnEl.addEventListener('click', () => {
    loadCommunityEvents();
  });
}


async function openParticipantsModal(eventId, eventName) {
  const modal = document.getElementById('event-participants-modal');
  const title = document.getElementById('event-participants-title');
  const subtitle = document.getElementById('event-participants-subtitle');
  const listEl = document.getElementById('event-participants-list');
  const closeBtn = document.getElementById('event-participants-close');
  const okBtn = document.getElementById('event-participants-ok');
  if (!modal || !listEl) return;

  if (title) title.textContent = `👥 Asistentes: ${eventName || 'Evento'}`;
  if (subtitle) subtitle.textContent = 'Usuarios registrados para este evento';
  listEl.innerHTML = '<p class="hint">Cargando asistentes...</p>';
  modal.classList.remove('hidden');

  const closeHandler = () => modal.classList.add('hidden');
  if (closeBtn) closeBtn.onclick = closeHandler;
  if (okBtn) okBtn.onclick = closeHandler;

  try {
    const res = await window.launcherAPI.eventGetParticipants(eventId);
    if (!res || !res.ok) {
      listEl.innerHTML = `<p class="hint error">Error cargando asistentes: ${(res && res.error) || 'Desconocido'}</p>`;
      return;
    }
    const participants = res.participants || [];
    if (participants.length === 0) {
      listEl.innerHTML = '<p class="hint">Todavía no hay ningún asistente registrado.<br>¡Sé el primero en hacer clic en "Asistiré"!</p>';
      return;
    }

    listEl.innerHTML = participants.map((p) => {
      const avatarUrl = p.discord_avatar
        ? `https://cdn.discordapp.com/avatars/${p.discord_id}/${p.discord_avatar}.png?size=64`
        : 'assets/icon.png';
      const mcBadge = p.mc_username
        ? `<span class="mc-ign-badge">🎮 ${p.mc_username}</span>`
        : `<span class="mc-ign-badge unlinked" style="opacity:0.6;">(Sin IGN de Minecraft)</span>`;
      return `
        <div class="participant-item">
          <img class="participant-avatar" src="${avatarUrl}" onerror="this.src='assets/icon.png'" alt="avatar" />
          <div class="participant-info">
            <span class="participant-name">${p.discord_username || 'Usuario'}</span>
            ${mcBadge}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<p class="hint error">Error: ${err.message || err}</p>`;
  }
}


// ============================================================================
// Detección y Banner de Eventos en Vivo / Próximos
// ============================================================================
let liveBannerDismissedEventId = null;

async function checkLiveOrUpcomingEvents() {
  const banner = document.getElementById('live-event-banner');
  const tagEl = document.getElementById('live-event-tag');
  const titleEl = document.getElementById('live-event-title');
  const subtitleEl = document.getElementById('live-event-subtitle');
  const actionBtn = document.getElementById('live-event-action-btn');
  const dismissBtn = document.getElementById('live-event-dismiss-btn');
  if (!banner || !actionBtn) return;

  if (dismissBtn) {
    dismissBtn.onclick = () => {
      banner.classList.add('hidden');
      if (banner._currentEventId) {
        liveBannerDismissedEventId = banner._currentEventId;
      }
    };
  }

  try {
    const res = await window.launcherAPI.eventsList();
    if (!res || !res.ok || !res.events || res.events.length === 0) {
      banner.classList.add('hidden');
      return;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    // Buscamos si hay algún evento activo o que comience en <= 20 min
    const activeEvent = res.events.find((ev) => {
      const rawStarts = ev.starts_at || ev.startsAt;
      const startsAt = typeof rawStarts === 'number' ? rawStarts : Math.floor(new Date(rawStarts).getTime() / 1000);
      const diffMin = Math.round((startsAt - nowSeconds) / 60);
      const isLiveStatus = ev.status === 'live' || ev.status === 'active';
      const isLiveTime = diffMin <= 0 && diffMin >= -180;
      const isUpcoming = diffMin > 0 && diffMin <= 20;
      return isLiveStatus || isLiveTime || isUpcoming;
    });

    if (!activeEvent || activeEvent.id === liveBannerDismissedEventId) {
      banner.classList.add('hidden');
      return;
    }

    banner._currentEventId = activeEvent.id;

    const rawStarts = activeEvent.starts_at || activeEvent.startsAt;
    const startsAt = typeof rawStarts === 'number' ? rawStarts : Math.floor(new Date(rawStarts).getTime() / 1000);
    const diffMin = Math.round((startsAt - nowSeconds) / 60);
    const isLive = diffMin <= 0 || activeEvent.status === 'live' || activeEvent.status === 'active';

    if (tagEl) {
      if (isLive) {
        tagEl.className = 'live-event-tag';
        tagEl.textContent = '● EN VIVO';
      } else {
        tagEl.className = 'live-event-tag upcoming';
        tagEl.textContent = `⏰ EN ${diffMin} MIN`;
      }
    }

    if (titleEl) {
      titleEl.textContent = activeEvent.name || 'Evento de la Comunidad';
    }

    const serverAddr = (activeEvent.server_address || activeEvent.serverAddress || 'play.checkpoint.gg') +
      (activeEvent.server_port || activeEvent.serverPort ? ':' + (activeEvent.server_port || activeEvent.serverPort) : '');

    if (subtitleEl) {
      subtitleEl.textContent = isLive
        ? `¡El servidor está abierto! IP: ${serverAddr}`
        : `Comienza en ${diffMin} minutos · IP: ${serverAddr}`;
    }

    const eventCode = activeEvent.instance_code || activeEvent.instanceCode || `EVT-${activeEvent.id}`;

    actionBtn.onclick = async () => {
      actionBtn.disabled = true;
      actionBtn.textContent = '⏳ Preparando...';
      try {
        const instId = ('evt-' + eventCode).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        let existing = (instances || []).find((i) =>
          (i.code && i.code.toUpperCase() === eventCode.toUpperCase()) ||
          (i.id && i.id.toLowerCase() === instId) ||
          (i.id && i.id.toLowerCase() === ('evt-' + activeEvent.id).toLowerCase().replace(/[^a-z0-9_-]/g, '_'))
        );

        if (!existing) {
          actionBtn.textContent = '📥 Instalando...';
          const r = await window.launcherAPI.addInstanceByCode(eventCode);
          if (r && r.ok && r.instance) {
            existing = r.instance;
            instances.push(existing);
            renderInstanceList();
          } else {
            showEventsToast('Error instalando evento: ' + ((r && r.error) || 'Desconocido'));
            actionBtn.disabled = false;
            actionBtn.textContent = '🎮 Entrar al evento';
            return;
          }
        }

        selectInstance(existing.id);
        closeEventsView();
        banner.classList.add('hidden');
        showEventsToast(`¡Instancia "${existing.name}" seleccionada!`);

        // Lanzamos automáticamente si el botón de jugar está habilitado
        setTimeout(() => {
          const playBtn = document.getElementById('play-btn');
          if (playBtn && !playBtn.disabled) {
            playBtn.click();
          }
        }, 300);
      } catch (err) {
        showEventsToast('Error: ' + (err.message || err));
      } finally {
        actionBtn.disabled = false;
        actionBtn.textContent = '🎮 Entrar al evento';
      }
    };

    banner.classList.remove('hidden');
  } catch (_) {
    banner.classList.add('hidden');
  }
}

// Iniciar chequeo periódico de eventos en vivo cada 30 segundos
setTimeout(checkLiveOrUpcomingEvents, 1500);
setInterval(checkLiveOrUpcomingEvents, 30 * 1000);
