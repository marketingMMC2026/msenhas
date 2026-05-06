import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { encryptSecretText } from '@/lib/secretCrypto';
import { Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

const normalize = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const columnAliases = {
  title: ['titulo', 'nome', 'name', 'title', 'servico', 'servico/site', 'site', 'sistema'],
  login: ['login', 'usuario', 'user', 'username', 'email', 'conta'],
  secretValue: ['senha', 'password', 'secret', 'segredo', 'chave'],
  link: ['link', 'url', 'site', 'endereco'],
  notes: ['notas', 'observacoes', 'observacao', 'notes', 'descricao'],
  tags: ['tags', 'categoria', 'categorias', 'grupo'],
};

const splitCsvLine = (line) => {
  const cells = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if ((char === ',' || char === ';') && !insideQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
};

const parseCsv = (content) => {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { rows: [], errors: ['A planilha precisa ter cabecalho e pelo menos uma linha.'] };
  }

  const headers = splitCsvLine(lines[0]).map(normalize);
  const findIndex = (field) => headers.findIndex((header) => columnAliases[field].includes(header));

  const indexes = {
    title: findIndex('title'),
    login: findIndex('login'),
    secretValue: findIndex('secretValue'),
    link: findIndex('link'),
    notes: findIndex('notes'),
    tags: findIndex('tags'),
  };

  const errors = [];
  if (indexes.title === -1) errors.push('Nao encontrei uma coluna de titulo/nome.');
  if (indexes.secretValue === -1) errors.push('Nao encontrei uma coluna de senha.');

  const rows = lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    const title = cells[indexes.title]?.trim() || '';
    const secretValue = cells[indexes.secretValue]?.trim() || '';

    return {
      rowNumber: index + 2,
      title,
      login: indexes.login >= 0 ? cells[indexes.login]?.trim() || '' : '',
      secretValue,
      link: indexes.link >= 0 ? cells[indexes.link]?.trim() || '' : '',
      notes: indexes.notes >= 0 ? cells[indexes.notes]?.trim() || '' : '',
      tags: indexes.tags >= 0 ? cells[indexes.tags]?.split(',').map((tag) => tag.trim()).filter(Boolean) || [] : [],
      valid: Boolean(title && secretValue),
    };
  });

  return { rows, errors };
};

const ImportSecretsModal = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { logAction } = useAuditLog();
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [permissionLevel, setPermissionLevel] = useState('view');
  const [loading, setLoading] = useState(false);

  const validRows = useMemo(() => rows.filter((row) => row.valid), [rows]);
  const invalidRows = rows.length - validRows.length;

  useEffect(() => {
    const fetchTargets = async () => {
      if (!isOpen || !user?.id) return;

      const [usersResult, groupsResult] = await Promise.all([
        supabase.from('profiles').select('id, email, full_name').eq('is_active', true).neq('id', user.id).order('email'),
        supabase.from('groups').select('id, name').order('name'),
      ]);

      if (!usersResult.error) setAvailableUsers(usersResult.data || []);
      if (!groupsResult.error) setAvailableGroups(groupsResult.data || []);
    };

    fetchTargets();
  }, [isOpen, user?.id]);

  const reset = () => {
    setRows([]);
    setErrors([]);
    setSelectedUsers([]);
    setSelectedGroups([]);
    setPermissionLevel('view');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.txt')) {
      setRows([]);
      setErrors(['Use um arquivo CSV exportado da planilha.']);
      return;
    }

    const content = await file.text();
    const parsed = parseCsv(content);
    setRows(parsed.rows);
    setErrors(parsed.errors);
  };

  const toggleSelection = (id, selected, setter) => {
    setter((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const handleImport = async () => {
    if (!user?.id || validRows.length === 0) return;

    setLoading(true);
    let insertedSecrets = [];
    try {
      const hasSharedAccess = selectedUsers.length > 0 || selectedGroups.length > 0;
      const payloads = await Promise.all(validRows.map(async (row) => ({
        owner_id: user.id,
        title: row.title,
        login: row.login || null,
        secret_value: await encryptSecretText(row.secretValue),
        link: row.link || null,
        notes: row.notes || null,
        tags: row.tags,
        is_personal: !hasSharedAccess,
      })));

      const { data, error: insertError } = await supabase
        .from('secrets')
        .insert(payloads)
        .select('id, title');

      if (insertError) throw insertError;
      insertedSecrets = data || [];

      const permissionPayloads = [];
      insertedSecrets.forEach((secret) => {
        selectedUsers.forEach((userId) => {
          permissionPayloads.push({
            secret_id: secret.id,
            granted_to_user_id: userId,
            granted_to_group_id: null,
            permission_level: permissionLevel,
            granted_by_id: user.id,
          });
        });

        selectedGroups.forEach((groupId) => {
          permissionPayloads.push({
            secret_id: secret.id,
            granted_to_user_id: null,
            granted_to_group_id: groupId,
            permission_level: permissionLevel,
            granted_by_id: user.id,
          });
        });
      });

      if (permissionPayloads.length > 0) {
        const { error: permissionsError } = await supabase.from('secret_permissions').insert(permissionPayloads);
        if (permissionsError) throw permissionsError;
      }

      await logAction('import_secrets', 'import', insertedSecrets[0]?.id, {
        total: insertedSecrets.length,
        users: selectedUsers.length,
        groups: selectedGroups.length,
        permission: permissionLevel,
      });

      toast({ title: 'Importacao concluida', description: `${insertedSecrets.length} senha(s) importada(s).` });
      onSuccess?.();
      handleClose();
    } catch (err) {
      if (insertedSecrets.length > 0) {
        await supabase
          .from('secrets')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', insertedSecrets.map((secret) => secret.id));
      }

      toast({ title: 'Erro ao importar', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar senhas por planilha</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            Exporte sua planilha como CSV com colunas como <strong>titulo</strong>, <strong>login</strong>, <strong>senha</strong>, <strong>link</strong>, <strong>notas</strong> e <strong>tags</strong>.
          </div>

          <div className="space-y-2">
            <Label htmlFor="csv-file">Arquivo CSV</Label>
            <input
              id="csv-file"
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700"
            />
          </div>

          {errors.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errors.map((error) => <div key={error} className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4" /> {error}</div>)}
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-3 py-1 text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> {validRows.length} valida(s)
                </span>
                {invalidRows > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-3 py-1 text-yellow-800">
                    <AlertCircle className="h-4 w-4" /> {invalidRows} ignorada(s)
                  </span>
                )}
              </div>

              <div className="max-h-48 overflow-auto rounded-lg border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2">Linha</th>
                      <th className="px-3 py-2">Titulo</th>
                      <th className="px-3 py-2">Login</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.slice(0, 8).map((row) => (
                      <tr key={row.rowNumber}>
                        <td className="px-3 py-2 text-gray-500">{row.rowNumber}</td>
                        <td className="px-3 py-2 font-medium">{row.title || '-'}</td>
                        <td className="px-3 py-2">{row.login || '-'}</td>
                        <td className="px-3 py-2">{row.valid ? 'Pronta' : 'Faltam titulo/senha'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Usuarios com acesso</Label>
              <div className="max-h-40 overflow-auto rounded-md border border-gray-200 p-2">
                {availableUsers.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-gray-500">Nenhum usuario disponivel.</p>
                ) : availableUsers.map((target) => (
                  <label key={target.id} className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-gray-50">
                    <input type="checkbox" checked={selectedUsers.includes(target.id)} onChange={() => toggleSelection(target.id, selectedUsers, setSelectedUsers)} />
                    <span>{target.full_name || target.email}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Grupos com acesso</Label>
              <div className="max-h-40 overflow-auto rounded-md border border-gray-200 p-2">
                {availableGroups.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-gray-500">Nenhum grupo disponivel.</p>
                ) : availableGroups.map((group) => (
                  <label key={group.id} className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-gray-50">
                    <input type="checkbox" checked={selectedGroups.includes(group.id)} onChange={() => toggleSelection(group.id, selectedGroups, setSelectedGroups)} />
                    <span>{group.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nivel de permissao para os acessos selecionados</Label>
            <Select value={permissionLevel} onValueChange={setPermissionLevel}>
              <SelectTrigger className="max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">Visualizar</SelectItem>
                <SelectItem value="edit">Editar</SelectItem>
                <SelectItem value="manage_access">Gerenciar acessos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleImport} disabled={loading || validRows.length === 0} className="bg-blue-600 text-white hover:bg-blue-700">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importando...</> : <><Upload className="mr-2 h-4 w-4" /> Importar senhas</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportSecretsModal;
