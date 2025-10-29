# 🎶 AstroTune

> A fast, minimal, and beautiful open-source desktop music player — built with **Tauri**, **Rust**, and **Alpine.js**.  
> Lightweight like a web app, powerful like a native one.

---

## ✨ Features

- 🎵 **Local Music Library**  
  Choose a folder and AstroTune automatically fetches all your songs, extracts metadata (artist, album, cover art), and stores them locally.

- 🗂️ **Smart Library Management**  
  Songs and playlists are stored in a local **SQLite database**. Changing your music folder updates the database automatically.

- 🎚️ **Custom Playback Controls**  
  Play, pause, skip, shuffle, repeat — all with a smooth custom UI powered by Alpine.js.

- 🔊 **Persistent Volume & Settings**  
  Settings are saved via **Tauri Store**, so your preferences stay consistent between sessions.

- 🖼️ **Optimized Album Art**  
  Uses image optimization for crisp, fast-loading covers (cropped, resized, and compressed automatically).

- 📊 **Visualizer Ready**  
  Future-ready for waveforms, frequency bars, and advanced visualizers.

- ⚡ **Cross-Platform**  
  Runs seamlessly on **Windows**, **macOS**, and **Linux**.

---

## 🧠 Tech Stack

| Layer | Technology | Purpose |
|-------|-------------|----------|
| 🦀 Backend | [Rust](https://www.rust-lang.org/) | Performance and memory-safety |
| 🧱 Frontend | [Alpine.js](https://alpinejs.dev/) | Reactive UI with minimal overhead |
| 🪶 Framework | [Tauri](https://tauri.app/) | Native shell for web apps |
| 💾 Storage | [SQLite](https://www.sqlite.org/) + [Tauri Store](https://pub.dev/packages/tauri-plugin-store) | Persistent data storage |

---