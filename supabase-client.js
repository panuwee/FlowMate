const SUPABASE_URL = "https://jbavahimqjalvcfawgqw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiYXZhaGltcWphbHZjZmF3Z3F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MzEwNDksImV4cCI6MjA5NDQwNzA0OX0.0kokmbZ1WCPPQwYIXG4xu_OgU9S8ci34EEWeNZ2LFkA";

if (!window.supabase) {
  console.error("[FlowMate Supabase] Supabase CDN failed to load.");
  window.flowmateSupabaseLoadError = "Supabase library failed to load. Check internet/CDN access.";
} else {
  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
  );

  window.flowmateSupabase = supabase;
}
