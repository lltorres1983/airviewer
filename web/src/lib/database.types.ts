export type Favorite = {
  user_id: string;
  aircraft_hex: string;
  registration: string;
  aircraft_type: string;
  created_at: string;
};
export type Database = {
  public: {
    Tables: {
      aircraft_favorites: {
        Row: Favorite;
        Insert: Pick<Favorite, "user_id" | "aircraft_hex"> &
          Partial<
            Pick<Favorite, "registration" | "aircraft_type" | "created_at">
          >;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
