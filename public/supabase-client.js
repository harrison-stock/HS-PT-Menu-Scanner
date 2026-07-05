// Uses the vendored UMD build at vendor/supabase-js.js (loaded as a plain
// <script> before this module, see index.html) rather than an external CDN —
// no build step here, and no third-party CDN as a runtime dependency.

// Separate Supabase project from the HS PT coaching app — Menu Scanner
// leads never mix with real training clients. Anon key is safe to expose
// client-side; access is governed entirely by Row Level Security.
const SUPABASE_URL = 'https://sjxoihkqmubrmkbrbxre.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqeG9paGtxbXVicm1rYnJieHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNDc1MTUsImV4cCI6MjA5ODcyMzUxNX0.YVELViL1l5ke7g5xgqGt2JOp6NohR544W1Mc7HftpY8';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
