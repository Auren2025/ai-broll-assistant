# 测试说明

在 `app/` 中运行 `pnpm test`，使用现有 Node Test Runner 和 tsx，不需要启动编辑器或本地服务。

## 保存、冲突、撤销与 HTTP 回归测试

| 文件 | 覆盖范围 |
| --- | --- |
| `editorPersistence.test.ts` | 保存串行执行、重复版本去重、只写变化文件、保存期间的新编辑、失败重试与显式强制保存 |
| `editorHistory.test.ts` | 100 条历史上限、撤销/重做方向、失败后的栈恢复、新编辑清空 redo、历史内容接入保存路径 |
| `projectApiPersistence.test.ts` | 客户端 ETag 接受时机、资源隔离、失败与取消、强制保存、发送前 Schema 校验 |
| `localServer.test.ts` | 真实 HTTP 请求与临时文件读写、ETag 冲突、无效数据、路径输入、原子替换失败、场景创建/删除和创建失败回滚 |
| `versionTracker.test.ts` | 文档版本计数器的初始化、脏状态、增量与重置语义 |
| `saveController.test.ts` | 保存控制器周边的快照契约与 abort 传递，不直接挂载 React |
| `historyController.test.ts` | 历史栈上限、撤销/重做栈转移、失败后的回退、脏状态联动、快照语义 |
| `layerCommands.test.ts` | 图层 ID 分配与生成器单调序列 |

聚焦运行：

```bash
node --import tsx --test tests/editorPersistence.test.ts tests/editorHistory.test.ts tests/projectApiPersistence.test.ts tests/localServer.test.ts
```

- HTTP 测试通过 `createLocalServer()` 注入系统临时目录，绑定 `127.0.0.1` 随机端口，不读取或修改真实 `projects/`，不占用开发服务的 3002 端口。
- 请求设置超时；测试结束关闭连接与监听并清理临时文件。文件故障通过测试作用域 mock 注入，不依赖本机文件权限或磁盘实际故障。
- `helpers/projectFixture.ts` 生成通过 Schema 的临时测试数据，不复制实际项目。公共 helper 不是独立测试入口。
- 保存与历史测试调用 `App.tsx` 实际使用的操作函数，但没有挂载 React 页面。最后一项历史保存测试验证函数组合，不等于验证页面自动保存定时器或键盘事件。

## 已知缺口：可执行 TODO

当前没有未修复的 TODO。修复某个问题后，应在测试中扩充相关路由和故障路径，而不是放宽断言来匹配实际行为。

## 尚未覆盖

- React 页面中的 600 ms 自动保存、冲突提示/暂停、场景切换与历史操作的完整时序。
- 删除场景后通过编辑器撤销恢复文件，以及多文件操作的全部故障与并发组合。
- Fabric 完整交互、HTTP 素材上传与音频 Range、真实视频渲染和离线 HTML 打开。

以上仍需要聚焦补测与人工检查。测试截图与实际项目中的 `snapshots/` 不作为本测试集的基准数据。
