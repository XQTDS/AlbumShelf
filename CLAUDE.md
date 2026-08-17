# CLAUDE.md

本文件为 Claude Code 在此仓库工作时提供指引。

## OpenSpec 工作流

当用户提出新需求时，遵循 OpenSpec 规范驱动开发流程：

1. **先读规范**：阅读 `openspec/specs/` 下相关能力的 spec（如 album-search、data-sync、album-list-ui 等），了解当前系统行为约定。
2. **编写变更文档**：在 `openspec/changes/<change-name>/` 下按 OpenSpec 惯例创建：
   - `proposal.md` — 需求背景、目标与非目标
   - `design.md` — 技术方案设计
   - `tasks.md` — 拆解后的任务清单
3. **实现**：按 tasks.md 完成代码实现。
4. **收尾**：更新 `openspec/specs/` 中受影响的 spec，并将本次 change 归档到 `openspec/changes/archive/`。
