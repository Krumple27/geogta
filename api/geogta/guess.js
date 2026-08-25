// api/geogta/guess.js
// POST /api/geogta/guess  { token, x, y }
const {
    supabase, MAP_WIDTH, MAP_HEIGHT, MAX_SCORE,
    computeDistance, computeScore, computeRewards,
    addEconomyBalance, addXP, updateGeogtaStats,
    editDiscordMessage, buildResultEmbed,
} = require('./_shared');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { token, x, y } = req.body || {};

        if (!token || typeof x !== 'number' || typeof y !== 'number') {
            return res.status(400).json({ error: 'Hiányzó vagy hibás paraméterek (token, x, y szükséges).' });
        }
        if (x < 0 || y < 0 || x > MAP_WIDTH || y > MAP_HEIGHT) {
            return res.status(400).json({ error: 'A koordináták kívül esnek a térkép határain.' });
        }

        // Feltételes update: csak 'active' státuszú kört zárhat le — véd a dupla beküldés ellen.
        const { data: closedRows, error: closeErr } = await supabase
            .from('geogta_sessions')
            .update({ status: 'answered', guess_x: x, guess_y: y, answered_at: Date.now() })
            .eq('token', token)
            .eq('status', 'active')
            .select();

        if (closeErr) return res.status(500).json({ error: 'Adatbázis hiba történt.' });
        if (!closedRows || closedRows.length === 0) {
            return res.status(410).json({ error: 'Ez a kör már lezárult, vagy lejárt az idő, mire beküldted a tippedet.' });
        }

        const session = closedRows[0];

        if (Date.now() > session.expires_at) {
            await supabase.from('geogta_sessions').update({ status: 'expired' }).eq('token', token);
            return res.status(410).json({ error: 'Lejárt az idő ehhez a körhöz.' });
        }

        const distance = computeDistance(x, y, session.actual_x, session.actual_y);
        const score = computeScore(distance);
        const { coins, xp } = computeRewards(score);

        await supabase.from('geogta_sessions')
            .update({ score, distance, coins_awarded: coins, xp_awarded: xp })
            .eq('token', token);

        await addEconomyBalance(session.user_id, coins);
        await addXP(session.user_id, xp, session.user_tag);
        await updateGeogtaStats({ userId: session.user_id, userTag: session.user_tag, score, coins, xp });

        // Discord üzenet frissítése REST API-n keresztül (nem kell élő bot-kapcsolat)
        const embed = buildResultEmbed({ locationName: session.location_name, distance, score, coins, xp, userTag: session.user_tag });
        await editDiscordMessage(session.channel_id, session.message_id, embed).catch(err => console.error(err));

        return res.status(200).json({
            distance: Math.round(distance),
            score,
            maxScore: MAX_SCORE,
            coins,
            xp,
            actualX: session.actual_x,
            actualY: session.actual_y,
            locationName: session.location_name,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Ismeretlen szerverhiba történt.' });
    }
};
