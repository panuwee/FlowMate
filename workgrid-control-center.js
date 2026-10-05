/* AUTO-GENERATED from workgrid-control-center.jsx by build-github.cjs. Do not edit; edit the .jsx and re-run `npm run build:github`. */
(function () {
  'use strict';

  const catalog = {
    'creative.assigned': 'CR · Assign → Assignee',
    'creative.review_requested': 'CR · Review → Requester',
    'quick_task.assigned': 'Task Assign → Assignee',
    'activity.output_ready': 'Activity · สร้างครบชุดสำเร็จ',
    'activity.held': 'Activity · ติดขัด',
    'activity.source_issue': 'Activity · ปัญหาต้นทาง',
    'activity.scheduler_issue': 'Activity · ปัญหา Scheduler'
  };
  const teams = {
    gdve: 'GD/VE',
    ops: 'Operations',
    mkt: 'Marketing',
    esport: 'eSports'
  };
  const tabs = {
    overview: 'ภาพรวม',
    bot: 'Bots',
    profile: 'ผู้รับ',
    destination: 'กลุ่ม SeaTalk',
    rule: 'กฎแจ้งเตือน',
    history: 'ประวัติส่ง',
    proposals: 'ข้อเสนอ / Audit'
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
  const clone = value => JSON.parse(JSON.stringify(value));
  const badge = (text, mode = '') => `<span class="badge ${mode}">${esc(text)}</span>`;
  const evtLabel = key => catalog[key] || key;
  const fieldLabels = {
    member_id: 'สมาชิก',
    bot_key: 'Bot',
    channel: 'ช่องทาง',
    employment_type: 'ประเภทสมาชิก',
    seatalk_id: 'SeaTalk ID',
    destination_key: 'กลุ่มปลายทาง',
    enabled: 'เปิดใช้งาน',
    events: 'เหตุการณ์ที่รับ',
    app_id: 'SeaTalk App ID',
    credential_ref: 'Secret reference',
    state: 'สถานะ',
    label: 'ชื่อ',
    allowed_teams: 'ทีมที่อนุญาต',
    allowed_events: 'เหตุการณ์ที่อนุญาต',
    owner: 'เจ้าของ',
    purpose: 'ใช้สำหรับ',
    event: 'เหตุการณ์',
    group_id: 'SeaTalk Group ID'
  };
  const button = (action, label, key = '', kind = '', extra = '') => `<button type="button" data-action="${action}" data-key="${esc(key)}" data-kind="${esc(kind)}" ${extra}>${esc(label)}</button>`;
  function demoWorkspace(lead) {
    const entity = (kind, key, team_code, data) => ({
      kind,
      key,
      team_code,
      data,
      version: 1,
      verification: null
    });
    return {
      admin: !lead,
      actor_id: 'demo-panu',
      teams: lead ? ['mkt'] : Object.keys(teams),
      runtime: false,
      members: [{
        id: 'demo-pond',
        user_id: 'demo-pond-user',
        name: 'Pond (ข้อมูลจำลอง)',
        email: 'pond@example.test',
        role: 'member',
        active: true,
        teams: ['gdve']
      }, {
        id: 'demo-folk',
        user_id: 'demo-folk-user',
        name: 'Folk (ข้อมูลจำลอง)',
        email: 'folk@example.test',
        role: 'member',
        active: true,
        teams: ['mkt']
      }].filter(m => !lead || m.teams.includes('mkt')),
      entities: [entity('bot', 'creative', null, {
        label: 'Creative Bot',
        app_id: 'OTg1MjIwNzY0OTY3',
        credential_ref: 'WCC_BOT_SECRET_CREATIVE',
        state: 'draft',
        allowed_events: ['creative.assigned', 'creative.review_requested'],
        allowed_teams: Object.keys(teams)
      }), entity('bot', 'flowmate', null, {
        label: 'FlowMate',
        app_id: 'NTgyNzAzMjc5MjE4',
        credential_ref: 'WCC_BOT_SECRET_FLOWMATE',
        state: 'draft',
        allowed_events: ['quick_task.assigned', 'activity.output_ready', 'activity.held'],
        allowed_teams: Object.keys(teams)
      }), entity('destination', 'folk-demo', 'mkt', {
        label: 'Folk · Freelance pilot',
        bot_key: 'creative',
        group_id: 'Njk2MTczMDEwNTg2',
        state: 'draft',
        owner: 'Panu',
        purpose: 'Task ใหม่ / Review'
      }), entity('destination', 'fcoth-operation', 'ops', {
        label: 'FCOTH Operation',
        bot_key: 'flowmate',
        group_id: 'ODg5NDI1MDQwODI3',
        state: 'draft',
        owner: 'Panu',
        purpose: 'Activity Automation'
      }), entity('profile', 'pond-demo', 'gdve', {
        member_id: 'demo-pond',
        bot_key: 'creative',
        channel: 'direct',
        employment_type: 'Fulltime',
        enabled: false,
        events: ['creative.assigned']
      }), entity('profile', 'folk-demo', 'mkt', {
        member_id: 'demo-folk',
        bot_key: 'creative',
        channel: 'group',
        employment_type: 'Freelance',
        seatalk_id: '',
        destination_key: 'folk-demo',
        enabled: false,
        events: ['creative.assigned', 'creative.review_requested']
      }), ...Object.keys(teams).flatMap(team => ['creative.assigned', 'creative.review_requested', 'quick_task.assigned'].map(event => entity('rule', team + ':' + event, team, {
        label: evtLabel(event),
        event,
        bot_key: event.startsWith('creative.') ? 'creative' : 'flowmate',
        enabled: false
      }))), entity('rule', 'ops:activity.output_ready', 'ops', {
        label: 'Activity สร้างครบชุดสำเร็จ',
        event: 'activity.output_ready',
        bot_key: 'flowmate',
        destination_key: 'fcoth-operation',
        enabled: false
      })].filter(e => !lead || !e.team_code || e.team_code === 'mkt'),
      deliveries: [],
      proposals: [],
      audit: [],
      reviewers: [],
      work_items: [{
        id: 'demo-cr',
        display_id: 'CR-DEMO',
        title: 'ตัวอย่าง Review โดย Folk',
        status: 'review',
        type: 'creative_request'
      }]
    };
  }
  async function createApp(root, client, options = {}) {
    const demo = !!options.demo;
    if (demo && !['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname)) throw new Error('โหมดจำลองใช้ได้เฉพาะ local');
    let ws,
      tab = 'overview',
      query = '',
      dialog,
      editing,
      pending,
      busy = false;
    const find = (kind, key) => ws.entities.find(e => e.kind === kind && e.key === key);
    const member = id => ws.members.find(m => m.id === id);
    const name = e => e.kind === 'profile' ? member(e.data.member_id)?.name || e.key : e.data.label || e.key;
    const verification = e => e.verification?.current ? badge(demo ? 'จำลอง: ตรวจผ่าน' : e.kind === 'bot' ? 'ตรวจ authentication ผ่าน' : e.kind === 'destination' ? 'อ่านกลุ่มผ่าน' : e.verification?.evidence?.method === 'human_confirmation_not_api_membership' ? 'Admin ยืนยันสมาชิก' : 'ตรวจ identity ผ่าน', 'ok') + `<div class="muted">${esc(e.verification.checked_at || '')}</div>` : badge('รอตรวจ / ผลตรวจหมดอายุ', 'warn');
    const active = e => e.data.enabled ?? e.data.state === 'active';
    function notify(text, error = false) {
      const node = root.querySelector('#wcc-status');
      if (node) {
        node.textContent = text;
        node.className = 'status' + (error ? ' error' : '');
      }
    }
    async function rpc(name, args = {}) {
      if (demo) throw new Error('Demo must use the offline adapter');
      const {
        data,
        error
      } = await client.rpc(name, args);
      if (error) throw new Error(error.message || 'ดำเนินการไม่สำเร็จ');
      return data;
    }
    async function load() {
      ws = demo ? ws || demoWorkspace(options.lead) : await rpc('wcc_workspace');
      render();
    }
    async function effect(task) {
      if (busy) return;
      busy = true;
      try {
        await task();
      } catch (e) {
        notify(e.message, true);
        const node = dialog?.querySelector('#wcc-dialog-error');
        if (node) node.textContent = e.message;
      } finally {
        busy = false;
      }
    }
    function table(headers, rows) {
      const labeled = rows.map(row => {
        let i = 0;
        return row.replace(/<td([^>]*)>/g, (_, attrs) => `<td data-label="${esc(headers[i++] || '')}"${attrs}>`);
      });
      return `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? labeled.join('') : `<tr><td colspan="${headers.length}" class="empty">ยังไม่มีรายการ</td></tr>`}</tbody></table></div>`;
    }
    function render() {
      root.innerHTML = `${demo ? '<div class="banner">โหมดจำลอง · ข้อมูลสมาชิกสมมติ ไม่เชื่อม production และไม่ส่ง SeaTalk · ทีมของ Folk ในหน้านี้เป็นตัวอย่าง</div>' : ''}
        <header><div><a href="./">← Workgrid</a><h1>Control Center</h1><div class="muted">ตั้งค่าการแจ้งเตือน SeaTalk · v0.6</div></div><div>${badge(ws.admin ? 'Admin · ใช้ค่าจริงได้' : 'หัวหน้าทีม · ดูและเสนอ')}${button('reload', 'รีเฟรช')}</div></header>
        <div class="shell"><nav aria-label="ส่วนของ Control Center">${Object.entries(tabs).map(([key, label]) => button('tab', label, key, '', tab === key ? 'aria-current="page"' : '')).join('')}</nav>
        <main><div id="wcc-status" class="status" role="status" aria-live="polite">${ws.runtime ? 'ระบบแจ้งเตือนเปิดใช้งาน' : 'ระบบแจ้งเตือนใหม่ยังพักอยู่ · การพักแจ้งเตือนไม่หยุดการสร้างงาน'}</div><section id="wcc-content"></section><footer>ผล provider ยอมรับข้อความไม่เท่ากับผู้รับอ่านแล้ว · Freelance รับเฉพาะแจ้ง Task ใหม่ / ให้รีวิว</footer></main></div><dialog id="wcc-dialog" aria-labelledby="wcc-dialog-title"></dialog>`;
      dialog = root.querySelector('dialog');
      content();
    }
    function content() {
      const node = root.querySelector('#wcc-content');
      if (tab === 'overview') {
        const unready = ws.entities.filter(e => ['bot', 'destination', 'profile'].includes(e.kind) && !e.verification?.current).length;
        node.innerHTML = `<div class="cards"><div class="card"><span>การเชื่อมต่อรอตรวจ</span><strong>${unready}</strong></div><div class="card"><span>ข้อความต้องตรวจสอบ</span><strong>${ws.deliveries.filter(d => ['failed', 'uncertain'].includes(d.status)).length}</strong></div><div class="card"><span>ข้อเสนอรออนุมัติ</span><strong>${ws.proposals.filter(p => p.status === 'pending').length}</strong></div></div>
          <div class="stack"><div class="panel"><h2>เริ่มใช้งาน</h2><p>1. เชื่อม Bot และตรวจการเชื่อมต่อ → 2. เพิ่มกลุ่มและผู้รับ → 3. ตรวจ / ทดสอบ → 4. เปิดกฎและระบบแจ้งเตือน</p><p class="muted">Review เป็นฟังก์ชันใหม่ เลือก Requester ของงาน · Task Assign ใช้ FlowMate · Activity สำเร็จเมื่อครบชุดเท่านั้น</p>${ws.admin ? button('runtime', ws.runtime ? 'พักระบบแจ้งเตือน' : 'เปิดระบบแจ้งเตือน') : ''}</div>
          <div class="panel"><h2>จำลองเส้นทาง · ไม่ส่งข้อความ</h2><form id="wcc-preview"><label class="field">งาน<select name="work">${ws.work_items.map(w => `<option value="${esc(w.id)}">${esc(w.display_id + ' · ' + w.title)}</option>`).join('')}</select></label><label class="field">เหตุการณ์<select name="event">${Object.entries(catalog).filter(([k]) => !k.startsWith('activity.')).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label><p><button class="primary" ${!ws.work_items.length ? 'disabled' : ''}>ดูเส้นทาง</button></p></form><div id="preview-result"></div></div></div>`;
        return;
      }
      if (['bot', 'destination', 'profile', 'rule'].includes(tab)) {
        const entities = ws.entities.filter(e => e.kind === tab && JSON.stringify([name(e), e.key, e.data, e.team_code]).toLowerCase().includes(query.toLowerCase()));
        node.innerHTML = `<div class="toolbar"><h2>${tabs[tab]}</h2><input id="wcc-search" type="search" aria-label="ค้นหารายการ" placeholder="ค้นหาชื่อ / ID / ทีม" value="${esc(query)}" style="width:240px">${ws.admin || tab !== 'bot' ? button('add', ws.admin ? 'เพิ่มรายการ' : 'เสนอเพิ่มรายการ', '', tab) : ''}</div>`;
        const rows = entities.map(e => {
          const d = e.data;
          let detail;
          if (tab === 'bot') detail = `App ID <span class="code">${esc(d.app_id)}</span><br><span class="muted">${esc(d.credential_ref)} · เก็บ secret ฝั่ง server</span>`;
          if (tab === 'destination') detail = `Group ID <span class="code">${esc(d.group_id)}</span><br>${esc(find('bot', d.bot_key)?.data.label || d.bot_key)} · ${esc(d.purpose)}`;
          if (tab === 'profile') detail = `${esc(d.employment_type)} · ${esc(member(d.member_id)?.role)}<br>${esc(member(d.member_id)?.email)}<br>${esc(find('bot', d.bot_key)?.data.label || d.bot_key)} · ${esc(d.channel === 'group' ? 'กลุ่ม ' + (find('destination', d.destination_key)?.data.group_id || 'ยังไม่เลือก') : d.channel === 'direct' ? 'ส่งตรง' : 'พักช่องทาง')}<br>SeaTalk ID: ${esc(d.seatalk_id || 'ยังไม่ระบุ')}<br>${(d.events || []).map(evtLabel).map(esc).join('<br>')}`;
          if (tab === 'rule') detail = `${esc(evtLabel(d.event))}<br>${esc(d.bot_key)} · ${esc(d.destination_key || 'เลือกจากผู้รับจริงของงาน')}`;
          const actions = (ws.admin || tab !== 'bot' ? button('edit', ws.admin ? 'แก้ไข' : 'เสนอแก้ไข', e.key, e.kind) : '') + (ws.admin && tab !== 'rule' ? button('verify', 'ตรวจการเชื่อมต่อ', e.key, e.kind) : '') + (ws.admin && ['destination', 'profile'].includes(tab) ? button('test', 'ส่ง TEST…', e.key, e.kind) : '') + (ws.admin && tab === 'profile' && e.verification?.evidence?.code === 'member_list_hidden' ? button('confirm-member', 'ยืนยันสมาชิกที่ถูกซ่อน…', e.key, e.kind) : '');
          return `<tr><td><strong>${esc(name(e))}</strong><div class="muted">${esc(e.key)} · v${e.version}</div></td><td>${esc(teams[e.team_code] || 'หลายทีม')}</td><td>${detail}</td><td>${badge(active(e) ? 'เปิด' : 'พัก / ร่าง', active(e) ? 'ok' : '')}${tab !== 'rule' ? '<br>' + verification(e) : ''}</td><td class="actions">${actions}</td></tr>`;
        });
        node.innerHTML += table(['ชื่อ', 'ทีม', 'ข้อมูลเชื่อมต่อ / เหตุการณ์', 'สถานะ', 'จัดการ'], rows);
        return;
      }
      if (tab === 'history') {
        node.innerHTML = `<h2>ประวัติส่ง</h2><p class="muted">Retry ส่งข้อความเท่านั้น ไม่สร้างงานซ้ำ · uncertain อาจส่งถึง provider แล้ว</p>` + table(['เหตุการณ์ / งาน', 'Bot / ผู้รับ', 'ผลส่ง', 'เหตุผล / เวลา', 'จัดการ'], ws.deliveries.map(d => `<tr><td>${esc(evtLabel(d.event_kind))}<br>${esc(d.payload?.display_id)}</td><td>${esc(d.bot_key)}<br>${esc(d.profile_key || d.destination_key)}</td><td>${badge(d.status, d.status === 'provider_accepted' ? 'ok' : 'warn')}<br>ครั้งที่ ${d.attempt || 0}</td><td>${esc(d.reason || '—')}<br>${esc(d.created_at)}</td><td>${ws.admin && ['failed', 'uncertain'].includes(d.status) ? button('retry', 'ตรวจและ Retry…', d.id) : ''}</td></tr>`));
        return;
      }
      node.innerHTML = `<h2>ข้อเสนอและ Audit</h2>` + table(['รายการ', 'ทีม / ผู้เสนอ', 'สถานะ', 'จัดการ'], ws.proposals.map(p => `<tr><td>${esc(p.kind + ' · ' + p.key)}<br>${esc(p.reason)}</td><td>${esc(teams[p.team_code] || p.team_code)}<br>${esc(p.actor_id)}</td><td>${badge(p.status)}</td><td>${ws.admin && p.status === 'pending' ? button('decide', 'ตรวจข้อเสนอ…', p.id) : ''}</td></tr>`)) + `<h2 style="margin-top:24px">ประวัติเปลี่ยนค่า</h2>` + table(['เวลา', 'การกระทำ', 'รายการ', 'เหตุผล'], ws.audit.map(a => `<tr><td>${esc(a.created_at)}</td><td>${esc(a.action)}</td><td>${esc(a.key || a.team_code)}</td><td>${esc(a.reason)}</td></tr>`)) + (ws.admin ? `<div class="panel" style="margin-top:24px"><h2>สิทธิ์หัวหน้าทีม</h2><p class="muted">ต้องเป็นสมาชิกทีมที่ยัง active · ดูและเสนอได้เฉพาะทีม</p><form id="wcc-reviewer">${select('user', 'สมาชิก', ws.members.filter(m => m.active).map(m => [m.user_id, m.name]))}${select('team', 'ทีม', ws.teams.map(t => [t, teams[t] || t]))}${select('enabled', 'สิทธิ์', [['true', 'ให้สิทธิ์ดู / เสนอ'], ['false', 'ถอนสิทธิ์']])}<p><button>Review สิทธิ์…</button></p></form></div>` : '');
    }
    function show(title, html) {
      dialog.innerHTML = `<div class="dialog-head"><h2 id="wcc-dialog-title">${esc(title)}</h2>${button('close', 'ปิด')}</div>${html}<div id="wcc-dialog-error" class="muted" role="alert"></div>`;
      if (!dialog.open) {
        if (dialog.showModal) dialog.showModal();else dialog.setAttribute('open', '');
      }
    }
    function field(key, label, value = '', type = 'text', readonly = false) {
      return `<label class="field">${esc(label)}<input name="${key}" type="${type}" value="${esc(value)}" ${readonly ? 'readonly' : ''} ${type === 'text' ? 'maxlength="160"' : ''}></label>`;
    }
    function select(key, label, values, value) {
      return `<label class="field">${esc(label)}<select name="${key}">${values.map(([k, v]) => `<option value="${esc(k)}" ${String(value) === String(k) ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
    }
    function checks(key, label, values, selected = []) {
      return `<fieldset class="checks"><legend>${esc(label)}</legend>${values.map(([k, v]) => `<label><input type="checkbox" name="${key}" value="${esc(k)}" ${selected.includes(k) ? 'checked' : ''}>${esc(v)}</label>`).join('')}</fieldset>`;
    }
    function editor(kind, key) {
      const e = find(kind, key);
      editing = {
        kind,
        key,
        old: e ? clone(e) : null
      };
      const d = e?.data || {};
      const botChoices = ws.entities.filter(x => x.kind === 'bot' && x.data.state !== 'archived').map(x => [x.key, x.data.label]);
      let html = field('key', 'รหัสภายใน (ภาษาอังกฤษ / ไม่ซ้ำ)', key || kind + '-' + Date.now(), 'text', !!e);
      if (kind !== 'bot') html += select('team', 'ทีม', ws.teams.map(t => [t, teams[t] || t]), e?.team_code);
      if (kind !== 'profile') html += field('label', 'ชื่อที่แสดง', d.label);
      if (kind === 'bot') html += field('app_id', 'SeaTalk App ID', d.app_id) + field('credential_ref', 'Secret reference (ไม่ใช่ App Secret)', d.credential_ref || 'WCC_BOT_SECRET_') + select('state', 'สถานะใน Workgrid', ['draft', 'active', 'inactive', 'archived'].map(k => [k, k]), d.state) + checks('allowed_teams', 'ทีมที่อนุญาต', ws.teams.map(t => [t, teams[t] || t]), d.allowed_teams || []) + checks('allowed_events', 'เหตุการณ์ที่อนุญาต', Object.entries(catalog), d.allowed_events || []);else html += select('bot_key', 'Bot', botChoices, d.bot_key);
      if (kind === 'destination') html += field('group_id', 'SeaTalk Group ID', d.group_id) + field('owner', 'เจ้าของกลุ่ม', d.owner) + field('purpose', 'ใช้รับเหตุการณ์', d.purpose) + select('state', 'สถานะ', ['draft', 'active', 'inactive', 'archived'].map(k => [k, k]), d.state);
      if (kind === 'profile') html += select('member_id', 'Team Member', ws.members.map(m => [m.id, m.name + (m.active ? '' : ' (inactive)')]), d.member_id) + select('employment_type', 'ประเภท', [['Fulltime', 'Fulltime'], ['Freelance', 'Freelance'], ['unknown', 'ยังไม่ยืนยัน']], d.employment_type) + select('channel', 'ช่องทาง', [['direct', 'ส่งตรง (Fulltime)'], ['group', 'กลุ่ม SeaTalk'], ['disabled', 'พักช่องทาง']], d.channel) + field('seatalk_id', 'SeaTalk ID (จำเป็นสำหรับผู้รับในกลุ่ม)', d.seatalk_id) + select('destination_key', 'กลุ่มสำหรับ Bot นี้', [['', 'ไม่ใช้กลุ่ม'], ...ws.entities.filter(x => x.kind === 'destination').map(x => [x.key, x.data.label + ' · ' + x.data.bot_key])], d.destination_key) + checks('events', 'Situations · รับเฉพาะงานที่คุณเป็นผู้เกี่ยวข้อง', Object.entries(catalog).filter(([k]) => !k.startsWith('activity.')), d.events || []) + select('enabled', 'การรับแจ้งเตือน', [['false', 'พัก'], ['true', 'เปิด']], String(d.enabled || false));
      if (kind === 'rule') html += select('event', 'เหตุการณ์', Object.entries(catalog), d.event) + select('destination_key', 'กลุ่ม Activity', [['', 'เลือกจากผู้รับของงาน'], ...ws.entities.filter(x => x.kind === 'destination').map(x => [x.key, x.data.label])], d.destination_key) + select('enabled', 'กฎ', [['false', 'พัก'], ['true', 'เปิด']], String(d.enabled || false));
      show(ws.admin ? 'ตั้งค่า ' + tabs[kind] : 'เสนอการตั้งค่า', `<p class="notice">การเปลี่ยนช่องทางให้บันทึกแบบพักก่อน แล้วตรวจการเชื่อมต่อและ TEST ก่อนเปิดใช้ · Archive เก็บประวัติและไม่ลบ app บน SeaTalk</p><form id="wcc-edit"><div class="form-grid">${html}</div><div class="dialog-actions"><button class="primary">ตรวจค่าก่อน${ws.admin ? ' Apply' : 'เสนอ'}</button></div></form>`);
      updateEditorChoices();
    }
    function updateEditorChoices() {
      const form = dialog.querySelector('#wcc-edit');
      if (!form) return;
      const key = form.querySelector('[name=bot_key]')?.value,
        team = form.querySelector('[name=team]')?.value;
      const bot = find('bot', key);
      if (!bot) return;
      form.querySelectorAll('[name=events]').forEach(input => {
        const allowed = bot.data.allowed_events.includes(input.value);
        input.disabled = !allowed;
        input.parentElement.hidden = !allowed;
        if (!allowed) input.checked = false;
      });
      form.querySelectorAll('[name=event] option').forEach(option => option.disabled = !bot.data.allowed_events.includes(option.value));
      const event = form.querySelector('[name=event]');
      if (event?.selectedOptions[0]?.disabled) event.value = bot.data.allowed_events.find(k => catalog[k]) || '';
      const dest = form.querySelector('[name=destination_key]');
      if (dest) {
        for (const option of dest.options) {
          const e = find('destination', option.value);
          option.disabled = !!option.value && (!e || e.data.bot_key !== key || e.team_code !== team);
        }
        if (dest.selectedOptions[0]?.disabled) dest.value = '';
      }
      const members = form.querySelector('[name=member_id]');
      if (members) {
        for (const option of members.options) option.disabled = !member(option.value)?.teams.includes(team);
        if (members.selectedOptions[0]?.disabled) members.value = Array.from(members.options).find(x => !x.disabled)?.value || '';
      }
    }
    function displayValue(key, value) {
      if (value == null || value === '') return '—';
      if (key === 'member_id') return member(value)?.name || value;
      if (key === 'bot_key') return find('bot', value)?.data.label || value;
      if (key === 'destination_key') return find('destination', value)?.data.label || value;
      if (typeof value === 'boolean') return value ? 'เปิด' : 'พัก';
      if (Array.isArray(value)) return value.map(x => catalog[x] || teams[x] || x).join(', ');
      return value;
    }
    function review(fields, title, task, impact) {
      pending = task;
      show(title, `<div class="notice">ตรวจผลกระทบก่อนยืนยัน · events เก่าไม่ถูก replay และข้อความที่เริ่มส่งแล้วอาจยังส่งถึง${impact ? `<p>คิว Control Center ที่เกี่ยวข้อง: รอส่ง ${esc(impact.pending)} · กำลังส่ง ${esc(impact.in_flight)} · ประวัติ ${esc(impact.history)}<br><span class="muted">คิวเดิมที่เริ่มส่งแล้วต้องตรวจแยกก่อนเปิดใช้จริง</span></p>` : ''}</div>${table(['ค่า', 'ก่อน', 'หลัง'], Object.entries(fields).map(([key, [a, b]]) => `<tr><td>${esc(fieldLabels[key] || key)}</td><td>${esc(displayValue(key, a))}</td><td>${esc(displayValue(key, b))}</td></tr>`))}<form id="wcc-confirm"><label class="field">เหตุผล<textarea name="reason" required maxlength="300"></textarea></label><div class="dialog-actions"><button class="primary">${ws.admin ? 'ยืนยัน' : 'ส่งข้อเสนอ'}</button></div></form>`);
    }
    function demoApply(kind, key, data, team, expected, reason) {
      const old = find(kind, key);
      if ((old?.version || 0) !== expected) throw new Error('Configuration changed; reload');
      if (data.state === 'active' || data.enabled === true) {
        if (kind !== 'rule' && !old?.verification?.current) throw new Error('ตรวจการเชื่อมต่อก่อนเปิดใช้');
      }
      if (kind === 'destination' && (!data.group_id || data.group_id === 'aaaaaabbbbbb')) throw new Error('ใส่ Group ID จริง');
      if (kind === 'profile' && data.channel === 'group' && !data.seatalk_id) throw new Error('กรอก SeaTalk ID ของผู้รับก่อน');
      if (!ws.admin) {
        ws.proposals.unshift({
          id: 'proposal-' + Date.now(),
          kind,
          key,
          data,
          team_code: team,
          base_version: expected,
          status: 'pending',
          actor_id: ws.actor_id,
          reason
        });
        return;
      }
      const saved = {
        kind,
        key,
        data: clone(data),
        team_code: team,
        version: expected + 1,
        verification: old?.verification || null
      };
      if (old) {
        ws.entities[ws.entities.indexOf(old)] = saved;
        if (JSON.stringify({
          ...old.data,
          state: undefined,
          enabled: undefined,
          events: undefined,
          label: undefined
        }) !== JSON.stringify({
          ...data,
          state: undefined,
          enabled: undefined,
          events: undefined,
          label: undefined
        })) saved.verification = null;
      } else ws.entities.push(saved);
      ws.audit.unshift({
        created_at: new Date().toISOString(),
        action: 'demo_apply',
        key,
        reason
      });
    }
    async function provider(action, kind, key, requestId) {
      if (demo) {
        const e = find(kind, key);
        if (action === 'verify') {
          if (kind === 'profile' && e.data.channel === 'group' && !e.data.seatalk_id) throw new Error('กรอก SeaTalk ID ของผู้รับก่อน');
          e.verification = {
            current: true,
            verified: true,
            checked_at: new Date().toISOString(),
            evidence: {
              code: 'DEMO_ONLY'
            }
          };
          return {
            verified: true
          };
        }
        ws.audit.unshift({
          created_at: new Date().toISOString(),
          action: 'demo_test',
          key,
          reason: 'จำลองผล TEST เท่านั้น'
        });
        return {
          status: 'demo_accepted'
        };
      }
      const {
        data,
        error
      } = await client.functions.invoke('workgrid-control-center', {
        body: {
          action,
          kind,
          key,
          request_id: requestId
        }
      });
      if (error) throw new Error('ตรวจหรือ TEST ไม่สำเร็จ กรุณาดู connection และประวัติ');
      if (data?.code && !data?.evidence) throw new Error(data.code);
      return data;
    }
    root.addEventListener('click', event => {
      const b = event.target.closest('[data-action]');
      if (!b || busy) return;
      const {
        action,
        key,
        kind
      } = b.dataset;
      if (action === 'close') {
        dialog.close ? dialog.close() : dialog.removeAttribute('open');
        return;
      }
      if (action === 'tab') {
        tab = key;
        query = '';
        content();
        root.querySelectorAll('nav button').forEach(x => x.toggleAttribute('aria-current', false));
        b.setAttribute('aria-current', 'page');
        return;
      }
      if (action === 'add' || action === 'edit') {
        editor(kind, key);
        return;
      }
      effect(async () => {
        if (action === 'reload') {
          await load();
          return;
        }
        if (action === 'verify') {
          const result = await provider('verify', kind, key);
          await load();
          notify(result.verified ? 'ตรวจผ่าน · ผลนี้ยังไม่พิสูจน์ว่าคนได้รับข้อความ' : 'ตรวจไม่ผ่าน: ' + (result.evidence?.code || ''), !result.verified);
          return;
        }
        if (action === 'confirm-member') {
          const e = find('profile', key);
          const tests = (ws.tests || []).filter(t => t.kind === 'destination' && t.key === e.data.destination_key && t.outcome?.status === 'provider_accepted');
          if (!tests.length) throw new Error('ตรวจกลุ่มและส่ง TEST ของกลุ่มให้ผ่านก่อน');
          pending = async reason => {
            await rpc('wcc_confirm_group_member', {
              p_profile: key,
              p_test: dialog.querySelector('[name=test]').value,
              p_reason: reason
            });
            await load();
          };
          show('ยืนยันจากผู้รับ · ไม่ใช่ API ตรวจสมาชิก', `<p>ผู้รับ ${esc(name(e))} / SeaTalk ID ${esc(e.data.seatalk_id)} ต้องยืนยันว่าอยู่ในกลุ่มกับ Bot และเห็นข้อความ TEST แล้ว</p><form id="wcc-confirm">${select('test', 'ผล TEST', tests.map(t => [t.id, t.created_at]))}<label><input type="checkbox" required style="width:auto">ยืนยันกับผู้รับและตรวจสมาชิกกลุ่มแล้ว</label><label class="field">หลักฐาน / เหตุผล<textarea name="reason" required maxlength="300"></textarea></label><button>ยืนยันสมาชิก</button></form>`);
          return;
        }
        if (action === 'test') {
          const e = find(kind, key);
          if (!ws.admin) throw new Error('Admin required');
          if (!e.verification?.current) throw new Error('ตรวจการเชื่อมต่อก่อน TEST');
          const target = kind === 'profile' ? e.data.channel === 'group' ? find('destination', e.data.destination_key)?.data.group_id : member(e.data.member_id)?.email : e.data.group_id;
          pending = async () => {
            const result = await provider('test', kind, key, crypto.randomUUID());
            await load();
            notify('TEST: ' + result.status + ' · กรุณายืนยันการเห็นข้อความแยกต่างหาก');
          };
          show('ตรวจปลายทาง TEST', `<p>Bot: ${esc(e.data.bot_key)}<br>ปลายทาง: <strong>${esc(target)}</strong></p><p class="notice">ข้อความ TEST สำหรับตรวจช่องทาง ไม่มีการสร้างหรือเปลี่ยนงาน${e.data.employment_type === 'Freelance' ? ' · มี Task เข้ามา' : ''}</p><form id="wcc-confirm"><input name="reason" type="hidden" value="Explicit TEST"><div class="dialog-actions"><button class="primary">${demo ? 'จำลอง TEST' : 'ส่ง TEST จริง'}</button></div></form>`);
          return;
        }
        if (action === 'runtime') {
          const impact = demo ? {
            pending: 0,
            in_flight: 0,
            history: 0
          } : await rpc('wcc_impact', {
            p_kind: 'runtime',
            p_key: 'all'
          });
          review({
            'ระบบแจ้งเตือน': [ws.runtime, !ws.runtime]
          }, 'Review สถานะระบบ', async reason => {
            if (demo) ws.runtime = !ws.runtime;else await rpc('wcc_set_runtime', {
              p_enabled: !ws.runtime,
              p_reason: reason
            });
            await load();
          }, impact);
          return;
        }
        if (action === 'retry') {
          const d = ws.deliveries.find(x => x.id === key);
          pending = async reason => {
            if (!demo) await rpc('wcc_retry', {
              p_id: key,
              p_confirm_uncertain: dialog.querySelector('[name=confirm_uncertain]')?.checked || false,
              p_reason: reason
            });else d.status = 'pending';
            await load();
          };
          show('Review การส่งซ้ำ', `<p>${esc(d.status)} · อาจมีข้อความถึงผู้รับแล้ว โปรดตรวจประวัติก่อน</p><form id="wcc-confirm">${d.status === 'uncertain' ? '<label class="checks"><input type="checkbox" name="confirm_uncertain" required>ตรวจแล้วและยืนยันส่งซ้ำ</label>' : ''}<label class="field">เหตุผล<textarea name="reason" required maxlength="300"></textarea></label><div class="dialog-actions"><button>ยืนยัน Retry</button></div></form>`);
          return;
        }
        if (action === 'decide') {
          const p = ws.proposals.find(x => x.id === key);
          pending = async reason => {
            const accept = dialog.querySelector('[name=decision]').value === 'true';
            if (demo) {
              if (accept) demoApply(p.kind, p.key, p.data, p.team_code, p.base_version, reason);
              p.status = accept ? 'applied' : 'rejected';
            } else await rpc('wcc_decide', {
              p_id: key,
              p_accept: accept,
              p_reason: reason
            });
            await load();
          };
          show('Review ข้อเสนอ', table(['ค่า', 'ก่อน', 'เสนอ'], Object.entries(p.data).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(JSON.stringify(find(p.kind, p.key)?.data[k]))}</td><td>${esc(JSON.stringify(v))}</td></tr>`)) + `<form id="wcc-confirm">${select('decision', 'การตัดสินใจ', [['true', 'อนุมัติและ Apply'], ['false', 'ปฏิเสธ']])}<label class="field">เหตุผล<textarea name="reason" required maxlength="300"></textarea></label><div class="dialog-actions"><button>ยืนยัน</button></div></form>`);
        }
      });
    });
    root.addEventListener('input', event => {
      if (event.target.id === 'wcc-search') {
        query = event.target.value;
        const pos = event.target.selectionStart;
        content();
        const input = root.querySelector('#wcc-search');
        input.focus();
        input.setSelectionRange(pos, pos);
      }
    });
    root.addEventListener('change', event => {
      if (['bot_key', 'team'].includes(event.target.name)) updateEditorChoices();
    });
    root.addEventListener('submit', event => {
      event.preventDefault();
      const f = event.target;
      const data = new FormData(f);
      effect(async () => {
        if (f.id === 'wcc-edit') {
          const get = k => data.get(k) || '';
          const kind = editing.kind;
          const key = get('key');
          const d = {};
          if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(key)) throw new Error('รหัสภายในใช้ภาษาอังกฤษ ตัวเลข . _ : -');
          if (kind !== 'profile') d.label = get('label');
          if (kind === 'bot') {
            Object.assign(d, {
              app_id: get('app_id'),
              credential_ref: get('credential_ref'),
              state: get('state'),
              allowed_teams: data.getAll('allowed_teams'),
              allowed_events: data.getAll('allowed_events')
            });
          } else d.bot_key = get('bot_key');
          if (kind === 'destination') Object.assign(d, {
            group_id: get('group_id'),
            owner: get('owner'),
            purpose: get('purpose'),
            state: get('state')
          });
          if (kind === 'profile') {
            Object.assign(d, {
              member_id: get('member_id'),
              employment_type: get('employment_type'),
              channel: get('channel'),
              events: data.getAll('events'),
              enabled: get('enabled') === 'true'
            });
            if (get('seatalk_id')) d.seatalk_id = get('seatalk_id');
            if (d.channel === 'group') d.destination_key = get('destination_key');
          }
          if (kind === 'rule') {
            Object.assign(d, {
              event: get('event'),
              enabled: get('enabled') === 'true'
            });
            if (get('destination_key')) d.destination_key = get('destination_key');
          }
          const team = kind === 'bot' ? null : get('team');
          const old = editing.old;
          const fields = Object.fromEntries(Object.keys({
            ...old?.data,
            ...d
          }).map(k => [k, [old?.data[k], d[k]]]));
          const impact = demo || !old ? {
            pending: 0,
            in_flight: 0,
            history: 0
          } : await rpc('wcc_impact', {
            p_kind: kind,
            p_key: key
          });
          review(fields, ws.admin ? 'Review การตั้งค่า' : 'Review ข้อเสนอ', async reason => {
            if (demo) demoApply(kind, key, d, team, old?.version || 0, reason);else await rpc(ws.admin ? 'wcc_apply' : 'wcc_propose', {
              p_kind: kind,
              p_key: key,
              p_data: d,
              p_team: team,
              p_expected: old?.version || 0,
              p_reason: reason
            });
            await load();
            notify(ws.admin ? 'บันทึกการตั้งค่าแล้ว · ใช้กับเหตุการณ์ใหม่' : 'ส่งข้อเสนอแล้ว รอ Admin');
          }, impact);
          return;
        }
        if (f.id === 'wcc-confirm') {
          await pending(data.get('reason'));
          if (dialog.open) dialog.close ? dialog.close() : dialog.removeAttribute('open');
          return;
        }
        if (f.id === 'wcc-preview') {
          let result;
          if (demo) {
            const reviewEvent = data.get('event') === 'creative.review_requested';
            const p = find('profile', reviewEvent ? 'folk-demo' : 'pond-demo');
            result = {
              simulation: true,
              event: data.get('event'),
              recipient: reviewEvent ? 'Folk (Requester จำลอง)' : 'Pond (Assignee จำลอง)',
              route: p?.data.destination_key || 'DM',
              enabled: p?.data.enabled,
              notice: 'ผลจำลอง ไม่มี provider call'
            };
          } else result = await rpc('wcc_preview', {
            p_work: data.get('work'),
            p_event: data.get('event')
          });
          root.querySelector('#preview-result').innerHTML = `<pre class="notice code">${esc(JSON.stringify(result, null, 2))}</pre>`;
          return;
        }
        if (f.id === 'wcc-reviewer') {
          const user = data.get('user'),
            team = data.get('team'),
            enabled = data.get('enabled') === 'true';
          review({
            'สมาชิก': ['—', user],
            'ทีม': ['—', team],
            'ดูและเสนอ': ['—', enabled]
          }, 'Review สิทธิ์หัวหน้าทีม', async () => {
            if (!demo) await rpc('wcc_set_reviewer', {
              p_user: user,
              p_team: team,
              p_enabled: enabled
            });
            await load();
          });
        }
      });
    });
    try {
      if (!demo) {
        if (!client) throw new Error('โหลด Supabase client ไม่สำเร็จ');
        const {
          data,
          error
        } = await client.auth.getUser();
        if (error || !data?.user) throw new Error('กรุณาเข้าสู่ระบบที่ Workgrid ก่อน');
      }
      await load();
    } catch (e) {
      root.innerHTML = `<main><h1>Control Center</h1><p role="alert">${esc(e.message)}</p><p>หากยังไม่ติดตั้ง Control Center backend ต้องติดตั้งตามแผนที่อนุมัติก่อน</p><a href="./">กลับ Workgrid</a></main>`;
    }
    return {
      reload: load,
      getWorkspace: () => clone(ws),
      getTab: () => tab
    };
  }
  window.WorkgridControlCenter = {
    createApp,
    catalog,
    demoWorkspace
  };
  const root = document.getElementById('wcc-root');
  if (root) createApp(root, window.flowmateSupabase, {
    demo: window.WCC_OFFLINE_DEMO,
    lead: new URLSearchParams(location.search).get('role') === 'lead'
  });
})();
