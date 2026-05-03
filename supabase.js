// ============================================================
// supabase.js — Commonality data layer
//
// Replaces the original window.storage (Claude artifact storage)
// with a real backend. All functions return camelCase JS objects
// and accept ms timestamps so the React UI doesn't have to change.
// ============================================================

import { createClient } from "@supabase/supabase-js";

// ----- 1. Paste your Supabase URL + anon key here -----
// Find them at: Supabase dashboard → Settings → API
// The anon key is meant to be public — safe to commit for a hackathon.
const SUPABASE_URL = "https://YOUR-PROJECT-ID.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY_HERE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
});

// Built-in moderator user id (matches schema.sql).
export const MODERATOR_USER_ID = "99999999-9999-9999-9999-999999999999";

// ============================================================
// MAPPERS — snake_case DB rows ↔ camelCase JS objects
// ============================================================
const toMs  = (v) => (v ? new Date(v).getTime() : null);
const toIso = (v) => (typeof v === "number" ? new Date(v).toISOString() : v);

const mapUserOut = (r) => r && ({
  id: r.id, handle: r.handle, createdAt: toMs(r.created_at),
  banned: r.banned, bannedAt: toMs(r.banned_at), bannedReason: r.banned_reason,
  reinstatedAt: toMs(r.reinstated_at),
  warnings: r.warnings || 0, role: r.role || "user",
  // Some legacy code reads .email — we don't store it, so surface a stub.
  email: `${(r.handle || "user").toLowerCase().replace(/\s+/g, ".")}@commonality.local`,
});

const mapMessageOut = (m) => m && ({
  id: m.id, from: m.from_user, text: m.text, warning: m.warning, at: toMs(m.at),
});

const mapChatOut = (r, messages = []) => r && ({
  id: r.id, matchId: r.match_id,
  participants: r.participants || [], handles: r.handles || {},
  shared: r.shared || [],
  revealKey: r.reveal_key, revealLabel: r.reveal_label, revealValues: r.reveal_values,
  unlocked: !!r.unlocked, unlockedAt: toMs(r.unlocked_at),
  readyConfirmed: r.ready_confirmed || {},
  endedBy: r.ended_by, endedAt: toMs(r.ended_at),
  savedBy: r.saved_by || [], createdAt: toMs(r.created_at),
  messages: (messages || []).map(mapMessageOut),
});

const mapReportOut = (r) => r && ({
  id: r.id, chatId: r.chat_id,
  reportedUser: r.reported_user, reportedBy: r.reported_by,
  reason: r.reason, severity: r.severity, excerpt: r.excerpt,
  sharedTraits: r.shared_traits || [],
  at: toMs(r.at), status: r.status,
  reviewedBy: r.reviewed_by, reviewedAt: toMs(r.reviewed_at),
  auditLog: (r.audit_log || []).map(a => ({
    ...a, at: typeof a.at === "string" ? toMs(a.at) : a.at,
  })),
});

// ============================================================
// USERS
// ============================================================
export const createUser = async (handle) => {
  const { data, error } = await supabase
    .from("users").insert({ handle }).select().single();
  if (error) throw error;
  return mapUserOut(data);
};

export const getUser = async (id) => {
  const { data } = await supabase
    .from("users").select("*").eq("id", id).maybeSingle();
  return mapUserOut(data);
};

export const updateUser = async (id, patch) => {
  const dbPatch = {};
  if ("handle"        in patch) dbPatch.handle         = patch.handle;
  if ("banned"        in patch) dbPatch.banned         = patch.banned;
  if ("bannedAt"      in patch) dbPatch.banned_at      = toIso(patch.bannedAt);
  if ("bannedReason"  in patch) dbPatch.banned_reason  = patch.bannedReason;
  if ("warnings"      in patch) dbPatch.warnings       = patch.warnings;
  if ("reinstatedAt"  in patch) dbPatch.reinstated_at  = toIso(patch.reinstatedAt);
  const { data } = await supabase
    .from("users").update(dbPatch).eq("id", id).select().single();
  return mapUserOut(data);
};

export const deleteUser = async (id) => {
  await supabase.from("users").delete().eq("id", id);
};

export const listUsers = async () => {
  const { data } = await supabase.from("users").select("*");
  return (data || []).map(mapUserOut);
};

export const listBannedUsers = async () => {
  const { data } = await supabase
    .from("users").select("*").eq("banned", true).neq("role", "moderator");
  return (data || []).map(mapUserOut);
};

// All users + their profiles in one shot — used by the matching screen.
export const listUsersWithProfiles = async () => {
  const [{ data: users }, { data: profiles }] = await Promise.all([
    supabase.from("users").select("*"),
    supabase.from("profiles").select("user_id, data"),
  ]);
  const profileMap = Object.fromEntries(
    (profiles || []).map(p => [p.user_id, p.data || {}])
  );
  return (users || []).map(u => ({
    user: mapUserOut(u), profile: profileMap[u.id] || {},
  }));
};

// ============================================================
// PROFILE
// ============================================================
export const getProfile = async (userId) => {
  const { data } = await supabase
    .from("profiles").select("data").eq("user_id", userId).maybeSingle();
  return data?.data || null;
};

export const setProfile = async (userId, profileData) => {
  await supabase.from("profiles").upsert({
    user_id: userId, data: profileData, updated_at: new Date().toISOString(),
  });
};

export const deleteProfile = async (userId) => {
  await supabase.from("profiles").delete().eq("user_id", userId);
};

// ============================================================
// SETTINGS
// ============================================================
export const getSettings = async (userId) => {
  const { data } = await supabase
    .from("settings").select("data").eq("user_id", userId).maybeSingle();
  return data?.data || null;
};

export const setSettings = async (userId, settingsData) => {
  await supabase.from("settings").upsert({ user_id: userId, data: settingsData });
};

export const deleteSettings = async (userId) => {
  await supabase.from("settings").delete().eq("user_id", userId);
};

// ============================================================
// BLOCKS
// ============================================================
export const getBlocks = async (userId) => {
  const { data } = await supabase
    .from("blocks").select("blocked").eq("blocker", userId);
  return (data || []).map(b => b.blocked);
};

export const addBlock = async (blocker, blocked) => {
  await supabase.from("blocks").upsert({ blocker, blocked });
};

export const removeBlock = async (blocker, blocked) => {
  await supabase.from("blocks").delete()
    .eq("blocker", blocker).eq("blocked", blocked);
};

export const removeAllBlocksFor = async (userId) => {
  await supabase.from("blocks").delete()
    .or(`blocker.eq.${userId},blocked.eq.${userId}`);
};

// ============================================================
// MATCHES
// ============================================================
export const getMatch = async (id) => {
  const { data } = await supabase
    .from("matches").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  return {
    id: data.id, a: data.user_a, b: data.user_b,
    shared: data.shared, futureCat: data.future_cat,
    proposedAt: toMs(data.proposed_at),
    aAgreed: data.a_agreed, bAgreed: data.b_agreed, bothAgreed: data.both_agreed,
  };
};

export const upsertMatch = async (m) => {
  await supabase.from("matches").upsert({
    id: m.id, user_a: m.a, user_b: m.b,
    shared: m.shared, future_cat: m.futureCat,
    proposed_at: toIso(m.proposedAt) || new Date().toISOString(),
    a_agreed: !!m.aAgreed, b_agreed: !!m.bAgreed, both_agreed: !!m.bothAgreed,
  });
};

// ============================================================
// CHATS
// ============================================================
export const getChat = async (id) => {
  const { data: row } = await supabase
    .from("chats").select("*").eq("id", id).maybeSingle();
  if (!row) return null;
  const { data: msgs } = await supabase
    .from("messages").select("*").eq("chat_id", id).order("at", { ascending: true });
  return mapChatOut(row, msgs || []);
};

export const createChat = async (chat) => {
  const dbChat = {
    id: chat.id, match_id: chat.matchId,
    participants: chat.participants, handles: chat.handles,
    shared: chat.shared,
    reveal_key: chat.revealKey, reveal_label: chat.revealLabel,
    reveal_values: chat.revealValues,
    unlocked: !!chat.unlocked,
    ready_confirmed: chat.readyConfirmed || {},
    saved_by: chat.savedBy || [],
    created_at: toIso(chat.createdAt) || new Date().toISOString(),
  };
  await supabase.from("chats").upsert(dbChat);
};

export const updateChat = async (id, patch) => {
  const dbPatch = {};
  if ("unlocked"        in patch) dbPatch.unlocked        = !!patch.unlocked;
  if ("unlockedAt"      in patch) dbPatch.unlocked_at     = toIso(patch.unlockedAt);
  if ("readyConfirmed"  in patch) dbPatch.ready_confirmed = patch.readyConfirmed;
  if ("endedBy"         in patch) dbPatch.ended_by        = patch.endedBy;
  if ("endedAt"         in patch) dbPatch.ended_at        = toIso(patch.endedAt);
  if ("savedBy"         in patch) dbPatch.saved_by        = patch.savedBy;
  await supabase.from("chats").update(dbPatch).eq("id", id);
};

export const listChatsFor = async (userId) => {
  const { data } = await supabase
    .from("chats").select("*").contains("participants", [userId]);
  if (!data) return [];
  // Fetch the last message per chat so the saved-chats screen can show a preview.
  const ids = data.map(c => c.id);
  let lastByChat = {};
  if (ids.length) {
    const { data: msgs } = await supabase
      .from("messages").select("*").in("chat_id", ids).order("at", { ascending: false });
    (msgs || []).forEach(m => {
      if (!lastByChat[m.chat_id]) lastByChat[m.chat_id] = [m];
    });
  }
  // Order all messages oldest→newest for compatibility with existing UI.
  return data.map(c => mapChatOut(c, lastByChat[c.id] || []));
};

// ============================================================
// MESSAGES
// ============================================================
export const sendMessage = async (chatId, fromUser, text, warning) => {
  const { data, error } = await supabase.from("messages").insert({
    chat_id: chatId, from_user: fromUser, text, warning: warning || null,
  }).select().single();
  if (error) throw error;
  return mapMessageOut(data);
};

export const listMessages = async (chatId) => {
  const { data } = await supabase
    .from("messages").select("*").eq("chat_id", chatId).order("at", { ascending: true });
  return (data || []).map(mapMessageOut);
};

// ============================================================
// REPORTS
// ============================================================
export const createReport = async (r) => {
  await supabase.from("reports").upsert({
    id: r.id, chat_id: r.chatId,
    reported_user: r.reportedUser, reported_by: r.reportedBy,
    reason: r.reason, severity: r.severity, excerpt: r.excerpt,
    shared_traits: r.sharedTraits || [],
    at: toIso(r.at) || new Date().toISOString(),
    status: r.status || "pending",
    audit_log: r.auditLog || [],
  });
};

export const updateReport = async (id, patch) => {
  const dbPatch = {};
  if ("status"      in patch) dbPatch.status       = patch.status;
  if ("reviewedBy"  in patch) dbPatch.reviewed_by  = patch.reviewedBy;
  if ("reviewedAt"  in patch) dbPatch.reviewed_at  = toIso(patch.reviewedAt);
  if ("auditLog"    in patch) dbPatch.audit_log    = patch.auditLog;
  await supabase.from("reports").update(dbPatch).eq("id", id);
};

export const listReports = async () => {
  const { data } = await supabase
    .from("reports").select("*").order("at", { ascending: false });
  return (data || []).map(mapReportOut);
};

export const getReport = async (id) => {
  const { data } = await supabase
    .from("reports").select("*").eq("id", id).maybeSingle();
  return mapReportOut(data);
};

export const listReportsForUser = async (userId) => {
  const { data } = await supabase
    .from("reports").select("*").eq("reported_user", userId);
  return (data || []).map(mapReportOut);
};

// ============================================================
// REALTIME — replaces the old setInterval polling
// ============================================================
//
// Subscribes to BOTH chat metadata UPDATEs and new message INSERTs.
// Returns a cleanup function. Call it in useEffect's return.
//
export const subscribeToChat = (chatId, onChatUpdate, onNewMessage) => {
  const channel = supabase
    .channel(`chat-${chatId}`)
    .on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "chats", filter: `id=eq.${chatId}` },
      (payload) => onChatUpdate?.(mapChatOut(payload.new)))
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
      (payload) => onNewMessage?.(mapMessageOut(payload.new)))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
};

// Subscribe to all chat-table changes; the caller filters by participation.
export const subscribeToUserChats = (userId, onChange) => {
  const channel = supabase
    .channel(`user-chats-${userId}`)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "chats" },
      (payload) => {
        const row = payload.new || payload.old;
        if (row?.participants?.includes(userId)) onChange?.(payload);
      })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
};

// ============================================================
// BULK CLEANUP — called from "Clear all conversations" / "Delete account"
// ============================================================
export const deleteAllChatsFor = async (userId) => {
  const { data } = await supabase
    .from("chats").select("id").contains("participants", [userId]);
  const ids = (data || []).map(c => c.id);
  if (ids.length) {
    // Cascade deletes messages.
    await supabase.from("chats").delete().in("id", ids);
  }
  return ids.length;
};

export const wipeUser = async (userId) => {
  // The CASCADE FK rules clean up profiles, settings, blocks, messages.
  // We need to manually delete chats the user participated in (since
  // participants is an array, not a FK).
  await deleteAllChatsFor(userId);
  await supabase.from("users").delete().eq("id", userId);
};
