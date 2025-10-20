use image::ImageReader;
use image::GenericImageView;
use image::imageops::FilterType;
use base64::engine::general_purpose;
use base64::Engine as _;

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
        .invoke_handler(tauri::generate_handler![optimize_cover_image])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
