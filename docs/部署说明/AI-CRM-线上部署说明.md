# AI-CRM 线上部署说明

## 1. 部署结论

- 本项目线上部署目录固定为：`/home/ubuntu/apps/ai-crm`
- 不要部署到：`/www/wwwroot/*`
- 线上运行方式是：`PM2`
- 前端端口：`6100`
- 后端端口：`6101`
- 当前生产不是 Docker 运行，虽然仓库里有 `docker-compose.yml`，但线上实际启动方式不是 `docker compose up`

## 2. 本地项目路径

- 本地代码目录：`C:\Users\Administrator\AI编程\AICRM\AI-CRM`

## 3. 服务器信息

- 服务器 IP：`123.207.221.28`
- SSH 用户：`ubuntu`
- 系统：`Ubuntu 22.04`
- SSH 密码不要写进仓库，实际部署时由操作者临时提供

## 4. 线上运行结构

### 前端

- PM2 应用名：`ai-crm-frontend`
- 工作目录：`/home/ubuntu/apps/ai-crm/src/frontend`
- 启动命令：

```bash
npm start -- --hostname 0.0.0.0 --port 6100
```

- 构建时必须带：

```bash
NEXT_PUBLIC_API_BASE_URL=http://123.207.221.28:6101/api/v1
```

### 后端

- PM2 应用名：`ai-crm-backend`
- 工作目录：`/home/ubuntu/apps/ai-crm/src/backend`
- 启动命令：

```bash
bash -lc 'source .venv/bin/activate && exec uvicorn app.main:app --host 0.0.0.0 --port 6101'
```

- 后端环境变量由线上文件 `ecosystem.config.cjs` 注入

## 5. 绝对不要动的内容

- 不要动：`/www/wwwroot/yuze-cms`
- 不要动：`/www/wwwroot/ai-competitor-simple`
- 不要动：`/www/wwwroot/ai-competitor`
- 不要重启 PM2 应用：`time-album`
- 不要重启 PM2 应用：`yuze-cms-5000`
- 不要删除线上已有依赖目录：`.venv`、`node_modules`
- 不要删除线上业务数据目录：`/home/ubuntu/apps/ai-crm/src/backend/data`

## 6. 推荐部署原则

- 这套部署允许直接从本地工作树发布，不要求线上 `git pull`
- 只同步运行时代码，不同步：
  - `.git`
  - `node_modules`
  - `.next`
  - `.venv`
  - `logs`
  - `output`
  - `.playwright-cli`
  - `src/backend/data`
- 覆盖目标只允许是 `/home/ubuntu/apps/ai-crm`

## 7. 标准部署步骤

### 第一步：本地发布前校验

在本地项目目录执行：

```powershell
cd C:\Users\Administrator\AI编程\AICRM\AI-CRM
cd src\frontend
npm run build
cd ..\..
@'
import compileall, sys
ok = compileall.compile_dir("src/backend/app", quiet=1)
print("OK" if ok else "FAIL")
sys.exit(0 if ok else 1)
'@ | python -
```

### 第二步：上传代码到服务器

建议做法：

- 先把本地运行时代码打包成归档
- 上传到服务器，例如：`/home/ubuntu/ai-crm-deploy.tar.gz`
- 再解压覆盖到：`/home/ubuntu/apps/ai-crm`

如果要加备份，建议先执行：

```bash
mkdir -p /home/ubuntu/backups
tar -czf /home/ubuntu/backups/ai-crm-$(date +%Y%m%d-%H%M%S).tar.gz /home/ubuntu/apps/ai-crm
```

### 第三步：停止 AI-CRM 自己的 PM2 进程

```bash
pm2 stop ai-crm-frontend || true
pm2 stop ai-crm-backend || true
```

### 第四步：覆盖代码

```bash
mkdir -p /home/ubuntu/apps/ai-crm
tar -xzf /home/ubuntu/ai-crm-deploy.tar.gz -C /home/ubuntu/apps/ai-crm
rm -f /home/ubuntu/ai-crm-deploy.tar.gz
```

### 第五步：清理旧构建缓存

```bash
rm -rf /home/ubuntu/apps/ai-crm/src/frontend/.next
find /home/ubuntu/apps/ai-crm/src/backend -name '__pycache__' -type d -exec rm -rf {} +
find /home/ubuntu/apps/ai-crm/src/backend -name '*.pyc' -delete
```

### 第六步：重新构建前端

```bash
cd /home/ubuntu/apps/ai-crm/src/frontend
NEXT_PUBLIC_API_BASE_URL=http://123.207.221.28:6101/api/v1 npm run build
```

### 第七步：只重启 AI-CRM 这两个服务

```bash
pm2 startOrRestart /home/ubuntu/apps/ai-crm/ecosystem.config.cjs --update-env
pm2 save
```

## 8. 部署后验证

### 检查 PM2 状态

```bash
pm2 list | grep -E 'ai-crm-backend|ai-crm-frontend'
```

### 检查端口监听

```bash
ss -ltnp | grep -E ':6100|:6101'
```

### 检查前端

```bash
curl -I http://127.0.0.1:6100
```

预期：

- 返回 `307` 或 `200` 都可以，说明前端已经起来

### 检查后端

```bash
curl -s -o /dev/null -w 'openapi:%{http_code}\n' http://127.0.0.1:6101/openapi.json
```

预期：

- 返回 `openapi:200`

## 9. 线上部署口径总结

一句话版本：

- **AI-CRM 只部署到 `/home/ubuntu/apps/ai-crm`，只重启 `ai-crm-frontend` 和 `ai-crm-backend`，不要碰 `/www/wwwroot` 下面其他项目。**

## 10. 给后续代理的执行要求

- 先确认本地构建通过，再部署
- 只覆盖 `/home/ubuntu/apps/ai-crm`
- 不要擅自改端口，固定使用 `6100/6101`
- 不要切换到 Docker 部署
- 不要重启无关 PM2 应用
- 部署完成后必须跑端口和 HTTP 验证

