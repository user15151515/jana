// --- Helpers existents (deixa'ls) ---
const $ = (s, root=document) => root.querySelector(s);
// const storeKey = 'fintrack.months.v3';  // ❌ ja no cal

const NFEUR_0 = new Intl.NumberFormat('ca-ES',{ style:'currency', currency:'EUR', maximumFractionDigits:0 });
const NFEUR_2 = new Intl.NumberFormat('ca-ES',{ style:'currency', currency:'EUR', minimumFractionDigits:0, maximumFractionDigits:0 });

const fmtEUR = (n, decimals=false) => (decimals ? NFEUR_2 : NFEUR_0).format(Number(n||0));
const monthLabel = (ym) => {
  if(!ym) return '—';
  const [y,m] = ym.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleDateString('ca-ES', { month:'long', year:'numeric' });
};
const toast = (msg) => { const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1500); };
const getVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ❌ Trau aquestes dues si vols
// function getData(){ try { return JSON.parse(localStorage.getItem(storeKey)) || []; } catch { return []; } }
// function setData(arr){ localStorage.setItem(storeKey, JSON.stringify(arr)); }

// ✅ Cache alimentada per Firestore
let CACHE = []; // [{month, income, expenses, ending, notes}, ...]


// -------- Theme --------
(function initTheme(){
  const saved = localStorage.getItem('fintrack.theme');
  if(saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
  $('#themeToggle').addEventListener('click', ()=>{
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('fintrack.theme', next);
    $('#themeToggle').textContent = next === 'light' ? '☀️ Clar' : '🌙 Fosc';
    applyThemeToCharts();
  });
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  $('#themeToggle').textContent = cur === 'light' ? '☀️ Clar' : '🌙 Fosc';
})();

// -------- Charts --------
let lineChart, saldoChart;
function buildCharts(){
  const gridColor = getVar('--grid');
  const labelColor = getVar('--label');

  saldoChart = new Chart($('#saldoChart'), {
    type: 'line',
    data: { labels: [], datasets: [{
      label: 'Saldo final',
      data: [],
      borderColor: getVar('--primary'),
      backgroundColor: hexToRgba(getVar('--primary'), 0.18),
      fill: true, tension: .35, borderWidth: 2, pointRadius: 3
    }]},
    options: {
      plugins: {
        legend: { display:false },
        datalabels: {
          color: labelColor, align: 'top', anchor: 'end', offset: 6, clip:false,
          formatter: (v)=> fmtEUR(v, false)
        }
      },
      scales: {
        x: { grid: { display:false }, ticks:{ color: labelColor } },
        y: { grid: { color: gridColor }, ticks:{ color: labelColor, callback:(v)=> fmtEUR(v, false) } }
      }
    }
  });

  lineChart = new Chart($('#lineChart'), {
    type: 'line',
    data: { labels: [], datasets: [{
      label: 'Balanç mensual',
      data: [],
      borderColor: getVar('--secondary'),
      backgroundColor: hexToRgba(getVar('--secondary'), 0.18),
      fill: true, tension: .35, borderWidth: 2, pointRadius: 3
    }]},
    options: {
      plugins: {
        legend: { display:false },
        datalabels: {
          color: labelColor, align:'top', anchor:'end', offset:6, clip:false,
          formatter: (v)=> fmtEUR(v, false)
        }
      },
      scales: {
        x: { grid: { display:false }, ticks:{ color: labelColor } },
        y: { grid: { color: gridColor }, ticks:{ color: labelColor, callback:(v)=> fmtEUR(v, false) } }
      }
    }
  });
}

function applyThemeToCharts(){
  if(!lineChart || !saldoChart) return;
  const gridColor = getVar('--grid');
  const labelColor = getVar('--label');

  [lineChart, saldoChart].forEach(ch => {
    ch.options.scales.x.ticks.color = labelColor;
    ch.options.scales.y.ticks.color = labelColor;
    ch.options.scales.y.grid.color = gridColor;
    ch.options.plugins.datalabels.color = labelColor;
    ch.update();
  });

  // Update dataset colors from CSS vars (in case palette changes)
  saldoChart.data.datasets[0].borderColor = getVar('--primary');
  saldoChart.data.datasets[0].backgroundColor = hexToRgba(getVar('--primary'), 0.18);
  lineChart.data.datasets[0].borderColor  = getVar('--secondary');
  lineChart.data.datasets[0].backgroundColor = hexToRgba(getVar('--secondary'), 0.18);
  saldoChart.update(); lineChart.update();
}

// Accepts hex like "#7c3aed" or "rgb(...)" or raw var values
function hexToRgba(color, alpha){
  const c = color.replace('#','').trim();
  if(color.startsWith('rgb')) return color.replace(')',`, ${alpha})`).replace('rgb(', 'rgba(');
  if(c.length===3){
    const r=parseInt(c[0]+c[0],16), g=parseInt(c[1]+c[1],16), b=parseInt(c[2]+c[2],16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } else if(c.length===6){
    const r=parseInt(c.slice(0,2),16), g=parseInt(c.slice(2,4),16), b=parseInt(c.slice(4,6),16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

// -------- Logic --------
function computeDerived(rows){
  const data = [...rows].sort((a,b)=> a.month.localeCompare(b.month));
  const labels=[], balances=[], endings=[];
  let lastEnding = null;

  data.forEach((r)=>{
    const inc = Number(r.income)||0;
    const exp = Number(r.expenses)||0;
    const bal = inc - exp;

    // Ending: manual si existeix; si no, ending anterior + bal (o 0 + bal si és el primer)
    let ending;
    if (r.ending !== '' && r.ending != null && !Number.isNaN(Number(r.ending))) {
      ending = Number(r.ending);
    } else {
      ending = (lastEnding ?? 0) + bal;
    }

    labels.push(monthLabel(r.month));
    balances.push(bal);
    endings.push(ending);
    lastEnding = ending;
  });

  return { labels, balances, endings };
}

function computeKPIs(rows){
  let income=0, expenses=0;
  rows.forEach(r=>{ income += Number(r.income)||0; expenses += Number(r.expenses)||0; });
  return {
    acc: income - expenses,
    last: rows.length ? (Number(rows[rows.length-1].income||0) - Number(rows[rows.length-1].expenses||0)) : 0
  };
}

function refresh(){
  const data = [...CACHE].sort((a,b)=> a.month.localeCompare(b.month));
  const rowsEl = $('#rows'); rowsEl.innerHTML='';

  const { labels, balances, endings } = computeDerived(data);

  // KPIs
  const { acc, last } = computeKPIs(data);
  const kpiAcc = $('#kpiBalance'); const kpiLast = $('#kpiLast');
  kpiAcc.querySelector('.value').textContent = data.length ? fmtEUR(acc) : '—';
  kpiLast.querySelector('.value').textContent = data.length ? fmtEUR(last) : '—';
  kpiAcc.classList.toggle('positive', acc>=0); kpiAcc.classList.toggle('negative', acc<0);
  kpiLast.classList.toggle('positive', last>=0); kpiLast.classList.toggle('negative', last<0);

  // Període
  $('#periodSpan').textContent = data.length ? `${monthLabel(data[0].month)} – ${monthLabel(data[data.length-1].month)}` : '—';

  // Taula (mateix codi que ja tens, però usant 'data')
  data.forEach((r,i)=>{
    const inc = Number(r.income)||0, exp = Number(r.expenses)||0;
    const bal = inc - exp;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="tag">${monthLabel(r.month)}</span></td>
      <td>${fmtEUR(inc)}</td>
      <td>${fmtEUR(exp)}</td>
      <td style="font-weight:800; ${bal>=0?'color:#16a34a':'color:#ef4444'}">${fmtEUR(bal)}</td>
      <td style="font-weight:800">${fmtEUR(endings[i])}</td>
      <td>${(r.notes||'').replace(/</g,'&lt;')}</td>
      <td style="white-space:nowrap">
        <button class="btn alt" data-id="${r.month}" data-idx="${i}" data-act="edit" style="padding:6px 10px; font-size:12px">✏️</button>
        <button class="btn alt" data-id="${r.month}" data-idx="${i}" data-act="del" style="padding:6px 10px; font-size:12px">🗑️</button>
      </td>`;
    rowsEl.appendChild(tr);
  });

  // Gràfics
  saldoChart.data.labels = labels;
  saldoChart.data.datasets[0].data = endings;
  saldoChart.update();

  lineChart.data.labels = labels;
  lineChart.data.datasets[0].data = balances;
  lineChart.update();
}

$('#entryForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const month = $('#month').value;
  const income = parseFloat($('#income').value)||0;
  const expenses = parseFloat($('#expenses').value)||0;
  const endingStr = $('#ending').value.trim();
  const ending = endingStr==='' ? '' : parseFloat(endingStr);
  const notes = $('#notes').value.trim();

  if(!month){ alert('Introdueix el mes'); return; }

  try{
    await db.collection('months').doc(month).set({ month, income, expenses, ending, notes }, { merge:true });
    toast('Mes guardat');
    e.target.reset();
    // No cal cridar refresh(); el farà onSnapshot
  }catch(err){
    console.error(err);
    alert('Error guardant les dades');
  }
});

$('#rows').addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-act]');
  if(!btn) return;

  const id = btn.dataset.id;     // doc id = month
  const idx = +btn.dataset.idx;  // posició a CACHE (ordenada a refresh)

  if(btn.dataset.act === 'del'){
    if(confirm('Vols esborrar aquest mes?')){
      try{
        await db.collection('months').doc(id).delete();
      }catch(err){
        console.error(err); alert('Error esborrant');
      }
    }
  }else if(btn.dataset.act === 'edit'){
    const data = [...CACHE].sort((a,b)=> a.month.localeCompare(b.month));
    const r = data[idx];
    $('#month').value = r.month;
    $('#income').value = r.income;
    $('#expenses').value = r.expenses;
    $('#ending').value = (r.ending!=='' && r.ending!=null) ? r.ending : '';
    $('#notes').value = r.notes||'';
    window.scrollTo({ top:0, behavior:'smooth' });
  }
});


// Init
buildCharts();
applyThemeToCharts();
// 🔴 Escolta en temps real la col·lecció 'months' i alimenta la CACHE
db.collection('months').orderBy('month')
  .onSnapshot((snap) => {
    CACHE = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    refresh();
  }, (err) => {
    console.error('Firestore onSnapshot error:', err);
  });

refresh();


