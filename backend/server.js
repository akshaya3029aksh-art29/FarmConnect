// FarmConnect/backend/server.js

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 5000;
const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:5173";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

app.use(
  cors({
    origin: [
      FRONTEND_URL,
      "http://localhost:5173",
      "http://localhost:5174",
    ],
  })
);

app.use(express.json({ limit: "12mb" }));

// --------------------------------------------------
// COMMON API HELPER
// --------------------------------------------------

async function fetchJson(url, timeout = 60000, options = {}) {
  let response;

  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    if (
      error.name === "TimeoutError" ||
      error.name === "AbortError"
    ) {
      throw new Error(
        `The external service timed out after ${timeout / 1000} seconds.`
      );
    }

    throw new Error(
      "Could not connect to the external service. Check your internet connection."
    );
  }

  const raw = await response.text();
  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      "The external service returned an invalid response."
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        data?.reason ||
        `External service returned HTTP ${response.status}.`
    );
  }

  return data;
}

// --------------------------------------------------
// FALLBACK LOCATION SEARCH
// OpenStreetMap / Nominatim
// --------------------------------------------------

async function searchFallbackLocations(query) {
  const url = new URL(
    "https://nominatim.openstreetmap.org/search"
  );

  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "10");
  url.searchParams.set("addressdetails", "1");

  const results = await fetchJson(
    url.toString(),
    15000,
    {
      headers: {
        "User-Agent": "FarmConnectWeather/1.0",
        Accept: "application/json",
      },
    }
  );

  if (!Array.isArray(results)) {
    return [];
  }

  return results
    .filter((place) => {
      const latitude = Number(place.lat);
      const longitude = Number(place.lon);

      return (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180
      );
    })
    .map((place) => {
      const address = place.address || {};

      return {
        id: `${place.lat},${place.lon}`,
        name:
          address.city ||
          address.town ||
          address.village ||
          address.municipality ||
          address.hamlet ||
          place.name ||
          query,
        region: [
          address.state_district,
          address.state,
        ]
          .filter(Boolean)
          .join(", "),
        country: address.country || "",
        latitude: Number(place.lat),
        longitude: Number(place.lon),
      };
    });
}

// --------------------------------------------------
// GEMINI AI HELPER
// --------------------------------------------------

async function askGemini(
  prompt,
  systemInstruction = ""
) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is missing in backend/.env."
    );
  }

  const startedAt = Date.now();

  console.log(`\n[AI] Request started: ${GEMINI_MODEL}`);
  console.log("[AI] Waiting for Gemini response...");

  try {
    const data = await fetchJson(
      GEMINI_URL,
      60000,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 800,
          },
        }),
      }
    );

    const answer = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("\n")
      .trim();

    if (!answer) {
      const reason =
        data?.promptFeedback?.blockReason ||
        data?.candidates?.[0]?.finishReason;

      throw new Error(
        reason
          ? `The AI could not generate an answer. Reason: ${reason}.`
          : "The AI service returned an empty response."
      );
    }

    console.log("[AI] Request successful.");
    console.log(
      `[AI] Response time: ${Date.now() - startedAt} ms`
    );
    console.log("[AI] Answer:\n" + answer);
    console.log("----------------------------------------\n");

    return answer;
  } catch (error) {
    console.error(
      `[AI] Failed after ${Date.now() - startedAt} ms:`,
      error.message
    );

    throw error;
  }
}

// --------------------------------------------------
// AI ERROR HANDLER
// --------------------------------------------------

function sendAIError(res, error) {
  const message =
    error?.message || "AI service failed.";

  const lowerMessage = message.toLowerCase();

  console.error("[AI ERROR]", message);

  if (lowerMessage.includes("gemini_api_key")) {
    return res.status(503).json({
      success: false,
      message:
        "AI is not configured. Check backend/.env.",
    });
  }

  if (
    lowerMessage.includes("timed out") ||
    error?.name === "TimeoutError" ||
    error?.name === "AbortError"
  ) {
    return res.status(504).json({
      success: false,
      message:
        "The AI request timed out. Please try again.",
    });
  }

  if (
    lowerMessage.includes("quota") ||
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("resource_exhausted")
  ) {
    return res.status(429).json({
      success: false,
      message:
        "The AI service limit was reached. Please try again later.",
    });
  }

  return res.status(502).json({
    success: false,
    message: `AI service error: ${message}`,
  });
}

// --------------------------------------------------
// BASIC ROUTES
// --------------------------------------------------

app.get("/", (req, res) => {
  res.send("FarmConnect backend is running.");
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "FarmConnect API is running.",
    aiConfigured: Boolean(GEMINI_API_KEY),
    aiModel: GEMINI_MODEL,
    weatherProvider: "Open-Meteo",
    locationSearchFallback: "OpenStreetMap Nominatim",
  });
});

// --------------------------------------------------
// WEATHER LOCATION SEARCH
// Worldwide location search with fallback
// --------------------------------------------------

app.get("/api/weather/search", async (req, res) => {
  const query = String(req.query.q || "").trim();

  if (query.length < 2) {
    return res.status(400).json({
      success: false,
      message:
        "Enter at least two characters to search.",
    });
  }

  const uniqueLocations = new Map();
  let openMeteoError = null;

  // First, search worldwide using Open-Meteo.
  try {
    const url = new URL(
      "https://geocoding-api.open-meteo.com/v1/search"
    );

    url.searchParams.set("name", query);
    url.searchParams.set("count", "10");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");

    const data = await fetchJson(
      url.toString(),
      15000
    );

    for (const place of data.results || []) {
      if (
        !Number.isFinite(place.latitude) ||
        !Number.isFinite(place.longitude)
      ) {
        continue;
      }

      const id =
        `${place.latitude},${place.longitude}`;

      uniqueLocations.set(id, {
        id,
        name: place.name,
        region: [
          place.admin2,
          place.admin1,
        ]
          .filter(Boolean)
          .join(", "),
        country: place.country || "",
        latitude: place.latitude,
        longitude: place.longitude,
      });
    }
  } catch (error) {
    openMeteoError = error;

    console.error(
      "[OPEN-METEO SEARCH ERROR]",
      error.message
    );
  }

  // If no locations were found, use OpenStreetMap.
  if (uniqueLocations.size === 0) {
    try {
      const fallbackLocations =
        await searchFallbackLocations(query);

      for (const place of fallbackLocations) {
        uniqueLocations.set(place.id, place);
      }
    } catch (error) {
      console.error(
        "[FALLBACK LOCATION SEARCH ERROR]",
        error.message
      );
    }
  }

  // Return matching locations.
  if (uniqueLocations.size > 0) {
    return res.json({
      success: true,
      locations: Array.from(
        uniqueLocations.values()
      ),
    });
  }

  // Both services failed or could not be reached.
  if (openMeteoError) {
    return res.status(502).json({
      success: false,
      message:
        "Location search services are temporarily unavailable. Please try again.",
    });
  }

  // Services responded, but no matching place was found.
  return res.json({
    success: true,
    locations: [],
    message:
      `No matching locations were found for "${query}". Try adding a state or country, or check the spelling.`,
  });
});

// --------------------------------------------------
// WEATHER FORECAST
// Current weather and seven-day forecast
// --------------------------------------------------

app.get("/api/weather", async (req, res) => {
  try {
    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);

    const name = String(
      req.query.name || ""
    ).trim();

    const region = String(
      req.query.region || ""
    ).trim();

    const country = String(
      req.query.country || ""
    ).trim();

    if (
      req.query.latitude === undefined ||
      req.query.longitude === undefined ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Select a valid location from the search results.",
      });
    }

    const url = new URL(
      "https://api.open-meteo.com/v1/forecast"
    );

    url.searchParams.set(
      "latitude",
      String(latitude)
    );

    url.searchParams.set(
      "longitude",
      String(longitude)
    );

    url.searchParams.set(
      "current",
      [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "precipitation",
        "weather_code",
        "wind_speed_10m",
      ].join(",")
    );

    url.searchParams.set(
      "daily",
      [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_probability_max",
      ].join(",")
    );

    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "7");

    const data = await fetchJson(
      url.toString(),
      20000
    );

    if (
      !data.current ||
      !data.daily ||
      !Array.isArray(data.daily.time) ||
      data.daily.time.length === 0
    ) {
      throw new Error(
        "Weather data is unavailable for this location. Please try a nearby town."
      );
    }

    return res.json({
      success: true,
      provider: "Open-Meteo",
      location: {
        name: name || "Selected location",
        region,
        country,
        latitude,
        longitude,
      },
      current: data.current,
      daily: data.daily,
      current_units: data.current_units,
      daily_units: data.daily_units,
    });
  } catch (error) {
    console.error(
      "[WEATHER ERROR]",
      error.message
    );

    return res.status(502).json({
      success: false,
      message: error.message,
    });
  }
});

// --------------------------------------------------
// AI AGRICULTURE CHATBOT
// --------------------------------------------------

app.post("/api/ai/chat", async (req, res) => {
  try {
    const question = String(
      req.body?.question || ""
    ).trim();

    if (!question) {
      return res.status(400).json({
        success: false,
        message: "Please enter a question.",
      });
    }

    if (question.length > 3000) {
      return res.status(400).json({
        success: false,
        message:
          "Question must be 3000 characters or fewer.",
      });
    }

    const answer = await askGemini(
      question,
      "You are FarmConnect, an agriculture assistant. " +
        "Give clear, practical, safe farming guidance. " +
        "Mention when a local agricultural expert should be consulted."
    );

    return res.json({
      success: true,
      answer,
    });
  } catch (error) {
    return sendAIError(res, error);
  }
});

// --------------------------------------------------
// AI PLANT DISEASE DIAGNOSIS
// --------------------------------------------------

app.post("/api/ai/diagnose", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY is missing in backend/.env."
      );
    }

    const {
      imageBase64,
      mimeType,
      cropName,
    } = req.body || {};

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({
        success: false,
        message: "Please upload a plant image.",
      });
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({
        success: false,
        message:
          "Only JPG, PNG and WEBP images are supported.",
      });
    }

    const cleanedImage = String(
      imageBase64
    ).replace(
      /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
      ""
    );

    const imageBuffer = Buffer.from(
      cleanedImage,
      "base64"
    );

    if (
      imageBuffer.length === 0 ||
      imageBuffer.length > 6 * 1024 * 1024
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Image must be larger than 0 bytes and no more than 6 MB.",
      });
    }

    const prompt =
      `Examine this plant image. Crop: ${String(cropName || "Not specified")}. ` +
      "Describe visible symptoms, possible diseases or pests, and confidence level. " +
      "Give safe, practical management and prevention steps. " +
      "If the image is unclear, say so. Do not claim a confirmed diagnosis.";

    console.log(
      "[PLANT DOCTOR] Sending image for analysis..."
    );

    const data = await fetchJson(
      GEMINI_URL,
      60000,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: cleanedImage,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1000,
          },
        }),
      }
    );

    const result = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("\n")
      .trim();

    if (!result) {
      throw new Error(
        "The AI service returned an empty response."
      );
    }

    console.log(
      "[PLANT DOCTOR] Diagnosis response:\n" + result
    );

    return res.json({
      success: true,
      result,
      disclaimer:
        "This is an AI-assisted suggestion, not a confirmed diagnosis. " +
        "Consult a local agricultural expert before treatment.",
    });
  } catch (error) {
    return sendAIError(res, error);
  }
});

// --------------------------------------------------
// DISEASE AND TREATMENT GUIDANCE
// --------------------------------------------------

app.post("/api/ai/treatment", async (req, res) => {
  try {
    const crop = String(
      req.body?.crop || ""
    ).trim();

    const disease = String(
      req.body?.disease || ""
    ).trim();

    if (!crop || !disease) {
      return res.status(400).json({
        success: false,
        message:
          "Enter both crop name and disease name.",
      });
    }

    const answer = await askGemini(
      `For crop "${crop}" and disease "${disease}", explain:
1. Common symptoms
2. Possible causes
3. Prevention methods
4. Integrated pest and disease management
5. Safe treatment options
6. When to consult an agricultural officer.

Avoid unsupported pesticide dosages. Recommend following local agricultural guidance and product labels.`,
      "You are a careful agricultural disease and crop management assistant. " +
        "Give practical, safe, clearly organized information."
    );

    return res.json({
      success: true,
      answer,
      disclaimer:
        "Confirm disease identification with a qualified agricultural expert. " +
        "Follow local product labels and agricultural department recommendations.",
    });
  } catch (error) {
    return sendAIError(res, error);
  }
});

// --------------------------------------------------
// UNKNOWN ROUTES
// --------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found.",
  });
});

// --------------------------------------------------
// SERVER ERROR HANDLER
// --------------------------------------------------

app.use((error, req, res, next) => {
  console.error(
    "[SERVER ERROR]",
    error.message
  );

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    success: false,
    message:
      "An internal server error occurred.",
  });
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `FarmConnect backend running on port ${PORT}`
  );

  console.log(
    `Frontend allowed: ${FRONTEND_URL}`
  );

  console.log(
    `AI model: ${GEMINI_MODEL}`
  );

  console.log(
    `AI configured: ${Boolean(GEMINI_API_KEY)}`
  );
});