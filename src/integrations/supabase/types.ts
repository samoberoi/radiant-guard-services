export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      branches: {
        Row: {
          code: string
          created_at: string
          description: string
          id: string
          name: string
          state_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          state_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          state_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: true
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string
          code: string
          contract_start_date: string | null
          created_at: string
          id: string
          name: string
          phone: string
          status: Database["public"]["Enums"]["customer_status"]
          updated_at: string
          website: string
        }
        Insert: {
          address?: string
          code: string
          contract_start_date?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
          website?: string
        }
        Update: {
          address?: string
          code?: string
          contract_start_date?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
          website?: string
        }
        Relationships: []
      }
      states: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      units: {
        Row: {
          ambulance_mobile: string
          ambulance_name: string
          billing_address1: string
          billing_address2: string
          billing_city: string
          billing_country: string
          billing_district: string
          billing_name: string
          billing_pincode: string
          billing_salutation: string
          billing_state: string
          branch_id: string | null
          closing_date: string | null
          code: string
          created_at: string
          customer_id: string | null
          description: string
          emergency_contact_mobile: string
          emergency_contact_name: string
          gst_number: string
          id: string
          location: string
          name: string
          nearby_hospital_mobile: string
          nearby_hospital_name: string
          onboarding_date: string | null
          pan_number: string
          reporting_officers: Json
          shipping_address1: string
          shipping_address2: string
          shipping_city: string
          shipping_country: string
          shipping_district: string
          shipping_name: string
          shipping_pincode: string
          shipping_salutation: string
          shipping_same_as_billing: boolean
          shipping_same_as_org: boolean
          shipping_state: string
          status: Database["public"]["Enums"]["customer_status"]
          updated_at: string
        }
        Insert: {
          ambulance_mobile?: string
          ambulance_name?: string
          billing_address1?: string
          billing_address2?: string
          billing_city?: string
          billing_country?: string
          billing_district?: string
          billing_name?: string
          billing_pincode?: string
          billing_salutation?: string
          billing_state?: string
          branch_id?: string | null
          closing_date?: string | null
          code: string
          created_at?: string
          customer_id?: string | null
          description?: string
          emergency_contact_mobile?: string
          emergency_contact_name?: string
          gst_number?: string
          id?: string
          location?: string
          name?: string
          nearby_hospital_mobile?: string
          nearby_hospital_name?: string
          onboarding_date?: string | null
          pan_number?: string
          reporting_officers?: Json
          shipping_address1?: string
          shipping_address2?: string
          shipping_city?: string
          shipping_country?: string
          shipping_district?: string
          shipping_name?: string
          shipping_pincode?: string
          shipping_salutation?: string
          shipping_same_as_billing?: boolean
          shipping_same_as_org?: boolean
          shipping_state?: string
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
        }
        Update: {
          ambulance_mobile?: string
          ambulance_name?: string
          billing_address1?: string
          billing_address2?: string
          billing_city?: string
          billing_country?: string
          billing_district?: string
          billing_name?: string
          billing_pincode?: string
          billing_salutation?: string
          billing_state?: string
          branch_id?: string | null
          closing_date?: string | null
          code?: string
          created_at?: string
          customer_id?: string | null
          description?: string
          emergency_contact_mobile?: string
          emergency_contact_name?: string
          gst_number?: string
          id?: string
          location?: string
          name?: string
          nearby_hospital_mobile?: string
          nearby_hospital_name?: string
          onboarding_date?: string | null
          pan_number?: string
          reporting_officers?: Json
          shipping_address1?: string
          shipping_address2?: string
          shipping_city?: string
          shipping_country?: string
          shipping_district?: string
          shipping_name?: string
          shipping_pincode?: string
          shipping_salutation?: string
          shipping_same_as_billing?: boolean
          shipping_same_as_org?: boolean
          shipping_state?: string
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      customer_status: "active" | "inactive"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      customer_status: ["active", "inactive"],
    },
  },
} as const
