import { Link, NavLink } from "react-router-dom";
import { ExternalLink, Sparkles } from "lucide-react";
import "../pages/PublicPages.css";

const navClassName = ({ isActive }) =>
  `public-nav-link${isActive ? " public-nav-link-active" : ""}`;

export default function PublicSiteLayout({ children, immersive = false }) {
  return (
    <div className={`public-site${immersive ? " public-site-immersive" : ""}`}>
      {!immersive && <header className="public-header">
        <div className="public-header-inner">
          <Link className="public-brand" to="/landing" aria-label="Byizon AI home">
            <span className="public-brand-mark" aria-hidden="true">
              <Sparkles size={18} />
            </span>
            <span>Byizon AI</span>
          </Link>

          <nav className="public-nav" aria-label="Public navigation">
            <NavLink className={navClassName} to="/landing">
              Product
            </NavLink>
            <NavLink className={navClassName} to="/privacy">
              Privacy
            </NavLink>
            <NavLink className={navClassName} to="/terms">
              Terms
            </NavLink>
          </nav>

          <Link className="public-workspace-link" to="/">
            Open workspace
            <ExternalLink size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>}

      <main>{children}</main>

      {!immersive && <footer className="public-footer">
        <div className="public-footer-inner">
          <div>
            <div className="public-footer-brand">Byizon AI</div>
            <p>AI-assisted analytics and connected business workflows.</p>
          </div>
          <div className="public-footer-links">
            <Link to="/landing">Product</Link>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
            <a href="mailto:ronakagarwal9772@gmail.com">Contact</a>
          </div>
          <p className="public-copyright">
            © 2026 Byizon AI. All rights reserved.
          </p>
        </div>
      </footer>}
    </div>
  );
}
