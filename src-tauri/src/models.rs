use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Represents a song row from the database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongRow {
    pub id: i64,
    pub file_path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub duration: Option<f64>,
    pub track_number: Option<i32>,
    pub file_modified_time: i64,
    pub scan_status: String,
}

/// Represents a playlist row from the database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistRow {
    pub id: i64,
    pub name: String,
    pub cover_image_path: Option<String>,
    pub is_system: bool,
}

/// Paginated response for songs
#[derive(Debug, Serialize, Deserialize)]
pub struct PagedSongs {
    pub songs: Vec<SongRow>,
    pub total: i64,
}

/// Request to scan a folder
#[derive(Debug, Deserialize)]
pub struct ScanRequest {
    pub root: PathBuf,
}

/// Progress update during scanning
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    pub current_file: String,
    pub processed: usize,
    pub total: usize,
    pub percentage: f32,
    pub phase: ScanPhase,
    pub errors: Vec<ScanError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ScanPhase {
    Discovering,
    Processing,
    Indexing,
    Complete,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanError {
    pub file_path: String,
    pub error: String,
}

/// Payload for reordering songs in a playlist
#[derive(Debug, Deserialize)]
pub struct PlaylistPositions {
    pub playlist_id: i64,
    pub positions: Vec<SongPosition>,
}

#[derive(Debug, Deserialize)]
pub struct SongPosition {
    pub song_id: i64,
    pub position: i64,
}

/// Metadata extracted from an audio file
#[derive(Debug, Default)]
pub struct AudioMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub duration: Option<f64>,
    pub track_number: Option<i32>,
}

/// Song data ready for database insertion
#[derive(Debug)]
pub struct SongInsert {
    pub file_path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub duration: Option<f64>,
    pub track_number: Option<i32>,
    pub file_modified_time: i64,
    pub scan_status: String,
}

/// File info for incremental scanning
#[derive(Debug)]
pub struct FileInfo {
    pub path: PathBuf,
    pub modified_time: i64,
}
