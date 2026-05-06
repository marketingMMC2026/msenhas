import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const json = (response, status = 200) => new Response(JSON.stringify(response), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const buildHtml = ({ inviteUrl, fullName, roleLabel, groupNames }) => {
  const safeName = escapeHtml(fullName || '');
  const safeRole = escapeHtml(roleLabel || 'Visualizador');
  const safeGroups = (groupNames || []).map(escapeHtml);

  return `
    <div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fb;padding:32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="padding:28px 32px 8px;">
                  <div style="font-size:22px;font-weight:700;color:#2563eb;">M Password</div>
                  <h1 style="font-size:24px;line-height:32px;margin:24px 0 8px;color:#111827;">Voce foi convidado para acessar o M Password</h1>
                  <p style="font-size:15px;line-height:24px;margin:0;color:#4b5563;">
                    ${safeName ? `Ola, ${safeName}.` : 'Ola.'} Um administrador criou seu acesso ao cofre de senhas da equipe.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 32px;">
                  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
                    <p style="font-size:14px;line-height:22px;margin:0;color:#374151;"><strong>Perfil:</strong> ${safeRole}</p>
                    <p style="font-size:14px;line-height:22px;margin:8px 0 0;color:#374151;"><strong>Grupos:</strong> ${safeGroups.length ? safeGroups.join(', ') : 'Nenhum grupo inicial'}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 32px 28px;">
                  <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;border-radius:8px;padding:12px 18px;">Entrar com Google</a>
                  <p style="font-size:13px;line-height:20px;margin:18px 0 0;color:#6b7280;">
                    Use sua conta Google para entrar. Depois do login, os acessos definidos pelo administrador serao aplicados automaticamente.
                  </p>
                  <p style="font-size:12px;line-height:18px;margin:18px 0 0;color:#9ca3af;">
                    Se voce nao esperava este convite, ignore este e-mail.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
};

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Metodo nao permitido.' }, 405);
  }

  if (!process.env.RESEND_API_KEY) {
    return json({ error: 'RESEND_API_KEY nao configurada na Vercel.' }, 500);
  }

  try {
    const body = await request.json();
    const email = String(body.email || '').trim().toLowerCase();
    const inviteUrl = String(body.inviteUrl || '').trim();
    const fullName = String(body.fullName || '').trim();
    const roleLabel = String(body.roleLabel || 'Visualizador').trim();
    const groupNames = Array.isArray(body.groupNames) ? body.groupNames : [];

    if (!email || !email.includes('@')) {
      return json({ error: 'E-mail invalido.' }, 400);
    }

    if (!inviteUrl || !inviteUrl.startsWith('https://')) {
      return json({ error: 'Link de convite invalido.' }, 400);
    }

    const from = process.env.INVITE_EMAIL_FROM || 'M Password <convites@mpassword.app>';
    const replyTo = process.env.INVITE_EMAIL_REPLY_TO || undefined;

    const { data, error } = await resend.emails.send({
      from,
      to: email,
      reply_to: replyTo,
      subject: 'Convite para acessar o M Password',
      html: buildHtml({ inviteUrl, fullName, roleLabel, groupNames }),
    });

    if (error) {
      return json({ error: error.message || 'Erro ao enviar e-mail.' }, 400);
    }

    return json({ id: data?.id });
  } catch (error) {
    return json({ error: error.message || 'Erro ao enviar convite.' }, 500);
  }
}
