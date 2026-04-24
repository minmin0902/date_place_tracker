import type { Couple, Place, Food } from "./database.types";

type LocalDB = {
  couples: Couple[];
  places: Place[];
  foods: Food[];
  photos: Record<string, string>; // path -> dataURL
};

const KEY = "local_db_v1";

function load(): LocalDB {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) throw new Error("no db");
    return JSON.parse(raw) as LocalDB;
  } catch {
    const db: LocalDB = { couples: [], places: [], foods: [], photos: {} };
    save(db);
    return db;
  }
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
  // attach foods
  return places.map((p) => ({ ...p }));
}

export function getPlace(id: string) {
  const db = load();
  const p = db.places.find((x) => x.id === id) ?? null;
  return p;
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
    photo_url: input.values.photo_url ?? null,
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
  save(db);
  return dataUrl;
}
