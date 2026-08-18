# 技术方案

## 导出

- `database.ts` 新增 `exportDatabase()` 函数，全量读取 album/track/genre/album_genre 四张表
- JSON 结构：`{ version: 1, exportedAt: ISO时间, data: { albums, tracks, genres, albumGenres } }`
- IPC handler `db:export`：调用 `dialog.showSaveDialog` 选择路径，写入 JSON 文件
- 默认文件名：`album-shelf-export-YYYYMMDD.json`

## 导入

- `database.ts` 新增 `importDatabase(data)` 函数
- 合并策略：
  - genre: INSERT OR IGNORE by name
  - album: 以 netease_album_id 查重，存在则 UPDATE，不存在则 INSERT
  - track: 按 album 维度先删后插
  - album_genre: 按 album 维度先删后插
- 全部在一个事务中执行，失败回滚
- IPC handler `db:import`：调用 `dialog.showOpenDialog` 选择文件，解析并调用 importDatabase

## 入口

- 菜单栏「数据」菜单底部增加分隔线 + 「导出数据...」「导入数据...」
- 通过 menu → webContents.send → renderer 监听 → invoke IPC 的标准流程
