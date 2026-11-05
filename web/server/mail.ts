import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import type { MailSettings, Outreach, Profile, Startup } from "./types.js";

/**
 * Outreach without any AI: a tight template filled from the resume and the
 * funding news. Sent through the user's own mailbox; replies are detected by
 * polling that same mailbox over IMAP.
 */

export function composeOutreach(profile: Profile, s: Startup, settings: MailSettings | null): { subject: string; body: string } {
  const role = profile.titles[0] ?? "engineer";
  const topSkills = profile.skills.slice(0, 5).map((x) => x.label);
  const overlap = s.match.matched.slice(0, 3).map((x) => x.label);
  const fundingBit = [s.round, s.amount ? `(${s.amount})` : null].filter(Boolean).join(" ") || "funding";
  const investorBit = s.investors ? ` led by ${s.investors}` : "";
  const GENERIC = /^(senior|junior|lead|staff|principal|engineer|developer|manager|software|head|chief)$/;
  const words = (t: string) => t.toLowerCase().split(/[\s/-]+/).filter((w) => w.length > 2 && !GENERIC.test(w));
  // "exactly what I do" only when a specific word (frontend, data, ml…) is shared, not just "engineer".
  const roleHit = s.roles.find((r) => profile.titles.some((t) => words(t).some((w) => words(r).includes(w))));
  const anyRole = s.roles[0];
  const years = profile.yearsExperience ? `${profile.yearsExperience}+ years` : "several years";
  const an = (x: string) => (/^[aeiou]/i.test(x) ? `an ${x}` : `a ${x}`);
  const me = `${profile.name}, ${an(profile.headline.split(" · ")[0])} with ${years} of experience, working mainly with ${topSkills.join(", ")}`;

  const subject = roleHit ? `${roleHit} at ${s.name}` : `${role} for ${s.name} after your ${s.round ?? "funding round"}`;

  const lines = [
    `Hi ${s.name} team,`,
    ``,
    `Congratulations on the ${fundingBit}${investorBit}. I read about it on ${s.newsSource} and it sounds like you will be growing the team.`,
    ``,
    roleHit
      ? `I saw you are hiring ${an(roleHit)}, which is exactly what I do. I am ${me}.`
      : anyRole
        ? `I saw you are hiring ${an(anyRole)}. I am ${me}, and if you are also adding ${role.toLowerCase()}s as you scale, I would like to be considered.`
        : `I am ${me}. If you are adding ${role.toLowerCase()}s this quarter, I would like to be considered.`,
    overlap.length ? `From your site it looks like ${overlap.join(", ")} matter to you, and those are the tools I use every day.` : null,
    ``,
    `Would you be open to a 20-minute call? My resume is attached, and I am happy to share work samples.`,
    ``,
    settings?.signature?.trim() || `Best regards,\n${profile.name}${profile.email ? `\n${profile.email}` : ""}`,
  ].filter((l) => l !== null);
  return { subject, body: lines.join("\n") };
}

export function newOutreach(s: Startup, to: string, draft: { subject: string; body: string }): Outreach {
  const now = new Date().toISOString();
  return {
    id: `om_${randomUUID().slice(0, 12)}`,
    startupId: s.id,
    startupName: s.name,
    to,
    subject: draft.subject,
    body: draft.body,
    status: "draft",
    messageId: null,
    sentAt: null,
    repliedAt: null,
    replyFrom: null,
    replySnippet: null,
    error: null,
    attachResume: true,
    createdAt: now,
    updatedAt: now,
  };
}

function transport(m: MailSettings) {
  return nodemailer.createTransport({ host: m.smtpHost, port: m.smtpPort, secure: m.secure, auth: { user: m.user, pass: m.pass } });
}

export async function verifyMail(m: MailSettings): Promise<{ smtp: string; imap: string }> {
  const out = { smtp: "ok", imap: "ok" };
  try {
    await transport(m).verify();
  } catch (e) {
    out.smtp = (e as Error).message;
  }
  try {
    const c = imap(m);
    await c.connect();
    await c.logout();
  } catch (e) {
    out.imap = (e as Error).message;
  }
  return out;
}

export async function sendOutreach(m: MailSettings, o: Outreach, profile: Profile | null): Promise<Outreach> {
  const domain = m.fromEmail.split("@")[1] ?? "jobly.local";
  const messageId = `<${createHash("sha1").update(o.id + Date.now()).digest("hex").slice(0, 24)}@${domain}>`;
  const attachments = o.attachResume && profile?.storedFile && existsSync(profile.storedFile) ? [{ filename: profile.fileName, path: profile.storedFile }] : [];
  try {
    await transport(m).sendMail({
      from: `"${m.fromName || profile?.name || "Jobly"}" <${m.fromEmail}>`,
      to: o.to,
      subject: o.subject,
      text: o.body,
      messageId,
      attachments,
    });
    o.status = "sent";
    o.messageId = messageId;
    o.sentAt = new Date().toISOString();
    o.error = null;
  } catch (e) {
    o.status = "failed";
    o.error = (e as Error).message;
  }
  o.updatedAt = new Date().toISOString();
  return o;
}

function imap(m: MailSettings) {
  return new ImapFlow({ host: m.imapHost, port: m.imapPort, secure: true, auth: { user: m.user, pass: m.pass }, logger: false });
}

const addr = (s: string) => s.toLowerCase().match(/[\w.+-]+@[\w.-]+/)?.[0] ?? s.toLowerCase();

/**
 * Scan the inbox for replies and bounces to anything we sent.
 * A reply is matched by In-Reply-To / References, or by sender + subject as a fallback.
 */
export async function checkReplies(m: MailSettings, sent: Outreach[]): Promise<{ checked: number; updated: string[] }> {
  const open = sent.filter((o) => o.status === "sent");
  if (!open.length) return { checked: 0, updated: [] };
  const since = new Date(Math.min(...open.map((o) => new Date(o.sentAt!).getTime())) - 60_000);
  const client = imap(m);
  const updated: string[] = [];
  let checked = 0;
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      for await (const msg of client.fetch({ since }, { envelope: true, headers: ["in-reply-to", "references"], bodyParts: ["TEXT"] })) {
        checked++;
        const headers = msg.headers?.toString() ?? "";
        const from = addr(msg.envelope?.from?.[0]?.address ?? "");
        const subject = msg.envelope?.subject ?? "";
        const body = (msg.bodyParts?.get("TEXT")?.toString("utf8") ?? "").replace(/\r/g, "").replace(/\n{2,}/g, "\n").trim();
        const isBounce = /mailer-daemon|postmaster|mail delivery|delivery status/i.test(from + " " + subject);

        for (const o of open) {
          if (o.status !== "sent") continue;
          const byId = !!o.messageId && headers.includes(o.messageId.replace(/[<>]/g, ""));
          const bySender = from && (from === addr(o.to) || from.split("@")[1] === addr(o.to).split("@")[1]) && subject.toLowerCase().includes(o.subject.toLowerCase().slice(0, 25));
          if (isBounce && body.toLowerCase().includes(addr(o.to))) {
            o.status = "bounced";
            o.error = "Address bounced";
            o.updatedAt = new Date().toISOString();
            updated.push(o.id);
          } else if (byId || bySender) {
            o.status = "replied";
            o.repliedAt = new Date(msg.envelope?.date ?? Date.now()).toISOString();
            o.replyFrom = from;
            o.replySnippet = body.split(/\n(?:On .* wrote:|>)/)[0].slice(0, 400);
            o.updatedAt = new Date().toISOString();
            updated.push(o.id);
          }
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return { checked, updated };
}
