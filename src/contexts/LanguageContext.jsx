import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const dictionaries = {
  pt: {
    appName: 'M Password', dashboard: 'Painel', vault: 'Cofre', requests: 'Pedidos', groups: 'Grupos', users: 'Usuários', logs: 'Logs', settings: 'Configurações',
    showGuide: 'Ver guia', language: 'Idioma', signOut: 'Sair da conta', signingOut: 'Saindo...', loading: 'Carregando...',
    vaultTitle: 'Cofre de Senhas', vaultDescription: 'Gerencie e compartilhe suas credenciais com segurança.', import: 'Importar', newPassword: 'Nova Senha', refresh: 'Atualizar',
    activePasswords: 'Ativas', archivedPasswords: 'Arquivadas', archived: 'Arquivada', restore: 'Restaurar', archive: 'Arquivar', archivePassword: 'Arquivar senha', restorePassword: 'Restaurar senha', permanentlyDelete: 'Excluir definitivo',
    archivedSuccess: 'Senha arquivada', archivedDescription: 'A senha saiu do cofre ativo e pode ser restaurada depois.', restoredSuccess: 'Senha restaurada', restoredDescription: 'A senha voltou para o cofre ativo.',
    archiveConfirmTitle: 'Arquivar senha?', archiveConfirmBody: 'Esta ação vai retirar a senha do cofre ativo', archiveConfirmHelp: 'Ela ficará disponível na aba Arquivadas para consulta ou restauração.',
    deleted: 'Senha excluída', passwordDeleted: 'A senha foi removida do cofre.', deleteConfirmTitle: 'Excluir senha?', deleteConfirmBody: 'Esta ação vai remover a senha', deleteConfirmHelp: 'Ela deixará de aparecer no cofre.', cancel: 'Cancelar', deletePassword: 'Excluir senha', deleteFailedTitle: 'Não foi possível concluir', deletePolicyError: 'O Supabase ainda bloqueou a ação por regra de segurança. Confira se a migration de permissões foi executada até o final e tente novamente.', loadPasswordsError: 'Não foi possível carregar as senhas', retry: 'Tentar novamente',
    passwordHistory: 'Histórico da senha', noPasswordHistory: 'Nenhuma alteração de senha registrada ainda.', changedBy: 'Alterado por', previousPassword: 'Senha anterior', show: 'Mostrar', hide: 'Ocultar', copy: 'Copiar', passwordChanged: 'Senha alterada', secretArchived: 'Senha arquivada', secretRestored: 'Senha restaurada', secretUpdated: 'Dados atualizados',
    guideTitle: 'Bem-vindo ao M Password', guideVault: 'Centralize senhas, links, logins e notas em um cofre compartilhável.', guideGroups: 'Use grupos para liberar acessos por equipe, cliente ou área da agência.', guideImport: 'Importe planilhas CSV e já associe cada senha a grupos existentes ou novos.', guideAudit: 'Acompanhe pedidos, permissões e logs para manter controle operacional.', next: 'Próximo', back: 'Voltar', finish: 'Começar', skip: 'Pular guia'
  },
  en: {
    appName: 'M Password', dashboard: 'Dashboard', vault: 'Vault', requests: 'Requests', groups: 'Groups', users: 'Users', logs: 'Logs', settings: 'Settings',
    showGuide: 'Show guide', language: 'Language', signOut: 'Sign out', signingOut: 'Signing out...', loading: 'Loading...',
    vaultTitle: 'Password Vault', vaultDescription: 'Manage and share credentials securely.', import: 'Import', newPassword: 'New Password', refresh: 'Refresh',
    activePasswords: 'Active', archivedPasswords: 'Archived', archived: 'Archived', restore: 'Restore', archive: 'Archive', archivePassword: 'Archive password', restorePassword: 'Restore password', permanentlyDelete: 'Delete permanently',
    archivedSuccess: 'Password archived', archivedDescription: 'The password left the active vault and can be restored later.', restoredSuccess: 'Password restored', restoredDescription: 'The password returned to the active vault.',
    archiveConfirmTitle: 'Archive password?', archiveConfirmBody: 'This action will remove the password from the active vault', archiveConfirmHelp: 'It will remain available in Archived for review or restore.',
    deleted: 'Password deleted', passwordDeleted: 'The password was removed from the vault.', deleteConfirmTitle: 'Delete password?', deleteConfirmBody: 'This action will remove the password', deleteConfirmHelp: 'It will no longer appear in the vault.', cancel: 'Cancel', deletePassword: 'Delete password', deleteFailedTitle: 'Could not finish', deletePolicyError: 'Supabase still blocked the action through a security rule. Check that the permissions migration finished successfully and try again.', loadPasswordsError: 'Could not load passwords', retry: 'Try again',
    passwordHistory: 'Password history', noPasswordHistory: 'No password changes have been recorded yet.', changedBy: 'Changed by', previousPassword: 'Previous password', show: 'Show', hide: 'Hide', copy: 'Copy', passwordChanged: 'Password changed', secretArchived: 'Password archived', secretRestored: 'Password restored', secretUpdated: 'Details updated',
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
