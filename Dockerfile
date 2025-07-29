# syntax=docker.io/docker/dockerfile:1

# 使用 Node.js 官方镜像（包含 npm）
FROM node:20-alpine AS base

# 全局安装 pnpm（版本需与 package.json 中的 "packageManager" 一致）
RUN npm install -g pnpm@10.2.0

# 1. 依赖安装阶段
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 仅复制 lockfile 和 package.json（优化构建缓存）
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 2. 构建阶段
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 禁用 Next.js 遥测
ENV NEXT_TELEMETRY_DISABLED=1

# 直接使用 pnpm 构建（无需条件判断）
RUN pnpm run build

# 3. 生产运行阶段
FROM base AS runner
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p .next/cache && \
    chown nextjs:nodejs .next/cache

# 从构建阶段复制产出文件
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# 复制 public 目录（standalone 模式需要手动复制）
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]