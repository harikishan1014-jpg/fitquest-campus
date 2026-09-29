import { createClient } from "@supabase/supabase-js";
import { supabaseCredentials, supabaseConfigured } from "./supabaseConfig";

export { supabaseConfigured };
export const supabase = supabaseCredentials
  ? createClient(supabaseCredentials.url, supabaseCredentials.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
