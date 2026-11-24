import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Bell,
  Check,
  ChevronLeft,
  CircleUserRound,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  api,
  dateTime,
  errorMessage,
  roleHome,
  useAuth,
  type User,
} from "./lib";

type Mode = "login" | "signup" | "forgot" | "reset";
type AuthInput = {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  role: "OWNER" | "HOST";
};
const password = z
  .string()
  .min(8, "Enter at least 8 characters.")
  .max(72, "Enter at most 72 characters.");
const email = z.string().trim().email("Enter a valid email address.").max(254);
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 ()-]{7,18}$/, "Enter a valid mobile number.");
const name = z.string().trim().min(2, "Enter your full name.").max(100);
const optionalFields = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  password: z.string(),
  confirmPassword: z.string(),
  role: z.enum(["OWNER", "HOST"]),
});
const authSchemas = {
  login: optionalFields.extend({
    email,
    password: z.string().min(1, "Enter your password."),
  }),
  signup: optionalFields
    .extend({ name, email, phone, password })
    .refine((values) => values.password === values.confirmPassword, {
      path: ["confirmPassword"],
      message: "The passwords must match.",
    }),
  forgot: optionalFields.extend({ email }),
  reset: optionalFields
    .extend({ password })
    .refine((values) => values.password === values.confirmPassword, {
      path: ["confirmPassword"],
      message: "The passwords must match.",
    }),
};
const description = {
  login: {
    title: "Welcome back",
    body: "Log in to manage your charging on PlugLink.",
    button: "Log in",
  },
  signup: {
    title: "Create your account",
    body: "Find a nearby charger or start sharing your own.",
    button: "Create account",
  },
  forgot: {
    title: "Forgot your password?",
    body: "Enter the email address linked to your account.",
    button: "Request password reset",
  },
  reset: {
    title: "Choose a new password",
    body: "Enter a new password for your PlugLink account.",
    button: "Update password",
  },
};

function safeNext(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return null;
  const url = new URL(value, window.location.origin);
  if (
    url.origin !== window.location.origin ||
    ["/login", "/signup", "/reset-password", "/forgot-password"].includes(
      url.pathname,
    )
  )
    return null;
  return url.pathname + url.search + url.hash;
}

export function Account({ mode }: { mode: Mode }) {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const next = safeNext(params.get("next"));
  if (user && (mode === "login" || mode === "signup"))
    return <Navigate to={next || roleHome(user.role)} replace />;
  return <AccountForm key={mode} mode={mode} next={next} />;
}

function AccountForm({ mode, next }: { mode: Mode; next: string | null }) {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const [developmentToken, setDevelopmentToken] = useState("");
  const signup = mode === "signup";
  const token = params.get("token");
  const resetUnavailable = mode === "reset" && !token;
  const detail = description[mode];
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthInput>({
    resolver: zodResolver(authSchemas[mode]),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      role: params.get("role") === "HOST" ? "HOST" : "OWNER",
    },
  });
  function fieldError(field: keyof AuthInput) {
    return (
      errors[field] && (
        <small id={"error-" + field} className="account-field-error">
          {errors[field]?.message}
        </small>
      )
    );
  }
  const submit = handleSubmit(async (values) => {
    setFailure("");
    setStatus("");
    setDevelopmentToken("");
    try {
      if (mode === "forgot") {
        const result = await api<{
          message: string;
          developmentResetToken?: string;
        }>("/auth/forgot", {
          method: "POST",
          body: JSON.stringify({ email: values.email }),
        });
        setStatus(result.message);
        setDevelopmentToken(result.developmentResetToken || "");
      } else if (mode === "reset") {
        const result = await api<{ message?: string }>("/auth/reset", {
          method: "POST",
          body: JSON.stringify({
            token,
            password: values.password,
            confirmPassword: values.confirmPassword,
          }),
        });
        setStatus(result.message || "Password updated. You can now log in.");
      } else {
        const result = await api<{ user: User }>(
          signup ? "/auth/register" : "/auth/login",
          {
            method: "POST",
            body: JSON.stringify(
              signup
                ? values
                : { email: values.email, password: values.password },
            ),
          },
        );
        await refresh(result.user);
        navigate(next || roleHome(result.user.role), { replace: true });
      }
    } catch (error) {
      setFailure(errorMessage(error));
    }
  });
  return (
    <section className="account-frame">
      <div className="account-form-column">
        <div className="account-form-wrap">
          <Link
            to={mode === "forgot" || mode === "reset" ? "/login" : "/"}
            className="account-back"
          >
            <ChevronLeft size={17} aria-hidden="true" />
            {mode === "forgot" || mode === "reset"
              ? "Back to log in"
              : "Back to home"}
          </Link>
          <h1>{detail.title}</h1>
          <p className="account-description">{detail.body}</p>
          {resetUnavailable ? (
            <p className="account-error" role="alert">
              This reset link is missing its token.{" "}
              <Link to="/forgot-password">Request a new link</Link>.
            </p>
          ) : (
            <form noValidate onSubmit={submit} className="account-form">
              {signup && (
                <>
                  <fieldset className="account-role">
                    <legend>Account type</legend>
                    <label>
                      <input type="radio" value="OWNER" {...register("role")} />{" "}
                      EV owner
                    </label>
                    <label>
                      <input type="radio" value="HOST" {...register("role")} />{" "}
                      Charging host
                    </label>
                  </fieldset>
                  <label className="account-field">
                    Full name
                    <input
                      autoComplete="name"
                      aria-invalid={!!errors.name}
                      aria-describedby={errors.name ? "error-name" : undefined}
                      {...register("name")}
                    />
                    {fieldError("name")}
                  </label>
                </>
              )}
              {mode !== "reset" && (
                <label className="account-field">
                  Email address
                  <input
                    type="email"
                    autoComplete="email"
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "error-email" : undefined}
                    {...register("email")}
                  />
                  {fieldError("email")}
                </label>
              )}
              {signup && (
                <label className="account-field">
                  Mobile number
                  <input
                    type="tel"
                    autoComplete="tel"
                    placeholder="+91"
                    aria-invalid={!!errors.phone}
                    aria-describedby={errors.phone ? "error-phone" : undefined}
                    {...register("phone")}
                  />
                  {fieldError("phone")}
                </label>
              )}
              {mode !== "forgot" && (
                <div className="account-field">
                  <div className="account-label-row">
                    <label htmlFor="account-password">Password</label>
                    {mode === "login" && (
                      <Link to="/forgot-password">Forgot password?</Link>
                    )}
                  </div>
                  <div className="account-password">
                    <input
                      id="account-password"
                      type={visible ? "text" : "password"}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      aria-invalid={!!errors.password}
                      aria-describedby={
                        errors.password ? "error-password" : undefined
                      }
                      {...register("password")}
                    />
                    <button
                      type="button"
                      aria-label={visible ? "Hide password" : "Show password"}
                      onClick={() => setVisible(!visible)}
                    >
                      {visible ? (
                        <EyeOff size={18} aria-hidden="true" />
                      ) : (
                        <Eye size={18} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {fieldError("password")}
                </div>
              )}
              {(signup || mode === "reset") && (
                <label className="account-field">
                  Confirm password
                  <input
                    type={visible ? "text" : "password"}
                    autoComplete="new-password"
                    aria-invalid={!!errors.confirmPassword}
                    aria-describedby={
                      errors.confirmPassword
                        ? "error-confirmPassword"
                        : undefined
                    }
                    {...register("confirmPassword")}
                  />
                  {fieldError("confirmPassword")}
                </label>
              )}
              {failure && (
                <p className="account-error" role="alert">
                  {failure}
                </p>
              )}
              {status && (
                <p className="account-success" role="status">
                  {status}
                </p>
              )}
              {developmentToken && (
                <Link
                  className="account-dev-reset"
                  to={
                    "/reset-password?token=" +
                    encodeURIComponent(developmentToken)
                  }
                >
                  Open development-only reset link
                </Link>
              )}
              <button
                className="site-button"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Please wait…" : detail.button}
              </button>
            </form>
          )}
          {mode === "login" && (
            <p className="account-alternate">
              New to PlugLink?{" "}
              <Link
                to={
                  "/signup" + (next ? "?next=" + encodeURIComponent(next) : "")
                }
              >
                Sign up
              </Link>
            </p>
          )}
          {signup && (
            <p className="account-alternate">
              Already have an account?{" "}
              <Link
                to={
                  "/login" + (next ? "?next=" + encodeURIComponent(next) : "")
                }
              >
                Log in
              </Link>
            </p>
          )}
        </div>
      </div>
      <aside
        className="account-photo"
        aria-label="An electric vehicle charging at home"
      >
        <div className="account-photo-copy">
          <ShieldCheck size={28} aria-hidden="true" />
          <p>
            Community-powered
            <br />
            charging.
          </p>
        </div>
      </aside>
    </section>
  );
}

const profileSchema = z.object({ name, phone });
export function Profile() {
  const { user, refresh } = useAuth();
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name || "", phone: user?.phone || "" },
  });
  const submit = handleSubmit(async (values) => {
    setStatus("");
    setFailure("");
    try {
      const result = await api<{ user: User }>("/users/me", {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      await refresh(result.user);
      setStatus("Profile saved.");
    } catch (error) {
      setFailure(errorMessage(error));
    }
  });
  return (
    <section className="account-tool">
      <span className="account-tool-mark">
        <CircleUserRound size={24} aria-hidden="true" />
      </span>
      <h1>Your profile</h1>
      <p className="account-description">Update your name and mobile number.</p>
      <form className="account-form account-panel" noValidate onSubmit={submit}>
        <label className="account-field">
          Full name
          <input
            autoComplete="name"
            aria-invalid={!!errors.name}
            {...register("name")}
          />
          {errors.name && (
            <small className="account-field-error">{errors.name.message}</small>
          )}
        </label>
        <label className="account-field">
          Email address
          <input type="email" value={user?.email || ""} readOnly />
        </label>
        <label className="account-field">
          Mobile number
          <input
            type="tel"
            autoComplete="tel"
            aria-invalid={!!errors.phone}
            {...register("phone")}
          />
          {errors.phone && (
            <small className="account-field-error">
              {errors.phone.message}
            </small>
          )}
        </label>
        {failure && (
          <p className="account-error" role="alert">
            {failure}
          </p>
        )}
        {status && (
          <p className="account-success" role="status">
            {status}
          </p>
        )}
        <button type="submit" className="site-button" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save changes"}
        </button>
      </form>
    </section>
  );
}

type Notice = {
  id: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  kind: string;
  bookingId?: string | null;
};
export function Notifications() {
  const { user } = useAuth();
  const client = useQueryClient();
  const queryKey = ["notifications", user?.id];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api<{ notifications: Notice[] }>("/notifications", { signal }),
  });
  const read = useMutation({
    mutationFn: (id: string) =>
      api(
        "/notifications/" +
          (id === "all" ? "read-all" : encodeURIComponent(id) + "/read"),
        { method: "PATCH" },
      ),
    onSuccess: () => client.invalidateQueries({ queryKey }),
  });
  const notices = query.data?.notifications || [];
  return (
    <section className="account-tool account-notifications">
      <div className="account-tool-header">
        <div>
          <span className="account-tool-mark">
            <Bell size={23} aria-hidden="true" />
          </span>
          <h1>Notifications</h1>
          <p className="account-description">
            Booking, station and payment updates.
          </p>
        </div>
        {notices.some((notice) => !notice.readAt) && (
          <button
            className="site-button site-button-outline"
            type="button"
            disabled={read.isPending}
            onClick={() => read.mutate("all")}
          >
            Mark all as read
          </button>
        )}
      </div>
      {read.error && (
        <p className="account-error" role="alert">
          {errorMessage(read.error)}
        </p>
      )}
      {query.isPending ? (
        <p role="status">Loading notifications…</p>
      ) : query.error ? (
        <div className="account-panel">
          <p role="alert">{errorMessage(query.error)}</p>
          <button
            type="button"
            className="site-button"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </div>
      ) : !notices.length ? (
        <p className="account-panel">You’re all caught up.</p>
      ) : (
        <ul className="account-notice-list">
          {notices.map((notice) => (
            <li key={notice.id} className="account-panel">
              <div>
                <div className="account-notice-title">
                  <h2>{notice.title}</h2>
                  {!notice.readAt && <span>Unread</span>}
                </div>
                <p>{notice.message}</p>
                <time dateTime={notice.createdAt}>
                  {dateTime(notice.createdAt)}
                </time>
                {notice.bookingId && user?.role === "OWNER" && (
                  <Link
                    to={
                      "/owner/bookings?booking=" +
                      encodeURIComponent(notice.bookingId)
                    }
                  >
                    View booking
                  </Link>
                )}
              </div>
              {!notice.readAt && (
                <button
                  className="site-icon-button"
                  type="button"
                  aria-label={"Mark " + notice.title + " as read"}
                  disabled={read.isPending}
                  onClick={() => read.mutate(notice.id)}
                >
                  <Check size={18} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
