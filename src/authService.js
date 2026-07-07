import { supabase } from "./supabaseClient";

const telToEmail = (tel) => tel.replace(/[^\d]/g, "") + "@kolo.local";
const pinToPassword = (pin) => `k${pin}Kolo!`;

export async function registerUser(tel, pin, prenom, photoUrl) {
  const email = telToEmail(tel);
  const password = pinToPassword(pin);

  const { data: authData, error: authErr } = await supabase.auth.signUp({ email, password });
  if (authErr) {
    if (authErr.message.includes("already registered") || authErr.message.includes("already been registered")) {
      return { ok: false, err: "Ce numéro est déjà inscrit. Connecte-toi !" };
    }
    return { ok: false, err: "Erreur d'inscription. Réessaie." };
  }

  const userId = authData.user.id;
  const { error: profileErr } = await supabase.from("users").insert({
    id: userId,
    prenom,
    telephone: tel.replace(/\s/g, ""),
    pin_hash: "supabase_auth",
    photo_url: photoUrl || null,
    plan: "free",
  });
  if (profileErr) return { ok: false, err: "Erreur de création de profil." };

  return { ok: true, user: { id: userId, prenom, tel, photo: photoUrl, plan: "free" } };
}

export async function loginUser(tel, pin) {
  const email = telToEmail(tel);
  const password = pinToPassword(pin);

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, err: "Numéro ou PIN incorrect." };

  const { data: profile, error: pErr } = await supabase
    .from("users")
    .select("*")
    .eq("id", data.user.id)
    .single();
  if (pErr || !profile) return { ok: false, err: "Profil introuvable." };

  return {
    ok: true,
    user: { id: profile.id, prenom: profile.prenom, tel: profile.telephone, photo: profile.photo_url, plan: profile.plan },
  };
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const { data: profile } = await supabase.from("users").select("*").eq("id", data.session.user.id).single();
  if (!profile) return null;
  return { id: profile.id, prenom: profile.prenom, tel: profile.telephone, photo: profile.photo_url, plan: profile.plan };
}

export async function logoutUser() {
  await supabase.auth.signOut();
}
