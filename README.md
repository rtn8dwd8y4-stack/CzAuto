# CzAuto - 客户服务申请系统

> **仓库地址**：https://github.com/rtn8dwd8y4-stack/CzAuto （私有仓库，需协作者授权访问）

邮件驱动的客户服务申请自动化系统：客户在公网提交服务申请，系统自动完成**提交 → 邮件中转 → 域名校验 → 服务商身份验证 → 售后通知**的完整闭环。

## 核心设计

**邮件即数据通道**：前端与后端不直接通信，数据通过"中转邮箱"以标准格式邮件传递。

```
公网（零敏感数据）                 内网（隔离）
┌──────────────────────┐        ┌──────────────────────┐
│ 客户浏览器             │        │ 后端（Express）        │
│   ↓                   │        │  ├─ 入站监控（拉中转）  │
│ 前端表单页（静态）      │        │  ├─ 回件监控（400cz）  │
│   ↓                   │        │  ├─ 补偿/超时/清理任务  │
│ relay 发信中继（无状态）│        │  ├─ 管理后台           │
└──────────┬───────────┘        │  └─ MySQL              │
           │ SMTP                └──────────┬───────────┘
           ▼                                ▲
     cz@coremail.cc（中转邮箱，自发自收）──IMAP──┘
```

**安全边界**：公网只暴露前端表单 + relay（仅能发信到中转邮箱）；客户名单、代理商档案、申请附件全部留在内网。

## 功能特性

### 客户端（申请表单）
- 9 种服务类型：重置管理员密码 / 更改域名 / 绑定多域名 / 绑定域别名 / 解绑多域名 / 解绑域别名 / 更改公司名称 / 删除组织配置 / 解绑二次验证
- 向导式三步提交（基本信息 → 身份验证 → 确认）
- 动态字段按服务类型展示，附件上传（申请书/免责声明/营业执照或身份证）
- 模板下载（盈世/论客双版本）
- 提交即清空，前端零存储

### 管理后台（内网）
- 申请列表：状态/验证/邮件三维度标签 + 筛选 + CSV 导出（带条件弹窗）
- 申请详情：附件预览、邮件日志（失败可一键重发）、服务商回复原文
- 客户名单 / 代理商 / 白名单管理（CRUD + xlsx 批量导入）
- 系统健康状态栏（监控实时状态）

### 核心机制
- **邮件标准协议**：主题含 RHF 编号，正文定界 JSON 块，附件随邮件
- **安全防线**：发件人白名单、格式校验、回件发件人校验、限流、CORS 白名单
- **回复判定**：正则模式 + 否定词反转 + 冲突仲裁 + 疑问句识别（30+ 测试用例）
- **可靠性**：发送重试（指数退避）、补偿任务、手动重发、超时提醒、入站崩溃恢复（自动重试+告警）
- **附件管理**：每日清理（孤儿/空文件/已完成超期附件）
- **运维**：进程守护（watchdog）、健康检查、一键启动

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 / MUI / React Hook Form / Vite |
| 后端 | Express 5 / TypeScript |
| 数据库 | MySQL 8 |
| 邮件 | nodemailer（SMTP）/ imapflow（IMAP）/ mailparser |
| 部署 | Docker / Docker Compose / Nginx |

## 目录结构

```
CzAuto/
├── client-service-app/          # 前后端全部源码
│   ├── src/
│   │   ├── pages/apply/         # 前端表单页
│   │   ├── pages/admin/         # 管理后台（独立入口 admin.html）
│   │   └── server/              # 后端（Express）
│   ├── relay-server/            # 公网发信中继（独立服务）
│   ├── server/templates/        # 申请书模板（.doc）
│   ├── public/templates/        # 模板副本（前端静态）
│   ├── scripts/                 # 本地运维脚本（start-all / watchdog）
│   └── .env.example             # 环境变量模板
├── react-hook-form/             # 本地依赖库（fork 自官方，构建必需，见下方说明）
└── deploy/                      # 部署配置（Dockerfile / compose / 文档）
```

## 快速开始（本地开发）

### 前置

- Node.js 20+ / pnpm
- MySQL 8（本地或远程）

### ⚠️ 重要：react-hook-form 本地依赖（构建前必须放置）

本项目使用 **fork 自 react-hook-form 官方仓库的本地依赖**（`package.json` 中声明为 `"react-hook-form": "file:..\react-hook-form"`）。该目录**未上传到 GitHub**（体积大且含自身 .git），需要你手动获取：

**获取方式（任选其一）**：

```bash
# 方式 A：从本机其他位置复制（如果已有）
#   将你本地的 react-hook-form 目录复制到项目根：
#   CzAuto/
#   ├── client-service-app/
#   ├── react-hook-form/     ← 放到这里，与 client-service-app 平级
#   └── deploy/

# 方式 B：从 GitHub fork 官方仓库（标准做法）
cd CzAuto
git clone https://github.com/react-hook-form/react-hook-form.git react-hook-form
# ⚠️ 注意：如果项目依赖了 fork 中的自定义修改，此方式得到的是官方原版，
#    可能缺少项目所需的改动，请确认与开发机上的版本一致

# 方式 C：压缩包传输（推荐，保证与开发环境一致）
#   1. 在开发机上把 react-hook-form 目录压缩（zip，排除 node_modules/.git）
#   2. 传到新环境解压到 CzAuto/react-hook-form/
```

**放置后的目录结构**：

```
CzAuto/
├── client-service-app/     ← 前端 + 后端（在此目录执行 pnpm install）
├── react-hook-form/        ← 本地依赖（与 client-service-app 平级，必须是这个名字）
└── deploy/
```

**验证**：`pnpm install` 时如果报错找不到 `file:..\react-hook-form`，说明目录未放置或路径不对——检查 `react-hook-form/package.json` 是否存在即可。

> **为什么这样做**：项目 fork 了 react-hook-form 并做定制（配合 React 19 使用），无法直接使用 npm 官方包。因此它作为本地依赖存在于仓库外，部署时需手动放置（Docker 构建同理，见 DEPLOY.md）。

### 步骤

```bash
# 1. 安装依赖
cd client-service-app
pnpm install

# 2. 配置环境变量
copy .env.example .env    # 填入真实凭证（SMTP/IMAP/DB 等）

# 3. 启动三服务（前端 3001 / 后端 3002 / relay 3003）
powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1
# 或手动：
pnpm dev          # 前端
pnpm server       # 后端（需先设置 .env 对应环境变量）
npx tsx relay-server/index.ts  # relay
```

### 访问

| 服务 | 地址 |
|------|------|
| 前端表单 | http://localhost:3001 |
| 管理后台 | http://localhost:3002/admin |
| relay | http://localhost:3003 |

## CORS 白名单同步

### 功能说明

CORS（Cross-Origin Resource Sharing，跨域资源共享）是浏览器实施的安全策略：**网页只能调用与自身"同源"（协议+域名+端口一致）的接口**，跨源调用时，目标服务器必须通过 `Access-Control-Allow-Origin` 响应头显式授权。

本系统采用前后端分离 + 双服务器部署（公网前端 / 内网后端），所有跨源调用都依赖 CORS 白名单放行：

| 位置 | 服务端 | 受保护的跨源调用 | 配置项 |
|------|--------|------------------|--------|
| 内网后端 | Express | 管理后台页面（:3002）→ 后端 API（`/api/*`）| `ALLOWED_ORIGINS` |
| 公网 relay | Express | 公网表单页（:3001 / 正式域名）→ relay（`/api/submit` 等）| `RELAY_ALLOWED_ORIGINS` |

**拦截行为**：请求携带的 `Origin` 头不在白名单时，后端返回 `403`，浏览器拒绝读取响应——表现即"页面能打开但数据加载失败"。

### 为什么需要"同步"

白名单是**按访问地址（Origin）精确匹配**的静态配置。系统访问入口会随环境变化：

| 环境 | 前端 Origin | 需写入的位置 |
|------|-------------|-------------|
| 本地开发 | `http://localhost:3001` | 后端 `ALLOWED_ORIGINS` |
| 局域网管理后台 | `http://<内网IP>:3002` | 后端 `ALLOWED_ORIGINS` |
| 公网正式部署 | `https://apply.company.com` | 后端 + relay 的 `ALLOWED_ORIGINS` / `RELAY_ALLOWED_ORIGINS` |
| 隧道临时测试（ngrok）| `https://*.ngrok-free.dev` | 后端 + relay 白名单（域名每次重启会变，需重配）|

**任何一次访问入口变化，都必须同步更新对应白名单**，否则该入口立即失效。这是部署切换（本地 → 内网 → 公网）中最常见的坑之一。

### 配置方式

```bash
# 内网后端 .env（逗号分隔多个 Origin）
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:3002,http://192.168.1.100:3002,https://apply.company.com

# 公网 relay .env
RELAY_ALLOWED_ORIGINS=http://localhost:3001,https://apply.company.com
```

> 同源调用（如内网管理后台直接访问后端自身）不受 CORS 限制；未携带 `Origin` 的请求（如 curl、服务端调用）默认放行，不参与白名单校验。

### 故障排查

浏览器控制台出现以下任一信息 → 白名单未包含当前访问地址：

- `Access to fetch at ... from origin 'http://xxx' has been blocked by CORS policy`
- 响应为 `403` 且 body 含 `Not allowed by CORS`

**处理**：将报错中的 Origin 值加入对应 `.env` 白名单 → 重启服务生效。

## 部署

完整部署文档见 [deploy/DEPLOY.md](deploy/DEPLOY.md)。

- **公网服务器**：`docker compose -f deploy/compose.public.yml up -d`（前端 + relay）
- **内网服务器**：`docker compose -f deploy/compose.internal.yml up -d`（MySQL + 后端）
- 详细步骤、数据迁移、HTTPS、运维手册均在部署文档中

## 配置说明

所有凭证通过环境变量注入（`.env`），代码中零硬编码。缺失配置启动即报错并列出缺失项。

关键变量见 `client-service-app/.env.example` 与 `deploy/.env.example`。

## 安全说明

- 凭证零硬编码，`.env` 已被 git 忽略
- 中转邮箱建议 IT 配置"仅客户端专用密码 + 禁用网页登录"
- 入站白名单：仅接受中转邮箱发来的申请
- 回件校验：服务商回复必须来自原收件人
- 管理后台仅内网可达

## License

MIT
