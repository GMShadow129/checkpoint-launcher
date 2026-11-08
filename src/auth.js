const { Auth, lexicon } = require('msmc');

// Nota importante: Microsoft ahora exige aprobacion manual para que un
// Client ID propio pueda usar la API de Minecraft (api.minecraftservices.com).
// Sin esa aprobacion, login_with_xbox devuelve 403 sin importar el codigo.
// Por eso usamos el flujo por defecto de msmc (sin pasarle un client_id
// propio), que usa un Client ID de msmc ya aprobado por Microsoft para esto.
// El unico costo es que la pantalla de login dice "msmc" en vez del nombre
// del launcher. Si en el futuro Microsoft aprueba nuestro Client ID propio
// (2073b901-acc9-42a8-a4f4-dccc5a162947, via https://aka.ms/AppRegInfo),
// se puede volver a activar pasandolo aca.

// Hace login con Microsoft y devuelve los datos de sesion listos para
// guardar. parentWindow es la ventana de Electron sobre la que se abre
// el popup de login.
async function loginWithMicrosoft(parentWindow) {
  // "login" en vez de "select_account": esto fuerza a Microsoft a pedir
  // credenciales de cero siempre, ignorando cualquier cuenta que Windows
  // tenga ya iniciada sesion a nivel de sistema (que es lo que causaba que
  // devolviera la cuenta equivocada, sin importar que tan limpia estuviera
  // la sesion del navegador). Tiene que ser un string (no un objeto) para
  // que msmc use su client_id/redirect por defecto ya aprobado por Minecraft.
  const authManager = new Auth('login');

  // Partition unica y sin "persist:" al principio: esto hace que la ventana
  // de login arranque con una sesion de navegador completamente aislada y en
  // memoria, sin cookies de logins anteriores. Sin esto, si alguna vez quedo
  // una sesion de Microsoft guardada (la tuya u otra), el login se la salta
  // en silencio y devuelve la cuenta equivocada sin preguntar.
  const partition = `login-${Date.now()}`;

  const xboxManager = await authManager.launch('electron', {
    parent: parentWindow,
    webPreferences: { partition }
  });

  // Log de diagnostico: esto nos deja ver el gamertag real de Xbox Live
  // ANTES de llegar al perfil de Minecraft, para saber en que paso exacto
  // se mete la identidad equivocada.
  try {
    const social = await xboxManager.getSocial();
    const xboxProfile = await social.getProfile();
    console.log('[DEBUG] Xbox Live gamertag:', xboxProfile.gamertag, '| xuid:', xboxProfile.xuid);
  } catch (debugErr) {
    console.log('[DEBUG] No se pudo obtener el perfil de Xbox Live:', debugErr);
  }

  const minecraft = await xboxManager.getMinecraft();
  console.log('[DEBUG] Minecraft profile name:', minecraft.profile.name, '| uuid:', minecraft.profile.id);

  return {
    name: minecraft.profile.name,
    uuid: minecraft.profile.id,
    xuid: minecraft.xuid,
    mcToken: minecraft.mcToken,
    // Este token permite refrescar la sesion sin pedir login de nuevo.
    // Lo usamos en un paso mas adelante (paso 6, al lanzar el juego).
    refreshToken: xboxManager.save()
  };
}

module.exports = { loginWithMicrosoft, describeAuthError, refreshSession };

// Refresca una sesion existente usando su refreshToken. Devuelve una nueva
// sesion con mcToken actualizado (los tokens de Minecraft viven pocas horas;
// sin refresh, el juego entra en demo mode al rato).
//
// Lanza error si el refresh fallo (refresh token expirado, etc).
async function refreshSession(refreshToken) {
  if (!refreshToken) throw new Error('No hay refreshToken guardado');

  // En msmc 5.x, Auth.refresh(refreshTokenString) hace todo el flow:
  //   1. Refresca el MS token con el OAuth endpoint.
  //   2. Hace Xbox Live auth con el nuevo access_token.
  //   3. Retorna un XboxManager con tokens frescos.
  // Despues getMinecraft() corre el entitlement check y devuelve el nuevo mcToken.
  const { Auth } = require('msmc');
  const authManager = new Auth(); // token default de msmc (client_id propio aprobado)
  const xboxManager = await authManager.refresh(refreshToken);
  const minecraft = await xboxManager.getMinecraft();
  return {
    name: minecraft.profile.name,
    uuid: minecraft.profile.id,
    xuid: minecraft.xuid,
    mcToken: minecraft.mcToken,
    refreshToken: xboxManager.save()
  };
}

// Convierte cualquier error que tire msmc (a veces es un objeto propio,
// no un Error normal) en un texto legible para mostrarle al usuario.
function describeAuthError(err) {
  try {
    const wrapped = lexicon.wrapError(err);
    if (wrapped && wrapped.message) return wrapped.message;
  } catch (_) {
    // si wrapError no puede procesarlo, seguimos con los intentos de abajo
  }
  if (err && err.message) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch (_) {
    return String(err);
  }
}
