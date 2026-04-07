/**
 * Supabase Database types — generated from the schema.
 * These types provide type safety when querying the database.
 *
 * In production, regenerate these with:
 *   npx supabase gen types typescript --project-id <id> > lib/supabase/types.ts
 */

export interface Database {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string;
          name: string;
          slug: string;
          plan: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          storage_used_bytes: number;
          storage_limit_bytes: number;
          review_link_limit: number;
          designer_seat_limit: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          plan?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          storage_used_bytes?: number;
          storage_limit_bytes?: number;
          review_link_limit?: number;
          designer_seat_limit?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['workspaces']['Insert']>;
      };
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      workspace_members: {
        Row: {
          workspace_id: string;
          user_id: string;
          role: string;
          invited_at: string;
        };
        Insert: {
          workspace_id: string;
          user_id: string;
          role?: string;
          invited_at?: string;
        };
        Update: Partial<Database['public']['Tables']['workspace_members']['Insert']>;
      };
      api_keys: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          name: string;
          key_hash: string;
          key_prefix: string;
          last_used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          name?: string;
          key_hash: string;
          key_prefix: string;
          last_used_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['api_keys']['Insert']>;
      };
      projects: {
        Row: {
          id: string;
          workspace_id: string;
          client_slug: string;
          project_slug: string;
          name: string;
          canvas: string;
          links: Record<string, string>;
          created_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          client_slug: string;
          project_slug: string;
          name: string;
          canvas?: string;
          links?: Record<string, string>;
          created_at?: string;
          archived_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['projects']['Insert']>;
      };
      concepts: {
        Row: {
          id: string;
          project_id: string;
          round_id: string | null;
          label: string;
          slug: string | null;
          description: string;
          position: number;
          visible: boolean;
          canvas_override: unknown | null;
          branched_from: { conceptId: string; versionId: string } | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          round_id?: string | null;
          label: string;
          slug?: string | null;
          description?: string;
          position?: number;
          visible?: boolean;
          canvas_override?: unknown | null;
          branched_from?: { conceptId: string; versionId: string } | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['concepts']['Insert']>;
      };
      versions: {
        Row: {
          id: string;
          concept_id: string;
          number: number;
          file_key: string;
          thumb_key: string | null;
          parent_id: string | null;
          changelog: string;
          visible: boolean;
          starred: boolean;
          file_size: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          concept_id: string;
          number: number;
          file_key: string;
          thumb_key?: string | null;
          parent_id?: string | null;
          changelog?: string;
          visible?: boolean;
          starred?: boolean;
          file_size?: number | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['versions']['Insert']>;
      };
      rounds: {
        Row: {
          id: string;
          project_id: string;
          number: number;
          name: string;
          note: string | null;
          closed_at: string | null;
          selects: { conceptId: string; versionId: string }[];
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          number: number;
          name: string;
          note?: string | null;
          closed_at?: string | null;
          selects?: { conceptId: string; versionId: string }[];
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['rounds']['Insert']>;
      };
      annotations: {
        Row: {
          id: string;
          version_id: string;
          x: number | null;
          y: number | null;
          element: string | null;
          text: string;
          author: string;
          is_client: boolean;
          is_agent: boolean;
          parent_id: string | null;
          resolved: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          version_id: string;
          x?: number | null;
          y?: number | null;
          element?: string | null;
          text: string;
          author?: string;
          is_client?: boolean;
          is_agent?: boolean;
          parent_id?: string | null;
          resolved?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['annotations']['Insert']>;
      };
      client_edits: {
        Row: {
          id: string;
          version_id: string;
          field_name: string;
          original_text: string | null;
          edited_text: string | null;
          author: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          version_id: string;
          field_name: string;
          original_text?: string | null;
          edited_text?: string | null;
          author?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['client_edits']['Insert']>;
      };
      working_sets: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          selections: { conceptId: string; versionId: string }[];
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          selections?: { conceptId: string; versionId: string }[];
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['working_sets']['Insert']>;
      };
      review_links: {
        Row: {
          id: string;
          project_id: string;
          slug: string;
          password_hash: string | null;
          expires_at: string | null;
          round_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          slug: string;
          password_hash?: string | null;
          expires_at?: string | null;
          round_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['review_links']['Insert']>;
      };
      review_views: {
        Row: {
          id: string;
          review_link_id: string;
          version_id: string | null;
          viewer_hash: string | null;
          viewer_agent: string | null;
          duration_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          review_link_id: string;
          version_id?: string | null;
          viewer_hash?: string | null;
          viewer_agent?: string | null;
          duration_ms?: number | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['review_views']['Insert']>;
      };
    };
    Functions: {
      increment_storage: {
        Args: { p_workspace_id: string; p_bytes: number };
        Returns: void;
      };
      is_workspace_member: {
        Args: { p_workspace_id: string };
        Returns: boolean;
      };
      is_workspace_admin: {
        Args: { p_workspace_id: string };
        Returns: boolean;
      };
    };
  };
}
