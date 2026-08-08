export default async function handler(request, response) {
    try {
        const url = request.query.url;

        if (!url) {
            return response.status(400).json({
                success: false,
                error: "Missing URL"
            });
        }

        const parsed = new URL(url);

        if (!parsed.pathname.startsWith("/p/")) {
            return response.status(400).json({
                success: false,
                error: "Only X4G /p/ pages are allowed."
            });
        }

        const result = await fetch(url);

        if (!result.ok) {
            return response.status(result.status).json({
                success: false,
                error: `X4G returned HTTP ${result.status}`
            });
        }

        const html = await result.text();

        return response.status(200).json({
            success: true,
            length: html.length,
            preview: html.substring(0, 1000)
        });

    } catch (error) {
        return response.status(500).json({
            success: false,
            error: error.message
        });
    }
}
