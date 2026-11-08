// Asegura que exista un launcher_profiles.json en la carpeta .minecraft.
//
// Forge/NeoForge installer verifica que ese archivo exista antes de instalar.
// Sin el, abortan con el mensaje:
//   "There is no minecraft launcher profile in <dir>, you need to run the
//   launcher first!"
//
// El launcher oficial de Mojang crea este archivo la primera vez que arranca.
// Nosotros lo creamos manualmente con un profile "(default)" vacio que Forge
// puede extender despues con su propio profile.
//
// Estructura minima requerida:
//   { "profiles": { ... } }   -- con un profile adentro
// Ademas Forge tambien lee "selectedProfile" y "clientToken" pero son opcionales.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function ensureLauncherProfile(instanceDir) {
  const profilePath = path.join(instanceDir, 'launcher_profiles.json');
  if (fs.existsSync(profilePath)) return;

  const now = new Date().toISOString();
  const clientToken = crypto.randomUUID
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');

  const profile = {
    profiles: {
      '(default)': {
        name: 'Default',
        type: 'custom',
        created: now,
        lastUsed: now,
        icon: 'Furnace'
      }
    },
    selectedProfile: '(default)',
    clientToken,
    authenticationDatabase: {}
  };

  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
}

module.exports = { ensureLauncherProfile };