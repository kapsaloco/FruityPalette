use std::sync::atomic::{AtomicU8, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::POINT;
use windows_sys::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_BACK, VK_ESCAPE, VK_RETURN, VK_SPACE,
};
use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

const IDLE: u8 = 0;
const PICKING: u8 = 1;
const CANCELED: u8 = 2;
static STATE: AtomicU8 = AtomicU8::new(IDLE);

pub fn start() -> Result<(), String> {
    STATE
        .compare_exchange(IDLE, PICKING, Ordering::AcqRel, Ordering::Acquire)
        .map(|_| ())
        .map_err(|_| "Screen picking is already active.".into())
}

pub fn cancel() {
    let _ = STATE.compare_exchange(PICKING, CANCELED, Ordering::AcqRel, Ordering::Acquire);
}

pub fn pick() -> Result<Option<String>, String> {
    let result = wait_for_pick();
    let state = STATE.swap(IDLE, Ordering::AcqRel);
    if state == CANCELED {
        return Ok(None);
    }
    result
}

fn wait_for_pick() -> Result<Option<String>, String> {
    let deadline = Instant::now() + Duration::from_secs(20);
    let key_down = |key| unsafe { GetAsyncKeyState(i32::from(key)) < 0 };
    let mut space_was_down = key_down(VK_SPACE);
    let mut enter_was_down = key_down(VK_RETURN);

    while Instant::now() < deadline {
        if STATE.load(Ordering::Acquire) == CANCELED || key_down(VK_ESCAPE) || key_down(VK_BACK) {
            return Ok(None);
        }
        let space_down = key_down(VK_SPACE);
        let enter_down = key_down(VK_RETURN);
        if (space_down && !space_was_down) || (enter_down && !enter_was_down) {
            return read_cursor_pixel().map(Some);
        }
        space_was_down = space_down;
        enter_was_down = enter_down;
        thread::sleep(Duration::from_millis(20));
    }
    Ok(Some("timeout".into()))
}

fn read_cursor_pixel() -> Result<String, String> {
    let mut cursor = POINT { x: 0, y: 0 };
    let desktop = std::ptr::null_mut();
    // The desktop DC is held only for the single pixel read.
    let color = unsafe {
        if GetCursorPos(&mut cursor) == 0 {
            return Err("Could not locate the pointer.".into());
        }
        let dc = GetDC(desktop);
        if dc.is_null() {
            return Err("Could not access the desktop.".into());
        }
        let color = GetPixel(dc, cursor.x, cursor.y);
        ReleaseDC(desktop, dc);
        color
    };
    if color == u32::MAX {
        return Err("Could not read that screen pixel.".into());
    }
    Ok(format!(
        "#{:02X}{:02X}{:02X}",
        color & 255,
        (color >> 8) & 255,
        (color >> 16) & 255
    ))
}
