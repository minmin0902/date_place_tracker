import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, RotateCcw, X } from "lucide-react";
import { CATEGORY_GROUPS, categoryEmojiOf } from "@/lib/constants";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { pickLanguage } from "@/lib/language";

// One unified bottom-sheet that hosts all three timeline filters
// (정렬 / 도시 / 카테고리). Replaces the previous 3-trigger grid where
// each dropdown opened its own modal — users had to tap "open / pick /
// close" three times. This sheet shows every section at once and
// commits state on tap so the parent can react instantly.
//
// Picker UX is chip-based (taps toggle) per the spec, with category
// group headers acting as bulk-select for their child cuisines.

export type SortValue =
  | "date"
  | "dateAsc"
  | "scoreDesc"
  | "scoreAsc";

const SORT_CHIPS: { value: SortValue; ko: string; zh: string; emoji: string }[] = [
  { value: "date", emoji: "🕘", ko: "최근순", zh: "最新打卡" },
  { value: "dateAsc", emoji: "📅", ko: "오래된순", zh: "最早打卡" },
  { value: "scoreDesc", emoji: "⭐", ko: "별점 높은순", zh: "评分高到低" },
  { value: "scoreAsc", emoji: "🥄", ko: "별점 낮은순", zh: "评分低到高" },
];

export function FilterSheet({
  open,
  onClose,
  viewMode,
  onChangeViewMode,
  allCities,
  selectedCities,
  onChangeSelectedCities,
  categoryFilter,
  onChangeCategoryFilter,
  customCategoryStrings,
  hasUncategorized,
  showFoodCategory = false,
  foodCategoryFilter,
  onChangeFoodCategoryFilter,
  onResetAll,
  hasAnyActive,
}: {
  open: boolean;
  onClose: () => void;
  viewMode: SortValue;
  onChangeViewMode: (v: SortValue) => void;
  allCities: string[];
  selectedCities: string[];
  onChangeSelectedCities: (v: string[]) => void;
  categoryFilter: string[];
  onChangeCategoryFilter: (v: string[]) => void;
  // Freeform user-typed categories collected from places, shown in
  // their own trailing group inside the sheet.
  customCategoryStrings: string[];
  // Whether the timeline has any uncategorized place — toggles the
  // "❓ 미분류" sentinel chip on the category row.
  hasUncategorized: boolean;
  // Show the per-food category section. HomePage flips this on only
  // while the menu layout is active — the per-place layouts can't
  // filter on food category meaningfully (one place has multiple).
  showFoodCategory?: boolean;
  foodCategoryFilter?: string[];
  onChangeFoodCategoryFilter?: (v: string[]) => void;
  onResetAll: () => void;
  // Lets the parent disable the reset link when no filter is set.
  hasAnyActive: boolean;
}) {
  const { t, i18n } = useTranslation();
  const pick = (ko: string, zh: string) =>
    pickLanguage(i18n.language, ko, zh);
  // Collapsed by default so the sheet doesn't open as a wall of chips.
  // Auto-expand when the section already has an active selection so
  // users land directly on what they've configured. State seeds from
  // the active flags AT MOUNT TIME — toggling the chip-row open after
  // that is purely user-controlled (we don't snap it shut on every
  // selection change).
  const [citiesOpen, setCitiesOpen] = useState(selectedCities.length > 0);
  const [categoriesOpen, setCategoriesOpen] = useState(
    categoryFilter.length > 0
  );
  const [foodCategoriesOpen, setFoodCategoriesOpen] = useState(
    (foodCategoryFilter?.length ?? 0) > 0
  );
  // Re-seed when the sheet itself reopens — previous session's open
  // state can leak weirdly if the sheet was closed mid-flow.
  useEffect(() => {
    if (open) {
      setCitiesOpen(selectedCities.length > 0);
      setCategoriesOpen(categoryFilter.length > 0);
      setFoodCategoriesOpen((foodCategoryFilter?.length ?? 0) > 0);
    }
    // Only when `open` flips on; selection deps would re-collapse the
    // section the user just opened to interact with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // Lock body scroll while open so swiping inside the sheet doesn't
  // accidentally scroll the timeline behind it.
  useBodyScrollLock(open);

  function toggleCity(city: string) {
    if (selectedCities.includes(city)) {
      onChangeSelectedCities(selectedCities.filter((c) => c !== city));
    } else {
      onChangeSelectedCities([...selectedCities, city]);
    }
  }

  function toggleCategory(value: string) {
    if (categoryFilter.includes(value)) {
      onChangeCategoryFilter(categoryFilter.filter((c) => c !== value));
    } else {
      onChangeCategoryFilter([...categoryFilter, value]);
    }
  }

  function toggleCategoryGroup(keys: readonly string[]) {
    const set = new Set(keys);
    const allOn = keys.every((k) => categoryFilter.includes(k));
    if (allOn) {
      // Drop every member of the group from the selection.
      onChangeCategoryFilter(categoryFilter.filter((c) => !set.has(c)));
    } else {
      const merged = new Set(categoryFilter);
      for (const k of keys) merged.add(k);
      onChangeCategoryFilter([...merged]);
    }
  }

  // Pre-compute which built-in keys are covered by the dropdown so we
  // can find any leftover freeform tags from prior selections (kept
  // visible in 직접 입력 group so the user can deselect them).
  const knownBuiltInKeys = useMemo(() => {
    const set = new Set<string>();
    for (const g of CATEGORY_GROUPS) {
      for (const k of g.keys) set.add(k);
    }
    return set;
  }, []);

  const customsToShow = useMemo(() => {
    const set = new Set<string>(customCategoryStrings);
    for (const v of categoryFilter) {
      if (
        v !== "__none__" &&
        !knownBuiltInKeys.has(v as never)
      ) {
        set.add(v);
      }
    }
    return [...set].sort();
  }, [customCategoryStrings, categoryFilter, knownBuiltInKeys]);

  if (!open) return null;

  return createPortal(
    // Same iOS-friendly modal pattern we landed on for GroupedMultiSelect:
    // outer flex container sized to dvh + items-center across breakpoints,
    // card max-h capped by svh so the bottom action bar (저장) stays
    // inside the visible area regardless of URL bar / home indicator.
    // items-end was burning chrome zone on iPhone — see CLAUDE.md.
    <div
      className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-3"
      style={{ height: "100dvh" }}
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-2xl flex flex-col shadow-xl border border-cream-200 overflow-hidden"
        style={{ maxHeight: "min(78svh, 600px)" }}
        onClick={(e) => e.stopPropagation()}
      >

        <div className="flex items-center justify-between px-4 py-3 border-b border-cream-100 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="font-black text-ink-900 text-[15px] break-keep">
              {pick("상세 필터", "详细筛选")}
            </h3>
            <p className="text-[11px] text-ink-500 break-keep">
              {pick("정렬·도시·카테고리 한 번에", "一处搞定")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-cream-100 transition flex-shrink-0"
            aria-label="close"
          >
            <X className="w-4 h-4 text-ink-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* ----- 정렬 (single-select chips) ----- */}
          <section>
            <h4 className="text-[11px] font-black text-ink-600 mb-2 break-keep flex items-center gap-1.5">
              <span>🔀</span>
              {pick("정렬", "排序")}
            </h4>
            <div className="flex flex-wrap gap-1">
              {SORT_CHIPS.map((c) => {
                const active = viewMode === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => onChangeViewMode(c.value)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold transition border break-keep ${
                      active
                        ? "bg-peach-100 text-peach-600 border-peach-300 shadow-sm"
                        : "bg-white text-ink-500 border-cream-200/80 hover:bg-cream-50"
                    }`}
                  >
                    <span>{c.emoji}</span>
                    {pick(c.ko, c.zh)}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ----- 도시 (collapsible multi-select chips) ----- */}
          <section>
            <button
              type="button"
              onClick={() => setCitiesOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 rounded-xl border border-cream-200/70 bg-cream-50/70 px-3 py-2 text-[12px] font-bold text-ink-700 mb-2 break-keep"
            >
              <span className="inline-flex items-center gap-1.5">
                <span>📍</span>
                {pick("도시", "城市")}
                {selectedCities.length > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-peach-100 text-peach-600 text-[10px] font-number font-bold">
                    {selectedCities.length}
                  </span>
                )}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-ink-400 transition-transform ${
                  citiesOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {citiesOpen && (
              <>
                {selectedCities.length > 0 && (
                  <div className="flex justify-end mb-2">
                    <button
                      type="button"
                      onClick={() => onChangeSelectedCities([])}
                      className="text-[10px] font-bold text-ink-400 hover:text-rose-500 transition"
                    >
                      {pick("전체 해제", "清空")}
                    </button>
                  </div>
                )}
                {allCities.length === 0 ? (
                  <p className="text-[11px] text-ink-400 px-1">
                    {pick("아직 도시가 없어요", "还没有可选城市")}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {allCities.map((city) => {
                      const active = selectedCities.includes(city);
                      return (
                        <button
                          key={city}
                          type="button"
                          onClick={() => toggleCity(city)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold transition border break-keep ${
                            active
                              ? "bg-peach-100 text-peach-600 border-peach-300 shadow-sm"
                              : "bg-white text-ink-500 border-cream-200/80 hover:bg-cream-50"
                          }`}
                        >
                          📍 {city}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>

          {/* ----- 카테고리 (collapsible multi-select w/ group rollup) ----- */}
          <section>
            <button
              type="button"
              onClick={() => setCategoriesOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 rounded-xl border border-cream-200/70 bg-cream-50/70 px-3 py-2 text-[12px] font-bold text-ink-700 mb-2 break-keep"
            >
              <span className="inline-flex items-center gap-1.5">
                <span>🍽️</span>
                {pick("카테고리", "类别")}
                {categoryFilter.length > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-rose-100 text-rose-600 text-[10px] font-number font-bold">
                    {categoryFilter.length}
                  </span>
                )}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-ink-400 transition-transform ${
                  categoriesOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {categoriesOpen && (
              <>
                {categoryFilter.length > 0 && (
                  <div className="flex justify-end mb-2">
                    <button
                      type="button"
                      onClick={() => onChangeCategoryFilter([])}
                      className="text-[10px] font-bold text-ink-400 hover:text-rose-500 transition"
                    >
                      {pick("전체 해제", "清空")}
                    </button>
                  </div>
                )}

                {hasUncategorized && (
              <div className="mb-2">
                <button
                  type="button"
                  onClick={() => toggleCategory("__none__")}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold transition border break-keep ${
                    categoryFilter.includes("__none__")
                      ? "bg-amber-100 text-amber-700 border-amber-300 shadow-sm"
                      : "bg-white text-ink-500 border-cream-200/80 hover:bg-cream-50"
                  }`}
                >
                  ❓ {pick("카테고리 미설정", "未分类")}
                </button>
              </div>
            )}

            <div className="space-y-2">
              {CATEGORY_GROUPS.map((g) => {
                const allOn = g.keys.every((k) =>
                  categoryFilter.includes(k)
                );
                const anyOn = g.keys.some((k) => categoryFilter.includes(k));
                const headerState: "on" | "partial" | "off" = allOn
                  ? "on"
                  : anyOn
                    ? "partial"
                    : "off";
                return (
                  <div
                    key={g.ko}
                    className="rounded-xl border border-cream-200/70 bg-white px-2.5 py-2"
                  >
                    {/* Group header doubles as a bulk-toggle. tri-
                        state visualization lets the user see "some of
                        my asian options are picked, tap to fill". */}
                    <button
                      type="button"
                      onClick={() => toggleCategoryGroup(g.keys)}
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold transition border break-keep mb-1.5 ${
                        headerState === "on"
                          ? "bg-peach-100 text-peach-600 border-peach-300"
                          : headerState === "partial"
                            ? "bg-peach-50 text-peach-500 border-peach-200"
                            : "bg-white text-ink-700 border-cream-200/80 hover:bg-cream-50"
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full border-[1.5px] inline-flex items-center justify-center text-[8px] font-bold leading-none">
                        {headerState === "on"
                          ? "✓"
                          : headerState === "partial"
                            ? "−"
                            : ""}
                      </span>
                      {pick(g.ko, `${g.ko.split(" ")[0]} ${g.zh}`)}
                    </button>
                    <div className="flex flex-wrap gap-1">
                      {g.keys.map((k) => {
                        const active = categoryFilter.includes(k);
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => toggleCategory(k)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition border break-keep ${
                              active
                                ? "bg-rose-100 text-rose-600 border-rose-300 shadow-sm"
                                : "bg-white text-ink-500 border-cream-200/80 hover:bg-cream-50"
                            }`}
                          >
                            <span>{categoryEmojiOf(k)}</span>
                            {/* i18n returns the active-locale label.
                                Group header right above already shows
                                the bilingual context (e.g. "🌏 아시안 ·
                                亚洲"), so the chip can stay compact. */}
                            {t(`category.${k}`)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Custom user-typed categories — kept visible so the
                  user can deselect freeform tags they no longer want. */}
              {customsToShow.length > 0 && (
                <div className="rounded-xl border border-cream-200/70 bg-white px-2.5 py-2">
                  <p className="text-[11px] font-bold text-ink-700 mb-2 break-keep">
                    ✏️ {pick("직접 입력", "自定义")}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {customsToShow.map((c) => {
                      const active = categoryFilter.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleCategory(c)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition border break-keep ${
                            active
                              ? "bg-rose-100 text-rose-600 border-rose-300 shadow-sm"
                              : "bg-white text-ink-500 border-cream-200/80 hover:bg-cream-50"
                          }`}
                        >
                          {categoryEmojiOf(c)} {c}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
              </>
            )}
          </section>

          {/* ----- 메뉴 카테고리 (menu layout only) ----- */}
          {showFoodCategory &&
            foodCategoryFilter &&
            onChangeFoodCategoryFilter && (
              <FoodCategorySection
                t={t}
                language={i18n.language}
                value={foodCategoryFilter}
                onChange={onChangeFoodCategoryFilter}
                open={foodCategoriesOpen}
                onToggleOpen={() => setFoodCategoriesOpen((v) => !v)}
              />
            )}
        </div>

        <div className="border-t border-cream-100 px-4 py-2.5 flex items-center justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onResetAll}
            disabled={!hasAnyActive}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink-500 hover:text-ink-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {pick("전체 초기화", "重置全部")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-ink-900 text-white rounded-xl text-[13px] font-bold hover:bg-ink-700 transition"
          >
            {pick("저장", "保存")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Food category structure for the filter: flat top-level chips for
// the standalone categories (메인 / 사이드 / 디저트 / 기타) and a
// 음료 group containing the two drink subtypes (음료수 / 술). Mirrors
// the FoodFormPage picker shape so the filter and the form match
// visually + share the "음료 group" semantics.
type FoodFilterEntry =
  | { kind: "flat"; key: string }
  | { kind: "group"; labelKo: string; labelZh: string; emoji: string; keys: string[] };
const FOOD_FILTER_LAYOUT: FoodFilterEntry[] = [
  { kind: "flat", key: "main" },
  { kind: "flat", key: "side" },
  { kind: "flat", key: "dessert" },
  {
    kind: "group",
    labelKo: "음료",
    labelZh: "饮料",
    emoji: "🥂",
    keys: ["drink", "liquor"],
  },
  { kind: "flat", key: "other" },
];

// Per-food category section. Surfaced only in menu layout (HomePage
// gates via showFoodCategory). Place categories use CATEGORY_GROUPS
// for tri-state bulk-toggling; food gets the same treatment via
// FOOD_FILTER_LAYOUT so users can tap "🥂 음료" to grab 음료수 + 술
// at once.
function FoodCategorySection({
  t,
  language,
  value,
  onChange,
  open,
  onToggleOpen,
}: {
  t: (key: string) => string;
  language: string;
  value: string[];
  onChange: (v: string[]) => void;
  open: boolean;
  onToggleOpen: () => void;
}) {
  const pick = (ko: string, zh: string) => pickLanguage(language, ko, zh);

  function toggle(key: string) {
    if (value.includes(key)) onChange(value.filter((k) => k !== key));
    else onChange([...value, key]);
  }
  function toggleGroup(keys: string[]) {
    const allOn = keys.every((k) => value.includes(k));
    if (allOn) {
      const set = new Set(keys);
      onChange(value.filter((k) => !set.has(k)));
    } else {
      const merged = new Set(value);
      for (const k of keys) merged.add(k);
      onChange([...merged]);
    }
  }
  return (
    <section>
      <button
        type="button"
        onClick={onToggleOpen}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-cream-200/70 bg-cream-50/70 px-3 py-2 text-[12px] font-bold text-ink-700 mb-2 break-keep"
      >
        <span className="inline-flex items-center gap-1.5">
          <span>🍽️</span>
          {pick("메뉴 카테고리", "菜品类别")}
          {value.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-rose-100 text-rose-600 text-[10px] font-number font-bold">
              {value.length}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-ink-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <>
          {value.length > 0 && (
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[10px] font-bold text-ink-400 hover:text-rose-500 transition"
              >
                {pick("전체 해제", "清空")}
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {FOOD_FILTER_LAYOUT.filter((e) => e.kind === "flat").map((e) => {
              if (e.kind !== "flat") return null;
              const active = value.includes(e.key);
              return (
                <button
                  key={e.key}
                  type="button"
                  onClick={() => toggle(e.key)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold transition border break-keep ${
                    active
                      ? "bg-rose-100 text-rose-600 border-rose-300 shadow-sm"
                      : "bg-white text-ink-500 border-cream-200/80 hover:bg-cream-50"
                  }`}
                >
                  <span>{categoryEmojiOf(e.key)}</span>
                  {t(`category.${e.key}`)}
                </button>
              );
            })}
          </div>

          {/* Drink group — placed below the flat chips. Same tri-state
              bulk-toggle pattern the place category groups use. */}
          {FOOD_FILTER_LAYOUT.filter((e) => e.kind === "group").map((e) => {
            if (e.kind !== "group") return null;
            const allOn = e.keys.every((k) => value.includes(k));
            const anyOn = e.keys.some((k) => value.includes(k));
            const headerState: "on" | "partial" | "off" = allOn
              ? "on"
              : anyOn
                ? "partial"
                : "off";
            return (
              <div
                key={e.labelKo}
                className="mt-2 rounded-xl border border-cream-200/70 bg-white px-2.5 py-2"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(e.keys)}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold transition border break-keep mb-1.5 ${
                    headerState === "on"
                      ? "bg-peach-100 text-peach-600 border-peach-300"
                      : headerState === "partial"
                        ? "bg-peach-50 text-peach-500 border-peach-200"
                        : "bg-white text-ink-700 border-cream-200/80 hover:bg-cream-50"
                  }`}
                >
                  <span className="w-3 h-3 rounded-full border-[1.5px] inline-flex items-center justify-center text-[8px] font-bold leading-none">
                    {headerState === "on"
                      ? "✓"
                      : headerState === "partial"
                        ? "−"
                        : ""}
                  </span>
                  {e.emoji} {pick(e.labelKo, e.labelZh)}
                </button>
                <div className="flex flex-wrap gap-1">
                  {e.keys.map((k) => {
                    const active = value.includes(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => toggle(k)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition border break-keep ${
                          active
                            ? "bg-rose-100 text-rose-600 border-rose-300 shadow-sm"
                            : "bg-white text-ink-500 border-cream-200/80 hover:bg-cream-50"
                        }`}
                      >
                        <span>{categoryEmojiOf(k)}</span>
                        {t(`category.${k}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
