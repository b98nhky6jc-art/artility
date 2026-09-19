import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { authClient } from "./lib/auth-client";
import { useAdminAccess } from "./useModeratorAccess";

type NavIconName = "home" | "map" | "add" | "profile" | "artists" | "categories" | "review";

function NavIcon({ name }: { name: NavIconName }) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<NavIconName, ReactNode> = {
    home: <><path d="M3.5 10.5 12 3l8.5 7.5" /><path d="M5.5 9.5V21h13V9.5" /></>,
    map: <><path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z" /><circle cx="12" cy="10" r="2.2" /></>,
    add: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    profile: <><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6" /></>,
    artists: <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" /><path d="m18.5 16 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" /></>,
    categories: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    review: <path d="m5 12.5 4 4L19 6.5" />,
  };

  return <svg className="nav-icon" {...commonProps}>{paths[name]}</svg>;
}


export default function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const { isAdmin } = useAdminAccess(session?.user.id);

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
      className={`mobile-nav ${isAdmin ? "has-moderation" : ""}`}
      aria-label="Main navigation"
    >
      <button
        type="button"
        className={isHome ? "active" : ""}
        onClick={goHome}
      >
        <NavIcon name="home" />
        <span>Home</span>
      </button>

      <button
        type="button"
        onClick={goToMap}
      >
        <NavIcon name="map" />
        <span>Map</span>
      </button>

      <Link
        to={signedIn ? "/add-artwork" : "/login"}
        className={`add-nav ${isAdd ? "active" : ""}`}
      >
        <NavIcon name="add" />
        <span>Add</span>
      </Link>

      <Link
        to={signedIn ? "/my-finds" : "/login"}
        className={isAccount ? "active" : ""}
      >
        <NavIcon name="profile" />
        <span>{signedIn ? "Profile" : "Sign in"}</span>
      </Link>
      <Link
        to="/artists"
        className={location.pathname.startsWith("/artist") ? "active" : ""}
      >
        <NavIcon name="artists" />
        <span>Artists</span>
      </Link>

      <Link
        to="/categories"
        className={location.pathname.startsWith("/categories") ? "active" : ""}
      >
        <NavIcon name="categories" />
        <span>Categories</span>
      </Link>

      {isAdmin && (
        <Link
          to="/admin/moderation"
          className={isModeration ? "active" : ""}
          aria-label="Open moderation review queue"
        >
          <NavIcon name="review" />
          <span>Review</span>
        </Link>
      )}
    </nav>
  );
}
