export const validateDomain = (email, allowedDomain) => {
  if (!email || !allowedDomain) return false;
  
  const domain = email.split('@')[1];
  if (!domain) return false;

  return domain.toLowerCase() === allowedDomain.toLowerCase();
};