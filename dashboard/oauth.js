// dashboard/oauth.js — تسجيل الدخول عبر Discord OAuth2
const API = 'https://discord.com/api/v10';

function getRedirectUri() {
  return process.env.DASHBOARD_URL ? `${process.env.DASHBOARD_URL.replace(/\/$/, '')}/auth/discord/callback` : null;
}

function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: 'identify guilds',
    state,
    prompt: 'consent'
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri()
  });
  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) throw new Error(`فشل تبادل الكود: ${res.status}`);
  return res.json();
}

async function fetchMe(accessToken) {
  const res = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`فشل جلب بيانات المستخدم: ${res.status}`);
  return res.json();
}

async function fetchMyGuilds(accessToken) {
  const res = await fetch(`${API}/users/@me/guilds`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`فشل جلب سيرفرات المستخدم: ${res.status}`);
  return res.json();
}

// هل يملك المستخدم صلاحية Administrator في هذا السيرفر؟ (بت 0x8، أو هو مالك السيرفر)
function hasAdminPermission(guildEntry) {
  if (guildEntry.owner) return true;
  const perms = BigInt(guildEntry.permissions || 0);
  return (perms & BigInt(0x8)) === BigInt(0x8);
}

module.exports = { buildAuthorizeUrl, exchangeCode, fetchMe, fetchMyGuilds, hasAdminPermission, getRedirectUri };
