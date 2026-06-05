import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

export async function querySorftimeMetrics({ asin, marketplace }) {
  const command = process.env.SORFTIME_COMMAND;
  if (!command) return null;
  const parts = command.split(' ').filter(Boolean);
  const bin = parts.shift();
  const args = [...parts, '--asin', asin, '--site', marketplace?.name || 'Amazon US'];
  try {
    const { stdout } = await execFileAsync(bin, args, { timeout: 45000, maxBuffer: 1024 * 1024 });
    const data = JSON.parse(stdout.trim());
    return {
      price: data.price ?? null,
      sales: data.sales ?? data.monthlySales ?? data.dailySales ?? null,
      bsr: data.bsr ?? data.rankText ?? '',
      categoryRank: data.categoryRank ?? data.bsrNumber ?? null,
      rating: data.rating ?? null,
      reviewCount: data.reviewCount ?? data.reviews ?? null,
      source: 'sorftime_mcp'
    };
  } catch (e) {
    return { note: `Sorftime MCP 调用失败：${e.message}`, source: 'amazon_frontend' };
  }
}
