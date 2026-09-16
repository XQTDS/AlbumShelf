## Requirements

### Requirement: 全量同步 MusicBrainz 风格库

系统 SHALL 提供从 MusicBrainz 拉取官方受控风格词表（https://musicbrainz.org/genres）并全量并入本地 `genre` 表的能力，使用户手动给专辑分配风格时，候选覆盖 MB 全部风格，而不必先手工改库再重启应用。

数据源 SHALL 为 WS/2 `GET /genre/all`（分页，`limit` / `offset`），请求 SHALL 复用既有的 MusicBrainz 客户端（同一 User-Agent 与 1 req/s 限流）。

#### Scenario: 菜单触发全量同步

- **WHEN** 用户点击菜单「数据 → 同步 MusicBrainz 风格库」
- **THEN** 渲染层 SHALL 调用 `genre:librarySyncStart`，主进程 SHALL 分页拉取 MB 全部风格并逐页写入本地风格库

#### Scenario: 分页拉取全部风格

- **WHEN** 主进程执行风格库同步
- **THEN** 系统 SHALL 以 100 条/页循环拉取，直到已处理数达到响应中的 `genre-count` 或返回空页为止
- **AND** 每页写入完成后 SHALL 向渲染层推送一次进度（已处理数 / 总数 / 累计新增 / 累计已存在）

#### Scenario: 页级重试与退避

- **WHEN** 某一页拉取失败（如 MB 返回 429/503 限流）
- **THEN** 系统 SHALL 按 2s / 5s / 10s 的间隔重试该页，最多 4 次尝试（含首次）
- **AND** 全部尝试仍失败时 SHALL 中止同步并返回中止状态与错误信息

#### Scenario: 中止后保留已写入部分

- **WHEN** 同步因拉取失败而中止
- **THEN** 已成功写入的风格 SHALL 保留在库中，SHALL NOT 回滚
- **AND** 渲染层 SHALL 提示已新增/已存在的数量并说明重新运行即可续上

#### Scenario: 进度条展示

- **WHEN** 同步进行中
- **THEN** 渲染层 SHALL 显示进度条，文本包含「正在同步 MusicBrainz 风格库 当前/总数：新增 N 个」
- **AND** 已处理数达到总数后 SHALL 保留约 1 秒再收起进度条

#### Scenario: 并发保护

- **WHEN** 已有风格库同步正在进行，用户再次触发
- **THEN** 主进程 SHALL 拒绝新请求并返回「风格库同步正在进行中」，渲染层 SHALL NOT 重复发起

#### Scenario: 完成提示

- **WHEN** 同步成功完成且新增数大于 0
- **THEN** 系统 SHALL 提示新增数、已存在数与风格总数
- **WHEN** 同步成功完成且新增数为 0
- **THEN** 系统 SHALL 提示风格库已是最新

### Requirement: 同步的幂等与映射安全不变量

风格库同步 SHALL 为纯增量写入，SHALL NOT 破坏数据库中已有的专辑↔风格映射。

同步路径 SHALL NOT 执行 `DELETE FROM genre`、`DELETE FROM album_genre` 或 `UPDATE genre SET name = ?`。（该不变量限定于同步路径；启动期的重复行合并是独立的一次性迁移，见 local-storage spec，二者不冲突。）

#### Scenario: 已有风格按名称保留

- **WHEN** MB 返回的风格名在本地 `genre` 表中已存在（按归一化键比较：去首尾空白 + 折叠连续空白 + 忽略大小写）
- **THEN** 系统 SHALL 复用该行（`existing` 计数 +1），SHALL NOT 新建重复行，SHALL NOT 修改其 `name`
- **AND** 本地风格的大小写与空白形式 SHALL 被保留（如本地为 `Rock`、MB 为 `rock`，不新建也不改名）

#### Scenario: 已有专辑↔风格映射不受影响

- **WHEN** 同步写入任一页
- **THEN** `album_genre` 表 SHALL NOT 被插入、更新或删除
- **AND** 唯一键为 `name` 的 upsert SHALL 只补写空着的来源标记，不触碰 `id` 与 `name`

#### Scenario: 来源标记只补空值

- **WHEN** 本地某风格行的来源标记为空
- **THEN** 系统 SHALL 写入 MB 风格 UUID
- **WHEN** 本地某风格行的来源标记已有值
- **THEN** 系统 SHALL NOT 覆盖

#### Scenario: 重复运行收敛

- **WHEN** 用户在同步完成后再次执行同步
- **THEN** 结果中 `added` SHALL 为 0，全部落入 `existing`，库中风格总数 SHALL 不变

### Requirement: 风格库同步后端接口

系统 SHALL 提供 IPC handler `genre:librarySyncStart` 执行全量同步，并提供 `genre:library` 返回本地全量风格库。

#### Scenario: 触发同步

- **WHEN** 渲染层调用 `genre:librarySyncStart`
- **THEN** 系统 SHALL 返回 `{ added, existing, total, aborted, error? }`，其中 `total` 为 MB 风格总数，`aborted` 表示是否中途中止

#### Scenario: 查询全量风格库

- **WHEN** 渲染层调用 `genre:library`
- **THEN** 系统 SHALL 按名称升序返回本地 `genre` 表的全部风格名（含尚未被任何专辑使用的 MB 风格）

#### Scenario: 同步后刷新候选

- **WHEN** 同步返回（无论成功或中止）
- **THEN** 渲染层 SHALL 重新拉取全量风格库与工具栏筛选建议，使新落库的风格立即可用，无需重启应用
