import supabase from "../config/supabase.js";
import { refreshMarketPrice } from "./marketPriceService.js";
import { DEFAULT_LOCATION } from "../config/constants.js";


export async function getLatestMarketPrice(
    location = DEFAULT_LOCATION
) {

    // -----------------------------------------
    // Get latest cached report
    // -----------------------------------------

    const {
        data,
        error,
    } = await supabase
        .from(
            "market_price_reports"
        )
        .select("*")
        .eq(
            "location",
            location
        )
        .eq(
            "status",
            "success"
        )
        .order(
            "checked_at",
            {
                ascending: false,
            }
        )
        .limit(1)
        .maybeSingle();


    if (error) {
        throw error;
    }


    // -----------------------------------------
    // No cached report
    // -----------------------------------------

    if (!data) {

        console.log(
            `No cached market price found for ${location}.`
        );

        return await refreshMarketPrice(
            location
        );
    }


    // -----------------------------------------
    // Check expiration
    // -----------------------------------------

    const now =
        new Date();

    const expiresAt =
        new Date(
            data.expires_at
        );


    // -----------------------------------------
    // Cache still valid
    // -----------------------------------------

    if (
        expiresAt > now
    ) {

        console.log(
            `Using cached market price for ${location}.`
        );

        return data;
    }


    // -----------------------------------------
    // Cache expired
    // -----------------------------------------

    console.log(
        `Cached market price expired for ${location}.`
    );

    return await refreshMarketPrice(
        location
    );
}