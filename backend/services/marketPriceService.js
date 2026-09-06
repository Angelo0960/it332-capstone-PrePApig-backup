import ai from "../config/gemini.js";
import supabase from "../config/supabase.js";
import { searchGoogle } from "./searchApiService.js";
import { DEFAULT_LOCATION } from "../config/constants.js";

function validateMarketResult(result) {
    const requiredFields = [
        "location",
        "price_min",
        "price_max",
        "price_unit",
        "reported_date",
        "confidence",
        "summary",
    ];
    for (const field of requiredFields) {
        if (!(field in result)) {
            throw new Error(`Missing required field: ${field}`);
        }
    }
    if (!["High", "Moderate", "Low"].includes(result.confidence)) {
        throw new Error(`Invalid confidence: ${result.confidence}`);
    }
    if (result.price_min !== null && typeof result.price_min !== "number") {
        throw new Error("price_min must be number or null");
    }
    if (result.price_max !== null && typeof result.price_max !== "number") {
        throw new Error("price_max must be number or null");
    }
    if (
        result.reported_date !== null &&
        !/^\d{4}-\d{2}-\d{2}$/.test(result.reported_date)
    ) {
        throw new Error("reported_date must be YYYY-MM-DD or null");
    }
}

export async function refreshMarketPrice(
    location = DEFAULT_LOCATION
) {
    const now = new Date();

    try {
        // 1. Search the web using SearchApi
        const searchResults = await searchGoogle(
            `"live hog price" "${location}"`
        );

        // 2. Give the search results to Gemini
        const prompt = `
You are an agricultural market intelligence assistant
for a pig farming management system called PrePApig.

Determine the most recent LIVE HOG price from the
Google search results below.

Requested location:
${location}

IMPORTANT:
- Only use LIVE HOG / LIVE PIG / FARMGATE HOG prices.
- Do NOT use retail pork prices.
- Do NOT invent prices.
- Prefer recent information.
- Prefer Philippine government and agricultural sources.
- If the exact location is unavailable, use a nearby
  Batangas source and clearly identify the actual location.
- Include the reported date when available.

Google search results:

${JSON.stringify(searchResults.organic_results || [], null, 2)}

Return ONLY valid JSON:

{
  "location": "actual location of reported price",
  "price_min": number or null,
  "price_max": number or null,
  "price_unit": "PHP/kg",
  "reported_date": "YYYY-MM-DD" or null,
  "confidence": "High" | "Moderate" | "Low",
  "summary": "short market summary"
}
`;

        const response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: prompt,
        });

        const text = response.text;

        if (!text) {
            throw new Error(
                "Gemini returned an empty response."
            );
        }

        const cleanText = text
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        const result = JSON.parse(cleanText);

        validateMarketResult(result);

        // 3. Save result to Supabase
        const expiresAt = new Date(
            now.getTime() + 6 * 60 * 60 * 1000
        );

        const sources =
            (searchResults.organic_results || []).map(
                (item) => ({
                    title: item.title,
                    url: item.link,
                    snippet: item.snippet,
                })
            );

        const { data, error } = await supabase
            .from("market_price_reports")
            .insert({
                location,
                price_min: result.price_min,
                price_max: result.price_max,
                price_unit:
                    result.price_unit || "PHP/kg",
                reported_date: result.reported_date,
                reported_location: result.location,
                summary: result.summary,
                confidence: result.confidence,
                sources,
                checked_at: now.toISOString(),
                expires_at: expiresAt.toISOString(),
                status: "success",
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        return data;

    } catch (error) {
        console.error(
            "Market price refresh failed:",
            error
        );

        throw error;
    }
}