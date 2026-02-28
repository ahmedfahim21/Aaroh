# Merchant Onboarding Web App

Web UI for onboarding merchants: upload a catalogue (CSV or Excel) and merchant details; the server runs `onboard_merchant.py` and writes the UCP data package to `deploy/{merchant-slug}/`.

## Dev workflow

**Terminal 1 – backend** (from repo root; dependencies in root `pyproject.toml`)
```bash
cd merchant/backend
uv run --project ../.. uvicorn main:app --reload --port 8080
```

**Terminal 2 – frontend**
```bash
cd merchant/frontend
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend on port 8080.

## Backend

- `POST /api/onboard` – multipart form: `merchant_name`, `merchant_vpa`, `catalogue` (file). Saves the file (converting `.xlsx` to CSV if needed), then runs `onboard_merchant.py` from the repo root. Returns 200 with `{ "status": "ok", "merchant_name", "output_dir" }` or 422 with error detail.

## Frontend

- Single page: Merchant name, wallet, drag-and-drop catalogue upload. Submit sends the form to `/api/onboard` and shows success or error.
