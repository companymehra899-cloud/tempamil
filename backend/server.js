import express from "express";
import { connectGmail, destroySession, getSession, listGmail, readGmail, setAlias } from "./gmail.js";

const MAIL_API = "https://api.mail.tm";
const GUERRILLA_API = "https://api.guerrillamail.com/ajax.php";
const PORT = Number(process.env.PORT) || 3001;

const GUERRILLA_DOMAINS = [
  "sharklasers.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "grr.la",
  "pokemail.net",
  "spam4.me",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamail.biz",
  "guerrillamail.de",
  "guerrillamailblock.com",
];

const TEMPIO_API = "https://api.internal.temp-mail.io/api/v3";
const LOL_API = "https://api.tempmail.lol/v2";

const TEMPIO_DOMAINS = [
  "ozsaip.com",
  "yzcalo.com",
  "lnovic.com",
  "ruutukf.com",
  "gmeenramy.com",
  "olipii.com",
  "ooynib.com",
];

const LOL_DOMAINS = [
  "imagesthere.com",
  "prominentghost.com",
  "26ai.art",
];

const app = express();
app.use(express.json({ limit: "1mb" }));

async function parseJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function mailFetch(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${MAIL_API}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body,
  });
  return { status: res.status, data: await parseJson(res) };
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "FlickMail/1.0",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    body: options.body,
  });
  return { status: res.status, data: await parseJson(res) };
}

async function guerrillaFetch(params) {
  const url = new URL(GUERRILLA_API);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  });
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "FlickMail/1.0" },
  });
  const data = await parseJson(res);
  return { status: res.status, data };
}

function collectionMembers(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.["hydra:member"])) return data["hydra:member"];
  if (Array.isArray(data?.member)) return data.member;
  return [];
}

function authHeader(req) {
  const auth = req.headers.authorization;
  return auth ? { Authorization: auth } : {};
}

function providerOf(req) {
  return String(req.headers["x-flick-provider"] || "mailtm");
}

function guerrillaSid(req) {
  return req.headers["x-flick-sid"] || "";
}

function sessionAddress(req) {
  return req.headers["x-flick-address"] || req.query.address || "";
}

function extraToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return req.headers["x-flick-sid"] || "";
}

function mapTempioList(data) {
  const list = Array.isArray(data) ? data : [];
  return list.map((item, index) => ({
    id: String(item.id || item._id || index),
    from: { address: item.from || item.sender || "unknown" },
    subject: item.subject || "(no subject)",
    intro: item.body_text || item.body || item.preview || "",
    createdAt: item.created_at || item.createdAt || new Date().toISOString(),
    seen: Boolean(item.seen),
    provider: "tempio",
    raw: item,
  }));
}

function mapLolList(data) {
  const list = Array.isArray(data?.emails) ? data.emails : [];
  return list.map((item, index) => ({
    id: String(item.id || item.uid || index),
    from: { address: item.from || item.sender || "unknown" },
    subject: item.subject || "(no subject)",
    intro: item.body || item.html || "",
    text: item.body || "",
    html: item.html ? [item.html] : [],
    createdAt: item.date
      ? new Date(Number(item.date)).toISOString()
      : new Date().toISOString(),
    seen: false,
    provider: "lol",
    raw: item,
  }));
}

function mapGuerrillaList(data, domain) {
  const list = Array.isArray(data?.list) ? data.list : [];
  return list
    .filter((item) => String(item.mail_id) !== "1")
    .map((item) => ({
      id: String(item.mail_id),
      from: { address: item.mail_from || "unknown" },
      subject: item.mail_subject || "(no subject)",
      intro: item.mail_excerpt || "",
      createdAt: item.mail_timestamp
        ? new Date(Number(item.mail_timestamp) * 1000).toISOString()
        : new Date().toISOString(),
      seen: Boolean(item.mail_read),
      provider: "guerrilla",
      domain,
    }));
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "flickmail" });
});

app.get("/api/domains", async (_req, res) => {
  try {
    const { data } = await mailFetch("/domains?page=1");
    const mailtm = collectionMembers(data)
      .filter((item) => item.isActive !== false && item.domain)
      .map((item) => ({
        domain: item.domain,
        provider: "mailtm",
        isActive: true,
      }));

    const guerrilla = GUERRILLA_DOMAINS.map((domain) => ({
      domain,
      provider: "guerrilla",
      isActive: true,
    }));
    const tempio = TEMPIO_DOMAINS.map((domain) => ({
      domain,
      provider: "tempio",
      isActive: true,
    }));
    const lol = LOL_DOMAINS.map((domain) => ({
      domain,
      provider: "lol",
      isActive: true,
    }));

    const seen = new Set();
    const merged = [...mailtm, ...guerrilla, ...tempio, ...lol].filter((item) => {
      if (seen.has(item.domain)) return false;
      seen.add(item.domain);
      return true;
    });

    res.json(merged);
  } catch {
    res.status(502).json({ message: "Unable to load domains" });
  }
});

app.post("/api/gmail/connect", async (req, res) => {
  try {
    const { email, password, alias } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ message: "Gmail and App Password are required" });
      return;
    }
    const connected = await connectGmail(String(email).trim().toLowerCase(), String(password).replace(/\s+/g, ""));
    if (alias) setAlias(connected.id, alias);
    res.json({
      provider: "gmail",
      id: connected.id,
      address: alias || connected.email,
      token: connected.id,
      domain: "gmail.com",
    });
  } catch (err) {
    res.status(401).json({
      message: err?.message || "Could not connect Gmail. Use an App Password, not your normal password.",
    });
  }
});

app.post("/api/gmail/alias", async (req, res) => {
  try {
    const { id, alias } = req.body || {};
    if (!id || !alias) {
      res.status(400).json({ message: "id and alias are required" });
      return;
    }
    const session = setAlias(id, alias);
    if (!session) {
      res.status(404).json({ message: "Gmail is not connected" });
      return;
    }
    res.json({ ok: true, address: alias });
  } catch (err) {
    res.status(400).json({ message: err.message || "Unable to set alias" });
  }
});

app.post("/api/inbox", async (req, res) => {
  try {
    const { address, password, domain, provider } = req.body || {};
    if (!address) {
      res.status(400).json({ message: "address is required" });
      return;
    }

    const chosenDomain = domain || String(address).split("@")[1];
    const local = String(address).split("@")[0];
    const useGuerrilla = provider === "guerrilla" || GUERRILLA_DOMAINS.includes(chosenDomain);
    const useTempio = provider === "tempio" || TEMPIO_DOMAINS.includes(chosenDomain);
    const useLol = provider === "lol" || LOL_DOMAINS.includes(chosenDomain);

    if (useGuerrilla) {
      const started = await guerrillaFetch({ f: "get_email_address", lang: "en" });
      const sid = started.data?.sid_token;
      if (!sid) {
        res.status(502).json({ message: "Unable to create inbox" });
        return;
      }
      const assigned = await guerrillaFetch({
        f: "set_email_user",
        email_user: local,
        lang: "en",
        sid_token: sid,
        domain: chosenDomain,
      });
      const sidToken = assigned.data?.sid_token || sid;
      res.json({
        provider: "guerrilla",
        id: sidToken,
        address: `${local}@${chosenDomain}`,
        sid: sidToken,
      });
      return;
    }

    if (useTempio) {
      const created = await jsonFetch(`${TEMPIO_API}/email/new`, {
        method: "POST",
        body: JSON.stringify({ name: local, domain: chosenDomain }),
      });
      if (created.status >= 400 || !created.data?.email) {
        res.status(created.status >= 400 ? created.status : 502).json(created.data || { message: "Unable to create inbox" });
        return;
      }
      res.json({
        provider: "tempio",
        id: created.data.email,
        address: created.data.email,
        token: created.data.token,
      });
      return;
    }

    if (useLol) {
      const created = await jsonFetch(`${LOL_API}/inbox/create`, {
        method: "POST",
        body: JSON.stringify({ prefix: local, domain: chosenDomain }),
      });
      if (created.status >= 400 || !created.data?.address) {
        res.status(created.status >= 400 ? created.status : 502).json(created.data || { message: "Unable to create inbox" });
        return;
      }
      res.json({
        provider: "lol",
        id: created.data.token,
        address: created.data.address,
        token: created.data.token,
      });
      return;
    }

    if (!password) {
      res.status(400).json({ message: "password is required" });
      return;
    }
    const created = await mailFetch("/accounts", {
      method: "POST",
      body: JSON.stringify({ address, password }),
    });
    if (created.status >= 400) {
      res.status(created.status).json(created.data);
      return;
    }
    const auth = await mailFetch("/token", {
      method: "POST",
      body: JSON.stringify({ address, password }),
    });
    res.status(auth.status).json({
      provider: "mailtm",
      id: created.data?.id,
      address,
      password,
      token: auth.data?.token,
    });
  } catch {
    res.status(502).json({ message: "Unable to create inbox" });
  }
});

app.post("/api/accounts", async (req, res) => {
  try {
    const { address, password } = req.body || {};
    if (!address || !password) {
      res.status(400).json({ message: "address and password are required" });
      return;
    }
    const { status, data } = await mailFetch("/accounts", {
      method: "POST",
      body: JSON.stringify({ address, password }),
    });
    res.status(status).json(data);
  } catch {
    res.status(502).json({ message: "Unable to create inbox" });
  }
});

app.post("/api/token", async (req, res) => {
  try {
    const { address, password } = req.body || {};
    if (!address || !password) {
      res.status(400).json({ message: "address and password are required" });
      return;
    }
    const { status, data } = await mailFetch("/token", {
      method: "POST",
      body: JSON.stringify({ address, password }),
    });
    res.status(status).json(data);
  } catch {
    res.status(502).json({ message: "Unable to authenticate inbox" });
  }
});

app.get("/api/messages", async (req, res) => {
  try {
    const provider = providerOf(req);
    if (provider === "gmail") {
      const id = extraToken(req) || guerrillaSid(req);
      const session = getSession(id);
      if (req.query.alias && session) setAlias(id, String(req.query.alias));
      const messages = await listGmail(id);
      res.json(messages);
      return;
    }
    if (provider === "guerrilla") {
      const sid = guerrillaSid(req);
      const domain = req.query.domain || "";
      const { status, data } = await guerrillaFetch({
        f: "get_email_list",
        offset: "0",
        sid_token: sid,
      });
      res.status(status).json(mapGuerrillaList(data, domain));
      return;
    }
    if (provider === "tempio") {
      const email = encodeURIComponent(sessionAddress(req));
      const { status, data } = await jsonFetch(`${TEMPIO_API}/email/${email}/messages`);
      res.status(status).json(mapTempioList(data));
      return;
    }
    if (provider === "lol") {
      const token = extraToken(req);
      const { status, data } = await jsonFetch(`${LOL_API}/inbox?token=${encodeURIComponent(token)}`);
      res.status(status).json(mapLolList(data));
      return;
    }
    const page = req.query.page || "1";
    const { status, data } = await mailFetch(`/messages?page=${encodeURIComponent(page)}`, {
      headers: authHeader(req),
    });
    res.status(status).json(data);
  } catch {
    res.status(502).json({ message: "Unable to load messages" });
  }
});

app.get("/api/messages/:id", async (req, res) => {
  try {
    const provider = providerOf(req);
    if (provider === "gmail") {
      const id = extraToken(req) || guerrillaSid(req);
      const message = await readGmail(id, req.params.id);
      res.json(message);
      return;
    }
    if (provider === "guerrilla") {
      const sid = guerrillaSid(req);
      const { status, data } = await guerrillaFetch({
        f: "fetch_email",
        email_id: req.params.id,
        sid_token: sid,
      });
      res.status(status).json({
        id: String(data?.mail_id || req.params.id),
        from: { address: data?.mail_from || "unknown" },
        subject: data?.mail_subject || "(no subject)",
        text: data?.mail_body || data?.mail_excerpt || "",
        html: data?.mail_body ? [data.mail_body] : [],
        createdAt: data?.mail_timestamp
          ? new Date(Number(data.mail_timestamp) * 1000).toISOString()
          : new Date().toISOString(),
      });
      return;
    }
    if (provider === "tempio") {
      const email = encodeURIComponent(sessionAddress(req));
      const { status, data } = await jsonFetch(`${TEMPIO_API}/email/${email}/messages`);
      const list = mapTempioList(data);
      const found = list.find((item) => item.id === String(req.params.id)) || list[0];
      const raw = found?.raw || {};
      res.status(status).json({
        id: found?.id || req.params.id,
        from: found?.from || { address: "unknown" },
        subject: found?.subject || "(no subject)",
        text: raw.body_text || raw.body || found?.intro || "",
        html: raw.body_html ? [raw.body_html] : [],
        createdAt: found?.createdAt,
      });
      return;
    }
    if (provider === "lol") {
      const token = extraToken(req);
      const { status, data } = await jsonFetch(`${LOL_API}/inbox?token=${encodeURIComponent(token)}`);
      const list = mapLolList(data);
      const found = list.find((item) => item.id === String(req.params.id)) || list[0];
      res.status(status).json({
        id: found?.id || req.params.id,
        from: found?.from || { address: "unknown" },
        subject: found?.subject || "(no subject)",
        text: found?.text || found?.intro || "",
        html: found?.html || [],
        createdAt: found?.createdAt,
      });
      return;
    }
    const { status, data } = await mailFetch(`/messages/${encodeURIComponent(req.params.id)}`, {
      headers: authHeader(req),
    });
    res.status(status).json(data);
  } catch {
    res.status(502).json({ message: "Unable to load message" });
  }
});

app.delete("/api/messages/:id", async (req, res) => {
  try {
    const provider = providerOf(req);
    if (provider === "guerrilla") {
      const sid = guerrillaSid(req);
      const { status } = await guerrillaFetch({
        f: "del_email",
        "email_ids[]": req.params.id,
        sid_token: sid,
      });
      res.status(status === 204 ? 200 : status).json({ ok: true });
      return;
    }
    if (provider === "tempio" || provider === "lol" || provider === "gmail") {
      res.json({ ok: true });
      return;
    }
    const { status, data } = await mailFetch(`/messages/${encodeURIComponent(req.params.id)}`, {
      method: "DELETE",
      headers: authHeader(req),
    });
    res.status(status === 204 ? 200 : status).json(data || { ok: true });
  } catch {
    res.status(502).json({ message: "Unable to delete message" });
  }
});

app.delete("/api/accounts/:id", async (req, res) => {
  try {
    const provider = providerOf(req);
    if (provider === "guerrilla" || provider === "tempio" || provider === "lol" || provider === "gmail") {
      destroySession(req.params.id);
      res.json({ ok: true });
      return;
    }
    const { status, data } = await mailFetch(`/accounts/${encodeURIComponent(req.params.id)}`, {
      method: "DELETE",
      headers: authHeader(req),
    });
    res.status(status === 204 ? 200 : status).json(data || { ok: true });
  } catch {
    res.status(502).json({ message: "Unable to delete inbox" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FlickMail backend listening on ${PORT}`);
});
