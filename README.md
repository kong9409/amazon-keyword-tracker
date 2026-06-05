# Amazon 关键词自然位/广告位监控工具｜GitHub + Zeabur 部署版

这个工具用于监控 Amazon 前台关键词下指定 ASIN 的：

- 自然位排名
- 广告位 / Sponsored 排名
- 当天价格
- BSR / 类目排名
- 评分 / 评论数
- 可选：通过 Sorftime MCP 补销量、类目数据
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

Zeabur 官方文档说明：项目根目录存在 `Dockerfile` 时会自动按 Docker 方式部署，并且需要暴露对应 `PORT`；GitHub 集成则是在授权后选择仓库部署。

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

可选变量：

```env
PORT=8787
HEADFUL=false
SORFTIME_COMMAND=
```

---

## 6. 飞书多维表字段

参考根目录：

```text
feishu_table_fields.csv
```

字段建议：

- 日期
- 站点
- 产品标签
- ASIN
- 关键词
- 自然是否上榜
- 自然页码
- 自然排名
- 广告是否上榜
- 广告页码
- 广告排名
- 价格
- 销量
- BSR
- 类目排名
- 评分
- 评论数
- 商品链接
- 搜索链接
- 抓取时间
- 备注

---

## 7. Sorftime MCP 对接方式

当前工具预留了 `SORFTIME_COMMAND`。你需要把 Sorftime MCP 查询封装成一个本地命令，让它接收 ASIN 和站点并返回 JSON。

期望返回格式示例：

```json
{
  "asin": "B0XXXXXXXXX",
  "price": 129.99,
  "sales": 120,
  "bsr": "#3456 in Tools & Home Improvement",
  "categoryRank": 3456,
  "rating": 4.6,
  "reviewCount": 88,
  "source": "sorftime"
}
```

---

## 8. 使用建议

1. 首次测试：1 个 ASIN + 1 个关键词 + 搜索深度 1 + 只下载 Excel。
2. 跑通后再打开“写入飞书”。
3. Amazon 前台可能出现验证码、风控、地区差异或广告实时变化，工具会记录备注；不要用它绕过验证码或访问限制。
4. 销量不是 Amazon 前台稳定公开字段，建议通过 Sorftime MCP 补齐。
