import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import "./App.css";
import { authClient } from "./lib/auth-client";
import { useAdminAccess } from "./useModeratorAccess";

function scrollToNearby(behavior: ScrollBehavior = "smooth") {
  document.getElementById("nearby")?.scrollIntoView({
    behavior,
    block: "start",
  });
}

export default function SiteHeader() {
  const location = useLocation();
  const { data: session } = authClient.useSession();
  const { isAdmin } = useAdminAccess(session?.user.id);

  useEffect(() => {
    if (location.pathname !== "/" || location.hash !== "#nearby") {
      return;
    }

    const nearby = document.getElementById("nearby");

    if (!nearby) {
      return;
    }

    const initialScroll = window.setTimeout(scrollToNearby, 0);
    const layoutObserver = new ResizeObserver(() => {
      if (Math.abs(nearby.getBoundingClientRect().top) > 1) {
        scrollToNearby("auto");
      }
    });
    const stopObserving = window.setTimeout(
      () => layoutObserver.disconnect(),
      2000,
    );

    layoutObserver.observe(document.body);

    return () => {
      window.clearTimeout(initialScroll);
      window.clearTimeout(stopObserving);
      layoutObserver.disconnect();
    };
  }, [location.hash, location.pathname]);

  const isArtists = location.pathname.startsWith("/artist");
  const isExplore = location.pathname === "/";
  const isContact = location.pathname === "/contact";
  const isAddArtwork = location.pathname === "/add-artwork";
  const isModeration = location.pathname.startsWith("/admin/moderation");
  const isAccount =
    location.pathname === "/my-finds" ||
    location.pathname === "/login" ||
    location.pathname === "/signup" ||
    location.pathname === "/verify-email";

  return (
    <header className="topbar">
      <Link to="/" className="brand-lockup">
        <span className="eyebrow">ART HIDING IN PLAIN SIGHT</span>
        <div className="brand-row">
          <span className="brand-name">Artility</span>
          <span className="beta-badge">BETA</span>
        </div>
      </Link>

      <nav className="desktop-nav" aria-label="Primary navigation">
        <Link
          to="/#nearby"
          className="nav-link"
          aria-current={isExplore ? "page" : undefined}
          onClick={() => window.setTimeout(scrollToNearby, 0)}
        >
          Explore
        </Link>

        <Link
          to="/artists"
          className="nav-link"
          aria-current={isArtists ? "page" : undefined}
        >
          Artists
        </Link>

        <Link
          to="/contact"
          className="nav-link"
          aria-current={isContact ? "page" : undefined}
        >
          Contact
        </Link>

        <Link
          to="/add-artwork"
          className="nav-link"
          aria-current={isAddArtwork ? "page" : undefined}
        >
          Add artwork
        </Link>

        {isAdmin && (
          <Link
            to="/admin/moderation"
            className="nav-link moderation-nav-link"
            aria-current={isModeration ? "page" : undefined}
          >
            Review
          </Link>
        )}

        {session?.user ? (
          <Link
            to="/my-finds"
            className="profile-button"
            aria-label="My finds"
            aria-current={isAccount ? "page" : undefined}
          >
            {session.user.name
              ? session.user.name.charAt(0).toUpperCase()
              : "◎"}
          </Link>
        ) : (
          <Link
            to="/login"
            className="profile-button"
            aria-label="Sign in"
            aria-current={isAccount ? "page" : undefined}
          >
            ◎
          </Link>
        )}
      </nav>
    </header>
  );
}
