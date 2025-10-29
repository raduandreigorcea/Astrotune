// ...existing code...
use lofty::tag::Accessor;
// ...existing code...

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;
use lofty::prelude::AudioFile;
use lofty::probe::Probe;
use tauri::Emitter;
use lofty::file::TaggedFileExt;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct Song {
    id: Option<i64>,
    title: String,
    artist: String,
    album: String,
    duration: i32,
    file_path: String,
}


#[tauri::command]
async fn scan_music_directory(directory: String, app: AppHandle) -> Result<Vec<Song>, String> {
    let mut songs = Vec::new();
    let audio_extensions = ["mp3", "flac", "wav", "m4a", "ogg", "opus", "aac", "wma"];
    let entries: Vec<_> = WalkDir::new(&directory)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|entry| {
            entry.path().is_file() && entry.path().extension().map(|ext| audio_extensions.contains(&ext.to_string_lossy().to_lowercase().as_str())).unwrap_or(false)
        })
        .collect();

    let total = entries.len();
    for (i, entry) in entries.iter().enumerate() {
        let path = entry.path();
        let mut title = String::new();
        let mut artist = String::from("Unknown Artist");
        let mut album = String::from("Unknown Album");
        let mut duration = 0;

        if let Ok(tagged_file) = Probe::open(path).and_then(|p| p.read()) {
            if let Some(tag) = tagged_file.primary_tag() {
                if let Some(t) = tag.title() {
                    title = t.to_string();
                }
                if let Some(a) = tag.artist() {
                    artist = a.to_string();
                }
                if let Some(alb) = tag.album() {
                    album = alb.to_string();
                }
            }
            // properties().duration() returns Duration directly
            let dur = tagged_file.properties().duration();
            duration = dur.as_secs() as i32;
        }
        if title.is_empty() {
            title = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
        }

        let song = Song {
            id: None,
            title,
            artist,
            album,
            duration,
            file_path: path.to_string_lossy().to_string(),
        };
        songs.push(song);

        // Emit progress event
        let _ = app.emit("scan-progress", serde_json::json!({
            "current": i + 1,
            "total": total
        }));
    }

    Ok(songs)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![scan_music_directory])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
