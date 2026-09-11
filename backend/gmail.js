import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import crypto from "node:crypto";

const sessions = new Map();

function randomId() {
  return crypto.randomBytes(18).toString("hex");
}

function decodeText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(decodeText).join(" ");
  if (value.text) return value.text;
  return String(value);
}

async function withClient(session, fn) {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    logger: false,
    auth: {
      user: session.email,
      pass: session.password,
    },
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}

export async function connectGmail(email, password) {
  const session = { email, password, alias: `${email.split("@")[0]}@gmail.com` };
  await withClient(session, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    lock.release();
  });
  const id = randomId();
  sessions.set(id, session);
  return { id, email: session.alias };
}

export function setAlias(id, alias) {
  const session = sessions.get(id);
  if (!session) return null;
  session.alias = alias;
  return session;
}

export function getSession(id) {
  return sessions.get(id) || null;
}

export function destroySession(id) {
  sessions.delete(id);
}

function mapMessage(parsed, uid, date) {
  const from = parsed.from?.value?.[0]?.address || parsed.from?.text || "unknown";
  const html = parsed.html ? [String(parsed.html)] : [];
  const text = parsed.text || parsed.textAsHtml || "";
  return {
    id: String(uid),
    from: { address: from },
    subject: decodeText(parsed.subject) || "(no subject)",
    intro: String(text).replace(/\s+/g, " ").slice(0, 140),
    text,
    html,
    createdAt: (date || parsed.date || new Date()).toISOString?.() || new Date().toISOString(),
    seen: true,
    provider: "gmail",
  };
}

export async function listGmail(id) {
  const session = sessions.get(id);
  if (!session) throw new Error("Gmail is not connected");
  return withClient(session, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const alias = session.alias || session.email;
      let uids = [];
      try {
        uids = await client.search({ to: alias }, { uid: true });
      } catch {
        uids = [];
      }
      if (!uids || uids.length === 0) {
        const status = await client.status("INBOX", { messages: true });
        const total = Number(status.messages || 0);
        const start = Math.max(1, total - 19);
        uids = await client.search({ seq: `${start}:*` }, { uid: true });
      }
      const last = (uids || []).slice(-20).reverse();
      const messages = [];
      for (const uid of last) {
        const fetched = await client.fetchOne(String(uid), { source: true, envelope: true, uid: true }, { uid: true });
        if (!fetched?.source) continue;
        const parsed = await simpleParser(fetched.source);
        messages.push(mapMessage(parsed, fetched.uid || uid, fetched.envelope?.date));
      }
      return messages;
    } finally {
      lock.release();
    }
  });
}

export async function readGmail(id, uid) {
  const session = sessions.get(id);
  if (!session) throw new Error("Gmail is not connected");
  return withClient(session, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const fetched = await client.fetchOne(String(uid), { source: true, envelope: true, uid: true }, { uid: true });
      if (!fetched?.source) throw new Error("Message not found");
      const parsed = await simpleParser(fetched.source);
      return mapMessage(parsed, fetched.uid || uid, fetched.envelope?.date);
    } finally {
      lock.release();
    }
  });
}
