const actionLabels = {
  login: 'Login',
  logout: 'Logout',
  create_secret: 'Senha criada',
  update_secret: 'Senha atualizada',
  delete_secret: 'Senha excluida',
  view_secret: 'Senha visualizada',
  reveal_secret: 'Senha revelada',
  copy_secret: 'Senha copiada',
  grant_permission: 'Acesso concedido',
  revoke_permission: 'Acesso removido',
  request_access: 'Acesso solicitado',
  approve_request: 'Pedido aprovado',
  deny_request: 'Pedido recusado',
  create_group: 'Grupo criado',
  delete_group: 'Grupo excluido',
  add_group_member: 'Membro adicionado',
  remove_group_member: 'Membro removido',
  update_member_role: 'Permissao do grupo alterada',
  toggle_admin: 'Administrador alterado',
  toggle_active: 'Status do usuario alterado',
  update_profile: 'Perfil atualizado',
  import_secrets: 'Senhas importadas',
};

const resourceLabels = {
  auth: 'Autenticacao',
  secret: 'Senha',
  group: 'Grupo',
  profile: 'Perfil',
  user: 'Usuario',
  access_request: 'Pedido de acesso',
  import: 'Importacao',
};

const permissionLabels = {
  view: 'Visualizar',
  edit: 'Editar',
  manage_access: 'Gerenciar acessos',
  owner: 'Proprietario',
};

export const formatActionLabel = (value) => actionLabels[value] || value || '-';
export const formatResourceLabel = (value) => resourceLabels[value] || value || '-';
export const formatPermissionLabel = (value) => permissionLabels[value] || value || '-';
