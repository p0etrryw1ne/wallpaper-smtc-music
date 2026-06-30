# 文档索引

本目录只放当前新项目的正式文档。本地过程资料、临时验证输出和构建产物不作为发布文档和 GitHub 主线内容。

## 用户文档

- [用户指南](user-guide.md)：安装、Bridge、壁纸交互、常见问题。
- [配置与联网](configuration.md)：Wallpaper Engine 设置、歌词 API、联网与资源风险。
- [隐私说明](../PRIVACY.md)：本地媒体数据、Bridge 和在线歌词请求会处理哪些信息。

## 开发文档

- [开发与发布](development.md)：本地预览、测试、打包、同步到 Wallpaper Engine 项目目录。
- [Bridge 生命周期](bridge-lifecycle.md)：Bridge 托盘、服务、重复启动和 WE 集成边界。
- [Rust SMTC PoC 验证记录](rust-smtc-poc.md)：Rust Bridge 的早期验证背景。
- [第三方说明](../THIRD_PARTY.md)：依赖、外部服务和素材的开源前审计清单。
- [安全策略](../SECURITY.md)：漏洞报告方式和 Bridge 本机服务边界。

## 架构文档

- [InfLink-rs 边界](architecture/inflink-rs-boundary.md)：为什么 Wallpaper Engine 页面不直接调用网易云插件对象。

## 验证文档

- [发布候选验证](verification/release-candidate.md)
- [布局验收](verification/layout-qa.md)
- [Wallpaper Engine 官方媒体接口验收](verification/we-official-media.md)

## 维护文档

- [工作清单](worklist.md)：历史问题、当前处理状态和后续治理方向。
