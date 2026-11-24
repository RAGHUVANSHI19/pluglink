import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck2,
  CircleCheck,
  IndianRupee,
  MapPin,
  Search,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib";
import { type ChargingStation } from "./catalog";
import { FrequentlyAsked } from "./FrequentlyAsked";
import { StationCard, StationLoading } from "./StationCard";

const steps = [
  {
    icon: Search,
    heading: "Find a charger",
    text: "Browse local stations, compare charging speeds and find a connector for your EV.",
  },
  {
    icon: CalendarCheck2,
    heading: "Book your slot",
    text: "Pick a time that works for you and see the estimated cost before you reserve.",
  },
  {
    icon: Zap,
    heading: "Plug in and charge",
    text: "Arrive at your reserved time, plug in, and get back on the road with a charge.",
  },
];

export function Home() {
  const navigate = useNavigate();
  const [location, setLocation] = useState("");
  const featured = useQuery({
    queryKey: ["stations", "featured"],
    queryFn: ({ signal }) =>
      api<{ stations: ChargingStation[] }>(
        "/stations?q=Jaipur&sort=rating&limit=3",
        { signal },
      ),
  });

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = location.trim();
    navigate(value ? `/chargers?q=${encodeURIComponent(value)}` : "/chargers");
  }

  return (
    <div className="pl-home">
      <section className="pl-hero" aria-labelledby="pluglink-hero-title">
        <div className="pl-hero-art" />
        <div className="pl-hero-content">
          <p className="pl-hero-location">
            <span /> Jaipur, Rajasthan
          </p>
          <h1 id="pluglink-hero-title">
            Charge Smarter. <br />
            <em>Drive Further.</em>
          </h1>
          <p className="pl-hero-description">
            Discover convenient and affordable EV charging near you. Connect
            with trusted homeowners, reserve charging slots, and keep moving
            with PlugLink.
          </p>
          <form className="pl-hero-search" onSubmit={search}>
            <MapPin size={21} aria-hidden="true" />
            <label className="pl-visually-hidden" htmlFor="pl-home-location">
              City, locality, or station name
            </label>
            <input
              id="pl-home-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Enter city or locality"
            />
            <button className="pl-btn pl-btn-primary" type="submit">
              <Search size={17} aria-hidden="true" /> Find Chargers
            </button>
          </form>
          <Link className="pl-hero-host" to="/become-a-host">
            Become a Host
          </Link>
        </div>
      </section>

      <div className="pl-trust-strip" aria-label="Charging features">
        <span>
          <ShieldCheck size={20} aria-hidden="true" /> Approval-reviewed
          listings
        </span>
        <span>
          <IndianRupee size={19} aria-hidden="true" /> Upfront pricing
        </span>
        <span>
          <CalendarCheck2 size={20} aria-hidden="true" /> Book a time that suits
          you
        </span>
      </div>

      <section
        className="pl-section pl-shell"
        aria-labelledby="pl-featured-title"
      >
        <header className="pl-section-heading">
          <div>
            <h2 id="pl-featured-title">Featured chargers in Jaipur</h2>
            <p>Explore residential charging options across the city.</p>
          </div>
          <Link className="pl-btn pl-btn-outline" to="/chargers">
            View all chargers
          </Link>
        </header>
        {featured.isPending && <StationLoading />}
        {featured.isError && (
          <div className="pl-state" role="status">
            Featured chargers are temporarily unavailable.{" "}
            <button
              type="button"
              className="pl-inline-button"
              onClick={() => void featured.refetch()}
            >
              Try again
            </button>
          </div>
        )}
        {featured.isSuccess &&
          (featured.data.stations.length ? (
            <div className="pl-station-grid">
              {featured.data.stations.map((station) => (
                <StationCard key={station.id} station={station} />
              ))}
            </div>
          ) : (
            <p className="pl-state">
              There are no listed chargers in Jaipur yet.
            </p>
          ))}
      </section>

      <section className="pl-how-band">
        <div className="pl-section pl-shell">
          <header className="pl-section-heading pl-center">
            <div>
              <h2>How PlugLink works</h2>
              <p>Reserve a residential charger before you head out.</p>
            </div>
          </header>
          <div className="pl-steps">
            {steps.map(({ icon: Icon, heading, text }) => (
              <article key={heading}>
                <span className="pl-step-icon">
                  <Icon size={25} aria-hidden="true" />
                </span>
                <h3>{heading}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <div className="pl-centered-action">
            <Link className="pl-btn pl-btn-outline" to="/how-it-works">
              See how it works
            </Link>
          </div>
        </div>
      </section>

      <section className="pl-section pl-shell pl-host-teaser">
        <div
          className="pl-host-art"
          role="img"
          aria-label="Illustration of a residential EV charging setup"
        />
        <div className="pl-host-copy">
          <h2>Put your home charger to work</h2>
          <p>
            Share your charger when you have time to spare. You set the schedule
            and price, and PlugLink helps local drivers find and book your
            station.
          </p>
          <ul>
            <li>
              <CircleCheck size={19} aria-hidden="true" /> Choose when your
              station is available
            </li>
            <li>
              <CircleCheck size={19} aria-hidden="true" /> Track reservations
              and completed-session earnings
            </li>
            <li>
              <CircleCheck size={19} aria-hidden="true" /> Help more drivers
              charge close to home
            </li>
          </ul>
          <Link to="/become-a-host" className="pl-btn pl-btn-primary">
            Become a Host
          </Link>
        </div>
      </section>

      <section className="pl-safety-band">
        <div className="pl-shell pl-safety-content">
          <span className="pl-step-icon">
            <ShieldCheck size={27} aria-hidden="true" />
          </span>
          <div>
            <h2>Know what to expect before you arrive</h2>
            <p>
              Review the connector, operating hours, pricing and station
              guidelines before booking. Hosts submit electrical safety and CCTV
              declarations for platform review.
            </p>
          </div>
          <Link to="/legal/safety" className="pl-btn pl-btn-outline">
            Read safety guidelines
          </Link>
        </div>
      </section>

      <section className="pl-section pl-shell pl-home-faq">
        <header className="pl-section-heading">
          <div>
            <h2>Frequently asked questions</h2>
            <p>Find answers before your first charging session.</p>
          </div>
          <Link className="pl-btn pl-btn-outline" to="/faq">
            View all questions
          </Link>
        </header>
        <FrequentlyAsked limit={4} />
      </section>
    </div>
  );
}
