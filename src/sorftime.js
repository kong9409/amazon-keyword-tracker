function compact(obj) {
  return Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

function parseMaybeJson(text) {
  if (text == null) return null;
  if (typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch {}
  const jsonMatch = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1]); } catch {}
  }
  return trimmed;
}

function parseSseOrJson(text) {
  const direct = parseMaybeJson(text);
  if (direct && typeof direct !== 'string') return direct;
  const events = [];
  let buf = '';
  for (const line of String(text || '').split(/\r?\n/)) {
    if (line.startsWith('data:')) buf += line.slice(5).trim();
    if (!line.trim() && buf) { events.push(buf); buf = ''; }
  }
  if (buf) events.push(buf);
  for (const e of events.reverse()) {
    const parsed = parseMaybeJson(e);
    if (parsed && typeof parsed !== 'string') return parsed;
  }
  return direct;
}

function firstNumber(...vals) {
  for (const v of vals) {
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const m = String(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (m) return Number(m[0]);
  }
  return null;
}

function firstValue(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

function flattenValues(value, depth = 0) {
  if (depth > 5 || value == null) return [];
  if (typeof value !== 'object') return [value];
  if (Array.isArray(value)) return value.flatMap(v => flattenValues(v, depth + 1));
  return Object.values(value).flatMap(v => flattenValues(v, depth + 1));
}

function findByKeys(obj, keys) {
  const needle = keys.map(k => k.toLowerCase());
  const found = [];
  function walk(v, path = []) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, [...path, String(i)]));
    for (const [k, val] of Object.entries(v)) {
      const lk = k.toLowerCase();
      if (needle.some(n => lk === n || lk.includes(n))) found.push(val);
      walk(val, [...path, k]);
    }
  }
  walk(obj);
  return found;
}

function normalizeSorftimePayload(payload) {
  const data = payload?.structuredContent || payload?.data || payload?.result || payload?.results || payload?.product || payload;
  const contentTexts = Array.isArray(payload?.content)
    ? payload.content.map(c => c?.text || c?.data || '').filter(Boolean).map(parseMaybeJson)
    : [];
  const merged = { data, contentTexts };
  const source = contentTexts.find(x => x && typeof x === 'object') || data || merged;
  const all = [source, data, ...contentTexts].filter(Boolean);
  const get = (...keys) => firstValue(...all.flatMap(x => findByKeys(x, keys)));

  const price = firstNumber(
    get('price'), get('buyBoxPrice'), get('currentPrice'), get('salePrice'), get('finalPrice')
  );
  const dailySales = firstNumber(get('dailySales'), get('daySales'), get('salesDay'), get('daily_sale'), get('销量（日）'));
  const weeklySales = firstNumber(get('weeklySales'), get('weekSales'), get('salesWeek'), get('weekly_sale'), get('销量（周）'));
  const monthlySales = firstNumber(get('monthlySales'), get('monthSales'), get('salesMonth'), get('salesVolume'), get('estimatedSales'), get('销量'), get('月销量'));
  const sales = firstNumber(get('sales'), monthlySales, dailySales, weeklySales);
  const revenue = firstNumber(get('revenue'), get('monthlyRevenue'), get('salesAmount'), get('estimatedRevenue'), get('月销售额'));
  const bsrText = firstValue(get('bsr'), get('bestSellersRank'), get('salesRankText'), get('rankText'), get('BSR排名'));
  const categoryRank = firstNumber(get('categoryRank'), get('bsrNumber'), get('salesRank'), get('rank'), bsrText);
  const categoryName = firstValue(get('category'), get('categoryName'), get('nodeName'), get('browseNodeName'), get('类目'));
  const rating = firstNumber(get('rating'), get('reviewRating'), get('star'), get('评分'));
  const reviewCount = firstNumber(get('reviewCount'), get('reviews'), get('ratingsTotal'), get('评论数'));
  const currency = firstValue(get('currency'), get('currencyCode'));

  return compact({
    price,
    sales,
    dailySales,
    weeklySales,
    monthlySales,
    revenue,
    bsr: typeof bsrText === 'string' ? bsrText : '',
    categoryRank,
    categoryName,
    rating,
    reviewCount,
    currency,
    sorftimeRawSummary: JSON.stringify(source).slice(0, 1200),
    source: 'sorftime_mcp'
  });
}

class McpHttpClient {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.sessionId = '';
    this.id = 1;
  }
  async post(payload, timeoutMs = 60000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        signal: ctrl.signal,
        headers: compact({
          'Content-Type': 'application/json; charset=utf-8',
          'Accept': 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2025-06-18',
          'Mcp-Session-Id': this.sessionId || undefined
        }),
        body: JSON.stringify(payload)
      });
      const sid = res.headers.get('mcp-session-id') || res.headers.get('Mcp-Session-Id');
      if (sid) this.sessionId = sid;
      const text = await res.text();
      const data = parseSseOrJson(text);
      if (!res.ok) throw new Error(`Sorftime MCP HTTP ${res.status}: ${text.slice(0, 500)}`);
      if (data?.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return data;
    } finally {
      clearTimeout(t);
    }
  }
  request(method, params = undefined, timeoutMs) {
    return this.post({ jsonrpc: '2.0', id: this.id++, method, ...(params !== undefined ? { params } : {}) }, timeoutMs);
  }
  notify(method, params = undefined) {
    return this.post({ jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) }, 15000).catch(() => null);
  }
}

function buildEndpoint() {
  const explicit = process.env.SORFTIME_MCP_URL || process.env.SORFTIME_URL;
  if (explicit) return explicit;
  const key = process.env.SORFTIME_MCP_KEY || process.env.SORFTIME_KEY;
  if (!key) return '';
  return `https://mcp.sorftime.com?key=${encodeURIComponent(key)}`;
}

function scoreTool(tool) {
  const text = `${tool?.name || ''} ${tool?.description || ''}`.toLowerCase();
  let s = 0;
  for (const w of ['asin', 'product', 'listing', 'detail', 'metrics', 'sale', 'sales', 'price', 'rank', 'bsr']) if (text.includes(w)) s += 2;
  for (const w of ['keyword', 'competitor', 'category', 'market']) if (text.includes(w)) s += 1;
  for (const w of ['write', 'update', 'delete', 'create']) if (text.includes(w)) s -= 6;
  return s;
}

function argsFromSchema(tool, asin, marketplace) {
  const schema = tool?.inputSchema || tool?.schema || {};
  const props = schema.properties || {};
  const args = {};
  const domain = marketplace?.domain || 'https://www.amazon.com';
  const code = marketplace?.code || 'US';
  const site = code === 'UK' ? 'GB' : code;
  for (const key of Object.keys(props)) {
    const k = key.toLowerCase();
    if (k.includes('asin')) args[key] = asin;
    else if (k.includes('marketplace') || k === 'market' || k.includes('site') || k.includes('country') || k.includes('region')) args[key] = site;
    else if (k.includes('domain') || k.includes('url')) args[key] = domain;
    else if (k.includes('locale') || k.includes('language')) args[key] = marketplace?.locale || 'en-US';
    else if (k.includes('currency')) args[key] = marketplace?.currency || 'USD';
    else if (k.includes('keyword')) args[key] = '';
  }
  if (!Object.keys(args).some(k => k.toLowerCase().includes('asin'))) args.asin = asin;
  if (!Object.keys(args).some(k => /market|site|country|region/.test(k.toLowerCase()))) args.marketplace = site;
  return compact(args);
}

async function callSorftimeViaMcp({ asin, marketplace, log }) {
  const endpoint = buildEndpoint();
  if (!endpoint) return null;
  const client = new McpHttpClient(endpoint);
  try {
    await client.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'amazon-keyword-tracker', version: '4.0.0' }
    }, 30000).catch(async () => client.request('initialize', {
      protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'amazon-keyword-tracker', version: '4.0.0' }
    }, 30000));
    await client.notify('notifications/initialized');
    const listed = await client.request('tools/list', {}, 30000);
    const tools = listed?.result?.tools || listed?.tools || [];
    if (!tools.length) throw new Error('Sorftime MCP 未返回可用 tools/list。');
    const candidates = tools.map(t => ({ tool: t, score: scoreTool(t) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
    if (!candidates.length) throw new Error(`没有找到适合 ASIN 指标查询的 Sorftime MCP 工具。可用工具：${tools.map(t => t.name).join(', ')}`);

    const errors = [];
    for (const { tool } of candidates) {
      const args = argsFromSchema(tool, asin, marketplace);
      try {
        log?.(`   Sorftime MCP：调用 ${tool.name}`);
        const called = await client.request('tools/call', { name: tool.name, arguments: args }, 90000);
        const payload = called?.result || called;
        const normalized = normalizeSorftimePayload(payload);
        if (Object.keys(normalized).filter(k => !['source', 'sorftimeRawSummary'].includes(k)).length) {
          return { ...normalized, source: 'sorftime_mcp', sorftimeTool: tool.name };
        }
        errors.push(`${tool.name}: 返回内容无法识别字段`);
      } catch (e) {
        errors.push(`${tool.name}: ${e.message}`);
      }
    }
    throw new Error(errors.join(' | '));
  } catch (e) {
    return { note: `Sorftime MCP 调用失败：${e.message}`, source: 'amazon_frontend' };
  }
}

async function callSorftimeViaHttpApi({ asin, marketplace }) {
  const apiUrl = process.env.SORFTIME_API_URL;
  if (!apiUrl) return null;
  const key = process.env.SORFTIME_MCP_KEY || process.env.SORFTIME_KEY || '';
  const url = new URL(apiUrl);
  url.searchParams.set('asin', asin);
  url.searchParams.set('marketplace', marketplace?.code || 'US');
  if (key && !url.searchParams.has('key')) url.searchParams.set('key', key);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Sorftime API HTTP ${res.status}: ${text.slice(0, 500)}`);
  const payload = parseMaybeJson(text);
  return normalizeSorftimePayload(payload);
}

export async function querySorftimeMetrics({ asin, marketplace, log }) {
  if (!(process.env.SORFTIME_MCP_URL || process.env.SORFTIME_MCP_KEY || process.env.SORFTIME_URL || process.env.SORFTIME_KEY || process.env.SORFTIME_API_URL)) return null;
  if (process.env.SORFTIME_API_URL) {
    try { return await callSorftimeViaHttpApi({ asin, marketplace }); }
    catch (e) { return { note: `Sorftime API 调用失败：${e.message}`, source: 'amazon_frontend' }; }
  }
  return callSorftimeViaMcp({ asin, marketplace, log });
}
