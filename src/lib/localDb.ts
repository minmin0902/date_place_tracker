import type {
  Couple,
  Place,
  Food,
  Memo,
  WishlistPlace,
} from "./database.types";

type LocalDB = {
  couples: Couple[];
  places: Place[];
  foods: Food[];
  memos: Memo[];
  wishlist: WishlistPlace[];
  photos: Record<string, string>; // path -> dataURL
};

// Pre-seeded couple for local no-auth dev: both partners are pinned so the app
// skips LoginPage and CoupleSetupPage on first load.
export const LOCAL_USER_1_EMAIL = "mjjy0902@gmail.com";
export const LOCAL_USER_2_EMAIL = "luoyuhan2025@gmail.com";

// Bump the storage key whenever the seed shape changes so stale dev data from
// an earlier version gets discarded automatically.
const KEY = "local_db_v7";

// Fixed ids so the seed is idempotent across reloads.
const SEED_COUPLE_ID = "seed-couple-1";
const SEED_PLACE_ID = "seed-place-daves-coffee";

function load(): LocalDB {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) throw new Error("no db");
    return JSON.parse(raw) as LocalDB;
  } catch {
    const db = makeSeedDb();
    save(db);
    return db;
  }
}

function makeSeedDb(): LocalDB {
  const now = new Date().toISOString();
  const couple: Couple = {
    id: SEED_COUPLE_ID,
    user1_id: LOCAL_USER_1_EMAIL,
    user2_id: LOCAL_USER_2_EMAIL,
    invite_code: "LOCAL1",
    created_at: now,
  } as Couple;

  const place: Place = {
    id: SEED_PLACE_ID,
    name: "Dave's Coffee",
    date_visited: "2026-04-24",
    address: "341 Wayland Ave, Providence, RI 02906, USA",
    category: "cafe",
    memo: null,
    want_to_revisit: true,
    photo_urls: null,
    latitude: 41.8236,
    longitude: -71.4002,
    created_by: LOCAL_USER_1_EMAIL,
    couple_id: SEED_COUPLE_ID,
    created_at: now,
    updated_at: now,
  } as Place;

  const mkFood = (name: string, my: number, partner: number): Food =>
    ({
      id: crypto.randomUUID(),
      place_id: SEED_PLACE_ID,
      name,
      my_rating: my,
      partner_rating: partner,
      category: null,
      memo: null,
      photo_url: null,
      photo_urls: null,
      created_at: now,
    }) as Food;

  return {
    couples: [couple],
    places: [place],
    foods: [
      mkFood("avocado toast", 3.8, 4),
      mkFood("Prosciutto & ham & cheese", 3.6, 4),
      mkFood("Pistachio & ube latte", 3.8, 4.5),
      mkFood("iced americano", 3.6, 1),
    ],
    wishlist: [],
    memos: [],
    photos: {},
  };
}

function save(db: LocalDB) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export function getCoupleByUserId(userId: string): Couple | null {
  const db = load();
  return (
    db.couples.find((c) => c.user1_id === userId || c.user2_id === userId) ?? null
  );
}

export function createCouple(user1_id: string): Couple {
  const db = load();
  const id = crypto.randomUUID();
  const invite_code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const couple: Couple = {
    id,
    user1_id,
    user2_id: null,
    invite_code,
    created_at: new Date().toISOString(),
  } as Couple;
  db.couples.push(couple);
  save(db);
  return couple;
}

export function joinCoupleByCode(code: string, userId: string): Couple {
  const db = load();
  const c = db.couples.find((x) => x.invite_code === code);
  if (!c) throw new Error("invalid code");
  if (!c.user2_id) c.user2_id = userId;
  save(db);
  return c;
}

export function getPlaces(coupleId: string) {
  const db = load();
  const places = db.places
    .filter((p) => p.couple_id === coupleId)
    .sort((a, b) => (a.date_visited < b.date_visited ? 1 : -1));
  return places.map((p) => ({
    ...p,
    foods: db.foods.filter((f) => f.place_id === p.id),
  }));
}

export function getPlace(id: string) {
  const db = load();
  const p = db.places.find((x) => x.id === id);
  if (!p) return null;
  return { ...p, foods: db.foods.filter((f) => f.place_id === p.id) };
}

export function upsertPlace(input: any) {
  const db = load();
  if (input.id) {
    const idx = db.places.findIndex((p) => p.id === input.id);
    if (idx === -1) throw new Error("not found");
    db.places[idx] = { ...db.places[idx], ...input.values, updated_at: new Date().toISOString() };
    save(db);
    return db.places[idx];
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const place: Place = {
    id,
    name: input.values.name,
    date_visited: input.values.date_visited,
    address: input.values.address ?? null,
    category: input.values.category ?? null,
    memo: input.values.memo ?? null,
    memo_author_id: input.values.memo_author_id ?? null,
    memo_updated_at: input.values.memo_updated_at ?? null,
    want_to_revisit: !!input.values.want_to_revisit,
    photo_urls: input.values.photo_urls ?? null,
    latitude: input.values.latitude ?? null,
    longitude: input.values.longitude ?? null,
    created_by: input.userId,
    couple_id: input.coupleId,
    created_at: now,
    updated_at: now,
  } as Place;
  db.places.push(place);
  save(db);
  return place;
}

export function deletePlace(id: string) {
  const db = load();
  db.places = db.places.filter((p) => p.id !== id);
  db.foods = db.foods.filter((f) => f.place_id !== id);
  save(db);
}

export function upsertFood(input: any) {
  const db = load();
  if (input.id) {
    const idx = db.foods.findIndex((f) => f.id === input.id);
    if (idx === -1) throw new Error("not found");
    db.foods[idx] = { ...db.foods[idx], ...input.values };
    save(db);
    return db.foods[idx];
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const food: Food = {
    id,
    place_id: input.place_id,
    name: input.values.name,
    my_rating: input.values.my_rating ?? null,
    partner_rating: input.values.partner_rating ?? null,
    category: input.values.category ?? null,
    memo: input.values.memo ?? null,
    memo_author_id: input.values.memo_author_id ?? null,
    memo_updated_at: input.values.memo_updated_at ?? null,
    photo_url: input.values.photo_url ?? null,
    photo_urls: input.values.photo_urls ?? null,
    created_at: now,
  } as Food;
  db.foods.push(food);
  save(db);
  return food;
}

export function deleteFood(id: string) {
  const db = load();
  db.foods = db.foods.filter((f) => f.id !== id);
  save(db);
}

export function getWishlist(coupleId: string): WishlistPlace[] {
  const db = load();
  return (db.wishlist ?? [])
    .filter((w) => w.couple_id === coupleId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function addWishlist(input: {
  coupleId: string;
  userId: string;
  name: string;
  category: string | null;
  memo: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}): WishlistPlace {
  const db = load();
  const item: WishlistPlace = {
    id: crypto.randomUUID(),
    couple_id: input.coupleId,
    name: input.name,
    category: input.category,
    memo: input.memo,
    address: input.address,
    latitude: input.latitude,
    longitude: input.longitude,
    created_by: input.userId,
    created_at: new Date().toISOString(),
  };
  db.wishlist = [...(db.wishlist ?? []), item];
  save(db);
  return item;
}

export function deleteWishlist(id: string) {
  const db = load();
  db.wishlist = (db.wishlist ?? []).filter((w) => w.id !== id);
  save(db);
}

export function getWishlistItem(id: string): WishlistPlace | null {
  const db = load();
  return (db.wishlist ?? []).find((w) => w.id === id) ?? null;
}

export async function uploadPhoto(file: File, coupleId: string): Promise<string> {
  const reader = new FileReader();
  const dataUrl: string = await new Promise((res, rej) => {
    reader.onload = () => res(reader.result as string);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
  const path = `${coupleId}/${crypto.randomUUID()}`;
  const db = load();
  db.photos[path] = dataUrl;
  try {
    save(db);
  } catch (e: unknown) {
    // localStorage is typically ~5-10MB — a single phone photo can exceed
    // that. Surface a clear message so the UI can show the user why.
    const isQuota =
      e instanceof DOMException &&
      (e.name === "QuotaExceededError" || e.code === 22);
    if (isQuota) {
      throw new Error(
        "사진이 너무 커서 브라우저 저장소에 안 들어가요. 더 작은 사진으로 시도하거나, Supabase 모드로 배포된 사이트에서 올려주세요."
      );
    }
    throw e;
  }
  return dataUrl;
}

// ---------------------------------------------------------------
// Memos thread (extra memos partners add from the detail page).
// localDb-only mirror of the memos table; same shape as the DB row.
// ---------------------------------------------------------------

export function getMemos(filter: {
  placeId?: string;
  foodId?: string;
}): Memo[] {
  const db = load();
  const all = db.memos ?? [];
  return all
    .filter((m) =>
      filter.placeId ? m.place_id === filter.placeId : m.food_id === filter.foodId
    )
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

export function addMemo(input: {
  coupleId: string;
  placeId?: string | null;
  foodId?: string | null;
  authorId: string;
  body: string;
  photoUrls?: string[] | null;
}): Memo {
  const db = load();
  const now = new Date().toISOString();
  const memo: Memo = {
    id: crypto.randomUUID(),
    couple_id: input.coupleId,
    place_id: input.placeId ?? null,
    food_id: input.foodId ?? null,
    author_id: input.authorId,
    body: input.body,
    photo_urls: input.photoUrls?.length ? input.photoUrls : null,
    created_at: now,
    updated_at: now,
  };
  db.memos = [...(db.memos ?? []), memo];
  save(db);
  return memo;
}

export function deleteMemo(id: string) {
  const db = load();
  db.memos = (db.memos ?? []).filter((m) => m.id !== id);
  save(db);
}
