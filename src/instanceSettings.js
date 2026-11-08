// Logica de settings per-instance.
//
// El launcher tiene settings GLOBALES (RAM, Java path, etc) en store.settings.
// Ademas, cada instancia puede tener settings PROPIOS que sobreescriben
// parcialmente los globales.
//
// Reglas de resolucion (en orden):
//   1. Si instance.settings.useGlobalSettings === true, gana todo el global
//   2. Para cada campo per-instance (ramMb, javaPath, jvmArgs):
//      - Si es null/undefined, hereda del global
//      - Si esta definido (aunque sea '' o 0), gana el per-instance
//
// Esto permite "partial override": el user puede usar su propia RAM pero
// heredar el Java path del global.

const DEFAULT_INSTANCE_SETTINGS = Object.freeze({
  useGlobalSettings: true,
  ramMb: null,
  javaPath: null,
  jvmArgs: null,
});

function defaultInstanceSettings() {
  return { ...DEFAULT_INSTANCE_SETTINGS };
}

// Asegura que una instancia tenga el campo settings con defaults.
// Llamar al listar/crear para compatibilidad con instancias viejas.
function ensureInstanceSettings(instance) {
  if (!instance) return instance;
  if (!instance.settings || typeof instance.settings !== 'object') {
    instance.settings = defaultInstanceSettings();
  } else {
    // Merge con defaults para que campos nuevos no rompan instancias viejas.
    instance.settings = {
      ...defaultInstanceSettings(),
      ...instance.settings,
    };
  }
  return instance;
}

// Resuelve los settings efectivos para una instancia, mezclando
// los globales con los per-instance segun las reglas de arriba.
function resolveInstanceSettings(instance, globalSettings) {
  const global = globalSettings || {};
  const inst = (instance && instance.settings) || defaultInstanceSettings();

  // Si esta en modo "usar global", retorna solo los globales.
  if (inst.useGlobalSettings) {
    return {
      ramMb: global.ramMb || 4096,
      javaPath: global.javaPathOverride || null,
      jvmArgs: global.jvmArgs || null,
      source: 'global',
    };
  }

  // Partial override: cada campo per-instance gana si esta definido, sino hereda.
  return {
    ramMb: inst.ramMb != null ? inst.ramMb : (global.ramMb || 4096),
    javaPath: inst.javaPath != null && inst.javaPath !== '' ? inst.javaPath : (global.javaPathOverride || null),
    jvmArgs: inst.jvmArgs != null && inst.jvmArgs !== '' ? inst.jvmArgs : (global.jvmArgs || null),
    source: 'instance',
  };
}

// Valida settings antes de guardarlos.
function validateInstanceSettings(partial) {
  const errors = [];
  const out = { ...defaultInstanceSettings(), ...(partial || {}) };

  if (typeof out.useGlobalSettings !== 'boolean') {
    out.useGlobalSettings = true;
  }

  if (out.ramMb != null) {
    if (typeof out.ramMb !== 'number' || out.ramMb < 1024 || out.ramMb > 32768) {
      errors.push('RAM debe estar entre 1 GB y 32 GB (o dejala vacia para usar la global)');
      out.ramMb = null;
    }
  } else {
    out.ramMb = null;
  }

  if (out.javaPath != null && typeof out.javaPath !== 'string') {
    errors.push('javaPath debe ser texto');
    out.javaPath = null;
  }
  if (out.javaPath === '') out.javaPath = null;

  if (out.jvmArgs != null && typeof out.jvmArgs !== 'string') {
    errors.push('jvmArgs debe ser texto');
    out.jvmArgs = null;
  }
  if (out.jvmArgs === '') out.jvmArgs = null;

  return { ok: errors.length === 0, errors, settings: out };
}

module.exports = {
  defaultInstanceSettings,
  ensureInstanceSettings,
  resolveInstanceSettings,
  validateInstanceSettings,
  DEFAULT_INSTANCE_SETTINGS,
};