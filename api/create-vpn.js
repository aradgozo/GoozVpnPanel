import crypto from "crypto";

export default async function handler(request, response) {

    if (request.method !== "POST") {
        return response.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    try {

        const {
            name,
            config,
            sourceUrl,
            trafficLimit,
            expiration
        } = request.body;

        if (!name || !config || !sourceUrl) {
            return response.status(400).json({
                success: false,
                error: "Missing required fields."
            });
        }

        const pageId = crypto.randomUUID();

        const supabaseUrl =
            process.env.SUPABASE_URL
                .replace(/\/rest\/v1\/?$/, "");

        const supabaseKey =
            process.env.SUPABASE_SECRET_KEY;

        const result = await fetch(
            `${supabaseUrl}/rest/v1/vpns`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "apikey": supabaseKey,
                    "Authorization": `Bearer ${supabaseKey}`,
                    "Prefer": "return=representation"
                },

                body: JSON.stringify({
                    id: pageId,
                    name: name,
                    config: config,
                    source_url: sourceUrl,
                    traffic_limit: trafficLimit || null,
                    expiration: expiration || null
                })
            }
        );

        if (!result.ok) {

            const errorText = await result.text();

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
