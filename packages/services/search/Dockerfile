## Multi-stage build for search-service
FROM rust:1.79 as builder
WORKDIR /app

# Cache deps
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src && echo "fn main(){}" > src/main.rs && cargo build --release || true

# Copy full source
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY --from=builder /app/target/release/search-service /usr/local/bin/search-service
ENV RUST_LOG=info \
    VESPA_ENDPOINT=http://vespa:8080 \
    VESPA_DEPLOY_ENDPOINT=http://vespa:19071 \
    APP_ID=demo-app \
    SEARCH_SCHEMA_VERSION=v1 \
    SEARCH_AUTO_DEPLOY=true

EXPOSE 8088
ENTRYPOINT ["/usr/local/bin/search-service"]
