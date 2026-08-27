# 任务清单

## 变更文档

- [x] 新增 `openspec/changes/2026-08-27-followed-badge-toggle/` 变更文档（proposal/design/tasks）

## 渲染层（`src/renderer/src/App.vue`）

- [x] `GridBadgeToggles` 接口增加 `followed: boolean`；`GRID_BADGE_DEFAULTS` 增加 `followed: true`
- [x] `loadGridBadges()` 逐字段校验追加 `followed`（非法/缺失回退默认 `true`）
- [x] `BADGE_TOGGLE_ITEMS` 末尾追加 `{ key: 'followed', label: '已关注', icon: '★', sortField: undefined }`
- [x] 卡片已关注角标 `v-if` 改为 `gridBadges.followed && isAlbumFollowed(album)`，注释去掉「常驻」
- [x] 卡片 `v-memo` 依赖数组追加 `gridBadges.followed`

## 收尾

- [x] 更新 `openspec/specs/album-list-ui/spec.md`：「唱片墙角标显示开关」requirement 由四枚改为五枚（追加已关注，默认开启），新增对应 scenario
- [x] 更新 `openspec/specs/artist-follow/spec.md`：「关注状态展示」与「唱片墙卡片角标」场景中「常驻 ★ 角标」表述改为受开关控制、默认显示
- [x] README 同步（功能说明、使用方式）
- [x] 用户手动 `npm run dev` QA：
  - 关闭「已关注」开关 → 全部卡片右上角 ★ 角标立即隐藏；重新开启恢复
  - 重启应用后开关状态保持；旧版本升级（localStorage 无 `followed` 字段）默认显示
  - 窄窗口工具栏换行正常；「只看已关注」筛选与开关互不影响；锁定机制不误伤该开关
- [x] QA 通过后归档 change 到 `openspec/changes/archive/`
