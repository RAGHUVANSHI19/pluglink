import { useMutation } from "@tanstack/react-query";
import {
  BadgeCheck,
  CalendarCheck2,
  CreditCard,
  Home as HomeIcon,
  IndianRupee,
  MapPin,
  Search,
  ShieldCheck,
  Star,
  Zap,
} from "lucide-react";
import { type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, useAuth } from "../lib";
import { errorText } from "./catalog";
import { FrequentlyAsked } from "./FrequentlyAsked";

const driverSteps = [
  {
    icon: Search,
    title: "Find",
    text: "Search by locality or use your location. Compare connectors, charging power and rates.",
  },
  {
    icon: CalendarCheck2,
    title: "Book",
    text: "Choose a date, pick an open slot, and review the estimated electricity cost and convenience fee.",
  },
  {
    icon: Zap,
    title: "Charge",
    text: "Check your booking for arrival details and follow the host’s instructions when you plug in.",
  },
  {
    icon: CreditCard,
    title: "Pay",
    text: "Follow your booking’s payment instructions. Test and simulated checkout are clearly labeled.",
  },
  {
    icon: Star,
    title: "Review",
    text: "After a completed session, share feedback about the station and your charging experience.",
  },
];

const hostSteps = [
  {
    icon: HomeIcon,
    title: "Register",
    text: "Create a host account and add your charger, location, availability and rates.",
  },
  {
    icon: ShieldCheck,
    title: "Verify",
    text: "Submit station details and safety declarations for administrator review.",
  },
  {
    icon: MapPin,
    title: "List",
    text: "An approved, active station appears in charging search and can receive bookings.",
  },
  {
    icon: CalendarCheck2,
    title: "Host sessions",
    text: "Manage your calendar, welcome drivers and record completed sessions.",
  },
  {
    icon: IndianRupee,
    title: "Earn",
    text: "Review your completed-session earnings and keep track of the payout status.",
  },
];

function Journey({ steps }: { steps: typeof driverSteps }) {
  return (
    <ol className="pl-journey">
      {steps.map(({ icon: Icon, title, text }) => (
        <li key={title}>
          <span className="pl-step-icon">
            <Icon size={22} aria-hidden="true" />
          </span>
          <div>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function How() {
  return (
    <div className="pl-shell pl-content-page">
      <header className="pl-page-title">
        <h1>How PlugLink works</h1>
        <p>Book a charger nearby or share your own with local drivers.</p>
      </header>
      <div className="pl-content-grid">
        <section className="pl-panel">
          <h2>For EV owners</h2>
          <Journey steps={driverSteps} />
          <Link className="pl-btn pl-btn-primary" to="/chargers">
            Find Chargers
          </Link>
        </section>
        <section className="pl-panel">
          <h2>For charging hosts</h2>
          <Journey steps={hostSteps} />
          <Link className="pl-btn pl-btn-outline" to="/become-a-host">
            Become a Host
          </Link>
        </section>
      </div>
    </div>
  );
}

export function BecomeHost() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const switchAccount = useMutation({
    mutationFn: logout,
    onSuccess: () => navigate("/signup?role=HOST"),
  });
  return (
    <div className="pl-shell pl-content-page">
      <header className="pl-page-title pl-host-page-title">
        <div>
          <h1>Share your charger with local EV drivers</h1>
          <p>
            Use the hours your home charger sits idle. Set your rate, choose
            your availability, and track the sessions you host.
          </p>
          {user?.role === "HOST" ? (
            <Link className="pl-btn pl-btn-primary" to="/host">
              Open host dashboard
            </Link>
          ) : user ? (
            <button
              className="pl-btn pl-btn-primary"
              type="button"
              onClick={() => switchAccount.mutate()}
              disabled={switchAccount.isPending}
            >
              Sign out and create a host account
            </button>
          ) : (
            <Link className="pl-btn pl-btn-primary" to="/signup?role=HOST">
              Create a host account
            </Link>
          )}
          {switchAccount.isError && (
            <p className="pl-error" role="alert">
              {errorText(switchAccount.error)}
            </p>
          )}
        </div>
        <div className="pl-host-art" />
      </header>
      <div className="pl-content-grid">
        <section className="pl-panel">
          <h2>Start hosting</h2>
          <Journey steps={hostSteps} />
        </section>
        <section className="pl-panel">
          <h2>What you’ll need</h2>
          <ul className="pl-icon-list">
            <li>
              <BadgeCheck size={21} aria-hidden="true" />
              <div>
                <strong>Charger details</strong>
                <p>
                  Provide connector, power, photos, rates and the hours drivers
                  can book.
                </p>
              </div>
            </li>
            <li>
              <ShieldCheck size={21} aria-hidden="true" />
              <div>
                <strong>Safety declarations</strong>
                <p>
                  Confirm electrical safety, CCTV availability and acceptance of
                  host terms.
                </p>
              </div>
            </li>
            <li>
              <HomeIcon size={21} aria-hidden="true" />
              <div>
                <strong>Identity review</strong>
                <p>
                  Identity verification is required. Aadhaar-based checks must
                  use an authorized provider with consent where legally
                  permitted. The local workflow uses a labeled simulation.
                </p>
              </div>
            </li>
          </ul>
          <Link className="pl-btn pl-btn-outline" to="/legal/host">
            Read host guidelines
          </Link>
        </section>
      </div>
    </div>
  );
}

export function About() {
  return (
    <div className="pl-shell pl-content-page">
      <header className="pl-page-title">
        <h1>About PlugLink</h1>
        <p>
          A community charging marketplace for EV drivers and residential
          charging hosts.
        </p>
      </header>
      <section className="pl-about-banner">
        <h2>More places to charge, starting in Jaipur</h2>
        <p>
          Public chargers are often concentrated along major routes and
          commercial areas. PlugLink gives drivers an additional way to find
          compatible charging closer to where they live, work, and visit.
        </p>
      </section>
      <div className="pl-content-grid">
        <section className="pl-panel">
          <h2>Use the chargers we already have</h2>
          <p>
            Home chargers often sit idle between trips. A host can share that
            capacity during selected hours, while keeping control of the
            schedule, rate and access to their property.
          </p>
        </section>
        <section className="pl-panel">
          <h2>Make charging easier to plan</h2>
          <p>
            Drivers can check compatibility, see a price estimate and reserve a
            scheduled time. A predictable local charging option can make daily
            EV use more practical.
          </p>
        </section>
      </div>
      <Link className="pl-btn pl-btn-primary" to="/chargers">
        Explore charging stations
      </Link>
    </div>
  );
}

export function Faq() {
  return (
    <div className="pl-shell pl-content-page pl-narrow">
      <header className="pl-page-title">
        <h1>Frequently asked questions</h1>
        <p>Charging, reservations, and hosting on PlugLink.</p>
      </header>
      <FrequentlyAsked />
      <Link className="pl-btn pl-btn-outline" to="/support">
        Contact support
      </Link>
    </div>
  );
}

export function Support() {
  const send = useMutation({
    mutationFn: (data: Record<string, string>) =>
      api("/support", { method: "POST", body: JSON.stringify(data) }),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(
      Array.from(new FormData(form), ([key, value]) => [
        key,
        String(value).trim(),
      ]),
    );
    send.mutate(fields, { onSuccess: () => form.reset() });
  }

  return (
    <div className="pl-shell pl-content-page pl-narrow">
      <header className="pl-page-title">
        <h1>Contact &amp; Support</h1>
        <p>
          Have a question about a charger, booking, or your account? Send us the
          details.
        </p>
      </header>
      <form className="pl-panel pl-support-form" onSubmit={submit}>
        <div className="pl-form-two">
          <label>
            Name
            <input
              name="name"
              autoComplete="name"
              minLength={2}
              maxLength={100}
              required
            />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
        </div>
        <label>
          Subject
          <input name="subject" minLength={3} maxLength={160} required />
        </label>
        <label>
          Message
          <textarea
            name="message"
            rows={6}
            minLength={10}
            maxLength={3000}
            required
          />
        </label>
        {send.isSuccess && (
          <p className="pl-success" role="status">
            Your support request was received.
          </p>
        )}
        {send.isError && (
          <p className="pl-error" role="alert">
            {errorText(send.error, "Your message could not be submitted.")}
          </p>
        )}
        <button
          className="pl-btn pl-btn-primary"
          type="submit"
          disabled={send.isPending}
        >
          {send.isPending ? "Submitting…" : "Send message"}
        </button>
      </form>
    </div>
  );
}

const policies = {
  privacy: {
    title: "Privacy Policy",
    sections: [
      [
        "Account and booking information",
        "PlugLink uses account contact details to manage access, reservations, support and in-app notifications. Session cookies keep users signed in.",
      ],
      [
        "Station locations",
        "A station’s locality and approximate coordinates appear in search. Eligibility to view private arrival instructions depends on the booking status and role.",
      ],
      [
        "External services",
        "When you open a map, your browser requests map tiles from OpenStreetMap. If you share your location, PlugLink uses it to calculate distances to stations. Optional checkout services process payment information directly.",
      ],
      [
        "Privacy requests",
        "Use Contact & Support to request access to or correction of your account information.",
      ],
    ],
  },
  terms: {
    title: "Terms and Conditions",
    sections: [
      [
        "Accounts and role responsibilities",
        "Use accurate account information and keep access credentials private. Hosts are responsible for providing accurate station information and operating instructions.",
      ],
      [
        "Reservations and costs",
        "Drivers should use the reserved slot and follow the host’s arrival instructions. Booking estimates include the listed rate and convenience fee. Applicable cancellation options appear in My Bookings.",
      ],
      [
        "Demo content",
        "Fictional listings, sample reviews, and simulated or test payments are identified in the application.",
      ],
    ],
  },
  host: {
    title: "Host Guidelines",
    sections: [
      [
        "Prepare the charging area",
        "List only equipment you have permission to operate. Keep the parking and charging area clear and maintain the charger according to manufacturer instructions.",
      ],
      [
        "Declare safety and CCTV",
        "Submit accurate electrical safety and CCTV declarations for administrator review. Provide requested compliance information through the controlled host workflow.",
      ],
      [
        "Keep the schedule current",
        "Block unavailable times and update your listing when equipment, access or hours change. Tell affected drivers about arrival changes through the application’s support channel.",
      ],
    ],
  },
  safety: {
    title: "Safety Guidelines",
    sections: [
      [
        "Before connecting",
        "Check the connector type and your vehicle instructions. Inspect the charging cable and connector for damage. Ask the host about the parking area and safe access.",
      ],
      [
        "During charging",
        "Keep the cable clear of traffic and away from standing water. If equipment shows excessive heat, damage, smoke or an unusual smell, stop charging if safe and leave the area.",
      ],
      [
        "Report a problem",
        "Contact PlugLink support with the reservation ID and relevant details. For an immediate threat to life or property, contact emergency services.",
      ],
    ],
  },
};

const aliases: Record<string, keyof typeof policies> = {
  privacy: "privacy",
  "privacy-policy": "privacy",
  terms: "terms",
  "terms-and-conditions": "terms",
  host: "host",
  "host-guidelines": "host",
  safety: "safety",
  "safety-guidelines": "safety",
};

export function Legal() {
  const { topic = "" } = useParams();
  const policy = policies[aliases[topic]];
  return (
    <div className="pl-shell pl-content-page pl-narrow">
      <header className="pl-page-title">
        <h1>{policy?.title ?? "PlugLink policies"}</h1>
        <p className="pl-draft-notice">
          Draft policy. Legal review is required before public launch.
        </p>
      </header>
      {policy && (
        <article className="pl-panel pl-policy">
          {policy.sections.map(([heading, text]) => (
            <section key={heading}>
              <h2>{heading}</h2>
              <p>{text}</p>
            </section>
          ))}
        </article>
      )}
      <nav className="pl-policy-nav" aria-label="Legal policies">
        {Object.entries(policies).map(([key, item]) => (
          <Link
            key={key}
            to={`/legal/${key}`}
            aria-current={item === policy ? "page" : undefined}
          >
            {item.title}
          </Link>
        ))}
      </nav>
    </div>
  );
}
