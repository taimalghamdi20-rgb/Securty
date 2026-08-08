// dashboard/views.js — قوالب HTML للداشبورد (بدون أي مكتبة فرونت إند، سكربت عادي)

const BASE_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap');
  :root{
    --bg:#0a0a0b; --card:#17181c; --border:rgba(255,255,255,.07);
    --text:#f5f5f6; --muted:#93969e; --green:#23a55a; --red:#e0435c;
    --amber:#d98a3d; --pill:#1f2024; --input:#0f1013;
  }
  *{box-sizing:border-box;}
  body{
    margin:0; background:var(--bg); color:var(--text); direction:rtl;
    font-family:'Tajawal',sans-serif; min-height:100vh;
  }
  .wrap{max-width:1180px;margin:0 auto;padding:28px 20px 80px;}
  .topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;}
  .brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;}
  .brand span.badge{background:var(--amber);color:#1a1200;border-radius:8px;padding:4px 8px;font-size:13px;}
  .navlinks{display:flex;align-items:center;gap:14px;font-size:14px;color:var(--muted);}
  .navlinks a{color:var(--muted);text-decoration:none;}
  .navlinks a:hover{color:var(--text);}
  .avatar{width:30px;height:30px;border-radius:50%;object-fit:cover;border:1px solid var(--border);}

  .master{
    display:flex;align-items:center;justify-content:space-between;
    background:var(--card);border:1px solid var(--border);border-radius:20px;
    padding:20px 24px;margin-bottom:22px;
  }
  .master .left{display:flex;align-items:center;gap:16px;}
  .master h2{margin:0;font-size:17px;}
  .master p{margin:2px 0 0;color:var(--muted);font-size:13px;}
  .check{background:rgba(35,165,90,.14);color:var(--green);border:1px solid rgba(35,165,90,.35);
    border-radius:10px;padding:6px 12px;font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px;}

  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
  @media(max-width:860px){.grid2{grid-template-columns:1fr;}}

  .card{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:22px;margin-bottom:20px;}
  .card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
  .card-head .titles h3{margin:0;font-size:16px;}
  .card-head .titles p{margin:2px 0 0;color:var(--muted);font-size:12.5px;}
  .icon-badge{width:38px;height:38px;border-radius:12px;background:#232327;color:var(--amber);
    display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;}

  .row{display:flex;align-items:center;justify-content:space-between;background:var(--input);
    border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:10px;}
  .row .t{font-weight:700;font-size:14px;}
  .row .d{color:var(--muted);font-size:12.5px;margin-top:3px;}

  .switch{position:relative;width:44px;height:24px;border-radius:999px;background:var(--red);
    cursor:pointer;flex-shrink:0;transition:background .18s;border:none;padding:0;}
  .switch.on{background:var(--green);}
  .switch .thumb{position:absolute;top:3px;right:3px;width:18px;height:18px;border-radius:50%;
    background:#fff;transition:transform .18s;}
  .switch.on .thumb{transform:translateX(-20px);}

  .spamrow{display:flex;align-items:center;gap:12px;background:var(--input);border:1px solid var(--border);
    border-radius:14px;padding:12px 16px;}
  .spamrow input{width:64px;background:var(--pill);border:1px solid var(--border);border-radius:10px;
    color:var(--text);text-align:center;font-family:inherit;font-size:14px;padding:8px 0;}
  .spamrow .lbl{font-weight:700;font-size:14px;}

  .tabs{display:flex;gap:8px;margin-bottom:12px;}
  .tab{padding:9px 16px;border-radius:999px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid var(--border);
    background:transparent;color:var(--muted);}
  .tab.active{background:var(--green);color:#04150a;border-color:var(--green);}
  .addrow{display:flex;gap:8px;margin-bottom:16px;}
  .addrow input{flex:1;background:var(--input);border:1px solid var(--border);border-radius:12px;
    color:var(--text);padding:11px 14px;font-family:inherit;font-size:13px;}
  .addrow button{background:var(--pill);border:1px solid var(--border);border-radius:12px;color:var(--text);
    padding:0 16px;font-weight:700;cursor:pointer;font-family:inherit;}
  .listbox{background:var(--input);border:1px solid var(--border);border-radius:14px;padding:14px 16px;min-height:70px;}
  .listbox .lh{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13.5px;margin-bottom:8px;}
  .listbox .lh .n{color:var(--muted);font-weight:400;font-size:12px;}
  .listbox .empty{color:var(--muted);font-size:12.5px;text-align:center;padding:10px 0;}
  .member-chip{display:flex;align-items:center;justify-content:space-between;background:var(--pill);
    border-radius:10px;padding:8px 10px;font-size:12.5px;margin-bottom:6px;}
  .member-chip button{background:none;border:none;color:var(--red);cursor:pointer;font-size:13px;font-family:inherit;}
  .whitelist-lists{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px;}
  @media(max-width:520px){.whitelist-lists{grid-template-columns:1fr;}}

  .limits3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:16px;}
  @media(max-width:760px){.limits3{grid-template-columns:1fr;}}
  .limitbox{background:var(--input);border:1px solid var(--border);border-radius:14px;padding:14px 16px;}
  .limitbox .t{font-weight:700;font-size:13.5px;}
  .limitbox .d{color:var(--muted);font-size:11.5px;margin:2px 0 12px;}
  .stepper{display:flex;align-items:center;justify-content:space-between;background:var(--pill);
    border-radius:10px;padding:6px;}
  .stepper button{width:30px;height:30px;border-radius:8px;border:none;background:#28292e;color:var(--text);
    font-size:16px;cursor:pointer;font-family:inherit;}
  .stepper .val{font-weight:700;font-size:15px;}

  .defaultaction{background:var(--input);border:1px solid var(--border);border-radius:14px;padding:14px 16px;
    display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;}
  .defaultaction .t{font-weight:700;font-size:14px;}
  .defaultaction .d{color:var(--muted);font-size:12px;margin-top:2px;}
  .defaultaction select{background:var(--pill);color:var(--text);border:1px solid var(--border);
    border-radius:10px;padding:9px 14px;font-family:inherit;font-size:13.5px;}

  .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--card);
    border:1px solid var(--border);border-radius:12px;padding:10px 18px;font-size:13px;opacity:0;
    transition:opacity .25s;pointer-events:none;z-index:50;}
  .toast.show{opacity:1;}

  .login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:18px;text-align:center;padding:20px;}
  .login-card{background:var(--card);border:1px solid var(--border);border-radius:22px;padding:40px 34px;max-width:380px;}
  .login-card h1{font-size:20px;margin:0 0 8px;}
  .login-card p{color:var(--muted);font-size:13.5px;margin:0 0 22px;}
  .btn-discord{background:#5865F2;color:#fff;border:none;border-radius:12px;padding:13px 24px;font-weight:700;
    font-size:14px;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-block;}

  .pickgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-top:20px;}
  .pickcard{background:var(--card);border:1px solid var(--border);border-radius:18px;padding:18px;text-align:center;
    text-decoration:none;color:var(--text);transition:border-color .15s;}
  .pickcard:hover{border-color:var(--amber);}
  .pickcard img{width:56px;height:56px;border-radius:16px;margin-bottom:10px;}
  .pickcard .ph{width:56px;height:56px;border-radius:16px;margin:0 auto 10px;background:#232327;
    display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;color:var(--amber);}
  .pickcard .name{font-weight:700;font-size:14px;}
  .empty-state{color:var(--muted);text-align:center;padding:60px 20px;font-size:14px;}
`;

function page(title, body, extraHead = '') {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>${BASE_STYLE}</style>
${extraHead}
</head>
<body>${body}</body>
</html>`;
}

function renderLogin(error) {
  const body = `
  <div class="login-wrap">
    <div class="login-card">
      <h1>🛡️ داشبورد الحماية</h1>
      <p>سجّل دخولك بحساب ديسكورد للتحكم بإعدادات حماية سيرفرك مباشرةً.</p>
      ${error ? `<p style="color:var(--red);font-size:13px;">${error}</p>` : ''}
      <a class="btn-discord" href="/auth/discord/login">تسجيل الدخول عبر Discord</a>
    </div>
  </div>`;
  return page('تسجيل الدخول', body);
}

function renderPicker(user, guilds) {
  const cards = guilds.length
    ? guilds
        .map(
          (g) => `
      <a class="pickcard" href="/dashboard/${g.id}">
        ${g.icon ? `<img src="${g.icon}">` : `<div class="ph">${g.name.slice(0, 1)}</div>`}
        <div class="name">${g.name}</div>
      </a>`
        )
        .join('')
    : `<div class="empty-state">ما لقينا سيرفرات أنت أدمن فيها والبوت موجود فيها.<br>تأكد إن البوت مُضاف لسيرفرك وإنك تملك صلاحية Administrator.</div>`;

  const body = `
  <div class="wrap">
    <div class="topbar">
      <div class="brand">🛡️ داشبورد الحماية</div>
      <div class="navlinks">
        <span>${user.username}</span>
        <img class="avatar" src="${user.avatar}">
        <a href="/logout">تسجيل الخروج</a>
      </div>
    </div>
    <h2 style="font-size:18px;margin:20px 0 0;">اختر السيرفر</h2>
    <div class="pickgrid">${cards}</div>
  </div>`;
  return page('اختر سيرفرك', body);
}

function toggleRow(key, title, desc) {
  return `
  <div class="row">
    <button class="switch" data-key="${key}" onclick="toggleSetting(this)"><span class="thumb"></span></button>
    <div style="text-align:right;">
      <div class="t">${title}</div>
      <div class="d">${desc}</div>
    </div>
  </div>`;
}

function memberChip(id, name, listKey) {
  return `
  <div class="member-chip" data-id="${id}">
    <button onclick="removeWhitelist('${listKey}','${id}')">✕</button>
    <span>${name}</span>
  </div>`;
}

function renderGuildDashboard(user, guild, gd, trustedMembers, bypassMembers) {
  const body = `
  <div class="wrap">
    <div class="topbar">
      <div class="brand">${guild.icon ? `<img class="avatar" src="${guild.icon}">` : '🛡️'} ${guild.name}</div>
      <div class="navlinks">
        <a href="/dashboard">كل السيرفرات</a>
        <span>${user.username}</span>
        <img class="avatar" src="${user.avatar}">
        <a href="/logout">تسجيل الخروج</a>
      </div>
    </div>

    <div class="master">
      <div class="left">
        <button class="switch ${gd.protectionEnabled ? 'on' : ''}" data-key="protectionEnabled" onclick="toggleSetting(this)"><span class="thumb"></span></button>
        <div>
          <h2>الحماية تعمل</h2>
          <p>تُطبق الإعدادات على نفس قاعدة بيانات أوامر الحماية.</p>
        </div>
      </div>
      <div class="check" id="masterCheck">${gd.protectionEnabled ? '✓ الحماية تعمل' : '✕ الحماية متوقفة'}</div>
    </div>

    <div class="grid2">
      <div class="card">
        <div class="card-head">
          <div class="titles"><h3>حماية الأعضاء والمحتوى</h3><p>السبام والروابط والدخول والبوتات</p></div>
          <div class="icon-badge">👁️</div>
        </div>
        ${toggleRow('antiBots', 'منع البوتات غير الموثوقة', 'طرد البوت ومعاقبة من أضافه')}
        ${toggleRow('antiJoin', 'حماية الدخول', 'التعامل مع الحسابات الجديدة والمشبوهة')}
        ${toggleRow('antiSpam', 'مكافحة السبام', 'حذف التكرار وتطبيق الإجراء المحدد')}
        ${toggleRow('antiLinks', 'مكافحة الروابط', 'منع الروابط غير الموجودة في القائمة المسموحة')}
        <div class="spamrow">
          <input type="number" min="1" id="spamCountInput" value="${gd.spamLimit.count}" onchange="updateSpam()">
          <div class="lbl">حد السبام خلال <span id="spamSecondsLbl">${gd.spamLimit.seconds}</span> ثوان</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div class="titles"><h3>حماية التخريب</h3><p>حماية الرومات والرولات وإعدادات السيرفر</p></div>
          <div class="icon-badge">◆</div>
        </div>
        ${toggleRow('antiDelete', 'منع حذف الرومات والرولات', 'استرجاع العنصر وتطبيق العقوبة على المنفذ')}
        ${toggleRow('instantRoomAction', 'حماية الرومات الفورية', 'تنفيذ الإجراء من أول مخالفة')}
        ${toggleRow('instantRoleAction', 'حماية الرولات الفورية', 'منع إنشاء أو حذف أو تعديل الرولات')}
        ${toggleRow('antiGuildUpdate', 'حماية إعدادات السيرفر', 'منع تغيير الاسم والصورة والإعدادات الحساسة')}
        ${toggleRow('antiPermissions', 'حماية الصلاحيات', 'إرجاع تعديلات صلاحيات الرومات والرولات')}
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <div class="card-head">
          <div class="titles"><h3>القائمة البيضاء</h3><p>إدارة الأشخاص المستثنين من أنظمة الحماية</p></div>
          <div class="icon-badge">👤</div>
        </div>
        <div class="tabs">
          <button class="tab active" id="tab-trusted" onclick="switchTab('trusted')">+ موثوق</button>
          <button class="tab" id="tab-bypass" onclick="switchTab('bypass')">+ تخطي التخريب</button>
        </div>
        <div class="addrow">
          <input id="whitelistInput" placeholder="أدخل آيدي المستخدم">
          <button onclick="addWhitelist()">إضافة</button>
        </div>
        <div class="whitelist-lists">
          <div class="listbox">
            <div class="lh">✓ الموثوقون بالكامل <span class="n" id="trustedCount">${trustedMembers.length} مستخدم</span></div>
            <div id="trustedList">${trustedMembers.length ? trustedMembers.map((m) => memberChip(m.id, m.name, 'trusted')).join('') : '<div class="empty">لا يوجد مستخدمون موثوقون</div>'}</div>
          </div>
          <div class="listbox">
            <div class="lh">◆ تخطي حماية التخريب <span class="n" id="bypassCount">${bypassMembers.length} مستخدم</span></div>
            <div id="bypassList">${bypassMembers.length ? bypassMembers.map((m) => memberChip(m.id, m.name, 'bypass')).join('') : '<div class="empty">لا يوجد مستخدمون مستثنون</div>'}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div class="titles"><h3>الحدود والعقوبات</h3><p>حدد عدد العمليات المسموحة قبل تنفيذ العقوبة</p></div>
          <div class="icon-badge">#</div>
        </div>
        <div class="limits3">
          <div class="limitbox">
            <div class="t">حد الباند والكيك</div>
            <div class="d">عمليات الباند والطرد</div>
            <div class="stepper">
              <button onclick="stepLimit('banKick',1)">+</button>
              <span class="val" id="limit-banKick">${gd.limits.banKick}</span>
              <button onclick="stepLimit('banKick',-1)">-</button>
            </div>
          </div>
          <div class="limitbox">
            <div class="t">حد الرولات</div>
            <div class="d">إنشاء أو حذف الرول</div>
            <div class="stepper">
              <button onclick="stepLimit('roles',1)">+</button>
              <span class="val" id="limit-roles">${gd.limits.roles}</span>
              <button onclick="stepLimit('roles',-1)">-</button>
            </div>
          </div>
          <div class="limitbox">
            <div class="t">حد الرومات</div>
            <div class="d">إنشاء أو حذف الرومات</div>
            <div class="stepper">
              <button onclick="stepLimit('channels',1)">+</button>
              <span class="val" id="limit-channels">${gd.limits.channels}</span>
              <button onclick="stepLimit('channels',-1)">-</button>
            </div>
          </div>
        </div>
        <div class="defaultaction">
          <div>
            <div class="t">الإجراء الافتراضي</div>
            <div class="d">العقوبة التي تُطبق عند تجاوز الحد</div>
          </div>
          <select id="procedureSelect" onchange="updateProcedure()">
            <option value="strip" ${gd.procedure === 'strip' ? 'selected' : ''}>سحب الرولات</option>
            <option value="kick" ${gd.procedure === 'kick' ? 'selected' : ''}>طرد</option>
            <option value="ban" ${gd.procedure === 'ban' ? 'selected' : ''}>حظر</option>
            <option value="jail" ${gd.procedure === 'jail' ? 'selected' : ''}>سجن</option>
          </select>
        </div>
      </div>
    </div>
  </div>
  <div class="toast" id="toast"></div>

  <script>
    const GUILD_ID = ${JSON.stringify(guild.id)};
    let currentTab = 'trusted';
    let state = ${JSON.stringify({ ...gd })};

    function showToast(msg){
      const t = document.getElementById('toast');
      t.textContent = msg; t.classList.add('show');
      setTimeout(()=>t.classList.remove('show'), 1800);
    }

    async function patch(body){
      const res = await fetch('/api/guild/' + GUILD_ID + '/settings', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
      });
      if(!res.ok){ showToast('صار خطأ، حاول مرة ثانية'); return null; }
      return res.json();
    }

    function toggleSetting(btn){
      const key = btn.dataset.key;
      const willBeOn = !btn.classList.contains('on');
      btn.classList.toggle('on', willBeOn);
      if(key === 'protectionEnabled'){
        document.getElementById('masterCheck').textContent = willBeOn ? '✓ الحماية تعمل' : '✕ الحماية متوقفة';
      }
      patch({ [key]: willBeOn }).then(()=>showToast('تم الحفظ'));
    }

    function updateSpam(){
      const count = parseInt(document.getElementById('spamCountInput').value) || 1;
      patch({ spamLimit: { count, seconds: state.spamLimit.seconds } }).then(()=>showToast('تم الحفظ'));
    }

    function updateProcedure(){
      const procedure = document.getElementById('procedureSelect').value;
      patch({ procedure }).then(()=>showToast('تم الحفظ'));
    }

    function stepLimit(key, delta){
      const el = document.getElementById('limit-' + key);
      let val = Math.max(1, parseInt(el.textContent) + delta);
      el.textContent = val;
      const limits = Object.assign({}, state.limits, { [key]: val });
      state.limits = limits;
      patch({ limits }).then(()=>showToast('تم الحفظ'));
    }

    function switchTab(tab){
      currentTab = tab;
      document.getElementById('tab-trusted').classList.toggle('active', tab==='trusted');
      document.getElementById('tab-bypass').classList.toggle('active', tab==='bypass');
      document.getElementById('whitelistInput').placeholder = tab==='trusted' ? 'أدخل آيدي المستخدم (موثوق بالكامل)' : 'أدخل آيدي المستخدم (تخطي حماية التخريب)';
    }

    async function addWhitelist(){
      const input = document.getElementById('whitelistInput');
      const id = input.value.trim();
      if(!/^[0-9]{15,20}$/.test(id)){ showToast('حط آيدي صحيح'); return; }
      const res = await fetch('/api/guild/' + GUILD_ID + '/whitelist', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ list: currentTab, action:'add', userId: id })
      });
      if(!res.ok){ showToast('صار خطأ'); return; }
      input.value = '';
      showToast('تمت الإضافة');
      location.reload();
    }

    async function removeWhitelist(list, id){
      const res = await fetch('/api/guild/' + GUILD_ID + '/whitelist', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ list, action:'remove', userId: id })
      });
      if(!res.ok){ showToast('صار خطأ'); return; }
      showToast('تمت الإزالة');
      location.reload();
    }
  </script>`;

  // نعلّم كل زر تبديل بحالته الحالية عند التوليد (حتى لا نعتمد فقط على السكربت)
  const stateFlags = {
    antiBots: gd.antiBots,
    antiJoin: gd.antiJoin,
    antiSpam: gd.antiSpam,
    antiLinks: gd.antiLinks,
    antiDelete: gd.antiDelete,
    instantRoomAction: gd.instantRoomAction,
    instantRoleAction: gd.instantRoleAction,
    antiGuildUpdate: gd.antiGuildUpdate,
    antiPermissions: gd.antiPermissions
  };
  return page(`${guild.name} · الداشبورد`, injectOnClasses(body, stateFlags));
}

function injectOnClasses(html, flags) {
  let out = html;
  for (const [key, val] of Object.entries(flags)) {
    if (!val) continue;
    out = out.replace(
      `<button class="switch" data-key="${key}"`,
      `<button class="switch on" data-key="${key}"`
    );
  }
  return out;
}

module.exports = { renderLogin, renderPicker, renderGuildDashboard };
