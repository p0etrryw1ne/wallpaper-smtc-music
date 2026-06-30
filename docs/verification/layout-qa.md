# 布局验收

验证对象：`release/we-smtc`，本地地址 `http://127.0.0.1:8012/`。

## 截图视口

已用 Edge headless 生成以下视口截图：

```text
1920x1080 expanded
2560x1440 lyrics
3840x2160 expanded
3840x2560 lyrics
```

截图暂存在 `tmp/screenshots/`，不纳入 release 包。

## 关键测量

在 1920x1080 expanded mock 长歌名下，Edge headless 实际 viewport 为 `1890x985`，测得：

```text
controls bottom margin: 125.75px
album bottom -> title top: 22.64px
artist bottom -> progress top: 22.64px
title marquee distance: 1897px
title marquee duration: 52.69s
title transform changed over 3s: true
```

结论：

- 展开播放器没有贴近底部任务栏区域。
- 歌名为单行 marquee，不再把歌手、进度条和控制按钮向下挤。
- 进度条槽位由 `.progress-slot` 保留；无真实进度时只隐藏条和时间内容，不移除布局空间。
- 歌词模式保持左右分区，右侧歌词列没有贴近屏幕边界。
