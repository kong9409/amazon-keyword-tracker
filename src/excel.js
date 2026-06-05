import XLSX from 'xlsx';

export function exportResultsToExcel(results, filePath) {
  const rows = results.map(x => ({
    日期: x.date,
    站点: x.site,
    产品标签: x.productLabel,
    ASIN: x.asin,
    关键词: x.keyword,
    自然是否上榜: x.organic?.found ? '是' : '否',
    自然页码: x.organic?.page ?? '',
    自然排名: x.organic?.rank ?? '',
    广告是否上榜: x.ad?.found ? '是' : '否',
    广告页码: x.ad?.page ?? '',
    广告排名: x.ad?.rank ?? '',
    当天价格: x.price ?? '',
    货币: x.currency ?? '',
    '销量/预估销量': x.sales ?? '',
    日销量: x.dailySales ?? '',
    周销量: x.weeklySales ?? '',
    月销量: x.monthlySales ?? '',
    月销售额: x.revenue ?? '',
    BSR排名: x.bsr ?? '',
    类目排名数字: x.categoryRank ?? '',
    类目名称: x.categoryName ?? '',
    评分: x.rating ?? '',
    评论数: x.reviewCount ?? '',
    搜索深度: x.maxPages,
    商品链接: x.productUrl,
    搜索链接: x.searchUrl,
    抓取时间: x.capturedAt,
    数据来源: x.source || 'amazon_frontend',
    Sorftime工具: x.sorftimeTool || '',
    Sorftime原始摘要: x.sorftimeRawSummary || '',
    备注: x.note || ''
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    {wch:12},{wch:12},{wch:24},{wch:14},{wch:26},{wch:12},{wch:10},{wch:10},{wch:12},{wch:10},{wch:10},
    {wch:12},{wch:8},{wch:14},{wch:10},{wch:10},{wch:10},{wch:12},{wch:28},{wch:12},{wch:20},{wch:8},{wch:10},{wch:10},
    {wch:32},{wch:42},{wch:24},{wch:18},{wch:18},{wch:42},{wch:36}
  ];
  XLSX.utils.book_append_sheet(wb, ws, '每日排名记录');

  const summary = buildSummary(results);
  const summaryWs = XLSX.utils.json_to_sheet(summary);
  summaryWs['!cols'] = [{wch:24},{wch:14},{wch:10},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:14}];
  XLSX.utils.book_append_sheet(wb, summaryWs, '产品汇总');
  XLSX.writeFile(wb, filePath);
  return filePath;
}

function buildSummary(results) {
  const map = new Map();
  for (const x of results) {
    const key = `${x.productLabel}|${x.asin}`;
    if (!map.has(key)) map.set(key, {
      产品标签: x.productLabel,
      ASIN: x.asin,
      关键词数: 0,
      自然上榜数: 0,
      广告上榜数: 0,
      自然首页数: 0,
      广告首页数: 0,
      最新价格: x.price ?? '',
      月销量: x.monthlySales ?? x.sales ?? '',
      日销量: x.dailySales ?? '',
      类目排名数字: x.categoryRank ?? '',
      类目名称: x.categoryName ?? ''
    });
    const s = map.get(key);
    s.关键词数 += 1;
    if (x.organic?.found) s.自然上榜数 += 1;
    if (x.ad?.found) s.广告上榜数 += 1;
    if (x.organic?.page === 1) s.自然首页数 += 1;
    if (x.ad?.page === 1) s.广告首页数 += 1;
    if (x.price != null) s.最新价格 = x.price;
    if (x.monthlySales != null || x.sales != null) s.月销量 = x.monthlySales ?? x.sales;
    if (x.dailySales != null) s.日销量 = x.dailySales;
    if (x.categoryRank != null) s.类目排名数字 = x.categoryRank;
    if (x.categoryName) s.类目名称 = x.categoryName;
  }
  return Array.from(map.values());
}
