# 第三方说明

本文记录公开仓库或发布到 Steam 创意工坊前需要关注的第三方依赖、服务和素材。

## 代码许可证

项目源代码使用 MIT License，见 [LICENSE](LICENSE)。

MIT License 不自动覆盖下方列出的第三方素材、外部服务或平台规则。

## Rust 依赖

Bridge 使用 crates.io 上的 Rust crate，包括：

- `base64`
- `serde`
- `serde_json`
- `tiny_http`
- `ureq`
- `urlencoding`
- `windows`
- `winresource`

公开发布前，建议使用 `cargo-deny`、`cargo about` 或 `cargo-about` 进行依赖许可证审计。审计生成物不应默认放入运行时发布包，除非明确需要一起发布。

## Node 工具

网页壁纸运行时使用浏览器原生 API。Node 当前只用于测试和项目元数据。

## 外部歌词服务

在线歌词可能使用：

- `api.vkeys.cn`
- `lrclib.net`
- 本机 Bridge 端点 `127.0.0.1:18768`

这些服务可能接收歌名、歌手、专辑、媒体源标识和时长等媒体信息。详见 [PRIVACY.md](PRIVACY.md) 和 `config/lyrics-providers.json`。

VKeys API 文档见 [doc.vkeys.cn](https://doc.vkeys.cn/) 和 [luoyue712/api-doc](https://github.com/luoyue712/api-doc)。`api.vkeys.cn` 是第三方聚合 API，公开发布前需要确认其条款、可用性和可接受用途。LRCLIB 是位于 `lrclib.net` 的公共歌词服务。

## 素材

素材来源记录在 `assets/manifest.json`。

当前公开分发前需要确认的素材：

- `assets/default.png`：由 OpenAI GPT Image 生成，作为项目默认壁纸由仓库维护者分发。
- `preview.gif`：预览图，可能包含第三方封面或背景素材；公开发布前建议使用可再分发素材重新生成。
- `bridge/rust-smtc/assets/icon.ico`：当前许可证未知，公开发布前应替换或确认再分发权利。

## Wallpaper Engine 与 Steam

本项目面向 Wallpaper Engine，用户仍需要 Wallpaper Engine 才能使用壁纸。发布二进制文件或媒体素材前，还需要分别遵守 Steam 创意工坊和 Wallpaper Engine 的发布规则。
