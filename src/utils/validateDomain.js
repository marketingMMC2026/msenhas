export const validateDomain = (email, allowedDomain) => {
  if (!email) {
    return { 
      valid: false, 
      domain: null, 
      message: "Email não fornecido." 
    };
  }
  
  const domain = email.split('@')[1];
  
  if (!allowedDomain) {
    // If no domain is configured in environment, we treat it as valid (or could be error depending on strictness)
    // Assuming strict requirement from prompt implies VITE_ALLOWED_DOMAIN is set.
    return { 
      valid: true, 
      domain: domain, 
      message: "Domínio permitido (configuração aberta)." 
    };
  }

  if (!domain) {
    return { 
      valid: false, 
      domain: null, 
      message: "Formato de email inválido." 
    };
  }

  const isValid = domain.toLowerCase() === allowedDomain.toLowerCase();

  return {
    valid: isValid,
    domain: domain,
    message: isValid 
      ? "Domínio válido." 
      : `Seu email não pertence ao domínio permitido (${allowedDomain}).`
  };
};