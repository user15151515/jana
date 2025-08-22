// === Plugins ===
Chart.register(ChartDataLabels);

// === Utils bàsics ===
const $ = (s, root=document) => root.querySelector(s);
const NFEUR_0 = new Intl.NumberFormat('ca-ES',{ style:'currency', currency:'EUR', maximumFractionDigits:0 });
const NFEUR_2 = new Intl.NumberFormat('ca-ES',{ style:'currency', currency:'EUR', minimumFractionDigits:0, maximumFractionDigits:0 });
const fmtEUR = (n, decimals=false) => (decimals ? NFEUR_2 : NFEUR_0).format(Number(n||0));
const monthLabel = (ym) => { if(!ym) return '—'; const [y,m] = ym.split('-').map(Number); return new Date(y, m-1, 1).toLocaleDateString('ca-ES', { month:'long', year:'numeric' }); };
const toast = (msg) => { const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1500); };
const getVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// === Estat (cache) ===
let CACHE = []; // [{month, income, expenses, ending, notes}...]

// === Tema ===
(function initTheme(){
  const saved = localStorage.getItem('fintrack.theme');
  if(saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
  $('#themeToggle').addEventListener('click', ()=>{
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('fintrack.theme', next);
    applyThemeToCharts();
  });
})();

// === Charts ===
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
        datalabels: { color: labelColor, align: 'top', anchor: 'end', offset: 6, clip:false, formatter: (v)=> fmtEUR(v, false) }
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
        datalabels: { color: labelColor, align:'top', anchor:'end', offset:6, clip:false, formatter: (v)=> fmtEUR(v, false) }
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
  saldoChart.data.datasets[0].borderColor = getVar('--primary');
  saldoChart.data.datasets[0].backgroundColor = hexToRgba(getVar('--primary'), 0.18);
  lineChart.data.datasets[0].borderColor  = getVar('--secondary');
  lineChart.data.datasets[0].backgroundColor = hexToRgba(getVar('--secondary'), 0.18);
  saldoChart.update(); lineChart.update();
}

// === Color util ===
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

// === Càlculs derivats ===
function computeDerived(rows){
  const data = [...rows].sort((a,b)=> a.month.localeCompare(b.month));
  const labels=[], balances=[], endings=[];
  let lastEnding = null;

  data.forEach((r)=>{
    const inc = Number(r.income)||0;
    const exp = Number(r.expenses)||0;
    const bal = inc - exp;

    let ending;
    if (r.ending !== '' && r.ending != null && !Number.isNaN(Number(r.ending))) ending = Number(r.ending);
    else ending = (lastEnding ?? 0) + bal;

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

// === Render (inclou etiquetes per a layout mòbil) ===
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

  // Files
  data.forEach((r,i)=>{
    const inc = Number(r.income)||0, exp = Number(r.expenses)||0;
    const bal = inc - exp;

    const tr = document.createElement('tr');

    const tdMonth = document.createElement('td'); tdMonth.dataset.label='Mes'; tdMonth.innerHTML = `<span class="tag">${monthLabel(r.month)}</span>`;
    const tdInc = document.createElement('td'); tdInc.dataset.label='Ingressos'; tdInc.textContent = fmtEUR(inc);
    const tdExp = document.createElement('td'); tdExp.dataset.label='Despeses'; tdExp.textContent = fmtEUR(exp);
    const tdBal = document.createElement('td'); tdBal.dataset.label='Balanç'; tdBal.style.fontWeight='800'; tdBal.style.color = bal>=0?'#16a34a':'#ef4444'; tdBal.textContent = fmtEUR(bal);
    const tdEnd = document.createElement('td'); tdEnd.dataset.label='Saldo final'; tdEnd.style.fontWeight='800'; tdEnd.textContent = fmtEUR(endings[i]);
    const tdNotes = document.createElement('td'); tdNotes.dataset.label='Notes'; tdNotes.innerHTML = (r.notes||'').replace(/</g,'&lt;');

    const tdAct = document.createElement('td'); tdAct.className='actions'; tdAct.dataset.label='Accions';
    tdAct.style.whiteSpace='nowrap';
tdAct.innerHTML = `
  <button class="btn alt icon-btn" data-id="${r.month}" data-idx="${i}" data-act="edit" aria-label="Editar">
    <svg class="icon"><use href="#icon-edit"></use></svg>
  </button>
  <button class="btn alt icon-btn" data-id="${r.month}" data-idx="${i}" data-act="del" aria-label="Esborrar">
    <svg class="icon"><use href="#icon-trash"></use></svg>
  </button>
`;


    tr.appendChild(tdMonth);
    tr.appendChild(tdInc);
    tr.appendChild(tdExp);
    tr.appendChild(tdBal);
    tr.appendChild(tdEnd);
    tr.appendChild(tdNotes);
    tr.appendChild(tdAct);
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

// === Form (CRUD) ===
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
  }catch(err){
    console.error(err);
    alert('Error guardant les dades');
  }
});

$('#rows').addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-act]');
  if(!btn) return;
  const id = btn.dataset.id;
  const idx = +btn.dataset.idx;
  if(btn.dataset.act === 'del'){
    if(confirm('Vols esborrar aquest mes?')){
      try{ await db.collection('months').doc(id).delete(); }
      catch(err){ console.error(err); alert('Error esborrant'); }
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

// === Inicialització ===
buildCharts();
applyThemeToCharts();

// === Realtime Firestore ===
db.collection('months').orderBy('month').onSnapshot(
  (snap) => { CACHE = snap.docs.map(d => ({ id: d.id, ...d.data() })); refresh(); },
  (err) => console.error('Firestore onSnapshot error:', err)
);
