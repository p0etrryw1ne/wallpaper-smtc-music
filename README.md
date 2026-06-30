# Wallpaper SMTC Music

Wallpaper SMTC Music 是一个 Wallpaper Engine Web 音乐壁纸。默认通过 Wallpaper Engine 官方媒体接口显示当前播放信息；可选启动 `WallpaperMusicBridge.exe` 获得多媒体源切换、指定源播放控制、音量控制和更完整的播放进度。

## 功能

- 三种显示状态：播放器、展开歌词、迷你播放器。
- 两种播放器样式：样式 A 为标准播放器，样式 B 为沉浸歌词样式。
- 支持封面、歌名、歌手、播放进度、控制按钮和在线歌词。
- 背景支持自定义壁纸，也可在有封面时使用封面背景。
- Bridge 可选：不开 Bridge 也能显示 Wallpaper Engine 官方媒体信息；启动 Bridge 后启用增强控制。

## 快速使用

1. 普通用户请从 GitHub Releases 下载发布包，不要使用绿色 `Code` 按钮下载源码 ZIP。
2. 在 Wallpaper Engine 中导入或订阅本壁纸。
3. 按需要调整壁纸设置中的播放器、歌词、背景和媒体源规则。
4. 需要播放控制、音量控制或媒体源切换时，从 GitHub Releases 单独下载 Bridge，并放到：

```text
bridge/WallpaperMusicBridge.exe
```

Bridge 是托盘程序，不弹控制台。托盘菜单提供开机启动、启动服务、停止服务、重启服务、打开状态窗口和退出。

源码仓库和 Wallpaper Engine 发布包都不直接内置编译产物。`WallpaperMusicBridge.exe` 会作为 GitHub Release 的单独附件提供。

## 设置与联网

Wallpaper Engine 用户设置来自 `project.json`。常用项包括：

- 播放器：启用播放器、默认显示、无音源是否隐藏、播放器样式。
- 歌词：启用歌词、在线歌词查询。
- 背景：启用封面背景、自定义壁纸、自定义壁纸模糊、封面背景模糊、暗化效果。
- 媒体源：低优先级媒体源、屏蔽媒体源。

在线歌词会把歌名、歌手、来源和部分时间信息发送给歌词服务。关闭“在线歌词查询”后不会主动请求在线歌词源。歌词 API 地址和排序在 `config/lyrics-api-rules.json` 中配置，联网审计清单见 `config/lyrics-providers.json`。

## 开发

常用命令：

```powershell
node --test tests/*.test.mjs
cargo test --manifest-path bridge/rust-smtc/Cargo.toml
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/package-release.ps1 -BuildBridge
```

本地浏览器预览：

```powershell
py -m http.server 8010
```

```text
http://127.0.0.1:8010/?mock=long
http://127.0.0.1:8010/?mock=long&mode=lyrics
```

## 外部歌词服务

歌词API配置路径：.../config/lyrics-api-rules.json

在线歌词可能使用：

- `api.vkeys.cn`
- `lrclib.net`
- 本机 Bridge 端点 `127.0.0.1:18768`

这些服务可能接收歌名、歌手、专辑、媒体源标识和时长等媒体信息。详见 [PRIVACY.md](PRIVACY.md) 和 `config/lyrics-providers.json`。

VKeys API 文档见 [doc.vkeys.cn](https://doc.vkeys.cn/) 和 [luoyue712/api-doc](https://github.com/luoyue712/api-doc)。`api.vkeys.cn` 落月API是第三方聚合 API。LRCLIB 是位于 `lrclib.net` 的公共歌词服务。

感谢以上提供的公共API服务。

## 文档

- [文档索引](docs/README.md)
- [用户指南](docs/user-guide.md)
- [配置与联网](docs/configuration.md)
- [开发与发布](docs/development.md)
- [Bridge 生命周期](docs/bridge-lifecycle.md)
- [发布验证](docs/verification/release-candidate.md)

## 开源、隐私与第三方内容

- 源代码许可证：[LICENSE](LICENSE)
- 安全问题报告：[SECURITY.md](SECURITY.md)
- 隐私与联网说明：[PRIVACY.md](PRIVACY.md)
- 第三方依赖、服务和素材：[THIRD_PARTY.md](THIRD_PARTY.md)

代码采用 MIT License。默认壁纸、预览图、图标和外部歌词服务的授权/合规风险需要单独确认，MIT License 不自动覆盖第三方素材或服务。

## 目录

```text
assets/                 默认壁纸、资源清单
bridge/rust-smtc/       Rust Bridge 源码
config/                 歌词 API、歌词源审计、设置 schema
docs/                   用户、开发、架构和验证文档
scripts/                打包脚本
src/                    Web 壁纸源码
tests/                  Node 单元测试
```
