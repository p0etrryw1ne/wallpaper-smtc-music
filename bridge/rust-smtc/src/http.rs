use std::io::Read;
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    mpsc, Arc, Mutex,
};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

use crate::lyrics::{self, LyricQuery};
use crate::smtc::{self, MediaSource};
use crate::state::BridgeState;

const SOURCE_CACHE_TTL: Duration = Duration::from_millis(2500);
const STALE_SOURCE_CACHE_TTL: Duration = Duration::from_millis(15_000);
const SOURCE_REFRESH_TIMEOUT: Duration = Duration::from_millis(1800);
const SOURCE_REFRESH_COOLDOWN: Duration = Duration::from_millis(1000);
const MAX_SOURCE_REFRESH_WORKERS: usize = 2;
const COMMAND_TIMEOUT: Duration = Duration::from_millis(1800);
const COMMAND_BODY_LIMIT_BYTES: u64 = 16 * 1024;

#[derive(Debug, Default)]
struct RuntimeState {
    bridge_state: Mutex<BridgeState>,
    source_cache: Mutex<SourceCache>,
    source_refresh_in_flight: Arc<AtomicBool>,
    source_refresh_active_workers: Arc<AtomicUsize>,
    source_refresh_cooldown_until: Mutex<Option<Instant>>,
    command_in_flight: Arc<AtomicBool>,
    service_stop_sender: Mutex<Option<mpsc::Sender<()>>>,
}

impl RuntimeState {
    fn with_service_stop_sender(sender: mpsc::Sender<()>) -> Self {
        Self {
            service_stop_sender: Mutex::new(Some(sender)),
            ..Default::default()
        }
    }
}

#[derive(Clone, Debug, Default)]
struct SourceCache {
    sources: Vec<MediaSource>,
    updated_at: Option<Instant>,
    error: Option<String>,
    refresh_epoch: usize,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    ok: bool,
    service: &'static str,
    executable_path: Option<String>,
}

#[derive(Debug, Serialize)]
struct SourcesResponse {
    ok: bool,
    sources: Vec<MediaSource>,
    stale: bool,
    error: Option<String>,
}

#[derive(Debug)]
struct SourceCollection {
    sources: Vec<MediaSource>,
    stale: bool,
    error: Option<String>,
}

#[derive(Clone, Copy, Debug)]
struct SourceRefreshConfig {
    timeout: Duration,
    cooldown: Duration,
}

impl Default for SourceRefreshConfig {
    fn default() -> Self {
        Self {
            timeout: SOURCE_REFRESH_TIMEOUT,
            cooldown: SOURCE_REFRESH_COOLDOWN,
        }
    }
}

#[derive(Debug, Serialize)]
struct SelectedSourceResponse {
    ok: bool,
    stale: bool,
    error: Option<String>,
    selected_source_id: Option<String>,
    source: Option<MediaSource>,
}

#[derive(Debug, Serialize)]
struct CommandResponse {
    ok: bool,
    accepted: bool,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    ok: bool,
    error: String,
}

struct CommandPermit {
    gate: Arc<AtomicBool>,
}

impl CommandPermit {
    fn try_acquire(gate: &Arc<AtomicBool>) -> Option<Self> {
        gate.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| Self {
                gate: Arc::clone(gate),
            })
    }
}

impl Drop for CommandPermit {
    fn drop(&mut self) {
        self.gate.store(false, Ordering::Release);
    }
}

struct SourceRefreshPermit {
    gate: Arc<AtomicBool>,
}

impl SourceRefreshPermit {
    fn try_acquire(gate: &Arc<AtomicBool>) -> Option<Self> {
        gate.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| Self {
                gate: Arc::clone(gate),
            })
    }
}

impl Drop for SourceRefreshPermit {
    fn drop(&mut self) {
        self.gate.store(false, Ordering::Release);
    }
}

struct SourceRefreshWorkerSlot {
    active_workers: Arc<AtomicUsize>,
}

impl SourceRefreshWorkerSlot {
    fn try_acquire(active_workers: &Arc<AtomicUsize>) -> Option<Self> {
        let mut current = active_workers.load(Ordering::Acquire);
        loop {
            if current >= MAX_SOURCE_REFRESH_WORKERS {
                return None;
            }

            match active_workers.compare_exchange(
                current,
                current + 1,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => {
                    return Some(Self {
                        active_workers: Arc::clone(active_workers),
                    });
                }
                Err(next) => current = next,
            }
        }
    }
}

impl Drop for SourceRefreshWorkerSlot {
    fn drop(&mut self) {
        self.active_workers.fetch_sub(1, Ordering::AcqRel);
    }
}

#[derive(Debug, Deserialize)]
struct CommandRequest {
    command: String,
    source_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SelectionRequest {
    source_id: String,
}

#[derive(Debug, PartialEq, Eq)]
enum BodyReadError {
    Io(String),
    TooLarge,
}

pub fn serve(address: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (_sender, receiver) = mpsc::channel();
    serve_with_shutdown(address, receiver)
}

pub fn serve_with_shutdown(
    address: &str,
    shutdown: mpsc::Receiver<()>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    serve_bound_with_shutdown(bind_server(address)?, shutdown)
}

pub fn bind_server(address: &str) -> Result<Server, Box<dyn std::error::Error + Send + Sync>> {
    Server::http(address)
}

pub fn serve_bound_with_shutdown(
    server: Server,
    shutdown: mpsc::Receiver<()>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (service_stop_sender, service_stop_receiver) = mpsc::channel();
    let state = Arc::new(RuntimeState::with_service_stop_sender(service_stop_sender));
    eprintln!(
        "Wallpaper Music Bridge listening on {:?}",
        server.server_addr()
    );

    loop {
        if shutdown.try_recv().is_ok() || service_stop_receiver.try_recv().is_ok() {
            break;
        }

        if let Some(request) = server.recv_timeout(Duration::from_millis(250))? {
            let state = Arc::clone(&state);
            let _ = std::thread::Builder::new()
                .name("bridge-http-request".to_string())
                .spawn(move || handle_request(request, state));
        }
    }

    Ok(())
}

fn handle_request(mut request: Request, state: Arc<RuntimeState>) {
    let method = request.method().clone();
    let url = request.url().to_string();
    let cors_origin = request_header(&request, "Origin");

    let path = url.split('?').next().unwrap_or("");

    if is_control_post(&method, path) {
        if !control_origin_allowed(cors_origin.as_deref()) {
            let response = json_response(
                StatusCode(403),
                &ErrorResponse {
                    ok: false,
                    error: "forbidden control origin".to_string(),
                },
            );
            let _ = request.respond(with_common_headers(response, cors_origin.as_deref()));
            return;
        }

        if control_request_requires_json_body(path) && !request_content_type_is_json(&request) {
            let response = json_response(
                StatusCode(415),
                &ErrorResponse {
                    ok: false,
                    error: "control requests require application/json".to_string(),
                },
            );
            let _ = request.respond(with_common_headers(response, cors_origin.as_deref()));
            return;
        }
    }

    let result = match (method, path) {
        (Method::Get, "/v1/health") => json_response(
            StatusCode(200),
            &HealthResponse {
                ok: true,
                service: "wallpaper-music-bridge",
                executable_path: current_executable_path(),
            },
        ),
        (Method::Get, "/v1/sources") => {
            sources_response(Arc::clone(&state), request_wants_fresh_sources(&url))
        }
        (Method::Get, "/v1/now-playing") => {
            now_playing_response(Arc::clone(&state), request_wants_fresh_sources(&url))
        }
        (Method::Get, "/v1/lyrics") => lyrics_response(&url),
        (Method::Post, "/v1/selection") => select_source_response(&mut request, Arc::clone(&state)),
        (Method::Post, "/v1/selection/next") => select_next_response(Arc::clone(&state)),
        (Method::Post, "/v1/command") => command_response(&mut request, Arc::clone(&state)),
        (Method::Post, "/v1/service/stop") => service_stop_response(Arc::clone(&state)),
        (Method::Options, _) => empty_response(StatusCode(204)),
        _ => empty_response(StatusCode(404)),
    };

    let _ = request.respond(with_common_headers(result, cors_origin.as_deref()));
}

fn select_source_response(
    request: &mut Request,
    state: Arc<RuntimeState>,
) -> Response<std::io::Cursor<Vec<u8>>> {
    let body = match read_limited_body(request.as_reader(), COMMAND_BODY_LIMIT_BYTES) {
        Ok(body) => body,
        Err(BodyReadError::TooLarge) => {
            return json_response(
                StatusCode(413),
                &selected_source_response(
                    None,
                    false,
                    Some("selection body too large".to_string()),
                ),
            );
        }
        Err(BodyReadError::Io(error)) => {
            return json_response(
                StatusCode(400),
                &selected_source_response(
                    None,
                    false,
                    Some(format!("failed to read selection body: {error}")),
                ),
            );
        }
    };

    let request = match serde_json::from_str::<SelectionRequest>(&body) {
        Ok(request) if !request.source_id.trim().is_empty() => request,
        _ => {
            return json_response(
                StatusCode(400),
                &selected_source_response(
                    None,
                    false,
                    Some("invalid selection request body".to_string()),
                ),
            );
        }
    };

    match resolve_selected_source_for_request(
        &state,
        &request.source_id,
        SourceRefreshConfig::default(),
        || smtc::collect_sources().map_err(|error| error.to_string()),
    ) {
        Ok((source, collection)) => selected_source_http_response(source, &collection),
        Err(error) => json_response(
            StatusCode(503),
            &SourcesResponse {
                ok: false,
                sources: Vec::new(),
                stale: false,
                error: Some(error),
            },
        ),
    }
}

fn selected_source_http_response(
    source: Option<MediaSource>,
    collection: &SourceCollection,
) -> Response<std::io::Cursor<Vec<u8>>> {
    let status = if source.is_some() {
        StatusCode(200)
    } else {
        StatusCode(404)
    };
    let error = if source.is_some() {
        collection.error.clone()
    } else {
        Some("selected source not found".to_string())
    };
    json_response(
        status,
        &selected_source_response(source, collection.stale, error),
    )
}

fn resolve_selected_source_for_request<F>(
    state: &Arc<RuntimeState>,
    source_id: &str,
    refresh_config: SourceRefreshConfig,
    collector: F,
) -> Result<(Option<MediaSource>, SourceCollection), String>
where
    F: FnOnce() -> Result<Vec<MediaSource>, String> + Send + 'static,
{
    if let Some(collection) = cached_source_collection(state, SOURCE_CACHE_TTL, false, None) {
        if let Some(source) = select_source_from_collection(state, &collection, source_id) {
            return Ok((Some(source), collection));
        }
    }

    let collection =
        collect_sources_for_request_with_collector(state, true, refresh_config, collector)?;
    let source = select_source_from_collection(state, &collection, source_id);
    Ok((source, collection))
}

fn select_source_from_collection(
    state: &Arc<RuntimeState>,
    collection: &SourceCollection,
    source_id: &str,
) -> Option<MediaSource> {
    state.bridge_state.lock().ok().and_then(|mut state| {
        state
            .select_source_by_id(&collection.sources, source_id)
            .cloned()
    })
}

fn request_header(request: &Request, name: &str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|header| header.field.to_string().eq_ignore_ascii_case(name))
        .map(|header| header.value.as_str().to_string())
}

fn lyrics_response(url: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    json_response(StatusCode(200), &lyrics::fetch(parse_lyric_query(url)))
}

fn parse_lyric_query(url: &str) -> LyricQuery {
    let mut query = LyricQuery::default();
    let Some(raw_query) = url.split_once('?').map(|(_, query)| query) else {
        return query;
    };

    for pair in raw_query.split('&') {
        let Some((key, value)) = pair.split_once('=') else {
            continue;
        };
        let form_value = value.replace('+', " ");
        let decoded = urlencoding::decode(&form_value)
            .map(|value| value.into_owned())
            .unwrap_or(form_value);
        match key {
            "source_id" | "sourceId" => query.source_id = decoded,
            "title" => query.title = decoded,
            "artist" => query.artist = decoded,
            "duration" => query.duration = decoded.parse::<f64>().ok(),
            _ => {}
        }
    }

    query
}

fn sources_response(
    state: Arc<RuntimeState>,
    force_refresh: bool,
) -> Response<std::io::Cursor<Vec<u8>>> {
    match collect_sources_for_request(&state, force_refresh) {
        Ok(collection) => json_response(
            StatusCode(200),
            &SourcesResponse {
                ok: true,
                sources: collection.sources,
                stale: collection.stale,
                error: collection.error,
            },
        ),
        Err(error) => json_response(
            StatusCode(503),
            &SourcesResponse {
                ok: false,
                sources: Vec::new(),
                stale: false,
                error: Some(error),
            },
        ),
    }
}

fn now_playing_response(
    state: Arc<RuntimeState>,
    force_refresh: bool,
) -> Response<std::io::Cursor<Vec<u8>>> {
    match collect_sources_for_request(&state, force_refresh) {
        Ok(collection) => {
            let source =
                state.bridge_state.lock().ok().and_then(|mut state| {
                    state.resolve_selected_source(&collection.sources).cloned()
                });
            json_response(
                StatusCode(200),
                &selected_source_response(source, collection.stale, collection.error),
            )
        }
        Err(error) => json_response(
            StatusCode(503),
            &SourcesResponse {
                ok: false,
                sources: Vec::new(),
                stale: false,
                error: Some(error),
            },
        ),
    }
}

fn select_next_response(state: Arc<RuntimeState>) -> Response<std::io::Cursor<Vec<u8>>> {
    match collect_sources_for_request(&state, true) {
        Ok(collection) => {
            let source = state
                .bridge_state
                .lock()
                .ok()
                .and_then(|mut state| state.select_next_source(&collection.sources).cloned());
            json_response(
                StatusCode(200),
                &selected_source_response(source, collection.stale, collection.error),
            )
        }
        Err(error) => json_response(
            StatusCode(503),
            &SourcesResponse {
                ok: false,
                sources: Vec::new(),
                stale: false,
                error: Some(error),
            },
        ),
    }
}

fn selected_source_response(
    source: Option<MediaSource>,
    stale: bool,
    error: Option<String>,
) -> SelectedSourceResponse {
    SelectedSourceResponse {
        ok: true,
        stale,
        error,
        selected_source_id: source.as_ref().map(|source| source.source_id.clone()),
        source,
    }
}

fn command_response(
    request: &mut Request,
    state: Arc<RuntimeState>,
) -> Response<std::io::Cursor<Vec<u8>>> {
    let body = match read_limited_body(request.as_reader(), COMMAND_BODY_LIMIT_BYTES) {
        Ok(body) => body,
        Err(BodyReadError::TooLarge) => {
            return json_response(
                StatusCode(413),
                &CommandResponse {
                    ok: false,
                    accepted: false,
                    error: Some("command body too large".to_string()),
                },
            );
        }
        Err(BodyReadError::Io(error)) => {
            return json_response(
                StatusCode(400),
                &CommandResponse {
                    ok: false,
                    accepted: false,
                    error: Some(format!("failed to read command body: {error}")),
                },
            );
        }
    };

    let request = match serde_json::from_str::<CommandRequest>(&body) {
        Ok(request) => request,
        Err(_) => {
            return json_response(StatusCode(400), &invalid_command_request_response());
        }
    };

    let command = match parse_command(&request.command) {
        Some(command) => command,
        None => {
            return json_response(
                StatusCode(400),
                &CommandResponse {
                    ok: false,
                    accepted: false,
                    error: Some("unknown command".to_string()),
                },
            );
        }
    };

    let request_source_id = request
        .source_id
        .as_deref()
        .filter(|source_id| !source_id.trim().is_empty());
    let selected_source_id = request_source_id
        .map(|source_id| source_id.to_string())
        .or_else(|| resolved_selected_source_id(&state));
    if selected_source_id.is_none() && command_requires_selected_source(command) {
        return json_response(
            StatusCode(409),
            &CommandResponse {
                ok: false,
                accepted: false,
                error: Some("no selected SMTC source".to_string()),
            },
        );
    }
    let Some(command_permit) = CommandPermit::try_acquire(&state.command_in_flight) else {
        return json_response(
            StatusCode(429),
            &CommandResponse {
                ok: false,
                accepted: false,
                error: Some("SMTC command already in progress".to_string()),
            },
        );
    };

    match control_source_with_timeout(selected_source_id, command, command_permit) {
        Ok(accepted) => {
            let status = if accepted {
                StatusCode(200)
            } else {
                StatusCode(409)
            };
            json_response(
                status,
                &CommandResponse {
                    ok: accepted,
                    accepted,
                    error: if accepted {
                        None
                    } else {
                        Some("SMTC command was not accepted".to_string())
                    },
                },
            )
        }
        Err(error) => json_response(
            StatusCode(500),
            &CommandResponse {
                ok: false,
                accepted: false,
                error: Some(error.to_string()),
            },
        ),
    }
}

fn invalid_command_request_response() -> CommandResponse {
    CommandResponse {
        ok: false,
        accepted: false,
        error: Some("invalid command request body".to_string()),
    }
}

fn command_requires_selected_source(command: smtc::MediaCommand) -> bool {
    !matches!(
        command,
        smtc::MediaCommand::VolumeDown | smtc::MediaCommand::VolumeUp
    )
}

#[derive(Debug, Serialize)]
struct ServiceStopResponse {
    ok: bool,
    error: Option<String>,
}

fn service_stop_response(state: Arc<RuntimeState>) -> Response<std::io::Cursor<Vec<u8>>> {
    if request_service_stop(&state) {
        json_response(
            StatusCode(200),
            &ServiceStopResponse {
                ok: true,
                error: None,
            },
        )
    } else {
        json_response(
            StatusCode(503),
            &ServiceStopResponse {
                ok: false,
                error: Some("service stop channel is unavailable".to_string()),
            },
        )
    }
}

fn request_service_stop(state: &RuntimeState) -> bool {
    state
        .service_stop_sender
        .lock()
        .ok()
        .and_then(|sender| sender.as_ref().cloned())
        .is_some_and(|sender| sender.send(()).is_ok())
}

fn resolved_selected_source_id(state: &Arc<RuntimeState>) -> Option<String> {
    let collection = collect_sources_for_request(state, false).ok()?;
    state.bridge_state.lock().ok().and_then(|mut state| {
        state
            .resolve_selected_source(&collection.sources)
            .map(|source| source.source_id.clone())
    })
}

fn read_limited_body(reader: &mut dyn Read, limit_bytes: u64) -> Result<String, BodyReadError> {
    let mut body = String::new();
    let mut limited = reader.take(limit_bytes + 1);
    limited
        .read_to_string(&mut body)
        .map_err(|error| BodyReadError::Io(error.to_string()))?;
    if body.len() as u64 > limit_bytes {
        return Err(BodyReadError::TooLarge);
    }
    Ok(body)
}

fn control_source_with_timeout(
    selected_source_id: Option<String>,
    command: smtc::MediaCommand,
    command_permit: CommandPermit,
) -> Result<bool, String> {
    run_command_with_timeout(
        command_permit,
        move || {
            smtc::control_source(selected_source_id.as_deref(), command)
                .map_err(|error| error.to_string())
        },
        COMMAND_TIMEOUT,
    )
}

fn run_command_with_timeout<F>(
    command_permit: CommandPermit,
    work: F,
    timeout: Duration,
) -> Result<bool, String>
where
    F: FnOnce() -> Result<bool, String> + Send + 'static,
{
    let (sender, receiver) = mpsc::channel();
    let _ = std::thread::Builder::new()
        .name("bridge-smtc-command".to_string())
        .spawn(move || {
            let _command_permit = command_permit;
            let result = work();
            let _ = sender.send(result);
        })
        .map_err(|error| format!("failed to start command worker: {error}"))?;

    match receiver.recv_timeout(timeout) {
        Ok(result) => result,
        Err(mpsc::RecvTimeoutError::Timeout) => Err("SMTC command timed out".to_string()),
        Err(mpsc::RecvTimeoutError::Disconnected) => Err("SMTC command worker stopped".to_string()),
    }
}

fn collect_sources_for_request(
    state: &Arc<RuntimeState>,
    force_refresh: bool,
) -> Result<SourceCollection, String> {
    collect_sources_for_request_with_collector(
        state,
        force_refresh,
        SourceRefreshConfig::default(),
        || smtc::collect_sources().map_err(|error| error.to_string()),
    )
}

fn collect_sources_for_request_with_collector<F>(
    state: &Arc<RuntimeState>,
    force_refresh: bool,
    config: SourceRefreshConfig,
    collector: F,
) -> Result<SourceCollection, String>
where
    F: FnOnce() -> Result<Vec<MediaSource>, String> + Send + 'static,
{
    if !force_refresh {
        if let Some(collection) = cached_source_collection(state, SOURCE_CACHE_TTL, false, None) {
            return Ok(collection);
        }
    }

    let Some(_permit) = SourceRefreshPermit::try_acquire(&state.source_refresh_in_flight) else {
        if let Some(collection) = cached_source_collection(
            state,
            STALE_SOURCE_CACHE_TTL,
            true,
            Some("source refresh already in progress".to_string()),
        ) {
            return Ok(collection);
        }
        return Err("source refresh already in progress".to_string());
    };

    if let Some(error) = source_refresh_cooldown_error(state) {
        if let Some(collection) =
            cached_source_collection(state, STALE_SOURCE_CACHE_TTL, true, Some(error.clone()))
        {
            return Ok(collection);
        }
        return Err(error);
    }

    match collect_sources_with_timeout(Arc::clone(state), config.timeout, collector) {
        Ok(sources) => Ok(SourceCollection {
            sources,
            stale: false,
            error: None,
        }),
        Err(error) => {
            let is_timeout = matches!(error, SourceRefreshError::Timeout);
            let should_store_cache_error = !matches!(
                error,
                SourceRefreshError::Timeout | SourceRefreshError::WorkerLimit
            );
            if is_timeout {
                start_source_refresh_cooldown(state, config.cooldown);
            }
            let error = error.message();
            if should_store_cache_error {
                if let Ok(mut cache) = state.source_cache.lock() {
                    cache.error = Some(error.clone());
                }
            }
            if let Some(collection) =
                cached_source_collection(state, STALE_SOURCE_CACHE_TTL, true, Some(error.clone()))
            {
                return Ok(collection);
            }
            if is_timeout {
                if let Ok(mut cache) = state.source_cache.lock() {
                    cache.error = Some(error.clone());
                }
            }
            Err(error)
        }
    }
}

#[derive(Clone, Debug)]
enum SourceRefreshError {
    Timeout,
    WorkerStopped,
    WorkerLimit,
    WorkerStart(String),
    Collector(String),
}

impl SourceRefreshError {
    fn message(&self) -> String {
        match self {
            Self::Timeout => "source refresh timed out".to_string(),
            Self::WorkerStopped => "source refresh worker stopped".to_string(),
            Self::WorkerLimit => "source refresh worker limit reached".to_string(),
            Self::WorkerStart(error) | Self::Collector(error) => error.clone(),
        }
    }
}

fn collect_sources_with_timeout<F>(
    state: Arc<RuntimeState>,
    timeout: Duration,
    collector: F,
) -> Result<Vec<MediaSource>, SourceRefreshError>
where
    F: FnOnce() -> Result<Vec<MediaSource>, String> + Send + 'static,
{
    let Some(worker_slot) =
        SourceRefreshWorkerSlot::try_acquire(&state.source_refresh_active_workers)
    else {
        return Err(SourceRefreshError::WorkerLimit);
    };
    let refresh_epoch = reserve_source_refresh_epoch(&state)?;
    let (sender, receiver) = mpsc::channel();
    let worker_state = Arc::clone(&state);
    let _ = std::thread::Builder::new()
        .name("bridge-smtc-source-refresh".to_string())
        .spawn(move || {
            let _worker_slot = worker_slot;
            let result = collector().map_err(SourceRefreshError::Collector);
            record_source_refresh_result(&worker_state, refresh_epoch, &result);
            let _ = sender.send(result);
        })
        .map_err(|error| {
            rollback_source_refresh_epoch(&state, refresh_epoch);
            SourceRefreshError::WorkerStart(format!(
                "failed to start source refresh worker: {error}"
            ))
        })?;

    match receiver.recv_timeout(timeout) {
        Ok(result) => result,
        Err(mpsc::RecvTimeoutError::Timeout) => Err(SourceRefreshError::Timeout),
        Err(mpsc::RecvTimeoutError::Disconnected) => Err(SourceRefreshError::WorkerStopped),
    }
}

fn reserve_source_refresh_epoch(state: &Arc<RuntimeState>) -> Result<usize, SourceRefreshError> {
    let Ok(mut cache) = state.source_cache.lock() else {
        return Err(SourceRefreshError::WorkerStart(
            "source cache lock poisoned".to_string(),
        ));
    };

    cache.refresh_epoch = cache.refresh_epoch.wrapping_add(1);
    if cache.refresh_epoch == 0 {
        cache.refresh_epoch = 1;
    }
    Ok(cache.refresh_epoch)
}

fn rollback_source_refresh_epoch(state: &Arc<RuntimeState>, refresh_epoch: usize) {
    let Ok(mut cache) = state.source_cache.lock() else {
        return;
    };

    if cache.refresh_epoch == refresh_epoch {
        cache.refresh_epoch = refresh_epoch.saturating_sub(1);
    }
}

fn record_source_refresh_result(
    state: &Arc<RuntimeState>,
    refresh_epoch: usize,
    result: &Result<Vec<MediaSource>, SourceRefreshError>,
) {
    let Ok(mut cache) = state.source_cache.lock() else {
        return;
    };

    if cache.refresh_epoch != refresh_epoch {
        return;
    }

    match result {
        Ok(sources) => {
            cache.sources = sources.clone();
            cache.updated_at = Some(Instant::now());
            cache.error = None;
        }
        Err(error) => {
            cache.error = Some(error.message());
        }
    }
}

fn source_refresh_cooldown_error(state: &Arc<RuntimeState>) -> Option<String> {
    let mut cooldown_until = state.source_refresh_cooldown_until.lock().ok()?;
    match *cooldown_until {
        Some(until) if Instant::now() < until => Some("source refresh timed out".to_string()),
        Some(_) => {
            *cooldown_until = None;
            None
        }
        None => None,
    }
}

fn start_source_refresh_cooldown(state: &Arc<RuntimeState>, cooldown: Duration) {
    if let Ok(mut cooldown_until) = state.source_refresh_cooldown_until.lock() {
        *cooldown_until = Some(Instant::now() + cooldown);
    }
}

fn request_wants_fresh_sources(url: &str) -> bool {
    let Some(raw_query) = url.split_once('?').map(|(_, query)| query) else {
        return false;
    };

    raw_query.split('&').any(|pair| {
        let Some((key, value)) = pair.split_once('=') else {
            return false;
        };
        matches!(key, "fresh" | "refresh") && matches!(value, "1" | "true")
    })
}

fn allowed_cors_origin(origin: Option<&str>) -> Option<String> {
    let origin = origin.map(str::trim).filter(|origin| !origin.is_empty())?;
    let lower = origin.to_ascii_lowercase();
    if lower == "null" {
        return Some("null".to_string());
    }

    for prefix in ["http://127.0.0.1", "http://localhost", "http://[::1]"] {
        if lower == prefix || lower.starts_with(&format!("{prefix}:")) {
            return Some(origin.to_string());
        }
    }

    None
}

fn is_control_post(method: &Method, path: &str) -> bool {
    *method == Method::Post
        && matches!(
            path,
            "/v1/selection" | "/v1/selection/next" | "/v1/command" | "/v1/service/stop"
        )
}

fn control_origin_allowed(origin: Option<&str>) -> bool {
    let Some(origin) = origin.map(str::trim).filter(|origin| !origin.is_empty()) else {
        return false;
    };

    allowed_cors_origin(Some(origin)).is_some()
}

fn control_request_requires_json_body(path: &str) -> bool {
    matches!(path, "/v1/selection" | "/v1/command")
}

fn request_content_type_is_json(request: &Request) -> bool {
    request
        .headers()
        .iter()
        .find(|header| header.field.equiv("content-type"))
        .is_some_and(|header| {
            header
                .value
                .as_str()
                .split(';')
                .next()
                .is_some_and(|value| value.trim().eq_ignore_ascii_case("application/json"))
        })
}

fn cached_source_collection(
    state: &Arc<RuntimeState>,
    max_age: Duration,
    stale: bool,
    error: Option<String>,
) -> Option<SourceCollection> {
    let cache = state.source_cache.lock().ok()?;
    let updated_at = cache.updated_at?;
    if cache.sources.is_empty() || updated_at.elapsed() > max_age {
        return None;
    }

    Some(SourceCollection {
        sources: cache.sources.clone(),
        stale,
        error: error.or_else(|| cache.error.clone()),
    })
}

fn parse_command(command: &str) -> Option<smtc::MediaCommand> {
    match command {
        "play-pause" => Some(smtc::MediaCommand::PlayPause),
        "previous" => Some(smtc::MediaCommand::Previous),
        "next" => Some(smtc::MediaCommand::Next),
        "volume-down" => Some(smtc::MediaCommand::VolumeDown),
        "volume-up" => Some(smtc::MediaCommand::VolumeUp),
        _ => None,
    }
}

fn json_response<T: Serialize>(
    status: StatusCode,
    value: &T,
) -> Response<std::io::Cursor<Vec<u8>>> {
    let body = serde_json::to_vec(value).unwrap_or_else(|error| {
        format!(r#"{{"ok":false,"error":"json serialization failed: {error}"}}"#).into_bytes()
    });

    Response::from_data(body).with_status_code(status)
}

fn empty_response(status: StatusCode) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_data(Vec::new()).with_status_code(status)
}

fn current_executable_path() -> Option<String> {
    std::env::current_exe()
        .ok()
        .map(|path| path.to_string_lossy().to_string())
}

fn with_common_headers(
    response: Response<std::io::Cursor<Vec<u8>>>,
    origin: Option<&str>,
) -> Response<std::io::Cursor<Vec<u8>>> {
    let response = response
        .with_header(Header::from_bytes("content-type", "application/json; charset=utf-8").unwrap())
        .with_header(
            Header::from_bytes("access-control-allow-methods", "GET, POST, OPTIONS").unwrap(),
        )
        .with_header(Header::from_bytes("access-control-allow-headers", "content-type").unwrap());

    if let Some(origin) = allowed_cors_origin(origin) {
        response.with_header(Header::from_bytes("access-control-allow-origin", origin).unwrap())
    } else {
        response
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use std::sync::atomic::AtomicUsize;

    fn test_source(source_id: &str) -> MediaSource {
        MediaSource {
            source_id: source_id.to_string(),
            title: "Song".to_string(),
            artist: String::new(),
            album: String::new(),
            thumbnail: String::new(),
            playback_state: "playing".to_string(),
            timeline: crate::smtc::Timeline {
                status: "unknown".to_string(),
                position: None,
                duration: None,
                sampled_at_unix_ms: None,
            },
        }
    }

    fn source_refresh_test_config() -> SourceRefreshConfig {
        SourceRefreshConfig {
            timeout: Duration::from_millis(20),
            cooldown: Duration::from_millis(100),
        }
    }

    fn cache_sources(state: &Arc<RuntimeState>, sources: Vec<MediaSource>, error: Option<String>) {
        let mut cache = state.source_cache.lock().unwrap();
        cache.sources = sources;
        cache.updated_at = Some(Instant::now());
        cache.error = error;
    }

    fn wait_for_refresh_idle(state: &Arc<RuntimeState>) {
        let deadline = Instant::now() + Duration::from_millis(200);
        while (state.source_refresh_in_flight.load(Ordering::Acquire)
            || state.source_refresh_active_workers.load(Ordering::Acquire) > 0)
            && Instant::now() < deadline
        {
            std::thread::sleep(Duration::from_millis(1));
        }
        assert!(!state.source_refresh_in_flight.load(Ordering::Acquire));
        assert_eq!(
            state.source_refresh_active_workers.load(Ordering::Acquire),
            0
        );
    }

    #[test]
    fn read_limited_body_accepts_body_at_limit() {
        let mut reader = Cursor::new("abcd");

        assert_eq!(read_limited_body(&mut reader, 4).unwrap(), "abcd");
    }

    #[test]
    fn read_limited_body_rejects_body_over_limit() {
        let mut reader = Cursor::new("abcde");

        assert_eq!(
            read_limited_body(&mut reader, 4),
            Err(BodyReadError::TooLarge)
        );
    }

    #[test]
    fn command_gate_allows_only_one_in_flight_command() {
        let gate = Arc::new(AtomicBool::new(false));
        let permit = CommandPermit::try_acquire(&gate).expect("first command should acquire gate");

        assert!(CommandPermit::try_acquire(&gate).is_none());

        drop(permit);
        assert!(CommandPermit::try_acquire(&gate).is_some());
    }

    #[test]
    fn command_timeout_keeps_gate_locked_until_worker_finishes() {
        let gate = Arc::new(AtomicBool::new(false));
        let permit = CommandPermit::try_acquire(&gate).expect("command should acquire gate");
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();

        let result = run_command_with_timeout(
            permit,
            move || {
                started_tx.send(()).unwrap();
                release_rx.recv().unwrap();
                Ok(true)
            },
            Duration::from_millis(10),
        );

        assert_eq!(result, Err("SMTC command timed out".to_string()));
        started_rx.recv_timeout(Duration::from_millis(100)).unwrap();
        assert!(CommandPermit::try_acquire(&gate).is_none());

        release_tx.send(()).unwrap();
        let deadline = Instant::now() + Duration::from_millis(100);
        while CommandPermit::try_acquire(&gate).is_none() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(1));
        }
        assert!(CommandPermit::try_acquire(&gate).is_some());
    }

    #[test]
    fn playback_commands_require_selected_source_but_volume_is_global() {
        assert!(command_requires_selected_source(
            smtc::MediaCommand::PlayPause
        ));
        assert!(command_requires_selected_source(
            smtc::MediaCommand::Previous
        ));
        assert!(command_requires_selected_source(smtc::MediaCommand::Next));
        assert!(!command_requires_selected_source(
            smtc::MediaCommand::VolumeDown
        ));
        assert!(!command_requires_selected_source(
            smtc::MediaCommand::VolumeUp
        ));
    }

    #[test]
    fn selected_source_response_carries_stale_state() {
        let response =
            selected_source_response(None, true, Some("source refresh failed".to_string()));

        assert!(response.ok);
        assert!(response.stale);
        assert_eq!(response.error, Some("source refresh failed".to_string()));
    }

    #[test]
    fn selection_uses_cached_matching_source_without_refreshing() {
        let state = Arc::new(RuntimeState::default());
        cache_sources(&state, vec![test_source("QQMusic.exe")], None);
        let calls = Arc::new(AtomicUsize::new(0));
        let collector_calls = Arc::clone(&calls);

        let (source, collection) = resolve_selected_source_for_request(
            &state,
            "qqmusic.exe",
            source_refresh_test_config(),
            move || {
                collector_calls.fetch_add(1, Ordering::AcqRel);
                Ok(vec![test_source("cloudmusic.exe")])
            },
        )
        .unwrap();

        assert_eq!(source.unwrap().source_id, "QQMusic.exe");
        assert_eq!(collection.sources.len(), 1);
        assert_eq!(calls.load(Ordering::Acquire), 0);
    }

    #[test]
    fn selection_refreshes_when_cached_sources_do_not_contain_target() {
        let state = Arc::new(RuntimeState::default());
        cache_sources(&state, vec![test_source("QQMusic.exe")], None);
        let calls = Arc::new(AtomicUsize::new(0));
        let collector_calls = Arc::clone(&calls);

        let (source, _collection) = resolve_selected_source_for_request(
            &state,
            "cloudmusic.exe",
            source_refresh_test_config(),
            move || {
                collector_calls.fetch_add(1, Ordering::AcqRel);
                Ok(vec![test_source("cloudmusic.exe")])
            },
        )
        .unwrap();

        assert_eq!(source.unwrap().source_id, "cloudmusic.exe");
        assert_eq!(calls.load(Ordering::Acquire), 1);
    }

    #[test]
    fn parse_lyric_query_treats_plus_as_space() {
        let query = parse_lyric_query("/v1/lyrics?title=Pretty+Much&artist=Golden+Fire");

        assert_eq!(query.title, "Pretty Much");
        assert_eq!(query.artist, "Golden Fire");
    }

    #[test]
    fn fresh_source_requests_bypass_cache() {
        assert!(request_wants_fresh_sources("/v1/sources?fresh=1"));
        assert!(request_wants_fresh_sources("/v1/sources?refresh=true"));
        assert!(!request_wants_fresh_sources("/v1/sources"));
        assert!(!request_wants_fresh_sources("/v1/sources?fresh=0"));
    }

    #[test]
    fn cors_origin_is_limited_to_wallpaper_and_localhost_contexts() {
        assert_eq!(allowed_cors_origin(Some("null")), Some("null".to_string()));
        assert_eq!(
            allowed_cors_origin(Some("http://127.0.0.1:8000")),
            Some("http://127.0.0.1:8000".to_string())
        );
        assert_eq!(
            allowed_cors_origin(Some("http://localhost:8011")),
            Some("http://localhost:8011".to_string())
        );
        assert_eq!(allowed_cors_origin(Some("https://example.com")), None);
        assert_eq!(allowed_cors_origin(Some("*")), None);
    }

    #[test]
    fn control_posts_require_wallpaper_or_localhost_origin() {
        assert!(control_origin_allowed(Some("null")));
        assert!(control_origin_allowed(Some("http://127.0.0.1:8000")));
        assert!(control_origin_allowed(Some("http://localhost:8011")));
        assert!(!control_origin_allowed(None));
        assert!(!control_origin_allowed(Some("")));
        assert!(!control_origin_allowed(Some("https://example.com")));
    }

    #[test]
    fn only_state_changing_posts_are_control_posts() {
        assert!(is_control_post(&Method::Post, "/v1/command"));
        assert!(is_control_post(&Method::Post, "/v1/selection"));
        assert!(is_control_post(&Method::Post, "/v1/selection/next"));
        assert!(is_control_post(&Method::Post, "/v1/service/stop"));
        assert!(!is_control_post(&Method::Get, "/v1/command"));
        assert!(!is_control_post(&Method::Post, "/v1/health"));
    }

    #[test]
    fn control_posts_with_bodies_require_json_content_type() {
        assert!(control_request_requires_json_body("/v1/command"));
        assert!(control_request_requires_json_body("/v1/selection"));
        assert!(!control_request_requires_json_body("/v1/selection/next"));
        assert!(!control_request_requires_json_body("/v1/service/stop"));
    }

    #[test]
    fn health_reports_executable_path_for_helper_script_identity_checks() {
        assert!(current_executable_path().is_some());
    }

    #[test]
    fn common_headers_do_not_allow_all_origins() {
        let response = with_common_headers(
            Response::from_data(Vec::new()),
            Some("http://127.0.0.1:8000"),
        );
        let header = response
            .headers()
            .iter()
            .find(|header| header.field.equiv("access-control-allow-origin"))
            .map(|header| header.value.as_str());

        assert_eq!(header, Some("http://127.0.0.1:8000"));
    }

    #[test]
    fn common_headers_do_not_turn_invalid_origins_into_null_origin() {
        let response =
            with_common_headers(Response::from_data(Vec::new()), Some("https://example.com"));
        let header = response
            .headers()
            .iter()
            .find(|header| header.field.equiv("access-control-allow-origin"));

        assert!(header.is_none());
    }

    #[test]
    fn cached_source_collection_carries_previous_error_when_stale() {
        let state = Arc::new(RuntimeState::default());
        {
            let mut cache = state.source_cache.lock().unwrap();
            cache.sources = vec![test_source("QQMusic.exe")];
            cache.updated_at = Some(Instant::now());
            cache.error = Some("previous failure".to_string());
        }

        let collection = cached_source_collection(&state, STALE_SOURCE_CACHE_TTL, true, None)
            .expect("cache should be available");

        assert!(collection.stale);
        assert_eq!(collection.error, Some("previous failure".to_string()));
    }

    #[test]
    fn source_refresh_timeout_returns_stale_cache() {
        let state = Arc::new(RuntimeState::default());
        cache_sources(&state, vec![test_source("cached.exe")], None);
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let (done_tx, done_rx) = mpsc::channel();

        let collection = collect_sources_for_request_with_collector(
            &state,
            true,
            source_refresh_test_config(),
            move || {
                let _ = started_tx.send(());
                let _ = release_rx.recv_timeout(Duration::from_millis(500));
                let _ = done_tx.send(());
                Ok(vec![test_source("late.exe")])
            },
        )
        .expect("stale cache should be returned on timeout");

        assert!(started_rx.recv_timeout(Duration::from_millis(100)).is_ok());
        assert_eq!(collection.sources[0].source_id, "cached.exe");
        assert!(collection.stale);
        assert_eq!(
            collection.error,
            Some("source refresh timed out".to_string())
        );
        let _ = release_tx.send(());
        assert!(done_rx.recv_timeout(Duration::from_millis(100)).is_ok());
    }

    #[test]
    fn source_refresh_timeout_releases_request_gate_before_worker_finishes() {
        let state = Arc::new(RuntimeState::default());
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let (done_tx, done_rx) = mpsc::channel();
        let config = SourceRefreshConfig {
            timeout: Duration::from_millis(20),
            cooldown: Duration::ZERO,
        };

        let result = collect_sources_for_request_with_collector(&state, true, config, move || {
            let _ = started_tx.send(());
            let _ = release_rx.recv_timeout(Duration::from_millis(500));
            let _ = done_tx.send(());
            Ok(vec![test_source("late.exe")])
        });

        assert!(matches!(
            result,
            Err(ref error) if error == "source refresh timed out"
        ));
        assert!(started_rx.recv_timeout(Duration::from_millis(100)).is_ok());
        assert!(!state.source_refresh_in_flight.load(Ordering::Acquire));
        assert_eq!(
            state.source_refresh_active_workers.load(Ordering::Acquire),
            1
        );

        let second = collect_sources_for_request_with_collector(&state, true, config, || {
            Ok(vec![test_source("fresh.exe")])
        })
        .expect("request gate should be released after timeout");
        assert_eq!(second.sources[0].source_id, "fresh.exe");
        assert!(!second.stale);

        let _ = release_tx.send(());
        assert!(done_rx.recv_timeout(Duration::from_millis(100)).is_ok());
        wait_for_refresh_idle(&state);

        let cached = cached_source_collection(&state, SOURCE_CACHE_TTL, false, None)
            .expect("newer success should remain cached after older worker finishes");
        assert_eq!(cached.sources[0].source_id, "fresh.exe");
        assert_eq!(cached.error, None);
    }

    #[test]
    fn source_refresh_timeout_without_cache_returns_error_fast() {
        let state = Arc::new(RuntimeState::default());
        let (release_tx, release_rx) = mpsc::channel();
        let (done_tx, done_rx) = mpsc::channel();
        let started_at = Instant::now();

        let result = collect_sources_for_request_with_collector(
            &state,
            true,
            source_refresh_test_config(),
            move || {
                let _ = release_rx.recv_timeout(Duration::from_millis(500));
                let _ = done_tx.send(());
                Ok(vec![test_source("late.exe")])
            },
        );

        assert!(matches!(
            result,
            Err(ref error) if error == "source refresh timed out"
        ));
        assert!(started_at.elapsed() < Duration::from_millis(150));
        let _ = release_tx.send(());
        assert!(done_rx.recv_timeout(Duration::from_millis(100)).is_ok());
    }

    #[test]
    fn source_refresh_in_flight_uses_stale_cache_without_calling_collector() {
        let state = Arc::new(RuntimeState::default());
        cache_sources(&state, vec![test_source("cached.exe")], None);
        state
            .source_refresh_in_flight
            .store(true, Ordering::Release);
        let calls = Arc::new(AtomicUsize::new(0));
        let calls_for_collector = Arc::clone(&calls);

        let collection = collect_sources_for_request_with_collector(
            &state,
            true,
            source_refresh_test_config(),
            move || {
                calls_for_collector.fetch_add(1, Ordering::AcqRel);
                Ok(vec![test_source("fresh.exe")])
            },
        )
        .expect("stale cache should be used while refresh is in flight");

        assert_eq!(calls.load(Ordering::Acquire), 0);
        assert_eq!(collection.sources[0].source_id, "cached.exe");
        assert!(collection.stale);
        assert_eq!(
            collection.error,
            Some("source refresh already in progress".to_string())
        );
    }

    #[test]
    fn successful_source_refresh_updates_cache_and_clears_error() {
        let state = Arc::new(RuntimeState::default());
        cache_sources(
            &state,
            vec![test_source("cached.exe")],
            Some("previous failure".to_string()),
        );

        let collection = collect_sources_for_request_with_collector(
            &state,
            true,
            source_refresh_test_config(),
            || Ok(vec![test_source("fresh.exe")]),
        )
        .expect("refresh should succeed");

        assert_eq!(collection.sources[0].source_id, "fresh.exe");
        assert!(!collection.stale);
        assert_eq!(collection.error, None);
        assert!(!state.source_refresh_in_flight.load(Ordering::Acquire));

        let cached = cached_source_collection(&state, SOURCE_CACHE_TTL, false, None)
            .expect("fresh cache should be stored");
        assert_eq!(cached.sources[0].source_id, "fresh.exe");
        assert_eq!(cached.error, None);
    }

    #[test]
    fn stale_source_refresh_result_cannot_overwrite_newer_cache() {
        let state = Arc::new(RuntimeState::default());
        let older_epoch =
            reserve_source_refresh_epoch(&state).expect("older epoch should be reserved");
        let newer_epoch =
            reserve_source_refresh_epoch(&state).expect("newer epoch should be reserved");

        record_source_refresh_result(&state, newer_epoch, &Ok(vec![test_source("newer.exe")]));
        record_source_refresh_result(&state, older_epoch, &Ok(vec![test_source("older.exe")]));

        let cached = cached_source_collection(&state, SOURCE_CACHE_TTL, false, None)
            .expect("newer cache should exist");
        assert_eq!(cached.sources[0].source_id, "newer.exe");
        assert_eq!(cached.error, None);
    }

    #[test]
    fn rolled_back_source_refresh_epoch_allows_previous_worker_to_update_cache() {
        let state = Arc::new(RuntimeState::default());
        let older_epoch =
            reserve_source_refresh_epoch(&state).expect("older epoch should be reserved");
        let failed_newer_epoch =
            reserve_source_refresh_epoch(&state).expect("newer epoch should be reserved");

        rollback_source_refresh_epoch(&state, failed_newer_epoch);
        record_source_refresh_result(&state, older_epoch, &Ok(vec![test_source("older.exe")]));

        let cached = cached_source_collection(&state, SOURCE_CACHE_TTL, false, None)
            .expect("older worker should remain valid after newer spawn rollback");
        assert_eq!(cached.sources[0].source_id, "older.exe");
        assert_eq!(cached.error, None);
    }

    #[test]
    fn source_refresh_timeout_cooldown_uses_stale_cache_without_calling_collector() {
        let state = Arc::new(RuntimeState::default());
        cache_sources(&state, vec![test_source("cached.exe")], None);
        let (release_tx, release_rx) = mpsc::channel();
        let (done_tx, done_rx) = mpsc::channel();
        let config = source_refresh_test_config();

        let first = collect_sources_for_request_with_collector(&state, true, config, move || {
            let _ = release_rx.recv_timeout(Duration::from_millis(500));
            let _ = done_tx.send(());
            Ok(vec![test_source("late.exe")])
        })
        .expect("stale cache should be returned on timeout");
        assert!(first.stale);
        let _ = release_tx.send(());
        assert!(done_rx.recv_timeout(Duration::from_millis(100)).is_ok());
        wait_for_refresh_idle(&state);

        let calls = Arc::new(AtomicUsize::new(0));
        let calls_for_collector = Arc::clone(&calls);
        let second = collect_sources_for_request_with_collector(&state, true, config, move || {
            calls_for_collector.fetch_add(1, Ordering::AcqRel);
            Ok(vec![test_source("fresh.exe")])
        })
        .expect("cooldown should use stale cache");

        assert_eq!(calls.load(Ordering::Acquire), 0);
        assert_eq!(second.sources[0].source_id, "late.exe");
        assert!(second.stale);
        assert_eq!(second.error, Some("source refresh timed out".to_string()));
    }

    #[test]
    fn source_refresh_timeout_caps_background_workers() {
        let state = Arc::new(RuntimeState::default());
        cache_sources(&state, vec![test_source("cached.exe")], None);
        let (first_started_tx, first_started_rx) = mpsc::channel();
        let (first_release_tx, first_release_rx) = mpsc::channel();
        let (first_done_tx, first_done_rx) = mpsc::channel();
        let (second_started_tx, second_started_rx) = mpsc::channel();
        let (second_release_tx, second_release_rx) = mpsc::channel();
        let (second_done_tx, second_done_rx) = mpsc::channel();
        let config = SourceRefreshConfig {
            timeout: Duration::from_millis(20),
            cooldown: Duration::ZERO,
        };

        let first = collect_sources_for_request_with_collector(&state, true, config, move || {
            let _ = first_started_tx.send(());
            let _ = first_release_rx.recv_timeout(Duration::from_millis(500));
            let _ = first_done_tx.send(());
            Ok(vec![test_source("late-1.exe")])
        })
        .expect("stale cache should be returned on timeout");

        assert!(first_started_rx
            .recv_timeout(Duration::from_millis(100))
            .is_ok());
        assert!(first.stale);

        let second = collect_sources_for_request_with_collector(&state, true, config, move || {
            let _ = second_started_tx.send(());
            let _ = second_release_rx.recv_timeout(Duration::from_millis(500));
            let _ = second_done_tx.send(());
            Ok(vec![test_source("late-2.exe")])
        })
        .expect("stale cache should be returned on second timeout");

        assert!(second_started_rx
            .recv_timeout(Duration::from_millis(100))
            .is_ok());
        assert!(second.stale);
        assert_eq!(
            state.source_refresh_active_workers.load(Ordering::Acquire),
            2
        );

        let calls = Arc::new(AtomicUsize::new(0));
        let calls_for_collector = Arc::clone(&calls);
        let third = collect_sources_for_request_with_collector(&state, true, config, move || {
            calls_for_collector.fetch_add(1, Ordering::AcqRel);
            Ok(vec![test_source("fresh.exe")])
        })
        .expect("stale cache should be returned when worker limit is reached");

        assert_eq!(calls.load(Ordering::Acquire), 0);
        assert_eq!(third.sources[0].source_id, "cached.exe");
        assert!(third.stale);
        assert_eq!(
            third.error,
            Some("source refresh worker limit reached".to_string())
        );
        let _ = first_release_tx.send(());
        let _ = second_release_tx.send(());
        assert!(first_done_rx
            .recv_timeout(Duration::from_millis(100))
            .is_ok());
        assert!(second_done_rx
            .recv_timeout(Duration::from_millis(100))
            .is_ok());
        wait_for_refresh_idle(&state);
    }

    #[test]
    fn source_refresh_timeout_delayed_failure_records_cache_error() {
        let state = Arc::new(RuntimeState::default());
        cache_sources(&state, vec![test_source("cached.exe")], None);
        let (release_tx, release_rx) = mpsc::channel();
        let (done_tx, done_rx) = mpsc::channel();

        let collection = collect_sources_for_request_with_collector(
            &state,
            true,
            source_refresh_test_config(),
            move || {
                let _ = release_rx.recv_timeout(Duration::from_millis(500));
                let _ = done_tx.send(());
                Err("delayed failure".to_string())
            },
        )
        .expect("stale cache should be returned on timeout");

        assert!(collection.stale);
        assert_eq!(
            collection.error,
            Some("source refresh timed out".to_string())
        );
        let _ = release_tx.send(());
        assert!(done_rx.recv_timeout(Duration::from_millis(100)).is_ok());
        wait_for_refresh_idle(&state);

        let cache = state.source_cache.lock().unwrap();
        assert_eq!(cache.error, Some("delayed failure".to_string()));
    }

    #[test]
    fn invalid_command_body_reports_json_error() {
        let response = invalid_command_request_response();

        assert_eq!(
            response.error,
            Some("invalid command request body".to_string())
        );
    }

    #[test]
    fn service_stop_signal_notifies_shutdown_receiver() {
        let (sender, receiver) = mpsc::channel();
        let state = RuntimeState::with_service_stop_sender(sender);

        assert!(request_service_stop(&state));
        assert!(receiver.recv_timeout(Duration::from_millis(100)).is_ok());
    }
}
