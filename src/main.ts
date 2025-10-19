import Alpine from "alpinejs";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, DirEntry, readTextFile } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";

Alpine.data("musicFolderPicker", () => ({
	songs: [] as Array<{ name: string; path: string }>,
	selectedSong: null as { name: string; path: string } | null,
	isLoading: false,
	customThemePath: null as string | null,
	settingsDialog: null as HTMLDialogElement | null,
	convertFileSrc,
	lastFolderPath: null as string | null,

	// Initialize the app by loading the previously saved folder path from store
	async init() {
		try {
			// Get reference to the dialog element
			this.settingsDialog = document.querySelector("dialog");
			
			const store = await load("settings.json", { autoSave: true, defaults: {} });
			const savedPath = await store.get<string>("lastFolderPath");
			if (savedPath) {
				await this.loadFolder(savedPath);
				this.lastFolderPath = savedPath;
			}
			
			// Load custom theme if saved
			const savedThemePath = await store.get<string>("customThemePath");
			if (savedThemePath) {
				await this.loadCustomTheme(savedThemePath);
			}
		} catch (error) {
			console.error("Error in init:", error);
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

			// Save the selected folder path for persistence across app restarts
			const store = await load("settings.json", { autoSave: true, defaults: {} });
			await store.set("lastFolderPath", selectedPath);
			this.lastFolderPath = selectedPath as string;
			
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

	// Open file picker to select a custom CSS theme file
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

			// Save the selected theme path
			const store = await load("settings.json", { autoSave: true, defaults: {} });
			await store.set("customThemePath", selectedFile);
			
			await this.loadCustomTheme(selectedFile as string);
		} catch (error) {
			console.error("Error selecting custom theme:", error);
		}
	},

	// Load and apply a custom CSS theme
	async loadCustomTheme(themePath: string) {
		try {
			// Read the CSS file content
			const cssContent = await readTextFile(themePath);
			
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
			
			this.customThemePath = themePath;
		} catch (error) {
			console.error("Error loading custom theme:", error);
			// If theme file doesn't exist or can't be loaded, remove it from store
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

			// Remove from store and explicitly save
			const store = await load("settings.json", { autoSave: true, defaults: {} });
			await store.delete("customThemePath");
			await store.save();
			
			this.customThemePath = null;
		} catch (error) {
			console.error("Error removing custom theme:", error);
		}
	},
}));

Alpine.start();
