//! Windows taskbar thumbnail toolbar: previous, play/pause, next under the preview.
//!
//! ponytail: glyphs are hand-drawn 24×24 bitmaps with partial alpha. Swap in real
//! icon assets if the toolbar ever needs a sharper set.

use std::sync::Mutex;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Glyph {
    Prev,
    Play,
    Pause,
    Next,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ThumbButton {
    glyph: Glyph,
    enabled: bool,
    tip: &'static str,
}

#[cfg_attr(not(windows), allow(dead_code))]
fn transport_buttons(playing: bool, can_prev: bool, can_next: bool) -> [ThumbButton; 3] {
    [
        ThumbButton {
            glyph: Glyph::Prev,
            enabled: can_prev,
            tip: "上一首",
        },
        ThumbButton {
            glyph: if playing { Glyph::Pause } else { Glyph::Play },
            // can_prev is "a track is loaded", which is also when play/pause is usable.
            enabled: can_prev || playing,
            tip: if playing { "暂停" } else { "播放" },
        },
        ThumbButton {
            glyph: Glyph::Next,
            enabled: can_next,
            tip: "下一首",
        },
    ]
}

#[derive(Clone, Copy)]
struct Transport {
    playing: bool,
    can_prev: bool,
    can_next: bool,
}

static TRANSPORT: Mutex<Transport> = Mutex::new(Transport {
    playing: false,
    can_prev: false,
    can_next: false,
});

fn load_transport() -> Transport {
    *TRANSPORT.lock().unwrap_or_else(|err| err.into_inner())
}

fn store_transport(value: Transport) {
    *TRANSPORT.lock().unwrap_or_else(|err| err.into_inner()) = value;
}

#[tauri::command]
pub fn set_taskbar_transport(app: tauri::AppHandle, playing: bool, can_prev: bool, can_next: bool) {
    apply(app, playing, can_prev, can_next);
}

pub fn apply(app: tauri::AppHandle, playing: bool, can_prev: bool, can_next: bool) {
    store_transport(Transport {
        playing,
        can_prev,
        can_next,
    });
    #[cfg(windows)]
    {
        let _ = app.run_on_main_thread(win::refresh);
    }
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(windows)]
pub fn attach(app: tauri::AppHandle, hwnd: windows::Win32::Foundation::HWND) {
    win::attach(app, hwnd);
}

#[cfg(windows)]
mod win {
    use std::sync::atomic::{AtomicPtr, Ordering};

    use windows::core::{w, IUnknown, BOOL};
    use windows::Win32::Foundation::{ERROR_SUCCESS, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::Graphics::Gdi::{
        CreateBitmap, CreateDIBSection, DeleteObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    use windows::Win32::UI::Shell::{
        DefSubclassProc, ITaskbarList3, RemoveWindowSubclass, SetWindowSubclass, TaskbarList,
        THBF_DISABLED, THBF_ENABLED, THBN_CLICKED, THB_FLAGS, THB_ICON, THB_TOOLTIP, THUMBBUTTON,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateIconIndirect, DestroyIcon, PostMessageW, RegisterWindowMessageW, HICON, ICONINFO,
        WM_APP, WM_COMMAND, WM_NCDESTROY, WM_SETTINGCHANGE, WM_SHOWWINDOW,
    };

    use super::{load_transport, transport_buttons, Glyph};

    const SUBCLASS_ID: usize = 0x5A49_504C;
    const ID_PREV: usize = 1;
    const ID_TOGGLE: usize = 2;
    const ID_NEXT: usize = 3;
    const WM_TASKBAR_CMD: u32 = WM_APP + 1;
    /// A step above the 16px thumbnail slot so the glyph stays sharp when the shell scales it.
    const ICON_PX: i32 = 24;
    /// Straight alpha for the glyph body. Edges use less, so the mark reads as slightly glassy.
    const GLYPH_ALPHA: u8 = 188;

    static STATE: AtomicPtr<State> = AtomicPtr::new(std::ptr::null_mut());

    struct State {
        app: tauri::AppHandle,
        hwnd: HWND,
        taskbar: Option<ITaskbarList3>,
        icons: Icons,
        added: bool,
        created_msg: u32,
    }

    struct Icons {
        prev: HICON,
        play: HICON,
        pause: HICON,
        next: HICON,
        light: bool,
    }

    impl Icons {
        fn for_shell() -> Self {
            Self::build(shell_uses_light_theme())
        }

        fn build(light: bool) -> Self {
            // Light preview chrome needs a dark glyph, and the reverse.
            let rgb = if light { 0x20 } else { 0xFF };
            Self {
                prev: hicon(&glyph_canvas(Glyph::Prev, rgb)).unwrap_or_default(),
                play: hicon(&glyph_canvas(Glyph::Play, rgb)).unwrap_or_default(),
                pause: hicon(&glyph_canvas(Glyph::Pause, rgb)).unwrap_or_default(),
                next: hicon(&glyph_canvas(Glyph::Next, rgb)).unwrap_or_default(),
                light,
            }
        }

        fn get(&self, glyph: Glyph) -> HICON {
            match glyph {
                Glyph::Prev => self.prev,
                Glyph::Play => self.play,
                Glyph::Pause => self.pause,
                Glyph::Next => self.next,
            }
        }
    }

    impl Drop for Icons {
        fn drop(&mut self) {
            for icon in [self.prev, self.play, self.pause, self.next] {
                if !icon.is_invalid() {
                    unsafe {
                        let _ = DestroyIcon(icon);
                    }
                }
            }
        }
    }

    pub fn attach(app: tauri::AppHandle, hwnd: HWND) {
        let state = Box::new(State {
            app,
            hwnd,
            taskbar: None,
            icons: Icons::for_shell(),
            added: false,
            created_msg: unsafe { RegisterWindowMessageW(w!("TaskbarButtonCreated")) },
        });
        let ptr = Box::into_raw(state);
        let ok = unsafe { SetWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID, ptr as usize) };
        if ok.as_bool() {
            STATE.store(ptr, Ordering::Release);
            unsafe { sync_buttons(&mut *ptr) };
        } else {
            unsafe { drop(Box::from_raw(ptr)) };
        }
    }

    pub fn refresh() {
        let ptr = STATE.load(Ordering::Acquire);
        if ptr.is_null() {
            return;
        }
        unsafe { sync_buttons(&mut *ptr) };
    }

    unsafe extern "system" fn subclass_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        refdata: usize,
    ) -> LRESULT {
        let state_ptr = refdata as *mut State;
        if state_ptr.is_null() {
            return DefSubclassProc(hwnd, msg, wparam, lparam);
        }
        if msg == WM_NCDESTROY {
            if STATE.load(Ordering::Acquire) == state_ptr {
                STATE.store(std::ptr::null_mut(), Ordering::Release);
            }
            let _ = RemoveWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID);
            drop(Box::from_raw(state_ptr));
            return DefSubclassProc(hwnd, msg, wparam, lparam);
        }

        let state = &mut *state_ptr;
        if state.created_msg != 0 && msg == state.created_msg {
            // The taskbar button was created or recreated; previous buttons are gone.
            state.added = false;
            sync_buttons(state);
            return LRESULT(0);
        }
        if msg == WM_COMMAND {
            let id = wparam.0 & 0xFFFF;
            let code = (wparam.0 >> 16) & 0xFFFF;
            if code == THBN_CLICKED as usize && matches!(id, ID_PREV | ID_TOGGLE | ID_NEXT) {
                // Defer out of this message. Tauri runs main-thread tasks inline, and the
                // shell is still inside the thumbnail click.
                let _ = PostMessageW(Some(hwnd), WM_TASKBAR_CMD, WPARAM(id), LPARAM(0));
                return LRESULT(0);
            }
        }
        if msg == WM_TASKBAR_CMD {
            emit_command(&state.app, wparam.0);
            return LRESULT(0);
        }
        if msg == WM_SHOWWINDOW {
            if wparam.0 == 0 {
                state.added = false;
            } else {
                sync_buttons(state);
            }
        } else if msg == WM_SETTINGCHANGE {
            let light = shell_uses_light_theme();
            if light != state.icons.light {
                state.icons = Icons::build(light);
                if state.added {
                    sync_buttons(state);
                }
            }
        }
        DefSubclassProc(hwnd, msg, wparam, lparam)
    }

    fn emit_command(app: &tauri::AppHandle, id: usize) {
        let action = match id {
            ID_PREV => "prev",
            ID_TOGGLE => "toggle",
            ID_NEXT => "next",
            _ => return,
        };
        use tauri::Emitter;
        let _ = app.emit("taskbar-command", action);
    }

    fn sync_buttons(state: &mut State) {
        if !ensure_taskbar(state) {
            return;
        }
        let buttons = thumb_buttons(&state.icons);
        let Some(taskbar) = state.taskbar.as_ref() else {
            return;
        };
        unsafe {
            if !state.added && taskbar.ThumbBarAddButtons(state.hwnd, &buttons).is_ok() {
                state.added = true;
                return;
            }
            if taskbar.ThumbBarUpdateButtons(state.hwnd, &buttons).is_ok() {
                state.added = true;
            }
        }
    }

    fn ensure_taskbar(state: &mut State) -> bool {
        if state.taskbar.is_some() {
            return true;
        }
        let outer: Option<&IUnknown> = None;
        let created = unsafe {
            CoCreateInstance::<_, ITaskbarList3>(&TaskbarList, outer, CLSCTX_INPROC_SERVER)
        };
        let Ok(taskbar) = created else {
            return false;
        };
        if unsafe { taskbar.HrInit() }.is_err() {
            return false;
        }
        state.taskbar = Some(taskbar);
        true
    }

    fn thumb_buttons(icons: &Icons) -> [THUMBBUTTON; 3] {
        let transport = load_transport();
        let specs = transport_buttons(transport.playing, transport.can_prev, transport.can_next);
        let mut buttons = [THUMBBUTTON::default(); 3];
        let ids = [ID_PREV as u32, ID_TOGGLE as u32, ID_NEXT as u32];
        for (i, spec) in specs.iter().enumerate() {
            buttons[i].dwMask = THB_ICON | THB_TOOLTIP | THB_FLAGS;
            buttons[i].iId = ids[i];
            buttons[i].hIcon = icons.get(spec.glyph);
            buttons[i].szTip = tip(spec.tip);
            buttons[i].dwFlags = if spec.enabled {
                THBF_ENABLED
            } else {
                THBF_DISABLED
            };
        }
        buttons
    }

    fn tip(text: &str) -> [u16; 260] {
        let mut buf = [0u16; 260];
        for (i, unit) in text.encode_utf16().take(259).enumerate() {
            buf[i] = unit;
        }
        buf
    }

    fn shell_uses_light_theme() -> bool {
        // The preview chrome follows the shell, not the app theme.
        dword(w!("SystemUsesLightTheme"))
            .or_else(|| dword(w!("AppsUseLightTheme")))
            .map(|value| value != 0)
            .unwrap_or(true)
    }

    fn dword(name: windows::core::PCWSTR) -> Option<u32> {
        let mut value = 0u32;
        let mut size = std::mem::size_of::<u32>() as u32;
        let status = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"),
                name,
                RRF_RT_REG_DWORD,
                None,
                Some(&mut value as *mut u32 as *mut _),
                Some(&mut size),
            )
        };
        if status == ERROR_SUCCESS {
            Some(value)
        } else {
            None
        }
    }

    struct Canvas {
        px: [u8; (ICON_PX * ICON_PX * 4) as usize],
    }

    impl Canvas {
        fn new() -> Self {
            Self {
                px: [0; (ICON_PX * ICON_PX * 4) as usize],
            }
        }

        fn dot(&mut self, x: i32, y: i32, rgb: u8, alpha: u8) {
            if x < 0 || y < 0 || x >= ICON_PX || y >= ICON_PX || alpha == 0 {
                return;
            }
            let i = ((y * ICON_PX + x) * 4) as usize;
            if alpha <= self.px[i + 3] {
                return;
            }
            self.px[i] = rgb;
            self.px[i + 1] = rgb;
            self.px[i + 2] = rgb;
            self.px[i + 3] = alpha;
        }

        fn fill_rect(&mut self, x0: i32, y0: i32, x1: i32, y1: i32, rgb: u8) {
            for y in y0..y1 {
                for x in x0..x1 {
                    let edge = x == x0 || y == y0 || x + 1 == x1 || y + 1 == y1;
                    let alpha = if edge { GLYPH_ALPHA / 2 } else { GLYPH_ALPHA };
                    self.dot(x, y, rgb, alpha);
                }
            }
        }

        fn fill_tri(&mut self, ax: i32, ay: i32, bx: i32, by: i32, cx: i32, cy: i32, rgb: u8) {
            let (ax, ay, bx, by, cx, cy) = (
                ax as f32, ay as f32, bx as f32, by as f32, cx as f32, cy as f32,
            );
            let area = edge(ax, ay, bx, by, cx, cy);
            if area == 0.0 {
                return;
            }
            let min_x = ax.min(bx).min(cx).floor() as i32;
            let max_x = ax.max(bx).max(cx).ceil() as i32;
            let min_y = ay.min(by).min(cy).floor() as i32;
            let max_y = ay.max(by).max(cy).ceil() as i32;
            for y in min_y..=max_y {
                for x in min_x..=max_x {
                    let mut hit = 0;
                    for oy in [0.25_f32, 0.75] {
                        for ox in [0.25_f32, 0.75] {
                            let px = x as f32 + ox;
                            let py = y as f32 + oy;
                            let w0 = edge(bx, by, cx, cy, px, py);
                            let w1 = edge(cx, cy, ax, ay, px, py);
                            let w2 = edge(ax, ay, bx, by, px, py);
                            let inside = if area > 0.0 {
                                w0 >= 0.0 && w1 >= 0.0 && w2 >= 0.0
                            } else {
                                w0 <= 0.0 && w1 <= 0.0 && w2 <= 0.0
                            };
                            if inside {
                                hit += 1;
                            }
                        }
                    }
                    if hit > 0 {
                        self.dot(x, y, rgb, (GLYPH_ALPHA as i32 * hit / 4) as u8);
                    }
                }
            }
        }

        fn alpha_at(&self, x: i32, y: i32) -> u8 {
            if x < 0 || y < 0 || x >= ICON_PX || y >= ICON_PX {
                return 0;
            }
            self.px[((y * ICON_PX + x) * 4 + 3) as usize]
        }

        /// 1bpp AND mask, bottom-up, leftmost pixel in the high bit. 1 = fully transparent.
        fn mask(&self) -> Vec<u8> {
            let stride = ((ICON_PX as usize + 15) / 16) * 2;
            let mut mask = vec![0u8; stride * ICON_PX as usize];
            for y in 0..ICON_PX {
                let row = (ICON_PX - 1 - y) as usize;
                for x in 0..ICON_PX {
                    if self.alpha_at(x, y) == 0 {
                        let byte = (x / 8) as usize;
                        let bit = 7 - (x % 8);
                        mask[row * stride + byte] |= 1 << bit;
                    }
                }
            }
            mask
        }
    }

    fn edge(ax: f32, ay: f32, bx: f32, by: f32, cx: f32, cy: f32) -> f32 {
        (cx - ax) * (by - ay) - (cy - ay) * (bx - ax)
    }

    fn glyph_canvas(glyph: Glyph, rgb: u8) -> Canvas {
        let mut canvas = Canvas::new();
        match glyph {
            Glyph::Play => canvas.fill_tri(5, 3, 5, 20, 20, 11, rgb),
            Glyph::Pause => {
                canvas.fill_rect(5, 4, 10, 20, rgb);
                canvas.fill_rect(14, 4, 19, 20, rgb);
            }
            Glyph::Prev => {
                canvas.fill_rect(4, 4, 7, 20, rgb);
                canvas.fill_tri(8, 11, 19, 4, 19, 20, rgb);
            }
            Glyph::Next => {
                canvas.fill_tri(5, 4, 5, 20, 16, 11, rgb);
                canvas.fill_rect(17, 4, 20, 20, rgb);
            }
        }
        canvas
    }

    fn hicon(canvas: &Canvas) -> Option<HICON> {
        unsafe {
            let mut info = BITMAPINFO::default();
            info.bmiHeader = BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: ICON_PX,
                biHeight: -ICON_PX,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..BITMAPINFOHEADER::default()
            };
            let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
            let color = CreateDIBSection(None, &info, DIB_RGB_COLORS, &mut bits, None, 0).ok()?;
            if bits.is_null() {
                let _ = DeleteObject(HGDIOBJ::from(color));
                return None;
            }
            // Premultiplied BGRA so the shell keeps the partial alpha instead of the 1bpp mask.
            let mut bgra = canvas.px;
            for px in bgra.chunks_exact_mut(4) {
                let a = px[3] as u16;
                px[0] = (px[0] as u16 * a / 255) as u8;
                px[1] = (px[1] as u16 * a / 255) as u8;
                px[2] = (px[2] as u16 * a / 255) as u8;
            }
            std::ptr::copy_nonoverlapping(bgra.as_ptr(), bits as *mut u8, bgra.len());
            let mask_bytes = canvas.mask();
            let mask = CreateBitmap(ICON_PX, ICON_PX, 1, 1, Some(mask_bytes.as_ptr().cast()));
            if mask.is_invalid() {
                let _ = DeleteObject(HGDIOBJ::from(color));
                return None;
            }
            let icon = CreateIconIndirect(&ICONINFO {
                fIcon: BOOL::from(true),
                xHotspot: 0,
                yHotspot: 0,
                hbmMask: mask,
                hbmColor: color,
            })
            .ok();
            let _ = DeleteObject(HGDIOBJ::from(color));
            let _ = DeleteObject(HGDIOBJ::from(mask));
            icon
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn play_glyph_is_larger_and_translucent() {
            let canvas = glyph_canvas(Glyph::Play, 0xFF);
            let alpha = canvas.alpha_at(12, 11);
            assert!(alpha > 0, "play mark should fill more of the icon");
            assert!(alpha < 255, "play mark should stay slightly translucent");
            assert_eq!(canvas.alpha_at(0, 0), 0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transport_buttons_follow_playback() {
        let paused = transport_buttons(false, true, true);
        assert_eq!(
            paused,
            [
                ThumbButton {
                    glyph: Glyph::Prev,
                    enabled: true,
                    tip: "上一首",
                },
                ThumbButton {
                    glyph: Glyph::Play,
                    enabled: true,
                    tip: "播放",
                },
                ThumbButton {
                    glyph: Glyph::Next,
                    enabled: true,
                    tip: "下一首",
                },
            ]
        );

        let playing = transport_buttons(true, true, false);
        assert_eq!(playing[1].glyph, Glyph::Pause);
        assert_eq!(playing[1].tip, "暂停");
        assert!(playing[1].enabled);
        assert!(!playing[2].enabled);

        let idle = transport_buttons(false, false, false);
        assert!(idle.iter().all(|button| !button.enabled));
    }
}
