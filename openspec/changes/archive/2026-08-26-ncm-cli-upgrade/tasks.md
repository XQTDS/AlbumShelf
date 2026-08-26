# 任务

- [x] 调研 0.1.7 登录相关更新：changelog（token 过期自动刷新恢复 + `login --check` 主动续期）、tarball 包结构、两版 package.json 对比（除 version 外完全一致）
- [x] 兼容性实测：临时目录干净安装 0.1.7，`login --check --output json` 输出格式与 0.1.6 一致；`login --help` 选项一致；token 存储模型两版均具备（升级后现有登录态直接可用）
- [x] package.json：`@music163/ncm-cli` 0.1.6 → 0.1.7
- [x] npm install 更新依赖与 package-lock.json（网易镜像源，electron-rebuild 完成）
- [x] 升级后实测：`require.resolve` 入口解析正常；`login --check` 返回已登录（无需重新扫码）
- [x] INSTALL.md：全局 CLI 版本一致性说明同步为 0.1.7
- [x] 更新 openspec/specs/：ncm-cli-adapter 新增「登录态自动续期」要求 + 艺术家命令族预留区版本语境更新；data-sync 登录检查场景补充主动续期语义
- [x] 归档 change 到 openspec/changes/archive/ 并同步 README.md（登录自动续期说明）

## 用户侧验证清单

- [ ] `npm run dev` 启动后登录态正常、不弹登录引导
- [ ] 收藏同步（album collected 分页）正常；当天若报「请求总量超限」为配额问题（-461），与升级无关
- [ ] 在线搜索、热评正常
- [ ] 播放（mpv）正常
- [ ] （长期观察）不再出现每隔一段时间要求重新登录的问题
