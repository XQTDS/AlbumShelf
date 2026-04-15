## Why

当前 MockSyncService 使用硬编码的 15 条种子数据，无法反映用户真实的专辑收藏。用户已通过截图识别将约 2298 张网易云收藏专辑导出到 MD 文件，需要一种方式将这些数据导入应用，并支持手动维护。

## What Changes

- MockSyncService 改为从 CSV 文件读取专辑数据，而非硬编码
- 新增 CSV 数据文件 `data/album-collection.csv`，包含 title、artist、netease_id 三列
- 同步完成后，将匹配到的 netease_id 回写到 CSV 文件，便于追踪同步状态
- 提供脚本将现有 MD 文件转换为 CSV 格式

## Capabilities

### New Capabilities

- `csv-data-source`: CSV 文件读写能力，支持从 CSV 读取专辑列表、同步后回写 netease_id

### Modified Capabilities

- `data-sync`: MockSyncService 的数据源从硬编码改为 CSV 文件读取

## Impact

- `album-shelf/src/main/sync/mock-sync-service.ts`: 重构数据读取逻辑
- `data/album-collection.csv`: 新增数据文件
- `scripts/`: 新增 MD 转 CSV 脚本
