export default function Layout({ onNavigate, menuOpen, setMenuOpen, children }) {
  const go = (next, section) => (event) => {
    event.preventDefault();
    setMenuOpen(false);
    onNavigate(next);
    if (section) {
      setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth" }), 60);
    }
  };

  return (
    <div>
      <header className="topbar">
        <nav className="nav">
          <a className="brand" href="#home" onClick={go("home")}>
            <span className="mark">F</span>
            FlickMail
          </a>
          <button
            className={menuOpen ? "mobile-toggle open" : "mobile-toggle"}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            <span />
            <span />
            <span />
          </button>
          <div className={menuOpen ? "nav-links open" : "nav-links"}>
            <a href="#home" onClick={go("home")}>Home</a>
            <a href="#articles" onClick={go("articles")}>Articles</a>
            <a href="#faq" onClick={go("home", "faq")}>FAQ</a>
            <a href="#about" onClick={go("home", "about")}>About Us</a>
            <a href="#privacy" onClick={go("privacy")}>Privacy</a>
            <a href="#terms" onClick={go("terms")}>Terms</a>
          </div>
        </nav>
      </header>
      {menuOpen && <div className="menu-overlay" onClick={() => setMenuOpen(false)} />}

      {children}

      <footer className="site-footer">
        <div className="footer-grid">
          <div>
            <a className="brand" href="#home" onClick={go("home")}>
              <span className="mark">F</span>
              FlickMail
            </a>
            <p>
              FlickMail is a free temporary email service. Use it to protect your real
              address from spam.
            </p>
          </div>
          <div>
            <h4>Help & Support</h4>
            <ul>
              <li><a href="#faq" onClick={go("home", "faq")}>FAQ</a></li>
              <li><a href="#articles" onClick={go("articles")}>Articles</a></li>
            </ul>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><a href="#home" onClick={go("home")}>Get inbox</a></li>
              <li><a href="#articles" onClick={go("articles")}>Guides</a></li>
            </ul>
          </div>
          <div>
            <h4>Legal</h4>
            <ul>
              <li><a href="#privacy" onClick={go("privacy")}>Privacy Policy</a></li>
              <li><a href="#terms" onClick={go("terms")}>Terms & Conditions</a></li>
            </ul>
          </div>
        </div>
        <p className="copy">© 2026 FlickMail. All rights reserved.</p>
      </footer>
    </div>
  );
}
