# Silent Auction Gallery

A web application that empowers school art programs to raise funds through silent auctions. Teachers create auctions showcasing student artwork, and the proceeds benefit whatever cause the teacher deems most valuable — whether that's the school's own art program, classroom supplies, a field trip, or a charity chosen by the teacher and the students contributing their work.

## Project Overview

This application provides a platform for:
- School art programs to host silent auctions of student artwork
- Teachers to create and manage auctions, directing proceeds to the school or a chosen charity
- Students to contribute artwork and participate in the fundraising process
- Bidders (parents, community members, supporters) to browse and bid on student artwork
- Real-time bidding with live auction updates
- Multi-school support with role-based access for site administrators, school administrators, teachers, students, and bidders

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
