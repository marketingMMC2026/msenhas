import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const LoadingSpinner = ({ size = 'md', text, message, className }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  const displayMessage = message || text || "Carregando...";

  return (
    <div className={cn("flex flex-col items-center justify-center p-4", className)}>
      <Loader2 className={cn("animate-spin text-blue-600", sizeClasses[size])} />
      <p className="mt-2 text-sm text-gray-500 font-medium">{displayMessage}</p>
    </div>
  );
};

export default LoadingSpinner;