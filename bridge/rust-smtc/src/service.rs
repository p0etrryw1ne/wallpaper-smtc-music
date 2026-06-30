use std::sync::mpsc;
use std::thread::{self, JoinHandle};

use crate::http;

const BRIDGE_ADDRESS: &str = "127.0.0.1:18768";

#[derive(Debug, Default)]
pub struct BridgeService {
    stop_sender: Option<mpsc::Sender<()>>,
    thread: Option<JoinHandle<()>>,
    last_error: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BridgeServiceStatus {
    pub running: bool,
    pub last_error: Option<String>,
}

impl BridgeService {
    pub fn start(&mut self) -> bool {
        self.start_on_address(BRIDGE_ADDRESS)
    }

    fn start_on_address(&mut self, address: &str) -> bool {
        self.reap_finished();
        if self.thread.is_some() {
            return true;
        }

        let server = match http::bind_server(address) {
            Ok(server) => server,
            Err(error) => {
                let message = format!("bridge server failed to bind {address}: {error}");
                eprintln!("{message}");
                self.last_error = Some(message);
                return false;
            }
        };

        let (stop_sender, stop_receiver) = mpsc::channel();
        let thread = thread::spawn(move || {
            if let Err(error) = http::serve_bound_with_shutdown(server, stop_receiver) {
                if !looks_like_address_in_use(error.as_ref()) {
                    eprintln!("bridge server failed: {error}");
                }
            }
        });

        self.stop_sender = Some(stop_sender);
        self.thread = Some(thread);
        self.last_error = None;
        true
    }

    pub fn stop(&mut self) {
        if let Some(sender) = self.stop_sender.take() {
            let _ = sender.send(());
        }

        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        self.last_error = None;
    }

    pub fn is_running(&mut self) -> bool {
        self.reap_finished();
        self.thread.is_some()
    }

    pub fn restart(&mut self) -> bool {
        self.stop();
        self.start()
    }

    pub fn status(&mut self) -> BridgeServiceStatus {
        self.reap_finished();
        BridgeServiceStatus {
            running: self.thread.is_some(),
            last_error: self.last_error.clone(),
        }
    }

    fn reap_finished(&mut self) {
        if self
            .thread
            .as_ref()
            .is_some_and(|thread| thread.is_finished())
        {
            if let Some(thread) = self.thread.take() {
                let _ = thread.join();
            }
            self.stop_sender = None;
        }
    }
}

impl Drop for BridgeService {
    fn drop(&mut self) {
        self.stop();
    }
}

pub fn looks_like_address_in_use(error: &(dyn std::error::Error + Send + Sync)) -> bool {
    let message = error.to_string().to_ascii_lowercase();
    message.contains("address already in use")
        || message.contains("only one usage of each socket address")
        || message.contains("10048")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn start_reports_failure_when_address_is_already_in_use() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test port should bind");
        let address = listener
            .local_addr()
            .expect("test port should have address")
            .to_string();
        let mut service = BridgeService::default();

        assert!(!service.start_on_address(&address));
        assert!(!service.is_running());
        assert!(service.status().last_error.is_some());
    }

    #[test]
    fn status_reports_running_and_stop_clears_error() {
        let mut service = BridgeService::default();

        assert!(service.start_on_address("127.0.0.1:0"));
        assert!(service.status().running);

        service.stop();
        assert_eq!(
            service.status(),
            BridgeServiceStatus {
                running: false,
                last_error: None,
            }
        );
    }
}
