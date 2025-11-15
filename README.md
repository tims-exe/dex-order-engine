# Order Execution Engine - Technical Documentation

## 🎯 Project Overview

This is a order execution engine that automatically routes trades to the best available decentralized exchange (DEX). The system implements real-world trading platform patterns including asynchronous order processing, real-time status updates, and intelligent price routing.

**Core Capability**: Users submit cryptocurrency swap orders (e.g., SOL → USDC), and the system automatically:
- Compares prices across multiple DEXs (Raydium & Meteora)
- Routes to the exchange offering the best net price after fees
- Executes the trade with slippage protection
- Provides live status updates via WebSocket
- Persists all execution data for audit trails

### Why Market Orders?

**I chose to implement Market Orders** because they represent the foundational order type that executes immediately at the best available price. This allowed me to focus on building robust infrastructure without the complexity of price monitoring or trigger conditions.

**Extension Path**: The same engine can be extended to support:
- **Limit Orders**: Add a price monitoring service that continuously checks market prices and triggers order execution when target price is reached
- **Sniper Orders**: Implement token launch detection listeners that monitor blockchain events and automatically execute orders when new token pools are created

---

## 🧩 System Components

### 1. **API Server** (`api/`)
**Role**: Request handler and real-time communication gateway

**Responsibilities**:
- Validates incoming order requests using Zod schemas for runtime type safety
- Creates order records in PostgreSQL via Prisma ORM
- Enqueues orders to BullMQ for asynchronous processing
- Manages WebSocket connections for real-time status streaming
- Subscribes to Redis Pub/Sub channels to receive order updates from workers

**Key Design Decisions**:
- **Separate POST and WebSocket routes**: Allows clients to reconnect to existing orders without resubmission, improving resilience
- **Zod validation**: Ensures runtime type safety with automatic error messages and schema composition

### 2. **Worker** (`worker/`)
**Role**: Background job processor and trade executor

**Responsibilities**:
- Consumes orders from BullMQ queue at configurable concurrency
- Fetches real-time quotes from multiple DEXs in parallel
- Implements intelligent DEX routing logic (selects best net price after fees)
- Executes swaps on chosen DEX with slippage protection
- Publishes status updates to Redis Pub/Sub for real-time client notifications
- Updates order state in PostgreSQL for audit trails

**Key Design Decisions**:
- **Retry System**: Handles transient failures (network timeouts, API rate limits) gracefully
- **Mock implementations**: Focuses on architecture and patterns without blockchain complexity or costs, making it easier to learn and test
- **Parallel quote fetching with Promise.all**: DEX quotes are fetched concurrently rather than sequentially, reducing total wait time from ~4 seconds to ~2 seconds. Each mock returns a promisified response with realistic network delays, and Promise.all executes both requests simultaneously for optimal performance

### 3. **Queue System (BullMQ + Redis)**
**Role**: Asynchronous job management and reliability layer

**Why BullMQ?**
- **Decouples API from Worker**: API responds instantly while worker processes in background, improving user experience
- **Built-in retry logic**: Automatic retry with exponential backoff eliminates manual error handling
- **Concurrency control**: Processes multiple orders simultaneously without system overload
- **Job persistence**: Orders survive worker crashes/restarts, ensuring no data loss
- **Rate limiting**: Prevents system abuse with configurable throughput limits (100 orders/min)

**How It Works**: API adds jobs to the queue with order data. Workers pick up jobs based on availability and concurrency settings, process them independently, and automatically retry on failures.

### 4. **Database (PostgreSQL + Prisma)**
**Role**: Persistent storage and audit trail

**Schema Design**: Orders table stores complete order lifecycle including order details (tokenIn, tokenOut, amount), execution metadata (selectedDex, executedPrice, txHash), status tracking (pending → routing → building → submitted → confirmed/failed), error messages for post-mortem analysis, and timestamps for lifecycle tracking.

### 5. **Redis Pub/Sub**
**Role**: Real-time event broadcasting between worker and API

**Problem Solved**: Worker and API are separate processes. When worker updates order status, API needs to know instantly to push updates via WebSocket to connected clients.

**How It Works**: Worker publishes status updates to order-specific Redis channels. API subscribes to these channels and forwards messages to connected WebSocket clients in real-time.

**Key Design Decisions**:
- **Channel per order**: Isolated communication prevents cross-order message pollution
- **Auto-unsubscribe on completion**: Prevents memory leaks from stale subscriptions

### 6. **WebSocket Communication**
**Role**: Real-time status streaming to clients

**Implementation Pattern**: Client submits order via REST POST endpoint to get orderId, then connects via WebSocket GET endpoint using orderId. Connection stays open to receive real-time status updates until order completes (confirmed/failed), at which point connection automatically closes.

**Why This Pattern?**
- **RESTful order creation**: Clear HTTP semantics, easy to test with standard tools
- **WebSocket for updates**: Efficient real-time streaming without polling overhead
- **Reconnection support**: Clients can reconnect using orderId if connection drops, ensuring reliable delivery

---

## 🔄 Order Execution Flow

### Step-by-Step Process

**1. Order Submission**
- User sends POST request with order details (tokenIn, tokenOut, amount, orderType)
- API validates data using Zod schema
- Order record created in PostgreSQL with status "pending"
- Job added to BullMQ queue
- API returns orderId immediately (~50ms response time)

**2. WebSocket Connection**
- Client connects via WebSocket using orderId
- API verifies order exists in database
- Subscribes to Redis Pub/Sub channel for this specific order
- Forwards all status updates to client in real-time

**3. Worker Processing Begins**
- Worker picks up job from BullMQ queue
- Status changes to "routing"
- Initial delay simulates order queueing

**4. DEX Price Comparison**
- Worker fetches quotes from Raydium and Meteora in parallel
- Calculates net price after fees for each DEX
- Selects DEX with best net price
- Status updates to "routing" with selected DEX information

**5. Transaction Building**
- Status changes to "building"
- Worker constructs swap transaction for selected DEX
- Simulates transaction preparation time
- Selected DEX persisted to database

**6. Transaction Submission**
- Status changes to "submitted"
- Transaction broadcasted to network (mocked)
- Simulates network confirmation delay

**7. Swap Execution**
- Worker executes swap on selected DEX
- Random slippage (0.5-1%) applied to simulate real trading
- Unique transaction hash generated
- Final execution price calculated

**8. Confirmation & Cleanup**
- Status changes to "confirmed"
- Transaction hash and executed price saved to database
- Final update sent via Redis Pub/Sub
- WebSocket connection closes
- Redis channel unsubscribed

**9. Error Handling**
- On failure, worker implements exponential backoff retry
- Maximum 3 retry attempts with delays: 1s → 2s → 4s
- After 3 failed attempts, order marked as "failed"
- Error message persisted to database for analysis

---

## 📊 Status Flow

```
pending → routing → building → submitted → confirmed/failed
```

**Status Definitions**:
- **pending**: Order received and queued
- **routing**: Comparing DEX prices and selecting best route
- **building**: Creating transaction for selected DEX
- **submitted**: Transaction sent to network
- **confirmed**: Transaction successful (includes txHash and executedPrice)
- **failed**: Order failed after retry attempts (includes error message)

---

## 🎨 Project Structure

```
order-execution-engine/
├── api/                          # REST API & WebSocket server
│   ├── src/
│   │   ├── server.ts            # Fastify setup, plugin registration
│   │   ├── routes/
│   │   │   └── orders.ts        # Order submission & WebSocket routes
│   │   └── services/
│   │       └── orderHandler.ts  # WebSocket connection management
│   ├── package.json
│   └── tsconfig.json
│
├── worker/                       # Background job processor
│   ├── src/
│   │   ├── worker.ts            # BullMQ worker initialization
│   │   ├── orderProcessor.ts   # Core order execution logic
│   │   └── services/
│   │       ├── dexHandler.ts   # DEX abstraction & routing
│   │       └── mock/
│   │           ├── raydiumMock.ts   # Raydium simulator
│   │           └── meteoraMock.ts   # Meteora simulator
│   ├── package.json
│   └── tsconfig.json
│
├── db/                           # Database layer
│   ├── prisma/
│   │   └── schema.prisma        # Database schema definition
│   ├── package.json
│   └── tsconfig.json
│
├── docker-compose.yml            # PostgreSQL + Redis setup
└── README.md
```

---

## 🛠️ Technology Stack

| Technology | Purpose | Justification |
|------------|---------|---------------|
| **Node.js + TypeScript** | Runtime + Language | Type safety, excellent async support, rich ecosystem |
| **Fastify** | HTTP/WebSocket server | Built-in WebSocket support, fastest Node.js framework, excellent plugin system |
| **BullMQ** | Job queue | Redis-based, automatic retry logic, rate limiting, job persistence |
| **Redis** | Queue + Pub/Sub | In-memory speed, atomic operations, reliable Pub/Sub for real-time communication |
| **PostgreSQL** | Database | ACID compliance, JSON support, production-grade reliability for financial data |
| **Prisma** | ORM | Type-safe queries, automatic migrations, excellent TypeScript integration |
| **Zod** | Validation | Runtime type checking, automatic error messages, seamless TypeScript integration |

---

## 🔐 Key Design Patterns

### 1. **Separation of Concerns**
Each component has a single, well-defined responsibility:
- **API**: HTTP/WebSocket communication only
- **Worker**: Order execution only
- **Services**: DEX interaction only

**Benefits**: Easy to test, maintain, and scale each component independently

### 2. **Asynchronous Processing**
Orders processed in background via queue system. API returns immediately while worker handles time-consuming operations.

**Benefits**: Fast API response times, better resource utilization, horizontal scalability

### 3. **Pub/Sub Pattern**
Real-time communication between worker and API using Redis Pub/Sub channels.

**Benefits**: Decoupled services, event-driven architecture, instant status delivery

### 4. **HTTP → WebSocket Upgrade**
Initial order creation via REST POST, then upgrade to WebSocket for status streaming.

**Benefits**: RESTful semantics for creation, efficient real-time updates, reconnection support

### 5. **Mock Implementation Strategy**
Simulated DEX integrations with realistic delays and price variations.

**Benefits**: No blockchain dependencies, fast testing cycles, deterministic behavior, zero costs

**Migration Path**: When ready for production, replace mock services with real Raydium and Meteora SDKs. The architecture remains unchanged, only service implementations are swapped.

---

## 🎓 Core Concepts Demonstrated

1. **Microservices Architecture**: Splitting application into focused, independently deployable services
2. **Message Queue Pattern**: Decoupling services using job queues for asynchronous processing
3. **Pub/Sub Communication**: Real-time event broadcasting between distributed components
4. **WebSocket Streaming**: Persistent connections for live status updates
5. **Mock Services**: Simulating external APIs for development and testing
6. **Database Persistence**: Maintaining audit trails and order history
7. **Error Handling**: Exponential backoff retry strategies for resilience
8. **Concurrency Control**: Managing parallel execution with rate limiting

---

## 🔮 Future Enhancements

2. **Limit Orders**: Price monitoring service with trigger-based execution
3. **Sniper Orders**: Token launch detection via blockchain event listeners
4. **Real DEX Integration**: Replace mocks with actual Raydium/Meteora SDKs
5. **Advanced Routing**: Consider liquidity depth, historical execution quality
6. **Frontend UI**: React dashboard for order submission and monitoring
7. **Monitoring**: Integration with Datadog/Sentry for observability
8. **Deployment**: Production deployment on cloud platforms

