import { loadEnv } from "vite";

const env = {
  ...loadEnv("production", process.cwd(), "VITE_"),
  ...process.env,
};
const url = env.VITE_SUPABASE_URL?.trim() ?? "";
const key = env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
if (!url && !key && !env.VERCEL) {
  console.log(
    "Supabase is not configured: building the local setup/demo screen only.",
  );
} else {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) {
    throw new Error(
      "Set VITE_SUPABASE_URL to your Supabase HTTPS project URL.",
    );
  }
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (!publicKey) {
    try {
      const claims = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      );
      publicKey = key.split(".").length === 3 && claims.role === "anon";
    } catch {
      /* Invalid keys must never be bundled. */
    }
  }
  if (!publicKey) {
    throw new Error(
      "Use a Supabase publishable/anon key. Missing keys, service_role and secret keys cannot be bundled.",
    );
  }
  console.log("Public Supabase build configuration validated.");
}
