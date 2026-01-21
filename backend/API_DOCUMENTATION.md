# CogVeri API Documentation

## Base URL

```
https://api.cogveri.com/api
http://localhost:3000/api  (development)
```

## Authentication

All endpoints (except auth endpoints) require a valid JWT token in the `Authorization` header:

```bash
Authorization: Bearer <jwt_token>
```

For API key authentication, use:

```bash
Authorization: ApiKey <api_key>
```

## Organization Scoping

All endpoints require an `X-Organization-Id` header to identify the organization context:

```bash
X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000
```

## Response Format

All responses follow a consistent format:

### Success Response (2xx)
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2024-10-25T10:30:00.000Z"
}
```

### Error Response (4xx, 5xx)
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { ... },
  "timestamp": "2024-10-25T10:30:00.000Z"
}
```

---

## Phase 15: API Metrics & Usage Tracking

### Metrics Endpoints

#### Get Usage Summary
**Endpoint**: `GET /metrics/usage-summary`

**Description**: Get aggregate usage statistics for the organization

**Query Parameters**:
- `startDate` (optional): ISO date string (default: 30 days ago)
- `endDate` (optional): ISO date string (default: now)

**Request**:
```bash
curl -X GET "http://localhost:3000/api/metrics/usage-summary?startDate=2024-10-01&endDate=2024-10-31" \
  -H "Authorization: Bearer <token>" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000"
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "totalRequests": 10000,
    "successfulRequests": 9500,
    "failedRequests": 500,
    "averageResponseTimeMs": 150,
    "slowestResponseTimeMs": 5000,
    "fastestResponseTimeMs": 10,
    "totalDataTransferredGb": 25.5,
    "period": {
      "startDate": "2024-10-01",
      "endDate": "2024-10-31",
      "days": 30
    }
  }
}
```

---

#### Get Usage by Endpoint
**Endpoint**: `GET /metrics/usage-by-endpoint`

**Description**: Get per-endpoint usage breakdown

**Query Parameters**:
- `startDate` (optional): ISO date string
- `endDate` (optional): ISO date string

**Request**:
```bash
curl -X GET "http://localhost:3000/api/metrics/usage-by-endpoint" \
  -H "Authorization: Bearer <token>" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000"
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "endpoint": "/api/recordings",
      "method": "POST",
      "requestCount": 5000,
      "successCount": 4950,
      "errorCount": 50,
      "averageResponseTimeMs": 200,
      "slowestResponseTimeMs": 3000,
      "fastestResponseTimeMs": 50,
      "totalDataTransferredGb": 15.0,
      "errorRate": 1.0
    },
    {
      "endpoint": "/api/recordings",
      "method": "GET",
      "requestCount": 3000,
      "successCount": 3000,
      "errorCount": 0,
      "averageResponseTimeMs": 100,
      "slowestResponseTimeMs": 1500,
      "fastestResponseTimeMs": 20,
      "totalDataTransferredGb": 5.0,
      "errorRate": 0.0
    }
  ]
}
```

---

#### Get Usage by User
**Endpoint**: `GET /metrics/usage-by-user`

**Description**: Get top users by request count

**Query Parameters**:
- `startDate` (optional): ISO date string
- `endDate` (optional): ISO date string
- `limit` (optional): Max results (default: 10, max: 100)

**Request**:
```bash
curl -X GET "http://localhost:3000/api/metrics/usage-by-user?limit=5" \
  -H "Authorization: Bearer <token>" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000"
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "userId": "650e8400-e29b-41d4-a716-446655440001",
      "userName": "alice@example.com",
      "requestCount": 3000,
      "successCount": 2950,
      "errorCount": 50,
      "averageResponseTimeMs": 150,
      "totalDataTransferredGb": 8.5,
      "lastActivityAt": "2024-10-31T23:59:00.000Z"
    },
    {
      "userId": "750e8400-e29b-41d4-a716-446655440002",
      "userName": "bob@example.com",
      "requestCount": 2500,
      "successCount": 2500,
      "errorCount": 0,
      "averageResponseTimeMs": 120,
      "totalDataTransferredGb": 7.0,
      "lastActivityAt": "2024-10-31T22:15:00.000Z"
    }
  ]
}
```

---

#### Get Feature Usage
**Endpoint**: `GET /metrics/feature-usage`

**Description**: Get feature adoption statistics

**Query Parameters**:
- `startDate` (optional): ISO date string
- `endDate` (optional): ISO date string

**Request**:
```bash
curl -X GET "http://localhost:3000/api/metrics/feature-usage" \
  -H "Authorization: Bearer <token>" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000"
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "featureName": "recordings",
      "totalUsageCount": 5000,
      "uniqueUsers": 50,
      "averageUsagePerUser": 100,
      "lastUsedAt": "2024-10-31T23:59:00.000Z"
    },
    {
      "featureName": "tasks",
      "totalUsageCount": 3000,
      "uniqueUsers": 40,
      "averageUsagePerUser": 75,
      "lastUsedAt": "2024-10-31T20:30:00.000Z"
    },
    {
      "featureName": "reviews",
      "totalUsageCount": 2000,
      "uniqueUsers": 30,
      "averageUsagePerUser": 67,
      "lastUsedAt": "2024-10-31T18:45:00.000Z"
    },
    {
      "featureName": "storage",
      "totalUsageCount": 1500,
      "uniqueUsers": 50,
      "averageUsagePerUser": 30,
      "lastUsedAt": "2024-10-31T15:20:00.000Z"
    },
    {
      "featureName": "retention",
      "totalUsageCount": 500,
      "uniqueUsers": 10,
      "averageUsagePerUser": 50,
      "lastUsedAt": "2024-10-28T10:00:00.000Z"
    }
  ]
}
```

---

### API Key Management

#### Create API Key
**Endpoint**: `POST /metrics/api-keys`

**Description**: Generate a new API key for the organization

**Request Body**:
```json
{
  "name": "Integration Test Key",
  "scopes": "read:recordings,write:tasks",
  "expiresAt": "2025-10-25T00:00:00.000Z"
}
```

**Request**:
```bash
curl -X POST "http://localhost:3000/api/metrics/api-keys" \
  -H "Authorization: Bearer <token>" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI/CD Pipeline",
    "scopes": "read:recordings,write:storage",
    "expiresAt": "2025-10-25T00:00:00.000Z"
  }'
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": "key-550e8400-e29b-41d4-a716-446655440003",
    "keyPrefix": "rq_test_abc123def456",
    "keyFull": "rq_test_abc123def456ghi789jkl012mno",
    "name": "CI/CD Pipeline",
    "scopes": "read:recordings,write:storage",
    "expiresAt": "2025-10-25T00:00:00.000Z",
    "createdAt": "2024-10-25T10:30:00.000Z"
  }
}
```

**Note**: `keyFull` is returned **only** on creation. Store it securely - it cannot be retrieved later.

---

#### List API Keys
**Endpoint**: `GET /metrics/api-keys`

**Description**: List all API keys for the organization

**Request**:
```bash
curl -X GET "http://localhost:3000/api/metrics/api-keys" \
  -H "Authorization: Bearer <token>" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000"
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": "key-550e8400-e29b-41d4-a716-446655440003",
      "keyPrefix": "rq_test_abc123def456",
      "name": "CI/CD Pipeline",
      "scopes": "read:recordings,write:storage",
      "isActive": true,
      "usageCount": 1523,
      "lastUsedAt": "2024-10-25T10:15:00.000Z",
      "expiresAt": "2025-10-25T00:00:00.000Z",
      "createdAt": "2024-10-25T10:30:00.000Z"
    }
  ]
}
```

---

#### Revoke API Key
**Endpoint**: `DELETE /metrics/api-keys/:keyId`

**Description**: Deactivate an API key

**Request**:
```bash
curl -X DELETE "http://localhost:3000/api/metrics/api-keys/key-550e8400-e29b-41d4-a716-446655440003" \
  -H "Authorization: Bearer <token>" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000"
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "API key revoked successfully",
    "keyId": "key-550e8400-e29b-41d4-a716-446655440003"
  }
}
```

---

#### Get Rate Limit Status
**Endpoint**: `GET /metrics/rate-limit-status`

**Description**: Check current rate limit status

**Query Parameters**:
- `endpoint` (optional): Specific endpoint to check

**Request**:
```bash
curl -X GET "http://localhost:3000/api/metrics/rate-limit-status?endpoint=POST%20/api/recordings" \
  -H "Authorization: Bearer <token>" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000"
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "allowed": true,
    "remaining": 287,
    "limit": 300,
    "resetAt": "2024-10-25T10:59:00.000Z",
    "tier": "pro",
    "rateLimitHeader": "X-RateLimit-Remaining: 287"
  }
}
```

---

## Phase 14: Storage Metrics & Recording Retention

### Storage Endpoints

#### Get Storage Metrics
**Endpoint**: `GET /storage/metrics`

**Description**: Get current storage usage and limits

**Request**:
```bash
curl -X GET "http://localhost:3000/api/storage/metrics" \
  -H "Authorization: Bearer <token>" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000"
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "totalBytesUsed": 5368709120,
    "maxBytes": 10737418240,
    "bytesRemaining": 5368709120,
    "percentageUsed": 50.0,
    "lastCalculatedAt": "2024-10-25T10:30:00.000Z"
  }
}
```

---

#### Get Storage Usage (Human Readable)
**Endpoint**: `GET /storage/usage`

**Description**: Get storage usage in human-readable format (GB)

**Request**:
```bash
curl -X GET "http://localhost:3000/api/storage/usage" \
  -H "Authorization: Bearer <token>" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000"
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "usedGb": 5.0,
    "maxGb": 10.0,
    "remainingGb": 5.0,
    "percentageUsed": 50.0,
    "unit": "GB"
  }
}
```

---

#### Get Storage Quota Alerts
**Endpoint**: `GET /storage/quota-alerts`

**Description**: List storage quota alerts

**Query Parameters**:
- `includeResolved` (optional): Include resolved alerts (default: false)
- `limit` (optional): Max results (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Request**:
```bash
curl -X GET "http://localhost:3000/api/storage/quota-alerts?includeResolved=false&limit=10" \
  -H "Authorization: Bearer <token>" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000"
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": "alert-550e8400-e29b-41d4-a716-446655440000",
      "thresholdPercentage": 90,
      "status": "active",
      "triggeredAt": "2024-10-25T08:15:00.000Z",
      "resolvedAt": null,
      "lastNotificationAt": "2024-10-25T10:15:00.000Z"
    }
  ]
}
```

---

#### Create Storage Quota Alert
**Endpoint**: `POST /storage/quota-alerts`

**Description**: Create a new quota alert threshold

**Request Body**:
```json
{
  "thresholdPercentage": 85,
  "notifyEmail": "admin@example.com"
}
```

**Request**:
```bash
curl -X POST "http://localhost:3000/api/storage/quota-alerts" \
  -H "Authorization: Bearer <token>" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{
    "thresholdPercentage": 85,
    "notifyEmail": "admin@example.com"
  }'
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": "alert-550e8400-e29b-41d4-a716-446655440001",
    "thresholdPercentage": 85,
    "status": "active",
    "createdAt": "2024-10-25T10:30:00.000Z"
  }
}
```

---

### Retention Endpoints

#### Create Retention Policy
**Endpoint**: `POST /retention/policies`

**Description**: Create a new data retention policy

**Request Body**:
```json
{
  "name": "Delete old recordings",
  "description": "Automatically delete recordings older than 90 days",
  "retentionDays": 90,
  "retentionUnit": "days",
  "action": "delete",
  "applyRules": {
    "by_status": ["completed", "failed"],
    "by_type": ["recording"]
  }
}
```

**Request**:
```bash
curl -X POST "http://localhost:3000/api/retention/policies" \
  -H "Authorization: Bearer <token>" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Auto-delete old recordings",
    "retentionDays": 90,
    "retentionUnit": "days",
    "action": "delete",
    "applyRules": {"by_status": ["completed"]}
  }'
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": "policy-550e8400-e29b-41d4-a716-446655440000",
    "name": "Auto-delete old recordings",
    "retentionDays": 90,
    "retentionUnit": "days",
    "action": "delete",
    "isDefault": false,
    "archived": false,
    "createdAt": "2024-10-25T10:30:00.000Z"
  }
}
```

---

#### List Retention Policies
**Endpoint**: `GET /retention/policies`

**Description**: List retention policies for the organization

**Query Parameters**:
- `includeInactive` (optional): Include archived policies (default: false)

**Request**:
```bash
curl -X GET "http://localhost:3000/api/retention/policies?includeInactive=false" \
  -H "Authorization: Bearer <token>" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000"
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": "policy-550e8400-e29b-41d4-a716-446655440000",
      "name": "Auto-delete old recordings",
      "retentionDays": 90,
      "retentionUnit": "days",
      "action": "delete",
      "isDefault": true,
      "archived": false,
      "createdAt": "2024-10-25T10:30:00.000Z",
      "updatedAt": "2024-10-25T10:30:00.000Z"
    }
  ]
}
```

---

#### Enforce Retention Policy
**Endpoint**: `POST /retention/policies/:policyId/enforce`

**Description**: Manually trigger policy execution

**Request**:
```bash
curl -X POST "http://localhost:3000/api/retention/policies/policy-550e8400-e29b-41d4-a716-446655440000/enforce" \
  -H "Authorization: Bearer <token>" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000"
```

**Response** (202 Accepted):
```json
{
  "success": true,
  "data": {
    "message": "Policy enforcement started",
    "executionId": "exec-550e8400-e29b-41d4-a716-446655440001",
    "status": "processing"
  }
}
```

---

#### Get Policy Execution History
**Endpoint**: `GET /retention/policies/:policyId/history`

**Description**: Get execution history for a policy

**Query Parameters**:
- `limit` (optional): Max results (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Request**:
```bash
curl -X GET "http://localhost:3000/api/retention/policies/policy-550e8400-e29b-41d4-a716-446655440000/history?limit=10" \
  -H "Authorization: Bearer <token>" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000"
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": "exec-550e8400-e29b-41d4-a716-446655440001",
      "recordsMatched": 150,
      "recordsProcessed": 145,
      "recordsFailed": 5,
      "status": "completed",
      "errorMessage": null,
      "startedAt": "2024-10-25T02:00:00.000Z",
      "completedAt": "2024-10-25T02:05:30.000Z"
    }
  ]
}
```

---

## Rate Limiting

### Default Rate Limits by Tier

| Tier | Per Minute | Per Hour | Per Day | Burst |
|------|-----------|----------|---------|-------|
| Free | 30 | 1,000 | 10,000 | 50 |
| Pro | 300 | 10,000 | 100,000 | 500 |
| Enterprise | 1,000 | 50,000 | 500,000 | 2,000 |

### Rate Limit Headers

All responses include rate limit headers:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 287
X-RateLimit-Reset: 1729876000
```

### Rate Limit Exceeded

When rate limit is exceeded, the API returns:

```json
{
  "status": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again after 60 seconds.",
  "retryAfter": 60
}
```

---

## Error Codes

### Common Error Codes

| Code | HTTP | Description |
|------|------|------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication token |
| `FORBIDDEN` | 403 | Insufficient permissions for action |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit exceeded |
| `INTERNAL_SERVER_ERROR` | 500 | Internal server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

---

## Pagination

Endpoints that support pagination use limit/offset parameters:

```bash
curl -X GET "http://localhost:3000/api/metrics/usage-by-user?limit=25&offset=50" \
  -H "Authorization: Bearer <token>" \
  -H "X-Organization-Id: 550e8400-e29b-41d4-a716-446655440000"
```

Response includes pagination metadata:

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "limit": 25,
    "offset": 50,
    "total": 150,
    "hasMore": true
  }
}
```

---

## Webhooks (Future)

Webhooks for storage quota breaches and retention policy execution are planned for a future phase.

---

## Support

For API support, visit: https://docs.cogveri.com or email: api-support@cogveri.com
