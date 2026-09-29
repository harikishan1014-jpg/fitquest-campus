import { existsSync, readFileSync } from "node:fs";

const envText = existsSync(".env.production") ? readFileSync(".env.production", "utf8") : "";
const fileEnv = Object.fromEntries(
  envText.split(/\r?\n/).map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((match) => [match[1], match[2].replace(/^['"]|['"]$/g, "")]),
);
const env = { ...fileEnv, ...process.env };
const failures = [];

for (const name of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]) {
  if (!env[name]) failures.push(`${name} is missing; set it in .env.production or the deployment build environment`);
}
if (env.VITE_SUPABASE_URL) {
  try {
    const url = new URL(env.VITE_SUPABASE_URL);
    if (url.protocol !== "https:") failures.push("VITE_SUPABASE_URL must use HTTPS in production");
    if (url.hostname === "localhost" || url.hostname.endsWith(".local")) failures.push("VITE_SUPABASE_URL must point to the hosted production project");
  } catch {
    failures.push("VITE_SUPABASE_URL is not a valid URL");
  }
}
if (env.VITE_SUPABASE_ANON_KEY) {
  const key = env.VITE_SUPABASE_ANON_KEY;
  let role = "";
  try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")).role ?? ""; } catch {}
  if (key.toLowerCase().includes("service_role") || role === "service_role") failures.push("VITE_SUPABASE_ANON_KEY must never contain a service-role key");
}
for (const file of [
  "supabase/schema.sql",
  "public/models/pose_landmarker_lite.task",
  "public/mediapipe/wasm/vision_wasm_internal.js",
  "public/mediapipe/wasm/vision_wasm_internal.wasm",
  "dist/index.html",
  "dist/models/pose_landmarker_lite.task",
  "dist/mediapipe/wasm/vision_wasm_internal.js",
  "dist/mediapipe/wasm/vision_wasm_internal.wasm",
]) {
  if (!existsSync(file)) failures.push(`Required launch asset is missing: ${file}`);
}

if (failures.length) {
  console.error("Launch check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("Set the public Supabase URL and anon key locally or in your host's build environment, apply supabase/schema.sql, then rerun this check.");
  process.exitCode = 1;
} else {
  console.log("Launch check passed: production Supabase configuration and required camera/build assets are present.");
}
