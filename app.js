document.addEventListener('DOMContentLoaded', () => {
  // --- ELEMENTOS DA INTERFACE --- //
  const startBtn = document.getElementById('start-btn');
  const buyBtn = document.getElementById('buy-btn');
  const sellBtn = document.getElementById('sell-btn');
  const closeBtn = document.getElementById('close-btn');
  const restartBtn = document.getElementById('restart-btn');

  const totalProfitEl = document.getElementById('total-profit');
  const currentTradeEl = document.getElementById('current-trade');
  const floatingPlEl = document.getElementById('floating-pl');
  const balanceEl = document.getElementById('balance');
  const equityEl = document.getElementById('equity');
  const recentTradesEl = document.getElementById('recent-trades');

  const gameOverEl = document.getElementById('game-over');
  const gameOverReasonEl = document.getElementById('game-over-reason');
  const tryAgainBtn = document.getElementById('try-again-btn');

  const chartContainer = document.getElementById('chart-container');

  // Aba Contas
  const tabs = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-content');
  const accountsSummaryEl = document.getElementById('accounts-summary');
  const accountsListEl = document.getElementById('accounts-list');

  // --- ESTADO DA SIMULAÇÃO --- //
  const INITIAL_BALANCE = 10000;
  const PIPS_MULTIPLIER = 10000;

  let allCandles = [];
  let currentCandleIndex = 0;
  let activeTrade = null;

  let totalProfit = 0;   // lucro acumulado realizado (sessão)
  let balance = INITIAL_BALANCE; // saldo (sessão)
  let isGameOver = false;

  // Sessões/Contas
  let accountSeq = 1;
  let currentAccount = null; // { id, startedAt, endedAt?, totalProfit, trades: [] }
  let accounts = [];         // histórico de contas (máx. 10)

  // Histórico de trades recentes (para painel)
  let recentTrades = [];

  // Handlers dinâmicos
  let startNextHandler = null;
  let buyHandlerRef = null;
  let sellHandlerRef = null;
  let closeHandlerRef = null;

  // --- HELPERS DE SANEAMENTO --- //
  const toNumber = (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  };

  const normalizeTime = (t) => {
    if (t == null) return null;
    if (typeof t === 'string') {
      const d = new Date(t);
      const ms = d.getTime();
      if (!Number.isFinite(ms)) return null;
      return Math.floor(ms / 1000);
    }
    if (typeof t === 'number') {
      if (!Number.isFinite(t)) return null;
      return t > 1e12 ? Math.floor(t / 1000) : Math.floor(t);
    }
    return null;
  };

  const isValidCandle = (c) => {
    if (!c) return false;
    const { time, open, high, low, close } = c;
    if ([time, open, high, low, close].some(v => v == null || !Number.isFinite(v))) return false;
    if (!(high >= low)) return false;
    const maxOC = Math.max(open, close);
    const minOC = Math.min(open, close);
    if (!(high >= maxOC && low <= minOC)) return false;
    return true;
  };

  const sanitizeCandles = (raw) => {
    const mapped = raw.map(r => {
      const time = normalizeTime(r.time);
      const open = toNumber(r.open);
      const high = toNumber(r.high);
      const low = toNumber(r.low);
      const close = toNumber(r.close);
      return { time, open, high, low, close };
    });

    const filtered = mapped.filter(isValidCandle);
    filtered.sort((a, b) => a.time - b.time);
    const dedup = [];
    let lastTime = null;
    for (const c of filtered) {
      if (lastTime !== c.time) {
        dedup.push(c);
        lastTime = c.time;
      }
    }
    return dedup;
  };

  // --- ABA/TABS --- //
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const id = btn.dataset.tab;
      const panel = document.getElementById(`tab-${id}`);
      if (panel) panel.classList.add('active');
      if (id === 'accounts') renderAccountsTab();
    });
  });

  // --- VALIDAÇÕES INICIAIS --- //
  if (!chartContainer) {
    console.error('Elemento #chart-container não encontrado.');
    alert('Falha: container do gráfico não foi encontrado no DOM.');
    return;
  }
  if (!window.LightweightCharts || typeof LightweightCharts.createChart !== 'function') {
    console.error('LightweightCharts não está disponível no escopo global.');
    alert('Biblioteca LightweightCharts não carregada. Inclua o script UMD no index.html.');
    return;
  }

  // --- GRÁFICO (API v5 com addSeries) --- //
  const chart = LightweightCharts.createChart(chartContainer, {
    width: chartContainer.clientWidth || 900,
    height: Math.max(320, Math.floor((chartContainer.clientWidth || 900) * 0.55)),
    layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
    grid: { vertLines: { color: '#334158' }, horzLines: { color: '#334158' } },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  });

  if (!chart || typeof chart.addSeries !== 'function') {
    console.error('Objeto chart inválido ao criar a série (API v5 espera chart.addSeries).', chart);
    alert('Falha ao inicializar o gráfico (método addSeries ausente).');
    return;
  }

  const candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
    upColor: '#26a69a',
    downColor: '#ef5350',
    borderDownColor: '#ef5350',
    borderUpColor: '#26a69a',
    wickDownColor: '#ef5350',
    wickUpColor: '#26a69a',
  });

  // Redimensionamento responsivo do gráfico
  const resizeObserver = new ResizeObserver(() => {
    const w = chartContainer.clientWidth || 900;
    const h = Math.max(300, Math.floor(w * 0.55));
    chart.applyOptions({ width: w, height: h });
  });
  resizeObserver.observe(chartContainer);

  // --- PERSISTÊNCIA --- //
  function loadRecentTrades() {
    try {
      const raw = localStorage.getItem('recentTrades');
      recentTrades = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(recentTrades)) recentTrades = [];
    } catch { recentTrades = []; }
  }
  function saveRecentTrades() {
    try { localStorage.setItem('recentTrades', JSON.stringify(recentTrades)); } catch {}
  }

  function loadAccounts() {
    try {
      const raw = localStorage.getItem('accounts');
      accounts = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(accounts)) accounts = [];
      // calcular próxima sequência
      const lastId = accounts.reduce((m, a) => Math.max(m, a.id || 0), 0);
      accountSeq = Math.max(1, lastId + 1);
    } catch {
      accounts = [];
      accountSeq = 1;
    }
  }
  function saveAccounts() {
    try { localStorage.setItem('accounts', JSON.stringify(accounts)); } catch {}
  }

  function startNewAccount() {
    currentAccount = {
      id: accountSeq++,
      startedAt: Math.floor(Date.now() / 1000),
      endedAt: null,
      totalProfit: 0,
      trades: []
    };
  }

  function finalizeCurrentAccount(reason = '') {
    if (!currentAccount || currentAccount.endedAt) return;
    currentAccount.endedAt = Math.floor(Date.now() / 1000);
    currentAccount.reason = reason;
    accounts.push(currentAccount);
    // manter apenas as últimas 10 contas
    if (accounts.length > 10) accounts = accounts.slice(-10);
    saveAccounts();
    currentAccount = null;
  }

  // --- HISTÓRICO (painel) --- //
  function addRecentTrade(trade) {
    recentTrades.push(trade);
    if (recentTrades.length > 10) {
      recentTrades = recentTrades.slice(-10);
    }
    saveRecentTrades();
    renderRecentTrades();
  }

  function renderRecentTrades() {
    if (!recentTradesEl) return;
    if (!recentTrades.length) {
      recentTradesEl.innerHTML = '<p>Nenhuma negociação ainda.</p>';
      return;
    }
    const rows = recentTrades.slice().reverse().map((t) => {
      const ts = t.time ? new Date(t.time * 1000).toLocaleString() : '-';
      const pips = (t.pips ?? 0).toFixed(2);
      const profit = (t.profit ?? 0).toFixed(2);
      return `
        <tr>
          <td>${ts}</td>
          <td>${t.type?.toUpperCase() || '-'}</td>
          <td style="text-align:right">${t.entry?.toFixed(5) ?? '-'}</td>
          <td style="text-align:right">${t.exit?.toFixed(5) ?? '-'}</td>
          <td style="text-align:right">${pips}</td>
          <td style="text-align:right">${profit}</td>
        </tr>
      `;
    }).join('');

    recentTradesEl.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Data/Hora</th>
            <th>Tipo</th>
            <th>Entrada</th>
            <th>Saída</th>
            <th>Pips</th>
            <th>Lucro</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // --- ABA CONTAS (resumo por conta) --- //
  function formatSigned(v) {
    const s = (v ?? 0).toFixed(2);
    return (v >= 0 ? '+' : '') + s;
  }

  function renderAccountsTab() {
    // Resumo: "Conta 1 -1987, Conta 2 +2090"
    if (!accountsSummaryEl) return;

    const summaryItems = accounts.map(a => {
      return `Conta ${a.id} ${formatSigned(a.totalProfit)}`;
    });

    accountsSummaryEl.innerHTML = summaryItems.length
      ? `<p>${summaryItems.join(' , ')}</p>`
      : `<p>Nenhuma conta encerrada ainda.</p>`;

    // Lista com trades por conta
    if (!accountsListEl) return;

    if (!accounts.length) {
      accountsListEl.innerHTML = '';
      return;
    }

    const sections = accounts.slice().reverse().map(a => {
      const header = `
        <div style="margin:12px 0; padding:8px; border:1px solid var(--border-color); border-radius:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
            <h4 style="margin:0">Conta ${a.id} • P/L ${formatSigned(a.totalProfit)}</h4>
            <div style="font-size:12px; color:#9b9ea6;">
              Início: ${a.startedAt ? new Date(a.startedAt*1000).toLocaleString() : '-'}
              ${a.endedAt ? ` • Fim: ${new Date(a.endedAt*1000).toLocaleString()}` : ''}
              ${a.reason ? ` • Motivo: ${a.reason}` : ''}
            </div>
          </div>
      `;
      if (!a.trades?.length) {
        return `${header}<p style="margin:8px 0 0 0;">Sem negociações nesta conta.</p></div>`;
      }
      const rows = a.trades.slice().reverse().map(t => `
        <tr>
          <td>${t.time ? new Date(t.time*1000).toLocaleString() : '-'}</td>
          <td>${t.type?.toUpperCase() || '-'}</td>
          <td style="text-align:right">${t.entry?.toFixed(5) ?? '-'}</td>
          <td style="text-align:right">${t.exit?.toFixed(5) ?? '-'}</td>
          <td style="text-align:right">${(t.pips ?? 0).toFixed(2)}</td>
          <td style="text-align:right">${(t.profit ?? 0).toFixed(2)}</td>
        </tr>
      `).join('');
      return `
        ${header}
          <div style="margin-top:8px; overflow:auto;">
            <table>
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Tipo</th>
                  <th>Entrada</th>
                  <th>Saída</th>
                  <th>Pips</th>
                  <th>Lucro</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');

    accountsListEl.innerHTML = sections;
  }

  // --- ESTADO INICIAL DOS BOTÕES --- //
  closeBtn.disabled = true;
  buyBtn.disabled = true;
  sellBtn.disabled = true;

  // --- INICIALIZAÇÃO --- //
  async function initializeApp() {
    try {
      loadRecentTrades();
      loadAccounts();
      renderRecentTrades();
      updateMoneyUI(0);

      if (!currentAccount) startNewAccount();

      const response = await fetch('dados_forex.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Erro ao carregar dados: ${response.status} ${response.statusText}`);

      const raw = await response.json();
      if (!Array.isArray(raw)) {
        alert('Erro: O arquivo de dados não é um array.');
        return;
      }

      allCandles = sanitizeCandles(raw);
      if (allCandles.length < 100) {
        alert('Erro: Após saneamento, restaram menos de 100 candles válidos.');
        return;
      }

      armStartButton();
    } catch (error) {
      console.error('Falha ao inicializar o app:', error);
      alert('Não foi possível carregar os dados. Verifique o console para mais detalhes.');
    }
  }

  function armStartButton() {
    if (startNextHandler) {
      startBtn.removeEventListener('click', startNextHandler);
      startNextHandler = null;
    }
    startBtn.disabled = false;
    startBtn.textContent = 'Iniciar Simulação';
    startBtn.addEventListener('click', startSimulation, { once: true });
  }

  // --- LÓGICA DA SIMULAÇÃO --- //
  function startSimulation() {
    isGameOver = false;

    const startIndex = Math.floor(Math.random() * (allCandles.length - 100));
    currentCandleIndex = startIndex + 100;

    const initialData = allCandles.slice(startIndex, currentCandleIndex);
    try { candleSeries.setData(initialData); }
    catch (e) {
      console.error('Erro ao setar dados iniciais na série:', e);
      alert('Falha ao desenhar os candles iniciais (dados inválidos).');
      return;
    }

    buyBtn.disabled = false;
    sellBtn.disabled = false;

    startBtn.textContent = 'Próximo Candle';
    startNextHandler = nextCandle;
    startBtn.addEventListener('click', startNextHandler);

    buyHandlerRef = onBuyClick;
    sellHandlerRef = onSellClick;
    closeHandlerRef = closeCurrentTrade;

    buyBtn.addEventListener('click', buyHandlerRef);
    sellBtn.addEventListener('click', sellHandlerRef);
    closeBtn.addEventListener('click', closeHandlerRef);
  }

  function nextCandle() {
    do {
      currentCandleIndex++;
      if (currentCandleIndex >= allCandles.length) {
        alert('Fim dos dados históricos!');
        endSimulation();
        return;
      }
    } while (!isValidCandle(allCandles[currentCandleIndex]));

    const newCandle = allCandles[currentCandleIndex];
    try { candleSeries.update(newCandle); }
    catch (e) { console.error('Erro ao atualizar série com novo candle:', e, newCandle); }

    if (activeTrade) updateFloatingProfit();
  }

  // --- NEGOCIAÇÃO --- //
  function onBuyClick() { openTrade('buy'); }
  function onSellClick() { openTrade('sell'); }

  function openTrade(type) {
    if (activeTrade || isGameOver) return;

    const c = allCandles[currentCandleIndex];
    if (!isValidCandle(c)) {
      alert('Candle atual inválido; não é possível abrir posição.');
      return;
    }

    const currentPrice = c.close;
    if (currentPrice == null || !Number.isFinite(currentPrice)) {
      alert('Preço atual inválido; não é possível abrir posição.');
      return;
    }

    let priceLine = null;
    try {
      priceLine = candleSeries.createPriceLine({
        price: currentPrice,
        color: type === 'buy' ? '#26a69a' : '#ef5350',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: type.toUpperCase(),
      });
    } catch (e) {
      console.error('Erro ao criar price line:', e);
      alert('Falha ao criar a linha de preço (dados inválidos).');
      return;
    }

    activeTrade = { type, price: currentPrice, priceLine, time: c.time ?? null };
    updateUIForNewTrade(type, currentPrice);
  }

  function closeCurrentTrade() {
    if (!activeTrade) return;

    const c = allCandles[currentCandleIndex];
    if (!isValidCandle(c)) {
      alert('Candle atual inválido; fechamento pode estar incorreto.');
      return;
    }

    const currentPrice = c.close;
    let profit = 0;

    if (activeTrade.type === 'buy') {
      profit = (currentPrice - activeTrade.price) * PIPS_MULTIPLIER;
    } else {
      profit = (activeTrade.price - currentPrice) * PIPS_MULTIPLIER;
    }

    totalProfit += profit;
    balance += profit;

    // registrar em painel
    const pips = profit;
    const trade = {
      time: activeTrade.time ?? c.time ?? null,
      type: activeTrade.type,
      entry: activeTrade.price,
      exit: currentPrice,
      pips,
      profit,
    };
    addRecentTrade(trade);

    // registrar em conta
    if (currentAccount) {
      currentAccount.trades.push(trade);
      currentAccount.totalProfit += profit;
      saveAccounts(); // salvar incrementalmente
    }

    updateTotalProfitUI();
    updateMoneyUI(0);

    try { if (activeTrade.priceLine) candleSeries.removePriceLine(activeTrade.priceLine); } catch {}
    activeTrade = null;
    resetUIForClosedTrade();

    if (balance <= 0) {
      gameOver('Sua conta chegou a zero após o fechamento da posição.');
    }
  }

  // --- GAME OVER / RECOMEÇO --- //
  function gameOver(reason = 'Sua conta chegou a zero.') {
    if (isGameOver) return;
    isGameOver = true;

    buyBtn.disabled = true;
    sellBtn.disabled = true;
    closeBtn.disabled = true;
    startBtn.disabled = true;

    if (activeTrade && activeTrade.priceLine) {
      try { candleSeries.removePriceLine(activeTrade.priceLine); } catch {}
    }
    activeTrade = null;

    // Finaliza conta atual e inicia próxima somente ao recomeçar
    finalizeCurrentAccount(reason);

    if (gameOverReasonEl) gameOverReasonEl.textContent = reason;
    if (gameOverEl) gameOverEl.style.display = 'flex';
  }

  function restartSimulation() {
    // remover handlers
    if (startNextHandler) { startBtn.removeEventListener('click', startNextHandler); startNextHandler = null; }
    if (buyHandlerRef) buyBtn.removeEventListener('click', buyHandlerRef);
    if (sellHandlerRef) sellBtn.removeEventListener('click', sellHandlerRef);
    if (closeHandlerRef) closeBtn.removeEventListener('click', closeHandlerRef);

    // limpar UI/linha
    if (activeTrade && activeTrade.priceLine) {
      try { candleSeries.removePriceLine(activeTrade.priceLine); } catch {}
    }
    activeTrade = null;

    // Se não foi game over, finalize a conta atual ao reiniciar manualmente
    if (!isGameOver) finalizeCurrentAccount('Reinício manual');

    // inicia nova conta
    startNewAccount();

    // reset números
    totalProfit = 0;
    balance = INITIAL_BALANCE;
    isGameOver = false;
    currentCandleIndex = 0;

    // limpar gráfico e UI
    try { candleSeries.setData([]); } catch {}
    currentTradeEl.textContent = 'Nenhuma';
    currentTradeEl.className = '';
    floatingPlEl.textContent = '0.00';
    floatingPlEl.className = '';
    updateTotalProfitUI();
    updateMoneyUI(0);

    // botões
    buyBtn.disabled = true;
    sellBtn.disabled = true;
    closeBtn.disabled = true;
    startBtn.disabled = false;
    startBtn.textContent = 'Iniciar Simulação';

    // overlay
    if (gameOverEl) gameOverEl.style.display = 'none';

    // preparar novo início
    armStartButton();
    renderAccountsTab();
  }

  // --- UI --- //
  function updateFloatingProfit() {
    if (!activeTrade) {
      updateMoneyUI(0);
      return;
    }

    const c = allCandles[currentCandleIndex];
    if (!isValidCandle(c)) {
      updateMoneyUI(0);
      return;
    }

    const currentPrice = c.close;
    let floatingProfit = 0;

    if (activeTrade.type === 'buy') {
      floatingProfit = (currentPrice - activeTrade.price) * PIPS_MULTIPLIER;
    } else {
      floatingProfit = (activeTrade.price - currentPrice) * PIPS_MULTIPLIER;
    }

    floatingPlEl.textContent = floatingProfit.toFixed(2);
    floatingPlEl.className = floatingProfit >= 0 ? 'profit' : 'loss';

    updateMoneyUI(floatingProfit);

    const equity = balance + floatingProfit;
    if (equity <= 0) {
      gameOver('Equity atingiu zero durante a posição aberta.');
    }
  }

  function updateUIForNewTrade(type, price) {
    buyBtn.disabled = true;
    sellBtn.disabled = true;
    closeBtn.disabled = false;

    currentTradeEl.textContent = `${type.toUpperCase()} @ ${price.toFixed(5)}`;
    currentTradeEl.className = type === 'buy' ? 'profit' : 'loss';
  }

  function resetUIForClosedTrade() {
    buyBtn.disabled = false;
    sellBtn.disabled = false;
    closeBtn.disabled = true;

    currentTradeEl.textContent = 'Nenhuma';
    currentTradeEl.className = '';

    floatingPlEl.textContent = '0.00';
    floatingPlEl.className = '';
    updateMoneyUI(0);
  }

  function updateTotalProfitUI() {
    totalProfitEl.textContent = totalProfit.toFixed(2);
    totalProfitEl.className = totalProfit >= 0 ? 'profit' : 'loss';
  }

  function updateMoneyUI(floatingProfit) {
    balanceEl.textContent = balance.toFixed(2);
    const equity = balance + (Number.isFinite(floatingProfit) ? floatingProfit : 0);
    equityEl.textContent = equity.toFixed(2);
  }

  function endSimulation() {
    startBtn.disabled = true;
    buyBtn.disabled = true;
    sellBtn.disabled = true;
    if (!activeTrade) closeBtn.disabled = true;
    startBtn.textContent = 'Fim da Simulação';
  }

  // --- BINDINGS --- //
  if (restartBtn) restartBtn.addEventListener('click', restartSimulation);
  if (tryAgainBtn) tryAgainBtn.addEventListener('click', restartSimulation);

  // Inicia
  initializeApp();
});
