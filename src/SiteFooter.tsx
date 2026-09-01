import { Link } from "react-router";
import "./App.css";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav aria-label="Footer navigation">
        <Link to="/faq">FAQ</Link>
        <Link to="/privacy">Privacy policy</Link>
        <Link to="/copyright">Copyright</Link>
      </nav>
      <p>© {new Date().getFullYear()} Artility</p>
    </footer>
  );
}
