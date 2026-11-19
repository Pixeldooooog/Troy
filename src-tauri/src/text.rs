//! Tray and notification strings. The window has its own copy in `src/i18n`.
use troy_core::{market::Instrument, storage::Lang};

pub struct Text {
    pub no_alert: &'static str,
    pub open: &'static str,
    pub quit: &'static str,
    pub last_alert: &'static str,
    pub alert_title: &'static str,
    pub target: &'static str,
}

pub fn text(lang: Lang) -> &'static Text {
    match lang {
        Lang::Zh => &Text {
            no_alert: "尚无到价记录",
            open: "打开 Troy",
            quit: "退出 Troy",
            last_alert: "最近提醒",
            alert_title: "Troy · 到价提醒",
            target: "目标价",
        },
        Lang::En => &Text {
            no_alert: "No alerts yet",
            open: "Open Troy",
            quit: "Quit Troy",
            last_alert: "Last alert",
            alert_title: "Troy · Price alert",
            target: "target",
        },
    }
}

pub fn market(m: Instrument, lang: Lang) -> &'static str {
    match lang {
        Lang::Zh => m.name(),
        Lang::En => m.name_en(),
    }
}
