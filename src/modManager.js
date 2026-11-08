// Mod manager: lista, activa/desactiva y borra mods del .minecraft/mods/.
//
// Los mods "desactivados" tienen el sufijo ".disabled" en el nombre. Esto es
// lo que hace Minecraft vanilla (y casi todos los launchers) para no cargar
// el mod sin necesidad de borrarlo. Renombrar es mucho mas rapido y reversible
// que descargar de nuevo.

const fs = require('fs');
const path = require('path');
const { instanceMinecraftDir } = require('./instances');

function getModsDir(instanceId) {
  return path.join(instanceMinecraftDir(instanceId), 'mods');
}

// Devuelve la lista de mods. Cada mod tiene filename, enabled, size, etc.
function listMods(instanceId) {
  const dir = getModsDir(instanceId);
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const mods = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const name = e.name;
    const lc = name.toLowerCase();
    if (!lc.endsWith('.jar') && !lc.endsWith('.jar.disabled')) continue;
    const enabled = !lc.endsWith('.disabled');
    const stat = fs.statSync(path.join(dir, name));
    mods.push({
      filename: name,
      enabled,
      size: stat.size,
      mtime: stat.mtimeMs,
      // Limpiamos el .jar.disabled/.jar del final para mostrar nombre prolijo.
      displayName: name.replace(/\.jar(\.disabled)?$/i, ''),
    });
  }
  // Orden: activos primero, despues por nombre alfabetico.
  mods.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
  return mods;
}

// Activa o desactiva un mod. Devuelve el nuevo estado.
function toggleMod(instanceId, filename) {
  const dir = getModsDir(instanceId);
  const src = path.join(dir, filename);
  if (!fs.existsSync(src)) {
    return { ok: false, error: 'Mod no encontrado' };
  }
  const lc = filename.toLowerCase();
  const isEnabled = !lc.endsWith('.disabled');
  let dest;
  if (isEnabled) {
    dest = path.join(dir, filename + '.disabled');
  } else {
    // Quitamos SOLO el ".disabled" final (case-insensitive).
    dest = path.join(dir, filename.replace(/\.disabled$/i, ''));
  }
  try {
    fs.renameSync(src, dest);
    return { ok: true, nowEnabled: !isEnabled };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

// Borra un mod (envia a la papelera en Windows si se puede; sino unlink directo).
function deleteMod(instanceId, filename) {
  const dir = getModsDir(instanceId);
  const p = path.join(dir, filename);
  if (!fs.existsSync(p)) {
    return { ok: false, error: 'Mod no encontrado' };
  }
  try {
    if (process.platform === 'win32') {
      // En Windows, unlink es permanente. Para papelera necesitariamos una lib.
      // Por simplicidad, por ahora borramos directo (el user puede instalar de nuevo).
      fs.unlinkSync(p);
    } else {
      fs.unlinkSync(p);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

module.exports = { listMods, toggleMod, deleteMod, getModsDir };