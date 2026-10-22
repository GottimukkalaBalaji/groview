# Grovastra System Architecture Documentation

## 1. Executive Summary & Vision

**Grovastra** is a high-performance, Reelo-inspired WhatsApp Campaign Management Platform. It enables businesses to automate marketing campaigns, manage targeted customer segments, orchestrate high-throughput WhatsApp message delivery via Meta's Cloud API, and monitor delivery analytics in real time.

This document describes the foundational architecture established in **Phase 1: Project Setup and Architecture Foundation**.

---

## 2. High-Level Architecture Diagram

```mermaid
graph TB
    subgraph ClientLayer ["Client & Frontend Layer"]
        Browser["React 18 + Vite Web App<br/>(Hosted on Vercel Hobby)"]
    end

    subgraph APILayer ["Backend API Layer (Express + TypeScript)"]
        API["Node.js Express Server<br/>Port: 5000"]
        Helmet["Helmet Security Headers"]
        Cors["CORS Policy Middleware"]
        Router["Versioned Router: /api/v1"]
        HealthCtrl["Health & Readiness Probes"]
        Logger["Sanitized Logger & Error Middleware"]
    end

    subgraph QueueLayer ["Asynchronous Queue Layer"]
        BullMQWorker["Local Node.js Worker Process<br/>(Separate CLI / Background Process)"]
        UpstashRedis[("Upstash Redis Cloud<br/>(TLS / rediss://)")]
    end

    subgraph DataLayer ["Data & Persistence Layer"]
        PrismaORM["Prisma 6 Client"]
        SupabasePooled[("Supabase PgBouncer Pooler<br/>Port 6543 (Transaction Mode)")]
        SupabaseDirect[("Supabase Direct PostgreSQL<br/>Port 5432 (Session Mode)")]
    end

    subgraph ExternalChannels ["External Meta Channel"]
        MetaAPI["Official Meta WhatsApp Cloud API<br/>(Graph API v21.0+)"]
    end

    %% Client communication
    Browser -->|HTTP/REST /api/v1| API

    %% Express internals
    API --> Helmet
    Helmet --> Cors
    Cors --> Router
    Router --> HealthCtrl
    Router --> Logger

    %% Database connections
    API -.->|Prisma Queries (DATABASE_URL)| SupabasePooled
    BullMQWorker -.->|Prisma Worker Updates| SupabasePooled
    PrismaORM -.->|Prisma CLI Migrations (DIRECT_URL)| SupabaseDirect

    %% Queue dispatch
    API -.->|Enqueue Jobs| UpstashRedis
    BullMQWorker -.->|Consume Jobs| UpstashRedis

    %% WhatsApp delivery (Future phases)
    BullMQWorker -.->|Dispatch Templates & Messages| MetaAPI
    MetaAPI -.->|Webhooks / Delivery Receipts| API
```

---

## 3. Technology Stack Rationale

| Component | Technology | Rationale |
|---|---|---|
| **Monorepo** | npm Workspaces | Keeps frontend and backend isolated while enabling coordinated builds and dependency management without heavy build tools. |
| **Frontend** | React 18, Vite, TypeScript | Ultra-fast HMR, lean bundle size, type-safe API communication, clean CSS tokens without unrequested framework bloat. |
| **Backend** | Node.js, Express, TypeScript | Industry standard, lightweight HTTP runtime, mature middleware ecosystem (Helmet, CORS, Morgan/Logger). |
| **Database** | Supabase PostgreSQL (Free) | Managed PostgreSQL with automated backups, scalable schema migrations, and connection pooling. |
| **ORM** | Prisma 6 | Type-safe query building, declarative schema migrations, and dual connection support (pooled + direct). |
| **Message Queue**| BullMQ + Upstash Redis | Redis-backed queuing offering distributed locking, rate-limiting, and job retries with zero local Redis installation required. |
| **Messaging Channel**| Meta WhatsApp Cloud API | Official WhatsApp Business Platform with direct Graph API integration, avoiding third-party gateway markups. |

---

## 4. Subsystem Isolation & Worker Architecture

### Separation of Express API and BullMQ Worker
A core architectural principle of Grovastra is the strict runtime separation between the **HTTP Request/Response Cycle** and the **Long-Running Message Dispatch Worker**:

1. **Express API Server (`backend/src/server.ts`)**:
   - Handles client HTTP requests (auth, audience segmentation, campaign creation, webhook ingestion).
   - Enqueues campaign dispatch jobs into Redis and returns immediately with HTTP 202 Accepted.
   - Must be stateless and fast (< 100ms response targets).
   - Designed to run seamlessly in serverless environments (e.g., Vercel, Railway, Render).

2. **BullMQ Campaign Worker (Dedicated Node.js Process)**:
   - Runs in a separate process/container.
   - Maintains continuous polling / Redis stream connections.
   - Enforces Meta Cloud API rate limits (e.g., 80 messages/second tier limits).
   - **Never run BullMQ workers inside Vercel serverless functions**, as Vercel kills background executions as soon as the HTTP response finishes.

### Running During Local Development
During local development, both systems run independently:
- **Terminal 1**: Express API Server (`npm run dev:backend` on port 5000)
- **Terminal 2**: React Vite Client (`npm run dev:frontend` on port 5173)
- **Terminal 3 (Phase 2+)**: BullMQ Campaign Worker CLI (`npm run worker:dev`)

---

## 5. Database Architecture: Pooled vs. Direct Connections

Supabase utilizes PostgreSQL with connection management handled by **Supavisor / PgBouncer**. This requires two distinct database URLs:

```
+-------------------------------------------------------------+
| Prisma Migration CLI (npx prisma migrate dev)                |
| ---> Requires DIRECT_URL (Port 5432, Session Mode)         |
|      Supports PostgreSQL advisory locks and DDL execution.  |
+-------------------------------------------------------------+

+-------------------------------------------------------------+
| Express API Application Queries (client.campaign.findMany) |
| ---> Requires DATABASE_URL (Port 6543, Transaction Mode)    |
|      Manages short-lived connection pools via PgBouncer.     |
+-------------------------------------------------------------+
```

### Prisma Configuration (`schema.prisma`):
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // Transaction pooler (Port 6543)
  directUrl = env("DIRECT_URL")     // Direct PostgreSQL connection (Port 5432)
}
```

---

## 6. Upstash Redis & BullMQ Conventions

Upstash provides managed Redis accessible over standard Redis protocols:
1. **TLS Protocol**: Must use `rediss://` (note the double 's' indicating SSL/TLS).
2. **BullMQ Requirements**:
   - `maxRetriesPerRequest: null` is mandatory for BullMQ to prevent connection timeouts when waiting for jobs.
   - `enableReadyCheck: false` is recommended for cloud/serverless Redis instances.
   - `tls: { rejectUnauthorized: true }` ensures secure encrypted communication.

---

## 7. Diagnostic Probes vs. Real-world Delivery

To maintain honest reporting, Grovastra explicitly distinguishes between 4 diagnostic tiers:

| Tier | Endpoint / Mechanism | Meaning | Phase 1 Requirement |
|---|---|---|---|
| **1. API Liveness** | `GET /api/v1/health` | The Node.js Express process is up and responding to HTTP requests. | Works 100% offline without any credentials configured. |
| **2. Dependency Readiness** | `GET /api/v1/ready` | Reports whether PostgreSQL and Redis are configured and reachable. | Honestly reports `not_configured` without throwing unhandled crashes. |
| **3. Database Connectivity** | `SELECT 1` via Prisma | Confirms that PostgreSQL credentials are valid and the network path is open. | Tested only when credentials are provided in `.env`. |
| **4. WhatsApp Delivery** | Meta Graph API Dispatch | Confirms that a template or message was accepted by Meta's WhatsApp servers. | Deferred to Phase 2. |

---

## 8. Security & Data Protection Principles

1. **Helmet**: Protects HTTP headers against clickjacking, XSS, and MIME-sniffing.
2. **Explicit CORS**: Restricts cross-origin resource sharing to `FRONTEND_ORIGIN`.
3. **Log Sanitization**: The custom logger inspects all log messages and redacts passwords, tokens, bearer tokens, connection strings, and webhook secrets.
4. **Zero Secrets in Git**: All `.env` files are ignored; only annotated `.env.example` templates are committed.
5. **No Frontend Secrets**: Database credentials and Meta app secrets are restricted to the backend and never exposed through Vite bundles.
