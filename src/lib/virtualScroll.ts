/**
 * Virtual Scrolling implementation for Alpine.js
 * Only renders visible items plus a buffer for smooth scrolling
 */

import type { Song } from './tauri';
import { querySongs, formatDuration, getDisplayTitle, getDisplayArtist } from './tauri';

export interface VirtualScrollState {
  // Data
  items: Song[];
  totalCount: number;
  playlistId: number | null;
  
  // Scroll state
  scrollTop: number;
  containerHeight: number;
  itemHeight: number;
  bufferSize: number;
  
  // Computed
  visibleStartIndex: number;
  visibleEndIndex: number;
  offsetY: number;
  totalHeight: number;
  visibleItems: Song[];
  
  // Loading state
  isLoading: boolean;
  loadedRanges: Array<{ start: number; end: number }>;
  
  // Methods
  init: (container: HTMLElement) => void;
  loadPlaylist: (playlistId: number | null) => Promise<void>;
  handleScroll: (event: Event) => void;
  updateVisibleRange: () => void;
  loadRange: (start: number, end: number) => Promise<void>;
  mergeLoadedRanges: () => void;
  isRangeLoaded: (start: number, end: number) => boolean;
  getVisibleItems: () => Song[];
}

/**
 * Creates an Alpine.js data object for virtual scrolling
 */
export function createVirtualScroll(itemHeight: number = 56, bufferSize: number = 10): VirtualScrollState {
  return {
    items: [],
    totalCount: 0,
    playlistId: null,
    
    scrollTop: 0,
    containerHeight: 0,
    itemHeight,
    bufferSize,
    
    visibleStartIndex: 0,
    visibleEndIndex: 0,
    offsetY: 0,
    totalHeight: 0,
    visibleItems: [],
    
    isLoading: false,
    loadedRanges: [],

    init(container: HTMLElement) {
      this.containerHeight = container.clientHeight;
      
      // Watch for resize
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          this.containerHeight = entry.contentRect.height;
          this.updateVisibleRange();
        }
      });
      resizeObserver.observe(container);
    },

    async loadPlaylist(playlistId: number | null) {
      this.playlistId = playlistId;
      this.items = [];
      this.loadedRanges = [];
      this.scrollTop = 0;
      this.isLoading = true;
      
      try {
        // Initial load - first 200 items
        const result = await querySongs(playlistId, 200, 0);
        this.totalCount = result.total;
        this.totalHeight = this.totalCount * this.itemHeight;
        
        // Initialize sparse array
        this.items = new Array(this.totalCount);
        
        // Fill in loaded items
        for (let i = 0; i < result.songs.length; i++) {
          this.items[i] = result.songs[i];
        }
        
        this.loadedRanges = [{ start: 0, end: result.songs.length }];
        this.updateVisibleRange();
      } finally {
        this.isLoading = false;
      }
    },

    handleScroll(event: Event) {
      const target = event.target as HTMLElement;
      this.scrollTop = target.scrollTop;
      this.updateVisibleRange();
    },

    updateVisibleRange() {
      const startIndex = Math.floor(this.scrollTop / this.itemHeight);
      const visibleCount = Math.ceil(this.containerHeight / this.itemHeight);
      
      this.visibleStartIndex = Math.max(0, startIndex - this.bufferSize);
      this.visibleEndIndex = Math.min(
        this.totalCount,
        startIndex + visibleCount + this.bufferSize
      );
      
      this.offsetY = this.visibleStartIndex * this.itemHeight;
      
      // Check if we need to load more data
      if (!this.isRangeLoaded(this.visibleStartIndex, this.visibleEndIndex)) {
        this.loadRange(this.visibleStartIndex, this.visibleEndIndex);
      }
      
      this.visibleItems = this.getVisibleItems();
    },

    async loadRange(start: number, end: number) {
      if (this.isLoading) return;
      
      // Find what we actually need to load
      let loadStart = start;
      let loadEnd = end;
      
      for (const range of this.loadedRanges) {
        if (start >= range.start && start < range.end) {
          loadStart = range.end;
        }
        if (end > range.start && end <= range.end) {
          loadEnd = range.start;
        }
      }
      
      if (loadStart >= loadEnd) return;
      
      this.isLoading = true;
      
      try {
        const result = await querySongs(
          this.playlistId,
          loadEnd - loadStart,
          loadStart
        );
        
        // Fill in loaded items
        for (let i = 0; i < result.songs.length; i++) {
          this.items[loadStart + i] = result.songs[i];
        }
        
        // Update loaded ranges
        this.loadedRanges.push({ start: loadStart, end: loadStart + result.songs.length });
        this.mergeLoadedRanges();
        
        this.visibleItems = this.getVisibleItems();
      } finally {
        this.isLoading = false;
      }
    },

    mergeLoadedRanges() {
      if (this.loadedRanges.length <= 1) return;
      
      // Sort by start
      this.loadedRanges.sort((a, b) => a.start - b.start);
      
      const merged: Array<{ start: number; end: number }> = [];
      let current = this.loadedRanges[0];
      
      for (let i = 1; i < this.loadedRanges.length; i++) {
        const next = this.loadedRanges[i];
        if (next.start <= current.end) {
          current = { start: current.start, end: Math.max(current.end, next.end) };
        } else {
          merged.push(current);
          current = next;
        }
      }
      merged.push(current);
      
      this.loadedRanges = merged;
    },

    isRangeLoaded(start: number, end: number): boolean {
      for (const range of this.loadedRanges) {
        if (start >= range.start && end <= range.end) {
          return true;
        }
      }
      return false;
    },

    getVisibleItems(): Song[] {
      const result: Song[] = [];
      for (let i = this.visibleStartIndex; i < this.visibleEndIndex; i++) {
        if (this.items[i]) {
          result.push({ ...this.items[i], _index: i } as Song & { _index: number });
        }
      }
      return result;
    },
  };
}

// Export utility functions for templates
export { formatDuration, getDisplayTitle, getDisplayArtist };
