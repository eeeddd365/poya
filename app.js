const SB_URL = 'https://axbixhnhmimaxhpbhhvt.supabase.co';

const SB_KEY = 'sb_publishable_yccbuWDlTisa2DvaRJEX9w_R1l8BBMB';

const _sb = supabase.createClient(SB_URL, SB_KEY);



const staffMap = { 'A':'張敏鴻','J':'張舜斌','Y':'廖婕茹','C':'許志誠','E':'鄧雅惠','F':'莊嘉銘','N':'倪世宗','G':'蔡明峯','B':'黃郁涵','M':'張淑貞' };

let currentUser = null, currentCode = "", selectedDate = new Date(), calMode = 'my', allMonthData = [];

let stM = null, invM = null, adjM = null, html5QrCode = null, curAdjId = null, curAdjQty = 0, searchTimer = null;



// --- 核心掛載 (確保手機端反應) ---

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



window.openInvModal = async function() {

    const el = document.getElementById('invModal');

    if (!invM && el) invM = new bootstrap.Modal(el);

    await fetchStaffList('i-notify-who');

    if(invM) invM.show();

};



window.openStockModal = async function() {

    const el = document.getElementById('stockModal');

    if (!stM && el) stM = new bootstrap.Modal(el);

    await fetchStaffList('st-owner');

    if(stM) stM.show();

};



// --- 獨立備註儲存功能 (修正手機點擊) ---

window.saveNoteOnly = async function() {

    if(!curAdjId) return;

    const newNote = document.getElementById('adj-note').value;

    setLoad(true);

    try {

        const { error } = await _sb.from('inventory').update({ note: newNote }).eq('id', curAdjId);

        if(!error) {

            alert("備註儲存成功！");

            if(adjM) adjM.hide();

            window.searchInventory();

        } else throw error;

    } catch(e) {

        alert("儲存失敗，請再試一次");

    } finally {

        setLoad(false);

    }

};



// --- 倉庫業務 ---

window.searchInventory = function() {

    clearTimeout(searchTimer);

    searchTimer = setTimeout(async () => {

        const d = document.getElementById('q-dept').value, b = document.getElementById('q-barcode').value;

        if(!d && !b) { document.getElementById('inv-results').innerHTML = ""; return; }

        setLoad(true);

        let qry = _sb.from('inventory').select('*');

        if(d) qry = qry.eq('dept', d);

        if(b) qry = qry.ilike('barcode', `%${b}%`);

        const { data } = await qry.order('created_at', {ascending: false});

        const res = document.getElementById('inv-results');

        res.innerHTML = data?.map(i => {

            const u = i.photo_path ? _sb.storage.from('photos').getPublicUrl(i.photo_path).data.publicUrl : '';

            return `<div class="flat-card d-flex align-items-center gap-3" onclick="window.openAdjust('${i.id}','${i.item_name}',${i.qty},'${u}','${i.note || ''}')">

                <img src="${u || 'https://via.placeholder.com/60'}" class="inventory-img">

                <div class="flex-grow-1"><div class="fw-bold">${i.item_name}</div><div class="small text-muted">條碼: ${i.barcode} | 庫存: <b class="text-danger">${i.qty}</b></div><div class="small text-secondary">備註: ${i.note || '無'}</div></div><i class="fas fa-edit text-muted"></i></div>`;

        }).join('') || '<div class="text-center p-4 small">查無商品</div>';

        setLoad(false);

    }, 300);

};



window.openAdjust = function(id, name, qty, imgUrl, note) {

    curAdjId = id; curAdjQty = qty;

    document.getElementById('adj-title').innerText = name;

    document.getElementById('adj-current-qty').innerText = qty;

    document.getElementById('adj-note').value = note;

    document.getElementById('adj-img-container').innerHTML = imgUrl ? <img src="${imgUrl}" style="width:100px; height:100px; object-fit:cover; border-radius:10px;"> : '';

    const el = document.getElementById('adjustModal');

    if(!adjM && el) adjM = new bootstrap.Modal(el);

    if(adjM) adjM.show();

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



window.deleteInventory = async function() {

    if(!confirm("確定永久刪除？")) return;

    setLoad(true);

    await _sb.from('inventory').delete().eq('id', curAdjId);

    if(adjM) adjM.hide(); window.searchInventory(); setLoad(false);

};



// --- 日曆系統 ---

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



// --- 其餘系統 ---

async function checkLogin() {

    setLoad(true);

    try {

        const { data } = await _sb.from('staff').select('*').eq('code', currentCode).single();

        if (data) {

            currentUser = data;

            document.getElementById('u-name').innerText = "夥伴, " + data.name;

            if (currentUser.code === '555') { document.getElementById('t-adm').style.display = 'block'; document.getElementById('drv-admin-area').style.display = 'block'; }

            document.getElementById('view-login').style.display = 'none';

            document.getElementById('view-main').style.display = 'block';

            await initApp();

        } else { alert("錯誤"); currentCode = ""; document.getElementById('code-val').innerText = "---"; }

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

window.startInvScan = () => window.startScanner("i-reader", "i-barcode");

window.startSearchScan = () => window.startScanner("q-reader", "q-barcode", true);

window.startScanner = function(divId, inputId, autoSearch = false) {

    document.getElementById(divId).style.display = 'block';

    html5QrCode = new Html5Qrcode(divId);

    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (text) => {

        document.getElementById(inputId).value = text;

        window.stopScan();

        if(autoSearch) window.searchInventory();

    }).catch(() => alert("相機開啟失敗"));

};

window.stopScan = function() { if(html5QrCode) { html5QrCode.stop().then(() => { document.querySelectorAll('.reader-box').forEach(el => el.style.display = 'none'); html5QrCode = null; }); } };

window.submitInventory = async function() {

    const d=document.getElementById('i-dept').value, b=document.getElementById('i-barcode').value, n=document.getElementById('i-name').va
