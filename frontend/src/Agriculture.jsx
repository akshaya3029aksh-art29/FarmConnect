
import { useEffect, useMemo, useState } from "react";
import agricultureData from "./data/agriculture";
import { db, auth } from "./firebase";
import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp
} from "firebase/firestore";

const emptyForm = {
  name: "",
  season: "",
  duration: "",
  soil: "",
  water: "",
  temperature: "",
  planting: "",
  fertilizer: "",
  pests: "",
  diseases: "",
  harvesting: "",
  tips: ""
};

function Agriculture({ onBack }) {
  const [agriculture, setAgriculture] = useState(agricultureData);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    const agricultureRef = collection(db, "agriculture");

    const unsubscribe = onSnapshot(
      agricultureRef,
      (snapshot) => {
        const savedItems = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data()
        }));

        setAgriculture([...agricultureData, ...savedItems]);
      },
      (error) => {
        console.error("Agriculture loading error:", error);
        setMessage("Could not load saved agriculture items. Check Firestore permissions.");
      }
    );

    return () => unsubscribe();
  }, []);

  const categories = useMemo(() => {
    return [
      "All",
      ...new Set(
        agriculture
          .map((item) => item.category)
          .filter(Boolean)
      )
    ];
  }, [agriculture]);

  const filteredItems = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return agriculture.filter((item) => {
      const searchableText = [
        item.name,
        item.category,
        item.season,
        item.duration,
        item.soil,
        item.water,
        item.temperature,
        item.planting,
        item.fertilizer,
        item.harvesting,
        item.tips,
        ...(Array.isArray(item.pests) ? item.pests : []),
        ...(Array.isArray(item.diseases) ? item.diseases : [])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = searchableText.includes(searchText);
      const matchesCategory =
        category === "All" || item.category === category;

      return matchesSearch && matchesCategory;
    });
  }, [agriculture, search, category]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: value
    }));
  };

  const handleAddFruit = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      setMessage("Please enter the fruit name.");
      return;
    }

    if (!auth.currentUser) {
      setMessage("Please log in before adding a fruit.");
      return;
    }

    const newFruit = {
      name: form.name.trim(),
      category: "Fruits",
      season: form.season.trim(),
      duration: form.duration.trim(),
      soil: form.soil.trim(),
      water: form.water.trim(),
      temperature: form.temperature.trim(),
      planting: form.planting.trim(),
      fertilizer: form.fertilizer.trim(),
      pests: form.pests
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      diseases: form.diseases
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      harvesting: form.harvesting.trim(),
      tips: form.tips.trim(),
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp()
    };

    try {
      setSaving(true);
      setMessage("");

      await addDoc(collection(db, "agriculture"), newFruit);

      setForm(emptyForm);
      setShowForm(false);
      setCategory("Fruits");
      setSearch("");
      setSelected(null);
      setMessage("Fruit details saved successfully!");
    } catch (error) {
      console.error("Error saving fruit:", error);
      setMessage(
        error.code === "permission-denied"
          ? "Firestore permission denied. Check your Firestore security rules."
          : error.message || "Unable to save fruit details."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="agriculture-page">
      <div className="agriculture-header">
        <button type="button" onClick={onBack}>
          ← Back to Dashboard
        </button>

        <h1>🌱 Agriculture Information Centre</h1>

        <p>
          Explore vegetables, fruits, field crops, medicinal plants,
          flowers and other agricultural resources.
        </p>
      </div>

      <div className="agriculture-controls">
        <input
          type="search"
          placeholder="Search crops, categories, seasons and plants..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelected(null);
          }}
        />

        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setSelected(null);
          }}
        >
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => {
            setShowForm((previous) => !previous);
            setSelected(null);
            setMessage("");
          }}
        >
          + Add New Fruit
        </button>
      </div>

      {message && (
        <p className="agriculture-message" role="status">
          {message}
        </p>
      )}

      {showForm && (
        <div className="agriculture-form">
          <h2>🍎 Enter New Fruit Details</h2>

          <form onSubmit={handleAddFruit}>
            <label>Fruit Name *</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Example: Apple"
              required
            />

            <label>Growing Season</label>
            <input
              name="season"
              value={form.season}
              onChange={handleChange}
              placeholder="Example: Winter"
            />

            <label>Growing Duration</label>
            <input
              name="duration"
              value={form.duration}
              onChange={handleChange}
              placeholder="Example: 6-8 months"
            />

            <label>Soil Requirements</label>
            <textarea
              name="soil"
              value={form.soil}
              onChange={handleChange}
              placeholder="Enter soil details"
            />

            <label>Water Requirements</label>
            <textarea
              name="water"
              value={form.water}
              onChange={handleChange}
              placeholder="Enter water requirements"
            />

            <label>Temperature</label>
            <input
              name="temperature"
              value={form.temperature}
              onChange={handleChange}
              placeholder="Enter suitable temperature"
            />

            <label>Planting Method</label>
            <textarea
              name="planting"
              value={form.planting}
              onChange={handleChange}
              placeholder="Enter planting method"
            />

            <label>Fertilizer Guidance</label>
            <textarea
              name="fertilizer"
              value={form.fertilizer}
              onChange={handleChange}
              placeholder="Enter fertilizer information"
            />

            <label>Common Pests</label>
            <input
              name="pests"
              value={form.pests}
              onChange={handleChange}
              placeholder="Separate names with commas"
            />

            <label>Common Diseases</label>
            <input
              name="diseases"
              value={form.diseases}
              onChange={handleChange}
              placeholder="Separate names with commas"
            />

            <label>Harvesting Information</label>
            <textarea
              name="harvesting"
              value={form.harvesting}
              onChange={handleChange}
              placeholder="Enter harvesting details"
            />

            <label>Additional Farming Tips</label>
            <textarea
              name="tips"
              value={form.tips}
              onChange={handleChange}
              placeholder="Enter useful farming tips"
            />

            <div className="agriculture-form-buttons">
              <button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Fruit Details"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(emptyForm);
                  setMessage("");
                }}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {!showForm && !selected && (
        <>
          <p className="agriculture-count">
            Showing {filteredItems.length} agriculture items
          </p>

          <div className="agriculture-grid">
            {filteredItems.map((item, index) => (
              <article
                className="agriculture-card"
                key={item.id ?? item.name ?? index}
              >
                <div className="agriculture-symbol">🌿</div>

                <span className="agriculture-category">
                  {item.category || "Other"}
                </span>

                <h3>{item.name || "Unnamed item"}</h3>

                <p>
                  <strong>Duration:</strong>{" "}
                  {item.duration || "Not provided"}
                </p>

                <p>
                  <strong>Season:</strong>{" "}
                  {item.season || "Not provided"}
                </p>

                <button
                  type="button"
                  onClick={() => setSelected(item)}
                >
                  View Complete Information
                </button>
              </article>
            ))}
          </div>

          {filteredItems.length === 0 && (
            <p className="agriculture-empty">
              No results found. Try another search.
            </p>
          )}
        </>
      )}

      {selected && !showForm && (
        <div className="agriculture-details">
          <button
            type="button"
            onClick={() => setSelected(null)}
          >
            ← Back to Agriculture List
          </button>

          <span className="agriculture-category">
            {selected.category || "Other"}
          </span>

          <h2>{selected.name}</h2>

          <div className="agriculture-detail-grid">
            <div>
              <h3>🌤 Growing Season</h3>
              <p>{selected.season || "Not provided"}</p>
            </div>

            <div>
              <h3>⏳ Duration</h3>
              <p>{selected.duration || "Not provided"}</p>
            </div>

            <div>
              <h3>🌱 Soil Requirements</h3>
              <p>{selected.soil || "Not provided"}</p>
            </div>

            <div>
              <h3>💧 Water Requirements</h3>
              <p>{selected.water || "Not provided"}</p>
            </div>

            <div>
              <h3>🌡 Temperature</h3>
              <p>{selected.temperature || "Not provided"}</p>
            </div>

            <div>
              <h3>🌾 Planting Method</h3>
              <p>{selected.planting || "Not provided"}</p>
            </div>

            <div>
              <h3>🧪 Fertilizer Guidance</h3>
              <p>{selected.fertilizer || "Not provided"}</p>
            </div>

            <div>
              <h3>🐛 Common Pests</h3>
              {Array.isArray(selected.pests) && selected.pests.length > 0 ? (
                <ul>
                  {selected.pests.map((pest, index) => (
                    <li key={index}>{pest}</li>
                  ))}
                </ul>
              ) : (
                <p>Not provided</p>
              )}
            </div>

            <div>
              <h3>🦠 Common Diseases</h3>
              {Array.isArray(selected.diseases) &&
              selected.diseases.length > 0 ? (
                <ul>
                  {selected.diseases.map((disease, index) => (
                    <li key={index}>{disease}</li>
                  ))}
                </ul>
              ) : (
                <p>Not provided</p>
              )}
            </div>

            <div>
              <h3>🧺 Harvesting</h3>
              <p>{selected.harvesting || "Not provided"}</p>
            </div>

            <div>
              <h3>💡 Farming Tips</h3>
              <p>{selected.tips || "Not provided"}</p>
            </div>
          </div>

          <p className="agriculture-note">
            These are general educational guidelines. Actual crop
            requirements vary by variety, location, soil and season.
            Consult local agricultural experts for field-specific advice.
          </p>
        </div>
      )}
    </div>
  );
}

export default Agriculture;
