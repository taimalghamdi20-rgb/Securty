// dashboard/app.js — سيرفر الداشبورد، يشتغل بنفس عملية البوت ويشارك نفس قاعدة البيانات
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const db = require('../db');
const oauth = require('./oauth');
const { renderLogin, renderPicker, renderGuildDashboard } = require('./views');

const ALLOWED_BOOL_KEYS = [
  'protectionEnabled',
  'antiBots',
  'antiJoin',
  'antiSpam',
  'antiLinks',
  'antiDelete',
  'instantRoomAction',
  'instantRoleAction',
  'antiGuildUpdate',
  'antiPermissions'
];
const ALLOWED_PROCEDURES = ['strip', 'kick', 'ban', 'jail'];

function guildIcon(guild) {
  return guild.icon ? guild.iconURL({ size: 128 }) : null;
}

function resolveMember(guild, id) {
  const member = guild.members.cache.get(id);
  return { id, name: member ? `${member.user.username}` : `مستخدم (${id})` };
}

module.exports = function startDashboard(client) {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'protection-bot-dashboard-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
    })
  );

  function requireAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/');
    next();
  }

  function requireGuildAdmin(req, res, next) {
    const guildId = req.params.id;
    if (!req.session.user) return res.status(401).json({ error: 'not authenticated' });
    if (!req.session.adminGuildIds || !req.session.adminGuildIds.includes(guildId)) {
      return res.status(403).json({ error: 'not authorized for this guild' });
    }
    if (!client.guilds.cache.has(guildId)) return res.status(404).json({ error: 'bot not in this guild' });
    next();
  }

  // ------------------- صفحات -------------------

  app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    if (!process.env.CLIENT_SECRET || !process.env.DASHBOARD_URL) {
      return res.send(renderLogin('الداشبورد يحتاج ضبط CLIENT_SECRET و DASHBOARD_URL بمتغيرات البيئة أولًا.'));
    }
    res.send(renderLogin(null));
  });

  app.get('/auth/discord/login', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    res.redirect(oauth.buildAuthorizeUrl(state));
  });

  app.get('/auth/discord/callback', async (req, res) => {
    try {
      const { code, state } = req.query;
      if (!code || !state || state !== req.session.oauthState) {
        return res.send(renderLogin('فشل تسجيل الدخول (state غير متطابق)، حاول مرة ثانية.'));
      }
      const token = await oauth.exchangeCode(code);
      const me = await oauth.fetchMe(token.access_token);
      const myGuilds = await oauth.fetchMyGuilds(token.access_token);

      const botGuildIds = new Set(client.guilds.cache.map((g) => g.id));
      const adminGuildIds = myGuilds.filter((g) => oauth.hasAdminPermission(g) && botGuildIds.has(g.id)).map((g) => g.id);

      req.session.user = {
        id: me.id,
        username: me.username,
        avatar: me.avatar
          ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png`
          : `https://cdn.discordapp.com/embed/avatars/${Number(me.discriminator || 0) % 5}.png`
      };
      req.session.adminGuildIds = adminGuildIds;
      res.redirect('/dashboard');
    } catch (err) {
      console.error('OAuth error:', err.message);
      res.send(renderLogin('صار خطأ أثناء تسجيل الدخول، حاول مرة ثانية.'));
    }
  });

  app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
  });

  app.get('/dashboard', requireAuth, (req, res) => {
    const guilds = (req.session.adminGuildIds || [])
      .map((id) => client.guilds.cache.get(id))
      .filter(Boolean)
      .map((g) => ({ id: g.id, name: g.name, icon: guildIcon(g) }));
    res.send(renderPicker(req.session.user, guilds));
  });

  app.get('/dashboard/:id', requireAuth, (req, res) => {
    const guildId = req.params.id;
    if (!req.session.adminGuildIds || !req.session.adminGuildIds.includes(guildId)) {
      return res.status(403).send(renderLogin('ما تملك صلاحية Administrator بهذا السيرفر.'));
    }
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).send(renderLogin('البوت مو موجود بهذا السيرفر.'));

    const gd = db.getGuild(guildId);
    const trustedMembers = gd.trusted.map((id) => resolveMember(guild, id));
    const bypassMembers = gd.bypassDelete.map((id) => resolveMember(guild, id));

    res.send(renderGuildDashboard(req.session.user, { id: guild.id, name: guild.name, icon: guildIcon(guild) }, gd, trustedMembers, bypassMembers));
  });

  // ------------------- API -------------------

  app.post('/api/guild/:id/settings', requireGuildAdmin, (req, res) => {
    const guildId = req.params.id;
    const gd = db.getGuild(guildId);
    const body = req.body || {};

    for (const key of ALLOWED_BOOL_KEYS) {
      if (typeof body[key] === 'boolean') gd[key] = body[key];
    }

    if (body.procedure && ALLOWED_PROCEDURES.includes(body.procedure)) {
      gd.procedure = body.procedure;
    }

    if (body.spamLimit && typeof body.spamLimit === 'object') {
      const count = parseInt(body.spamLimit.count);
      const seconds = parseInt(body.spamLimit.seconds);
      if (count > 0) gd.spamLimit.count = count;
      if (seconds > 0) gd.spamLimit.seconds = seconds;
    }

    if (body.limits && typeof body.limits === 'object') {
      for (const key of ['banKick', 'roles', 'channels', 'seconds']) {
        const v = parseInt(body.limits[key]);
        if (v > 0) gd.limits[key] = v;
      }
    }

    db.setGuild(guildId, gd);
    res.json({ ok: true });
  });

  app.post('/api/guild/:id/whitelist', requireGuildAdmin, (req, res) => {
    const guildId = req.params.id;
    const gd = db.getGuild(guildId);
    const { list, action, userId } = req.body || {};

    if (!['trusted', 'bypass'].includes(list) || !['add', 'remove'].includes(action) || !/^\d{15,20}$/.test(userId || '')) {
      return res.status(400).json({ error: 'invalid request' });
    }

    const targetArr = list === 'trusted' ? gd.trusted : gd.bypassDelete;
    const idx = targetArr.indexOf(userId);
    if (action === 'add' && idx === -1) targetArr.push(userId);
    if (action === 'remove' && idx !== -1) targetArr.splice(idx, 1);

    db.setGuild(guildId, gd);
    res.json({ ok: true });
  });

  // فحص صحة بسيط لاستضافات مثل Render (Web Service) حتى لا تعيد تشغيل الخدمة
  app.get('/healthz', (req, res) => res.status(200).send('ok'));

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`✅ داشبورد الحماية شغّال على المنفذ ${port}`);
  });
};
