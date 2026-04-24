import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/supabase';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and run `supabase start`.',
  );
}

export const supabase: SupabaseClient<Database> = createClient<Database>(url, anonKey);

// TODO(phase 3): auth — replace the hardcoded stub sign-in with a real sign-up /
// sign-in UI. The seeded stub user (scripts/gen-seed.ts) carries LOCAL_PARENT_ID
// as its uuid, so every seeded row's owner_id matches auth.uid() and RLS
// passes unmodified once real users replace the stub.
const STUB_EMAIL = 'stub@talrum.local';
const STUB_PASSWORD = 'stub-password-dev-only';

export const ensureStubSession = async (): Promise<void> => {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  const { error } = await supabase.auth.signInWithPassword({
    email: STUB_EMAIL,
    password: STUB_PASSWORD,
  });
  if (error) throw error;
};
