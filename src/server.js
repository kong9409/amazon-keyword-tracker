import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import XLSX from 'xlsx';
import cron from 'node-cron';
import { loadDotEnv, writeRowsToFeishu } from './feishu.js';
import { exportResultsToExcel } from './excel.js';
import { normalizeProducts, runTracker, todayLocal } from './tracker.js';
import { browserStatus } from './browser.js';
import { MARKETPLACES, resolveMarketplace } from './marketplaces.js';

loadDotEnv();
const root = process.cwd();
const upload = multer({ dest: path.join(root, 'uploads') });
const app = express();
const jobs = new Map();

app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
app.use(express.static(path.join(root, 'public')));
app.use('/output', express.static(path.join(root, 'output')));
app.use('/templates', express.static(path.join(root, 'templates')));

function readJsonIfExists(filePath, fallback = {}) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}

function ensureDirs() {
  for (const d of ['output', 'uploads']) fs.mkdirSync(path.join(root, d), { recursive: true });
}

function loadConfigFromBody(body = {}) {
  const base = readJsonIfExists(path.join(root, 'config.json'), readJsonIfExists(path.join(root, 'config.example.json'), {}));
  const config = structuredClone(base);
  config.marketplace = resolveMarketplace({ ...(config.marketplace || {}), ...body });
  config.run = config.run || {};
  config.output = config.output || {};
  if (body.maxPages) config.run.maxPages = Math.max(1, Math.min(10, Number(body.maxPages)));
  if (body.outputMode) {
    config.output.exportExcel = ['excel', 'both'].includes(body.outputMode);
    config.output.writeFeishu = ['feishu', 'both'].includes(body.outputMode);
  }
  config.output.enrichProductMetrics = body.enrichProductMetrics !== false && body.enrichProductMetrics !== 'false';
  config.output.useSorftime = body.useSorftime === true || body.useSorftime === 'true';
  config.run.headless = body.headless === 'false' ? false : true;
  config.run.pageTimeoutMs = Number(body.pageTimeoutMs || config.run.pageTimeoutMs || 30000);
  config.run.delayMsBetweenKeywords = Number(body.delayMsBetweenKeywords || config.run.delayMsBetweenKeywords || 3500);
  return config;
}

function parseRowsFromWorkbook(filePath) {
  if (!filePath) return [];
  const wb = XLSX.readFile(filePath);
  const first = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(first, { defval: '' });
}

function parseUploadFiles(files = {}) {
  const out = { asinText: '', keywordText: '', pairs: [] };
  const readFirst = (name) => files[name]?.[0]?.path;
  const asinPath = readFirst('asinFile');
  const keywordPath = readFirst('keywordFile');
  const pairPath = readFirst('pairFile');
  if (asinPath) {
    if (/\.xlsx?$/i.test(files.asinFile[0].originalname)) {
      out.asinText = parseRowsFromWorkbook(asinPath).map(r => `${r['产品标签'] || r.label || ''},${r.ASIN || r.asin || ''}`).join('\n');
    } else out.asinText = fs.readFileSync(asinPath, 'utf8').split(/\r?\n/).slice(1).join('\n');
  }
  if (keywordPath) {
    if (/\.xlsx?$/i.test(files.keywordFile[0].originalname)) {
      out.keywordText = parseRowsFromWorkbook(keywordPath).map(r => r['关键词'] || r.keyword || '').filter(Boolean).join('\n');
    } else out.keywordText = fs.readFileSync(keywordPath, 'utf8').split(/\r?\n/).slice(1).join('\n');
  }
  if (pairPath) out.pairs = parseRowsFromWorkbook(pairPath);
  return out;
}

function countSteps(config, products) {
  const keywordSteps = products.reduce((n, p) => n + (p.keywords?.length || 0), 0);
  const metricSteps = config.output?.enrichProductMetrics !== false ? products.length : 0;
  const writeSteps = config.output?.writeFeishu ? 1 : 0;
  return Math.max(1, keywordSteps + metricSteps + writeSteps);
}

function createJob({ config, products }) {
  const id = crypto.randomUUID();
  const totalSteps = countSteps(config, products);
  const job = {
    id,
    status: 'queued',
    progress: 0,
    doneSteps: 0,
    totalSteps,
    count: 0,
    logs: ['任务已创建，等待启动。'],
    files: {},
    feishu: null,
    error: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  jobs.set(id, job);
  setTimeout(() => runJob(job, config, products), 0);
  return job;
}

function updateJob(job, patch = {}) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
}

async function runJob(job, config, products) {
  ensureDirs();
  updateJob(job, { status: 'running', progress: 2, logs: [...job.logs, '隐藏浏览器已启动，前台只显示进度条。'] });
  try {
    const log = (msg, meta = {}) => {
      job.logs.push(String(msg));
      if (meta.type === 'stepComplete') job.doneSteps += 1;
      job.progress = Math.min(96, Math.max(2, Math.round((job.doneSteps / job.totalSteps) * 92)));
      job.updatedAt = new Date().toISOString();
    };
    const results = await runTracker(config, products, log);
    const date = todayLocal();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonFile = `amazon_keyword_rank_${date}_${stamp}.json`;
    fs.writeFileSync(path.join(root, 'output', jsonFile), JSON.stringify(results, null, 2), 'utf8');
    const files = { json: `/output/${jsonFile}`, excel: '' };

    if (config.output.exportExcel) {
      const excelFile = `amazon_keyword_rank_${date}_${stamp}.xlsx`;
      exportResultsToExcel(results, path.join(root, 'output', excelFile));
      files.excel = `/output/${excelFile}`;
      job.logs.push('Excel 已生成。');
    }
    let feishu = null;
    if (config.output.writeFeishu) {
      job.logs.push('开始写入飞书多维表。');
      feishu = await writeRowsToFeishu(config, results);
      job.doneSteps += 1;
      job.logs.push(`飞书写入完成：${feishu.inserted || 0} 行。`);
    }
    updateJob(job, { status: 'done', progress: 100, count: results.length, files, feishu, logs: job.logs });
  } catch (e) {
    updateJob(job, { status: 'error', progress: Math.max(job.progress || 0, 5), error: e.message, logs: [...job.logs, `失败：${e.message}`] });
  }
}

app.get('/api/config', (req, res) => {
  const config = readJsonIfExists(path.join(root, 'config.json'), readJsonIfExists(path.join(root, 'config.example.json'), {}));
  res.json({ ok: true, config, marketplaces: MARKETPLACES });
});

app.get('/api/marketplaces', (req, res) => res.json({ ok: true, marketplaces: MARKETPLACES }));

app.get('/api/health', (req, res) => {
  const status = browserStatus();
  // Docker/Zeabur may not expose a Chrome/Edge path to this detector, but Playwright's bundled browser is available in the base image.
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) status.ok = true;
  res.json({ ok: true, browser: status, cwd: root, node: process.version, mode: 'headless' });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: '任务不存在或服务已重启。' });
  res.json({ ok: true, job });
});

app.post('/api/test-excel', express.json(), (req, res) => {
  ensureDirs();
  const date = todayLocal();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sample = [{
    date, site: 'Amazon US', productLabel: '测试产品', asin: 'B0TEST0000', keyword: 'test keyword', maxPages: 1,
    productUrl: 'https://www.amazon.com/dp/B0TEST0000', searchUrl: 'https://www.amazon.com/s?k=test+keyword', capturedAt: new Date().toISOString(),
    organic: { found: true, page: 1, rank: 12 }, ad: { found: false, page: null, rank: null },
    price: 99.99, sales: '', bsr: '#123 in Tools & Home Improvement', categoryRank: 123, rating: 4.6, reviewCount: 88, source: 'self_test', note: '这是测试行，不是真实抓取。'
  }];
  const excelFile = `self_test_${date}_${stamp}.xlsx`;
  exportResultsToExcel(sample, path.join(root, 'output', excelFile));
  res.json({ ok: true, files: { excel: `/output/${excelFile}` } });
});

app.post('/api/run', upload.fields([{ name: 'asinFile', maxCount: 1 }, { name: 'keywordFile', maxCount: 1 }, { name: 'pairFile', maxCount: 1 }]), async (req, res) => {
  ensureDirs();
  try {
    const body = req.body || {};
    const config = loadConfigFromBody(body);
    const uploaded = parseUploadFiles(req.files || {});
    const products = normalizeProducts({
      asinText: body.asinText || uploaded.asinText || '',
      keywordText: body.keywordText || uploaded.keywordText || '',
      pairs: uploaded.pairs,
      products: body.products ? JSON.parse(body.products) : []
    });
    if (!products.length) return res.status(400).json({ ok: false, error: '请手动输入 ASIN+关键词，或上传模板。' });
    const job = createJob({ config, products });
    res.json({ ok: true, jobId: job.id, job });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, stack: process.env.NODE_ENV === 'development' ? e.stack : undefined });
  }
});

async function runOnceFromConfig() {
  ensureDirs();
  const config = loadConfigFromBody({ outputMode: readJsonIfExists(path.join(root, 'config.json'), {}).output?.mode || 'excel' });
  const products = normalizeProducts({ products: config.products || [] });
  if (!products.length) throw new Error('config.json 里没有 products。');
  const results = await runTracker(config, products, console.log);
  const date = todayLocal();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(root, 'output', `amazon_keyword_rank_${date}_${stamp}.json`), JSON.stringify(results, null, 2), 'utf8');
  if (config.output?.exportExcel !== false) exportResultsToExcel(results, path.join(root, 'output', `amazon_keyword_rank_${date}_${stamp}.xlsx`));
  if (config.output?.writeFeishu) await writeRowsToFeishu(config, results);
  console.log(`完成：${results.length} 行`);
}

const isOnce = process.argv.includes('--once');
if (isOnce) {
  runOnceFromConfig().catch(e => { console.error(e); process.exit(1); });
} else {
  const config = readJsonIfExists(path.join(root, 'config.json'), readJsonIfExists(path.join(root, 'config.example.json'), {}));
  if (config.run?.dailyCron && process.env.DISABLE_DAILY_CRON !== 'true') {
    cron.schedule(config.run.dailyCron, () => runOnceFromConfig().catch(e => console.error('定时任务失败：', e.message)));
  }
  const port = Number(process.env.PORT || 8787);
  app.listen(port, '0.0.0.0', () => console.log(`Amazon 关键词监控工具已启动：http://localhost:${port}`));
}
