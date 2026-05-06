# Diagnóstico e Correção: Erro "Signal is Aborted"

## 1. O Problema
O erro `AbortError: signal is aborted without reason` estava ocorrendo durante o carregamento do perfil do usuário (`profile`). Isso acontecia porque o controlador de aborto (AbortController) estava sendo acionado prematuramente ou de forma agressiva durante o ciclo de vida dos componentes React (possivelmente devido ao Strict Mode ou navegações rápidas), cancelando a requisição fetch ao Supabase antes que ela pudesse ser concluída.

## 2. Causa Raiz
- **Gerenciamento de Estado Agressivo:** A lógica anterior de `useAuth` ou `useAdmin` provavelmente tentava cancelar requisições pendentes na desmontagem do componente (`cleanup` do `useEffect`) sem considerar que o React 18 monta/desmonta componentes rapidamente em desenvolvimento.
- **Tratamento de Erro Unificado:** Erros de aborto eram tratados como erros críticos de autenticação, impedindo o retry.

## 3. Solução Implementada
- **Remoção de AbortController:** Removemos a passagem de `AbortSignal` para a query do Supabase na função `fetchProfile`. Isso garante que a requisição complete mesmo se o componente desmontar (o resultado é apenas ignorado se desmontado).
- **Separação de Erros:** Criamos um estado `profileLoadError` separado de `error` (auth crítica).
- **Retry Gracioso:** Se ocorrer um erro de fetch (abort ou rede), o sistema agora tenta uma vez (retry) antes de falhar.
- **Hook useAdmin Simplificado:** O `useAdmin` agora é um wrapper puro do `useAuth`, eliminando lógica duplicada de fetch que podia causar race conditions.

## 4. Fluxo Corrigido
1. `useAuth` inicia.
2. `fetchProfile` chamado.
3. Se falhar por abort/rede -> Retry automático (1x).
4. Se falhar novamente -> Define `profileLoadError`.
5. `ProtectedAdminRoute` detecta `profileLoadError` -> Mostra tela de erro com botão "Tentar Novamente".
6. Se sucesso -> Define `profile` e `isAdmin`.

## 5. Arquivos Modificados
- `src/hooks/useAuth.js`: Lógica de fetch robusta, retry, separação de erros.
- `src/hooks/useAdmin.js`: Simplificação para usar `useAuth`.
- `src/components/ProtectedAdminRoute.jsx`: Tratamento visual dos novos estados de erro.
- `src/pages/AuthCallback.jsx`: Adição de ferramentas de debug visual.
- `src/layouts/AppShell.jsx`: Adição de ferramenta de debug visual persistente.

## 6. Checklist de Testes
- [ ] Login com Google (fluxo normal).
- [ ] Login e recarregar a página rapidamente (teste de abort).
- [ ] Simular erro de rede (offline) -> Deve mostrar tela de erro com retry.
- [ ] Usuário Admin acessando rota protegida -> Acesso permitido.
- [ ] Usuário Comum acessando rota protegida -> Tela de Acesso Negado (AccessDenied).
- [ ] Verificar caixa de debug no canto inferior (apenas em desenvolvimento).