// api/geogta/_shared.js
// Közös logika a Vercel serverless függvényekhez. FONTOS: itt NEM a discord.js
// Client-et használjuk (annak élő gateway-kapcsolat kellene, ami Vercel-en nem
// lehetséges), hanem a Discord REST API-t hívjuk közvetlenül fetch-csel — ehhez
// csak a bot tokenre van szükség, élő kapcsolatra nem.
console.log('[DEBUG] SUPABASE_URL raw:', JSON.stringify(process.env.SUPABASE_URL));
console.log('[DEBUG] SUPABASE_URL length:', (process.env.SUPABASE_URL || '').length);
console.log('[DEBUG] SUPABASE_SERVICE_KEY present:', !!process.env.SUPABASE_SERVICE_KEY);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const { createClient } = require('@supabase/supabase-js');
const { EmbedBuilder } = require('discord.js'); // tiszta "builder", nem igényel gateway-kapcsolatot

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const MAP_WIDTH = Number(process.env.GEOGTA_MAP_WIDTH || 2048);
const MAP_HEIGHT = Number(process.env.GEOGTA_MAP_HEIGHT || 2048);
const MAP_IMAGE = process.env.GEOGTA_MAP_IMAGE || '/geogta/assets/gta5-map-placeholder.svg';
const MAX_SCORE = Number(process.env.GEOGTA_MAX_SCORE || 5000);
const MAX_COINS = Number(process.env.GEOGTA_MAX_COINS || 400);
const MAX_XP = Number(process.env.GEOGTA_MAX_XP || 200);
const PARTICIPATION_XP = Number(process.env.GEOGTA_PARTICIPATION_XP || 15);

const MAP_DIAGONAL = Math.hypot(MAP_WIDTH, MAP_HEIGHT);
const SCORE_DECAY_SCALE = Number(process.env.GEOGTA_SCORE_DECAY_SCALE || MAP_DIAGONAL / 6);

function computeDistance(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}

function computeScore(distance) {
    const raw = MAX_SCORE * Math.exp(-distance / SCORE_DECAY_SCALE);
    return Math.max(0, Math.round(raw));
}

function computeRewards(score) {
    const ratio = score / MAX_SCORE;
    return {
        coins: Math.round(ratio * MAX_COINS),
        xp: PARTICIPATION_XP + Math.round(ratio * MAX_XP),
    };
}

// ── Economy / XP jóváírás közvetlenül Supabase-en keresztül ──────────────────
// (Ugyanazokat a táblákat/oszlopokat használjuk, mint az economyDatabase.js / levelSystem.js.)
async function addEconomyBalance(userId, amount) {
    const { data } = await supabase.from('economy').select('balance, total_earned').eq('discord_id', userId).single();
    const balance = (data?.balance || 0) + amount;
    const totalEarned = (data?.total_earned || 0) + (amount > 0 ? amount : 0);

    if (data) {
        await supabase.from('economy').update({ balance, total_earned: totalEarned }).eq('discord_id', userId);
    } else {
        await supabase.from('economy').insert({ discord_id: userId, balance, total_earned: totalEarned });
    }
}

async function addXP(userId, amount, username) {
    const { data } = await supabase.from('xp').select('xp, level, messages, username').eq('discord_id', userId).single();
    const xp = (data?.xp || 0) + amount;

    await supabase.from('xp').upsert({
        discord_id: userId,
        username: username || data?.username || null,
        xp,
        level: data?.level || 0,
        messages: data?.messages || 0,
    }, { onConflict: 'discord_id' });
}

async function updateGeogtaStats({ userId, userTag, score, coins, xp }) {
    const { data: existing } = await supabase.from('geogta_stats').select('*').eq('discord_id', userId).maybeSingle();

    await supabase.from('geogta_stats').upsert({
        discord_id: userId,
        user_tag: userTag,
        rounds_played: (existing?.rounds_played || 0) + 1,
        total_score: (existing?.total_score || 0) + score,
        best_score: Math.max(existing?.best_score || 0, score),
        total_coins_earned: (existing?.total_coins_earned || 0) + coins,
        total_xp_earned: (existing?.total_xp_earned || 0) + xp,
        last_played: Date.now(),
    }, { onConflict: 'discord_id' });
}

// ── Discord REST hívás (nincs szükség élő gateway-kapcsolatra) ───────────────
async function editDiscordMessage(channelId, messageId, embed) {
    if (!channelId || !messageId) return;
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ embeds: [embed.toJSON()], components: [] }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`Discord üzenet-frissítési hiba (${res.status}): ${text}`);
    }
}

function buildResultEmbed({ locationName, distance, score, coins, xp, userTag }) {
    return new EmbedBuilder()
        .setColor(score >= MAX_SCORE * 0.8 ? '#43b581' : score >= MAX_SCORE * 0.4 ? '#f1c40f' : '#f04747')
        .setTitle('🎯 GeoGTA — Eredmény')
        .setDescription(`**${userTag}** tippelt!`)
        .addFields(
            { name: '📍 Valódi helyszín', value: locationName, inline: true },
            { name: '📏 Távolság', value: `${Math.round(distance)} egység`, inline: true },
            { name: '⭐ Pontszám', value: `${score} / ${MAX_SCORE}`, inline: true },
            { name: '🪙 Jutalom', value: `+${coins} Érem`, inline: true },
            { name: '📊 XP', value: `+${xp} XP`, inline: true },
        )
        .setTimestamp();
}

module.exports = {
    supabase,
    MAP_WIDTH, MAP_HEIGHT, MAP_IMAGE, MAX_SCORE,
    computeDistance, computeScore, computeRewards,
    addEconomyBalance, addXP, updateGeogtaStats,
    editDiscordMessage, buildResultEmbed,
};
