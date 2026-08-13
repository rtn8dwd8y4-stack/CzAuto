FROM node:20-alpine AS build

WORKDIR /app

# 复制包管理文件
COPY client-service-app/package.json client-service-app/pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install

# 复制源码（react-hook-form 为本地依赖，需放在 /react-hook-form）
COPY client-service-app/ .
COPY react-hook-form ../react-hook-form

# 构建前端（public + admin 双目标，同时执行 tsc 类型检查）
RUN pnpm build:public && pnpm build:admin

# ---- 后端镜像（内网）----
FROM node:20-alpine AS backend

WORKDIR /app

# 复制依赖 + 源码 + 管理后台产物
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/src ./src
COPY --from=build /app/server ./server
COPY --from=build /app/dist-admin ./dist-admin
RUN mkdir -p uploads

# 环境变量默认值（生产必须用 docker-compose 环境变量覆盖）
ENV PORT=3002
ENV DB_HOST=mysql
ENV DB_USER=root
ENV DB_PASS=root123456
ENV DB_NAME=client_service

EXPOSE 3002

# 启动后端（含入站监控/回件监控/补偿/超时/健康检查 + 管理后台托管）
CMD ["npx", "tsx", "src/server/index.ts"]

# ---- relay 镜像（公网，前端发信中继）----
FROM node:20-alpine AS relay

WORKDIR /app

# relay 依赖与主项目共用 node_modules（tsx/express/nodemailer 均在主 package.json）
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/src ./src
COPY --from=build /app/relay-server ./relay-server

ENV RELAY_PORT=3003

EXPOSE 3003

# 启动 relay（仅发信，无 DB/IMAP）
CMD ["npx", "tsx", "relay-server/index.ts"]

# ---- 公网 Nginx 镜像（前端静态 + /api 反代 relay）----
FROM nginx:alpine AS web

COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx/public.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443

# ---- 内网 Nginx 镜像（可选：管理后台 + API 反代 backend）----
FROM nginx:alpine AS internal-web

COPY --from=build /app/dist-admin /usr/share/nginx/html
COPY deploy/nginx/internal.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
