//! Tray and notification strings. The window has its own copy in `src/i18n`.
use troy_core::{market::Instrument, storage::Lang};

pub struct Text {
    pub my_gold: &'static str,
    pub other_banks: &'static str,
    pub benchmarks: &'static str,
    pub open: &'static str,
    pub quit: &'static str,
    pub last_alert: &'static str,
    pub alert_title: &'static str,
    pub target: &'static str,
    pub quoted: &'static str,
    pub observed: &'static str,
    pub beijing: &'static str,
}

pub fn text(lang: Lang) -> &'static Text {
    match lang {
        Lang::Zh => &Text {
            my_gold: "我的积存金",
            other_banks: "其他银行",
            benchmarks: "市场基准",
            open: "打开 Troy",
            quit: "退出 Troy",
            last_alert: "最近提醒",
            alert_title: "Troy · 到价提醒",
            target: "目标价",
            quoted: "报价",
            observed: "采集",
            beijing: "北京时间",
        },
        Lang::En => &Text {
            my_gold: "My gold",
            other_banks: "Other banks",
            benchmarks: "Benchmarks",
            open: "Open Troy",
            quit: "Quit Troy",
            last_alert: "Last alert",
            alert_title: "Troy · Price alert",
            target: "target",
            quoted: "Quoted",
            observed: "Observed",
            beijing: "Beijing time",
        },
    }
}

pub fn market(m: Instrument, lang: Lang) -> &'static str {
    match lang {
        Lang::Zh => m.name(),
        Lang::En => m.name_en(),
    }
}
