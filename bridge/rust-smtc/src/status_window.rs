use std::mem::size_of;

use windows::core::{w, Error, PCWSTR, PWSTR};
use windows::Win32::Foundation::{COLORREF, HINSTANCE, HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, CreateFontW, CreatePen, CreateSolidBrush, DeleteObject, DrawTextW, EndPaint,
    FillRect, InvalidateRect, RoundRect, SelectObject, SetBkMode, SetTextColor,
    CLIP_DEFAULT_PRECIS, DEFAULT_CHARSET, DEFAULT_QUALITY, DT_CENTER, DT_END_ELLIPSIS, DT_LEFT,
    DT_NOPREFIX, DT_SINGLELINE, DT_TOP, DT_VCENTER, DT_WORDBREAK, FF_DONTCARE, FW_BOLD, FW_NORMAL,
    HBRUSH, HGDIOBJ, OUT_DEFAULT_PRECIS, PAINTSTRUCT, PS_NULL, PS_SOLID, TRANSPARENT,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Controls::{
    TOOLTIPS_CLASSW, TTF_SUBCLASS, TTM_ADDTOOLW, TTM_SETMAXTIPWIDTH, TTM_UPDATETIPTEXTW,
    TTS_ALWAYSTIP, TTS_NOPREFIX, TTTOOLINFOW, WM_MOUSELEAVE,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    ReleaseCapture, SetCapture, TrackMouseEvent, TME_LEAVE, TRACKMOUSEEVENT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, GetClientRect, GetWindowLongPtrW, IsWindow,
    LoadIconW, PostMessageW, RegisterClassW, SendMessageW, SetWindowLongPtrW, ShowWindow,
    GWLP_USERDATA, ICON_BIG, ICON_SMALL, IDI_APPLICATION, SW_RESTORE, SW_SHOW, WINDOW_EX_STYLE,
    WINDOW_STYLE, WM_CLOSE, WM_COMMAND, WM_ERASEBKGND, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE,
    WM_NCDESTROY, WM_PAINT, WM_SETICON, WNDCLASSW, WS_CAPTION, WS_OVERLAPPED, WS_POPUP, WS_SYSMENU,
};

use crate::service::BridgeServiceStatus;

const CLASS_NAME: PCWSTR = w!("WallpaperMusicBridgeStatusWindow");
const STATUS_URL: &str = "http://127.0.0.1:18768";
const STATUS_WIDTH: i32 = 460;
const STATUS_HEIGHT: i32 = 320;
const LEFT: i32 = 24;
const RIGHT: i32 = 24;
const ID_MINIMIZE_BUTTON: usize = 3004;

#[derive(Clone, Copy)]
pub struct StatusWindowCommands {
    pub start: usize,
    pub stop: usize,
    pub restart: usize,
}

struct StatusWindowState {
    owner: HWND,
    commands: StatusWindowCommands,
    status: BridgeServiceStatus,
    model: StatusRenderModel,
    path_tooltip: HWND,
    path_tooltip_text: Vec<u16>,
    hover: Option<ButtonId>,
    pressed: Option<ButtonId>,
}

#[derive(Clone, Debug)]
struct StatusRenderModel {
    badge: &'static str,
    badge_kind: BadgeKind,
    subtitle: &'static str,
    http: &'static str,
    error: String,
    path_display: String,
    path_tooltip: String,
    path_rect: RectI,
    buttons: [ButtonModel; 4],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BadgeKind {
    Running,
    Stopped,
    Error,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ButtonModel {
    id: ButtonId,
    label: &'static str,
    rect: RectI,
    primary: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ButtonId {
    Start,
    Stop,
    Restart,
    Minimize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct RectI {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

impl RectI {
    const fn new(left: i32, top: i32, width: i32, height: i32) -> Self {
        Self {
            left,
            top,
            right: left + width,
            bottom: top + height,
        }
    }

    fn contains(self, x: i32, y: i32) -> bool {
        x >= self.left && x < self.right && y >= self.top && y < self.bottom
    }

    fn to_rect(self) -> RECT {
        RECT {
            left: self.left,
            top: self.top,
            right: self.right,
            bottom: self.bottom,
        }
    }
}

pub unsafe fn create(
    owner: HWND,
    commands: StatusWindowCommands,
    status: &BridgeServiceStatus,
) -> Result<HWND, Error> {
    let instance = GetModuleHandleW(None)?;
    register_class(instance.into());

    let hwnd = CreateWindowExW(
        WINDOW_EX_STYLE::default(),
        CLASS_NAME,
        w!("Wallpaper Music Bridge 状态"),
        WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU,
        200,
        160,
        STATUS_WIDTH,
        STATUS_HEIGHT,
        None,
        None,
        Some(instance.into()),
        None,
    )?;
    set_window_icon(hwnd, instance.into());

    let exe = current_exe_text();
    let model = render_model(status, &exe);
    let mut tooltip_text = wide_null(&model.path_tooltip);
    let path_tooltip = create_tooltip(hwnd, instance.into(), model.path_rect, &mut tooltip_text)?;

    let state = Box::new(StatusWindowState {
        owner,
        commands,
        status: status.clone(),
        model,
        path_tooltip,
        path_tooltip_text: tooltip_text,
        hover: None,
        pressed: None,
    });
    SetWindowLongPtrW(hwnd, GWLP_USERDATA, Box::into_raw(state) as isize);

    refresh(hwnd, status);
    show(hwnd);
    Ok(hwnd)
}

pub unsafe fn show(hwnd: HWND) {
    if IsWindow(Some(hwnd)).as_bool() {
        let _ = ShowWindow(hwnd, SW_SHOW);
        let _ = ShowWindow(hwnd, SW_RESTORE);
    }
}

pub unsafe fn refresh(hwnd: HWND, status: &BridgeServiceStatus) {
    if !IsWindow(Some(hwnd)).as_bool() {
        return;
    }

    let Some(state) = state(hwnd) else {
        return;
    };

    let exe = current_exe_text();
    state.status = status.clone();
    state.model = render_model(status, &exe);
    set_path_tooltip(hwnd, state);
    invalidate(hwnd);
}

pub unsafe fn destroy(hwnd: HWND) {
    if IsWindow(Some(hwnd)).as_bool() {
        let _ = DestroyWindow(hwnd);
    }
}

unsafe fn register_class(instance: HINSTANCE) {
    let class = WNDCLASSW {
        lpfnWndProc: Some(window_proc),
        hInstance: instance,
        lpszClassName: CLASS_NAME,
        hIcon: load_bridge_icon(instance).unwrap_or_default(),
        hbrBackground: HBRUSH::default(),
        ..Default::default()
    };
    let _ = RegisterClassW(&class);
}

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match message {
        WM_PAINT => {
            paint(hwnd);
            LRESULT(0)
        }
        WM_ERASEBKGND => LRESULT(1),
        WM_MOUSEMOVE => {
            handle_mouse_move(hwnd, point_from_lparam(lparam));
            LRESULT(0)
        }
        WM_MOUSELEAVE => {
            if let Some(state) = state(hwnd) {
                state.hover = None;
                invalidate(hwnd);
            }
            LRESULT(0)
        }
        WM_LBUTTONDOWN => {
            handle_mouse_down(hwnd, point_from_lparam(lparam));
            LRESULT(0)
        }
        WM_LBUTTONUP => {
            handle_mouse_up(hwnd, point_from_lparam(lparam));
            LRESULT(0)
        }
        WM_COMMAND => {
            let command = wparam.0 & 0xffff;
            if command == ID_MINIMIZE_BUTTON {
                let _ = ShowWindow(hwnd, windows::Win32::UI::WindowsAndMessaging::SW_HIDE);
            }
            LRESULT(0)
        }
        WM_CLOSE => {
            let _ = ShowWindow(hwnd, windows::Win32::UI::WindowsAndMessaging::SW_HIDE);
            LRESULT(0)
        }
        WM_NCDESTROY => {
            let state_ptr = SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0) as *mut StatusWindowState;
            if !state_ptr.is_null() {
                drop(Box::from_raw(state_ptr));
            }
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, message, wparam, lparam),
    }
}

unsafe fn handle_mouse_move(hwnd: HWND, (x, y): (i32, i32)) {
    let Some(state) = state(hwnd) else {
        return;
    };
    let next_hover = hit_button(&state.model, x, y);
    if state.hover != next_hover {
        state.hover = next_hover;
        invalidate(hwnd);
    }

    let mut event = TRACKMOUSEEVENT {
        cbSize: size_of::<TRACKMOUSEEVENT>() as u32,
        dwFlags: TME_LEAVE,
        hwndTrack: hwnd,
        dwHoverTime: 0,
    };
    let _ = TrackMouseEvent(&mut event);
}

unsafe fn handle_mouse_down(hwnd: HWND, (x, y): (i32, i32)) {
    let Some(state) = state(hwnd) else {
        return;
    };
    state.pressed = hit_button(&state.model, x, y);
    if state.pressed.is_some() {
        let _ = SetCapture(hwnd);
        invalidate(hwnd);
    }
}

unsafe fn handle_mouse_up(hwnd: HWND, (x, y): (i32, i32)) {
    let Some(state) = state(hwnd) else {
        return;
    };
    let pressed = state.pressed.take();
    let released = hit_button(&state.model, x, y);
    let owner = state.owner;
    let commands = state.commands;
    invalidate(hwnd);
    let _ = ReleaseCapture();

    if pressed == released {
        match released {
            Some(ButtonId::Start) => post_owner_command(owner, commands.start),
            Some(ButtonId::Stop) => post_owner_command(owner, commands.stop),
            Some(ButtonId::Restart) => post_owner_command(owner, commands.restart),
            Some(ButtonId::Minimize) => {
                let _ = ShowWindow(hwnd, windows::Win32::UI::WindowsAndMessaging::SW_HIDE);
            }
            None => {}
        }
    }
}

unsafe fn post_owner_command(owner: HWND, command: usize) {
    let _ = PostMessageW(Some(owner), WM_COMMAND, WPARAM(command), LPARAM(0));
}

fn hit_button(model: &StatusRenderModel, x: i32, y: i32) -> Option<ButtonId> {
    model
        .buttons
        .iter()
        .find(|button| button.rect.contains(x, y))
        .map(|button| button.id)
}

unsafe fn paint(hwnd: HWND) {
    let Some(state) = state(hwnd) else {
        return;
    };
    let mut paint = PAINTSTRUCT::default();
    let hdc = BeginPaint(hwnd, &mut paint);
    let mut client = RECT::default();
    let _ = GetClientRect(hwnd, &mut client);

    fill_rect(hdc, client, rgb(247, 248, 251));
    draw_header(hdc, &state.model);
    draw_rows(hdc, &state.model);
    draw_buttons(hdc, &state.model, state.hover, state.pressed);

    let _ = EndPaint(hwnd, &paint);
}

unsafe fn draw_header(hdc: windows::Win32::Graphics::Gdi::HDC, model: &StatusRenderModel) {
    draw_text(
        hdc,
        "Bridge 服务",
        RectI::new(LEFT, 18, 220, 24).to_rect(),
        TextStyle::heading(),
        DT_LEFT | DT_SINGLELINE | DT_VCENTER | DT_NOPREFIX,
    );
    draw_text(
        hdc,
        model.subtitle,
        RectI::new(LEFT, 42, 306, 20).to_rect(),
        TextStyle::muted(),
        DT_LEFT | DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS | DT_NOPREFIX,
    );
    draw_badge(hdc, model.badge, model.badge_kind);
}

unsafe fn draw_badge(hdc: windows::Win32::Graphics::Gdi::HDC, label: &str, kind: BadgeKind) {
    let color = match kind {
        BadgeKind::Running => rgb(18, 138, 82),
        BadgeKind::Stopped => rgb(102, 112, 133),
        BadgeKind::Error => rgb(180, 35, 24),
    };
    let rect = RectI::new(356, 24, 72, 24);
    draw_round_rect(hdc, rect, color, color, 18);
    draw_text(
        hdc,
        label,
        rect.to_rect(),
        TextStyle::badge(),
        DT_CENTER | DT_SINGLELINE | DT_VCENTER | DT_NOPREFIX,
    );
}

unsafe fn draw_rows(hdc: windows::Win32::Graphics::Gdi::HDC, model: &StatusRenderModel) {
    draw_row(hdc, "HTTP", model.http, 76, 28, false);
    draw_row(hdc, "最近错误", &model.error, 110, 28, false);
    draw_row(hdc, "程序路径", &model.path_display, 144, 50, true);
}

unsafe fn draw_row(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    label: &str,
    value: &str,
    y: i32,
    height: i32,
    multiline: bool,
) {
    let row = RectI::new(LEFT, y, STATUS_WIDTH - LEFT - RIGHT, height);
    draw_round_rect(hdc, row, rgb(237, 240, 245), rgb(237, 240, 245), 8);
    draw_text(
        hdc,
        label,
        RectI::new(LEFT + 10, y + 1, 76, height - 2).to_rect(),
        TextStyle::label(),
        DT_LEFT | DT_SINGLELINE | DT_VCENTER | DT_NOPREFIX,
    );
    let flags = if multiline {
        DT_LEFT | DT_TOP | DT_WORDBREAK | DT_END_ELLIPSIS | DT_NOPREFIX
    } else {
        DT_LEFT | DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS | DT_NOPREFIX
    };
    draw_text(
        hdc,
        value,
        RectI::new(
            LEFT + 86,
            y + if multiline { 7 } else { 1 },
            310,
            height - 2,
        )
        .to_rect(),
        TextStyle::value(multiline),
        flags,
    );
}

unsafe fn draw_buttons(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    model: &StatusRenderModel,
    hover: Option<ButtonId>,
    pressed: Option<ButtonId>,
) {
    for button in model.buttons {
        let is_pressed = pressed == Some(button.id);
        let is_hover = hover == Some(button.id);
        let fill = if button.primary {
            if is_pressed {
                rgb(220, 244, 232)
            } else if is_hover {
                rgb(232, 248, 240)
            } else {
                rgb(243, 251, 247)
            }
        } else if is_pressed {
            rgb(226, 230, 236)
        } else if is_hover {
            rgb(246, 248, 251)
        } else {
            rgb(255, 255, 255)
        };
        let border = if button.primary {
            rgb(157, 195, 178)
        } else {
            rgb(200, 206, 216)
        };
        draw_round_rect(hdc, button.rect, fill, border, 8);
        draw_text(
            hdc,
            button.label,
            button.rect.to_rect(),
            if button.primary {
                TextStyle::button_primary()
            } else {
                TextStyle::button()
            },
            DT_CENTER | DT_SINGLELINE | DT_VCENTER | DT_NOPREFIX,
        );
    }
}

#[derive(Clone, Copy)]
struct TextStyle {
    size: i32,
    bold: bool,
    color: COLORREF,
}

impl TextStyle {
    fn heading() -> Self {
        Self {
            size: 16,
            bold: true,
            color: rgb(17, 24, 39),
        }
    }

    fn muted() -> Self {
        Self {
            size: 12,
            bold: false,
            color: rgb(52, 64, 84),
        }
    }

    fn label() -> Self {
        Self {
            size: 12,
            bold: true,
            color: rgb(71, 84, 103),
        }
    }

    fn value(multiline: bool) -> Self {
        Self {
            size: if multiline { 11 } else { 12 },
            bold: false,
            color: rgb(16, 24, 40),
        }
    }

    fn badge() -> Self {
        Self {
            size: 12,
            bold: true,
            color: rgb(255, 255, 255),
        }
    }

    fn button() -> Self {
        Self {
            size: 13,
            bold: true,
            color: rgb(31, 41, 55),
        }
    }

    fn button_primary() -> Self {
        Self {
            size: 13,
            bold: true,
            color: rgb(15, 107, 67),
        }
    }
}

unsafe fn draw_text(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    text: &str,
    mut rect: RECT,
    style: TextStyle,
    format: windows::Win32::Graphics::Gdi::DRAW_TEXT_FORMAT,
) {
    let font = CreateFontW(
        -style.size,
        0,
        0,
        0,
        if style.bold {
            FW_BOLD.0 as i32
        } else {
            FW_NORMAL.0 as i32
        },
        0,
        0,
        0,
        DEFAULT_CHARSET,
        OUT_DEFAULT_PRECIS,
        CLIP_DEFAULT_PRECIS,
        DEFAULT_QUALITY,
        FF_DONTCARE.0 as u32,
        w!("Microsoft YaHei UI"),
    );
    let old_font = SelectObject(hdc, HGDIOBJ(font.0));
    let _ = SetBkMode(hdc, TRANSPARENT);
    let _ = SetTextColor(hdc, style.color);
    let mut wide: Vec<u16> = text.encode_utf16().collect();
    if !wide.is_empty() {
        let _ = DrawTextW(hdc, &mut wide, &mut rect, format);
    }
    let _ = SelectObject(hdc, old_font);
    let _ = DeleteObject(HGDIOBJ(font.0));
}

unsafe fn draw_round_rect(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    rect: RectI,
    fill: COLORREF,
    border: COLORREF,
    radius: i32,
) {
    let brush = CreateSolidBrush(fill);
    let pen = CreatePen(if fill == border { PS_NULL } else { PS_SOLID }, 1, border);
    let old_brush = SelectObject(hdc, HGDIOBJ(brush.0));
    let old_pen = SelectObject(hdc, HGDIOBJ(pen.0));
    let _ = RoundRect(
        hdc,
        rect.left,
        rect.top,
        rect.right,
        rect.bottom,
        radius,
        radius,
    );
    let _ = SelectObject(hdc, old_pen);
    let _ = SelectObject(hdc, old_brush);
    let _ = DeleteObject(HGDIOBJ(pen.0));
    let _ = DeleteObject(HGDIOBJ(brush.0));
}

unsafe fn fill_rect(hdc: windows::Win32::Graphics::Gdi::HDC, rect: RECT, color: COLORREF) {
    let brush = CreateSolidBrush(color);
    let _ = FillRect(hdc, &rect, brush);
    let _ = DeleteObject(HGDIOBJ(brush.0));
}

unsafe fn create_tooltip(
    parent: HWND,
    instance: HINSTANCE,
    rect: RectI,
    text: &mut [u16],
) -> Result<HWND, Error> {
    let tooltip = CreateWindowExW(
        WINDOW_EX_STYLE::default(),
        TOOLTIPS_CLASSW,
        PCWSTR::null(),
        WS_POPUP | WINDOW_STYLE(TTS_ALWAYSTIP | TTS_NOPREFIX),
        0,
        0,
        0,
        0,
        Some(parent),
        None,
        Some(instance),
        None,
    )?;
    let mut tool = tooltip_info(parent, instance, 1, rect, text);
    let _ = SendMessageW(
        tooltip,
        TTM_ADDTOOLW,
        None,
        Some(LPARAM((&mut tool as *mut TTTOOLINFOW) as isize)),
    );
    let _ = SendMessageW(tooltip, TTM_SETMAXTIPWIDTH, None, Some(LPARAM(560)));
    Ok(tooltip)
}

unsafe fn set_path_tooltip(hwnd: HWND, state: &mut StatusWindowState) {
    state.path_tooltip_text = wide_null(&state.model.path_tooltip);
    let mut tool = tooltip_info(
        hwnd,
        HINSTANCE::default(),
        1,
        state.model.path_rect,
        &mut state.path_tooltip_text,
    );
    let _ = SendMessageW(
        state.path_tooltip,
        TTM_UPDATETIPTEXTW,
        None,
        Some(LPARAM((&mut tool as *mut TTTOOLINFOW) as isize)),
    );
}

fn tooltip_info(
    parent: HWND,
    instance: HINSTANCE,
    id: usize,
    rect: RectI,
    text: &mut [u16],
) -> TTTOOLINFOW {
    TTTOOLINFOW {
        cbSize: size_of::<TTTOOLINFOW>() as u32,
        uFlags: TTF_SUBCLASS,
        hwnd: parent,
        uId: id,
        rect: rect.to_rect(),
        hinst: instance,
        lpszText: PWSTR(text.as_mut_ptr()),
        ..Default::default()
    }
}

unsafe fn state<'a>(hwnd: HWND) -> Option<&'a mut StatusWindowState> {
    let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut StatusWindowState;
    ptr.as_mut()
}

unsafe fn invalidate(hwnd: HWND) {
    let _ = InvalidateRect(Some(hwnd), None, true);
}

unsafe fn set_window_icon(hwnd: HWND, instance: HINSTANCE) {
    if let Ok(icon) = load_bridge_icon(instance) {
        let _ = SendMessageW(
            hwnd,
            WM_SETICON,
            Some(WPARAM(ICON_SMALL as usize)),
            Some(LPARAM(icon.0 as isize)),
        );
        let _ = SendMessageW(
            hwnd,
            WM_SETICON,
            Some(WPARAM(ICON_BIG as usize)),
            Some(LPARAM(icon.0 as isize)),
        );
    }
}

unsafe fn load_bridge_icon(
    instance: HINSTANCE,
) -> Result<windows::Win32::UI::WindowsAndMessaging::HICON, Error> {
    LoadIconW(Some(instance), resource_id(1)).or_else(|_| LoadIconW(None, IDI_APPLICATION))
}

fn resource_id(id: u16) -> PCWSTR {
    PCWSTR(id as usize as *const u16)
}

fn render_model(status: &BridgeServiceStatus, path: &str) -> StatusRenderModel {
    let (badge, badge_kind, subtitle) = if status.last_error.is_some() && !status.running {
        ("错误", BadgeKind::Error, "端口被占用或服务启动失败")
    } else if status.running {
        (
            "运行中",
            BadgeKind::Running,
            "用于 SMTC 控制、媒体源切换和歌词同步",
        )
    } else {
        (
            "已停止",
            BadgeKind::Stopped,
            "服务已停止，壁纸将回退可用能力",
        )
    };

    StatusRenderModel {
        badge,
        badge_kind,
        subtitle,
        http: if status.running {
            STATUS_URL
        } else {
            "未监听"
        },
        error: status
            .last_error
            .clone()
            .unwrap_or_else(|| "无".to_string()),
        path_display: format_status_path(path),
        path_tooltip: path.to_string(),
        path_rect: RectI::new(LEFT + 86, 144, 310, 50),
        buttons: button_models(),
    }
}

fn button_models() -> [ButtonModel; 4] {
    [
        ButtonModel {
            id: ButtonId::Start,
            label: "启动",
            rect: RectI::new(24, 220, 90, 32),
            primary: true,
        },
        ButtonModel {
            id: ButtonId::Stop,
            label: "停止",
            rect: RectI::new(126, 220, 90, 32),
            primary: false,
        },
        ButtonModel {
            id: ButtonId::Restart,
            label: "重启",
            rect: RectI::new(228, 220, 90, 32),
            primary: false,
        },
        ButtonModel {
            id: ButtonId::Minimize,
            label: "最小化",
            rect: RectI::new(330, 220, 90, 32),
            primary: false,
        },
    ]
}

fn format_status_path(path: &str) -> String {
    let first_line_chars = 48;
    let second_line_chars = 48;
    let count = path.chars().count();

    if count <= first_line_chars {
        return path.to_string();
    }

    if count <= first_line_chars + second_line_chars {
        let first: String = path.chars().take(first_line_chars).collect();
        let second: String = path.chars().skip(first_line_chars).collect();
        return format!("{first}\r\n{second}");
    }

    let second_keep = second_line_chars.saturating_sub(3);
    let first: String = path.chars().take(first_line_chars).collect();
    let second: String = path
        .chars()
        .rev()
        .take(second_keep)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("{first}\r\n...{second}")
}

fn current_exe_text() -> String {
    std::env::current_exe()
        .map(|path| path.display().to_string())
        .unwrap_or_else(|_| "未知".to_string())
}

fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn point_from_lparam(lparam: LPARAM) -> (i32, i32) {
    let raw = lparam.0 as u32;
    ((raw & 0xffff) as i16 as i32, (raw >> 16) as i16 as i32)
}

const fn rgb(red: u8, green: u8, blue: u8) -> COLORREF {
    COLORREF(red as u32 | ((green as u32) << 8) | ((blue as u32) << 16))
}

#[cfg(test)]
mod tests {
    use super::{format_status_path, render_model, ButtonId};
    use crate::service::BridgeServiceStatus;

    #[test]
    fn status_path_keeps_first_line_after_label_available() {
        let path = "D:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine\\projects\\myprojects\\we-smtc\\bridge\\WallpaperMusicBridge.exe";
        let formatted = format_status_path(path);

        assert!(formatted.starts_with("D:\\Program Files"));
        assert!(!formatted.starts_with("\r\n"));
        assert!(formatted.contains("\r\n"));
        assert!(formatted.lines().count() <= 2);
    }

    #[test]
    fn status_path_compacts_very_long_paths_to_two_lines() {
        let path = "D:\\very\\long\\workspace\\with\\many\\segments\\that\\would\\overflow\\the\\status\\window\\bridge\\rust-smtc\\target\\release\\WallpaperMusicBridge.exe";
        let formatted = format_status_path(path);

        assert!(formatted.starts_with("D:\\very\\long"));
        assert!(formatted.contains("\r\n..."));
        assert!(formatted.ends_with("WallpaperMusicBridge.exe"));
        assert_eq!(formatted.lines().count(), 2);
    }

    #[test]
    fn render_model_keeps_full_path_in_tooltip_and_uses_minimize_action() {
        let path = "D:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine\\projects\\myprojects\\we-smtc\\bridge\\WallpaperMusicBridge.exe";
        let model = render_model(
            &BridgeServiceStatus {
                running: true,
                last_error: None,
            },
            path,
        );

        assert_eq!(model.badge, "运行中");
        assert_eq!(model.path_tooltip, path);
        assert_eq!(model.path_display.lines().count(), 2);
        assert_eq!(model.buttons[3].id, ButtonId::Minimize);
        assert_eq!(model.buttons[3].label, "最小化");
    }
}
