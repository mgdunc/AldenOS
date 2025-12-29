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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      customers: {
        Row: {
          billing_address: Json | null
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          shipping_address: Json | null
          updated_at: string
        }
        Insert: {
          billing_address?: Json | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          shipping_address?: Json | null
          updated_at?: string
        }
        Update: {
          billing_address?: Json | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          shipping_address?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      fulfillment_lines: {
        Row: {
          fulfillment_id: string | null
          id: string
          location_id: string | null
          quantity: number | null
          sales_order_line_id: string | null
        }
        Insert: {
          fulfillment_id?: string | null
          id?: string
          location_id?: string | null
          quantity?: number | null
          sales_order_line_id?: string | null
        }
        Update: {
          fulfillment_id?: string | null
          id?: string
          location_id?: string | null
          quantity?: number | null
          sales_order_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_lines_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: false
            referencedRelation: "fulfillments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_lines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_lines_sales_order_line_id_fkey"
            columns: ["sales_order_line_id"]
            isOneToOne: false
            referencedRelation: "sales_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillments: {
        Row: {
          carrier: string | null
          created_at: string | null
          fulfillment_number: string | null
          id: string
          sales_order_id: string | null
          shipped_at: string | null
          status: string | null
          tracking_number: string | null
        }
        Insert: {
          carrier?: string | null
          created_at?: string | null
          fulfillment_number?: string | null
          id?: string
          sales_order_id?: string | null
          shipped_at?: string | null
          status?: string | null
          tracking_number?: string | null
        }
        Update: {
          carrier?: string | null
          created_at?: string | null
          fulfillment_number?: string | null
          id?: string
          sales_order_id?: string | null
          shipped_at?: string | null
          status?: string | null
          tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fulfillments_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillments_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders_with_customer"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          created_at: string | null
          error_count: number | null
          errors: Json | null
          filename: string | null
          id: string
          status: string
          success_count: number | null
          total_rows: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_count?: number | null
          errors?: Json | null
          filename?: string | null
          id?: string
          status?: string
          success_count?: number | null
          total_rows?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_count?: number | null
          errors?: Json | null
          filename?: string | null
          id?: string
          status?: string
          success_count?: number | null
          total_rows?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      integration_logs: {
        Row: {
          created_at: string | null
          details: Json | null
          event_type: string | null
          id: string
          integration_id: string | null
          level: string | null
          message: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          event_type?: string | null
          id?: string
          integration_id?: string | null
          level?: string | null
          message?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          event_type?: string | null
          id?: string
          integration_id?: string | null
          level?: string | null
          message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          integration_id: string | null
          integration_type: string
          job_type: string
          metadata: Json | null
          processed_items: number | null
          queue_id: string | null
          status: string
          total_items: number | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          integration_id?: string | null
          integration_type: string
          job_type?: string
          metadata?: Json | null
          processed_items?: number | null
          queue_id?: string | null
          status?: string
          total_items?: number | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          integration_id?: string | null
          integration_type?: string
          job_type?: string
          metadata?: Json | null
          processed_items?: number | null
          queue_id?: string | null
          status?: string
          total_items?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_jobs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_jobs_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "sync_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_unmatched_products: {
        Row: {
          cost: number | null
          created_at: string | null
          data: Json | null
          external_product_id: string | null
          external_variant_id: string | null
          id: string
          integration_id: string | null
          name: string | null
          price: number | null
          sku: string | null
          variant_name: string | null
        }
        Insert: {
          cost?: number | null
          created_at?: string | null
          data?: Json | null
          external_product_id?: string | null
          external_variant_id?: string | null
          id?: string
          integration_id?: string | null
          name?: string | null
          price?: number | null
          sku?: string | null
          variant_name?: string | null
        }
        Update: {
          cost?: number | null
          created_at?: string | null
          data?: Json | null
          external_product_id?: string | null
          external_variant_id?: string | null
          id?: string
          integration_id?: string | null
          name?: string | null
          price?: number | null
          sku?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_unmatched_products_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string | null
          provider: string
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          provider: string
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          provider?: string
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      inventory_ledger: {
        Row: {
          change_available: number | null
          change_on_order: number | null
          change_qoh: number | null
          change_reserved: number | null
          created_at: string | null
          id: string
          idempotency_key: string | null
          import_job_id: string | null
          location_id: string
          notes: string | null
          product_id: string
          reference_id: string | null
          transaction_type: string
          user_id: string | null
        }
        Insert: {
          change_available?: number | null
          change_on_order?: number | null
          change_qoh?: number | null
          change_reserved?: number | null
          created_at?: string | null
          id?: string
          idempotency_key?: string | null
          import_job_id?: string | null
          location_id: string
          notes?: string | null
          product_id: string
          reference_id?: string | null
          transaction_type: string
          user_id?: string | null
        }
        Update: {
          change_available?: number | null
          change_on_order?: number | null
          change_qoh?: number | null
          change_reserved?: number | null
          created_at?: string | null
          id?: string
          idempotency_key?: string | null
          import_job_id?: string | null
          location_id?: string
          notes?: string | null
          product_id?: string
          reference_id?: string | null
          transaction_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_ledger_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_receipt_lines: {
        Row: {
          id: string
          location_id: string | null
          product_id: string | null
          quantity_received: number
          receipt_id: string | null
        }
        Insert: {
          id?: string
          location_id?: string | null
          product_id?: string | null
          quantity_received: number
          receipt_id?: string | null
        }
        Update: {
          id?: string
          location_id?: string | null
          product_id?: string | null
          quantity_received?: number
          receipt_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_receipt_lines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_receipt_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_receipt_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_receipt_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_receipt_lines_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "inventory_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_receipts: {
        Row: {
          attachment_url: string | null
          id: string
          notes: string | null
          purchase_order_id: string | null
          receipt_number: string | null
          received_at: string | null
          received_by: string | null
        }
        Insert: {
          attachment_url?: string | null
          id?: string
          notes?: string | null
          purchase_order_id?: string | null
          receipt_number?: string | null
          received_at?: string | null
          received_by?: string | null
        }
        Update: {
          attachment_url?: string | null
          id?: string
          notes?: string | null
          purchase_order_id?: string | null
          receipt_number?: string | null
          received_at?: string | null
          received_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_receipts_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles_view"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_snapshots: {
        Row: {
          available: number | null
          last_updated: string | null
          location_id: string
          on_order: number | null
          product_id: string
          qoh: number | null
          reserved: number | null
          updated_at: string | null
        }
        Insert: {
          available?: number | null
          last_updated?: string | null
          location_id: string
          on_order?: number | null
          product_id: string
          qoh?: number | null
          reserved?: number | null
          updated_at?: string | null
        }
        Update: {
          available?: number | null
          last_updated?: string | null
          location_id?: string
          on_order?: number | null
          product_id?: string
          qoh?: number | null
          reserved?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_snapshots_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          is_sellable: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_sellable?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_sellable?: boolean | null
          name?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          content: string
          created_at: string | null
          id: string
          product_id: string | null
          purchase_order_id: string | null
          sales_order_id: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          product_id?: string | null
          purchase_order_id?: string | null
          sales_order_id?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          product_id?: string | null
          purchase_order_id?: string | null
          sales_order_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "notes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders_with_customer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_view"
            referencedColumns: ["id"]
          },
        ]
      }
      product_integrations: {
        Row: {
          created_at: string | null
          external_inventory_item_id: string | null
          external_product_id: string | null
          external_variant_id: string | null
          id: string
          integration_id: string
          last_synced_at: string | null
          product_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          external_inventory_item_id?: string | null
          external_product_id?: string | null
          external_variant_id?: string | null
          id?: string
          integration_id: string
          last_synced_at?: string | null
          product_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          external_inventory_item_id?: string | null
          external_product_id?: string | null
          external_variant_id?: string | null
          id?: string
          integration_id?: string
          last_synced_at?: string | null
          product_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_integrations_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_integrations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_integrations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_integrations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          attributes: Json | null
          barcode: string | null
          carton_barcode: string | null
          carton_qty: number | null
          compare_at_price: number | null
          cost_price: number | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          list_price: number | null
          name: string
          price_cost: number | null
          product_type: string | null
          reorder_point: number | null
          retail_price: number | null
          shopify_inventory_item_id: number | null
          shopify_product_id: number | null
          shopify_variant_id: number | null
          sku: string
          status: string | null
          supplier_id: string | null
          supplier_sku: string | null
          supplier_stock: number | null
          updated_at: string | null
          vendor: string | null
        }
        Insert: {
          attributes?: Json | null
          barcode?: string | null
          carton_barcode?: string | null
          carton_qty?: number | null
          compare_at_price?: number | null
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          list_price?: number | null
          name: string
          price_cost?: number | null
          product_type?: string | null
          reorder_point?: number | null
          retail_price?: number | null
          shopify_inventory_item_id?: number | null
          shopify_product_id?: number | null
          shopify_variant_id?: number | null
          sku: string
          status?: string | null
          supplier_id?: string | null
          supplier_sku?: string | null
          supplier_stock?: number | null
          updated_at?: string | null
          vendor?: string | null
        }
        Update: {
          attributes?: Json | null
          barcode?: string | null
          carton_barcode?: string | null
          carton_qty?: number | null
          compare_at_price?: number | null
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          list_price?: number | null
          name?: string
          price_cost?: number | null
          product_type?: string | null
          reorder_point?: number | null
          retail_price?: number | null
          shopify_inventory_item_id?: number | null
          shopify_product_id?: number | null
          shopify_variant_id?: number | null
          sku?: string
          status?: string | null
          supplier_id?: string | null
          supplier_sku?: string | null
          supplier_stock?: number | null
          updated_at?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          role: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles_view"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          created_at: string | null
          id: string
          product_id: string | null
          purchase_order_id: string | null
          quantity_ordered: number
          quantity_received: number | null
          unit_cost: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          purchase_order_id?: string | null
          quantity_ordered: number
          quantity_received?: number | null
          unit_cost?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          purchase_order_id?: string | null
          quantity_ordered?: number
          quantity_received?: number | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          attachment_url: string | null
          created_at: string | null
          expected_date: string | null
          id: string
          po_number: string
          status: string | null
          supplier_id: string | null
          supplier_name: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string | null
          expected_date?: string | null
          id?: string
          po_number?: string
          status?: string | null
          supplier_id?: string | null
          supplier_name: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string | null
          expected_date?: string | null
          id?: string
          po_number?: string
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_lines: {
        Row: {
          created_at: string
          id: string
          line_total: number | null
          location_id: string | null
          product_id: string
          quantity_allocated: number | null
          quantity_fulfilled: number | null
          quantity_ordered: number
          sales_order_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number | null
          location_id?: string | null
          product_id: string
          quantity_allocated?: number | null
          quantity_fulfilled?: number | null
          quantity_ordered: number
          sales_order_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number | null
          location_id?: string | null
          product_id?: string
          quantity_allocated?: number | null
          quantity_fulfilled?: number | null
          quantity_ordered?: number
          sales_order_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_lines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sales_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders_with_customer"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          billing_address: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          dispatch_date: string | null
          id: string
          is_open: boolean | null
          order_number: string
          reserved_inventory: boolean | null
          shipping_address: string | null
          shopify_order_id: number | null
          status: string
          total_amount: number | null
        }
        Insert: {
          billing_address?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          dispatch_date?: string | null
          id?: string
          is_open?: boolean | null
          order_number?: string
          reserved_inventory?: boolean | null
          shipping_address?: string | null
          shopify_order_id?: number | null
          status?: string
          total_amount?: number | null
        }
        Update: {
          billing_address?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          dispatch_date?: string | null
          id?: string
          is_open?: boolean | null
          order_number?: string
          reserved_inventory?: boolean | null
          shipping_address?: string | null
          shopify_order_id?: number | null
          status?: string
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_commitments: {
        Row: {
          created_at: string | null
          id: string
          product_id: string | null
          quantity: number
          sales_order_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          quantity: number
          sales_order_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          quantity?: number
          sales_order_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_commitments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_commitments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_commitments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_commitments_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_commitments_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders_with_customer"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          contact_name: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      sync_queue: {
        Row: {
          checkpoint: Json | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          error_type: string | null
          id: string
          integration_id: string
          last_heartbeat: string | null
          max_retries: number
          metadata: Json | null
          priority: number
          retry_count: number
          started_at: string | null
          status: string
          sync_type: string
        }
        Insert: {
          checkpoint?: Json | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          error_type?: string | null
          id?: string
          integration_id: string
          last_heartbeat?: string | null
          max_retries?: number
          metadata?: Json | null
          priority?: number
          retry_count?: number
          started_at?: string | null
          status?: string
          sync_type: string
        }
        Update: {
          checkpoint?: Json | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          error_type?: string | null
          id?: string
          integration_id?: string
          last_heartbeat?: string | null
          max_retries?: number
          metadata?: Json | null
          priority?: number
          retry_count?: number
          started_at?: string | null
          status?: string
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_queue_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_queue_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          created_at: string | null
          details: Json | null
          id: string
          level: string
          message: string
          source: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          id?: string
          level: string
          message: string
          source: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          id?: string
          level?: string
          message?: string
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      location_inventory_view: {
        Row: {
          location_id: string | null
          location_name: string | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          sku: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_ledger_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory_view"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_inventory_view: {
        Row: {
          available: number | null
          barcode: string | null
          carton_qty: number | null
          compare_at_price: number | null
          cost_price: number | null
          demand: number | null
          description: string | null
          id: string | null
          image_url: string | null
          list_price: number | null
          name: string | null
          net_required: number | null
          on_order: number | null
          price_cost: number | null
          product_id: string | null
          product_type: string | null
          qoh: number | null
          reorder_point: number | null
          reserved: number | null
          retail_price: number | null
          sku: string | null
          status: string | null
          vendor: string | null
        }
        Relationships: []
      }
      profiles_view: {
        Row: {
          email: string | null
          full_name: string | null
          id: string | null
        }
        Insert: {
          email?: string | null
          full_name?: never
          id?: string | null
        }
        Update: {
          email?: string | null
          full_name?: never
          id?: string | null
        }
        Relationships: []
      }
      sales_orders_with_customer: {
        Row: {
          billing_address: string | null
          created_at: string | null
          customer_billing_address: Json | null
          customer_company: string | null
          customer_email_ref: string | null
          customer_id: string | null
          customer_name: string | null
          customer_name_ref: string | null
          customer_phone_ref: string | null
          customer_shipping_address: Json | null
          dispatch_date: string | null
          id: string | null
          is_open: boolean | null
          order_number: string | null
          reserved_inventory: boolean | null
          shipping_address: string | null
          shopify_order_id: number | null
          status: string | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string | null
          type: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_stock: {
        Args: {
          p_location_id: string
          p_product_id: string
          p_quantity: number
          p_reason: string
        }
        Returns: Json
      }
      allocate_inventory_and_confirm_order:
        | { Args: { p_new_status: string; p_order_id: string }; Returns: Json }
        | {
            Args: {
              p_idempotency_key?: string
              p_new_status: string
              p_order_id: string
            }
            Returns: Json
          }
      allocate_line_item:
        | { Args: { p_line_id: string }; Returns: Json }
        | {
            Args: { p_idempotency_key?: string; p_line_id: string }
            Returns: Json
          }
      book_in_stock:
        | {
            Args: {
              p_location_id: string
              p_notes: string
              p_product_id: string
              p_quantity: number
              p_reference_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_idempotency_key?: string
              p_location_id: string
              p_notes: string
              p_product_id: string
              p_quantity: number
              p_reference_id: string
            }
            Returns: undefined
          }
      cancel_fulfillment_and_return_stock: {
        Args: { p_fulfillment_id: string; p_idempotency_key?: string }
        Returns: undefined
      }
      create_fulfillment_and_reallocate:
        | { Args: { p_items: Json; p_order_id: string }; Returns: string }
        | {
            Args: {
              p_idempotency_key?: string
              p_items: Json
              p_order_id: string
            }
            Returns: string
          }
      get_line_fulfillment_qty: {
        Args: { p_order_id: string }
        Returns: {
          line_id: string
          qty_in_fulfillment: number
          qty_shipped: number
        }[]
      }
      get_order_allocations: {
        Args: { p_order_id: string }
        Returns: {
          product_id: string
          total_reserved: number
        }[]
      }
      get_product_stats: { Args: never; Returns: Json }
      get_sync_health_stats: {
        Args: { p_integration_id?: string }
        Returns: {
          avg_duration_seconds: number
          failed_syncs: number
          integration_id: string
          last_failed_sync: string
          last_successful_sync: string
          success_rate: number
          successful_syncs: number
          total_syncs: number
        }[]
      }
      handle_po: {
        Args: {
          p_location_id: string
          p_product_id: string
          p_quantity: number
          p_reference: string
          p_type: string
        }
        Returns: undefined
      }
      import_unmatched_products: {
        Args: { p_supplier_id?: string; p_unmatched_ids: string[] }
        Returns: number
      }
      increment_po_line_received: {
        Args: { p_line_id: string; p_qty: number }
        Returns: undefined
      }
      log_system_event: {
        Args: {
          p_details?: Json
          p_level: string
          p_message: string
          p_source: string
        }
        Returns: undefined
      }
      process_fulfillment_shipment:
        | { Args: { p_fulfillment_id: string }; Returns: undefined }
        | {
            Args: { p_fulfillment_id: string; p_idempotency_key?: string }
            Returns: undefined
          }
      process_inventory_import: {
        Args: { p_items: Json; p_job_id: string }
        Returns: undefined
      }
      process_location_import: {
        Args: { p_items: Json; p_job_id: string }
        Returns: undefined
      }
      process_product_import: {
        Args: { p_items: Json; p_job_id: string }
        Returns: undefined
      }
      receive_purchase_order: {
        Args: { p_items: Json; p_po_id: string; p_user_id: string }
        Returns: Json
      }
      receive_purchase_order_all: {
        Args: { p_po_id: string }
        Returns: undefined
      }
      reset_stale_sync_jobs: { Args: never; Returns: number }
      revert_fulfillment_shipment: {
        Args: { p_fulfillment_id: string; p_idempotency_key?: string }
        Returns: undefined
      }
      revert_inventory_receipt: {
        Args: { p_receipt_id: string }
        Returns: undefined
      }
      revert_line_allocation:
        | { Args: { p_line_id: string }; Returns: Json }
        | {
            Args: { p_idempotency_key?: string; p_line_id: string }
            Returns: Json
          }
      ship_fulfillment: {
        Args: { p_fulfillment_id: string; p_user_id: string }
        Returns: Json
      }
      ship_sales_order_items: {
        Args: { p_items: Json; p_order_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      update_order_status_with_revert: {
        Args: { p_new_status: string; p_order_id: string }
        Returns: undefined
      }
      update_sales_order_status_after_allocation: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      update_sales_order_status_after_shipment: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      update_sales_order_status_from_fulfillment: {
        Args: { p_order_id: string }
        Returns: undefined
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
    Enums: {},
  },
} as const
