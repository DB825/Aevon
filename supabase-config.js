// ─── Supabase configuration ───────────────────────────────────────────────────
// 1. Go to https://supabase.com → New project
// 2. Project Settings → API → copy Project URL and anon/public key below
// 3. Run this SQL in Supabase → SQL Editor:
//
//    create table if not exists sessions (
//      id          text primary key,
//      user_id     text not null,
//      mode        text not null,
//      note        text not null default '',
//      duration    bigint not null,
//      started_at  text not null,
//      ended_at    text not null,
//      day         text not null,
//      hour        integer not null,
//      created_at  timestamptz not null default now()
//    );
//
//    alter table sessions enable row level security;
//
//    create policy "users_own_sessions" on sessions
//      for all
//      using  ((auth.jwt() ->> 'sub') = user_id)
//      with check ((auth.jwt() ->> 'sub') = user_id);
//
// 4. Connect Clerk → Supabase:
//    Supabase → Authentication → Sign In Methods → Third Party Auth → Add → Clerk
//    Paste your Clerk domain: https://YOUR-CLERK-DOMAIN.clerk.accounts.dev
//    (decode the middle part of your publishable key from base64 to find it)
//
// Both values below are safe to commit — security is enforced by row-level security.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = "https://pxxrguzgpvrkhlflacsb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4eHJndXpncHZya2hsZmxhY3NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyOTEwMzcsImV4cCI6MjA5MTg2NzAzN30.dNs0h6qq5dMQPCurV_nn6zJsDyikb3WPWoPTDTFj5x4";
