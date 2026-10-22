import React, { useState } from "react";
import {
  Sparkles,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  Building2,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.js";
import { ApiClientError } from "../services/api.js";

interface AuthPageProps {
  initialMode?: "login" | "signup";
}

export const AuthPage: React.FC<AuthPageProps> = ({ initialMode = "login" }) => {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);

  // Form input states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [organizationName, setOrganizationName] = useState("");

  // UI interaction states
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Clear errors when toggling modes
  const handleModeSwitch = (newMode: "login" | "signup") => {
    setMode(newMode);
    setErrorMessage(null);
  };

  // Password validation checks for signup
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const isPasswordValid = hasMinLength && hasUppercase && hasLowercase && hasNumber;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (mode === "signup" && !isPasswordValid) {
      setErrorMessage(
        "Please meet all password strength requirements before proceeding."
      );
      return;
    }

    setIsLoading(true);

    try {
      if (mode === "login") {
        await login({ email, password });
      } else {
        await signup({
          email,
          password,
          firstName,
          lastName: lastName.trim() || undefined,
          organizationName,
        });
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("An unexpected authentication error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand-icon">
            <Sparkles size={24} />
          </div>
          <h1 className="auth-title">Grovastra</h1>
          <p className="auth-subtitle">
            {mode === "login"
              ? "Sign in to your organization dashboard"
              : "Create an enterprise customer account"}
          </p>
        </div>

        <div className="auth-mode-toggle" role="tablist" aria-label="Authentication Options">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={`auth-toggle-btn ${mode === "login" ? "active" : ""}`}
            onClick={() => handleModeSwitch("login")}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={`auth-toggle-btn ${mode === "signup" ? "active" : ""}`}
            onClick={() => handleModeSwitch("signup")}
          >
            Create Account
          </button>
        </div>

        {errorMessage && (
          <div className="auth-error-banner" role="alert">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>{errorMessage}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate={false}>
          {mode === "signup" && (
            <>
              <div className="auth-form-row">
                <div>
                  <label htmlFor="signup-first-name" className="auth-label">
                    First Name <span style={{ color: "var(--accent-rose)" }}>*</span>
                  </label>
                  <div className="auth-input-wrapper">
                    <input
                      id="signup-first-name"
                      name="given-name"
                      type="text"
                      className="auth-input"
                      placeholder="Jane"
                      autoComplete="given-name"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-last-name" className="auth-label">
                    Last Name
                  </label>
                  <div className="auth-input-wrapper">
                    <input
                      id="signup-last-name"
                      name="family-name"
                      type="text"
                      className="auth-input"
                      placeholder="Doe"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="signup-org-name" className="auth-label">
                  Organization / Company <span style={{ color: "var(--accent-rose)" }}>*</span>
                </label>
                <div className="auth-input-wrapper">
                  <input
                    id="signup-org-name"
                    name="organization"
                    type="text"
                    className="auth-input"
                    placeholder="e.g. Acme Corporation"
                    autoComplete="organization"
                    required
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label htmlFor="auth-email" className="auth-label">
              Work Email <span style={{ color: "var(--accent-rose)" }}>*</span>
            </label>
            <div className="auth-input-wrapper">
              <input
                id="auth-email"
                name="email"
                type="email"
                inputMode="email"
                className="auth-input"
                placeholder="name@company.com"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="auth-password" className="auth-label">
              Password <span style={{ color: "var(--accent-rose)" }}>*</span>
            </label>
            <div className="auth-input-wrapper">
              <input
                id="auth-password"
                name={mode === "signup" ? "new-password" : "current-password"}
                type={showPassword ? "text" : "password"}
                className="auth-input"
                placeholder={mode === "signup" ? "Min. 8 characters" : "Enter password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {mode === "signup" && password.length > 0 && (
              <div
                style={{
                  marginTop: "0.5rem",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.35rem",
                  fontSize: "0.75rem",
                }}
              >
                <span
                  style={{
                    color: hasMinLength ? "var(--accent-emerald-light)" : "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}
                >
                  <CheckCircle2 size={12} /> 8+ characters
                </span>
                <span
                  style={{
                    color: hasUppercase ? "var(--accent-emerald-light)" : "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}
                >
                  <CheckCircle2 size={12} /> Uppercase letter
                </span>
                <span
                  style={{
                    color: hasLowercase ? "var(--accent-emerald-light)" : "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}
                >
                  <CheckCircle2 size={12} /> Lowercase letter
                </span>
                <span
                  style={{
                    color: hasNumber ? "var(--accent-emerald-light)" : "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}
                >
                  <CheckCircle2 size={12} /> Numeric digit
                </span>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={isLoading || (mode === "signup" && (!isPasswordValid || !organizationName.trim()))}
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="spinning" />
                <span>{mode === "login" ? "Authenticating..." : "Creating Account..."}</span>
              </>
            ) : (
              <span>{mode === "login" ? "Sign In to Dashboard" : "Register Organization"}</span>
            )}
          </button>
        </form>

        <div className="auth-trust-strip">
          <div className="auth-trust-item">
            <ShieldCheck size={14} color="#34d399" />
            <span>Enterprise Security</span>
          </div>
          <div className="auth-trust-item">
            <Lock size={14} color="#818cf8" />
            <span>Encrypted Data</span>
          </div>
          <div className="auth-trust-item">
            <Building2 size={14} color="#38bdf8" />
            <span>Dedicated Workspace</span>
          </div>
        </div>
      </div>
    </div>
  );
};
