import Alpine from 'alpinejs';
import { Store } from '@tauri-apps/plugin-store';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import * as db from './database';

// Initialize Alpine.js
declare global {
  interface Window {
    Alpine: typeof Alpine;
  }
}

// Create store outside of Alpine's reactivity system
let volumeStore: any = null;

// Initialize database
db.initDatabase().catch(console.error);

// Volume management
Alpine.data('volumeControl', () => ({
  volume: 70 as number,
  
  async init() {
    try {
      volumeStore = await (Store as any).load('settings.json');
      const savedVolume = await volumeStore.get('volume');
      
      if (savedVolume !== null && savedVolume !== undefined) {
        this.volume = savedVolume;
      } else {
        await volumeStore.set('volume', this.volume);
        await volumeStore.save();
      }
    } catch (error) {
      console.error('Error initializing store:', error);
    }
  },
  
  async updateVolume(event: Event) {
    const target = event.target as HTMLInputElement;
    this.volume = parseInt(target.value);
    
    try {
      if (volumeStore) {
        await volumeStore.set('volume', this.volume);
        await volumeStore.save();
      }
    } catch (error) {
      console.error('Error saving volume:', error);
    }
  }
}));

// Music library management
Alpine.data('musicLibrary', () => ({
  songs: [] as db.Song[],
  playlists: [] as db.Playlist[],
  filteredSongs: [] as db.Song[],
  currentPlaylist: 1,
  searchQuery: '',
  isScanning: false,
  scanProgress: 0,
  scanTotal: 0,
  newPlaylistName: '',

  async init() {
    await this.loadPlaylists();
    await this.loadSongs();

    // Listen for scan-progress and scan-complete events from Tauri backend
    listen('scan-progress', (event: any) => {
      if (event && event.payload) {
        this.scanProgress = event.payload.current || 0;
        this.scanTotal = event.payload.total || 0;
      }
    });
    listen('scan-complete', () => {
      this.isScanning = false;
      this.scanProgress = 0;
      this.scanTotal = 0;
    });
  },

  async loadPlaylists() {
    try {
      this.playlists = await db.getAllPlaylists();
    } catch (error) {
      console.error('Error loading playlists:', error);
    }
  },

  async loadSongs() {
    try {
      if (this.currentPlaylist === 1) {
        this.songs = await db.getAllSongs();
      } else {
        this.songs = await db.getSongsInPlaylist(this.currentPlaylist);
      }
      this.filteredSongs = this.songs;
    } catch (error) {
      console.error('Error loading songs:', error);
    }
  },

  async selectDirectory() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Music Directory'
      });

      if (selected) {
        this.isScanning = true;
        this.scanProgress = 0;
        this.scanTotal = 0;
        const scannedSongs = await invoke<db.Song[]>('scan_music_directory', {
          directory: selected
        });

        await db.addSongs(scannedSongs);
        await this.loadSongs();
        // isScanning will be set to false by scan-complete event
      }
    } catch (error) {
      console.error('Error selecting directory:', error);
      this.isScanning = false;
      this.scanProgress = 0;
      this.scanTotal = 0;
    }
  },

  async switchPlaylist(playlistId: number) {
    this.currentPlaylist = playlistId;
    await this.loadSongs();
  },

  async createPlaylist() {
    if (!this.newPlaylistName.trim()) return;

    try {
      await db.createPlaylist(this.newPlaylistName);
      this.newPlaylistName = '';
      await this.loadPlaylists();
    } catch (error) {
      console.error('Error creating playlist:', error);
    }
  },

  async deletePlaylist(playlistId: number) {
    try {
      await db.deletePlaylist(playlistId);
      await this.loadPlaylists();
      if (this.currentPlaylist === playlistId) {
        this.currentPlaylist = 1;
        await this.loadSongs();
      }
    } catch (error) {
      console.error('Error deleting playlist:', error);
    }
  },

  searchSongs() {
    if (!this.searchQuery.trim()) {
      this.filteredSongs = this.songs;
      return;
    }

    const query = this.searchQuery.toLowerCase();
    this.filteredSongs = this.songs.filter(song =>
      song.title.toLowerCase().includes(query) ||
      song.artist.toLowerCase().includes(query) ||
      song.album.toLowerCase().includes(query)
    );
  },

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },

  async changeMusicFolder() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select New Music Directory'
      });
      if (selected) {
        this.isScanning = true;
        this.scanProgress = 0;
        this.scanTotal = 0;
        await db.clearLibrary();
        const scannedSongs = await invoke<db.Song[]>('scan_music_directory', { directory: selected });
        await db.addSongs(scannedSongs);
        await this.loadPlaylists();
        await this.loadSongs();
        // isScanning will be set to false by scan-complete event
      }
    } catch (error) {
      console.error('Error changing music folder:', error);
      this.isScanning = false;
      this.scanProgress = 0;
      this.scanTotal = 0;
    }
  }
}));

window.Alpine = Alpine;
Alpine.start();
