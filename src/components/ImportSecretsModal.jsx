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
import { getPasswordStrength } from '@/lib/accessUtils';
import { Upload, Loader2, CheckCircle2, AlertCircle, Wand2, Download, Image, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

const normalize = (value) => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const TEMPLATE_PATH = '/templates/mpassword-import-template.xlsx';

const columnAliases = {
  title: ['titulo', 'título', 'nome', 'name', 'title', 'acesso', 'servico', 'serviço', 'servico/site', 'sistema', 'ferramenta', 'plataforma'],
  login: ['login', 'usuario', 'usuário', 'user', 'username', 'email', 'e-mail', 'conta'],
  secretValue: ['senha', 'password', 'secret', 'segredo', 'chave', 'token', 'credencial'],
  link: ['link', 'url', 'site', 'endereco', 'endereço', 'website', 'pagina', 'página'],
  notes: ['notas', 'observacoes', 'observações', 'observacao', 'observação', 'notes', 'descricao', 'descrição', 'detalhes'],
  tags: ['tags', 'tag', 'categoria', 'categorias', 'marcadores'],
  group: ['grupo', 'grupos', 'group', 'groups', 'equipe', 'team', 'pasta', 'departamento'],
};

const splitList = (value) => String(value || '').split(/[|,]/).map((item) => item.trim()).filter(Boolean);
const joinList = (items) => (items || []).join(', ');

const normalizeUrl = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const detectCsvDelimiter = (headerLine) => {
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ';' : ',';
};

const splitCsvLine = (line, delimiter = ',') => {
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
    } else if (char === delimiter && !insideQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
};

const normalizeCsvCells = (cells, headers, delimiter) => {
  if (cells.length <= headers.length) return cells;

  const normalizedCells = cells.slice(0, headers.length - 1);
  normalizedCells.push(cells.slice(headers.length - 1).join(`${delimiter} `).trim());
  return normalizedCells;
};

const findColumnIndexes = (headers) => {
  const usedIndexes = new Set();
  const fieldOrder = ['title', 'secretValue', 'login', 'link', 'notes', 'tags', 'group'];
  const indexes = {};

  fieldOrder.forEach((field) => {
    const aliases = columnAliases[field].map(normalize);
    let index = headers.findIndex((header, headerIndex) => !usedIndexes.has(headerIndex) && aliases.includes(header));

    if (index === -1) {
      index = headers.findIndex((header, headerIndex) => (
        !usedIndexes.has(headerIndex) &&
        aliases.some((alias) => header.includes(alias) || alias.includes(header))
      ));
    }

    indexes[field] = index;
    if (index >= 0) usedIndexes.add(index);
  });

  return indexes;
};

const buildRow = (row) => ({
  ...row,
  valid: Boolean(String(row.title || '').trim() && String(row.secretValue || '').trim()),
});

const parseMatrix = (matrix) => {
  const cleanedRows = matrix
    .map((row) => (row || []).map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some(Boolean));

  if (cleanedRows.length < 2) return { rows: [], errors: ['A planilha precisa ter cabecalho e pelo menos uma linha.'] };

  const headers = cleanedRows[0].map(normalize);
  const indexes = findColumnIndexes(headers);

  const errors = [];
  if (indexes.title === -1) errors.push('Nao encontrei uma coluna de titulo/nome.');
  if (indexes.secretValue === -1) errors.push('Nao encontrei uma coluna de senha.');

  const rows = cleanedRows.slice(1).map((cells, index) => {
    return buildRow({
      rowNumber: index + 2,
      title: indexes.title >= 0 ? cells[indexes.title]?.trim() || '' : '',
      login: indexes.login >= 0 ? cells[indexes.login]?.trim() || '' : '',
      secretValue: indexes.secretValue >= 0 ? cells[indexes.secretValue]?.trim() || '' : '',
      link: indexes.link >= 0 ? cells[indexes.link]?.trim() || '' : '',
      notes: indexes.notes >= 0 ? cells[indexes.notes]?.trim() || '' : '',
      tags: indexes.tags >= 0 ? splitList(cells[indexes.tags]) : [],
      groupNames: indexes.group >= 0 ? splitList(cells[indexes.group]) : [],
    });
  });

  return { rows, errors };
};

const parseCsv = (content) => {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: ['A planilha precisa ter cabecalho e pelo menos uma linha.'] };

  const delimiter = detectCsvDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map(normalize);
  const matrix = lines.map((line) => normalizeCsvCells(splitCsvLine(line, delimiter), headers, delimiter));
  return parseMatrix(matrix);
};

const parseExcelFile = async (file) => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return { rows: [], errors: ['Nao encontrei nenhuma aba na planilha.'] };
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { header: 1, defval: '', raw: false });
  return parseMatrix(matrix);
};

const ImportSecretsModal = ({ isOpen, onClose, onSuccess }) => {
  const { user, role } = useAuth();
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
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);

  const validRows = useMemo(() => rows.filter((row) => row.valid), [rows]);
  const invalidRows = rows.length - validRows.length;
  const groupsFromRows = useMemo(() => Array.from(new Set(validRows.flatMap((row) => row.groupNames))).sort(), [validRows]);
  const importLimit = role === 'admin' ? Infinity : 50;
  const hasImportLimit = Number.isFinite(importLimit);
  const overImportLimit = hasImportLimit && validRows.length > importLimit;

  const fetchTargets = async () => {
    if (!user?.id) return;
    const [usersResult, groupsResult] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name').eq('is_active', true).neq('id', user.id).order('email'),
      supabase.from('groups').select('id, name').order('name'),
    ]);
    if (!usersResult.error) setAvailableUsers(usersResult.data || []);
    if (!groupsResult.error) setAvailableGroups(groupsResult.data || []);
  };

  useEffect(() => { if (isOpen) fetchTargets(); }, [isOpen, user?.id]);

  const reset = () => {
    setRows([]);
    setErrors([]);
    setSelectedUsers([]);
    setSelectedGroups([]);
    setPermissionLevel('view');
    setShowTemplatePreview(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const fileName = file.name.toLowerCase();
    const isExcelFile = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    const isCsvFile = fileName.endsWith('.csv') || fileName.endsWith('.txt');
    if (!isExcelFile && !isCsvFile) {
      setRows([]);
      setErrors(['Use um arquivo Excel (.xlsx/.xls) ou CSV exportado da planilha.']);
      return;
    }
    const parsed = isExcelFile ? await parseExcelFile(file) : parseCsv(await file.text());
    setRows(parsed.rows);
    setErrors(parsed.errors);
  };

  const updateRow = (rowNumber, patch) => {
    setRows((current) => current.map((row) => row.rowNumber === rowNumber ? buildRow({ ...row, ...patch }) : row));
  };

  const toggleSelection = (id, setter) => {
    setter((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const applySelectedGroupsToRows = () => {
    const selectedGroupNames = selectedGroups
      .map((groupId) => availableGroups.find((group) => group.id === groupId)?.name)
      .filter(Boolean);

    if (selectedGroupNames.length === 0) {
      toast({ title: 'Selecione um grupo', description: 'Marque pelo menos um grupo na lista antes de aplicar nas linhas.' });
      return;
    }

    setRows((current) => current.map((row) => buildRow({
      ...row,
      groupNames: Array.from(new Set([...row.groupNames, ...selectedGroupNames])),
    })));
  };

  const ensureGroups = async () => {
    const groupMap = new Map(availableGroups.map((group) => [normalize(group.name), group]));
    const missingNames = groupsFromRows.filter((name) => !groupMap.has(normalize(name)));

    if (missingNames.length > 0) {
      const { data, error } = await supabase
        .from('groups')
        .insert(missingNames.map((name) => ({ name, description: 'Criado automaticamente na importacao de senhas.', created_by: user.id })))
        .select('id, name');
      if (error) throw error;
      (data || []).forEach((group) => groupMap.set(normalize(group.name), group));
      setAvailableGroups((current) => [...current, ...(data || [])].sort((a, b) => a.name.localeCompare(b.name)));
    }

    return groupMap;
  };

  const handleImport = async () => {
    if (!user?.id || validRows.length === 0) return;
    if (overImportLimit) {
      toast({
        title: 'Limite de importacao',
        description: `Seu perfil pode importar ate ${importLimit} acessos por vez. Divida a planilha e tente novamente.`,
        variant: 'destructive'
      });
      return;
    }
    setLoading(true);
    let insertedSecrets = [];
    try {
      const groupMap = await ensureGroups();
      const hasSharedAccess = selectedUsers.length > 0 || selectedGroups.length > 0 || groupsFromRows.length > 0;
      const payloads = await Promise.all(validRows.map(async (row) => ({
        owner_id: user.id,
        title: row.title.trim(),
        login: row.login.trim() || null,
        secret_value: await encryptSecretText(row.secretValue.trim()),
        password_strength: getPasswordStrength(row.secretValue.trim()).level,
        link: normalizeUrl(row.link) || null,
        notes: row.notes.trim() || null,
        tags: row.tags,
        is_personal: !hasSharedAccess,
      })));

      const { data, error: insertError } = await supabase.from('secrets').insert(payloads).select('id, title');
      if (insertError) throw insertError;
      insertedSecrets = data || [];

      const permissionPayloads = [];
      insertedSecrets.forEach((secret, index) => {
        const row = validRows[index];
        const rowGroupIds = row.groupNames.map((name) => groupMap.get(normalize(name))?.id).filter(Boolean);
        const groupIds = Array.from(new Set([...selectedGroups, ...rowGroupIds]));

        selectedUsers.forEach((userId) => permissionPayloads.push({ secret_id: secret.id, granted_to_user_id: userId, granted_to_group_id: null, permission_level: permissionLevel, granted_by_id: user.id }));
        groupIds.forEach((groupId) => permissionPayloads.push({ secret_id: secret.id, granted_to_user_id: null, granted_to_group_id: groupId, permission_level: permissionLevel, granted_by_id: user.id }));
      });

      if (permissionPayloads.length > 0) {
        const { error: permissionsError } = await supabase.from('secret_permissions').insert(permissionPayloads);
        if (permissionsError) throw permissionsError;
      }

      await logAction('import_secrets', 'import', insertedSecrets[0]?.id, { total: insertedSecrets.length, users: selectedUsers.length, groups: selectedGroups.length + groupsFromRows.length, permission: permissionLevel });
      toast({ title: 'Importacao concluida', description: `${insertedSecrets.length} senha(s) importada(s).` });
      onSuccess?.();
      handleClose();
    } catch (err) {
      if (insertedSecrets.length > 0) await supabase.from('secrets').update({ deleted_at: new Date().toISOString() }).in('id', insertedSecrets.map((secret) => secret.id));
      toast({ title: 'Erro ao importar', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Importar acessos por planilha</DialogTitle></DialogHeader>
        <div className="space-y-5">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <p className="font-medium">Use o modelo abaixo ou importe uma planilha Excel/CSV com colunas equivalentes.</p>
                <ol className="list-decimal space-y-1 pl-4">
                  <li>Baixe o modelo Excel.</li>
                  <li>Preencha as colunas <strong>titulo</strong>, <strong>login</strong>, <strong>senha</strong>, <strong>link</strong>, <strong>notas</strong>, <strong>tags</strong> e <strong>grupo</strong>.</li>
                  <li>Envie a planilha, revise os dados reconhecidos e ajuste qualquer campo antes de importar.</li>
                </ol>
                {hasImportLimit && <p className="text-blue-800">Seu perfil pode importar ate <strong>{importLimit} acessos por vez</strong>.</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button asChild type="button" variant="outline" className="border-blue-200 bg-white text-blue-700 hover:bg-blue-50">
                  <a href={TEMPLATE_PATH} download>
                    <Download className="mr-2 h-4 w-4" /> Baixar modelo Excel
                  </a>
                </Button>
                <Button type="button" variant="outline" className="border-blue-200 bg-white text-blue-700 hover:bg-blue-50" onClick={() => setShowTemplatePreview((value) => !value)}>
                  <Image className="mr-2 h-4 w-4" /> Ver imagem exemplo
                </Button>
              </div>
            </div>
          </div>

          {showTemplatePreview && (
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <FileSpreadsheet className="h-4 w-4 text-green-600" /> Exemplo visual da planilha
              </div>
              <div className="overflow-auto rounded-md border border-gray-200">
                <table className="min-w-[940px] w-full text-left text-xs">
                  <thead className="bg-green-50 text-green-900">
                    <tr>
                      {['titulo', 'login', 'senha', 'link', 'notas', 'tags', 'grupo'].map((header) => (
                        <th key={header} className="border-b border-green-100 px-3 py-2 font-semibold">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="px-3 py-2">Instagram - Cliente MMC</td>
                      <td className="px-3 py-2">marketing@empresa.com</td>
                      <td className="px-3 py-2">SenhaForte#2026</td>
                      <td className="px-3 py-2">https://instagram.com</td>
                      <td className="px-3 py-2">Conta usada pela equipe de social media.</td>
                      <td className="px-3 py-2">marketing, cliente</td>
                      <td className="px-3 py-2">Marketing</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">Hostinger - Cliente ABC</td>
                      <td className="px-3 py-2">admin</td>
                      <td className="px-3 py-2">OutraSenha#2026</td>
                      <td className="px-3 py-2">https://hpanel.hostinger.com</td>
                      <td className="px-3 py-2">Hospedagem do site institucional.</td>
                      <td className="px-3 py-2">cliente, site</td>
                      <td className="px-3 py-2">Acessos de Clientes</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="csv-file">Arquivo Excel ou CSV</Label>
            <input id="csv-file" type="file" accept=".xlsx,.xls,.csv,.txt" onChange={handleFileChange} className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700" />
          </div>
          {errors.length > 0 && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errors.map((error) => <div key={error} className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4" /> {error}</div>)}</div>}
          {rows.length > 0 && <>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-3 py-1 text-green-700"><CheckCircle2 className="h-4 w-4" /> {validRows.length} valida(s)</span>
              {invalidRows > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-3 py-1 text-yellow-800"><AlertCircle className="h-4 w-4" /> {invalidRows} incompleta(s)</span>}
              {groupsFromRows.length > 0 && <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">{groupsFromRows.length} grupo(s) nas linhas</span>}
              {overImportLimit && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-red-700"><AlertCircle className="h-4 w-4" /> Limite de {importLimit} acessos por importacao</span>}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-3 py-2 text-sm font-medium text-gray-700">Revise e ajuste antes de importar</div>
              <div className="max-h-[420px] overflow-auto">
                <table className="min-w-[1180px] w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-2 py-2 w-14">Linha</th>
                      <th className="px-2 py-2 w-44">Titulo *</th>
                      <th className="px-2 py-2 w-44">Login</th>
                      <th className="px-2 py-2 w-40">Senha *</th>
                      <th className="px-2 py-2 w-48">Link</th>
                      <th className="px-2 py-2 w-56">Notas</th>
                      <th className="px-2 py-2 w-44">Tags</th>
                      <th className="px-2 py-2 w-44">Grupos</th>
                      <th className="px-2 py-2 w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row) => (
                      <tr key={row.rowNumber} className={row.valid ? 'bg-white' : 'bg-yellow-50/60'}>
                        <td className="px-2 py-2 text-gray-500">{row.rowNumber}</td>
                        <td className="px-2 py-2"><input value={row.title} onChange={(e) => updateRow(row.rowNumber, { title: e.target.value })} className="w-full rounded border border-gray-200 px-2 py-1" /></td>
                        <td className="px-2 py-2"><input value={row.login} onChange={(e) => updateRow(row.rowNumber, { login: e.target.value })} className="w-full rounded border border-gray-200 px-2 py-1" /></td>
                        <td className="px-2 py-2"><input value={row.secretValue} onChange={(e) => updateRow(row.rowNumber, { secretValue: e.target.value })} className="w-full rounded border border-gray-200 px-2 py-1" /></td>
                        <td className="px-2 py-2"><input value={row.link} onChange={(e) => updateRow(row.rowNumber, { link: e.target.value })} onBlur={(e) => updateRow(row.rowNumber, { link: normalizeUrl(e.target.value) })} placeholder="https://..." className="w-full rounded border border-gray-200 px-2 py-1" /></td>
                        <td className="px-2 py-2"><input value={row.notes} onChange={(e) => updateRow(row.rowNumber, { notes: e.target.value })} className="w-full rounded border border-gray-200 px-2 py-1" /></td>
                        <td className="px-2 py-2"><input value={joinList(row.tags)} onChange={(e) => updateRow(row.rowNumber, { tags: splitList(e.target.value) })} className="w-full rounded border border-gray-200 px-2 py-1" /></td>
                        <td className="px-2 py-2">
                          <input
                            value={joinList(row.groupNames)}
                            onChange={(e) => updateRow(row.rowNumber, { groupNames: splitList(e.target.value) })}
                            list="import-groups-list"
                            placeholder="Marketing, Gestao"
                            className="w-full rounded border border-gray-200 px-2 py-1"
                          />
                        </td>
                        <td className="px-2 py-2">{row.valid ? 'Pronta' : 'Faltam dados'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <datalist id="import-groups-list">
                {availableGroups.map((group) => <option key={group.id} value={group.name} />)}
              </datalist>
            </div>
          </>}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Usuarios com acesso em todas as senhas</Label>
              <div className="max-h-40 overflow-auto rounded-md border border-gray-200 p-2">
                {availableUsers.length === 0 ? <p className="px-2 py-3 text-sm text-gray-500">Nenhum usuario disponivel.</p> : availableUsers.map((target) => <label key={target.id} className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-gray-50"><input type="checkbox" checked={selectedUsers.includes(target.id)} onChange={() => toggleSelection(target.id, setSelectedUsers)} /><span>{target.full_name || target.email}</span></label>)}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Grupos com acesso em todas as senhas</Label>
                {rows.length > 0 && <Button type="button" variant="outline" size="sm" onClick={applySelectedGroupsToRows}><Wand2 className="mr-2 h-4 w-4" /> Aplicar nas linhas</Button>}
              </div>
              <div className="max-h-40 overflow-auto rounded-md border border-gray-200 p-2">
                {availableGroups.length === 0 ? <p className="px-2 py-3 text-sm text-gray-500">Nenhum grupo disponivel.</p> : availableGroups.map((group) => <label key={group.id} className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-gray-50"><input type="checkbox" checked={selectedGroups.includes(group.id)} onChange={() => toggleSelection(group.id, setSelectedGroups)} /><span>{group.name}</span></label>)}
              </div>
              <p className="text-xs text-gray-500">Voce tambem pode digitar grupos diferentes diretamente em cada linha da tabela.</p>
            </div>
          </div>

          <div className="space-y-2"><Label>Nivel de permissao para os acessos selecionados</Label><Select value={permissionLevel} onValueChange={setPermissionLevel}><SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="view">Visualizar</SelectItem><SelectItem value="edit">Editar</SelectItem><SelectItem value="manage_access">Gerenciar acessos</SelectItem></SelectContent></Select></div>
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={handleClose} disabled={loading}>Cancelar</Button><Button onClick={handleImport} disabled={loading || validRows.length === 0 || overImportLimit} className="bg-blue-600 text-white hover:bg-blue-700">{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importando...</> : <><Upload className="mr-2 h-4 w-4" /> Importar acessos</>}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportSecretsModal;
