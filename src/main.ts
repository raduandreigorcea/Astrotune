import Alpine from "alpinejs";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, DirEntry, readTextFile, readFile } from "@tauri-apps/plugin-fs";
import { load } from "@tauri-apps/plugin-store";
import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

// Types for our data models
type Song = {
	id: number;
	path: string;
	title: string;
};

type Playlist = {
	id: number;
	name: string;
	coverImage?: string; // Base64 encoded image data
};

type PlaylistWithSongs = Playlist & {
	songs: Song[];
};

type SavedTheme = {
	id: string; // Unique identifier (timestamp-based)
	name: string; // User-given name
	cssContent: string; // The CSS content stored as string
	createdAt: number; // Timestamp
};

Alpine.data("musicFolderPicker", () => ({
	// Database
	db: null as Database | null,
	
	// State
	songs: [] as Song[],
	playlists: [] as Playlist[],
	selectedSong: null as Song | null,
	selectedPlaylist: null as PlaylistWithSongs | null,
	isLoading: false,
	activeTab: "songs" as "songs" | "playlists",
	searchQuery: "",
	
	// Theme management
	savedThemes: [] as SavedTheme[],
	activeThemeId: null as string | null,
	customThemePath: null as string | null, // Legacy support
	
	// Dialogs
	settingsDialog: null as HTMLDialogElement | null,
	playlistDialog: null as HTMLDialogElement | null,
	confirmDeleteDialog: null as HTMLDialogElement | null,
	
	// Playlist creation state
	playlistName: "",
	availableSongs: [] as Song[],
	selectedSongIds: [] as number[],
	playlistCoverImage: null as string | null, // Selected cover image path
	playlistCoverPreview: null as string | null, // Preview data URL for selected cover
	editingPlaylistId: null as number | null, // ID of playlist being edited (for add songs)
	
	// Delete confirmation state
	playlistToDelete: null as Playlist | null,
	
	// Playlist context menu state
	activePlaylistMenu: null as number | null, // ID of playlist with open menu
	
	// Folder
	lastFolderPath: null as string | null,
	
	// Auto-sync state
	autoSyncInterval: null as number | null,

	// Audio controls state
	isPlaying: false,
	currentTime: 0,
	duration: 0,
	volume: 1,
	isMuted: false,
	isShuffled: false,
	repeatMode: "off" as "off" | "one" | "all", // off, repeat one, repeat all
	currentIndex: 0,
	positionUpdateInterval: null as number | null,
	lastUpdateTime: 0,

	// Get cover image path for display
	getCoverImagePath(coverImage: string | undefined): string | null {
		if (!coverImage) return null;
		// coverImage is now base64 data, return it directly as a data URL
		return coverImage;
	},

	// Computed: Filtered songs based on search query
	get filteredSongs() {
		const songsToFilter = this.selectedPlaylist?.songs || this.songs;
		if (!this.searchQuery.trim()) {
			return songsToFilter;
		}
		const query = this.searchQuery.toLowerCase();
		return songsToFilter.filter(song => 
			song.title.toLowerCase().includes(query)
		);
	},

	// Computed: Filtered playlists based on search query
	get filteredPlaylists() {
		if (!this.searchQuery.trim()) {
			return this.playlists;
		}
		const query = this.searchQuery.toLowerCase();
		return this.playlists.filter(playlist => 
			playlist.name.toLowerCase().includes(query)
		);
	},

	// Initialize the app by loading the previously saved folder path from store
	async init() {
		try {
			// Get references to dialog elements
			this.settingsDialog = document.querySelector("dialog#settings");
			this.playlistDialog = document.querySelector("dialog#playlist");
			this.confirmDeleteDialog = document.querySelector("dialog#confirm-delete");
			
			// Initialize Rust audio player
			await invoke("init_audio_player");
			
			// Start position update interval
			this.startPositionUpdate();
			
			// Initialize database
			await this.initDatabase();
			
			// Load store and preferences
			const store = await load("settings.json", { autoSave: true, defaults: {} });
			const savedPath = await store.get<string>("lastFolderPath");
			
			if (savedPath) {
				this.lastFolderPath = savedPath;
				// Load songs from database instead of scanning folder
				await this.loadSongsFromDatabase();
				
				// Start auto-sync to check for new songs periodically
				this.startAutoSync();
			}
			
			// Load playlists
			await this.loadPlaylists();
			
			// Restore selected playlist if saved
			const savedPlaylistId = await store.get<number>("selectedPlaylistId");
			if (savedPlaylistId) {
				const playlist = this.playlists.find(p => p.id === savedPlaylistId);
				if (playlist) {
					await this.selectPlaylist(playlist);
				}
			}
			
			// Load saved themes
			await this.loadSavedThemes();
			
			// Load custom theme if saved (legacy support)
			const savedThemePath = await store.get<string>("customThemePath");
			if (savedThemePath) {
				await this.loadCustomTheme(savedThemePath);
			}
		} catch (error) {
			console.error("Error in init:", error);
		}
	},

	// Start automatic folder sync to detect new songs
	startAutoSync() {
		// Clear any existing interval
		if (this.autoSyncInterval) {
			clearInterval(this.autoSyncInterval);
		}
		
		// Check for new songs every 1 second
		this.autoSyncInterval = window.setInterval(async () => {
			if (this.lastFolderPath && !this.isLoading) {
				await this.syncNewSongs();
			}
		}, 1000); // 1 second
		
		console.log("Auto-sync started (checking every 1 second)");
	},

	// Stop automatic folder sync
	stopAutoSync() {
		if (this.autoSyncInterval) {
			clearInterval(this.autoSyncInterval);
			this.autoSyncInterval = null;
			console.log("Auto-sync stopped");
		}
	},

	// Check for new and deleted songs, sync with database
	async syncNewSongs() {
		try {
			if (!this.lastFolderPath || !this.db) {
				return;
			}

			// Get all music files from the folder
			const entries = await readDir(this.lastFolderPath);
			const musicExtensions = [".mp3", ".wav", ".flac", ".ogg"];
			const musicFiles = entries.filter((entry: DirEntry) => {
				const ext = entry.name?.toLowerCase().match(/\.[^.]+$/)?.[0];
				return ext && musicExtensions.includes(ext);
			});

			// Create set of current file paths in folder
			const currentFilePaths = new Set(
				musicFiles.map(file => `${this.lastFolderPath}\\${file.name}`)
			);

			// Get existing song paths from database
			const existingSongs = await this.db.select<{ path: string }[]>(
				"SELECT path FROM songs"
			);
			const existingPaths = new Set(existingSongs?.map(s => s.path) || []);

			// Find new songs (in folder but not in database)
			const newFiles = musicFiles.filter(file => {
				const fullPath = `${this.lastFolderPath}\\${file.name}`;
				return !existingPaths.has(fullPath);
			});

			// Find deleted songs (in database but not in folder)
			const deletedPaths = Array.from(existingPaths).filter(
				path => !currentFilePaths.has(path)
			);

			let needsReload = false;

			// Add new songs to database
			if (newFiles.length > 0) {
				console.log(`Found ${newFiles.length} new song(s), adding to library...`);
				
				for (const file of newFiles) {
					const fullPath = `${this.lastFolderPath}\\${file.name}`;
					const title = file.name?.replace(/\.[^.]+$/, "") || "Unknown";

					await this.db.execute(
						"INSERT OR IGNORE INTO songs (path, title) VALUES (?, ?)",
						[fullPath, title]
					);
				}
				needsReload = true;
			}

			// Remove deleted songs from database
			if (deletedPaths.length > 0) {
				console.log(`Found ${deletedPaths.length} deleted song(s), removing from library...`);
				
				for (const path of deletedPaths) {
					await this.db.execute(
						"DELETE FROM songs WHERE path = ?",
						[path]
					);
				}
				
				// Clear selected song if it was deleted
				if (this.selectedSong && deletedPaths.includes(this.selectedSong.path)) {
					this.selectedSong = null;
				}
				
				needsReload = true;
			}

			// Reload songs if any changes were made
			if (needsReload) {
				await this.loadSongsFromDatabase();
				
				// Reload selected playlist if it exists to update its songs
				if (this.selectedPlaylist) {
					await this.selectPlaylist(this.selectedPlaylist);
				}
				
				console.log(`Library synced: +${newFiles.length} new, -${deletedPaths.length} deleted`);
			}
		} catch (error) {
			console.error("Error syncing songs:", error);
		}
	},

	// Initialize SQLite database with required tables
	async initDatabase() {
		try {
			this.db = await Database.load("sqlite:astrotune.db");
			
			// Create songs table
			await this.db.execute(`
				CREATE TABLE IF NOT EXISTS songs (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					path TEXT NOT NULL UNIQUE,
					title TEXT NOT NULL
				)
			`);
			
			// Create playlists table
			await this.db.execute(`
				CREATE TABLE IF NOT EXISTS playlists (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					name TEXT NOT NULL,
					cover_image TEXT
				)
			`);
			
			// Migrate existing playlists table to add cover_image column if it doesn't exist
			try {
				await this.db.execute(`
					ALTER TABLE playlists ADD COLUMN cover_image TEXT
				`);
				console.log("Migrated playlists table: added cover_image column");
			} catch (e) {
				// Column already exists or table doesn't exist yet, ignore error
			}
			
			// Create junction table for playlist-songs relationship
			await this.db.execute(`
				CREATE TABLE IF NOT EXISTS playlist_songs (
					playlist_id INTEGER NOT NULL,
					song_id INTEGER NOT NULL,
					position INTEGER NOT NULL,
					PRIMARY KEY (playlist_id, song_id),
					FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
					FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
				)
			`);
			
			console.log("Database initialized successfully");
		} catch (error) {
			console.error("Error initializing database:", error);
		}
	},

	// Open the settings dialog
	openSettings() {
		if (this.settingsDialog) {
			this.settingsDialog.showModal();
		}
	},

	// Close the settings dialog
	closeSettings() {
		if (this.settingsDialog) {
			this.settingsDialog.close();
		}
	},

	// Open folder picker dialog, save selected path to store, and load music files
	async selectFolder() {
		try {
			this.isLoading = true;

			const selectedPath = await open({
				directory: true,
				multiple: false,
				title: "Select Music Folder",
			});

			if (!selectedPath) {
				this.isLoading = false;
				return;
			}

			// Delete all existing songs from database when changing folders
			if (this.lastFolderPath && this.lastFolderPath !== selectedPath) {
				await this.resetDatabase();
			}

			// Save the selected folder path for persistence across app restarts
			const store = await load("settings.json", { autoSave: true, defaults: {} });
			await store.set("lastFolderPath", selectedPath);
			await store.save();
			this.lastFolderPath = selectedPath as string;
			
			// Scan folder and save songs to database
			await this.scanFolderAndSaveToDB(selectedPath as string);
			
			// Reload songs from database
			await this.loadSongsFromDatabase();
			
			// Restart auto-sync for the new folder
			this.startAutoSync();
			
			// Close the settings dialog automatically
			this.closeSettings();
		} catch (error) {
			console.error("Error selecting folder:", error);
		} finally {
			this.isLoading = false;
		}
	},

	// Delete all songs and playlists from database
	async resetDatabase() {
		try {
			if (!this.db) {
				console.error("Database not initialized");
				return;
			}
			await this.db.execute("DELETE FROM playlist_songs");
			await this.db.execute("DELETE FROM playlists");
			await this.db.execute("DELETE FROM songs");
			this.songs = [];
			this.playlists = [];
			this.selectedPlaylist = null;
			console.log("Database reset successfully");
		} catch (error) {
			console.error("Error resetting database:", error);
		}
	},

	// Scan folder for music files and save to database
	async scanFolderAndSaveToDB(folderPath: string) {
		try {
			if (!this.db) {
				console.error("Database not initialized");
				return;
			}
			
			const entries = await readDir(folderPath);

			// Filter for audio files with supported extensions
			const audioExtensions = [".mp3", ".wav", ".flac", ".ogg"];
			const audioFiles = entries
				.filter((entry: DirEntry) => {
					if (!entry.isFile) return false;
					const name = entry.name.toLowerCase();
					return audioExtensions.some((ext) => name.endsWith(ext));
				});

			// Save each song to database
			for (const entry of audioFiles) {
				const fullPath = `${folderPath}\\${entry.name}`;
				const title = entry.name.replace(/\.(mp3|wav|flac|ogg)$/i, "");
				
				try {
					// Insert song (UNIQUE constraint will prevent duplicates)
					await this.db.execute(
						"INSERT OR IGNORE INTO songs (path, title) VALUES (?, ?)",
						[fullPath, title]
					);
				} catch (err) {
					console.error(`Error inserting song ${title}:`, err);
				}
			}
			
			console.log(`Saved ${audioFiles.length} songs to database`);
		} catch (error) {
			console.error("Error scanning folder:", error);
		}
	},

	// Load all songs from database
	async loadSongsFromDatabase() {
		try {
			if (!this.db) {
				console.error("Database not initialized");
				this.songs = [];
				return;
			}
			const result = await this.db.select<Song[]>(
				"SELECT id, path, title FROM songs ORDER BY title"
			);
			this.songs = result || [];
			console.log(`Loaded ${this.songs.length} songs from database`);
		} catch (error) {
			console.error("Error loading songs from database:", error);
			this.songs = [];
		}
	},

	// Set the currently selected song for playback
	selectSong(song: Song) {
		this.selectedSong = song;
		this.loadAndPlaySong(song);
	},

	// ========== AUDIO CONTROLS ==========

	// Start polling for position updates
	startPositionUpdate() {
		if (this.positionUpdateInterval) {
			clearInterval(this.positionUpdateInterval);
		}
		
		this.lastUpdateTime = Date.now();
		
		this.positionUpdateInterval = window.setInterval(async () => {
			if (this.selectedSong) {
				try {
					const now = Date.now();
					const elapsed = (now - this.lastUpdateTime) / 1000; // seconds
					this.lastUpdateTime = now;
					
					// Check if audio finished
					const finished = await invoke<boolean>("is_audio_finished");
					if (finished && this.isPlaying) {
						this.handleSongEnded();
						return;
					}
					
					// Update playing state
					const playing = await invoke<boolean>("is_audio_playing");
					this.isPlaying = playing;
					
					// Update position if playing
					if (this.isPlaying && this.currentTime < this.duration) {
						this.currentTime = Math.min(this.currentTime + elapsed, this.duration);
					}
				} catch (error) {
					console.error("Error updating position:", error);
				}
			}
		}, 100); // Update every 100ms
	},

	// Load and play a song
	async loadAndPlaySong(song: Song) {
		try {
			// Get duration first
			const duration = await invoke<number>("get_audio_duration", { path: song.path });
			this.duration = duration;
			this.currentTime = 0;
			this.lastUpdateTime = Date.now();
			
			// Load the audio file
			await invoke("load_audio", { path: song.path });
			
			// Find current index in the current list
			const currentList = this.selectedPlaylist?.songs || this.filteredSongs;
			this.currentIndex = currentList.findIndex(s => s.id === song.id);
			
			// Play the audio
			await invoke("play_audio");
			this.isPlaying = true;
			
			console.log(`Playing: ${song.title} (${this.formatTime(duration)})`);
		} catch (error) {
			console.error("Error playing song:", error);
		}
	},

	// Toggle play/pause
	async togglePlayPause() {
		try {
			if (this.isPlaying) {
				await invoke("pause_audio");
				this.isPlaying = false;
			} else {
				await invoke("play_audio");
				this.isPlaying = true;
			}
		} catch (error) {
			console.error("Error toggling playback:", error);
		}
	},

	// Play next song
	playNext() {
		const currentList = this.selectedPlaylist?.songs || this.filteredSongs;
		if (currentList.length === 0) return;

		let nextIndex: number;
		
		if (this.isShuffled) {
			// Random next song
			nextIndex = Math.floor(Math.random() * currentList.length);
		} else {
			// Next in order
			nextIndex = this.currentIndex + 1;
			if (nextIndex >= currentList.length) {
				if (this.repeatMode === "all") {
					nextIndex = 0; // Loop back to start
				} else {
					return; // Don't play if at end and not repeating
				}
			}
		}

		const nextSong = currentList[nextIndex];
		if (nextSong) {
			this.selectSong(nextSong);
		}
	},

	// Play previous song
	async playPrevious() {
		const currentList = this.selectedPlaylist?.songs || this.filteredSongs;
		if (currentList.length === 0) return;

		// If more than 3 seconds into the song, restart it instead
		if (this.currentTime > 3) {
			try {
				await invoke("seek_audio", { position: 0 });
				this.currentTime = 0;
			} catch (error) {
				console.error("Error seeking:", error);
			}
			return;
		}

		let prevIndex: number;
		
		if (this.isShuffled) {
			// Random previous song
			prevIndex = Math.floor(Math.random() * currentList.length);
		} else {
			// Previous in order
			prevIndex = this.currentIndex - 1;
			if (prevIndex < 0) {
				if (this.repeatMode === "all") {
					prevIndex = currentList.length - 1; // Loop to end
				} else {
					prevIndex = 0; // Stay at first song
				}
			}
		}

		const prevSong = currentList[prevIndex];
		if (prevSong) {
			this.selectSong(prevSong);
		}
	},

	// Handle when a song ends
	async handleSongEnded() {
		if (this.repeatMode === "one") {
			// Repeat the same song
			try {
				await invoke("seek_audio", { position: 0 });
				await invoke("play_audio");
				this.currentTime = 0;
			} catch (error) {
				console.error("Error repeating song:", error);
			}
		} else {
			// Play next song
			this.playNext();
		}
	},

	// Toggle shuffle mode
	toggleShuffle() {
		this.isShuffled = !this.isShuffled;
		console.log(`Shuffle: ${this.isShuffled ? "ON" : "OFF"}`);
	},

	// Toggle repeat mode (cycles through: off -> all -> one -> off)
	toggleRepeat() {
		if (this.repeatMode === "off") {
			this.repeatMode = "all";
		} else if (this.repeatMode === "all") {
			this.repeatMode = "one";
		} else {
			this.repeatMode = "off";
		}
		console.log(`Repeat: ${this.repeatMode}`);
	},

	// Set volume (0 to 1)
	async setVolume(value: number) {
		try {
			this.volume = Math.max(0, Math.min(1, value));
			
			// Only update actual audio volume if not muted
			if (!this.isMuted) {
				await invoke("set_audio_volume", { volume: this.volume });
			}
		} catch (error) {
			console.error("Error setting volume:", error);
		}
	},

	// Toggle mute
	async toggleMute() {
		try {
			if (this.isMuted) {
				// Unmute: restore the volume level
				await invoke("set_audio_volume", { volume: this.volume });
				this.isMuted = false;
			} else {
				// Mute: set audio to 0 but keep volume value
				await invoke("set_audio_volume", { volume: 0 });
				this.isMuted = true;
			}
		} catch (error) {
			console.error("Error toggling mute:", error);
		}
	},

	// Seek to specific time
	async seek(time: number) {
		try {
			await invoke("seek_audio", { position: time });
			this.currentTime = time;
			this.lastUpdateTime = Date.now(); // Reset timer after seeking
		} catch (error) {
			console.error("Error seeking:", error);
		}
	},

	// Format time in MM:SS
	formatTime(seconds: number): string {
		if (!isFinite(seconds)) return "0:00";
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	},

	// ========== PLAYLIST MANAGEMENT ==========

	// Load all playlists from database
	async loadPlaylists() {
		try {
			if (!this.db) {
				console.error("Database not initialized");
				this.playlists = [];
				return;
			}
			const result = await this.db.select<Playlist[]>(
				"SELECT id, name, cover_image as coverImage FROM playlists ORDER BY name"
			);
			this.playlists = result || [];
			console.log(`Loaded ${this.playlists.length} playlists from database`);
		} catch (error) {
			console.error("Error loading playlists:", error);
			this.playlists = [];
		}
	},

	// Open playlist creation dialog
	openCreatePlaylistDialog() {
		if (this.songs.length === 0) {
			alert("Please select a music folder first!");
			return;
		}
		
		this.playlistName = "";
		this.selectedSongIds = [];
		this.availableSongs = [...this.songs];
		
		if (this.playlistDialog) {
			this.playlistDialog.showModal();
		}
	},

	// Close playlist creation dialog
	closePlaylistDialog() {
		if (this.playlistDialog) {
			this.playlistDialog.close();
		}
		// Reset cover image selection and preview
		this.playlistCoverImage = null;
		this.playlistCoverPreview = null;
		this.editingPlaylistId = null;
	},

	// Select cover image for playlist
	async selectPlaylistCover() {
		try {
			const selectedFile = await open({
				directory: false,
				multiple: false,
				title: "Select Playlist Cover Image",
				filters: [{
					name: "Images",
					extensions: ["jpg", "jpeg", "png", "webp"]
				}]
			});

			if (selectedFile) {
				this.playlistCoverImage = selectedFile as string;
				
				// Generate preview
				const fileData = await readFile(selectedFile as string);
				const base64 = btoa(
					new Uint8Array(fileData).reduce((data, byte) => data + String.fromCharCode(byte), '')
				);
				const extension = (selectedFile as string).split('.').pop()?.toLowerCase() || 'jpg';
				const mimeTypes: { [key: string]: string } = {
					'jpg': 'image/jpeg',
					'jpeg': 'image/jpeg',
					'png': 'image/png',
					'webp': 'image/webp'
				};
				const mimeType = mimeTypes[extension] || 'image/jpeg';
				this.playlistCoverPreview = `data:${mimeType};base64,${base64}`;
				
				console.log("Cover image selected:", selectedFile);
			}
		} catch (error) {
			console.error("Error selecting cover image:", error);
		}
	},

	// Process and save cover image (optimize and resize to thumbnail using Rust)
	async processCoverImage(): Promise<string | null> {
		try {
			if (!this.playlistCoverImage) {
				return null;
			}

			// Use Rust command for fast image optimization
			const optimizedDataUrl = await invoke<string>('optimize_cover_image', { 
				path: this.playlistCoverImage 
			});
			
			console.log(`Cover image optimized (Rust): ${Math.round(optimizedDataUrl.length / 1024)}KB`);
			return optimizedDataUrl;
		} catch (error) {
			console.error("Error processing cover image:", error);
			return null;
		}
	},

	// Toggle song selection for playlist
	toggleSongSelection(songId: number) {
		const index = this.selectedSongIds.indexOf(songId);
		if (index > -1) {
			this.selectedSongIds.splice(index, 1);
		} else {
			this.selectedSongIds.push(songId);
		}
	},

	// Check if song is selected for playlist
	isSongSelected(songId: number): boolean {
		return this.selectedSongIds.includes(songId);
	},

	// Create a new playlist with selected songs
	async createPlaylist() {
		try {
			if (!this.playlistName.trim()) {
				alert("Please enter a playlist name!");
				return;
			}

			if (this.selectedSongIds.length === 0) {
				alert("Please select at least one song!");
				return;
			}

			if (!this.db) {
				console.error("Database not initialized");
				return;
			}

			if (this.editingPlaylistId) {
				// Update existing playlist
				await this.updatePlaylistSongs(this.editingPlaylistId);
			} else {
				// Create new playlist
				await this.createNewPlaylist();
			}

			// Reload playlists
			await this.loadPlaylists();

			// Close dialog
			this.closePlaylistDialog();
		} catch (error) {
			console.error("Error saving playlist:", error);
			alert("Failed to save playlist. Please try again.");
		}
	},

	// Create a new playlist
	async createNewPlaylist() {
		if (!this.db) return;

		// Process cover image first if selected
		let coverImageData = null;
		if (this.playlistCoverImage) {
			coverImageData = await this.processCoverImage();
		}

		// Insert playlist with cover image data
		const result = await this.db.execute(
			"INSERT INTO playlists (name, cover_image) VALUES (?, ?)",
			[this.playlistName.trim(), coverImageData]
		);

		// Get the inserted playlist ID
		const playlistId = result.lastInsertId;

		// Insert playlist-song relationships
		for (let i = 0; i < this.selectedSongIds.length; i++) {
			await this.db.execute(
				"INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)",
				[playlistId, this.selectedSongIds[i], i]
			);
		}

		console.log(`Created playlist "${this.playlistName}" with ${this.selectedSongIds.length} songs`);
	},

	// Update songs in existing playlist
	async updatePlaylistSongs(playlistId: number) {
		if (!this.db) return;

		// Delete all existing songs from the playlist
		await this.db.execute(
			"DELETE FROM playlist_songs WHERE playlist_id = ?",
			[playlistId]
		);

		// Insert the new song list
		for (let i = 0; i < this.selectedSongIds.length; i++) {
			await this.db.execute(
				"INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)",
				[playlistId, this.selectedSongIds[i], i]
			);
		}

		console.log(`Updated playlist with ${this.selectedSongIds.length} songs`);
	},

	// Load and select a playlist (fetch its songs)
	async selectPlaylist(playlist: Playlist) {
		try {
			if (!this.db) {
				console.error("Database not initialized");
				return;
			}
			
			// Load songs for this playlist
			const songs = await this.db.select<Song[]>(`
				SELECT s.id, s.path, s.title
				FROM songs s
				INNER JOIN playlist_songs ps ON s.id = ps.song_id
				WHERE ps.playlist_id = ?
				ORDER BY ps.position
			`, [playlist.id]);

			this.selectedPlaylist = {
				...playlist,
				songs: songs || []
			};

			// Switch to songs tab to show the playlist songs
			this.activeTab = "songs";

			// Save selected playlist ID to store
			const store = await load("settings.json", { autoSave: true, defaults: {} });
			await store.set("selectedPlaylistId", playlist.id);
			await store.save();

			console.log(`Loaded playlist "${playlist.name}" with ${this.selectedPlaylist.songs.length} songs`);
		} catch (error) {
			console.error("Error loading playlist songs:", error);
		}
	},

	// Select "All Songs" (clear playlist selection)
	selectAllSongs() {
		this.selectedPlaylist = null;
		this.activeTab = "songs";
		
		// Clear selected playlist ID from store
		load("settings.json", { autoSave: true, defaults: {} }).then(async (store) => {
			await store.set("selectedPlaylistId", null);
			await store.save();
		});
		
		console.log("Viewing all songs");
	},

	// Toggle playlist context menu
	togglePlaylistMenu(playlistId: number, event: Event) {
		event.stopPropagation();
		if (this.activePlaylistMenu === playlistId) {
			this.activePlaylistMenu = null;
		} else {
			this.activePlaylistMenu = playlistId;
		}
	},

	// Close playlist menu when clicking outside
	closePlaylistMenu() {
		this.activePlaylistMenu = null;
	},

	// Open dialog to add songs to existing playlist
	async openAddSongsDialog(playlistId: number) {
		try {
			this.activePlaylistMenu = null;
			
			if (!this.db) {
				console.error("Database not initialized");
				return;
			}

			const playlist = this.playlists.find(p => p.id === playlistId);
			if (!playlist) {
				console.error("Playlist not found");
				return;
			}

			// Load songs for this playlist
			const songs = await this.db.select<Song[]>(`
				SELECT s.id, s.path, s.title
				FROM songs s
				INNER JOIN playlist_songs ps ON s.id = ps.song_id
				WHERE ps.playlist_id = ?
				ORDER BY ps.position
			`, [playlistId]);

			// Set up the add songs dialog
			this.playlistName = playlist.name;
			this.availableSongs = this.songs;
			
			// Pre-select songs that are already in the playlist
			this.selectedSongIds = (songs || []).map((s: Song) => s.id);
			
			// Store the playlist ID for updating
			this.editingPlaylistId = playlistId;
			
			if (this.playlistDialog) {
				this.playlistDialog.showModal();
			}
		} catch (error) {
			console.error("Error loading playlist for editing:", error);
		}
	},

	// Open dialog to change playlist cover
	async openChangeCoverDialog(playlistId: number) {
		try {
			this.activePlaylistMenu = null;
			
			const playlist = this.playlists.find(p => p.id === playlistId);
			if (!playlist) {
				console.error("Playlist not found");
				return;
			}

			// Select new cover image
			const selectedFile = await open({
				directory: false,
				multiple: false,
				title: `Change Cover for "${playlist.name}"`,
				filters: [{
					name: "Images",
					extensions: ["jpg", "jpeg", "png", "webp"]
				}]
			});

			if (selectedFile && this.db) {
				// Process the new cover image
				this.playlistCoverImage = selectedFile as string;
				const optimizedCover = await this.processCoverImage();
				
				if (optimizedCover) {
					// Update the cover in the database
					await this.db.execute(
						"UPDATE playlists SET cover_image = ? WHERE id = ?",
						[optimizedCover, playlistId]
					);
					
					console.log(`Updated cover for playlist "${playlist.name}"`);
					
					// Reload playlists to show the new cover
					await this.loadPlaylists();
					
					// If this playlist is currently selected, update it
					if (this.selectedPlaylist && this.selectedPlaylist.id === playlistId) {
						this.selectedPlaylist.coverImage = optimizedCover;
					}
				}
				
				// Reset cover image state
				this.playlistCoverImage = null;
			}
		} catch (error) {
			console.error("Error changing playlist cover:", error);
			alert("Failed to change cover. Please try again.");
		}
	},

	// Show delete confirmation dialog
	deletePlaylist(playlistId: number) {
		// Find the playlist to delete
		const playlist = this.playlists.find(p => p.id === playlistId);
		if (!playlist) {
			console.error("Playlist not found");
			return;
		}

		// Store the playlist to delete and show confirmation dialog
		this.playlistToDelete = playlist;
		if (this.confirmDeleteDialog) {
			this.confirmDeleteDialog.showModal();
		}
	},

	// Close delete confirmation dialog
	closeConfirmDelete() {
		if (this.confirmDeleteDialog) {
			this.confirmDeleteDialog.close();
		}
		this.playlistToDelete = null;
	},

	// Confirm and execute playlist deletion
	async confirmDelete() {
		try {
			if (!this.playlistToDelete) {
				return;
			}

			if (!this.db) {
				console.error("Database not initialized");
				return;
			}

			const playlistId = this.playlistToDelete.id;

			await this.db.execute("DELETE FROM playlist_songs WHERE playlist_id = ?", [playlistId]);
			await this.db.execute("DELETE FROM playlists WHERE id = ?", [playlistId]);

			// Clear selected playlist if it was deleted
			if (this.selectedPlaylist && this.selectedPlaylist.id === playlistId) {
				this.selectedPlaylist = null;
			}

			// Reload playlists
			await this.loadPlaylists();

			console.log(`Deleted playlist with ID ${playlistId}`);

			// Close the dialog
			this.closeConfirmDelete();
		} catch (error) {
			console.error("Error deleting playlist:", error);
		}
	},

	// ========== THEME MANAGEMENT ==========

	// Load saved themes from store
	async loadSavedThemes() {
		try {
			const store = await load("settings.json", { autoSave: true, defaults: {} });
			const themes = await store.get<SavedTheme[]>("savedThemes");
			this.savedThemes = themes || [];
			
			const activeId = await store.get<string>("activeThemeId");
			if (activeId) {
				await this.applyTheme(activeId);
			}
		} catch (error) {
			console.error("Error loading saved themes:", error);
		}
	},

	// Save a new theme
	async saveCurrentTheme() {
		try {
			// Select CSS file to import
			const selectedFile = await open({
				directory: false,
				multiple: false,
				title: "Import Theme CSS File",
				filters: [{
					name: "CSS Files",
					extensions: ["css"]
				}]
			});

			if (!selectedFile) {
				return;
			}

			const cssContent = await readTextFile(selectedFile as string);
			
			// Extract filename without extension as theme name
			const filePath = selectedFile as string;
			const fileName = filePath.split(/[/\\]/).pop() || "Theme";
			const themeName = fileName.replace(/\.css$/i, "");
			
			// Create new theme object
			const newTheme: SavedTheme = {
				id: `theme_${Date.now()}`,
				name: themeName,
				cssContent: cssContent,
				createdAt: Date.now()
			};

			// Add to saved themes
			this.savedThemes.push(newTheme);

			// Save to store
			const store = await load("settings.json", { autoSave: true, defaults: {} });
			await store.set("savedThemes", this.savedThemes);
			await store.save();

			console.log(`Imported and saved theme: ${newTheme.name}`);
			
			// Apply the newly saved theme
			await this.applyTheme(newTheme.id);
		} catch (error) {
			console.error("Error importing theme:", error);
		}
	},

	// Apply a saved theme by ID
	async applyTheme(themeId: string) {
		try {
			const theme = this.savedThemes.find(t => t.id === themeId);
			if (!theme) {
				console.error("Theme not found:", themeId);
				return;
			}

			// Remove existing custom theme if present
			const existingTheme = document.getElementById("custom-theme");
			if (existingTheme) {
				existingTheme.remove();
			}

			// Create and append a new style element with the custom CSS
			const styleElement = document.createElement("style");
			styleElement.id = "custom-theme";
			styleElement.textContent = theme.cssContent;
			document.head.appendChild(styleElement);
			
			this.activeThemeId = themeId;

			// Save active theme to store
			const store = await load("settings.json", { autoSave: true, defaults: {} });
			await store.set("activeThemeId", themeId);
			await store.save();

			console.log(`Applied theme: ${theme.name}`);
			this.closeSettings();
		} catch (error) {
			console.error("Error applying theme:", error);
		}
	},

	// Remove a saved theme
	async deleteSavedTheme(themeId: string) {
		try {
			const theme = this.savedThemes.find(t => t.id === themeId);
			if (!theme) {
				return;
			}

			if (!confirm(`Delete theme "${theme.name}"?`)) {
				return;
			}

			// Remove from array
			this.savedThemes = this.savedThemes.filter(t => t.id !== themeId);

			// If this was the active theme, remove it
			if (this.activeThemeId === themeId) {
				await this.removeCustomTheme();
			}

			// Save to store
			const store = await load("settings.json", { autoSave: true, defaults: {} });
			await store.set("savedThemes", this.savedThemes);
			await store.save();

			console.log(`Deleted theme: ${theme.name}`);
		} catch (error) {
			console.error("Error deleting theme:", error);
		}
	},

	// Legacy: Select custom theme from file (one-time use)
	async selectCustomTheme() {
		try {
			const selectedFile = await open({
				directory: false,
				multiple: false,
				title: "Select Custom Theme (CSS File)",
				filters: [{
					name: "CSS Files",
					extensions: ["css"]
				}]
			});

			if (!selectedFile) {
				return;
			}

			const cssContent = await readTextFile(selectedFile as string);
			
			// Remove existing custom theme if present
			const existingTheme = document.getElementById("custom-theme");
			if (existingTheme) {
				existingTheme.remove();
			}

			// Create and append a new style element with the custom CSS
			const styleElement = document.createElement("style");
			styleElement.id = "custom-theme";
			styleElement.textContent = cssContent;
			document.head.appendChild(styleElement);
			
			this.customThemePath = selectedFile as string;
			this.activeThemeId = null;

			// Clear active theme from store
			const store = await load("settings.json", { autoSave: true, defaults: {} });
			await store.delete("activeThemeId");
			await store.save();
			
			this.closeSettings();
		} catch (error) {
			console.error("Error selecting custom theme:", error);
		}
	},

	// Legacy: Load custom theme (for backward compatibility)
	async loadCustomTheme(themePath: string) {
		try {
			const cssContent = await readTextFile(themePath);
			
			const existingTheme = document.getElementById("custom-theme");
			if (existingTheme) {
				existingTheme.remove();
			}

			const styleElement = document.createElement("style");
			styleElement.id = "custom-theme";
			styleElement.textContent = cssContent;
			document.head.appendChild(styleElement);
			
			this.customThemePath = themePath;
		} catch (error) {
			console.error("Error loading custom theme:", error);
			const store = await load("settings.json", { autoSave: true, defaults: {} });
			await store.delete("customThemePath");
			await store.save();
			this.customThemePath = null;
		}
	},

	// Remove the custom theme and revert to default
	async removeCustomTheme() {
		try {
			const existingTheme = document.getElementById("custom-theme");
			if (existingTheme) {
				existingTheme.remove();
			}

			const store = await load("settings.json", { autoSave: true, defaults: {} });
			await store.delete("customThemePath");
			await store.delete("activeThemeId");
			await store.save();
			
			this.customThemePath = null;
			this.activeThemeId = null;
		} catch (error) {
			console.error("Error removing custom theme:", error);
		}
	},
}));

Alpine.start();
