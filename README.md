# Brünel OS & Field Operations Platform (`app.bruenel.de` & `portal.bruenel.de`)

The centralized Enterprise Resource Planning (ERP), HR, and Field Operations software platform for **Brünel Deutschland UG (haftungsbeschränkt)**.

---

## Architectural Overview

The system operates across three primary domain tiers:
1. **Management Console (`app.bruenel.de`)**:
   - Access restricted to Tier 1–4 leadership (Owner, PM, HR/Finance, Team Leads).
   - Modules: Executive Command Center, Projects & Building Objects, HR & Workforce (with Candidate Dossiers), Inventory Ledger, Equipment & Fleet, Master Calendar, Accounting (DATEV export), Field Sales Commissioning, Legal Vault, BI Telemetry.
2. **Employee Field Portal PWA (`portal.bruenel.de`)**:
   - Mobile-first Progressive Web App for field technicians, installers, and subcontractors (Tier 5).
   - Features: Smart Check-In/Check-Out with pause break tracking, daily site assignments, vehicle/equipment selection, digital holiday/sickness requests, and monthly PDF payslips.
3. **Unified REST API Backend (`/api/v1/*`)**:
   - FastAPI high-performance asynchronous server.
   - Database: Cloud PostgreSQL (Neon Serverless DB) in production with SQLite local development fallback.

---

## Tech Stack

### Frontend (`frontend/`)
- **Framework**: React 18 / Vite
- **Routing**: `react-router-dom` (v6)
- **Styling**: Tailwind CSS & Glassmorphism design tokens
- **Icons**: Lucide React
- **PWA**: Mobile touch-optimized responsive layout

### Backend (`backend/`)
- **Framework**: FastAPI (Python 3.10+)
- **ORM**: SQLAlchemy 2.0
- **Database**: Neon Serverless PostgreSQL (`postgresql+pg8000`) / SQLite
- **Security**: OAuth2 with JWT tokens, PBKDF2/bcrypt hashing, RBAC (Role-Based Access Control Tiers 1–5), One-Time Passwords (OTP)
- **Deployment**: Vercel Serverless / Docker

---

## Database Schema & Clean State

The production database is hosted on **Neon PostgreSQL**:
- `users`: Authentication accounts with RBAC tiers (Tier 1 Owner to Tier 5 Field Employee).
- `employees`: Core workforce records (Active Staff, Freelancers, Subunternehmer, and Registered IT Candidates).
- `projects` & `objects`: FTTH rollout projects, clusters, and individual building units (WE).
- `time_logs`, `time_log_teams`, `time_log_vehicles`, `time_log_tools`: Shift telemetry, break times, and hardware custody tracking.
- `inventory_stock` & `material_transactions`: Stock balance ledger and checkout reconciliations.
- `equipment` & `vehicles`: Tool tracking, serials, and TÜV/inspection dates.
- `audit_logs`: Immutable security audit trail.

---

## Candidate Registration Flow

Public candidate registration for IT & Engineering Projects is handled on the main corporate website (`www.bruenel.de`):
- Candidates register via a 4-page wizard on `www.bruenel.de`.
- Submissions hit `/api/v1/hr/candidates/register` and are recorded in the HR database as `employment_type = 'Candidate'` (`BRN-CAND-xx`).
- HR & Management can inspect, evaluate, and convert candidates into active Employees, Freelancers, or Subcontractors directly in the **HR Management Module** (`/hr/employees`).

---

## Local Development Setup

### 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Deployment & Platform Setup

### Vercel Deployment

**Backend Environment Variables (on Vercel):**
| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql+pg8000://neondb_owner:...@...neon.tech/neondb` |
| `SECRET_KEY` | *(Strong random 64-char string for JWT token generation)* |
| `LOCAL_STORAGE_ROOT` | `/tmp/storage` (or AWS S3 credentials for document vault) |

**Frontend Environment Variables (on Vercel):**
| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://app.bruenel.de` |
