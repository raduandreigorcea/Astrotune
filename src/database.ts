export async function clearLibrary(): Promise<void> {
  const database = await initDatabase();
  await database.execute('DELETE FROM playlist_songs');
  await database.execute('DELETE FROM playlists WHERE id != 1');
  await database.execute('DELETE FROM songs');
}
import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

export interface Song {
  id?: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  file_path: string;
  date_added?: string;
}

export interface Playlist {
  id?: number;
  name: string;
  created_at?: string;
}

export interface PlaylistSong {
  playlist_id: number;
  song_id: number;
  position: number;
}

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  db = await Database.load("sqlite:astrotune.db");

  // Create tables
  await db.execute(`
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT NOT NULL,
      duration INTEGER DEFAULT 0,
      file_path TEXT UNIQUE NOT NULL,
      date_added DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS playlist_songs (
      playlist_id INTEGER NOT NULL,
      song_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, song_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for better performance
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist ON playlist_songs(playlist_id)
  `);

  // Ensure "All Songs" playlist exists
  await db.execute(`
    INSERT OR IGNORE INTO playlists (id, name) VALUES (1, 'All Songs')
  `);

  return db;
}

export async function addSongs(songs: Song[]): Promise<void> {
  const database = await initDatabase();

  for (const song of songs) {
    try {
      const result: any = await database.execute(
        `INSERT OR IGNORE INTO songs (title, artist, album, duration, file_path) 
         VALUES (?, ?, ?, ?, ?)`,
        [song.title, song.artist, song.album, song.duration, song.file_path]
      );

      // Add to "All Songs" playlist if new song
      if (result.rowsAffected > 0) {
        const songId = result.lastInsertId;
        const maxPosition: any = await database.select(
          `SELECT COALESCE(MAX(position), 0) as max_pos FROM playlist_songs WHERE playlist_id = 1`
        );
        await database.execute(
          `INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (1, ?, ?)`,
          [songId, (maxPosition[0]?.max_pos || 0) + 1]
        );
      }
    } catch (error) {
      console.error("Error adding song:", song.file_path, error);
    }
  }
}

export async function getAllSongs(): Promise<Song[]> {
  const database = await initDatabase();
  return await database.select<Song[]>(
    `SELECT * FROM songs ORDER BY title ASC`
  );
}

export async function getSongsInPlaylist(playlistId: number): Promise<Song[]> {
  const database = await initDatabase();
  return await database.select<Song[]>(
    `SELECT s.* FROM songs s
     INNER JOIN playlist_songs ps ON s.id = ps.song_id
     WHERE ps.playlist_id = ?
     ORDER BY ps.position ASC`,
    [playlistId]
  );
}

export async function getAllPlaylists(): Promise<Playlist[]> {
  const database = await initDatabase();
  return await database.select<Playlist[]>(
    `SELECT * FROM playlists ORDER BY name ASC`
  );
}

export async function createPlaylist(name: string): Promise<number> {
  const database = await initDatabase();
  const result: any = await database.execute(
    `INSERT INTO playlists (name) VALUES (?)`,
    [name]
  );
  return result.lastInsertId;
}

export async function deletePlaylist(playlistId: number): Promise<void> {
  if (playlistId === 1) {
    throw new Error("Cannot delete 'All Songs' playlist");
  }
  const database = await initDatabase();
  await database.execute(`DELETE FROM playlists WHERE id = ?`, [playlistId]);
}

export async function addSongToPlaylist(
  playlistId: number,
  songId: number
): Promise<void> {
  const database = await initDatabase();

  // Get max position
  const maxPosition: any = await database.select(
    `SELECT COALESCE(MAX(position), 0) as max_pos FROM playlist_songs WHERE playlist_id = ?`,
    [playlistId]
  );

  await database.execute(
    `INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)`,
    [playlistId, songId, (maxPosition[0]?.max_pos || 0) + 1]
  );
}

export async function removeSongFromPlaylist(
  playlistId: number,
  songId: number
): Promise<void> {
  const database = await initDatabase();
  await database.execute(
    `DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?`,
    [playlistId, songId]
  );

  // Reorder positions
  await database.execute(
    `UPDATE playlist_songs 
     SET position = (
       SELECT COUNT(*) FROM playlist_songs ps2 
       WHERE ps2.playlist_id = playlist_songs.playlist_id 
       AND ps2.position < playlist_songs.position
     ) + 1
     WHERE playlist_id = ?`,
    [playlistId]
  );
}

export async function searchSongs(query: string): Promise<Song[]> {
  const database = await initDatabase();
  const searchTerm = `%${query}%`;
  return await database.select<Song[]>(
    `SELECT * FROM songs 
     WHERE title LIKE ? OR artist LIKE ? OR album LIKE ?
     ORDER BY title ASC`,
    [searchTerm, searchTerm, searchTerm]
  );
}
