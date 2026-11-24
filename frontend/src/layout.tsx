import { Suspense, useEffect, useState } from "react";
import { Bell, Menu, X, Zap } from "lucide-react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { errorMessage, roleHome, useAuth } from "./lib";

const navigation = [
  ["Home", "/"],
  ["Find Chargers", "/chargers"],
  ["How It Works", "/how-it-works"],
  ["Become a Host", "/become-a-host"],
  ["About Us", "/about"],
];

export function Brand({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/"
      className={"site-brand " + className}
      aria-label="PlugLink home"
    >
      <span className="site-brand-icon">
        <Zap aria-hidden="true" size={19} strokeWidth={2.65} />
      </span>
      <span>
        Plug<span className="site-brand-accent">Link</span>
      </span>
    </Link>
  );
}

function Header() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const open = openedAt === location.key;
  async function signOut() {
    setError("");
    try {
      await logout();
      setOpenedAt(null);
      navigate("/");
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }
  function closeMenu() {
    setOpenedAt(null);
  }
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Brand />
        <button
          className="site-menu-toggle"
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="site-navigation"
          onClick={() => setOpenedAt(open ? null : location.key)}
        >
          {open ? (
            <X size={24} aria-hidden="true" />
          ) : (
            <Menu size={25} aria-hidden="true" />
          )}
        </button>
        <div
          id="site-navigation"
          className={"site-header-navigation" + (open ? " is-open" : "")}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeMenu();
          }}
        >
          <nav className="site-nav" aria-label="Main navigation">
            {navigation.map(([label, to]) => (
              <NavLink key={to} to={to} end={to === "/"} onClick={closeMenu}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="site-account">
            {user ? (
              <>
                <Link
                  className="site-icon-button"
                  to="/notifications"
                  aria-label="Notifications"
                  onClick={closeMenu}
                >
                  <Bell size={19} aria-hidden="true" />
                </Link>
                <Link className="site-login" to="/profile" onClick={closeMenu}>
                  Profile
                </Link>
                <Link
                  className="site-button site-button-small"
                  to={roleHome(user.role)}
                  onClick={closeMenu}
                >
                  Dashboard
                </Link>
                <button className="site-logout" type="button" onClick={signOut}>
                  Log out
                </button>
              </>
            ) : (
              !loading && (
                <>
                  <Link className="site-login" to="/login" onClick={closeMenu}>
                    Log In
                  </Link>
                  <Link
                    className="site-button site-button-small"
                    to="/signup"
                    onClick={closeMenu}
                  >
                    Sign Up
                  </Link>
                </>
              )
            )}
          </div>
        </div>
      </div>
      {error && (
        <p className="site-header-error" role="alert">
          {error}
        </p>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-columns">
          <div className="site-footer-intro">
            <Brand />
            <p>Community-powered EV charging for the places you already go.</p>
          </div>
          <nav aria-label="Explore">
            <h2>Explore</h2>
            <Link to="/chargers">Find Chargers</Link>
            <Link to="/how-it-works">How It Works</Link>
            <Link to="/become-a-host">Become a Host</Link>
            <Link to="/about">About Us</Link>
          </nav>
          <nav aria-label="Help">
            <h2>Help</h2>
            <Link to="/support">Contact &amp; Support</Link>
            <Link to="/faq">Frequently Asked Questions</Link>
            <Link to="/legal/safety">Safety Guidelines</Link>
          </nav>
          <nav aria-label="Policies">
            <h2>Policies</h2>
            <Link to="/legal/privacy">Privacy Policy</Link>
            <Link to="/legal/terms">Terms and Conditions</Link>
            <Link to="/legal/host">Host Guidelines</Link>
          </nav>
        </div>
        <div className="site-footer-base">
          <span>© {new Date().getFullYear()} PlugLink</span>
          <span>Built for EV communities in India</span>
        </div>
      </div>
    </footer>
  );
}

export function AppLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <>
      <a className="site-skip" href="#main-content">
        Skip to content
      </a>
      <Header />
      <main id="main-content">
        <Suspense
          fallback={
            <section className="site-state" role="status">
              <span className="site-spinner" aria-hidden="true" />
              Loading PlugLink…
            </section>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
