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

        return response.status(200).json({
            success: true,
            vpn: data[0]
        });

    } catch (error) {

        return response.status(500).json({
            success: false,
            error: error.message
        });
    }
}
