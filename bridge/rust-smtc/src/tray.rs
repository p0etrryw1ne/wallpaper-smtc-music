use std::mem::size_of;
use std::path::PathBuf;

use windows::core::{w, Error, PCWSTR};
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::Graphics::Gdi::HBRUSH;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Registry::{
    RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY,
    HKEY_CURRENT_USER, KEY_QUERY_VALUE, KEY_SET_VALUE, REG_SAM_FLAGS, REG_SZ,
};
use windows::Win32::UI::Shell::{
    Shell_NotifyIconW, NIF_ICON, NIF_MESSAGE, NIF_TIP, NIM_ADD, NIM_DELETE, NOTIFYICONDATAW,
};
use windows::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu, DestroyWindow,
    DispatchMessageW, FindWindowW, GetCursorPos, GetMessageW, LoadIconW, PostMessageW,
    PostQuitMessage, RegisterClassW, SetForegroundWindow, SetWindowLongPtrW, TrackPopupMenu,
    TranslateMessage, GWLP_USERDATA, IDI_APPLICATION, MF_CHECKED, MF_GRAYED, MF_SEPARATOR,
    MF_STRING, MSG, TPM_BOTTOMALIGN, TPM_LEFTALIGN, WINDOW_EX_STYLE, WM_COMMAND, WM_DESTROY,
    WM_RBUTTONUP, WM_USER, WNDCLASSW,
};

use crate::service::BridgeService;
use crate::status_window::{self, StatusWindowCommands};

const WM_TRAYICON: u32 = WM_USER + 1;
pub const WM_BRIDGE_SHOW_STATUS: u32 = WM_USER + 20;
const TRAY_UID: u32 = 1;
const ID_STATUS: usize = 1000;
const ID_STARTUP: usize = 1001;
const ID_START: usize = 1002;
const ID_STOP: usize = 1003;
const ID_EXIT: usize = 1004;
const ID_RESTART: usize = 1005;
const RUN_VALUE_NAME: &str = "WallpaperMusicBridge";
const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";

struct TrayState {
    service: BridgeService,
    status_window: Option<HWND>,
}

pub fn run_tray() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    unsafe {
        let instance = GetModuleHandleW(None)?;
        let class_name = w!("WallpaperMusicBridgeTrayWindow");
        let window_class = WNDCLASSW {
            lpfnWndProc: Some(window_proc),
            hInstance: instance.into(),
            lpszClassName: class_name,
            hbrBackground: HBRUSH::default(),
            ..Default::default()
        };

        RegisterClassW(&window_class);
        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            class_name,
            w!("Wallpaper Music Bridge"),
            Default::default(),
            0,
            0,
            0,
            0,
            None,
            None,
            Some(instance.into()),
            None,
        )?;

        let mut state = Box::new(TrayState {
            service: BridgeService::default(),
            status_window: None,
        });
        state.service.start();
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, Box::into_raw(state) as isize);
        if let Err(error) = add_tray_icon(hwnd, instance.into()) {
            eprintln!("failed to add tray icon: {error}");
        }

        let mut message = MSG::default();
        while GetMessageW(&mut message, None, 0, 0).into() {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }

    Ok(())
}

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match message {
        WM_TRAYICON if lparam.0 as u32 == WM_RBUTTONUP => {
            show_menu(hwnd);
            LRESULT(0)
        }
        WM_COMMAND => {
            let command = wparam.0 & 0xffff;
            handle_command(hwnd, command);
            LRESULT(0)
        }
        WM_BRIDGE_SHOW_STATUS => {
            let _ = add_tray_icon(hwnd, HINSTANCE::default());
            show_status_window(hwnd);
            LRESULT(0)
        }
        WM_DESTROY => {
            remove_tray_icon(hwnd);
            let state_ptr = SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0) as *mut TrayState;
            if !state_ptr.is_null() {
                let mut state = Box::from_raw(state_ptr);
                if let Some(status_window) = state.status_window.take() {
                    status_window::destroy(status_window);
                }
                drop(state);
            }
            PostQuitMessage(0);
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, message, wparam, lparam),
    }
}

unsafe fn handle_command(hwnd: HWND, command: usize) {
    match command {
        ID_STATUS => {
            show_status_window(hwnd);
        }
        ID_STARTUP => {
            let enable = !is_startup_enabled();
            let _ = set_startup_enabled(enable);
        }
        ID_START => {
            if let Some(state) = tray_state(hwnd) {
                state.service.start();
                refresh_status_window(state);
            }
        }
        ID_STOP => {
            if let Some(state) = tray_state(hwnd) {
                state.service.stop();
                refresh_status_window(state);
            }
        }
        ID_RESTART => {
            if let Some(state) = tray_state(hwnd) {
                state.service.restart();
                refresh_status_window(state);
            }
        }
        ID_EXIT => {
            let _ = DestroyWindow(hwnd);
        }
        _ => {}
    }
}

unsafe fn show_menu(hwnd: HWND) {
    let menu = CreatePopupMenu().unwrap_or_default();
    let running = tray_state(hwnd).is_some_and(|state| state.service.is_running());
    let startup_flags = if is_startup_enabled() {
        MF_STRING | MF_CHECKED
    } else {
        MF_STRING
    };
    let start_flags = if running {
        MF_STRING | MF_GRAYED
    } else {
        MF_STRING
    };
    let stop_flags = if running {
        MF_STRING
    } else {
        MF_STRING | MF_GRAYED
    };

    let _ = AppendMenuW(menu, MF_STRING, ID_STATUS, w!("打开状态窗口"));
    let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
    let _ = AppendMenuW(menu, startup_flags, ID_STARTUP, w!("开机启动"));
    let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
    let _ = AppendMenuW(menu, start_flags, ID_START, w!("启动服务"));
    let _ = AppendMenuW(menu, stop_flags, ID_STOP, w!("停止服务"));
    let _ = AppendMenuW(menu, MF_STRING, ID_RESTART, w!("重启服务"));
    let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
    let _ = AppendMenuW(menu, MF_STRING, ID_EXIT, w!("退出"));

    let mut point = POINT::default();
    let _ = GetCursorPos(&mut point);
    let _ = SetForegroundWindow(hwnd);
    let _ = TrackPopupMenu(
        menu,
        TPM_LEFTALIGN | TPM_BOTTOMALIGN,
        point.x,
        point.y,
        Some(0),
        hwnd,
        None,
    );
    let _ = DestroyMenu(menu);
}

unsafe fn tray_state<'a>(hwnd: HWND) -> Option<&'a mut TrayState> {
    let ptr = windows::Win32::UI::WindowsAndMessaging::GetWindowLongPtrW(hwnd, GWLP_USERDATA)
        as *mut TrayState;
    ptr.as_mut()
}

unsafe fn show_status_window(hwnd: HWND) {
    let Some(state) = tray_state(hwnd) else {
        return;
    };

    let status = state.service.status();
    if let Some(status_window) = state.status_window {
        status_window::refresh(status_window, &status);
        status_window::show(status_window);
        return;
    }

    match status_window::create(
        hwnd,
        StatusWindowCommands {
            start: ID_START,
            stop: ID_STOP,
            restart: ID_RESTART,
        },
        &status,
    ) {
        Ok(status_window) => state.status_window = Some(status_window),
        Err(error) => eprintln!("failed to create status window: {error}"),
    }
}

unsafe fn refresh_status_window(state: &mut TrayState) {
    if let Some(status_window) = state.status_window {
        status_window::refresh(status_window, &state.service.status());
    }
}

pub fn notify_existing_instance() -> bool {
    unsafe {
        let Ok(hwnd) = FindWindowW(
            w!("WallpaperMusicBridgeTrayWindow"),
            w!("Wallpaper Music Bridge"),
        ) else {
            return false;
        };

        PostMessageW(Some(hwnd), WM_BRIDGE_SHOW_STATUS, WPARAM(0), LPARAM(0)).is_ok()
    }
}

unsafe fn add_tray_icon(hwnd: HWND, instance: HINSTANCE) -> Result<(), Error> {
    let icon =
        LoadIconW(Some(instance), resource_id(1)).or_else(|_| LoadIconW(None, IDI_APPLICATION))?;
    let mut data = NOTIFYICONDATAW {
        cbSize: size_of::<NOTIFYICONDATAW>() as u32,
        hWnd: hwnd,
        uID: TRAY_UID,
        uFlags: NIF_MESSAGE | NIF_ICON | NIF_TIP,
        uCallbackMessage: WM_TRAYICON,
        hIcon: icon,
        ..Default::default()
    };
    write_tip(&mut data, "Wallpaper Music Bridge");
    shell_notify_icon(NIM_ADD, &mut data)
}

fn resource_id(id: u16) -> PCWSTR {
    PCWSTR(id as usize as *const u16)
}

unsafe fn remove_tray_icon(hwnd: HWND) {
    let mut data = NOTIFYICONDATAW {
        cbSize: size_of::<NOTIFYICONDATAW>() as u32,
        hWnd: hwnd,
        uID: TRAY_UID,
        ..Default::default()
    };
    let _ = shell_notify_icon(NIM_DELETE, &mut data);
}

unsafe fn shell_notify_icon(
    message: windows::Win32::UI::Shell::NOTIFY_ICON_MESSAGE,
    data: &mut NOTIFYICONDATAW,
) -> Result<(), Error> {
    if Shell_NotifyIconW(message, data).as_bool() {
        Ok(())
    } else {
        Err(Error::from_thread())
    }
}

fn write_tip(data: &mut NOTIFYICONDATAW, text: &str) {
    let wide = wide_null(text);
    let count = wide.len().min(data.szTip.len());
    data.szTip[..count].copy_from_slice(&wide[..count]);
}

fn is_startup_enabled() -> bool {
    unsafe {
        let Some(key) = open_run_key(KEY_QUERY_VALUE) else {
            return false;
        };
        let name = wide_null(RUN_VALUE_NAME);
        let result = RegQueryValueExW(key, PCWSTR(name.as_ptr()), None, None, None, None);
        let _ = RegCloseKey(key);
        result.is_ok()
    }
}

fn set_startup_enabled(enabled: bool) -> Result<(), Error> {
    unsafe {
        let Some(key) = open_run_key(KEY_SET_VALUE) else {
            return Err(Error::from_thread());
        };
        let name = wide_null(RUN_VALUE_NAME);
        let result = if enabled {
            let command = startup_command()?;
            let bytes =
                std::slice::from_raw_parts(command.as_ptr() as *const u8, command.len() * 2);
            RegSetValueExW(key, PCWSTR(name.as_ptr()), Some(0), REG_SZ, Some(bytes))
        } else {
            RegDeleteValueW(key, PCWSTR(name.as_ptr()))
        };
        let _ = RegCloseKey(key);
        result.ok()
    }
}

unsafe fn open_run_key(access: REG_SAM_FLAGS) -> Option<HKEY> {
    let path = wide_null(RUN_KEY);
    let mut key = HKEY::default();
    match RegOpenKeyExW(
        HKEY_CURRENT_USER,
        PCWSTR(path.as_ptr()),
        Some(0),
        access,
        &mut key,
    )
    .ok()
    {
        Ok(()) => Some(key),
        Err(_) => None,
    }
}

fn startup_command() -> Result<Vec<u16>, Error> {
    let exe = std::env::current_exe().map_err(|_| Error::from_thread())?;
    let command = quote_path(exe);
    Ok(wide_null(&command))
}

fn quote_path(path: PathBuf) -> String {
    format!("\"{}\"", path.display())
}

fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}
