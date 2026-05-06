import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { BarChart3, Users, Lock, Activity } from 'lucide-react';
import Table from '@/components/Table';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { formatActionLabel, formatResourceLabel } from '@/utils/labels';

const DashboardPage = () => {
  const { toast } = useToast();
  const { user, profile, isAdmin } = useAuth();
  const [metrics, setMetrics] = useState({
    users: '---',
    secrets: '---',
    pendingRequests: '---',
    groups: '---',
  });
  const [recentActivity, setRecentActivity] = useState([]);

  const userName = profile?.full_name || user?.email?.split('@')[0] || 'Usuário';

  useEffect(() => {
    const fetchDashboard = async () => {
      if (!user) return;

      try {
        const [
          usersResult,
          secretsResult,
          pendingResult,
          groupsResult,
          logsResult,
        ] = await Promise.all([
          isAdmin
            ? supabase.from('profiles').select('id', { count: 'exact', head: true })
            : Promise.resolve({ count: null, error: null }),
          supabase.from('secrets').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          isAdmin
            ? supabase.from('access_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
            : supabase.from('access_requests').select('id', { count: 'exact', head: true }).eq('requested_by_id', user.id).eq('status', 'pending'),
          isAdmin
            ? supabase.from('groups').select('id', { count: 'exact', head: true })
            : Promise.resolve({ count: null, error: null }),
          supabase
            .from('audit_logs')
            .select('action, resource_type, created_at, profiles:user_id(email)')
            .order('created_at', { ascending: false })
            .limit(5),
        ]);

        const firstError = [
          usersResult,
          secretsResult,
          pendingResult,
          groupsResult,
          logsResult,
        ].find((result) => result.error)?.error;

        if (firstError) throw firstError;

        setMetrics({
          users: isAdmin ? String(usersResult.count ?? 0) : 'Restrito',
          secrets: String(secretsResult.count ?? 0),
          pendingRequests: String(pendingResult.count ?? 0),
          groups: isAdmin ? String(groupsResult.count ?? 0) : 'Restrito',
        });

        const formattedLogs = (logsResult.data || []).map((log) => ({
          activity: formatActionLabel(log.action),
          user: log.profiles?.email || 'Sistema',
          timestamp: new Date(log.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
          status: formatResourceLabel(log.resource_type),
        }));

        setRecentActivity(
          formattedLogs.length > 0
            ? formattedLogs
            : [{ activity: 'Login no sistema', user: user?.email || 'Usuário atual', timestamp: 'Agora', status: 'Sucesso' }]
        );
      } catch (err) {
        toast({
          title: 'Erro ao carregar dashboard',
          description: err.message,
          variant: 'destructive',
        });
      }
    };

    fetchDashboard();
  }, [user, isAdmin, toast]);

  const stats = [
    {
      title: 'Total de Usuários',
      value: metrics.users, 
      icon: Users,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
      iconColor: 'text-blue-600'
    },
    {
      title: 'Cofres Ativos',
      value: metrics.secrets,
      icon: Lock,
      color: 'from-green-500 to-green-600',
      bgColor: 'bg-green-50',
      iconColor: 'text-green-600'
    },
    {
      title: 'Pedidos Pendentes',
      value: metrics.pendingRequests,
      icon: Activity,
      color: 'from-orange-500 to-orange-600',
      bgColor: 'bg-orange-50',
      iconColor: 'text-orange-600'
    },
    {
      title: 'Total de Grupos',
      value: metrics.groups,
      icon: BarChart3,
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-50',
      iconColor: 'text-purple-600'
    }
  ];

  const columns = [
    { key: 'activity', label: 'Atividade' },
    { key: 'user', label: 'Usuário' },
    { key: 'timestamp', label: 'Data/Hora' },
    { key: 'status', label: 'Status' }
  ];

  const handleRowClick = (row) => {
    toast({
      title: 'Detalhes da Atividade',
      description: `${row.activity} por ${row.user}`,
    });
  };

  return (
    <>
      <Helmet>
        <title>Painel - MSENHAS</title>
        <meta name="description" content="Visão geral do seu painel MSENHAS." />
      </Helmet>

      <div className="space-y-8">
        {/* Welcome Section */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Bem-vindo de volta, {userName}!</h1>
          <p className="text-gray-600">Aqui está o que está acontecendo com seu cofre hoje.</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div
                key={index}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`h-6 w-6 ${stat.iconColor}`} />
                  </div>
                </div>
                <h3 className="text-gray-600 text-sm font-medium mb-1">{stat.title}</h3>
                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
              </div>
            );
          })}
        </div>

        {/* Recent Activity Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Atividade Recente</h2>
          <Table 
            columns={columns} 
            data={recentActivity} 
            onRowClick={handleRowClick}
          />
        </div>
      </div>
    </>
  );
};

export default DashboardPage;
