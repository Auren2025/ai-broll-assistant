# AI-Broll-Assistant 应用说明

本文描述 `app/` 当前可运行的实现，负责安装、启动、操作能力、命令与当前限制。仓库目录与文档入口见[根目录 README](../README.md)。

长期产品边界、领域不变量和 Agent 工作规则以[AGENTS.md](../AGENTS.md) 为准，视觉生成偏好以[VISUAL_STYLE.md](../VISUAL_STYLE.md) 为准。下文的数据模型摘要不替代完整规则；当前实现限制也不降低长期规则要求。

## 项目定位

AI-Broll-Assistant 是个人本地使用的 faceless YouTube B-roll 动画制作工具。它把 SRT、Project / Scene JSON、Fabric.js 编辑和 Remotion 渲染连接为一套工作流，输出可交给 DaVinci Resolve 的透明视频，或可离线打开的逐页 HTML 演示。

它不是视频剪辑器，不管理原始视频、音频剪辑、人像轨道、多人协作、云端数据库或云端渲染。

## 当前技术栈

- React 19 + TypeScript：编辑器、状态、撤销重做和自动保存
- Fabric.js 7：画布布局与图层基础状态编辑
- Remotion 4 + Remotion Player：动画预览、Studio 和最终渲染
- Node.js 本地 HTTP 服务：Project / Scene JSON 与图片素材读写、音频读取
- Zod：持久化领域数据的严格 Schema 校验
- Vite 8：编辑器和 HTML 演示构建
- Oxlint + Node Test Runner：静态检查和测试

Project / Scene JSON 是唯一持久化数据源。Fabric.js Canvas JSON、Remotion 私有数据和逐帧动画结果都不会保存。

## 环境与安装

应用保留 Node.js 运行时，统一使用 `package.json` 固定的 pnpm 12.0.0（需要 Node.js >=22）。Vite 8 要求 Node.js `^20.19.0` 或 `>=22.12.0`，建议使用 Node.js 24 LTS。

```bash
cd app
pnpm install --frozen-lockfile
```

应用依赖锁定在 `app/pnpm-lock.yaml`；根目录的锁文件仅用于启动入口与固定 pnpm 版本，不管理应用依赖。不混用 npm / Bun 安装依赖。`pnpm-workspace.yaml` 仅配置依赖构建脚本许可，目前仍是单包应用。

除 `pnpm dev` 可直接在仓库根目录执行外，本文其他命令均在 `app/` 目录执行。

## 启动编辑器

在仓库根目录直接运行以下命令，即可启动本地服务、Vite 编辑器和 Remotion Studio（在 `app/` 中运行同样有效）：

```bash
pnpm dev
```

- 日志使用 `[server]`、`[editor]`、`[studio]` 前缀区分。
- 等待本地服务健康检查通过后才启动编辑器和 Studio，最长等待 30 秒。
- 启动前检查端口；占用时直接报错，不结束已有进程。
- 按一次 **Ctrl+C** 统一停止三个进程及其子进程；某个受管进程退出也会停止其余进程，失败时返回非零退出码。
- 统一启动不自动打开浏览器，请访问下面的地址。
- 仅需部分服务时，可分别执行 `pnpm dev:server`、`pnpm dev:editor` 或 `pnpm studio`；这些独立命令需分别停止。

打开：

```text
http://127.0.0.1:5174/my-design
```

- 本地服务固定监听 `127.0.0.1:3002`。
- Vite 固定监听 `127.0.0.1:5174`，并将 `/api` 代理到本地服务。
- 未提供合法 `project` 参数时，编辑器默认加载 `my-design`。
- 当前没有项目列表或项目选择器；项目通过 URL 路径选择。
- 访问其他项目时将路径替换为 `http://127.0.0.1:5174/<project-id>`。
- 原有的 `?project=<project-id>` 参数仍可使用，并优先于路径。
- 独立预览窗口由编辑器打开，通过 `BroadcastChannel` 接收当前内存状态，不能脱离编辑器独立加载。

## Remotion Studio

`pnpm dev` 已包含 Studio，不要重复启动。仅单独使用 Studio 时，在两个终端分别执行：

```bash
pnpm dev:server
```

```bash
pnpm studio
```

Studio 默认打开 `http://localhost:3001/my-design`。访问其他项目时将路径替换为 `http://localhost:3001/<project-id>`；`127.0.0.1:3001` 同样可用。原有的 `?project=<project-id>` 参数仍可使用，并优先于路径。

## 项目目录

```text
projects/<projectId>/
├── source.srt
├── <audio-file>      # 可选
├── project.json
├── scenes/
├── assets/
├── renders/
├── exports/          # 导出后出现
└── snapshots/        # 可选，本地视觉检查截图
```

- `project.json` 保存项目尺寸、帧率、可选 `audioFile` 和按时间排序的场景引用。
- `scenes/*.json` 保存完整 Scene 数据。
- `assets/` 只保存项目图片素材；领域数据使用 `assets/<filename>` 相对路径。
- 新项目的口播音频直接放在项目根目录，`audioFile` 保存文件名。
- Schema 和服务仍可读取旧数据中的 `audio/<filename>`，但新项目不再创建 `audio/`。
- 本地播放支持 MP3、WAV、M4A、AAC、OGG、FLAC 和 WebM；应使用这些扩展名保存口播。
- `renders/` 和 `exports/` 是生成物目录，不是领域数据源，也默认不纳入 Git；`renders/.gitkeep` 可用于保留空目录。
- `snapshots/` 只存放可选的本地视觉检查截图，不作为素材库、自动化测试基准或场景数据备份，默认不纳入 Git。已有截图原样保留，应用不依赖它们；需要作为正式图片素材使用时，应通过本地服务上传到 `assets/`。

`scaffold` 参数和本地服务路由中的项目 / 场景 ID 只接受字母、数字、下划线和连字符。图片应通过编辑器上传；服务会生成 `image-<随机值>.<扩展名>` 文件名。

## SRT 与场景工作流

标准流程由根目录的 Agent Skills 约束：

```text
完整 SRT
-> 全局叙事地图
-> 一次讨论并确认一个语义场景
-> 写入 layers: [] 的 Scene JSON
-> 为该场景生成图层与必要动画
-> 项目校验和视觉检查
-> 继续下一个候选场景
```

新建项目前，如果项目根目录只有另一个 `.srt`，先保留原文件并复制为 `source.srt`。然后验证规范化后的完整字幕：

```bash
pnpm validate:srt projects/<project-id>/source.srt
```

首个语义场景获批后创建项目骨架：

```bash
pnpm scaffold <project-id>
```

`scaffold` 创建 1920 x 1080、30 fps、150 帧的空占位场景。先用获批且对齐 SRT cue 的 Scene 骨架替换该占位场景，再运行：

```bash
pnpm validate:project projects/<project-id>
```

单独使用 `scaffold` 且没有 SRT 时，它会创建一个尚不能通过校验的空 `source.srt`。

已有 `project.json` 的项目可使用：

```bash
pnpm skeleton <project-id> [gap-ms]
```

该命令只打印按停顿分组的候选 cue 和帧锚点，不修改文件，也不能代替完整 SRT 语义分析。它依赖现有 `project.json` 提供 fps，因此不能在未初始化项目上运行。

## 数据模型摘要

### Project 与 Scene

- Project：`schemaVersion`、`id`、`name`、`width`、`height`、`fps`、可选 `audioFile`、非空 `scenes`。
- Scene：`schemaVersion`、`id`、`topic`、绝对 `startFrame`、`durationInFrames`、可选 `backgroundColor`、`layers`。
- Scene 必须按 `startFrame` 递增且不能重叠；场景之间允许透明空隙。
- Scene 起点必须对应当前 fps 下的 SRT cue 起点；首场景允许从项目第 0 帧开始，以对齐口播音频起点。Scene 不能延伸到 SRT 末尾之后。

### 图层

当前支持 `text`、`image`、`rectangle`、`circle`、`triangle`、`arrow` 和非嵌套 `group`。

- 所有图层使用左上角 `x` / `y`、视觉 `width` / `height` 和中心旋转。
- Image 只接受 `src: null` 或 `assets/<filename>`，支持 `contain` / `fill`、圆角和描边。
- Rectangle 和完整 Circle / Ellipse 支持无独立 ID 的 `shapeText`；内文固定在形状内容框内并裁剪溢出。
- Text 支持 `both`、`height` 和 `fixed` 三种尺寸模式。当前独立 Text 即使为 `fixed` 也不裁剪溢出；形状内文会裁剪。
- 创建 Group 至少选择两个普通图层；删除或移出部分子图层后，可以保留只有一个子图层的 Group，空 Group 自动删除。Group 不能嵌套。

### 动画

每个可动画的顶层图层或 Group 最多各有一个：

- Build In：`enter` + `fade-and-move`、`line-draw`、`wipe`、`dissolve-in`、`scale-in` 或 `scale-big`；Line Draw 只适用于有有效边线的 Rectangle、Circle、Triangle 和 Arrow
- Action：`emphasis` + `magic-move`
- Build Out：`exit` + `dissolve`

动画使用场景局部整数帧，至少持续 1 帧，并且必须在 Scene 时长内结束。Magic Move 只保存相对位移、统一缩放和透明度乘数，完成后保持目标状态。

Group 子图层只继承 Group 动画，不得新增、修改或拖动自身动画；历史数据中已有的子图层动画仍可读取和渲染。

## 当前编辑能力

- 编辑项目名称、fps、画布尺寸和预设比例。
- 添加和删除场景，编辑 topic、背景色和时长；最后一个场景不能删除。
- 新建全部受支持的普通图层，移动、旋转、直接修改视觉宽高。
- 多选、对齐、贴靠、等距分布、层级调整、复制、粘贴、重复、组合和取消组合。
- 编辑文字样式、形状、圆角、描边、图片适配和箭头两端样式。
- 双击编辑独立 Text 或 Rectangle / Circle 的 shapeText。
- 编辑三类动画阶段及其预设；画布可显示并拖动 Magic Move 终点。
- Fabric 编辑和 Remotion 场景预览切换；预览配置了项目音频时同步播放口播。
- 修改后约 600 ms 自动保存；请求串行执行，并通过 ETag 检测 Project / Scene 外部修改冲突。
- 撤销 / 重做保留最近 100 个内存快照；切换场景或读取外部更新会清空历史。

## 校验、质量检查与构建

```bash
pnpm validate:srt projects/<project-id>/source.srt
pnpm validate:project projects/<project-id>
pnpm validate:project projects/<project-id> --strict
pnpm test
pnpm lint
pnpm build
```

常规项目校验会检查严格 Schema、场景引用、场景 ID、图片和音频文件、场景顺序与重叠、SRT 锚点及 SRT 总时长。当前领先和场景间透明空隙在常规模式中产生 warning，`--strict` 将它们视为错误；尾部空隙允许且当前不报告。

`pnpm build` 执行 TypeScript project build 和 Vite build，但不会自动执行 lint 或 tests。修改应用源码时应分别运行聚焦测试、完整测试、lint 和 build。

保存、冲突、历史操作与临时目录 HTTP 测试的运行方式、覆盖边界和已知 TODO 见[测试说明](tests/README.md)。TODO 用例不计入通过数，不代表对应实现缺口已解决。

## 视频渲染

终端 1 保持本地服务运行（已有 `pnpm dev` 时无需重复启动）：

```bash
pnpm dev:server
```

终端 2 执行渲染：

```bash
pnpm render:project <project-id>
```

脚本会先运行完整项目校验和本地服务健康检查，输出到：

```text
projects/<project-id>/renders/<project-id>.mov
```

当前固定输出 ProRes 4444、`yuva444p10le`、透明背景，并且不包含项目口播音轨。显式 Scene 背景色仍会进入最终视频。

## HTML 演示导出

```bash
pnpm validate:project projects/<project-id>
pnpm export:html <project-id>
```

输出位于 `projects/<project-id>/exports/html/`，直接打开 `index.html` 即可，不依赖本地服务。

- 一个 Scene 对应一页，进入页面时从局部第 0 帧自动播放，结束后停在最终画面。
- 点击舞台、空格或右方向键进入下一页；左方向键返回；`R` 或“重播”按钮重新播放当前页。
- 导出物包含展示数据和 `assets/` 图片。
- 当前 HTML 演示不复制或播放 `audioFile`，并使用黑色辅助底板显示透明 Scene。

## 其他命令

| 命令 | 用途 |
| --- | --- |
| `pnpm parse:srt <file>` | 将 SRT 解析结果打印为 JSON |
| `pnpm migrate:animations <project-dir>` | 将旧动画预设迁移到当前领域格式 |
| `pnpm preview` | 预览已经由 `pnpm build` 生成的 Vite 应用 |

## 当前限制

以下记录当前实现，不是对 `AGENTS.md` 的规则豁免。其中多文件保存一致性和写入入口的完整校验仍是待解决的实现缺口，不能仅靠文档说明视为已满足要求。

- 没有项目创建、删除、列表或选择 UI；创建使用 `scaffold`，选择使用 URL 参数。
- 没有音频上传或选择 UI；音频文件和 `audioFile` 需在项目数据中管理。
- 没有 Scene 起点和排序 UI；语义重划分由 Agent 工作流或直接修改领域 JSON 完成。
- 服务的单文件 PUT 和新增场景 POST 不执行完整项目校验；跨文件引用、SRT 锚点和完整时间线由 `validate:project` 检查。
- Project 与 Scene 的组合保存、场景创建和删除不是文件系统事务；Agent 批量写入时必须关闭编辑器并在完成后校验。
- 当前创建 Group 会清空被组合子图层已有的动画；不要直接组合需要保留子动画的对象。
- 只选中 Group 子图层时，Copy 不会产生剪贴板内容；Layer `name` 也暂时没有 UI 编辑入口。
- 本地服务没有账号或令牌鉴权；当前允许来自 `http://127.0.0.1:5174`、`http://localhost:5174`、`http://127.0.0.1:3001` 和 `http://localhost:3001` 的浏览器请求访问项目数据。其他来源的浏览器请求会被拒绝，但本地脚本、渲染或代理进程若不带 Origin 头仍能调用此服务，因此请勿把端口转发或代理到网络。
- 场景删除采取“先删文件，再原子写项目 JSON”的顺序；删除阶段失败会保持两者不变，写入阶段失败会保持文件已删除但明确返回错误，需要人工处理。
- 自动化测试已覆盖基础 HTTP 项目/场景读写与部分故障路径，但未覆盖完整浏览器交互、素材上传与音频 Range、实际 ProRes 渲染和离线 HTML 打开流程，这些变更仍需人工检查。
