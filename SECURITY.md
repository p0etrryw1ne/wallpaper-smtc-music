# 安全策略

## 支持范围

安全修复面向当前 `main` 分支。旧的私有分支或实验分支不承诺维护。

## 漏洞报告

仓库公开后，请优先通过 GitHub Security Advisories 私下报告安全问题。如果该功能不可用，请私下联系仓库维护者，不要直接创建公开 issue。

公开反馈中不要包含密钥、本地文件路径、私人媒体元数据或未经处理的个人截图。

## 本机 Bridge 边界

`WallpaperMusicBridge.exe` 会启动本机 HTTP 服务：

```text
http://127.0.0.1:18768
```

该服务仅供 Wallpaper Engine 页面和本机调试使用，不应暴露到局域网或公网。

Bridge 应满足：

- 只监听本机回环地址；
- 对状态修改请求限制可信来源；
- 避免不必要地记录私人歌曲信息；
- 将媒体控制限制在当前选择的本机 SMTC 媒体源上。

## 隐私敏感区域

在线歌词可能会把媒体信息发送给第三方歌词服务。公开发布或上传 Steam 创意工坊前，请阅读 [PRIVACY.md](PRIVACY.md) 和 [THIRD_PARTY.md](THIRD_PARTY.md)。
