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
          scheduled_time: string | null
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
          scheduled_time?: string | null
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
          scheduled_time?: string | null
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
      tournament_groups: {
        Row: { id: string; tournament_id: string; name: string; team_ids: string[]; created_at: string }
        Insert: { id?: string; tournament_id: string; name: string; team_ids?: string[]; created_at?: string }
        Update: { id?: string; tournament_id?: string; name?: string; team_ids?: string[]; created_at?: string }
        Relationships: []
      }
      tournament_teams: {
        Row: {
          logo_url: string | null
          captain: string | null
          vice_captain?: string | null
          color: string
          created_at: string
          id: string
          name: string
          players: string[]
          short_name: string | null
          tournament_id: string
        }
        Insert: {
          logo_url?: string | null
          captain?: string | null
          vice_captain?: string | null
          color?: string
          created_at?: string
          id?: string
          name: string
          players?: string[]
          short_name?: string | null
          tournament_id: string
        }
        Update: {
          logo_url?: string | null
          captain?: string | null
          vice_captain?: string | null
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
          platform_hidden?: boolean
          platform_disabled?: boolean
          platform_archived?: boolean
          platform_deleted_at?: string | null
          location: string | null
          description: string | null
          start_date: string | null
          end_date: string | null
          competition_format: string
          ranking_rule: string
          points_no_result: number
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
          location?: string | null
          description?: string | null
          start_date?: string | null
          end_date?: string | null
          competition_format?: string
          ranking_rule?: string
          points_no_result?: number
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
          location?: string | null
          description?: string | null
          start_date?: string | null
          end_date?: string | null
          competition_format?: string
          ranking_rule?: string
          points_no_result?: number
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
      platform_other_matches: { Args: { _search?: string; _state?: string; _page?: number }; Returns: Json };
      platform_other_match_details: { Args: { _match: string }; Returns: Json };
      platform_manage_other_match: { Args: { _match: string; _action: string; _reason?: string; _confirmation?: string; _owner?: string }; Returns: undefined };
      platform_settings_read: { Args: Record<string, never>; Returns: Json };
      public_platform_configuration: { Args: Record<string, never>; Returns: Json };
      platform_settings_save: { Args: { _values: Json; _features: Json; _revision: string; _reason?: string }; Returns: undefined };
      platform_bulk_defaults: { Args: { _confirm: string; _revision: string }; Returns: undefined };
      platform_announcements_read: { Args: { _public?: boolean }; Returns: Json };
      platform_announcement_save: { Args: { _id: string | null; _value: Json; _delete?: boolean }; Returns: undefined };
      read_feature_access: { Args: { _match?: string; _t?: string }; Returns: Json }
      platform_feature_details: { Args: { _target: string }; Returns: Json }
      platform_save_features: { Args: { _target: string; _values: Json; _reset?: boolean }; Returns: undefined }
      platform_tournament_directory: { Args: { _search?: string; _status?: string; _visibility?: string; _organizer?: string; _sort?: string; _page?: number }; Returns: Json };
      platform_tournament_details: { Args: { _t: string }; Returns: Json };
      platform_transfer_candidates: { Args: { _search?: string }; Returns: Json };
      platform_manage_tournament: { Args: { _t: string; _action: string; _values?: Json; _reason?: string; _confirmation?: string }; Returns: undefined };
      account_access: { Args: Record<string, never>; Returns: boolean };
      platform_user_directory: { Args: { _search: string; _role: string; _status: string; _sort: string; _page: number }; Returns: Json };
      platform_user_details: { Args: { _target: string }; Returns: Json };
      platform_manage_user: { Args: { _target: string; _action: string; _name?: string; _avatar?: string; _reason?: string }; Returns: undefined };

      platform_role: { Args: Record<string, never>; Returns: string };
      platform_overview: { Args: Record<string, never>; Returns: Json };
      read_tournament_presentation: { Args: { _t: string }; Returns: Json };
      set_tournament_presentation: { Args: { _t: string; _playing: boolean; _seconds: number }; Returns: undefined };
      playoff_context: { Args: { _t: string }; Returns: Json }
      save_playoff_draw: { Args: { _t: string; _draw: Json; _approve: boolean; _token: string }; Returns: undefined }
      sync_playoff_fixtures: { Args: { _t: string; _token: string; _winners: Json }; Returns: number }
      decide_playoff_tie: { Args: { _t: string; _node: string; _team: string; _reason: string; _token: string }; Returns: undefined }
      read_match_award: {
        Args: { _match: string }
        Returns: Json
      }
      read_live_match: { Args: { _match: string }; Returns: Json }
      read_live_tournament_matches: { Args: { _tournament: string }; Returns: Json }
      publish_match_award: {
        Args: { _match: string; _expected: number }
        Returns: Json
      }
      fixture_generator_context: { Args: { _t: string; _group: string }; Returns: Json }
      create_generated_fixtures: { Args: { _t: string; _group: string; _mode: string; _target: number; _token: string; _pairs: Json; _request: string }; Returns: string[] }
      match_format_supported: { Args: Record<PropertyKey, never>; Returns: boolean }
      edit_scheduled_match: {
        Args: { _match: string; _expected: number; _date: string | null; _time: string | null; _venue: string | null }
        Returns: undefined
      }
      delete_scheduled_match: {
        Args: { _match: string }
        Returns: undefined
      }
      save_tournament_group: { Args: { _t: string; _id: string | null; _name: string; _teams: string[] }; Returns: string }
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
