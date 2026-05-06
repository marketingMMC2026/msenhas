# Plano de Correção e Evolução da Autenticação

## 1. Resumo do Problema
Usuários enfrentavam um "loop infinito" ou redirecionamento incorreto ao tentar logar com Google. O sistema autenticava no Supabase, mas o frontend redirecionava o usuário de volta para o login antes de confirmar a sessão, devido a condições de corrida (race conditions) entre o carregamento do perfil e o roteamento.

## 2. Causa Raiz
- **Race Condition:** `AuthCallback.jsx` redirecionava para `/dashboard` cegamente.
- **Hook Incompleto:** `useAuth.js` marcava `loading=false` antes de ter certeza que o `profile` do usuário estava carregado.
- **Proteção Frágil:** `ProtectedRoute.jsx` expulsava o usuário se o profile demorasse milissegundos a mais que a sessão.

## 3. Solução Implementada

### Passo 1: UseAuth Robusto
Separamos o estado de carregamento em `loadingAuth` (sessão técnica) e `loadingProfile` (dados de negócio). O sistema agora só considera `loading=false` quando AMBOS estão resolvidos.

### Passo 2: AuthCallback Passivo
A página de callback não força mais o redirect. Ela mostra um spinner e aguarda o `useAuth` sinalizar `isAuthenticated=true`. O próprio hook (ou um useEffect que observa o hook) decide quando é seguro navegar.

### Passo 3: Login Híbrido
Adicionamos suporte a Login por Email/Senha para contingência e usuários sem Google Workspace, mantendo a segurança via RLS e validações de domínio.

## 4. Diagrama de Fluxo (Novo)