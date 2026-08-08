function toEnglishNumbers(text) {
    return String(text)
        .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
        .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function decodeHtml(text) {
    return text
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x27;/gi, "'");
}

function htmlToText(html) {

    let text = html;

    // Remove scripts and styles.
    text = text.replace(
        /<script[\s\S]*?<\/script>/gi,
        " "
    );

    text = text.replace(
        /<style[\s\S]*?<\/style>/gi,
        " "
    );

    // Convert common HTML separators to spaces.
    text = text.replace(
        /<\/(div|p|section|article|li|tr|td|th|h1|h2|h3|h4|h5|h6)>/gi,
        " "
    );

    // Remove remaining HTML tags.
    text = text.replace(
        /<[^>]*>/g,
        " "
    );

    text = decodeHtml(text);

    // Normalize whitespace.
    text = text.replace(/\s+/g, " ");

    return text.trim();
}

function parseTraffic(value) {

    if (!value) {
        return null;
    }

    const text =
        toEnglishNumbers(value)
            .replace(/,/g, "")
            .trim();

    const match =
        text.match(
            /([\d.]+)\s*(B|KB|MB|GB|TB)/i
        );

    if (!match) {
        return null;
    }

    const number =
        parseFloat(match[1]);

    const unit =
        match[2].toUpperCase();

    const multipliers = {
        B: 1,
        KB: 1024,
        MB: 1024 ** 2,
        GB: 1024 ** 3,
        TB: 1024 ** 4
    };

    return number * multipliers[unit];
}

function formatTraffic(bytes) {

    if (bytes === null) {
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
         * Get our private VPN record.
         */

        const databaseResponse =
            await fetch(
                `${supabaseUrl}/rest/v1/vpns?select=name,config,source_url&page_id=eq.${encodeURIComponent(id)}`,
                {
                    headers: {
                        apikey: supabaseKey,
                        Authorization:
                            `Bearer ${supabaseKey}`
                    }
                }
            );

        if (!databaseResponse.ok) {

            return response.status(500).json({
                success: false,
                error:
                    await databaseResponse.text()
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
         * Fetch the ENTIRE X4G page.
         */

        const x4gResponse =
            await fetch(
                vpn.source_url,
                {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0"
                    }
                }
            );

        if (!x4gResponse.ok) {

            return response.status(502).json({
                success: false,
                error:
                    `X4G returned HTTP ${x4gResponse.status}`
            });
        }

        const x4gHTML =
            await x4gResponse.text();

        /*
         * Turn the whole page into plain text.
         */

        const x4gText =
            htmlToText(x4gHTML);

        /*
         * Find used traffic.
         *
         * Example:
         *
         * 59.3 KB مصرف شده
         */

        const usedMatch =
            x4gText.match(
                /([\d.,]+\s*(?:B|KB|MB|GB|TB))\s*مصرف\s*شده/i
            );

        /*
         * Find quota.
         *
         * Example:
         *
         * سهمیه: ∞
         */

        const quotaMatch =
            x4gText.match(
                /سهمیه\s*[:：]?\s*(∞|[\d.,]+\s*(?:B|KB|MB|GB|TB))/i
            );

        let usedBytes = null;

        let quotaBytes = null;

        let unlimited = false;

        /*
         * Parse used traffic.
         */

        if (usedMatch) {

            usedBytes =
                parseTraffic(
                    usedMatch[1]
                );
        }

        /*
         * Parse quota.
         */

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

        /*
         * Calculate remaining traffic.
         */

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
         * Return ONLY the useful information.
         *
         * We do NOT return the X4G HTML.
         */

        return response.status(200).json({

            success: true,

            vpn: {

                name:
                    vpn.name,

                config:
                    vpn.config,

                traffic: {

                    used:
                        formatTraffic(
                            usedBytes
                        ),

                    limit:
                        unlimited
                            ? "Unlimited"
                            : formatTraffic(
                                quotaBytes
                            ),

                    remaining:
                        unlimited
                            ? "Unlimited"
                            : formatTraffic(
                                remainingBytes
                            ),

                    unlimited:
                        unlimited
                },

                /*
                 * We are deliberately not using
                 * the old database expiration.
                 */
                expiration: null
            }
        });

    } catch (error) {

        return response.status(500).json({

            success: false,

            error:
                error.message

        });

    }
}
