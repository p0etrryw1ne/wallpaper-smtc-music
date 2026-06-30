use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::Duration;

#[derive(Debug, Clone, Default)]
pub struct LyricQuery {
    pub source_id: String,
    pub title: String,
    pub artist: String,
    pub duration: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct LyricResponse {
    pub ok: bool,
    pub provider: Option<String>,
    pub synced_lyrics: String,
    pub plain_lyrics: String,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct LyricApiRules {
    #[serde(default)]
    common_providers: Vec<String>,
    #[serde(default)]
    source_providers: HashMap<String, SourceProvider>,
    #[serde(default)]
    provider_definitions: HashMap<String, ProviderDefinition>,
}

#[derive(Debug, Deserialize, Default)]
struct SourceProvider {
    #[serde(default)]
    r#match: Vec<String>,
    #[serde(default)]
    providers: Vec<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct ProviderDefinition {
    enabled: Option<bool>,
    #[serde(default)]
    r#type: String,
    result_provider: Option<String>,
    search_url: Option<String>,
    search_result_path: Option<Value>,
    song_id_path: Option<Value>,
    lyric_url: Option<String>,
    lyric_path: Option<Value>,
    plain_lyric_path: Option<Value>,
    url: Option<String>,
    timeout_ms: Option<u64>,
    #[serde(default)]
    headers: HashMap<String, String>,
}

#[derive(Debug, Clone, Default)]
struct FetchedLyrics {
    provider: String,
    synced_lyrics: String,
    plain_lyrics: String,
}

const RULES_RELATIVE_PATH: &str = "config/lyrics-api-rules.json";

pub fn fetch(query: LyricQuery) -> LyricResponse {
    if query.title.trim().is_empty() || query.artist.trim().is_empty() {
        return miss("missing_title_or_artist");
    }

    response_from_result(fetch_from_rules(&query))
}

fn response_from_result(result: Result<Option<FetchedLyrics>, String>) -> LyricResponse {
    match result {
        Ok(Some(lyrics))
            if !lyrics.synced_lyrics.trim().is_empty()
                || !lyrics.plain_lyrics.trim().is_empty() =>
        {
            LyricResponse {
                ok: true,
                provider: Some(lyrics.provider),
                synced_lyrics: lyrics.synced_lyrics,
                plain_lyrics: lyrics.plain_lyrics,
                error: None,
            }
        }
        Ok(_) => miss("not_found"),
        Err(error) => LyricResponse {
            ok: false,
            provider: None,
            synced_lyrics: String::new(),
            plain_lyrics: String::new(),
            error: Some(error),
        },
    }
}

fn fetch_from_rules(query: &LyricQuery) -> Result<Option<FetchedLyrics>, String> {
    let rules = load_rules()?;
    for provider_name in provider_order_for_query(query, &rules) {
        let Some(definition) = rules.provider_definitions.get(&provider_name) else {
            continue;
        };
        if definition.enabled == Some(false) {
            continue;
        }

        let result = fetch_by_definition(&provider_name, definition, query)?;
        if result.is_some() {
            return Ok(result);
        }
    }
    Ok(None)
}

fn provider_order_for_query(query: &LyricQuery, rules: &LyricApiRules) -> Vec<String> {
    let source_id = query.source_id.to_lowercase();
    for profile in rules.source_providers.values() {
        if profile.r#match.iter().any(|matcher| {
            let matcher = matcher.to_lowercase();
            matcher == "*" || source_id.contains(&matcher)
        }) {
            return profile.providers.clone();
        }
    }
    rules.common_providers.clone()
}

fn fetch_by_definition(
    provider_name: &str,
    definition: &ProviderDefinition,
    query: &LyricQuery,
) -> Result<Option<FetchedLyrics>, String> {
    match definition.r#type.as_str() {
        "direct-json" => fetch_direct_json(provider_name, definition, query),
        "search-then-lyric" => fetch_search_then_lyric(provider_name, definition, query),
        _ => Ok(None),
    }
}

fn fetch_direct_json(
    provider_name: &str,
    definition: &ProviderDefinition,
    query: &LyricQuery,
) -> Result<Option<FetchedLyrics>, String> {
    let Some(url_template) = definition.url.as_deref() else {
        return Ok(None);
    };
    let payload = fetch_json(&build_url(url_template, query, None), definition)?;
    let synced_lyrics = read_path_text(&payload, &definition.lyric_path);
    let plain_lyrics = read_path_text(&payload, &definition.plain_lyric_path);
    build_result(provider_name, definition, synced_lyrics, plain_lyrics)
}

fn fetch_search_then_lyric(
    provider_name: &str,
    definition: &ProviderDefinition,
    query: &LyricQuery,
) -> Result<Option<FetchedLyrics>, String> {
    let (Some(search_url), Some(lyric_url)) = (
        definition.search_url.as_deref(),
        definition.lyric_url.as_deref(),
    ) else {
        return Ok(None);
    };

    let search_payload = fetch_json(&build_url(search_url, query, None), definition)?;
    let candidates = flatten_candidates(read_path(&search_payload, &definition.search_result_path));
    let song = candidates.into_iter().max_by(|left, right| {
        score_candidate(left, query)
            .partial_cmp(&score_candidate(right, query))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let Some(song) = song else {
        return Ok(None);
    };
    let Some(song_id) = first_path_text(&song, &definition.song_id_path) else {
        return Ok(None);
    };

    let lyric_payload = fetch_json(&build_url(lyric_url, query, Some(&song_id)), definition)?;
    build_result(
        provider_name,
        definition,
        read_path_text(&lyric_payload, &definition.lyric_path),
        read_path_text(&lyric_payload, &definition.plain_lyric_path),
    )
}

fn build_result(
    provider_name: &str,
    definition: &ProviderDefinition,
    synced_lyrics: String,
    plain_lyrics: String,
) -> Result<Option<FetchedLyrics>, String> {
    if synced_lyrics.trim().is_empty() && plain_lyrics.trim().is_empty() {
        return Ok(None);
    }

    Ok(Some(FetchedLyrics {
        provider: definition
            .result_provider
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| provider_name.to_string()),
        synced_lyrics,
        plain_lyrics,
    }))
}

fn fetch_json(url: &str, definition: &ProviderDefinition) -> Result<Value, String> {
    let mut request = agent(definition).get(url).set("User-Agent", user_agent());
    for (name, value) in &definition.headers {
        request = request.set(name, value);
    }

    request
        .call()
        .map_err(|error| error.to_string())?
        .into_json()
        .map_err(|error| error.to_string())
}

fn load_rules() -> Result<LyricApiRules, String> {
    let Some(path) = find_rules_path() else {
        return Err("lyric_rules_not_found".to_string());
    };
    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&text).map_err(|error| error.to_string())
}

fn find_rules_path() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("WE_SMTC_LYRIC_RULES") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Some(path);
        }
    }

    let mut roots = Vec::new();
    if let Ok(current_dir) = std::env::current_dir() {
        roots.push(current_dir);
    }
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            roots.push(exe_dir.to_path_buf());
        }
    }

    for root in roots {
        for directory in root.ancestors() {
            let candidate = directory.join(RULES_RELATIVE_PATH);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    None
}

fn build_url(template: &str, query: &LyricQuery, song_id: Option<&str>) -> String {
    let mut result = template.to_string();
    let replacements = [
        (
            "query",
            format!("{} {}", query.title.trim(), query.artist.trim()),
        ),
        ("title", query.title.trim().to_string()),
        ("artist", query.artist.trim().to_string()),
        ("sourceId", query.source_id.trim().to_string()),
        ("duration", duration_text(query)),
        ("songId", song_id.unwrap_or("").to_string()),
    ];
    for (name, value) in replacements {
        result = result.replace(&format!("{{{name}}}"), &urlencoding::encode(value.trim()));
    }
    result
}

fn duration_text(query: &LyricQuery) -> String {
    let Some(duration) = query.duration else {
        return String::new();
    };
    if duration.is_finite() && duration > 0.0 {
        format!("{}", duration.round() as u64)
    } else {
        String::new()
    }
}

fn read_path<'a>(value: &'a Value, path: &Option<Value>) -> Option<&'a Value> {
    let Some(path) = path else {
        return Some(value);
    };

    let parts: Vec<String> = match path {
        Value::String(path) => path.split('.').map(str::to_string).collect(),
        Value::Array(parts) => parts
            .iter()
            .filter_map(|part| part.as_str().map(str::to_string))
            .collect(),
        _ => Vec::new(),
    };

    let mut current = value;
    for part in parts {
        current = current.get(part)?;
    }
    Some(current)
}

fn read_path_text(value: &Value, path: &Option<Value>) -> String {
    value_to_text(read_path(value, path))
}

fn first_path_text(value: &Value, path: &Option<Value>) -> Option<String> {
    match path {
        Some(Value::Array(paths)) => paths
            .iter()
            .filter_map(|path| {
                let path = Some(path.clone());
                let value = read_path_text(value, &path);
                if value.is_empty() {
                    None
                } else {
                    Some(value)
                }
            })
            .next(),
        _ => {
            let value = read_path_text(value, path);
            if value.is_empty() {
                None
            } else {
                Some(value)
            }
        }
    }
}

fn flatten_candidates(value: Option<&Value>) -> Vec<Value> {
    let mut candidates = Vec::new();
    let Some(value) = value else {
        return candidates;
    };

    match value {
        Value::Array(items) => {
            for item in items {
                candidates.push(item.clone());
                if let Some(group) = item.get("grp").and_then(Value::as_array) {
                    candidates.extend(group.iter().cloned());
                }
            }
        }
        Value::Object(_) => candidates.push(value.clone()),
        _ => {}
    }

    candidates
}

fn score_candidate(song: &Value, query: &LyricQuery) -> f64 {
    let title = normalize(&query.title);
    let artist = normalize(&query.artist);
    let song_title = normalize(&candidate_title(song));
    let song_artist = normalize(&candidate_artist(song));

    let mut score = 0.0;
    if !title.is_empty() && song_title == title {
        score += 80.0;
    }
    if !title.is_empty() && (song_title.contains(&title) || title.contains(&song_title)) {
        score += 20.0;
    }
    if !artist.is_empty()
        && !song_artist.is_empty()
        && (artist.contains(&song_artist) || song_artist.contains(&artist))
    {
        score += 30.0;
    }
    if song
        .get("subtitle")
        .is_none_or(|value| value.as_str().unwrap_or("").is_empty())
    {
        score += 5.0;
    }
    if let (Some(duration), Some(song_duration)) = (query.duration, candidate_duration(song)) {
        score += (40.0 - (duration - song_duration).abs() * 2.0).max(0.0);
    }
    score
}

fn candidate_title(song: &Value) -> String {
    for key in ["song", "title", "name", "songname"] {
        let text = value_to_text(song.get(key));
        if !text.is_empty() {
            return text;
        }
    }
    String::new()
}

fn candidate_artist(song: &Value) -> String {
    for key in ["singer", "artist"] {
        let text = value_to_text(song.get(key));
        if !text.is_empty() {
            return text;
        }
    }
    if let Some(artists) = song.get("artists").and_then(Value::as_array) {
        return artists
            .iter()
            .filter_map(|artist| artist.get("name").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("/");
    }
    String::new()
}

fn candidate_duration(song: &Value) -> Option<f64> {
    for key in ["duration", "dt", "time"] {
        if let Some(duration) = duration_value(song.get(key)) {
            return Some(duration);
        }
    }
    parse_interval(
        song.get("interval")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    )
}

fn duration_value(value: Option<&Value>) -> Option<f64> {
    let duration = match value {
        Some(Value::Number(number)) => number.as_f64(),
        Some(Value::String(text)) => text.trim().parse::<f64>().ok(),
        _ => None,
    }?;
    if duration.is_finite() && duration > 0.0 {
        Some(if duration > 1000.0 {
            duration / 1000.0
        } else {
            duration
        })
    } else {
        None
    }
}

fn parse_interval(value: &str) -> Option<f64> {
    let text = value.trim();
    if text.is_empty() {
        return None;
    }

    if let Some((minutes, rest)) = text.split_once('分') {
        let seconds = rest.trim_end_matches('秒');
        return Some(
            minutes.trim().parse::<f64>().ok()? * 60.0 + seconds.trim().parse::<f64>().ok()?,
        );
    }

    let mut parts = text.split(':');
    let minutes = parts.next()?.trim().parse::<f64>().ok()?;
    let seconds = parts.next()?.trim().parse::<f64>().ok()?;
    if parts.next().is_none() {
        Some(minutes * 60.0 + seconds)
    } else {
        None
    }
}

fn value_to_text(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.trim().to_string(),
        Some(Value::Number(number)) => number.to_string(),
        _ => String::new(),
    }
}

fn normalize(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect()
}

fn miss(error: &str) -> LyricResponse {
    LyricResponse {
        ok: false,
        provider: None,
        synced_lyrics: String::new(),
        plain_lyrics: String::new(),
        error: Some(error.to_string()),
    }
}

fn agent(definition: &ProviderDefinition) -> ureq::Agent {
    let timeout = definition.timeout_ms.unwrap_or(8000).max(1);
    ureq::AgentBuilder::new()
        .timeout(Duration::from_millis(timeout))
        .build()
}

fn user_agent() -> &'static str {
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn source_order_uses_vkeys_for_netease_without_web_endpoint() {
        let rules = load_rules().expect("rules should load from repository config");
        let query = LyricQuery {
            source_id: "cloudmusic.exe".to_string(),
            title: "游京".to_string(),
            artist: "7wiz".to_string(),
            duration: Some(206.0),
        };

        assert_eq!(
            provider_order_for_query(&query, &rules),
            vec!["vkeys.netease", "vkeys.qq", "lrclib"]
        );
        assert!(rules.provider_definitions.get("netease.web").is_none());
    }

    #[test]
    fn rules_config_does_not_contain_netease_web_endpoints() {
        let path = find_rules_path().expect("rules should exist");
        let text = fs::read_to_string(path).expect("rules should be readable");

        assert!(!text.contains("music.163.com"));
        assert!(!text.contains("netease.web"));
    }

    #[test]
    fn qq_score_prefers_duration_matched_version() {
        let query = LyricQuery {
            source_id: "QQMusic.exe".to_string(),
            title: "浮生散尽".to_string(),
            artist: "不才".to_string(),
            duration: Some(243.0),
        };
        let correct_version = json!({
            "id": 121556592,
            "song": "浮生散尽",
            "singer": "蔡明希-不才",
            "interval": "4分3秒",
            "subtitle": ""
        });
        let wrong_version = json!({
            "id": 212980353,
            "song": "浮生散尽",
            "singer": "蔡明希-不才",
            "interval": "5分17秒",
            "subtitle": ""
        });

        assert!(
            score_candidate(&correct_version, &query) > score_candidate(&wrong_version, &query)
        );
    }

    #[test]
    fn build_url_uses_config_placeholders() {
        let query = LyricQuery {
            source_id: "QQMusic.exe".to_string(),
            title: "清零".to_string(),
            artist: "司南".to_string(),
            duration: Some(240.0),
        };

        assert_eq!(
            build_url(
                "https://api.example.test/search?word={query}&duration={duration}&id={songId}",
                &query,
                Some("123")
            ),
            "https://api.example.test/search?word=%E6%B8%85%E9%9B%B6%20%E5%8F%B8%E5%8D%97&duration=240&id=123"
        );
    }
}
