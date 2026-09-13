# AI-Broll-Assistant

一个随实际使用持续演进的个人创作工具，支持根据 SRT 与音频制作 B-roll 视频，以及根据讲稿制作可手动翻页的交互式 HTML 演示；两类作品均使用 1920 × 1080 画布。

## 快速开始

建议使用 Node.js 24 LTS，包管理器使用 `package.json` 固定的 pnpm 版本。以下命令均从仓库根目录执行。

安装应用依赖：

```bash
pnpm --dir app install --frozen-lockfile
```

启动本地服务、编辑器和 Remotion Studio：

```bash
pnpm dev
```

启动后访问 <http://127.0.0.1:5174/my-design>；将 `my-design` 替换为其他项目 ID 即可切换项目。按 Ctrl+C 统一停止。

校验、测试、构建和导出等应用命令在 `app/` 中执行。完整命令与限制见[应用说明](app/README.md)。

## 目录导航

```text
.
├── README.md          # 仓库入口与导航
├── AGENTS.md          # 已确认的根本事实与演进原则
├── docs/              # 视觉观察与产品演进记忆
├── .agents/skills/    # 当前工作方法与记忆流程
├── .opencode/commands/ # OpenCode 项目命令
└── app/               # 主应用、项目数据与应用文档
```

根目录的 `package.json` 只转发启动命令，根锁文件只服务于启动入口和固定 pnpm 版本；应用依赖由 `app/package.json` 与 `app/pnpm-lock.yaml` 管理。

`app/projects/` 中的项目数据、素材、截图与输出均为本地内容，默认不纳入 Git。

## 文档导航

| 文档 | 阅读目的 |
| --- | --- |
| [应用说明](app/README.md) | 安装启动、操作能力、命令、输出与当前实现限制 |
| [根本事实](AGENTS.md) | 已确认功能、画布尺寸、演进原则和按需文档导航 |
| [B-roll 视觉观察](docs/BROLL_VISUAL_STYLE.md) | B-roll 的当前参考方法、候选偏好、构图、素材与动画节奏 |
| [演讲演示视觉观察](docs/PRESENTATION_VISUAL_STYLE.md) | 演讲演示逐步积累的视觉观察、参考方法与实验结果 |
| [产品演进记忆](docs/EVOLUTION.md) | 跨作品的候选改进、实验结果、当前方法和被替代方案 |
