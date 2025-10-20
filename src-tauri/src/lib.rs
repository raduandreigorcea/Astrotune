use image::ImageReader;
use image::GenericImageView;
use image::imageops::FilterType;
use base64::engine::general_purpose;
use base64::Engine as _;
use rodio::{Decoder, Sink, Source};
use std::fs::File;
use std::io::BufReader;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

// Simplified audio player - only store the sink
struct AudioPlayer {
    sink: Arc<Mutex<Option<Sink>>>,
}

static AUDIO_PLAYER: OnceLock<AudioPlayer> = OnceLock::new();

fn get_audio_player() -> &'static AudioPlayer {
    AUDIO_PLAYER.get_or_init(|| {
        AudioPlayer {
            sink: Arc::new(Mutex::new(None)),
        }
    })
}

#[tauri::command]
fn init_audio_player() -> Result<(), String> {
    let _player = get_audio_player();
    Ok(())
}

#[tauri::command]
fn load_audio(path: String) -> Result<(), String> {
    let player = get_audio_player();
    
    // Create stream and sink - stream will be dropped but sink keeps it alive
    let (_stream, stream_handle) = rodio::OutputStream::try_default()
        .map_err(|e| format!("Failed to get output stream: {}", e))?;
    
    let sink = Sink::try_new(&stream_handle)
        .map_err(|e| format!("Failed to create sink: {}", e))?;
    
    let file = File::open(&path)
        .map_err(|e| format!("Failed to open audio file: {}", e))?;
    let source = Decoder::new(BufReader::new(file))
        .map_err(|e| format!("Failed to decode audio: {}", e))?;
    
    sink.append(source);
    sink.pause();
    
    // Store only the sink - it will keep the stream alive internally
    *player.sink.lock().unwrap() = Some(sink);
    // Prevent stream from being dropped by leaking it (this is intentional)
    std::mem::forget(_stream);
    
    Ok(())
}

#[tauri::command]
fn play_audio() -> Result<(), String> {
    let player = get_audio_player();
    let sink = player.sink.lock().unwrap();
    if let Some(ref s) = *sink {
        s.play();
        Ok(())
    } else {
        Err("No audio loaded".to_string())
    }
}

#[tauri::command]
fn pause_audio() -> Result<(), String> {
    let player = get_audio_player();
    let sink = player.sink.lock().unwrap();
    if let Some(ref s) = *sink {
        s.pause();
        Ok(())
    } else {
        Err("No audio loaded".to_string())
    }
}

#[tauri::command]
fn stop_audio() -> Result<(), String> {
    let player = get_audio_player();
    let mut sink = player.sink.lock().unwrap();
    if let Some(s) = sink.take() {
        s.stop();
    }
    Ok(())
}

#[tauri::command]
fn set_audio_volume(volume: f32) -> Result<(), String> {
    let player = get_audio_player();
    let sink = player.sink.lock().unwrap();
    if let Some(ref s) = *sink {
        s.set_volume(volume);
        Ok(())
    } else {
        Err("No audio loaded".to_string())
    }
}

#[tauri::command]
fn seek_audio(position: f64) -> Result<(), String> {
    let player = get_audio_player();
    let sink = player.sink.lock().unwrap();
    if let Some(ref s) = *sink {
        let duration = Duration::from_secs_f64(position);
        s.try_seek(duration)
            .map_err(|e| format!("Failed to seek: {}", e))?;
        Ok(())
    } else {
        Err("No audio loaded".to_string())
    }
}

#[tauri::command]
fn get_audio_position() -> Result<f64, String> {
    Ok(0.0)
}

#[tauri::command]
fn is_audio_playing() -> Result<bool, String> {
    let player = get_audio_player();
    let sink = player.sink.lock().unwrap();
    if let Some(ref s) = *sink {
        Ok(!s.is_paused() && !s.empty())
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn is_audio_finished() -> Result<bool, String> {
    let player = get_audio_player();
    let sink = player.sink.lock().unwrap();
    if let Some(ref s) = *sink {
        Ok(s.empty())
    } else {
        Ok(true)
    }
}

#[tauri::command]
fn get_audio_duration(path: String) -> Result<f64, String> {
    // Open the file and decode to get duration
    let file = File::open(&path)
        .map_err(|e| format!("Failed to open audio file: {}", e))?;
    let source = Decoder::new(BufReader::new(file))
        .map_err(|e| format!("Failed to decode audio: {}", e))?;
    
    // Get total duration if available
    if let Some(duration) = source.total_duration() {
        Ok(duration.as_secs_f64())
    } else {
        // If duration is not available, return 0
        Ok(0.0)
    }
}

#[tauri::command]
async fn optimize_cover_image(path: String) -> Result<String, String> {
    // Read the image file
    let img = ImageReader::open(&path)
        .map_err(|e| format!("Failed to open image: {}", e))?
        .decode()
        .map_err(|e| format!("Failed to decode image: {}", e))?;
    
    // Get original dimensions
    let (orig_width, orig_height) = img.dimensions();
    
    // Calculate square crop dimensions (use the smaller dimension)
    let crop_size = orig_width.min(orig_height);
    
    // Calculate crop position to center the image
    let x_offset = (orig_width - crop_size) / 2;
    let y_offset = (orig_height - crop_size) / 2;
    
    // Crop to square from center
    let cropped = img.crop_imm(x_offset, y_offset, crop_size, crop_size);
    
    // Resize to exactly 200x200 with high-quality Lanczos3 filter
    let resized = cropped.resize_exact(200, 200, FilterType::Lanczos3);
    
    // Convert to RGB (in case it has alpha channel)
    let rgb_image = image::DynamicImage::ImageRgb8(resized.to_rgb8());
    
    // Encode to JPEG with quality 90 (higher quality for better small-scale display)
    let mut buffer = Vec::new();
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, 90);
    encoder.encode_image(&rgb_image)
        .map_err(|e| format!("Failed to encode image: {}", e))?;
    
    // Convert to base64
    let base64_string = general_purpose::STANDARD.encode(&buffer);
    
    // Return as data URL
    Ok(format!("data:image/jpeg;base64,{}", base64_string))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            optimize_cover_image,
            init_audio_player,
            load_audio,
            play_audio,
            pause_audio,
            stop_audio,
            set_audio_volume,
            seek_audio,
            get_audio_position,
            get_audio_duration,
            is_audio_playing,
            is_audio_finished,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
