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
  const safeRole = escapeHtml(roleLabel || 'Viewer');
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
                  <h1 style="font-size:24px;line-height:32px;margin:24px 0 8px;color:#111827;">You have been invited to M Password</h1>
                  <p style="font-size:15px;line-height:24px;margin:0;color:#4b5563;">
                    ${safeName ? `Hi, ${safeName}.` : 'Hi.'} An administrator created your access to the team password vault.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 32px;">
                  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
                    <p style="font-size:14px;line-height:22px;margin:0;color:#374151;"><strong>Role:</strong> ${safeRole}</p>
                    <p style="font-size:14px;line-height:22px;margin:8px 0 0;color:#374151;"><strong>Groups:</strong> ${safeGroups.length ? safeGroups.join(', ') : 'No initial groups'}</p>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 32px 28px;">
                  <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;border-radius:8px;padding:12px 18px;">Sign in with Google</a>
                  <p style="font-size:13px;line-height:20px;margin:18px 0 0;color:#6b7280;">
                    Use your Google account to sign in. After login, the access configured by the administrator will be applied automatically.
                  </p>
                  <p style="font-size:12px;line-height:18px;margin:18px 0 0;color:#9ca3af;">
                    If you were not expecting this invitation, you can ignore this email.
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
    return json({ error: 'Method not allowed.' }, 405);
  }

  if (!process.env.RESEND_API_KEY) {
    return json({ error: 'RESEND_API_KEY is not configured in Vercel.' }, 500);
  }

  try {
    const body = await request.json();
    const email = String(body.email || '').trim().toLowerCase();
    const inviteUrl = String(body.inviteUrl || '').trim();
    const fullName = String(body.fullName || '').trim();
    const roleLabel = String(body.roleLabel || 'Viewer').trim();
    const groupNames = Array.isArray(body.groupNames) ? body.groupNames : [];

    if (!email || !email.includes('@')) {
      return json({ error: 'Invalid email address.' }, 400);
    }

    if (!inviteUrl || !inviteUrl.startsWith('https://')) {
      return json({ error: 'Invalid invitation link.' }, 400);
    }

    const from = process.env.INVITE_EMAIL_FROM || 'M Password <invites@mpassword.app>';
    const replyTo = process.env.INVITE_EMAIL_REPLY_TO || undefined;

    const { data, error } = await resend.emails.send({
      from,
      to: email,
      reply_to: replyTo,
      subject: 'You have been invited to M Password',
      html: buildHtml({ inviteUrl, fullName, roleLabel, groupNames }),
    });

    if (error) {
      return json({ error: error.message || 'Failed to send email.' }, 400);
    }

    return json({ id: data?.id });
  } catch (error) {
    return json({ error: error.message || 'Failed to send invitation.' }, 500);
  }
}
