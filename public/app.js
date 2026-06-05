const form = document.querySelector('#runForm');
const btn = document.querySelector('#runBtn');
const result = document.querySelector('#result');
const healthBadge = document.querySelector('#healthBadge');
const testExcelBtn = document.querySelector('#testExcelBtn');
const marketplaceSelect = document.querySelector('#marketplaceSelect');
const marketplaceName = document.querySelector('#marketplaceName');
const domain = document.querySelector('#domain');
const postalCode = document.querySelector('#postalCode');
const marketHint = document.querySelector('#marketHint');
const progressCard = document.querySelector('#progressCard');
const progressTitle = document.querySelector('#progressTitle');
const progressSub = document.querySelector('#progressSub');
const progressPct = document.querySelector('#progressPct');
const progressFill = document.querySelector('#progressFill');
const logBox = document.querySelector('#logBox');
const resultLinks = document.querySelector('#resultLinks');

let marketplaces = {};
let pollTimer = null;

function setProgress(job) {
  const pct = Math.max(0, Math.min(100, Number(job.progress || 0)));
  progressPct.textContent = `${pct}%`;
  progressFill.style.width = `${pct}%`;
  const statusText = { queued: '排队中', running: '抓取中', done: '完成', error: '失败' }[job.status] || job.status;
  progressTitle.textContent = `${statusText}：${job.doneSteps || 0}/${job.totalSteps || 1}`;
  progressSub.textContent = job.status === 'running' ? '隐藏浏览器正在抓取，前台只显示进度条。' : job.status === 'done' ? `完成：共 ${job.count || 0} 行。` : job.error || '后台任务准备中。';
  logBox.textContent = (job.logs || []).join('\n');
  logBox.scrollTop = logBox.scrollHeight;
  const links = [];
  if (job.files?.excel) links.push(`<a class="download" href="${job.files.excel}">下载 Excel</a>`);
  if (job.files?.json) links.push(`<a class="download light" href="${job.files.json}">下载 JSON</a>`);
  if (job.feishu) links.push(`<span class="ok pill">飞书写入 ${job.feishu.inserted || 0} 行</span>`);
  if (job.status === 'error') links.push(`<span class="err pill">${job.error || '运行失败'}</span>`);
  resultLinks.innerHTML = links.join('');
}

async function loadMarketplaces() {
  const res = await fetch('/api/marketplaces');
  const json = await res.json();
  marketplaces = json.marketplaces || {};
  applyMarketplace(marketplaceSelect.value);
}

function applyMarketplace(code) {
  const m = marketplaces[code];
  if (!m) return;
  marketplaceName.value = m.name;
  domain.value = m.domain;
  postalCode.value = m.postalCode || '';
  marketHint.textContent = `默认地区：${m.regionHint || m.postalCode || '默认'}。你也可以手动修改域名和邮编。`;
}

marketplaceSelect.addEventListener('change', () => applyMarketplace(marketplaceSelect.value));

async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const json = await res.json();
    if (json.browser?.ok) {
      healthBadge.textContent = '隐藏浏览器已就绪';
      healthBadge.className = 'badge okbadge';
      healthBadge.title = json.browser.executablePath || 'Zeabur/Docker 内置 Chromium';
    } else {
      healthBadge.textContent = '浏览器待检测';
      healthBadge.className = 'badge warnbadge';
      healthBadge.title = json.browser?.hint || '';
    }
  } catch (e) {
    healthBadge.textContent = '后端未启动';
    healthBadge.className = 'badge errbadge';
    healthBadge.title = e.message;
  }
}

loadMarketplaces().catch(() => {});
checkHealth();

async function pollJob(jobId) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || '读取任务失败');
      setProgress(json.job);
      if (['done', 'error'].includes(json.job.status)) {
        clearInterval(pollTimer);
        btn.disabled = false;
      }
    } catch (e) {
      clearInterval(pollTimer);
      progressSub.textContent = `读取进度失败：${e.message}`;
      btn.disabled = false;
    }
  }, 1200);
}

testExcelBtn.addEventListener('click', async () => {
  result.classList.remove('hidden');
  result.innerHTML = '<p>正在生成测试 Excel...</p>';
  try {
    const res = await fetch('/api/test-excel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || '测试失败');
    result.innerHTML = `<p class="ok">Excel 导出功能正常。</p><a class="download" href="${json.files.excel}">下载测试 Excel</a>`;
  } catch (e) {
    result.innerHTML = `<p class="err">测试失败：${e.message}</p>`;
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  result.classList.add('hidden');
  progressCard.classList.remove('hidden');
  resultLinks.innerHTML = '';
  logBox.textContent = '正在提交任务...';
  progressFill.style.width = '1%';
  progressPct.textContent = '1%';
  progressTitle.textContent = '提交任务中';
  progressSub.textContent = '任务提交后，后台会隐藏浏览器抓取。';
  btn.disabled = true;
  const data = new FormData(form);
  data.set('enrichProductMetrics', form.enrichProductMetrics.checked ? 'true' : 'false');
  data.set('useSorftime', form.useSorftime.checked ? 'true' : 'false');
  try {
    const res = await fetch('/api/run', { method: 'POST', body: data });
    let json;
    try { json = await res.json(); } catch { throw new Error('后端没有返回 JSON。请确认是通过服务链接打开，而不是双击 HTML 文件。'); }
    if (!json.ok) throw new Error(json.error || '运行失败');
    setProgress(json.job);
    pollJob(json.jobId);
  } catch (err) {
    progressSub.textContent = `失败：${err.message}`;
    logBox.textContent = err.stack || err.message;
    resultLinks.innerHTML = `<span class="err pill">${err.message}</span>`;
    btn.disabled = false;
  }
});
