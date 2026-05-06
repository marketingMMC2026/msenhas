-- Rode este script no Supabase SQL Editor quando quiser limpar a base inicial.
-- Ele remove registros de teste operacionais, limpa logs e cria grupos base para uma agencia de marketing.
-- Revise antes de executar em uma base com dados reais.

BEGIN;

WITH seed_owner AS (
  SELECT id
  FROM public.profiles
  ORDER BY is_admin DESC, created_at ASC
  LIMIT 1
),
removed_secrets AS (
  UPDATE public.secrets
  SET deleted_at = COALESCE(deleted_at, NOW())
  WHERE deleted_at IS NULL
    AND (
      title ILIKE '%teste%'
      OR title ILIKE '%test%'
      OR login ILIKE '%teste%'
      OR notes ILIKE '%teste%'
    )
  RETURNING id
)
DELETE FROM public.secret_permissions
WHERE secret_id IN (SELECT id FROM removed_secrets);

DELETE FROM public.access_requests
WHERE secret_id IN (
  SELECT id
  FROM public.secrets
  WHERE deleted_at IS NOT NULL
    AND (
      title ILIKE '%teste%'
      OR title ILIKE '%test%'
      OR login ILIKE '%teste%'
      OR notes ILIKE '%teste%'
    )
);

DELETE FROM public.audit_logs;

WITH seed_owner AS (
  SELECT id
  FROM public.profiles
  ORDER BY is_admin DESC, created_at ASC
  LIMIT 1
),
seed_groups(name, description) AS (
  VALUES
    ('Atendimento e Contas', 'Acessos usados pela equipe de atendimento e gestao de clientes.'),
    ('Social Media', 'Ferramentas de publicacao, calendarios, criativos e redes sociais.'),
    ('Trafego Pago', 'Contas de anuncios, pixels, gerenciadores e plataformas de midia.'),
    ('Criacao e Design', 'Ferramentas de design, bancos de imagem, edicao e producao visual.'),
    ('Financeiro', 'Acessos administrativos, cobranca, notas e fornecedores.'),
    ('Gestao', 'Acessos estrategicos e administrativos da agencia.')
)
INSERT INTO public.groups (name, description, created_by)
SELECT seed_groups.name, seed_groups.description, seed_owner.id
FROM seed_groups
CROSS JOIN seed_owner
WHERE seed_owner.id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
