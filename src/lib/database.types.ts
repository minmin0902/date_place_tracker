export type Database = {
  public: {
    Tables: {
      places: {
        Row: {
          id: string;
          name: string;
          date_visited: string;
          address: string | null;
          category: string | null;
          memo: string | null;
          want_to_revisit: boolean;
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
          memo?: string | null;
          want_to_revisit?: boolean;
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
          my_rating: number | null;
          partner_rating: number | null;
          category: string | null;
          memo: string | null;
          photo_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          place_id: string;
          name: string;
          my_rating?: number | null;
          partner_rating?: number | null;
          category?: string | null;
          memo?: string | null;
          photo_url?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["foods"]["Insert"]>;
      };
      couples: {
        Row: {
          id: string;
          user1_id: string;
          user2_id: string | null;
          invite_code: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user1_id: string;
          user2_id?: string | null;
          invite_code: string;
        };
        Update: Partial<Database["public"]["Tables"]["couples"]["Insert"]>;
      };
    };
  };
};

export type Place = Database["public"]["Tables"]["places"]["Row"];
export type Food = Database["public"]["Tables"]["foods"]["Row"];
export type Couple = Database["public"]["Tables"]["couples"]["Row"];
