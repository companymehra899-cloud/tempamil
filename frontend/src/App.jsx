import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  buildGmailAlias,
  collectionMembers,
  parseGmail,
  randomGmailTag,
  randomLocalPart,
  randomPassword,
} from "./api.js";
import Layout from "./Layout.jsx";
import { ArticlePage, ArticlesPage, PrivacyPage, TermsPage } from "./pages.jsx";

const STORAGE_KEY = "flickmail-session";
const STAR_KEY = "flickmail-stars";
const GMAIL_KEY = "flickmail-gmail";

const SAMPLE = [
  {
    id: "s1",
    from: { address: "hello@flickmail.app" },
    subject: "Welcome to FlickMail",
    intro: "Your disposable inbox is ready. Copy the address and keep spam off your real email.",
    createdAt: new Date().toISOString(),
    sample: true,
  },
  {
    id: "s2",
    from: { address: "support@flickmail.app" },
    subject: "Have questions?",
    intro: "Use a temp inbox for signups you do not fully trust yet.",
    createdAt: new Date(Date.now() - 39000).toISOString(),
    sample: true,
  },
];

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function relativeTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diff = Date.now() - date.getTime();
  const sec = Math.max(0, Math.floor(diff / 1000));
  if (sec < 45) return "A few seconds ago";
  if (sec < 90) return "1 minute ago";
  if (sec < 3600) return `${Math.floor(sec / 60)} minutes ago`;
  if (sec < 7200) return "1 hour ago";
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`;
  return date.toLocaleString();
}

function Icon({ d, size = 20 }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={d} />
    </svg>
  );
}

function pageFromHash() {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash.startsWith("article/")) return { name: "article", slug: hash.slice(8) };
  if (hash === "privacy" || hash === "terms" || hash === "articles") return { name: hash };
  return { name: "home" };
}

export default function App() {
  const [session, setSession] = useState(() => loadJson(STORAGE_KEY, null));
  const [messages, setMessages] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [stars, setStars] = useState(() => loadJson(STAR_KEY, {}));
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(() => pageFromHash());
  const [domains, setDomains] = useState([]);
  const [localPart, setLocalPart] = useState(() => randomLocalPart());
  const [chosenDomain, setChosenDomain] = useState("");
  const [gmailBase, setGmailBase] = useState(() => localStorage.getItem(GMAIL_KEY) || "");
  const [gmailInput, setGmailInput] = useState(() => localStorage.getItem(GMAIL_KEY) || "");
  const [gmailTag, setGmailTag] = useState(() => randomGmailTag());
  const [gmailStyle, setGmailStyle] = useState("plus");
  const [gmailAlias, setGmailAlias] = useState("");
  const [gmailAppPassword, setGmailAppPassword] = useState("");
  const [gmailConn, setGmailConn] = useState(() => loadJson("flickmail-gmail-conn", null));

  const goTo = (name, slug) => {
    const next = slug ? { name, slug } : { name };
    setPage(next);
    window.location.hash = slug ? `article/${slug}` : name === "home" ? "home" : name;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const saveSession = (next) => {
    setSession(next);
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  };

  const saveGmailConn = (next) => {
    setGmailConn(next);
    if (next) localStorage.setItem("flickmail-gmail-conn", JSON.stringify(next));
    else localStorage.removeItem("flickmail-gmail-conn");
  };

  useEffect(() => {
    api.domains()
      .then((data) => {
        const list = collectionMembers(data).filter((item) => item.domain);
        setDomains(list);
        if (!chosenDomain && list.length) {
          setChosenDomain(list[Math.floor(Math.random() * list.length)].domain);
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  const randomizeAddress = useCallback(() => {
    setLocalPart(randomLocalPart());
    if (domains.length) {
      setChosenDomain(domains[Math.floor(Math.random() * domains.length)].domain);
    }
  }, [domains]);

  const selectedDomain = domains.find((item) => item.domain === chosenDomain) || domains[0];

  const aliasPreview = useMemo(() => {
    const base = parseGmail(gmailInput || gmailBase);
    if (!base) return "";
    return buildGmailAlias(base.local, gmailTag, gmailStyle);
  }, [gmailInput, gmailBase, gmailTag, gmailStyle]);

  const createInbox = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const domain = selectedDomain?.domain || chosenDomain;
      if (!domain) throw new Error("No active domain available");
      const local = (localPart || randomLocalPart()).toLowerCase().replace(/[^a-z0-9._-]/g, "");
      if (!local) throw new Error("Enter a username first");
      const address = `${local}@${domain}`;
      const password = randomPassword();
      const inbox = await api.createInbox({
        address,
        password,
        domain,
        provider: selectedDomain?.provider,
      });
      saveSession({
        id: inbox.id,
        address: inbox.address || address,
        password,
        token: inbox.token,
        sid: inbox.sid,
        provider: inbox.provider || selectedDomain?.provider || "mailtm",
        domain,
      });
      setLocalPart(local);
      setMessages([]);
      setSelected(null);
      setSelectedId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [chosenDomain, localPart, selectedDomain]);

  const refresh = useCallback(async () => {
    if (!session?.token && !session?.sid) return;
    try {
      const data = await api.messages(session);
      setMessages(collectionMembers(data));
      setError("");
    } catch (err) {
      const expired = /expired|not connected/i.test(err.message || "");
      if (session?.provider === "gmail" && expired) {
        saveGmailConn(null);
        saveSession(null);
        setGmailAlias("");
        setMessages([]);
      }
      setError(err.message);
    }
  }, [session]);

  const openMessage = async (item) => {
    if (item.sample) {
      setSelectedId(item.id);
      setSelected(item);
      return;
    }
    if (!session?.token && !session?.sid) return;
    setSelectedId(item.id);
    try {
      const data = await api.message(session, item.id);
      setSelected(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const copyAddress = async () => {
    if (!session?.address) return;
    await navigator.clipboard.writeText(session.address);
  };

  const destroyInbox = async () => {
    if (session?.id) {
      try {
        await api.deleteAccount(session, session.id);
      } catch {
        // already gone
      }
    }
    if (session?.provider === "gmail") {
      saveGmailConn(null);
      setGmailAlias("");
      setGmailAppPassword("");
    }
    saveSession(null);
    setMessages([]);
    setSelected(null);
    setSelectedId(null);
  };

  const deleteCurrent = async () => {
    if ((!session?.token && !session?.sid) || !selectedId || selected?.sample) return;
    try {
      await api.deleteMessage(session, selectedId);
      setSelected(null);
      setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleStar = (id, event) => {
    event.stopPropagation();
    const next = { ...stars, [id]: !stars[id] };
    setStars(next);
    localStorage.setItem(STAR_KEY, JSON.stringify(next));
  };

  useEffect(() => {
    if (!session) return;
    refresh();
    const wait = session.provider === "gmail" ? 30000 : 8000;
    const timer = setInterval(refresh, wait);
    return () => clearInterval(timer);
  }, [session, refresh]);

  useEffect(() => {
    if (!session?.address) return;
    if (session.provider === "gmail") {
      setGmailAlias(session.address);
      return;
    }
    const [local, domain] = session.address.split("@");
    if (local) setLocalPart(local);
    if (domain) setChosenDomain(domain);
  }, [session]);

  const rows = session ? messages : SAMPLE;
  const visible = rows.filter((item) => {
    if (filter === "starred") return Boolean(stars[item.id]);
    if (filter === "unstarred") return !stars[item.id];
    return true;
  });

  const htmlSrcDoc = useMemo(() => {
    if (!selected?.html) return "";
    const html = Array.isArray(selected.html) ? selected.html.join("\n") : selected.html;
    return `<base target="_blank">${html}`;
  }, [selected]);

  const shell = (content) => (
    <Layout page={page.name} onNavigate={goTo} menuOpen={menuOpen} setMenuOpen={setMenuOpen}>
      {content}
    </Layout>
  );

  if (page.name === "privacy") return shell(<PrivacyPage />);
  if (page.name === "terms") return shell(<TermsPage />);
  if (page.name === "articles") return shell(<ArticlesPage onOpen={(slug) => goTo("article", slug)} />);
  if (page.name === "article") {
    return shell(<ArticlePage slug={page.slug} onBack={() => goTo("articles")} />);
  }

  return shell(
    <>
      <section className="hero" id="top">
        <h1>
          <span className="line">Don't give them your private email,</span>
          <span className="line accent">use our inboxes</span>
        </h1>
        <div className="stars" aria-hidden="true">
          {"*****".split("").map((_, i) => (
            <svg key={i} width="22" height="22" fill="currentColor" viewBox="0 0 20 20">
              <path d="M11.055 2.717c.312-.895 1.578-.895 1.89 0l1.648 4.742a1 1 0 0 0 .924.672l5.02.102c.947.02 1.339 1.224.583 1.797l-4 3.033a1 1 0 0 0-.353 1.086l1.453 4.806c.275.907-.75 1.652-1.528 1.11l-4.12-2.867a1 1 0 0 0-1.143 0l-4.121 2.867c-.778.541-1.803-.203-1.528-1.11l1.453-4.806a1 1 0 0 0-.353-1.086l-4-3.033c-.756-.573-.364-1.777.584-1.797l5.019-.102a1 1 0 0 0 .924-.672l1.648-4.742Z" />
            </svg>
          ))}
        </div>
        <p className="quote">Free temporary email in one click. Keep spam off your real inbox.</p>
      </section>

      <div className="wrap" id="inbox">
        {error && <p className="error">{error}</p>}
        <div className="generate-box">
          <div className="generate-label">Your temporary email</div>
          <div className="generate-row">
            <div className="address">{session?.address || `${localPart}@${chosenDomain || "loading-domains"}`}</div>
            <div className="chip-row">
              <button className="cta" onClick={createInbox} disabled={busy || !chosenDomain}>
                {session ? "Generate new" : "Generate email"}
                <Icon d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" size={18} />
              </button>
              <button className="chip" onClick={randomizeAddress} disabled={busy}>
                Random
              </button>
              {session && (
                <>
                  <button className="chip" onClick={copyAddress}>Copy</button>
                  <button className="chip danger" onClick={destroyInbox}>Discard</button>
                </>
              )}
            </div>
          </div>
          <div className="hint">
            {session
              ? `Using @${session.domain || chosenDomain}. Auto-refreshing every ${session.provider === "gmail" ? "30" : "8"} seconds.`
              : "Your address is picked at random. Incoming mail appears in the box below."}
          </div>
        </div>

        <div className="generate-box gmail-box">
          <div className="generate-label">Gmail OTP inbox</div>
          <div className="composer gmail-composer">
            <input
              className="local-input"
              value={gmailInput}
              onChange={(e) => setGmailInput(e.target.value)}
              spellCheck="false"
              autoCapitalize="none"
              placeholder="yourname@gmail.com"
            />
            <input
              className="local-input"
              type="password"
              value={gmailAppPassword}
              onChange={(e) => setGmailAppPassword(e.target.value)}
              autoComplete="off"
              name="flickmail-app-password"
              placeholder="Gmail App Password"
            />
          </div>
          <div className="composer gmail-composer alias-composer">
            <input
              className="local-input"
              value={gmailTag}
              onChange={(e) => setGmailTag(e.target.value)}
              spellCheck="false"
              autoCapitalize="none"
              placeholder="alias tag e.g. shop, otp"
            />
            <select
              className="domain-select"
              value={gmailStyle}
              onChange={(e) => setGmailStyle(e.target.value)}
            >
              <option value="plus">name+tag@gmail.com</option>
              <option value="dot">na.me@gmail.com</option>
              <option value="both">na.me+tag@gmail.com</option>
            </select>
            <button className="chip" onClick={() => setGmailTag(randomGmailTag())} type="button">
              New tag
            </button>
          </div>
          {aliasPreview && (
            <div className="alias-preview">
              Alias: <code>{aliasPreview}</code> — mail arrives in your Gmail, shown here.
            </div>
          )}
          <div className="generate-row">
            <div className="address">
              {gmailAlias || (session?.provider === "gmail" ? session.address : "Connect Gmail, then generate an alias")}
            </div>
            <div className="chip-row">
              <button
                className="cta"
                disabled={busy}
                onClick={async () => {
                  const parsed = parseGmail(gmailInput || gmailBase);
                  if (!parsed) {
                    setError("Enter your real Gmail address, like name@gmail.com");
                    return;
                  }
                  const live = session?.provider === "gmail" ? session : gmailConn;
                  if (!gmailAppPassword && !live?.id) {
                    setError("Enter a Gmail App Password, not your normal password.");
                    return;
                  }
                  const saved = `${parsed.local}@gmail.com`;
                  const alias = buildGmailAlias(parsed.local, gmailTag, gmailStyle);
                  setBusy(true);
                  setError("");
                  try {
                    let next = live;
                    if (live?.id) {
                      try {
                        await api.setGmailAlias(live.id, alias);
                        next = { ...live, address: alias, domain: "gmail.com", provider: "gmail" };
                      } catch {
                        if (!gmailAppPassword) {
                          throw new Error("Gmail session expired. Enter App Password again.");
                        }
                        const inbox = await api.connectGmail(saved, gmailAppPassword, alias);
                        next = {
                          id: inbox.id,
                          address: inbox.address,
                          token: inbox.token,
                          provider: "gmail",
                          domain: "gmail.com",
                        };
                      }
                    } else {
                      const inbox = await api.connectGmail(saved, gmailAppPassword, alias);
                      next = {
                        id: inbox.id,
                        address: inbox.address,
                        token: inbox.token,
                        provider: "gmail",
                        domain: "gmail.com",
                      };
                    }
                    saveGmailConn(next);
                    saveSession(next);
                    setGmailBase(saved);
                    setGmailInput(saved);
                    localStorage.setItem(GMAIL_KEY, saved);
                    setGmailAlias(alias);
                    setGmailAppPassword("");
                    setMessages([]);
                    setSelected(null);
                    setSelectedId(null);
                  } catch (err) {
                    setError(err.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {session?.provider === "gmail" || gmailConn ? "New Gmail alias" : "Connect Gmail inbox"}
              </button>
              {(gmailAlias || session?.provider === "gmail") && (
                <button
                  className="chip"
                  onClick={async () => {
                    await navigator.clipboard.writeText(gmailAlias || session.address);
                  }}
                >
                  Copy
                </button>
              )}
            </div>
          </div>
          <div className="hint">
            App Password is sent once to the server and never saved in this browser.{" "}
            <button className="link-btn" onClick={() => goTo("article", "gmail-app-password")} type="button">
              Setup guide
            </button>
          </div>
        </div>

        <div className="inbox-card">
          <div className="inbox-toolbar">
            <div className="tool-group">
              <select className="chip" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="starred">Starred</option>
                <option value="unstarred">Unstarred</option>
              </select>
              <span className="sep" />
              <button className="icon-btn" title="Reload" onClick={refresh} disabled={!session}>
                <Icon d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </button>
              <button className="icon-btn danger" title="Delete" onClick={deleteCurrent} disabled={!selected || selected.sample}>
                <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </button>
            </div>
            <div className="count">
              {visible.length === 0 ? "0 of 0" : `1-${visible.length} of ${visible.length}`}
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="from-cell">From</th>
                  <th>Subject - Preview</th>
                  <th className="time-cell">Received</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan="3">
                      <div className="empty">Waiting for mail. This inbox checks itself automatically.</div>
                    </td>
                  </tr>
                )}
                {visible.map((item) => (
                  <tr
                    key={item.id}
                    className={`${item.id === selectedId ? "active" : ""} ${item.seen === false ? "unread" : ""}`}
                    onClick={() => openMessage(item)}
                  >
                    <td className="from-cell">
                      <div className="from-row">
                        <button
                          className={stars[item.id] ? "star on" : "star"}
                          onClick={(e) => toggleStar(item.id, e)}
                          title="Star"
                        >
                          <Icon d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </button>
                        <span className="truncate">{item.from?.address || "Unknown sender"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="subject-cell">
                        <div className="subject-row truncate">
                          <span>{item.subject || "(no subject)"}</span>
                          {item.intro && <span className="preview"> - {item.intro}</span>}
                        </div>
                        {item.otp && (
                          <span className="otp-badge" title="Detected code">
                            OTP {item.otp}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="time-cell">{relativeTime(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <article className="reader">
              <h2>{selected.subject || "(no subject)"}</h2>
              <div className="reader-meta">
                From {selected.from?.address || "unknown"} · {relativeTime(selected.createdAt)}
              </div>
              {selected.otp && (
                <div className="otp-row">
                  <span className="otp-code">{selected.otp}</span>
                  <button
                    className="chip"
                    onClick={async () => {
                      await navigator.clipboard.writeText(selected.otp);
                    }}
                  >
                    Copy code
                  </button>
                </div>
              )}
              {htmlSrcDoc ? (
                <iframe className="html-frame" title="Email body" srcDoc={htmlSrcDoc} />
              ) : (
                <div className="body">{selected.text || selected.intro || "Empty message."}</div>
              )}
            </article>
          )}
        </div>
      </div>

      <section className="features" id="about">
        <p className="kicker">It's that simple</p>
        <h2>
          When your email address is too precious. <span>Inboxes aren't.</span>
        </h2>
        <div className="grid">
          <div className="card">
            <div className="icon">
              <Icon d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </div>
            <h3>Catch-all inboxes.</h3>
            <p>
              Let junk, ads, and one-time signups land here. Keep your private email for
              what actually matters.
            </p>
          </div>
          <div className="card">
            <div className="icon">
              <Icon d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </div>
            <h3>Free-for-all inboxes</h3>
            <p>
              Instant, anonymous, and completely free. The moment you open FlickMail, a
              disposable address is one click away.
            </p>
          </div>
          <div className="card">
            <div className="icon">
              <Icon d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </div>
            <h3>Forget-it-all inboxes</h3>
            <p>
              Temp inboxes are not tied to you. Grab an address, use it, then discard it
              when you are done.
            </p>
          </div>
        </div>
      </section>

      <section className="faq" id="faq">
        <div>
          <h2>Frequently asked questions</h2>
          <p>Temporary email for signups you do not want following you around.</p>
        </div>
        <dl>
          <div>
            <dt>What is disposable temporary email?</dt>
            <dd>
              A throwaway address you can use when registering on sites you do not fully
              trust yet. You still receive the mail. Your real inbox stays clean.
            </dd>
          </div>
          <div>
            <dt>When should I use it?</dt>
            <dd>
              Use it for one-time verifications, trials, and newsletters. Do not use it for
              banking, crypto, or anything you need to keep.
            </dd>
          </div>
          <div>
            <dt>Is it private?</dt>
            <dd>
              Anyone with the address can receive the same mail. Treat it as public. Never
              send passwords, IDs, or personal documents here.
            </dd>
          </div>
          <div>
            <dt>How long does an inbox last?</dt>
            <dd>
              Messages are temporary and domains can change. Copy codes quickly, then
              discard the inbox when you are finished.
            </dd>
          </div>
        </dl>
      </section>

      <section className="pull">
        <p>Too many marketing emails. Keep the noise in a disposable inbox, not your real one.</p>
        <cite>- FlickMail</cite>
      </section>

    </>
  );
}
