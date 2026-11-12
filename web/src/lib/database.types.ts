export type HomeRadar = {
  user_id: string;
  address: string;
  latitude: number;
  longitude: number;
  radius_km: number;
  updated_at: string;
};
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
      home_radar: {
        Row: HomeRadar;
        Insert: Omit<HomeRadar, "updated_at"> & { updated_at?: string };
        Update: Partial<Omit<HomeRadar, "user_id">>;
        Relationships: [];
      };
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
