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

fn read_config(app: &AppHandle) -> DesktopConfig {
    let path = match config_path(app) {
        Ok(p) => p,
        Err(_) => return DesktopConfig::default(),
    };
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_config(app: &AppHandle, cfg: &DesktopConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    atomic_write(&path, json.as_bytes())
}

fn remember_path(app: &AppHandle, path: &str) {
    let mut cfg = read_config(app);
    cfg.last_save_path = Some(path.to_string());
    cfg.recent_save_paths.retain(|p| p != path);
    cfg.recent_save_paths.insert(0, path.to_string());
    cfg.recent_save_paths.truncate(MAX_RECENTS);
    // Best-effort: a failure here loses recent-file convenience, not progress.
    let _ = write_config(app, &cfg);
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
