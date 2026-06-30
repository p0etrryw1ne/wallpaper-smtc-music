#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod http;
mod lyrics;
mod service;
mod single_instance;
mod smtc;
mod state;
mod status_window;
mod tray;

use serde::Serialize;

#[derive(Debug, Serialize)]
struct Snapshot {
    ok: bool,
    sources: Vec<smtc::MediaSource>,
    error: Option<String>,
}

fn main() {
    if std::env::args().any(|arg| arg == "--once") {
        print_once();
        return;
    }

    let Some(_single_instance) = single_instance::SingleInstance::acquire() else {
        let _ = tray::notify_existing_instance();
        return;
    };

    if std::env::args().any(|arg| arg == "--service") {
        run_service_foreground();
        return;
    }

    if let Err(error) = tray::run_tray() {
        eprintln!("tray failed: {error}");
        run_service_foreground();
    }
}

fn run_service_foreground() {
    if let Err(error) = http::serve("127.0.0.1:18768") {
        eprintln!("bridge server failed: {error}");
        std::process::exit(1);
    }
}

fn print_once() {
    let output = match smtc::collect_sources() {
        Ok(sources) => Snapshot {
            ok: true,
            sources,
            error: None,
        },
        Err(error) => Snapshot {
            ok: false,
            sources: Vec::new(),
            error: Some(error.to_string()),
        },
    };

    println!(
        "{}",
        serde_json::to_string(&output).unwrap_or_else(|error| {
            format!(
                r#"{{"ok":false,"sources":[],"error":"json serialization failed: {}"}}"#,
                error
            )
        })
    );
}
