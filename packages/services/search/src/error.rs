use thiserror::Error;

#[derive(Debug, Error)]
pub enum SearchError {
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("vespa error: {0}")]
    Vespa(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("other: {0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, SearchError>;

impl From<zip::result::ZipError> for SearchError {
    fn from(e: zip::result::ZipError) -> Self { SearchError::Other(format!("zip error: {}", e)) }
}
