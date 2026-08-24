# 任务

- [x] `package.json` 的 `build.files` 增加死重排除项（vue/@vue/@babel/@biomejs/fluent-ffmpeg coverage/better-sqlite3 构建源文件）
- [x] `package.json` 的 `build` 段新增 `electronLanguages: ["zh-CN", "en-US"]`
- [x] 更新 `openspec/specs/release-pipeline/spec.md`：新增「安装包死重依赖排除与语言裁剪」需求
- [x] 验证清单（用户侧）：
  1. `npm run dist` 产出安装包体积预期 ~135MB（原 170MB）
  2. 解包产物中 vue/@vue/@babel/@biomejs 消失、fluent-ffmpeg 无 coverage、better-sqlite3 无 deps/src
  3. 安装后冒烟：列表/搜索/同步、ncm-cli 登录与数据命令、mpv 播放
