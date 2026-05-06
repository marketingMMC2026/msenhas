import React, { useState, useMemo } from 'react';
import { 
  Search, 
  ExternalLink, 
  Edit2, 
  Trash2, 
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

const SecretTable = ({ secrets, loading, onView, onEdit, onDelete, onShare }) => {
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tags = new Set();
    secrets.forEach(s => s.tags?.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [secrets]);

  // Filter secrets
  const filteredSecrets = useMemo(() => {
    return secrets.filter(secret => {
      const searchLower = search.toLowerCase();
      const matchesSearch = 
        secret.title.toLowerCase().includes(searchLower) ||
        (secret.login && secret.login.toLowerCase().includes(searchLower)) ||
        (secret.link && secret.link.toLowerCase().includes(searchLower));
      
      const matchesTags = selectedTags.length === 0 || 
        (secret.tags && selectedTags.every(tag => secret.tags.includes(tag)));

      return matchesSearch && matchesTags;
    });
  }, [secrets, search, selectedTags]);

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

  if (loading) {
    return <div className="py-10 flex justify-center"><LoadingSpinner size="lg" message="Loading secrets..." /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search secrets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-700 font-medium">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Login</th>
                <th className="px-4 py-3">Link</th>
                <th className="px-4 py-3">Tags</th>
                <th className="px-4 py-3">Access</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSecrets.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                    No secrets found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredSecrets.map(secret => (
                  <tr key={secret.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <button onClick={() => onView(secret)} className="hover:underline hover:text-blue-600 text-left">
                        {secret.title}
                      </button>
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
                          Open <ExternalLink className="h-3 w-3" />
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
                           <Lock className="w-3 h-3 mr-1" /> Personal
                         </span>
                      ) : (
                         <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                           <Users className="w-3 h-3 mr-1" /> Shared
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
                              <Eye className="mr-2 h-4 w-4" /> View Details
                            </DropdownMenuItem>
                            
                            {(secret.my_permission === 'owner' || ['edit', 'manage_access'].includes(secret.my_permission)) && (
                              <DropdownMenuItem onClick={() => onEdit(secret)}>
                                <Edit2 className="mr-2 h-4 w-4" /> Edit Secret
                              </DropdownMenuItem>
                            )}
                            
                            {(secret.my_permission === 'owner' || secret.my_permission === 'manage_access') && (
                              <DropdownMenuItem onClick={() => onShare(secret)}>
                                <Share2 className="mr-2 h-4 w-4" /> Share Access
                              </DropdownMenuItem>
                            )}
                            
                            {secret.my_permission === 'owner' && (
                              <DropdownMenuItem 
                                onClick={() => onDelete(secret)} 
                                className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
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