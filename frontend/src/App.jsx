import { useEffect, useState } from "react";

import WeatherReport from "./WeatherReport";
import Agriculture from "./Agriculture";
import Marketplace from "./Marketplace";
 import {
   FarmerSupport,
   NurseryNetwork
} from "./CoordinatorModules";
import ProfileMenu from "./ProfileMenu";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "firebase/auth";

import {
  doc,
  setDoc,
  getDoc
} from "firebase/firestore";

import { auth, db } from "./firebase";
import "./App.css";

const API_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"
).replace(/\/+$/, "");
const AI_TIMEOUT = 120000;
const MAX_IMAGE_SIZE = 6 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
];

const MARKETPLACE_MODULES = [
  "Buy Seedlings",
  "Sell Vegetables",
  "My Orders",
  "Market Insights",
  "Seedling Inventory",
  "Customer Orders",
  "Sales Reports",
  "Browse Products",
  "Search Products",
  "My Purchases",
  "Price Insights",
  "Order Coordination",
  "Activity Reports"
];

// --------------------------------------------------
// API HELPERS
// --------------------------------------------------

const readApiResponse = async (response) => {
  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }

  if (!response.ok || data.success === false) {
    throw new Error(
      data.message || `Request failed with status ${response.status}.`
    );
  }

  return data;
};

const getRequestError = (error, defaultMessage) => {
  if (
    error?.name === "TimeoutError" ||
    error?.name === "AbortError"
  ) {
    return "The request took too long. Please try again.";
  }

  return error?.message || defaultMessage;
};

const postJson = async (endpoint, body) => {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_TIMEOUT)
  });

  return readApiResponse(response);
};

// --------------------------------------------------
// PLANT DISEASE REFERENCE IMAGE SEARCH
// --------------------------------------------------

async function searchDiseaseImages(query) {
  try {
    const searchUrl = new URL(
      "https://commons.wikimedia.org/w/api.php"
    );

    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("generator", "search");
    searchUrl.searchParams.set(
      "gsrsearch",
      `${query} plant disease`
    );
    searchUrl.searchParams.set("gsrnamespace", "6");
    searchUrl.searchParams.set("gsrlimit", "10");
    searchUrl.searchParams.set("gsrwhat", "text");
    searchUrl.searchParams.set("prop", "imageinfo");
    searchUrl.searchParams.set("iiprop", "url|mime");
    searchUrl.searchParams.set("iiurlwidth", "500");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("origin", "*");

    const response = await fetch(searchUrl.toString(), {
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      throw new Error("Image search request failed.");
    }

    const data = await response.json();
    const pages = Object.values(data.query?.pages || {});

    return pages
      .filter((page) => {
        const info = page.imageinfo?.[0];

        return (
          info &&
          ALLOWED_IMAGE_TYPES.includes(info.mime) &&
          Boolean(info.thumburl || info.url)
        );
      })
      .map((page) => {
        const info = page.imageinfo[0];

        return {
          title: page.title.replace(/^File:/, ""),
          url: info.thumburl || info.url,
          sourceUrl:
            info.descriptionurl ||
            `https://commons.wikimedia.org/wiki/${encodeURIComponent(
              page.title.replace(/ /g, "_")
            )}`
        };
      })
      .slice(0, 6);
  } catch (error) {
    console.error("Plant disease image search failed:", error);
    return [];
  }
}

// --------------------------------------------------
// ROLE DASHBOARD FEATURES
// --------------------------------------------------

const dashboardFeatures = {
  farmer: [
    ["🌱", "Crop Information", "Explore crop growing guides."],
    ["🌦️", "Weather Report", "Search weather for different locations."],
    ["🔬", "AI Plant Doctor", "Upload plant images for disease analysis."],
    ["🤖", "AI Agriculture Chatbot", "Ask questions about agriculture."],
    ["🩺", "Disease & Treatment Search", "Explore crop disease information."],
    ["🪴", "Buy Seedlings", "Find seedlings from nearby nurseries."],
    ["🛒", "Sell Vegetables", "List harvested products for buyers."],
    ["📦", "My Orders", "Track your seedling and produce orders."],
    ["📊", "Market Insights", "Explore agricultural demand and prices."]
  ],

  nursery: [
    ["🏡", "My Nursery", "Manage your nursery profile."],
    ["🌿", "Seedling Inventory", "Add seedlings, prices and stock."],
    ["📦", "Customer Orders", "View farmer seedling orders."],
    ["📊", "Sales Reports", "Monitor nursery sales."]
  ],

  buyer: [
    ["🥕", "Browse Products", "Discover fresh farm produce."],
    ["🔍", "Search Products", "Find agricultural products."],
    ["🛒", "My Purchases", "Manage your orders."],
    ["📊", "Price Insights", "Compare available product prices."]
  ],

  coordinator: [
    ["👨‍🌾", "Farmer Support", "Assist registered farmers."],
    ["🏡", "Nursery Network", "Monitor nursery activities."],
    ["📦", "Order Coordination", "Coordinate agricultural orders."],
    ["📊", "Activity Reports", "Review platform activities."]
  ]
};

// --------------------------------------------------
// REUSABLE IMAGE GRID
// --------------------------------------------------

function DiseaseImageGrid({ images }) {
  if (!images?.length) {
    return null;
  }

  return (
    <div className="disease-image-grid">
      {images.map((image) => (
        <article
          className="disease-image-card"
          key={image.sourceUrl}
        >
          <a
            href={image.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src={image.url}
              alt={image.title}
              loading="lazy"
            />
          </a>

          <p>{image.title}</p>

          <a
            href={image.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View image source
          </a>
        </article>
      ))}
    </div>
  );
}

// ==================================================
// MAIN APPLICATION
// ==================================================

function App() {
  const [showAgriculture, setShowAgriculture] = useState(false);
  const [activeModule, setActiveModule] = useState("");

  const [isLogin, setIsLogin] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    role: "farmer"
  });

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingUser, setCheckingUser] = useState(true);

  // CHATBOT
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatImages, setChatImages] = useState([]);
  const [chatImagesLoading, setChatImagesLoading] = useState(false);

  // PLANT DOCTOR
  const [plantImage, setPlantImage] = useState(null);
  const [cropName, setCropName] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [diagnosisDisclaimer, setDiagnosisDisclaimer] = useState("");
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState("");

  // TREATMENT SEARCH
  const [treatmentCrop, setTreatmentCrop] = useState("");
  const [treatmentDisease, setTreatmentDisease] = useState("");
  const [treatmentResult, setTreatmentResult] = useState("");
  const [treatmentDisclaimer, setTreatmentDisclaimer] = useState("");
  const [treatmentLoading, setTreatmentLoading] = useState(false);
  const [treatmentError, setTreatmentError] = useState("");
  const [treatmentImages, setTreatmentImages] = useState([]);
  const [treatmentImagesLoading, setTreatmentImagesLoading] = useState(false);

  // --------------------------------------------------
  // RESTORE FIREBASE AUTHENTICATION
  // --------------------------------------------------

  useEffect(() => {
    let mounted = true;

    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (!mounted) {
          return;
        }

        setUser(currentUser);
        setProfile(null);

        if (currentUser) {
          try {
            const profileDoc = await getDoc(
              doc(db, "users", currentUser.uid)
            );

            if (!mounted) {
              return;
            }

            if (profileDoc.exists()) {
              setProfile(profileDoc.data());
              setMessage("");
            } else {
              setMessage(
                "User profile not found. Please contact support."
              );
            }
          } catch (error) {
            if (!mounted) {
              return;
            }

            console.error("Profile loading error:", error);

            setMessage(
              "Unable to load profile: " + error.message
            );
          }
        } else {
          setProfile(null);
        }

        if (mounted) {
          setCheckingUser(false);
        }
      }
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // --------------------------------------------------
  // RESET MODULE DATA
  // --------------------------------------------------

  const resetModuleData = () => {
    setChatMessages([]);
    setChatQuestion("");
    setChatLoading(false);
    setChatImages([]);
    setChatImagesLoading(false);

    setPlantImage(null);
    setCropName("");
    setDiagnosis("");
    setDiagnosisError("");
    setDiagnosisDisclaimer("");
    setDiagnosisLoading(false);

    setTreatmentCrop("");
    setTreatmentDisease("");
    setTreatmentResult("");
    setTreatmentError("");
    setTreatmentDisclaimer("");
    setTreatmentLoading(false);
    setTreatmentImages([]);
    setTreatmentImagesLoading(false);
  };

  // --------------------------------------------------
  // DASHBOARD NAVIGATION
  // --------------------------------------------------

  const openModule = (moduleName) => {
    resetModuleData();

    if (moduleName === "Crop Information") {
      setActiveModule("");
      setShowAgriculture(true);
      return;
    }

    setShowAgriculture(false);
    setActiveModule(moduleName);
  };

  const backToDashboard = () => {
    setShowAgriculture(false);
    setActiveModule("");
    resetModuleData();
  };

  // --------------------------------------------------
  // FORM INPUT
  // --------------------------------------------------

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: value
    }));
  };

  // --------------------------------------------------
  // REGISTER
  // --------------------------------------------------

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage("");

    const name = form.name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();

    if (!name || !phone) {
      setMessage("Please enter your name and phone number.");
      return;
    }

    if (!/^\d{10}$/.test(phone)) {
      setMessage("Please enter a valid 10-digit phone number.");
      return;
    }

    if (form.password.length < 6) {
      setMessage("Password must contain at least 6 characters.");
      return;
    }

    try {
      setLoading(true);

      const result = await createUserWithEmailAndPassword(
        auth,
        email,
        form.password
      );

      const userData = {
        uid: result.user.uid,
        name,
        phone,
        email,
        role: form.role,
        createdAt: new Date().toISOString()
      };

      await setDoc(
        doc(db, "users", result.user.uid),
        userData
      );

      setUser(result.user);
      setProfile(userData);
      setMessage("Registration successful!");
    } catch (error) {
      console.error("Registration error:", error);

      setMessage(error.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------
  // LOGIN
  // --------------------------------------------------

  const handleLogin = async (e) => {
    e.preventDefault();
    setMessage("");

    const email = form.email.trim();

    if (!email || !form.password) {
      setMessage("Please enter your email and password.");
      return;
    }

    try {
      setLoading(true);

      const result = await signInWithEmailAndPassword(
        auth,
        email,
        form.password
      );

      const profileDoc = await getDoc(
        doc(db, "users", result.user.uid)
      );

      if (!profileDoc.exists()) {
        await signOut(auth);

        setUser(null);
        setProfile(null);

        setMessage(
          "User profile not found. Please register again or contact support."
        );

        return;
      }

      setUser(result.user);
      setProfile(profileDoc.data());
      setMessage("");
    } catch (error) {
      console.error("Login error:", error);

      setMessage(error.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------
  // FORGOT PASSWORD
  // --------------------------------------------------

  const handleForgotPassword = async () => {
    setMessage("");

    const email = form.email.trim();

    if (!email) {
      setMessage("Enter your registered email address first.");
      return;
    }

    try {
      setLoading(true);

      await sendPasswordResetEmail(auth, email);

      setMessage("Password reset link sent. Check your email.");
    } catch (error) {
      console.error("Password reset error:", error);

      setMessage(
        error.message || "Unable to send reset email."
      );
    } finally {
      setLoading(false);
    }
  };
// COPY FIREBASE USER ID
const copyUserId = async () => {
  if (!user?.uid) {
    setMessage("User ID is not available.");
    return;
  }

  try {
    await navigator.clipboard.writeText(user.uid);
    setMessage("User ID copied successfully!");
  } catch (error) {
    console.error("Copy User ID error:", error);
    setMessage("Unable to copy User ID. Please copy it manually.");
  }
};
  // --------------------------------------------------
  // LOGOUT
  // --------------------------------------------------

  const handleLogout = async () => {
    try {
      await signOut(auth);

      setUser(null);
      setProfile(null);
      setShowAgriculture(false);
      setActiveModule("");
      resetModuleData();
      setMessage("");
    } catch (error) {
      console.error("Logout error:", error);

      setMessage(error.message || "Logout failed.");
    }
  };

  // --------------------------------------------------
  // AI AGRICULTURE CHATBOT
  // --------------------------------------------------

  const sendChatMessage = async (e) => {
    e.preventDefault();

    if (!chatQuestion.trim() || chatLoading) {
      return;
    }

    const question = chatQuestion.trim();

    setChatMessages((previous) => [
      ...previous,
      {
        role: "user",
        text: question
      }
    ]);

    setChatQuestion("");
    setChatLoading(true);
    setChatImages([]);
    setChatImagesLoading(true);

    try {
      const data = await postJson("/api/ai/chat", {
        question
      });

      if (!data.answer) {
        throw new Error(
          "The AI service returned an empty answer."
        );
      }

      setChatMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text: data.answer
        }
      ]);

      // Reference image search does not block the AI response.
      searchDiseaseImages(question)
        .then((images) => {
          setChatImages(images);
        })
        .catch((error) => {
          console.error("Chat image search error:", error);
          setChatImages([]);
        })
        .finally(() => {
          setChatImagesLoading(false);
        });
    } catch (error) {
      console.error("FarmConnect chatbot error:", error);

      setChatMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text:
            "Unable to get an AI response: " +
            getRequestError(
              error,
              "Please check your backend server."
            )
        }
      ]);

      setChatImagesLoading(false);
    } finally {
      setChatLoading(false);
    }
  };

  // --------------------------------------------------
  // SELECT PLANT IMAGE
  // --------------------------------------------------

  const handlePlantImage = (e) => {
    const file = e.target.files?.[0];

    setDiagnosis("");
    setDiagnosisError("");
    setDiagnosisDisclaimer("");

    if (!file) {
      setPlantImage(null);
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setDiagnosisError(
        "Please select a JPG, PNG or WEBP image."
      );

      setPlantImage(null);
      e.target.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setDiagnosisError(
        "Image must be no more than 6 MB."
      );

      setPlantImage(null);
      e.target.value = "";
      return;
    }

    setPlantImage(file);
  };

  // --------------------------------------------------
  // AI PLANT DOCTOR
  // --------------------------------------------------

  const diagnosePlant = async (e) => {
    e.preventDefault();

    if (!plantImage) {
      setDiagnosisError("Please upload a plant image.");
      return;
    }

    try {
      setDiagnosisLoading(true);
      setDiagnosisError("");
      setDiagnosis("");
      setDiagnosisDisclaimer("");

      const imageBase64 = await new Promise(
        (resolve, reject) => {
          const reader = new FileReader();

          reader.onload = () => {
            resolve(reader.result);
          };

          reader.onerror = () => {
            reject(
              new Error("Unable to read the selected image.")
            );
          };

          reader.readAsDataURL(plantImage);
        }
      );

      const data = await postJson("/api/ai/diagnose", {
        imageBase64,
        mimeType: plantImage.type,
        cropName: cropName.trim()
      });

      if (!data.result) {
        throw new Error(
          "The AI service returned no diagnosis."
        );
      }

      setDiagnosis(data.result);
      setDiagnosisDisclaimer(data.disclaimer || "");
    } catch (error) {
      console.error("Plant diagnosis error:", error);

      setDiagnosisError(
        getRequestError(
          error,
          "Unable to analyze the plant image."
        )
      );
    } finally {
      setDiagnosisLoading(false);
    }
  };

  // --------------------------------------------------
  // DISEASE AND TREATMENT SEARCH
  // --------------------------------------------------

  const searchTreatment = async (e) => {
    e.preventDefault();

    const crop = treatmentCrop.trim();
    const disease = treatmentDisease.trim();

    if (!crop || !disease) {
      setTreatmentError(
        "Enter both crop and disease names."
      );
      return;
    }

    try {
      setTreatmentImages([]);
      setTreatmentLoading(true);
      setTreatmentError("");
      setTreatmentResult("");
      setTreatmentDisclaimer("");

      const data = await postJson("/api/ai/treatment", {
        crop,
        disease
      });

      if (!data.answer) {
        throw new Error(
          "No treatment information was returned."
        );
      }

      setTreatmentResult(data.answer);
      setTreatmentDisclaimer(data.disclaimer || "");

      setTreatmentImagesLoading(true);

      const images = await searchDiseaseImages(
        `${crop} ${disease}`
      );

      setTreatmentImages(images);
    } catch (error) {
      console.error("Treatment search error:", error);

      setTreatmentError(
        getRequestError(
          error,
          "Unable to search treatment information."
        )
      );
    } finally {
      setTreatmentLoading(false);
      setTreatmentImagesLoading(false);
    }
  };

  // --------------------------------------------------
  // LOADING SCREEN
  // --------------------------------------------------

  if (checkingUser) {
    return (
      <div className="app">
        <div className="auth-card">
          <h2>🌱 FarmConnect</h2>
          <p>Loading your account...</p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // ROLE DASHBOARD
  // --------------------------------------------------

  if (user && profile) {
    const role = profile.role;
    const features = dashboardFeatures[role] || [];

    return (
      <div className="dashboard">
      <header className="dashboard-header">
  <h2>🌱 FarmConnect</h2>

  <ProfileMenu
    user={user}
    profile={profile}
    onProfileUpdated={(updatedProfile) => {
      setProfile(updatedProfile);
      setMessage("");
    }}
    onLogout={handleLogout}
  />
</header>

        <main className="dashboard-content">
          {/* WELCOME BANNER */}

          {!showAgriculture && !activeModule && (
            <section className="welcome-banner">
              <p>WELCOME TO FARMCONNECT</p>

              <h1>Hello, {profile.name}! 👋</h1>
              <div className="user-id-card">
  <strong>Firebase User ID:</strong>

  <p>{user.uid}</p>

  <button type="button" onClick={copyUserId}>
    📋 Copy User ID
  </button>
</div>

              <p>
                Your agricultural journey starts here.
                Manage your activities with FarmConnect.
              </p>

              <span className="role-label">
                {String(role)
                  .replace(/_/g, " ")
                  .toUpperCase()}{" "}
                ACCOUNT
              </span>
            </section>
          )}

          {/* CROP INFORMATION */}

          {showAgriculture && (
            <Agriculture onBack={backToDashboard} />
          )}

          {/* DASHBOARD CARDS */}

          {!showAgriculture && !activeModule && (
            <section className="dashboard-section">
              <h2>Your Dashboard</h2>

              <p>
                Access the services available for your account.
              </p>

              {features.length > 0 ? (
                <div className="feature-grid">
                  {features.map((feature) => (
                    <button
                      className="feature-card"
                      key={feature[1]}
                      type="button"
                      onClick={() => openModule(feature[1])}
                    >
                      <span className="feature-icon">
                        {feature[0]}
                      </span>

                      <h3>{feature[1]}</h3>

                      <p>{feature[2]}</p>

                      <span className="coming-soon">
                        Open Module →
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="message">
                  No dashboard features are available for this account role.
                </p>
              )}
            </section>
          )}

          {/* WEATHER REPORT */}

          {!showAgriculture &&
            activeModule === "Weather Report" && (
              <WeatherReport onBack={backToDashboard} />
            )}

          {/* OTHER MODULES */}

          {!showAgriculture &&
            activeModule !== "" &&
            activeModule !== "Weather Report" && (
              <section className="dashboard-section">
                <button
                  className="agriculture-open-button"
                  type="button"
                  onClick={backToDashboard}
                >
                  ← Back to Dashboard
                </button>

                {/* MARKETPLACE */}

                {MARKETPLACE_MODULES.includes(activeModule) && (
                  <Marketplace page={activeModule} />
                )}

                {/* AI PLANT DOCTOR */}

                {activeModule === "AI Plant Doctor" && (
                  <div className="module-container">
                    <h2>🔬 AI Plant Doctor</h2>

                    <p>
                      Upload a clear plant image to receive a
                      preliminary AI assessment.
                    </p>

                    <form onSubmit={diagnosePlant}>
                      <input
                        type="text"
                        placeholder="Crop name (e.g. Tomato)"
                        value={cropName}
                        onChange={(e) =>
                          setCropName(e.target.value)
                        }
                      />

                      <label htmlFor="plant-image">
                        Upload Plant Image
                      </label>

                      <input
                        id="plant-image"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handlePlantImage}
                      />

                      {plantImage && (
                        <p>
                          Selected image: {plantImage.name}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={diagnosisLoading || !plantImage}
                      >
                        {diagnosisLoading
                          ? "Analyzing Image..."
                          : "Analyze Plant Image"}
                      </button>
                    </form>

                    {diagnosisError && (
                      <div className="message" role="alert">
                        {diagnosisError}
                      </div>
                    )}

                    {diagnosis && (
                      <div className="result-card">
                        <h3>AI Assessment Result</h3>

                        <p style={{ whiteSpace: "pre-wrap" }}>
                          {diagnosis}
                        </p>

                        {diagnosisDisclaimer && (
                          <p>{diagnosisDisclaimer}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* AI AGRICULTURE CHATBOT */}

                {activeModule === "AI Agriculture Chatbot" && (
                  <div className="module-container">
                    <h2>🤖 FarmConnect AI Assistant</h2>

                    <p>
                      Ask questions about crops, fruits, soil,
                      irrigation, nursery management and plant health.
                    </p>

                    <div className="chat-box" aria-live="polite">
                      {chatMessages.length === 0 && (
                        <p>
                          Welcome! Ask me an agriculture-related question.
                        </p>
                      )}

                      {chatMessages.map((item, index) => (
                        <div
                          key={`${index}-${item.role}`}
                          className={`chat-message ${item.role}`}
                        >
                          <strong>
                            {item.role === "user"
                              ? "You"
                              : "FarmConnect AI"}
                          </strong>

                          <p style={{ whiteSpace: "pre-wrap" }}>
                            {item.text}
                          </p>
                        </div>
                      ))}

                      {chatLoading && (
                        <p>FarmConnect AI is thinking...</p>
                      )}

                      {chatImagesLoading && (
                        <p>
                          Searching for plant disease reference images...
                        </p>
                      )}

                      <DiseaseImageGrid images={chatImages} />
                    </div>

                    <form onSubmit={sendChatMessage}>
                      <textarea
                        placeholder="Ask your agriculture question..."
                        value={chatQuestion}
                        onChange={(e) =>
                          setChatQuestion(e.target.value)
                        }
                        rows={3}
                        maxLength={3000}
                        required
                      />

                      <button
                        type="submit"
                        disabled={
                          chatLoading || !chatQuestion.trim()
                        }
                      >
                        {chatLoading
                          ? "Sending..."
                          : "Send Message"}
                      </button>
                    </form>
                  </div>
                )}

                {/* DISEASE AND TREATMENT SEARCH */}

                {activeModule === "Disease & Treatment Search" && (
                  <div className="module-container">
                    <h2>🩺 Disease & Treatment Search</h2>

                    <p>
                      Enter a crop and its suspected disease to
                      receive general disease-management information.
                    </p>

                    <form onSubmit={searchTreatment}>
                      <input
                        type="text"
                        placeholder="Enter crop name"
                        value={treatmentCrop}
                        onChange={(e) =>
                          setTreatmentCrop(e.target.value)
                        }
                        required
                      />

                      <input
                        type="text"
                        placeholder="Enter disease name"
                        value={treatmentDisease}
                        onChange={(e) =>
                          setTreatmentDisease(e.target.value)
                        }
                        required
                      />

                      <button
                        type="submit"
                        disabled={treatmentLoading}
                      >
                        {treatmentLoading
                          ? "Searching..."
                          : "Search Information"}
                      </button>
                    </form>

                    {treatmentError && (
                      <div className="message" role="alert">
                        {treatmentError}
                      </div>
                    )}

                    {treatmentResult && (
                      <div className="result-card">
                        <h3>Disease Management Information</h3>

                        <p style={{ whiteSpace: "pre-wrap" }}>
                          {treatmentResult}
                        </p>

                        {treatmentDisclaimer && (
                          <p>{treatmentDisclaimer}</p>
                        )}

                        {treatmentImagesLoading && (
                          <p>
                            Searching for disease reference images...
                          </p>
                        )}

                        <DiseaseImageGrid images={treatmentImages} />

                        {treatmentImages.length > 0 && (
                          <p className="image-disclaimer">
                            These are reference images, not a confirmed
                            diagnosis of your plant. Check the original
                            source and image-use permissions before reusing
                            images.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* MODULES NOT YET IMPLEMENTED */}

   {/* COORDINATOR MODULES */}

{activeModule === "Farmer Support" && (
  <FarmerSupport />
)}

{activeModule === "Nursery Network" && (
  <NurseryNetwork />
)}

{/* MY NURSERY */}

{activeModule === "My Nursery" ? (
  <div className="module-container">
    <h2>🌱 My Nursery</h2>

    <p>Welcome to your nursery dashboard!</p>

    <div className="nursery-dashboard">
      <button
        type="button"
        onClick={() => setActiveModule("Seedling Inventory")}
      >
        🌱 Seedling Inventory
      </button>

      <button
        type="button"
        onClick={() => setActiveModule("Customer Orders")}
      >
        📦 Customer Orders
      </button>

      <button
        type="button"
        onClick={() => setActiveModule("Sales Reports")}
      >
        📊 Sales Reports
      </button>
    </div>
  </div>
) : (
  !MARKETPLACE_MODULES.includes(activeModule) &&
  ![
    "AI Plant Doctor",
    "AI Agriculture Chatbot",
    "Disease & Treatment Search",
    "Farmer Support",
    "Nursery Network"
  ].includes(activeModule) && (
    <div className="module-container">
      <h2>{activeModule}</h2>

      <p>
        This module is not connected to its database
        operations yet.
      </p>
    </div>
  )
)}
              </section>
            )}
        </main>

        <footer className="dashboard-footer">
          FarmConnect © 2026 | Smart Agriculture Ecosystem
        </footer>
      </div>
    );
  }

  // --------------------------------------------------
  // LOGIN AND REGISTRATION
  // --------------------------------------------------

  return (
    <div className="app">
      <div className="auth-card">
        <h1>🌱 FarmConnect</h1>

        <p className="subtitle">
          Connecting Farmers, Nurseries and Buyers
        </p>

        <div className="tabs">
          <button
            type="button"
            className={isLogin ? "active" : ""}
            onClick={() => {
              setIsLogin(true);
              setMessage("");
            }}
          >
            Login
          </button>

          <button
            type="button"
            className={!isLogin ? "active" : ""}
            onClick={() => {
              setIsLogin(false);
              setMessage("");
            }}
          >
            Register
          </button>
        </div>

        <form onSubmit={isLogin ? handleLogin : handleRegister}>
          {!isLogin && (
            <>
              <input
                name="name"
                placeholder="Full Name"
                value={form.name}
                onChange={handleChange}
                autoComplete="name"
                required
              />

              <input
                name="phone"
                type="tel"
                placeholder="10-digit Phone Number"
                value={form.phone}
                onChange={handleChange}
                maxLength={10}
                inputMode="numeric"
                autoComplete="tel"
                required
              />

              <select
                name="role"
                value={form.role}
                onChange={handleChange}
              >
                <option value="farmer">Farmer</option>
                <option value="nursery">Nursery Owner</option>
                <option value="buyer">Buyer</option>
                <option value="coordinator">Coordinator</option>
              </select>
            </>
          )}

          <input
            type="email"
            name="email"
            placeholder="Email Address"
            value={form.email}
            onChange={handleChange}
            autoComplete="email"
            required
          />

          <input
            type="password"
            name="password"
            placeholder="Password (minimum 6 characters)"
            value={form.password}
            onChange={handleChange}
            minLength={6}
            autoComplete={
              isLogin ? "current-password" : "new-password"
            }
            required
          />

          {isLogin && (
            <div className="forgot-password">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
              >
                Forgot Password?
              </button>
            </div>
          )}

          <button type="submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : isLogin
                ? "Login"
                : "Create Account"}
          </button>
        </form>

        {message && (
          <p className="message" role="status">
            {message}
          </p>
        )}

        <p className="footer">
          FarmConnect © 2026 | Smart Agriculture Ecosystem
        </p>
      </div>
    </div>
  );
}

export default App;