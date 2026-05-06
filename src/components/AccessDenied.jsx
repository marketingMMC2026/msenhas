import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const AccessDenied = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center border-t-4 border-red-500">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
          <ShieldAlert className="h-10 w-10 text-red-600" />
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Acesso Negado</h1>
        <p className="text-gray-600 mb-8">
          Você não tem permissão para acessar esta área. Esta página é restrita apenas para administradores do sistema.
        </p>
        
        <Link to="/dashboard">
          <Button variant="outline" className="w-full flex items-center justify-center gap-2 hover:bg-gray-100">
            <ArrowLeft className="h-4 w-4" />
            Voltar para Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default AccessDenied;