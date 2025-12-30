# Centralized Logger Utility - Usage Guide

## 📋 Overview

The centralized logger (`src/lib/logger.ts`) provides consistent logging across the entire application with different log levels and automatic database logging for errors.

## 🔍 Where to See Logs

### 1. **Browser Console (Development)**
**Location:** Browser DevTools → Console tab

**What you'll see:**
- **Debug logs:** Only in development mode
- **Info logs:** Only in development mode  
- **Warning logs:** Always visible (yellow)
- **Error logs:** Always visible (red)

**Example:**
```
[DEBUG] Auth: Initializing...
[INFO] Product loaded successfully
[WARN] Auth initialization timed out, forcing app load.
[ERROR] Error loading products Error: Network request failed
```

### 2. **System Logs UI (Database Logs)**
**Location:** Navigate to `/dev/logs` in the application

**What you'll see:**
- All ERROR and WARN level logs stored in the database
- Logs from `useErrorHandler` and `useSystemToast`
- Searchable and filterable log entries
- Full error details including stack traces

**Features:**
- Search by message or source
- Filter by log level (ERROR, WARN, INFO, DEBUG)
- View detailed JSON for each log entry
- Refresh to see latest logs

### 3. **Database Table**
**Table:** `system_logs`

**Columns:**
- `id` - UUID
- `created_at` - Timestamp
- `level` - ERROR, WARN, INFO, or DEBUG
- `source` - Where the log came from (e.g., "Frontend Error", "Toast Notification")
- `message` - The log message
- `details` - JSONB with additional context (stack traces, user info, etc.)
- `user_id` - The user who triggered the log (if authenticated)

**Query example:**
```sql
SELECT * FROM system_logs 
WHERE level = 'ERROR' 
ORDER BY created_at DESC 
LIMIT 100;
```

## 🛠️ How It Works

### Log Levels

The logger supports 4 log levels:

1. **`debug()`** - Development-only debugging information
   - Only logs in development mode
   - Use for detailed debugging

2. **`info()`** - General information
   - Only logs in development mode
   - Use for informational messages

3. **`warn()`** - Warnings
   - Always logs to console
   - Use for non-critical issues

4. **`error()`** - Errors
   - Always logs to console
   - Automatically logged to database via `useErrorHandler`
   - Use for errors and exceptions

### Basic Usage

```typescript
import { logger } from '@/lib/logger'

// Debug (development only)
logger.debug('User clicked button', { buttonId: 'submit' })

// Info (development only)
logger.info('Product loaded', { productId: '123' })

// Warning (always visible)
logger.warn('Low stock detected', { productId: '123', stock: 5 })

// Error (always visible + logged to database)
logger.error('Failed to load product', error, { productId: '123' })
```

### Scoped Logging

For better organization, you can create a scoped logger:

```typescript
import { logger } from '@/lib/logger'

const inventoryLogger = logger.scope('Inventory')

// Logs will appear as: [Inventory] Product loaded
inventoryLogger.info('Product loaded', { productId: '123' })
inventoryLogger.error('Failed to load product', error)
```

## 📊 Automatic Database Logging

### Errors via `useErrorHandler`

When you use `useErrorHandler`, errors are automatically logged to the database:

```typescript
import { useErrorHandler } from '@/composables/useErrorHandler'

const { handleError } = useErrorHandler()

try {
  // Some operation
} catch (error) {
  handleError(error, 'Loading products')
  // This automatically:
  // 1. Logs to console
  // 2. Logs to database (system_logs table)
  // 3. Shows toast notification
}
```

### Toast Errors via `useSystemToast`

Error and warning toasts are automatically logged:

```typescript
import { useSystemToast } from '@/composables/useSystemToast'

const toast = useSystemToast()

toast.add({
  severity: 'error',
  summary: 'Error',
  detail: 'Failed to save product'
})
// Automatically logs to system_logs table
```

## 🔄 Current Implementation

### Development Mode
- **Debug/Info:** Logged to console only
- **Warn/Error:** Logged to console + database (if via error handler)

### Production Mode
- **Debug/Info:** Not logged (to reduce noise)
- **Warn/Error:** Logged to console + database
- **Future:** Ready for integration with Sentry or similar services

## 📍 Log Sources

Logs in the database include a `source` field indicating where they came from:

- `"Frontend Error"` - From `useErrorHandler`
- `"Toast Notification"` - From `useSystemToast`
- `"Global Error Handler"` - From Vue's global error handler
- `"Error boundary caught"` - From ErrorBoundary component
- Custom sources - You can specify when calling `handleError()`

## 🎯 Best Practices

### 1. Use Appropriate Log Levels

```typescript
// ✅ Good
logger.debug('Processing user input', { input: userInput })
logger.info('Order created successfully', { orderId })
logger.warn('API rate limit approaching', { remaining: 10 })
logger.error('Payment failed', error, { orderId })

// ❌ Bad
logger.error('User clicked button') // Use debug or info
logger.debug('Critical system failure', error) // Use error
```

### 2. Include Context

```typescript
// ✅ Good - includes context
logger.error('Failed to load product', error, { 
  productId: '123',
  userId: user.id,
  action: 'view'
})

// ❌ Bad - no context
logger.error('Error', error)
```

### 3. Don't Log Sensitive Data

```typescript
// ❌ Bad - logs sensitive data
logger.error('Login failed', error, { 
  password: userPassword, // Never log passwords!
  creditCard: cardNumber  // Never log credit cards!
})

// ✅ Good - logs safe data
logger.error('Login failed', error, { 
  email: userEmail,
  attemptCount: 3
})
```

## 🔧 Integration Points

The logger is used throughout the application:

- **131 instances** across 36 files
- **Core files:** `main.ts`, `App.vue`, `router/index.ts`
- **Composables:** All business logic composables
- **Components:** Error boundaries, dialogs, views
- **Stores:** Auth store and module stores

## 🚀 Future Enhancements

The logger is structured to easily integrate with:

- **Sentry** - Error tracking service
- **LogRocket** - Session replay and logging
- **Datadog** - Application monitoring
- **Custom logging service** - Your own backend

To integrate, simply add to the `error()` and `warn()` methods:

```typescript
error(message: string, error?: Error | unknown, context?: LogContext): void {
  console.error(`[ERROR] ${message}`, errorObj || '', context || '')
  
  if (this.isProduction) {
    // Add your service here
    Sentry.captureException(errorObj, { extra: context })
  }
}
```

## 📝 Summary

**Where to see logs:**
1. **Browser Console** - All logs during development
2. **System Logs UI** (`/dev/logs`) - Database-stored errors and warnings
3. **Database** (`system_logs` table) - Query directly if needed

**What gets logged:**
- Errors: Always (console + database)
- Warnings: Always (console + database if via toast)
- Info/Debug: Development only (console)

**How to use:**
```typescript
import { logger } from '@/lib/logger'
logger.error('Message', error, { context })
```

---

**Last Updated:** January 2025

