import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.FLICK_DATA_DIR || path.join(DIR, ".data");
const KEY_FILE = path.join(DATA_DIR, "sessions.key");
const STORE_FILE = path.join(DATA_DIR, "sessions.enc");

let cacheKey = null;
let writeTimer = null;

function cryptoKey() {
  if (cacheKey) return cacheKey;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(KEY_FILE)) {
    const key = Buffer.from(fs.readFileSync(KEY_FILE, "utf8").trim(), "hex");
    if (key.length !== 32) throw new Error("Invalid session key file");
    cacheKey = key;
  } else {
    cacheKey = crypto.randomBytes(32);
    fs.writeFileSync(KEY_FILE, cacheKey.toString("hex"), { mode: 0o600 });
  }
  return cacheKey;
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cryptoKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

function decrypt(payload) {
  try {
    const raw = Buffer.from(String(payload || "").trim(), "base64");
    if (raw.length < 29) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const body = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", cryptoKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function loadSessions() {
  try {
    if (!fs.existsSync(STORE_FILE)) return new Map();
    const json = decrypt(fs.readFileSync(STORE_FILE, "utf8"));
    if (!json) return new Map();
    const parsed = JSON.parse(json);
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

export function persistSessions(sessions) {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const json = JSON.stringify(Object.fromEntries(sessions));
      fs.writeFileSync(STORE_FILE, encrypt(json), { mode: 0o600 });
    } catch (err) {
      console.error("Unable to persist sessions:", err.message);
    }
  }, 400);
  if (writeTimer.unref) writeTimer.unref();
}
