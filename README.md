# Bunny's Home 项目骨架

本项目根据《Bunny & Elliott 详细搭建思路》搭建。当前已完成本地化版本与 Supabase 云端数据接入：会话管理、消息读写、设置保存、对话与记忆压缩流程都已跑通。

## 目录

- `bunny-home-frontend/`：React + Vite 前端
- `bunny-home-backend/`：Node.js + Express 后端
- `supabase/schema.sql`：Supabase 四张表建表脚本

## 已完成的离线功能

- 会话：新建、列表、重命名、删除
- 消息：按会话读取、发送、本地持久化
- 设置：系统提示词、温度、轮数、token 上限、压缩阈值
- 对话：未配 Claude 时可直接使用 DeepSeek 作为主对话模型；无任何 Key 时退回“本地演示”
- 记忆：上下文超过阈值时自动压缩旧消息并隐藏；填写 DeepSeek Key 后调用 DeepSeek
- 数据：本地默认保存在 `bunny-home-backend/data/bunny-home.db`
- 云端：`.env` 填入 Supabase URL 与 Secret Key 后自动切换为 Supabase

## 本地运行

本地需要 Node.js 22 或更高版本（后端本地库使用内置 SQLite）。

后端：

```bash
cd bunny-home-backend
pnpm install
pnpm dev
```

前端：

```bash
cd bunny-home-frontend
pnpm install
pnpm dev
```

浏览器打开 `http://localhost:5173`。后端健康检查地址为 `http://localhost:3000/api/health`。

## 下一步

1. 补齐 GitHub / Vercel / Render / Supabase 账号与 API Key。
2. 在 Supabase SQL Editor 执行 `supabase/schema.sql`。
3. 在 `bunny-home-backend/.env` 中填写 Claude 与 DeepSeek Key。
4. 前端把“本地演示”切换到 Claude，即可接入真实模型。
