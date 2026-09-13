# Agent Fleet 中文文档

Agent Fleet 是一款本地 Agent 控制平面，用于发现、配置和编排各类智能体命令行工具（Agent CLIs）。首个垂直切片版本重点适配 Codex 与 Claude Code，同时采用**基于能力的适配器设计**，后续可灵活接入 Gemini CLI，无需强行统一所有工具的行为逻辑。

本仓库目前包含无外部依赖的运行时核心，用于在引入 Electron 外壳之前验证产品的核心风险模块，涵盖以下能力：
- 智能体发现与能力上报
- 带值溯源的分层配置体系
- 有向无环图（DAG）校验与确定性调度
- 敏感信息脱敏
- 基于 Unix 域套接字的本地守护进程通信协议

## 运行
需使用 Node.js 24 及以上版本。所有应用、守护进程、适配器、渲染层、配置及测试代码均采用 TypeScript 编写。

```bash
npm test          # 运行核心测试
npm run scan      # 执行智能体扫描
npm run daemon    # 启动本地守护进程
npm run build:ui  # 构建 UI 渲染层
npm run desktop   # 启动桌面客户端
```

首次启动桌面端时，若本地未缓存 Electron 的 macOS 运行时，将自动触发下载。核心测试与渲染层构建无需依赖该二进制文件。

守护进程默认将状态数据存储在 `~/Library/Application Support/Agent Fleet` 目录下，并通过仅对当前用户开放的 Unix 套接字提供服务。开发环境中可通过环境变量 `AGENT_FLEET_DATA_DIR=/absolute/path` 自定义数据目录路径。

产品设计与架构决策详见 [docs/product-spec.md](docs/product-spec.md) 和 [docs/architecture.md](docs/architecture.md)。

## 桌面端技术栈
桌面客户端采用 Electron 框架，渲染层使用 React + TypeScript 实现。Electron 主进程负责 macOS 系统集成，并与独立运行的 Fleet 守护进程进行通信。渲染层仅通过沙箱化的预加载桥接层，访问受限的、带类型定义的 API 接口。
