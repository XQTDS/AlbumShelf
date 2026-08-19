# 提案：通过 ncm-cli 回填缺失的发行日期

## 背景

实测本地数据库（2476 张专辑）中有 560 张（22.6%）`release_date` 为空。根因分析：

1. **历史 CSV 导入无日期列**：2026-04 及更早的专辑经 CSV 导入，入库时 `release_date` 即为 NULL（376 张无 mbid 的缺失专辑中 279 张为 04 月导入）。
2. **发行日期当前唯一来源是 MusicBrainz 补全**：数据库中有日期的专辑全部为补全所得。MB 匹配完全失败（376 张，如戏班《五石散》）或 release-group 无 `first-release-date`（184 张）时，日期为空且无兜底。
3. **ncm-cli 的 publishTime 未被利用**：`album get` / `album collected` / `search album` 均返回 `publishTime`（实测《五石散》可取得），但：
   - 同步对已存在专辑不修改任何字段，历史 NULL 从未被回填；
   - 搜索添加路径显式写入 `release_date: null`；
   - 单张「重新同步」只刷封面，不刷日期。

## 目标

- 提供菜单入口「补全缺失发行日期」，通过 `ncm-cli album get` 的 `publishTime` 批量回填 `release_date IS NULL` 的专辑（复用批量补封面的交互与实现模式）。
- 修复新数据写入路径，避免新增专辑继续产生空日期：搜索添加写入 `publishTime`、单张重新同步补日期、同步映射改用北京时间口径。
- 统一 `publishTime → release_date` 的时区换算：publishTime 为北京时间零点的时间戳，现有 UTC 换算会差一天，改为按北京时间（UTC+8）取日期。

## 非目标

- 不改变发行日期的优先级策略：已有日期（含 MB 补全所得）不被 ncm-cli 数据覆盖，仅填充空值。
- 不解决「补全失败专辑永不重试」的通用问题（`enriched_at` 标记策略），仅针对发行日期做增量回填。
- 不修改同步对已存在专辑的整体跳过策略。
