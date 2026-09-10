async function request(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!res.ok) {
    const message = data?.message || data?.detail || "Request failed";
    throw new Error(typeof message === "string" ? message : "Request failed");
  }
  return data;
}

export function randomPassword(length = 18) {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function randomLocalPart() {
  const words = ["flick", "nova", "pixel", "orbit", "quark", "ember", "lumen", "pulse"];
  const word = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${word}${n}`;
}

export function collectionMembers(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.["hydra:member"])) return data["hydra:member"];
  if (Array.isArray(data?.member)) return data.member;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function sessionHeaders(session = {}) {
  const headers = {};
  if (session.provider) headers["X-Flick-Provider"] = session.provider;
  if (session.sid) headers["X-Flick-Sid"] = session.sid;
  if (session.address) headers["X-Flick-Address"] = session.address;
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  return headers;
}

export const api = {
  domains: () => request("/api/domains"),
  createInbox: (payload) =>
    request("/api/inbox", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createAccount: (address, password) =>
    request("/api/accounts", {
      method: "POST",
      body: JSON.stringify({ address, password }),
    }),
  token: (address, password) =>
    request("/api/token", {
      method: "POST",
      body: JSON.stringify({ address, password }),
    }),
  messages: (session, page = 1) =>
    request(`/api/messages?page=${page}&domain=${encodeURIComponent(session.domain || "")}`, {
      headers: sessionHeaders(session),
    }),
  message: (session, id) =>
    request(`/api/messages/${id}`, {
      headers: sessionHeaders(session),
    }),
  deleteMessage: (session, id) =>
    request(`/api/messages/${id}`, {
      method: "DELETE",
      headers: sessionHeaders(session),
    }),
  deleteAccount: (session, id) =>
    request(`/api/accounts/${id}`, {
      method: "DELETE",
      headers: sessionHeaders(session),
    }),
};
