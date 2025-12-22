import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Creates a mock Supabase client for testing
 * Usage: const mockSupabase = createMockSupabase()
 */
export function createMockSupabase() {
  const mockSelect = vi.fn().mockReturnThis()
  const mockInsert = vi.fn().mockReturnThis()
  const mockUpdate = vi.fn().mockReturnThis()
  const mockDelete = vi.fn().mockReturnThis()
  const mockEq = vi.fn().mockReturnThis()
  const mockNeq = vi.fn().mockReturnThis()
  const mockGt = vi.fn().mockReturnThis()
  const mockLt = vi.fn().mockReturnThis()
  const mockGte = vi.fn().mockReturnThis()
  const mockLte = vi.fn().mockReturnThis()
  const mockIn = vi.fn().mockReturnThis()
  const mockOr = vi.fn().mockReturnThis()
  const mockOrder = vi.fn().mockReturnThis()
  const mockLimit = vi.fn().mockReturnThis()
  const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null })
  const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })

  const mockFrom = vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    eq: mockEq,
    neq: mockNeq,
    gt: mockGt,
    lt: mockLt,
    gte: mockGte,
    lte: mockLte,
    in: mockIn,
    or: mockOr,
    order: mockOrder,
    limit: mockLimit,
    single: mockSingle,
    maybeSingle: mockMaybeSingle
  }))

  const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null })

  const mockAuth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    signIn: vi.fn().mockResolvedValue({ data: null, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } }
    }))
  }

  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe: vi.fn()
  }

  const mockClient = {
    from: mockFrom,
    rpc: mockRpc,
    auth: mockAuth,
    channel: vi.fn(() => mockChannel)
  } as unknown as SupabaseClient

  return {
    client: mockClient,
    mocks: {
      from: mockFrom,
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      eq: mockEq,
      neq: mockNeq,
      gt: mockGt,
      lt: mockLt,
      gte: mockGte,
      lte: mockLte,
      in: mockIn,
      or: mockOr,
      order: mockOrder,
      limit: mockLimit,
      single: mockSingle,
      maybeSingle: mockMaybeSingle,
      rpc: mockRpc,
      auth: mockAuth,
      channel: mockChannel
    }
  }
}

/**
 * Helper to create a successful query response
 */
export function createSuccessResponse<T>(data: T) {
  return { data, error: null }
}

/**
 * Helper to create an error response
 */
export function createErrorResponse(message: string) {
  return { data: null, error: { message, code: 'ERROR' } }
}

/**
 * Mock toast notifications
 */
export function createMockToast() {
  return {
    add: vi.fn(),
    removeAllGroups: vi.fn(),
    removeGroup: vi.fn()
  }
}
