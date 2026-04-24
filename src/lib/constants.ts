export const PLACE_CATEGORIES = [
  "korean",
  "japanese",
  "chinese",
  "western",
  "cafe",
  "dessert",
  "bar",
  "other",
] as const;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export const FOOD_CATEGORIES = [
  "main",
  "side",
  "dessert",
  "drink",
  "other",
] as const;

export type FoodCategory = (typeof FOOD_CATEGORIES)[number];
