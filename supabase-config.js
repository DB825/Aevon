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

const SUPABASE_URL      = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
