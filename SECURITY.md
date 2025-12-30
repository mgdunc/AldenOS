# Security Guidelines

## 🔒 Environment Variables

### Required Variables

The following environment variables are required for the application to function:

- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anonymous/public key (safe for client-side)

### Edge Functions

Supabase Edge Functions require:
- `SUPABASE_URL` - Automatically provided by Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Automatically provided by Supabase (never expose in client code)

**Note:** Edge functions automatically validate these environment variables and will fail with clear error messages if they are missing.

## 🚨 Security Best Practices

### 1. Never Commit Secrets

- ✅ `.env` files are in `.gitignore`
- ✅ `.env.example` is provided as a template
- ❌ Never commit actual `.env` files
- ❌ Never commit API keys, tokens, or passwords

### 2. Seed File Security

**⚠️ CRITICAL:** The `supabase/seed.sql` file contains hardcoded development credentials.

- **NEVER** use this seed file in production
- The seed file is for **local development only**
- Production databases should use proper user management
- Always change default passwords in production

### 3. Environment Variable Validation

All environment variables are validated:
- **Frontend:** `src/lib/supabase.ts` validates on app startup
- **Edge Functions:** `supabase/functions/_shared/env.ts` validates before execution

If environment variables are missing, the application will fail with clear error messages rather than silently failing.

### 4. Production Checklist

Before deploying to production:

- [ ] Remove or disable seed file (`supabase/config.toml` → `enabled = false`)
- [ ] Ensure all environment variables are set in production environment
- [ ] Verify DevTools are disabled (automatically handled via `import.meta.env.DEV`)
- [ ] Review and remove any hardcoded credentials
- [ ] Enable error tracking (Sentry, etc.)
- [ ] Set up proper authentication and user management
- [ ] Review database security policies (RLS, etc.)

## 🔐 API Keys and Secrets

### Supabase Keys

- **Anon Key:** Safe to expose in frontend code (protected by RLS policies)
- **Service Role Key:** **NEVER** expose in frontend code - only use in Edge Functions

### Shopify Integration

Shopify integration credentials are stored in the database (`integrations` table) and are:
- Encrypted at rest (database encryption)
- Protected by Row Level Security (RLS) policies
- Only accessible to authenticated admin users

## 🛡️ Additional Security Measures

### Error Handling

- All errors are logged using the centralized logger (`src/lib/logger.ts`)
- Sensitive information is never logged
- Error messages are user-friendly and don't expose internal details

### Input Validation

- All user inputs are validated
- SQL injection protection via Supabase client (parameterized queries)
- XSS protection via Vue's built-in escaping

### Authentication

- Supabase Auth handles authentication
- Session management is handled securely by Supabase
- Password requirements should be configured in Supabase dashboard

## 📝 Reporting Security Issues

If you discover a security vulnerability, please:
1. Do not open a public issue
2. Contact the development team directly
3. Provide details of the vulnerability
4. Allow time for the issue to be addressed before public disclosure

---

**Last Updated:** January 2025

