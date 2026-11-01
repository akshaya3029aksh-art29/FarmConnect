import { useEffect, useState } from "react";
import { auth, db } from "./firebase";

import {
  collection,
  onSnapshot,
  query,
  where
} from "firebase/firestore";

import "./CoordinatorModules.css";

function formatDate(value) {
  if (!value) return "Not available";

  const date =
    typeof value.toDate === "function"
      ? value.toDate()
      : new Date(value);

  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleDateString("en-IN");
}

function useUsers(role) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setError("Please log in again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const usersQuery = query(
      collection(db, "users"),
      where("role", "==", role)
    );

    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        setUsers(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data()
          }))
        );

        setLoading(false);
      },
      (err) => {
        console.error(`Unable to load ${role} accounts:`, err);
        setError(
          "Unable to load accounts. Check your Firestore security rules."
        );
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [role]);

  return { users, loading, error };
}

export function FarmerSupport() {
  const { users, loading, error } = useUsers("farmer");
  const [search, setSearch] = useState("");

  const filteredUsers = users.filter((farmer) => {
    const text = [
      farmer.name,
      farmer.email,
      farmer.phone
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return text.includes(search.trim().toLowerCase());
  });

  return (
    <div className="coordinator-module">
      <h2>👨‍🌾 Farmer Support</h2>

      <p>
        Find registered farmers and their contact information.
      </p>

      <div className="coordinator-summary">
        <strong>Total registered farmers: {users.length}</strong>
      </div>

      <input
        className="coordinator-search"
        type="search"
        placeholder="Search farmers by name, email or phone..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {loading && <p>Loading farmers...</p>}

      {error && (
        <p className="coordinator-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && filteredUsers.length === 0 && (
        <p>No registered farmers found.</p>
      )}

      <div className="coordinator-list">
        {filteredUsers.map((farmer) => (
          <article className="coordinator-card" key={farmer.id}>
            <h3>👨‍🌾 {farmer.name || "Unnamed farmer"}</h3>

            <p>
              <strong>Email:</strong>{" "}
              {farmer.email || "Not provided"}
            </p>

            <p>
              <strong>Phone:</strong>{" "}
              {farmer.phone || "Not provided"}
            </p>

            <p>
              <strong>Registered:</strong>{" "}
              {formatDate(farmer.createdAt)}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

export function NurseryNetwork() {
  const { users, loading, error } = useUsers("nursery");
  const [seedlings, setSeedlings] = useState([]);
  const [seedlingsLoading, setSeedlingsLoading] = useState(true);
  const [seedlingsError, setSeedlingsError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setSeedlingsError("Please log in again.");
      setSeedlingsLoading(false);
      return;
    }

    setSeedlingsLoading(true);
    setSeedlingsError("");

    const unsubscribe = onSnapshot(
      collection(db, "seedlings"),
      (snapshot) => {
        setSeedlings(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data()
          }))
        );

        setSeedlingsLoading(false);
      },
      (err) => {
        console.error("Unable to load nursery listings:", err);
        setSeedlingsError(
          "Unable to load seedling listings. Check your Firestore security rules."
        );
        setSeedlingsLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const filteredNurseries = users.filter((nursery) => {
    const text = [
      nursery.name,
      nursery.email,
      nursery.phone
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return text.includes(search.trim().toLowerCase());
  });

  const listingsForNursery = (nurseryId) =>
    seedlings.filter(
      (item) =>
        item.ownerId === nurseryId &&
        item.status !== "inactive"
    );

  return (
    <div className="coordinator-module">
      <h2>🏡 Nursery Network</h2>

      <p>
        View registered nurseries and their available seedling listings.
      </p>

      <div className="coordinator-summary">
        <strong>Total registered nurseries: {users.length}</strong>
      </div>

      <input
        className="coordinator-search"
        type="search"
        placeholder="Search nurseries by name, email or phone..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {loading && <p>Loading nurseries...</p>}

      {error && (
        <p className="coordinator-error" role="alert">
          {error}
        </p>
      )}

      {seedlingsError && (
        <p className="coordinator-error" role="alert">
          {seedlingsError}
        </p>
      )}

      {seedlingsLoading && <p>Loading seedling listings...</p>}

      {!loading && !error && filteredNurseries.length === 0 && (
        <p>No registered nurseries found.</p>
      )}

      <div className="coordinator-list">
        {filteredNurseries.map((nursery) => {
          const nurserySeedlings = listingsForNursery(nursery.id);

          return (
            <article
              className="coordinator-card"
              key={nursery.id}
            >
              <h3>🏡 {nursery.name || "Unnamed nursery"}</h3>

              <p>
                <strong>Email:</strong>{" "}
                {nursery.email || "Not provided"}
              </p>

              <p>
                <strong>Phone:</strong>{" "}
                {nursery.phone || "Not provided"}
              </p>

              <p>
                <strong>Registered:</strong>{" "}
                {formatDate(nursery.createdAt)}
              </p>

              <h4>
                Seedling listings: {nurserySeedlings.length}
              </h4>

              {!seedlingsLoading &&
                nurserySeedlings.map((item) => (
                  <div
                    className="coordinator-listing"
                    key={item.id}
                  >
                    <strong>{item.name || "Unnamed seedling"}</strong>

                    <p>
                      Price: ₹{Number(item.price || 0).toLocaleString("en-IN")}
                    </p>

                    <p>
                      Available quantity:{" "}
                      {Number(item.availableQuantity || 0)}
                    </p>

                    <p>
                      Location: {item.location || "Not specified"}
                    </p>
                  </div>
                ))}
            </article>
          );
        })}
      </div>
    </div>
  );
}