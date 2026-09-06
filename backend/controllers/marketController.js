import {
    getLatestMarketPrice,
} from "../services/marketPriceCacheService.js";

import {
    refreshMarketPrice,
} from "../services/marketPriceService.js";

import { DEFAULT_LOCATION } from "../config/constants.js";


export const getPigMarketPrice =
    async (req, res) => {

        try {

            const location =
                req.query.location ||
                DEFAULT_LOCATION;


            const report =
                await getLatestMarketPrice(
                    location
                );


            const now = new Date();

            const expiresAt =
                new Date(
                    report.expires_at
                );


            res.json({

                success: true,

                cached:
                    expiresAt > now,

                report,

            });

        } catch (error) {

            console.error(
                "Get market price error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Failed to retrieve market information.",

            });
        }
    };


export const refreshPigMarketPrice =
    async (req, res) => {

        try {

            const location =
                req.query.location ||
                DEFAULT_LOCATION;


            const report =
                await refreshMarketPrice(
                    location
                );


            res.json({

                success: true,

                report,

            });

        } catch (error) {

            console.error(
                "Refresh market price error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Failed to refresh market information.",

            });
        }
    };