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

window.toggleCalMode = function(m) {
    calMode = m;
    const bm = document.getElementById('btn-my-cal'); if(bm) bm.classList.toggle('active', m==='my');
    const ba = document.getElementById('btn-all-cal'); if(ba) ba.classList.toggle('active', m==='all');
    renderCalendar();
};

// --- Excel 智慧匯入 ---
window.importInventoryExcel = function(input) {
    const file = input.files[0]; if(!file) return;
    setLoad(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header: 1});
            const { data: dbData } = await _sb.from('inventory').select('id, barcode');
            const dbBarcodeMap = new Map();
            dbData.forEach(item => dbBarcodeMap.set(String(item.barcode), item.id));
            let added = 0, migrated = 0;
            const rowsToUpsert = [];
            for(let r of rows.slice(1)) {
                if(!r[0]) continue;
                const storeCode = String(r[0]).trim(); 
                const intlCode = r[1] ? String(r[1]).trim() : null;
                const name = r[2] ? String(r[2]).trim() : "未命名";
                if(intlCode && dbBarcodeMap.has(intlCode) && !intlCode.startsWith('21000')) {
                    await _sb.from('inventory').update({ barcode: storeCode, international_code: intlCode, item_name: name }).eq('id', dbBarcodeMap.get(intlCode));
                    migrated++;
                } else {
                    rowsToUpsert.push({ barcode: storeCode, international_code: intlCode, item_name: name, dept: storeCode.substring(0,2), qty: 0 });
                    added++;
                }
            }
            if(rowsToUpsert.length > 0) {
                const chunkSize = 50;
                for (let i = 0; i < rowsToUpsert.length; i += chunkSize) {
                    await _sb.from('inventory').upsert(rowsToUpsert.slice(i, i + chunkSize), { onConflict: 'barcode' });
                }
            }
            alert(`匯入完成！新增: ${added} 筆, 轉移舊資料: ${migrated} 筆`);
        } catch(e){ alert("匯入失敗: " + e.message); }
        setLoad(false); input.value = "";
    };
    reader.readAsArrayBuffer(file);
};

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
    } else {
        nameInput.value = ""; nameInput.readOnly = false;
        document.getElementById('i-exist-img').style.display = 'none';
    }
};

window.searchInventory = function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
        const d = document.getElementById('q-dept').value;
        const b = document.getElementById('q-barcode').value;
        if(!d && !b) { document.getElementById('inv-results').innerHTML = ""; return; }
        setLoad(true);
        let qry = _sb.from('inventory').select('*');
        if(d) qry = qry.eq('dept', d);
        if(b) qry = qry.or(`barcode.ilike.%${b}%,international_code.ilike.%${b}%,item_name.ilike.%${b}%`);
        const { data } = await qry.order('created_at', {ascending: false});
        const res = document.getElementById('inv-results');
        res.innerHTML = data?.map(i => {
            const u = i.photo_path ? _sb.storage.from('photos').getPublicUrl(i.photo_path).data.publicUrl : '';
            return `<div class="flat-card d-flex align-items-center gap-3" onclick="window.openAdjust('${i.id}','${i.item_name}',${i.qty},'${u}','${i.note || ''}')">
                <img src="${u || 'https://via.placeholder.com/60'}" class="inventory-img">
                <div class="flex-grow-1"><div class="fw-bold">${i.item_name}</div><div class="small text-muted">店:${i.barcode} | 庫存:<b class="text-danger">${i.qty}</b></div></div><i class="fas fa-edit text-muted"></i></div>`;
        }).join('') || '<div class="text-center p-4 small">查無商品</div>';
        setLoad(false);
    }, 300);
};

window.openAdjust = (id, name, qty, imgUrl, note) => {
    curAdjId = id; curAdjQty = qty;
    document.getElementById('adj-title').innerText = name;
    document.getElementById('adj-current-qty').innerText = qty;
    document.getElementById('adj-note').value = note;
    document.getElementById('adj-img-container').innerHTML = imgUrl ? `<img src="${u}" style="width:100px; height:100px; object-fit:cover; border-radius:10px;">` : '';
    if(!adjM) adjM = new bootstrap.Modal(document.getElementById('adjustModal'));
    adjM.show();
};

window.saveNoteOnly = async function() {
    setLoad(true);
    await _sb.from('inventory').update({ note: document.getElementById('adj-note').value }).eq('id', curAdjId);
    if(adjM) adjM.hide(); window.searchInventory(); setLoad(false);
};

window.adjustInventory = async function(type) {
    const v = parseInt(document.getElementById('adj-val').value) || 1;
    const newQ = (type==='add') ? curAdjQty + v : curAdjQty - v;
    setLoad(true);
    await _sb.from('inventory').update({ qty: newQ, note: document.getElementById('adj-note').value }).eq('id', curAdjId);
    if(adjM) adjM.hide(); window.searchInventory(); setLoad(false);
};

async function checkLogin() {
    setLoad(true);
    try {
        const { data } = await _sb.from('staff').select('*').eq('code', currentCode).single();
        if (data) {
            currentUser = data;
            document.getElementById('u-name').innerText = "夥伴, " + data.name;
            if (currentUser.code === '555') document.getElementById('t-adm').style.display = 'block';
            document.getElementById('view-login').style.display = 'none';
            document.getElementById('view-main').style.display = 'block';
            await initApp();
        } else { alert("代碼錯誤"); currentCode = ""; }
    } catch(e){} finally { setLoad(false); }
}

async function initApp() { await Promise.all([fetchMainData(), fetchStock()]); }
async function fetchMainData() {
    const ds = selectedDate.toISOString().split('T')[0];
    document.getElementById('h-date').innerText = ds;
    const { data } = await _sb.from('roster').select('*').gte('date', ds.substring(0,8)+'01').lte('date', ds.substring(0,8)+'31');
    allMonthData = data || [];
    const ld=document.getElementById('l-day'), ln=document.getElementById('l-night'), nt=document.getElementById('v-note'), dD=document.getElementById('v-dD'), dN=document.getElementById('v-dN');
    ld.innerHTML=''; ln.innerHTML=''; nt.innerText="今日無事項"; dD.innerText="--"; dN.innerText="--";
    allMonthData.filter(x=>x.date===ds).forEach(r=>{
        const n=String(r.staff_name).trim(), c=r.shift_code?String(r.shift_code).trim():"";
        if(n==="事項"&&c!==""&&c!=="null") nt.innerText=c;
        else if(n==="早班值日") dD.innerText=staffMap[c]||c;
        else if(n==="晚班值日") dN.innerText=staffMap[c]||c;
        else { const s=parseShift(c); if(s.isW){ const h=`<div class="d-flex justify-content-between border-bottom py-1"><span>${n}</span><b>${s.disp}</b></div>`; if(s.type==='day') ld.innerHTML+=h; else ln.innerHTML+=h; } }
    });
    renderCalendar();
}

window.startInvScan = () => window.startScanner("i-reader", "i-barcode", window.autoFillByBarcode);
window.startSearchScan = () => window.startScanner("q-reader", "q-barcode");

window.startScanner = function(divId, inputId, callback) {
    document.getElementById(divId).style.display = 'block';
    html5QrCode = new Html5Qrcode(divId);
    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (text) => {
        document.getElementById(inputId).value = text;
        window.stopScan();
        if(callback) callback(text);
    }).catch(() => alert("相機啟動失敗"));
};

window.stopScan = function() { if(html5QrCode) { html5QrCode.stop().then(() => { document.querySelectorAll('.reader-box').forEach(el => el.style.display = 'none'); html5QrCode = null; }); } };

window.submitInventory = async function() {
    const b=document.getElementById('i-barcode').value, n=document.getElementById('i-name').value, q=document.getElementById('i-qty').value, nt=document.getElementById('i-note').value, f=document.getElementById('i-photo').files[0], nWho=document.getElementById('i-notify-who').value;
    if(!b||!q) return alert("條碼與數量必填"); setLoad(true);
    try {
        let p = existPhotoPath; if(f){ const comp=await imageCompression(f,{maxSizeMB:0.1}); const {data}=await _sb.storage.from('photos').upload(`inv/${Date.now()}.jpg`, comp); p=data.path; }
        const { data: exist } = await _sb.from('inventory').select('id, qty').or(`barcode.eq.${b},international_code.eq.${val}`).limit(1);
        if(exist && exist.length > 0) await _sb.from('inventory').update({ item_name: n, qty: exist[0].qty + parseInt(q), note: nt, photo_path: p }).eq('id', exist[0].id);
        else await _sb.from('inventory').insert([{ dept: b.substring(0,2), barcode: b, item_name: n||'新商品', qty: parseInt(q), note: nt, photo_path: p, creator: currentUser.name }]);
        if(nWho) await _sb.from('stock_items').insert([{ sender_name: currentUser.name, owner_name: nWho, note: `入倉: ${n||b}`, photo_path: p, status: '待處理' }]);
        if(invM) invM.hide(); alert("入倉成功");
    } catch(e){ alert("失敗"); } finally { setLoad(false); }
};

window.submitStock = async function() {
    const o=document.getElementById('st-owner').value, n=document.getElementById('st-note').value, f=document.getElementById('st-photo').files[0];
    if(!o||!n) return alert("必填項目未完成"); setLoad(true);
    try { let p=null; if(f){ const comp=await imageCompression(f,{maxSizeMB:0.15}); const {data}=await _sb.storage.from('photos').upload(`stock/${Date.now()}.jpg`, comp); p=data.path; }
    await _sb.from('stock_items').insert([{sender_name:currentUser.name,owner_name:o,note:n,photo_path:p,status:'待處理'}]); if(stM) stM.hide(); fetchStock(); alert("通知成功"); } catch(e){alert("失敗");} finally {setLoad(false);}
};

window.openInvModal = async function() { if(!invM) invM = new bootstrap.Modal(document.getElementById('invModal')); await fetchStaffList('i-notify-who'); invM.show(); };
window.openStockModal = async function() { if(!stM) stM = new bootstrap.Modal(document.getElementById('stockModal')); await fetchStaffList('st-owner'); stM.show(); };
async function fetchStaffList(id) { const {data}=await _sb.from('staff').select('name').order('name'); document.getElementById(id).innerHTML='<option value="">--不通知--</option>'+data.map(s=>`<option value="${s.name}">${s.name}</option>`).join(''); }
async function fetchStock(){ const {data}=await _sb.from('stock_items').select('*').eq('status','待處理').order('created_at',{ascending:false}); const myPkgs=data?.filter(i=>i.owner_name===(currentUser?currentUser.name:'')); if(document.getElementById('notif-banner'))document.getElementById('notif-banner').style.display=myPkgs?.length>0?'block':'none'; document.getElementById('stk-list').innerHTML=data?.map(i=>{ const u=i.photo_path?_sb.storage.from('photos').getPublicUrl(i.photo_path).data.publicUrl:null; return `<div class="flat-card d-flex align-items-center gap-3">${u?`<img src="${u}" style="width:60px;height:60px;object-fit:cover;border-radius:10px" onclick="window.open('${u}')">`:'<div style="width:60px;height:60px;background:#eee;border-radius:10px"></div>'}<div class="flex-grow-1"><div class="fw-bold">${i.sender_name} → ${i.owner_name}</div><div class="small text-muted">備註: ${i.note}</div><button class="btn btn-sm btn-success w-100 mt-2 rounded-pill" onclick="window.handleDone('${i.id}','${i.photo_path}')">領取完成</button></div></div>`; }).join('')||'無通知'; }
window.handleDone=async function(id,p){ if(!confirm("完成領取？"))return; setLoad(true); await _sb.from('stock_items').delete().eq('id',id); if(p&&p!=='null') await _sb.storage.from('photos').remove([p]); fetchStock(); setLoad(false); };
function parseShift(c){ c=String(c||'').trim().toUpperCase(); if(!c||['休','OFF','例','年'].includes(c)) return {isW:false, disp:c}; const m={'O':'早班','X':'晚班','10':'10:00','O年':'早半','X年':'晚半'}; return {isW:true, disp:m[c]||c, type:(c.includes('X')||c==='10')?'night':'day'}; }
function n2(n){ const s=String(n||""); return s.length>2?s.substring(s.length-2):s; }
function setLoad(s){ document.getElementById('loading').style.display=s?'flex':'none'; }
window.changeDate = function(n){ selectedDate.setDate(selectedDate.getDate()+n); fetchMainData(); };
window.uploadToDrive = async function() { const f = document.getElementById('up-drv-file').files[0]; if(!f) return; setLoad(true); const sn = encodeURIComponent(f.name).replace(/%/g, '__'); await _sb.storage.from('public_files').upload(`${Date.now()}_${sn}`, f); fetchDriveFiles(); setLoad(false); };
async function fetchDriveFiles() { const { data } = await _sb.storage.from('public_files').list('', {sortBy:{column:'created_at',order:'desc'}}); const l = document.getElementById('drv-list'); if(!l) return; l.innerHTML = data?.map(f => { let d = f.name; try { const r = f.name.split('_').slice(1).join('_'); d = decodeURIComponent(r.replace(/__/g, '%')); } catch(e){} const u = _sb.storage.from('public_files').getPublicUrl(f.name).data.publicUrl; return `<div class="flat-card d-flex justify-content-between align-items-center mb-2"><span class="text-truncate small fw-bold" style="max-width:70%"><i class="far fa-file-pdf text-danger me-2"></i>${d}</span><div><a href="${u}" target="_blank" class="btn btn-sm btn-outline-primary me-2">看</a></div></div>`; }).join('') || '無檔案'; }
window.uploadExcel = async function() { const f = document.getElementById('xl-file').files[0]; if(!f) return; setLoad(true); const r = new FileReader(); r.readAsArrayBuffer(f); r.onload = async (e) => { try { const d = new Uint8Array(e.target.result), w = XLSX.read(d,{type:'array'}), s = w.Sheets[w.SheetNames[0]], j = XLSX.utils.sheet_to_json(s,{header:1}), ent = []; const dr = j[0]; [1,2,3].forEach(idx => { const row = j[idx], name = idx===1?"事項":idx===2?"早班值日":"晚班值日"; if(row)for(let c=1;c<row.length;c++)if(dr[c]&&row[c])ent.push({date:fmtD(dr[c]), staff_name:name, shift_code:String(row[c]).trim()}); }); for(let r=5;r<j.length;r++){ const row=j[r], name=row[0]; if(name&&!["行事曆","事項","早班值日","晚班值日"].includes(String(name).trim()))for(let c=1;c<row.length;c++)if(dr[c]&&row[c])ent.push({date:fmtD(dr[c]), staff_name:String(name).trim(), shift_code:String(row[c])}); } const map = new Map(); ent.forEach(i => map.set(`${i.date}_${i.staff_name}`, i)); await _sb.from('roster').upsert(Array.from(map.values()), { onConflict: 'date,staff_name' }); alert("同步成功"); fetchMainData(); } catch(e) { alert("失敗"); } finally { setLoad(false); } }; };
function fmtD(v){ let d=(typeof v==='number')?new Date(Math.round((v-25569)*86400*1000)):new Date(v); return d.toISOString().split('T')[0]; }

function renderCalendar() {
    const grid = document.getElementById('cal-grid'); if(!grid) return;
    grid.innerHTML = '';
    const year = selectedDate.getFullYear(), month = selectedDate.getMonth(), days = new Date(year, month+1, 0).getDate(), dsT = new Date().toISOString().split('T')[0];
    for(let d=1; d<=days; d++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayData = allMonthData.filter(x => x.date === dateStr);
        let html = `<div class="cal-cell ${dateStr === dsT ? 'cal-is-today' : ''}"><div class="cal-date">${d}</div>`;
        if (calMode === 'my' && currentUser) {
            const mine = dayData.find(x => String(x.staff_name).trim() === String(currentUser.name).trim());
            if(mine) { const s = parseShift(mine.shift_code); html += `<div class="staff-tag-full ${s.type==='night'?'s-X':'s-O'} mt-2" style="font-size:1rem !important; width:100%">${s.disp}</div>`; }
        } else {
            html += `<div class="staff-tag-group">`;
            dayData.forEach(x => { const sn = String(x.staff_name).trim(); if(!["事項","早班值日","晚班值日"].includes(sn)) { const s = parseShift(x.shift_code); if(s.isW) html += `<div class="staff-tag-full ${s.type==='night'?'s-X':'s-O'}">${n2(sn)}:${s.disp.substring(0,1)}</div>`; } });
            html += `</div>`;
        }
        grid.innerHTML += html + `</div>`;
    }
}
