use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

use crate::error::AppError;
use crate::models::{SongInsert, SongRow};
use crate::AppResult;

pub const DB_PATH: &str = "astrotune.db";

/// Open a database connection with optimized settings
pub fn open_db(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    
    // Performance optimizations
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA cache_size = -64000;
        PRAGMA temp_store = MEMORY;
        PRAGMA mmap_size = 268435456;
        PRAGMA foreign_keys = ON;
        "
    )?;
    
    Ok(conn)
}

/// Initialize the database schema
pub fn init_db(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "
        -- Songs table: stores all music file metadata
        CREATE TABLE IF NOT EXISTS songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL UNIQUE,
            title TEXT,
            artist TEXT,
            album TEXT,
            year INTEGER,
            genre TEXT,
            duration REAL,
            track_number INTEGER,
            file_modified_time INTEGER NOT NULL,
            scan_status TEXT NOT NULL DEFAULT 'ok',
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        );

        -- Playlists table: stores playlist metadata
        CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            cover_image_path TEXT,
            is_system INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        );

        -- Junction table for playlist songs with custom ordering
        CREATE TABLE IF NOT EXISTS playlist_songs (
            playlist_id INTEGER NOT NULL,
            song_id INTEGER NOT NULL,
            position INTEGER NOT NULL,
            added_at INTEGER DEFAULT (strftime('%s', 'now')),
            PRIMARY KEY (playlist_id, song_id),
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
        );

        -- Trigger to update songs.updated_at on modification
        CREATE TRIGGER IF NOT EXISTS update_songs_timestamp 
        AFTER UPDATE ON songs
        BEGIN
            UPDATE songs SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
        END;

        -- Trigger to update playlists.updated_at on modification
        CREATE TRIGGER IF NOT EXISTS update_playlists_timestamp 
        AFTER UPDATE ON playlists
        BEGIN
            UPDATE playlists SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
        END;
        "
    )?;

    // Create the system 'All Songs' playlist if it doesn't exist
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM playlists WHERE is_system = 1 AND name = 'All Songs'",
            [],
            |_| Ok(true),
        )
        .optional()?
        .unwrap_or(false);

    if !exists {
        conn.execute(
            "INSERT INTO playlists (name, is_system) VALUES ('All Songs', 1)",
            [],
        )?;
    }

    Ok(())
}

/// Create indexes after bulk inserts for better performance
pub fn create_indexes(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
        CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
        CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(album);
        CREATE INDEX IF NOT EXISTS idx_songs_file_path ON songs(file_path);
        CREATE INDEX IF NOT EXISTS idx_songs_genre ON songs(genre);
        CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist ON playlist_songs(playlist_id);
        CREATE INDEX IF NOT EXISTS idx_playlist_songs_song ON playlist_songs(song_id);
        CREATE INDEX IF NOT EXISTS idx_playlist_songs_position ON playlist_songs(playlist_id, position);
        "
    )?;
    Ok(())
}

/// Drop indexes before bulk inserts for better insert performance
pub fn drop_indexes(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "
        DROP INDEX IF EXISTS idx_songs_title;
        DROP INDEX IF EXISTS idx_songs_artist;
        DROP INDEX IF EXISTS idx_songs_album;
        DROP INDEX IF EXISTS idx_songs_file_path;
        DROP INDEX IF EXISTS idx_songs_genre;
        DROP INDEX IF EXISTS idx_playlist_songs_playlist;
        DROP INDEX IF EXISTS idx_playlist_songs_song;
        DROP INDEX IF EXISTS idx_playlist_songs_position;
        "
    )?;
    Ok(())
}

// ============================================================================
// SONG OPERATIONS
// ============================================================================

/// Insert a batch of songs into the database
pub fn insert_songs_batch(conn: &Connection, songs: &[SongInsert]) -> AppResult<Vec<i64>> {
    let mut stmt = conn.prepare_cached(
        "INSERT OR REPLACE INTO songs 
         (file_path, title, artist, album, year, genre, duration, track_number, file_modified_time, scan_status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         RETURNING id"
    )?;

    let mut ids = Vec::with_capacity(songs.len());
    for song in songs {
        let id: i64 = stmt.query_row(
            params![
                song.file_path,
                song.title,
                song.artist,
                song.album,
                song.year,
                song.genre,
                song.duration,
                song.track_number,
                song.file_modified_time,
                song.scan_status,
            ],
            |row| row.get(0),
        )?;
        ids.push(id);
    }

    Ok(ids)
}

/// Get existing songs by file paths (for incremental scanning)
pub fn get_existing_songs(conn: &Connection, paths: &[String]) -> AppResult<Vec<(String, i64)>> {
    if paths.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders: String = paths.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query = format!(
        "SELECT file_path, file_modified_time FROM songs WHERE file_path IN ({})",
        placeholders
    );

    let mut stmt = conn.prepare(&query)?;
    let params: Vec<&dyn rusqlite::ToSql> = paths.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
    
    let rows = stmt.query_map(params.as_slice(), |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

/// Query all songs with pagination
pub fn query_all_songs(conn: &Connection, limit: i64, offset: i64) -> AppResult<Vec<SongRow>> {
    let mut stmt = conn.prepare_cached(
        "SELECT id, file_path, title, artist, album, year, genre, duration, track_number, file_modified_time, scan_status
         FROM songs
         ORDER BY artist COLLATE NOCASE, album COLLATE NOCASE, track_number, title COLLATE NOCASE
         LIMIT ?1 OFFSET ?2"
    )?;

    let rows = stmt.query_map(params![limit, offset], |row| {
        Ok(SongRow {
            id: row.get(0)?,
            file_path: row.get(1)?,
            title: row.get(2)?,
            artist: row.get(3)?,
            album: row.get(4)?,
            year: row.get(5)?,
            genre: row.get(6)?,
            duration: row.get(7)?,
            track_number: row.get(8)?,
            file_modified_time: row.get(9)?,
            scan_status: row.get(10)?,
        })
    })?;

    let mut songs = Vec::new();
    for row in rows {
        songs.push(row?);
    }
    Ok(songs)
}

/// Get total count of songs
pub fn songs_count(conn: &Connection) -> AppResult<i64> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM songs", [], |row| row.get(0))?;
    Ok(count)
}

/// Delete songs that no longer exist on disk
pub fn delete_missing_songs(conn: &Connection, missing_paths: &[String]) -> AppResult<usize> {
    if missing_paths.is_empty() {
        return Ok(0);
    }

    let placeholders: String = missing_paths.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query = format!("DELETE FROM songs WHERE file_path IN ({})", placeholders);
    
    let params: Vec<&dyn rusqlite::ToSql> = missing_paths.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
    let count = conn.execute(&query, params.as_slice())?;
    
    Ok(count)
}

/// Clear all songs and non-system playlists (for rescanning a new folder)
pub fn clear_library(conn: &Connection) -> AppResult<()> {
    // Delete all playlist_songs entries first (foreign key constraint)
    conn.execute("DELETE FROM playlist_songs", [])?;
    // Delete all songs
    conn.execute("DELETE FROM songs", [])?;
    // Delete non-system playlists
    conn.execute("DELETE FROM playlists WHERE is_system = 0", [])?;
    Ok(())
}

// ============================================================================
// PLAYLIST OPERATIONS
// ============================================================================

/// List all playlists
pub fn list_playlists(conn: &Connection) -> AppResult<Vec<(i64, String, bool)>> {
    let mut stmt = conn.prepare_cached(
        "SELECT id, name, is_system FROM playlists ORDER BY is_system DESC, name COLLATE NOCASE"
    )?;

    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, bool>(2)?))
    })?;

    let mut playlists = Vec::new();
    for row in rows {
        playlists.push(row?);
    }
    Ok(playlists)
}

/// Create a new playlist
pub fn create_playlist(conn: &Connection, name: &str, cover_image_path: Option<&str>) -> AppResult<i64> {
    conn.execute(
        "INSERT INTO playlists (name, cover_image_path, is_system) VALUES (?1, ?2, 0)",
        params![name, cover_image_path],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Rename a playlist (only non-system playlists)
pub fn rename_playlist(conn: &Connection, id: i64, name: &str) -> AppResult<()> {
    let is_system: bool = conn
        .query_row("SELECT is_system FROM playlists WHERE id = ?1", params![id], |row| {
            row.get(0)
        })
        .optional()?
        .unwrap_or(false);

    if is_system {
        return Err(AppError::InvalidOperation(
            "Cannot rename system playlist".to_string(),
        ));
    }

    conn.execute(
        "UPDATE playlists SET name = ?1 WHERE id = ?2 AND is_system = 0",
        params![name, id],
    )?;
    Ok(())
}

/// Delete a playlist (only non-system playlists)
pub fn delete_playlist(conn: &Connection, id: i64) -> AppResult<()> {
    let is_system: bool = conn
        .query_row("SELECT is_system FROM playlists WHERE id = ?1", params![id], |row| {
            row.get(0)
        })
        .optional()?
        .unwrap_or(false);

    if is_system {
        return Err(AppError::InvalidOperation(
            "Cannot delete system playlist".to_string(),
        ));
    }

    conn.execute("DELETE FROM playlists WHERE id = ?1 AND is_system = 0", params![id])?;
    Ok(())
}

/// Update playlist cover image
pub fn update_playlist_cover(conn: &Connection, id: i64, cover_image_path: Option<&str>) -> AppResult<()> {
    conn.execute(
        "UPDATE playlists SET cover_image_path = ?1 WHERE id = ?2",
        params![cover_image_path, id],
    )?;
    Ok(())
}

/// Get the system "All Songs" playlist ID
pub fn get_all_songs_playlist_id(conn: &Connection) -> AppResult<i64> {
    let id: i64 = conn.query_row(
        "SELECT id FROM playlists WHERE is_system = 1 AND name = 'All Songs'",
        [],
        |row| row.get(0),
    )?;
    Ok(id)
}

// ============================================================================
// PLAYLIST_SONGS OPERATIONS
// ============================================================================

/// Query songs from a specific playlist with pagination
pub fn query_playlist_songs(conn: &Connection, playlist_id: i64, limit: i64, offset: i64) -> AppResult<Vec<SongRow>> {
    let mut stmt = conn.prepare_cached(
        "SELECT s.id, s.file_path, s.title, s.artist, s.album, s.year, s.genre, s.duration, s.track_number, s.file_modified_time, s.scan_status
         FROM songs s
         INNER JOIN playlist_songs ps ON s.id = ps.song_id
         WHERE ps.playlist_id = ?1
         ORDER BY ps.position
         LIMIT ?2 OFFSET ?3"
    )?;

    let rows = stmt.query_map(params![playlist_id, limit, offset], |row| {
        Ok(SongRow {
            id: row.get(0)?,
            file_path: row.get(1)?,
            title: row.get(2)?,
            artist: row.get(3)?,
            album: row.get(4)?,
            year: row.get(5)?,
            genre: row.get(6)?,
            duration: row.get(7)?,
            track_number: row.get(8)?,
            file_modified_time: row.get(9)?,
            scan_status: row.get(10)?,
        })
    })?;

    let mut songs = Vec::new();
    for row in rows {
        songs.push(row?);
    }
    Ok(songs)
}

/// Get count of songs in a playlist
pub fn playlist_count(conn: &Connection, playlist_id: i64) -> AppResult<i64> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM playlist_songs WHERE playlist_id = ?1",
        params![playlist_id],
        |row| row.get(0),
    )?;
    Ok(count)
}

/// Add a song to a playlist
pub fn add_song_to_playlist(conn: &Connection, playlist_id: i64, song_id: i64) -> AppResult<()> {
    // Get the next position
    let max_pos: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM playlist_songs WHERE playlist_id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )?;

    conn.execute(
        "INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?1, ?2, ?3)",
        params![playlist_id, song_id, max_pos + 1],
    )?;
    Ok(())
}

/// Add multiple songs to a playlist in batch
pub fn add_songs_to_playlist_batch(conn: &Connection, playlist_id: i64, song_ids: &[i64]) -> AppResult<()> {
    if song_ids.is_empty() {
        return Ok(());
    }

    // Get the starting position
    let max_pos: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM playlist_songs WHERE playlist_id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )?;

    let mut stmt = conn.prepare_cached(
        "INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?1, ?2, ?3)"
    )?;

    for (i, &song_id) in song_ids.iter().enumerate() {
        stmt.execute(params![playlist_id, song_id, max_pos + 1 + i as i64])?;
    }

    Ok(())
}

/// Remove a song from a playlist
pub fn remove_song_from_playlist(conn: &Connection, playlist_id: i64, song_id: i64) -> AppResult<()> {
    // Check if it's a system playlist
    let is_system: bool = conn
        .query_row(
            "SELECT is_system FROM playlists WHERE id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or(false);

    if is_system {
        return Err(AppError::InvalidOperation(
            "Cannot remove songs from system playlist".to_string(),
        ));
    }

    conn.execute(
        "DELETE FROM playlist_songs WHERE playlist_id = ?1 AND song_id = ?2",
        params![playlist_id, song_id],
    )?;
    Ok(())
}

/// Reorder songs in a playlist
pub fn reorder_playlist(conn: &Connection, playlist_id: i64, positions: &[(i64, i64)]) -> AppResult<()> {
    let mut stmt = conn.prepare_cached(
        "UPDATE playlist_songs SET position = ?1 WHERE playlist_id = ?2 AND song_id = ?3"
    )?;

    for &(song_id, position) in positions {
        stmt.execute(params![position, playlist_id, song_id])?;
    }

    Ok(())
}

// ============================================================================
// TRANSACTION HELPERS
// ============================================================================

/// Execute a function within a transaction
#[allow(dead_code)]
pub fn with_transaction<F, T>(conn: &Connection, f: F) -> AppResult<T>
where
    F: FnOnce() -> AppResult<T>,
{
    conn.execute("BEGIN TRANSACTION", [])?;
    match f() {
        Ok(result) => {
            conn.execute("COMMIT", [])?;
            Ok(result)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

/// Begin a transaction
pub fn begin_transaction(conn: &Connection) -> AppResult<()> {
    conn.execute("BEGIN TRANSACTION", [])?;
    Ok(())
}

/// Commit a transaction
pub fn commit_transaction(conn: &Connection) -> AppResult<()> {
    conn.execute("COMMIT", [])?;
    Ok(())
}

/// Rollback a transaction
pub fn rollback_transaction(conn: &Connection) -> AppResult<()> {
    conn.execute("ROLLBACK", [])?;
    Ok(())
}
