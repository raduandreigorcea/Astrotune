mod image_utils;
#[tauri::command]
async fn save_resized_cover_image(
    covers_state: State<'_, CoversPath>,
    base64_data: String,
    max_size: Option<u32>
) -> AppResult<String> {
    let covers_dir = covers_state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        image_utils::save_resized_cover(&base64_data, &covers_dir, max_size.unwrap_or(256))
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn save_resized_cover_image_from_path(
    covers_state: State<'_, CoversPath>,
    image_path: String,
    max_size: Option<u32>
) -> AppResult<String> {
    let covers_dir = covers_state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        image_utils::save_resized_cover_from_path(
            std::path::Path::new(&image_path),
            &covers_dir,
            max_size.unwrap_or(256),
        )
    })
    .await
    .unwrap()
}

mod config;
mod db;
mod error;
mod models;
mod scanner;

use std::path::PathBuf;

use config::{AppConfig, CONFIG_FILENAME};
use db::DB_PATH;
use error::AppError;
use models::{PagedSongs, PlaylistPositions, PlaylistRow, ScanProgress, ScanRequest, SongRow};
use tauri::{Emitter, Manager, State};

pub type AppResult<T> = Result<T, AppError>;

struct DbPath(PathBuf);
struct ConfigPath(PathBuf);
struct CoversPath(PathBuf);

#[tauri::command]
async fn init_database(state: State<'_, DbPath>) -> AppResult<()> {
    let path = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::open_db(&path)?;
        db::init_db(&conn)?;
        db::create_indexes(&conn)?;
        Ok::<_, AppError>(())
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn clear_library(state: State<'_, DbPath>) -> AppResult<()> {
    let path = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::open_db(&path)?;
        db::clear_library(&conn)?;
        Ok::<_, AppError>(())
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn get_config(state: State<'_, ConfigPath>) -> AppResult<AppConfig> {
    let path = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        config::load_config(&path)
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn set_library_path(state: State<'_, ConfigPath>, path: Option<String>) -> AppResult<AppConfig> {
    let config_path = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        config::update_config(&config_path, |c| {
            c.library_path = path;
        })
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn save_config(state: State<'_, ConfigPath>, new_config: AppConfig) -> AppResult<()> {
    let config_path = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        config::save_config(&config_path, &new_config)
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn list_playlists(state: State<'_, DbPath>) -> AppResult<Vec<PlaylistRow>> {
    let path = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::open_db(&path)?;
        let mut rows = Vec::new();
        for (id, name, cover_image_path, is_system) in db::list_playlists(&conn)? {
            rows.push(PlaylistRow {
                id,
                name,
                is_system,
                cover_image_path,
            });
        }
        Ok::<_, AppError>(rows)
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn query_songs(
    state: State<'_, DbPath>,
    playlist_id: Option<i64>,
    limit: i64,
    offset: i64,
) -> AppResult<PagedSongs> {
    let path = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::open_db(&path)?;
        let songs: Vec<SongRow> = match playlist_id {
            Some(pid) => db::query_playlist_songs(&conn, pid, limit, offset)?,
            None => db::query_all_songs(&conn, limit, offset)?,
        };
        let total = match playlist_id {
            Some(pid) => db::playlist_count(&conn, pid)?,
            None => db::songs_count(&conn)?,
        };
        Ok::<_, AppError>(PagedSongs { songs, total })
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn create_playlist(state: State<'_, DbPath>, name: String, cover: Option<String>) -> AppResult<i64> {
    let path = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::open_db(&path)?;
        db::create_playlist(&conn, &name, cover.as_deref())
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn rename_playlist(state: State<'_, DbPath>, id: i64, name: String) -> AppResult<()> {
    let path = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::open_db(&path)?;
        db::rename_playlist(&conn, id, &name)
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn delete_playlist(state: State<'_, DbPath>, id: i64) -> AppResult<()> {
    let path = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::open_db(&path)?;
        db::delete_playlist(&conn, id)
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn update_playlist_cover(state: State<'_, DbPath>, id: i64, cover_path: Option<String>) -> AppResult<()> {
    let path = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::open_db(&path)?;
        db::update_playlist_cover(&conn, id, cover_path.as_deref())
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn add_song_to_playlist(state: State<'_, DbPath>, playlist_id: i64, song_id: i64) -> AppResult<()> {
    let path = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::open_db(&path)?;
        db::add_song_to_playlist(&conn, playlist_id, song_id)
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn add_songs_to_playlist(state: State<'_, DbPath>, playlist_id: i64, song_ids: Vec<i64>) -> AppResult<()> {
    let path = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::open_db(&path)?;
        db::add_songs_to_playlist_batch(&conn, playlist_id, &song_ids)
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn remove_song_from_playlist(
    state: State<'_, DbPath>,
    playlist_id: i64,
    song_id: i64,
) -> AppResult<()> {
    let path = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::open_db(&path)?;
        db::remove_song_from_playlist(&conn, playlist_id, song_id)
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn reorder_playlist(state: State<'_, DbPath>, payload: PlaylistPositions) -> AppResult<()> {
    let path = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::open_db(&path)?;
        let pairs: Vec<(i64, i64)> = payload
            .positions
            .iter()
            .map(|p| (p.song_id, p.position))
            .collect();
        db::reorder_playlist(&conn, payload.playlist_id, &pairs)
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn scan_folder(
    app: tauri::AppHandle,
    db_state: State<'_, DbPath>,
    covers_state: State<'_, CoversPath>,
    root: String,
) -> AppResult<()> {
    let db_path = db_state.0.clone();
    let covers_path = covers_state.0.clone();
    let root_path = PathBuf::from(root);
    tauri::async_runtime::spawn_blocking(move || {
        scanner::scan(
            ScanRequest { root: root_path },
            &db_path,
            &covers_path,
            |progress: ScanProgress| {
                let _ = app.emit("scan-progress", progress);
            },
        )
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn retry_failed_scans(
    app: tauri::AppHandle, 
    state: State<'_, DbPath>,
    covers_state: State<'_, CoversPath>
) -> AppResult<()> {
    let db_path = state.0.clone();
    let covers_path = covers_state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        scanner::retry_failed_files(
            &db_path,
            &covers_path,
            |progress: ScanProgress| {
                let _ = app.emit("scan-progress", progress);
            },
        )
    })
    .await
    .unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Use app data directory instead of current working directory
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to get app data directory");
            
            // Ensure directory exists
            std::fs::create_dir_all(&app_data_dir)
                .expect("Failed to create app data directory");
            
            let db_path = app_data_dir.join(DB_PATH);
            let config_path = app_data_dir.join(CONFIG_FILENAME);
            let covers_path = app_data_dir.join("covers");
            
            // Ensure covers directory exists
            std::fs::create_dir_all(&covers_path)
                .expect("Failed to create covers directory");
            
            app.manage(DbPath(db_path));
            app.manage(ConfigPath(config_path));
            app.manage(CoversPath(covers_path));
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            init_database,
            clear_library,
            get_config,
            set_library_path,
            save_config,
            list_playlists,
            query_songs,
            create_playlist,
            rename_playlist,
            delete_playlist,
            update_playlist_cover,
            add_song_to_playlist,
            add_songs_to_playlist,
            remove_song_from_playlist,
            reorder_playlist,
            scan_folder,
            retry_failed_scans,
            save_resized_cover_image,
            save_resized_cover_image_from_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
