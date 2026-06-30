# Bridge 生命周期

Bridge 是可选增强组件。壁纸在没有 Bridge 时仍会使用 Wallpaper Engine 官方媒体接口显示播放器；Bridge 运行时才提供多媒体源切换、指定源控制、音量控制和更完整的时间轴能力。

## 文件

release 包内相关文件：

```text
bridge/WallpaperMusicBridge.exe
```

`WallpaperMusicBridge.exe` 默认以托盘程序启动，不弹控制台窗口。启动后会自动开启内部 HTTP/SMTC 服务，监听 `127.0.0.1:18768`。

托盘菜单：

```text
开机启动
启动服务
停止服务
重启服务
打开状态窗口
退出
```

“服务”不是 Windows Service，而是 Bridge 程序内部的 HTTP/SMTC 服务。点击“停止服务”会释放 `127.0.0.1:18768` 端口，但托盘程序仍在；点击“启动服务”会重新监听该端口。

`开机启动` 写入当前用户注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`，不需要管理员权限。

状态窗口可从托盘菜单打开，也可通过重复启动 `WallpaperMusicBridge.exe` 唤起。窗口内提供服务状态、HTTP 地址、最近错误、程序路径，以及启动、停止、重启、最小化按钮。

## 重复启动

Bridge 监听 `127.0.0.1:18768`。同一路径重复启动不会创建第二个长期运行进程，而是唤起已有实例的状态窗口；推荐通过托盘中的“启动服务/停止服务/重启服务/退出”管理生命周期。

## Wallpaper Engine 集成限制

Wallpaper Engine 的 `usershortcut` 可以让用户配置文件、目录、网页或命令快捷方式，但官方文档说明它只能通过 SceneScript 的 `engine.openUserShortcut()` 从点击事件触发。当前项目是 Web 壁纸，不使用 SceneScript 图层，因此不把 start/stop 按钮塞进前端界面里伪装成原生能力。

Bridge 现在已经在程序自身实现托盘菜单和 HKCU Run 注册，不依赖 Web 壁纸触发。
