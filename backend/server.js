import express from "express";

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

    const seen = new Set();
    const merged = [...mailtm, ...guerrilla].filter((item) => {
      if (seen.has(item.domain)) return false;
      seen.add(item.domain);
      return true;
    });

    res.json(merged);
  } catch {
    res.status(502).json({ message: "Unable to load domains" });
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
    const useGuerrilla = provider === "guerrilla" || GUERRILLA_DOMAINS.includes(chosenDomain);

    if (useGuerrilla) {
      const local = String(address).split("@")[0];
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
    if (providerOf(req) === "guerrilla") {
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
    if (providerOf(req) === "guerrilla") {
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
    if (providerOf(req) === "guerrilla") {
      const sid = guerrillaSid(req);
      const { status } = await guerrillaFetch({
        f: "del_email",
        "email_ids[]": req.params.id,
        sid_token: sid,
      });
      res.status(status === 204 ? 200 : status).json({ ok: true });
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
    if (providerOf(req) === "guerrilla") {
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
