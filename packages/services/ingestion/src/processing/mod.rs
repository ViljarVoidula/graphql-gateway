pub mod image;
pub mod detector;
pub mod storage;

pub use image::*;
pub use detector::*;
pub use storage::*;

use crate::models::IngestionError;

pub type ProcessingResult<T> = std::result::Result<T, IngestionError>;
