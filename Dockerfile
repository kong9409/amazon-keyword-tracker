FROM mcr.microsoft.com/playwright:v1.56.1-jammy

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    DISABLE_DAILY_CRON=false

COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p output uploads

EXPOSE 8787
CMD ["npm", "start"]
