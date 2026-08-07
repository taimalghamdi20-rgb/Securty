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

    // #createlimit / #dlimit
    limitsEnabled: false,
    limits: { count: 3, seconds: 10 },

    // #procedure  -> 'strip' | 'kick' | 'ban' | 'jail'
    procedure: 'strip',
    jailRoleId: null,

    // #antidelete — حماية حذف الرولات/الرومات/الكاتقوري
    antiDelete: true,

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

    // تتبع المخالفات المؤقت (لا يُحفظ بشكل دائم فعليًا لكنه موجود بالـ DB لتبسيط الأمر)
    violations: {}
  };
}

function getGuild(guildId) {
  const db = load();
  if (!db[guildId]) {
    db[guildId] = defaultGuildData();
    save();
  } else {
    // دمج أي حقول جديدة أضيفت لاحقًا بدون فقدان بيانات قديمة
    db[guildId] = Object.assign(defaultGuildData(), db[guildId]);
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
