/**
 * Tauri API wrappers for the music library
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';

// ============================================================================
// Types
// ============================================================================

export interface Song {
  id: number;
  file_path: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  year: number | null;
  genre: string | null;
  duration: number | null;
  track_number: number | null;
  cover_art_path: string | null;
  file_modified_time: number;
  scan_status: string;
}

export interface Playlist {
  id: number;
  name: string;
  description: string | null;
  cover_image_path: string | null;
  is_system: boolean;
  song_count: number;
  total_duration: number;
}

export interface PagedSongs {
  songs: Song[];
  total: number;
}

export interface ScanProgress {
  current_file: string;
  processed: number;
  total: number;
  percentage: number;
  phase: 'Discovering' | 'Processing' | 'Indexing' | 'Complete';
  errors: ScanError[];
}

export interface ScanError {
  file_path: string;
  error: string;
}

export interface AppConfig {
  library_path: string | null;
  volume: number;
  shuffle: boolean;
  repeat: boolean;
}

// ============================================================================
// Tauri invoke wrappers
// ============================================================================

/**
 * Initialize the database (creates tables if not exist)
 */
export async function initDatabase(): Promise<void> {
  return invoke('init_database');
}

/**
 * Get app configuration
 */
export async function getConfig(): Promise<AppConfig> {
  return invoke<AppConfig>('get_config');
}

/**
 * Set library path in config
 */
export async function setLibraryPath(path: string | null): Promise<AppConfig> {
  return invoke<AppConfig>('set_library_path', { path });
}

/**
 * Save full config
 */
export async function saveConfig(config: AppConfig): Promise<void> {
  return invoke('save_config', { newConfig: config });
}

/**
 * Clear all songs and non-system playlists (for rescanning)
 */
export async function clearLibrary(): Promise<void> {
  return invoke('clear_library');
}

/**
 * Get all playlists
 */
export async function listPlaylists(): Promise<Playlist[]> {
  return invoke<Playlist[]>('list_playlists');
}

/**
 * Query songs with pagination
 * @param playlistId - Optional playlist ID. If null, queries all songs.
 * @param limit - Number of songs to fetch
 * @param offset - Offset for pagination
 */
export async function querySongs(
  playlistId: number | null,
  limit: number,
  offset: number
): Promise<PagedSongs> {
  return invoke<PagedSongs>('query_songs', {
    playlistId,
    limit,
    offset,
  });
}

/**
 * Create a new playlist with optional description, cover and songs
 */
export async function createPlaylist(
  name: string,
  description: string | null,
  cover: string | null,
  songIds: number[]
): Promise<number> {
  const playlistId = await invoke<number>('create_playlist', { name, description, cover });
  
  // Add songs if provided
  if (songIds && songIds.length > 0) {
    await addSongsToPlaylist(playlistId, songIds);
  }
  
  return playlistId;
}

/**
 * Rename a playlist
 */
export async function renamePlaylist(id: number, name: string): Promise<void> {
  return invoke('rename_playlist', { id, name });
}

/**
 * Update a playlist's description
 */
export async function updatePlaylistDescription(id: number, description: string | null): Promise<void> {
  return invoke('update_playlist_description', { id, description });
}

/**
 * Delete a playlist (only non-system playlists)
 */
export async function deletePlaylist(id: number): Promise<void> {
  return invoke('delete_playlist', { id });
}

/**
 * Update playlist cover image
 */
export async function updatePlaylistCover(id: number, coverPath: string | null): Promise<void> {
  return invoke('update_playlist_cover', { id, coverPath });
}

/**
 * Add a song to a playlist
 */
export async function addSongToPlaylist(playlistId: number, songId: number): Promise<void> {
  return invoke('add_song_to_playlist', { playlistId, songId });
}

/**
 * Add multiple songs to a playlist
 */
export async function addSongsToPlaylist(playlistId: number, songIds: number[]): Promise<void> {
  return invoke('add_songs_to_playlist', { playlistId, songIds });
}

/**
 * Remove a song from a playlist
 */
export async function removeSongFromPlaylist(playlistId: number, songId: number): Promise<void> {
  return invoke('remove_song_from_playlist', { playlistId, songId });
}

/**
 * Reorder songs in a playlist
 */
export async function reorderPlaylist(
  playlistId: number,
  positions: Array<{ song_id: number; position: number }>
): Promise<void> {
  return invoke('reorder_playlist', {
    payload: {
      playlist_id: playlistId,
      positions,
    },
  });
}

/**
 * Get all playlists that contain a specific song
 */
export async function getSongPlaylists(songId: number): Promise<number[]> {
  return invoke('get_song_playlists', { songId });
}

/**
 * Scan a folder for music files
 */
export async function scanFolder(root: string): Promise<void> {
  return invoke('scan_folder', { root });
}

/**
 * Retry scanning failed files
 */
export async function retryFailedScans(): Promise<void> {
  return invoke('retry_failed_scans');
}

/**
 * Listen for scan progress updates
 */
export async function onScanProgress(
  handler: (progress: ScanProgress) => void
): Promise<() => void> {
  return listen<ScanProgress>('scan-progress', (event) => {
    handler(event.payload);
  });
}

/**
 * Open folder picker dialog
 */
export async function openFolderDialog(): Promise<string | null> {
  // Use dynamic import for the dialog plugin
  try {
    // @ts-ignore - plugin types may not be available
    const dialog = await import('@tauri-apps/plugin-dialog');
    const selected = await dialog.open({
      directory: true,
      multiple: false,
      title: 'Select Music Folder',
    });
    return selected as string | null;
  } catch (e) {
    console.error('Dialog plugin error:', e);
    return null;
  }
}

/**
 * Open image picker dialog for playlist cover
 */
export async function openImageDialog(): Promise<string | null> {
  try {
    // @ts-ignore - plugin types may not be available
    const dialog = await import('@tauri-apps/plugin-dialog');
    const selected = await dialog.open({
      directory: false,
      multiple: false,
      title: 'Select Cover Image',
      filters: [{
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
      }]
    });
    return selected as string | null;
  } catch (e) {
    console.error('Dialog plugin error:', e);
    return null;
  }
}

/**
 * Save a resized cover image (base64) to the covers directory
 */
export async function saveResizedCoverImage(base64: string, maxSize = 256): Promise<string> {
  return invoke<string>('save_resized_cover_image', { base64Data: base64, maxSize });
}

/**
 * Save a resized cover image from a file path to the covers directory
 */
export async function saveResizedCoverImageFromPath(imagePath: string, maxSize = 256): Promise<string> {
  return invoke<string>('save_resized_cover_image_from_path', { imagePath, maxSize });
}

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Convert a local file path to a URL that can be loaded in the webview
 */
export { convertFileSrc };

/**
 * Format duration in seconds to mm:ss
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get display title for a song (use filename if no title)
 */
export function getDisplayTitle(song: Song): string {
  if (song.title) return song.title;
  // Extract filename from path
  const path = song.file_path;
  const filename = path.split(/[/\\]/).pop() || path;
  // Remove extension
  return filename.replace(/\.[^/.]+$/, '');
}

/**
 * Get display artist for a song
 */
export function getDisplayArtist(song: Song): string {
  return song.artist || 'Unknown Artist';
}

/**
 * Get cover art URL for a song
 * Converts the local file path to a Tauri asset URL
 */
export function getCoverArtUrl(song: Song): string | null {
  if (!song.cover_art_path) return null;
  return convertFileSrc(song.cover_art_path);
}
