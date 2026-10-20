export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB — app-level cap

// Lifetime PDF upload cap for agencies on the TRIAL plan. PREMIUM agencies are
// uncapped. Enforced in app/api/tickets/upload{,-url}/route.ts.
export const TRIAL_UPLOAD_LIMIT = 10;

// Vercel rejects request bodies over 4.5MB, so files above this threshold are
// uploaded through the upload-ticket-pdf Supabase Edge Function instead.
export const DIRECT_UPLOAD_LIMIT = 4 * 1024 * 1024; // 4 MB
