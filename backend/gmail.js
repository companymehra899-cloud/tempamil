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

function collectAddresses(value) {
  if (!value) return [];
  if (typeof value === "string") {
    return (value.match(/[a-z0-9._+-]+@[a-z0-9.-]+/gi) || []).map((item) => item.toLowerCase());
  }
  if (Array.isArray(value)) return value.flatMap(collectAddresses);
  if (value.value) return collectAddresses(value.value);
  if (value.address) return [String(value.address).toLowerCase()];
  if (value.text) return collectAddresses(value.text);
  return [];
}

function matchesAlias(parsed, envelope, alias) {
  const target = String(alias || "").toLowerCase();
  if (!target) return false;
  const headerTo = parsed?.headers?.get?.("delivered-to");
  const originalTo = parsed?.headers?.get?.("x-original-to");
  const addrs = [
    ...collectAddresses(parsed?.to),
    ...collectAddresses(parsed?.cc),
    ...collectAddresses(headerTo),
    ...collectAddresses(originalTo),
    ...collectAddresses(envelope?.to),
    ...collectAddresses(envelope?.cc),
  ];
  return addrs.includes(target);
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
  const created = date || parsed.date || new Date();
  return {
    id: String(uid),
    from: { address: from },
    subject: decodeText(parsed.subject) || "(no subject)",
    intro: String(text).replace(/\s+/g, " ").slice(0, 140),
    text,
    html,
    createdAt: created instanceof Date ? created.toISOString() : new Date(created).toISOString(),
    seen: true,
    provider: "gmail",
  };
}

async function searchAliasUids(client, alias) {
  const found = new Set();
  const queries = [{ to: alias }, { header: ["Delivered-To", alias] }, { header: ["To", alias] }];
  for (const query of queries) {
    try {
      const uids = await client.search(query, { uid: true });
      (uids || []).forEach((uid) => found.add(uid));
    } catch {
      // Gmail may reject some header searches
    }
  }
  if (found.size > 0) return [...found];

  const status = await client.status("INBOX", { messages: true });
  const total = Number(status.messages || 0);
  if (total === 0) return [];
  const start = Math.max(1, total - 39);
  const target = String(alias || "").toLowerCase();
  for await (const msg of client.fetch(`${start}:*`, { envelope: true, uid: true })) {
    const to = collectAddresses(msg.envelope?.to);
    const cc = collectAddresses(msg.envelope?.cc);
    if (to.includes(target) || cc.includes(target)) found.add(msg.uid);
  }
  return [...found];
}

export async function listGmail(id) {
  const session = sessions.get(id);
  if (!session) throw new Error("Gmail session expired. Connect again with an App Password.");
  return withClient(session, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const alias = session.alias || session.email;
      const uids = await searchAliasUids(client, alias);
      const last = uids.slice(-20).reverse();
      const messages = [];
      for (const uid of last) {
        const fetched = await client.fetchOne(String(uid), { source: true, envelope: true, uid: true }, { uid: true });
        if (!fetched?.source) continue;
        const parsed = await simpleParser(fetched.source);
        if (!matchesAlias(parsed, fetched.envelope, alias)) continue;
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
  if (!session) throw new Error("Gmail session expired. Connect again with an App Password.");
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

export async function deleteGmail(id, uid) {
  const session = sessions.get(id);
  if (!session) throw new Error("Gmail session expired. Connect again with an App Password.");
  return withClient(session, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      await client.messageDelete(String(uid), { uid: true });
      return { ok: true };
    } finally {
      lock.release();
    }
  });
}
