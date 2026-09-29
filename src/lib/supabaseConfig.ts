const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

function validBrowserConfig() {
  if (!url || !anonKey || anonKey.toLowerCase().includes("service_role") || anonKey.startsWith("sb_secret_")) return false;
  try {
    const parsed = new URL(url);
    const secure = parsed.protocol === "https:" || (parsed.protocol === "http:" && parsed.hostname === "localhost");
    if (!secure) return false;
    const payload = anonKey.split(".")[1];
    if (payload) {
      const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
      if (claims.role === "service_role") return false;
    }
    return true;
  } catch { return false; }
}

export const supabaseConfigured = validBrowserConfig();
export const supabaseCredentials = supabaseConfigured && url && anonKey ? { url, anonKey } : null;
