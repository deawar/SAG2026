# Section 5: Auction Management API - Complete Documentation

## Overview
Section 5 provides comprehensive REST API endpoints for auction management, real-time bidding, and artwork handling in the Silent Auction Gallery platform.

---

## Base URL
```
http://localhost:5000/api
```

---

## Authentication
All endpoints (except public endpoints) require:
- **Header**: `Authorization: Bearer {JWT_TOKEN}`
- **Token obtained from**: `/api/auth/login` (Section 3)

---

## Error Responses

All errors return consistent format:
```json
{
  "success": false,
  "message": "Error description"
}
```

### HTTP Status Codes
- **200**: Success
- **201**: Created
- **400**: Bad Request
- **401**: Unauthorized
- **403**: Forbidden
- **404**: Not Found
- **500**: Server Error

---

# Auction Endpoints

## POST /auctions
**Create a new auction**

### Access
- Required Role: `site_admin`, `school_admin`
- Authentication: Required

### Request Body
```json
{
  "title": "Spring Art Collection Auction",
  "description": "A beautiful collection of student artwork",
  "schoolId": "550e8400-e29b-41d4-a716-446655440000",
  "charityId": "660e8400-e29b-41d4-a716-446655440001",
  "startTime": "2026-02-01T10:00:00Z",
  "endTime": "2026-02-08T10:00:00Z",
  "platformFeePercentage": 3,
  "autoExtendEnabled": true,
  "autoExtendMinutes": 10,
  "artworkIds": ["art-001", "art-002"]
}
```

### Response (201 Created)
```json
{
  "success": true,
  "auctionId": "auction-550e8400",
  "title": "Spring Art Collection Auction",
  "description": "A beautiful collection of student artwork",
  "status": "draft",
  "schoolId": "550e8400-e29b-41d4-a716-446655440000",
  "startTime": "2026-02-01T10:00:00Z",
  "endTime": "2026-02-08T10:00:00Z",
  "platformFeePercentage": 3,
  "autoExtendEnabled": true,
  "qrCode": "data:image/png;base64,...",
  "artworkCount": 2
}
```

### Validation Rules
- Title: Required, non-empty string
- Description: Required, non-empty string
- schoolId: Must exist in database
- startTime: Must be valid ISO datetime
- endTime: Must be after startTime
- platformFeePercentage: 0-100

---

## GET /auctions
**List auctions with filtering and pagination**

### Access
- Authentication: Required
- Public (all authenticated users)

### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| status | string | null | Filter by status: draft, active, ended |
| schoolId | string | null | Filter by school ID |
| limit | number | 20 | Records per page |
| offset | number | 0 | Pagination offset |
| sortBy | string | created_at | Sort field: created_at, start_time, end_time, title |
| sortOrder | string | DESC | ASC or DESC |

### Example Request
```
GET /auctions?status=active&schoolId=550e8400&limit=10&offset=0&sortBy=created_at&sortOrder=DESC
```

### Response (200 OK)
```json
{
  "success": true,
  "auctions": [
    {
      "auctionId": "auction-001",
      "title": "Spring Art Auction",
      "status": "active",
      "schoolId": "550e8400",
      "startTime": "2026-02-01T10:00:00Z",
      "endTime": "2026-02-08T10:00:00Z",
      "createdAt": "2026-01-29T00:00:00Z"
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 45,
    "pages": 5,
    "hasMore": true
  }
}
```

---

## GET /auctions/active/list
**Get all currently active auctions**

### Access
- Authentication: Required
- Public (all authenticated users)

### Response (200 OK)
```json
{
  "success": true,
  "count": 12,
  "auctions": [
    {
      "auctionId": "auction-001",
      "title": "Spring Collection",
      "schoolId": "school-001",
      "artworkCount": 25,
      "uniqueBidders": 150,
      "endTime": "2026-02-08T10:00:00Z",
      "timeRemaining": 432000000,
      "status": "active"
    }
  ]
}
```

---

## GET /auctions/:auctionId
**Get auction details**

### Access
- Authentication: Required
- Public (all authenticated users)

### URL Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| auctionId | string | Auction ID |

### Response (200 OK)
```json
{
  "success": true,
  "auction": {
    "auctionId": "auction-001",
    "title": "Spring Art Collection",
    "description": "Student artwork auction",
    "schoolId": "550e8400",
    "charityId": "charity-001",
    "status": "active",
    "startTime": "2026-02-01T10:00:00Z",
    "endTime": "2026-02-08T10:00:00Z",
    "timeRemaining": 432000000,
    "isActive": true,
    "artworkCount": 25,
    "totalBids": 150,
    "totalCurrentValue": 50000000,
    "platformFeePercentage": 3,
    "autoExtendEnabled": true,
    "autoExtendMinutes": 10,
    "createdAt": "2026-01-29T00:00:00Z",
    "closedAt": null
  }
}
```

---

## GET /auctions/:auctionId/artwork
**Get all artwork in an auction**

### Access
- Authentication: Required
- Public (all authenticated users)

### Response (200 OK)
```json
{
  "success": true,
  "count": 25,
  "artwork": [
    {
      "artworkId": "art-001",
      "title": "Sunset Over Mountains",
      "description": "Oil painting",
      "imageUrl": "https://cdn.example.com/art-001.jpg",
      "startingPrice": 5000,
      "currentBid": 12500,
      "bidCount": 8,
      "artistId": "student-001"
    }
  ]
}
```

---

## GET /auctions/:auctionId/winner
**Get auction winner information**

### Access
- Authentication: Required
- Public (all authenticated users)

### Response (200 OK)
```json
{
  "success": true,
  "auctionId": "auction-001",
  "winnerCount": 5,
  "winners": [
    {
      "artworkId": "art-001",
      "artworkTitle": "Sunset Over Mountains",
      "winnerId": "user-123",
      "winnerName": "John Doe",
      "winnerEmail": "john@example.com",
      "winningBid": 12500
    }
  ],
  "hasWinners": true
}
```

---

## PUT /auctions/:auctionId
**Update auction details (draft only)**

### Access
- Required Role: `site_admin`, `school_admin`
- Authentication: Required
- Restriction: Only draft auctions can be updated

### Request Body
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "platformFeePercentage": 4,
  "autoExtendEnabled": false
}
```

### Response (200 OK)
```json
{
  "success": true,
  "auctionId": "auction-001",
  "title": "Updated Title",
  "status": "draft",
  "message": "Auction updated successfully"
}
```

---

## POST /auctions/:auctionId/start
**Start an auction (move from draft to active)**

### Access
- Required Role: `site_admin`, `school_admin`
- Authentication: Required

### Request Body
Empty

### Response (200 OK)
```json
{
  "success": true,
  "auctionId": "auction-001",
  "status": "active",
  "message": "Auction started successfully"
}
```

### Validation
- Auction must be in draft status
- Auction must have at least one artwork

---

## POST /auctions/:auctionId/end
**End an auction and determine winners**

### Access
- Required Role: `site_admin`, `school_admin`
- Authentication: Required

### Request Body
Empty

### Response (200 OK)
```json
{
  "success": true,
  "auctionId": "auction-001",
  "status": "ended",
  "totalRevenue": 125000,
  "platformFee": 3750,
  "charityRevenue": 121250,
  "winnersCount": 5,
  "winners": [
    {
      "artworkId": "art-001",
      "artworkTitle": "Sunset",
      "winnerId": "user-123",
      "winningBid": 12500
    }
  ],
  "message": "Auction ended with 5 winning bids"
}
```

---

## POST /auctions/:auctionId/extend
**Manually extend auction end time**

### Access
- Required Role: `site_admin`, `school_admin`
- Authentication: Required

### Request Body
```json
{
  "minutesToExtend": 30
}
```

### Response (200 OK)
```json
{
  "success": true,
  "auctionId": "auction-001",
  "newEndTime": "2026-02-08T10:30:00Z",
  "extendedByMinutes": 30,
  "message": "Auction auto-extended by 30 minutes"
}
```

---

## DELETE /auctions/:auctionId
**Delete a draft auction**

### Access
- Required Role: `site_admin`, `school_admin`
- Authentication: Required
- Restriction: Only draft auctions can be deleted

### Request Body
Empty

### Response (200 OK)
```json
{
  "success": true,
  "auctionId": "auction-001",
  "message": "Auction deleted successfully"
}
```

---

# Bidding Endpoints

## POST /bids/place
**Place a bid on artwork**

### Access
- Authentication: Required
- Restriction: User must have valid payment method on file

### Request Body
```json
{
  "artworkId": "art-001",
  "bidAmount": 15000
}
```

### Response (201 Created)
```json
{
  "success": true,
  "bidId": "bid-550e8400",
  "artworkId": "art-001",
  "bidAmount": 15000,
  "timestamp": "2026-01-29T15:30:00Z",
  "message": "Bid placed successfully for $150.00"
}
```

### Validation Rules
- Bid amount must be > current bid + minimum increment
- User cannot be artwork artist
- User must have valid payment method
- Auction must be active
- Auction must not have ended

---

## POST /bids/:bidId/withdraw
**Withdraw a bid**

### Access
- Authentication: Required
- Restriction: Only bid owner can withdraw

### Request Body
Empty

### Response (200 OK)
```json
{
  "success": true,
  "bidId": "bid-001",
  "message": "Bid withdrawn successfully"
}
```

### Restrictions
- Cannot withdraw highest bid if auction ends in < 5 minutes

---

## GET /bids/artwork/:artworkId
**Get bid history for artwork**

### Access
- Public (no authentication required)

### Response (200 OK)
```json
{
  "success": true,
  "count": 15,
  "bids": [
    {
      "bidId": "bid-001",
      "bidder": {
        "id": "user-123",
        "username": "john_doe",
        "displayName": "John Doe"
      },
      "amount": 15000,
      "timestamp": "2026-01-29T15:30:00Z",
      "status": "active"
    }
  ]
}
```

---

## GET /bids/artwork/:artworkId/state
**Get current bidding state for artwork**

### Access
- Public (no authentication required)

### Response (200 OK)
```json
{
  "success": true,
  "state": {
    "artworkId": "art-001",
    "title": "Sunset Over Mountains",
    "auctionId": "auction-001",
    "startingPrice": 5000,
    "reservePrice": 8000,
    "reserveMet": true,
    "currentBid": 15000,
    "currentBidderId": "user-123",
    "totalBids": 15,
    "auctionStatus": "active",
    "endTime": "2026-02-08T10:00:00Z",
    "lastBidTime": "2026-01-29T15:30:00Z",
    "timeRemaining": 432000000,
    "auctionActive": true
  }
}
```

---

## GET /bids/user/:userId/history
**Get user's bid history**

### Access
- Authentication: Required
- Restriction: Users can only view own history (admins can view any)

### Response (200 OK)
```json
{
  "success": true,
  "count": 12,
  "bids": [
    {
      "bidId": "bid-001",
      "artworkId": "art-001",
      "title": "Sunset Over Mountains",
      "imageUrl": "https://cdn.example.com/art-001.jpg",
      "bidAmount": 15000,
      "highestBid": 15000,
      "isWinning": true,
      "timestamp": "2026-01-29T15:30:00Z",
      "status": "active",
      "auctionStatus": "active",
      "auctionEndTime": "2026-02-08T10:00:00Z"
    }
  ]
}
```

---

## GET /bids/user/:userId/active
**Get user's active auctions (ones they're bidding on)**

### Access
- Authentication: Required
- Restriction: Users can only view own auctions (admins can view any)

### Response (200 OK)
```json
{
  "success": true,
  "count": 8,
  "auctions": [
    {
      "auctionId": "auction-001",
      "title": "Spring Collection",
      "imageUrl": "https://cdn.example.com/art-001.jpg",
      "startingPrice": 5000,
      "currentBid": 15000,
      "userHighestBid": 15000,
      "isWinning": true,
      "status": "active",
      "endTime": "2026-02-08T10:00:00Z"
    }
  ]
}
```

---

## GET /bids/:bidId
**Get bid details**

### Access
- Public (no authentication required)

### Response (200 OK)
```json
{
  "success": true,
  "bid": {
    "bidId": "bid-001",
    "artworkId": "art-001",
    "artworkTitle": "Sunset Over Mountains",
    "bidderId": "user-123",
    "bidderName": "John Doe",
    "bidderUsername": "john_doe",
    "amount": 15000,
    "timestamp": "2026-01-29T15:30:00Z",
    "status": "active"
  }
}
```

---

## POST /bids/validate
**Validate bid amount before placement**

### Access
- Public (no authentication required)

### Request Body
```json
{
  "artworkId": "art-001",
  "bidAmount": 18000
}
```

### Response (200 OK - Valid Bid)
```json
{
  "success": true,
  "valid": true,
  "message": "Bid amount is valid",
  "minimumBid": 16000,
  "currentBid": 15000
}
```

### Response (200 OK - Invalid Bid)
```json
{
  "success": true,
  "valid": false,
  "message": "Bid must be at least $160.00",
  "minimumBid": 16000,
  "currentBid": 15000
}
```

---

# WebSocket Events (Real-time Updates)

## Connection
```
WS /ws
```

### Authentication
Include JWT token in query parameter:
```
ws://localhost:5000/ws?token=eyJhbGciOiJIUzI1NiIs...
```

## Subscribe to Updates
```json
{
  "type": "subscribe",
  "channel": "auction",
  "auctionId": "auction-001"
}
```

## Bid Placed Event
```json
{
  "type": "bid_placed",
  "auctionId": "auction-001",
  "artworkId": "art-001",
  "bidId": "bid-001",
  "bidder": "user-123",
  "amount": 15000,
  "timestamp": "2026-01-29T15:30:00Z",
  "totalBids": 15
}
```

## Bid Withdrawn Event
```json
{
  "type": "bid_withdrawn",
  "auctionId": "auction-001",
  "artworkId": "art-001",
  "bidId": "bid-001",
  "timestamp": "2026-01-29T15:35:00Z"
}
```

## Auction Status Change Event
```json
{
  "type": "auction_status_changed",
  "auctionId": "auction-001",
  "newStatus": "active",
  "timestamp": "2026-01-29T10:00:00Z"
}
```

## Auction Extended Event
```json
{
  "type": "auction_extended",
  "auctionId": "auction-001",
  "newEndTime": "2026-02-08T10:30:00Z",
  "extendedByMinutes": 30,
  "timestamp": "2026-01-29T15:55:00Z"
}
```

## Timer Update Event (every 10 seconds)
```json
{
  "type": "timer_update",
  "auctionId": "auction-001",
  "timeRemaining": 432000000,
  "timestamp": "2026-01-29T15:30:10Z"
}
```

## Auction Ended Event
```json
{
  "type": "auction_ended",
  "auctionId": "auction-001",
  "winners": [
    {
      "artworkId": "art-001",
      "winnerId": "user-123",
      "winningBid": 15000
    }
  ],
  "totalRevenue": 125000,
  "timestamp": "2026-02-08T10:00:00Z"
}
```

---

# Rate Limiting

Bidding endpoints have rate limiting:
- **Standard**: 30 requests per minute per user
- **Bid Placement**: 5 bids per 10 seconds per user
- **List Queries**: 60 requests per minute per user

Headers included in response:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

---

# Compliance & Security

## Data Protection
- All bids encrypted in transit (TLS 1.2+)
- Sensitive user data not returned in responses
- PCI-DSS 3.2.1 compliant (no payment data stored)

## Audit Logging
- All auction operations logged
- All bid operations logged
- User action tracking enabled

## Fraud Detection
- Transaction velocity checks
- Duplicate bid prevention
- Suspicious activity flagging

---

# Testing

## Postman Collection
See `Section_5_API.postman_collection.json` for pre-configured requests

## cURL Examples

### Create Auction
```bash
curl -X POST http://localhost:5000/api/auctions \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Spring Art Auction",
    "description": "Student artwork",
    "schoolId": "550e8400",
    "startTime": "2026-02-01T10:00:00Z",
    "endTime": "2026-02-08T10:00:00Z"
  }'
```

### Place Bid
```bash
curl -X POST http://localhost:5000/api/bids/place \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "artworkId": "art-001",
    "bidAmount": 15000
  }'
```

### Get Active Auctions
```bash
curl http://localhost:5000/api/auctions/active/list \
  -H "Authorization: Bearer {TOKEN}"
```

---

# Implementation Status

| Component | Status | Location |
|-----------|--------|----------|
| Auction Service | ✅ Complete | `src/services/auctionService.js` |
| Bidding Service | ✅ Complete | `src/services/biddingService.js` |
| Auction Controller | ✅ Complete | `src/controllers/auctionController.js` |
| Bid Controller | ✅ Complete | `src/controllers/bidController.js` |
| Auction Routes | ✅ Complete | `src/routes/auctionRoutes.js` |
| Bidding Routes | ✅ Complete | `src/routes/biddingRoutes.js` |
| WebSocket Handlers | ✅ Complete | `src/services/realtimeService.js` |
| Integration Tests | ✅ Complete | `tests/integration/services/` |
| Controller Tests | ✅ Complete | `tests/integration/controllers/` |

---

**Document Version**: 1.0  
**Last Updated**: January 29, 2026  
**Status**: Complete - Ready for Section 6 (Frontend Development)
