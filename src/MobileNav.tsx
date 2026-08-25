import { Link, useLocation, useNavigate } from "react-router";
import { authClient } from "./lib/auth-client";
import { useModeratorAccess } from "./useModeratorAccess";

export default function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const { isModerator } = useModeratorAccess(session?.user.id);

  const signedIn = Boolean(session?.user);

  const isHome = location.pathname === "/";
  const isAdd = location.pathname === "/add-artwork";
  const isModeration = location.pathname.startsWith("/admin/moderation");

  const isAccount =
    location.pathname === "/my-finds" ||
    location.pathname === "/login" ||
    location.pathname === "/signup";

  if (
    location.pathname === "/login" ||
    location.pathname === "/signup"
  ) {
    return null;
  }

  function goHome() {
    if (location.pathname !== "/") {
      navigate("/");

      window.setTimeout(() => {
        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      }, 100);

      return;
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function goToMap() {
    if (location.pathname !== "/") {
      navigate("/");

      window.setTimeout(() => {
        document
          .getElementById("home-map")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
      }, 100);

      return;
    }

    document
      .getElementById("home-map")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
  }

  return (
    <nav
      className={`mobile-nav ${isModerator ? "has-moderation" : ""}`}
      aria-label="Main navigation"
    >
      <button
        type="button"
        className={isHome ? "active" : ""}
        onClick={goHome}
      >
        <span className="nav-icon">⌂</span>
        <span>Home</span>
      </button>

      <button
        type="button"
        onClick={goToMap}
      >
        <span className="nav-icon">◇</span>
        <span>Map</span>
      </button>

      <Link
        to={signedIn ? "/add-artwork" : "/login"}
        className={`add-nav ${isAdd ? "active" : ""}`}
      >
        <span className="nav-icon">＋</span>
        <span>Add</span>
      </Link>

      <Link
        to={signedIn ? "/my-finds" : "/login"}
        className={isAccount ? "active" : ""}
      >
        <span className="nav-icon">◎</span>
        <span>{signedIn ? "Profile" : "Sign in"}</span>
      </Link>
      <Link
        to="/artists"
        className={location.pathname.startsWith("/artist") ? "active" : ""}
      >
        <span className="nav-icon">✦</span>
        <span>Artists</span>
      </Link>

      {isModerator && (
        <Link
          to="/admin/moderation"
          className={isModeration ? "active" : ""}
        >
          <span className="nav-icon">✓</span>
          <span>Review</span>
        </Link>
      )}
    </nav>
  );
}
