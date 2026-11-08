const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'config', 'drive-credentials.json');
// Carpeta raiz de Drive compartida con la cuenta de servicio ("LauncherComunidad").
const ROOT_FOLDER_ID = '1SOXsfdDQN12uykhjOXnZBNF29E8ZQwXp';

function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });
  return google.drive({ version: 'v3', auth });
}

async function findFileInFolder(drive, folderId, fileName) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
    fields: 'files(id, name)'
  });
  if (!res.data.files || res.data.files.length === 0) {
    throw new Error(`No se encontro "${fileName}" en la carpeta de Drive (${folderId})`);
  }
  return res.data.files[0].id;
}

async function downloadJson(drive, fileId) {
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'json' });
  return res.data;
}

// Lee index.json de la carpeta raiz: { "CODIGO": "idDeCarpeta", ... }
async function getIndex() {
  const drive = getDriveClient();
  const fileId = await findFileInFolder(drive, ROOT_FOLDER_ID, 'index.json');
  return downloadJson(drive, fileId);
}

// Lee manifest.json de la carpeta de una instancia especifica.
async function getManifest(instanceFolderId) {
  const drive = getDriveClient();
  const fileId = await findFileInFolder(drive, instanceFolderId, 'manifest.json');
  return downloadJson(drive, fileId);
}

// Descarga un archivo binario (un mod) a disco, reportando progreso en bytes.
async function downloadFile(fileId, destPath, onProgress) {
  const drive = getDriveClient();
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(destPath);
    let downloaded = 0;
    res.data
      .on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress) onProgress(downloaded);
      })
      .on('error', reject)
      .pipe(dest)
      .on('finish', resolve)
      .on('error', reject);
  });
}

module.exports = { getIndex, getManifest, downloadFile };
