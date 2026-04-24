export const PLACE_CATEGORIES = [
  "korean",
  "japanese",
  "chinese",
  "italian",
  "western",
  "mexican",
  "thai",
  "vietnamese",
  "indian",
  "cafe",
  "bakery",
  "brunch",
  "dessert",
  "bar",
  "other",
] as const;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

// Central emoji map — used wherever we render a category badge so one
// source updates every surface at once.
export const CATEGORY_EMOJI: Record<string, string> = {
  korean: "🍚",
  japanese: "🍣",
  chinese: "🥟",
  italian: "🍝",
  western: "🍔",
  mexican: "🌮",
  thai: "🍜",
  vietnamese: "🍲",
  indian: "🍛",
  cafe: "☕",
  bakery: "🥐",
  brunch: "🥞",
  dessert: "🍰",
  bar: "🍷",
  other: "🍽️",
  // food categories
  main: "🍽️",
  side: "🥗",
  drink: "🥤",
};

export function categoryEmojiOf(key: string | null | undefined): string {
  if (!key) return "🍽️";
  return CATEGORY_EMOJI[key] ?? "🍽️";
}

export function isKnownPlaceCategory(s: string | null | undefined): boolean {
  return !!s && (PLACE_CATEGORIES as readonly string[]).includes(s);
}

export const FOOD_CATEGORIES = [
  "main",
  "side",
  "dessert",
  "drink",
  "other",
] as const;

export type FoodCategory = (typeof FOOD_CATEGORIES)[number];
