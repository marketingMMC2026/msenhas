# Plano de Testes de Autenticação

Este documento serve como guia para verificar se o sistema de autenticação está funcionando corretamente após as correções.

## A) Testes do Loop Google (Prioridade Crítica)
- [ ] **Login Limpo:** Limpar cookies/storage, clicar "Login com Google". Deve ir ao Google, voltar para o app (loading) e pousar no Dashboard. **Sucesso se não recarregar a página de login.**
- [ ] **Persistência:** Fechar aba e reabrir `localhost:3000`. Deve ir direto para Dashboard sem piscar Login.
- [ ] **Logout:** Clicar em Sair. Tentar acessar `/dashboard` manualmente. Deve redirecionar para Login.

## B) Testes de Login Manual
1. **Acesso Admin:**
   - [ ] Logar como Admin.
   - [ ] Ir para `/users`.
   - [ ] Clicar "Novo Usuário".
   - [ ] Criar usuário `teste@dominio.com` com senha `senha1234` e `is_admin=true`.
   - [ ] Verificar se toast de sucesso aparece.
   
2. **Login com Novo Usuário:**
   - [ ] Fazer Logout.
   - [ ] Na aba "Email/Senha", entrar com `teste@dominio.com` / `senha1234`.
   - [ ] Verificar acesso ao Dashboard.
   - [ ] Verificar se vê menus de Admin (já que foi criado como admin).

3. **Validação de Erros:**
   - [ ] Tentar senha curta (< 8 chars) no login.
   - [ ] Tentar email inexistente.
   - [ ] Tentar senha errada.

## C) Testes de Segurança
- [ ] Tentar acessar `/groups` sem estar logado -> Redirect Login.
- [ ] (Opcional) Logar com usuário não-admin e tentar acessar `/groups` (se houver proteção de rota admin implementada).