// public/admin.js
// Frontend logic for the GG Admin Panel

const MASTER_KEY_LOCAL = 'gg_admin_master';
let MASTER = null;

async function postJSON(url, data) {
  try {
    const res = await fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(()=>({ ok:false, status: res.status }));
    return json;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const loginCard = document.getElementById('loginCard');
  const panelCard = document.getElementById('panelCard');
  const masterInput = document.getElementById('masterInput');
  const submitMaster = document.getElementById('submitMaster');
  const remember = document.getElementById('remember');
  const loginMessage = document.getElementById('loginMessage');

  const btnRevoke = document.getElementById('btnRevoke');
  const btnGenerate = document.getElementById('btnGenerate');
  const btnStats = document.getElementById('btnStats');
  const revokeArea = document.getElementById('revokeArea');
  const generateArea = document.getElementById('generateArea');
  const statsArea = document.getElementById('statsArea');
  const keysList = document.getElementById('keysList');
  const genCount = document.getElementById('genCount');
  const chooseCount = document.getElementById('chooseCount');
  const expiryStep = document.getElementById('expiryStep');
  const genExpiry = document.getElementById('genExpiry');
  const createKeys = document.getElementById('createKeys');
  const generatedList = document.getElementById('generatedList');
  const statsBox = document.getElementById('statsBox');
  const recentEvents = document.getElementById('recentEvents');
  const logoutBtn = document.getElementById('logoutBtn');

  // auto-login if remembered
  const saved = localStorage.getItem(MASTER_KEY_LOCAL);
  if (saved) {
    masterInput.value = saved;
    remember.checked = true;
    tryLogin(saved);
  }

  submitMaster.addEventListener('click', () => {
    const val = masterInput.value.trim();
    tryLogin(val);
  });

  async function tryLogin(val) {
    loginMessage.textContent = 'Checking...';
    const r = await postJSON('/api/login', { master: val });
    if (r && r.ok) {
      MASTER = val;
      loginCard.classList.add('hidden');
      panelCard.classList.remove('hidden');
      loginMessage.textContent = '';
      if (remember.checked) localStorage.setItem(MASTER_KEY_LOCAL, val);
      else localStorage.removeItem(MASTER_KEY_LOCAL);
      showRevoke();
    } else {
      loginMessage.textContent = 'Wrong key — access denied.';
      MASTER = null;
    }
  }

  // navigation
  btnRevoke.addEventListener('click', showRevoke);
  btnGenerate.addEventListener('click', showGenerate);
  btnStats.addEventListener('click', showStats);
  logoutBtn.addEventListener('click', () => {
    MASTER = null;
    panelCard.classList.add('hidden');
    loginCard.classList.remove('hidden');
    masterInput.value = '';
    localStorage.removeItem(MASTER_KEY_LOCAL);
  });

  async function showRevoke() {
    revokeArea.classList.remove('hidden');
    generateArea.classList.add('hidden');
    statsArea.classList.add('hidden');
    await refreshKeys();
  }

  async function refreshKeys() {
    keysList.innerHTML = 'Loading…';
    const r = await postJSON('/api/list', { master: MASTER });
    if (!r || !r.ok) { keysList.innerHTML = 'Failed to load.'; return; }
    if (!r.rows || r.rows.length === 0) { keysList.innerHTML = '<div class="muted">No keys found.</div>'; return; }
    keysList.innerHTML = '';
    r.rows.forEach(row => {
      const div = document.createElement('div'); div.className = 'key-row';
      const left = document.createElement('div');
      const expiresText = row.lifetime ? 'Lifetime' : (row.expires_at ? ('Expires: ' + new Date(row.expires_at).toLocaleString()) : 'No expiry');
      left.innerHTML = `<div class="key-left">${row.key_text}</div><div class="key-meta">${row.device_id ? 'Bound to: '+row.device_id : 'Not used yet'} · ${expiresText}</div>`;
      const right = document.createElement('div');
      const copyBtn = document.createElement('button'); copyBtn.className = 'small-btn'; copyBtn.textContent = 'COPY';
      copyBtn.addEventListener('click', ()=>{ navigator.clipboard.writeText(row.key_text); copyBtn.textContent='COPIED'; setTimeout(()=>copyBtn.textContent='COPY',1200); });
      const delBtn = document.createElement('button'); delBtn.className = 'small-btn'; delBtn.textContent = 'DELETE';
      delBtn.addEventListener('click', async ()=> {
        if (!confirm('Delete key ' + row.key_text + ' ?')) return;
        const rr = await postJSON('/api/delete', { master: MASTER, id: row.id });
        if (rr && rr.ok) { refreshKeys(); } else { alert('Failed to delete'); }
      });
      right.appendChild(copyBtn);
      right.appendChild(document.createTextNode(' '));
      right.appendChild(delBtn);

      div.appendChild(left); div.appendChild(right);
      keysList.appendChild(div);
    });
  }

  // Generate flow
  chooseCount.addEventListener('click', ()=> expiryStep.classList.remove('hidden'));
  createKeys.addEventListener('click', async () => {
    const ct = parseInt(genCount.value) || 1;
    let exp = genExpiry.value.trim();
    if (!exp) exp = 'LT';
    generatedList.innerHTML = 'Creating…';
    const r = await postJSON('/api/generate', { master: MASTER, count: ct, expiration: exp });
    if (!r || !r.ok) { generatedList.innerHTML = 'Failed to create.'; return; }
    generatedList.innerHTML = '';
    r.created.forEach(k => {
      const row = document.createElement('div'); row.className = 'key-row';
      const left = document.createElement('div'); left.innerHTML = `<div class="key-left">${k.key}</div><div class="key-meta">${k.lifetime ? 'Lifetime' : (k.expires_at ? 'Expires: '+ new Date(k.expires_at).toLocaleString() : '')}</div>`;
      const right = document.createElement('div');
      const copyBtn = document.createElement('button'); copyBtn.className='small-btn'; copyBtn.textContent='COPY';
      copyBtn.addEventListener('click', ()=>{ navigator.clipboard.writeText(k.key); copyBtn.textContent='COPIED'; setTimeout(()=>copyBtn.textContent='COPY',1200); });
      right.appendChild(copyBtn);
      row.appendChild(left); row.appendChild(right);
      generatedList.appendChild(row);
    });
  });

  function showGenerate(){
    revokeArea.classList.add('hidden');
    generateArea.classList.remove('hidden');
    statsArea.classList.add('hidden');
    expiryStep.classList.add('hidden');
    generatedList.innerHTML = '';
  }

  async function showStats(){
    revokeArea.classList.add('hidden');
    generateArea.classList.add('hidden');
    statsArea.classList.remove('hidden');
    statsBox.innerHTML = 'Loading…';
    const r = await postJSON('/api/stats', { master: MASTER });
    if (!r || !r.ok) { statsBox.innerHTML = 'Failed to fetch.'; return; }
    const st = r.stats || {};
    statsBox.innerHTML = `<div>Total: ${st.total || 0}</div><div>Active: ${st.active || 0}</div><div>Used: ${st.used || 0}</div><div>Expired: ${st.expired || 0}</div>`;
    recentEvents.innerHTML = '';
    if (r.recent && r.recent.length) {
      r.recent.forEach(ev => {
        const d = document.createElement('div'); d.className = 'key-row';
        d.innerHTML = `<div class="key-left">${ev.key_text}</div><div class="key-meta">${ev.event} · ${ev.device_id || '-'} · ${new Date(ev.ts).toLocaleString()}</div>`;
        recentEvents.appendChild(d);
      });
    } else recentEvents.innerHTML = '<div class="muted">No recent events</div>';
  }
});
