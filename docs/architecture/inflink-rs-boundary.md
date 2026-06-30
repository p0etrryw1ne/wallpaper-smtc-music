# InfLink-rs 集成边界

InfLink-rs 会在网易云音乐 / BetterNCM 插件运行环境中暴露 `window.InfLinkApi`。Wallpaper Engine 的网页壁纸页面不能假设自己的 `window` 中存在这个对象，也不应该直接调用 InfLink-rs API。

后续如果要接入 InfLink-rs，应在网易云 / BetterNCM 侧做一个很薄的适配层。该适配层可以调用 `window.InfLinkApi`，再通过明确的 IPC 或 HTTP 边界，把项目需要的媒体快照和控制能力暴露出来。

Wallpaper Engine 页面仍应只和本项目的 Bridge API 通信。Bridge 可以在内部选择网易云专用 InfLink 适配层或通用 Windows SMTC 路径，但网易云插件细节不应该进入页面级媒体源选择逻辑。
