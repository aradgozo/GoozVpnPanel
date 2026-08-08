function toEnglishNumbers(text) {
    return text
        .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
        .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function parseTraffic(text) {
    const cleaned = toEnglishNumbers(text)
        .replace(/,/g, "")
        .trim();

    const match = cleaned.match(
        /([\d.]+)\s*(B|KB|MB|GB|TB)/i
    );

    if (!match) {
        return null;
    }

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    const multipliers = {
        B: 1,
        KB: 1024,
        MB: 1024 ** 2,
        GB: 1024 ** 3,
        TB: 1024 ** 4
    };

    return value * multipliers[unit];
}

function formatTraffic(bytes) {

    if (bytes === null || bytes === undefined) {
        return "Unknown";
    }

    if (bytes < 1024) {
        return `${bytes.toFixed(0)} B`;
    }

    if (bytes < 1024 ** 2) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    if (bytes < 1024 ** 3) {
        return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    }

    if (bytes < 1024 ** 4) {
        return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    }

    return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
}

function stripHTML(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .trim();
}

export default async function handler(request, response) {

    try {

        const { id } = request.query;

        if (!id) {
            return response.status(400).json({
                success: false,
                error: "Missing page ID."
            });
        }

        const supabaseUrl =
            process.env.SUPABASE_URL
                .replace(/\/rest\/v1\/?$/, "");

        const supabaseKey =
            process.env.SUPABASE_SECRET_KEY;

        // Get the VPN from our private database.
        const result = await fetch(
            `${supabaseUrl}/rest/v1/vpns?select=name,config,source_url,traffic_limit,expiration&page_id=eq.${encodeURIComponent(id)}`,
            {
                headers: {
                    apikey: supabaseKey,
                    Authorization: `Bearer ${supabaseKey}`
                }
            }
        );

        if (!result.ok) {

            const errorText = await result.text();

            return response.status(500).json({
                success: false,
                error: errorText
            });
        }

        const data = await result.json();

        if (!data.length) {
            return response.status(404).json({
                success: false,
                error: "VPN page not found."
            });
        }

        const vpn = data[0];

        // Fetch the private X4G status page.
        const x4gResponse = await fetch(vpn.source_url);

        if (!x4gResponse.ok) {

            return response.status(502).json({
                success: false,
                error: "Could not reach the X4G status page."
            });
        }

        const x4gHTML = await x4gResponse.text();

        const text = stripHTML(x4gHTML);

        /*
         * X4G examples:
         *
         * 59.3 KB مصرف شده
         * سهمیه: ∞
         */

        const usedMatch = text.match(
            /([\d.,]+\s*(?:B|KB|MB|GB|TB))\s*مصرف\s*شده/i
        );

        const quotaMatch = text.match(
            /سهمیه\s*[:：]?\s*([∞\d.,]+\s*(?:B|KB|MB|GB|TB)?)/i
        );

        let usedBytes = null;
        let quotaBytes = null;
        let unlimited = false;

        if (usedMatch) {
            usedBytes = parseTraffic(usedMatch[1]);
        }

        if (quotaMatch) {

            const quotaText =
                quotaMatch[1].trim();

            if (
                quotaText.includes("∞") ||
                quotaText.toLowerCase().includes("unlimited")
            ) {
                unlimited = true;
            } else {
                quotaBytes =
                    parseTraffic(quotaText);
            }
        }

        let remainingBytes = null;

        if (!unlimited && quotaBytes !== null && usedBytes !== null) {
            remainingBytes =
                Math.max(0, quotaBytes - usedBytes);
        }

        return response.status(200).json({
            success: true,

            vpn: {
                name: vpn.name,
                config: vpn.config,

                traffic: {
                    used: formatTraffic(usedBytes),
                    usedBytes: usedBytes,

                    limit: unlimited
                        ? "Unlimited"
                        : formatTraffic(quotaBytes),

                    limitBytes: quotaBytes,

                    remaining: unlimited
                        ? "Unlimited"
                        : formatTraffic(remainingBytes),

                    remainingBytes: remainingBytes,

                    unlimited: unlimited
                },

                expiration: vpn.expiration
            }
        });

    } catch (error) {

        return response.status(500).json({
            success: false,
            error: error.message
        });
    }
}
