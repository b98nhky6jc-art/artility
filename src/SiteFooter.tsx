import { Link } from "react-router";
import "./App.css";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav aria-label="Footer navigation">
        <Link to="/faq">FAQ</Link>
        <Link to="/privacy">Privacy policy</Link>
        <Link to="/copyright">Copyright</Link>
        <Link to="/places">Places</Link>
        <Link to="/tags">Tags</Link>
        <a
          href="https://chat.whatsapp.com/GA0tCNKFqsRKjSaNgodPVw"
          target="_blank"
          rel="noopener noreferrer"
          className="community-link"
          aria-label="Help shape Artility on WhatsApp (opens in a new tab)"
        >
          Help shape Artility on WhatsApp ↗
        </a>
      </nav>
      <p>© {new Date().getFullYear()} Artility</p>
    </footer>
  );
}
