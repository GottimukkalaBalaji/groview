# Grovastra Local Development Guide

This guide provides step-by-step instructions for running, testing, and debugging **Grovastra** locally on Windows.

---

## 1. Prerequisites

- **Operating System**: Windows 10/11 (PowerShell or Command Prompt)
- **Node.js**: `v20.x` or later (tested on `v24.11.1`)
- **npm**: `v10.x` or later (tested on `11.6.2`)
- **Git**: Installed and configured
- **Postman**: (Optional) For API verification

Verify your runtime versions:
```powershell
node -v
npm -v
```

---

## 2. Initial Setup

### Step 1: Install Dependencies
From the repository root, install dependencies across the entire monorepo workspaces:
```powershell
npm install
```

### Step 2: Environment Configuration (.env files)

#### Backend Configuration:
In PowerShell:
```powershell
Copy-Item backend\.env.example backend\.env
```
Or in Windows Command Prompt:
```cmd
copy backend\.env.example backend\.env
```

#### Frontend Configuration:
In PowerShell:
```powershell
Copy-Item frontend\.env.example frontend\.env
```
Or in Windows Command Prompt:
```cmd
copy frontend\.env.example frontend\.env
```

> [!NOTE]
> In Phase 1, **no external credentials are required** to start the app or run the automated test suite. The system runs out-of-the-box with built-in fallbacks.

---

## 3. Running Frontend and Backend in Separate Terminals

### Terminal 1: Backend API Server
Start the Express server in development mode (with hot-reloading via `tsx`):
```powershell
npm run dev:backend
```
- **Port**: `5000`
- **Liveness URL**: `http://localhost:5000/api/v1/health`
- **Readiness URL**: `http://localhost:5000/api/v1/ready`

### Terminal 2: Frontend Web App
Start Vite development server:
```powershell
npm run dev:frontend
```
- **Port**: `5173`
- **Local URL**: `http://localhost:5173`

---

## 4. How Cloud Supabase Works with a Local Node.js Backend

Even though you are developing locally on your Windows machine, the database is hosted in the cloud on **Supabase**:
1. When your backend starts, it establishes an outbound TLS connection over port `6543` (PgBouncer pooler) or port `5432` (direct).
2. Because it is an outbound connection, you do **not** need to open firewall ports or configure port forwarding on your local router.
3. To obtain your Supabase connection strings:
   - Log in to [Supabase Console](https://supabase.com/dashboard).
   - Select your project -> **Project Settings** -> **Database**.
   - Under **Connection string**, select **URI**.
   - Copy the **Transaction** connection string into `DATABASE_URL`.
   - Copy the **Session** (or direct) connection string into `DIRECT_URL`.
   - Replace `[YOUR-PASSWORD]` with your database password.

---

## 5. Testing the API with Postman

1. Open Postman.
2. Click **Import** in the top left corner.
3. Select the files in the `postman/` directory:
   - `postman/collection.json`
   - `postman/local-environment.json`
4. Select the **Grovastra Local Environment** from the environment dropdown in Postman.
5. Execute the collection:
   - `GET /health`: Expects `200 OK`, `status: "healthy"`.
   - `GET /ready`: Expects `200 OK` or `503`, with honest breakdown of database and redis connections.
   - `GET /unknown-test-endpoint`: Expects `404 Not Found` with standardized JSON error structure.

---

## 6. Automated Testing, Linting & Type Checking

Run all test suites locally:
```powershell
# Run backend tests via Vitest
npm run test:backend

# Run ESLint checks
npm run lint

# Build both frontend and backend for production
npm run build
```

---

## 7. Troubleshooting & Common Issues

### Issue 1: Port 5000 Already in Use
If another process is using port 5000:
1. In PowerShell, find the process ID:
   ```powershell
   Get-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess
   ```
2. Terminate the process:
   ```powershell
   Stop-Process -Id <PID> -Force
   ```
3. Or change `PORT=5001` in `backend/.env` and `VITE_API_BASE_URL=http://localhost:5001/api/v1` in `frontend/.env`.

### Issue 2: Prisma Client Generation
If `@prisma/client` types need to be refreshed:
```powershell
npm --workspace=backend run prisma:generate
```

### Issue 3: Upstash Redis Connection Timeout
- Ensure your `REDIS_URL` begins with `rediss://` (with two 's's for TLS).
- Ensure `maxRetriesPerRequest: null` is present in the BullMQ options.

---

## 8. Feature Phase Scope Matrix

| Feature | Phase 1 (Current) | Phase 2 | Phase 3 | Phase 4+ |
|---|:---:|:---:|:---:|:---:|
| Monorepo Architecture | Active | Active | Active | Active |
| Liveness & Readiness Probes | Active | Active | Active | Active |
| Frontend Dashboard Shell | Active | Active | Active | Active |
| Postman Diagnostic Suite | Active | Active | Active | Active |
| WhatsApp Cloud API Sending | Deferred | Active | Active | Active |
| BullMQ Queue Dispatch Worker| Prepared | Active | Active | Active |
| Audience Contacts Management| Deferred | Deferred | Active | Active |
| Real-time Webhook Ingestion | Deferred | Active | Active | Active |
