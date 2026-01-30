# Silent Auction Gallery

A web application for managing and conducting silent auctions with an interactive gallery interface.

## Project Overview

This application provides a platform for:
- User authentication and management
- Auction creation and management
- Bidding on auction items
- Real-time auction updates
- Auction history and analytics

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- PostgreSQL

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
   or
   ```
   yarn install
   ```

3. Create a `.env` file based on `.env.example` and configure your environment variables

4. Start the application:
   ```
   npm run dev
   ```

## Project Structure

```
src/
├── models/          - Database models
├── controllers/     - Request handlers
├── services/        - Business logic
├── utils/           - Utility functions
└── routes/          - API routes

tests/
├── unit/            - Unit tests
└── integration/     - Integration tests
```

## Available Scripts

- `npm run start` - Start the application in production mode
- `npm run dev` - Start the application in development mode with hot reload
- `npm test` - Run all tests
- `npm run test:unit` - Run unit tests only
- `npm run test:integration` - Run integration tests only
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues

## API Endpoints

### Users
- `GET /users` - Get all users
- `GET /users/:id` - Get a specific user
- `POST /users` - Create a new user
- `PUT /users/:id` - Update a user
- `DELETE /users/:id` - Delete a user

### Auctions
- `GET /auctions` - Get all auctions
- `GET /auctions/:id` - Get a specific auction
- `POST /auctions` - Create a new auction
- `PUT /auctions/:id` - Update an auction
- `DELETE /auctions/:id` - Delete an auction

### Bids
- `GET /bids` - Get all bids
- `POST /bids` - Place a new bid
- `GET /bids/auction/:auctionId` - Get bids for an auction

## Contributing

Please follow the coding standards and submit pull requests for any changes.

## License

MIT License
