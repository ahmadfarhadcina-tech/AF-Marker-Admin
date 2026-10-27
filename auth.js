
import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
} from "./config.js";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

export async function signInAdmin(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;

  if (data.user?.id !== "f4052f3f-b32a-4eb7-a9f8-5b6e4c7ffc7c") {
    await supabase.auth.signOut();
    throw new Error("Access denied: this account is not the authorized administrator.");
  }

  return data.user;
}

export async function signOutAdmin() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
