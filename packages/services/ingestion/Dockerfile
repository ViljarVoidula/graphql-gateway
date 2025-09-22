FROM rust:1.86 AS builder

WORKDIR /app

# Copy shared crate and service sources using repo-root build context
COPY packages/shared/mongodb-migrator /app/packages/shared/mongodb-migrator
COPY packages/services/ingestion /app/packages/services/ingestion

# Build for release
WORKDIR /app/packages/services/ingestion
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install CA certificates for HTTPS connections
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy the binary from builder stage
COPY --from=builder /app/packages/services/ingestion/target/release/ingestion-service /usr/local/bin/ingestion-service

# Expose port
EXPOSE 8089

# Run the binary
CMD ["ingestion-service"]
