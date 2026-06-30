use crate::smtc::MediaSource;

#[derive(Debug, Default)]
pub struct BridgeState {
    selected_source_id: Option<String>,
}

impl BridgeState {
    pub fn selected_source<'a>(&self, sources: &'a [MediaSource]) -> Option<&'a MediaSource> {
        if let Some(selected_source_id) = &self.selected_source_id {
            if let Some(source) = sources
                .iter()
                .find(|source| source.source_id.eq_ignore_ascii_case(selected_source_id))
            {
                return Some(source);
            }
        }

        sources.first()
    }

    pub fn resolve_selected_source<'a>(
        &mut self,
        sources: &'a [MediaSource],
    ) -> Option<&'a MediaSource> {
        let source = self.selected_source(sources)?;
        self.selected_source_id = Some(source.source_id.clone());
        Some(source)
    }

    pub fn select_next_source<'a>(
        &mut self,
        sources: &'a [MediaSource],
    ) -> Option<&'a MediaSource> {
        let controllable_sources = controllable_sources_in_order(sources);
        if controllable_sources.is_empty() {
            self.selected_source_id = None;
            return None;
        }

        let next_index = self
            .selected_source_id
            .as_ref()
            .and_then(|id| {
                controllable_sources
                    .iter()
                    .position(|source| source.source_id.eq_ignore_ascii_case(id))
            })
            .map(|index| (index + 1) % controllable_sources.len())
            .unwrap_or(0);

        self.selected_source_id = Some(controllable_sources[next_index].source_id.clone());
        Some(controllable_sources[next_index])
    }

    pub fn select_source_by_id<'a>(
        &mut self,
        sources: &'a [MediaSource],
        source_id: &str,
    ) -> Option<&'a MediaSource> {
        let source = sources
            .iter()
            .find(|source| source.source_id.eq_ignore_ascii_case(source_id.trim()))?;
        self.selected_source_id = Some(source.source_id.clone());
        Some(source)
    }
}

fn controllable_sources_in_order(sources: &[MediaSource]) -> Vec<&MediaSource> {
    let mut seen_ids: Vec<String> = Vec::new();
    let mut result = Vec::new();
    for source in sources {
        let id = source.source_id.trim().to_lowercase();
        if id.is_empty() || seen_ids.iter().any(|seen| seen == &id) {
            continue;
        }
        seen_ids.push(id);
        result.push(source);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::smtc::{MediaSource, Timeline};

    fn source(source_id: &str) -> MediaSource {
        MediaSource {
            source_id: source_id.to_string(),
            title: source_id.to_string(),
            artist: String::new(),
            album: String::new(),
            thumbnail: String::new(),
            playback_state: "playing".to_string(),
            timeline: Timeline {
                status: "unknown".to_string(),
                position: None,
                duration: None,
                sampled_at_unix_ms: None,
            },
        }
    }

    #[test]
    fn selected_source_matches_source_id_case_insensitively() {
        let mut state = BridgeState::default();
        let sources = vec![source("cloudmusic.exe"), source("QQMusic.exe")];
        state.selected_source_id = Some("qqmusic.exe".to_string());

        assert_eq!(
            state.selected_source(&sources).unwrap().source_id,
            "QQMusic.exe"
        );
    }

    #[test]
    fn select_next_source_matches_current_id_case_insensitively() {
        let mut state = BridgeState::default();
        let sources = vec![source("cloudmusic.exe"), source("QQMusic.exe")];
        state.selected_source_id = Some("cloudMusic.exe".to_string());

        assert_eq!(
            state.select_next_source(&sources).unwrap().source_id,
            "QQMusic.exe"
        );
    }

    #[test]
    fn select_next_source_skips_repeated_controllable_source_ids() {
        let mut state = BridgeState::default();
        let sources = vec![
            source("cloudmusic.exe"),
            source("cloudmusic.exe"),
            source("QQMusic.exe"),
        ];
        state.selected_source_id = Some("cloudmusic.exe".to_string());

        assert_eq!(
            state.select_next_source(&sources).unwrap().source_id,
            "QQMusic.exe"
        );
    }

    #[test]
    fn select_next_source_starts_from_first_source_without_existing_selection() {
        let mut state = BridgeState::default();
        let sources = vec![source("cloudmusic.exe"), source("QQMusic.exe")];

        assert_eq!(
            state.select_next_source(&sources).unwrap().source_id,
            "cloudmusic.exe"
        );
    }

    #[test]
    fn resolve_selected_source_replaces_stale_selection_with_fallback() {
        let mut state = BridgeState::default();
        let sources = vec![source("cloudmusic.exe"), source("QQMusic.exe")];
        state.selected_source_id = Some("missing.exe".to_string());

        assert_eq!(
            state.resolve_selected_source(&sources).unwrap().source_id,
            "cloudmusic.exe"
        );
        assert_eq!(state.selected_source_id, Some("cloudmusic.exe".to_string()));
    }

    #[test]
    fn select_source_by_id_updates_selected_source() {
        let mut state = BridgeState::default();
        let sources = vec![source("cloudmusic.exe"), source("QQMusic.exe")];

        assert_eq!(
            state
                .select_source_by_id(&sources, "qqmusic.exe")
                .unwrap()
                .source_id,
            "QQMusic.exe"
        );
        assert_eq!(state.selected_source_id, Some("QQMusic.exe".to_string()));
    }

    #[test]
    fn select_source_by_id_rejects_missing_source_without_changing_selection() {
        let mut state = BridgeState::default();
        let sources = vec![source("cloudmusic.exe"), source("QQMusic.exe")];
        state.selected_source_id = Some("cloudmusic.exe".to_string());

        assert!(state.select_source_by_id(&sources, "missing.exe").is_none());
        assert_eq!(state.selected_source_id, Some("cloudmusic.exe".to_string()));
    }
}
