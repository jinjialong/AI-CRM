# AI-CRM 上传 Git 说明

## 1. 目的

- 这份文档只负责说明：
  - 当前项目 Git 仓库是谁
  - 提交 Git 时默认怎么做
  - 推送到 GitHub 时默认怎么操作
- 不负责说明服务器部署。
- 如果要部署到线上服务器，请查看：
  - [AI-CRM-线上部署说明.md](C:/Users/Administrator/AI编程/AICRM/AI-CRM/docs/部署说明/AI-CRM-线上部署说明.md)

## 2. 本地项目路径

- 本地代码目录：`C:\Users\Administrator\AI编程\AICRM\AI-CRM`

## 3. Git 仓库约定

- 当前 Git 远程仓库：`https://github.com/jinjialong/AI-CRM.git`
- 远程名：`origin`
- 默认主分支：`main`

## 4. 当用户说“提交 git”时的默认执行口径

- 默认仓库就是：`origin -> https://github.com/jinjialong/AI-CRM.git`
- 默认不直接提交到 `main`
- 默认做法是：
  - 在当前工作分支上提交
  - 推送到 `origin` 对应分支
- 如果用户明确说：
  - `直接推 main`
  - `推到别的远程`
  - `新建分支再推`
  - `只提交某一个文件`
  再按新指令执行

## 5. 推荐提交流程

### 第一步：先看工作区

```powershell
git status --short
```

### 第二步：确认当前分支

```powershell
git branch --show-current
```

### 第三步：按用户要求决定提交范围

- 如果用户说“只提交一个文件”
  - 只 `git add` 那一个文件
- 如果用户说“把当前项目代码推上去”
  - 先确认哪些文件属于有效项目代码
  - 不要把明显的运行缓存、临时日志、构建垃圾一起提交

### 第四步：提交

```powershell
git add <文件或目录>
git commit -m "提交说明"
```

### 第五步：推送

```powershell
git push origin <当前分支名>
```

## 6. 推送完成后的核验方法

### 核验本地 HEAD

```powershell
git rev-parse HEAD
```

### 核验远程分支

```powershell
git ls-remote origin refs/heads/<当前分支名>
```

### 核验是否一致

- 如果本地 commit id 和远程分支指向的 commit id 一致
  - 说明代码已经推到云上 GitHub

## 7. 重要提醒

- “上传 Git” 不等于“部署到服务器”
- 推到 GitHub 成功，不代表线上宝塔服务器已经更新
- 如果用户同时说：
  - `上传 git`
  - `部署到宝塔`
  需要分两步执行：
  1. 先提交并推送到 GitHub
  2. 再按线上部署说明部署到服务器

## 8. 一句话规则

**Git 说明只负责把代码推到 GitHub；服务器部署是另一套流程，不要混在一起执行。**
