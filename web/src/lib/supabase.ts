import { createClient, type Session, type User } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
function publicKey(value: string | undefined): boolean {
  if (!value) return false;
  if (value.startsWith("sb_publishable_")) return true;
  try {
    return (
      JSON.parse(
        atob(value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      ).role === "anon"
    );
  } catch {
    return false;
  }
}
function validUrl(value: string | undefined): boolean {
  try {
    const parsed = new URL(value || "");
    return (
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(parsed.hostname))
    );
  } catch {
    return false;
  }
}

export const supabase =
  validUrl(url) && publicKey(key)
    ? createClient<Database>(url!, key!, {
        auth: {
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

/** Return to the same deployed base path, including GitHub Pages subdirectories. */
export function authRedirectUrl() {
  return new URL(window.location.pathname, window.location.origin).href;
}


/** Pin the request to its initiating account, even if the active login changes. */
export async function requestOwnProfile(
  session: Session,
  data?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<User> {
  if (!supabase || !url || !key) throw new Error("Account unavailable");
  const response = await fetch(new URL("auth/v1/user", `${url.replace(/\/$/, "")}/`), {
    method: data === undefined ? "GET" : "PUT",
    headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify({ data }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Profile request failed");
  const user = await response.json() as User;
  if (user.id !== session.user.id || !user.user_metadata || typeof user.user_metadata !== "object")
    throw new Error("Invalid profile response");
  return user;
}
