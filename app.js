const SB_URL = 'https://axbixhnhmimaxhpbhhvt.supabase.co';
const SB_KEY = 'sb_publishable_yccbuWDlTisa2DvaRJEX9w_R1l8BBMB';
const _sb = supabase.createClient(SB_URL, SB_KEY);

const staffMap = { 'A':'張敏鴻','J':'張舜斌','Y':'廖婕茹','C':'許志誠','E':'鄧雅惠','F':'莊嘉銘','N':'倪世宗','G':'蔡明峯','B':'黃郁涵','M':'張淑貞' };
let currentUser = null, currentCode = "", selectedDate = new Date(), calMode = 'my', allMonthData = [];
let stM = null, invM = null, adjM = null, html5QrCode = null, curAdjId = null, curAdjQty = 0, searchTimer = null, existPhotoPath = null;

// --- 登入邏輯 ---
window.pressKey = (v) => { if(v==='C')currentCode=""; else if(currentCode.length<3)currentCode+=v; document.getElementById('code-val').innerText=currentCode||"---"; if(currentCode.length===3)checkLogin(); };
async function checkLogin() {
    setLoad(true);
    try {
        const { data } = await _sb.from('staff').select('*').eq('code', currentCode).single();
        if (data) {
            currentUser = data;
            document.getElementById('u-name').innerText = "夥伴, " + data.name;
            if (currentUser.code === '555') document.getElementById('t-adm').style.display='block';
            document.getElementById('view-login').style.display = 'none';
            document.getElementById('view-main').style.display = 'block';
            await initApp();
        } else { alert("錯誤: 無此代碼"); currentCode=""; }
    } catch(e){ alert("連線錯誤"); } finally { setLoad(false); }
}

async function initApp() { 
    await Promise.all([fetchMainData(), fetchStock(), fetchStaffList('i-notify-who'), fetchStaffList('st-owner')]); 
}

// --- 分頁與條碼比對 ---
window.switchTab = (t) => { window.stopScan?.(); ['v-ros','v-stk','v-inv','v-adm'].forEach(v => { const el = document.getElementById(v); if(el) el.style.display = 'none'; }); ['t-ros','t-stk','t-inv','t-adm'].forEach(tab => { const el = document.getElementById(tab); if(el) el.classList.remove('active'); }); document.getElementById('v-'+t).style.display = 'block'; document.getElementById('t-'+t).classList.add('active'); };

window.autoFillByBarcode = async (val) => {
    if(val.length < 5) return;
    const { data } = await _sb.from('inventory').select('*').or(`barcode.eq.${val},international_code.eq.${val}`).limit(1);
    const nameInput = document.getElementById('i-name');
    if(data && data.length > 0) {
        const i = data[0];
        nameInput.value = i.item_name; nameInput.readOnly = true;
        document.getElementById('i-note').value = i.note || "";
        if(i.photo_path) {
            existPhotoPath = i.photo_path;
            document.getElementById('i-preview-src').src = _sb.storage.from('photos').getPublicUrl(i.photo_path).data.publicUrl;
            document.getElementById('i-exist-img').style.display = 'block';
        } else { existPhotoPath = null; document.getElementById('i-exist-img').style.display = 'none'; }
    } else { nameInput.value = ""; nameInput.readOnly = false; document.getElementById('i-exist-img').style.display = 'none'; }
};

// --- 倉庫查詢 (核心：位置搜尋、左側縮圖、雙碼顯示) ---
window.searchInventory = function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
        const d = document.getElementById('q-dept').value, b = document.getElementById('q-barcode').value;
        if(!d && !b) { document.getElementById('inv-results').innerHTML = ""; return; }
        setLoad(true);
        let qry = _sb.from('inventory').select('*');
        if(d) qry = qry.eq('dept', d);
        if(b) qry = qry.or(`barcode.ilike.%${b}%,international_code.ilike.%${b}%,item_name.ilike.%${b}%,note.ilike.%${b}%`);
        const { data } = await qry.order('created_at', {ascending: false});
        document.getElementById('inv-results').innerHTML = data?.map(i => {
            const u = i.photo_path ? _sb.storage.from('photos').getPublicUrl(i.photo_path).data.publicUrl : 'https://via.placeholder.com/75';
            return `<div class="flat-card d-flex align-items-center gap-3" onclick="window.openAdjust('${i.id}','${i.item_name}',${i.qty},'${u}','${i.note || ''}')">
                <img src="${u}" class="inventory-img">
                <div class="flex-grow-1 overflow-hidden">
                    <div class="fw-bold text-truncate">${i.item_name}</div>
                    <div class="mt-1 d-flex gap-1">
                        <span class="code-badge">店:${i.barcode}</span>
                        <span class="code-badge">國:${i.international_code || '無'}</span>
                    </div>
                    <div class="small text-muted mt-1">位置: <b class="text-primary">${i.note || '未定'}</b> | 庫存: <b class="text-danger">${i.qty}</b></div>
                </div><i class="fas fa-edit text-muted"></i></div>`;
        }).join('') || '<div class="text-center p-4">查無資料</div>';
        setLoad(false);
    }, 300);
};

// --- Excel 智慧匯入 ---
window.importInventoryExcel = (input) => {
    const file = input.files[0]; if(!file) return;
    setLoad(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const workbook = XLSX.read(new Uint8Array(e.target.result), {type: 'array'});
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header: 1});
            const { data: dbData } = await _sb.from('inventory').select('id, barcode');
            const dbMap = new Map(); dbData.forEach(item => dbMap.set(String(item.barcode), item.id));
            let mCount = 0, aCount = 0; const upserts = [];
            for(let r of rows.slice(1)) {
                if(!r[0]) continue;
                const storeCode = String(r[0]).trim(), intlCode = r[1]?String(r[1]).trim():null, name = r[2]?String(r[2]).trim():"未命名";
                if(intlCode && dbMap.has(intlCode) && !intlCode.startsWith('21000')) {
                    await _sb.from('inventory').update({ barcode: storeCode, international_code: intlCode, item_name: name }).eq('id', dbMap.get(intlCode));
                    mCount++;
                } else { upserts.push({ barcode: storeCode, international_code: intlCode, item_name: name, dept: storeCode.substring(0,2), qty: 0 }); aCount++; }
            }
            if(upserts.length>0) await _sb.from('inventory').upsert(upserts, { onConflict: 'barcode' });
            alert(`匯入完成！新增:${aCount}, 遷移舊資料:${mCount}`);
        } catch(e){ alert("失敗: " + e.message); }
        setLoad(false); input.value = "";
    };
    reader.readAsArrayBuffer(file);
};

// --- 通用功能 (掃描、彈窗、儲存) ---
window.openInvModal = () => { new bootstrap.Modal(document.getElementById('invModal')).show(); };
window.openStockModal = () => { new bootstrap.Modal(document.getElementById('stockModal')).show(); };
window.openAdjust = (id, name, qty, u, note) => { curAdjId = id; curAdjQty = qty; document.getElementById('adj-title').innerText = name; document.getElementById('adj-current-qty').innerText = qty; document.getElementById('adj-note').value = note; document.getElementById('adj-img-container').innerHTML = `<img src="${u}" style="width:100px; height:100px; object-fit:cover; border-radius:10px;">`; new bootstrap.Modal(document.getElementById('adjustModal')).show(); };

window.submitInventory = async function() {
    const b=document.getElementById('i-barcode').value, n=document.getElementById('i-name').value, q=document.getElementById('i-qty').value, nt=document.getElementById('i-note').value, f=document.getElementById('i-photo').files[0], d=document.getElementById('i-dept').value, nWho=document.getElementById('i-notify-who').value;
    if(!b||!q) return alert("必填未填"); setLoad(true);
    try {
        let p = existPhotoPath; if(f){ const comp=await imageCompression(f,{maxSizeMB:0.1}); const {data}=await _sb.storage.from('photos').upload(`inv/${Date.now()}.jpg`, comp); p=data.path; }
        const { data: exist } = await _sb.from('inventory').select('id, qty').or(`barcode.eq.${b},international_code.eq.${b}`).limit(1);
        if(exist && exist.length > 0) await _sb.from('inventory').update({ item_name: n, qty: exist[0].qty + parseInt(q), note: nt, photo_path: p, dept: d }).eq('id', exist[0].id);
        else await _sb.from('inventory').insert([{ dept: d, barcode: b, item_name: n||'新商品', qty: parseInt(q), note: nt, photo_path: p, creator: currentUser.name }]);
        if(nWho) await _sb.from('stock_items').insert([{ sender_name: currentUser.name, owner_name: nWho, note: `入倉: ${n||b}`, photo_path: p, status: '待處理' }]);
        bootstrap.Modal.getInstance(document.getElementById('invModal')).hide(); alert("入倉成功");
    } catch(e){ alert("失敗"); } finally { setLoad(false); }
};

window.saveNoteOnly = async () => { setLoad(true); await _sb.from('inventory').update({ note: document.getElementById('adj-note').value }).eq('id', curAdjId); bootstrap.Modal.getInstance(document.getElementById('adjustModal')).hide(); window.searchInventory(); setLoad(false); };
window.adjustInventory = async (type) => { const v = parseInt(document.getElementById('adj-val').value)||1; const nQ = type==='add'?curAdjQty+v:curAdjQty-v; setLoad(true); await _sb.from('inventory').update({ qty: nQ, note: document.getElementById('adj-note').value }).eq('id', curAdjId); bootstrap.Modal.getInstance(document.getElementById('adjustModal')).hide(); window.searchInventory(); setLoad(false); };
window.deleteInventory = async () => { if(!confirm("徹底刪除？")) return; setLoad(true); await _sb.from('inventory').delete().eq('id', curAdjId); bootstrap.Modal.getInstance(document.getElementById('adjustModal')).hide(); window.searchInventory(); setLoad(false); };

window.submitStock = async function() { const o=document.getElementById('st-owner').value, n=document.getElementById('st-note').value, f=document.getElementById('st-photo').files[0]; setLoad(true); try { let p=null; if(f){ const comp=await imageCompression(f,{maxSizeMB:0.15}); const {data}=await _sb.storage.from('photos').upload(`stock/${Date.now()}.jpg`, comp); p=data.path; } await _sb.from('stock_items').insert([{sender_name:currentUser.name,owner_name:o,note:n,photo_path:p,status:'待處理'}]); bootstrap.Modal.getInstance(document.getElementById('stockModal')).hide(); fetchStock(); alert("通知成功"); } catch(e){alert("失敗");} finally {setLoad(false);} };
async function fetchStaffList(id) { const {data}=await _sb.from('staff').select('name').order('name'); const el=document.getElementById(id); if(el) el.innerHTML='<option value="">--不通知--</option>'+data.map(s=>`<option value="${s.name}">${s.name}</option>`).join(''); }
async function fetchStock(){ const {data}=await _sb.from('stock_items').select('*').eq('status','待處理'); if(data?.some(i=>i.owner_name===currentUser?.name)) document.getElementById('notif-banner').style.display='block'; }
window.startScanner = (div, inp, cb) => { document.getElementById(div).style.display='block'; html5QrCode = new Html5Qrcode(div); html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (t) => { document.getElementById(inp).value=t; window.stopScan(); if(cb) cb(t); }).catch(()=>alert("失敗")); };
window.stopScan = () => { if(html5QrCode) { html5QrCode.stop().then(() => { document.querySelectorAll('.reader-box').forEach(el=>el.style.display='none'); html5QrCode = null; }); } };
window.startInvScan = () => window.startScanner("i-reader", "i-barcode", window.autoFillByBarcode);
window.startSearchScan = () => window.startScanner("q-reader", "q-barcode");
function setLoad(s){ document.getElementById('loading').style.display=s?'flex':'none'; }

// --- 原有班表功能 (略) ---
async function fetchMainData() {
    const ds = selectedDate.toISOString().split('T')[0]; document.getElementById('h-date').innerText = ds;
    const { data } = await _sb.from('roster').select('*').gte('date', ds.substring(0,8)+'01').lte('date', ds.substring(0,8)+'31'); allMonthData = data || [];
    renderCalendar();
}
function renderCalendar() { const grid = document.getElementById('cal-grid'); if(!grid) return; grid.innerHTML = ''; const y = selectedDate.getFullYear(), m = selectedDate.getMonth(), days = new Date(y, m+1, 0).getDate(), dsT = new Date().toISOString().split('T')[0]; for(let d=1; d<=days; d++) { const dS = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; const dayData = allMonthData.filter(x => x.date === dS); let html = `<div class="cal-cell ${dS === dsT ? 'cal-is-today' : ''}"><div class="cal-date">${d}</div><div class="staff-tag-group" style="display:flex; flex-wrap:wrap; gap:1px; font-size:0.5rem;">`; dayData.forEach(x => { if(!["事項","早班值日","晚班值日"].includes(x.staff_name)){ html += `<span>${x.staff_name.substring(0,1)}</span>`; } }); grid.innerHTML += html + `</div></div>`; } }
window.changeDate = (n) => { selectedDate.setDate(selectedDate.getDate()+n); fetchMainData(); };
