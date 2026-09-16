export const ARTICLES = [
  {
    slug: "gmail-app-password",
    title: "How to connect Gmail and read OTP mail in FlickMail",
    date: "September 16, 2026",
    excerpt: "Create an App Password once, then use name+tag@gmail.com aliases and read the code right here.",
    steps: [
      "Open your Google Account security page and turn on 2-Step Verification. App Passwords only work when 2-Step Verification is enabled.",
      "Go to myaccount.google.com/apppasswords, type a name like FlickMail, and click Create.",
      "Copy the 16-character App Password Google shows. This is not your normal Gmail password.",
      "In the Gmail OTP inbox box above, enter your real Gmail address and paste the App Password, then click Connect Gmail inbox.",
      "Pick an alias tag (for example shop or otp) and choose a style: name+tag@gmail.com, na.me@gmail.com, or na.me+tag@gmail.com.",
      "Use the alias shown when a site asks for your email. The message lands in your real Gmail and appears in the inbox below.",
      "FlickMail detects the verification code in the mail and shows an OTP badge — tap Copy code and paste it into the site.",
      "Your App Password is never saved in the browser. The server keeps it encrypted so a restart does not log you out, and you can discard the Gmail inbox to remove it any time.",
    ],
    body: [
      "All aliases belong to the same Gmail account. Anything sent to name+tag@gmail.com or na.me@gmail.com still arrives in your normal inbox — FlickMail just filters it so you only see mail for the alias you picked.",
      "If a site refuses the +tag style, switch the style to dots (na.me@gmail.com). Some sites strip or block plus signs, while dots are almost always accepted.",
      "Never share your App Password with anyone. You can remove it any time from the same Google App Passwords page.",
    ],
  },
  {
    slug: "what-is-temp-email",
    title: "What is a temporary email address?",
    date: "September 8, 2026",
    excerpt: "A disposable inbox lets you receive mail without handing over your real address.",
    body: [
      "A temporary email is a throwaway address you can use for one-time signups, trials, and newsletters. You still get the message. Your personal inbox stays clean.",
      "Use it when a website asks for an email and you do not want follow-up marketing. Copy the address, complete the signup, then read the verification mail in FlickMail.",
      "Do not use a temp inbox for banking, recovery codes you need to keep, or anything private. Anyone with the address can receive the same mail.",
    ],
  },
  {
    slug: "keep-spam-out",
    title: "How to keep spam out of your real inbox",
    date: "September 4, 2026",
    excerpt: "Give merchants and random apps a disposable address instead of your daily email.",
    body: [
      "Most spam starts with a form. A store, a contest, a free PDF — they ask for email, then sell or reuse the list.",
      "Generate a FlickMail address first. Use that for the form. If a code arrives, open it here. If junk arrives later, discard the inbox.",
      "Keep your real email for people and services you actually trust: work, banking, friends, and accounts you use every day.",
    ],
  },
  {
    slug: "safe-use",
    title: "When not to use disposable email",
    date: "August 28, 2026",
    excerpt: "Temp mail is handy, but it is public and short-lived. Know the limits.",
    body: [
      "Temporary inboxes are not private mailboxes. Treat every message as public.",
      "Never use FlickMail for passwords, government IDs, medical records, crypto wallets, or money transfers.",
      "If you need the message later, it may already be gone. Copy what you need immediately, then throw the inbox away.",
    ],
  },
];

export function PrivacyPage() {
  return (
    <main className="page">
      <p className="kicker">Legal</p>
      <h1>Privacy Policy</h1>
      <p className="lede">Last updated September 10, 2026.</p>
      <section>
        <h2>What this service is</h2>
        <p>
          FlickMail provides disposable email addresses so you can receive one-time
          messages without using your personal inbox. Addresses and messages are
          temporary and should be treated as public.
        </p>
      </section>
      <section>
        <h2>What we store in your browser</h2>
        <p>
          Your current inbox session (address, token, and starred message ids) is saved
          in local storage on your device so the page can reload mail. Clearing site
          data or discarding the inbox removes that information from the browser.
        </p>
        <p>
          Your Gmail App Password is never written to browser storage. It is sent once
          to the server, kept encrypted at rest, and only used to read mail for the
          alias you selected. Discarding the Gmail inbox removes it immediately.
        </p>
      </section>
      <section>
        <h2>Mail content</h2>
        <p>
          Incoming mail is fetched from a public temporary-mail network. FlickMail does
          not ask for your name, phone number, or real email. Do not send private
          documents or passwords to a disposable address.
        </p>
      </section>
      <section>
        <h2>Cookies and tracking</h2>
        <p>
          This site does not use advertising cookies. Standard server logs may record
          technical data such as time of request. We do not sell personal information.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Questions about this policy can be sent through the contact details on the
          About section of the home page. Do not include private account credentials.
        </p>
      </section>
    </main>
  );
}

export function TermsPage() {
  return (
    <main className="page">
      <p className="kicker">Legal</p>
      <h1>Terms & Conditions</h1>
      <p className="lede">Last updated September 10, 2026.</p>
      <section>
        <h2>Acceptance</h2>
        <p>
          By generating or using a FlickMail inbox you agree to these terms. If you do
          not agree, do not use the service.
        </p>
      </section>
      <section>
        <h2>Personal use only</h2>
        <p>
          FlickMail is for personal, lawful use: one-time signups, tests, and keeping
          spam away from a real inbox. Automated abuse, bulk registration, phishing,
          fraud, and any illegal activity are forbidden.
        </p>
      </section>
      <section>
        <h2>No privacy guarantee</h2>
        <p>
          Disposable addresses are not confidential. Anyone who knows the address may
          receive the same mail. Never use this service for banking, identity documents,
          medical data, or anything you must keep secret.
        </p>
      </section>
      <section>
        <h2>Availability</h2>
        <p>
          Inboxes, domains, and messages can disappear without notice. We do not
          guarantee delivery, storage, or uptime. Copy verification codes immediately.
        </p>
      </section>
      <section>
        <h2>Limitation of liability</h2>
        <p>
          The service is provided as is, without warranties. FlickMail is not liable
          for lost messages, leaked mail, or damages from misuse of a temporary address.
        </p>
      </section>
    </main>
  );
}

export function ArticlesPage({ onOpen }) {
  return (
    <main className="page">
      <p className="kicker">Guides</p>
      <h1>Articles</h1>
      <p className="lede">Short notes on using disposable email the right way.</p>
      <div className="article-list">
        {ARTICLES.map((item) => (
          <a
            key={item.slug}
            className="article-card"
            href={`#article/${item.slug}`}
            onClick={(event) => {
              event.preventDefault();
              onOpen(item.slug);
            }}
          >
            <div className="hint">{item.date}</div>
            <h2>{item.title}</h2>
            <p>{item.excerpt}</p>
            <span className="read-more">Read article</span>
          </a>
        ))}
      </div>
    </main>
  );
}

export function ArticlePage({ slug, onBack }) {
  const article = ARTICLES.find((item) => item.slug === slug);
  if (!article) {
    return (
      <main className="page">
        <h1>Article not found</h1>
        <p className="lede">That guide is no longer available.</p>
        <button className="chip" onClick={onBack}>Back to articles</button>
      </main>
    );
  }

  return (
    <main className="page">
      <button className="chip" onClick={onBack}>All articles</button>
      <p className="kicker">{article.date}</p>
      <h1>{article.title}</h1>
      {article.steps && (
        <ol className="steps">
          {article.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      {article.body.map((para) => (
        <p key={para}>{para}</p>
      ))}
    </main>
  );
}
