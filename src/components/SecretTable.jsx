import React, { useEffect, useState, useMemo } from 'react';
import { Search, ExternalLink, Edit2, Archive, RotateCcw, Share2, Eye, MoreHorizontal, Lock, Users, ShieldQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/LoadingSpinner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { getAccessInitial, getFaviconUrl, getPasswordStrengthClassName, getPasswordStrengthLabel } from '@/lib/accessUtils';

const AccessIcon = ({ secret }) => {
  const favicon = getFaviconUrl(secret.link);
  const [failed, setFailed] = useState(false);
  if (favicon && !failed) return <img src={favicon} alt="" className="h-8 w-8 rounded-md border border-gray-200 bg-white p-1" onError={() => setFailed(true)} />;
  return <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-sm font-semibold text-blue-700">{getAccessInitial(secret.title)}</div>;
};

const SecretTable = ({ secrets, loading, showArchived, onShowArchivedChange, onView, onEdit, onArchive, onRestore, onShare }) => {
  const { t } = useLanguage();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState('mine');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [pageSize, setPageSize] = useState(30);
  const [visibleLimit, setVisibleLimit] = useState(30);

  const allTags = useMemo(() => {
    const tags = new Set();
    secrets.forEach(s => s.tags?.forEach(tag => tags.add(tag)));
    return Array.from(tags).sort();
  }, [secrets]);

  const allGroups = useMemo(() => {
    const groups = new Set();
    secrets.forEach(s => s.group_names?.forEach(group => groups.add(group)));
    return Array.from(groups).sort();
  }, [secrets]);

  const mySecrets = useMemo(() => secrets.filter(secret => secret.is_personal), [secrets]);
  const scopedSecrets = useMemo(() => scope === 'mine' ? mySecrets : secrets, [mySecrets, scope, secrets]);

  const activeCount = scopedSecrets.filter(secret => !secret.is_archived).length;
  const archivedCount = scopedSecrets.filter(secret => secret.is_archived).length;

  useEffect(() => {
    setVisibleLimit(pageSize);
  }, [pageSize, scope, search, selectedGroup, selectedTag, showArchived]);

  const filteredSecrets = useMemo(() => scopedSecrets.filter(secret => {
    if (Boolean(secret.is_archived) !== showArchived) return false;
    const searchLower = search.toLowerCase();
    const matchesSearch = !searchLower || secret.title.toLowerCase().includes(searchLower) || (secret.login && secret.login.toLowerCase().includes(searchLower)) || (secret.link && secret.link.toLowerCase().includes(searchLower));
    const matchesGroup = !selectedGroup || secret.group_names?.includes(selectedGroup);
    const matchesTag = !selectedTag || secret.tags?.includes(selectedTag);
    return matchesSearch && matchesGroup && matchesTag;
  }), [scopedSecrets, search, selectedGroup, selectedTag, showArchived]);

  const visibleSecrets = useMemo(() => filteredSecrets.slice(0, visibleLimit), [filteredSecrets, visibleLimit]);
  const canLoadMore = visibleLimit < filteredSecrets.length;

  const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

  const canEditSecret = (secret) => can('editSecrets') && !secret.is_catalog_only && !secret.is_archived && ['owner', 'admin', 'edit', 'manage_access'].includes(secret.my_permission);
  const canShareSecret = (secret) => can('managePermissions') && !secret.is_catalog_only && ['owner', 'admin', 'manage_access'].includes(secret.my_permission);
  const canArchiveSecret = (secret) => can('archiveSecrets') && !secret.is_catalog_only && ['owner', 'admin', 'manage_access'].includes(secret.my_permission);

  if (loading) return <div className="py-10 flex justify-center"><LoadingSpinner size="lg" message="Carregando acessos..." /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex w-fit rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            <button type="button" onClick={() => setScope('mine')} className={`rounded-md px-3 py-1.5 text-sm font-medium ${scope === 'mine' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Meus acessos ({mySecrets.length})</button>
            <button type="button" onClick={() => setScope('all')} className={`rounded-md px-3 py-1.5 text-sm font-medium ${scope === 'all' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Todos os acessos ({secrets.length})</button>
          </div>
          <div className="inline-flex w-fit rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            <button type="button" onClick={() => onShowArchivedChange(false)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${!showArchived ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{t('activePasswords')} ({activeCount})</button>
            <button type="button" onClick={() => onShowArchivedChange(true)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${showArchived ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{t('archivedPasswords')} ({archivedCount})</button>
          </div>
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-3 lg:w-auto">
          <div className="relative min-w-0 sm:w-72"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><input type="text" placeholder="Buscar acessos..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
          <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos os grupos</option>
            {allGroups.map(group => <option key={group} value={group}>{group}</option>)}
          </select>
          <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todas as tags</option>
            {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
        <span>Mostrando {Math.min(visibleSecrets.length, filteredSecrets.length)} de {filteredSecrets.length} acessos filtrados.</span>
        {(selectedGroup || selectedTag || search) && <button type="button" onClick={() => { setSearch(''); setSelectedGroup(''); setSelectedTag(''); }} className="font-medium text-blue-600 hover:text-blue-800">Limpar filtros</button>}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-700 font-medium"><tr><th className="px-4 py-3">Acesso</th><th className="px-4 py-3">Login</th><th className="px-4 py-3">Link</th><th className="px-4 py-3">Tags</th><th className="px-4 py-3">Forca</th><th className="px-4 py-3">Permissao</th><th className="px-4 py-3">Atualizado</th><th className="px-4 py-3 text-right">Acoes</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSecrets.length === 0 ? <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-500">{showArchived ? 'Nenhum acesso arquivado.' : 'Nenhum acesso encontrado com os filtros atuais.'}</td></tr> : visibleSecrets.map(secret => (
                <tr key={secret.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900"><div className="flex items-center gap-3"><AccessIcon secret={secret} /><div>{secret.is_catalog_only ? <span>{secret.title}</span> : <button onClick={() => onView(secret)} className="hover:underline hover:text-blue-600 text-left">{secret.title}</button>}{secret.is_archived && <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">{t('archived')}</span>}</div></div></td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{secret.login || '-'}</td>
                  <td className="px-4 py-3">{secret.link ? <a href={secret.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>Abrir <ExternalLink className="h-3 w-3" /></a> : '-'}</td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{secret.tags?.slice(0, 3).map((tag, idx) => <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">{tag}</span>)}{secret.tags?.length > 3 && <span className="text-xs text-gray-500">+{secret.tags.length - 3}</span>}</div></td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getPasswordStrengthClassName(secret.password_strength)}`}>{getPasswordStrengthLabel(secret.password_strength)}</span></td>
                  <td className="px-4 py-3">{secret.is_catalog_only ? <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"><ShieldQuestion className="w-3 h-3 mr-1" /> Acesso nao liberado</span> : secret.is_personal ? <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700"><Lock className="w-3 h-3 mr-1" /> Pessoal</span> : <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700"><Users className="w-3 h-3 mr-1" /> Compartilhada</span>}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(secret.updated_at)}</td>
                  <td className="px-4 py-3 text-right">{secret.is_catalog_only ? <span className="text-xs text-gray-400">Solicite acesso</span> : <div className="flex items-center justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => onView(secret)} className="h-8 w-8 p-0"><Eye className="h-4 w-4 text-gray-500" /></Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4 text-gray-500" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onView(secret)}><Eye className="mr-2 h-4 w-4" /> Ver detalhes</DropdownMenuItem>{canEditSecret(secret) && <DropdownMenuItem onClick={() => onEdit(secret)}><Edit2 className="mr-2 h-4 w-4" /> Editar acesso</DropdownMenuItem>}{canShareSecret(secret) && !secret.is_archived && <DropdownMenuItem onClick={() => onShare(secret)}><Share2 className="mr-2 h-4 w-4" /> Compartilhar acesso</DropdownMenuItem>}{canArchiveSecret(secret) && !secret.is_archived && <DropdownMenuItem onClick={() => onArchive(secret)} className="text-amber-700 focus:text-amber-700"><Archive className="mr-2 h-4 w-4" /> {t('archive')}</DropdownMenuItem>}{canArchiveSecret(secret) && secret.is_archived && <DropdownMenuItem onClick={() => onRestore(secret)} className="text-green-700 focus:text-green-700"><RotateCcw className="mr-2 h-4 w-4" /> {t('restore')}</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {filteredSecrets.length > 0 && <div className="flex flex-col items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 sm:flex-row">
        <span className="text-sm text-gray-500">Exibindo {visibleSecrets.length} de {filteredSecrets.length} acessos.</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Por vez
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          {canLoadMore && <Button variant="outline" onClick={() => setVisibleLimit((current) => current + pageSize)}>Carregar mais</Button>}
        </div>
      </div>}
    </div>
  );
};

export default SecretTable;
