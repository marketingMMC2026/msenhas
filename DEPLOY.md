# Publicacao online

Este projeto esta pronto para publicar como um app Vite/React.

## Caminho recomendado

Use GitHub + Vercel.

1. Crie um repositorio no GitHub.
2. Envie este projeto para o repositorio.
3. Na Vercel, importe o repositorio.
4. Configure as variaveis de ambiente abaixo em `Settings > Environment Variables`.
5. Publique.

## Variaveis de ambiente

Configure estas variaveis na plataforma de hospedagem:

| Variavel | Obrigatoria | Observacao |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Sim | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Sim | Chave publica anon do Supabase |
| `VITE_ALLOWED_DOMAIN` | Sim | Dominio permitido para login |
| `VITE_SECRET_ENCRYPTION_KEY` | Recomendado | Chave longa e estavel para criptografar novos segredos |

Nao envie arquivos `.env.local` ou `.env.production` para o GitHub.

## Configuracao da Vercel

- Framework: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

O arquivo `vercel.json` ja inclui a regra para que rotas internas do React funcionem ao recarregar a pagina.

## Configuracao da Netlify

Tambem e possivel usar Netlify. O arquivo `netlify.toml` ja configura:

- Build command: `npm run build`
- Publish directory: `dist`
- Redirecionamento de rotas internas para `index.html`
