const SB_URL = 'https://axbixhnhmimaxhpbhhvt.supabase.co';
const SB_KEY = 'sb_publishable_yccbuWDlTisa2DvaRJEX9w_R1l8BBMB';
const _sb = supabase.createClient(SB_URL, SB_KEY);

const staffMap = { 'A':'張敏鴻','J':'張舜斌','Y':'廖婕茹','C':'許志誠','E':'鄧雅惠','F':'莊嘉銘','N':'倪世宗','G':'蔡明峯','B':'黃郁涵','M':'張淑貞' };
let currentUser = null, currentCode = "", selectedDate = new Date(), stModal = null, calMode = 'my', allMonthData = [];

// --- 掛載全域函式 ---
window.openStockModal = async function() {
    const el = document.getElementById('stockModal');
    if (!stModal && el) stModal = new bootstrap.Modal(el);
    await fetchStaffList();
    if (stModal) stModal.show();
};

window.pressKey = function(val) {
    if (val === 'C') currentCode = ""; else if (currentCode.length < 3) currentCode += val;
    const el = document.getElementById('code-val');
    if (el) el.innerText = currentCode || "---";
    if (currentCode.length === 3) checkLogin();
};

window.switchTab = function(t) {
    ['v-ros','v-stk','v-drv','v-adm'].forEach(v => { const el = document.getElementById(v); if(el) el.style.display='none'; });
    ['t-ros','t-stk','t-drv','t-adm'].forEach(v => { const el = document.getElementById(v); if(el) el.classList.remove('active'); });
    const tv = document.getElementById('v-'+t); if(tv) tv.style.display='block';
    const tt = document.getElementById('t-'+t); if(tt) tt.classList.add('active');
};

window.changeDate = function(n) { selectedDate.setDate(selectedDate.getDate()+n); fetchMainData(); };
window.toggleCalMode = function(m) { 
    calMode = m; 
    document.getElementById('btn-my-cal').classList.toggle('active', m==='my');
    document.getElementById('btn-all-cal').classList.toggle('active', m==='all');
    renderCalendar(); 
};

// --- 登入與初始化 ---
async function checkLogin() {
    setLoad(true);
    try {
        const { data } = await _sb.from('staff').select('*').eq('code', currentCode).single();
        if (data) {
            currentUser = data;
            const uEl = document.getElementById('u-name'); if(uEl) uEl.innerText = "夥伴, " + data.name;
            if (currentUser.code === '555') {
                document.getElementById('t-adm').style.display = 'block';
                document.getElementById('drv-admin-area').style.display = 'block';
            }
            document.getElementById('view-login').style.display = 'none';
            document.getElementById('view-main').style.display = 'block';
            await initApp();
        } else { alert("代碼錯誤"); currentCode = ""; window.pressKey('C'); }
    } catch(e) { console.error(e); } finally { setLoad(false); }
}

async function initApp() { await Promise.all([fetchMainData(), fetchStaffList(), fetchStock(), fetchDriveFiles()]); }

// --- 資料抓取與「事項」精確修正 ---
async function fetchMainData() {
    const ds = selectedDate.toISOString().split('T')[0];
    document.getElementById('h-date').innerText = ds;
    
    // 抓取當月份資料
    const { data } = await _sb.from('roster').select('*').gte('date', ds.substring(0,8)+'01').lte('date', ds.substring(0,8)+'31');
    allMonthData = data || [];
    
    const ld = document.getElementById('l-day'), ln = document.getElementById('l-night'), noteEl = document.getElementById('v-note');
    const dD = document.getElementById('v-dD'), dN = document.getElementById('v-dN');

    // 【1. 暴力初始化】切換日期時，先強行重置所有畫面內容，避免舊資料殘留
    if(ld) ld.innerHTML = ''; 
    if(ln) ln.innerHTML = '';
    if(noteEl) noteEl.innerText = "今日無事項";
    if(dD) dD.innerText = "--";
    if(dN) dN.innerText = "--";
    
    // 【2. 精確篩選】只過濾出「當天」的資料
    const todayRows = allMonthData.filter(x => x.date === ds);
    
    todayRows.forEach(r => {
        const n = String(r.staff_name).trim();
        const c = (r.shift_code === null || r.shift_code === undefined) ? "" : String(r.shift_code).trim();

        if(n === "事項") {
            // 只有當天真的有內容時才覆蓋
            if(noteEl && c !== "" && c !== "null" && c !== "undefined") {
                noteEl.innerText = c;
            }
        }
        else if(n === "早班值日") { if(dD) dD.innerText = staffMap[c] || c || "--"; }
        else if(n === "晚班值日") { if(dN) dN.innerText = staffMap[c] || c || "--"; }
        else {
            const s = parseShift(c);
            if(s.isW) {
                const h = `<div class="d-flex justify-content-between border-bottom py-1"><span>${n}</span><b>${s.disp}</b></div>`;
                if(s.type === 'day') { if(ld) ld.innerHTML += h; } else { if(ln) ln.innerHTML += h; }
            }
        }
    });
    renderCalendar();
}

// --- 其餘功能與 iPhone 優化 ---
function getShortName(n) { return n.length > 2 ? n.substring(n.length-2) : n; }
function parseShift(c) { c = String(c||'').trim().toUpperCase(); if(!c || ['休','OFF','例','年'].includes(c)) return {isW:false, disp:c}; const m = {'O':'早班','X':'晚班','10':'10:00','O年':'早半','X年':'晚半'}; return {isW:true, disp:m[c]||c, type:(c.includes('X')||c==='10')?'night':'day'}; }
function setLoad(s) { document.getElementById('loading').style.display = s ? 'flex' : 'none'; }
function formatExcelDate(v) { let d = (typeof v === 'number') ? new Date(Math.round((v - 25569) * 86400 * 1000)) : new Date(v); return d.toISOString().split('T')[0]; }

window.submitStock = async function() {
    const o = document.getElementById('st-owner').value, n = document.getElementById('st-note').value, f = document.getElementById('st-photo').files[0];
    if(!o || !n) return alert("必填項目未完成");
    setLoad(true);
    try {
        let p = null;
        if(f) {
            const comp = await imageCompression(f, {maxSizeMB: 0.15});
            const fname = `stock/${Date.now()}.jpg`;
            const { data, error } = await _sb.storage.from('photos').upload(fname, comp);
            if(error) throw error; p = data.path;
        }
        await _sb.from('stock_items').insert([{sender_name:currentUser.name, owner_name:o, note:n, photo_path:p, status:'待處理'}]);
        if(stModal) stModal.hide(); fetchStock(); alert("成功");
    } catch(e) { alert("失敗"); } finally { setLoad(false); }
};

window.handleDone = async function(id, p) { if(!confirm("確定完成？")) return; setLoad(true); await _sb.from('stock_items').delete().eq('id', id); if(p && p !== 'null') await _sb.storage.from('photos').remove([p]); fetchStock(); setLoad(false); };

function renderCalendar() {
    const grid = document.getElementById('cal-grid'); if(!grid) return; grid.innerHTML = '';
    const year = selectedDate.getFullYear(), month = selectedDate.getMonth(), days = new Date(year, month+1, 0).getDate(), dsT = new Date().toISOString().split('T')[0];
    for (let d = 1; d <= days; d++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayData = allMonthData.filter(x => x.date === dateStr);
        let html = `<div class="cal-cell ${dateStr === dsT ? 'cal-is-today' : ''}"><div class="cal-date">${d}</div>`;
        if (calMode === 'my' && currentUser) {
            const mine = dayData.find(x => x.staff_name === currentUser.name);
            if(mine) { const s = parseShift(mine.shift_code); html += `<div class="staff-tag-full ${s.type==='night'?'s-X':'s-O'} mt-2" style="font-size:1.1rem !important; width:100%;">${s.disp}</div>`; }
        } else {
            html += `<div class="staff-tag-group">`;
            dayData.forEach(x => { if(!["事項","早班值日","晚班值日"].includes(x.staff_name)) { const s = parseShift(x.shift_code); if(s.isW) html += `<div class="staff-tag-full ${s.type==='night'?'s-X':'s-O'}">${getShortName(x.staff_name)}:${s.disp.substring(0,1)}</div>`; } });
            html += `</div>`;
        }
        grid.innerHTML += html + `</div>`;
    }
}

async function fetchStaffList() { const {data}=await _sb.from('staff').select('name').order('name'); const el = document.getElementById('st-owner'); if(el) el.innerHTML = data.map(s => `<option value="${s.name}">${s.name}</option>`).join(''); }
async function fetchStock() {
    const { data } = await _sb.from('stock_items').select('*').eq('status','待處理').order('created_at',{ascending:false});
    const myPkgs = data?.filter(i => i.owner_name === (currentUser?currentUser.name:''));
    const bn = document.getElementById('notif-banner'); if(bn) bn.style.display = myPkgs?.length > 0 ? 'block' : 'none';
    const l = document.getElementById('stk-list'); if(l) l.innerHTML = data?.map(i => {
        const u = i.photo_path ? _sb.storage.from('photos').getPublicUrl(i.photo_path).data.publicUrl : null;
        return `<div class="flat-card d-flex align-items-center gap-3">${u?`<img src="${u}" style="width:60px;height:60px;object-fit:cover;border-radius:10px;" onclick="window.open('${u}')">`:'<div style="width:60px;height:60px;background:#eee;border-radius:10px;"></div>'}<div class="flex-grow-1"><div class="fw-bold">${i.sender_name} → ${getShortName(i.owner_name)}</div><div class="small text-muted">備註：${i.note}</div><button class="btn btn-sm btn-success w-100 mt-2 rounded-pill" onclick="window.handleDone('${i.id}','${i.photo_path}')">完成</button></div></div>`;
    }).join('') || '<div class="p-3 text-center text-muted small">目前無包裹</div>';
}
async function fetchDriveFiles() {
    const { data } = await _sb.storage.from('public_files').list('', {sortBy:{column:'created_at',order:'desc'}});
    const l = document.getElementById('drv-list'); if(l) l.innerHTML = data?.map(f => {
        let disp = f.name; try { const r = f.name.split('_').slice(1).join('_'); disp = decodeURIComponent(r.replace(/__/g, '%')); } catch(e){}
        const u = _sb.storage.from('public_files').getPublicUrl(f.name).data.publicUrl;
        const del = (currentUser && currentUser.code === '555') ? `<button class="btn btn-sm text-danger border-0" onclick="window.deleteFile('${f.name}')"><i class="fas fa-trash-alt"></i></button>` : '';
        return `<div class="flat-card d-flex justify-content-between align-items-center mb-2"><span class="text-truncate small fw-bold" style="max-width:70%"><i class="far fa-file-pdf text-danger me-2"></i>${disp}</span><div><a href="${u}" target="_blank" class="btn btn-sm btn-outline-primary me-2">看</a>${del}</div></div>`;
    }).join('') || '無檔案';
}

window.uploadToDrive = async function() { 
    const f = document.getElementById('up-drv-file').files[0]; if(!f) return;
    setLoad(true); const sn = encodeURIComponent(f.name).replace(/%/g, '__');
    const { error } = await _sb.storage.from('public_files').upload(`${Date.now()}_${sn}`, f);
    if(!error) fetchDriveFiles(); else alert("失敗"); setLoad(false); 
};
window.deleteFile = async function(n) { if(!confirm("確定刪除？")) return; setLoad(true); await _sb.storage.from('public_files').remove([n]); fetchDriveFiles(); setLoad(false); };

window.uploadExcel = async function() {
    const f = document.getElementById('xl-file').files[0]; if(!f) return; setLoad(true);
    const r = new FileReader(); r.readAsArrayBuffer(f);
    r.onload = async (e) => {
        try {
            const d = new Uint8Array(e.target.result), w = XLSX.read(d, {type:'array'}), s = w.Sheets[w.SheetNames[0]], j = XLSX.utils.sheet_to_json(s, {header:1});
            const ent = []; const dr = j[0];
            [1, 2, 3].forEach(idx => { const row = j[idx], name = idx === 1 ? "事項" : (idx === 2 ? "早班值日" : "晚班值日"); if (row) for (let c = 1; c < row.length; c++) if (dr[c] && row[c]) ent.push({ date: formatExcelDate(dr[c]), staff_name: name, shift_code: String(row[c]).trim() }); });
            for (let r = 5; r < j.length; r++) { const row = j[r], name = row[0]; if (name && !["行事曆","事項","早班值日","晚班值日"].includes(String(name).trim())) for (let c = 1; c < row.length; c++) if (dr[c] && row[c]) ent.push({ date: formatExcelDate(dr[c]), staff_name: String(name).trim(), shift_code: String(row[c]) }); }
            const map = new Map(); ent.forEach(i => map.set(`${i.date}_${i.staff_name}`, i));
            await _sb.from('roster').upsert(Array.from(map.values()), { onConflict: 'date,staff_name' });
            alert("同步成功"); fetchMainData();
        } catch(e) { alert("同步失敗"); } finally { setLoad(false); }
    };
};
