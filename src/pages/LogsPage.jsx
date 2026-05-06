import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Search, ChevronLeft, ChevronRight, X } from 'lucide-react';

const LogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const [filters, setFilters] = useState({
    action: '',
    resourceType: '',
    email: '',
    startDate: '',
    endDate: ''
  });

  const [uniqueActions, setUniqueActions] = useState([]);
  const [uniqueResourceTypes, setUniqueResourceTypes] = useState([]);

  useEffect(() => {
    fetchLogs();
    fetchFilterOptions();
  }, [page, filters.action, filters.resourceType, filters.startDate, filters.endDate]);

  const fetchFilterOptions = async () => {
    setUniqueActions(['login', 'logout', 'create_secret', 'view_secret', 'create_group', 'delete_group', 'update_user_is_admin', 'update_user_is_active', 'approve_request', 'deny_request']);
    setUniqueResourceTypes(['auth', 'secret', 'group', 'profile', 'access_request']);
  };

  const fetchLogs = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('audit_logs')
        .select('*, profiles:user_id(email)')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filters.action) query = query.eq('action', filters.action);
      if (filters.resourceType) query = query.eq('resource_type', filters.resourceType);
      if (filters.startDate) query = query.gte('created_at', filters.startDate);
      if (filters.endDate) query = query.lte('created_at', filters.endDate);
      
      if (filters.email) {
         query = supabase
          .from('audit_logs')
          .select('*, profiles!inner(email)')
          .ilike('profiles.email', `%${filters.email}%`)
          .order('created_at', { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
         
         if (filters.action) query = query.eq('action', filters.action);
         if (filters.resourceType) query = query.eq('resource_type', filters.resourceType);
         if (filters.startDate) query = query.gte('created_at', filters.startDate);
         if (filters.endDate) query = query.lte('created_at', filters.endDate);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      setLogs(data || []);
      setHasMore(data?.length === PAGE_SIZE);

    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Erro ao buscar logs" });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(0);
    fetchLogs();
  };

  const clearFilters = () => {
    setFilters({
      action: '',
      resourceType: '',
      email: '',
      startDate: '',
      endDate: ''
    });
    setPage(0);
  };

  return (
    <>
      <Helmet>
        <title>Logs de Auditoria - SecureVault</title>
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Logs de Auditoria</h1>
          <p className="text-gray-600 mt-2">Monitore todas as atividades do sistema.</p>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar por email..."
                value={filters.email}
                onChange={(e) => setFilters(prev => ({ ...prev, email: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(e)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            </div>

            <select
              value={filters.action}
              onChange={(e) => { setFilters(prev => ({ ...prev, action: e.target.value })); setPage(0); }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Todas as Ações</option>
              {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>

            <select
              value={filters.resourceType}
              onChange={(e) => { setFilters(prev => ({ ...prev, resourceType: e.target.value })); setPage(0); }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Todos os Tipos de Recurso</option>
              {uniqueResourceTypes.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => { setFilters(prev => ({ ...prev, startDate: e.target.value })); setPage(0); }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => { setFilters(prev => ({ ...prev, endDate: e.target.value })); setPage(0); }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          
          <div className="mt-4 flex justify-between items-center">
             <div className="text-xs text-gray-500">
                Exibindo logs {page * PAGE_SIZE + 1} - {page * PAGE_SIZE + logs.length}
             </div>
             <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearFilters}
                className="text-gray-500 hover:text-gray-700"
             >
               <X className="h-4 w-4 mr-1" /> Limpar Filtros
             </Button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
             <LoadingSpinner size="lg" text="Buscando logs..." className="py-12" />
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">Nenhum log encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-700 whitespace-nowrap">Data/Hora</th>
                    <th className="px-6 py-4 font-semibold text-gray-700">Usuário</th>
                    <th className="px-6 py-4 font-semibold text-gray-700">Ação</th>
                    <th className="px-6 py-4 font-semibold text-gray-700">Recurso</th>
                    <th className="px-6 py-4 font-semibold text-gray-700 w-1/3">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {log.profiles?.email || 'Sistema'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                         <div className="flex flex-col">
                            <span className="text-gray-900 font-medium">{log.resource_type}</span>
                            <span className="text-gray-400 text-xs font-mono truncate max-w-[150px]" title={log.resource_id}>{log.resource_id}</span>
                         </div>
                      </td>
                      <td className="px-6 py-4">
                        <details className="cursor-pointer group">
                          <summary className="text-xs text-blue-600 font-medium list-none flex items-center gap-1 group-open:text-blue-800">
                             <span>Ver JSON</span>
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-50 rounded border border-gray-100 text-xs text-gray-700 overflow-x-auto font-mono">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
            </Button>
            
            <span className="text-sm text-gray-600 font-medium">Página {page + 1}</span>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={!hasMore || loading}
            >
              Próximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default LogsPage;