# AI-Broll-Assistant 应用说明

本文描述 `app/` 当前可运行的实现、命令、输出和已知限制。已确认的产品范围见[根本事实](../AGENTS.md)，仓库入口与其他文档见[根目录 README](../README.md)。

## 当前实现

应用在本地支持两类创作：根据 SRT 与音频制作 B-roll 视频，以及根据讲稿制作可手动翻页的交互式 HTML 演示。两类作品均支持横版 1920 × 1080 与竖版 1080 × 1920。

- React、TypeScript 与 Fabric.js：编辑器、画布和图层操作
- Remotion 与 Remotion Player：动画预览、Studio 和视频渲染
- Node.js 本地服务：项目数据、图片素材和音频读取
- Vite：编辑器与离线 HTML 演示构建
- Zod：持久化数据的严格 Schema 校验

Project / Scene JSON 是规范的结构化编辑状态；SRT、音频和 `assets/` 图片是项目输入。Fabric Canvas JSON、Remotion 私有数据和逐帧动画结果不持久化。

## 安装与启动

建议使用 Node.js 24 LTS；Vite 8 支持 Node.js `^20.19.0` 或 `>=22.12.0`。pnpm 版本由根目录 `package.json` 固定，依赖由根目录 `pnpm-lock.yaml` 锁定。

所有命令均在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 统一启动本地服务、编辑器和 Remotion Studio，等待服务健康检查通过后再启动界面。端口占用时直接报错；按一次 Ctrl+C 可停止全部受管进程。

| 服务 | 地址 |
| --- | --- |
| 编辑器 | <http://127.0.0.1:5174/my-design> |
| Remotion Studio | <http://localhost:3001/my-design> |
| 本地数据服务 | `127.0.0.1:3002` |

将 URL 中的 `my-design` 替换为其他项目 ID 即可切换项目。旧的 `?project=<project-id>` 查询参数仍可使用，并优先于路径。

只启动部分服务时可使用 `pnpm dev:server`、`pnpm dev:editor` 或 `pnpm studio`。编辑器和 Studio 都依赖本地数据服务；`pnpm dev` 会自动处理该依赖。

## 项目目录

```text
app/projects/<broll|slide>/<project-id>/
├── source.srt          # B-roll 字幕
├── scene-plan.md       # B-roll 场景划分与画面设计
├── <audio-file>        # B-roll 口播音频
├── script.md           # 演示讲稿
├── presentation-plan.md # 演示页面规划与画面设计
├── MEMORY.md           # 可选的项目讨论记忆
├── project.json
├── scenes/
├── assets/
├── renders/
├── exports/
└── snapshots/        # 可选的本地检查截图
```

- `project.json` 保存项目类型 (`kind`)、画布设置及场景引用；B-roll 引用保存绝对 `startFrame`，演示引用的数组顺序就是翻页顺序。`scenes/*.json` 保存画面、页内动画和 `durationInFrames`，不保存全局起点。新建数据使用 Schema v2，旧版数据仍可读取。
- B-roll 作品放在 `projects/broll/`，演示作品放在 `projects/slide/`；项目 ID 在两类作品间不能重复。编辑器 URL 和 API 仍只使用项目 ID。
- B-roll 使用 `source.srt`、对应音频和 `scene-plan.md`；演示使用 `script.md` 和 `presentation-plan.md`。规划文件供生成前审查，不替代 Scene JSON。
- 图片素材保存在 `assets/`，JSON 中使用 `assets/<filename>` 相对路径。
- 口播音频放在项目根目录；兼容 MP3、MP4、WAV、M4A、AAC、OGG、FLAC 和 WebM。
- `renders/`、`exports/` 和 `snapshots/` 是生成或检查产物，不是结构化编辑状态。
- 整个 `app/projects/` 是本地内容，默认不纳入 Git。

项目和场景 ID 只接受字母、数字、下划线和连字符。一个项目只保存一个画布版本；横版和竖版使用不同项目 ID。

## 当前编辑能力

- 编辑项目名称、横竖版画布、场景 topic、背景色和时长，添加或删除场景；演示可拖动页面排序，右键页面选择在其下方新建或删除，顶部 Add Page 始终在末尾新建。
- 创建 `text`、`image`、`rectangle`、`circle`、`triangle`、`arrow` 和非嵌套 `group` 图层。
- 移动、缩放、旋转、多选、对齐、贴靠、分布、调整层级、复制和组合图层。
- 编辑文字、形状、图片完整显示、裁切填满和焦点位置、箭头样式，以及 Build In、Action、Build Out 动画。
- 在 Fabric 编辑和 Remotion 预览之间切换；配置音频时可同步播放口播；支持的浏览器会将独立预览显示为置顶画中画窗口，其他浏览器回退为普通弹窗。
- 修改后约 600 ms 自动保存，并通过 ETag 检测外部修改冲突。
- 撤销与重做保留最近 100 个内存快照；切换场景或接受外部更新时清空历史。

## 命令参考

根脚本会把命令转发到 `app/`，所以命令参数中的 `projects/`、`src/` 等路径均相对于 `app/`。

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动本地服务、编辑器和 Studio |
| `pnpm dev:server` | 单独启动本地服务 |
| `pnpm dev:editor` | 单独启动编辑器 |
| `pnpm studio` | 单独启动 Remotion Studio |
| `pnpm scaffold <project-id> [--slide\|--broll]` | 创建项目骨架；默认 B-roll，B-roll 存在唯一其他 SRT 时自动复制为 `source.srt` |
| `pnpm validate:srt projects/broll/<project-id>/source.srt` | 校验完整字幕 |
| `pnpm skeleton <project-id> [gap-ms]` | 打印停顿分组候选，不修改文件 |
| `pnpm validate:project projects/broll/<project-id>` | 校验 B-roll 数据、素材、SRT 和时间线 |
| `pnpm validate:project projects/broll/<project-id> --strict` | 将领先和场景间空隙也视为错误 |
| `pnpm test` | 运行自动化测试 |
| `pnpm lint` | 运行静态检查 |
| `pnpm build` | 运行 TypeScript 和 Vite 构建 |
| `pnpm render:project <project-id>` | 渲染 B-roll 视频 |
| `pnpm export:html <project-id>` | 导出离线 HTML 演示 |
| `pnpm parse:srt <file>` | 将 SRT 解析结果打印为 JSON |
| `pnpm migrate:animations <project-dir>` | 迁移旧动画数据 |
| `pnpm migrate:project-kinds` | 为旧作品按所在目录补充 `kind`（先保存备份） |
| `pnpm migrate:scene-placement` | 把旧场景起点迁到 B-roll 项目引用，并升级到 Schema v2（先保存备份） |

`pnpm build` 不自动执行 lint 或测试。测试范围与人工检查缺口见[测试说明](tests/README.md)。

## 视频输出

保持本地服务运行后执行：

```bash
pnpm render:project <project-id>
```

渲染前会自动执行完整项目校验，输出到 `app/projects/broll/<project-id>/renders/<project-id>.mov`。当前格式固定为无口播音轨的 ProRes 4444、`yuva444p10le` 透明视频；Scene 的显式背景色仍会进入画面。

## HTML 演示输出

HTML 导出会校验演示的 Project / Scene 数据、顺序和图片素材：

```bash
pnpm export:html <project-id>
```

输出位于 `app/projects/slide/<project-id>/exports/html/`，可直接打开 `index.html`，不依赖本地服务。一个 Scene 对应一页，支持点击舞台、方向键和空格翻页，以及重播当前页。导出物包含展示数据和图片素材，但当前不包含或播放项目音频；导出前仍需人工确认没有空素材和制作提示。

## 当前限制

- 没有项目创建、删除、列表或选择 UI；创建使用 `scaffold`，选择通过 URL 路径完成。
- 没有音频上传或选择 UI；音频文件和 `audioFile` 需要在项目数据中管理。
- B-roll 还没有场景起点和排序 UI；时间边界调整通过 Agent 工作流或项目 JSON 完成。
- `scaffold` 默认创建 B-roll；使用 `--slide` 创建演示骨架，不生成 `source.srt`。
- 跨 Project / Scene 文件的创建、保存和删除不是完整文件系统事务。
- 创建 Group 会清除被组合子图层已有的动画。
- 本地服务没有账号或令牌鉴权，仅供本机使用，不应转发或代理到网络。

## 制作与开发文档

- [完整 B-roll 项目流程](../.agents/skills/broll-production/SKILL.md)
- [SRT 与场景划分](../.agents/skills/broll-scene-planner/SKILL.md)
- [B-roll 画面设计](../.agents/skills/broll-scene-designer/SKILL.md)
- [B-roll 场景生成](../.agents/skills/broll-scene-builder/SKILL.md)
- [演讲演示制作](../.agents/skills/presentation-production/SKILL.md)
- [B-roll 视觉设计参考](../docs/BROLL_VISUAL_STYLE.md)
- [演讲演示视觉观察](../docs/PRESENTATION_VISUAL_STYLE.md)
- [项目讨论记忆](../.agents/skills/project-memory/SKILL.md)
- [产品演进记忆](../docs/EVOLUTION.md)
- [测试说明](tests/README.md)
- [领域 Schema](src/domain/)
