# Rust SMTC PoC 验证记录

## 目标

建立一个干净的 Rust PoC，用 Windows SMTC API 枚举当前系统媒体源，并输出稳定 JSON。第一版只读事实，不做网易云特判、不承载歌词逻辑。当前 Bridge 实现已在 PoC 基础上演进：只过滤空媒体 session，不再做重复源评分或合并。

## 当前状态

已创建：

- `bridge/rust-smtc/Cargo.toml`
- `bridge/rust-smtc/src/main.rs`
- `bridge/rust-smtc/README.md`

PoC 输出结构：

- `ok`
- `sources`
- `error`

每个 source 包含：

- `source_id`
- `title`
- `artist`
- `album`
- `playback_state`
- `timeline.status`
- `timeline.position`
- `timeline.duration`

## 本机验证结果

已安装：

```text
rustc 1.96.0
cargo 1.96.0
```

已安装 Visual Studio Build Tools 2022 C++ 工具链，并通过 `VsDevCmd.bat` 注入 MSVC 环境。

已通过：

```powershell
cd <repo>\bridge\rust-smtc
cargo check
cargo run
```

实测输出包含 `cloudmusic.exe` 和 `QQMusic.exe`。当前 Bridge 会原样保留有意义的 SMTC session；如果某播放器仍产生多个同 id session，应在播放器或插件侧关闭重复 SMTC 输出。

## 控制命令验证

已启动临时 Bridge 服务并验证：

```text
POST /v1/command {"command":"play-pause"} -> {"ok":true,"accepted":true}
POST /v1/command {"command":"next"} -> {"ok":true,"accepted":true}
POST /v1/command {"command":"previous"} -> {"ok":true,"accepted":true}
```

实测 `play-pause` 能让 `QQMusic.exe` 的 SMTC 状态在 `GlobalSystemMediaTransportControlsSessionPlaybackStatus(5)` 和 `GlobalSystemMediaTransportControlsSessionPlaybackStatus(4)` 之间切换；`next` 能切到下一首歌。
