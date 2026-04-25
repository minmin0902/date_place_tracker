export const PLACE_CATEGORIES = [
  "korean",
  "japanese",
  "chinese",
  "thai",
  "vietnamese",
  "indian",
  "italian",
  "western",
  "french",
  "spanish",
  "mexican",
  "peruvian",
  "middle_eastern",
  "cafe",
  "bakery",
  "brunch",
  "dessert",
  "bar",
  "fastfood",
  "other",
] as const;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

// Hierarchy used by the timeline filter dropdown. Each group renders
// as a native <optgroup>; keys still flow flat through the rest of
// the app so existing data + filter logic doesn't need to change.
export const CATEGORY_GROUPS: {
  ko: string;
  zh: string;
  keys: PlaceCategory[];
}[] = [
  {
    ko: "🌏 아시안",
    zh: "亚洲",
    keys: ["korean", "japanese", "chinese", "thai", "vietnamese", "indian"],
  },
  {
    ko: "🍝 양식",
    zh: "西餐",
    keys: ["italian", "western", "french", "spanish"],
  },
  {
    ko: "🌮 라틴/이국적",
    zh: "拉美/异域",
    keys: ["mexican", "peruvian", "middle_eastern"],
  },
  {
    ko: "☕ 카페·디저트",
    zh: "咖啡甜品",
    keys: ["cafe", "bakery", "brunch", "dessert"],
  },
  {
    ko: "🍻 술/패스트",
    zh: "酒水/快餐",
    keys: ["bar", "fastfood"],
  },
  {
    ko: "🍽️ 기타",
    zh: "其他",
    keys: ["other"],
  },
];

// Central emoji map — used wherever we render a category badge so one
// source updates every surface at once.
export const CATEGORY_EMOJI: Record<string, string> = {
  korean: "🍚",
  japanese: "🍣",
  chinese: "🥟",
  italian: "🍝",
  western: "🍔",
  french: "🥖",
  spanish: "🥘",
  mexican: "🌮",
  peruvian: "🐟",
  middle_eastern: "🥙",
  thai: "🍜",
  vietnamese: "🍲",
  indian: "🍛",
  cafe: "☕",
  bakery: "🥐",
  brunch: "🥞",
  dessert: "🍰",
  bar: "🍷",
  fastfood: "🍟",
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
