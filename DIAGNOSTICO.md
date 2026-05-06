# Diagnóstico Completo - Loop Google Authentication

Este documento detalha a análise dos arquivos de autenticação para identificar a causa do loop de redirecionamento no login com Google.

## A) Arquivos de Controle de Sessão e Redirect

### 1. `src/hooks/useAuth.js`
**Estado Atual:**
- Gerencia estado `user`, `session`, `loading`.
- Escuta mudanças com `onAuthStateChange`.
- **Problema Potencial:** Não gerencia explicitamente o estado de "carregamento do perfil". O `loading` atual refere-se apenas à sessão do Supabase, não aos dados da tabela `profiles`. Se o componente que consome o hook tentar acessar `profile` antes dele existir, pode falhar.
- **Redirects:** Não realiza redirects diretamente, mas fornece métodos `signInWithGoogle` e `signOut`.

### 2. `src/components/ProtectedRoute.jsx`
**Estado Atual:**
- Verifica `loading` e `user`.
- Se `!loading` e `!user`, redireciona para `/login`.
- **Problema Potencial:** Se `loading` for setado como `false` antes do `user` ser totalmente processado ou antes do profile ser carregado (em uma lógica mais complexa), o usuário é redirecionado prematuramente.

### 3. `src/pages/AuthCallback.jsx`
**Estado Atual:**
- Componente simples que chama `navigate('/dashboard')` dentro de um `useEffect`.
- **Problema Crítico:** Redireciona cegamente. Se o `useAuth` ainda não tiver detectado a sessão (race condition), o `ProtectedRoute` na rota `/dashboard` vai ver `user=null` e mandar de volta para `/login`.

### 4. `src/App.jsx`
**Estado Atual:**
- Configura rotas.
- Rota raiz redireciona para `/dashboard`.
- `/dashboard` é protegida.

### 5. `src/pages/LoginPage.jsx`
**Estado Atual:**
- Verifica `user` e valida domínio.
- Tenta fazer `upsertProfile`.
- Se falhar validação, chama `signOut()`.

## B) Procurar por signOut() e Validações

**signOut() encontrados:**
1. `src/hooks/useAuth.js`: Método exposto `signOut`.
2. `src/pages/LoginPage.jsx`: Chama `signOut()` se `validateDomain` falhar.

**Validações de Domínio:**
- `src/pages/LoginPage.jsx`: Valida `user.email` contra `VITE_ALLOWED_DOMAIN` após o login.
- **Condição de Falha:** Se o domínio não bater, ocorre logout forçado.

## C) Dependências de Profiles

- **Carregamento:** Atualmente feito de forma "ad-hoc" no `LoginPage.jsx` via `upsertProfile`.
- **Problema:** O `useAuth` não garante que o profile existe. Outras páginas podem tentar buscar dados do usuário e falhar se o profile não tiver sido criado ainda.

## D) Race Conditions entre Loading e Redirect

**Cenário de Falha (Loop):**
1. Usuário faz login no Google.
2. Google redireciona para `/auth/callback`.
3. `AuthCallback.jsx` monta e executa `navigate('/dashboard')` **IMEDIATAMENTE**.
4. Ao mesmo tempo, `useAuth` (no App shell) recebe o evento `onAuthStateChange`. Pode haver um delay de milissegundos.
5. O navegador chega em `/dashboard`. O `ProtectedRoute` verifica `useAuth`.
6. Se `useAuth` ainda estiver processando o token ou `loading` for `true` mas `user` ainda `null` (ou transição de estado), ou se `loading` for `false` (default inicial errado) e `user` `null`.
7. `ProtectedRoute` redireciona para `/login`.
8. Usuário cai no Login, mas a sessão pode ter sido estabelecida nesse meio tempo. Se ele tentar entrar de novo, o ciclo pode se repetir ou ficar confuso.

## E) Fluxo Esperado vs Atual

**Fluxo Esperado:**
Google Auth -> Callback (Aguardar Sessão) -> Carregar User -> Carregar/Criar Profile -> Validar -> Redirect Dashboard.

**Fluxo Atual (Quebrado):**
Google Auth -> Callback (Redirect Imediato) -> Dashboard (User Null?) -> Login.

---
**Conclusão:** O problema principal é a `AuthCallback.jsx` redirecionar antes de garantir que a sessão foi estabelecida e validada pelo `useAuth`.