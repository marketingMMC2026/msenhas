import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const dictionaries = {
  pt: {
    appName: 'M Password', dashboard: 'Painel', vault: 'Acessos', requests: 'Pedidos', groups: 'Grupos', users: 'Usuarios', logs: 'Logs', settings: 'Configuracoes',
    showGuide: 'Ver guia', language: 'Idioma', signOut: 'Sair da conta', signingOut: 'Saindo...', loading: 'Carregando...',
    vaultTitle: 'Acessos', vaultDescription: 'Gerencie e compartilhe logins, senhas, links e credenciais com seguranca.', import: 'Importar', newPassword: 'Novo Acesso', refresh: 'Atualizar',
    activePasswords: 'Ativos', archivedPasswords: 'Arquivados', archived: 'Arquivado', restore: 'Restaurar', archive: 'Arquivar', archivePassword: 'Arquivar acesso', restorePassword: 'Restaurar acesso', permanentlyDelete: 'Excluir definitivo',
    archivedSuccess: 'Acesso arquivado', archivedDescription: 'O acesso saiu da lista ativa e pode ser restaurado depois.', restoredSuccess: 'Acesso restaurado', restoredDescription: 'O acesso voltou para a lista ativa.',
    archiveConfirmTitle: 'Arquivar acesso?', archiveConfirmBody: 'Esta acao vai retirar o acesso da lista ativa', archiveConfirmHelp: 'Ele ficara disponivel na aba Arquivados para consulta ou restauracao.',
    deleted: 'Acesso excluido', passwordDeleted: 'O acesso foi removido.', deleteConfirmTitle: 'Excluir acesso?', deleteConfirmBody: 'Esta acao vai remover o acesso', deleteConfirmHelp: 'Ele deixara de aparecer na lista.', cancel: 'Cancelar', deletePassword: 'Excluir acesso', deleteFailedTitle: 'Nao foi possivel concluir', deletePolicyError: 'O Supabase ainda bloqueou a acao por regra de seguranca. Confira se a migration de permissoes foi executada ate o final e tente novamente.', loadPasswordsError: 'Nao foi possivel carregar os acessos', retry: 'Tentar novamente',
    passwordHistory: 'Historico da senha', noPasswordHistory: 'Nenhuma alteracao de senha registrada ainda.', changedBy: 'Alterado por', previousPassword: 'Senha anterior', show: 'Mostrar', hide: 'Ocultar', copy: 'Copiar', passwordChanged: 'Senha alterada', secretArchived: 'Acesso arquivado', secretRestored: 'Acesso restaurado', secretUpdated: 'Dados atualizados',
    guideTitle: 'Bem-vindo ao M Password', guideVault: 'Centralize acessos, senhas, links, logins e notas em uma lista compartilhavel.', guideGroups: 'Use grupos para liberar acessos por equipe, cliente ou area da agencia.', guideImport: 'Importe planilhas CSV e ja associe cada acesso a grupos existentes ou novos.', guideAudit: 'Acompanhe pedidos, permissoes e logs para manter controle operacional.', next: 'Proximo', back: 'Voltar', finish: 'Comecar', skip: 'Pular guia'
  },
  en: {
    appName: 'M Password', dashboard: 'Dashboard', vault: 'Accesses', requests: 'Requests', groups: 'Groups', users: 'Users', logs: 'Logs', settings: 'Settings',
    showGuide: 'Show guide', language: 'Language', signOut: 'Sign out', signingOut: 'Signing out...', loading: 'Loading...',
    vaultTitle: 'Accesses', vaultDescription: 'Manage and share logins, passwords, links and credentials securely.', import: 'Import', newPassword: 'New Access', refresh: 'Refresh',
    activePasswords: 'Active', archivedPasswords: 'Archived', archived: 'Archived', restore: 'Restore', archive: 'Archive', archivePassword: 'Archive access', restorePassword: 'Restore access', permanentlyDelete: 'Delete permanently',
    archivedSuccess: 'Access archived', archivedDescription: 'The access left the active list and can be restored later.', restoredSuccess: 'Access restored', restoredDescription: 'The access returned to the active list.',
    archiveConfirmTitle: 'Archive access?', archiveConfirmBody: 'This action will remove the access from the active list', archiveConfirmHelp: 'It will remain available in Archived for review or restore.',
    deleted: 'Access deleted', passwordDeleted: 'The access was removed.', deleteConfirmTitle: 'Delete access?', deleteConfirmBody: 'This action will remove the access', deleteConfirmHelp: 'It will no longer appear in the list.', cancel: 'Cancel', deletePassword: 'Delete access', deleteFailedTitle: 'Could not finish', deletePolicyError: 'Supabase still blocked the action through a security rule. Check that the permissions migration finished successfully and try again.', loadPasswordsError: 'Could not load accesses', retry: 'Try again',
    passwordHistory: 'Password history', noPasswordHistory: 'No password changes have been recorded yet.', changedBy: 'Changed by', previousPassword: 'Previous password', show: 'Show', hide: 'Hide', copy: 'Copy', passwordChanged: 'Password changed', secretArchived: 'Access archived', secretRestored: 'Access restored', secretUpdated: 'Details updated',
    guideTitle: 'Welcome to M Password', guideVault: 'Centralize accesses, passwords, links, logins and notes in a shareable list.', guideGroups: 'Use groups to grant access by team, client or agency area.', guideImport: 'Import CSV spreadsheets and assign each access to existing or new groups.', guideAudit: 'Track requests, permissions and logs to keep operational control.', next: 'Next', back: 'Back', finish: 'Start', skip: 'Skip guide'
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
