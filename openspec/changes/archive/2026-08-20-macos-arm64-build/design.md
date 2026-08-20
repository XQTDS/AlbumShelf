# 设计：macOS arm64 无签名构建与发布

## 1. Runner 与架构选择

GitHub Actions macOS runner 现状（2026-08）：

| runner | 架构 | 状态 |
|---|---|---|
| `macos-15`（= `macos-latest`） | arm64 | 常规可用 |
| `macos-15-intel` | x64 | 最后一个 Intel 镜像，2027-08 退役 |

**决策**：arm64 先行，矩阵仅 `windows-latest` + `macos-15`。Apple Silicon 是当前 Mac 用户主流；Intel 用户后续需要时在矩阵 `include` 中追加 `macos-15-intel` 一项即可（配置无需其他改动）。x64 追加的成本是又一次全量原生编译（better-sqlite3 无法跨架构复用），故不在本次一次性铺开。

**为何不做 universal 包**：better-sqlite3 是原生模块，universal 合并需要 lipo 两个架构的 `.node` 产物，electron-builder 的 `--universal` 对自定义原生模块处理脆弱。双架构矩阵各产各的 dmg 更简单可靠。

## 2. electron-builder 配置

### 平台 files 合并语义（已从源码确认）

electron-builder 的 `getFileMatchers`（app-builder-lib `fileMatcher.js`）对 `files`/`extraResources` 的处理是：**先追加全局 `config[name]` 的 pattern，再追加平台级 `customBuildOptions[name]` 的 pattern**——平台级是追加而非替换。因此：

- 全局 `files` 保留公共 include（`out/**/*`、`node_modules/**/*`、`package.json`）与全平台通用的 `!win32/ia32` 排除
- `win.files` 追加 darwin/linux 二进制排除
- `mac.files` 追加 win32/linux 二进制排除
- `extraResources` 整体移入 `win` 段（Windows 专用辅助脚本，macOS 包不携带）

### mac 段

```jsonc
"mac": {
  "target": ["dmg", "zip"],
  "arch": ["arm64"],
  "category": "public.app-category.music",
  "artifactName": "${productName}-${version}-${arch}.${ext}"
}
```

- 产物命名 `AlbumShelf-<version>-arm64.dmg/.zip`，与 Windows 的 `AlbumShelf Setup <version>.exe` 无冲突
- 不配置 `icon`：现状 Windows 的 `build/icon.ico` 引用同样缺失（v1.0.0 起使用 Electron 默认图标），macOS 与其对等，图标作为独立 change 后续补齐
- 不做 `notarize`/`hardenedRuntime` 配置（无签名发布）

## 3. ffprobe darwin 二进制的处理

**必须保留 darwin 二进制随 macOS 包分发**：ncm-cli 启动探测的是 `ffprobe-static` / `fluent-ffmpeg` 两个**包的存在性**（模块解析链内），任一缺失即静默降级为无数据命令的精简模式——这个坑在 Windows 打包时已完整踩过一轮（见归档 change 2026-08-18-bundle-ncm-cli）。因此 macOS 包只排除 win32/linux 二进制。

**darwin arm64 二进制的社区疑点**：ffprobe-static 3.1.0 的 `bin/darwin/arm64` 有社区报告称实为 x64 二进制（graphic_video_editor PR #28）。影响评估：

- ncm-cli 的探测只认包存在性，AlbumShelf 用到的数据命令（search/album/comment/sync）不执行 ffprobe 二进制，疑点不阻断核心功能
- 即使二进制确实为 x64，Apple Silicon 上首次执行会触发系统自动提示安装 Rosetta 2，安装后可用
- 列为真机验证点：若实测数据命令正常则无需处理；若确有问题，后续 change 可替换 ffprobe-static 二进制来源

## 4. 无签名构建与 Gatekeeper

- 构建环境设 `CSC_IDENTITY_AUTO_DISCOVERY=false`：跳过证书自动发现（本就没有证书），electron-builder 退化为 **ad-hoc 签名**（arm64 macOS 上运行二进制的最低要求，由 electron-builder 自动完成）
- 分发影响：从 GitHub Release 下载的 dmg 内应用带 quarantine 隔离属性，**首次双击会被 Gatekeeper 阻止**（"无法验证开发者"），用户需右键 → 打开 绕过一次（或 `xattr -cr` 后打开）——与 Windows 未签名的 SmartScreen 提示对等，文档中说明
- 正式签名 + notarytool 公证需要 Apple Developer 账号与证书，作为独立 change 后续评估

## 5. CI 工作流结构

两阶段：**矩阵构建 → 汇总发布**。

```
build (matrix: windows-latest / macos-15)
  ├─ npm ci（registry 重写，同现状）
  ├─ npm run dist（postinstall 的 electron-rebuild 已按当前平台/架构编译 better-sqlite3）
  └─ upload-artifact（各平台 dist 全量，名称 win-x64 / mac-arm64）
        ↓
release (needs: build, if: v* 标签)
  ├─ download-artifact（merge-multiple 平铺到 artifacts/）
  ├─ 清理辅助文件（.blockmap、.yml 等）
  └─ softprops/action-gh-release：files: artifacts/*，generate_release_notes
```

**为何不沿用"各 job 各自创建 Release"**：矩阵并行时多个 job 并发调用 action-gh-release 会竞争创建/更新同一个 Release，release notes 与资产上传存在竞态。汇总到单一 release job 顺序执行，无竞态。

**取舍**：`needs: build` 语义下任一平台构建失败则整个 Release 不创建（修复后重新推标签即可）；`fail-fast: false` 保证单平台失败不打断另一平台的构建验证。

**手动触发护栏保持**：`workflow_dispatch` 只跑 build 阶段（release job 被 `startsWith(github.ref, 'refs/tags/v')` 门控），用于测试构建不产生 Release。

## 6. 已知限制与风险

- **无真机验证**：CI 只能证明"能构建出 dmg/zip"，运行行为（Gatekeeper 绕过、Rosetta 提示、ncm-cli 数据命令、扫码登录、数据库读写）需在真实 Apple Silicon Mac 上验证——tasks.md 附验证清单
- **ffprobe darwin arm64 疑点**：见第 3 节
- **ncm-configure 备用入口 macOS 无等价物**：该 .bat/.exe 为 Windows 专用遗留排查入口，macOS 上排查配置异常只能走终端（应用启动时自动写入内置凭证的机制跨平台一致，正常路径不受影响）
