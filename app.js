const SB_URL = 'https://axbixhnhmimaxhpbhhvt.supabase.co';
const SB_KEY = 'sb_publishable_yccbuWDlTisa2DvaRJEX9w_R1l8BBMB';
const _sb = supabase.createClient(SB_URL, SB_KEY);

const staffMap = { 'A':'張敏鴻','J':'張舜斌','Y':'廖婕茹','C':'許志誠','E':'鄧雅惠','F':'莊嘉銘','N':'倪世宗','G':'蔡明峯','B':'黃郁涵','M':'張淑貞' };
let currentUser = null, currentCode = "", selectedDate = new Date(), calMode = 'my', allMonthData = [];
let stM = null, invM = null, adjM = null, html5QrCode = null, curAdjId = null, curAdjQty = 0, searchTimer = null, existPhotoPath = null;

// --- 核心 ---
window.pressKey = (v) => { if(v==='C')currentCode=""; else if(currentCode.length<3)currentCode+=v; document.getElementById('code-val').innerText=currentCode||"---"; if(currentCode.length===3)checkLogin(); };
window.switchTab = (t) => { window.stopScan?.(); ['v-ros','v-stk','v-inv','v-drv','v-adm'].forEach(v => { const el = document.getElementById(v); if(el) el.style.display = 'none'; }); ['t-ros','t-stk','t-inv','t-drv','t-adm'].forEach(tab => { const el = document.getElementById(tab); if(el) el.classList.remove('active'); }); const targetV = document.getElementById('v-'+t); if(targetV) targetV.style.display = 'block'; const targetT = document.getElementById('t-'+t); if(targetT) targetT.classList.add('active'); if(t === 'drv') fetchDriveFiles(); };

// --- 條碼自動聯動 ---
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

// --- 倉庫查詢 (找回部門過濾與左側縮圖) ---
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
            const u = i.photo_path ? _sb.storage.from('photos').getPublicUrl(i.photo_path).data.publicUrl : 'https://via.placeholder.com/65';
            return `<div class="flat-card d-flex align-items-center gap-3" onclick="window.openAdjust('${i.id}','${i.item_name}',${i.qty},'${u}','${i.note || ''}')">
                <img src="${u}" class="inventory-img">
                <div class="flex-grow-1"><div class="fw-bold">${i.item_name}</div><div class="small text-muted">店:${i.barcode} | 庫存:<b class="text-danger">${i.qty}</b></div></div><i class="fas fa-edit text-muted"></i></div>`;
        }).join('') || '<div class="text-center p-4 small">查無商品</div>';
        setLoad(false);
    }, 300);
};

// --- 彈窗處理 ---
window.openInvModal = () => { document.getElementById('i-barcode').value=""; document.getElementById('i-name').value=""; document.getElementById('i-exist-img').style.display='none'; new bootstrap.Modal(document.getElementById('invModal')).show(); fetchStaffList('i-notify-who'); };
window.openStockModal = () => { new bootstrap.Modal(document.getElementById('stockModal')).show(); fetchStaffList('st-owner'); };
window.openAdjust = (id, name, qty, imgUrl, note) => {
    curAdjId = id; curAdjQty = qty;
    document.getElementById('adj-title').innerText = name;
    document.getElementById('adj-current-qty').innerText = qty;
    document.getElementById('adj-note').value = note || "";
    document.getElementById('adj-img-container').innerHTML = imgUrl ? `<img src="${imgUrl}" style="width:100px; height:100px; object-fit:cover; border-radius:10px;">` : '';
    new bootstrap.Modal(document.getElementById('adjustModal')).show();
};

// --- 其他核心 (同步、匯入、登入、日曆) ---
async function checkLogin() {
    setLoad(true);
    const { data } = await _sb.from('staff').select('*').eq('code', currentCode).single();
    if (data) { currentUser = data; document.getElementById('u-name').innerText = "夥伴, " + data.name; if(currentUser.code === '555') document.getElementById('t-adm').style.display='block'; document.getElementById('view-login').style.display='none'; document.getElementById('view-main').style.display='block'; initApp(); }
    else { alert("代碼錯誤"); currentCode=""; }
    setLoad(false);
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
window.startScanner = (divId, inputId, callback) => { document.getElementById(divId).style.display = 'block'; html5QrCode = new Html5Qrcode(divId); html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (text) => { document.getElementById(inputId).value = text; window.stopScan(); if(callback) callback(text); }).catch(() => alert("相機啟動失敗")); };
window.stopScan = () => { if(html5QrCode) html5QrCode.stop().then(() => { document.querySelectorAll('.reader-box').forEach(el => el.style.display = 'none'); html5QrCode = null; }); };
window.startInvScan = () => window.startScanner("i-reader", "i-barcode", window.autoFillByBarcode);
window.startSearchScan = () => window.startScanner("q-reader", "q-barcode");

window.submitInventory = async function() {
    const b=document.getElementById('i-barcode').value, n=document.getElementById('i-name').value, q=document.getElementById('i-qty').value, nt=document.getElementById('i-note').value, f=document.getElementById('i-photo').files[0], nWho=document.getElementById('i-notify-who').value, d=document.getElementById('i-dept').value;
    if(!b||!q) return alert("條碼與數量必填"); setLoad(true);
    try {
        let p = existPhotoPath; if(f){ const comp=await imageCompression(f,{maxSizeMB:0.1}); const {data}=await _sb.storage.from('photos').upload(`inv/${Date.now()}.jpg`, comp); p=data.path; }
        const { data: exist } = await _sb.from('inventory').select('id, qty').or(`barcode.eq.${b},international_code.eq.${b}`).limit(1);
        if(exist && exist.length > 0) await _sb.from('inventory').update({ item_name: n, qty: exist[0].qty + parseInt(q), note: nt, photo_path: p, dept: d }).eq('id', exist[0].id);
        else await _sb.from('inventory').insert([{ dept: d, barcode: b, item_name: n||'新商品', qty: parseInt(q), note: nt, photo_path: p, creator: currentUser.name }]);
        if(nWho) await _sb.from('stock_items').insert([{ sender_name: currentUser.name, owner_name: nWho, note: `入倉: ${n||b}`, photo_path: p, status: '待處理' }]);
        bootstrap.Modal.getInstance(document.getElementById('invModal')).hide(); alert("入倉成功");
    } catch(e){ alert("失敗"); } finally { setLoad(false); }
};

window.saveNoteOnly = async function() { setLoad(true); await _sb.from('inventory').update({ note: document.getElementById('adj-note').value }).eq('id', curAdjId); bootstrap.Modal.getInstance(document.getElementById('adjustModal')).hide(); window.searchInventory(); setLoad(false); };
window.adjustInventory = async function(type) {
    const v = parseInt(document.getElementById('adj-val').value) || 1;
    const newQ = (type==='add') ? curAdjQty + v : curAdjQty - v;
    setLoad(true); await _sb.from('inventory').update({ qty: newQ, note: document.getElementById('adj-note').value }).eq('id', curAdjId); bootstrap.Modal.getInstance(document.getElementById('adjustModal')).hide(); window.searchInventory(); setLoad(false);
};
window.deleteInventory = async () => { if(!confirm("確定刪除？")) return; setLoad(true); await _sb.from('inventory').delete().eq('id', curAdjId); bootstrap.Modal.getInstance(document.getElementById('adjustModal')).hide(); window.searchInventory(); setLoad(false); };

// --- 其他原本功能不變 ---
window.submitStock = async function() {
    const o=document.getElementById('st-owner').value, n=document.getElementById('st-note').value, f=document.getElementById('st-photo').files[0];
    if(!o||!n) return alert("必填項目未完成"); setLoad(true);
    try { let p=null; if(f){ const comp=await imageCompression(f,{maxSizeMB:0.15}); const {data}=await _sb.storage.from('photos').upload(`stock/${Date.now()}.jpg`, comp); p=data.path; }
    await _sb.from('stock_items').insert([{sender_name:currentUser.name,owner_name:o,note:n,photo_path:p,status:'待處理'}]); bootstrap.Modal.getInstance(document.getElementById('stockModal')).hide(); fetchStock(); alert("通知成功"); } catch(e){alert("失敗");} finally {setLoad(false);}
};
async function fetchStaffList(id) { const {data}=await _sb.from('staff').select('name').order('name'); const el=document.getElementById(id); if(el) el.innerHTML='<option value="">--不通知--</option>'+data.map(s=>`<option value="${s.name}">${s.name}</option>`).join(''); }
async function fetchStock(){ const {data}=await _sb.from('stock_items').select('*').eq('status','待處理').order('created_at',{ascending:false}); const myPkgs=data?.filter(i=>i.owner_name===(currentUser?currentUser.name:'')); if(document.getElementById('notif-banner'))document.getElementById('notif-banner').style.display=myPkgs?.length>0?'block':'none'; document.getElementById('stk-list').innerHTML=data?.map(i=>{ const u=i.photo_path?_sb.storage.from('photos').getPublicUrl(i.photo_path).data.publicUrl:null; return `<div class="flat-card d-flex align-items-center gap-3">${u?`<img src="${u}" style="width:60px;height:60px;object-fit:cover;border-radius:10px">`:'<div style="width:60px;height:60px;background:#eee;border-radius:10px"></div>'}<div class="flex-grow-1"><div class="fw-bold">${i.sender_name} → ${i.owner_name}</div><div class="small text-muted">備註: ${i.note}</div><button class="btn btn-sm btn-success w-100 mt-2 rounded-pill" onclick="window.handleDone('${i.id}','${i.photo_path}')">完成</button></div></div>`; }).join('')||'無通知'; }
window.handleDone=async function(id,p){ if(!confirm("領取？"))return; setLoad(true); await _sb.from('stock_items').delete().eq('id',id); fetchStock(); setLoad(false); };
function parseShift(c){ c=String(c||'').trim().toUpperCase(); if(!c||['休','OFF','例','年'].includes(c)) return {isW:false, disp:c}; const m={'O':'早班','X':'晚班','10':'10:00','O年':'早半','X年':'晚半'}; return {isW:true, disp:m[c]||c, type:(c.includes('X')||c==='10')?'night':'day'}; }
function n2(n){ const s=String(n||""); return s.length>2?s.substring(s.length-2):s; }
function setLoad(s){ document.getElementById('loading').style.display=s?'flex':'none'; }
window.changeDate = function(n){ selectedDate.setDate(selectedDate.getDate()+n); fetchMainData(); };
window.toggleCalMode = function(m){ calMode=m; renderCalendar(); };
async function fetchDriveFiles() { const { data } = await _sb.storage.from('public_files').list('', {sortBy:{column:'created_at',order:'desc'}}); const l = document.getElementById('drv-list'); if(!l) return; l.innerHTML = data?.map(f => { let d = f.name; try { const r = f.name.split('_').slice(1).join('_'); d = decodeURIComponent(r.replace(/__/g, '%')); } catch(e){} const u = _sb.storage.from('public_files').getPublicUrl(f.name).data.publicUrl; return `<div class="flat-card d-flex justify-content-between align-items-center mb-2"><span class="text-truncate small fw-bold" style="max-width:70%"><i class="far fa-file-pdf text-danger me-2"></i>${d}</span><div><a href="${u}" target="_blank" class="btn btn-sm btn-outline-primary me-2">看</a></div></div>`; }).join('') || '無檔案'; }

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
