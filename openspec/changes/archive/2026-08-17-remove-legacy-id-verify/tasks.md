# 任务清单

## 1. 删除菜单入口

- [x] `album-shelf/src/main/index.ts`：删除「工具 → 校验专辑 ID」菜单项

## 2. 删除 Renderer 弹窗与集成

- [x] 删除 `album-shelf/src/renderer/src/IdVerifyModal.vue`
- [x] `album-shelf/src/renderer/src/App.vue`：删除 `<IdVerifyModal>` 挂载、import、`idVerifyModalRef`、`onMenuVerifyIds` 监听与清理

## 3. 删除 Preload API

- [x] `album-shelf/src/preload/index.ts`：删除 `onMenuVerifyIds`、`albumGetDetailById`、`verifyAlbumIds`、`fixAlbumId`、`onVerifyProgress`
- [x] `album-shelf/src/preload/index.d.ts`：删除对应类型与 API 声明

## 4. 删除 IPC Handler 与死代码

- [x] `album-shelf/src/main/ipc-handlers.ts`：删除 `album:getDetailById`、`album:verifyIds`、`album:fixId`
- [x] `album-shelf/src/main/album-service.ts`：删除 `updateNeteaseAlbumId`

## 5. 文档与规范收尾

- [x] 根目录 `README.md`：移除「CSV 导入」提法
- [x] 删除 `openspec/specs/album-id-verify/spec.md`
- [x] 全局搜索确认无遗漏引用
- [x] 归档本次 change 至 `openspec/changes/archive/`
