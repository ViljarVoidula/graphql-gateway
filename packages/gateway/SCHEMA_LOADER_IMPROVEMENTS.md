# SchemaLoader Caching and Auto-Refresh Improvements

## Overview

The SchemaLoader has been significantly enhanced to provide better schema caching and auto-refresh functionality. The gateway now continuously checks for new schema definitions in the background while maintaining reliable cache fallback when services are unavailable.

## Key Improvements

### 1. Fixed Auto-Refresh Timing

- **Before**: Used `setTimeout` with recursive calls, causing timing drift and delays
- **After**: Uses `setInterval` for consistent, predictable refresh cycles
- **Benefit**: Ensures regular schema updates without timing issues

### 2. Enhanced Caching Strategy

- **Before**: Cache TTL prevented background updates, causing stale schemas
- **After**: Always attempts fresh fetches while using cache as fallback
- **Benefit**: Services stay updated while maintaining resilience when services are down

### 3. Improved Cache Management

- **Before**: Simple TTL-based cache with basic cleanup
- **After**: Multi-tier caching with configurable cleanup intervals
- **Cache Tiers**:
  - Recent cache (< 30 seconds): Skip fresh fetch to avoid excessive requests
  - Normal TTL (5 minutes): Attempt fresh fetch, use cache as fallback
  - Cleanup TTL (30 minutes): Remove very old entries to prevent memory leaks

### 4. Permission Synchronization

- **Before**: Permission sync was not called after schema updates
- **After**: Automatically syncs permissions after successful schema builds
- **Benefit**: Ensures access control stays in sync with schema changes

### 5. Better Error Handling and Fallback

- **Before**: Basic error handling with limited fallback options
- **After**: Comprehensive error handling with graceful degradation
- **Features**:
  - Health monitoring integration with backoff strategies
  - Expired cache usage when fresh fetches fail
  - Service status tracking (ACTIVE/INACTIVE/MAINTENANCE)
  - Detailed logging with context and metadata

### 6. Enhanced Monitoring and Metrics

- **Before**: Basic metrics with limited visibility
- **After**: Comprehensive metrics for monitoring and debugging
- **Includes**:
  - Cache statistics with age tracking
  - Auto-refresh status monitoring
  - Endpoint loading metrics
  - Schema build success/failure tracking

## Configuration Changes

### Cache TTL Constants

```typescript
const SCHEMA_CACHE_TTL = 5 * 60 * 1000; // 5 minutes (reduced from 10)
const SCHEMA_CACHE_CLEANUP_TTL = 30 * 60 * 1000; // 30 minutes for cleanup
const ENDPOINT_CACHE_TTL = 2 * 60 * 1000; // 2 minutes (unchanged)
```

### Auto-Refresh Behavior

```typescript
// Old approach (problematic timing)
setTimeout(async () => {
  await this.reload();
  this.autoRefresh(interval); // Recursive call with delays
}, interval);

// New approach (consistent timing)
setInterval(async () => {
  try {
    await this.reload();
    this.cleanupExpiredCache();
  } catch (error) {
    log.error('Auto-refresh failed:', error);
  }
}, interval);
```

## Usage Examples

### Basic Auto-Refresh Setup

```typescript
const schemaLoader = new SchemaLoader(buildSchema, endpoints);

// Start auto-refresh with 30-second interval
schemaLoader.autoRefresh(30000);

// Get current metrics
const metrics = schemaLoader.getMetrics();
console.log('Schema loader status:', metrics);
```

### Advanced Configuration with Dynamic Endpoints

```typescript
const schemaLoader = new SchemaLoader(buildSchema, staticEndpoints);

// Set up dynamic endpoint loading
schemaLoader.setEndpointLoader(async () => {
  const services = await serviceRegistry.getActiveServices();
  return services.map((s) => s.graphqlUrl);
});

// Start background refresh
schemaLoader.autoRefresh(60000); // 1-minute interval
```

### Monitoring Cache Performance

```typescript
const metrics = schemaLoader.getMetrics();

console.log(`Loaded endpoints: ${metrics.loadedEndpoints}`);
console.log(`Cache size: ${metrics.schemaCacheSize}`);
console.log(`Auto-refresh active: ${metrics.autoRefreshActive}`);

// Detailed cache statistics
metrics.cacheStats.forEach((stat) => {
  console.log(`${stat.url}: ${stat.ageMs}ms old, expired: ${stat.expired}`);
});
```

## Benefits

1. **Improved Reliability**: Cache fallback ensures the gateway keeps working even when services are temporarily unavailable
2. **Better Performance**: Reduced redundant requests while maintaining freshness
3. **Enhanced Monitoring**: Detailed metrics help identify and troubleshoot issues
4. **Consistent Behavior**: Predictable refresh timing eliminates drift and delays
5. **Graceful Degradation**: Smart fallback strategies maintain service availability
6. **Memory Management**: Proper cache cleanup prevents memory leaks in long-running processes

## Migration Notes

The changes are backward compatible, but you may notice:

- More consistent refresh timing (no more timing drift)
- Better cache hit rates due to improved fallback strategies
- Enhanced logging output with more context
- Automatic permission synchronization after schema updates

## Testing

All existing tests have been updated to reflect the new behavior, and comprehensive test coverage ensures the improvements work correctly across various failure scenarios.
