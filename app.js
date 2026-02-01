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

// --- 智慧自動查詢邏輯 (修復重點) ---
window.autoFillByBarcode = async (val) => {
    if(!val || val.length < 5) return;
    const { data } = await _sb.from('inventory').select('*').or(`barcode.eq.${val},international_code.eq.${val}`).limit(1);
    const nameInput = document.getElementById('i-name');
    const existImgBox = document.getElementById('i-exist-img');
    const previewImg = document.getElementById('i-preview-src');

    if(data && data.length > 0) {
        const i = data[0];
        nameInput.value = i.item_name;
        nameInput.readOnly = true; // 查得到品名，鎖定防止誤改
        document.getElementById('i-note').value = i.note || "";
        document.getElementById('i-dept').value = i.dept || "";
        
        if(i.photo_path) {
            existPhotoPath = i.photo_path;
            previewImg.src = _sb.storage.from('photos').getPublicUrl(i.photo_path).data.publicUrl;
            existImgBox.style.display = 'block';
        } else {
            existPhotoPath = null;
            existImgBox.style.display = 'none';
        }
    } else {
        // 查無資料，解鎖讓使用者手動編輯品名
        nameInput.value = "";
        nameInput.readOnly = false;
        nameInput.placeholder = "新商品，請手動輸入品名";
        existImgBox.style.display = 'none';
        existPhotoPath = null;
    }
};

// --- 倉庫查詢 (位置+條碼+縮圖) ---
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
            const u = i.photo_path ? _sb.storage.from('photos').getPublicUrl(i.photo_path).data.publicUrl : 'https://via.placeholder.com/65';
            return `<div class="flat-card d-flex align-items-center gap-3" onclick="window.openAdjust('${i.id}','${i.item_name}',${i.qty},'${u}','${i.note || ''}')">
                <img src="${u}" class="inventory-img">
                <div class="flex-grow-1 overflow-hidden">
                    <div class="fw-bold text-truncate">${i.item_name}</div>
                    <div class="mt-1 d-flex flex-wrap gap-1"><span class="code-badge">店:${i.barcode}</span><span class="code-badge">國:${i.international_code||'無'}</span></div>
                    <div class="small text-muted mt-1">位置: <b class="text-primary">${i.note||'無'}</b> | 庫存: <b class="text-danger">${i.qty}</b></div>
                </div><i class="fas fa-edit text-muted"></i></div>`;
        }).join('') || '<div class="text-center p-4">無資料</div>';
        setLoad(false);
    }, 300);
};

// --- 班表同步邏輯 (修復重點) ---
window.uploadExcel = async function() {
    const fileInput = document.getElementById('xl-file');
    const file = fileInput.files[0];
    if(!file) return alert("請先選擇 Excel 檔案");
    setLoad(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, {header: 1});
            const entries = [];
            const dateRow = json[0];
            
            // 處理標題行 (事項、值日)
            [1,2,3].forEach(idx => {
                const row = json[idx], name = idx===1?"事項":idx===2?"早班值日":"晚班值日";
                if(row) for(let c=1; c<row.length; c++) if(dateRow[c]&&row[c]) entries.push({date:fmtD(dateRow[c]), staff_name:name, shift_code:String(row[c]).trim()});
            });
            // 處理人員班表
            for(let r=5; r<json.length; r++){
                const row=json[r], name=row[0];
                if(name && !["事項","早班值日","晚班值日"].includes(String(name).trim()))
                for(let c=1; c<row.length; c++) if(dateRow[c]&&row[c]) entries.push({date:fmtD(dateRow[c]), staff_name:String(name).trim(), shift_code:String(row[c])});
            }
            const { error } = await _sb.from('roster').upsert(entries, { onConflict: 'date,staff_name' });
            if(error) throw error;
            alert("班表同步成功！");
            fetchMainData();
        } catch(err) { alert("同步失敗: " + err.message); } finally { setLoad(false); }
    };
    reader.readAsArrayBuffer(file);
};

// --- 其餘系統功能 ---
async function checkLogin() {
    setLoad(true);
    try {
        const { data } = await _sb.from('staff').select('*').eq('code', currentCode).single();
        if (data) {
            currentUser = data;
            document.getElementById('view-login').style.display = 'none';
            document.getElementById('view-main').style.display = 'block';
            document.getElementById('u-name').innerText = "夥伴, " + data.name;
            if (currentUser.code === '555') { document.getElementById('t-adm').style.display = 'block'; document.getElementById('drv-admin-area').style.display = 'block'; }
            await initApp();
        } else { alert("錯誤"); currentCode = ""; document.getElementById('code-val').innerText = "---"; }
    } catch(e){ alert("連線失敗"); } finally { setLoad(false); }
}
async function initApp() { await Promise.all([fetchMainData(), fetchStock(), fetchStaffList('i-notify-who'), fetchStaffList('st-owner')]); }
async function fetchMainData() {
    const ds = selectedDate.toISOString().split('T')[0]; document.getElementById('h-date').innerText = ds;
    const { data } = await _sb.from('roster').select('*').gte('date', ds.substring(0,8)+'01').lte('date', ds.substring(0,8)+'31'); allMonthData = data || [];
    const ld=document.getElementById('l-day'), ln=document.getElementById('l-night'), nt=document.getElementById('v-note'), dD=document.getElementById('v-dD'), dN=document.getElementById('v-dN');
    ld.innerHTML=''; ln.innerHTML=''; nt.innerText="今日無事項"; dD.innerText="--"; dN.innerText="--";
    allMonthData.filter(x=>x.date===ds).forEach(r=>{
        const n=String(r.staff_name).trim(), c=r.shift_code?String(r.shift_code).trim():"";
        if(n==="事項") nt.innerText=c;
        else if(n==="早班值日") dD.innerText=staffMap[c]||c;
        else if(n==="晚班值日") dN.innerText=staffMap[c]||c;
        else { const s=parseShift(c); if(s.isW){ const h=`<div class="d-flex justify-content-between border-bottom py-1"><span>${n}</span><b>${s.disp}</b></div>`; if(s.type==='day') ld.innerHTML+=h; else ln.innerHTML+=h; } }
    });
    renderCalendar();
}
window.startScanner = (divId, inputId, callback) => {
    document.getElementById(divId).style.display = 'block';
    html5QrCode = new Html5Qrcode(divId);
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (text) => {
        document.getElementById(inputId).value = text;
        window.stopScan();
        if(callback) callback(text);
    }).catch(() => alert("相機啟動失敗"));
};
window.stopScan = () => { if(html5QrCode) { html5QrCode.stop().then(() => { document.querySelectorAll('.reader-box').forEach(el => el.style.display = 'none'); html5QrCode = null; }); } };
window.startInvScan = () => window.startScanner("i-reader", "i-barcode", window.autoFillByBarcode);
window.startSearchScan = () => window.startScanner("q-reader", "q-barcode", window.searchInventory);
window.openInvModal = () => { new bootstrap.Modal(document.getElementById('invModal')).show(); };
window.openStockModal = () => { new bootstrap.Modal(document.getElementById('stockModal')).show(); };
window.openAdjust = (id, n, q, u, nt) => { curAdjId = id; curAdjQty = q; document.getElementById('adj-title').innerText = n; document.getElementById('adj-current-qty').innerText = q; document.getElementById('adj-note').value = nt; document.getElementById('adj-img-container').innerHTML = `<img src="${u}" style="width:100px; height:100px; object-fit:cover; border-radius:10px;">`; new bootstrap.Modal(document.getElementById('adjustModal')).show(); };
window.saveNoteOnly = async () => { setLoad(true); await _sb.from('inventory').update({ note: document.getElementById('adj-note').value }).eq('id', curAdjId); bootstrap.Modal.getInstance(document.getElementById('adjustModal')).hide(); window.searchInventory(); setLoad(false); };
window.adjustInventory = async (type) => { const v = parseInt(document.getElementById('adj-val').value)||1; const nQ = type==='add'?curAdjQty+v:curAdjQty-v; setLoad(true); await _sb.from('inventory').update({ qty: nQ, note: document.getElementById('adj-note').value }).eq('id', curAdjId); bootstrap.Modal.getInstance(document.getElementById('adjustModal')).hide(); window.searchInventory(); setLoad(false); };
window.submitInventory = async function() {
    const b=document.getElementById('i-barcode').value, n=document.getElementById('i-name').value, q=document.getElementById('i-qty').value, nt=document.getElementById('i-note').value, f=document.getElementById('i-photo').files[0], d=document.getElementById('i-dept').value;
    if(!b||!q) return alert("必填未填"); setLoad(true);
    try {
        let p = existPhotoPath; if(f){ const comp=await imageCompression(f,{maxSizeMB:0.1}); const {data}=await _sb.storage.from('photos').upload(`inv/${Date.now()}.jpg`, comp); p=data.path; }
        const { data: exist } = await _sb.from('inventory').select('id, qty').or(`barcode.eq.${b},international_code.eq.${b}`).limit(1);
        if(exist && exist.length > 0) await _sb.from('inventory').update({ item_name: n, qty: exist[0].qty + parseInt(q), note: nt, photo_path: p, dept: d }).eq('id', exist[0].id);
        else await _sb.from('inventory').insert([{ dept: d, barcode: b, item_name: n||'新商品', qty: parseInt(q), note: nt, photo_path: p, creator: currentUser.name }]);
        bootstrap.Modal.getInstance(document.getElementById('invModal')).hide(); alert("入倉成功");
    } catch(e){ alert("失敗"); } finally { setLoad(false); }
};
function setLoad(s){ document.getElementById('loading').style.display=s?'flex':'none'; }
function fmtD(v){ let d=(typeof v==='number')?new Date(Math.round((v-25569)*86400*1000)):new Date(v); return d.toISOString().split('T')[0]; }
function parseShift(c){ c=String(c||'').toUpperCase(); if(!c||['休','OFF','例'].includes(c)) return {isW:false, disp:c}; const m={'O':'早','X':'晚','10':'10'}; return {isW:true, disp:m[c]||c, type:(c.includes('X')||c==='10')?'night':'day'}; }
