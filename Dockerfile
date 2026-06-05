# Zeabur Docker 部署版
# 使用 Playwright 官方镜像，镜像内已包含 Chromium 及运行依赖，避免部署时重复下载浏览器导致长时间卡在“部署中”。
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    DISABLE_DAILY_CRON=true

COPY package.json .npmrc ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund

COPY . .
RUN mkdir -p output uploads

EXPOSE 8787

CMD ["node", "src/server.js"]
