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
      beds: {
        Row: {
          column_number: number
          created_at: string
          greenhouse_id: string
          id: string
          label: string | null
          row_number: number
        }
        Insert: {
          column_number: number
          created_at?: string
          greenhouse_id: string
          id?: string
          label?: string | null
          row_number: number
        }
        Update: {
          column_number?: number
          created_at?: string
          greenhouse_id?: string
          id?: string
          label?: string | null
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "beds_greenhouse_id_fkey"
            columns: ["greenhouse_id"]
            isOneToOne: false
            referencedRelation: "greenhouses"
            referencedColumns: ["id"]
          },
        ]
      }
      chemicals: {
        Row: {
          available: boolean
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          available?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          available?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      executed_tasks: {
        Row: {
          bed_id: string | null
          completed: boolean | null
          executed_at: string | null
          executed_by: string | null
          id: string
          is_unplanned: boolean | null
          notes: string | null
          task_id: string | null
        }
        Insert: {
          bed_id?: string | null
          completed?: boolean | null
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          is_unplanned?: boolean | null
          notes?: string | null
          task_id?: string | null
        }
        Update: {
          bed_id?: string | null
          completed?: boolean | null
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          is_unplanned?: boolean | null
          notes?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "executed_tasks_bed_id_fkey"
            columns: ["bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "executed_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      greenhouses: {
        Row: {
          columns: number
          created_at: string
          id: string
          name: string
          rows: number
          updated_at: string
        }
        Insert: {
          columns?: number
          created_at?: string
          id?: string
          name: string
          rows?: number
          updated_at?: string
        }
        Update: {
          columns?: number
          created_at?: string
          id?: string
          name?: string
          rows?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      task_definitions: {
        Row: {
          created_at: string | null
          end_week: string | null
          greenhouse_id: string | null
          id: string
          is_permanent: boolean | null
          name: string
          start_week: string | null
          task_type: Database["public"]["Enums"]["task_type"]
        }
        Insert: {
          created_at?: string | null
          end_week?: string | null
          greenhouse_id?: string | null
          id?: string
          is_permanent?: boolean | null
          name: string
          start_week?: string | null
          task_type: Database["public"]["Enums"]["task_type"]
        }
        Update: {
          created_at?: string | null
          end_week?: string | null
          greenhouse_id?: string | null
          id?: string
          is_permanent?: boolean | null
          name?: string
          start_week?: string | null
          task_type?: Database["public"]["Enums"]["task_type"]
        }
        Relationships: [
          {
            foreignKeyName: "task_definitions_greenhouse_id_fkey"
            columns: ["greenhouse_id"]
            isOneToOne: false
            referencedRelation: "greenhouses"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_by: string
          bed_id: string | null
          chemical_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          greenhouse_id: string
          id: string
          is_general: boolean
          notes: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_type: Database["public"]["Enums"]["task_type"]
          week_id: string | null
          week_start: string | null
        }
        Insert: {
          assigned_by: string
          bed_id?: string | null
          chemical_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          greenhouse_id: string
          id?: string
          is_general?: boolean
          notes?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type: Database["public"]["Enums"]["task_type"]
          week_id?: string | null
          week_start?: string | null
        }
        Update: {
          assigned_by?: string
          bed_id?: string | null
          chemical_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          greenhouse_id?: string
          id?: string
          is_general?: boolean
          notes?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: Database["public"]["Enums"]["task_type"]
          week_id?: string | null
          week_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_bed_id_fkey"
            columns: ["bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_chemical_id_fkey"
            columns: ["chemical_id"]
            isOneToOne: false
            referencedRelation: "chemicals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_greenhouse_id_fkey"
            columns: ["greenhouse_id"]
            isOneToOne: false
            referencedRelation: "greenhouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weeks: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          is_locked: boolean | null
          start_date: string
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          is_locked?: boolean | null
          start_date: string
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          is_locked?: boolean | null
          start_date?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "engineer" | "supervisor"
      task_status: "pending" | "completed"
      task_type: "cortar" | "fertilizar" | "quimicos" | "poscosecha"
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
      app_role: ["admin", "engineer", "supervisor"],
      task_status: ["pending", "completed"],
      task_type: ["cortar", "fertilizar", "quimicos", "poscosecha"],
    },
  },
} as const
