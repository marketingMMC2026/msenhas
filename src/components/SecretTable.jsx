import React, { useEffect, useState, useMemo } from 'react';
import { Search, ExternalLink, Edit2, Archive, RotateCcw, Share2, Eye, MoreHorizontal, Lock, Users, ShieldQuestion, Tag as TagIcon, FolderInput, Clock, X, Loader2, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/LoadingSpinner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { getAccessIconTheme, getAccessInitial, getFaviconUrl, getPasswordStrengthClassName, getPasswordStrengthLabel } from '@/lib/accessUtils';

const AccessIcon = ({ secret }) => {
  const favicon = getFaviconUrl(secret.link);
  const [failed, setFailed] = useState(false);
  const theme = getAccessIconTheme(secret.title);

  useEffect(() => {
    setFailed(false);
  }, [favicon, secret.title]);

  if (favicon && !failed) {
    return (
      <img
        src={favicon}
        alt=""
        className="h-8 w-8 rounded-md border border-gray-200 bg-white p-1"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className="flex h-8 w-8 items-center justify-center rounded-md border text-sm font-semibold shadow-sm"
      style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }}
      aria-hidden="true"
    >
      {getAccessInitial(secret.title)}
    </div>
  );
};

const DAY = 24 * 60 * 60 * 1000;

const SecretTable = ({ secrets, loading, showArchived, onShowArchivedChange, onView, onEdit, onArchive, onRestore, onShare, auditMode = false, auditUser = null, lastAccessMap = null, groups = [], onBulkAction = null }) => {
  const { t } = useLanguage();
  const { can, user } = useAuth();
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState('mine');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [lastAccessFilter, setLastAccessFilter] = useState('');
  const [selectedStrength, setSelectedStrength] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [pageSize, setPageSize] = useState(30);
  const [visibleLimit, setVisibleLimit] = useState(30);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkTag, setBulkTag] = useState('');
  const [bulkGroup, setBulkGroup] = useState('');
  const [bulkGroupLevel, setBulkGroupLevel] = useState('view');
  const [bulkBusy, setBulkBusy] = useState(false);

  // Gestão em massa disponível para quem pode gerenciar pessoas/acessos (admin/manager) e há handler.
  const canBulk = !auditMode && typeof onBulkAction === 'function' && can('manageUsers');
  const showLastAccess = !auditMode && lastAccessMap instanceof Map;
  const getLastAccess = (id) => (showLastAccess ? lastAccessMap.get(id) : null);

  const visibleSecretsByPrivacy = useMemo(() => auditMode ? secrets : secrets.filter(secret => !secret.is_personal || secret.owner_id === user?.id), [auditMode, secrets, user?.id]);
  const mySecrets = useMemo(() => visibleSecretsByPrivacy.filter(secret => secret.is_personal && secret.owner_id === user?.id), [visibleSecretsByPrivacy, user?.id]);
  const scopedSecrets = useMemo(() => auditMode || scope === 'all' ? visibleSecretsByPrivacy : mySecrets, [auditMode, mySecrets, scope, visibleSecretsByPrivacy]);

  const allTags = useMemo(() => {
    const tags = new Set();
    scopedSecrets.forEach(s => s.tags?.forEach(tag => tags.add(tag)));
    return Array.from(tags).sort();
  }, [scopedSecrets]);

  const allGroups = useMemo(() => {
    const groups = new Set();
    scopedSecrets.forEach(s => s.group_names?.forEach(group => groups.add(group)));
    return Array.from(groups).sort();
  }, [scopedSecrets]);

  useEffect(() => {
    setVisibleLimit(pageSize);
  }, [pageSize, scope, search, selectedGroup, selectedTag, selectedStrength, selectedType, lastAccessFilter, showArchived]);

  const matchesLastAccess = (secret) => {
    if (!lastAccessFilter) return true;
    const rec = getLastAccess(secret.id);
    if (lastAccessFilter === 'never') return !rec;
    if (!rec) return true; // "há mais de X dias" inclui os nunca acessados
    const days = Number(lastAccessFilter);
    return (Date.now() - new Date(rec.last_access).getTime()) >= days * DAY;
  };

  const filteredSecrets = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    // Ao buscar, procura em TODOS os acessos visíveis (não só na aba selecionada),
    // para que a busca encontre tudo de uma vez. Sem busca, respeita a aba (Meus/Todos).
    const base = searchLower ? visibleSecretsByPrivacy : scopedSecrets;
    return base.filter(secret => {
      if (Boolean(secret.is_archived) !== showArchived) return false;
      const matchesSearch = !searchLower
        || secret.title.toLowerCase().includes(searchLower)
        || (secret.login && secret.login.toLowerCase().includes(searchLower))
        || (secret.link && secret.link.toLowerCase().includes(searchLower))
        || (Array.isArray(secret.tags) && secret.tags.some(tag => tag.toLowerCase().includes(searchLower)));
      const matchesGroup = !selectedGroup || secret.group_names?.includes(selectedGroup);
      const matchesTag = !selectedTag || secret.tags?.includes(selectedTag);
      const matchesStrength = !selectedStrength
        || (selectedStrength === 'none' ? !secret.password_strength : secret.password_strength === selectedStrength);
      const matchesType = !selectedType
        || (selectedType === 'personal' ? secret.is_personal : !secret.is_personal);
      return matchesSearch && matchesGroup && matchesTag && matchesStrength && matchesType && matchesLastAccess(secret);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedSecrets, visibleSecretsByPrivacy, search, selectedGroup, selectedTag, selectedStrength, selectedType, lastAccessFilter, showArchived, lastAccessMap]);

  const advancedFilters = [selectedGroup, selectedTag, selectedStrength, selectedType, lastAccessFilter].filter(Boolean).length;
  const clearAllFilters = () => { setSelectedGroup(''); setSelectedTag(''); setSelectedStrength(''); setSelectedType(''); setLastAccessFilter(''); };

  // ids atualmente filtrados (para "selecionar todos")
  const filteredIds = useMemo(() => filteredSecrets.filter(s => !s.is_catalog_only).map(s => s.id), [filteredSecrets]);
  // limpa seleção que saiu do filtro
  useEffect(() => {
    setSelected(prev => {
      if (prev.size === 0) return prev;
      const allowed = new Set(filteredIds);
      const next = new Set([...prev].filter(id => allowed.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredIds]);

  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id));
  const toggleOne = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allFilteredSelected ? new Set() : new Set(filteredIds));
  const clearSelection = () => setSelected(new Set());

  const runBulk = async (action, value) => {
    if (!canBulk || selected.size === 0) return;
    setBulkBusy(true);
    try {
      await onBulkAction(action, [...selected], value);
      clearSelection();
      if (action === 'add_tag' || action === 'remove_tag') setBulkTag('');
      if (action === 'add_group') setBulkGroup('');
    } finally {
      setBulkBusy(false);
    }
  };

  const formatRelative = (dateString) => {
    if (!dateString) return 'Nunca';
    const days = Math.floor((Date.now() - new Date(dateString).getTime()) / DAY);
    if (days <= 0) return 'Hoje';
    if (days === 1) return 'Ontem';
    if (days < 30) return `Há ${days} dias`;
    if (days < 365) return `Há ${Math.floor(days / 30)} m.`;
    return `Há ${Math.floor(days / 365)} a.`;
  };

  const visibleSecrets = useMemo(() => filteredSecrets.slice(0, visibleLimit), [filteredSecrets, visibleLimit]);
  const canLoadMore = visibleLimit < filteredSecrets.length;

  const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

  const canEditSecret = (secret) => !auditMode && can('editSecrets') && !secret.is_catalog_only && !secret.is_archived && ['owner', 'admin', 'edit', 'manage_access'].includes(secret.my_permission);
  const canShareSecret = (secret) => !auditMode && can('managePermissions') && !secret.is_catalog_only && !secret.is_personal && ['owner', 'admin', 'manage_access'].includes(secret.my_permission);
  const canArchiveSecret = (secret) => !auditMode && can('archiveSecrets') && !secret.is_catalog_only && ['owner', 'admin', 'manage_access'].includes(secret.my_permission);

  if (loading) return <div className="py-10 flex justify-center"><LoadingSpinner size="lg" message="Carregando acessos..." /></div>;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {auditMode ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Auditoria de {auditUser?.full_name || auditUser?.email || 'usuario'}: senhas e codigos 2FA nao sao exibidos.
            </div>
          ) : (
            <div className="inline-flex w-fit rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
              <button type="button" onClick={() => setScope('mine')} className={`rounded-md px-3 py-1.5 text-sm font-medium ${scope === 'mine' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Meus acessos ({mySecrets.length})</button>
              <button type="button" onClick={() => setScope('all')} className={`rounded-md px-3 py-1.5 text-sm font-medium ${scope === 'all' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Todos os acessos ({visibleSecretsByPrivacy.length})</button>
            </div>
          )}
          {showArchived && <button type="button" onClick={() => onShowArchivedChange(false)} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100">Voltar para ativos</button>}
        </div>
        {/* Busca sempre visível + botão para abrir/fechar os filtros avançados */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><input type="text" placeholder="Buscar acessos..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
          <button type="button" onClick={() => setShowFilters(v => !v)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${showFilters || advancedFilters ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
            <SlidersHorizontal className="h-4 w-4" /> Filtros
            {advancedFilters > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white">{advancedFilters}</span>}
          </button>
          {advancedFilters > 0 && <button type="button" onClick={clearAllFilters} className="text-sm font-medium text-blue-600 hover:text-blue-800">Limpar</button>}
        </div>

        {showFilters && (
          <div className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">Grupo
              <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Todos os grupos</option>
                {allGroups.map(group => <option key={group} value={group}>{group}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">Tag
              <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Todas as tags</option>
                {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">Força da senha
              <select value={selectedStrength} onChange={(e) => setSelectedStrength(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Qualquer</option>
                <option value="strong">Forte</option>
                <option value="medium">Média</option>
                <option value="weak">Fraca</option>
                <option value="none">Não avaliada</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">Tipo
              <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Todos</option>
                <option value="shared">Compartilhada</option>
                <option value="personal">Particular</option>
              </select>
            </label>
            {showLastAccess && (
              <label className="flex flex-col gap-1 text-xs font-medium text-gray-500"><span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Último acesso</span>
                <select value={lastAccessFilter} onChange={(e) => setLastAccessFilter(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Qualquer</option>
                  <option value="never">Nunca acessado</option>
                  <option value="30">Há mais de 30 dias</option>
                  <option value="60">Há mais de 60 dias</option>
                  <option value="90">Há mais de 90 dias</option>
                </select>
              </label>
            )}
          </div>
        )}
      </div>

      {canBulk && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
          <span className="font-medium text-blue-800">{selected.size} selecionado(s)</span>
          <button type="button" onClick={clearSelection} className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900"><X className="h-3.5 w-3.5" /> limpar</button>
          <span className="mx-1 h-4 w-px bg-blue-200" />
          {bulkBusy && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
          {!showArchived
            ? <button type="button" disabled={bulkBusy} onClick={() => runBulk('archive')} className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"><Archive className="h-3.5 w-3.5" /> Arquivar</button>
            : <button type="button" disabled={bulkBusy} onClick={() => runBulk('unarchive')} className="inline-flex items-center gap-1 rounded-md border border-green-300 bg-white px-2.5 py-1 font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" /> Desarquivar</button>}
          <span className="inline-flex items-center gap-1">
            <TagIcon className="h-3.5 w-3.5 text-gray-500" />
            <input value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} placeholder="tag" className="w-24 rounded-md border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="button" disabled={bulkBusy || !bulkTag.trim()} onClick={() => runBulk('add_tag', bulkTag.trim())} className="rounded-md border border-gray-200 bg-white px-2 py-1 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">+</button>
            <button type="button" disabled={bulkBusy || !bulkTag.trim()} onClick={() => runBulk('remove_tag', bulkTag.trim())} className="rounded-md border border-gray-200 bg-white px-2 py-1 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">−</button>
          </span>
          {groups.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <FolderInput className="h-3.5 w-3.5 text-gray-500" />
              <select value={bulkGroup} onChange={(e) => setBulkGroup(e.target.value)} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">compartilhar c/ grupo…</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <select value={bulkGroupLevel} onChange={(e) => setBulkGroupLevel(e.target.value)} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" title="Nível de acesso concedido ao grupo">
                <option value="view">Ver</option>
                <option value="edit">Editar</option>
              </select>
              <button type="button" disabled={bulkBusy || !bulkGroup} onClick={() => runBulk(bulkGroupLevel === 'edit' ? 'add_group_edit' : 'add_group', bulkGroup)} className="rounded-md border border-gray-200 bg-white px-2 py-1 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">aplicar</button>
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
        <span>Mostrando {Math.min(visibleSecrets.length, filteredSecrets.length)} de {filteredSecrets.length} acessos filtrados.</span>
        {(advancedFilters > 0 || search) && <button type="button" onClick={() => { setSearch(''); clearAllFilters(); }} className="font-medium text-blue-600 hover:text-blue-800">Limpar filtros</button>}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-700 font-medium"><tr>{canBulk && <th className="px-4 py-3 w-10"><input type="checkbox" aria-label="Selecionar todos" checked={allFilteredSelected} onChange={toggleAll} className="h-4 w-4 rounded border-gray-300" /></th>}<th className="px-4 py-3">Acesso</th><th className="px-4 py-3">Login</th><th className="px-4 py-3">Link</th><th className="px-4 py-3">Tags</th><th className="px-4 py-3">Forca</th><th className="px-4 py-3">Permissao</th>{showLastAccess && <th className="px-4 py-3">Último acesso</th>}<th className="px-4 py-3">Atualizado</th><th className="px-4 py-3 text-right">Acoes</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSecrets.length === 0 ? <tr><td colSpan={8 + (canBulk ? 1 : 0) + (showLastAccess ? 1 : 0)} className="px-4 py-8 text-center text-gray-500">{showArchived ? 'Nenhum acesso arquivado.' : 'Nenhum acesso encontrado com os filtros atuais.'}</td></tr> : visibleSecrets.map(secret => (
                <tr key={secret.id} className={`hover:bg-gray-50 transition-colors ${selected.has(secret.id) ? 'bg-blue-50/60' : ''}`}>
                  {canBulk && <td className="px-4 py-3">{!secret.is_catalog_only && <input type="checkbox" aria-label="Selecionar acesso" checked={selected.has(secret.id)} onChange={() => toggleOne(secret.id)} className="h-4 w-4 rounded border-gray-300" />}</td>}
                  <td className="px-4 py-3 font-medium text-gray-900"><div className="flex items-center gap-3"><AccessIcon secret={secret} /><div>{secret.is_catalog_only || auditMode ? <span>{secret.title}</span> : <button onClick={() => onView(secret)} className="hover:underline hover:text-blue-600 text-left">{secret.title}</button>}{secret.is_archived && <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">{t('archived')}</span>}</div></div></td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{secret.login || '-'}</td>
                  <td className="px-4 py-3">{secret.link ? <a href={secret.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>Abrir <ExternalLink className="h-3 w-3" /></a> : '-'}</td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{secret.tags?.slice(0, 3).map((tag, idx) => <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">{tag}</span>)}{secret.tags?.length > 3 && <span className="text-xs text-gray-500">+{secret.tags.length - 3}</span>}</div></td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getPasswordStrengthClassName(secret.password_strength)}`}>{getPasswordStrengthLabel(secret.password_strength)}</span></td>
                  <td className="px-4 py-3">{secret.is_catalog_only ? <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"><ShieldQuestion className="w-3 h-3 mr-1" /> Acesso nao liberado</span> : secret.is_personal ? <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700"><Lock className="w-3 h-3 mr-1" /> Particular</span> : <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700"><Users className="w-3 h-3 mr-1" /> Compartilhada</span>}</td>
                  {showLastAccess && (() => { const rec = getLastAccess(secret.id); return (
                    <td className="px-4 py-3 text-gray-500" title={rec ? `${new Date(rec.last_access).toLocaleString('pt-BR')} · ${rec.access_count}x` : 'Nenhum acesso registrado'}>
                      {rec ? formatRelative(rec.last_access) : <span className="text-gray-400">Nunca</span>}
                    </td>
                  ); })()}
                  <td className="px-4 py-3 text-gray-500">{formatDate(secret.updated_at)}</td>
                  <td className="px-4 py-3 text-right">{auditMode ? <span className="text-xs text-gray-400">Somente auditoria</span> : secret.is_catalog_only ? <span className="text-xs text-gray-400">Solicite acesso</span> : <div className="flex items-center justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => onView(secret)} className="h-8 w-8 p-0"><Eye className="h-4 w-4 text-gray-500" /></Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4 text-gray-500" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onView(secret)}><Eye className="mr-2 h-4 w-4" /> Ver detalhes</DropdownMenuItem>{canEditSecret(secret) && <DropdownMenuItem onClick={() => onEdit(secret)}><Edit2 className="mr-2 h-4 w-4" /> Editar acesso</DropdownMenuItem>}{canShareSecret(secret) && !secret.is_archived && <DropdownMenuItem onClick={() => onShare(secret)}><Share2 className="mr-2 h-4 w-4" /> Compartilhar acesso</DropdownMenuItem>}{canArchiveSecret(secret) && !secret.is_archived && <DropdownMenuItem onClick={() => onArchive(secret)} className="text-amber-700 focus:text-amber-700"><Archive className="mr-2 h-4 w-4" /> {t('archive')}</DropdownMenuItem>}{canArchiveSecret(secret) && secret.is_archived && <DropdownMenuItem onClick={() => onRestore(secret)} className="text-green-700 focus:text-green-700"><RotateCcw className="mr-2 h-4 w-4" /> {t('restore')}</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></div>}</td>
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
