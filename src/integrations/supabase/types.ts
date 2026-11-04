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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      deliveries: {
        Row: {
          bowler: string
          created_at: string
          created_by: string
          extra_type: string
          extras: number
          id: string
          innings: number
          match_id: string
          non_striker: string
          runs_bat: number
          seq: number
          striker: string
          wicket: Json | null
        }
        Insert: {
          bowler: string
          created_at?: string
          created_by?: string
          extra_type?: string
          extras?: number
          id: string
          innings: number
          match_id: string
          non_striker: string
          runs_bat?: number
          seq: number
          striker: string
          wicket?: Json | null
        }
        Update: {
          bowler?: string
          created_at?: string
          created_by?: string
          extra_type?: string
          extras?: number
          id?: string
          innings?: number
          match_id?: string
          non_striker?: string
          runs_bat?: number
          seq?: number
          striker?: string
          wicket?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_scorers: {
        Row: {
          email: string | null
          match_id: string
          user_id: string
        }
        Insert: {
          email?: string | null
          match_id: string
          user_id: string
        }
        Update: {
          email?: string | null
          match_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_scorers_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          balls_per_over: number
          created_at: string
          created_by: string
          id: string
          live: Json
          match_date: string | null
          name: string
          overs: number
          players_per_team: number
          result: string | null
          rules: Json
          score_revision: number
          status: string
          team_a: string
          team_a_id: string | null
          team_a_players: string[]
          team_b: string
          team_b_id: string | null
          team_b_players: string[]
          toss_decision: string | null
          toss_winner: string | null
          tournament_id: string | null
          updated_at: string
          venue: string | null
        }
        Insert: {
          balls_per_over?: number
          created_at?: string
          created_by?: string
          id?: string
          live?: Json
          match_date?: string | null
          name: string
          overs?: number
          players_per_team?: number
          result?: string | null
          rules?: Json
          score_revision?: number
          status?: string
          team_a: string
          team_a_id?: string | null
          team_a_players?: string[]
          team_b: string
          team_b_id?: string | null
          team_b_players?: string[]
          toss_decision?: string | null
          toss_winner?: string | null
          tournament_id?: string | null
          updated_at?: string
          venue?: string | null
        }
        Update: {
          balls_per_over?: number
          created_at?: string
          created_by?: string
          id?: string
          live?: Json
          match_date?: string | null
          name?: string
          overs?: number
          players_per_team?: number
          result?: string | null
          rules?: Json
          score_revision?: number
          status?: string
          team_a?: string
          team_a_id?: string | null
          team_a_players?: string[]
          team_b?: string
          team_b_id?: string | null
          team_b_players?: string[]
          toss_decision?: string | null
          toss_winner?: string | null
          tournament_id?: string | null
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      score_operations: {
        Row: {
          actor_id: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: string
          kind: string
          match_id: string
          reason: string | null
          revision: number
        }
        Insert: {
          actor_id: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id: string
          kind: string
          match_id: string
          reason?: string | null
          revision: number
        }
        Update: {
          actor_id?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          kind?: string
          match_id?: string
          reason?: string | null
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "score_operations_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_teams: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          players: string[]
          short_name: string | null
          tournament_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          players?: string[]
          short_name?: string | null
          tournament_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          players?: string[]
          short_name?: string | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          accent_color: string
          balls_per_over: number
          created_at: string
          created_by: string
          id: string
          logo_url: string | null
          name: string
          overs: number
          players_per_team: number
          points_loss: number
          points_tie: number
          points_win: number
          primary_color: string
          rules: Json
          short_name: string | null
        }
        Insert: {
          accent_color?: string
          balls_per_over?: number
          created_at?: string
          created_by?: string
          id?: string
          logo_url?: string | null
          name: string
          overs?: number
          players_per_team?: number
          points_loss?: number
          points_tie?: number
          points_win?: number
          primary_color?: string
          rules?: Json
          short_name?: string | null
        }
        Update: {
          accent_color?: string
          balls_per_over?: number
          created_at?: string
          created_by?: string
          id?: string
          logo_url?: string | null
          name?: string
          overs?: number
          players_per_team?: number
          points_loss?: number
          points_tie?: number
          points_win?: number
          primary_color?: string
          rules?: Json
          short_name?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_score_operation: {
        Args: {
          _delivery: Json
          _expected: number
          _id: string
          _kind: string
          _match: string
          _patch: Json
          _reason: string
        }
        Returns: Json
      }
      assign_scorer: {
        Args: { _email: string; _match: string }
        Returns: undefined
      }
      can_score: { Args: { _match: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_match_owner: { Args: { _match: string }; Returns: boolean }
      is_tournament_owner: { Args: { _t: string }; Returns: boolean }
      scoring_snapshot: { Args: { _match: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
    },
  },
} as const
