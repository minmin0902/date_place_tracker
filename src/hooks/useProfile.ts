import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/database.types";
import { useAuth } from "./useAuth";
import { useCouple } from "./useCouple";

const ALLOW_NO_AUTH = import.meta.env.VITE_ALLOW_NO_AUTH === "true";

// localDb shim for VITE_ALLOW_NO_AUTH mode — keeps profile data in
// memory so devs running without Supabase can still poke the UI.
type LocalProfileMap = Record<string, Profile>;
const LOCAL_STORE_KEY = "localdb:profiles:v1";

function readLocalStore(): LocalProfileMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_STORE_KEY);
    return raw ? (JSON.parse(raw) as LocalProfileMap) : {};
  } catch {
    return {};
  }
}

function writeLocalStore(next: LocalProfileMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors — profile is convenience-only in local mode.
  }
}

function emptyProfile(userId: string): Profile {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    nickname: null,
    partner_nickname: null,
    avatar_url: null,
    bio: null,
    hate_ingredients: [],
    created_at: now,
    updated_at: now,
  };
}

// Read a single profile by user_id. Returns a fresh empty Profile
// when the row doesn't exist yet so callers don't have to handle null —
// the form just renders blank fields and the upsert promotes the row.
export function useProfile(userId: string | undefined) {
  if (ALLOW_NO_AUTH) {
    return useQuery({
      queryKey: ["profile", userId],
      enabled: !!userId,
      queryFn: async (): Promise<Profile> => {
        const store = readLocalStore();
        return store[userId!] ?? emptyProfile(userId!);
      },
    });
  }
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId!)
        .limit(1);
      if (error) throw error;
      return (data && data[0]) ?? emptyProfile(userId!);
    },
  });
}

// Convenience: returns BOTH partner profiles in one call so the
// settings page can render a dual-card without two query invocations.
export function useCoupleProfiles() {
  const { user } = useAuth();
  const { data: couple } = useCouple();
  const myId = user?.id;
  const partnerId = couple
    ? couple.user1_id === myId
      ? couple.user2_id
      : couple.user1_id
    : null;
  const me = useProfile(myId);
  const partner = useProfile(partnerId ?? undefined);
  return {
    me,
    partner,
    myId: myId ?? null,
    partnerId: partnerId ?? null,
  };
}

// Upload an avatar image into the 'avatars' bucket under the caller's
// own user_id folder (matching the RLS policy in the migration), and
// return the public URL the profile row should store. Reads as a tiny
// data URL in ALLOW_NO_AUTH mode so local-dev demos don't need the
// real storage bucket configured.
export async function uploadAvatar(
  file: File,
  userId: string
): Promise<string> {
  if (ALLOW_NO_AUTH) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
  const ext = file.name.split(".").pop() ?? "jpg";
  // Store under user_id/<random>.ext so the RLS folder check
  // ((storage.foldername(name))[1] = auth.uid()::text) holds.
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

// Convenience selector: resolved display labels for the current
// viewer ("me") and the partner. Used everywhere a UI label says
// "나" / "我" / "짝꿍" / "宝宝" so those placeholders flip to the
// actual names the couple has set.
//   me — my own nickname → "나"
//   partner — partner_nickname I set on my row → partner's own
//             nickname → "짝꿍"
export function useDisplayNames(): {
  myDisplay: string;
  partnerDisplay: string;
} {
  const { me, partner } = useCoupleProfiles();
  const myDisplay = me.data?.nickname?.trim() || "나";
  const partnerDisplay =
    me.data?.partner_nickname?.trim() ||
    partner.data?.nickname?.trim() ||
    "짝꿍";
  return { myDisplay, partnerDisplay };
}

// Resolve any user_id → their OWN profile nickname + avatar. Used by
// the notification inbox so the row reads with the name the actor
// chose for themselves, not whatever pet name the recipient may have
// set in their own partner_nickname.
//
// Different from useMemoAuthor: that one routes through the
// "me/partner" perspective and prefers partner_nickname for the
// partner case. For notifications we want the canonical self-set
// name regardless of viewer.
export function useActorDisplay(userId: string | null | undefined): {
  name: string;
  avatarUrl: string | null;
} {
  const profile = useProfile(userId ?? undefined);
  return {
    name: profile.data?.nickname?.trim() || "宝宝",
    avatarUrl: profile.data?.avatar_url ?? null,
  };
}

// Resolve a memo's author into the bits the comment-style render needs:
// display name, avatar, and a peach/rose tone for visual continuity
// with the rest of the app (peach = me, rose = partner).
//   - Matches my user id  → my profile name + avatar
//   - Matches partner id  → partner's name + avatar
//   - null / unknown      → fall back to the partner. Legacy memos
//     (written before memo_author_id existed) get backfilled to the
//     partner's id by the migration, but the null path stays a safety
//     net for any row the backfill might have missed.
export function useMemoAuthor(authorId: string | null | undefined): {
  name: string;
  avatarUrl: string | null;
  tone: "peach" | "rose";
} {
  const { me, partner, myId, partnerId } = useCoupleProfiles();
  const { myDisplay, partnerDisplay } = useDisplayNames();
  if (authorId && authorId === myId) {
    return {
      name: myDisplay,
      avatarUrl: me.data?.avatar_url ?? null,
      tone: "peach",
    };
  }
  if (!authorId || authorId === partnerId) {
    return {
      name: partnerDisplay,
      avatarUrl: partner.data?.avatar_url ?? null,
      tone: "rose",
    };
  }
  return { name: "?", avatarUrl: null, tone: "rose" };
}

export function useUpsertProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();
  if (ALLOW_NO_AUTH) {
    return useMutation({
      mutationFn: async (patch: Partial<Profile>) => {
        if (!user) throw new Error("not signed in");
        const store = readLocalStore();
        const prev = store[user.id] ?? emptyProfile(user.id);
        const next: Profile = {
          ...prev,
          ...patch,
          user_id: user.id,
          updated_at: new Date().toISOString(),
        };
        writeLocalStore({ ...store, [user.id]: next });
        return next;
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ["profile", user?.id] });
      },
    });
  }
  return useMutation({
    mutationFn: async (patch: Partial<Profile>) => {
      if (!user) throw new Error("not signed in");
      // Upsert on user_id PK. We only ever write our own row, RLS
      // enforces that on the server too.
      const { data, error } = await supabase
        .from("profiles")
        .upsert(
          { user_id: user.id, ...patch },
          { onConflict: "user_id" }
        )
        .select()
        .limit(1);
      if (error) throw error;
      return (data && data[0]) ?? null;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
  });
}
