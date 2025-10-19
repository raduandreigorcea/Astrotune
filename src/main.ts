import Alpine from "alpinejs";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, DirEntry } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";

Alpine.data("musicFolderPicker", () => ({
	songs: [] as Array<{ name: string; path: string }>,
	selectedSong: null as { name: string; path: string } | null,
	isLoading: false,
	convertFileSrc,

	// Initialize the app by loading the previously saved folder path from store
	async init() {
		try {
			const store = await load("settings.json", { autoSave: true, defaults: {} });
			const savedPath = await store.get<string>("lastFolderPath");
			if (savedPath) {
				await this.loadFolder(savedPath);
			}
		} catch (error) {
			console.error("Error in init:", error);
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

			// Save the selected folder path for persistence across app restarts
			const store = await load("settings.json", { autoSave: true, defaults: {} });
			await store.set("lastFolderPath", selectedPath);
			
			await this.loadFolder(selectedPath as string);
		} catch (error) {
			console.error("Error selecting folder:", error);
		} finally {
			this.isLoading = false;
		}
	},

	// Read directory contents and filter for supported audio files
	async loadFolder(folderPath: string) {
		try {
			const entries = await readDir(folderPath);

			// Filter for audio files with supported extensions
			const audioExtensions = [".mp3", ".wav", ".flac", ".ogg"];
			const audioFiles = entries
				.filter((entry: DirEntry) => {
					if (!entry.isFile) return false;
					const name = entry.name.toLowerCase();
					return audioExtensions.some((ext) => name.endsWith(ext));
				})
				.map((entry: DirEntry) => ({
					name: entry.name,
					path: `${folderPath}\\${entry.name}`,
				}));

			this.songs = audioFiles;
		} catch (error) {
			console.error("Error loading folder:", error);
		}
	},

	// Set the currently selected song for playback
	selectSong(song: { name: string; path: string }) {
		this.selectedSong = song;
	},
}));

Alpine.start();
