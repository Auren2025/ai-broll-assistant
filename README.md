# AI-Broll-Assistant

个人本地使用的 YouTube B-roll 动画制作工具：从 SRT 规划场景，以结构化 JSON 保存画面，通过 Fabric.js 编辑、Remotion 预览和渲染，输出透明视频或离线 HTML 演示。

## 快速开始

建议使用 Node.js 24 LTS，包管理器使用 `package.json` 固定的 pnpm 版本。

首次安装应用依赖：

```bash
cd app
pnpm install --frozen-lockfile
```

在仓库根目录或 `app/` 中启动：

```bash
pnpm dev
```

启动后访问 <http://127.0.0.1:5174/my-design>；将 `my-design` 替换为其他项目 ID 即可切换项目。此命令统一启动本地服务、编辑器和 Remotion Studio，按 Ctrl+C 统一停止。

除 `pnpm dev` 外，安装、校验、测试、构建和导出命令均在 `app/` 中执行。完整命令与限制见[应用说明](app/README.md)。

## 目录导航

```text
.
├── README.md          # 仓库入口与导航
├── AGENTS.md          # 长期规则、领域不变量与 Agent 工作边界
├── VISUAL_STYLE.md    # B-roll 视觉偏好
├── .agents/skills/    # 项目调度、场景规划与动画制作步骤
├── app/               # 单包主应用
│   ├── src/           # 领域模型、编辑器、预览与 Remotion
│   ├── server/        # Node.js 本地服务
│   ├── scripts/       # 启动、校验、渲染、导出与迁移命令
│   ├── presentation/  # 离线 HTML 演示入口与界面
│   ├── tests/         # 自动化测试
│   └── projects/      # 实际 B-roll 项目、素材与输出
├── learning/          # 独立参考实验，不属于主应用运行链路
└── archive/           # 历史资料说明与本地会话归档
```

根目录的 `package.json` 只转发启动命令，根锁文件只服务于启动入口和固定 pnpm 版本；应用依赖由 `app/package.json` 与 `app/pnpm-lock.yaml` 管理。

参考实验的使用边界见 [learning/README.md](learning/README.md)；历史会话的保留方式见 [archive/README.md](archive/README.md)。项目中的 `snapshots/` 是本地视觉检查截图，和渲染、导出结果一样不作为领域数据源，默认不纳入 Git；实际 JSON、SRT 与素材不受这些产物忽略规则影响。

## 文档导航与职责

| 文档 | 阅读目的 |
| --- | --- |
| [应用说明](app/README.md) | 安装启动、操作能力、命令、输出与当前实现限制 |
| [长期规则](AGENTS.md) | 产品边界、固定架构、领域不变量和数据操作约束 |
| [视觉偏好](VISUAL_STYLE.md) | 构图、文字、色彩、素材呈现与动效风格 |
| [项目调度 Skill](.agents/skills/ai-broll/SKILL.md) | 跨阶段任务的路由、审批与交接 |
| [场景规划 Skill](.agents/skills/broll-scene-planner/SKILL.md) | 完整 SRT 解读、单场景确认与空场景落盘步骤 |
| [场景动画 Skill](.agents/skills/broll-scene-animator/SKILL.md) | 已确认场景的图层、动画、草稿素材与视觉检查步骤 |

长期规则以 `AGENTS.md` 为准；应用说明描述当前实现，不因记录实现限制而降低规则要求。Skills 描述执行步骤，视觉偏好描述风格，均不另行定义领域模型。会话记录和 `learning/` 中的资料不是主应用规则来源。

Project / Scene JSON 是唯一持久化项目与场景数据源。具体项目的未确认方案只在对话中讨论，不在文档中保存另一份场景方案。Agent 批量修改项目数据前必须关闭编辑器，完成后校验，再打开检查。
