const SB_URL = 'https://axbixhnhmimaxhpbhhvt.supabase.co';
const SB_KEY = 'sb_publishable_yccbuWDlTisa2DvaRJEX9w_R1l8BBMB';
const _sb = supabase.createClient(SB_URL, SB_KEY);

const staffMap = { 'A':'張敏鴻','J':'張舜斌','Y':'廖婕茹','C':'許志誠','E':'鄧雅惠','F':'莊嘉銘','N':'倪世宗','G':'蔡明峯','B':'黃郁涵','M':'張淑貞' };
let currentUser = null, currentCode = "", selectedDate = new Date(), calMode = 'my', allMonthData = [];
let stM = null, invM = null, adjM = null, html5QrCode = null, curAdjId = null, curAdjQty = 0, searchTimer = null, existPhotoPath = null;

// --- 核心掛載 ---
window.pressKey = function(val) {
    if (val === 'C') currentCode = ""; else if (currentCode.length < 3) currentCode += val;
    const el = document.getElementById('code-val'); if(el) el.innerText = currentCode || "---";
    if (currentCode.length === 3) checkLogin();
};

window.switchTab = function(t) {
    window.stopScan?.();
    ['v-ros','v-stk','v-inv','v-drv','v-adm'].forEach(v => { const el = document.getElementById(v); if(el) el.style.display = 'none'; });
    ['t-ros','t-stk','t-inv','t-drv','t-adm'].forEach(tab => { const el = document.getElementById(tab); if(el) el.classList.remove('active'); });
    const targetV = document.getElementById('v-'+t); if(targetV) targetV.style.display = 'block';
    const targetT = document.getElementById('t-'+t); if(targetT) targetT.classList.add('active');
    if(t === 'drv') fetchDriveFiles();
};

// --- 登入控制 (分段載入避免連線失敗) ---
async function checkLogin() {
    setLoad(true);
    try {
        const { data, error } = await _sb.from('staff').select('*').eq('code', currentCode).single();
        if (data) {
            currentUser = data;
            document.getElementById('view-login').style.display = 'none';
            document.getElementById('view-main').style.display = 'block';
            document.getElementById('u-name').innerText = "夥伴, " + data.name;
            if (currentUser.code === '555') { 
                document.getElementById('t-adm').style.display = 'block'; 
                document.getElementById('drv-admin-area').style.display = 'block'; 
            }
            // 分段載入減少瞬間流量
            await fetchMainData();
            setTimeout(() => { fetchStock(); fetchStaffList('i-notify-who'); fetchStaffList('st-owner'); }, 300);
        } else { alert("代碼錯誤"); currentCode = ""; document.getElementById('code-val').innerText = "---"; }
    } catch(e){ alert("資料庫連線失敗，請稍後再試"); } finally { setLoad(false); }
}

// --- 倉庫功能：隱藏0庫存、支援位置搜尋、顯示雙碼 ---
window.searchInventory = function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
        const d = document.getElementById('q-dept').value, b = document.getElementById('q-barcode').value;
        if(!d && !b) { document.getElementById('inv-results').innerHTML = ""; return; }
        setLoad(true);
        try {
            // 基本過濾：庫存 > 0 (若要找全部可移除 gt)
            let qry = _sb.from('inventory').select('*').gt('qty', 0);
            if(d) qry = qry.eq('dept', d);
            if(b) qry = qry.or(`barcode.ilike.%${b}%,international_code.ilike.%${b}%,item_name.ilike.%${b}%,note.ilike.%${b}%`);
            
            const { data } = await qry.order('created_at', {ascending: false});
            const res = document.getElementById('inv-results');
            res.innerHTML = data?.map(i => {
                const u = i.photo_path ? _sb.storage.from('photos').getPublicUrl(i.photo_path).data.publicUrl : 'https://via.placeholder.com/65';
                return `<div class="flat-card d-flex align-items-center gap-3" onclick="window.openAdjust('${i.id}','${i.item_name}',${i.qty},'${u}','${i.note || ''}')">
                    <img src="${u}" class="inventory-img">
                    <div class="flex-grow-1 overflow-hidden">
                        <div class="fw-bold text-truncate">${i.item_name}</div>
                        <div class="mt-1 d-flex flex-wrap gap-1"><span class="code-badge">店:${i.barcode}</span><span class="code-badge">國:${i.international_code||'無'}</span></div>
                        <div class="small text-muted mt-1">位置: <b class="text-primary">${i.note||'無'}</b> | 庫存: <b class="text-danger">${i.qty}</b></div>
                    </div><i class="fas fa-edit text-muted"></i></div>`;
            }).join('') || '<div class="text-center p-4 small">查無有庫存商品</div>';
        } catch(e){} finally { setLoad(false); }
    }, 350);
};

// --- 入倉：條碼輸入自動查詢 (帶出品名照片) ---
window.autoFillByBarcode = async (val) => {
    if(!val || val.length < 5) return;
    const { data } = await _sb.from('inventory').select('*').or(`barcode.eq.${val},international_code.eq.${val}`).limit(1);
    const nameInput = document.getElementById('i-name');
    const existImgBox = document.getElementById('i-exist-img');
    if(data && data.length > 0) {
        const i = data[0];
        nameInput.value = i.item_name; nameInput.readOnly = true;
        document.getElementById('i-dept').value = i.dept || "";
        if(i.photo_path) {
            existPhotoPath = i.photo_path;
            document.getElementById('i-preview-src').src = _sb.storage.from('photos').getPublicUrl(i.photo_path).data.publicUrl;
            existImgBox.style.display = 'block';
        } else { existPhotoPath = null; existImgBox.style.display = 'none'; }
    } else { nameInput.value = ""; nameInput.readOnly = false; nameInput.placeholder="查無資料，請輸入品名"; existImgBox.style.display = 'none'; existPhotoPath = null; }
};

// --- 編輯存檔功能修復 ---
window.saveNoteOnly = async function() {
    if(!curAdjId) return;
    const newNote = document.getElementById('adj-note').value;
    setLoad(true);
    try {
        const { error } = await _sb.from('inventory').update({ note: newNote }).eq('id', curAdjId);
        if(!error) { if(adjM) adjM.hide(); window.searchInventory(); }
    } catch(e){ alert("儲存失敗"); } finally { setLoad(false); }
};

window.adjustInventory = async function(type) {
    const v = parseInt(document.getElementById('adj-val').value) || 1;
    const newNote = document.getElementById('adj-note').value;
    const newQ = (type==='add') ? curAdjQty + v : curAdjQty - v;
    if(newQ < 0) return alert("數量不足！");
    setLoad(true);
    await _sb.from('inventory').update({ qty: newQ, note: newNote }).eq('id', curAdjId);
    if(adjM) adjM.hide(); window.searchInventory(); setLoad(false);
};

// --- 班表同步修復 (對應 xl-file) ---
window.uploadExcel = async function() {
    const f = document.getElementById('xl-file').files[0];
    if(!f) return alert("請先選擇檔案");
    setLoad(true);
    const r = new FileReader();
    r.onload = async (e) => {
        try {
            const d = new Uint8Array(e.target.result), w = XLSX.read(d,{type:'array'}), s = w.Sheets[w.SheetNames[0]], j = XLSX.utils.sheet_to_json(s,{header:1}), ent = [];
            const dr = j[0];
            [1,2,3].forEach(idx => {
                const row = j[idx], name = idx===1?"事項":idx===2?"早班值日":"晚班值日";
                if(row) for(let c=1;c<row.length;c++) if(dr[c]&&row[c]) ent.push({date:fmtD(dr[c]), staff_name:name, shift_code:String(row[c]).trim()});
            });
            for(let r=5;r<j.length;r++){
                const row=j[r], name=row[0];
                if(name&&!["事項","早班值日","晚班值日"].includes(String(name).trim()))
                for(let c=1;c<row.length;c++) if(dr[c]&&row[c]) ent.push({date:fmtD(dr[c]), staff_name:String(name).trim(), shift_code:String(row[c])});
            }
            await _sb.from('roster').upsert(ent, { onConflict: 'date,staff_name' });
            alert("同步完成"); fetchMainData();
        } catch(e) { alert("同步失敗"); } finally { setLoad(false); }
    };
    r.readAsArrayBuffer(f);
};

// --- 其餘公用邏輯 ---
window.submitInventory = async function() {
    const d=document.getElementById('i-dept').value, b=document.getElementById('i-barcode').value, n=document.getElementById('i-name').value, q=document.getElementById('i-qty').value, nt=document.getElementById('i-note').value, f=document.getElementById('i-photo').files[0], nWho=document.getElementById('i-notify-who').value;
    if(!d||!b||!n||!q) return alert("必填未填"); setLoad(true);
    try {
        let p = existPhotoPath; if(f){ const comp=await imageCompression(f,{maxSizeMB:0.1}); const {data}=await _sb.storage.from('photos').upload(`inv/${Date.now()}.jpg`, comp); p=data.path; }
        const { data: exist } = await _sb.from('inventory').select('id, qty').or(`barcode.eq.${b},international_code.eq.${b}`).limit(1);
        if(exist && exist.length > 0) await _sb.from('inventory').update({ item_name: n, qty: exist[0].qty + parseInt(q), note: nt, photo_path: p, dept: d }).eq('id', exist[0].id);
        else await _sb.from('inventory').insert([{ dept: d, barcode: b, item_name: n, qty: parseInt(q), note: nt, photo_path: p, creator: currentUser.name }]);
        if(nWho) await _sb.from('stock_items').insert([{sender_name:currentUser.name, owner_name:nWho, note:`入倉: ${n}`, photo_path:p, status:'待處理'}]);
        if(invM) invM.hide(); alert("成功");
    } catch(e){ alert("失敗"); } finally { setLoad(false); }
};
window.deleteInventory = async function() { if(!confirm("永久刪除？")) return; setLoad(true); await _sb.from('inventory').delete().eq('id', curAdjId); if(adjM) adjM.hide(); window.searchInventory(); setLoad(false); };
window.openInvModal = () => { if(!invM) invM = new bootstrap.Modal(document.getElementById('invModal')); invM.show(); };
window.openStockModal = () => { if(!stM) stM = new bootstrap.Modal(document.getElementById('stockModal')); stM.show(); };
window.openAdjust = (id, n, q, u, nt) => { curAdjId = id; curAdjQty = q; document.getElementById('adj-title').innerText = n; document.getElementById('adj-current-qty').innerText = q; document.getElementById('adj-note').value = nt; document.getElementById('adj-img-container').innerHTML = `<img src="${u}" style="width:100px;height:100px;object-fit:cover;border-radius:10px">`; if(!adjM) adjM = new bootstrap.Modal(document.getElementById('adjustModal')); adjM.show(); };
async function fetchStaffList(id) { const {data}=await _sb.from('staff').select('name').order('name'); const el=document.getElementById(id); if(el) el.innerHTML='<option value="">--不通知--</option>'+data.map(s=>`<option value="${s.name}">${s.name}</option>`).join(''); }
async function fetchStock(){ const {data}=await _sb.from('stock_items').select('*').eq('status','待處理'); if(data?.some(i=>i.owner_name===currentUser?.name)) document.getElementById('notif-banner').style.display='block'; document.getElementById('stk-list').innerHTML=data?.map(i=>{ const u=i.photo_path?_sb.storage.from('photos').getPublicUrl(i.photo_path).data.publicUrl:null; return `<div class="flat-card d-flex align-items-center gap-3">${u?`<img src="${u}" style="width:60px;height:60px;object-fit:cover;border-radius:10px">`:'<div style="width:60px;height:60px;background:#eee;border-radius:10px"></div>'}<div class="flex-grow-1"><div class="fw-bold">${i.sender_name} → ${i.owner_name}</div><div class="small text-muted">${i.note}</div><button class="btn btn-sm btn-success w-100 mt-2" onclick="window.handleDone('${i.id}')">領取完成</button></div></div>`; }).join('')||'無通知'; }
window.handleDone=async function(id){ await _sb.from('stock_items').delete().eq('id',id); fetchStock(); };
function fmtD(v){ let d=(typeof v==='number')?new Date(Math.round((v-25569)*86400*1000)):new Date(v); return d.toISOString().split('T')[0]; }
function parseShift(c){ c=String(c||'').toUpperCase(); if(!c||['休','OFF','例'].includes(c)) return {isW:false, disp:c}; const m={'O':'早','X':'晚','10':'10'}; return {isW:true, disp:m[c]||c, type:(c.includes('X')||c==='10')?'night':'day'}; }
function n2(n){ return n.substring(n.length-2); }
function setLoad(s){ document.getElementById('loading').style.display=s?'flex':'none'; }
window.changeDate = (n) => { selectedDate.setDate(selectedDate.getDate()+n); fetchMainData(); };
window.toggleCalMode = (m) => { calMode=m; renderCalendar(); };
window.startScanner = (div, inp, auto) => { document.getElementById(div).style.display='block'; html5QrCode = new Html5Qrcode(div); html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (t) => { document.getElementById(inp).value=t; window.stopScan(); if(inp==='i-barcode') window.autoFillByBarcode(t); if(auto) window.searchInventory(); }).catch(()=>alert("失敗")); };
window.stopScan = () => { if(html5QrCode) { html5QrCode.stop().then(() => { document.querySelectorAll('.reader-box').forEach(el=>el.style.display='none'); html5QrCode = null; }); } };
window.startInvScan = () => window.startScanner("i-reader", "i-barcode", false);
window.startSearchScan = () => window.startScanner("q-reader", "q-barcode", true);
async function fetchMainData() {
    const ds = selectedDate.toISOString().split('T')[0]; document.getElementById('h-date').innerText = ds;
    const { data } = await _sb.from('roster').select('*').gte('date', ds.substring(0,8)+'01').lte('date', ds.substring(0,8)+'31'); allMonthData = data || []; renderCalendar();
}
function renderCalendar() {
    const grid = document.getElementById('cal-grid'); if(!grid) return; grid.innerHTML = '';
    const y = selectedDate.getFullYear(), m = selectedDate.getMonth(), days = new Date(y, m+1, 0).getDate();
    for(let d=1; d<=days; d++) {
        const dS = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayData = allMonthData.filter(x => x.date === dS);
        let html = `<div class="cal-cell"><div class="cal-date">${d}</div><div class="staff-tag-group">`;
        dayData.forEach(x => { if(!["事項","早班值日","晚班值日"].includes(x.staff_name)) html += `<span>${x.staff_name.substring(0,1)}</span>`; });
        grid.innerHTML += html + `</div></div>`;
    }
}
