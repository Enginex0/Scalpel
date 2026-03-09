use std::time::{SystemTime, UNIX_EPOCH};

pub struct CalendarDate {
    pub year: i32,
    pub month: u32,
    pub day: i64,
    pub hour: i64,
    pub minute: i64,
    pub second: i64,
}

pub fn now_utc() -> CalendarDate {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0) as i64;

    let time_of_day = secs % 86400;
    let mut remaining = secs / 86400;

    let mut year = 1970i32;
    loop {
        let yd = if is_leap(year) { 366 } else { 365 };
        if remaining < yd {
            break;
        }
        remaining -= yd;
        year += 1;
    }

    let month_days: &[i64] = if is_leap(year) {
        &[31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        &[31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut month = 0u32;
    for &md in month_days {
        if remaining < md {
            break;
        }
        remaining -= md;
        month += 1;
    }

    CalendarDate {
        year,
        month: month + 1,
        day: remaining + 1,
        hour: time_of_day / 3600,
        minute: (time_of_day % 3600) / 60,
        second: time_of_day % 60,
    }
}

pub fn iso8601() -> String {
    let d = now_utc();
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}+00:00",
        d.year, d.month, d.day, d.hour, d.minute, d.second
    )
}

pub fn log_timestamp() -> String {
    let d = now_utc();
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        d.year, d.month, d.day, d.hour, d.minute, d.second
    )
}

fn is_leap(y: i32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}
