# Tasks：macOS arm64 无签名构建与发布

## 1. 打包配置（package.json build 段）

- [x] 新增 `mac` 段：`target: ["dmg", "zip"]`、`arch: ["arm64"]`、`category: "public.app-category.music"`、`artifactName: "${productName}-${version}-${arch}.${ext}"`
- [x] `files` 平台化：全局保留公共 include 与 `!win32/ia32` 排除；darwin/linux 排除移入 `win.files`；新增 `mac.files` 排除 win32/linux 二进制（electron-builder 平台 files 与全局 files 为追加合并，已从 node_modules 源码确认）
- [x] `extraResources`（ncm-configure.bat/.exe）从全局移入 `win` 段，macOS 包不携带
- [x] Windows 配置不变：NSIS target、nsis 段、win icon 引用保持原样

## 2. CI 工作流（release.yml）

- [x] build job 改为矩阵（`strategy.matrix.include` + `fail-fast: false`）：`windows-latest`（win-x64）与 `macos-15`（mac-arm64）
- [x] job 级 `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`（macOS 无签名构建；Windows 无副作用）
- [x] 构建后 `actions/upload-artifact@v5` 上传各平台 `dist/*`，artifact 名按矩阵键区分
- [x] 新增 release job：`needs: build`、`if: startsWith(github.ref, 'refs/tags/v')`，`download-artifact`（merge-multiple）汇总 → 清理非 `.exe/.dmg/.zip` 辅助文件 → `softprops/action-gh-release@v2` 统一创建 Release（`generate_release_notes: true`）
- [x] 保持 npm ci 的 registry 重写（网易镜像约束）与 `permissions: contents: write`

## 3. Spec 更新与归档

- [x] 变更目录下新增 `specs/release-pipeline/spec.md`（ADDED Requirements）
- [x] delta 合并进 `openspec/specs/release-pipeline/spec.md`，本次 change 归档到 `openspec/changes/archive/`

## 4. 文档同步

- [x] `README.md`：发版流程更新为双平台构建；补充 macOS 产物说明与 Gatekeeper 首次打开说明；常用命令表 `npm run dist` 说明平台化
- [x] `album-shelf/INSTALL.md`：方式一拆 Windows / macOS 两小节（dmg 安装、右键打开绕过、Rosetta 提示）；常见问题补 macOS 条目；ncm-configure 备用入口标注"仅 Windows"

## 5. 验证清单（用户手动执行）

- [ ] 推送 v* 标签观察 GitHub Actions：windows 与 macos 两个矩阵 job 均构建成功，release job 创建 Release 且资产含 `*.exe`、`*-arm64.dmg`、`*-arm64.zip`
- [ ] 手动触发 workflow_dispatch：只跑构建不创建 Release
- [ ] Windows 安装包回归：安装、登录、同步、播放正常（产物与改造前布局一致）
- [ ] 真机（Apple Silicon Mac）验证：
  - [ ] 首次打开 dmg 内应用被 Gatekeeper 阻止 → 右键 → 打开后正常启动
  - [ ] 扫码登录、同步专辑、在线搜索、热评正常（ffprobe 探测通过、无 Rosetta 阻塞；若弹出 Rosetta 安装提示，安装后重试）
  - [ ] 播放功能按预期工作（或与 Windows 同等的 mpv 依赖限制）
  - [ ] 数据库读写、封面缓存、设置持久化正常（`~/Library/Application Support/` 下 userData）
  - [ ] 退出应用后进程完全退出（`before-quit` 停止播放兜底逻辑在 macOS 上生效）
