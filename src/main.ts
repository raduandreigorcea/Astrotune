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
  libraryLoading: boolean;
  libraryOffset: number;
  
  // Scanning State
  isScanning: boolean;
  scanProgress: ScanProgress | null;
  
  // Modal State
  showCreatePlaylist: boolean;
  newPlaylistName: string;
  newPlaylistCover: string | null;
  newPlaylistCoverLoading: boolean;
  newPlaylistSongIds: number[];
  availableSongsForPlaylist: LibrarySong[];
  playlistSongSearch: string;
  showRenamePlaylist: boolean;
  renamePlaylistId: number | null;
  renamePlaylistName: string;
  
  // Drag State
  isDraggingProgress: boolean;
  isDraggingVolume: boolean;
  
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
  renamePlaylist: () => Promise<void>;
  deletePlaylist: (id: number) => Promise<void>;
  openRenameModal: (playlist: Playlist) => void;
  
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
  handleDrag: (event: MouseEvent) => void;
  stopDrag: () => void;
  
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
    libraryLoading: false,
    libraryOffset: 0,
    
    // Scanning State
    isScanning: false,
    scanProgress: null,
    
    // Modal State
    showCreatePlaylist: false,
    newPlaylistName: '',
    newPlaylistCover: null,
    newPlaylistCoverLoading: false,
    newPlaylistSongIds: [],
    availableSongsForPlaylist: [],
    playlistSongSearch: '',
    showRenamePlaylist: false,
    renamePlaylistId: null,
    renamePlaylistName: '',
    
    // Drag State
    isDraggingProgress: false,
    isDraggingVolume: false,
    
    // Config State
    libraryPath: null,
    
    icons,

    async init() {
      try {
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
          this.newPlaylistCover,
          this.newPlaylistSongIds
        );
        this.newPlaylistName = '';
        this.newPlaylistCover = null;
        this.newPlaylistSongIds = [];
        this.availableSongsForPlaylist = [];
        this.showCreatePlaylist = false;
        await this.loadPlaylists();
      } catch (error) {
        console.error('Failed to create playlist:', error);
      }
    },

    openRenameModal(playlist: Playlist) {
      this.renamePlaylistId = playlist.id;
      this.renamePlaylistName = playlist.name;
      this.showRenamePlaylist = true;
    },

    async renamePlaylist() {
      if (!this.renamePlaylistId || !this.renamePlaylistName.trim()) return;
      
      try {
        await tauri.renamePlaylist(this.renamePlaylistId, this.renamePlaylistName.trim());
        this.showRenamePlaylist = false;
        this.renamePlaylistId = null;
        this.renamePlaylistName = '';
        await this.loadPlaylists();
      } catch (error) {
        console.error('Failed to rename playlist:', error);
      }
    },

    async deletePlaylist(id: number) {
      if (!confirm('Are you sure you want to delete this playlist?')) return;
      
      try {
        await tauri.deletePlaylist(id);
        await this.loadPlaylists();
        // If deleted playlist was selected, go back to all songs
        if (this.currentPlaylistId === id) {
          await this.selectPlaylist(null);
        }
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

    stopDrag() {
      this.isDraggingProgress = false;
      this.isDraggingVolume = false;
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