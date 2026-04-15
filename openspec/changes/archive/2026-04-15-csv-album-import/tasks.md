## 1. 数据准备

- [x] 1.1 创建 MD 转 CSV 脚本 `scripts/md-to-csv.js`，解析 `data/album-collection.md` 并生成 `data/album-collection.csv`
- [x] 1.2 运行脚本生成 CSV 文件，验证逗号、引号等特殊字符正确转义

## 2. CSV 读写模块

- [x] 2.1 安装依赖：`npm install csv-parse csv-stringify`（在 album-shelf 目录）
- [x] 2.2 创建 `album-shelf/src/main/sync/csv-reader.ts`，实现 `readAlbumsFromCsv()` 函数
- [x] 2.3 创建 `album-shelf/src/main/sync/csv-writer.ts`，实现 `writeNeteaseIdsToCsv()` 函数（含备份逻辑）

## 3. MockSyncService 重构

- [x] 3.1 修改 `mock-sync-service.ts`，删除硬编码的 `MOCK_ALBUMS` 数组
- [x] 3.2 修改 `fetchCollectedAlbums()` 方法，调用 `readAlbumsFromCsv()` 读取数据
- [x] 3.3 添加同步完成后的 netease_id 回写调用

## 4. 集成验证

- [ ] 4.1 启动应用，点击同步按钮，验证专辑列表正确加载
  - ⚠️ Electron 启动遇到环境问题（Node.js 24 + Electron 41 兼容性），待环境修复后验证
  - ✅ CSV 读取功能已通过独立测试验证：成功读取 2298 张专辑
- [ ] 4.2 检查 CSV 文件，确认 netease_id 已回写
- [ ] 4.3 检查 `.bak` 备份文件已生成
