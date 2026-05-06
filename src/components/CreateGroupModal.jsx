import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Loader2 } from 'lucide-react';

const CreateGroupModal = ({ open, onOpenChange, onSuccess }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { user } = useAuth();
  const { toast } = useToast();
  const { logAction } = useAuditLog();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
        toast({ title: "Erro", description: "O nome do grupo é obrigatório.", variant: "destructive" });
        return;
    }

    if (!user?.id) {
        toast({ variant: "destructive", title: "Erro de sessão", description: "Sessão ainda carregando. Tente novamente." });
        return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('groups')
        .insert({
          name: name.trim(),
          description: description.trim(),
          created_by: user.id
        })
        .select()
        .single();

      if (error) throw error;

      await logAction('create_group', 'group', data.id, { name: data.name });

      toast({ title: "Sucesso", description: "Grupo criado com sucesso." });
      
      // Reset form
      setName('');
      setDescription('');
      
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error('Error creating group:', {
          status: err.code,
          code: err.code,
          message: err.message
      });
      toast({ 
        variant: "destructive", 
        title: "Erro ao criar grupo", 
        description: err.message 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Criar Grupo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Grupo</Label>
            <Input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Desenvolvedores"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px]"
              placeholder="Ex: Grupo para acesso aos servidores de desenvolvimento."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando...</> : 'Criar Grupo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateGroupModal;