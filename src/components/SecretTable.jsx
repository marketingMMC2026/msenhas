import React, { useState, useMemo } from 'react';
import {
  Search,
  ExternalLink,
  Edit2,
  Archive,
  RotateCcw,
  Share2,
  Eye,
  MoreHorizontal,
  Lock,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/LoadingSpinner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from '@/contexts/LanguageContext';

const SecretTable = ({ secrets, loading, showArchived, onShowArchivedChange, onView, onEdit, onArchive, onRestore, onShare }) => {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);

  const allTags = useMemo(() => {
    const tags = new Set();
    secrets.forEach(s => s.tags?.forEach(tag => tags.add(tag)));
    return Array.from(tags).sort();
  }, [secrets]);

  const activeCount = secrets.filter(secret => !secret.is_archived).length;
  const archivedCount = secrets.filter(secret => secret.is_archived).length;

  const filteredSecrets = useMemo(() => {
    return secrets.filter(secret => {
      if (Boolean(secret.is_archived) !== showArchived) return false;

      const searchLower = search.toLowerCase();
      const matchesSearch =
        secret.title.toLowerCase().includes(searchLower) ||
        (secret.login && secret.login.toLowerCase().includes(searchLower)) ||
        (secret.link && secret.link.toLowerCase().includes(searchLower));

      const matchesTags = selectedTags.length === 0 ||
        (secret.tags && selectedTags.every(tag => secret.tags.includes(tag)));

      return matchesSearch && matchesTags;
    });
  }, [secrets, search, selectedTags, showArchived]);

  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const canEditSecret = (secret) => !secret.is_archived && ['owner', 'admin', 'edit', 'manage_access'].includes(secret.my_permission);
  const canManageSecret = (secret) => ['owner', 'admin', 'manage_access'].includes(secret.my_permission);

  if (loading) {
    return <div className="py-10 flex justify-center"><LoadingSpinner size="lg" message="Carregando senhas..." /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex w-fit rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => onShowArchivedChange(false)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${!showArchived ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {t('activePasswords')} ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => onShowArchivedChange(true)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${showArchived ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {t('archivedPasswords')} ({archivedCount})
          </button>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar senhas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedTags.includes(tag)
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : 'bg-gray-100 text-gray-600 border border-transparent hover:bg-gray-200'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-700 font-medium">
              <tr>
                <th className="px-4 py-3">Titulo</th>
                <th className="px-4 py-3">Login</th>
                <th className="px-4 py-3">Link</th>
                <th className="px-4 py-3">Tags</th>
                <th className="px-4 py-3">Acesso</th>
                <th className="px-4 py-3">Atualizado</th>
                <th className="px-4 py-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSecrets.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                    {showArchived ? 'Nenhuma senha arquivada.' : 'Nenhuma senha encontrada com os filtros atuais.'}
                  </td>
                </tr>
              ) : (
                filteredSecrets.map(secret => (
                  <tr key={secret.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <button onClick={() => onView(secret)} className="hover:underline hover:text-blue-600 text-left">
                        {secret.title}
                      </button>
                      {secret.is_archived && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          {t('archived')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                      {secret.login || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {secret.link ? (
                        <a
                          href={secret.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Abrir <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {secret.tags?.slice(0, 3).map((tag, idx) => (
                          <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            {tag}
                          </span>
                        ))}
                        {secret.tags?.length > 3 && (
                          <span className="text-xs text-gray-500">+{secret.tags.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {secret.is_personal ? (
                         <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                           <Lock className="w-3 h-3 mr-1" /> Pessoal
                         </span>
                      ) : (
                         <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                           <Users className="w-3 h-3 mr-1" /> Compartilhada
                         </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDate(secret.updated_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => onView(secret)} className="h-8 w-8 p-0">
                          <Eye className="h-4 w-4 text-gray-500" />
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4 text-gray-500" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onView(secret)}>
                              <Eye className="mr-2 h-4 w-4" /> Ver detalhes
                            </DropdownMenuItem>

                            {canEditSecret(secret) && (
                              <DropdownMenuItem onClick={() => onEdit(secret)}>
                                <Edit2 className="mr-2 h-4 w-4" /> Editar senha
                              </DropdownMenuItem>
                            )}

                            {canManageSecret(secret) && !secret.is_archived && (
                              <DropdownMenuItem onClick={() => onShare(secret)}>
                                <Share2 className="mr-2 h-4 w-4" /> Compartilhar acesso
                              </DropdownMenuItem>
                            )}

                            {canManageSecret(secret) && !secret.is_archived && (
                              <DropdownMenuItem onClick={() => onArchive(secret)} className="text-amber-700 focus:text-amber-700">
                                <Archive className="mr-2 h-4 w-4" /> {t('archive')}
                              </DropdownMenuItem>
                            )}

                            {canManageSecret(secret) && secret.is_archived && (
                              <DropdownMenuItem onClick={() => onRestore(secret)} className="text-green-700 focus:text-green-700">
                                <RotateCcw className="mr-2 h-4 w-4" /> {t('restore')}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SecretTable;
