import { lazy, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, Link } from "react-router-dom";
import { AppLayout } from "./layout";
import { useAuth, roleHome, type Role } from "./lib";

const Home = lazy(() =>
  import("./public/Home").then((module) => ({ default: module.Home })),
);
const Discover = lazy(() =>
  import("./public/Discover").then((module) => ({ default: module.Discover })),
);
const Station = lazy(() =>
  import("./public/Station").then((module) => ({ default: module.Station })),
);
const How = lazy(() =>
  import("./public/Content").then((module) => ({ default: module.How })),
);
const About = lazy(() =>
  import("./public/Content").then((module) => ({ default: module.About })),
);
const BecomeHost = lazy(() =>
  import("./public/Content").then((module) => ({ default: module.BecomeHost })),
);
const Support = lazy(() =>
  import("./public/Content").then((module) => ({ default: module.Support })),
);
const Faq = lazy(() =>
  import("./public/Content").then((module) => ({ default: module.Faq })),
);
const Legal = lazy(() =>
  import("./public/Content").then((module) => ({ default: module.Legal })),
);
const Owner = lazy(() =>
  import("./dashboard/owner").then((module) => ({ default: module.Owner })),
);
const Bookings = lazy(() =>
  import("./dashboard/owner").then((module) => ({ default: module.Bookings })),
);
const Host = lazy(() =>
  import("./dashboard/host").then((module) => ({ default: module.Host })),
);
const Admin = lazy(() =>
  import("./dashboard/admin").then((module) => ({ default: module.Admin })),
);
const Account = lazy(() =>
  import("./account").then((module) => ({ default: module.Account })),
);
const Profile = lazy(() =>
  import("./account").then((module) => ({ default: module.Profile })),
);
const Notifications = lazy(() =>
  import("./account").then((module) => ({ default: module.Notifications })),
);

function State({ children }: { children: ReactNode }) {
  return (
    <section className="site-state" aria-live="polite">
      {children}
    </section>
  );
}

function Gate({ role, children }: { role?: Role; children: ReactNode }) {
  const { user, loading, error, refresh } = useAuth();
  const location = useLocation();
  if (loading) return <State>Loading your account…</State>;
  if (error)
    return (
      <State>
        <h1>Couldn’t load your account</h1>
        <p>{error.message}</p>
        <button
          type="button"
          className="site-button"
          onClick={() => void refresh()}
        >
          Try again
        </button>
      </State>
    );
  if (!user)
    return (
      <Navigate
        to={
          "/login?next=" +
          encodeURIComponent(location.pathname + location.search)
        }
        replace
      />
    );
  if (role && user.role !== role)
    return (
      <State>
        <h1>Access restricted</h1>
        <p>This page requires a different account role.</p>
        <Link className="site-button" to={roleHome(user.role)}>
          Go to your dashboard
        </Link>
      </State>
    );
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Home />} />
        <Route path="chargers" element={<Discover />} />
        <Route path="chargers/:id" element={<Station />} />
        <Route path="how-it-works" element={<How />} />
        <Route path="become-a-host" element={<BecomeHost />} />
        <Route path="about" element={<About />} />
        <Route path="support" element={<Support />} />
        <Route path="faq" element={<Faq />} />
        <Route path="legal/:topic" element={<Legal />} />
        <Route path="login" element={<Account mode="login" />} />
        <Route path="signup" element={<Account mode="signup" />} />
        <Route path="forgot-password" element={<Account mode="forgot" />} />
        <Route path="reset-password" element={<Account mode="reset" />} />
        <Route
          path="owner"
          element={
            <Gate role="OWNER">
              <Owner />
            </Gate>
          }
        />
        <Route
          path="owner/bookings"
          element={
            <Gate role="OWNER">
              <Bookings />
            </Gate>
          }
        />
        <Route
          path="host"
          element={
            <Gate role="HOST">
              <Host />
            </Gate>
          }
        />
        <Route
          path="admin"
          element={
            <Gate role="ADMIN">
              <Admin />
            </Gate>
          }
        />
        <Route
          path="profile"
          element={
            <Gate>
              <Profile />
            </Gate>
          }
        />
        <Route
          path="notifications"
          element={
            <Gate>
              <Notifications />
            </Gate>
          }
        />
        <Route
          path="*"
          element={
            <State>
              <h1>That page couldn’t be found</h1>
              <Link className="site-button" to="/">
                Go home
              </Link>
            </State>
          }
        />
      </Route>
    </Routes>
  );
}
