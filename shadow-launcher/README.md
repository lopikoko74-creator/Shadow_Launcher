# Shadow Launcher 0.2.0

Windows 10+ / Electron. Русскоязычный интерфейс управления Minecraft.

## Запуск из исходников
1. Установи Node.js LTS.
2. Открой терминал в папке проекта.
3. Выполни `npm install`.
4. Выполни `npm start`.

## Уже реализовано
- Каталог релизов и снапшотов из официального Mojang version manifest.
- Поиск и фильтр версий.
- Проверка системной или указанной Java через `java -version`.
- Локальные профили и сохранение настроек.
- Изолированный preload IPC, contextIsolation, nodeIntegration выключен, CSP.

## Пока не реализовано
- Полная загрузка всех библиотек, assets и natives Minecraft.
- Microsoft/Xbox/Minecraft OAuth авторизация.
- Фактический запуск клиента Minecraft.
- Управление Forge/Fabric/Quilt и модами.

Не вводи пароль Microsoft в лаунчер. Авторизация должна выполняться через официальный OAuth в браузере.
