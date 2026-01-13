# BOT - Prediction Market Arbitrage Detection

A terminal-based tool for detecting arbitrage opportunities across prediction markets (Kalshi and Polymarket) with TimescaleDB-powered analytics and time-series data storage.

## Overview

BOT monitors prediction markets in real-time and identifies arbitrage opportunities by:
- **Cross-market arbitrage**: Finding price discrepancies between the same event on Kalshi and Polymarket
- **Intra-market arbitrage**: Detecting when YES + NO prices sum to less than 1 on a single market

The application stores all market data in TimescaleDB for historical analysis, trend tracking, and advanced analytics.

## Features

- Real-time market data from Kalshi and Polymarket via the Dome API
- Fuzzy matching algorithm to pair similar markets across platforms
- Configurable profit margin thresholds
- Filter and sort opportunities by profit, confidence, or time
- Market search functionality
- Auto-refresh with configurable intervals
- **TimescaleDB integration** for time-series data storage
- **Advanced analytics** with continuous aggregates and hypertables
- **Historical tracking** of opportunities and market prices
- **Performance monitoring** with scan history and metrics

## Prerequisites

- [Bun](https://bun.sh) runtime (v1.0 or higher)
- [Docker](https://www.docker.com) and Docker Compose (required for running TimescaleDB database)
- Dome API key (get one at [dashboard.domeapi.io](https://dashboard.domeapi.io))

> **Note**: The database runs in a Docker container. Make sure Docker Desktop (or Docker Engine) is installed and running before starting the database.

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-username/prediction-markets.git
cd prediction-markets
```

### 2. Install dependencies

```bash
bun install
```

### 3. Set up environment variables

Create a `.env` file in the root directory:

```bash
# Dome API Configuration
DOME_API_KEY=your-api-key-here

# Database Configuration (optional - defaults shown)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=predmarket
DB_USER=predmarket
DB_PASSWORD=predmarket_dev
```

### 4. Start the database (Docker)

**The database runs in Docker.** Start TimescaleDB using Docker Compose:

```bash
# Make sure Docker is running first!
bun run db:up
```

This command runs `docker compose up -d` which will:
- Start a TimescaleDB container on port 5432
- Automatically run schema migrations from `db/init/001_schema.sql`
- Create hypertables, continuous aggregates, and compression policies

**Verify Docker is running:**
```bash
docker ps
```

**Check database logs:**
```bash
bun run db:logs
```

Wait for the database to be healthy before proceeding. You should see "healthy" status when running `docker compose ps`.

### 5. Verify database setup

Run the test suite to verify everything is working:

```bash
bun test
```

You should see all tests passing, including database connection, TimescaleDB features, and analytics queries.

## Usage

### Running the Application

Start the TUI application:

```bash
bun start
```

Or with watch mode for development:

```bash
bun dev
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑↓` | Navigate opportunities |
| `Enter` | View opportunity details |
| `r` | Refresh market data |
| `f` | Cycle through filters |
| `q` | Quit |

### Database Management Commands (Docker)

All database operations use Docker:

```bash
# Start the database (Docker container)
bun run db:up
# Equivalent to: docker compose up -d

# Stop the database (Docker container)
bun run db:down
# Equivalent to: docker compose down

# View database logs (Docker container logs)
bun run db:logs
# Equivalent to: docker compose logs -f timescaledb

# Check database container status
docker compose ps

# Access database directly (optional)
docker exec -it predmarket-timescaledb psql -U predmarket -d predmarket
```

**Important**: The database data persists in a Docker volume (`timescaledb_data`). Stopping the container with `bun run db:down` preserves your data. To completely remove data, use `docker compose down -v`.

## Project Structure

```
src/
├── api/              # Dome API client and types
├── arbitrage/        # Arbitrage detection logic
│   ├── calculator.ts # Profit calculations
│   ├── detector.ts  # Main detection orchestrator
│   └── matcher.ts   # Market matching algorithms
├── components/       # Solid.js TUI components
├── db/               # Database layer
│   ├── connection.ts # Database connection management
│   ├── repositories/ # Data access layer
│   │   ├── markets.ts
│   │   ├── snapshots.ts
│   │   ├── opportunities.ts
│   │   └── analytics.ts  # Advanced analytics queries
│   ├── cache/        # Cache management
│   └── types.ts       # Database types and utilities
├── models/           # TypeScript types and Zod schemas
├── stores/           # Reactive state management
└── utils/            # Fuzzy matching and helpers

db/
└── init/
    └── 001_schema.sql # Database schema and migrations
```

## Database Schema

The application uses TimescaleDB with the following key components:

### Tables
- **markets**: Deduplicated market metadata
- **market_snapshots**: Time-series hypertable for price data
- **arbitrage_opportunities**: Detected opportunities
- **opportunity_snapshots**: Time-series tracking of opportunity profit
- **executions**: Trade execution tracking
- **scan_history**: Audit trail for market scans

### Continuous Aggregates
- **market_prices_hourly**: Pre-aggregated hourly price data
- **opportunities_daily**: Daily opportunity summaries

### Features
- Automatic compression after 7 days (market_snapshots) and 1 day (opportunity_snapshots)
- Retention policies: 90 days for market snapshots, 30 days for opportunity snapshots
- Indexes optimized for time-series queries

## Analytics

The `analyticsRepository` provides advanced analytics queries:

- **Dashboard Statistics**: Comprehensive stats for markets, opportunities, snapshots, and scans
- **Market Price History**: Hourly aggregates with gap-filling
- **Top Markets**: By volume and volatility
- **Opportunity Trends**: Profit margin trends over time
- **Platform Comparison**: Price differences between Kalshi and Polymarket
- **Performance Metrics**: Scan performance and database health

Example usage:

```typescript
import { analyticsRepository } from "./db/repositories"

// Get dashboard stats
const stats = await analyticsRepository.getDashboardStats()

// Get price history for a market
const history = await analyticsRepository.getMarketPriceHistory(marketDbId, 24)

// Get top markets by volume
const topMarkets = await analyticsRepository.getTopMarketsByVolume(10)
```

## Testing

The project includes comprehensive test coverage:

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test:watch

# Run specific test file
bun test src/__tests__/db.test.ts
```

Test coverage includes:
- Database connection and health checks
- Repository CRUD operations
- TimescaleDB features (hypertables, continuous aggregates)
- Analytics queries
- Market matching and arbitrage detection

## Rate Limiting

The Dome API free tier has a rate limit of 1 request per second. The application handles this automatically with built-in delays between API calls. For faster data loading, consider upgrading your Dome API plan.

## Troubleshooting

### Database Connection Issues

If you see connection errors:

1. **Verify Docker is running**: 
   ```bash
   docker ps
   ```
   If Docker isn't running, start Docker Desktop or Docker Engine.

2. **Check if the database container is running**:
   ```bash
   docker compose ps
   ```
   You should see `predmarket-timescaledb` with status "healthy".

3. **Start the database if it's not running**:
   ```bash
   bun run db:up
   ```

4. **Check database logs**:
   ```bash
   bun run db:logs
   ```

5. **Verify environment variables** match `docker-compose.yml` defaults (or update your `.env` file accordingly)

### TimescaleDB Extension Not Found

If you see errors about TimescaleDB extension:

1. Ensure you're using the TimescaleDB Docker image (not plain PostgreSQL)
2. Check that migrations ran: `docker compose logs timescaledb | grep "CREATE EXTENSION"`

### Port Already in Use

If port 5432 is already in use:

1. Change the port in `docker-compose.yml`
2. Update `DB_PORT` in your `.env` file

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **UI Framework**: [Solid.js](https://solidjs.com) + [@opentui/solid](https://github.com/opentui/solid) (terminal UI)
- **Database**: [TimescaleDB](https://www.timescale.com) (PostgreSQL + time-series extensions)
- **API**: [Dome API](https://domeapi.io) (unified Kalshi + Polymarket data)
- **Schema Validation**: [Zod](https://zod.dev)
- **Language**: TypeScript

## Development

### Type Checking

```bash
bun run typecheck
```

### Building

```bash
bun run build
```

## License

MIT License
