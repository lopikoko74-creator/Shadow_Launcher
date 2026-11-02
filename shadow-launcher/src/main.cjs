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
    https.get(url, { headers: { 'User-Agent': 'ShadowLauncher/0.2.0' } }, res => {
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
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(() => { fs.mkdirSync(dataDir(), { recursive: true }); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('app:info', () => ({ version: app.getVersion(), dataDir: dataDir() }));
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
ipcMain.handle('java:check', async (_, customPath) => {
  const settings = readSettings();
  const command = String(customPath || settings.javaPath || 'java');
  return new Promise(resolve => {
    const child = spawn(command, ['-version'], { windowsHide: true });
    let output = '';
    child.stderr.on('data', d => output += d.toString());
    child.stdout.on('data', d => output += d.toString());
    child.on('error', e => resolve({ ok: false, message: e.message }));
    child.on('close', code => resolve({ ok: code === 0, message: output.trim() || ('Код завершения: ' + code) }));
  });
});
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
