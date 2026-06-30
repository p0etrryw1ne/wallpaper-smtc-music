# 开发与发布

## 环境

- Node.js：用于前端单元测试。
- Rust/Cargo：用于构建 `WallpaperMusicBridge.exe`。
- PowerShell 7 或 Windows PowerShell：用于打包脚本。

## 本地预览

在项目根目录启动静态服务器：

```powershell
py -m http.server 8010
```

常用预览地址：

```text
http://127.0.0.1:8010/?mock=long
http://127.0.0.1:8010/?mock=long&mode=lyrics
http://127.0.0.1:8010/?debug=media
```

`mock` 只在显式传入查询参数时启用。没有 mock 参数时，页面等待 Wallpaper Engine 官方媒体接口或 Bridge 数据，不制造假媒体。

## 测试

前端测试：

```powershell
node --test tests/*.test.mjs
```

Bridge 测试：

```powershell
cargo test --manifest-path bridge/rust-smtc/Cargo.toml
```

发布前建议同时运行：

```powershell
git diff --check
node --test tests/*.test.mjs
cargo test --manifest-path bridge/rust-smtc/Cargo.toml
```

## 打包

正式打包：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/package-release.ps1 -BuildBridge
```

只打包 Wallpaper Engine 文件，不重新构建 Bridge：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/package-release.ps1
```

输出目录：

```text
release/we-smtc
```

发布包面向 Steam 创意工坊用户，只包含壁纸运行必需文件、`LICENSE` 和简短使用说明。Bridge exe 不随 WE 包内置，应作为 GitHub Release 单独附件发布。

发布包会包含：

- `project.json`
- `index.html`
- `src/`
- `assets/`
- `config/lyrics-api-rules.json`
- `preview.gif`
- `bridge/README.md`
- `README.md`（由 `docs/workshop-readme.md` 生成）
- `LICENSE`

发布包不包含：

- `PRIVACY.md`
- `SECURITY.md`
- `THIRD_PARTY.md`
- `docs/`
- `tests/`
- `package.json`
- Bridge 源码
- `bridge/WallpaperMusicBridge.exe`
- `assets/manifest.json`
- `config/settings.schema.json`
- `config/lyrics-providers.json`
- `release/`
- `output/`
- Bridge 构建缓存

## 同步到 Wallpaper Engine 本地项目

Wallpaper Engine 本地项目目录通常类似：

```text
<Steam>\steamapps\common\wallpaper_engine\projects\myprojects\we-smtc
```

同步时应以 `release/we-smtc` 为准，不直接从源码目录复制零散文件。这样可以避免把测试、文档、构建缓存或旧脚本带进 WE 项目。

## GitHub 主线

公开仓库使用干净历史，只保留当前项目文件，不携带旧私有开发仓库的提交历史。

如果需要发布新版本：

1. 确认工作区干净。
2. 运行前端和 Bridge 测试。
3. 更新 `docs/verification/release-candidate.md`。
4. 打包并同步到 WE 项目目录做实机验收。
5. 提交并推送 `main`。
