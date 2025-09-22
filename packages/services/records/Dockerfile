FROM rust:1.86 AS builder

WORKDIR /app

# Copy shared crate and service sources using repo-root build context
COPY packages/shared/mongodb-migrator /app/packages/shared/mongodb-migrator
COPY packages/services/records /app/packages/services/records

# Build for release from service directory
WORKDIR /app/packages/services/records
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install CA certificates for HTTPS connections
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy the binary from builder stage
COPY --from=builder /app/packages/services/records/target/release/records-service /usr/local/bin/records-service

# Expose port
EXPOSE 8080

# Run the binary
CMD ["records-service"]
