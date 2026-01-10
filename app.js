const SB_URL = 'https://axbixhnhmimaxhpbhhvt.supabase.co';
const SB_KEY = 'sb_publishable_yccbuWDlTisa2DvaRJEX9w_R1l8BBMB';
const _sb = supabase.createClient(SB_URL, SB_KEY);

const staffMap = { 'A':'張敏鴻','J':'張舜斌','Y':'廖婕茹','C':'許志誠','E':'鄧雅惠','F':'莊嘉銘','N':'倪世宗','G':'蔡明峯','B':'黃郁涵','M':'張淑貞' };
let currentUser = null, currentCode = "", selectedDate = new Date(), stModal = null, calMode = 'my', allMonthData = [];

// 初始化
window.onload = () => { 
    const el = document.getElementById('stockModal');
    if(el) stModal = new bootstrap.Modal(el); 
};

// 工具：取名子後兩位
function getShortName(name) {
    if(!name) return "";
    const n = String(name).trim();
    return n.length > 2 ? n.substring(n.length - 2) : n;
}

// --- 班表渲染 (更新姓名與班別邏輯) ---
function renderCalendar() {
    const grid = document.getElementById('cal-grid'); if(!grid) return; grid.innerHTML = '';
    const year = selectedDate.getFullYear(), month = selectedDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dsToday = selectedDate.toISOString().split('T')[0];

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayData = allMonthData.filter(x => x.date === dateStr);
        let html = `<div class="cal-cell ${dateStr === dsToday ? 'cal-is-today' : ''}"><div class="cal-date">${d}</div>`;
        
        if (calMode === 'my') {
            const mine = dayData.find(x => x.staff_name === currentUser.name);
            if(mine) {
                const s = parseShift(mine.shift_code);
                html += `<div class="staff-tag-full ${s.type==='night'?'s-X':'s-O'} mt-2" style="font-size:1.2rem !important;">${s.disp}</div>`;
            }
        } else {
            // 全店模式：名子取後兩位 + 班別全字 (例如: 世宗:晚班)
            dayData.forEach(x => {
                if(!["事項","早班值日","晚班值日"].includes(x.staff_name)) {
                    const s = parseShift(x.shift_code);
                    if(s.isW) {
                        html += `<div class="staff-tag-full ${s.type==='night'?'s-X':'s-O'}">${getShortName(x.staff_name)}:${s.disp}</div>`;
                    }
                }
            });
        }
        grid.innerHTML += html + `</div>`;
    }
}

// --- 登入與核心 ---
function pressKey(val) {
    if (val === 'C') {
        currentCode = "";
    } else if (currentCode.length < 3) {
        currentCode += val;
    }
    document.getElementById('code-val').innerText = currentCode || "---";
    if (currentCode.length === 3) checkLogin();
}

async function checkLogin() {
    setLoad(true);
    try {
        const { data } = await _sb.from('staff').select('*').eq('code', currentCode).single();
        if (data) {
            currentUser = data;
            document.getElementById('u-name').innerText = "你好, " + data.name;
            if (currentUser.code === '555') {
                document.getElementById('t-adm').style.display = 'block';
                document.getElementById('drv-admin-area').style.display = 'block';
            }
            document.getElementById('view-login').style.display = 'none';
            document.getElementById('view-main').style.display = 'block';
            await initApp();
        } else { alert("代碼錯誤"); currentCode = ""; document.getElementById('code-val').innerText = "---"; }
    } catch(e) { console.error(e); } finally { setLoad(false); }
}

async function initApp() { await Promise.all([fetchMainData(), fetchStaffList(), fetchStock(), fetchDriveFiles()]); }

async function fetchMainData() {
    const ds = selectedDate.toISOString().split('T')[0];
    document.getElementById('h-date').innerText = ds;
    const { data } = await _sb.from('roster').select('*').gte('date', ds.substring(0,8)+'01').lte('date', ds.substring(0,8)+'31');
    allMonthData = data || [];
    
    const ld = document.getElementById('l-day'), ln = document.getElementById('l-night');
    ld.innerHTML = ''; ln.innerHTML = '';
    
    allMonthData.filter(x => x.date === ds).forEach(r => {
        const n = r.staff_name, c = r.shift_code;
        if(n === "事項") document.getElementById('v-note').innerText = c;
        else if(n === "早班值日") document.getElementById('v-dD').innerText = staffMap[c] || c;
        else if(n === "晚班值日") document.getElementById('v-dN').innerText = staffMap[c] || c;
        else {
            const s = parseShift(c);
            if(s.isW) {
                const h = `<div class="d-flex justify-content-between border-bottom py-2"><span>${n}</span><b>${s.disp}</b></div>`;
                if(s.type === 'day') ld.innerHTML += h; else ln.innerHTML += h;
            }
        }
    });
    renderCalendar();
}

function parseShift(c) {
    c = String(c||'').trim().toUpperCase();
    if(!c || ['休','OFF','例','年'].includes(c)) return {isW:false, disp:c};
    const m = {'O':'早班','X':'晚班','10':'10:00','O年':'早半','X年':'晚半'};
    return {isW:true, disp:m[c]||c, type:(c.includes('X')||c==='10')?'night':'day'};
}

// --- 入庫系統 ---
function openStockModal() { fetchStaffList(); stModal.show(); }
async function submitStock() {
    const o = document.getElementById('st-owner').value, n = document.getElementById('st-note').value, f = document.getElementById('st-photo').files[0];
    if(!o || !n) return alert("必填項目未完成");
    setLoad(true);
    try {
        let p = null;
        if(f) {
            const comp = await imageCompression(f, {maxSizeMB: 0.2, maxWidthOrHeight: 1024});
            const fname = `stock/${Date.now()}.jpg`;
            const { data, error } = await _sb.storage.from('photos').upload(fname, comp);
            if(error) throw error; p = data.path;
        }
        await _sb.from('stock_items').insert([{sender_name:currentUser.name, owner_name:o, note:n, photo_path:p, status:'待處理'}]);
        stModal.hide(); fetchStock(); alert("投送成功");
    } catch(e) { alert("失敗"); } finally { setLoad(false); }
}
async function fetchStock() {
    const { data } = await _sb.from('stock_items').select('*').eq('status','待處理').order('created_at',{ascending:false});
    const myPkgs = data?.filter(i => i.owner_name === currentUser.name);
    document.getElementById('notif-banner').style.display = myPkgs?.length > 0 ? 'block' : 'none';
    document.getElementById('stk-list').innerHTML = data?.map(i => {
        const url = i.photo_path ? _sb.storage.from('photos').getPublicUrl(i.photo_path).data.publicUrl : null;
        return `<div class="flat-card d-flex align-items-center gap-3">
            ${url?`<img src="${url}" class="stock-img-sm" onclick="window.open('${url}')">`:'<div class="stock-img-sm bg-light d-flex align-items-center justify-content-center"><i class="fas fa-box text-muted"></i></div>'}
            <div class="flex-grow-1">
                <div class="fw-bold">${i.sender_name} → ${getShortName(i.owner_name)}</div>
                <div class="small">位置：${i.note}</div>
                <button class="btn btn-sm btn-success w-100 mt-2 rounded-pill" onclick="handleDone('${i.id}','${i.photo_path}')">處理完成</button>
            </div>
        </div>`;
    }).join('') || '<div class="p-3 text-center text-muted">無包裹紀錄</div>';
}
async function handleDone(id, p) {
    if(!confirm("確定完成並刪除？")) return;
    setLoad(true);
    await _sb.from('stock_items').delete().eq('id', id);
    if(p && p !== 'null') await _sb.storage.from('photos').remove([p]);
    fetchStock(); setLoad(false);
}

// --- 檔案系統 (檔名安全化修復) ---
async function fetchDriveFiles() {
    const { data } = await _sb.storage.from('public_files').list('', {sortBy:{column:'created_at',order:'desc'}});
    document.getElementById('drv-list').innerHTML = data?.map(f => {
        let disp = f.name;
        try { const raw = f.name.split('_').slice(1).join('_'); disp = decodeURIComponent(raw.replace(/__/g, '%')); } catch(e){}
        const url = _sb.storage.from('public_files').getPublicUrl(f.name).data.publicUrl;
        const delBtn = (currentUser.code === '555') ? `<button class="btn btn-sm text-danger border-0" onclick="deleteFile('${f.name}')"><i class="fas fa-trash-alt"></i></button>` : '';
        return `<div class="flat-card d-flex justify-content-between align-items-center mb-2">
            <span class="text-truncate" style="max-width:70%"><i class="far fa-file-pdf text-danger me-2"></i>${disp}</span>
            <div><a href="${url}" target="_blank" class="btn btn-sm btn-outline-primary me-2">看</a>${delBtn}</div>
        </div>`;
    }).join('') || '無檔案';
}
async function uploadToDrive() { 
    const f = document.getElementById('up-drv-file').files[0]; if(!f) return;
    setLoad(true); 
    const safeName = encodeURIComponent(f.name).replace(/%/g, '__');
    const { error } = await _sb.storage.from('public_files').upload(`${Date.now()}_${safeName}`, f);
    if(error) alert("失敗"); else fetchDriveFiles();
    setLoad(false); 
}
async function deleteFile(n) { if(!confirm("刪除？"))return; setLoad(true); await _sb.storage.from('public_files').remove([n]); fetchDriveFiles(); setLoad(false); }

// --- 同步 Excel ---
async function uploadExcel() {
    const f = document.getElementById('xl-file').files[0]; if(!f) return; setLoad(true);
    const reader = new FileReader(); reader.readAsArrayBuffer(f);
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type:'array'});
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header:1});
            const entries = []; const dateRow = json[0];
            [1, 2, 3].forEach(idx => {
                const row = json[idx], name = idx === 1 ? "事項" : (idx === 2 ? "早班值日" : "晚班值日");
                if (row) for (let c = 1; c < row.length; c++) if (dateRow[c] && row[c]) entries.push({ date: formatExcelDate(dateRow[c]), staff_name: name, shift_code: String(row[c]).trim() });
            });
            for (let r = 5; r < json.length; r++) {
                const row = json[r], name = row[0];
                if (name && !["行事曆","事項","早班值日","晚班值日"].includes(String(name).trim())) {
                    for (let c = 1; c < row.length; c++) if (dateRow[c] && row[c]) entries.push({ date: formatExcelDate(dateRow[c]), staff_name: String(name).trim(), shift_code: String(row[c]) });
                }
            }
            const uniqueMap = new Map(); entries.forEach(i => uniqueMap.set(`${i.date}_${i.staff_name}`, i));
            await _sb.from('roster').upsert(Array.from(uniqueMap.values()), { onConflict: 'date,staff_name' });
            alert("同步成功"); fetchMainData();
        } catch(e) { alert("失敗"); } finally { setLoad(false); }
    };
}

// --- 通用工具 ---
function formatExcelDate(val) { let d = (typeof val === 'number') ? new Date(Math.round((val - 25569) * 86400 * 1000)) : new Date(val); return d.toISOString().split('T')[0]; }
function switchTab(t) { ['v-ros','v-stk','v-drv','v-adm'].forEach(v=>document.getElementById(v).style.display='none'); ['t-ros','t-stk','t-drv','t-adm'].forEach(v=>document.getElementById(v).classList.remove('active')); document.getElementById('v-'+t).style.display='block'; document.getElementById('t-'+t).classList.add('active'); }
function changeDate(n) { selectedDate.setDate(selectedDate.getDate()+n); fetchMainData(); }
function toggleCalMode(m) { calMode = m; document.getElementById('btn-my-cal').classList.toggle('active', m==='my'); document.getElementById('btn-all-cal').classList.toggle('active', m==='all'); renderCalendar(); }
function setLoad(s) { document.getElementById('loading').style.display=s?'flex':'none'; }
async function fetchStaffList() { const {data}=await _sb.from('staff').select('name').order('name'); document.getElementById('st-owner').innerHTML=data.map(s=>`<option value="${s.name}">${s.name}</option>`).join(''); }