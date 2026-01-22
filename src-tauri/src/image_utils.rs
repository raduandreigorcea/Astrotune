use std::fs;
use std::path::Path;
use image::ImageReader;
// use image::ImageOutputFormat; // Removed: not available in recent image crate versions
use image::ImageFormat;
use image::GenericImageView;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_ENGINE;

use crate::AppResult;

/// Save a base64-encoded image to the covers directory, resizing it to max_size x max_size (keeping aspect ratio)
#[allow(dead_code)]
pub fn save_resized_cover(base64_data: &str, covers_dir: &Path, max_size: u32) -> AppResult<String> {
    // Remove data URL prefix if present
    let base64_data = if let Some(idx) = base64_data.find(",") {
        &base64_data[idx + 1..]
    } else {
        base64_data
    };
    let bytes = BASE64_ENGINE.decode(base64_data).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    let img = ImageReader::new(std::io::Cursor::new(&bytes))
        .with_guessed_format()?
        .decode().map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    let (width, height) = img.dimensions();
    let scale = (max_size as f32 / width.max(height) as f32).min(1.0);
    let new_width = (width as f32 * scale).round() as u32;
    let new_height = (height as f32 * scale).round() as u32;
    let resized = img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3);
    let ext = match img.color() {
        image::ColorType::Rgb8 | image::ColorType::Rgba8 => "jpg",
        _ => "png",
    };
    let filename = format!("cover_{}.{}", uuid::Uuid::new_v4(), ext);
    let path = covers_dir.join(&filename);
    let mut out = fs::File::create(&path)?;
    if ext == "jpg" {
        resized.write_to(&mut out, ImageFormat::Jpeg)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    } else {
        resized.write_to(&mut out, ImageFormat::Png)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    }
    Ok(path.to_string_lossy().to_string())
}

/// Save an image from a file path to the covers directory, resizing it to max_size x max_size (keeping aspect ratio)
pub fn save_resized_cover_from_path(image_path: &Path, covers_dir: &Path, max_size: u32) -> AppResult<String> {
    let img = ImageReader::open(image_path)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?
        .decode()
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    let (width, height) = img.dimensions();
    let scale = (max_size as f32 / width.max(height) as f32).min(1.0);
    let new_width = (width as f32 * scale).round() as u32;
    let new_height = (height as f32 * scale).round() as u32;
    let resized = img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3);
    let ext = match img.color() {
        image::ColorType::Rgb8 | image::ColorType::Rgba8 => "jpg",
        _ => "png",
    };
    let filename = format!("cover_{}.{}", uuid::Uuid::new_v4(), ext);
    let path = covers_dir.join(&filename);
    let mut out = fs::File::create(&path)?;
    if ext == "jpg" {
        resized.write_to(&mut out, ImageFormat::Jpeg)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    } else {
        resized.write_to(&mut out, ImageFormat::Png)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    }
    Ok(path.to_string_lossy().to_string())
}
