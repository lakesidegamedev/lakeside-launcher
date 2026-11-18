use crate::{installer, now_millis, platform_base, read_session};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Read,
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, WebviewWindow, WindowEvent};

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playtime {
    milliseconds: u64,
    last_played_at: u64,
    #[serde(skip_deserializing)]
    running: bool,
}

struct Running {
    instances: usize,
    checkpoint: Instant,
}

#[derive(Default)]
struct Ledger {
    totals: HashMap<String, Playtime>,
    running: HashMap<String, Running>,
    dirty: bool,
}

struct Activity {
    path: Option<PathBuf>,
    ledger: Mutex<Ledger>,
}

fn game_id(product: &str) -> &str {
    match product {
        "margin-of-victory" => "electioneer",
        "grand-century-desktop" => "grand-century",
        other => other,
    }
}

impl Ledger {
    fn checkpoint(&mut self) {
        let now = Instant::now();
        for (id, running) in &mut self.running {
            // A stalled or suspended machine may resume long after the last tick.
            let elapsed = now
                .duration_since(running.checkpoint)
                .min(Duration::from_secs(10));
            let entry = self.totals.entry(id.clone()).or_default();
            entry.milliseconds = entry
                .milliseconds
                .saturating_add(elapsed.as_millis() as u64);
            running.checkpoint = now;
            self.dirty = true;
        }
    }

    fn start(&mut self, id: &str) {
        let running = self.running.entry(id.into()).or_insert_with(|| Running {
            instances: 0,
            checkpoint: Instant::now(),
        });
        running.instances += 1;
        let entry = self.totals.entry(id.into()).or_default();
        entry.last_played_at = now_millis();
        entry.running = true;
        self.dirty = true;
    }

    fn finish(&mut self, id: &str) {
        self.checkpoint();
        if let Some(running) = self.running.get_mut(id) {
            running.instances -= 1;
            if running.instances == 0 {
                self.running.remove(id);
                if let Some(entry) = self.totals.get_mut(id) {
                    entry.running = false;
                }
            }
        }
    }
}

impl Activity {
    fn save(&self, ledger: &mut Ledger) {
        if !ledger.dirty {
            return;
        }
        let Some(path) = &self.path else { return };
        let temporary = path.with_extension("tmp");
        let result = (|| -> Result<(), Box<dyn std::error::Error>> {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(&temporary, serde_json::to_vec(&ledger.totals)?)?;
            fs::rename(temporary, path)?;
            Ok(())
        })();
        if result.is_ok() {
            ledger.dirty = false;
        }
    }
}

pub fn setup(app: &AppHandle) {
    let path = app
        .path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("playtime.json"));
    let totals = path
        .as_ref()
        .and_then(|path| fs::read(path).ok())
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();
    app.manage(Activity {
        path,
        ledger: Mutex::new(Ledger {
            totals,
            ..Ledger::default()
        }),
    });

    let handle = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(5));
        flush(&handle);
    });
}

pub fn flush(app: &AppHandle) {
    let activity = app.state::<Activity>();
    let mut ledger = activity.ledger.lock().unwrap();
    ledger.checkpoint();
    activity.save(&mut ledger);
}

fn start(app: &AppHandle, id: &str) {
    app.state::<Activity>().ledger.lock().unwrap().start(id);
}

fn finish(app: &AppHandle, id: &str) {
    let activity = app.state::<Activity>();
    let mut ledger = activity.ledger.lock().unwrap();
    ledger.finish(id);
    activity.save(&mut ledger);
}

pub fn watch_process(app: &AppHandle, product: &str, mut child: std::process::Child) {
    let id = game_id(product).to_string();
    start(app, &id);
    let app = app.clone();
    std::thread::spawn(move || {
        let _ = child.wait();
        finish(&app, &id);
    });
}

pub fn watch_window(app: &AppHandle, product: &str, window: &tauri::WebviewWindow) {
    let id = game_id(product).to_string();
    start(app, &id);
    let app = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            finish(&app, &id);
        }
    });
}

fn launcher_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("This command is only available in the launcher window.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn playtime(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<HashMap<String, Playtime>, String> {
    launcher_only(&window)?;
    let activity = app.state::<Activity>();
    let mut ledger = activity.ledger.lock().unwrap();
    ledger.checkpoint();
    Ok(ledger.totals.clone())
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Achievement {
    id: String,
    name: String,
    description: String,
    earned_at: Option<String>,
}

#[derive(Deserialize, Serialize)]
pub struct Achievements {
    status: String,
    achievements: Vec<Achievement>,
}

#[derive(Deserialize)]
struct Snapshot {
    schema: u32,
    achievements: Vec<Achievement>,
}

pub fn achievement_path(app: &AppHandle, product: &str) -> Option<PathBuf> {
    let id = game_id(product);
    if id == "ahd" || !installer::valid_id(id) {
        return None;
    }
    let dir = app.path().app_data_dir().ok()?.join("achievements");
    Some(dir.join(format!("{id}.json")))
}

#[tauri::command]
pub fn local_achievements(
    app: AppHandle,
    window: WebviewWindow,
    product_id: String,
) -> Result<Achievements, String> {
    launcher_only(&window)?;
    let path =
        achievement_path(&app, &product_id).ok_or("Achievements are unavailable for this game.")?;
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Achievements {
                status: "unsupported".into(),
                achievements: vec![],
            });
        }
        Err(_) => return Err("Could not read this game's achievements.".into()),
    };
    const MAX_BYTES: u64 = 256 * 1024;
    let mut data = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut data)
        .map_err(|_| "Could not read achievements.")?;
    if data.len() as u64 > MAX_BYTES {
        return Err("The achievement file is too large.".into());
    }
    let snapshot: Snapshot =
        serde_json::from_slice(&data).map_err(|_| "Invalid achievement file.")?;
    let mut ids = HashSet::new();
    if snapshot.schema != 1
        || snapshot.achievements.iter().any(|entry| {
            !installer::valid_id(&entry.id)
                || !ids.insert(&entry.id)
                || entry.name.trim().is_empty()
                || entry.name.chars().count() > 120
                || entry.description.chars().count() > 500
                || entry
                    .earned_at
                    .as_ref()
                    .is_some_and(|date| date.trim().is_empty() || date.len() > 40)
        })
    {
        return Err("Invalid achievement file.".into());
    }
    Ok(Achievements {
        status: "local".into(),
        achievements: snapshot.achievements,
    })
}

#[tauri::command]
pub async fn ahd_achievements(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Achievements, String> {
    launcher_only(&window)?;
    let Some(session) = read_session(&app)? else {
        return Err("Sign in to sync achievements.".into());
    };
    let response = reqwest::Client::builder()
        .user_agent("lakeside-launcher")
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|error| error.to_string())?
        .get(format!("{}/account/launcher/achievements", platform_base()))
        .bearer_auth(&session.token)
        .send()
        .await
        .map_err(|_| "Could not reach the achievement service.")?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Ok(Achievements {
            status: "expired".into(),
            achievements: vec![],
        });
    }
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(Achievements {
            status: "pending".into(),
            achievements: vec![],
        });
    }
    let body = response
        .error_for_status()
        .map_err(|_| "Achievement sync is unavailable.")?
        .bytes()
        .await
        .map_err(|_| "Could not read achievements.")?;
    serde_json::from_slice(&body).map_err(|_| "Invalid achievement response.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlapping_editions_share_one_clock_and_stop_on_last_exit() {
        let id = game_id("margin-of-victory");
        assert_eq!(id, game_id("electioneer"));
        let mut ledger = Ledger::default();
        ledger.start(id);
        ledger.start(id);
        ledger.running.get_mut(id).unwrap().checkpoint = Instant::now() - Duration::from_secs(5);
        ledger.finish(id);
        assert!(ledger.totals[id].running);
        assert!((5_000..6_000).contains(&ledger.totals[id].milliseconds));
        ledger.finish(id);
        assert!(!ledger.totals[id].running);
        assert!(!ledger.running.contains_key(id));
    }

    #[test]
    fn saved_playtime_never_restores_a_running_session() {
        let mut ledger = Ledger::default();
        ledger.start("ahd");
        let data = serde_json::to_vec(&ledger.totals).unwrap();
        let restored: HashMap<String, Playtime> = serde_json::from_slice(&data).unwrap();
        assert!(!restored["ahd"].running);
        assert!(restored["ahd"].last_played_at > 0);
    }
}
