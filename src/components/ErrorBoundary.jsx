import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Captura erros de render não tratados e evita a "tela branca" — crítico num gerenciador de senhas.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log local para diagnóstico; não expõe dados sensíveis.
    console.error('ErrorBoundary capturou um erro:', error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center border-t-4 border-red-500">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
            <AlertTriangle className="h-10 w-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Algo deu errado</h1>
          <p className="text-gray-600 mb-8">
            Ocorreu um erro inesperado. Recarregue a página para continuar. Se persistir, avise o administrador.
          </p>
          <Button onClick={this.handleReload} variant="outline" className="w-full">
            Recarregar
          </Button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
