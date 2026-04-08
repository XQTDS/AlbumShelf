## Why

用户希望对收藏的专辑进行个人评分，以记录自己的主观听感。目前应用仅展示 MusicBrainz 社区评分，缺乏个人化的评价维度。用户评分可以帮助用户管理和筛选自己真正喜爱的专辑。

## What Changes

- 在 album 表新增 `user_rating` 字段（REAL 类型，可空），存储用户的个人评分
- 评分范围为 0.5~5.0，步长 0.5（共 10 个档位），支持修改和清除
- 列表表格新增"我的评分"列，与 MB 评分列并列展示
- 专辑详情展开区新增可交互的星级评分组件（支持半星点击）
- 列表支持按用户评分排序
- 新增 IPC 接口 `album:setRating` 用于保存/清除评分

## Capabilities

### New Capabilities
- `user-rating`: 用户专辑评分功能，包括评分数据存储、评分交互组件、评分展示和排序

### Modified Capabilities
- `local-storage`: Album 表新增 user_rating 字段
- `album-list-ui`: 列表新增"我的评分"列展示，支持按用户评分排序；详情展开区新增交互式评分组件

## Impact

- **数据库**: album 表新增列，需要 migration
- **后端服务**: AlbumService 查询排序逻辑扩展，新增 IPC handler
- **前端**: App.vue 列表列变更、详情区新增评分组件
- **Preload**: 新增 API 方法
