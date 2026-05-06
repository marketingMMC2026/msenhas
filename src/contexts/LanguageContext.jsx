import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const dictionaries = {
  pt: {
    appName: 'M Password', dashboard: 'Painel', vault: 'Cofre', requests: 'Pedidos', groups: 'Grupos', users: 'Usuários', logs: 'Logs', settings: 'Configurações',
    showGuide: 'Ver guia', language: 'Idioma', signOut: 'Sair da conta', signingOut: 'Saindo...', loading: 'Carregando...',
    vaultTitle: 'Cofre de Senhas', vaultDescription: 'Gerencie e compartilhe suas credenciais com segurança.', import: 'Importar', newPassword: 'Nova Senha', refresh: 'Atualizar',
    deleted: 'Senha excluída', passwordDeleted: 'A senha foi removida do cofre.', deleteConfirmTitle: 'Excluir senha?', deleteConfirmBody: 'Esta ação vai remover a senha', deleteConfirmHelp: 'Ela deixará de aparecer no cofre.', cancel: 'Cancelar', deletePassword: 'Excluir senha', deleteFailedTitle: 'Não foi possível excluir', deletePolicyError: 'O Supabase ainda bloqueou a exclusão por regra de segurança. Confira se o SQL de correção foi executado até o final e tente novamente.', loadPasswordsError: 'Não foi possível carregar as senhas', retry: 'Tentar novamente',
    guideTitle: 'Bem-vindo ao M Password', guideVault: 'Centralize senhas, links, logins e notas em um cofre compartilhável.', guideGroups: 'Use grupos para liberar acessos por equipe, cliente ou área da agência.', guideImport: 'Importe planilhas CSV e já associe cada senha a grupos existentes ou novos.', guideAudit: 'Acompanhe pedidos, permissões e logs para manter controle operacional.', next: 'Próximo', back: 'Voltar', finish: 'Começar', skip: 'Pular guia'
  },
  en: {
    appName: 'M Password', dashboard: 'Dashboard', vault: 'Vault', requests: 'Requests', groups: 'Groups', users: 'Users', logs: 'Logs', settings: 'Settings',
    showGuide: 'Show guide', language: 'Language', signOut: 'Sign out', signingOut: 'Signing out...', loading: 'Loading...',
    vaultTitle: 'Password Vault', vaultDescription: 'Manage and share credentials securely.', import: 'Import', newPassword: 'New Password', refresh: 'Refresh',
    deleted: 'Password deleted', passwordDeleted: 'The password was removed from the vault.', deleteConfirmTitle: 'Delete password?', deleteConfirmBody: 'This action will remove the password', deleteConfirmHelp: 'It will no longer appear in the vault.', cancel: 'Cancel', deletePassword: 'Delete password', deleteFailedTitle: 'Could not delete', deletePolicyError: 'Supabase still blocked the deletion through a security rule. Check that the correction SQL finished successfully and try again.', loadPasswordsError: 'Could not load passwords', retry: 'Try again',
    guideTitle: 'Welcome to M Password', guideVault: 'Centralize passwords, links, logins and notes in a shareable vault.', guideGroups: 'Use groups to grant access by team, client or agency area.', guideImport: 'Import CSV spreadsheets and assign each password to existing or new groups.', guideAudit: 'Track requests, permissions and logs to keep operational control.', next: 'Next', back: 'Back', finish: 'Start', skip: 'Skip guide'
  },
};

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => localStorage.getItem('m-password-language') || 'pt');

  useEffect(() => {
    localStorage.setItem('m-password-language', language);
    document.documentElement.lang = language === 'en' ? 'en' : 'pt-BR';
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t: (key) => dictionaries[language]?.[key] || dictionaries.pt[key] || key,
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
};
