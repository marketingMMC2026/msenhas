/**
 * Standardizes Supabase error handling
 * @param {Error|Object} error - The error object from Supabase or try/catch
 * @param {string} context - Optional context string for logging
 * @returns {Object} Standardized error object { message, status, code }
 */
export const handleSupabaseError = (error, context = '') => {
  if (!error) return null;

  // Log in development
  if (import.meta.env.DEV) {
    const errorPrefix = context ? `[${context}] ` : '';
    console.group(`❌ ${errorPrefix}Supabase Error`);
    console.error(error);
    console.groupEnd();
  }

  // Handle AbortError specifically (often not an actual error but a cancelled request)
  if (error.name === 'AbortError' || (error instanceof DOMException && error.name === 'AbortError')) {
    return {
      message: 'Request cancelled',
      status: 0,
      code: 'ABORT_ERROR',
      isAbort: true
    };
  }

  // Handle standard Supabase error structure
  const message = error.message || error.error_description || 'An unexpected error occurred';
  const status = error.status || error.statusCode || 500;
  const code = error.code || 'UNKNOWN_ERROR';

  return {
    message,
    status,
    code,
    isAbort: false,
    originalError: error
  };
};