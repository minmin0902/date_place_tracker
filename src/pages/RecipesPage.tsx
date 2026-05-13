import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChefHat } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCouple } from "@/hooks/useCouple";
import { usePlaces } from "@/hooks/usePlaces";
import { useWishlist } from "@/hooks/useWishlist";
import { useDisplayNames } from "@/hooks/useProfile";
import { PageHeader } from "@/components/PageHeader";
import { MediaThumb } from "@/components/MediaThumb";
import { chefForViewer } from "@/lib/utils";
import type { Food, WishlistPlace } from "@/lib/database.types";

// Cookbook view — gathers everything recipe-flavored into one grid:
// "made" foods (home-cooked menus that carry recipe_text or
// recipe_photo_urls) + "wishlist" recipe entries (kind === 'recipe').
// Reachable from RecipeBookCard on ComparePage; no dedicated bottom nav
// slot to keep the primary nav uncluttered.

type MadeRecipe = {
  food: Food;
  placeId: string;
  placeName: string;
};

export default function RecipesPage() {
  const { user } = useAuth();
  const { data: couple } = useCouple();
  const { data: places } = usePlaces(couple?.id);
  const { data: wishlist } = useWishlist(couple?.id);
  const { myDisplay, partnerDisplay } = useDisplayNames();
  const { t } = useTranslation();

  const madeRecipes = useMemo<MadeRecipe[]>(() => {
    const out: MadeRecipe[] = [];
    for (const p of places ?? []) {
      for (const f of p.foods ?? []) {
        const has =
          !!f.recipe_text ||
          (f.recipe_photo_urls && f.recipe_photo_urls.length > 0);
        if (!has) continue;
        out.push({ food: f, placeId: p.id, placeName: p.name });
      }
    }
    // Sort newest first by food.created_at — last cook surfaces first.
    out.sort((a, b) =>
      a.food.created_at < b.food.created_at ? 1 : -1
    );
    return out;
  }, [places]);

  const wishlistRecipes = useMemo<WishlistPlace[]>(() => {
    return (wishlist ?? [])
      .filter((w) => w.kind === "recipe")
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [wishlist]);

  const totalCount = madeRecipes.length + wishlistRecipes.length;

  return (
    <div>
      <PageHeader
        title="우리 레시피 모음 · 我家食谱"
        subtitle={
          totalCount > 0
            ? `만든 ${madeRecipes.length} · 만들고 싶은 ${wishlistRecipes.length}`
            : "아직 레시피가 없어요 · 暂无食谱"
        }
        back
      />
      <div className="px-5 pb-8 space-y-6">
        {totalCount === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-cream-200">
            <div className="text-5xl mb-3">📒</div>
            <p className="text-sm text-ink-500 font-medium leading-relaxed">
              집밥 메뉴에 레시피를 적거나
              <br />
              위시리스트에 레시피를 추가해보세요
              <br />
              <span className="text-ink-400 text-[12px]">
                家宴菜单写下做法或在心愿单里加食谱
              </span>
            </p>
          </div>
        ) : (
          <>
            {madeRecipes.length > 0 && (
              <section>
                <SectionHeader
                  emoji="🍳"
                  ko="만든 레시피"
                  zh="做过的"
                  count={madeRecipes.length}
                />
                <div className="grid grid-cols-2 gap-3">
                  {madeRecipes.map((r) => (
                    <MadeRecipeCard
                      key={r.food.id}
                      recipe={r}
                      viewerId={user?.id}
                      myDisplay={myDisplay}
                      partnerDisplay={partnerDisplay}
                      t={t}
                    />
                  ))}
                </div>
              </section>
            )}

            {wishlistRecipes.length > 0 && (
              <section>
                <SectionHeader
                  emoji="📝"
                  ko="만들고 싶은 레시피"
                  zh="想做的"
                  count={wishlistRecipes.length}
                />
                <div className="grid grid-cols-2 gap-3">
                  {wishlistRecipes.map((w) => (
                    <WishlistRecipeCard key={w.id} item={w} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  emoji,
  ko,
  zh,
  count,
}: {
  emoji: string;
  ko: string;
  zh: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <span className="text-base">{emoji}</span>
      <h2 className="font-sans font-bold text-ink-900 text-base">
        {ko} <span className="text-ink-400 font-medium">· {zh}</span>
      </h2>
      <span className="text-[11px] text-ink-400 font-number font-bold">
        {count}
      </span>
    </div>
  );
}

function MadeRecipeCard({
  recipe,
  viewerId,
  myDisplay,
  partnerDisplay,
  t,
}: {
  recipe: MadeRecipe;
  viewerId: string | undefined;
  myDisplay: string;
  partnerDisplay: string;
  t: (key: string) => string;
}) {
  const { food, placeId } = recipe;
  // Recipe screenshots take priority over food photos when picking the
  // thumbnail — recipe photos are the actual cooking reference, food
  // photos are the served-up shot.
  const thumb =
    food.recipe_photo_urls?.[0] ?? food.photo_urls?.[0] ?? null;
  const hasText = !!food.recipe_text;
  const hasPhotos = !!(
    food.recipe_photo_urls && food.recipe_photo_urls.length > 0
  );
  const chefView = chefForViewer(food, viewerId);
  const chefLabel =
    chefView === "me"
      ? `${myDisplay}!`
      : chefView === "partner"
        ? `${partnerDisplay}!`
        : chefView === "together"
          ? "같이!"
          : null;
  const total =
    (food.my_rating ?? 0) + (food.partner_rating ?? 0);
  return (
    <Link
      // Deep-link straight to the recipe card via hash anchor on the
      // food's id. PlaceDetailPage reads location.hash on mount and
      // scrollIntoView's the matching `food-<id>` element, briefly
      // highlighting it so the user sees what they landed on. Without
      // the hash they'd land at the top of a long detail page and
      // have to hunt for the menu they tapped.
      to={`/places/${placeId}#food-${food.id}`}
      className="block bg-white rounded-2xl border border-cream-200 shadow-soft overflow-hidden active:scale-[0.98] transition"
    >
      <div className="aspect-square relative bg-cream-50">
        {thumb ? (
          <MediaThumb
            src={thumb}
            className="w-full h-full object-cover"
            clickable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl">
            📒
          </div>
        )}
        {/* Format badges — quick visual signal of what's attached. */}
        <div className="absolute top-1.5 left-1.5 flex gap-1">
          {hasText && (
            <span className="bg-ink-900/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
              📒
            </span>
          )}
          {hasPhotos && (
            <span className="bg-ink-900/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
              📸
            </span>
          )}
        </div>
        {total > 0 && (
          <div className="absolute top-1.5 right-1.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded font-number">
            ⭐ {total.toFixed(1)}
          </div>
        )}
      </div>
      <div className="p-3 space-y-1">
        <p className="font-bold text-ink-900 text-[13px] truncate">
          {food.name}
        </p>
        {chefLabel && (
          <p className="text-[10px] font-medium text-teal-600 truncate">
            🧑‍🍳 {chefLabel}
          </p>
        )}
        {food.category && (
          <p className="text-[10px] text-ink-400 truncate">
            {t(`category.${food.category}`)}
          </p>
        )}
      </div>
    </Link>
  );
}

function WishlistRecipeCard({ item }: { item: WishlistPlace }) {
  const navigate = useNavigate();
  const thumb = item.recipe_photo_urls?.[0] ?? null;
  const hasText = !!item.recipe_text;
  const hasPhotos = !!(
    item.recipe_photo_urls && item.recipe_photo_urls.length > 0
  );
  return (
    <div className="bg-white rounded-2xl border border-amber-100 shadow-soft overflow-hidden">
      <div className="aspect-square relative bg-amber-50/40">
        {thumb ? (
          <MediaThumb
            src={thumb}
            className="w-full h-full object-cover"
            clickable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl">
            📝
          </div>
        )}
        <div className="absolute top-1.5 left-1.5 flex gap-1">
          {hasText && (
            <span className="bg-ink-900/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
              📒
            </span>
          )}
          {hasPhotos && (
            <span className="bg-ink-900/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
              📸
            </span>
          )}
        </div>
      </div>
      <div className="p-3 space-y-2">
        <p className="font-bold text-ink-900 text-[13px] truncate">
          {item.name}
        </p>
        <button
          type="button"
          onClick={() => navigate(`/places/new?fromWishlist=${item.id}`)}
          className="w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-rose-50 text-rose-500 text-[11px] font-bold rounded-lg border border-rose-100 hover:bg-rose-100 transition active:scale-95"
        >
          <ChefHat className="w-3 h-3" />
          만들어봤어요
        </button>
      </div>
    </div>
  );
}
