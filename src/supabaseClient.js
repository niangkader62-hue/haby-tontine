import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://tgcltyibsorhotoiogeu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nD9KlhROSbf7L4JU3R70EA_DgrWOndL";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
