-- =============================================================
-- Remap user-typed custom category strings (中东菜 / 法餐 / 秘鲁菜 /
-- 西班牙菜 / 快餐 etc.) to the new built-in category keys so they
-- show up in the proper dropdown groups + feed BTI buckets correctly,
-- instead of staying in the "✏️ 직접 입력 · 自定义" group.
--
-- Covers both the multi-select `categories` array and the legacy
-- singleton `category` column, on both places + foods.
--
-- Runs in Supabase SQL Editor; safe to re-run.
-- =============================================================

-- ---------- places.categories (text[]) ----------
update public.places
   set categories = (
     select array_agg(
       case c
         -- middle_eastern
         when '中东菜' then 'middle_eastern'
         when '中东'  then 'middle_eastern'
         when '중동'   then 'middle_eastern'
         when '중동 음식' then 'middle_eastern'
         -- french
         when '法餐'   then 'french'
         when '法国菜' then 'french'
         when '프랑스' then 'french'
         when '프랑스 음식' then 'french'
         -- peruvian
         when '秘鲁菜' then 'peruvian'
         when '秘鲁'   then 'peruvian'
         when '페루'   then 'peruvian'
         when '페루 음식' then 'peruvian'
         -- spanish
         when '西班牙菜' then 'spanish'
         when '西班牙'    then 'spanish'
         when '스페인'    then 'spanish'
         when '스페인 음식' then 'spanish'
         -- fastfood
         when '快餐'         then 'fastfood'
         when '速食'         then 'fastfood'
         when '패스트푸드'    then 'fastfood'
         when '패스트 푸드'   then 'fastfood'
         when '패스트푸드점'  then 'fastfood'
         else c
       end
     )
     from unnest(categories) as c
   )
 where categories && array[
   '中东菜','中东','중동','중동 음식',
   '法餐','法国菜','프랑스','프랑스 음식',
   '秘鲁菜','秘鲁','페루','페루 음식',
   '西班牙菜','西班牙','스페인','스페인 음식',
   '快餐','速食','패스트푸드','패스트 푸드','패스트푸드점'
 ];

-- ---------- places.category (legacy singleton) ----------
update public.places
   set category = case category
     when '中东菜' then 'middle_eastern'
     when '中东'  then 'middle_eastern'
     when '중동'   then 'middle_eastern'
     when '중동 음식' then 'middle_eastern'
     when '法餐'   then 'french'
     when '法国菜' then 'french'
     when '프랑스' then 'french'
     when '프랑스 음식' then 'french'
     when '秘鲁菜' then 'peruvian'
     when '秘鲁'   then 'peruvian'
     when '페루'   then 'peruvian'
     when '페루 음식' then 'peruvian'
     when '西班牙菜' then 'spanish'
     when '西班牙'    then 'spanish'
     when '스페인'    then 'spanish'
     when '스페인 음식' then 'spanish'
     when '快餐'         then 'fastfood'
     when '速食'         then 'fastfood'
     when '패스트푸드'    then 'fastfood'
     when '패스트 푸드'   then 'fastfood'
     when '패스트푸드점'  then 'fastfood'
     else category
   end
 where category in (
   '中东菜','中东','중동','중동 음식',
   '法餐','法国菜','프랑스','프랑스 음식',
   '秘鲁菜','秘鲁','페루','페루 음식',
   '西班牙菜','西班牙','스페인','스페인 음식',
   '快餐','速食','패스트푸드','패스트 푸드','패스트푸드점'
 );

-- ---------- foods.categories (same idea, same map) ----------
update public.foods
   set categories = (
     select array_agg(
       case c
         when '中东菜' then 'middle_eastern'
         when '中东'  then 'middle_eastern'
         when '중동'   then 'middle_eastern'
         when '중동 음식' then 'middle_eastern'
         when '法餐'   then 'french'
         when '法国菜' then 'french'
         when '프랑스' then 'french'
         when '프랑스 음식' then 'french'
         when '秘鲁菜' then 'peruvian'
         when '秘鲁'   then 'peruvian'
         when '페루'   then 'peruvian'
         when '페루 음식' then 'peruvian'
         when '西班牙菜' then 'spanish'
         when '西班牙'    then 'spanish'
         when '스페인'    then 'spanish'
         when '스페인 음식' then 'spanish'
         when '快餐'         then 'fastfood'
         when '速食'         then 'fastfood'
         when '패스트푸드'    then 'fastfood'
         when '패스트 푸드'   then 'fastfood'
         when '패스트푸드점'  then 'fastfood'
         else c
       end
     )
     from unnest(categories) as c
   )
 where categories && array[
   '中东菜','中东','중동','중동 음식',
   '法餐','法国菜','프랑스','프랑스 음식',
   '秘鲁菜','秘鲁','페루','페루 음식',
   '西班牙菜','西班牙','스페인','스페인 음식',
   '快餐','速食','패스트푸드','패스트 푸드','패스트푸드점'
 ];

-- ---------- foods.category (legacy) ----------
update public.foods
   set category = case category
     when '中东菜' then 'middle_eastern'
     when '中东'  then 'middle_eastern'
     when '중동'   then 'middle_eastern'
     when '중동 음식' then 'middle_eastern'
     when '法餐'   then 'french'
     when '法国菜' then 'french'
     when '프랑스' then 'french'
     when '프랑스 음식' then 'french'
     when '秘鲁菜' then 'peruvian'
     when '秘鲁'   then 'peruvian'
     when '페루'   then 'peruvian'
     when '페루 음식' then 'peruvian'
     when '西班牙菜' then 'spanish'
     when '西班牙'    then 'spanish'
     when '스페인'    then 'spanish'
     when '스페인 음식' then 'spanish'
     when '快餐'         then 'fastfood'
     when '速食'         then 'fastfood'
     when '패스트푸드'    then 'fastfood'
     when '패스트 푸드'   then 'fastfood'
     when '패스트푸드점'  then 'fastfood'
     else category
   end
 where category in (
   '中东菜','中东','중동','중동 음식',
   '法餐','法国菜','프랑스','프랑스 음식',
   '秘鲁菜','秘鲁','페루','페루 음식',
   '西班牙菜','西班牙','스페인','스페인 음식',
   '快餐','速食','패스트푸드','패스트 푸드','패스트푸드점'
 );

-- =============================================================
-- 검증 — 마이그레이션 후 "직접 입력" 그룹에 남아있는 모든 비-빌트인
-- 카테고리 strings 목록. 결과가 비어 있으면 모든 커스텀이 정식
-- 카테고리로 옮겨진 것. 남아있다면 이 결과를 사용자에게 보여주고
-- 추가 처리를 결정.
-- =============================================================
with built_in as (
  select unnest(array[
    'korean','japanese','chinese','thai','vietnamese','indian',
    'italian','western','french','spanish',
    'mexican','peruvian','middle_eastern',
    'cafe','bakery','brunch','dessert',
    'bar','fastfood','other'
  ]) as key
),
all_categories as (
  select unnest(categories) as cat from public.places where categories is not null
  union all
  select category from public.places where category is not null
  union all
  select unnest(categories) as cat from public.foods where categories is not null
  union all
  select category from public.foods where category is not null
)
select cat as remaining_custom_string, count(*) as usage_count
  from all_categories
 where cat is not null
   and cat <> ''
   and cat not in (select key from built_in)
 group by cat
 order by usage_count desc, cat;
