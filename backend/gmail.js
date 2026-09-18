import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import crypto from "node:crypto";
import { loadSessions, persistSessions } from "./store.js";

const sessions = loadSessions();

function saveSessions() {
  persistSessions(sessions);
}

const OTP_KEYWORD = /(otp|one[- ]?time|passcode|pass ?code|code|pin|verification|verify|confirm)/i;
const OTP_TOKEN = /\b([A-Za-z0-9]{4,8})\b/g;
const OTP_YEAR = /^(19|20)\d{2}$/;

function randomId() {
  return crypto.randomBytes(18).toString("hex");
}

export function extractOtp(subject, text) {
  const body = String(text || "");
  const haystack = `${subject || ""}\n${body}`;
  if (!haystack.trim()) return "";

  const subjectHasKeyword = OTP_KEYWORD.test(String(subject || ""));
  OTP_TOKEN.lastIndex = 0;
  let match;
  let fallback = "";
  while ((match = OTP_TOKEN.exec(haystack))) {
    const value = match[1];
    if (!/\d/.test(value)) continue;
    if (OTP_YEAR.test(value) && value.length === 4) continue;
    const before = haystack.slice(Math.max(0, match.index - 30), match.index);
    if (OTP_KEYWORD.test(before)) return value;
    if (fallback) continue;
    const after = haystack.slice(match.index + value.length, match.index + value.length + 30);
    if (OTP_KEYWORD.test(after) || subjectHasKeyword) fallback = value;
  }
  return fallback;
}

function normalizeLocal(value) {
  return String(value || "")
    .split("@")[0]
    .split("+")[0]
    .replace(/\./g, "")
    .toLowerCase();
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

function isAuthError(err) {
  const message = String(err?.message || "");
  return Boolean(err?.authenticationFailed) || /auth|invalid credentials|login failed|username and password/i.test(message);
}

async function runGmail(id, fn) {
  const session = sessions.get(id);
  if (!session) throw new Error("Gmail session expired. Connect again with an App Password.");
  try {
    return await withClient(session, fn);
  } catch (err) {
    if (isAuthError(err)) {
      destroySession(id);
      throw new Error("Gmail session expired. Connect again with an App Password.");
    }
    throw err;
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
  saveSessions();
  return { id, email: session.alias, account: session.email };
}

export function setAlias(id, alias) {
  const session = sessions.get(id);
  if (!session) return null;
  const next = String(alias || "").trim().toLowerCase();
  if (!/^[a-z0-9._+-]+@(gmail|googlemail)\.com$/.test(next)) {
    throw new Error("Enter a valid Gmail alias, like name+tag@gmail.com");
  }
  if (normalizeLocal(next) !== normalizeLocal(session.email)) {
    throw new Error("Alias must belong to the connected Gmail account");
  }
  session.alias = next;
  saveSessions();
  return session;
}

export function getSession(id) {
  return sessions.get(id) || null;
}

export function destroySession(id) {
  const removed = sessions.delete(id);
  if (removed) saveSessions();
  return removed;
}

function mapMessage(parsed, uid, date) {
  const from = parsed.from?.value?.[0]?.address || parsed.from?.text || "unknown";
  const html = parsed.html ? [String(parsed.html)] : [];
  const text = parsed.text || parsed.textAsHtml || "";
  const subject = decodeText(parsed.subject) || "(no subject)";
  const created = date || parsed.date || new Date();
  return {
    id: String(uid),
    from: { address: from },
    subject,
    intro: String(text).replace(/\s+/g, " ").slice(0, 140),
    text,
    html,
    otp: extractOtp(subject, `${text} ${html.join(" ")}`),
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
  return runGmail(id, async (client) => {
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
  return runGmail(id, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const fetched = await client.fetchOne(String(uid), { source: true, envelope: true, uid: true }, { uid: true });
      if (!fetched?.source) throw new Error("Message not found");
      const parsed = await simpleParser(fetched.source);
      const alias = session.alias || session.email;
      if (alias && !matchesAlias(parsed, fetched.envelope, alias)) {
        throw new Error("Message does not belong to the selected Gmail address");
      }
      return mapMessage(parsed, fetched.uid || uid, fetched.envelope?.date);
    } finally {
      lock.release();
    }
  });
}

export async function deleteGmail(id, uid) {
  const session = sessions.get(id);
  if (!session) throw new Error("Gmail session expired. Connect again with an App Password.");
  return runGmail(id, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      await client.messageDelete(String(uid), { uid: true });
      return { ok: true };
    } finally {
      lock.release();
    }
  });
}
