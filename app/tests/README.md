# 测试说明

测试使用 Node Test Runner 和 tsx。所有命令均在仓库根目录执行，不需要启动编辑器或本地服务。

运行完整测试：

```bash
pnpm test
```

聚焦运行一个或多个测试文件：

```bash
pnpm --dir app exec node --import tsx --test tests/<file>.test.ts
```

## 覆盖范围

- Project / Scene Schema、SRT、项目与时间线校验
- 图层尺寸、组合、对齐、动画和 Remotion 渲染逻辑
- 保存队列、撤销重做、ETag 冲突和版本跟踪
- 本地 HTTP 服务、项目选择、开发预检和演示数据

HTTP 测试使用系统临时目录和随机端口，不读取或修改真实 `app/projects/`。公共 fixture 只生成测试数据，不复制实际项目。

## 尚未覆盖

- 完整浏览器交互和 Fabric 画布操作
- 素材上传与音频 Range 的端到端流程
- 真实 ProRes 渲染和离线 HTML 打开流程

这些流程仍需聚焦补测或人工检查；项目中的 `snapshots/` 不作为自动化测试基准。
