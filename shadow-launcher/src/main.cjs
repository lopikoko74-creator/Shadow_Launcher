const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
let win;
const dataDir = () => path.join(app.getPath('userData'), 'shadow-launcher');
const settingsFile = () => path.join(dataDir(), 'settings.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); }
  catch { return { javaPath: '', memory: 4096, gameDir: path.join(app.getPath('userData'), 'game'), profiles: [{ id: 'default', name: 'Основной профиль', version: 'latest-release' }] }; }
}
function writeSettings(value) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(value, null, 2), 'utf8');
}
function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ShadowLauncher/0.2.1' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return resolve(getJson(res.headers.location));
      if (res.statusCode !== 200) return reject(new Error('Сервер ответил: ' + res.statusCode));
      let body = ''; res.setEncoding('utf8'); res.on('data', x => body += x);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('Некорректный ответ сервера')); } });
    }).on('error', reject);
  });
}
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 980, minHeight: 680,
    backgroundColor: '#080910',
    frame: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(() => { fs.mkdirSync(dataDir(), { recursive: true }); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

function javaCandidates(customPath) {
  const candidates = [];
  const add = value => { if (value && !candidates.includes(value)) candidates.push(value); };
  const normalize = value => {
    let p = String(value || '').trim().replace(/^"|"$/g, '');
    if (!p) return '';
    try { if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'bin', 'java.exe'); } catch {}
    return p;
  };
  add(normalize(customPath));
  add(normalize(readSettings().javaPath));
  add(process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe') : '');
  add(process.env.JDK_HOME ? path.join(process.env.JDK_HOME, 'bin', 'java.exe') : '');
  add('java');
  for (const dir of (process.env.PATH || '').split(path.delimiter)) add(path.join(dir, 'java.exe'));
  const roots = [
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Java'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Eclipse Adoptium'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Amazon Corretto'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Java'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Eclipse Adoptium'),
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.jdks')
  ].filter(Boolean);
  for (const root of roots) {
    try {
      if (!fs.existsSync(root)) continue;
      for (const folder of fs.readdirSync(root, { withFileTypes: true })) {
        if (!folder.isDirectory()) continue;
        add(path.join(root, folder.name, 'bin', 'java.exe'));
        add(path.join(root, folder.name, 'Contents', 'Home', 'bin', 'java.exe'));
      }
    } catch {}
  }
  add('C:\\Program Files\\Common Files\\Oracle\\Java\\javapath\\java.exe');
  return candidates;
}
function checkJava(customPath) {
  const candidates = javaCandidates(customPath);
  return new Promise(resolve => {
    let index = 0;
    const tryNext = () => {
      if (index >= candidates.length) return resolve({ ok: false, message: 'Java не найдена. Укажи путь к java.exe или папку JDK в настройках.' });
      const command = candidates[index++];
      if (command.toLowerCase() !== 'java' && !fs.existsSync(command)) return tryNext();
      const child = spawn(command, ['-version'], { windowsHide: true });
      let output = '';
      child.stderr.on('data', d => output += d.toString());
      child.stdout.on('data', d => output += d.toString());
      let settled = false;
      child.on('error', () => { if (!settled) { settled = true; tryNext(); } });
      child.on('close', code => {
        if (settled) return;
        settled = true;
        if (code === 0) resolve({ ok: true, message: output.trim() || 'Java доступна', path: command });
        else tryNext();
      });
    };
    tryNext();
  });
}
ipcMain.handle('app:info', () => ({ version: app.getVersion(), dataDir: dataDir() }));
ipcMain.handle('window:control', (_, action) => {
  if (!win) return;
  if (action === 'minimize') win.minimize();
  if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  if (action === 'close') win.close();
});
ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('settings:save', (_, value) => {
  const old = readSettings();
  const safe = { ...old, javaPath: String(value.javaPath || '').slice(0, 1000), memory: Math.max(1024, Math.min(16384, Number(value.memory) || 4096)), gameDir: String(value.gameDir || old.gameDir).slice(0, 1000) };
  writeSettings(safe); return safe;
});
ipcMain.handle('versions:list', async () => {
  const data = await getJson(MANIFEST);
  return { latest: data.latest, versions: data.versions.filter(v => ['release', 'snapshot'].includes(v.type)).slice(0, 120).map(v => ({ id: v.id, type: v.type, releaseTime: v.releaseTime, url: v.url })) };
});
ipcMain.handle('java:check', async (_, customPath) => checkJava(customPath));
ipcMain.handle('profiles:add', (_, name) => {
  const s = readSettings(); const clean = String(name || '').trim().slice(0, 32);
  if (!clean) throw new Error('Укажи название профиля');
  const p = { id: Date.now().toString(36), name: clean, version: 'latest-release' };
  s.profiles = [...(s.profiles || []), p]; writeSettings(s); return s.profiles;
});
ipcMain.handle('profiles:remove', (_, id) => {
  const s = readSettings(); s.profiles = (s.profiles || []).filter(p => p.id !== id);
  if (!s.profiles.length) s.profiles = [{ id: 'default', name: 'Основной профиль', version: 'latest-release' }];
  writeSettings(s); return s.profiles;
});
ipcMain.handle('shell:open', (_, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) return shell.openExternal(url);
});


const httpsGet = (url) => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'ShadowLauncher/0.3.0' } }, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return resolve(httpsGet(res.headers.location));
    if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ': ' + url));
    const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve(Buffer.concat(chunks)));
  }).on('error', reject);
});
const safeJoin = (root, relative) => {
  const target = path.resolve(root, relative);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error('Недопустимый путь файла');
  return target;
};
async function downloadFile(url, destination) {
  const data = await httpsGet(url);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, data);
  return data.length;
}
ipcMain.handle('game:install', async (event, versionId) => {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(String(versionId || ''))) throw new Error('Некорректная версия');
  const root = path.resolve(readSettings().gameDir || path.join(app.getPath('userData'), 'game'));
  const manifest = await getJson(MANIFEST);
  const entry = manifest.versions.find(v => v.id === versionId);
  if (!entry) throw new Error('Версия отсутствует в официальном каталоге');
  const meta = await getJson(entry.url);
  const versionDir = safeJoin(path.join(root, 'versions'), versionId);
  fs.mkdirSync(versionDir, { recursive: true });
  const jobs = [];
  if (meta.downloads?.client?.url) jobs.push({ url: meta.downloads.client.url, file: path.join(versionDir, versionId + '.jar') });
  else throw new Error('Для этой версии Mojang не предоставил client JAR');
  for (const lib of (meta.libraries || [])) {
    const artifact = lib.downloads?.artifact;
    if (artifact?.url && artifact.path) jobs.push({ url: artifact.url, file: safeJoin(path.join(root, 'libraries'), artifact.path) });
  }
  let assetCount = 0;
  if (meta.assetIndex?.url) {
    const index = await getJson(meta.assetIndex.url);
    const indexPath = path.join(root, 'assets', 'indexes', meta.assetIndex.id + '.json');
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, JSON.stringify(index));
    for (const asset of Object.values(index.objects || {})) {
      const hash = asset.hash;
      jobs.push({ url: 'https://resources.download.minecraft.net/' + hash.slice(0, 2) + '/' + hash,
        file: path.join(root, 'assets', 'objects', hash.slice(0, 2), hash) });
      assetCount++;
    }
  }
  const total = jobs.length;
  let done = 0;
  event.sender.send('game:progress', { version: versionId, done, total, percent: 0, status: 'Загрузка файлов…' });
  const queue = jobs.slice();
  const worker = async () => {
    while (queue.length) {
      const job = queue.shift();
      if (!job) return;
      if (!fs.existsSync(job.file)) await downloadFile(job.url, job.file);
      done++;
      event.sender.send('game:progress', { version: versionId, done, total, percent: Math.round(done / total * 100), status: 'Загружено ' + done + ' из ' + total });
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  fs.writeFileSync(path.join(versionDir, versionId + '.json'), JSON.stringify(meta, null, 2));
  const installed = path.join(root, 'installed-versions.json');
  let list = [];
  try { list = JSON.parse(fs.readFileSync(installed, 'utf8')); } catch {}
  if (!list.includes(versionId)) list.push(versionId);
  fs.writeFileSync(installed, JSON.stringify(list, null, 2));
  event.sender.send('game:progress', { version: versionId, done: total, total, percent: 100, status: 'Установка файлов завершена' });
  return { ok: true, version: versionId, files: total, assets: assetCount, directory: versionDir };
});
ipcMain.handle('game:installed', () => {
  const root = path.resolve(readSettings().gameDir || path.join(app.getPath('userData'), 'game'));
  try { return JSON.parse(fs.readFileSync(path.join(root, 'installed-versions.json'), 'utf8')); } catch { return []; }
});
ipcMain.handle('game:play', async (_, versionId) => {
  const root = path.resolve(readSettings().gameDir || path.join(app.getPath('userData'), 'game'));
  const installed = await ipcMain.handlers?.['game:installed'];
  let list = [];
  try { list = JSON.parse(fs.readFileSync(path.join(root, 'installed-versions.json'), 'utf8')); } catch {}
  if (!list.includes(versionId)) throw new Error('Сначала установи эту версию Minecraft');
  return { ok: false, reason: 'Для запуска нужна официальная авторизация Microsoft и проверка владения Minecraft Java Edition. Она ещё не подключена; обход авторизации не используется.' };
});
