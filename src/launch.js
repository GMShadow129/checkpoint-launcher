// Lanza el juego segun el loader de la instancia.
//
// Soporta: vanilla, forge, neoforge, fabric.
//
// Vanilla:  classpath = libs + vanilla.jar;  mainClass = net.minecraft.client.main.Main
// Forge:    idem (moderno usa BootstrapLauncher; viejo usa Launch + vanilla en cp)
// NeoForge: mismo patron que Forge moderno (BootstrapLauncher)
// Fabric:   mainClass = net.fabricmc.loader.impl.launch.knot.KnotClient;
//           classpath = libs + vanilla.jar (Fabric los junta en su KnotClient)

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function listJars(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.jar')) out.push(full);
    }
  };
  walk(dir);
  return out;
}

// Resuelve el path en libraries/ para una library entry del version.json.
// Si tiene downloads.artifact.path lo usamos; sino construimos desde el
// nombre maven.
function resolveLibraryPath(lib, libsDir) {
  let p = null;
  if (lib.downloads && lib.downloads.artifact && lib.downloads.artifact.path) {
    p = lib.downloads.artifact.path;
  } else if (lib.name) {
    const parts = lib.name.split(':');
    if (parts.length >= 3) {
      const group = parts[0].replace(/\./g, '/');
      const artifact = parts[1];
      const version = parts[2];
      p = `${group}/${artifact}/${version}/${artifact}-${version}.jar`;
    }
  }
  if (!p) return null;
  return path.join(libsDir, p);
}

// Devuelve la lista de jars que el version.json (con inheritance mergeado)
// declara como libraries runtime. Esto es la fuente de verdad -- NO recursamos
// libraries/ porque Forge installer deja ahi jars build-time (como
// ForgeAutoRenamingTool) que NO deben ir al classpath del juego.
function collectRuntimeLibJars(vJson, libsDir) {
  const seen = new Set();
  const out = [];
  for (const lib of vJson.libraries || []) {
    // Reglas: si tiene rules que lo excluyen para este OS, skip.
    if (lib.rules) {
      let allowed = true;
      for (const rule of lib.rules) {
        if (rule.action === 'allow' && rule.os) {
          if (rule.os.name === 'windows' && process.platform !== 'win32') allowed = false;
          if (rule.os.name === 'osx' && process.platform !== 'darwin') allowed = false;
          if (rule.os.name === 'linux' && process.platform === 'win32') allowed = false;
        }
        if (rule.action === 'disallow' && rule.os) {
          if (rule.os.name === 'windows' && process.platform === 'win32') allowed = false;
          if (rule.os.name === 'osx' && process.platform === 'darwin') allowed = false;
          if (rule.os.name === 'linux' && process.platform !== 'linux') allowed = false;
        }
      }
      if (!allowed) continue;
    }

    const p = resolveLibraryPath(lib, libsDir);
    if (!p) continue;
    // Algunos entries declaran natives (vanilla moderno). Los extrajimos en
    // extractNatives() de minecraft.js, no los ponemos en el classpath.
    if (lib.natives && typeof lib.natives === 'object') continue;

    if (!fs.existsSync(p)) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

function findVersionJar(instanceDir, versionId) {
  const p = path.join(instanceDir, 'versions', versionId, `${versionId}.jar`);
  return fs.existsSync(p) ? p : null;
}

function findVanillaJar(instanceDir, mcVersion) {
  return findVersionJar(instanceDir, mcVersion);
}

function loadVersionJson(instanceDir, versionId) {
  const p = path.join(instanceDir, 'versions', versionId, `${versionId}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(`No se encontro ${versionId}.json. ¿Se instalo el loader?`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function resolveArgs(template, vars, features) {
  features = features || {};
  if (Array.isArray(template)) {
    return template
      .filter((entry) => {
        if (entry && entry.rules) {
          let allowed = true;
          for (const rule of entry.rules) {
            // OS rules: igual que antes.
            if (rule.os) {
              if (rule.action === 'allow') {
                if (rule.os.name === 'windows' && process.platform !== 'win32') allowed = false;
                if (rule.os.name === 'osx' && process.platform !== 'darwin') allowed = false;
                if (rule.os.name === 'linux' && process.platform === 'win32') allowed = false;
              } else if (rule.action === 'disallow') {
                if (rule.os.name === 'windows' && process.platform === 'win32') allowed = false;
                if (rule.os.name === 'osx' && process.platform === 'darwin') allowed = false;
                if (rule.os.name === 'linux' && process.platform !== 'linux') allowed = false;
              }
            }
            // Feature rules: Si la regla matchea el feature, include (allow)
            // o exclude (disallow). Si NO matchea, al reves.
            if (rule.features) {
              let matches = true;
              for (const feat in rule.features) {
                if (rule.features[feat] !== !!features[feat]) {
                  matches = false;
                  break;
                }
              }
              if (rule.action === 'allow' && !matches) allowed = false;
              if (rule.action === 'disallow' && matches) allowed = false;
            }
          }
          return allowed;
        }
        return true;
      })
      .map((entry) => resolveArgs(entry.value || entry, vars, features));
  }
  if (typeof template !== 'string') return template;
  return template.replace(/\$\{(\w+)\}/g, (_, name) => (vars[name] != null ? vars[name] : ''));
}

// Devuelve { vJson, versionId } del version.json que se va a usar para construir args.
// En Forge/NeoForge/Fabric modernos: el del loader.
// En vanilla y Forge viejo: el de vanilla.
function pickVersionJsonForArgs(instance, instanceDir) {
  const mcVersion = instance.minecraftVersion;
  if (instance.loader === 'vanilla') {
    return { vJson: loadVersionJson(instanceDir, mcVersion), versionId: mcVersion };
  }
  if (instance.loader === 'forge') {
    const fId = `${mcVersion}-forge-${instance.loaderVersion}`;
    return { vJson: loadVersionJson(instanceDir, fId), versionId: fId };
  }
  if (instance.loader === 'neoforge') {
    return { vJson: loadVersionJson(instanceDir, `neoforge-${instance.loaderVersion}`), versionId: `neoforge-${instance.loaderVersion}` };
  }
  if (instance.loader === 'fabric') {
    const fId = `fabric-loader-${instance.loaderVersion}-${mcVersion}`;
    return { vJson: loadVersionJson(instanceDir, fId), versionId: fId };
  }
  throw new Error(`Loader no soportado: ${instance.loader}`);
}

// Carga el version.json y, si tiene inheritsFrom, mergea arguments y libraries.
// Esto es lo que Mojang/Forge/Fabric llaman "version inheritance".
// Reglas (segun spec Mojang):
//   - libraries: concatenar (el padre primero, hijo despues). Las reglas (rules)
//     se respetan por separado.
//   - arguments.game: concatenar (padre primero).
//   - arguments.jvm: concatenar (padre primero).
//   - mainClass: gana el del hijo si existe.
//   - assets / assetIndex: gana el del hijo si existe.
function loadVersionJsonWithInheritance(instanceDir, versionId, visited) {
  visited = visited || new Set();
  if (visited.has(versionId)) {
    throw new Error(`Circular inheritance en ${versionId}`);
  }
  visited.add(versionId);

  const vJson = loadVersionJson(instanceDir, versionId);
  if (!vJson.inheritsFrom) return vJson;

  const parent = loadVersionJsonWithInheritance(instanceDir, vJson.inheritsFrom, visited);

  // Merge libraries.
  const mergedLibs = [...(parent.libraries || []), ...(vJson.libraries || [])];
  // Merge arguments.game.
  const parentGame = (parent.arguments && parent.arguments.game) || [];
  const childGame = (vJson.arguments && vJson.arguments.game) || [];
  // Merge arguments.jvm.
  const parentJvm = (parent.arguments && parent.arguments.jvm) || [];
  const childJvm = (vJson.arguments && vJson.arguments.jvm) || [];

  return {
    ...parent,
    ...vJson,
    libraries: mergedLibs,
    arguments: {
      game: [...parentGame, ...childGame],
      jvm: [...parentJvm, ...childJvm]
    }
  };
}

// Determina si el loader moderno: requiere vanilla NO en classpath.
function isModernLauncher(vJson) {
  return vJson.mainClass && vJson.mainClass.includes('bootstraplauncher');
}

function buildClasspath(instance, instanceDir, libJars, vanillaJar) {
  if (instance.loader === 'vanilla') {
    return [vanillaJar, ...libJars];
  }
  if (instance.loader === 'forge') {
    // Forge moderno (1.20.1+, BootstrapLauncher): el binpatched vanilla client
    // esta en libraries/net/minecraftforge/forge/<mc>-<ver>/forge-<mc>-<ver>-client.jar.
    // NO existe versions/<fId>/<fId>.jar (esa convencion es solo de Forge viejo).
    // El classpath es SOLO las libs (que incluyen el binpatched client).
    // Forge viejo (1.16.5- con launchwrapper): si usa el jar de versions/.
    const fId = `${instance.minecraftVersion}-forge-${instance.loaderVersion}`;
    const fv = loadVersionJson(instanceDir, fId);
    if (isModernLauncher(fv)) {
      return [...libJars];
    }
    const forgeJar = findVersionJar(instanceDir, fId);
    if (!forgeJar) {
      throw new Error(`No se encontro el jar de Forge (Forge viejo) en versions/.`);
    }
    return [forgeJar, vanillaJar, ...libJars];
  }
  if (instance.loader === 'neoforge') {
    // NeoForge moderno tambien usa BootstrapLauncher; el binpatched client
    // queda en libraries/, no en versions/.
    const fv = loadVersionJson(instanceDir, `neoforge-${instance.loaderVersion}`);
    if (isModernLauncher(fv)) {
      return [...libJars];
    }
    const nj = findVersionJar(instanceDir, `neoforge-${instance.loaderVersion}`);
    if (!nj) throw new Error(`No se encontro el jar de NeoForge`);
    return [nj, ...libJars];
  }
  if (instance.loader === 'fabric') {
    // Fabric moderno: vanilla en classpath, KnotClient lo usa.
    return [vanillaJar, ...libJars];
  }
  throw new Error(`Loader no soportado: ${instance.loader}`);
}

function pickVersionId(instance) {
  const mc = instance.minecraftVersion;
  if (instance.loader === 'vanilla') return mc;
  if (instance.loader === 'forge') return `${mc}-forge-${instance.loaderVersion}`;
  if (instance.loader === 'neoforge') return `neoforge-${instance.loaderVersion}`;
  if (instance.loader === 'fabric') return `fabric-loader-${instance.loaderVersion}-${mc}`;
  return mc;
}

function launchGame(instance, session, javaBin, settings) {
  const mcVersion = instance.minecraftVersion;
  const instanceDir = path.join(instance.baseDir || instance._instanceDir, '.minecraft');

  const libsDir = path.join(instanceDir, 'libraries');
  // Necesitamos el vJson ANTES de las libs (lo cargamos aca, antes de cualquier
  // llamada que dependa de el).
  const versionId = pickVersionId(instance);
  const vJson = loadVersionJsonWithInheritance(instanceDir, versionId);
  // Filtramos libs por la lista del version.json (con inheritance mergeado).
  // Esto excluye jars build-time de Forge installer (ForgeAutoRenamingTool, etc).
  const libJars = collectRuntimeLibJars(vJson, libsDir);
  const vanillaJar = findVanillaJar(instanceDir, mcVersion);
  if (!vanillaJar) {
    throw new Error(`No se encontro el jar vanilla de ${mcVersion}`);
  }

  const classpath = buildClasspath(instance, instanceDir, libJars, vanillaJar).join(path.delimiter);

  // Features que vamos a usar para resolver reglas "features" en arguments.game/jvm.
  // CRITICO: is_demo_user debe ser false, sino el version.json mete --demo
  // y Minecraft arranca en modo demo ignorando la auth.
  const features = {
    is_demo_user: false,
    has_custom_resolution: false,
    has_quick_plays_support: false
  };

  const vars = {
    auth_player_name: session.name,
    auth_uuid: session.uuid,
    auth_xuid: session.xuid || '',
    auth_access_token: session.mcToken,
    user_type: 'msa',
    version_name: versionId,
    game_directory: instanceDir,
    assets_root: path.join(instanceDir, 'assets'),
    assets_index_name: (vJson.assetIndex && vJson.assetIndex.id) || mcVersion,
    version_type: 'release',
    natives_directory: path.join(instanceDir, 'natives'),
    library_directory: libsDir,
    classpath_separator: path.delimiter,
    primary_jar: vanillaJar,
    // clientId UUID por sesion (Mojang usa esto para identificar el cliente).
    clientid: require('crypto').randomUUID()
  };

  let gameArgs;
  if (Array.isArray(vJson.arguments && vJson.arguments.game)) {
    gameArgs = resolveArgs(vJson.arguments.game, vars, features);
  } else if (vJson.minecraftArguments) {
    gameArgs = resolveArgs(vJson.minecraftArguments, vars, features).split(/\s+/);
  } else if (instance.loader === 'vanilla') {
    // Vanilla moderno (>=1.13) siempre usa arguments.game.
    // Si no esta, fallback razonable.
    gameArgs = ['--username', session.name, '--version', mcVersion, '--gameDir', instanceDir, '--assetsDir', vars.assets_root];
  } else {
    throw new Error(`El version.json de ${versionId} no tiene arguments.game ni minecraftArguments`);
  }

  // Auto-conexion directa al servidor del evento si la instancia tiene serverAddress
  if (instance.serverAddress && typeof instance.serverAddress === 'string' && instance.serverAddress.trim()) {
    let host = instance.serverAddress.trim();
    let port = instance.serverPort || 25565;
    if (host.includes(':')) {
      const [h, p] = host.split(':');
      host = h.trim();
      const parsedP = parseInt(p.trim(), 10);
      if (parsedP > 0 && parsedP < 65536) port = parsedP;
    }
    gameArgs.push('--server', host, '--port', String(port));
  }

  // JVM args: defaults + override por settings efectivos (ya resueltos por
  // resolveInstanceSettings en prepareAndLaunch). El objeto `settings` aqui
  // tiene { ramMb, javaPath, jvmArgs, source }.
  // Si el version.json tiene arguments.jvm, lo usamos pero INYECTAMOS nuestros
  // -Xms/-Xmx antes (settings tienen prioridad).
  const ramMb = (settings && settings.ramMb) || 4096;
  const minRamMb = Math.min(2048, ramMb);
  const ramArgs = [`-Xms${minRamMb}M`, `-Xmx${ramMb}M`];
  let jvmArgs = [
    `-Xms${minRamMb}M`,
    `-Xmx${ramMb}M`,
    `-Djava.library.path=${vars.natives_directory}`,
    `-Dminecraft.launcher.brand=Checkpoint Launcher`,
    `-Dminecraft.launcher.version=0.5.1`
  ];
  if (vJson.arguments && Array.isArray(vJson.arguments.jvm)) {
    // Mezclamos: nuestros ramArgs + el resto del version.json que no sea -Xm*.
    const fromJson = resolveArgs(vJson.arguments.jvm, vars, features).filter((a) => !/^-Xm[sx]/.test(a));
    jvmArgs = [...ramArgs, ...fromJson];
  }

  // Si el usuario agrego JVM args custom en settings, los APPEND al final.
  // Util para -XX:+UseG1GC, -XX:MaxGCPauseMillis=50, etc.
  if (settings && typeof settings.jvmArgs === 'string' && settings.jvmArgs.trim()) {
    const customArgs = settings.jvmArgs
      .split(/\s+/)
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    jvmArgs = [...jvmArgs, ...customArgs];
  }

  const mainClass = vJson.mainClass;
  if (!mainClass) {
    throw new Error(`El version.json de ${versionId} no declara mainClass`);
  }

  const args = [...jvmArgs, '-cp', classpath, mainClass, ...gameArgs];

  const child = spawn(javaBin, args, {
    cwd: instanceDir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  // Logs.
  const logDir = path.join(instanceDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, 'latest.log');
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  child.stdout.on('data', (d) => process.stdout.write(`[mc] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[mc] ${d}`));
  child.unref();

  return child;
}

module.exports = { launchGame, pickVersionId };