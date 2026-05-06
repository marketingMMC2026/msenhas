# Guia Rápido Para Subir e Testar Pela Interface

## 1. Configurar ambiente

Confirme que o arquivo `.env.local` possui:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_ALLOWED_DOMAIN=seudominio.com
VITE_SECRET_ENCRYPTION_KEY=uma-chave-longa-randomica-com-32-ou-mais-caracteres
```

Use a mesma `VITE_SECRET_ENCRYPTION_KEY` em desenvolvimento e produção para conseguir abrir segredos criptografados.

## 2. Aplicar banco de dados

No Supabase, aplique as migrations em `supabase/migrations`, incluindo:

- `20240207000000_stage_3_schema.sql`
- `20240207000001_create_user_with_password.sql`
- `20240506000000_access_request_cancelled.sql`

## 3. Rodar localmente

```bash
npm install
npm run dev
```

Abra:

```text
http://localhost:3000
```

## 4. Roteiro de teste pela interface

1. Entre com Google ou email/senha.
2. Vá em `Cofre` e crie um novo segredo.
3. Abra o segredo, revele a senha e confirme que ela esconde de novo em 10 segundos.
4. Edite o segredo e salve para confirmar que a criptografia continua funcionando.
5. Crie um grupo em `Grupos`.
6. Adicione um usuário ao grupo.
7. Compartilhe um segredo com esse grupo.
8. Entre com outro usuário e confirme que ele enxerga somente o que recebeu.
9. Solicite acesso em `Pedidos de Acesso` usando o ID de um segredo.
10. Entre como admin, aprove ou negue o pedido.
11. Confira `Logs` para validar que as ações foram registradas.
12. Confira o `Dashboard` para validar contadores reais.

## 5. Build de produção

```bash
npm run build
npm run preview
```

Depois abra:

```text
http://localhost:3000
```
