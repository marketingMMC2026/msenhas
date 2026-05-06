import React from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  onConfirm,
  onCancel,
  isLoading = false,
  isDangerous = false
}) => {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity animate-in fade-in" />
        <AlertDialog.Content className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-50 w-full max-w-md rounded-lg bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200">
          <AlertDialog.Title className="text-lg font-semibold text-gray-900 mb-2">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-gray-600 mb-6">
            {message}
          </AlertDialog.Description>
          
          <div className="flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
              >
                {cancelText}
              </Button>
            </AlertDialog.Cancel>
            
            <Button
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }}
              disabled={isLoading}
              className={`${
                isDangerous 
                  ? "bg-red-600 hover:bg-red-700 text-white" 
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirmText}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
};

export default ConfirmDialog;