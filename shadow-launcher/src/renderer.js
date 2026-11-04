const $ = (id) => document.getElementById(id);

let allVersions = [];
let settings = {};
let selectedVersion = '';
let installedVersions = [];
window.shadow.onGameProgress((data) => {
  if ($('install-progress')) $('install-progress').value = data.percent || 0;
  if ($('install-status')) $('install-status').textContent = data.status || '';
});

function toast(message) {
  const element = $('toast');
  if (!element) return;
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2800);
}

function showError(prefix, error) {
  const message = error && error.message ? error.message : String(error || 'Неизвестная ошибка');
  toast(prefix + ': ' + message);
  console.error(prefix, error);
}

function page(name) {
  document.querySelectorAll('.page').forEach((element) => {
    element.classList.toggle('active', element.id === 'page-' + name);
  });
  document.querySelectorAll('.nav').forEach((element) => {
    element.classList.toggle('active', element.dataset.page === name);
  });
  const titles = { home: 'Главная', versions: 'Версии игры', profiles: 'Профили', settings: 'Настройки' };
  if ($('page-title')) $('page-title').textContent = titles[name] || 'Shadow Launcher';
}

document.querySelectorAll('.nav[data-page]').forEach((button) => {
  button.addEventListener('click', () => page(button.dataset.page));
});

document.querySelectorAll('[data-go]').forEach((button) => {
  button.addEventListener('click', () => page(button.dataset.go));
});

document.querySelectorAll('[data-window]').forEach((button) => {
  button.addEventListener('click', async () => {
    try {
      await window.shadow.windowControl(button.dataset.window);
    } catch (error) {
      showError('Не удалось управлять окном', error);
    }
  });
});

async function loadVersions() {
  const list = $('version-list');
  if (list) list.innerHTML = '<div class="empty">Получаем официальный каталог…</div>';
  const refresh = $('refresh-versions');
  if (refresh) refresh.disabled = true;
  try {
    const data = await window.shadow.listVersions();
    allVersions = Array.isArray(data.versions) ? data.versions : [];
    installedVersions = await window.shadow.installedGames();
    if ($('latest-version')) $('latest-version').textContent = data.latest && data.latest.release ? data.latest.release : 'Неизвестно';
    renderVersions();
    toast('Каталог версий загружен');
  } catch (error) {
    if (list) list.innerHTML = '<div class="empty">Не удалось загрузить каталог. Проверь интернет и нажми «Обновить».</div>';
    showError('Ошибка каталога', error);
  } finally {
    if (refresh) refresh.disabled = false;
  }
}

function renderVersions() {
  const list = $('version-list');
  if (!list) return;
  const query = ($('version-search')?.value || '').trim().toLowerCase();
  const type = $('version-type')?.value || 'all';
  const rows = allVersions
    .filter((version) => (type === 'all' || version.type === type) && version.id.toLowerCase().includes(query))
    .slice(0, 100);

  if (!rows.length) {
    list.innerHTML = '<div class="empty">Ничего не найдено</div>';
    return;
  }

  list.innerHTML = rows.map((version) => {
    const date = version.releaseTime ? new Date(version.releaseTime).toLocaleDateString('ru-RU') : '';
    const label = version.type === 'release' ? 'РЕЛИЗ' : 'SNAPSHOT';
    return '<div class="version-item"><div><strong>' + escapeHtml(version.id) + '</strong><small>' + escapeHtml(date) + '</small></div><span class="tag">' + label + '</span><button class="secondary choose-version" data-version="' + escapeHtml(version.id) + '">' + (installedVersions.includes(version.id) ? 'УСТАНОВЛЕНА' : 'ВЫБРАТЬ') + '</button></div>';
  }).join('');
  list.querySelectorAll('.choose-version').forEach(button => button.addEventListener('click', () => {
    selectedVersion = button.dataset.version;
    if ($('selected-version')) $('selected-version').textContent = selectedVersion;
    renderVersions();
  }));
}

$('install-selected')?.addEventListener('click', async () => {
  if (!selectedVersion) return toast('Сначала выбери версию');
  const button = $('install-selected'); button.disabled = true;
  if ($('install-status')) $('install-status').textContent = 'Подготовка загрузки…';
  try {
    const result = await window.shadow.installGame(selectedVersion);
    installedVersions = await window.shadow.installedGames(); renderVersions();
    toast('Minecraft ' + result.version + ' установлен');
    if ($('install-status')) $('install-status').textContent = 'Установка завершена';
  } catch (error) {
    showError('Ошибка установки', error);
    if ($('install-status')) $('install-status').textContent = error.message || String(error);
  } finally { button.disabled = false; }
});
$('play-selected')?.addEventListener('click', async () => {
  if (!selectedVersion) return toast('Сначала выбери версию');
  try { const result = await window.shadow.playGame(selectedVersion); toast(result.reason); }
  catch (error) { showError('Не удалось запустить игру', error); }
});

$('refresh-versions')?.addEventListener('click', loadVersions);
$('version-search')?.addEventListener('input', renderVersions);
$('version-type')?.addEventListener('change', renderVersions);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function renderProfiles(profiles) {
  const safeProfiles = Array.isArray(profiles) ? profiles : [];
  if ($('profile-count')) $('profile-count').textContent = String(safeProfiles.length);
  const list = $('profiles-list');
  if (!list) return;

  list.innerHTML = safeProfiles.map((profile) => {
    return '<div class="profile-item"><div><strong>' + escapeHtml(profile.name) +
      '</strong><small>Версия: ' + escapeHtml(profile.version || 'Не выбрана') +
      '</small></div><button class="secondary" data-remove="' + escapeHtml(profile.id) + '">УДАЛИТЬ</button></div>';
  }).join('') || '<div class="empty">Профилей пока нет</div>';

  list.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const updated = await window.shadow.removeProfile(button.dataset.remove);
        renderProfiles(updated);
        toast('Профиль удалён');
      } catch (error) {
        button.disabled = false;
        showError('Не удалось удалить профиль', error);
      }
    });
  });
}

$('add-profile')?.addEventListener('click', async () => {
  const button = $('add-profile');
  button.disabled = true;
  try {
    const profiles = await window.shadow.addProfile($('profile-name')?.value || '');
    if ($('profile-name')) $('profile-name').value = '';
    renderProfiles(profiles);
    toast('Профиль создан');
  } catch (error) {
    showError('Не удалось создать профиль', error);
  } finally {
    button.disabled = false;
  }
});

async function checkJava(showMessage = true) {
  const state = $('java-state');
  const caption = $('java-caption');
  const button = $('check-java');
  if (state) state.textContent = 'ПОИСК…';
  if (button) button.disabled = true;
  try {
    const result = await window.shadow.checkJava($('java-path')?.value || '');
    if (state) state.textContent = result.ok ? 'НАЙДЕНА' : 'НЕ НАЙДЕНА';
    if (caption) caption.textContent = result.message || '';
    if ($('side-status')) $('side-status').textContent = result.ok ? 'Java доступна' : 'Нужна настройка Java';
    if (result.ok && result.path && result.path.toLowerCase() !== 'java' && $('java-path')) {
      $('java-path').value = result.path;
    }
    if (showMessage) toast(result.ok ? 'Java найдена' : 'Java не найдена');
    return result;
  } catch (error) {
    if (state) state.textContent = 'ОШИБКА';
    if (caption) caption.textContent = error.message || String(error);
    showError('Ошибка проверки Java', error);
    return { ok: false, message: error.message || String(error) };
  } finally {
    if (button) button.disabled = false;
  }
}

$('check-java')?.addEventListener('click', () => checkJava(true));

$('memory')?.addEventListener('input', () => {
  if ($('memory-value')) $('memory-value').textContent = $('memory').value + ' МБ';
});

$('save-settings')?.addEventListener('click', async () => {
  const button = $('save-settings');
  button.disabled = true;
  try {
    settings = await window.shadow.saveSettings({
      javaPath: $('java-path')?.value || '',
      memory: $('memory')?.value || 4096,
      gameDir: $('game-dir')?.value || ''
    });
    if ($('settings-result')) $('settings-result').textContent = 'Настройки сохранены.';
    toast('Настройки сохранены');
  } catch (error) {
    if ($('settings-result')) $('settings-result').textContent = 'Не удалось сохранить настройки: ' + (error.message || error);
    showError('Ошибка сохранения', error);
  } finally {
    button.disabled = false;
  }
});

async function initialize() {
  try {
    const info = await window.shadow.info();
    if ($('app-version')) $('app-version').textContent = info.version;
    settings = await window.shadow.getSettings();
    if ($('java-path')) $('java-path').value = settings.javaPath || '';
    if ($('memory')) $('memory').value = settings.memory || 4096;
    if ($('memory-value')) $('memory-value').textContent = ($('memory')?.value || 4096) + ' МБ';
    if ($('game-dir')) $('game-dir').value = settings.gameDir || '';
    renderProfiles(settings.profiles || []);
    checkJava(false);
    loadVersions();
  } catch (error) {
    showError('Не удалось запустить интерфейс', error);
  }
}

initialize();
