function toEnglishNumbers(text) {
    return String(text)
        .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
        .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function parseTraffic(value) {
    if (!value) return null;

    const text = toEnglishNumbers(value)
        .replace(/,/g, "")
        .trim();

    const match = text.match(
        /([\d.]+)\s*(B|KB|MB|GB|TB)/i
    );

    if (!match) return null;

    const number = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    const multiplier = {
        B: 1,
        KB: 1024,
        MB: 1024 ** 2,
        GB: 1024 ** 3,
        TB: 1024 ** 4
    };

    return number * multiplier[unit];
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

function htmlToText(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
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

        /*
         * Get only the VPN information we need.
         */

        const databaseResponse = await fetch(
            `${supabaseUrl}/rest/v1/vpns?select=name,config,source_url&page_id=eq.${encodeURIComponent(id)}`,
            {
                headers: {
                    apikey: supabaseKey,
                    Authorization: `Bearer ${supabaseKey}`
                }
            }
        );

        if (!databaseResponse.ok) {

            return response.status(500).json({
                success: false,
                error: await databaseResponse.text()
            });
        }

        const rows =
            await databaseResponse.json();

        if (!rows.length) {

            return response.status(404).json({
                success: false,
                error: "VPN page not found."
            });
        }

        const vpn = rows[0];

        /*
         * Fetch the X4G status page.
         */

        const x4gResponse =
            await fetch(vpn.source_url, {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0"
                }
            });

        if (!x4gResponse.ok) {

            return response.status(502).json({
                success: false,
                error:
                    `X4G returned HTTP ${x4gResponse.status}`
            });
        }

        const html =
            await x4gResponse.text();

        const text =
            htmlToText(html);

        /*
         * Find:
         *
         * 59.3 KB مصرف شده
         *
         * and:
         *
         * سهمیه: ∞
         */

        const usedMatch =
            text.match(
                /([\d.,]+\s*(?:B|KB|MB|GB|TB))\s*مصرف\s*شده/i
            );

        const quotaMatch =
            text.match(
                /سهمیه\s*[:：]?\s*(∞|[\d.,]+\s*(?:B|KB|MB|GB|TB))/i
            );

        let usedBytes = null;
        let quotaBytes = null;
        let unlimited = false;

        if (usedMatch) {
            usedBytes =
                parseTraffic(usedMatch[1]);
        }

        if (quotaMatch) {

            const quota =
                quotaMatch[1].trim();

            if (quota === "∞") {
                unlimited = true;
            } else {
                quotaBytes =
                    parseTraffic(quota);
            }
        }

        let remainingBytes = null;

        if (
            !unlimited &&
            usedBytes !== null &&
            quotaBytes !== null
        ) {
            remainingBytes =
                Math.max(
                    0,
                    quotaBytes - usedBytes
                );
        }

        /*
         * IMPORTANT:
         *
         * We do NOT use the old database
         * expiration field anymore.
         */

        return response.status(200).json({

            success: true,

            vpn: {

                name: vpn.name,

                config: vpn.config,

                traffic: {

                    used:
                        formatTraffic(usedBytes),

                    usedBytes,

                    limit:
                        unlimited
                            ? "Unlimited"
                            : formatTraffic(quotaBytes),

                    limitBytes:
                        quotaBytes,

                    remaining:
                        unlimited
                            ? "Unlimited"
                            : formatTraffic(
                                remainingBytes
                            ),

                    remainingBytes,

                    unlimited
                },

                /*
                 * Expiration will be added from X4G
                 * after we identify its exact format.
                 */
                expiration: null
            }
        });

    } catch (error) {

        return response.status(500).json({
            success: false,
            error: error.message
        });
    }
}
