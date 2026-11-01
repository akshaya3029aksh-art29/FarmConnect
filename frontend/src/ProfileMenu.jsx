// ProfileMenu.jsx

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import "./ProfileMenu.css";

function ProfileMenu({
  user,
  profile,
  onProfileUpdated,
  onLogout
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const menuRef = useRef(null);

  const [form, setForm] = useState({
    name: "",
    phone: ""
  });

  useEffect(() => {
    if (modal === "edit" && profile) {
      setForm({
        name: profile.name || "",
        phone: profile.phone || ""
      });

      setMessage("");
      setError("");
    }
  }, [modal, profile]);

  // Close dropdown when clicking outside it.
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, []);

  // Close modal with Escape.
  useEffect(() => {
    if (!modal) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape" && !saving) {
        setModal("");
        setMessage("");
        setError("");
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, [modal, saving]);

  // Prevent background scrolling while modal is open.
  useEffect(() => {
    if (!modal) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [modal]);

  const displayName =
    profile?.name || user?.displayName || "User";

  const initials =
    displayName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "U";

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value
    }));
  };

  const openProfile = (type) => {
    setMenuOpen(false);
    setMessage("");
    setError("");
    setModal(type);
  };

  const closeModal = () => {
    if (saving) return;

    setModal("");
    setMessage("");
    setError("");
  };

  const saveProfile = async (event) => {
    event.preventDefault();

    if (!user?.uid) {
      setError(
        "Your session has expired. Please log in again."
      );
      return;
    }

    const name = form.name.trim();
    const phone = form.phone.trim();

    if (!name) {
      setError("Please enter your full name.");
      return;
    }

    if (!/^\d{10}$/.test(phone)) {
      setError(
        "Please enter a valid 10-digit phone number."
      );
      return;
    }

    if (
      name === (profile?.name || "") &&
      phone === (profile?.phone || "")
    ) {
      setMessage("No changes were made.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setMessage("");

      await updateDoc(
        doc(db, "users", user.uid),
        {
          name,
          phone
        }
      );

      if (typeof onProfileUpdated === "function") {
        onProfileUpdated({
          ...profile,
          name,
          phone
        });
      }

      setModal("");
      setMessage("Profile updated successfully!");
    } catch (err) {
      console.error("Profile update failed:", err);

      if (err.code === "permission-denied") {
        setError(
          "Permission denied. Please check your Firestore security rules."
        );
      } else if (err.code === "not-found") {
        setError(
          "Your profile document was not found in Firestore."
        );
      } else {
        setError(
          err.message || "Unable to update your profile."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  // Render the modal outside the dashboard's DOM containers.
  const profileModal = modal
    ? createPortal(
        <div
          className="profile-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <section
            className="profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-modal-title"
          >
            <div className="profile-modal-header">
              <div>
                <h2 id="profile-modal-title">
                  {modal === "edit"
                    ? "✏️ Edit Profile"
                    : "👤 My Profile"}
                </h2>

                <p>
                  {modal === "edit"
                    ? "Update your personal information."
                    : "View your FarmConnect account details."}
                </p>
              </div>

              <button
                type="button"
                className="profile-modal-close"
                aria-label="Close profile window"
                onClick={closeModal}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <div className="profile-modal-avatar">
              {initials}
            </div>

            {modal === "view" ? (
              <div className="profile-details">
                <div className="profile-detail-row">
                  <span>Full Name</span>
                  <strong>
                    {profile?.name || "Not provided"}
                  </strong>
                </div>

                <div className="profile-detail-row">
                  <span>Phone Number</span>
                  <strong>
                    {profile?.phone || "Not provided"}
                  </strong>
                </div>

                <div className="profile-detail-row">
                  <span>Email Address</span>
                  <strong>
                    {profile?.email ||
                      user?.email ||
                      "Not provided"}
                  </strong>
                </div>

                <div className="profile-detail-row">
                  <span>Account Role</span>
                  <strong>
                    {String(profile?.role || "user")
                      .replace(/_/g, " ")
                      .toUpperCase()}
                  </strong>
                </div>

                <div className="profile-detail-row">
                  <span>Firebase User ID</span>
                  <strong className="profile-uid">
                    {user?.uid || "Not available"}
                  </strong>
                </div>

                <button
                  type="button"
                  className="profile-primary-button"
                  onClick={() => openProfile("edit")}
                >
                  ✏️ Edit Profile
                </button>

                <button
                  type="button"
                  className="profile-secondary-button profile-view-close"
                  onClick={closeModal}
                >
                  Close
                </button>
              </div>
            ) : (
              <form
                className="profile-edit-form"
                onSubmit={saveProfile}
              >
                <label htmlFor="profile-name">
                  Full Name
                </label>

                <input
                  id="profile-name"
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  maxLength={100}
                  autoComplete="name"
                  required
                  disabled={saving}
                />

                <label htmlFor="profile-phone">
                  Phone Number
                </label>

                <input
                  id="profile-phone"
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  maxLength={10}
                  inputMode="numeric"
                  autoComplete="tel"
                  pattern="[0-9]{10}"
                  title="Enter a 10-digit phone number."
                  required
                  disabled={saving}
                />

                <label htmlFor="profile-email">
                  Email Address
                </label>

                <input
                  id="profile-email"
                  type="email"
                  value={
                    profile?.email || user?.email || ""
                  }
                  readOnly
                  disabled
                />

                <p className="profile-readonly-note">
                  Email and account role cannot be
                  changed here.
                </p>

                {error && (
                  <p className="profile-error" role="alert">
                    {error}
                  </p>
                )}

                {message && (
                  <p
                    className="profile-success"
                    role="status"
                  >
                    {message}
                  </p>
                )}

                <div className="profile-form-actions">
                  <button
                    type="button"
                    className="profile-secondary-button"
                    onClick={closeModal}
                    disabled={saving}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="profile-primary-button"
                    disabled={saving}
                  >
                    {saving
                      ? "Saving..."
                      : "💾 Save Changes"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {/* PROFILE DROPDOWN */}
      <div
        className="profile-menu-wrapper"
        ref={menuRef}
      >
        <button
          type="button"
          className="profile-trigger"
          aria-label="Open profile menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() =>
            setMenuOpen((previous) => !previous)
          }
        >
          <span className="profile-avatar">
            {initials}
          </span>

          <span className="profile-trigger-details">
            <strong>{displayName}</strong>
            <small>
              {String(profile?.role || "user")
                .replace(/_/g, " ")
                .toUpperCase()}
            </small>
          </span>

          <span className="profile-chevron" aria-hidden="true">
            {menuOpen ? "▴" : "▾"}
          </span>
        </button>

        {menuOpen && (
          <div className="profile-dropdown" role="menu">
            <div className="profile-dropdown-heading">
              <span className="profile-avatar">
                {initials}
              </span>

              <div>
                <strong>{displayName}</strong>
                <small>
                  {profile?.email || user?.email || ""}
                </small>
              </div>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => openProfile("view")}
            >
              <span>👤</span>
              My Profile
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => openProfile("edit")}
            >
              <span>✏️</span>
              Edit Profile
            </button>

            <div className="profile-dropdown-divider" />

            <button
              type="button"
              role="menuitem"
              className="profile-logout"
              onClick={() => {
                setMenuOpen(false);
                onLogout?.();
              }}
            >
              <span>🚪</span>
              Logout
            </button>
          </div>
        )}
      </div>

      {profileModal}

      {/* SUCCESS TOAST */}
      {message && !modal && (
        <div className="profile-toast" role="status">
          {message}
        </div>
      )}
    </>
  );
}

export default ProfileMenu;