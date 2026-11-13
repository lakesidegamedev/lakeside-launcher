// Home feed validation. Pure: no Tauri, no network, so it is unit tested on any
// host. The feed is plain JSON from the studio site; every slide is checked
// here and again in the webview, and one bad slide never hides the others.

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

const KINDS: &[&str] = &["release", "update", "free", "pack", "news"];
const ACTIONS: &[&str] = &["install", "update", "play", "store", "news"];
const GAMES: &[&str] = &["ahd", "cw", "gc", "mov", "mf", "studio"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SlideAction {
    #[serde(rename = "type")]
    pub kind: String,
    pub target: String,
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
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct HomeFeed {
    pub version: u32,
    pub slides: Vec<Slide>,
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

pub fn validate_slide(value: &Value) -> Option<Slide> {
    let id = text(value, "id", 80)?;
    let kind = text(value, "kind", 16)?;
    let game = text(value, "game", 16)?;
    if !KINDS.contains(&kind.as_str()) || !GAMES.contains(&game.as_str()) {
        return None;
    }
    // The launcher builds update slides itself; a feed may not.
    if kind == "update" {
        return None;
    }
    let headline = text(value, "headline", 70)?;
    let line = text(value, "line", 110)?;
    let art = text(value, "art", 300)?;
    // "bundled" means: use the art that ships inside the launcher for this game.
    if art != "bundled" && !art_allowed(&art) {
        return None;
    }
    let action = value.get("action")?;
    let action_kind = text(action, "type", 16)?;
    let target = text(action, "target", 200)?;
    if !ACTIONS.contains(&action_kind.as_str()) {
        return None;
    }
    match action_kind.as_str() {
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
        action: SlideAction {
            kind: action_kind,
            target,
        },
        starts,
        ends,
        priority,
    })
}

/// Parse a feed body. Wrong version or shape is an error (the caller falls back
/// to the bundled slides); individual bad slides are dropped silently.
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
    Ok(HomeFeed { version: 1, slides })
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
}
