const API = 'https://hpc.psy.ntu.edu.tw:5000';

const els = {
  inputGroup: document.getElementById('inputGroup'),
  termList: document.getElementById('termList'),
  related: document.getElementById('relatedList'),
  relatedTable: document.getElementById('relatedTable'),
  studies: document.getElementById('studyList'),
  count: document.getElementById('studyCount'),
  addPlus: document.getElementById('addPlus'),
  addMinus: document.getElementById('addMinus'),
};

let allTerms = [];
let debounceTimers = [];

init();

async function init() {
  try {
    showLoading(els.termList);
    const r = await fetch(`${API}/terms`);
    const ct = r.headers.get('content-type') || '';
    if (!r.ok) {
      const text = await r.text();
      if (r.status === 429) {
        els.termList.innerHTML = `<li class="text-red-500">API 代理流量過多，請稍後再試或自架 proxy</li>`;
      } else if (text.includes('The origin')) {
        els.termList.innerHTML = `<li class="text-red-500">CORS 代理未啟用，請先到 corsdemo 頁面啟用</li>`;
      } else {
        els.termList.innerHTML = `<li class="text-red-500">/terms 請求失敗：${escapeHtml(text)}</li>`;
      }
      allTerms = [];
      return;
    }
    if (ct.includes('application/json')) {
      const data = await r.json();
      if (Array.isArray(data)) {
        allTerms = data;
      } else if (data && Array.isArray(data.terms)) {
        allTerms = data.terms;
      } else {
        allTerms = [];
        els.termList.innerHTML = `<li class="text-red-500">/terms 回傳格式錯誤</li>`;
        return;
      }
      renderFilteredTerms();
    } else {
      const text = await r.text();
      els.termList.innerHTML = `<li class="text-red-500">/terms 非 JSON 回應：${escapeHtml(text.slice(0,100))}</li>`;
      allTerms = [];
    }
  } catch (e) {
    console.error(e);
    els.termList.innerHTML = `<li class="text-red-500">/terms 請求異常：${escapeHtml(e.message || e)}</li>`;
    allTerms = [];
  }

  bindInputEvents();
  els.addPlus.addEventListener('click', () => addInput('plus'));
  els.addMinus.addEventListener('click', () => addInput('minus'));
}

function bindInputEvents() {
  document.querySelectorAll('.termInput').forEach((input, idx) => {
    input.oninput = null;
  });
  document.querySelectorAll('.termInput').forEach((input, idx) => {
    input.addEventListener('input', () => {
      clearTimeout(debounceTimers[idx]);
      debounceTimers[idx] = setTimeout(() => renderFilteredTerms(idx), 300);
    });
  });
}

function addInput(type) {
  // 只新增新欄位，保留所有欄位內容
  const div = document.createElement('div');
  div.className = 'flex items-center space-x-2';
  let color = type === 'plus' ? 'green' : 'red';
  let sign = type === 'plus' ? '+' : '-';
  div.innerHTML = `
    <span class="font-bold text-${color}-500">${sign}</span>
    <input type="text" class="termInput px-3 py-2 border rounded focus:outline-none focus:ring w-full" placeholder="輸入關鍵字..." autocomplete="off">
  `;
  els.inputGroup.appendChild(div);
  bindInputEvents();
  // 新增後自動 focus 新欄位
  const allInputs = els.inputGroup.querySelectorAll('.termInput');
  allInputs[allInputs.length - 1].focus();
  // 立即顯示建議（所有搜尋）
  renderFilteredTerms(allInputs.length - 1);
}

function renderFilteredTerms(idx = 0) {
  // 多欄位支援，每次只根據目前 focus 的欄位顯示建議
  const inputs = Array.from(document.querySelectorAll('.termInput'));
  if (!inputs[idx]) return;
  const q = inputs[idx].value.trim().toLowerCase();
  if (!Array.isArray(allTerms)) {
    els.termList.innerHTML = `<li class="text-red-500">/terms 尚未正確載入</li>`;
    return;
  }
  // 若為空字串則顯示全部
  const matches = allTerms
    .filter(t => typeof t === 'string' && (q === '' || t.toLowerCase().startsWith(q)))
    .slice(0, 200);
  els.termList.innerHTML = matches
    .map(t => `<li class="cursor-pointer hover:bg-blue-100 px-2 py-1 rounded" data-term="${escapeHtml(t)}">${escapeHtml(t)}</li>`)
    .join('') || `<li>查無結果</li>`;

  // 設定點擊事件
  els.termList.querySelectorAll('li[data-term]').forEach(li => {
    li.addEventListener('click', () => {
      // 只將點選的詞填入目前欄位，不重設其他欄位
      inputs[idx].value = li.dataset.term;
      renderFilteredTerms(idx);
      onSelectTerm(li.dataset.term);
    });
  });
}

async function onSelectTerm(term) {
  // 右上：相關詞彙
  showLoadingTable(els.related);
  try {
    const r = await fetch(`${API}/terms/${encodeURIComponent(term)}`);
    const data = await r.json();
    const top10 = (data.related || [])
      .sort((a, b) => b.jaccard - a.jaccard)
      .slice(0, 10);
    els.related.innerHTML = top10.map(x =>
      `<tr>
        <td class="px-3 py-2 border">${escapeHtml(x.term)}</td>
        <td class="px-3 py-2 border text-right">${x.co_count}</td>
        <td class="px-3 py-2 border text-right">${x.jaccard.toFixed(4)}</td>
      </tr>`
    ).join('') || '<tr><td colspan="3" class="text-center text-gray-400">無相關詞彙</td></tr>';
  } catch (e) {
    els.related.innerHTML = '<tr><td colspan="3" class="text-red-500">無法載入相關詞彙</td></tr>';
  }

  // 右下：相關研究
  showLoading(els.studies);
  els.count.textContent = '';
  try {
    const r = await fetch(`${API}/query/${encodeURIComponent(term)}/studies`);
    const data = await r.json();
    els.count.textContent = data.count ? `共 ${data.count} 筆` : '';
    const top10 = (data.results || []).slice(0, 10);
    els.studies.innerHTML = top10.map(s =>
      `<li class="bg-white shadow rounded p-3">
        <div class="font-semibold mb-1">${escapeHtml(s.title)}</div>
        <div class="text-sm text-gray-700 mb-1">${escapeHtml(s.authors)}</div>
        <div class="text-xs text-gray-500">${escapeHtml(s.journal)}${s.year ? ' · ' + s.year : ''}</div>
      </li>`
    ).join('') || '<li>無相關研究</li>';
  } catch (e) {
    els.studies.innerHTML = '<li class="text-red-500">無法載入研究</li>';
  }
}

function showLoading(el) {
  el.innerHTML = '<li class="text-gray-400 animate-pulse">載入中…</li>';
}
function showLoadingTable(el) {
  el.innerHTML = '<tr><td colspan="3" class="text-gray-400 animate-pulse">載入中…</td></tr>';
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[m]));
}