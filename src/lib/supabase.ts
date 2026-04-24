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
