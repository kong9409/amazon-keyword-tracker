# Amazon 关键词自然位/广告位监控工具｜GitHub + Zeabur 部署版

这个工具用于监控 Amazon 前台关键词下指定 ASIN 的：

- 自然位排名
- 广告位 / Sponsored 排名
- 当天价格
- BSR / 类目排名
- 评分 / 评论数
- 通过 Sorftime MCP 补齐销量、销售额、类目、价格等字段
- 可选：写入飞书多维表
- 默认：导出 Excel

前台是一个 HTML 页面，后台使用隐藏浏览器抓取。用户打开 Zeabur 链接后，只会看到网页表单和进度条，不会看到浏览器抓取过程。

---

## 1. 支持站点

网页下拉框已内置：

| 站点 | 默认域名 | 默认邮编/地区 |
|---|---|---|
| US | https://www.amazon.com | 10001 / New York |
| CA | https://www.amazon.ca | M5V 2T6 / Toronto |
| UK | https://www.amazon.co.uk | SW1A 1AA / London |
| DE | https://www.amazon.de | 10115 / Berlin |
| FR | https://www.amazon.fr | 75001 / Paris |
| IT | https://www.amazon.it | 00118 / Rome |
| ES | https://www.amazon.es | 28001 / Madrid |
| JP | https://www.amazon.co.jp | 100-0001 / Tokyo |
| AU | https://www.amazon.com.au | 2000 / Sydney |

域名和邮编都可以在网页里手动修改。

---

## 2. 本地运行

```bash
npm install
npm start
```

打开：

```text
http://localhost:8787
```

本地 Windows 也可以双击：

```text
start_windows.bat
```

注意：不要直接双击 `public/index.html`，因为它需要后端接口。

---

## 3. 上传到 GitHub

### 方法 A：网页上传

1. GitHub 新建仓库，例如：`amazon-keyword-tracker`
2. 把本工具包解压后的所有文件上传到仓库根目录
3. 不要上传 `.env`、`output/`、`uploads/`、`node_modules/`
4. 提交即可

### 方法 B：命令行上传

```bash
git init
git add .
git commit -m "init amazon keyword tracker"
git branch -M main
git remote add origin https://github.com/你的用户名/amazon-keyword-tracker.git
git push -u origin main
```

---

## 4. 部署到 Zeabur

这个包已经带 `Dockerfile`。Zeabur 检测到根目录有 Dockerfile 时，会使用 Dockerfile 部署；Dockerfile 里使用了 Playwright 官方镜像，里面自带 Chromium，所以不用再手动下载浏览器。

部署步骤：

1. 打开 Zeabur
2. `Add Service` → `GitHub`
3. 授权 GitHub App
4. 选择刚才的仓库
5. 等待自动部署
6. 在服务里绑定域名或使用 Zeabur 默认域名
7. 打开链接即可使用

---

## 5. Zeabur 环境变量

如果只下载 Excel，暂时不需要配置飞书变量。

如果要写入飞书，进入 Zeabur 服务的 Variables / Environment Variables，添加：

```env
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
FEISHU_APP_TOKEN=basexxxxxxxxxxxxxxxx
FEISHU_TABLE_ID=tblxxxxxxxxxxxxxxxx
FEISHU_OPEN_BASE=https://open.feishu.cn
```

如果要调用 Sorftime MCP，添加下面两种方式之一。推荐方式 A：

```env
# 方式 A：完整 MCP URL
SORFTIME_MCP_URL=https://mcp.sorftime.com?key=你的SorftimeKey
```

或者：

```env
# 方式 B：只填 KEY，工具自动拼接 URL
SORFTIME_MCP_KEY=你的SorftimeKey
```

其他可选变量：

```env
PORT=8787
HEADFUL=false
```

重要：不要把真实 Sorftime Key、飞书 App Secret 写入 GitHub。只放到 Zeabur Variables 或本地 `.env`。

---

## 6. 飞书多维表字段

参考根目录：

```text
feishu_table_fields.csv
```

本版已新增 Sorftime 字段：

- 货币
- 日销量
- 周销量
- 月销量
- 月销售额
- 类目名称
- Sorftime工具
- Sorftime原始摘要

如果你不想保留原始摘要，可以在飞书表里不建 `Sorftime原始摘要` 字段，或者在后续版本里删除对应映射。

---

## 7. Sorftime MCP 对接逻辑

点击页面里的“调用 Sorftime MCP 补销量/类目数据”后，工具会：

1. 使用 `SORFTIME_MCP_URL` 或 `SORFTIME_MCP_KEY` 连接 Sorftime MCP。
2. 自动执行 MCP `initialize`。
3. 自动读取 `tools/list`。
4. 从 MCP 工具列表里自动选择最像“ASIN / Product / Sales / Price / Rank / BSR”的工具。
5. 根据工具 inputSchema 自动填入 `asin`、`marketplace`、`domain`、`locale` 等参数。
6. 把返回结果归一化成 Excel / 飞书字段。

由于 Sorftime MCP 返回字段可能会随着工具版本变化，本工具保留了 `Sorftime原始摘要`，方便你确认返回字段并继续微调映射。

---

## 8. 使用建议

1. 首次测试：1 个 ASIN + 1 个关键词 + 搜索深度 1 + 只下载 Excel。
2. 勾选“调用 Sorftime MCP 补销量/类目数据”。
3. 如果 Excel 里 `Sorftime工具` 有值，说明 MCP 已经调用成功。
4. 跑通后再打开“写入飞书”。
5. Amazon 前台可能出现验证码、风控、地区差异或广告实时变化，工具会记录备注；不要用它绕过验证码或访问限制。
