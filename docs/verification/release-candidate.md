# 发布候选验证

验证日期：2026-06-29

## 代码状态

当前发布来源为项目根目录：

```text
<repo>
```

公开仓库应使用干净历史，不携带旧私有开发仓库提交。

## 自动测试

前端测试：

```powershell
node --test tests/*.test.mjs
```

结果：

```text
296 passed
0 failed
```

Bridge 测试：

```powershell
cargo test --manifest-path bridge/rust-smtc/Cargo.toml
```

结果：

```text
51 passed
0 failed
```

空白检查：

```powershell
git diff --check
```

结果：无错误。

## 打包

命令：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-release.ps1 -BuildBridge
```

输出目录：

```text
release/we-smtc
```

发布包应包含：

```text
assets/
bridge/
bridge/README.md
config/
src/
index.html
preview.gif
project.json
README.md
LICENSE
```

发布包不应包含：

```text
PRIVACY.md
THIRD_PARTY.md
SECURITY.md
docs/
tests/
tools/
package.json
release/
output/
bridge/rust-smtc/target/
bridge/rust-smtc/
bridge/WallpaperMusicBridge.exe
assets/manifest.json
config/settings.schema.json
config/lyrics-providers.json
```

## Bridge 验收

Bridge exe 作为 GitHub Release 单独附件发布，不内置在 Wallpaper Engine 发布包中。

启动：

```powershell
Start-Process .\output\github-release\WallpaperMusicBridge-v0.1.0.exe
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:18768/v1/health
```

期望：

```json
{"ok":true,"service":"wallpaper-music-bridge"}
```

状态窗口与托盘应提供：

```text
开机启动
启动服务
停止服务
重启服务
打开状态窗口
退出
```

同一路径重复启动 `WallpaperMusicBridge.exe` 时，不应创建第二个长期运行实例，应唤起已有实例状态窗口。

## Wallpaper Engine 验收

同步 `release/we-smtc` 到：

```text
<Steam>\steamapps\common\wallpaper_engine\projects\myprojects\we-smtc
```

基础验收：

- Bridge 未运行：壁纸使用 Wallpaper Engine 官方媒体信息；播放控制按官方能力回退。
- Bridge 运行：多媒体源切换、指定源控制、音量和更完整进度可用。
- 停止 Bridge 服务：壁纸不应卡死，应回退官方媒体路径或隐藏播放器。
- 无音源且开启“无音源是否隐藏”：播放器隐藏，背景保持可见。
- 启用封面背景但无音源：回退自定义壁纸。

## 已知限制

- Wallpaper Engine Web 媒体接口不提供稳定播放控制；控制能力依赖 Bridge。
- Bridge 保留 Windows 返回的有意义 SMTC session，不做播放器专用重复源合并。
- 在线歌词依赖外部歌词源命中率和服务稳定性。
- 资源授权需要在公开发布到 Steam 创意工坊前再次确认。
