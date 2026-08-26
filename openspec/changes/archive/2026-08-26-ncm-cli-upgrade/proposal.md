# ncm-cli 升级 0.1.7（token 自动刷新）

## Why

用户反馈**登录频繁过期**：每隔一段时间就需要重新扫码登录。ncm-cli 0.1.7（2026-08-25 发布）changelog 唯一功能项即为：

> token 过期后自动刷新恢复，`login --check` 支持主动续期

0.1.6 及更早版本没有刷新行为：token 过期后只能重新扫码。AlbumShelf 每次启动都会调用 `ncm-cli login --check` 检查登录态（`initAuthOnStartup`），升级后启动即触发主动续期，数据命令遇 token 过期时 CLI 内部也会自动刷新恢复，从根上消除"频繁重新登录"。

## What Changes

- **依赖升级**：`@music163/ncm-cli` 0.1.6 → 0.1.7（精确锁定，与既有版本管理策略一致）
- **实测确认的兼容性**（详见 design.md）：
  - 两版 package.json 除 version 外完全相同（依赖树、main、bin、engines 一字不差）→ 纯替换升级
  - `login --check --output json` 输出格式不变（`{"success":true,"message":"已登录实名账号"}`），项目解析代码零改动
  - token 存储模型（tokens.enc.json 的 namedToken/namedRefreshToken/namedTokenExpireAt）0.1.6 已具备 → 升级后旧 token 直接可用，无需重新扫码
  - `login --help` 的 `--check` / `--background` 选项不变，二维码登录流程不受影响
- **文档**：INSTALL.md 全局 CLI 版本一致性说明同步为 0.1.7；README 补充登录自动续期说明；ncm-cli-adapter spec 新增「登录态自动续期」要求

## Capabilities

### Modified Capabilities

- `ncm-cli-adapter`：新增「登录态自动续期（ncm-cli 0.1.7）」要求；艺术家命令族预留区版本语境更新（0.1.6 探测结论沿用至 0.1.7）
- `data-sync`：登录检查场景补充 `login --check` 主动续期语义

## Non-goals

- 不改动代码中沉淀的 0.1.6 行为怪癖注释（`recordCount` 恒为 0、limit 过小 400 等）——0.1.7 未改动相关命令，待配额恢复后实测确认再更新标注
- 不引入应用层定时续期任务——0.1.7 的数据命令自带过期自动刷新 + 启动时 `--check` 主动续期已覆盖现有使用模式
- 不解决 `-461 请求总量超限` 配额问题（与登录过期无关，属独立问题）
- 不承诺永久免登录：refreshToken 本身有网易侧有效期，长期不使用超出该有效期仍需扫码

## Impact

- **依赖**：[package.json](../../../album-shelf/package.json)（0.1.7）、[package-lock.json](../../../album-shelf/package-lock.json)（网易镜像源）
- **文档**：[INSTALL.md](../../../album-shelf/INSTALL.md) 版本说明；[README.md](../../../README.md) 登录说明；openspec/specs/ncm-cli-adapter、openspec/specs/data-sync
