use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use lofty::{Accessor, AudioFile, Probe, TaggedFileExt};
use walkdir::WalkDir;

use crate::db;
use crate::error::AppError;
use crate::models::{AudioMetadata, FileInfo, ScanError, ScanPhase, ScanProgress, ScanRequest, SongInsert};
use crate::AppResult;

/// Batch size for processing files
const BATCH_SIZE: usize = 300;

/// Supported audio file extensions
const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "m4a", "wav", "ogg", "opus", "aac", "wma"];

/// Main scanning function with progress callbacks
pub fn scan<F>(request: ScanRequest, db_path: &Path, mut on_progress: F) -> AppResult<()>
where
    F: FnMut(ScanProgress),
{
    let conn = db::open_db(db_path)?;
    let mut errors: Vec<ScanError> = Vec::new();

    // Phase 1: Discover all audio files
    on_progress(ScanProgress {
        current_file: "Discovering files...".to_string(),
        processed: 0,
        total: 0,
        percentage: 0.0,
        phase: ScanPhase::Discovering,
        errors: errors.clone(),
    });

    let audio_files = discover_audio_files(&request.root)?;
    let total_files = audio_files.len();

    if total_files == 0 {
        on_progress(ScanProgress {
            current_file: "No audio files found".to_string(),
            processed: 0,
            total: 0,
            percentage: 100.0,
            phase: ScanPhase::Complete,
            errors: errors.clone(),
        });
        return Ok(());
    }

    // Get existing files from database for incremental scanning
    let file_paths: Vec<String> = audio_files
        .iter()
        .map(|f| f.path.to_string_lossy().to_string())
        .collect();

    let existing_files: HashMap<String, i64> = db::get_existing_songs(&conn, &file_paths)?
        .into_iter()
        .collect();

    // Filter to only new or modified files
    let files_to_process: Vec<&FileInfo> = audio_files
        .iter()
        .filter(|f| {
            let path_str = f.path.to_string_lossy().to_string();
            match existing_files.get(&path_str) {
                Some(&existing_mtime) => f.modified_time != existing_mtime,
                None => true,
            }
        })
        .collect();

    let files_to_process_count = files_to_process.len();

    // Check for deleted files
    let current_paths: std::collections::HashSet<String> = file_paths.into_iter().collect();
    let existing_paths: Vec<String> = existing_files.keys().cloned().collect();
    let deleted_paths: Vec<String> = existing_paths
        .into_iter()
        .filter(|p| !current_paths.contains(p))
        .collect();

    if !deleted_paths.is_empty() {
        db::delete_missing_songs(&conn, &deleted_paths)?;
    }

    if files_to_process_count == 0 {
        on_progress(ScanProgress {
            current_file: "Library up to date".to_string(),
            processed: total_files,
            total: total_files,
            percentage: 100.0,
            phase: ScanPhase::Complete,
            errors: errors.clone(),
        });
        return Ok(());
    }

    // Phase 2: Process files in batches
    // Drop indexes for faster bulk insert
    db::drop_indexes(&conn)?;

    let all_songs_playlist_id = db::get_all_songs_playlist_id(&conn)?;
    let mut processed = 0;

    for chunk in files_to_process.chunks(BATCH_SIZE) {
        let mut batch_songs: Vec<SongInsert> = Vec::with_capacity(chunk.len());

        for file_info in chunk {
            let path_str = file_info.path.to_string_lossy().to_string();
            
            on_progress(ScanProgress {
                current_file: file_info.path.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| path_str.clone()),
                processed,
                total: files_to_process_count,
                percentage: (processed as f32 / files_to_process_count as f32) * 100.0,
                phase: ScanPhase::Processing,
                errors: errors.clone(),
            });

            match extract_metadata(&file_info.path) {
                Ok(metadata) => {
                    batch_songs.push(SongInsert {
                        file_path: path_str,
                        title: metadata.title,
                        artist: metadata.artist,
                        album: metadata.album,
                        year: metadata.year,
                        genre: metadata.genre,
                        duration: metadata.duration,
                        track_number: metadata.track_number,
                        file_modified_time: file_info.modified_time,
                        scan_status: "ok".to_string(),
                    });
                }
                Err(e) => {
                    errors.push(ScanError {
                        file_path: path_str.clone(),
                        error: e.to_string(),
                    });
                    // Still add the file with error status so we don't rescan it
                    batch_songs.push(SongInsert {
                        file_path: path_str,
                        title: None,
                        artist: None,
                        album: None,
                        year: None,
                        genre: None,
                        duration: None,
                        track_number: None,
                        file_modified_time: file_info.modified_time,
                        scan_status: "error".to_string(),
                    });
                }
            }

            processed += 1;
        }

        // Insert batch into database with transaction
        db::begin_transaction(&conn)?;
        match db::insert_songs_batch(&conn, &batch_songs) {
            Ok(song_ids) => {
                // Add to "All Songs" playlist
                db::add_songs_to_playlist_batch(&conn, all_songs_playlist_id, &song_ids)?;
                db::commit_transaction(&conn)?;
            }
            Err(e) => {
                db::rollback_transaction(&conn)?;
                return Err(e);
            }
        }
    }

    // Phase 3: Rebuild indexes
    on_progress(ScanProgress {
        current_file: "Building indexes...".to_string(),
        processed: files_to_process_count,
        total: files_to_process_count,
        percentage: 99.0,
        phase: ScanPhase::Indexing,
        errors: errors.clone(),
    });

    db::create_indexes(&conn)?;

    // Complete
    on_progress(ScanProgress {
        current_file: format!("Scan complete! Processed {} files", files_to_process_count),
        processed: files_to_process_count,
        total: files_to_process_count,
        percentage: 100.0,
        phase: ScanPhase::Complete,
        errors,
    });

    Ok(())
}

/// Recursively discover all audio files in a directory
fn discover_audio_files(root: &Path) -> AppResult<Vec<FileInfo>> {
    let mut files = Vec::new();

    for entry in WalkDir::new(root)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        
        if !path.is_file() {
            continue;
        }

        // Check extension
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());

        if let Some(ext) = ext {
            if AUDIO_EXTENSIONS.contains(&ext.as_str()) {
                // Get file modification time
                let modified_time = fs::metadata(path)
                    .and_then(|m| m.modified())
                    .map(|t| t.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
                    .unwrap_or(0);

                files.push(FileInfo {
                    path: path.to_path_buf(),
                    modified_time,
                });
            }
        }
    }

    Ok(files)
}

/// Extract metadata from an audio file using lofty
fn extract_metadata(path: &Path) -> AppResult<AudioMetadata> {
    let tagged_file = Probe::open(path)
        .map_err(|e| AppError::Metadata(format!("Failed to open file: {}", e)))?
        .read()
        .map_err(|e| AppError::Metadata(format!("Failed to read file: {}", e)))?;

    let mut metadata = AudioMetadata::default();

    // Get duration from properties
    let properties = tagged_file.properties();
    metadata.duration = Some(properties.duration().as_secs_f64());

    // Try to get tags (primary tag first, then any available)
    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());

    if let Some(tag) = tag {
        metadata.title = tag.title().map(|s| s.to_string());
        metadata.artist = tag.artist().map(|s| s.to_string());
        metadata.album = tag.album().map(|s| s.to_string());
        metadata.year = tag.year().map(|y| y as i32);
        metadata.genre = tag.genre().map(|s| s.to_string());
        metadata.track_number = tag.track().map(|t| t as i32);
    }

    // If no title found, use filename
    if metadata.title.is_none() {
        metadata.title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string());
    }

    Ok(metadata)
}

/// Retry scanning failed files
pub fn retry_failed_files<F>(db_path: &Path, mut on_progress: F) -> AppResult<()>
where
    F: FnMut(ScanProgress),
{
    let conn = db::open_db(db_path)?;
    let mut errors: Vec<ScanError> = Vec::new();

    // Get all failed files
    let mut stmt = conn.prepare(
        "SELECT id, file_path, file_modified_time FROM songs WHERE scan_status = 'error'"
    )?;

    let failed_files: Vec<(i64, String, i64)> = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?
        .filter_map(|r| r.ok())
        .collect();

    let total = failed_files.len();
    if total == 0 {
        on_progress(ScanProgress {
            current_file: "No failed files to retry".to_string(),
            processed: 0,
            total: 0,
            percentage: 100.0,
            phase: ScanPhase::Complete,
            errors: Vec::new(),
        });
        return Ok(());
    }

    for (i, (id, file_path, _mtime)) in failed_files.iter().enumerate() {
        let path = PathBuf::from(file_path);
        
        on_progress(ScanProgress {
            current_file: path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| file_path.clone()),
            processed: i,
            total,
            percentage: (i as f32 / total as f32) * 100.0,
            phase: ScanPhase::Processing,
            errors: errors.clone(),
        });

        match extract_metadata(&path) {
            Ok(metadata) => {
                // Update the song with new metadata
                conn.execute(
                    "UPDATE songs SET 
                     title = ?1, artist = ?2, album = ?3, year = ?4, 
                     genre = ?5, duration = ?6, track_number = ?7, scan_status = 'ok'
                     WHERE id = ?8",
                    rusqlite::params![
                        metadata.title,
                        metadata.artist,
                        metadata.album,
                        metadata.year,
                        metadata.genre,
                        metadata.duration,
                        metadata.track_number,
                        id
                    ],
                )?;
            }
            Err(e) => {
                errors.push(ScanError {
                    file_path: file_path.clone(),
                    error: e.to_string(),
                });
            }
        }
    }

    on_progress(ScanProgress {
        current_file: format!("Retry complete! {} files still failed", errors.len()),
        processed: total,
        total,
        percentage: 100.0,
        phase: ScanPhase::Complete,
        errors,
    });

    Ok(())
}
