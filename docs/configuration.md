# 配置与联网

## Wallpaper Engine 设置

`project.json` 是 Wallpaper Engine 读取的用户设置入口。用户在 WE 设置面板中调整的项目都来自这里。

`config/settings.schema.json` 是本项目用于测试和审计的静态契约。运行时不读取它，也不需要 Bridge 支持。测试会用它检查 `project.json` 和前端默认值是否保持一致。

## 设置分类

### 播放器

- `enablePlayer`：启用播放器。
- `defaultVisibility`：默认显示播放器、展开歌词或迷你播放器。
- `hideWhenNoMedia`：无音源时是否隐藏播放器。
- `lyricsStyle`：播放器样式，当前为样式 A 或样式 B。

壁纸交互产生的临时状态不写回这些设置。

### 歌词

- `showLyrics`：启用歌词区域。
- `enableOnlineLyrics`：是否主动请求在线歌词。

关闭在线歌词查询后，壁纸不会主动访问在线歌词源。

### 背景

- `enableCoverBackground`：启用封面背景。
- `customWallpaper`：自定义壁纸文件。
- `customWallpaperBlur`：自定义壁纸模糊强度。
- `coverBackgroundBlur`：封面背景模糊强度。
- `backgroundDim`：暗化效果。

无音源时，封面背景模式会回退到自定义壁纸。

### 媒体源

- `lowPrioritySources`：低优先级媒体源关键词。
- `blockedSources`：屏蔽媒体源关键词。

这两个设置只在 Bridge 服务可用时生效。关键词按 `sourceId` 子串匹配，逗号、分号或换行分隔，大小写不敏感。

## 歌词 API 配置

运行时歌词 API 配置集中在 `config/lyrics-api-rules.json`。Web 壁纸和 Bridge 都读取这一份文件；修改 API 或排序后，刷新壁纸并重启 Bridge 服务即可生效，不需要重新编译 Bridge。

核心结构：

```json
{
  "commonProviders": ["lrclib", "vkeys.qq", "vkeys.netease"],
  "sourceProviders": {
    "qq": {
      "match": ["qqmusic", "tencent"],
      "providers": ["vkeys.qq", "lrclib", "vkeys.netease"]
    },
    "netease": {
      "match": ["cloudmusic", "netease"],
      "providers": ["vkeys.netease", "vkeys.qq", "lrclib"]
    }
  },
  "providerDefinitions": {
    "vkeys.qq": { "type": "search-then-lyric" },
    "vkeys.netease": { "type": "search-then-lyric" },
    "lrclib": { "type": "direct-json" }
  }
}
```

规则：

- 先按媒体源 `sourceId` 匹配 `sourceProviders`。
- 命中专属来源时，使用该来源的 `providers` 顺序。
- 未命中专属来源时，使用 `commonProviders`。
- 用户可以照同样格式新增播放器来源。

`config/lyrics-providers.json` 是审计清单，不是运行时排序配置。它说明各歌词源会访问哪些域名、发送哪些字段，以及发布到创意工坊前需要注意的风险。

## 联网来源

当前可能使用的歌词来源：

- 本机 Bridge：`127.0.0.1:18768`
- VKeys：`api.vkeys.cn`，文档见 https://doc.vkeys.cn/ 和 https://github.com/luoyue712/api-doc
- LRCLIB：`lrclib.net`

在线歌词开启时可能发送：

- 歌名
- 歌手
- 专辑
- 媒体来源
- 部分时长信息

完整隐私说明见 [PRIVACY.md](../PRIVACY.md)，第三方服务和素材审计见 [THIRD_PARTY.md](../THIRD_PARTY.md)。

## 资源审计

`assets/manifest.json` 记录默认壁纸、预览图和 Bridge 图标的来源与授权风险。发布到 Steam 创意工坊前，需要确认这些资源可以再分发。
