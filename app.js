import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { CFG } from './config.js';

const GB = 1024 ** 3, DAY = 864e5, TRASH_DAYS = 30, TOTAL = 22 * GB;
export const sb1 = createClient(CFG.supabase1.url, CFG.supabase1.anonKey);
export const sb2 = createClient(CFG.supabase2.url, CFG.supabase2.anonKey);

// ---------- providers (order = routing order) ----------
const supa = (id, cap, sb, bucket) => ({
  id, cap,
  put: async (p, f) => { const { error } = await sb.storage.from(bucket).upload(p, f, { contentType: f.type || undefined }); if (error) throw error; },
  url: async (p) => (await sb.storage.from(bucket).createSignedUrl(p, 3600)).data.signedUrl,
  del: (p) => sb.storage.from(bucket).remove([p]),
});
const s3p = (id, cap, c) => {
  let cl, sdk, sign;
  const get = async () => { // AWS SDK loads only when a Backblaze file is actually used
    if (!sdk) {
      sdk = await import('https://esm.sh/@aws-sdk/client-s3@3.600.0');
      sign = (await import('https://esm.sh/@aws-sdk/s3-request-presigner@3.600.0')).getSignedUrl;
      cl = new sdk.S3Client({ endpoint: c.endpoint, region: c.region, forcePathStyle: true, credentials: { accessKeyId: c.keyId, secretAccessKey: c.secret } });
    }
    return sdk;
  };
  return {
    id, cap,
    put: async (p, f) => { const s = await get(); await cl.send(new s.PutObjectCommand({ Bucket: c.bucket, Key: p, Body: new Uint8Array(await f.arrayBuffer()), ContentType: f.type || undefined })); },
    url: async (p) => { const s = await get(); return sign(cl, new s.GetObjectCommand({ Bucket: c.bucket, Key: p }), { expiresIn: 3600 }); },
    del: async (p) => { const s = await get(); return cl.send(new s.DeleteObjectCommand({ Bucket: c.bucket, Key: p })); },
  };
};
const PROVIDERS = [
  supa('supabase1', 1 * GB, sb1, CFG.supabase1.bucket),
  supa('supabase2', 1 * GB, sb2, CFG.supabase2.bucket),
  s3p('b2', 10 * GB, CFG.b2),
  s3p('b2b', 10 * GB, CFG.b2b),
];
const prov = (id) => PROVIDERS.find((p) => p.id === id);

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (b) => { if (!b) return '0 B'; const u = ['B', 'KB', 'MB', 'GB']; const i = Math.min(3, Math.floor(Math.log(b) / Math.log(1024))); return (b / 1024 ** i).toFixed(i ? 1 : 0) + ' ' + u[i]; };
const daysLeft = (f) => Math.max(0, TRASH_DAYS - Math.floor((Date.now() - new Date(f.trashed_at)) / DAY));
const icon = (f) => f.is_folder ? '📁' : /^image/.test(f.mime_type) ? '🖼️' : /pdf/.test(f.mime_type) ? '📕' : /^video/.test(f.mime_type) ? '🎞️' : /^audio/.test(f.mime_type) ? '🎵' : '📄';

let user, view, folder, search = '', mode = localStorage.mode || 'grid', files = [];
const params = new URLSearchParams(location.search);
folder = params.get('folder');

// ---------- storage routing ----------
export async function usage() {
  const { data } = await sb1.from('files').select('size,storage_provider').eq('user_id', user.id).eq('is_folder', false);
  const u = {}; let total = 0;
  (data || []).forEach((r) => { u[r.storage_provider] = (u[r.storage_provider] || 0) + r.size; total += r.size; });
  return { u, total };
}
export async function uploadFile(file) {
  const { u } = await usage();
  const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
  let lastErr;
  for (const p of PROVIDERS) {
    if ((u[p.id] || 0) + file.size > p.cap) continue; // full -> next
    try {
      await p.put(path, file);
      const { error } = await sb1.from('files').insert({ user_id: user.id, parent_id: folder, name: file.name, size: file.size, mime_type: file.type, storage_provider: p.id, bucket_path: path });
      if (error) { await p.del(path); throw error; }
      return p.id;
    } catch (e) { lastErr = e; console.warn(p.id, 'failed, trying next', e); }
  }
  throw lastErr || new Error('All storage is full');
}

// ---------- trash ----------
async function removeForever(rows) {
  for (const f of rows) {
    if (!f.is_folder && f.storage_provider) { try { await prov(f.storage_provider).del(f.bucket_path); } catch (e) { console.warn(e); } }
    await sb1.from('files').delete().eq('id', f.id);
  }
}
export async function purgeExpired() {
  const cutoff = new Date(Date.now() - TRASH_DAYS * DAY).toISOString();
  const { data } = await sb1.from('files').select('*').eq('user_id', user.id).eq('is_trashed', true).lt('trashed_at', cutoff);
  if (data?.length) await removeForever(data);
}

// ---------- layout ----------
const NAV = [['drive', 'index.html', '🗂️', 'My Drive'], ['starred', 'starred.html', '⭐', 'Starred'], ['trash', 'trash.html', '🗑️', 'Trash']];
function layout() {
  const btn = 'rounded-full px-4 py-2 text-sm font-medium';
  $('#app').innerHTML = `
  <header class="flex items-center gap-4 bg-slate-800 px-4 py-3 text-slate-100 border-b border-slate-700">
    <a href="index.html" class="text-lg font-semibold w-48">☁️ Drive</a>
    <input id="q" placeholder="Search in Drive" class="flex-1 max-w-2xl rounded-lg bg-slate-700 px-4 py-2 text-sm placeholder-slate-400 outline-none focus:ring-2 ring-blue-500">
    <button id="theme" class="${btn} hover:bg-slate-700">🌓</button>
    <button id="out" class="${btn} hover:bg-slate-700">Sign out</button>
  </header>
  <div class="flex" style="height:calc(100vh - 57px)">
    <aside class="w-56 shrink-0 bg-slate-100 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 p-3 flex flex-col">
      ${view !== 'trash' && view !== 'starred' ? `<button id="new" class="mb-1 w-full ${btn} bg-blue-600 text-white hover:bg-blue-700">+ Upload</button><button id="mkdir" class="mb-3 w-full ${btn} border border-slate-300 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-800">New folder</button>` : ''}
      <input id="file" type="file" multiple hidden>
      <nav class="space-y-1">${NAV.map(([k, h, i, l]) => `<a href="${h}" class="flex items-center gap-3 rounded-full px-4 py-2 text-sm ${k === view ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-medium' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}">${i} ${l}</a>`).join('')}</nav>
      <div class="mt-auto pt-4 text-xs text-slate-500 dark:text-slate-400">
        <div class="h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 overflow-hidden"><div id="bar" class="h-full bg-blue-600" style="width:0"></div></div>
        <p id="meter" class="mt-2">Calculating…</p>
      </div>
    </aside>
    <main class="flex-1 overflow-auto p-5">
      <div class="mb-4 flex items-center justify-between"><h1 id="title" class="text-xl font-medium"></h1>
        <button id="mode" class="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1 text-sm"></button></div>
      <p id="note" class="mb-3 hidden rounded-lg bg-blue-100 dark:bg-blue-900/40 px-4 py-2 text-sm"></p>
      <div id="list"></div>
    </main>
  </div>`;
  $('#title').textContent = { drive: 'My Drive', starred: 'Starred', trash: 'Trash' }[view];
  if (view === 'trash') { $('#note').textContent = `Items in trash are deleted forever after ${TRASH_DAYS} days.`; $('#note').classList.remove('hidden'); }
  $('#theme').onclick = () => { const d = document.documentElement.classList.toggle('dark'); localStorage.theme = d ? 'dark' : 'light'; };
  $('#out').onclick = async () => { await sb1.auth.signOut(); await sb2.auth.signOut(); location.href = 'login.html'; };
  $('#mode').onclick = () => { mode = mode === 'grid' ? 'list' : 'grid'; localStorage.mode = mode; render(); };
  let t; $('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { search = e.target.value.trim(); load(); }, 300); };
  if ($('#new')) {
    $('#new').onclick = () => $('#file').click();
    $('#file').onchange = async (e) => {
      const list = [...e.target.files]; e.target.value = '';
      for (const [i, f] of list.entries()) {
        $('#meter').textContent = `Uploading ${i + 1}/${list.length}: ${f.name}`;
        try { await uploadFile(f); } catch (err) { alert(`Could not upload ${f.name}: ${err.message}`); }
      }
      load();
    };
    $('#mkdir').onclick = async () => {
      const name = prompt('Folder name'); if (!name) return;
      await sb1.from('files').insert({ user_id: user.id, parent_id: folder, name, is_folder: true }); load();
    };
  }
  $('#list').onclick = onAction;
}

// ---------- render ----------
function menu(f) {
  const b = (a, l) => `<button data-act="${a}" data-id="${f.id}" class="rounded-md px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-700">${l}</button>`;
  return view === 'trash' ? b('restore', 'Restore') + b('forever', 'Delete forever')
    : (f.is_folder ? '' : b('dl', 'Download')) + b('star', f.is_starred ? '★ Unstar' : '☆ Star') + b('trash', 'Trash');
}
function render() {
  $('#mode').textContent = mode === 'grid' ? 'List view' : 'Grid view';
  const el = $('#list');
  if (!files.length) { el.innerHTML = `<p class="py-20 text-center text-slate-500">${view === 'trash' ? 'Trash is empty.' : view === 'starred' ? 'Star files to find them here.' : 'Nothing here yet. Upload a file or create a folder.'}</p>`; return; }
  const name = (f) => f.is_folder && view === 'drive' ? `<a href="index.html?folder=${f.id}" class="hover:underline">${esc(f.name)}</a>` : esc(f.name);
  const sub = (f) => view === 'trash' ? `${daysLeft(f)} days left` : f.is_folder ? 'Folder' : fmt(f.size);
  el.innerHTML = mode === 'grid'
    ? `<div class="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">${files.map((f) => `
      <div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900 p-3">
        <div class="mb-2 flex h-24 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-4xl">${icon(f)}</div>
        <p class="truncate text-sm font-medium">${name(f)}</p><p class="text-xs text-slate-500">${sub(f)}</p>
        <div class="mt-2 flex flex-wrap">${menu(f)}</div></div>`).join('')}</div>`
    : `<div class="divide-y divide-slate-200 dark:divide-slate-700 rounded-xl border border-slate-200 dark:border-slate-700">${files.map((f) => `
      <div class="flex items-center gap-3 px-4 py-2 text-sm"><span>${icon(f)}</span><span class="flex-1 truncate">${name(f)}</span>
        <span class="w-24 text-xs text-slate-500">${sub(f)}</span><span class="flex">${menu(f)}</span></div>`).join('')}</div>`;
}
async function onAction(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const f = files.find((x) => x.id === b.dataset.id), act = b.dataset.act, upd = (v) => sb1.from('files').update(v).eq('id', f.id);
  if (act === 'dl') window.open(await prov(f.storage_provider).url(f.bucket_path), '_blank');
  if (act === 'star') await upd({ is_starred: !f.is_starred });
  if (act === 'trash') await upd({ is_trashed: true, trashed_at: new Date().toISOString() });
  if (act === 'restore') await upd({ is_trashed: false, trashed_at: null });
  if (act === 'forever' && confirm(`Permanently delete "${f.name}"?`)) await removeForever([f]);
  load();
}

// ---------- data ----------
async function load() {
  let q = sb1.from('files').select('*').eq('user_id', user.id).eq('is_trashed', view === 'trash');
  if (view === 'starred') q = q.eq('is_starred', true);
  if (view === 'drive' && !search) q = folder ? q.eq('parent_id', folder) : q.is('parent_id', null);
  if (search) q = q.ilike('name', `%${search}%`);
  const { data, error } = await q.order('is_folder', { ascending: false }).order('name');
  if (error) alert(error.message);
  files = data || []; render();
  const { total } = await usage();
  $('#bar').style.width = Math.min(100, (total / TOTAL) * 100) + '%';
  $('#meter').textContent = `${fmt(total)} of 22 GB used`;
}

export async function boot(v) {
  view = v;
  const { data: { session } } = await sb1.auth.getSession();
  if (!session) { location.href = 'login.html'; return; }
  user = session.user;
  layout();
  if (v === 'trash') await purgeExpired();
  load();
}

// ---------- auth (used by login.html) ----------
export async function authenticate(mode, email, password) {
  const r = mode === 'signup' ? await sb1.auth.signUp({ email, password }) : await sb1.auth.signInWithPassword({ email, password });
  if (r.error) throw r.error;
  // mirror the account on Project 2 so its storage policies work
  let r2 = await sb2.auth.signInWithPassword({ email, password });
  if (r2.error) await sb2.auth.signUp({ email, password });
}
