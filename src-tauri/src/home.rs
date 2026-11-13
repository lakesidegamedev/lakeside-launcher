// Home feed validation. Pure: no Tauri, no network, so it is unit tested on any
// host. The feed is plain JSON from the studio site; every slide and event is
// checked here and again in the webview, and one bad entry never hides the
// others. Fields this version does not know are ignored.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::Url;

/// Where the feed lives. https only, on a studio host.
pub const HOME_FEED_URL: &str = "https://lakesidegames.net/download/launcher/home.json";

/// Hosts the feed may be fetched from.
pub const FEED_HOSTS: &[&str] = &["lakesidegames.net"];

/// Hosts slide art may load from (exact match, https only).
pub const ART_HOSTS: &[&str] = &["lakesidegames.net", "assets.lakesidegames.net"];

pub const MAX_FEED_BYTES: usize = 256 * 1024;
pub const MAX_SLIDES: usize = 12;
pub const MAX_EVENTS: usize = 4;

const KINDS: &[&str] = &["release", "update", "free", "pack", "news"];
const ACTIONS: &[&str] = &["install", "update", "play", "store", "news"];
const GAMES: &[&str] = &["ahd", "cw", "gc", "mov", "mf", "studio"];
const EVENT_KINDS: &[&str] = &["countdown", "offer", "free"];
/// Key art that ships inside the launcher, named as `bundled:<key>`.
const BUNDLED_KEYS: &[&str] = &["ahd", "cw", "gc", "mov", "alpha"];

/// A button: a game action (install, update, play) or a studio site page.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Link {
    #[serde(rename = "type")]
    pub kind: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SlideAction {
    #[serde(rename = "type")]
    pub kind: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// Used when the game action cannot run on this machine (for example the
    /// game is not owned): usually the store page.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback: Option<Link>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Focus {
    pub x: u8,
    pub y: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Slide {
    pub id: String,
    pub kind: String,
    pub game: String,
    pub headline: String,
    pub line: String,
    pub art: String,
    pub action: SlideAction,
    pub starts: String,
    pub ends: String,
    pub priority: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kicker: Option<String>,
    /// Version badge next to the wordmark, for example "2.0".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub badge: Option<String>,
    /// Short title for the filmstrip tile and the showcase tab.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tile: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focus: Option<Focus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secondary: Option<Link>,
    /// Id of a live event that shows this slide's story in its own panel; the
    /// slide leaves the showcase while that event is live.
    #[serde(rename = "replacedBy", skip_serializing_if = "Option::is_none")]
    pub replaced_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Event {
    pub id: String,
    pub kind: String,
    pub headline: String,
    pub line: String,
    #[serde(rename = "startsAt")]
    pub starts_at: String,
    #[serde(rename = "endsAt")]
    pub ends_at: String,
    /// Countdown target time.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kicker: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<SlideAction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secondary: Option<Link>,
    pub art: String,
    pub accent: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focus: Option<Focus>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct HomeFeed {
    pub version: u32,
    pub slides: Vec<Slide>,
    pub events: Vec<Event>,
}

fn text(value: &Value, key: &str, max: usize) -> Option<String> {
    let found = value.get(key)?.as_str()?;
    if found.trim().is_empty() || found.chars().count() > max {
        return None;
    }
    // Plain text only: the webview renders it as text, but markup has no place here.
    if found.contains('<') || found.contains('>') {
        return None;
    }
    Some(found.to_string())
}

/// Exact host match, https, no credentials.
pub fn art_allowed(raw: &str) -> bool {
    let Ok(url) = Url::parse(raw) else {
        return false;
    };
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.host_str().map(|host| ART_HOSTS.contains(&host)).unwrap_or(false)
}

/// `bundled`, `bundled:<key>` for a known key, or an allowlisted https URL.
fn art_value_ok(art: &str) -> bool {
    if art == "bundled" {
        return true;
    }
    if let Some(key) = art.strip_prefix("bundled:") {
        return BUNDLED_KEYS.contains(&key);
    }
    art_allowed(art)
}

fn site_path(target: &str) -> bool {
    target.starts_with('/')
        && !target.starts_with("//")
        && !target.contains("..")
        && target.chars().all(|c| c.is_ascii_alphanumeric() || "-._~/".contains(c))
}

fn date_like(raw: &str) -> bool {
    // YYYY-MM-DD with an optional time. Real parsing happens in the webview.
    let bytes = raw.as_bytes();
    bytes.len() >= 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && [0usize, 1, 2, 3, 5, 6, 8, 9].iter().all(|&i| bytes[i].is_ascii_digit())
}

/// A button's type and target. Game actions name a game; site actions name a studio page.
fn link_parts(value: &Value) -> Option<(String, String)> {
    let kind = text(value, "type", 16)?;
    let target = text(value, "target", 200)?;
    if !ACTIONS.contains(&kind.as_str()) {
        return None;
    }
    match kind.as_str() {
        "store" | "news" => {
            if !site_path(&target) {
                return None;
            }
        }
        _ => {
            if !GAMES.contains(&target.as_str()) || target == "studio" {
                return None;
            }
        }
    }
    Some((kind, target))
}

fn validate_link(value: &Value) -> Option<Link> {
    let (kind, target) = link_parts(value)?;
    Some(Link {
        kind,
        target,
        label: text(value, "label", 28),
    })
}

fn validate_action(value: &Value) -> Option<SlideAction> {
    let (kind, target) = link_parts(value)?;
    Some(SlideAction {
        kind,
        target,
        label: text(value, "label", 28),
        fallback: value.get("fallback").and_then(validate_link),
    })
}

fn validate_focus(value: &Value) -> Option<Focus> {
    let focus = value.get("focus")?;
    let x = focus.get("x")?.as_u64()?;
    let y = focus.get("y")?.as_u64()?;
    if x > 100 || y > 100 {
        return None;
    }
    Some(Focus { x: x as u8, y: y as u8 })
}

pub fn validate_slide(value: &Value) -> Option<Slide> {
    let id = text(value, "id", 80)?;
    let kind = text(value, "kind", 16)?;
    let game = text(value, "game", 16)?;
    if !KINDS.contains(&kind.as_str()) || !GAMES.contains(&game.as_str()) {
        return None;
    }
    // The launcher builds update prompts itself; a feed may not.
    if kind == "update" {
        return None;
    }
    let headline = text(value, "headline", 70)?;
    let line = text(value, "line", 130)?;
    let art = text(value, "art", 300)?;
    if !art_value_ok(&art) {
        return None;
    }
    let action = validate_action(value.get("action")?)?;
    let starts = text(value, "starts", 40)?;
    let ends = text(value, "ends", 40)?;
    if !date_like(&starts) || !date_like(&ends) {
        return None;
    }
    let priority = value.get("priority")?.as_i64()?;
    Some(Slide {
        id,
        kind,
        game,
        headline,
        line,
        art,
        action,
        starts,
        ends,
        priority,
        kicker: text(value, "kicker", 28),
        badge: text(value, "badge", 10),
        tile: text(value, "tile", 44),
        focus: validate_focus(value),
        secondary: value.get("secondary").and_then(validate_link),
        replaced_by: text(value, "replacedBy", 80),
    })
}

pub fn validate_event(value: &Value) -> Option<Event> {
    let id = text(value, "id", 80)?;
    let kind = text(value, "kind", 16)?;
    if !EVENT_KINDS.contains(&kind.as_str()) {
        return None;
    }
    let accent = text(value, "accent", 16)?;
    if !GAMES.contains(&accent.as_str()) {
        return None;
    }
    let headline = text(value, "headline", 70)?;
    let line = text(value, "line", 130)?;
    let art = text(value, "art", 300)?;
    if !art_value_ok(&art) {
        return None;
    }
    let starts_at = text(value, "startsAt", 40)?;
    let ends_at = text(value, "endsAt", 40)?;
    if !date_like(&starts_at) || !date_like(&ends_at) {
        return None;
    }
    let target = text(value, "target", 40);
    if let Some(found) = &target {
        if !date_like(found) {
            return None;
        }
    }
    if kind == "countdown" && target.is_none() {
        return None;
    }
    Some(Event {
        id,
        kind,
        headline,
        line,
        starts_at,
        ends_at,
        target,
        kicker: text(value, "kicker", 28),
        action: value.get("action").and_then(validate_action),
        secondary: value.get("secondary").and_then(validate_link),
        art,
        accent,
        focus: validate_focus(value),
    })
}

/// Parse a feed body. Wrong version or shape is an error (the caller falls back
/// to the bundled slides); individual bad slides and events are dropped silently.
/// A feed without an `events` list is valid and has no events.
pub fn parse_feed(bytes: &[u8]) -> Result<HomeFeed, String> {
    if bytes.len() > MAX_FEED_BYTES {
        return Err("The home feed is too large.".to_string());
    }
    let root: Value = serde_json::from_slice(bytes)
        .map_err(|error| format!("The home feed is not valid JSON: {error}"))?;
    if root.get("version").and_then(Value::as_u64) != Some(1) {
        return Err("The home feed has an unsupported version.".to_string());
    }
    let list = root
        .get("slides")
        .and_then(Value::as_array)
        .ok_or_else(|| "The home feed has no slides list.".to_string())?;
    let mut slides: Vec<Slide> = Vec::new();
    for raw in list.iter().take(MAX_SLIDES * 2) {
        if let Some(slide) = validate_slide(raw) {
            if slides.iter().all(|existing| existing.id != slide.id) {
                slides.push(slide);
            }
        }
        if slides.len() >= MAX_SLIDES {
            break;
        }
    }
    let mut events: Vec<Event> = Vec::new();
    if let Some(raw_events) = root.get("events").and_then(Value::as_array) {
        for raw in raw_events.iter().take(MAX_EVENTS * 2) {
            if let Some(event) = validate_event(raw) {
                if events.iter().all(|existing| existing.id != event.id) {
                    events.push(event);
                }
            }
            if events.len() >= MAX_EVENTS {
                break;
            }
        }
    }
    Ok(HomeFeed { version: 1, slides, events })
}

/// The feed address must be https on a studio host. Redirects are checked the
/// same way by the caller.
pub fn feed_url_allowed(raw: &str) -> bool {
    let Ok(url) = Url::parse(raw) else {
        return false;
    };
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url
            .host_str()
            .map(|host| FEED_HOSTS.iter().any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}"))))
            .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn good() -> Value {
        serde_json::json!({
            "id": "cw-2-0",
            "kind": "release",
            "game": "cw",
            "headline": "Corporate Warfare 2.0 is out",
            "line": "$14.99, or included with Supporter+.",
            "art": "https://lakesidegames.net/store/assets/cw-goods.jpg",
            "action": { "type": "store", "target": "/store/corporate-warfare" },
            "starts": "2026-11-13",
            "ends": "2026-12-13",
            "priority": 10
        })
    }

    #[test]
    fn accepts_a_good_slide() {
        assert!(validate_slide(&good()).is_some());
    }

    #[test]
    fn rejects_art_off_the_allowlist_or_not_https() {
        for art in [
            "http://lakesidegames.net/a.jpg",
            "https://evil.example/a.jpg",
            "https://lakesidegames.net.evil.example/a.jpg",
            "https://user:pw@lakesidegames.net/a.jpg",
            "data:image/png;base64,AAAA",
        ] {
            let mut slide = good();
            slide["art"] = Value::String(art.to_string());
            assert!(validate_slide(&slide).is_none(), "{art}");
        }
        let mut bundled = good();
        bundled["art"] = Value::String("bundled".to_string());
        assert!(validate_slide(&bundled).is_some());
    }

    #[test]
    fn limits_actions_and_targets() {
        let mut slide = good();
        slide["action"] = serde_json::json!({ "type": "exec", "target": "/store" });
        assert!(validate_slide(&slide).is_none());
        slide["action"] = serde_json::json!({ "type": "store", "target": "https://evil.example/" });
        assert!(validate_slide(&slide).is_none());
        slide["action"] = serde_json::json!({ "type": "news", "target": "//evil.example/x" });
        assert!(validate_slide(&slide).is_none());
        slide["action"] = serde_json::json!({ "type": "store", "target": "/store/../admin" });
        assert!(validate_slide(&slide).is_none());
        slide["action"] = serde_json::json!({ "type": "play", "target": "gc" });
        assert!(validate_slide(&slide).is_some());
        slide["action"] = serde_json::json!({ "type": "install", "target": "studio" });
        assert!(validate_slide(&slide).is_none());
        slide["action"] = serde_json::json!({ "type": "install", "target": "nope" });
        assert!(validate_slide(&slide).is_none());
    }

    #[test]
    fn rejects_long_text_markup_and_feed_made_update_slides() {
        let mut slide = good();
        slide["headline"] = Value::String("x".repeat(71));
        assert!(validate_slide(&slide).is_none());
        let mut slide = good();
        slide["line"] = Value::String("<script>alert(1)</script>".to_string());
        assert!(validate_slide(&slide).is_none());
        let mut slide = good();
        slide["kind"] = Value::String("update".to_string());
        assert!(validate_slide(&slide).is_none());
    }

    #[test]
    fn one_bad_slide_does_not_hide_the_others() {
        let mut bad = good();
        bad["id"] = Value::String("bad".to_string());
        bad["art"] = Value::String("http://x".to_string());
        let body = serde_json::json!({ "version": 1, "slides": [bad, good(), good()] });
        let feed = parse_feed(body.to_string().as_bytes()).unwrap();
        // The duplicate id is dropped too.
        assert_eq!(feed.slides.len(), 1);
        assert_eq!(feed.slides[0].id, "cw-2-0");
    }

    #[test]
    fn rejects_wrong_version_shape_and_size() {
        assert!(parse_feed(br#"{"version":2,"slides":[]}"#).is_err());
        assert!(parse_feed(br#"{"version":1}"#).is_err());
        assert!(parse_feed(b"not json").is_err());
        assert!(parse_feed(&vec![b' '; MAX_FEED_BYTES + 1]).is_err());
    }

    #[test]
    fn feed_address_must_be_https_on_a_studio_host() {
        assert!(feed_url_allowed(HOME_FEED_URL));
        assert!(!feed_url_allowed("http://lakesidegames.net/download/launcher/home.json"));
        assert!(!feed_url_allowed("https://evil.example/home.json"));
        assert!(!feed_url_allowed("https://lakesidegames.net.evil.example/home.json"));
    }

    fn good_event() -> Value {
        serde_json::json!({
            "id": "ahd-120",
            "kind": "countdown",
            "headline": "A House Divided 1.20: the 2027 world",
            "line": "Opens Sunday.",
            "startsAt": "2026-11-13T00:00:00Z",
            "endsAt": "2026-11-15T22:00:00Z",
            "target": "2026-11-15T22:00:00Z",
            "art": "bundled:ahd",
            "accent": "ahd",
            "unknownField": { "anything": 1 }
        })
    }

    #[test]
    fn accepts_events_and_bundled_keys_and_ignores_unknown_fields() {
        let body = serde_json::json!({ "version": 1, "slides": [good()], "events": [good_event()] });
        let feed = parse_feed(body.to_string().as_bytes()).unwrap();
        assert_eq!(feed.events.len(), 1);
        assert_eq!(feed.events[0].target.as_deref(), Some("2026-11-15T22:00:00Z"));
    }

    #[test]
    fn a_feed_without_events_still_parses() {
        let body = serde_json::json!({ "version": 1, "slides": [good()] });
        let feed = parse_feed(body.to_string().as_bytes()).unwrap();
        assert!(feed.events.is_empty());
    }

    #[test]
    fn rejects_bad_events() {
        let mut countdown_without_target = good_event();
        countdown_without_target.as_object_mut().unwrap().remove("target");
        let mut bad_art = good_event();
        bad_art["art"] = Value::String("https://evil.example/a.jpg".to_string());
        let mut bad_key = good_event();
        bad_key["art"] = Value::String("bundled:nope".to_string());
        let mut bad_kind = good_event();
        bad_kind["kind"] = Value::String("popup".to_string());
        let mut bad_action = good_event();
        bad_action["action"] = serde_json::json!({ "type": "store", "target": "https://evil.example/" });
        for event in [countdown_without_target, bad_art, bad_key, bad_kind] {
            assert!(validate_event(&event).is_none());
        }
        // A bad optional action is dropped, the event itself survives.
        assert!(validate_event(&bad_action).unwrap().action.is_none());
    }

    #[test]
    fn reads_the_poster_fields() {
        let mut slide = good();
        slide["kicker"] = Value::String("New release".to_string());
        slide["badge"] = Value::String("2.0".to_string());
        slide["focus"] = serde_json::json!({ "x": 62, "y": 50 });
        slide["secondary"] = serde_json::json!({ "type": "news", "target": "/news/post/", "label": "Read the post" });
        slide["action"] = serde_json::json!({
            "type": "install",
            "target": "cw",
            "label": "Install",
            "fallback": { "type": "store", "target": "/store/corporate-warfare" }
        });
        let parsed = validate_slide(&slide).unwrap();
        assert_eq!(parsed.badge.as_deref(), Some("2.0"));
        assert_eq!(parsed.focus, Some(Focus { x: 62, y: 50 }));
        assert_eq!(parsed.secondary.unwrap().target, "/news/post/");
        assert_eq!(parsed.action.fallback.unwrap().kind, "store");
        slide["focus"] = serde_json::json!({ "x": 400, "y": 50 });
        assert!(validate_slide(&slide).unwrap().focus.is_none());
    }
}
