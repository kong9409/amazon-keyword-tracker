# Zeabur /.npmrc not found 修复说明

如果 Zeabur 报错：

```text
failed to calculate checksum ... "/.npmrc": not found
```

原因是旧版 Dockerfile 写了：

```dockerfile
COPY package.json .npmrc ./
```

但 GitHub 仓库根目录没有 `.npmrc`，Docker 构建会在 COPY 阶段直接失败。

本版已经修复：

```dockerfile
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org/
```

所以不再需要上传 `.npmrc`。

## 部署操作

1. 删除 GitHub 仓库旧文件，或至少覆盖根目录 `Dockerfile`。
2. 确认 GitHub 根目录有：
   - Dockerfile
   - package.json
   - src/
   - public/
   - templates/
3. Zeabur 里点击 Redeploy，最好选择 Clear Cache / No Cache 重新部署。
4. 部署成功后打开：

```text
https://你的-zeabur-域名/api/health
```

看到 `{"ok":true}` 就说明服务启动正常。
