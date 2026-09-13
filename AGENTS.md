# AI-Broll-Assistant

这是一个会随着实际使用持续演进的个人创作工具，不是已经定型的完整产品。

本文件只记录已经明确确认、需要始终提供给 Agent 的根本事实。当前技术栈、数据模型、制作流程、视觉方法和实现限制不属于不可改变的根规则。

## 已确认的功能

项目支持两类创作：

1. B-roll 视频
   - 输入：SRT 字幕和对应音频
   - 输出：B-roll 视频
   - 版本：横版 1920 × 1080、竖版 1080 × 1920
2. 演讲演示
   - 输入：讲稿
   - 输出：可手动翻页的交互式 HTML 演示
   - 版本：横版 1920 × 1080、竖版 1080 × 1920

## 演进原则

- 技术栈、数据模型、执行流程、动画方式和视觉风格目前都可以根据实际使用继续探索。
- 当前代码和文档描述的是现状或当前默认方法，不自动构成长期产品原则。
- 不因一次作品中的临时做法、一次成功结果或 Agent 的推断，把某项方案提升为全局规则。
- 只有用户明确确认长期有效的事实，才写入本文件；改变本文件中的已确认事实前也必须获得用户确认。
- 探索新方案时保护已有作品和有效数据，不静默覆盖无关人工内容，不把未经确认的实验扩展到无关范围。

## 工作区

- 工作区根目录保存 Agent 配置、入口文档，以及统一安装和转发应用命令的 pnpm workspace 配置与锁文件。
- 应用根目录为 `app/`；`projects/`、`src/`、`scripts/`、`server/` 等应用路径均相对于 `app/`。
- 安装和应用命令默认在工作区根目录执行；根脚本转发到 `app/` 并保持应用工作目录。

## 按需读取

不要预先加载所有专项文档。根据当前任务读取：

- 完整 B-roll 项目或跨阶段任务：`.agents/skills/broll-production/SKILL.md`
- SRT 解读、场景选择或时间边界：`.agents/skills/broll-scene-planner/SKILL.md`
- B-roll 画面方案：`.agents/skills/broll-scene-designer/SKILL.md`
- B-roll 图层、素材、动画或视觉检查：`.agents/skills/broll-scene-builder/SKILL.md`
- B-roll 视觉设计：`docs/BROLL_VISUAL_STYLE.md`
- 演讲演示制作：`.agents/skills/presentation-production/SKILL.md`
- 演讲演示视觉设计：`docs/PRESENTATION_VISUAL_STYLE.md`
- 当前应用能力、技术栈、命令和实现限制：`app/README.md`
- 跨作品的产品改进、实验和经验：`docs/EVOLUTION.md`
- 记忆提取、确认和写入：`.agents/skills/project-memory/SKILL.md`

专项文档和 Skills 是当前工作的操作依据，可以随实践改进；它们不得覆盖本文件中的已确认事实。

## 讨论记忆

- 继续处理某个具体作品前，如果存在 `app/projects/<project-id>/MEMORY.md`，按需读取它。
- 与单个作品有关的决定、反馈和待办写入该作品的 `MEMORY.md`；跨作品的视觉方法写入对应视觉文档，其他改进想法和实验经验写入 `docs/EVOLUTION.md`。
- Project / Scene 等作品文件描述当前成品；记忆文件记录讨论背景，不能替代作品文件或成为另一份画面方案。
- 重要讨论结束后，Agent 应提出简短的候选记忆清单并说明目标文件。只有用户确认的条目才能写入。
- 推断出的偏好只能作为候选提出，不得直接写成已确认事实；不保存完整聊天转录、秘密信息、临时调试噪声或可从当前文件直接看出的内容。
- 已确认记忆发生变化时更新原条目并标明替代关系，不堆叠互相冲突的结论。
