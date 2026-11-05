import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Button, Chip, cx, Empty } from "../components/ui";
import { api } from "../lib/api";
import { OUTREACH_STATUSES, type MailSettings, type OutreachStatus } from "../lib/types";
import { useStore } from "../store";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");

export function OutreachView() {
  const outreach = useStore((s) => s.outreach);
  const settings = useStore((s) => s.settings);
  const selected = useStore((s) => s.selectedOutreach);
  const select = useStore((s) => s.selectOutreach);
  const checkReplies = useStore((s) => s.checkReplies);
  const setView = useStore((s) => s.setView);
  const [status, setStatus] = useState<OutreachStatus | "all">("all");
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [showMail, setShowMail] = useState(false);

  const sent = outreach.filter((o) => o.status === "sent" || o.status === "replied" || o.status === "bounced").length;
  const replied = outreach.filter((o) => o.status === "replied").length;
  const visible = outreach.filter((o) => status === "all" || o.status === status).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const mailReady = !!settings?.mail;

  const runCheck = async () => {
    setChecking(true);
    setCheckMsg(null);
    try {
      const r = await checkReplies();
      setCheckMsg(`checked ${r.checked} messages · ${r.updated.length} updated`);
    } catch (e) {
      setCheckMsg((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="drafted" value={outreach.filter((o) => o.status === "draft").length} />
        <Stat label="sent" value={sent} />
        <Stat label="replied" value={replied} />
        <Stat label="reply rate" value={sent ? `${Math.round((replied / sent) * 100)}%` : "—"} />
      </div>

      <div className="glass mt-4 flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <span className={cx("flex items-center gap-2 text-sm", mailReady ? "text-fg" : "text-fg-3")}>
          <span className={cx("h-2 w-2 rounded-full", mailReady ? "bg-fg" : "bg-fg-3")} />
          {mailReady ? `${settings!.mail!.fromEmail} connected` : "No mailbox connected"}
        </span>
        <Button size="sm" onClick={() => setShowMail((v) => !v)}>
          {mailReady ? "mailbox settings" : "connect mailbox"}
        </Button>
        <Button size="sm" disabled={!mailReady || checking} onClick={() => void runCheck()}>
          {checking ? "checking…" : "check replies now"}
        </Button>
        <span className="text-xs text-fg-3">
          {checkMsg ?? (settings?.lastReplyCheck ? `last checked ${fmt(settings.lastReplyCheck)} · auto every 5 min while running` : "replies are checked every 5 minutes while Jobly runs")}
        </span>
      </div>

      <AnimatePresence>{showMail && <MailSettingsForm onClose={() => setShowMail(false)} />}</AnimatePresence>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(["all", ...OUTREACH_STATUSES.map((s) => s.id)] as const).map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
            {s === "all" ? "All" : OUTREACH_STATUSES.find((x) => x.id === s)!.label}
            <span className="ml-1 font-mono text-[10px] text-fg-3">{s === "all" ? outreach.length : outreach.filter((o) => o.status === s).length}</span>
          </Chip>
        ))}
      </div>

      {visible.length === 0 ? (
        <Empty title={outreach.length ? "Nothing with that status" : "No emails yet"} body={outreach.length ? "Pick another filter." : "Open a funded startup and hit Draft cold email. The draft is written from your resume and their funding news; you edit it, then send it from your own mailbox."} action={<Button onClick={() => setView("startups")}>Go to startups</Button>} />
      ) : (
        <ul className="mt-4 space-y-2">
          <AnimatePresence>
            {visible.map((o) => (
              <motion.li key={o.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => select(o.id)} className="glass glass-hover grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl px-4 py-3">
                <StatusDot status={o.status} />
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {o.startupName} <span className="text-fg-3">·</span> <span className="text-fg-2">{o.subject}</span>
                  </p>
                  <p className="truncate text-xs text-fg-3">
                    to {o.to}
                    {o.sentAt && ` · sent ${fmt(o.sentAt)}`}
                    {o.repliedAt && ` · replied ${fmt(o.repliedAt)}`}
                    {o.error && ` · ${o.error}`}
                  </p>
                  {o.replySnippet && <p className="mt-1 line-clamp-2 border-l border-line-2 pl-2 text-xs text-fg-2">{o.replySnippet}</p>}
                </div>
                <span className="font-mono text-xs text-fg-3">{OUTREACH_STATUSES.find((x) => x.id === o.status)?.label}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <AnimatePresence>{selected && <Composer id={selected} onClose={() => select(null)} />}</AnimatePresence>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="font-mono text-2xl">{value}</p>
      <p className="text-xs text-fg-3">{label}</p>
    </div>
  );
}

function StatusDot({ status }: { status: OutreachStatus }) {
  const cls = { draft: "border border-fg-3", sent: "bg-fg-2", replied: "bg-fg shadow-[0_0_8px_white]", bounced: "bg-fg-3", failed: "bg-fg-3" }[status];
  return <span className={cx("h-2.5 w-2.5 rounded-full", cls)} title={status} />;
}

function Composer({ id, onClose }: { id: string; onClose: () => void }) {
  const o = useStore((s) => s.outreach.find((x) => x.id === id));
  const startup = useStore((s) => s.startups.find((x) => x.id === o?.startupId));
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateOutreach);
  const send = useStore((s) => s.sendOutreach);
  const remove = useStore((s) => s.removeOutreach);
  const [to, setTo] = useState(o?.to ?? "");
  const [subject, setSubject] = useState(o?.subject ?? "");
  const [body, setBody] = useState(o?.body ?? "");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!o) return null;
  const editable = o.status === "draft" || o.status === "failed";
  const dirty = to !== o.to || subject !== o.subject || body !== o.body;
  const save = () => dirty && void update(o.id, { to, subject, body });

  const doSend = async () => {
    setSending(true);
    setErr(null);
    try {
      if (dirty) await update(o.id, { to, subject, body });
      await send(o.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-bg/60 backdrop-blur-sm" />
      <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-line bg-bg-2">
        <div className="flex items-center gap-3 border-b border-line p-5">
          <StatusDot status={o.status} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{o.startupName}</h2>
            <p className="text-xs text-fg-3">
              {OUTREACH_STATUSES.find((x) => x.id === o.status)?.label}
              {o.sentAt && ` · sent ${fmt(o.sentAt)}`}
              {o.repliedAt && ` · replied ${fmt(o.repliedAt)}`}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 text-fg-3 hover:text-fg" aria-label="close">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {o.replySnippet && (
            <div className="rounded-xl border border-fg/30 bg-bg p-4">
              <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-fg-3">reply from {o.replyFrom}</p>
              <pre className="whitespace-pre-wrap font-sans text-sm">{o.replySnippet}</pre>
            </div>
          )}
          <Field label="to">
            {startup && startup.emails.length > 1 && editable ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {startup.emails.map((e) => (
                  <Chip key={e.address} active={to === e.address} tone={e.source === "found" ? "neutral" : "amber"} onClick={() => setTo(e.address)}>
                    {e.address}
                    {e.source === "guessed" && "?"}
                  </Chip>
                ))}
              </div>
            ) : null}
            <input value={to} onChange={(e) => setTo(e.target.value)} onBlur={save} disabled={!editable} className="h-10 w-full rounded-xl border border-line-2 bg-bg px-3 text-sm outline-none focus:border-accent disabled:opacity-60" />
          </Field>
          <Field label="subject">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} onBlur={save} disabled={!editable} className="h-10 w-full rounded-xl border border-line-2 bg-bg px-3 text-sm outline-none focus:border-accent disabled:opacity-60" />
          </Field>
          <Field label="message">
            <textarea value={body} onChange={(e) => setBody(e.target.value)} onBlur={save} disabled={!editable} rows={16} className="w-full rounded-xl border border-line-2 bg-bg px-3 py-2 font-sans text-sm leading-relaxed outline-none focus:border-accent disabled:opacity-60" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-fg-2">
            <input type="checkbox" checked={o.attachResume} disabled={!editable} onChange={(e) => void update(o.id, { attachResume: e.target.checked })} className="accent-white" />
            attach my resume
          </label>
          {err && <p className="text-sm text-rose">{err}</p>}
          {o.error && !err && <p className="text-sm text-rose">{o.error}</p>}
        </div>

        <div className="flex items-center gap-2 border-t border-line p-4">
          {editable && (
            <Button variant="primary" disabled={sending || !settings?.mail || !/@/.test(to)} onClick={() => void doSend()} title={!settings?.mail ? "Connect a mailbox first" : undefined}>
              {sending ? "sending…" : o.status === "failed" ? "retry send" : "Send email"}
            </Button>
          )}
          {!settings?.mail && editable && <span className="text-xs text-fg-3">connect your mailbox above to send</span>}
          <Button variant="danger" size="sm" className="ml-auto" onClick={() => void remove(o.id).then(onClose)}>
            delete
          </Button>
        </div>
      </motion.aside>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-fg-3">{label}</p>
      {children}
    </div>
  );
}

const GMAIL: Partial<MailSettings> = { smtpHost: "smtp.gmail.com", smtpPort: 465, secure: true, imapHost: "imap.gmail.com", imapPort: 993 };
const OUTLOOK: Partial<MailSettings> = { smtpHost: "smtp.office365.com", smtpPort: 587, secure: false, imapHost: "outlook.office365.com", imapPort: 993 };

function MailSettingsForm({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const profile = useStore((s) => s.profile);
  const saveMail = useStore((s) => s.saveMail);
  const [m, setM] = useState<MailSettings>(
    settings?.mail ?? { ...(GMAIL as MailSettings), user: profile?.email ?? "", pass: "", fromName: profile?.name ?? "", fromEmail: profile?.email ?? "", signature: "" },
  );
  const [test, setTest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof MailSettings, v: string | number | boolean) => setM((cur) => ({ ...cur, [k]: v }));

  const save = async (andTest: boolean) => {
    setBusy(true);
    setTest(null);
    try {
      await saveMail({ ...m, fromEmail: m.fromEmail || m.user });
      if (andTest) {
        const r = await api.testMail();
        setTest(`SMTP: ${r.smtp} · IMAP: ${r.imap}`);
      } else onClose();
    } catch (e) {
      setTest((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const input = (k: keyof MailSettings, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input value={String(m[k] ?? "")} onChange={(e) => set(k, props.type === "number" ? Number(e.target.value) : e.target.value)} className="h-9 w-full rounded-lg border border-line-2 bg-bg px-3 text-sm outline-none focus:border-accent" {...props} />
  );

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <div className="glass mt-3 rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">Your mailbox</p>
          <span className="text-xs text-fg-3">emails are sent from here and replies are read from here. Stored only on this machine.</span>
          <div className="ml-auto flex gap-1.5">
            <Chip onClick={() => setM((c) => ({ ...c, ...GMAIL }))}>Gmail</Chip>
            <Chip onClick={() => setM((c) => ({ ...c, ...OUTLOOK }))}>Outlook</Chip>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="email / username">{input("user", { autoComplete: "username" })}</Field>
          <Field label="password / app password">{input("pass", { type: "password", autoComplete: "current-password", placeholder: settings?.mail ? "unchanged" : "" })}</Field>
          <Field label="from name">{input("fromName")}</Field>
          <Field label="smtp host">{input("smtpHost")}</Field>
          <Field label="smtp port">{input("smtpPort", { type: "number" })}</Field>
          <label className="flex items-end gap-2 pb-2 text-sm text-fg-2">
            <input type="checkbox" checked={m.secure} onChange={(e) => set("secure", e.target.checked)} className="accent-white" /> SSL (port 465)
          </label>
          <Field label="imap host">{input("imapHost")}</Field>
          <Field label="imap port">{input("imapPort", { type: "number" })}</Field>
          <Field label="from email">{input("fromEmail", { placeholder: m.user })}</Field>
        </div>
        <div className="mt-3">
          <Field label="signature">
            <textarea value={m.signature} onChange={(e) => set("signature", e.target.value)} rows={3} placeholder={`Best regards,\n${profile?.name ?? ""}`} className="w-full rounded-lg border border-line-2 bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          </Field>
        </div>
        <p className="mt-3 text-xs text-fg-3">Gmail: turn on 2-step verification, then create an App password at myaccount.google.com/apppasswords and paste it here. IMAP must be enabled in Gmail settings.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" disabled={busy || !m.user} onClick={() => void save(false)}>
            save
          </Button>
          <Button size="sm" disabled={busy || !m.user} onClick={() => void save(true)}>
            save & test connection
          </Button>
          {settings?.mail && (
            <Button size="sm" variant="danger" onClick={() => void saveMail(null).then(onClose)}>
              disconnect
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            close
          </Button>
          {test && <span className="font-mono text-xs text-fg-2">{test}</span>}
        </div>
      </div>
    </motion.div>
  );
}
