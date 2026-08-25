// api/geogta/session/[token].js
// GET /api/geogta/session/:token
const { supabase, MAP_IMAGE, MAP_WIDTH, MAP_HEIGHT } = require('../_shared');

module.exports = async (req, res) => {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { token } = req.query;

    const { data: session, error } = await supabase
        .from('geogta_sessions')
        .select('token, status, location_name, image_url, expires_at')
        .eq('token', token)
        .maybeSingle();

    if (error) return res.status(500).json({ error: 'Adatbázis hiba.' });
    if (!session) return res.status(404).json({ error: 'Nem található ilyen kör (lejárt a link, vagy hibás a token).' });

    if (session.status !== 'active') {
        return res.status(410).json({ error: 'Ez a kör már lezárult.', status: session.status });
    }
    if (Date.now() > session.expires_at) {
        return res.status(410).json({ error: 'Lejárt az idő ehhez a körhöz.', status: 'expired' });
    }

    return res.status(200).json({
        locationName: session.location_name,
        imageUrl: session.image_url,
        mapImage: MAP_IMAGE,
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
        expiresAt: session.expires_at,
    });
};
