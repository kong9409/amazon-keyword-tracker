import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';

function winPaths() {
  const local = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  return [
    `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
    `${local}\\Google\\Chrome\\Application\\chrome.exe`,
    `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${local}\\Microsoft\\Edge\\Application\\msedge.exe`
  ];
}

function macPaths() {
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ];
}

function linuxPaths() {
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable'
  ];
}

export function findInstalledBrowser() {
  const paths = [
    process.env.BROWSER_EXECUTABLE_PATH,
    ...(os.platform() === 'win32' ? winPaths() : []),
    ...(os.platform() === 'darwin' ? macPaths() : []),
    ...(os.platform() === 'linux' ? linuxPaths() : [])
  ].filter(Boolean);
  return paths.find(p => fs.existsSync(p));
}

export async function launchBrowser(config = {}) {
  const headless = String(process.env.HEADFUL || '').toLowerCase() === 'true' ? false : config.run?.headless !== false;
  const common = {
    headless,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  };

  const explicit = process.env.BROWSER_EXECUTABLE_PATH || config.run?.browserExecutablePath;
  if (explicit && fs.existsSync(explicit)) {
    return chromium.launch({ ...common, executablePath: explicit });
  }

  const installed = findInstalledBrowser();
  if (installed) {
    return chromium.launch({ ...common, executablePath: installed });
  }

  const candidates = [config.run?.browserChannel, 'chrome', 'msedge'].filter(Boolean);
  for (const channel of candidates) {
    try {
      return await chromium.launch({ ...common, channel });
    } catch {}
  }

  try {
    return await chromium.launch(common);
  } catch (e) {
    throw new Error([
      '没有找到可用浏览器，抓取无法开始。',
      '解决方法：',
      '1）电脑安装 Google Chrome 或 Microsoft Edge 后重启工具；',
      '2）或者在 .env 里填写 BROWSER_EXECUTABLE_PATH=你的 chrome.exe 完整路径；',
      '3）如果你网络可以下载，也可以运行 npm run install-browser。',
      `原始错误：${e.message}`
    ].join('\n'));
  }
}

export function browserStatus() {
  const installed = findInstalledBrowser();
  return {
    ok: Boolean(installed),
    executablePath: installed || '',
    platform: os.platform(),
    hint: installed ? '已找到本机浏览器。默认使用隐藏浏览器抓取，前台只显示进度。' : '本机未自动找到 Chrome/Edge。Zeabur Docker 部署会内置 Chromium；本地请安装浏览器或运行 npm run install-browser。'
  };
}
