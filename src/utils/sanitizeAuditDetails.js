/**
 * Removes sensitive fields from audit log details and truncates large text fields.
 * @param {Object} details - The details object to sanitize
 * @returns {Object} Sanitized details object
 */
export const sanitizeAuditDetails = (details) => {
  if (!details || typeof details !== 'object') return details;

  const sensitiveFields = [
    'secret_value',
    'twofa_recovery',
    'password',
    'token',
    'api_key',
    'access_token',
    'refresh_token',
    'session_token'
  ];

  const sanitized = { ...details };

  // Remove sensitive fields completely
  sensitiveFields.forEach(field => {
    if (field in sanitized) {
      delete sanitized[field];
    }
  });

  // Truncate/Count specific text fields instead of storing content
  if (sanitized.reason) {
    sanitized.reason_length = sanitized.reason.length;
    delete sanitized.reason;
  }
  
  if (sanitized.denial_reason) {
    sanitized.denial_reason_length = sanitized.denial_reason.length;
    delete sanitized.denial_reason;
  }

  // Handle changed_fields array if present (often used in updates)
  if (Array.isArray(sanitized.changed_fields)) {
     // Ensure no sensitive field names leaked if we were dynamically adding them, 
     // though usually changed_fields is just a list of keys.
     // If changed_fields contained objects {field: 'secret_value', old: '...', new: '...'}, we'd need to scrub.
     // Assuming it's just keys for now based on previous implementation.
  }

  return sanitized;
};