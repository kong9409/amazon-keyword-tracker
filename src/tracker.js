import { querySorftimeMetrics } from './sorftime.js';
import { launchBrowser } from './browser.js';
import { resolveMarketplace } from './marketplaces.js';

export function todayLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function normalizeProducts({ asinText = '', keywordText = '', pairs = [], products = [] }) {
  const clean = (s) => String(s || '').trim();
  const asinLines = asinText.split(/\r?\n/).map(clean).filter(Boolean);
  const keywordLines = keywordText.split(/\r?\n/).map(clean).filter(Boolean);
  const out = [];

  for (const p of products || []) {
    if (!p.asin) continue;
    out.push({ label: clean(p.label) || clean(p.asin), asin: clean(p.asin).toUpperCase(), keywords: [...new Set((p.keywords || []).map(clean).filter(Boolean))] });
  }

  for (const pair of pairs || []) {
    const asin = clean(pair.asin || pair.ASIN || pair['ASIN']).toUpperCase();
    const keyword = clean(pair.keyword || pair['关键词']);
    if (!asin || !keyword) continue;
    const label = clean(pair.label || pair['产品标签'] || asin);
    let p = out.find(x => x.asin === asin && x.label === label);
    if (!p) { p = { label, asin, keywords: [] }; out.push(p); }
    if (!p.keywords.includes(keyword)) p.keywords.push(keyword);
  }

  if (asinLines.length && keywordLines.length) {
    for (const line of asinLines) {
      const parts = line.split(/[,，\t]/).map(clean).filter(Boolean);
      const asin = (parts.find(x => /^[A-Z0-9]{10}$/i.test(x)) || parts[0] || '').toUpperCase();
      const label = parts.length >= 2 ? parts[0].replace(asin, '').trim() || asin : asin;
      if (!asin) continue;
      let p = out.find(x => x.asin === asin);
      if (!p) { p = { label, asin, keywords: [] }; out.push(p); }
      for (const kw of keywordLines) if (!p.keywords.includes(kw)) p.keywords.push(kw);
    }
  }

  return out.filter(p => p.asin && p.keywords.length);
}

async function prepareAmazon(page, config) {
  config.marketplace = resolveMarketplace(config.marketplace || {});
  const domain = config.marketplace.domain.replace(/\/$/, '');
  await page.goto(domain, { waitUntil: 'domcontentloaded', timeout: config.run.pageTimeoutMs });
  await page.waitForTimeout(1800);
  for (const selector of ['input#sp-cc-accept', '#sp-cc-accept', 'input[name="accept"]']) {
    try { await page.click(selector, { timeout: 1200 }); break; } catch {}
  }
  if (config.marketplace.postalCode) {
    try {
      await page.click('#nav-global-location-popover-link', { timeout: 2500 });
      await page.fill('#GLUXZipUpdateInput', String(config.marketplace.postalCode), { timeout: 2500 });
      await page.click('#GLUXZipUpdate', { timeout: 2500 });
      await page.waitForTimeout(1200);
      await page.keyboard.press('Escape').catch(() => {});
    } catch {}
  }
}

async function scanKeyword(page, config, asin, keyword) {
  config.marketplace = resolveMarketplace(config.marketplace || {});
  const domain = config.marketplace.domain.replace(/\/$/, '');
  const maxPages = Number(config.run.maxPages || 3);
  const pageSizeEstimate = Number(config.run.pageSizeEstimate || 48);
  const result = {
    organic: { found: false, page: null, rank: null },
    ad: { found: false, page: null, rank: null },
    searchUrl: `${domain}/s?k=${encodeURIComponent(keyword)}`,
    note: ''
  };

  for (let pg = 1; pg <= maxPages; pg++) {
    const url = `${domain}/s?k=${encodeURIComponent(keyword)}&page=${pg}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.run.pageTimeoutMs });
      await page.waitForTimeout(1800);
      const html = await page.content();
      if (/captcha|Enter the characters you see below|Robot Check/i.test(html)) {
        result.note += `第${pg}页疑似验证码/风控；`;
        break;
      }
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(900);

      const items = await page.evaluate(({ pg, pageSizeEstimate }) => {
        function sponsored(card) {
          const sponsoredSelectors = ['.puis-sponsored-label-text', '.s-sponsored-label-info-icon', '[aria-label*="Sponsored"]', '[aria-label*="sponsored"]', '[aria-label*="Gesponsert"]', '[aria-label*="广告"]'];
          return sponsoredSelectors.some(sel => card.querySelector(sel)) || /Sponsored|Gesponsert|广告|赞助/.test(card.textContent || '');
        }
        const cards = document.querySelectorAll('[data-component-type="s-search-result"]');
        return Array.from(cards).map((c, i) => ({
          asin: c.getAttribute('data-asin') || '',
          sponsored: sponsored(c),
          rank: (pg - 1) * pageSizeEstimate + i + 1
        })).filter(x => x.asin);
      }, { pg, pageSizeEstimate });

      for (const item of items) {
        if (item.asin.toUpperCase() !== asin.toUpperCase()) continue;
        if (item.sponsored && !result.ad.found) result.ad = { found: true, page: pg, rank: item.rank };
        if (!item.sponsored && !result.organic.found) result.organic = { found: true, page: pg, rank: item.rank };
      }
      if (result.ad.found && result.organic.found) break;
    } catch (e) {
      result.note += `第${pg}页失败：${e.message.slice(0, 120)}；`;
    }
  }
  return result;
}

async function getAmazonProductMetrics(page, config, asin) {
  config.marketplace = resolveMarketplace(config.marketplace || {});
  const domain = config.marketplace.domain.replace(/\/$/, '');
  const url = `${domain}/dp/${asin}`;
  const metrics = { price: null, sales: null, bsr: '', categoryRank: null, rating: null, reviewCount: null, source: 'amazon_frontend', note: '' };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.run.pageTimeoutMs });
    await page.waitForTimeout(1800);
    const data = await page.evaluate(() => {
      const text = (sel) => document.querySelector(sel)?.textContent?.trim() || '';
      const pickText = (sels) => sels.map(text).find(Boolean) || '';
      const priceText = pickText(['#corePrice_feature_div .a-offscreen', '.priceToPay .a-offscreen', '#priceblock_ourprice', '#priceblock_dealprice']);
      const ratingText = pickText(['#acrPopover [class*="a-icon-alt"]', 'span[data-hook="rating-out-of-text"]']);
      const reviewText = pickText(['#acrCustomerReviewText', '#averageCustomerReviews #acrCustomerReviewText']);
      let bsr = '';
      const body = document.body.innerText || '';
      const m = body.match(/Best Sellers Rank[\s\S]{0,220}/i) || body.match(/Amazon Bestsellers Rank[\s\S]{0,220}/i);
      if (m) bsr = m[0].replace(/\s+/g, ' ').slice(0, 220);
      return { priceText, ratingText, reviewText, bsr };
    });
    const parseNumber = (s) => {
      const m = String(s || '').replace(/,/g, '').match(/\d+(\.\d+)?/);
      return m ? Number(m[0]) : null;
    };
    metrics.price = parseNumber(data.priceText);
    metrics.rating = parseNumber(data.ratingText);
    metrics.reviewCount = parseNumber(data.reviewText);
    metrics.bsr = data.bsr || '';
    const rankMatch = metrics.bsr.replace(/,/g, '').match(/#(\d+)/);
    metrics.categoryRank = rankMatch ? Number(rankMatch[1]) : null;
  } catch (e) {
    metrics.note = `商品页指标抓取失败：${e.message.slice(0, 120)}`;
  }
  return metrics;
}

export async function runTracker(config, products, log = console.log) {
  const date = todayLocal();
  config.marketplace = resolveMarketplace(config.marketplace || {});
  const browser = await launchBrowser(config);
  const ctx = await browser.newContext({
    locale: config.marketplace.locale || 'en-US',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    extraHTTPHeaders: { 'Accept-Language': config.marketplace.languageHeader || 'en-US,en;q=0.9' }
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(config.run.pageTimeoutMs || 30000);
  await prepareAmazon(page, config);

  const results = [];
  const productMetricsCache = new Map();
  for (const product of products) {
    let metrics = {};
    if (config.output?.enrichProductMetrics !== false) {
      log(`📦 ${product.label} | ${product.asin} | 抓取当天价格/BSR/评分/评论`);
      metrics = await getAmazonProductMetrics(page, config, product.asin);
      log(`   商品指标：价格 ${metrics.price ?? ''} | BSR ${metrics.categoryRank ?? ''} | 评论 ${metrics.reviewCount ?? ''}`, { type: 'stepComplete' });
      if (config.output?.useSorftime) {
        const s = await querySorftimeMetrics({ asin: product.asin, marketplace: config.marketplace });
        if (s) metrics = { ...metrics, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== null && v !== '')) };
      }
      productMetricsCache.set(product.asin, metrics);
    }
    for (const keyword of product.keywords) {
      log(`🔍 ${product.label} | ${product.asin} | ${keyword}`);
      const scan = await scanKeyword(page, config, product.asin, keyword);
      const item = {
        date,
        site: config.marketplace.name,
        productLabel: product.label,
        asin: product.asin,
        keyword,
        maxPages: config.run.maxPages,
        productUrl: `${config.marketplace.domain.replace(/\/$/, '')}/dp/${product.asin}`,
        searchUrl: scan.searchUrl,
        capturedAt: new Date().toISOString(),
        organic: scan.organic,
        ad: scan.ad,
        ...productMetricsCache.get(product.asin),
        note: [scan.note, productMetricsCache.get(product.asin)?.note].filter(Boolean).join('；')
      };
      results.push(item);
      log(`   自然：${item.organic.found ? `P${item.organic.page} 第${item.organic.rank}` : '未找到'} | 广告：${item.ad.found ? `P${item.ad.page} 第${item.ad.rank}` : '未找到'} | 价格：${item.price ?? ''}`, { type: 'stepComplete' });
      await page.waitForTimeout(Number(config.run.delayMsBetweenKeywords || 5000));
    }
  }
  await browser.close();
  return results;
}
