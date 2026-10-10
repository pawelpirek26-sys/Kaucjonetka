
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "coupons": {
                  Row: {
                    "amount_grosze": number,"barcode": string | null,"barcode_type": string | null,"client_updated_at": string,"created_at": string,"deleted_at": string | null,"expires_on": string | null,"id": string,"issued_on": string | null,"note": string | null,"photo_path": string | null,"redeemed_at": string | null,"status": Database["public"]['Enums']["coupon_status"],"store_id": number | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_grosze": number,"barcode"?: string | null,"barcode_type"?: string | null,"client_updated_at"?: string,"created_at"?: string,"deleted_at"?: string | null,"expires_on"?: string | null,"id": string,"issued_on"?: string | null,"note"?: string | null,"photo_path"?: string | null,"redeemed_at"?: string | null,"status"?: Database["public"]['Enums']["coupon_status"],"store_id"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "amount_grosze"?: number,"barcode"?: string | null,"barcode_type"?: string | null,"client_updated_at"?: string,"created_at"?: string,"deleted_at"?: string | null,"expires_on"?: string | null,"id"?: string,"issued_on"?: string | null,"note"?: string | null,"photo_path"?: string | null,"redeemed_at"?: string | null,"status"?: Database["public"]['Enums']["coupon_status"],"store_id"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "coupons_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"machine_reports": {
                  Row: {
                    "created_at": string,"distance_m": number | null,"id": number,"machine_id": number,"type": Database["public"]['Enums']["report_type"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"distance_m"?: number | null,"id"?: never,"machine_id": number,"type": Database["public"]['Enums']["report_type"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"distance_m"?: number | null,"id"?: never,"machine_id"?: number,"type"?: Database["public"]['Enums']["report_type"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "machine_reports_machine_id_fkey"
      columns: ["machine_id"]
isOneToOne: false
      referencedRelation: "machines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "machine_reports_machine_id_fkey"
      columns: ["machine_id"]
isOneToOne: false
      referencedRelation: "machines_live"
      referencedColumns: ["id"]
    }
                  ]
                },"machine_status": {
                  Row: {
                    "confirmations": number,"denials": number,"machine_id": number,"report_id": number | null,"report_type": Database["public"]['Enums']["report_type"] | null,"reported_at": string | null,"status": Database["public"]['Enums']["machine_status_level"],"updated_at": string,"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "confirmations"?: number,"denials"?: number,"machine_id": number,"report_id"?: number | null,"report_type"?: Database["public"]['Enums']["report_type"] | null,"reported_at"?: string | null,"status"?: Database["public"]['Enums']["machine_status_level"],"updated_at"?: string,"valid_until"?: string | null
                  }
                  Update: {
                    "confirmations"?: number,"denials"?: number,"machine_id"?: number,"report_id"?: number | null,"report_type"?: Database["public"]['Enums']["report_type"] | null,"reported_at"?: string | null,"status"?: Database["public"]['Enums']["machine_status_level"],"updated_at"?: string,"valid_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "machine_status_machine_id_fkey"
      columns: ["machine_id"]
isOneToOne: true
      referencedRelation: "machines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "machine_status_machine_id_fkey"
      columns: ["machine_id"]
isOneToOne: true
      referencedRelation: "machines_live"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "machine_status_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "machine_reports"
      referencedColumns: ["id"]
    }
                  ]
                },"machines": {
                  Row: {
                    "accepts": (Database["public"]['Enums']["packaging"])[],"active": boolean,"brand": string | null,"created_at": string,"geom": unknown,"id": number,"last_seen_at": string,"name": string | null,"operator": string | null,"osm_id": number | null,"osm_type": string | null,"region": string | null,"source": string,"store_id": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepts"?: (Database["public"]['Enums']["packaging"])[],"active"?: boolean,"brand"?: string | null,"created_at"?: string,"geom": unknown,"id"?: never,"last_seen_at"?: string,"name"?: string | null,"operator"?: string | null,"osm_id"?: number | null,"osm_type"?: string | null,"region"?: string | null,"source"?: string,"store_id"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "accepts"?: (Database["public"]['Enums']["packaging"])[],"active"?: boolean,"brand"?: string | null,"created_at"?: string,"geom"?: unknown,"id"?: never,"last_seen_at"?: string,"name"?: string | null,"operator"?: string | null,"osm_id"?: number | null,"osm_type"?: string | null,"region"?: string | null,"source"?: string,"store_id"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "machines_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"point_submissions": {
                  Row: {
                    "accepts": (Database["public"]['Enums']["packaging"])[],"brand": string | null,"created_at": string,"geom": unknown,"id": number,"kind": Database["public"]['Enums']["point_kind"],"machine_id": number | null,"name": string | null,"note": string | null,"reviewed_at": string | null,"status": Database["public"]['Enums']["submission_status"],"store_id": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepts"?: (Database["public"]['Enums']["packaging"])[],"brand"?: string | null,"created_at"?: string,"geom": unknown,"id"?: never,"kind": Database["public"]['Enums']["point_kind"],"machine_id"?: number | null,"name"?: string | null,"note"?: string | null,"reviewed_at"?: string | null,"status"?: Database["public"]['Enums']["submission_status"],"store_id"?: number | null,"user_id": string
                  }
                  Update: {
                    "accepts"?: (Database["public"]['Enums']["packaging"])[],"brand"?: string | null,"created_at"?: string,"geom"?: unknown,"id"?: never,"kind"?: Database["public"]['Enums']["point_kind"],"machine_id"?: number | null,"name"?: string | null,"note"?: string | null,"reviewed_at"?: string | null,"status"?: Database["public"]['Enums']["submission_status"],"store_id"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "point_submissions_machine_id_fkey"
      columns: ["machine_id"]
isOneToOne: false
      referencedRelation: "machines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "point_submissions_machine_id_fkey"
      columns: ["machine_id"]
isOneToOne: false
      referencedRelation: "machines_live"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "point_submissions_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "backup_enabled": boolean,"created_at": string,"display_name": string | null,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "backup_enabled"?: boolean,"created_at"?: string,"display_name"?: string | null,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "backup_enabled"?: boolean,"created_at"?: string,"display_name"?: string | null,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"report_votes": {
                  Row: {
                    "created_at": string,"report_id": number,"still_valid": boolean,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"report_id": number,"still_valid": boolean,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"report_id"?: number,"still_valid"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "report_votes_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "machine_reports"
      referencedColumns: ["id"]
    }
                  ]
                },"stores": {
                  Row: {
                    "active": boolean,"brand": string | null,"brand_wikidata": string | null,"city": string | null,"created_at": string,"geom": unknown,"housenumber": string | null,"id": number,"last_seen_at": string,"name": string | null,"opening_hours": string | null,"osm_id": number | null,"osm_type": string | null,"postcode": string | null,"region": string | null,"shop": string | null,"source": string,"street": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"brand"?: string | null,"brand_wikidata"?: string | null,"city"?: string | null,"created_at"?: string,"geom": unknown,"housenumber"?: string | null,"id"?: never,"last_seen_at"?: string,"name"?: string | null,"opening_hours"?: string | null,"osm_id"?: number | null,"osm_type"?: string | null,"postcode"?: string | null,"region"?: string | null,"shop"?: string | null,"source"?: string,"street"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"brand"?: string | null,"brand_wikidata"?: string | null,"city"?: string | null,"created_at"?: string,"geom"?: unknown,"housenumber"?: string | null,"id"?: never,"last_seen_at"?: string,"name"?: string | null,"opening_hours"?: string | null,"osm_id"?: number | null,"osm_type"?: string | null,"postcode"?: string | null,"region"?: string | null,"shop"?: string | null,"source"?: string,"street"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "machine_status_live": {
                  Row: {
                    "confirmations": number | null,"denials": number | null,"is_fresh": boolean | null,"last_status": Database["public"]['Enums']["machine_status_level"] | null,"machine_id": number | null,"report_id": number | null,"report_type": Database["public"]['Enums']["report_type"] | null,"reported_at": string | null,"status": Database["public"]['Enums']["machine_status_level"] | null,"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "confirmations"?: number | null,"denials"?: number | null,"is_fresh"?: never,"last_status"?: Database["public"]['Enums']["machine_status_level"] | null,"machine_id"?: number | null,"report_id"?: number | null,"report_type"?: Database["public"]['Enums']["report_type"] | null,"reported_at"?: string | null,"status"?: never,"valid_until"?: string | null
                         }
                        Update: {
                           "confirmations"?: number | null,"denials"?: number | null,"is_fresh"?: never,"last_status"?: Database["public"]['Enums']["machine_status_level"] | null,"machine_id"?: number | null,"report_id"?: number | null,"report_type"?: Database["public"]['Enums']["report_type"] | null,"reported_at"?: string | null,"status"?: never,"valid_until"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "machine_status_machine_id_fkey"
      columns: ["machine_id"]
isOneToOne: true
      referencedRelation: "machines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "machine_status_machine_id_fkey"
      columns: ["machine_id"]
isOneToOne: true
      referencedRelation: "machines_live"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "machine_status_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "machine_reports"
      referencedColumns: ["id"]
    }
                  ]
                },"machines_live": {
                  Row: {
                    "accepts": (Database["public"]['Enums']["packaging"])[] | null,"brand": string | null,"confirmations": number | null,"denials": number | null,"id": number | null,"is_fresh": boolean | null,"last_status": Database["public"]['Enums']["machine_status_level"] | null,"lat": number | null,"lon": number | null,"name": string | null,"operator": string | null,"report_id": number | null,"report_type": Database["public"]['Enums']["report_type"] | null,"reported_at": string | null,"source": string | null,"status": Database["public"]['Enums']["machine_status_level"] | null,"store_id": number | null,"valid_until": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "machine_status_report_id_fkey"
      columns: ["report_id"]
isOneToOne: false
      referencedRelation: "machine_reports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "machines_store_id_fkey"
      columns: ["store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "make_point":
{ Args: { "p_lat": number,"p_lon": number }; Returns: unknown
                           },
"map_points":
{ Args: { "p_accepts"?: (Database["public"]['Enums']["packaging"])[],"p_brands"?: (string)[],"p_limit"?: number,"p_max_lat": number,"p_max_lon": number,"p_min_lat": number,"p_min_lon": number,"p_only_working"?: boolean,"p_store_ids"?: (number)[] }; Returns: {
              "accepts": (Database["public"]['Enums']["packaging"])[],"brand": string,"kind": string,"lat": number,"lon": number,"machine_count": number,"machine_id": number,"name": string,"reported_at": string,"status": Database["public"]['Enums']["machine_status_level"],"store_id": number
            }[]
                           },
"nearest_stores":
{ Args: { "p_lat": number,"p_limit"?: number,"p_lon": number,"p_radius_m"?: number }; Returns: {
              "brand": string,"city": string,"distance_m": number,"housenumber": string,"id": number,"lat": number,"lon": number,"machine_count": number,"machine_id": number,"name": string,"shop": string,"street": string
            }[]
                           },
"recompute_machine_status":
{ Args: { "p_machine_id": number }; Returns: undefined
                           },
"report_machine":
{ Args: { "p_lat": number,"p_lon": number,"p_machine_id": number,"p_type": Database["public"]['Enums']["report_type"] }; Returns: {
              "confirmations": number,
"denials": number,
"machine_id": number,
"report_id": number | null,
"report_type": Database["public"]['Enums']["report_type"] | null,
"reported_at": string | null,
"status": Database["public"]['Enums']["machine_status_level"],
"updated_at": string,
"valid_until": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "machine_status"
        isOneToOne: true
        isSetofReturn: false
      } },
"report_type_level":
{ Args: { "p_type": Database["public"]['Enums']["report_type"] }; Returns: Database["public"]['Enums']["machine_status_level"]
                           },
"review_point_submission":
{ Args: { "p_approve": boolean,"p_id": number }; Returns: {
              "accepts": (Database["public"]['Enums']["packaging"])[],
"brand": string | null,
"created_at": string,
"geom": unknown,
"id": number,
"kind": Database["public"]['Enums']["point_kind"],
"machine_id": number | null,
"name": string | null,
"note": string | null,
"reviewed_at": string | null,
"status": Database["public"]['Enums']["submission_status"],
"store_id": number | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "point_submissions"
        isOneToOne: true
        isSetofReturn: false
      } },
"submit_point":
{ Args: { "p_accepts"?: (Database["public"]['Enums']["packaging"])[],"p_brand"?: string,"p_kind": Database["public"]['Enums']["point_kind"],"p_lat": number,"p_lon": number,"p_machine_id"?: number,"p_name"?: string,"p_note"?: string,"p_store_id"?: number }; Returns: {
              "accepts": (Database["public"]['Enums']["packaging"])[],
"brand": string | null,
"created_at": string,
"geom": unknown,
"id": number,
"kind": Database["public"]['Enums']["point_kind"],
"machine_id": number | null,
"name": string | null,
"note": string | null,
"reviewed_at": string | null,
"status": Database["public"]['Enums']["submission_status"],
"store_id": number | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "point_submissions"
        isOneToOne: true
        isSetofReturn: false
      } },
"top_brands":
{ Args: { "p_limit"?: number }; Returns: {
              "brand": string,"store_count": number
            }[]
                           },
"vote_report":
{ Args: { "p_lat": number,"p_lon": number,"p_report_id": number,"p_still_valid": boolean }; Returns: {
              "confirmations": number,
"denials": number,
"machine_id": number,
"report_id": number | null,
"report_type": Database["public"]['Enums']["report_type"] | null,
"reported_at": string | null,
"status": Database["public"]['Enums']["machine_status_level"],
"updated_at": string,
"valid_until": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "machine_status"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "coupon_status": "active"|"redeemed"|"expired","machine_status_level": "ok"|"warning"|"broken"|"unknown","packaging": "pet"|"can"|"glass","point_kind": "new_machine"|"new_store"|"correction"|"closed","report_type": "ok"|"full"|"rejects"|"no_print"|"off"|"queue","submission_status": "pending"|"approved"|"rejected"
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
  "public": {
          Enums: {
            "coupon_status": ["active", "redeemed", "expired"],"machine_status_level": ["ok", "warning", "broken", "unknown"],"packaging": ["pet", "can", "glass"],"point_kind": ["new_machine", "new_store", "correction", "closed"],"report_type": ["ok", "full", "rejects", "no_print", "off", "queue"],"submission_status": ["pending", "approved", "rejected"]
          }
        }
} as const
