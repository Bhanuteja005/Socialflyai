import nodemailer from "nodemailer";
import type { Logger } from "./logger";

export type Mailer = {
	send(message: { to: string; subject: string; html: string; text: string }): Promise<void>;
};

/**
 * SMTP mailer. Locally SMTP_URL points at Mailpit (inbox: http://localhost:8025);
 * in production at the transactional provider's SMTP relay.
 *
 * Sending never throws into the request: a mail outage must not break signup or
 * password reset. Failures are logged without the recipient (PII).
 */
export function createMailer({
	smtpUrl,
	from,
	logger,
}: {
	smtpUrl: string;
	from: string;
	logger: Logger;
}): Mailer {
	const transport = nodemailer.createTransport(smtpUrl);
	return {
		async send(message) {
			try {
				await transport.sendMail({ from, ...message });
			} catch (error) {
				logger.error({ err: error, subject: message.subject }, "email send failed");
			}
		},
	};
}

/** User-supplied strings (names) must never be able to inject markup into an email. */
const escapeHtml = (s: string) =>
	s.replace(
		/[&<>"']/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
	);

const layout = (title: string, body: string) => `<!doctype html>
<html><body style="margin:0;background:#f6f7f9;font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table width="100%" style="max-width:520px;background:#fff;border-radius:12px;padding:32px">
<tr><td style="font-size:20px;font-weight:700;padding-bottom:16px">SocialFly</td></tr>
<tr><td style="font-size:16px;font-weight:600;padding-bottom:12px">${title}</td></tr>
<tr><td style="font-size:14px;line-height:22px;color:#374151">${body}</td></tr>
</table></td></tr></table></body></html>`;

const button = (href: string, label: string) =>
	`<p style="margin:24px 0"><a href="${href}" style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${label}</a></p>`;

export const emails = {
	verify: (url: string) => ({
		subject: "Confirm your email",
		html: layout(
			"Confirm your email",
			`Welcome to SocialFly! Confirm your email to finish setting up your account.${button(url, "Confirm email")}This link expires in 24 hours.`,
		),
		text: `Welcome to SocialFly! Confirm your email: ${url}\nThis link expires in 24 hours.`,
	}),
	invitation: (url: string, organizationName: string, inviterName: string) => ({
		subject: `${inviterName} invited you to ${organizationName} on SocialFly`,
		html: layout(
			`Join ${escapeHtml(organizationName)}`,
			`${escapeHtml(inviterName)} invited you to collaborate on <b>${escapeHtml(organizationName)}</b> in SocialFly.${button(url, "Accept invitation")}This invitation expires in 7 days.`,
		),
		text: `${inviterName} invited you to ${organizationName} on SocialFly: ${url}\nThis invitation expires in 7 days.`,
	}),
	resetPassword: (url: string) => ({
		subject: "Reset your password",
		html: layout(
			"Reset your password",
			`Someone asked to reset the password for this account. If it was you:${button(url, "Choose a new password")}This link expires in 1 hour. If it wasn't you, ignore this email — your password is unchanged.`,
		),
		text: `Reset your SocialFly password: ${url}\nThis link expires in 1 hour. If you didn't ask for this, ignore this email.`,
	}),
};
