// db.js — نظام تخزين بسيط بصيغة JSON لإعدادات كل سيرفر
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

function ensureFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2));
}

ensureFile();

let cache = null;

function load() {
  if (cache) return cache;
  ensureFile();
  try {
    cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    cache = {};
  }
  return cache;
}

function save() {
  fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2));
}

function defaultGuildData() {
  return {
    protectionEnabled: false,
    seclogChannel: null,

    // #ranti / #rantilist — يخطون حذف الرولات والرومات فقط
    bypassDelete: [],
    // #trust / #trustlist — يخطون الحماية بالكامل
    trusted: [],

    // #createlimit / #dlimit + الحدود من الداشبورد
    limitsEnabled: true,
    limits: { banKick: 3, roles: 3, channels: 3, seconds: 60 },

    // #procedure  -> 'strip' | 'kick' | 'ban' | 'jail'
    procedure: 'strip',
    jailRoleId: null,

    // #antidelete — حماية حذف الرولات/الرومات/الكاتقوري (المفتاح الرئيسي لحماية التخريب)
    antiDelete: true,
    // حماية فورية (تنفيذ الإجراء من أول مخالفة) لكل تصنيف على حدة — من الداشبورد
    instantRoomAction: false, // حماية الرومات الفورية
    instantRoleAction: false, // حماية الرولات الفورية (إنشاء/حذف/تعديل)
    antiGuildUpdate: false, // حماية إعدادات السيرفر (الاسم/الصورة)
    antiPermissions: false, // حماية الصلاحيات (تعديلات صلاحيات الرومات/الرولات)

    // #antijoin / #setjoin
    antiJoin: false,
    antiJoinMinAgeDays: 7,
    joinAction: 'kick', // kick | ban | jail

    // #antibots
    antiBots: false,

    // #antispam / #spam
    antiSpam: false,
    spamLimit: { count: 5, seconds: 5 },

    // #antilinks / #links
    antiLinks: false,
    allowedLinks: [],

    // #antiword
    bannedWords: [],

    // #bblock / #unbblock
    blockedUsers: [],

    // #collection / #collectionlist — رولات محمية لا يتم التعديل عليها إلا من موثوق
    protectedRoles: [],

    // نسخ احتياطية
    backups: {
      deletedRoles: [],
      deletedChannels: [],
      deletedCategories: []
    },
    fullBackup: null,
    memberRoleSnapshots: {},

    // تتبع المخالفات لكل تصنيف: channels / roles / banKick / permissions / guildUpdate
    violations: { channels: {}, roles: {}, banKick: {}, permissions: {}, guildUpdate: {} }
  };
}

function getGuild(guildId) {
  const db = load();
  const defaults = defaultGuildData();
  if (!db[guildId]) {
    db[guildId] = defaults;
    save();
  } else {
    const merged = Object.assign({}, defaults, db[guildId]);
    // دمج الحقول المتداخلة (limits/backups/violations) بشكل عميق حتى لا تنكسر البيانات القديمة
    merged.limits = Object.assign({}, defaults.limits, db[guildId].limits || {});
    merged.violations = Object.assign({}, defaults.violations, db[guildId].violations || {});
    merged.backups = Object.assign({}, defaults.backups, db[guildId].backups || {});
    merged.spamLimit = Object.assign({}, defaults.spamLimit, db[guildId].spamLimit || {});
    db[guildId] = merged;
  }
  return db[guildId];
}

function setGuild(guildId, data) {
  const db = load();
  db[guildId] = data;
  save();
  return data;
}

function updateGuild(guildId, patchFn) {
  const data = getGuild(guildId);
  patchFn(data);
  save();
  return data;
}

module.exports = { getGuild, setGuild, updateGuild };
