export type ChefRole = "me" | "partner" | "together";

// Who ate this food. Stored from the creator's perspective (same
// convention as my_rating/partner_rating). Default 'both'.
//   'both'    — both partners ate
//   'creator' — only foods.created_by ate
//   'partner' — only the non-creator ate
export type EaterRole = "both" | "creator" | "partner";

export type Database = {
  public: {
    Tables: {
      places: {
        Row: {
          id: string;
          name: string;
          date_visited: string;
          address: string | null;
          // Legacy single-string category, kept in sync with the
          // first entry of `categories` for back-compat.
          category: string | null;
          // New multi-select. Null on legacy rows that haven't been
          // touched since the migration; treat null as "fall back to
          // the singleton form of `category`".
          categories: string[] | null;
          memo: string | null;
          // Who wrote `memo`. null on legacy rows (rendered as the
          // partner since the couple originally shared one account).
          memo_author_id: string | null;
          // When `memo` was last written. Distinct from updated_at —
          // we don't want unrelated row updates (RLS migrations,
          // category edits, etc) to falsely advance this timestamp.
          memo_updated_at: string | null;
          want_to_revisit: boolean;
          is_home_cooked: boolean;
          photo_urls: string[] | null;
          latitude: number | null;
          longitude: number | null;
          created_by: string;
          couple_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          date_visited: string;
          address?: string | null;
          category?: string | null;
          categories?: string[] | null;
          memo?: string | null;
          memo_author_id?: string | null;
          memo_updated_at?: string | null;
          want_to_revisit?: boolean;
          is_home_cooked?: boolean;
          photo_urls?: string[] | null;
          latitude?: number | null;
          longitude?: number | null;
          created_by: string;
          couple_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["places"]["Insert"]>;
      };
      foods: {
        Row: {
          id: string;
          place_id: string;
          name: string;
          // my_rating / partner_rating are stored from the *creator's*
          // perspective: my_rating is always the rating belonging to
          // foods.created_by, partner_rating is the co-partner's. The
          // UI swaps the labels per viewer (see ratingsForViewer).
          my_rating: number | null;
          partner_rating: number | null;
          // Legacy singleton — backfilled from / synced with first
          // element of `categories`.
          category: string | null;
          categories: string[] | null;
          memo: string | null;
          // Who wrote `memo`. null on legacy rows.
          memo_author_id: string | null;
          // When `memo` was last written. See places row for rationale.
          memo_updated_at: string | null;
          // Legacy single-photo column, kept for back-compat. Prefer
          // photo_urls for reads/writes.
          photo_url: string | null;
          photo_urls: string[] | null;
          chef: ChefRole | null;
          created_by: string | null;
          // Legacy boolean — superseded by `eater`. Kept for older
          // client builds. New code should branch on `eater`.
          is_solo: boolean;
          eater: EaterRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          place_id: string;
          name: string;
          my_rating?: number | null;
          partner_rating?: number | null;
          category?: string | null;
          categories?: string[] | null;
          memo?: string | null;
          memo_author_id?: string | null;
          memo_updated_at?: string | null;
          photo_url?: string | null;
          photo_urls?: string[] | null;
          chef?: ChefRole | null;
          created_by?: string | null;
          is_solo?: boolean;
          eater?: EaterRole;
        };
        Update: Partial<Database["public"]["Tables"]["foods"]["Insert"]>;
      };
      couples: {
        Row: {
          id: string;
          user1_id: string;
          user2_id: string | null;
          invite_code: string;
          home_address: string | null;
          home_latitude: number | null;
          home_longitude: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user1_id: string;
          user2_id?: string | null;
          invite_code: string;
          home_address?: string | null;
          home_latitude?: number | null;
          home_longitude?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["couples"]["Insert"]>;
      };
      profiles: {
        Row: {
          user_id: string;
          nickname: string | null;
          // 내가 짝꿍에게 붙여준 애칭. 짝꿍이 본인 프로필 화면에서
          // "내 짝꿍이 나를 OOO 라고 부른다" 로 노출되는 근거 데이터.
          partner_nickname: string | null;
          avatar_url: string | null;
          bio: string | null;
          hate_ingredients: string[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          nickname?: string | null;
          partner_nickname?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          hate_ingredients?: string[] | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      notifications: {
        Row: {
          id: string;
          recipient_id: string;
          couple_id: string;
          kind:
            | "place"
            | "food"
            | "memo"
            | "memo_thread"
            | "revisit"
            | "rating";
          actor_id: string;
          place_id: string | null;
          food_id: string | null;
          memo_id: string | null;
          preview: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          recipient_id: string;
          couple_id: string;
          kind:
            | "place"
            | "food"
            | "memo"
            | "memo_thread"
            | "revisit"
            | "rating";
          actor_id: string;
          place_id?: string | null;
          food_id?: string | null;
          memo_id?: string | null;
          preview?: string | null;
          read_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["notifications"]["Insert"]
        >;
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth_key: string;
          user_agent: string | null;
          created_at: string;
          last_seen_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth_key: string;
          user_agent?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["push_subscriptions"]["Insert"]
        >;
      };
      memos: {
        Row: {
          id: string;
          couple_id: string;
          // Exactly one of place_id / food_id is set.
          place_id: string | null;
          food_id: string | null;
          author_id: string;
          body: string;
          // Optional small attachments (photo or short video) on the
          // comment itself. Same shape as places.photo_urls.
          photo_urls: string[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          place_id?: string | null;
          food_id?: string | null;
          author_id: string;
          body: string;
          photo_urls?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["memos"]["Insert"]>;
      };
      wishlist_places: {
        Row: {
          id: string;
          couple_id: string;
          name: string;
          category: string | null;
          memo: string | null;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          couple_id: string;
          name: string;
          category?: string | null;
          memo?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          created_by?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["wishlist_places"]["Insert"]
        >;
      };
    };
  };
};

export type Place = Database["public"]["Tables"]["places"]["Row"];
export type Food = Database["public"]["Tables"]["foods"]["Row"];
export type Memo = Database["public"]["Tables"]["memos"]["Row"];
export type NotificationRow =
  Database["public"]["Tables"]["notifications"]["Row"];
export type PushSubscriptionRow =
  Database["public"]["Tables"]["push_subscriptions"]["Row"];
export type Couple = Database["public"]["Tables"]["couples"]["Row"];
export type WishlistPlace =
  Database["public"]["Tables"]["wishlist_places"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
