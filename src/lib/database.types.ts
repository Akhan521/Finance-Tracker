
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "approved_emails": {
                  Row: {
                    "email": string
                  }
                  ComputedFields: never
                  Insert: {
                    "email": string
                  }
                  Update: {
                    "email"?: string
                  }
                  Relationships: [
                    
                  ]
                },"bills": {
                  Row: {
                    "anchor_date": string,"archived_at": string | null,"category_id": string,"created_at": string,"every_weeks": number | null,"household_id": string | null,"id": string,"is_credit_card": boolean,"last4": string | null,"name": string,"nickname": string | null,"owner_id": string | null,"pay_url": string | null,"schedule": string,"usual_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "anchor_date": string,"archived_at"?: string | null,"category_id": string,"created_at"?: string,"every_weeks"?: number | null,"household_id"?: string | null,"id"?: string,"is_credit_card"?: boolean,"last4"?: string | null,"name": string,"nickname"?: string | null,"owner_id"?: string | null,"pay_url"?: string | null,"schedule": string,"usual_cents": number
                  }
                  Update: {
                    "anchor_date"?: string,"archived_at"?: string | null,"category_id"?: string,"created_at"?: string,"every_weeks"?: number | null,"household_id"?: string | null,"id"?: string,"is_credit_card"?: boolean,"last4"?: string | null,"name"?: string,"nickname"?: string | null,"owner_id"?: string | null,"pay_url"?: string | null,"schedule"?: string,"usual_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "bills_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bills_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bills_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "color": string,"household_id": string | null,"id": string,"is_credit_card": boolean,"name": string,"owner_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "color": string,"household_id"?: string | null,"id"?: string,"is_credit_card"?: boolean,"name": string,"owner_id"?: string | null
                  }
                  Update: {
                    "color"?: string,"household_id"?: string | null,"id"?: string,"is_credit_card"?: boolean,"name"?: string,"owner_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"entries": {
                  Row: {
                    "bill_id": string,"due_date": string,"expected_cents": number,"id": string,"minimum_cents": number | null,"statement_cents": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bill_id": string,"due_date": string,"expected_cents": number,"id"?: string,"minimum_cents"?: number | null,"statement_cents"?: number | null
                  }
                  Update: {
                    "bill_id"?: string,"due_date"?: string,"expected_cents"?: number,"id"?: string,"minimum_cents"?: number | null,"statement_cents"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "entries_bill_id_fkey"
      columns: ["bill_id"]
isOneToOne: false
      referencedRelation: "bills"
      referencedColumns: ["id"]
    }
                  ]
                },"households": {
                  Row: {
                    "created_at": string,"heads_up_sent_at": string | null,"id": string,"name": string,"retention_months": number | null,"time_zone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"heads_up_sent_at"?: string | null,"id"?: string,"name": string,"retention_months"?: number | null,"time_zone": string
                  }
                  Update: {
                    "created_at"?: string,"heads_up_sent_at"?: string | null,"id"?: string,"name"?: string,"retention_months"?: number | null,"time_zone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"invites": {
                  Row: {
                    "accepted_at": string | null,"cancelled_at": string | null,"created_at": string,"email": string,"expires_at": string,"household_id": string,"id": string,"invited_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"cancelled_at"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"household_id": string,"id"?: string,"invited_by"?: string | null
                  }
                  Update: {
                    "accepted_at"?: string | null,"cancelled_at"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"household_id"?: string,"id"?: string,"invited_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invites_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invites_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "household_id": string,"joined_at": string,"profile_id": string,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "household_id": string,"joined_at"?: string,"profile_id": string,"role": string
                  }
                  Update: {
                    "household_id"?: string,"joined_at"?: string,"profile_id"?: string,"role"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string | null,"heads_up_sent_at": string | null,"id": string,"last_view": string,"lead_days": number,"remind_household": boolean,"remind_personal": boolean,"retention_months": number | null,"time_zone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"heads_up_sent_at"?: string | null,"id": string,"last_view"?: string,"lead_days"?: number,"remind_household"?: boolean,"remind_personal"?: boolean,"retention_months"?: number | null,"time_zone"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"heads_up_sent_at"?: string | null,"id"?: string,"last_view"?: string,"lead_days"?: number,"remind_household"?: boolean,"remind_personal"?: boolean,"retention_months"?: number | null,"time_zone"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invite":
{ Args: { "p_invite": string }; Returns: string
                           },
"can_access_bill":
{ Args: { "p_bill": string }; Returns: boolean
                           },
"create_household":
{ Args: { "p_name": string,"p_time_zone": string }; Returns: string
                           },
"due_dates":
{ Args: { "p_anchor": string,"p_every_weeks": number,"p_from": string,"p_schedule": string,"p_through": string }; Returns: string[]
                           },
"extend_entries":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"generate_entries":
{ Args: { "p_bill": string,"p_from": string }; Returns: undefined
                           },
"hook_before_user_created":
{ Args: { "event": Json }; Returns: Json
                           },
"household_names":
{ Args: Record<PropertyKey, never>; Returns: {
              "display_name": string,"profile_id": string
            }[]
                           },
"is_member":
{ Args: { "p_household": string }; Returns: boolean
                           },
"is_owner":
{ Args: { "p_household": string }; Returns: boolean
                           },
"my_household_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"my_invites":
{ Args: Record<PropertyKey, never>; Returns: {
              "expires_at": string,"household_name": string,"id": string,"invited_by_name": string
            }[]
                           },
"scope_today":
{ Args: { "p_household": string,"p_owner": string }; Returns: string
                           },
"seed_default_categories":
{ Args: { "p_household": string,"p_owner": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
