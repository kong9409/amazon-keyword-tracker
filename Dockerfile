# Zeabur Docker 部署版 - no .npmrc required
# 使用 Playwright 官方镜像，镜像内已包含 Chromium 及运行依赖，避免部署时重复下载浏览器导致长时间卡在“部署中”。
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    DISABLE_DAILY_CRON=true \
    NPM_CONFIG_REGISTRY=https://registry.npmjs.org/

# 注意：不要 COPY .npmrc。很多人在 GitHub 网页上传时会漏掉隐藏文件，Zeabur 构建会直接报 /.npmrc not found。
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org/

COPY . .
RUN mkdir -p output uploads

EXPOSE 8787

CMD ["node", "src/server.js"]
