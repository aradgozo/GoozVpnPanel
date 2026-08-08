import crypto from "crypto";

export default async function handler(request, response) {

    if (request.method !== "POST") {
        return response.status(405).json({
            success: false,
            error: "Method not allowed."
        });
    }

    try {

        const {
            name,
            config,
            sourceUrl
        } = request.body;

        if (!name || !config || !sourceUrl) {
            return response.status(400).json({
                success: false,
                error: "Name, config, and X4G URL are required."
            });
        }

        /*
         * Only accept X4G public status pages.
         */

        let parsedUrl;

        try {
            parsedUrl = new URL(sourceUrl);
        } catch {
            return response.status(400).json({
                success: false,
                error: "Invalid X4G URL."
            });
        }

        if (!parsedUrl.pathname.startsWith("/p/")) {
            return response.status(400).json({
                success: false,
                error: "X4G URL must use /p/."
            });
        }

        /*
         * Generate a random UUID.
         */

        const pageId = crypto.randomUUID();

        const supabaseUrl =
            process.env.SUPABASE_URL
                .replace(/\/rest\/v1\/?$/, "");

        const supabaseKey =
            process.env.SUPABASE_SECRET_KEY;

        /*
         * Only store the information we actually need.
         */

        const result = await fetch(
            `${supabaseUrl}/rest/v1/vpns`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "apikey": supabaseKey,
                    "Authorization": `Bearer ${supabaseKey}`,
                    "Prefer": "return=minimal"
                },

                body: JSON.stringify({
                    page_id: pageId,
                    name: name,
                    config: config,
                    source_url: sourceUrl
                })
            }
        );

        if (!result.ok) {

            const errorText =
                await result.text();

            return response.status(500).json({
                success: false,
                error: errorText
            });
        }

        return response.status(200).json({
            success: true,
            id: pageId
        });

    } catch (error) {

        return response.status(500).json({
            success: false,
            error: error.message
        });
    }
}
