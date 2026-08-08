export default function handler(request, response) {
    response.status(200).json({
        success: true,
        message: "VPN Panel backend is working!"
    });
}
