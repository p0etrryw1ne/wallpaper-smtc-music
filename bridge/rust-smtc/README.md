# Rust SMTC Bridge

这是 `WallpaperMusicBridge.exe` 的 Rust 实现。

默认启动为托盘程序，不弹控制台。托盘菜单提供：

```text
开机启动
启动服务
停止服务
重启服务
打开状态窗口
退出
```

内部服务监听 `127.0.0.1:18768`，提供稳定 JSON：

```json
{
  "ok": true,
  "sources": [
    {
      "source_id": "QQMusic.exe",
      "title": "Song",
      "artist": "Artist",
      "album": "Album",
      "playback_state": "Playing",
      "timeline": {
        "status": "known",
        "position": 12.3,
        "duration": 210.0,
        "sampled_at_unix_ms": 1782480000000
      }
    }
  ],
  "error": null
}
```

Bridge 只过滤没有标题、歌手、专辑、封面和时间轴的空 SMTC session，不按播放器名称或 `source_id` 做硬编码合并。前端仍按 Wallpaper Engine 设置里的低优先级/屏蔽规则决定显示和控制哪个源。控制指定 `source_id` 时，Bridge 会把命令发给 Windows 返回的第一个匹配 session；因此“切换到下一源”会按 distinct `source_id` 循环，避免同一应用重复 session 让切换原地打转。

## HTTP API

```text
GET  /v1/health
GET  /v1/sources
GET  /v1/now-playing
POST /v1/selection/next
POST /v1/command
```

`POST /v1/command` 支持：

```text
play-pause
previous
next
volume-down
volume-up
```

请求体可带 `source_id`，用于控制指定 SMTC session。

本机常用验证：

```powershell
cargo check
cargo test
cargo run -- --once
```

实测可以枚举到 `cloudmusic.exe` 和 `QQMusic.exe` 等 SMTC sessions。Bridge 会尽量保留 Windows 返回的媒体事实，不再做同应用 id 的重复源评分或合并；如果某播放器仍产生多个同 id session，需要在播放器/插件侧解决重复 SMTC session。
