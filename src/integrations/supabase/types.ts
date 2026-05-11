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
      allowance_types: {
        Row: {
          created_at: string
          display_name: string
          earning_type: string
          enabled: boolean
          id: string
          is_default: boolean
          name: string
          short_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          earning_type?: string
          enabled?: boolean
          id?: string
          is_default?: boolean
          name: string
          short_name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          earning_type?: string
          enabled?: boolean
          id?: string
          is_default?: boolean
          name?: string
          short_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      billing_types: {
        Row: {
          created_at: string
          description: string
          enabled: boolean
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      client_contracts: {
        Row: {
          billing_type_id: string | null
          contract_code: string
          created_at: string
          description: string
          end_date: string | null
          gst_option: string
          id: string
          payroll_window_id: string | null
          service_type_id: string | null
          start_date: string | null
          status: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          billing_type_id?: string | null
          contract_code: string
          created_at?: string
          description?: string
          end_date?: string | null
          gst_option?: string
          id?: string
          payroll_window_id?: string | null
          service_type_id?: string | null
          start_date?: string | null
          status?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          billing_type_id?: string | null
          contract_code?: string
          created_at?: string
          description?: string
          end_date?: string | null
          gst_option?: string
          id?: string
          payroll_window_id?: string | null
          service_type_id?: string | null
          start_date?: string | null
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contracts_billing_type_id_fkey"
            columns: ["billing_type_id"]
            isOneToOne: false
            referencedRelation: "billing_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_payroll_window_id_fkey"
            columns: ["payroll_window_id"]
            isOneToOne: false
            referencedRelation: "payroll_windows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_gst_numbers: {
        Row: {
          created_at: string
          customer_id: string
          gstin: string
          id: string
          label: string
          state_code: string
          state_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          gstin: string
          id?: string
          label?: string
          state_code?: string
          state_name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          gstin?: string
          id?: string
          label?: string
          state_code?: string
          state_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_gst_numbers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string
          billing_address1: string
          billing_address2: string
          billing_city: string
          billing_country: string
          billing_district: string
          billing_email: string
          billing_fax: string
          billing_name: string
          billing_phone: string
          billing_pincode: string
          billing_salutation: string
          billing_state: string
          code: string
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string
          description: string
          id: string
          industry_type: string
          logo_url: string
          name: string
          phone: string
          shipping_address1: string
          shipping_address2: string
          shipping_city: string
          shipping_country: string
          shipping_district: string
          shipping_email: string
          shipping_fax: string
          shipping_name: string
          shipping_phone: string
          shipping_pincode: string
          shipping_salutation: string
          shipping_same_as_billing: boolean
          shipping_state: string
          short_name: string
          status: Database["public"]["Enums"]["customer_status"]
          updated_at: string
          website: string
        }
        Insert: {
          address?: string
          billing_address1?: string
          billing_address2?: string
          billing_city?: string
          billing_country?: string
          billing_district?: string
          billing_email?: string
          billing_fax?: string
          billing_name?: string
          billing_phone?: string
          billing_pincode?: string
          billing_salutation?: string
          billing_state?: string
          code: string
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          description?: string
          id?: string
          industry_type?: string
          logo_url?: string
          name: string
          phone?: string
          shipping_address1?: string
          shipping_address2?: string
          shipping_city?: string
          shipping_country?: string
          shipping_district?: string
          shipping_email?: string
          shipping_fax?: string
          shipping_name?: string
          shipping_phone?: string
          shipping_pincode?: string
          shipping_salutation?: string
          shipping_same_as_billing?: boolean
          shipping_state?: string
          short_name?: string
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
          website?: string
        }
        Update: {
          address?: string
          billing_address1?: string
          billing_address2?: string
          billing_city?: string
          billing_country?: string
          billing_district?: string
          billing_email?: string
          billing_fax?: string
          billing_name?: string
          billing_phone?: string
          billing_pincode?: string
          billing_salutation?: string
          billing_state?: string
          code?: string
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          description?: string
          id?: string
          industry_type?: string
          logo_url?: string
          name?: string
          phone?: string
          shipping_address1?: string
          shipping_address2?: string
          shipping_city?: string
          shipping_country?: string
          shipping_district?: string
          shipping_email?: string
          shipping_fax?: string
          shipping_name?: string
          shipping_phone?: string
          shipping_pincode?: string
          shipping_salutation?: string
          shipping_same_as_billing?: boolean
          shipping_state?: string
          short_name?: string
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
          website?: string
        }
        Relationships: []
      }
      duties: {
        Row: {
          created_at: string
          description: string
          enabled: boolean
          hours: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          enabled?: boolean
          hours?: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          enabled?: boolean
          hours?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      labour_welfare_funds: {
        Row: {
          created_at: string
          deduction_months: number[]
          employee_contribution: number
          employer_contribution: number
          enabled: boolean
          frequency: string
          id: string
          notes: string
          state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deduction_months?: number[]
          employee_contribution?: number
          employer_contribution?: number
          enabled?: boolean
          frequency?: string
          id?: string
          notes?: string
          state: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deduction_months?: number[]
          employee_contribution?: number
          employer_contribution?: number
          enabled?: boolean
          frequency?: string
          id?: string
          notes?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      payroll_windows: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          label: string
          processing_day: number
          updated_at: string
          window_end_day: number
          window_start_day: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          processing_day: number
          updated_at?: string
          window_end_day: number
          window_start_day: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          processing_day?: number
          updated_at?: string
          window_end_day?: number
          window_start_day?: number
        }
        Relationships: []
      }
      pincode_ranges: {
        Row: {
          created_at: string
          id: string
          is_excluded: boolean
          notes: string
          range_end: number
          range_start: number
          region_label: string
          state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_excluded?: boolean
          notes?: string
          range_end: number
          range_start: number
          region_label?: string
          state: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_excluded?: boolean
          notes?: string
          range_end?: number
          range_start?: number
          region_label?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      professional_tax_slabs: {
        Row: {
          created_at: string
          gender: string
          id: string
          period: string
          pincode_coverage: string
          region_label: string
          salary_max: number | null
          salary_min: number
          state: string
          tax_per_month: number
          updated_at: string
          working_days: string
        }
        Insert: {
          created_at?: string
          gender?: string
          id?: string
          period?: string
          pincode_coverage?: string
          region_label?: string
          salary_max?: number | null
          salary_min?: number
          state: string
          tax_per_month?: number
          updated_at?: string
          working_days?: string
        }
        Update: {
          created_at?: string
          gender?: string
          id?: string
          period?: string
          pincode_coverage?: string
          region_label?: string
          salary_max?: number | null
          salary_min?: number
          state?: string
          tax_per_month?: number
          updated_at?: string
          working_days?: string
        }
        Relationships: []
      }
      service_types: {
        Row: {
          created_at: string
          description: string
          enabled: boolean
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          name?: string
          updated_at?: string
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
          enable_lwf: boolean
          enable_pt: boolean
          gst_number: string
          id: string
          latitude: number | null
          location: string
          longitude: number | null
          name: string
          nearby_hospital_mobile: string
          nearby_hospital_name: string
          onboarding_date: string | null
          pan_number: string
          reporting_officers: Json
          security_service_mobile: string
          security_service_name: string
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
          enable_lwf?: boolean
          enable_pt?: boolean
          gst_number?: string
          id?: string
          latitude?: number | null
          location?: string
          longitude?: number | null
          name?: string
          nearby_hospital_mobile?: string
          nearby_hospital_name?: string
          onboarding_date?: string | null
          pan_number?: string
          reporting_officers?: Json
          security_service_mobile?: string
          security_service_name?: string
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
          enable_lwf?: boolean
          enable_pt?: boolean
          gst_number?: string
          id?: string
          latitude?: number | null
          location?: string
          longitude?: number | null
          name?: string
          nearby_hospital_mobile?: string
          nearby_hospital_name?: string
          onboarding_date?: string | null
          pan_number?: string
          reporting_officers?: Json
          security_service_mobile?: string
          security_service_name?: string
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
