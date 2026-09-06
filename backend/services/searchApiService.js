export async function searchGoogle(query) {
    const url = new URL(
        "https://www.searchapi.io/api/v1/search"
    );

    url.searchParams.set("engine", "google");
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", process.env.SEARCHAPI_API_KEY);
    url.searchParams.set("gl", "ph");
    url.searchParams.set("hl", "en");

    const response = await fetch(url);

    if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
            `SearchApi error ${response.status}: ${errorText}`
        );
    }

    return await response.json();
}