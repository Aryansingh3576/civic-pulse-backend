# CivicPulse — Deployment Guide

Deploy the **frontend** to **Vercel** and the **backend** to **Render**.

---

## Prerequisites

- A [GitHub](https://github.com) account with this repo pushed
- A [Vercel](https://vercel.com) account (free tier works)
- A [Render](https://render.com) account (free tier works)

---

## Part 1 — Deploy Backend to Render

### Step 1: Prepare the Backend

Make sure `package.json` has a `start` script (it already does):

```json
"scripts": {
  "start": "node server.js"
}
```

### Step 2: Create a `.gitignore` in `/backend`

```gitignore
node_modules/
.env
```

> [!IMPORTANT]
> Do **not** commit `.env` — you'll set environment variables in Render's dashboard.

### Step 3: Push to GitHub

Push the entire `Projectathon` repo (or just the `backend` folder as its own repo) to GitHub.

### Step 4: Create a Render Web Service

1. Go to [Render Dashboard](https://dashboard.render.com) → **New +** → **Web Service**
2. Connect your GitHub repo
3. Configure:

| Setting | Value |
|---|---|
| **Name** | `civicpulse-api` |
| **Region** | Oregon (US West) or nearest |
| **Root Directory** | `Projectathon/backend` |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | Free |

4. Under **Environment Variables**, add:

| Key | Value |
|---|---|
| `PORT` | `10000` (Render's default) |
| `JWT_SECRET` | `your-strong-secret-key-here` |
| `JWT_EXPIRES_IN` | `90d` |
| `NODE_ENV` | `production` |

5. Click **Create Web Service**

### Step 5: Note Your Backend URL

Once deployed, Render gives you a URL like:
```
https://civicpulse-api.onrender.com
```

Keep this — you'll need it for the frontend.

### SQLite on Render — Important Caveat

> [!CAUTION]
> Render's free tier uses an **ephemeral filesystem**. Your SQLite `database.sqlite` file will be **wiped on every redeploy or restart** (roughly every 15 minutes on free tier).
>
> **For a hackathon/demo**, this is fine — just re-seed data after deploys.
>
> **For production**, upgrade to a Render persistent disk ($7/mo) or migrate to PostgreSQL:
> - Use Render's free PostgreSQL database
> - Update `config/db.js` to use the `pg` package (already in `package.json`)
> - Set `DATABASE_URL` env var from Render's Postgres dashboard

---

## Part 2 — Deploy Frontend to Vercel

### Step 1: Create a `.env.local` (for local development reference)

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

> [!NOTE]
> This file is **not committed**. You'll set the production value in Vercel's dashboard.

### Step 2: Push to GitHub

Ensure the entire project is pushed. Vercel will detect the Next.js project inside `/frontend`.

### Step 3: Import Project in Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard) → **Add New** → **Project**
2. Import your GitHub repository
3. Configure:

| Setting | Value |
|---|---|
| **Framework Preset** | Next.js (auto-detected) |
| **Root Directory** | `Projectathon/frontend` |
| **Build Command** | `npm run build` (default) |
| **Output Directory** | `.next` (default) |
| **Install Command** | `npm install` (default) |

4. Under **Environment Variables**, add:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://civicpulse-api.onrender.com/api` |

> [!IMPORTANT]
> Replace the URL above with your **actual** Render backend URL from Part 1, Step 5. Don't forget the `/api` suffix.

5. Click **Deploy**

### Step 4: Verify

Once deployed, Vercel gives you a URL like:
```
https://civicpulse.vercel.app
```

Visit it and confirm:
- Landing page loads with the Midnight Glass theme
- Registration and login work
- Dashboard fetches and displays complaints
- Report submission works

---

## Part 3 — Connect Frontend ↔ Backend

### Update CORS on the Backend

In `server.js`, replace the open CORS with your specific Vercel domain:

```js
// Before (open to all)
app.use(cors());

// After (production)
app.use(cors({
  origin: [
    'https://civicpulse.vercel.app',    // your Vercel domain
    'http://localhost:3000',             // local dev
  ],
  credentials: true,
}));
```

Redeploy the backend after this change.

---

## Quick Reference

| Component | Platform | URL Pattern |
|---|---|---|
| Frontend | Vercel | `https://civicpulse.vercel.app` |
| Backend API | Render | `https://civicpulse-api.onrender.com/api` |

### Environment Variables Summary

**Render (Backend):**
| Variable | Example |
|---|---|
| `PORT` | `10000` |
| `JWT_SECRET` | `your-strong-secret-key` |
| `JWT_EXPIRES_IN` | `90d` |
| `NODE_ENV` | `production` |

**Vercel (Frontend):**
| Variable | Example |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://civicpulse-api.onrender.com/api` |

---

## Troubleshooting

| Issue | Fix |
|---|---|
| **CORS errors in browser** | Update `cors()` in `server.js` with your Vercel domain |
| **API returns 404** | Ensure `NEXT_PUBLIC_API_URL` ends with `/api` |
| **"Application error" on Render** | Check Render logs; ensure `PORT` env var is set |
| **SQLite data lost after redeploy** | Expected on free tier; use persistent disk or migrate to PostgreSQL |
| **Build fails on Vercel** | Run `npx tsc --noEmit` locally to catch type errors first |
| **Render app sleeps (slow first load)** | Free tier spins down after 15min of inactivity; first request takes ~30s |
