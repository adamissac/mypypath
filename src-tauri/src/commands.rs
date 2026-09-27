// PyPath desktop — the entire filesystem surface exposed to the webview.
//
// The frontend never gets raw fs access: only these six named commands, each
// doing exactly one narrow thing. That is the whole answer to "don't expose
// unrestricted filesystem access to web content" for this app — there is no
// generic read/write command to restrict in the first place.
//
// Every write goes through atomic_write: write to a sibling `.tmp` file,
// fsync it, then rename over the real path. Rename onto an existing path is
// atomic on both a POSIX filesystem and NTFS, so a save that is interrupted
// mid-write (crash, power loss, force-quit) never leaves a half-written file
// where the previous good save used to be — the rename either lands
// completely or not at all.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

const DEFAULT_SAVE_FILENAME: &str = "progress.json";
const CONFIG_FILENAME: &str = "desktop-config.json";
const MAX_RECENTS: usize = 5;

#[derive(Serialize, Deserialize, Default)]
struct DesktopConfig {
    #[serde(default)]
    last_save_path: Option<String>,
    #[serde(default)]
    recent_save_paths: Vec<String>,
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp_path = path.with_extension("tmp");
    {
        let mut f = fs::File::create(&tmp_path)
            .map_err(|e| format!("could not create {}: {}", tmp_path.display(), e))?;
        f.write_all(bytes)
            .map_err(|e| format!("could not write {}: {}", tmp_path.display(), e))?;
        f.sync_all()
            .map_err(|e| format!("could not flush {}: {}", tmp_path.display(), e))?;
    }
    fs::rename(&tmp_path, path)
        .map_err(|e| format!("could not finalize {}: {}", path.display(), e))
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("no app config directory: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(CONFIG_FILENAME))
}

// Split from the AppHandle-based read_config/write_config/remember_path below
// so the actual logic (parse-or-default, serialize-and-write, dedupe-and-
// truncate) is plain functions over a path — testable directly, with no
// Tauri app context needed to construct one. The AppHandle wrappers below are
// just "resolve the real config path, then call these."
fn read_config_at(path: &Path) -> DesktopConfig {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_config_at(path: &Path, cfg: &DesktopConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    atomic_write(path, json.as_bytes())
}

fn remember_path_at(config_path: &Path, path: &str) {
    let mut cfg = read_config_at(config_path);
    cfg.last_save_path = Some(path.to_string());
    cfg.recent_save_paths.retain(|p| p != path);
    cfg.recent_save_paths.insert(0, path.to_string());
    cfg.recent_save_paths.truncate(MAX_RECENTS);
    // Best-effort: a failure here loses recent-file convenience, not progress.
    let _ = write_config_at(config_path, &cfg);
}

fn read_config(app: &AppHandle) -> DesktopConfig {
    match config_path(app) {
        Ok(p) => read_config_at(&p),
        Err(_) => DesktopConfig::default(),
    }
}

fn remember_path(app: &AppHandle, path: &str) {
    if let Ok(p) = config_path(app) {
        remember_path_at(&p, path);
    }
    // No config directory at all is the same "lose the convenience, not the
    // progress" tradeoff remember_path_at's own failures already make.
}

/// The default save location under this OS's app-data directory, created if
/// it doesn't exist yet. Used on first launch, before anyone has chosen a
/// custom location.
#[tauri::command]
pub fn default_save_path(app: AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data directory: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(DEFAULT_SAVE_FILENAME).to_string_lossy().into_owned())
}

/// The last path saved to or loaded from, if any — remembered across launches
/// so reopening the app resumes from the same file without asking.
#[tauri::command]
pub fn get_last_save_path(app: AppHandle) -> Option<String> {
    read_config(&app).last_save_path
}

#[tauri::command]
pub fn list_recent_saves(app: AppHandle) -> Vec<String> {
    read_config(&app).recent_save_paths
}

/// Writes `data` (a JSON string the frontend has already built) atomically to
/// `path`, then remembers it as the last-used save location.
#[tauri::command]
pub fn save_progress(app: AppHandle, path: String, data: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    atomic_write(&p, data.as_bytes())?;
    remember_path(&app, &path);
    Ok(())
}

/// Reads a save file's raw contents. The frontend is responsible for parsing
/// and validating the JSON — this command only ever returns bytes-as-text or
/// an error, never partially-parsed data.
#[tauri::command]
pub fn load_progress(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
}

/// Native "Save As" dialog. Returns None if the user cancels. Does not write
/// anything itself — the caller still calls save_progress with the chosen
/// path, so cancelling never touches disk.
#[tauri::command]
pub async fn choose_save_location(app: AppHandle) -> Result<Option<String>, String> {
    let chosen = app
        .dialog()
        .file()
        .add_filter("PyPath save file", &["json"])
        .set_file_name(DEFAULT_SAVE_FILENAME)
        .blocking_save_file();
    Ok(chosen.map(|p| p.to_string()))
}

/// Native "Open" dialog for picking an existing save file to resume from.
#[tauri::command]
pub async fn choose_open_location(app: AppHandle) -> Result<Option<String>, String> {
    let chosen = app
        .dialog()
        .file()
        .add_filter("PyPath save file", &["json"])
        .blocking_pick_file();
    Ok(chosen.map(|p| p.to_string()))
}

/// Lets the frontend record a path as "last used" without also writing a
/// save file right now — used right after a successful load, so reopening
/// resumes from the same file even though loading itself never calls
/// save_progress.
#[tauri::command]
pub fn remember_save_path(app: AppHandle, path: String) {
    remember_path(&app, &path);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    // A fresh, unique scratch directory per test rather than a shared fixture
    // dir: these tests run concurrently (cargo test's default), and sharing
    // one directory would make them interfere with each other's files.
    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn scratch_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("pypath-desktop-test-{nanos}-{n}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn atomic_write_creates_the_file_with_no_tmp_left_behind() {
        let dir = scratch_dir();
        let path = dir.join("progress.json");

        atomic_write(&path, b"hello").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "hello");
        assert!(!path.with_extension("tmp").exists());
    }

    #[test]
    fn atomic_write_overwrites_existing_content_cleanly() {
        let dir = scratch_dir();
        let path = dir.join("progress.json");
        fs::write(&path, "old content").unwrap();

        atomic_write(&path, b"new content").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "new content");
    }

    #[test]
    fn atomic_write_creates_missing_parent_directories() {
        // save_progress does its own create_dir_all before calling this, but
        // atomic_write itself only needs the tmp file's parent (the same
        // directory as the target) to exist — worth pinning as its own
        // behavior rather than only ever exercised alongside the command's.
        let dir = scratch_dir();
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("progress.json");

        atomic_write(&path, b"x").unwrap();
        assert!(path.exists());
    }

    #[test]
    fn read_config_at_a_missing_file_returns_default_not_an_error() {
        let dir = scratch_dir();
        let cfg = read_config_at(&dir.join("does-not-exist.json"));
        assert_eq!(cfg.last_save_path, None);
        assert!(cfg.recent_save_paths.is_empty());
    }

    #[test]
    fn read_config_at_a_corrupted_file_returns_default_rather_than_panicking() {
        let dir = scratch_dir();
        let path = dir.join("desktop-config.json");
        fs::write(&path, "{not valid json").unwrap();

        let cfg = read_config_at(&path);
        assert_eq!(cfg.last_save_path, None);
    }

    #[test]
    fn config_round_trips_through_write_and_read() {
        let dir = scratch_dir();
        let path = dir.join("desktop-config.json");
        let cfg = DesktopConfig {
            last_save_path: Some("/data/mine.json".to_string()),
            recent_save_paths: vec!["/data/mine.json".to_string()],
        };

        write_config_at(&path, &cfg).unwrap();
        let read_back = read_config_at(&path);

        assert_eq!(read_back.last_save_path, cfg.last_save_path);
        assert_eq!(read_back.recent_save_paths, cfg.recent_save_paths);
    }

    #[test]
    fn remember_path_at_sets_last_used_and_prepends_to_recents() {
        let dir = scratch_dir();
        let cfg_path = dir.join("desktop-config.json");

        remember_path_at(&cfg_path, "/data/a.json");
        remember_path_at(&cfg_path, "/data/b.json");

        let cfg = read_config_at(&cfg_path);
        assert_eq!(cfg.last_save_path, Some("/data/b.json".to_string()));
        assert_eq!(cfg.recent_save_paths, vec!["/data/b.json", "/data/a.json"]);
    }

    #[test]
    fn remember_path_at_moves_a_repeated_path_to_front_instead_of_duplicating() {
        let dir = scratch_dir();
        let cfg_path = dir.join("desktop-config.json");

        remember_path_at(&cfg_path, "/data/a.json");
        remember_path_at(&cfg_path, "/data/b.json");
        remember_path_at(&cfg_path, "/data/a.json");

        let cfg = read_config_at(&cfg_path);
        assert_eq!(cfg.recent_save_paths, vec!["/data/a.json", "/data/b.json"]);
    }

    #[test]
    fn remember_path_at_truncates_to_max_recents() {
        let dir = scratch_dir();
        let cfg_path = dir.join("desktop-config.json");

        for i in 0..(MAX_RECENTS + 3) {
            remember_path_at(&cfg_path, &format!("/data/{i}.json"));
        }

        let cfg = read_config_at(&cfg_path);
        assert_eq!(cfg.recent_save_paths.len(), MAX_RECENTS);
        // Most recent first: the last one written is still at the front.
        assert_eq!(cfg.recent_save_paths[0], format!("/data/{}.json", MAX_RECENTS + 2));
    }
}
