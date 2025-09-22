use std::collections::HashSet;
use url::Url;

/// Auto-detects image fields in a JSON document
pub struct ImageFieldDetector {
    common_image_fields: HashSet<String>,
    image_extensions: HashSet<String>,
}

impl ImageFieldDetector {
    pub fn new() -> Self {
        let mut common_image_fields = HashSet::new();
        common_image_fields.insert("image".to_string());
        common_image_fields.insert("thumbnail".to_string());
        common_image_fields.insert("photo".to_string());
        common_image_fields.insert("picture".to_string());
        common_image_fields.insert("avatar".to_string());
        common_image_fields.insert("icon".to_string());
        common_image_fields.insert("banner".to_string());
        common_image_fields.insert("logo".to_string());
        common_image_fields.insert("cover".to_string());
        common_image_fields.insert("media_image".to_string());
        common_image_fields.insert("product_image".to_string());
        common_image_fields.insert("featured_image".to_string());
        
        let mut image_extensions = HashSet::new();
        image_extensions.insert("jpg".to_string());
        image_extensions.insert("jpeg".to_string());
        image_extensions.insert("png".to_string());
        image_extensions.insert("gif".to_string());
        image_extensions.insert("webp".to_string());
        image_extensions.insert("bmp".to_string());
        image_extensions.insert("svg".to_string());
        image_extensions.insert("tiff".to_string());
        image_extensions.insert("tif".to_string());
        
        Self {
            common_image_fields,
            image_extensions,
        }
    }
    
    /// Detects all image fields in a document
    pub fn detect_image_fields(&self, document: &serde_json::Value) -> Vec<ImageField> {
        let mut image_fields = Vec::new();
        self.detect_recursive(document, "", &mut image_fields);
        image_fields
    }
    
    /// Detects image fields using manual overrides first, then auto-detection
    pub fn detect_with_overrides(
        &self,
        document: &serde_json::Value,
        field_overrides: Option<&[String]>,
    ) -> Vec<ImageField> {
        let mut image_fields = Vec::new();
        
        // First, check manual overrides
        if let Some(overrides) = field_overrides {
            for field_path in overrides {
                if let Some(url) = self.extract_url_from_path(document, field_path) {
                    image_fields.push(ImageField {
                        field_path: field_path.clone(),
                        original_url: url,
                        confidence: ImageFieldConfidence::Manual,
                    });
                }
            }
        }
        
        // Then auto-detect (but skip fields already found in overrides)
        let override_paths: HashSet<String> = field_overrides
            .unwrap_or(&[])
            .iter()
            .cloned()
            .collect();
            
        let auto_detected = self.detect_image_fields(document);
        for field in auto_detected {
            if !override_paths.contains(&field.field_path) {
                image_fields.push(field);
            }
        }
        
        image_fields
    }
    
    fn detect_recursive(
        &self,
        value: &serde_json::Value,
        current_path: &str,
        results: &mut Vec<ImageField>,
    ) {
        match value {
            serde_json::Value::Object(obj) => {
                for (key, val) in obj {
                    let path = if current_path.is_empty() {
                        key.clone()
                    } else {
                        format!("{}.{}", current_path, key)
                    };
                    
                    // Check if this field looks like an image field
                    if let Some(url) = val.as_str() {
                        if let Some(confidence) = self.classify_image_field(&path, url) {
                            results.push(ImageField {
                                field_path: path.clone(),
                                original_url: url.to_string(),
                                confidence,
                            });
                        }
                    } else if val.is_array() {
                        // Handle arrays that might contain image URLs
                        if self.is_likely_image_array_field(&path) {
                            if let serde_json::Value::Array(arr) = val {
                                for (index, item) in arr.iter().enumerate() {
                                    if let Some(url) = item.as_str() {
                                        if self.looks_like_image_url(url) {
                                            results.push(ImageField {
                                                field_path: format!("{}[{}]", path, index),
                                                original_url: url.to_string(),
                                                confidence: ImageFieldConfidence::High,
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    // Recurse into nested objects
                    self.detect_recursive(val, &path, results);
                }
            }
            serde_json::Value::Array(arr) => {
                for (index, item) in arr.iter().enumerate() {
                    let path = if current_path.is_empty() {
                        format!("[{}]", index)
                    } else {
                        format!("{}[{}]", current_path, index)
                    };
                    self.detect_recursive(item, &path, results);
                }
            }
            _ => {}
        }
    }
    
    fn classify_image_field(&self, field_path: &str, url: &str) -> Option<ImageFieldConfidence> {
        let field_name = field_path.split('.').last().unwrap_or(field_path).to_lowercase();
        
        // High confidence: common image field names
        if self.common_image_fields.contains(&field_name) {
            return Some(ImageFieldConfidence::High);
        }
        
        // High confidence: field name contains image-related keywords
        if field_name.contains("image") || field_name.contains("photo") 
            || field_name.contains("picture") || field_name.contains("thumbnail") {
            return Some(ImageFieldConfidence::High);
        }
        
        // Medium confidence: URL looks like an image
        if self.looks_like_image_url(url) {
            return Some(ImageFieldConfidence::Medium);
        }
        
        None
    }
    
    fn looks_like_image_url(&self, url: &str) -> bool {
        // Try to parse as URL
        if let Ok(parsed_url) = Url::parse(url) {
            if let Some(path) = parsed_url.path().split('/').last() {
                if let Some(extension) = path.split('.').last() {
                    return self.image_extensions.contains(&extension.to_lowercase());
                }
            }
        }
        
        // Fallback: check if URL ends with image extension
        for ext in &self.image_extensions {
            if url.to_lowercase().ends_with(&format!(".{}", ext)) {
                return true;
            }
        }
        
        false
    }
    
    fn is_likely_image_array_field(&self, field_path: &str) -> bool {
        let field_name = field_path.split('.').last().unwrap_or(field_path).to_lowercase();
        field_name.contains("images") || field_name.contains("photos") 
            || field_name.contains("pictures") || field_name.contains("gallery")
            || field_name == "media_images"
    }
    
    fn extract_url_from_path(&self, document: &serde_json::Value, path: &str) -> Option<String> {
        let parts: Vec<&str> = path.split('.').collect();
        let mut current = document;
        
        for part in parts {
            // Handle array indices like "images[0]"
            if part.contains('[') && part.ends_with(']') {
                let bracket_pos = part.find('[').unwrap();
                let field_name = &part[..bracket_pos];
                let index_str = &part[bracket_pos + 1..part.len() - 1];
                
                if let Ok(index) = index_str.parse::<usize>() {
                    current = current.get(field_name)?.get(index)?;
                } else {
                    return None;
                }
            } else {
                current = current.get(part)?;
            }
        }
        
        current.as_str().map(|s| s.to_string())
    }
}

impl Default for ImageFieldDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct ImageField {
    pub field_path: String,
    pub original_url: String,
    pub confidence: ImageFieldConfidence,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ImageFieldConfidence {
    Manual,  // Manually specified in config
    High,    // Common image field names or strong indicators
    Medium,  // URL looks like an image but field name is generic
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    
    #[test]
    fn test_detect_common_image_fields() {
        let detector = ImageFieldDetector::new();
        let doc = json!({
            "image": "https://example.com/product.jpg",
            "thumbnail": "https://example.com/thumb.png",
            "description": "A great product",
            "price": 29.99
        });
        
        let fields = detector.detect_image_fields(&doc);
        assert_eq!(fields.len(), 2);
        
        let image_field = fields.iter().find(|f| f.field_path == "image").unwrap();
        assert_eq!(image_field.confidence, ImageFieldConfidence::High);
        
        let thumb_field = fields.iter().find(|f| f.field_path == "thumbnail").unwrap();
        assert_eq!(thumb_field.confidence, ImageFieldConfidence::High);
    }
    
    #[test]
    fn test_detect_image_by_url_extension() {
        let detector = ImageFieldDetector::new();
        let doc = json!({
            "main_url": "https://example.com/image.webp",
            "data_url": "https://example.com/data.json"
        });
        
        let fields = detector.detect_image_fields(&doc);
        assert_eq!(fields.len(), 1);
        assert_eq!(fields[0].field_path, "main_url");
        assert_eq!(fields[0].confidence, ImageFieldConfidence::Medium);
    }
    
    #[test]
    fn test_detect_nested_images() {
        let detector = ImageFieldDetector::new();
        let doc = json!({
            "product": {
                "details": {
                    "image": "https://example.com/nested.jpg"
                }
            }
        });
        
        let fields = detector.detect_image_fields(&doc);
        assert_eq!(fields.len(), 1);
        assert_eq!(fields[0].field_path, "product.details.image");
    }
    
    #[test]
    fn test_detect_image_arrays() {
        let detector = ImageFieldDetector::new();
        let doc = json!({
            "images": [
                "https://example.com/img1.jpg",
                "https://example.com/img2.png"
            ]
        });
        
        let fields = detector.detect_image_fields(&doc);
        assert_eq!(fields.len(), 2);
        assert_eq!(fields[0].field_path, "images[0]");
        assert_eq!(fields[1].field_path, "images[1]");
    }
    
    #[test]
    fn test_manual_overrides() {
        let detector = ImageFieldDetector::new();
        let doc = json!({
            "custom_field": "https://example.com/custom.jpg",
            "image": "https://example.com/standard.jpg"
        });
        
        let overrides = vec!["custom_field".to_string()];
        let fields = detector.detect_with_overrides(&doc, Some(&overrides));
        
        // Should find both: one from override, one from auto-detection
        assert_eq!(fields.len(), 2);
        
        let custom_field = fields.iter().find(|f| f.field_path == "custom_field").unwrap();
        assert_eq!(custom_field.confidence, ImageFieldConfidence::Manual);
        
        let image_field = fields.iter().find(|f| f.field_path == "image").unwrap();
        assert_eq!(image_field.confidence, ImageFieldConfidence::High);
    }
}
