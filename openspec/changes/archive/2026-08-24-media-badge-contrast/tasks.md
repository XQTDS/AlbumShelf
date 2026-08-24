# 任务清单

## 变更文档

- [x] 新增 `openspec/changes/2026-08-24-media-badge-contrast/` 变更文档（proposal/design/tasks）

## 渲染层（`src/renderer/src/App.vue`）

- [x] `.card-media-badge` 样式：
  - 背景 `rgba(0, 0, 0, 0.6)` → `rgba(255, 255, 255, 0.92)`
  - `color: #fff` → `#333`
  - 新增 `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35)`（浅色封面分离）
  - 尺寸、圆角、位置、z-index 不变

## 收尾

- [x] 更新 `openspec/specs/album-list-ui/spec.md`：「唱片墙介质角标」场景中「深色半透明底」改为「浅色半透明底（带投影）」
- [x] README 无需改动（功能说明仅描述角标位置，未涉及底色）——确认后勾选
- [x] 用户手动 `npm run dev` QA：
  - 深色封面专辑：黑胶/CD/磁带角标清晰可辨
  - 浅色（近白）封面：投影保证角标底与封面分离
  - CD 图标在浅底上的辨识度（高光是否融入底色）
  - 与左下排序角标、右下播放按钮共存与 hover 行为不变
- [x] QA 通过后归档 change 到 `openspec/changes/archive/`
