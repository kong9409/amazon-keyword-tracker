# Zeabur 部署卡住修复说明

如果 Zeabur 一直显示“部署中”，优先检查：

1. GitHub 仓库根目录必须直接有 `Dockerfile`、`package.json`、`src/`、`public/`，不要再套一层文件夹。
2. 不要上传 `.env`、`node_modules/`、`output/`、`uploads/`。
3. 这版已移除 `package-lock.json`，避免 lock 文件里残留本地/私有 npm 源导致 Zeabur 拉包失败。
4. Dockerfile 已改为 Playwright 官方镜像 + `npm install --ignore-scripts`，避免部署时重复下载 Chromium。
5. Zeabur 环境变量里只需要填业务密钥，例如：
   - `SORFTIME_MCP_URL`
   - `FEISHU_APP_ID`
   - `FEISHU_APP_SECRET`
   - `FEISHU_APP_TOKEN`
   - `FEISHU_TABLE_ID`

服务启动成功后，访问：

```text
https://你的-zeabur-域名/api/health
```

看到 `ok: true` 就说明后端已经起来。
