use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::Result;
use tracing::Level;
use tracing_subscriber::layer::Context;
use tracing_subscriber::prelude::*;
use tracing_subscriber::{fmt, Layer};

use crate::core::config::LogConfig;
use crate::core::types::LogLevel;
use crate::paths::LOG_FILE;

pub fn init(verbose: bool, config: &LogConfig) -> Result<()> {
    let level = if verbose {
        tracing::level_filters::LevelFilter::DEBUG
    } else {
        level_filter_from(config.level)
    };

    rotate(Path::new(LOG_FILE), config.max_size, config.max_archives)?;

    let registry = tracing_subscriber::registry()
        .with(KmsgLayer::new("scalpel").with_filter(level))
        .with(FileLayer::new(LOG_FILE, config.max_size, config.max_archives)?.with_filter(level))
        .with(fmt::layer().with_filter(level));

    tracing::subscriber::set_global_default(registry)?;
    Ok(())
}

fn level_filter_from(level: LogLevel) -> tracing::level_filters::LevelFilter {
    match level {
        LogLevel::Debug => tracing::level_filters::LevelFilter::DEBUG,
        LogLevel::Info => tracing::level_filters::LevelFilter::INFO,
        LogLevel::Warn => tracing::level_filters::LevelFilter::WARN,
        LogLevel::Error | LogLevel::Fatal => tracing::level_filters::LevelFilter::ERROR,
    }
}

fn rotate(path: &Path, max_bytes: u64, archives: u32) -> Result<()> {
    let meta = fs::metadata(path).ok();
    if meta.map_or(false, |m| m.len() > max_bytes) {
        for i in (1..archives).rev() {
            let src = format!("{}.{i}", path.display());
            let dst = format!("{}.{}", path.display(), i + 1);
            let _ = fs::rename(&src, &dst);
        }
        let _ = fs::rename(path, format!("{}.1", path.display()));
        let _ = File::create(path);
    }
    Ok(())
}

struct KmsgLayer {
    tag: &'static str,
}

impl KmsgLayer {
    fn new(tag: &'static str) -> Self {
        Self { tag }
    }

    fn write_kmsg(&self, level: &Level, target: &str, msg: &str) {
        let Ok(mut f) = OpenOptions::new().write(true).open("/dev/kmsg") else {
            return;
        };
        let _ = writeln!(f, "{}: [{level}] [{target}] {msg}", self.tag);
    }
}

impl<S> Layer<S> for KmsgLayer
where
    S: tracing::Subscriber,
{
    fn on_event(&self, event: &tracing::Event<'_>, _ctx: Context<'_, S>) {
        let meta = event.metadata();
        let level = meta.level();
        let target = meta.target();

        let mut visitor = MessageVisitor::default();
        event.record(&mut visitor);

        self.write_kmsg(level, target, &visitor.message);
    }
}

struct FileLayer {
    path: PathBuf,
    max_bytes: u64,
    archives: u32,
    file: Mutex<File>,
}

impl FileLayer {
    fn new(path: &str, max_bytes: u64, archives: u32) -> Result<Self> {
        let p = PathBuf::from(path);
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent)?;
        }
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&p)?;
        Ok(Self {
            path: p,
            max_bytes,
            archives,
            file: Mutex::new(file),
        })
    }

    fn maybe_rotate(&self) {
        let needs_rotate = fs::metadata(&self.path)
            .map_or(false, |m| m.len() > self.max_bytes);
        if !needs_rotate {
            return;
        }
        let _ = rotate(&self.path, self.max_bytes, self.archives);
        if let Ok(f) = OpenOptions::new().create(true).append(true).open(&self.path) {
            if let Ok(mut guard) = self.file.lock() {
                *guard = f;
            }
        }
    }
}

impl<S> Layer<S> for FileLayer
where
    S: tracing::Subscriber,
{
    fn on_event(&self, event: &tracing::Event<'_>, _ctx: Context<'_, S>) {
        let meta = event.metadata();
        let level = meta.level();
        let target = meta.target();

        let mut visitor = MessageVisitor::default();
        event.record(&mut visitor);

        let timestamp = unix_timestamp_str();

        if let Ok(mut f) = self.file.lock() {
            let _ = writeln!(f, "[{timestamp}] [{level}] [{target}] {}", visitor.message);
            let _ = f.flush();
        }

        self.maybe_rotate();
    }
}

#[derive(Default)]
struct MessageVisitor {
    message: String,
}

impl tracing::field::Visit for MessageVisitor {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        if field.name() == "message" {
            self.message = format!("{value:?}");
        } else if self.message.is_empty() {
            self.message = format!("{}: {value:?}", field.name());
        } else {
            self.message.push_str(&format!(", {}: {value:?}", field.name()));
        }
    }

    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        if field.name() == "message" {
            self.message = value.to_string();
        } else if self.message.is_empty() {
            self.message = format!("{}: {value}", field.name());
        } else {
            self.message.push_str(&format!(", {}: {value}", field.name()));
        }
    }
}

fn unix_timestamp_str() -> String {
    crate::utils::time::log_timestamp()
}
