use base64::Engine;
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use windows::Foundation::TimeSpan;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession, GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};
use windows::Storage::Streams::DataReader;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_VOLUME_DOWN, VK_VOLUME_UP,
};

const MAX_THUMBNAIL_BYTES: u64 = 3 * 1024 * 1024;

#[derive(Clone, Debug, Serialize)]
pub struct MediaSource {
    pub source_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub thumbnail: String,
    pub playback_state: String,
    pub timeline: Timeline,
}

#[derive(Clone, Debug, Serialize)]
pub struct Timeline {
    pub status: String,
    pub position: Option<f64>,
    pub duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sampled_at_unix_ms: Option<u64>,
}

#[derive(Clone, Copy, Debug)]
pub enum MediaCommand {
    PlayPause,
    Previous,
    Next,
    VolumeDown,
    VolumeUp,
}

pub fn collect_sources() -> windows::core::Result<Vec<MediaSource>> {
    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.join()?;
    let sessions = manager.GetSessions()?;
    let mut sources = Vec::new();

    for index in 0..sessions.Size()? {
        let session = sessions.GetAt(index)?;
        match read_source(&session) {
            Ok(source) => sources.push(source),
            Err(error) => eprintln!("failed to read SMTC session {index}: {error}"),
        }
    }

    Ok(meaningful_sources(sources))
}

pub fn control_source(
    selected_source_id: Option<&str>,
    command: MediaCommand,
) -> windows::core::Result<bool> {
    if matches!(command, MediaCommand::VolumeDown | MediaCommand::VolumeUp) {
        return send_volume_command(command);
    }

    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.join()?;
    let sessions = manager.GetSessions()?;
    let mut fallback: Option<GlobalSystemMediaTransportControlsSession> = None;
    let mut selected: Option<GlobalSystemMediaTransportControlsSession> = None;

    for index in 0..sessions.Size()? {
        let session = sessions.GetAt(index)?;
        if fallback.is_none() {
            fallback = Some(session.clone());
        }

        let source_id = session.SourceAppUserModelId()?.to_string_lossy();
        if selected_source_id.is_some_and(|selected| selected.eq_ignore_ascii_case(&source_id)) {
            selected = Some(session.clone());
            break;
        }
    }

    if let Some(session) = selected {
        return send_command(&session, command);
    }

    if selected_source_id.is_some() {
        return Ok(false);
    }

    if let Some(session) = fallback {
        return send_command(&session, command);
    }

    Ok(false)
}

fn send_volume_command(command: MediaCommand) -> windows::core::Result<bool> {
    let key = match command {
        MediaCommand::VolumeDown => VK_VOLUME_DOWN,
        MediaCommand::VolumeUp => VK_VOLUME_UP,
        _ => return Ok(false),
    };

    send_virtual_key(key);
    Ok(true)
}

fn send_virtual_key(key: VIRTUAL_KEY) {
    unsafe {
        keybd_event(key.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(key.0 as u8, 0, KEYEVENTF_KEYUP, 0);
    }
}

fn send_command(
    session: &GlobalSystemMediaTransportControlsSession,
    command: MediaCommand,
) -> windows::core::Result<bool> {
    match command {
        MediaCommand::PlayPause => session.TryTogglePlayPauseAsync()?.join(),
        MediaCommand::Previous => session.TrySkipPreviousAsync()?.join(),
        MediaCommand::Next => session.TrySkipNextAsync()?.join(),
        MediaCommand::VolumeDown | MediaCommand::VolumeUp => send_volume_command(command),
    }
}

fn read_source(
    session: &GlobalSystemMediaTransportControlsSession,
) -> windows::core::Result<MediaSource> {
    let source_id = session.SourceAppUserModelId()?.to_string_lossy();
    let media = session.TryGetMediaPropertiesAsync()?.join()?;
    let playback = session.GetPlaybackInfo()?;
    let timeline = session.GetTimelineProperties()?;

    Ok(MediaSource {
        source_id,
        title: media.Title()?.to_string_lossy(),
        artist: media.Artist()?.to_string_lossy(),
        album: media.AlbumTitle()?.to_string_lossy(),
        thumbnail: read_thumbnail_data_url(&media).unwrap_or_default(),
        playback_state: normalize_playback_status(playback.PlaybackStatus()?).to_string(),
        timeline: read_timeline(
            timeline.Position()?,
            timeline.StartTime()?,
            timeline.EndTime()?,
        ),
    })
}

fn meaningful_sources(sources: Vec<MediaSource>) -> Vec<MediaSource> {
    sources.into_iter().filter(is_meaningful_source).collect()
}

fn is_meaningful_source(source: &MediaSource) -> bool {
    !source.title.trim().is_empty()
        || !source.artist.trim().is_empty()
        || !source.album.trim().is_empty()
        || !source.thumbnail.trim().is_empty()
        || source.timeline.position.is_some()
        || source.timeline.duration.is_some()
}

fn read_thumbnail_data_url(
    media: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties,
) -> windows::core::Result<String> {
    let thumbnail = media.Thumbnail()?;
    let stream = thumbnail.OpenReadAsync()?.join()?;
    let size = stream.Size()?;
    if size == 0 || size > MAX_THUMBNAIL_BYTES {
        return Ok(String::new());
    }

    let reader = DataReader::CreateDataReader(&stream)?;
    let length = size as u32;
    reader.LoadAsync(length)?.join()?;
    let mut bytes = vec![0u8; length as usize];
    reader.ReadBytes(&mut bytes)?;

    let mime = normalize_mime(&stream.ContentType()?.to_string_lossy());
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

fn normalize_mime(content_type: &str) -> String {
    content_type
        .split([';', ',', ' '])
        .find(|part| part.starts_with("image/"))
        .unwrap_or("image/jpeg")
        .to_string()
}

fn normalize_playback_status(
    status: GlobalSystemMediaTransportControlsSessionPlaybackStatus,
) -> &'static str {
    match status {
        GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing => "playing",
        GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused => "paused",
        _ => "stopped",
    }
}

fn read_timeline(position: TimeSpan, start: TimeSpan, end: TimeSpan) -> Timeline {
    let position_seconds = ticks_to_seconds(position);
    let duration_seconds = ticks_to_seconds(end) - ticks_to_seconds(start);

    if duration_seconds <= 0.0 {
        return Timeline {
            status: "unknown".to_string(),
            position: None,
            duration: None,
            sampled_at_unix_ms: None,
        };
    }

    Timeline {
        status: "known".to_string(),
        position: Some(position_seconds.max(0.0)),
        duration: Some(duration_seconds),
        sampled_at_unix_ms: current_unix_millis(),
    }
}

fn ticks_to_seconds(value: TimeSpan) -> f64 {
    value.Duration as f64 / 10_000_000.0
}

fn current_unix_millis() -> Option<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source(
        source_id: &str,
        thumbnail: &str,
        position: Option<f64>,
        duration: Option<f64>,
    ) -> MediaSource {
        MediaSource {
            source_id: source_id.to_string(),
            title: "title".to_string(),
            artist: "artist".to_string(),
            album: String::new(),
            thumbnail: thumbnail.to_string(),
            playback_state: "playing".to_string(),
            timeline: Timeline {
                status: if duration.is_some() {
                    "known"
                } else {
                    "unknown"
                }
                .to_string(),
                position,
                duration,
                sampled_at_unix_ms: None,
            },
        }
    }

    #[test]
    fn meaningful_source_rejects_empty_stopped_session() {
        let mut empty = source("empty.exe", "", None, None);
        empty.title.clear();
        empty.artist.clear();
        empty.album.clear();
        empty.playback_state = "stopped".to_string();

        assert!(!is_meaningful_source(&empty));
    }

    #[test]
    fn meaningful_source_keeps_stopped_metadata_session() {
        let mut stopped = source(
            "cloudmusic.exe",
            "data:image/jpeg;base64,abc",
            Some(12.0),
            Some(180.0),
        );
        stopped.playback_state = "stopped".to_string();

        assert!(is_meaningful_source(&stopped));
    }

    #[test]
    fn meaningful_source_keeps_paused_track_without_timeline() {
        let mut paused = source("cloudmusic.exe", "", None, None);
        paused.playback_state = "paused".to_string();

        assert!(is_meaningful_source(&paused));
    }

    #[test]
    fn meaningful_sources_only_filters_empty_sessions() {
        let mut empty = source("empty.exe", "", None, None);
        empty.title.clear();
        empty.artist.clear();
        empty.album.clear();

        let sources = meaningful_sources(vec![
            source("cloudmusic.exe", "", Some(12.0), Some(180.0)),
            source("cloudmusic.exe", "data:image/jpeg;base64,abc", None, None),
            source(
                "MSEdge",
                "data:image/jpeg;base64,edge",
                Some(1.0),
                Some(2.0),
            ),
            empty,
        ]);

        assert_eq!(sources.len(), 3);
        assert_eq!(sources[0].source_id, "cloudmusic.exe");
        assert_eq!(sources[0].timeline.position, Some(12.0));
        assert_eq!(sources[1].source_id, "cloudmusic.exe");
        assert_eq!(sources[2].source_id, "MSEdge");
    }

    #[test]
    fn known_timeline_records_sample_epoch_for_frontend_projection() {
        let timeline = read_timeline(
            TimeSpan {
                Duration: 20_000_000,
            },
            TimeSpan { Duration: 0 },
            TimeSpan {
                Duration: 40_000_000,
            },
        );

        assert_eq!(timeline.status, "known");
        assert_eq!(timeline.position, Some(2.0));
        assert_eq!(timeline.duration, Some(4.0));
        assert!(timeline.sampled_at_unix_ms.is_some());
    }
}
