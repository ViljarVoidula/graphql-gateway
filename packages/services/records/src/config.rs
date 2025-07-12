use std::env;
use std::net::TcpListener;

#[derive(Debug, Clone)]
pub struct Config {
    pub mongodb_uri: String,
    pub database_name: String,
    pub server_port: u16,
}

impl Config {
    pub fn from_env() -> Self {
        let mongodb_uri = env::var("MONGODB_URI")
            .unwrap_or_else(|_| "mongodb://root:password@localhost:27017/records?authSource=admin".to_string());
        let database_name = env::var("DATABASE_NAME")
            .unwrap_or_else(|_| "records".to_string());
        let mut port: u16 = env::var("SERVER_PORT")
            .unwrap_or_else(|_| "8080".to_string())
            .parse()
            .expect("SERVER_PORT must be a valid port number");

        // Try to bind to the port, increment if taken, log each attempt
        loop {
            tracing::debug!("Trying to bind to port {}", port);
            match TcpListener::bind(("127.0.0.1", port)) {
                Ok(_) => {
                    tracing::debug!("Successfully bound to port {}", port);
                    break;
                }
                Err(_) => {
                    tracing::debug!("Port {} is taken, trying next port", port);
                    port += 1;
                }
            }
        }

        Self {
            mongodb_uri,
            database_name,
            server_port: port,
        }
    }
}
