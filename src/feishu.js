import fs from 'node:fs';

export function loadDotEnv(filePath = '.env') {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function requireEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`缺少环境变量：${name}`);
  return val;
}

async function httpJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(options.headers || {}) }
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return data;
}

async function getTenantAccessToken() {
  const base = process.env.FEISHU_OPEN_BASE || 'https://open.feishu.cn';
  const data = await httpJson(`${base}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    body: JSON.stringify({
      app_id: requireEnv('FEISHU_APP_ID'),
      app_secret: requireEnv('FEISHU_APP_SECRET')
    })
  });
  if (data.code !== 0) throw new Error(`获取 tenant_access_token 失败：${JSON.stringify(data)}`);
  return data.tenant_access_token;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function feishuFieldsFromResult(config, item) {
  const m = config.feishuFieldMap || {};
  const f = (key) => m[key] || key;
  return {
    [f('date')]: item.date,
    [f('site')]: item.site,
    [f('productLabel')]: item.productLabel,
    [f('asin')]: item.asin,
    [f('keyword')]: item.keyword,
    [f('organicFound')]: item.organic?.found ? '是' : '否',
    [f('organicPage')]: item.organic?.found ? item.organic.page : null,
    [f('organicRank')]: item.organic?.found ? item.organic.rank : null,
    [f('adFound')]: item.ad?.found ? '是' : '否',
    [f('adPage')]: item.ad?.found ? item.ad.page : null,
    [f('adRank')]: item.ad?.found ? item.ad.rank : null,
    [f('price')]: item.price ?? null,
    [f('currency')]: item.currency ?? '',
    [f('sales')]: item.sales ?? null,
    [f('dailySales')]: item.dailySales ?? null,
    [f('weeklySales')]: item.weeklySales ?? null,
    [f('monthlySales')]: item.monthlySales ?? null,
    [f('revenue')]: item.revenue ?? null,
    [f('bsr')]: item.bsr ?? '',
    [f('categoryRank')]: item.categoryRank ?? null,
    [f('categoryName')]: item.categoryName ?? '',
    [f('rating')]: item.rating ?? null,
    [f('reviewCount')]: item.reviewCount ?? null,
    [f('maxPages')]: item.maxPages,
    [f('productUrl')]: item.productUrl,
    [f('searchUrl')]: item.searchUrl,
    [f('capturedAt')]: item.capturedAt,
    [f('source')]: item.source || 'amazon_frontend',
    [f('sorftimeTool')]: item.sorftimeTool || '',
    [f('sorftimeRawSummary')]: item.sorftimeRawSummary || '',
    [f('note')]: item.note || ''
  };
}

export async function writeRowsToFeishu(config, results) {
  if (!results.length) return { inserted: 0 };
  const base = process.env.FEISHU_OPEN_BASE || 'https://open.feishu.cn';
  const appToken = requireEnv('FEISHU_APP_TOKEN');
  const tableId = requireEnv('FEISHU_TABLE_ID');
  const token = await getTenantAccessToken();
  const rows = results.map(item => feishuFieldsFromResult(config, item));
  let inserted = 0;

  for (const batch of chunk(rows, 500)) {
    const url = `${base}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`;
    const data = await httpJson(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ records: batch.map(fields => ({ fields })) })
    });
    if (data.code !== 0) throw new Error(`写入飞书失败：${JSON.stringify(data)}`);
    inserted += batch.length;
  }
  return { inserted };
}
