const API_BASE = (location.protocol + '//' + location.hostname) + ':3000' // adjust if needed

const el = id=>document.getElementById(id)
const loginBox = el('loginBox'), panel = el('panel')

async function post(path, body){
  const r = await fetch(API_BASE + path, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  return r
}

el('loginBtn').onclick = async ()=>{
  const master = el('masterKey').value.trim()
  const r = await post('/api/admin/login',{master})
  if (r.status===200){
    loginBox.classList.add('hidden')
    panel.classList.remove('hidden')
    sessionStorage.setItem('master', master)
    refreshAll()
  } else {
    const j = await r.json().catch(()=>({err:'Failed'}))
    el('loginMsg').innerText = j.err || 'Wrong key'
  }
}

async function refreshAll(){
  const master = sessionStorage.getItem('master')
  if (!master) return
  const s = await fetch(API_BASE + '/api/stats').then(r=>r.json())
  el('stats').innerText = `Total: ${s.total} · Active: ${s.active} · Used: ${s.used}`
  const keys = await fetch(API_BASE + '/api/keys').then(r=>r.json())
  const list = el('keysList'); list.innerHTML=''
  keys.forEach(k=>{
    const div = document.createElement('div'); div.className='item'
    const left = document.createElement('div')
    left.innerHTML = `<strong>${k.key}</strong><div class='muted'>exp: ${k.expires_at?new Date(k.expires_at*1000).toLocaleString():'Lifetime'}</div>`
    const right = document.createElement('div')
    const copy = document.createElement('button'); copy.innerText='Copy'; copy.className='copybtn'
    copy.onclick = ()=>navigator.clipboard.writeText(k.key)
    const del = document.createElement('button'); del.innerText='Delete'
    del.onclick = async ()=>{
      if (!confirm('Delete key?')) return
      const r = await fetch(API_BASE + '/api/keys/'+encodeURIComponent(k.key),{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({master})})
      if (r.status===200) refreshAll()
      else alert('Failed')
    }
    right.appendChild(copy); right.appendChild(del)
    div.appendChild(left); div.appendChild(right)
    list.appendChild(div)
  })
}

el('genBtn').onclick = async ()=>{
  const master = sessionStorage.getItem('master')
  const count = el('genCount').value || '1'
  const expiry = el('genExpiry').value || 'LT'
  const r = await post('/api/keys',{count, expiryToken: expiry, master})
  if (r.status===200){
    const j = await r.json()
    el('genResult').innerText = `Created ${j.created.length} keys` + '\n' + j.created.map(c=>`${c.key} (${c.expires_at?new Date(c.expires_at*1000).toLocaleString():'Lifetime'})`).join('\n')
    refreshAll()
  } else {
    const j = await r.json().catch(()=>({err:'Fail'}))
    el('genResult').innerText = j.err || 'Failed to create'
  }
}

// poll
setInterval(()=>{ if (sessionStorage.getItem('master')) refreshAll() }, 5000)
