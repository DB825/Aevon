// ─── Clerk configuration ──────────────────────────────────────────────────────
// 1. Go to https://dashboard.clerk.com → Create application
// 2. Enable Google as a sign-in option (Configure → Social connections → Google)
// 3. Copy your Publishable Key from Dashboard → API Keys
//    Starts with "pk_test_..." (dev) or "pk_live_..." (production)
// 4. Add your Vercel domain to allowed origins:
//    Dashboard → Domains → Add domain (e.g. aevon-gamma.vercel.app)
//
// Required Vercel environment variables (Settings → Environment Variables):
//   CLERK_SECRET_KEY         — from Clerk Dashboard → API Keys → Secret keys
//   FIREBASE_PROJECT_ID      — from Firebase service account JSON
//   FIREBASE_CLIENT_EMAIL    — from Firebase service account JSON
//   FIREBASE_PRIVATE_KEY     — from Firebase service account JSON (keep newlines as \n)
//
// Firebase service account: Firebase Console → Project Settings → Service Accounts
//   → Generate new private key → download JSON → copy the three values above
// ─────────────────────────────────────────────────────────────────────────────

const CLERK_PUBLISHABLE_KEY = "pk_test_am9pbnQtYnVsbGZyb2ctNDEuY2xlcmsuYWNjb3VudHMuZGV2JA";
