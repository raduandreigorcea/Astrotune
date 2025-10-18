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

	async init() {
		console.log("Init called");
		try {
			const store = await load("settings.json", { autoSave: true, defaults: {} });
			const savedPath = await store.get<string>("lastFolderPath");
			console.log("Saved path:", savedPath);
			if (savedPath) {
				await this.loadFolder(savedPath);
			}
		} catch (error) {
			console.error("Error in init:", error);
		}
	},

	async selectFolder() {
		console.log("selectFolder called");
		try {
			this.isLoading = true;

			const selectedPath = await open({
				directory: true,
				multiple: false,
				title: "Select Music Folder",
			});

			console.log("Selected path:", selectedPath);

			if (!selectedPath) {
				this.isLoading = false;
				return;
			}

			const store = await load("settings.json", { autoSave: true, defaults: {} });
			await store.set("lastFolderPath", selectedPath);
			console.log("Saved to store");
			
			await this.loadFolder(selectedPath as string);
		} catch (error) {
			console.error("Error selecting folder:", error);
		} finally {
			this.isLoading = false;
		}
	},

	async loadFolder(folderPath: string) {
		console.log("loadFolder called with:", folderPath);
		try {
			const entries = await readDir(folderPath);
			console.log("Found entries:", entries.length);

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

			console.log("Audio files found:", audioFiles.length);
			this.songs = audioFiles;
		} catch (error) {
			console.error("Error loading folder:", error);
		}
	},

	selectSong(song: { name: string; path: string }) {
		this.selectedSong = song;
	},
}));

(window as any).Alpine = Alpine;

Alpine.start();
