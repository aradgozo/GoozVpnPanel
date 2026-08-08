export default async function handler(request, response) {
    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SECRET_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return response.status(500).json({
                success: false,
                error: "Supabase environment variables are missing."
            });
        }

        const result = await fetch(
            `${supabaseUrl}/rest/v1/vpns?select=id&limit=1`,
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

        return response.status(200).json({
            success: true,
            message: "Backend is connected to Supabase!"
        });

    } catch (error) {
        return response.status(500).json({
            success: false,
            error: error.message
        });
    }
}
