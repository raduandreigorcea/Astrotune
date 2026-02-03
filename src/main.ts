import Alpine from 'alpinejs';
import * as tauri from './lib/tauri';
import type { Song, Playlist, ScanProgress } from './lib/tauri';

// Import SVG icons as raw strings
import heartIcon from './assets/heart.svg?raw';
import listMusicIcon from './assets/list-music.svg?raw';
import music2Icon from './assets/music-2.svg?raw';
import panelRightCloseIcon from './assets/panel-left-close.svg?raw';
import panelRightOpenIcon from './assets/panel-left-open.svg?raw';
import pauseIcon from './assets/pause.svg?raw';
import playIcon from './assets/play.svg?raw';
import repeat1Icon from './assets/repeat-1.svg?raw';
import repeatIcon from './assets/repeat.svg?raw';
import settingsIcon from './assets/settings.svg?raw';
import shuffleIcon from './assets/shuffle.svg?raw';
import skipBackIcon from './assets/skip-back.svg?raw';
import skipForwardIcon from './assets/skip-forward.svg?raw';
import volume1Icon from './assets/volume-1.svg?raw';
import volume2Icon from './assets/volume-2.svg?raw';
import volumeXIcon from './assets/volume-x.svg?raw';
import volumeIcon from './assets/volume.svg?raw';
import folderIcon from './assets/folder.svg?raw';
import trashIcon from './assets/trash-2.svg?raw';
import pencilIcon from './assets/pencil.svg?raw';
import ellipsisIcon from './assets/ellipsis.svg?raw';

// Icons object for easy access
const icons = {
  heart: heartIcon,
  listMusic: listMusicIcon,
  music2: music2Icon,
  panelRightClose: panelRightCloseIcon,
  panelRightOpen: panelRightOpenIcon,
  pause: pauseIcon,
  play: playIcon,
  repeat1: repeat1Icon,
  repeat: repeatIcon,
  settings: settingsIcon,
  shuffle: shuffleIcon,
  skipBack: skipBackIcon,
  skipForward: skipForwardIcon,
  volume1: volume1Icon,
  volume2: volume2Icon,
  volumeX: volumeXIcon,
  volume: volumeIcon,
  folder: folderIcon,
  trash: trashIcon,
  pencil: pencilIcon,
  ellipsis: ellipsisIcon,
  plus: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
  x: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  edit: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`,
  loader: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
};

// Alpine.js Music Player Component

declare global {
  interface Window {
    Alpine: typeof Alpine;
    __TAURI__: typeof tauri extends { __TAURI__: infer T } ? T : any;
  }
}

// Extended Song type for library display
interface LibrarySong extends Song {
  _index?: number;
}

interface Track {
  id: number;
  title: string;
  artist: string;
  albumArt: string;
  duration: number;
  isFavorite: boolean;
  filePath?: string;
}

interface MusicPlayerState {
  // UI State
  activeTab: 'playlists' | 'songs';
  sidebarVisible: boolean;
  sidebarWidth: number;
  openPlaylistMenuId: number | null;
  openSongMenuId: number | null;
  openSongPlaylistSubmenuId: number | null;
  playlistMenuPosition: { x: number; y: number };
  songMenuPosition: { x: number; y: number };
  songSubmenuPosition: { x: number; y: number };
  settingsOpen: boolean;
  
  // Config State
  libraryPath: string | null;
  
  // Playback State
  isPlaying: boolean;
  shuffle: boolean;
  repeat: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  progress: number;
  currentTrack: Track;
  
  // Library State
  playlists: Playlist[];
  currentPlaylistId: number | null;
  librarySongs: LibrarySong[];
  libraryTotal: number;
  totalLibraryCount: number;
  totalLibraryDuration: number;
  libraryLoading: boolean;
  libraryOffset: number;
  songPlaylistsMap: Map<number, Set<number>>; // Map of song ID to set of playlist IDs
  
  // Scanning State
  isScanning: boolean;
  scanProgress: ScanProgress | null;
  
  // Modal State
  showCreatePlaylist: boolean;
  newPlaylistName: string;
  newPlaylistDescription: string;
  newPlaylistCover: string | null;
  newPlaylistCoverLoading: boolean;
  newPlaylistSongIds: number[];
  availableSongsForPlaylist: LibrarySong[];
  playlistSongSearch: string;
  showEditPlaylist: boolean;
  editPlaylistId: number | null;
  editPlaylistName: string;
  editPlaylistDescription: string;
  editPlaylistCover: string | null;
  editPlaylistCoverLoading: boolean;
  editPlaylistSongIds: number[];
  showDeleteConfirmation: boolean;
  playlistToDelete: number | null;
  
  // Drag State
  isDraggingProgress: boolean;
  isDraggingVolume: boolean;
  isResizingSidebar: boolean;
  draggedPlaylistId: number | null;
  draggedOverPlaylistId: number | null;
  
  // Icons & Utils
  icons: typeof icons;
  volumeIcon: string;
  
  // Lifecycle
  init: () => Promise<void>;
  
  // Library Methods
  loadPlaylists: () => Promise<void>;
  selectPlaylist: (playlistId: number | null) => Promise<void>;
  loadMoreSongs: () => Promise<void>;
  scanFolder: () => Promise<void>;
  resetLibrary: () => Promise<void>;
  
  // Playlist Methods
  createPlaylist: () => Promise<void>;
  openCreatePlaylistModal: () => Promise<void>;
  selectPlaylistCover: () => Promise<void>;
  getNewPlaylistCoverUrl: () => string | null;
  toggleSongForPlaylist: (songId: number) => void;
  filterPlaylistSongs: () => LibrarySong[];
  openEditPlaylistModal: (playlist: Playlist) => Promise<void>;
  saveEditedPlaylist: () => Promise<void>;
  deletePlaylist: (id: number) => void;
  confirmDeletePlaylist: () => Promise<void>;
  togglePlaylistMenu: (id: number) => void;
  selectEditPlaylistCover: () => Promise<void>;
  getEditPlaylistCoverUrl: () => string | null;
  toggleSongForEditPlaylist: (songId: number) => void;
  filterEditPlaylistSongs: () => LibrarySong[];
  toggleSongMenu: (songId: number) => void;
  toggleSongPlaylistSubmenu: (songId: number) => void;
  addSongToPlaylist: (songId: number, playlistId: number) => Promise<void>;
  removeSongFromPlaylist: (songId: number, playlistId: number) => Promise<void>;
  toggleSongPlaylistMembership: (songId: number, playlistId: number) => Promise<void>;
  getSongPlaylistIds: (songId: number) => Set<number>;
  loadSongPlaylists: (songId: number) => Promise<void>;
  formatMinutes: (seconds: number) => string;
  
  // Playback Methods
  togglePlay: () => void;
  toggleFavorite: () => void;
  previousTrack: () => void;
  nextTrack: () => void;
  playSong: (song: LibrarySong) => void;
  
  // Control Methods
  seekTo: (event: MouseEvent) => void;
  setVolume: (event: MouseEvent) => void;
  startProgressDrag: (event: MouseEvent) => void;
  startVolumeDrag: (event: MouseEvent) => void;
  startSidebarResize: (event: MouseEvent) => void;
  handleDrag: (event: MouseEvent) => void;
  stopDrag: () => void;
  startPlaylistDrag: (playlistId: number) => void;
  dragPlaylistOver: (playlistId: number) => void;
  dropPlaylist: (targetId: number) => void;
  
  // Utilities
  formatTime: (seconds: number) => string;
  formatDuration: (seconds: number | null) => string;
  getDisplayTitle: (song: LibrarySong) => string;
  getDisplayArtist: (song: LibrarySong) => string;
  getCoverArtUrl: (song: LibrarySong) => string | null;
  icon: (name: keyof typeof icons, size?: number) => string;
  getPlaylistCoverUrl: (playlist: Playlist) => string | null;

  // Image Utilities
  resizeImageToDataUrl: (filePath: string, maxSize: number) => Promise<string>;
}

// Register the Alpine component before starting
Alpine.data('musicPlayer', (): MusicPlayerState => ({
    // UI State
    activeTab: 'playlists',
    sidebarVisible: true,
    sidebarWidth: 280,
    openPlaylistMenuId: null,
    openSongMenuId: null,
    openSongPlaylistSubmenuId: null,
    playlistMenuPosition: { x: 0, y: 0 },
    songMenuPosition: { x: 0, y: 0 },
    songSubmenuPosition: { x: 0, y: 0 },
    settingsOpen: false,
    
    // Playback State
    isPlaying: false,
    shuffle: false,
    repeat: false,
    volume: 70,
    currentTime: 0,
    duration: 0,
    progress: 0,
    
    currentTrack: {
      id: 0,
      title: 'No track selected',
      artist: 'Select a song to play',
      albumArt: '',
      duration: 0,
      isFavorite: false,
    },
    
    // Library State
    playlists: [],
    currentPlaylistId: null,
    librarySongs: [],
    libraryTotal: 0,
    totalLibraryCount: 0,
    totalLibraryDuration: 0,
    libraryLoading: false,
    libraryOffset: 0,
    songPlaylistsMap: new Map(),
    
    // Scanning State
    isScanning: false,
    scanProgress: null,
    
    // Modal State
    showCreatePlaylist: false,
    newPlaylistName: '',
    newPlaylistDescription: '',
    newPlaylistCover: null,
    newPlaylistCoverLoading: false,
    newPlaylistSongIds: [],
    availableSongsForPlaylist: [],
    playlistSongSearch: '',
    showEditPlaylist: false,
    editPlaylistId: null,
    editPlaylistName: '',
    editPlaylistDescription: '',
    editPlaylistCover: null,
    editPlaylistCoverLoading: false,
    editPlaylistSongIds: [],
    showDeleteConfirmation: false,
    playlistToDelete: null,
    
    // Drag State
    isDraggingProgress: false,
    isDraggingVolume: false,
    isResizingSidebar: false,
    draggedPlaylistId: null,
    draggedOverPlaylistId: null,
    
    // Config State
    libraryPath: null,
    
    icons,

    async init() {
      try {
        // Load saved sidebar width
        const savedWidth = localStorage.getItem('sidebarWidth');
        if (savedWidth) {
          this.sidebarWidth = parseInt(savedWidth, 10);
        }
        
        // Initialize database
        await tauri.initDatabase();
        
        // Load config
        const config = await tauri.getConfig();
        this.libraryPath = config.library_path;
        this.volume = config.volume;
        this.shuffle = config.shuffle;
        this.repeat = config.repeat;
        
        // Load playlists
        await this.loadPlaylists();
        
        // Load all songs by default (no playlist filter)
        await this.selectPlaylist(null);
        
        // Listen for scan progress
        tauri.onScanProgress((progress) => {
          this.scanProgress = progress;
          if (progress.phase === 'Complete') {
            this.isScanning = false;
            // Reload playlists and songs after scan
            this.loadPlaylists();
            this.selectPlaylist(this.currentPlaylistId);
          }
        });
      } catch (error) {
        console.error('Failed to initialize:', error);
      }
    },

    async loadPlaylists() {
      try {
        this.playlists = await tauri.listPlaylists();
      } catch (error) {
        console.error('Failed to load playlists:', error);
      }
    },

    async selectPlaylist(playlistId: number | null) {
      this.currentPlaylistId = playlistId;
      this.librarySongs = [];
      this.libraryOffset = 0;
      this.libraryLoading = true;
      
      // Switch to songs tab when selecting a playlist
      this.activeTab = 'songs';
      
      try {
        const result = await tauri.querySongs(playlistId, 100, 0);
        this.librarySongs = result.songs;
        this.libraryTotal = result.total;
        // Update totalLibraryCount when viewing all songs
        if (playlistId === null) {
          this.totalLibraryCount = result.total;
          // Calculate total duration for all songs
          this.totalLibraryDuration = result.songs.reduce((sum, song) => sum + (song.duration || 0), 0);
        }
        this.libraryOffset = result.songs.length;
      } catch (error) {
        console.error('Failed to load songs:', error);
      } finally {
        this.libraryLoading = false;
      }
    },

    async loadMoreSongs() {
      if (this.libraryLoading || this.libraryOffset >= this.libraryTotal) return;
      
      this.libraryLoading = true;
      try {
        const result = await tauri.querySongs(this.currentPlaylistId, 100, this.libraryOffset);
        this.librarySongs = [...this.librarySongs, ...result.songs];
        this.libraryOffset += result.songs.length;
      } catch (error) {
        console.error('Failed to load more songs:', error);
      } finally {
        this.libraryLoading = false;
      }
    },

    async scanFolder() {
      try {
        // Use Tauri dialog to pick folder
        const selected = await tauri.openFolderDialog();
        
        if (selected) {
          this.isScanning = true;
          this.scanProgress = {
            current_file: 'Clearing old library...',
            processed: 0,
            total: 0,
            percentage: 0,
            phase: 'Discovering',
            errors: [],
          };
          
          // Clear old songs and playlists before scanning new folder
          await tauri.clearLibrary();
          
          // Save the library path to config
          await tauri.setLibraryPath(selected);
          this.libraryPath = selected;
          
          // Reset local state
          this.playlists = [];
          this.librarySongs = [];
          this.libraryTotal = 0;
          this.currentPlaylistId = null;
          
          this.scanProgress.current_file = 'Starting scan...';
          await tauri.scanFolder(selected);
        }
      } catch (error) {
        console.error('Failed to scan folder:', error);
        this.isScanning = false;
      }
    },

    async resetLibrary() {
      try {
        // Clear the library
        await tauri.clearLibrary();
        
        // Clear library path from config
        await tauri.setLibraryPath(null);
        this.libraryPath = null;
        
        // Reset local state
        this.playlists = [];
        this.librarySongs = [];
        this.libraryTotal = 0;
        this.currentPlaylistId = null;
        this.activeTab = 'playlists';
        
        // Reload playlists (will have only system playlists)
        await this.loadPlaylists();
      } catch (error) {
        console.error('Failed to reset library:', error);
      }
    },

    async openCreatePlaylistModal() {
      // Reset modal state
      this.newPlaylistName = '';
      this.newPlaylistDescription = '';
      this.newPlaylistCover = null;
      this.newPlaylistSongIds = [];
      this.playlistSongSearch = '';
      
      // Load all songs for selection
      try {
        const result = await tauri.querySongs(null, 1000, 0);
        this.availableSongsForPlaylist = result.songs;
      } catch (error) {
        console.error('Failed to load songs for playlist:', error);
        this.availableSongsForPlaylist = [];
      }
      
      this.showCreatePlaylist = true;
    },

    async selectPlaylistCover() {
      // Only show loader if a file is actually being processed
      const selected = await tauri.openImageDialog();
      if (selected) {
        try {
          this.newPlaylistCoverLoading = true;
          // Save resized image to covers dir via backend (no browser resize)
          const coverPath = await tauri.saveResizedCoverImageFromPath(selected, 256);
          this.newPlaylistCover = coverPath;
        } catch (error) {
          console.error('Failed to select cover image:', error);
        } finally {
          this.newPlaylistCoverLoading = false;
        }
      }
    },

    async resizeImageToDataUrl(filePath: string, maxSize: number): Promise<string> {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function () {
          const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject('No canvas context');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = reject;
        img.src = tauri.convertFileSrc(filePath);
      });
    },

    getNewPlaylistCoverUrl(): string | null {
      if (!this.newPlaylistCover) return null;
      return tauri.convertFileSrc(this.newPlaylistCover);
    },

    toggleSongForPlaylist(songId: number) {
      const index = this.newPlaylistSongIds.indexOf(songId);
      if (index === -1) {
        this.newPlaylistSongIds.push(songId);
      } else {
        this.newPlaylistSongIds.splice(index, 1);
      }
    },

    filterPlaylistSongs(): LibrarySong[] {
      if (!this.playlistSongSearch.trim()) {
        return this.availableSongsForPlaylist;
      }
      const search = this.playlistSongSearch.toLowerCase();
      return this.availableSongsForPlaylist.filter(song => 
        (song.title?.toLowerCase().includes(search)) ||
        (song.artist?.toLowerCase().includes(search)) ||
        (song.album?.toLowerCase().includes(search))
      );
    },

    async createPlaylist() {
      if (!this.newPlaylistName.trim()) return;
      
      try {
        await tauri.createPlaylist(
          this.newPlaylistName.trim(),
          this.newPlaylistDescription.trim() || null,
          this.newPlaylistCover,
          this.newPlaylistSongIds
        );
        this.newPlaylistName = '';
        this.newPlaylistDescription = '';
        this.newPlaylistCover = null;
        this.newPlaylistSongIds = [];
        this.availableSongsForPlaylist = [];
        this.showCreatePlaylist = false;
        await this.loadPlaylists();
      } catch (error) {
        console.error('Failed to create playlist:', error);
      }
    },

    async openEditPlaylistModal(playlist: Playlist) {
      this.editPlaylistId = playlist.id;
      this.editPlaylistName = playlist.name;
      this.editPlaylistDescription = playlist.description || '';
      this.editPlaylistCover = playlist.cover_image_path;
      this.playlistSongSearch = '';
      
      // Load current songs in this playlist
      try {
        const result = await tauri.querySongs(playlist.id, 10000, 0);
        this.editPlaylistSongIds = result.songs.map(s => s.id);
        
        // Load all songs for selection
        const allSongs = await tauri.querySongs(null, 10000, 0);
        this.availableSongsForPlaylist = allSongs.songs;
      } catch (error) {
        console.error('Failed to load songs for playlist edit:', error);
        this.availableSongsForPlaylist = [];
        this.editPlaylistSongIds = [];
      }
      
      this.showEditPlaylist = true;
    },

    async saveEditedPlaylist() {
      if (!this.editPlaylistId || !this.editPlaylistName.trim()) return;
      
      try {
        // Update name
        await tauri.renamePlaylist(this.editPlaylistId, this.editPlaylistName.trim());
        
        // Update description
        await tauri.updatePlaylistDescription(this.editPlaylistId, this.editPlaylistDescription.trim() || null);
        
        // Update cover if changed
        if (this.editPlaylistCover) {
          await tauri.updatePlaylistCover(this.editPlaylistId, this.editPlaylistCover);
        }
        
        // Update songs - get current songs and compare
        const currentSongs = await tauri.querySongs(this.editPlaylistId, 10000, 0);
        const currentSongIds = currentSongs.songs.map(s => s.id);
        
        // Remove songs that were unchecked
        const songsToRemove = currentSongIds.filter(id => !this.editPlaylistSongIds.includes(id));
        for (const songId of songsToRemove) {
          await tauri.removeSongFromPlaylist(this.editPlaylistId, songId);
        }
        
        // Add songs that were checked
        const songsToAdd = this.editPlaylistSongIds.filter(id => !currentSongIds.includes(id));
        if (songsToAdd.length > 0) {
          await tauri.addSongsToPlaylist(this.editPlaylistId, songsToAdd);
        }
        
        this.showEditPlaylist = false;
        this.editPlaylistId = null;
        this.editPlaylistName = '';
        this.editPlaylistDescription = '';
        this.editPlaylistCover = null;
        this.editPlaylistSongIds = [];
        await this.loadPlaylists();
        
        // Reload current playlist if it's the one being edited
        if (this.currentPlaylistId === this.editPlaylistId) {
          await this.selectPlaylist(this.currentPlaylistId);
        }
      } catch (error) {
        console.error('Failed to update playlist:', error);
      }
    },

    async selectEditPlaylistCover() {
      const selected = await tauri.openImageDialog();
      if (selected) {
        try {
          this.editPlaylistCoverLoading = true;
          const coverPath = await tauri.saveResizedCoverImageFromPath(selected, 256);
          this.editPlaylistCover = coverPath;
        } catch (error) {
          console.error('Failed to select cover image:', error);
        } finally {
          this.editPlaylistCoverLoading = false;
        }
      }
    },

    getEditPlaylistCoverUrl(): string | null {
      if (!this.editPlaylistCover) return null;
      return tauri.convertFileSrc(this.editPlaylistCover);
    },

    toggleSongForEditPlaylist(songId: number) {
      const index = this.editPlaylistSongIds.indexOf(songId);
      if (index === -1) {
        this.editPlaylistSongIds.push(songId);
      } else {
        this.editPlaylistSongIds.splice(index, 1);
      }
    },

    filterEditPlaylistSongs(): LibrarySong[] {
      if (!this.playlistSongSearch.trim()) {
        return this.availableSongsForPlaylist;
      }
      const search = this.playlistSongSearch.toLowerCase();
      return this.availableSongsForPlaylist.filter(song => 
        (song.title?.toLowerCase().includes(search)) ||
        (song.artist?.toLowerCase().includes(search)) ||
        (song.album?.toLowerCase().includes(search))
      );
    },

    formatMinutes(seconds: number): string {
      const totalMinutes = Math.floor(seconds / 60);
      if (totalMinutes < 60) {
        return `${totalMinutes} min`;
      }
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
    },

    deletePlaylist(id: number) {
      this.playlistToDelete = id;
      this.showDeleteConfirmation = true;
    },

    togglePlaylistMenu(id: number, event?: MouseEvent) {
      if (this.openPlaylistMenuId === id) {
        this.openPlaylistMenuId = null;
      } else {
        this.openPlaylistMenuId = id;
        
        // Calculate menu position if event provided
        if (event) {
          const button = event.target as HTMLElement;
          const rect = button.getBoundingClientRect();
          // Position menu at top-left of button
          this.playlistMenuPosition = {
            x: rect.left,
            y: rect.top,
          };
        }
      }
    },

    toggleSongMenu(id: number, event?: MouseEvent) {
      if (this.openSongMenuId === id) {
        this.openSongMenuId = null;
      } else {
        this.openSongMenuId = id;
        this.openSongPlaylistSubmenuId = null;
        
        // Calculate menu position if event provided
        if (event) {
          const button = event.target as HTMLElement;
          const rect = button.getBoundingClientRect();
          // Position menu at top-left of button
          this.songMenuPosition = {
            x: rect.left,
            y: rect.top,
          };
        }
      }
    },

    toggleSongPlaylistSubmenu(songId: number) {
      if (this.openSongPlaylistSubmenuId === songId) {
        this.openSongPlaylistSubmenuId = null;
      } else {
        this.openSongPlaylistSubmenuId = songId;
        // Load playlists for this song when opening the submenu
        this.loadSongPlaylists(songId);
      }
    },

    async addSongToPlaylist(songId: number, playlistId: number) {
      try {
        // Get the song data to get its duration
        const song = this.librarySongs.find(s => s.id === songId);
        
        await tauri.addSongsToPlaylist(playlistId, [songId]);
        this.openSongMenuId = null;
        this.openSongPlaylistSubmenuId = null;
        
        // Update playlist stats
        const playlist = this.playlists.find(p => p.id === playlistId);
        if (playlist && song) {
          playlist.song_count += 1;
          playlist.total_duration += song.duration || 0;
        }
        
        // Update the song playlists map
        if (!this.songPlaylistsMap.has(songId)) {
          this.songPlaylistsMap.set(songId, new Set());
        }
        this.songPlaylistsMap.get(songId)!.add(playlistId);
        
        // Reload the current playlist if one is selected to show the new addition
        if (this.currentPlaylistId !== null) {
          await this.selectPlaylist(this.currentPlaylistId);
        }
      } catch (error) {
        console.error('Error adding song to playlist:', error);
      }
    },

    async removeSongFromPlaylist(songId: number, playlistId: number) {
      try {
        // Get the song data to get its duration
        const song = this.librarySongs.find(s => s.id === songId);
        
        await tauri.removeSongFromPlaylist(playlistId, songId);
        this.openSongMenuId = null;
        this.openSongPlaylistSubmenuId = null;
        
        // Update playlist stats
        const playlist = this.playlists.find(p => p.id === playlistId);
        if (playlist && song) {
          playlist.song_count -= 1;
          playlist.total_duration -= song.duration || 0;
        }
        
        // Update the song playlists map
        if (this.songPlaylistsMap.has(songId)) {
          this.songPlaylistsMap.get(songId)!.delete(playlistId);
        }
        
        // Reload the current playlist if one is selected to show the removal
        if (this.currentPlaylistId !== null) {
          await this.selectPlaylist(this.currentPlaylistId);
        }
      } catch (error) {
        console.error('Error removing song from playlist:', error);
      }
    },

    async toggleSongPlaylistMembership(songId: number, playlistId: number) {
      const playlistIds = this.getSongPlaylistIds(songId);
      if (playlistIds.has(playlistId)) {
        await this.removeSongFromPlaylist(songId, playlistId);
      } else {
        await this.addSongToPlaylist(songId, playlistId);
      }
    },

    getSongPlaylistIds(songId: number): Set<number> {
      return this.songPlaylistsMap.get(songId) || new Set();
    },

    async loadSongPlaylists(songId: number) {
      try {
        const playlistIds = await tauri.getSongPlaylists(songId);
        this.songPlaylistsMap.set(songId, new Set(playlistIds));
      } catch (error) {
        console.error('Error loading song playlists:', error);
      }
    },


    async confirmDeletePlaylist() {
      if (!this.playlistToDelete) return;
      
      try {
        await tauri.deletePlaylist(this.playlistToDelete);
        await this.loadPlaylists();
        // If deleted playlist was selected, go back to all songs
        if (this.currentPlaylistId === this.playlistToDelete) {
          await this.selectPlaylist(null);
        }
        this.showDeleteConfirmation = false;
        this.playlistToDelete = null;
      } catch (error) {
        console.error('Failed to delete playlist:', error);
      }
    },

    playSong(song: LibrarySong) {
      this.currentTrack = {
        id: song.id,
        title: this.getDisplayTitle(song),
        artist: this.getDisplayArtist(song),
        albumArt: this.getCoverArtUrl(song) || '',
        duration: song.duration || 0,
        isFavorite: false,
        filePath: song.file_path,
      };
      this.duration = song.duration || 0;
      this.currentTime = 0;
      this.progress = 0;
      this.isPlaying = true;
      // Actual audio playback would be implemented here
    },

    togglePlay() {
      this.isPlaying = !this.isPlaying;
    },

    toggleFavorite() {
      this.currentTrack.isFavorite = !this.currentTrack.isFavorite;
    },

    previousTrack() {
      console.log('Previous track');
    },

    nextTrack() {
      console.log('Next track');
    },

    get volumeIcon(): string {
      if (this.volume === 0) return this.icon('volumeX', 20);
      if (this.volume <= 25) return this.icon('volume', 20);
      if (this.volume <= 50) return this.icon('volume1', 20);
      return this.icon('volume2', 20);
    },

    seekTo(event: MouseEvent) {
      const target = event.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const percentage = (x / rect.width) * 100;
      this.progress = Math.max(0, Math.min(100, percentage));
      this.currentTime = (this.progress / 100) * this.duration;
    },

    setVolume(event: MouseEvent) {
      const target = event.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const percentage = (x / rect.width) * 100;
      this.volume = Math.max(0, Math.min(100, percentage));
    },

    startProgressDrag(event: MouseEvent) {
      this.isDraggingProgress = true;
      this.seekTo(event);
    },

    startVolumeDrag(event: MouseEvent) {
      this.isDraggingVolume = true;
      this.setVolume(event);
    },

    handleDrag(event: MouseEvent) {
      if (this.isDraggingProgress) {
        const target = document.querySelector('.progress-bar-small') as HTMLElement;
        if (target) {
          const rect = target.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const percentage = (x / rect.width) * 100;
          this.progress = Math.max(0, Math.min(100, percentage));
          this.currentTime = (this.progress / 100) * this.duration;
        }
      } else if (this.isDraggingVolume) {
        const target = document.querySelector('.volume-bar') as HTMLElement;
        if (target) {
          const rect = target.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const percentage = (x / rect.width) * 100;
          this.volume = Math.max(0, Math.min(100, percentage));
        }
      }
    },

    startSidebarResize(event: MouseEvent) {
      event.preventDefault();
      this.isResizingSidebar = true;
      const sidebar = document.querySelector('aside') as HTMLElement;
      const startX = event.clientX;
      const startWidth = sidebar.offsetWidth;
      
      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!this.isResizingSidebar) return;
        const diff = moveEvent.clientX - startX;
        const newWidth = Math.max(200, Math.min(600, startWidth + diff));
        this.sidebarWidth = newWidth;
      };
      
      const handleMouseUp = () => {
        this.isResizingSidebar = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        // Save to localStorage
        localStorage.setItem('sidebarWidth', this.sidebarWidth.toString());
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },

    stopDrag() {
      this.isDraggingProgress = false;
      this.isDraggingVolume = false;
    },

    startPlaylistDrag(playlistId: number) {
      this.draggedPlaylistId = playlistId;
    },

    dragPlaylistOver(playlistId: number) {
      if (this.draggedPlaylistId === null || this.draggedPlaylistId === playlistId) return;
      this.draggedOverPlaylistId = playlistId;
    },

    dropPlaylist(targetId: number) {
      if (this.draggedPlaylistId === null || this.draggedPlaylistId === targetId) {
        this.draggedPlaylistId = null;
        this.draggedOverPlaylistId = null;
        return;
      }

      const from = this.playlists.findIndex(p => p.id === this.draggedPlaylistId);
      const to = this.playlists.findIndex(p => p.id === targetId);

      if (from === -1 || to === -1) {
        this.draggedPlaylistId = null;
        this.draggedOverPlaylistId = null;
        return;
      }

      // Remove from source and insert at destination
      const [moved] = this.playlists.splice(from, 1);
      this.playlists.splice(to, 0, moved);

      this.draggedPlaylistId = null;
      this.draggedOverPlaylistId = null;
    },

    formatTime(seconds: number): string {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    formatDuration(seconds: number | null): string {
      if (seconds === null || seconds === undefined) return '--:--';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    getDisplayTitle(song: LibrarySong): string {
      if (song.title) return song.title;
      const path = song.file_path;
      const filename = path.split(/[/\\]/).pop() || path;
      return filename.replace(/\.[^/.]+$/, '');
    },

    getDisplayArtist(song: LibrarySong): string {
      return song.artist || 'Unknown Artist';
    },

    getCoverArtUrl(song: LibrarySong): string | null {
      return tauri.getCoverArtUrl(song);
    },

    getPlaylistCoverUrl(playlist: Playlist): string | null {
      if (!playlist.cover_image_path) return null;
      return tauri.convertFileSrc(playlist.cover_image_path);
    },

    icon(name: keyof typeof icons, size = 20): string {
      const svg = icons[name] || '';
      return svg
        .replace(/width="[^"]*"/, `width="${size}"`)
        .replace(/height="[^"]*"/, `height="${size}"`);
    }
}));

// Make Alpine available globally and start it
window.Alpine = Alpine;
Alpine.start();