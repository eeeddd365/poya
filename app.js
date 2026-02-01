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

// --- 登入系統 ---
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
            await initApp();
        } else { alert("代碼錯誤"); currentCode = ""; document.getElementById('code-val').innerText = "---"; }
    } catch(e){ alert("連線失敗，請重新整理"); } finally { setLoad(false); }
}
async function initApp() { await Promise.all([fetchMainData(), fetchStock(), fetchStaffList('i-notify-who'), fetchStaffList('st-owner')]); }

// --- 入倉：條碼輸入自動查詢 (修復品名與照片不跳出的問題) ---
window.autoFillByBarcode = async (val) => {
    if(!val || val.length < 5) return;
    const { data } = await _sb.from('inventory').select('*').or(`barcode.eq.${val},international_code.eq.${val}`).limit(1);
    const nameInput = document.getElementById('i-name');
    const existImgBox = document.getElementById('i-exist-img');
    
    if(data && data.length > 0) {
        const i = data[0];
        nameInput.value = i.item_name;
        nameInput.readOnly = true; 
        document.getElementById('i-dept').value = i.dept || "A01";
        if(i.photo_path) {
            existPhotoPath = i.photo_path;
            document.getElementById('i-preview-src').src = _sb.storage.from('photos').getPublicUrl(i.photo_path).data.publicUrl;
            existImgBox.style.display = 'block';
        } else { existPhotoPath = null; existImgBox.style.display = 'none'; }
    } else {
        nameInput.value = "";
        nameInput.readOnly = false;
        nameInput.placeholder = "新商品，請輸入名稱";
        existImgBox.style.display = 'none';
        existPhotoPath = null;
    }
};

// --- 倉庫查詢 (智慧功能：qty > 0 才顯示) ---
window.searchInventory = function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
        const d = document.getElementById('q-dept').value, b = document.getElementById('q-barcode').value;
        if(!d && !b) { document.getElementById('inv-results').innerHTML = ""; return; }
        setLoad(true);
        
        let qry = _sb.from('inventory').select('*').gt('qty', 0); // 自動隱藏無庫存
        if(d) qry = qry.eq('dept', d);
        if(b) qry = qry.or(`barcode.ilike.%${b}%,international_code.ilike.%${b}%,item_name.ilike.%${b}%,note.ilike.%${b}%`);
        
        const { data } = await qry.order('created_at', {ascending: false});
        document.getElementById('inv-results').innerHTML = data?.map(i => {
            const u = i.photo_path ? _sb.storage.from('photos').getPublicUrl(i.photo_path).data.publicUrl : 'https://via.placeholder.com/75';
            return `<div class="flat-card d-flex align-items-center gap-3" onclick="window.openAdjust('${i.id}','${i.item_name}',${i.qty},'${u}','${i.note || ''}')">
                <img src="${u}" class="inventory-img">
                <div class="flex-grow-1 overflow-hidden">
                    <div class="fw-bold text-truncate">${i.item_name}</div>
                    <div class="mt-1 d-flex gap-1"><span class="code-badge">店:${i.barcode}</span><span class="code-badge">國:${i.international_code||'無'}</span></div>
                    <div class="small text-muted mt-1">位置: <b class="text-primary">${i.note||'無'}</b> | 庫存: <b class="text-danger">${i.qty}</b></div>
                </div><i class="fas fa-edit text-muted"></i></div>`;
        }).join('') || '<div class="text-center p-4">目前無庫存</div>';
        setLoad(false);
    }, 350);
};

// --- 編輯功能修復 (位置儲存、數量調整) ---
window.openAdjust = (id, n, q, u, nt) => {
    curAdjId = id; curAdjQty = q;
    document.getElementById('adj-title').innerText = n;
    document.getElementById('adj-current-qty').innerText = q;
    document.getElementById('adj-note').value = nt;
    document.getElementById('adj-img-container').innerHTML = `<img src="${u}" style="width:100px; height:100px; object-fit:cover; border-radius:10px;">`;
    if(!adjM) adjM = new bootstrap.Modal(document.getElementById('adjustModal'));
    adjM.show();
};

window.saveNoteOnly = async () => {
    if(!curAdjId) return;
    setLoad(true);
    const { error } = await _sb.from('inventory').update({ note: document.getElementById('adj-note').value }).eq('id', curAdjId);
    if(error) alert("儲存失敗");
    else { alert("位置更新成功"); if(adjM) adjM.hide(); window.searchInventory(); }
    setLoad(false);
};

window.adjustInventory = async (type) => {
    const v = parseInt(document.getElementById('adj-val').value) || 1;
    const nQ = type === 'add' ? curAdjQty + v : curAdjQty - v;
    if(nQ < 0) return alert("數量不足");
    setLoad(true);
    const { error } = await _sb.from('inventory').update({ qty: nQ, note: document.getElementById('adj-note').value }).eq('id', curAdjId);
    if(!error) { if(adjM) adjM.hide(); window.searchInventory(); }
    setLoad(false);
};

// --- 班表同步邏輯 (修復) ---
window.uploadExcel = async function() {
    const f = document.getElementById('xl-file').files[0];
    if(!f) return alert("請選擇檔案");
    setLoad(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header: 1});
            const entries = [];
            const dr = json[0];
            [1,2,3].forEach(idx => {
                const row = json[idx], name = idx===1?"事項":idx===2?"早班值日":"晚班值日";
                if(row) for(let c=1; c<row.length; c++) if(dr[c]&&row[c]) entries.push({date:fmtD(dr[c]), staff_name:name, shift_code:String(row[c]).trim()});
            });
            for(let r=5; r<json.length; r++){
                const row=json[r], name=row[0];
                if(name && !["事項","早班值日","晚班值日"].includes(String(name).trim()))
                for(let c=1; c<row.length; c++) if(dr[c]&&row[c]) entries.push({date:fmtD(dr[c]), staff_name:String(name).trim(), shift_code:String(row[c])});
            }
            await _sb.from('roster').upsert(entries, { onConflict: 'date,staff_name' });
            alert("同步成功"); fetchMainData();
        } catch(err) { alert("同步失敗"); } finally { setLoad(false); }
    };
    reader.readAsArrayBuffer(f);
};

// --- 其餘基礎功能 (掃描、人員列表、日曆) ---
window.startScanner = (div, inp, cb) => {
    document.getElementById(div).style.display='block';
    html5QrCode = new Html5Qrcode(div);
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (t) => {
        document.getElementById(inp).value=t;
        window.stopScan();
        if(inp==='i-barcode') window.autoFillByBarcode(t);
        if(cb) window.searchInventory();
    }).catch(()=>alert("相機失敗"));
};
window.stopScan = () => { if(html5QrCode) { html5QrCode.stop().then(() => { document.querySelectorAll('.reader-box').forEach(el=>el.style.display='none'); html5QrCode = null; }); } };
window.startInvScan = () => window.startScanner("i-reader", "i-barcode", false);
window.startSearchScan = () => window.startScanner("q-reader", "q-barcode", true);
window.openInvModal = () => { new bootstrap.Modal(document.getElementById('invModal')).show(); };
window.openStockModal = () => { new bootstrap.Modal(document.getElementById('stockModal')).show(); };
async function fetchStaffList(id) { const {data}=await _sb.from('staff').select('name').order('name'); const el=document.getElementById(id); if(el) el.innerHTML='<option value="">--不通知--</option>'+data.map(s=>`<option value="${s.name}">${s.name}</option>`).join(''); }
function setLoad(s){ document.getElementById('loading').style.display=s?'flex':'none'; }
function fmtD(v){ let d=(typeof v==='number')?new Date(Math.round((v-25569)*86400*1000)):new Date(v); return d.toISOString().split('T')[0]; }
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
