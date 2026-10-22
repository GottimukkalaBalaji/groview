# Grovastra

> Reelo-inspired WhatsApp Campaign Management Platform built for high-conversion marketing automation, intelligent audience segmentation, and reliable message queue dispatch.

[![Node.js](https://img.shields.io/badge/Node.js-v24.x-339933?logo=node.js)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-v4.21-000000?logo=express)](https://expressjs.com)
[![React](https://img.shields.io/badge/React-v18.3-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-v5.7-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-v6.1-646CFF?logo=vite)](https://vitejs.dev)
[![Prisma](https://img.shields.io/badge/Prisma-v6.4-2D3748?logo=prisma)](https://prisma.io)

---

## Phase 1: Project Setup and Architecture Foundation

This repository contains the completed **Phase 1** foundation for **Grovastra**.

### What Is Implemented in Phase 1:
- **Clean Monorepo Structure**: Separate `backend/` and `frontend/` workspaces managed cleanly via npm workspaces.
- **Express Backend with TypeScript**:
  - Versioned API router at `/api/v1`
  - Zero-dependency Liveness probe at `GET /api/v1/health`
  - Honest dependency Readiness probe at `GET /api/v1/ready`
  - Centralized error handling and operational error hierarchy (`AppError`)
  - Standardized 404 handler for unmatched routes
  - Helmet security headers and environment-driven CORS configuration
  - Sanitized logging redacting passwords, tokens, and sensitive headers
  - Zod request validation infrastructure
- **Prisma & Supabase Preparation**:
  - Pooled connection (`DATABASE_URL`, port 6543) and direct connection (`DIRECT_URL`, port 5432) support
  - Minimal `SystemMeta` model and graceful client lifecycle management
- **BullMQ & Upstash Redis Preparation**:
  - Documented worker architecture with TLS (`rediss://`) and `maxRetriesPerRequest: null` configuration
- **React + Vite Frontend Application**:
  - Full application shell branded with **Grovastra**
  - Modern dark mode theme with glassmorphism, fluid typography, and custom CSS design tokens
  - Reusable API client connecting to `http://localhost:5000/api/v1` by default
  - Live health and readiness diagnostic widget with reactive connection polling
- **API Testing Suite**:
  - Automated tests using **Vitest** and **Supertest**
  - Zero-secret **Postman** collection and local environment configuration
- **Comprehensive Documentation**:
  - [System Architecture](file:///docs/architecture.md)
  - [Local Development Guide](file:///docs/local-development.md)

---

## Repository Structure

```
grovastra/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma         # Minimal Prisma schema for Supabase PostgreSQL
│   ├── src/
│   │   ├── config/               # Env validation, Prisma singleton, Upstash Redis
│   │   ├── controllers/          # Route controller handlers
│   │   ├── middleware/           # Helmet, CORS, logger, 404, centralized error handler
│   │   ├── routes/               # Modular Express routes (/api/v1)
│   │   ├── services/             # Health and readiness diagnostic services
│   │   ├── tests/                # Vitest & Supertest automated tests
│   │   ├── types/                # Standardized API response contracts
│   │   ├── utils/                # Sanitized logger, AppError classes, response helpers
│   │   ├── app.ts                # Express app setup and middleware pipeline
│   │   └── server.ts             # Server startup and graceful shutdown
│   ├── .env.example              # Backend environment template
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── public/                   # Static assets & Grovastra SVG favicon
│   ├── src/
│   │   ├── components/           # Sidebar, Header, HealthStatusCard, SummaryCards
│   │   ├── pages/                # DashboardPage view
│   │   ├── services/             # Type-safe API client (VITE_API_BASE_URL)
│   │   ├── types/                # API contracts and state definitions
│   │   ├── App.tsx               # Root application shell
│   │   ├── index.css             # Vanilla CSS design system & glassmorphism tokens
│   │   └── main.tsx              # React bootstrap entry point
│   ├── .env.example              # Frontend environment template
│   ├── index.html                # Grovastra title, meta description & Google Fonts
│   ├── package.json
│   └── vite.config.ts
├── docs/
│   ├── architecture.md           # Mermaid diagram, subsystem isolation, security model
│   └── local-development.md      # Detailed developer setup guide
├── postman/
│   ├── collection.json           # Postman test collection with assertions
│   └── local-environment.json    # Local environment variables (zero secrets)
├── .editorconfig
├── .gitignore
├── package.json                  # Root monorepo scripts
└── README.md
```

---

## Quick Start (Windows)

### 1. Prerequisites
- Node.js `v20.x` or later (tested on `v24.11.1`)
- npm `v10.x` or later (tested on `11.6.2`)

### 2. Install Dependencies
```powershell
npm install
```

### 3. Generate Local Environment Files
```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

### 4. Start Development Servers

Open two terminal windows:

**Terminal 1 (Backend API):**
```powershell
npm run dev:backend
```
Server runs at `http://localhost:5000`  
Liveness: `http://localhost:5000/api/v1/health`  
Readiness: `http://localhost:5000/api/v1/ready`  

**Terminal 2 (Frontend Dashboard):**
```powershell
npm run dev:frontend
```
Client runs at `http://localhost:5173`

---

## Verification Commands

Run the full verification suite across the codebase:

```powershell
# Run automated tests
npm run test:backend

# Run linting
npm run lint

# Build for production
npm run build
```

---

## Postman API Testing

1. Open Postman -> **Import** -> Select `postman/collection.json` and `postman/local-environment.json`.
2. Choose **Grovastra Local Environment**.
3. Run the collection:
   - `GET /health` -> HTTP 200, status `healthy`
   - `GET /ready` -> HTTP 200/503, honest diagnostic reporting
   - `GET /unknown-test-endpoint` -> HTTP 404, standard error payload

---

## Scope & Next Steps

Phase 1 establishes the architecture and project setup. Features intentionally deferred to subsequent phases:
- **Phase 2**: Meta WhatsApp Cloud API credentials configuration, template syncing, BullMQ campaign job queue, and local worker process.
- **Phase 3**: Supabase PostgreSQL business schema (Contacts, Audiences, Custom Attributes) and CSV audience import.
- **Phase 4**: Campaign authoring UI, message personalization tags, and schedule triggers.
- **Phase 5**: Webhook delivery receipts (`sent`, `delivered`, `read`, `failed`) and conversion analytics.
