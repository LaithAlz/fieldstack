// Hand-authored to match the output shape of:
//   supabase gen types typescript --local --schema public
//
// Once a Supabase project is running, regenerate with `pnpm db:types` (or
// `npm run db:types`). This file is committed so callers can import types
// without needing the CLI installed.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Required by @supabase/postgrest-js v1.20+. Carries Postgrest version
  // metadata. `supabase gen types typescript` populates this for you.
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      operators: {
        Row: {
          id: string;
          name: string;
          website: string | null;
          phone: string | null;
          integration_type: Database["public"]["Enums"]["integration_type"];
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          website?: string | null;
          phone?: string | null;
          integration_type?: Database["public"]["Enums"]["integration_type"];
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          website?: string | null;
          phone?: string | null;
          integration_type?: Database["public"]["Enums"]["integration_type"];
          created_at?: string;
        };
        Relationships: [];
      };
      venues: {
        Row: {
          id: string;
          operator_id: string;
          name: string;
          address: string;
          lat: number | null;
          lng: number | null;
          // PostGIS geography(Point, 4326). Maintained by `venues_sync_location`
          // trigger from lat/lng — never write directly.
          location: unknown | null;
          photos: string[];
          amenities: string[];
          website: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          operator_id: string;
          name: string;
          address: string;
          lat?: number | null;
          lng?: number | null;
          location?: unknown | null;
          photos?: string[];
          amenities?: string[];
          website?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          operator_id?: string;
          name?: string;
          address?: string;
          lat?: number | null;
          lng?: number | null;
          location?: unknown | null;
          photos?: string[];
          amenities?: string[];
          website?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "venues_operator_id_fkey";
            columns: ["operator_id"];
            isOneToOne: false;
            referencedRelation: "operators";
            referencedColumns: ["id"];
          },
        ];
      };
      fields: {
        Row: {
          id: string;
          venue_id: string;
          name: string;
          surface: Database["public"]["Enums"]["field_surface"];
          size: Database["public"]["Enums"]["field_size"];
          price_per_hour: number | null;
          booking_url: string | null;
          booking_platform: Database["public"]["Enums"]["integration_type"];
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          venue_id: string;
          name: string;
          surface: Database["public"]["Enums"]["field_surface"];
          size: Database["public"]["Enums"]["field_size"];
          price_per_hour?: number | null;
          booking_url?: string | null;
          booking_platform?: Database["public"]["Enums"]["integration_type"];
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          venue_id?: string;
          name?: string;
          surface?: Database["public"]["Enums"]["field_surface"];
          size?: Database["public"]["Enums"]["field_size"];
          price_per_hour?: number | null;
          booking_url?: string | null;
          booking_platform?: Database["public"]["Enums"]["integration_type"];
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fields_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      waitlist: {
        Row: {
          id: string;
          email: string;
          city: string | null;
          source: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          city?: string | null;
          source?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          city?: string | null;
          source?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      venues_within: {
        Args: {
          p_lat: number;
          p_lng: number;
          p_radius_meters: number;
        };
        Returns: Database["public"]["Tables"]["venues"]["Row"][];
      };
      search_fields: {
        Args: {
          p_lat?: number | null;
          p_lng?: number | null;
          p_radius_meters?: number | null;
          p_surfaces?: Database["public"]["Enums"]["field_surface"][] | null;
          p_sizes?: Database["public"]["Enums"]["field_size"][] | null;
          p_price_max?: number | null;
          p_sort?: string | null;
        };
        // Returns a single jsonb doc shaped as { data: [...], total: number }.
        // We cast at the call site (lib/queries/search.ts) since jsonb has no
        // canonical TS shape — the SQL function defines the contract.
        Returns: Json;
      };
    };
    Enums: {
      integration_type: "none" | "playtomic" | "courtreserve" | "amilia";
      field_surface: "turf" | "grass" | "concrete" | "indoor";
      field_size: "5v5" | "7v7" | "11v11";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

// Convenience helpers — saves importing Database everywhere.
type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];
