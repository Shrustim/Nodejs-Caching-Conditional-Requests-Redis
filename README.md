
# NODE JS — Caching & Conditional Requests with Redis

A Node.js backend practice project demonstrating Redis caching,
ETag validation, conditional HTTP requests, cache invalidation,
Cache-Control policies, and automated testing.

## 1. Project Overview

This project demonstrates how to optimize REST APIs using
Redis and HTTP caching mechanisms.

The main goal is to reduce unnecessary data-source operations,
avoid retransmitting unchanged responses, and handle cached
data correctly.

### Features

- Redis cache-aside (read-through) caching
- Cache HIT, MISS, and BYPASS handling
- Cache keys and TTL
- ETag generation using SHA-256
- If-None-Match request validation
- HTTP 304 Not Modified responses
- Cache-Control response headers
- Cache invalidation after product updates
- HTTP stale-while-revalidate policy
- Redis error handling and fallback
- Cache performance metrics
- Unit and integration testing

## 2. Technology Stack

- Node.js 22+
- Express.js 5
- Redis 7+
- redis (Node.js Redis client)
- Node.js crypto
- Node.js built-in test runner
- Supertest
- Docker Desktop
- Postman

## 3. Project Structure

    node-07-caching-practice/
    │
    ├── src/
    │   ├── app.js
    │   ├── server.js
    │   ├── config/ 
             ├──  redis.js
    │        ├── store.js
    │        └── cache.js
    │
    ├── tests/
    │   ├── cache.unit.test.js
    │   └── cache.integration.test.js
    │
    ├── package.json
    ├── package-lock.json
    └── .gitignore

## 4. Installation and Setup

### Step 1: Check Node.js Version

    node -v
    npm -v

### Step 2: Create a New Project

Skip this step if the project already exists.

    mkdir node-07-caching-practice
    cd node-07-caching-practice
    npm init -y

### Step 3: Install Dependencies

    npm install express@5 redis@5

Install development dependencies:

    npm install --save-dev supertest@7

If you are cloning an existing repository that contains
package-lock.json, use:

    npm ci

### Step 4: Configure NPM Scripts

Add these scripts to package.json:

    "scripts": {
      "start": "node src/server.js",
      "dev": "node --watch src/server.js",
      "test": "node --test",
      "test:unit": "node --test tests/cache.unit.test.js",
      "test:integration": "node --test tests/cache.integration.test.js"
    }

## 5. Redis Setup

### Create Redis Docker Container

    docker run -d --name node07-redis -p 127.0.0.1:6379:6379 redis:7-alpine

### Start Existing Redis Container

    docker start node07-redis

### Check Redis Connection

    docker exec node07-redis redis-cli PING

Expected output:

    PONG

### Stop Redis Container

    docker stop node07-redis

## 6. Run the Application

Development mode:

    npm run dev

Normal mode:

    npm start

Expected output:

    API running at http://localhost:3000

## 7. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/products/:id | Get product using Redis and ETag |
| PATCH | /api/products/:id | Update product and invalidate Redis |
| GET | /api/catalog | Public catalog with HTTP SWR |
| GET | /api/metrics | View cache statistics |

## 8. Redis Caching Workflow

### First GET Request — Cache MISS

    GET /api/products/1

1. Check Redis for the product.
2. If the key does not exist, load data from the source.
3. Store the result in Redis with a TTL.
4. Return product data.

Expected header:

    X-Cache: MISS

### Second GET Request — Cache HIT

    GET /api/products/1

1. Check Redis for the product.
2. Read the existing cached data.
3. Return the cached product.

Expected header:

    X-Cache: HIT

### Redis Key Example

    node07:products:v1:1

### Cache Expiration

Redis entries expire automatically based on their TTL.

Example:

    await redis.set(key, JSON.stringify(data), {
      EX: 60
    });

The cached entry expires after 60 seconds.

## 9. ETag and Conditional Requests

### First Request

    GET /api/products/1

Example response:

    HTTP/1.1 200 OK
    ETag: "<generated-hash>"
    Cache-Control: private, no-cache

The response includes the product JSON.

### Second Request with If-None-Match

Copy the ETag from the first response.

Add the following request header in Postman:

    If-None-Match: "<copied-etag>"

If the ETag matches the current response:

    HTTP/1.1 304 Not Modified

Response body:

    Empty

If the ETag differs:

    HTTP/1.1 200 OK

The server returns the current JSON with its ETag.

### Important Notes

- The server generates the ETag from current JSON data.
- The ETag is not separately stored in Redis in this project.
- If product data changes, the generated ETag changes.
- If-None-Match is sent by the client.
- Without If-None-Match, the API returns 200 with JSON.
- Redis HIT and HTTP 304 are different concepts.

## 10. Cache Invalidation

Update product:

    PATCH /api/products/1

Request body:

    {
      "price": 62000
    }

Backend workflow:

    Update product
          |
          v
    Delete affected Redis key
          |
          v
    Next GET causes cache MISS
          |
          v
    Load updated product
          |
          v
    Save fresh data in Redis

Cache invalidation command:

    await redis.del(cacheKey);

Important:

Redis does not automatically detect product updates.

Your Node.js backend explicitly invalidates affected
cache entries after successful data changes.

## 11. Cache-Control Policies

### Product API

    Cache-Control: private, no-cache

The response may be privately stored, but it must
be revalidated before reuse.

### Catalog API

    Cache-Control: public, max-age=10, stale-while-revalidate=30

A supporting HTTP cache may:

- Use the response while it is fresh for 10 seconds.
- Temporarily reuse stale data while revalidating
  during the following 30 seconds.

This does not automatically implement background
refreshing inside Redis.

### Mutation Responses

    Cache-Control: no-store

The response should not be stored by HTTP caches.

## 12. Redis Commands for Testing

### Get Cached Product

    docker exec node07-redis redis-cli GET node07:products:v1:1

### Check TTL

    docker exec node07-redis redis-cli TTL node07:products:v1:1

TTL values:

- Positive number: Remaining seconds
- -1: Key exists without expiration
- -2: Key does not exist

### Check Whether Key Exists

    docker exec node07-redis redis-cli EXISTS node07:products:v1:1

### Delete Cache Entry

    docker exec node07-redis redis-cli DEL node07:products:v1:1

### Set Cache Expiration to One Second

    docker exec node07-redis redis-cli EXPIRE node07:products:v1:1 1

## 13. Cache Metrics

Endpoint:

    GET /api/metrics

Example response:

    {
      "hits": 8,
      "misses": 4,
      "bypasses": 0,
      "errors": 0,
      "hitRatePercent": 66.7,
      "pendingInvalidations": 0
    }

Metrics:

- HIT: Data found in Redis
- MISS: Data not found in Redis
- BYPASS: Data source used without Redis
- ERROR: Redis operation failed

Cache hit rate:

    (hits / (hits + misses)) * 100

## 14. Redis Failure Handling

If Redis becomes unavailable while the API is running:

1. Detect the Redis read error.
2. Load data from the underlying source.
3. Return the product using fallback behavior.
4. Record a cache bypass or error.

Expected header when fallback succeeds:

    X-Cache: BYPASS

Note:

The application initially connects to Redis during
startup. The runtime fallback does not mean the
application can necessarily start without Redis.

## 15. Manual Testing Checklist

| Test | Expected Result |
|------|-----------------|
| First GET | 200 + Cache MISS |
| Second GET | 200 + Cache HIT |
| Matching ETag | 304, empty body |
| Incorrect ETag | 200 + JSON |
| Missing If-None-Match | 200 + JSON |
| Product PATCH | Updated data |
| GET after PATCH | Cache MISS + new ETag |
| TTL expiration | Cache MISS |
| Redis failure | Fallback where safe |
| Catalog GET | SWR Cache-Control header |
| Metrics GET | Cache statistics |
| Invalid product | 404 |

## 16. Automated Testing

### Run Unit Tests

    npm run test:unit

### Run Integration Tests

    npm run test:integration

Redis must be running for integration tests.

### Run All Tests

    npm test

Main testing scenarios:

- ETag generation and matching
- Cache MISS and HIT
- HTTP 304 responses
- Incorrect ETag handling
- Redis TTL expiration
- Cache invalidation after PATCH
- Redis read failure fallback
- Invalid product requests
- Cache-Control headers
- Cache statistics

## 17. Important Mistakes to Avoid

1. Do not cache every API response unnecessarily.
2. Always define an appropriate Redis TTL.
3. Use consistent and unique cache keys.
4. Include relevant request parameters in cache keys.
5. Invalidate affected caches after successful updates.
6. Do not assume Redis detects database changes.
7. Do not confuse Redis HIT with HTTP 304.
8. Do not send a response body with HTTP 304.
9. Generate consistent ETags from response data.
10. Do not expose private data through shared HTTP caches.
11. Do not confuse Redis TTL with HTTP max-age.
12. Do not assume HTTP SWR refreshes Redis automatically.
13. Handle Redis connection and command errors.
14. Test both success and failure scenarios.
15. Reset Redis keys and sample data between tests.
16. Be aware of stale-data races during concurrent requests.
17. Do not expose Redis directly to the public internet.
18. Do not assume cache metrics alone prove a performance gain.

## 18. Important Revision Notes

GET — Cache HIT:

    GET → Redis HIT → Return cached data

GET — Cache MISS:

    GET → Redis MISS → Data Source
        → Save in Redis → Return data

PATCH — Cache Invalidation:

    PATCH → Update data source
          → Delete Redis key
          → Next GET loads fresh data

ETag Validation:

    GET without If-None-Match → 200 + JSON

    GET with matching ETag → 304 + Empty body

    GET with different ETag → 200 + Current JSON

## 19. Project Limitations

- Uses in-memory sample product data.
- Does not include a persistent database.
- Redis invalidation retry tracking is process-local.
- Concurrent cache operations may require stronger consistency.
- HTTP SWR is configured through response headers.
- Metrics are kept in application memory.

## 20. Learning Outcome

After completing this project, you should understand:

- How Redis caching works
- How to implement cache-aside
- How cache HIT and MISS differ
- How to configure Redis TTL
- How ETags are generated
- How If-None-Match works
- Why HTTP 304 is useful
- How cache invalidation works
- How to handle Redis failures
- How to monitor cache performance
- How to test caching behavior

## References

- https://redis.io/docs/latest/
- https://www.rfc-editor.org/rfc/rfc9110.html
- https://www.rfc-editor.org/rfc/rfc9111.html
- https://www.rfc-editor.org/rfc/rfc5861.html
- https://nodejs.org/api/test.html

---

**Golden Rule:**

Redis automatically expires cached data using TTL,
but your backend must invalidate affected cache
entries after successful data changes.
