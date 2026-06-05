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

## 3. 说明边界

- 本文档只负责说明：**如何把 AI-CRM 部署到线上服务器**
- 不负责说明：
  - Git 仓库提交策略
  - 分支命名
  - 推送到 GitHub 的规则
- Git 相关内容请查看：
  - [AI-CRM-上传Git说明.md](C:/Users/Administrator/AI编程/AICRM/AI-CRM/docs/部署说明/AI-CRM-上传Git说明.md)

## 4. 服务器与面板信息

### SSH

- 服务器公网 IPv4：`123.207.221.28`
- SSH 用户：`ubuntu`
- SSH 端口：`22`
- SSH 密码：`123456.Jjl`
- SSH 连接命令：`ssh ubuntu@123.207.221.28 -p 22`
- 系统：`Ubuntu 22.04.5 LTS`

### 宝塔面板

- 宝塔已安装，目录：`/www/server/panel`
- 宝塔外网面板地址：`https://123.207.221.28:14082/9655c3f0`
- 宝塔内网面板地址：`https://10.0.0.11:14082/9655c3f0`
- 宝塔面板端口：`14082`
- 宝塔面板用户名：`t8dq34fa`
- 宝塔面板密码：当前没有从服务器直接取到明文；如果遗失，登录服务器后执行 `bt 5` 重置
- 宝塔面板当前未绑定独立域名，默认按 `IP + 端口 + 安全入口路径` 访问

### 相关端口

- SSH：`22`
- 宝塔面板：`14082`
- Nginx：`80`
- AI-CRM 前端：`6100`
- AI-CRM 后端：`6101`
- 服务器当前还监听 `888`，但当前确认的宝塔面板入口不是 `888`

### 敏感信息提醒

- 本文档包含敏感登录信息，只适合保存在私有环境
- 如果要推送到 GitHub 或发给第三方，先删除或替换账号、密码、面板入口路径

## 5. 线上运行结构

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

## 6. 当用户说“部署到宝塔”时的默认执行口径

- 这里的“部署到宝塔”默认指的是：
  - 把当前项目部署到服务器 `123.207.221.28`
  - 覆盖目录：`/home/ubuntu/apps/ai-crm`
  - 重启 PM2 应用：`ai-crm-frontend`、`ai-crm-backend`
- 不是把项目发布到 `/www/wwwroot/` 站点目录
- 不是切换成 Docker 部署
- 不是重启别的项目

## 7. 绝对不要动的内容

- 不要动：`/www/wwwroot/yuze-cms`
- 不要动：`/www/wwwroot/ai-competitor-simple`
- 不要动：`/www/wwwroot/ai-competitor`
- 不要重启 PM2 应用：`time-album`
- 不要重启 PM2 应用：`yuze-cms-5000`
- 不要删除线上已有依赖目录：`.venv`、`node_modules`
- 不要删除线上业务数据目录：`/home/ubuntu/apps/ai-crm/src/backend/data`

## 8. 推荐部署原则

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

## 9. 标准部署步骤

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

## 10. 部署后验证

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

## 11. 线上部署口径总结

一句话版本：

- **AI-CRM 只部署到 `/home/ubuntu/apps/ai-crm`，只重启 `ai-crm-frontend` 和 `ai-crm-backend`，不要碰 `/www/wwwroot` 下面其他项目。**

## 12. 给后续代理的执行要求

- 先确认本地构建通过，再部署
- 只覆盖 `/home/ubuntu/apps/ai-crm`
- 不要擅自改端口，固定使用 `6100/6101`
- 不要切换到 Docker 部署
- 不要重启无关 PM2 应用
- 部署完成后必须跑端口和 HTTP 验证
