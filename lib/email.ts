/**
 * Lightweight Resend wrapper for transactional notifications.
 *
 * Uses Resend's REST API directly (no SDK dependency). Returns silently if
 * RESEND_API_KEY is not configured so local dev / non-cloud environments
 * stay fully functional without an email provider.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM_ADDRESS = process.env.DRIFTGRID_EMAIL_FROM || 'DriftGrid <notifications@driftgrid.ai>';

export interface CommentEmailArgs {
  to: string;
  authorName: string;
  body: string;
  /** True when this is a reply rather than a top-level comment. */
  isReply: boolean;
  /** The full share URL, e.g. https://driftgrid.ai/s/recovryai/abc123 */
  shareUrl: string;
  client: string;
  project: string;
}

export async function sendCommentEmail(args: CommentEmailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // not configured — silent no-op

  const { to, authorName, body, isReply, shareUrl, client, project } = args;
  const safeAuthor = escapeHtml(authorName);
  const safeBody = escapeHtml(body);
  const safeProject = escapeHtml(project);
  const safeClient = escapeHtml(client);

  const subject = isReply
    ? `New reply on ${project} — ${authorName}`
    : `New comment on ${project} — ${authorName}`;

  const html = `<!doctype html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #111; max-width: 540px; margin: 0 auto; padding: 32px 24px; background: #fafafa;">
  <div style="background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 8px; padding: 24px;">
    <div style="font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #999; margin-bottom: 8px;">
      ${isReply ? 'Reply' : 'New comment'} · ${safeClient} / ${safeProject}
    </div>
    <div style="font-size: 14px; font-weight: 600; margin-bottom: 16px;">
      ${safeAuthor} ${isReply ? 'replied' : 'left a comment'}
    </div>
    <div style="background: #f5f5f4; border-left: 3px solid #ddd; padding: 12px 14px; border-radius: 4px; font-size: 14px; line-height: 1.5; color: #333; white-space: pre-wrap; word-break: break-word;">
${safeBody}
    </div>
    <div style="margin-top: 20px;">
      <a href="${shareUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 5px; font-size: 13px; font-weight: 500;">
        View in DriftGrid
      </a>
    </div>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.06); font-size: 11px; color: #999;">
      You're receiving this because someone commented on your shared project at <a href="${shareUrl}" style="color: #999;">${shareUrl}</a>.
    </div>
  </div>
</body>
</html>`;

  const text = [
    `${authorName} ${isReply ? 'replied' : 'left a comment'} on ${client} / ${project}:`,
    '',
    body,
    '',
    `View: ${shareUrl}`,
  ].join('\n');

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to,
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[email] Resend error', res.status, detail);
    }
  } catch (e) {
    console.error('[email] Resend send failed', e);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
