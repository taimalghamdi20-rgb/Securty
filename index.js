// index.js — بوت الحماية الشامل
require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  Events,
  AuditLogEvent,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const db = require('./db');
const { CATEGORIES } = require('./help');

const PREFIX = '#';
const COLOR = 0x2b2d31;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.GuildMember, Partials.Message]
});

// تتبع السبام في الذاكرة فقط (لا يحتاج حفظ دائم)
const spamTracker = new Map();

/* ------------------------- أدوات مساعدة ------------------------- */

function embed(title, description, color = COLOR) {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
}

function isTrusted(guildData, userId) {
  return guildData.trusted.includes(userId);
}
function isBypassDelete(guildData, userId) {
  return guildData.bypassDelete.includes(userId) || isTrusted(guildData, userId);
}

function isAdmin(message) {
  return (
    message.member &&
    (message.member.permissions.has(PermissionFlagsBits.Administrator) ||
      message.guild.ownerId === message.author.id)
  );
}

async function requireAdmin(message) {
  if (!isAdmin(message)) {
    await message.reply({ embeds: [embed('❌ صلاحية غير كافية', 'هذا الأمر يتطلب صلاحية **Administrator**.', 0xed4245)] }).catch(() => {});
    return false;
  }
  return true;
}

async function sendLog(guild, guildData, embedObj) {
  if (!guildData.seclogChannel) return;
  const channel = guild.channels.cache.get(guildData.seclogChannel);
  if (!channel) return;
  channel.send({ embeds: [embedObj] }).catch(() => {});
}

function serializeOverwrites(channel) {
  return channel.permissionOverwrites.cache.map((ow) => ({
    id: ow.id,
    type: ow.type,
    allow: ow.allow.bitfield.toString(),
    deny: ow.deny.bitfield.toString()
  }));
}

async function fetchExecutor(guild, auditType, targetId) {
  try {
    const logs = await guild.fetchAuditLogs({ type: auditType, limit: 5 });
    const entry = logs.entries.find(
      (e) => e.target?.id === targetId && Date.now() - e.createdTimestamp < 15000
    );
    return entry?.executor || null;
  } catch {
    return null;
  }
}

async function applyPunishment(guild, userId, reason, guildData) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  try {
    switch (guildData.procedure) {
      case 'kick':
        await member.kick(reason);
        break;
      case 'ban':
        await member.ban({ reason });
        break;
      case 'jail':
        if (guildData.jailRoleId && guild.roles.cache.has(guildData.jailRoleId)) {
          await member.roles.set([guildData.jailRoleId], reason);
        } else {
          await member.roles.set([], reason);
        }
        break;
      case 'strip':
      default:
        await member.roles.set([], reason);
        break;
    }
  } catch {
    /* صلاحيات غير كافية أو المستخدم غير قابل للتنفيذ عليه (مثل الأونر) */
  }
}

// حدود كل تصنيف (channels/roles/banKick تُقرأ من guildData.limits، permissions وguildUpdate ثابتة)
function categoryLimit(guildData, category) {
  if (category === 'channels') return guildData.limits.channels;
  if (category === 'roles' || category === 'permissions') return guildData.limits.roles;
  if (category === 'banKick') return guildData.limits.banKick;
  return 1; // guildUpdate وأي تصنيف آخر: مخالفة واحدة تكفي
}

async function handleViolation(guild, guildId, category, executorId, reason, instant = false) {
  let guildData = db.getGuild(guildId);
  if (executorId === client.user.id) return;
  if (isTrusted(guildData, executorId) || isBypassDelete(guildData, executorId)) return;

  const useInstant = instant || !guildData.limitsEnabled;
  const limit = categoryLimit(guildData, category);

  if (!useInstant) {
    const now = Date.now();
    const windowMs = (guildData.limits.seconds || 60) * 1000;
    if (!guildData.violations[category]) guildData.violations[category] = {};
    const v = guildData.violations[category][executorId] || { count: 0, first: now };
    if (now - v.first > windowMs) {
      v.count = 0;
      v.first = now;
    }
    v.count++;
    guildData.violations[category][executorId] = v;
    db.setGuild(guildId, guildData);

    if (v.count < limit) {
      await sendLog(
        guild,
        guildData,
        embed('⚠️ مخالفة', `${reason}\nالمنفذ: <@${executorId}>\nعدد المخالفات: ${v.count}/${limit}`, 0xf1c40f)
      );
      return;
    }
    guildData.violations[category][executorId] = { count: 0, first: now };
  }

  db.setGuild(guildId, guildData);
  await applyPunishment(guild, executorId, reason, guildData);
  await sendLog(
    guild,
    guildData,
    embed('🚫 تم تنفيذ الإجراء', `${reason}\nالمنفذ: <@${executorId}>\nالإجراء المُطبَّق: **${guildData.procedure}**`, 0xed4245)
  );
}

function extractUserId(message, args) {
  const mention = message.mentions.users.first();
  if (mention) return mention.id;
  if (args[0] && /^\d{15,20}$/.test(args[0])) return args[0];
  return null;
}

function buildHelpEmbeds() {
  const e = new EmbedBuilder()
    .setTitle('📖 أوامر الحماية')
    .setColor(COLOR)
    .setDescription('كل أمر يُستخدم بوضع علامة **#** قبله مباشرةً، مثال: `#protection`')
    .setTimestamp();
  for (const cat of CATEGORIES) {
    const value = cat.commands.map(([cmd, desc]) => `\`${cmd}\` : ${desc}`).join('\n');
    e.addFields({ name: cat.title, value });
  }
  return e;
}

/* ------------------------- تسجيل أمر السلاش /help ------------------------- */

async function registerSlashCommands() {
  const commands = [new SlashCommandBuilder().setName('help').setDescription('عرض جميع أوامر بوت الحماية').toJSON()];
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ تم تسجيل أمر /help بنجاح');
  } catch (err) {
    console.error('❌ فشل تسجيل أوامر السلاش:', err);
  }
}

/* ------------------------- الأوامر (Prefix Commands) ------------------------- */

const commands = {
  async protection(message, args, guildData, guildId) {
    guildData.protectionEnabled = !guildData.protectionEnabled;
    db.setGuild(guildId, guildData);
    await message.reply({
      embeds: [embed('🛡️ الحماية الرئيسية', `الحماية الآن: **${guildData.protectionEnabled ? 'مفعّلة ✅' : 'معطّلة ❌'}**`)]
    });
  },

  async seclog(message, args, guildData, guildId) {
    if (args[0] === 'off') {
      guildData.seclogChannel = null;
      db.setGuild(guildId, guildData);
      return message.reply({ embeds: [embed('📄 لوق الحماية', 'تم تعطيل روم اللوقات.')] });
    }
    const channel = message.mentions.channels.first() || message.channel;
    guildData.seclogChannel = channel.id;
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('📄 لوق الحماية', `تم تحديد روم اللوقات: <#${channel.id}>`)] });
  },

  async ranti(message, args, guildData, guildId) {
    const id = extractUserId(message, args);
    if (!id) return message.reply({ embeds: [embed('❌ خطأ', 'منشن أو ضع آيدي الشخص.', 0xed4245)] });
    const idx = guildData.bypassDelete.indexOf(id);
    if (idx === -1) {
      guildData.bypassDelete.push(id);
      db.setGuild(guildId, guildData);
      return message.reply({ embeds: [embed('✅ تمت الإضافة', `<@${id}> أصبح يخطى حذف الرولات والرومات.`)] });
    }
    guildData.bypassDelete.splice(idx, 1);
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('🗑️ تمت الإزالة', `تمت إزالة <@${id}> من قائمة تخطي حذف الرولات والرومات.`)] });
  },

  async rantilist(message, args, guildData) {
    const list = guildData.bypassDelete.length ? guildData.bypassDelete.map((id) => `<@${id}>`).join('\n') : 'القائمة فارغة.';
    await message.reply({ embeds: [embed('📋 يخطون حذف الرولات والرومات', list)] });
  },

  async trust(message, args, guildData, guildId) {
    const id = extractUserId(message, args);
    if (!id) return message.reply({ embeds: [embed('❌ خطأ', 'منشن أو ضع آيدي الشخص.', 0xed4245)] });
    const idx = guildData.trusted.indexOf(id);
    if (idx === -1) {
      guildData.trusted.push(id);
      db.setGuild(guildId, guildData);
      return message.reply({ embeds: [embed('✅ تمت الإضافة', `<@${id}> أصبح يخطى الحماية بالكامل.`)] });
    }
    guildData.trusted.splice(idx, 1);
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('🗑️ تمت الإزالة', `تمت إزالة <@${id}> من قائمة تخطي الحماية الكاملة.`)] });
  },

  async trustlist(message, args, guildData) {
    const list = guildData.trusted.length ? guildData.trusted.map((id) => `<@${id}>`).join('\n') : 'القائمة فارغة.';
    await message.reply({ embeds: [embed('📋 يخطون الحماية بالكامل', list)] });
  },

  async createlimit(message, args, guildData, guildId) {
    const count = parseInt(args[0]);
    const seconds = parseInt(args[1]);
    if (!count || !seconds) {
      return message.reply({ embeds: [embed('❌ الاستخدام', '`#createlimit <عدد المخالفات> <عدد الثواني>`\nمثال: `#createlimit 3 10`\n(يضبط حد الرومات/الرولات/الباند والكيك معًا — لضبط كل تصنيف على حدة استخدم الداشبورد)', 0xed4245)] });
    }
    guildData.limitsEnabled = true;
    guildData.limits = { channels: count, roles: count, banKick: count, seconds };
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('📏 تم تحديد الحدود', `سيتم تنفيذ الإجراء بعد **${count}** مخالفات خلال **${seconds}** ثانية.`)] });
  },

  async dlimit(message, args, guildData, guildId) {
    guildData.limitsEnabled = false;
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('📏 الحدود', 'تم تعطيل الحدود، سيتم تنفيذ الإجراء عند أول مخالفة.')] });
  },

  async procedure(message, args, guildData, guildId) {
    const valid = ['strip', 'kick', 'ban', 'jail'];
    const proc = (args[0] || '').toLowerCase();
    if (!valid.includes(proc)) {
      return message.reply({
        embeds: [embed('❌ الاستخدام', '`#procedure <strip|kick|ban|jail>`\n- strip: سحب جميع الرولات\n- kick: طرد\n- ban: حظر\n- jail: سجن (يتطلب تحديد رول عبر منشن الرول بعد الأمر)', 0xed4245)]
      });
    }
    guildData.procedure = proc;
    if (proc === 'jail') {
      const role = message.mentions.roles.first();
      if (role) guildData.jailRoleId = role.id;
      if (!guildData.jailRoleId) {
        return message.reply({ embeds: [embed('❌ خطأ', 'حدد رول السجن بمنشنه بعد الأمر: `#procedure jail @رول-السجن`', 0xed4245)] });
      }
    }
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('⚖️ تم تحديد الإجراء', `الإجراء عند المخالفة الآن: **${proc}**`)] });
  },

  async restore(message, args, guildData) {
    const id = extractUserId(message, args);
    if (!id) return message.reply({ embeds: [embed('❌ خطأ', 'منشن أو ضع آيدي العضو.', 0xed4245)] });
    const snapshot = guildData.memberRoleSnapshots[id];
    if (!snapshot || !snapshot.length) {
      return message.reply({ embeds: [embed('❌ لا يوجد', 'لا توجد نسخة محفوظة لرولات هذا العضو.', 0xed4245)] });
    }
    const member = await message.guild.members.fetch(id).catch(() => null);
    if (!member) return message.reply({ embeds: [embed('❌ خطأ', 'العضو غير موجود في السيرفر.', 0xed4245)] });
    const valid = snapshot.filter((rid) => message.guild.roles.cache.has(rid));
    await member.roles.set(valid).catch(() => {});
    await message.reply({ embeds: [embed('♻️ تم الإرجاع', `تم إرجاع رولات <@${id}> (${valid.length} رول).`)] });
  },

  async restroles(message, args, guildData, guildId) {
    const list = guildData.backups.deletedRoles;
    if (!list.length) return message.reply({ embeds: [embed('❌ لا يوجد', 'لا توجد رولات محذوفة محفوظة.', 0xed4245)] });
    const toRestore = args[0] === 'all' ? list : [list[0]];
    let restored = 0;
    for (const r of toRestore) {
      try {
        await message.guild.roles.create({
          name: r.name,
          color: r.color,
          hoist: r.hoist,
          mentionable: r.mentionable,
          permissions: BigInt(r.permissions)
        });
        restored++;
      } catch {
        /* تجاهل الفشل الفردي */
      }
    }
    guildData.backups.deletedRoles = args[0] === 'all' ? [] : list.slice(1);
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('♻️ تم إرجاع الرولات', `تم إرجاع ${restored} رول.`)] });
  },

  async restrooms(message, args, guildData, guildId) {
    const list = guildData.backups.deletedChannels;
    if (!list.length) return message.reply({ embeds: [embed('❌ لا يوجد', 'لا توجد رومات محذوفة محفوظة.', 0xed4245)] });
    const toRestore = args[0] === 'all' ? list : [list[0]];
    let restored = 0;
    for (const c of toRestore) {
      try {
        await message.guild.channels.create({
          name: c.name,
          type: c.type,
          topic: c.topic || undefined,
          parent: c.parentId && message.guild.channels.cache.has(c.parentId) ? c.parentId : undefined
        });
        restored++;
      } catch {
        /* تجاهل */
      }
    }
    guildData.backups.deletedChannels = args[0] === 'all' ? [] : list.slice(1);
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('♻️ تم إرجاع الرومات', `تم إرجاع ${restored} روم.`)] });
  },

  async restcategory(message, args, guildData, guildId) {
    const list = guildData.backups.deletedCategories;
    if (!list.length) return message.reply({ embeds: [embed('❌ لا يوجد', 'لا توجد كاتقوريات محذوفة محفوظة.', 0xed4245)] });
    const toRestore = args[0] === 'all' ? list : [list[0]];
    let restored = 0;
    for (const c of toRestore) {
      try {
        await message.guild.channels.create({ name: c.name, type: ChannelType.GuildCategory });
        restored++;
      } catch {
        /* تجاهل */
      }
    }
    guildData.backups.deletedCategories = args[0] === 'all' ? [] : list.slice(1);
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('♻️ تم إرجاع الكاتقوريات', `تم إرجاع ${restored} كاتقوري.`)] });
  },

  async save(message, args, guildData, guildId) {
    const roles = message.guild.roles.cache
      .filter((r) => r.id !== message.guild.id)
      .map((r) => ({
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        mentionable: r.mentionable,
        permissions: r.permissions.bitfield.toString(),
        position: r.position
      }));
    const channels = message.guild.channels.cache.map((c) => ({
      name: c.name,
      type: c.type,
      parentName: c.parent ? c.parent.name : null,
      position: c.position
    }));
    guildData.fullBackup = { roles, channels, savedAt: Date.now() };
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('💾 تم الحفظ', `تم حفظ نسخة كاملة من السيرفر (${roles.length} رول، ${channels.length} روم).`)] });
  },

  async backup(message, args, guildData) {
    if (!guildData.fullBackup) return message.reply({ embeds: [embed('❌ لا يوجد', 'لا توجد نسخة محفوظة، استخدم `#save` أولًا.', 0xed4245)] });
    let restoredRoles = 0;
    let restoredChannels = 0;
    const existingRoleNames = new Set(message.guild.roles.cache.map((r) => r.name));
    for (const r of guildData.fullBackup.roles) {
      if (existingRoleNames.has(r.name)) continue;
      try {
        await message.guild.roles.create({ name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: BigInt(r.permissions) });
        restoredRoles++;
      } catch {
        /* تجاهل */
      }
    }
    const existingChannelNames = new Set(message.guild.channels.cache.map((c) => c.name));
    // أنشئ الكاتقوريات أولًا
    for (const c of guildData.fullBackup.channels.filter((c) => c.type === ChannelType.GuildCategory)) {
      if (existingChannelNames.has(c.name)) continue;
      try {
        await message.guild.channels.create({ name: c.name, type: ChannelType.GuildCategory });
        restoredChannels++;
      } catch {
        /* تجاهل */
      }
    }
    for (const c of guildData.fullBackup.channels.filter((c) => c.type !== ChannelType.GuildCategory)) {
      if (existingChannelNames.has(c.name)) continue;
      try {
        const parent = c.parentName ? message.guild.channels.cache.find((ch) => ch.name === c.parentName && ch.type === ChannelType.GuildCategory) : null;
        await message.guild.channels.create({ name: c.name, type: c.type, parent: parent ? parent.id : undefined });
        restoredChannels++;
      } catch {
        /* تجاهل */
      }
    }
    await message.reply({ embeds: [embed('♻️ تم الاسترجاع', `تم إرجاع ${restoredRoles} رول و ${restoredChannels} روم من آخر نسخة محفوظة.`)] });
  },

  async collection(message, args, guildData, guildId) {
    const role = message.mentions.roles.first();
    if (!role) return message.reply({ embeds: [embed('❌ خطأ', 'منشن الرول المطلوب حمايته: `#collection @رول`', 0xed4245)] });
    const idx = guildData.protectedRoles.indexOf(role.id);
    if (idx === -1) {
      guildData.protectedRoles.push(role.id);
      db.setGuild(guildId, guildData);
      return message.reply({ embeds: [embed('🛡️ تمت الحماية', `الرول ${role} أصبح محميًا الآن.`)] });
    }
    guildData.protectedRoles.splice(idx, 1);
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('🗑️ أُزيلت الحماية', `الرول ${role} لم يعد محميًا.`)] });
  },

  async collectionlist(message, args, guildData) {
    const list = guildData.protectedRoles.length ? guildData.protectedRoles.map((id) => `<@&${id}>`).join('\n') : 'القائمة فارغة.';
    await message.reply({ embeds: [embed('📋 الرولات المحمية', list)] });
  },

  async antijoin(message, args, guildData, guildId) {
    guildData.antiJoin = !guildData.antiJoin;
    if (args[0] && !isNaN(parseInt(args[0]))) guildData.antiJoinMinAgeDays = parseInt(args[0]);
    db.setGuild(guildId, guildData);
    await message.reply({
      embeds: [embed('🚪 منع الحسابات الجديدة', `الحالة: **${guildData.antiJoin ? 'مفعّل ✅' : 'معطّل ❌'}**\nالحد الأدنى لعمر الحساب: **${guildData.antiJoinMinAgeDays}** يوم`)]
    });
  },

  async setjoin(message, args, guildData, guildId) {
    const valid = ['kick', 'ban', 'jail'];
    const action = (args[0] || '').toLowerCase();
    if (!valid.includes(action)) return message.reply({ embeds: [embed('❌ الاستخدام', '`#setjoin <kick|ban|jail>`', 0xed4245)] });
    guildData.joinAction = action;
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('⚖️ تم التحديد', `إجراء الحسابات الجديدة الآن: **${action}**`)] });
  },

  async antibots(message, args, guildData, guildId) {
    guildData.antiBots = !guildData.antiBots;
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('🤖 منع البوتات', `الحالة: **${guildData.antiBots ? 'مفعّل ✅' : 'معطّل ❌'}**`)] });
  },

  async antispam(message, args, guildData, guildId) {
    guildData.antiSpam = !guildData.antiSpam;
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('💬 منع السبام', `الحالة: **${guildData.antiSpam ? 'مفعّل ✅' : 'معطّل ❌'}**`)] });
  },

  async spam(message, args, guildData, guildId) {
    const count = parseInt(args[0]);
    const seconds = parseInt(args[1]);
    if (!count || !seconds) return message.reply({ embeds: [embed('❌ الاستخدام', '`#spam <عدد الرسائل> <عدد الثواني>`\nمثال: `#spam 5 5`', 0xed4245)] });
    guildData.spamLimit = { count, seconds };
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('💬 حد السبام', `الحد الآن: **${count}** رسائل خلال **${seconds}** ثانية.`)] });
  },

  async antidelete(message, args, guildData, guildId) {
    guildData.antiDelete = !guildData.antiDelete;
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('🗑️ حماية الحذف', `الحالة: **${guildData.antiDelete ? 'مفعّل ✅' : 'معطّل ❌'}**`)] });
  },

  async antilinks(message, args, guildData, guildId) {
    guildData.antiLinks = !guildData.antiLinks;
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('🔗 حماية الروابط', `الحالة: **${guildData.antiLinks ? 'مفعّل ✅' : 'معطّل ❌'}**`)] });
  },

  async links(message, args, guildData, guildId) {
    const action = (args[0] || '').toLowerCase();
    if (action === 'add' && args[1]) {
      guildData.allowedLinks.push(args[1].toLowerCase());
      db.setGuild(guildId, guildData);
      return message.reply({ embeds: [embed('✅ تمت الإضافة', `تمت إضافة \`${args[1]}\` للروابط المسموحة.`)] });
    }
    if (action === 'remove' && args[1]) {
      guildData.allowedLinks = guildData.allowedLinks.filter((l) => l !== args[1].toLowerCase());
      db.setGuild(guildId, guildData);
      return message.reply({ embeds: [embed('🗑️ تمت الإزالة', `تمت إزالة \`${args[1]}\` من الروابط المسموحة.`)] });
    }
    const list = guildData.allowedLinks.length ? guildData.allowedLinks.map((l) => `\`${l}\``).join('\n') : 'لا توجد روابط مسموحة.';
    await message.reply({ embeds: [embed('🔗 الروابط المسموحة', `${list}\n\nالاستخدام: \`#links add <دومين>\` أو \`#links remove <دومين>\``)] });
  },

  async antiword(message, args, guildData, guildId) {
    const action = (args[0] || '').toLowerCase();
    if (action === 'add' && args[1]) {
      const word = args.slice(1).join(' ').toLowerCase();
      guildData.bannedWords.push(word);
      db.setGuild(guildId, guildData);
      return message.reply({ embeds: [embed('✅ تمت الإضافة', `تمت إضافة كلمة ممنوعة.`)] });
    }
    if (action === 'remove' && args[1]) {
      const word = args.slice(1).join(' ').toLowerCase();
      guildData.bannedWords = guildData.bannedWords.filter((w) => w !== word);
      db.setGuild(guildId, guildData);
      return message.reply({ embeds: [embed('🗑️ تمت الإزالة', `تمت إزالة الكلمة الممنوعة.`)] });
    }
    const list = guildData.bannedWords.length ? guildData.bannedWords.map((w) => `\`${w}\``).join(', ') : 'لا توجد كلمات ممنوعة.';
    await message.reply({ embeds: [embed('🚫 الكلمات الممنوعة', `${list}\n\nالاستخدام: \`#antiword add <كلمة>\` أو \`#antiword remove <كلمة>\``)] });
  },

  async bblock(message, args, guildData, guildId) {
    const id = extractUserId(message, args);
    if (!id) return message.reply({ embeds: [embed('❌ خطأ', 'منشن أو ضع آيدي الشخص.', 0xed4245)] });
    if (!guildData.blockedUsers.includes(id)) guildData.blockedUsers.push(id);
    db.setGuild(guildId, guildData);
    const member = await message.guild.members.fetch(id).catch(() => null);
    if (member) await member.kick('محظور من دخول السيرفر (bblock)').catch(() => {});
    await message.reply({ embeds: [embed('🚫 تم الحظر من الدخول', `<@${id}> لن يستطيع دخول السيرفر بعد الآن.`)] });
  },

  async unbblock(message, args, guildData, guildId) {
    const id = extractUserId(message, args);
    if (!id) return message.reply({ embeds: [embed('❌ خطأ', 'منشن أو ضع آيدي الشخص.', 0xed4245)] });
    guildData.blockedUsers = guildData.blockedUsers.filter((u) => u !== id);
    db.setGuild(guildId, guildData);
    await message.reply({ embeds: [embed('✅ تمت الإزالة', `تمت إزالة الحظر عن <@${id}>.`)] });
  },

  async help(message) {
    await message.reply({ embeds: [buildHelpEmbeds()] });
  }
};

/* ------------------------- الأحداث ------------------------- */

client.once(Events.ClientReady, async () => {
  console.log(`✅ تم تسجيل الدخول باسم ${client.user.tag}`);
  client.user.setActivity('#help | حماية السيرفر', { type: 3 });
  await registerSlashCommands();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'help') {
    try {
      await interaction.reply({ embeds: [buildHelpEmbeds()] });
    } catch (err) {
      console.error('فشل الرد على تفاعل /help:', err?.message || err);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;

  const guildId = message.guild.id;
  let guildData = db.getGuild(guildId);

  // ---- الأوامر ----
  if (message.content.startsWith(PREFIX)) {
    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmdName = args.shift().toLowerCase();
    if (commands[cmdName]) {
      if (cmdName !== 'help' && !(await requireAdmin(message))) return;
      try {
        await commands[cmdName](message, args, guildData, guildId);
      } catch (err) {
        console.error(err);
        message.reply({ embeds: [embed('❌ حدث خطأ', 'حدث خطأ أثناء تنفيذ الأمر.', 0xed4245)] }).catch(() => {});
      }
      return;
    }
  }

  if (!guildData.protectionEnabled) return;
  if (isAdmin(message) || isTrusted(guildData, message.author.id)) return;

  // ---- منع السبام ----
  if (guildData.antiSpam) {
    const key = `${guildId}-${message.author.id}`;
    const now = Date.now();
    const track = spamTracker.get(key) || [];
    const filtered = track.filter((t) => now - t < guildData.spamLimit.seconds * 1000);
    filtered.push(now);
    spamTracker.set(key, filtered);
    if (filtered.length > guildData.spamLimit.count) {
      spamTracker.set(key, []);
      await message.delete().catch(() => {});
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (member) await member.timeout(5 * 60 * 1000, 'سبام').catch(() => {});
      await sendLog(message.guild, guildData, embed('💬 تم كتم عضو', `<@${message.author.id}> بسبب السبام.`, 0xf1c40f));
      return;
    }
  }

  // ---- منع الروابط ----
  if (guildData.antiLinks) {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const match = message.content.match(urlRegex);
    if (match) {
      const allowed = match.every((url) => guildData.allowedLinks.some((domain) => url.toLowerCase().includes(domain)));
      if (!allowed) {
        await message.delete().catch(() => {});
        await sendLog(message.guild, guildData, embed('🔗 تم حذف رابط', `رابط غير مسموح من <@${message.author.id}>.`, 0xf1c40f));
        return;
      }
    }
  }

  // ---- الكلمات الممنوعة ----
  if (guildData.bannedWords.length) {
    const content = message.content.toLowerCase();
    const found = guildData.bannedWords.find((w) => content.includes(w));
    if (found) {
      await message.delete().catch(() => {});
      await sendLog(message.guild, guildData, embed('🚫 تم حذف رسالة', `كلمة ممنوعة من <@${message.author.id}>.`, 0xf1c40f));
      return;
    }
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  const guildId = member.guild.id;
  const guildData = db.getGuild(guildId);
  if (!guildData.protectionEnabled) return;

  // ---- الحظر من الدخول ----
  if (guildData.blockedUsers.includes(member.id)) {
    await member.kick('محظور من دخول السيرفر (bblock)').catch(() => {});
    await sendLog(member.guild, guildData, embed('🚫 دخول محظور', `تمت محاولة دخول <@${member.id}> وهو محظور.`, 0xed4245));
    return;
  }

  // ---- منع البوتات ----
  if (member.user.bot) {
    if (guildData.antiBots) {
      const executor = await fetchExecutor(member.guild, AuditLogEvent.BotAdd, member.id);
      if (executor && !isTrusted(guildData, executor.id)) {
        await member.kick('إضافة بوت غير مصرح بها').catch(() => {});
        await sendLog(member.guild, guildData, embed('🤖 تم طرد بوت', `تمت إضافة البوت <@${member.id}> بواسطة <@${executor.id}> — تم طرده.`, 0xed4245));
      }
    }
    return;
  }

  // ---- منع الحسابات الجديدة ----
  if (guildData.antiJoin) {
    const ageDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (ageDays < guildData.antiJoinMinAgeDays) {
      let actionText = 'طرد';
      try {
        if (guildData.joinAction === 'ban') {
          await member.ban({ reason: 'حساب جديد جدًا' });
          actionText = 'حظر';
        } else if (guildData.joinAction === 'jail' && guildData.jailRoleId) {
          await member.roles.add(guildData.jailRoleId, 'حساب جديد جدًا');
          actionText = 'سجن';
        } else {
          await member.kick('حساب جديد جدًا');
        }
      } catch {
        /* تجاهل */
      }
      await sendLog(
        member.guild,
        guildData,
        embed('🚪 حساب جديد', `تم تنفيذ **${actionText}** على <@${member.id}> (عمر الحساب: ${Math.floor(ageDays)} يوم).`, 0xf1c40f)
      );
    }
  }
});

client.on(Events.ChannelDelete, async (channel) => {
  if (!channel.guild) return;
  const guildId = channel.guild.id;
  const guildData = db.getGuild(guildId);

  if (channel.type === ChannelType.GuildCategory) {
    guildData.backups.deletedCategories.unshift({ name: channel.name, deletedAt: Date.now() });
    guildData.backups.deletedCategories = guildData.backups.deletedCategories.slice(0, 20);
  } else {
    guildData.backups.deletedChannels.unshift({
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId,
      topic: channel.topic || null,
      deletedAt: Date.now()
    });
    guildData.backups.deletedChannels = guildData.backups.deletedChannels.slice(0, 20);
  }
  db.setGuild(guildId, guildData);

  if (!guildData.protectionEnabled || !guildData.antiDelete) return;
  const executor = await fetchExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  if (!executor) return;
  await handleViolation(channel.guild, guildId, 'channels', executor.id, `حذف روم: **${channel.name}**`, guildData.instantRoomAction);
});

client.on(Events.GuildRoleDelete, async (role) => {
  const guildId = role.guild.id;
  const guildData = db.getGuild(guildId);

  guildData.backups.deletedRoles.unshift({
    name: role.name,
    color: role.color,
    hoist: role.hoist,
    mentionable: role.mentionable,
    permissions: role.permissions.bitfield.toString(),
    deletedAt: Date.now()
  });
  guildData.backups.deletedRoles = guildData.backups.deletedRoles.slice(0, 20);
  db.setGuild(guildId, guildData);

  if (!guildData.protectionEnabled || !guildData.antiDelete) return;
  const executor = await fetchExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
  if (!executor) return;
  await handleViolation(role.guild, guildId, 'roles', executor.id, `حذف رول: **${role.name}**`, guildData.instantRoleAction);
});

client.on(Events.GuildRoleCreate, async (role) => {
  const guildData = db.getGuild(role.guild.id);
  if (!guildData.protectionEnabled || !guildData.instantRoleAction) return;
  const executor = await fetchExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
  if (!executor) return;
  if (executor.id === client.user.id || isTrusted(guildData, executor.id) || isBypassDelete(guildData, executor.id)) return;
  await role.delete('إنشاء رول غير مصرح به').catch(() => {});
  await handleViolation(role.guild, role.guild.id, 'roles', executor.id, `إنشاء رول غير مصرح به: **${role.name}**`, true);
});

client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
  const guildData = db.getGuild(newRole.guild.id);
  if (!guildData.protectionEnabled) return;
  const permsChanged = !oldRole.permissions.equals(newRole.permissions);
  const otherChanged =
    oldRole.name !== newRole.name || oldRole.color !== newRole.color || oldRole.hoist !== newRole.hoist || oldRole.mentionable !== newRole.mentionable;
  if (!permsChanged && !otherChanged) return;
  if (!guildData.antiPermissions && !guildData.instantRoleAction) return;

  const executor = await fetchExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
  if (!executor || executor.id === client.user.id) return;
  if (isTrusted(guildData, executor.id) || isBypassDelete(guildData, executor.id)) return;

  if (permsChanged && guildData.antiPermissions) {
    await newRole.setPermissions(oldRole.permissions, 'استرجاع تعديل صلاحيات غير مصرح به').catch(() => {});
    await handleViolation(newRole.guild, newRole.guild.id, 'permissions', executor.id, `تعديل صلاحيات الرول: **${newRole.name}**`, false);
  } else if (otherChanged && guildData.instantRoleAction) {
    await newRole
      .edit({ name: oldRole.name, color: oldRole.color, hoist: oldRole.hoist, mentionable: oldRole.mentionable }, 'استرجاع تعديل غير مصرح به')
      .catch(() => {});
    await handleViolation(newRole.guild, newRole.guild.id, 'roles', executor.id, `تعديل الرول: **${newRole.name}**`, true);
  }
});

client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;
  const guildData = db.getGuild(newChannel.guild.id);
  if (!guildData.protectionEnabled || !guildData.antiPermissions) return;
  const oldOw = JSON.stringify(serializeOverwrites(oldChannel));
  const newOw = JSON.stringify(serializeOverwrites(newChannel));
  if (oldOw === newOw) return;

  const executor =
    (await fetchExecutor(newChannel.guild, AuditLogEvent.ChannelOverwriteUpdate, newChannel.id)) ||
    (await fetchExecutor(newChannel.guild, AuditLogEvent.ChannelOverwriteCreate, newChannel.id));
  if (!executor || executor.id === client.user.id) return;
  if (isTrusted(guildData, executor.id) || isBypassDelete(guildData, executor.id)) return;

  try {
    await newChannel.permissionOverwrites.set(
      oldChannel.permissionOverwrites.cache.map((ow) => ({ id: ow.id, type: ow.type, allow: ow.allow, deny: ow.deny })),
      'استرجاع تعديل صلاحيات غير مصرح به'
    );
  } catch {
    /* تجاهل */
  }
  await handleViolation(newChannel.guild, newChannel.guild.id, 'permissions', executor.id, `تعديل صلاحيات روم: **${newChannel.name}**`, false);
});

client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
  const guildData = db.getGuild(newGuild.id);
  if (!guildData.protectionEnabled || !guildData.antiGuildUpdate) return;
  if (oldGuild.name === newGuild.name && oldGuild.icon === newGuild.icon) return;

  const executor = await fetchExecutor(newGuild, AuditLogEvent.GuildUpdate, newGuild.id);
  if (!executor || executor.id === client.user.id) return;
  if (isTrusted(guildData, executor.id) || isBypassDelete(guildData, executor.id)) return;

  try {
    if (oldGuild.name !== newGuild.name) await newGuild.setName(oldGuild.name, 'استرجاع تعديل غير مصرح به');
    if (oldGuild.icon !== newGuild.icon) await newGuild.setIcon(oldGuild.iconURL({ size: 1024 }) || null, 'استرجاع تعديل غير مصرح به');
  } catch {
    /* تجاهل */
  }
  await handleViolation(newGuild, newGuild.id, 'guildUpdate', executor.id, 'تعديل إعدادات السيرفر (الاسم/الصورة)', true);
});

client.on(Events.GuildBanAdd, async (ban) => {
  const guildData = db.getGuild(ban.guild.id);
  if (!guildData.protectionEnabled) return;
  const executor = await fetchExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
  if (!executor || executor.id === client.user.id) return;
  if (isTrusted(guildData, executor.id) || isBypassDelete(guildData, executor.id)) return;
  await handleViolation(ban.guild, ban.guild.id, 'banKick', executor.id, `تم حظر العضو: **${ban.user.tag}**`, false);
});

client.on(Events.GuildMemberRemove, async (member) => {
  const guildData = db.getGuild(member.guild.id);
  if (!guildData.protectionEnabled) return;
  const executor = await fetchExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
  if (!executor || executor.id === client.user.id) return;
  if (isTrusted(guildData, executor.id) || isBypassDelete(guildData, executor.id)) return;
  await handleViolation(member.guild, member.guild.id, 'banKick', executor.id, `تم طرد العضو: **${member.user.tag}**`, false);
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const guildId = newMember.guild.id;
  const guildData = db.getGuild(guildId);

  const oldRoles = new Set(oldMember.roles.cache.keys());
  const newRoles = new Set(newMember.roles.cache.keys());
  const added = [...newRoles].filter((id) => !oldRoles.has(id));
  const removed = [...oldRoles].filter((id) => !newRoles.has(id));

  if (
    guildData.protectionEnabled &&
    guildData.protectedRoles.length &&
    (added.some((id) => guildData.protectedRoles.includes(id)) || removed.some((id) => guildData.protectedRoles.includes(id)))
  ) {
    const executor = await fetchExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
    if (executor && executor.id !== client.user.id && !isTrusted(guildData, executor.id) && !isBypassDelete(guildData, executor.id)) {
      await newMember.roles.set([...oldRoles], 'استرجاع تعديل غير مصرح به على رول محمي').catch(() => {});
      await handleViolation(newMember.guild, guildId, 'roles', executor.id, 'تعديل غير مصرح به على رول محمي', true);
      return;
    }
  }

  if (newMember.roles.cache.size >= oldMember.roles.cache.size) {
    guildData.memberRoleSnapshots[newMember.id] = [...newMember.roles.cache.keys()].filter((id) => id !== newMember.guild.id);
    db.setGuild(guildId, guildData);
  }
});

// شبكة أمان: أي خطأ غير متوقع بأي مكان بالكود يُسجَّل فقط ولا يوقف تشغيل البوت
process.on('unhandledRejection', (err) => {
  console.error('❗ Unhandled Rejection:', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('❗ Uncaught Exception:', err?.message || err);
});

// تشغيل داشبورد الويب — يستخدم نفس الـ client ونفس ملف البيانات، فأي تغيير من الداشبورد
// ينعكس فورًا على سلوك البوت والعكس صحيح
require('./dashboard/app')(client);

client.login(process.env.TOKEN);
