# AldenOS Copilot Instructions

## Project Context
AldenOS is a Warehouse Management System (WMS) built with **Vue 3**, **Vite**, **TypeScript**, and **Supabase**.
The UI library is **PrimeVue** with **PrimeFlex** for utility classes.

## Architecture & Structure
- **Domain-Driven Design:** The codebase is organized by business domains in `src/modules/`. Each folder must be self-contained.
  - `src/modules/{domain}/views`: Page-level components (kebab-case).
  - `src/modules/{domain}/components`: Domain-specific components.
  - `src/modules/{domain}/composables`: Domain-specific logic.
  - `src/modules/{domain}/routes.ts`: Exports module routes.
  - `src/modules/{domain}/store.ts`: Pinia store for module state.
  - **Domains:** `core`, `inventory`, `sales`, `purchasing`, `receiving`, `fulfillment`.
- **Inter-Module Communication:** Modules must NEVER import components from other modules, with the exception of `src/modules/core` which contains shared domain logic (Timeline, Users). Use Composables or Stores for interaction to maintain "plug-and-play" architecture.
- **Shared Resources:**
  - `src/lib/`: Core utilities (e.g., `supabase.ts` client).
  - `src/composables/`: Generic reusable logic.
  - `src/components/`: Generic, cross-domain UI components.
- **Routing:** `src/router/index.ts` aggregates routes from module `routes.ts` files.

## Database & Backend
- **Supabase:** Used for Auth, Database, and Realtime.
- **Migrations:** Located in `supabase/migrations/`. Format: `YYYYMMDDHHMMSS_description.sql`.
- **Referential Integrity:** Use CHECK constraints (e.g., `quantity >= 0`) at the DB level to ensure data validity.
- **RPCs:** Complex business logic (allocations, inventory updates, bulk imports) is often implemented as PostgreSQL functions (RPCs) rather than frontend code.
  - Example: `allocate_inventory_and_confirm_order`, `process_inventory_import`.
- **Client:** Import the typed client from `@/lib/supabase`.

## Testing Strategy
- **Location:** Place test files alongside the code (e.g., `src/modules/inventory/composables/useInventory.spec.ts`).
- **Mocks:** Always mock the Supabase client in Vitest to avoid real network calls.
- **Inventory Logic:** For any new inventory logic, create a corresponding test case to verify the "math" remains accurate.
- **Tools:** Vitest, JSDOM, @vue/test-utils, @pinia/testing.

## Development Workflow
- **Package Manager:** `npm`.
- **Dev Server:** `npm run dev`.
- **Database Changes:**
  - Create migration: `supabase migration new description_of_change`.
  - Apply locally: `supabase migration up`.
  - Reset local DB: `supabase db reset`.
- **Terminal:** Use `zsh` syntax for commands.

## Coding Conventions
- **Vue:** Use `<script setup lang="ts">`.
- **Styling:** Prefer **PrimeFlex** utility classes (e.g., `flex`, `justify-content-between`, `mb-4`) over custom CSS.
- **High Contrast:** Use PrimeVue "Success" (Green) and "Danger" (Red) semantically for immediate visual feedback on the floor.
- **State:** Use Composables for component logic and Pinia for global state.
- **Async:** Handle loading states explicitly (`loading`, `processing` refs) and use `PrimeVue` Toast for user feedback.
- **Interaction:** Do NOT use native browser dialogs (`alert`, `confirm`, `prompt`).
  - Use `useConfirm()` for destructive actions.
  - Use `useToast()` for all process completions.
- **Validation:** Use **Zod** for complex schema validation (especially for imports/forms).
- **Formatting:** Follow the existing Prettier/ESLint configuration.

## Key Patterns
- **Data Fetching:** Fetch data in `onMounted` or `watch` effects. Use `Promise.all` for parallel requests.
- **Inventory Logic (The Ledger Law):** Inventory availability is often calculated via database views (e.g., `product_inventory_view`) or RPCs to ensure consistency.
- **Order State:** Orders should generally only be editable (adding/removing items, changing quantities) when in `draft` status.
- **Addresses:** Stored as `jsonb` in the database (e.g., `billing_address`, `shipping_address`). Use `AddressInput.vue` for editing.
- **Communication Layer:**
  - Uses a polymorphic `notes` table (linked to `product_id`, `sales_order_id`, etc.).
  - Uses a unified `timeline_events` view to merge system ledger events with user notes.
  - Frontend uses `TimelineSidebar.vue` (in `core`) and Tiptap editor.
- **Data Import (Sandbox Pattern):**
  - Flow: Upload -> Map Columns -> Validate (Zod) -> Commit.
  - Uses `import_jobs` table to track status and errors.
  - Uses `process_inventory_import` RPC for stock adjustments.
  - Uses `process_product_import` RPC for product catalog upserts.
