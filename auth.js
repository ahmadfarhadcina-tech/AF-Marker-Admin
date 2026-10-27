
import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
} from "./config.js";

// Authorized hosting
const ALLOWED_ORIGIN =
  "https://ahmadfarhadcina-tech.github.io";

const ALLOWED_PATH = "/AF-Marker-Admin/";

function checkAllowedDomain() {
  const validDomain =
    location.origin === ALLOWED_ORIGIN &&
    (
      location.pathname === "/AF-Marker-Admin" ||
      location.pathname.startsWith(ALLOWED_PATH)
    );

  if (!validDomain) {
    document.body.innerHTML = `
      <main style="font-family:sans-serif;padding:24px">
        <h2>Unauthorized Domain</h2>
        <p>You are not allowed to access this admin panel on this host.</p>
      </main>
    `;

    throw new Error("Unauthorized domain");
  }
}

checkAllowedDomain();

// Supabase client
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

// Authorized administrator ID
const ADMIN_ID =
  "f4052f3f-b32a-4eb7-a9f8-5b6e4c7ffc7c";

// Admin login
export async function signInAdmin(email, password) {
  const { data, error } =
    await supabase.auth.signInWithPassword({
      email,
      password
    });

  if (error) {
    throw error;
  }

  if (data.user?.id !== ADMIN_ID) {
    await supabase.auth.signOut();

    throw new Error(
      "Access denied: this account is not the authorized administrator."
    );
  }

  return data.user;
}

// Admin logout
export async function signOutAdmin() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}
