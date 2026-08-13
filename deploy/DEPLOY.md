# 客户服务申请系统 - 部署文档

> 适用版本：2026-08-12（邮件驱动架构 · 前后端分离 · 凭证全部环境变量化）

---

## 1. 系统架构

```
┌─────────────── 公网服务器 A ───────────────┐
│  Nginx :80/443 (HTTPS)                     │
│    ├─ /        → 前端静态页面 (dist)         │
│    └─ /api/*   → relay :3003 (反代)         │
│  relay 容器 :3003（发信中继，无状态零存储）  │
└───────────────┬────────────────────────────┘
                │ SMTP (c3.icoremail.net:465)
                ▼
          cz@coremail.cc（中转邮箱，自发自收）
                ▲
                │ IMAP (c3.icoremail.net:993)
┌───────────────┴────────────────────────────┐
│  公司内网服务器 B (Docker)                  │
│  ├─ mysql:8 容器（数据卷持久化）            │
│  └─ backend 容器 :3002                     │
│       ├─ 入站监控（拉取 cz 中转邮箱）        │
│       ├─ 回件监控（400cz SMTP/IMAP）        │
│       ├─ 补偿/超时/健康检查定时任务          │
│       └─ 管理后台托管 (dist-admin)          │
│  同事访问 http://内网B/admin                │
└────────────────────────────────────────────┘
```

**安全边界**：公网只暴露前端表单页 + relay（仅能发信到中转邮箱）；客户名单、代理商档案、申请附件全部留在内网。

---

## 2. 前置条件

| 项 | 要求 |
|----|------|
| 公网服务器 A | Linux（Ubuntu 20.04+），Docker + Docker Compose，可解析域名 |
| 内网服务器 B | Linux，Docker + Docker Compose，内网可达 |
| 域名 | 如 `apply.company.com` → A 服务器（HTTPS 需要）|
| 邮箱 | cz@coremail.cc（中转）、400cz@icoremail.cn（对外收发），均已有 |
| 开发机数据 | 现有 MySQL（19535 客户/176 代理商）与 uploads 目录 |

---

## 3. 需要上传的文件清单

### 3.1 两台服务器都要传（整个项目源码，用于 Docker 构建镜像）

把整个项目文件夹 `CzAuto` 压缩后传到两台服务器的同一位置（如 `/opt/cz/`）并解压：

```
CzAuto/                          ← 项目根目录（整个文件夹都要）
├── client-service-app/          ← 前后端源码（核心）
│   ├── src/                     ← 前端 + 后端所有代码
│   ├── relay-server/            ← relay 发信中继代码
│   ├── server/templates/        ← 18 个申请书模板（.doc）
│   ├── public/                  ← 前端静态资源（含模板副本）
│   ├── package.json             ← 依赖清单
│   └── pnpm-lock.yaml           ← 依赖锁定文件
├── react-hook-form/             ← 本地依赖库（必须带上，否则构建失败）
└── deploy/                      ← 部署配置（Docker 文件都在这）
```

> 上传方式：`scp -r CzAuto 用户@服务器IP:/opt/cz/`（或 zip 压缩后上传解压；若代码在 git 仓库则直接 clone）

### 3.2 内网服务器 B 额外需要的文件（数据迁移）

| 文件 | 来源 | 说明 |
|------|------|------|
| `client_service.sql` | 开发机导出 | MySQL 数据（客户 19535 / 代理商 176 / 申请 67）|
| `uploads/` 目录 | 开发机 | 已上传的申请附件（营业执照/申请书等）|

### 3.3 部署后各服务器实际使用的文件（deploy/ 内）

**内网服务器 B**（运行 `compose.internal.yml`）：

```
deploy/
├── compose.internal.yml    ← Docker 编排：mysql + backend
├── Dockerfile              ← 构建镜像的配方
├── .env                    ← 配置（密码、邮箱等），由 .env.example 复制后填写
└── .env.example            ← 配置模板
```

**公网服务器 A**（运行 `compose.public.yml`）：

```
deploy/
├── compose.public.yml      ← Docker 编排：relay + nginx
├── Dockerfile              ← 构建镜像的配方（同一文件）
├── .env                    ← 配置（中转邮箱凭证等），由 .env.example 复制后填写
└── .env.example            ← 配置模板
```

> ⚠️ 两台服务器的 `.env` 内容不同：内网 B 填后端全套凭证（SMTP/IMAP/INBOUND/DB），公网 A 只填 relay 的 RELAY_* 凭证。

---

## 4. 配置文件清单（deploy/ 目录）

| 文件 | 用途 | 部署位置 |
|------|------|---------|
| `Dockerfile` | 多阶段镜像（build / backend / relay / web）| 两服务器共用 |
| `compose.internal.yml` | 内网编排（mysql + backend）| 内网服务器 B |
| `compose.public.yml` | 公网编排（relay + nginx）| 公网服务器 A |
| `nginx/public.conf` | 公网 nginx（静态页 + /api 反代 relay）| 打入 web 镜像 |
| `nginx/internal.conf` | 内网 nginx（可选，反代 backend + 管理后台）| 打入 internal-web 镜像 |
| `.env.example` | 全部环境变量样例 | 两服务器各复制为 .env |

---

## 5. 环境变量说明

### 5.1 公共（后端必需，缺失启动即报错）

| 变量 | 说明 | 示例 |
|------|------|------|
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASS` / `DB_NAME` | MySQL 连接 | mysql / 3306 / root / <强密码> / client_service |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | 400cz 发信 | 115.236.118.131 / 465 / 400cz@icoremail.cn / ... |
| `IMAP_HOST` / `IMAP_PORT` / `IMAP_USER` / `IMAP_PASS` | 400cz 回件监控 | 115.236.118.131 / 993 / 400cz@icoremail.cn / ... |
| `INBOUND_IMAP_HOST` / `INBOUND_IMAP_USER` / `INBOUND_IMAP_PASS` | 中转邮箱拉取 | c3.icoremail.net / cz@coremail.cc / ... |
| `INBOUND_ALLOWED_SENDERS` | 入站发件人白名单（逗号分隔）| cz@coremail.cc |
| `SUPPORT_EMAIL` | 售后通知收件人 | support@coremail.cn |
| `FALLBACK_EMAIL` | 未匹配代理商兜底邮箱 | 400cz@icoremail.cn |

### 5.2 可选

| 变量 | 说明 |
|------|------|
| `ALLOWED_ORIGINS` | 后端 CORS 白名单（逗号分隔）|
| `PORT` | 后端端口（默认 3002）|
| `SSL_CERT`+`SSL_KEY` 或 `SSL_PFX`+`SSL_PASS` | 后端直启 HTTPS（Docker 场景建议由 Nginx 终止 TLS，不必配）|
| `UPLOADS_DIR` | 附件目录（默认 /app/uploads）|
| `CLEAN_INTERVAL` | 附件清理周期毫秒（默认 86400000 = 每天 1 次）|
| `CLEAN_EXPIRED_ENABLED` | 清理"已完成申请"的超期附件（默认 true）|
| `CLEAN_EXPIRED_DAYS` | 已完成申请附件保留天数（默认 1 天）|
| `CLEAN_MAX_PER_RUN` | 单次最多清理文件数（默认 500，防误删风暴）|

### 5.3 relay（公网）

| 变量 | 说明 | 示例 |
|------|------|------|
| `RELAY_SMTP_HOST/PORT/USER/PASS` | 中转邮箱发信 | c3.icoremail.net / 465 / cz@coremail.cc / ... |
| `RELAY_TO` | 中转邮箱收件地址（自发自收）| cz@coremail.cc |
| `RELAY_SMTP_FROM` | 发件人显示名 | "客户服务申请系统" <cz@coremail.cc> |
| `RELAY_ALLOWED_ORIGINS` | relay CORS 白名单 | https://apply.company.com |
| `RELAY_MAX_PER_MIN` | 每分钟限流（默认 5，公网建议 20）| 20 |
| `RELAY_PORT` | relay 端口（默认 3003）| 3003 |

> ⚠️ 密码含特殊字符（如 `$Abc@123&x,:`）：.env 中**必须用单引号包裹**，且注意 `$` 不要被 shell 展开。

---

## 6. 部署步骤

### 6.1 构建准备（一次性）

在两台服务器上：

```bash
git clone <仓库地址> /opt/cz
# 或直接 scp 整个项目目录
cd /opt/cz
```

### 6.2 内网服务器 B（后端 + 数据库）

```bash
cd /opt/cz/deploy
cp .env.example .env        # 编辑：DB_PASS 改强密码，其余按 4.1 填写

docker compose -f compose.internal.yml up -d --build
docker compose -f compose.internal.yml ps    # 确认 mysql/backend healthy
```

**数据迁移**（首次部署）：

```bash
# 开发机：导出
mysqldump -uroot client_service > client_service.sql
# 内网 B：导入容器 MySQL
docker exec -i cz-mysql mysql -uroot -p<DB_PASS> client_service < client_service.sql
# 开发机：上传附件
scp -r uploads/* 内网B:/opt/cz/deploy/data/uploads/
```

**验证**：

```bash
curl http://localhost:3002/health        # {"status":"ok"}
# 浏览器：http://内网B_IP:3002/admin（管理后台）
```

### 6.3 公网服务器 A（前端 + relay）

```bash
cd /opt/cz/deploy
cp .env.example .env        # 编辑：RELAY_* 填中转邮箱配置

docker compose -f compose.public.yml up -d --build
docker compose -f compose.public.yml ps
```

**HTTPS（Let's Encrypt）**：

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d apply.company.com
echo "0 3 * * * certbot renew --quiet" | crontab -
```

**验证**：

```bash
curl -k https://apply.company.com          # 前端页面
curl -k https://apply.company.com/api/validate-domain -X POST -d '{"domain":"example.com"}'
```

### 6.4 CORS 白名单同步（切换域名后必做）

公网 nginx 终止 TLS 后，前端 Origin 变为 `https://apply.company.com`：

- 内网 B 的 `.env`：`ALLOWED_ORIGINS=https://apply.company.com,http://内网B_IP`
- 公网 A 的 `.env`：`RELAY_ALLOWED_ORIGINS=https://apply.company.com`
- 修改后重启对应服务

---

## 7. 上线前检查清单

| # | 项 | 状态 |
|---|-----|------|
| 1 | 邮件【测试】横幅移除（emailService.ts / emailMonitor.ts）| ⬜ |
| 2 | 管理后台登录认证（建议）| ⬜ |
| 3 | 生产 SMTP/IMAP 凭证正确配置于 .env | ⬜ |
| 4 | INBOUND_ALLOWED_SENDERS 只含 cz@coremail.cc | ⬜ |
| 5 | 中转邮箱：客户端专用密码 + 禁网页登录（IT 侧）| ⬜ |
| 6 | 公网域名 HTTPS 生效 | ⬜ |
| 7 | 数据迁移完成（客户/代理商/申请/uploads）| ⬜ |
| 8 | 端到端回归：提交→入库→服务商→回件→售后 | ⬜ |
| 9 | 管理后台回归：CSV 导出/重发/人工干预/导入 | ⬜ |
| 10 | 观察 1-2 天：健康检查/补偿任务/超时提醒日志 | ⬜ |

---

## 8. 运维手册

### 8.1 日常操作

```bash
# 查看状态
docker compose -f compose.internal.yml ps
docker compose -f compose.public.yml ps

# 查看日志
docker logs -f cz-backend --tail 100
docker logs -f cz-relay --tail 100

# 重启
docker compose -f compose.internal.yml restart backend
docker compose -f compose.public.yml restart relay

# 更新部署
git pull && docker compose -f compose.internal.yml up -d --build
```

### 8.2 数据备份（建议 cron）

```bash
# 每日 2:00 备份数据库
0 2 * * * docker exec cz-mysql mysqldump -uroot -p<DB_PASS> client_service | gzip > /backup/cz_$(date +\%Y\%m\%d).sql.gz
# 附件目录
0 3 * * * tar czf /backup/uploads_$(date +\%Y\%m\%d).tar.gz /opt/cz/deploy/data/uploads
```

### 8.3 故障排查速查

| 症状 | 排查点 |
|------|--------|
| 前端提交失败 | relay 日志、cz 邮箱是否收到、relay 限流（429）|
| 申请不入库 | backend 日志入站监控、INBOUND_IMAP 配置、发件人白名单 |
| 服务商没收到验证邮件 | backend 日志 SMTP 发送、email_logs 状态、补偿任务 |
| 售后没收到通知 | 回件监控日志、回件发件人校验（unmatched_replies 表）|
| 管理后台打不开 | CORS 白名单（ALLOWED_ORIGINS）、Nginx 配置 |

---

## 9. 安全说明

- **凭证零硬编码**：代码中无任何明文密码，缺失配置启动即报错
- **中转邮箱**：建议 IT 配置"仅客户端专用密码 + 禁用网页登录"
- **入站白名单**：仅接受 cz@coremail.cc 发来的申请邮件
- **回件校验**：服务商回复必须来自原收件人地址，否则记录 unmatched_replies
- **管理后台**：仅内网可达；如需外网访问必须先加登录认证
- **备份**：数据库每日 + 附件定期，异地保存
