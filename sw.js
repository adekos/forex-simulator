<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no, minimum-scale=1, maximum-scale=1" />
  <title>Simulador Forex</title>

  <!-- PWA: Manifesto e ícones -->
  <link rel="manifest" href="/manifest.json" />
  <link rel="apple-touch-icon" href="/icons/icon-192.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="theme-color" content="#131722" />

  <!-- Estilos locais -->
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <h1>Simulador de Trading Forex</h1>

  <div class="app-container">
    <!-- Abas -->
    <div class="tabs">
      <button class="tab-btn active" data-tab="dashboard">Painel</button>
      <button class="tab-btn" data-tab="accounts">Contas</button>
    </div>

    <!-- Painel principal -->
    <div class="tab-content active" id="tab-dashboard">
      <!-- BOTÕES DE CONTROLE MOVEM-SE PARA CIMA -->
      <div id="controls">
        <button id="start-btn">Iniciar Simulação</button>
        <button id="buy-btn" disabled>Comprar (BUY)</button>
        <button id="sell-btn" disabled>Vender (SELL)</button>
        <button id="close-btn" disabled>Fechar Ordem</button>
        <button id="restart-btn">Recomeçar</button>
      </div>

      <div id="chart-container" class="chart-responsive">
        <!-- Gráfico renderiza aqui -->
      </div>

      <!-- PAINEL DE STATUS MOVE-SE PARA BAIXO -->
      <div id="status">
        <p>Saldo: <span id="balance">10000.00</span></p>
        <p>Lucro Acumulado: <span id="total-profit">0.00</span></p>
        <p>Operação Aberta: <span id="current-trade">Nenhuma</span></p>
        <p>P/L Flutuante: <span id="floating-pl">0.00</span></p>
        <p>Equity: <span id="equity">10000.00</span></p>
      </div>

      <div id="recent-box">
        <h3>Últimas negociações</h3>
        <div id="recent-trades"></div>
      </div>
    </div>

    <!-- Aba de Contas -->
    <div class="tab-content" id="tab-accounts">
      <h3>Resumo por Conta</h3>
      <div id="accounts-summary"></div>
      <div id="accounts-list"></div>
    </div>
  </div>

  <!-- Overlay de Game Over -->
  <div id="game-over" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.85); color:#fff; align-items:center; justify-content:center; flex-direction:column; z-index:1000; gap:16px; padding:24px; text-align:center;">
    <h2>Game Over</h2>
    <p id="game-over-reason">Sua conta chegou a zero.</p>
    <button id="try-again-btn">Tentar novamente</button>
  </div>

  <!-- Biblioteca de gráficos local (armazene o arquivo em /vendor) -->
  <script src="/vendor/lightweight-charts.standalone.production.js"></script>

  <!-- Script principal -->
  <script src="/app.js"></script>

  <!-- Registro do Service Worker para PWA -->
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(console.error);
      });
    }
  </script>

  <noscript>Ative o JavaScript para usar o simulador.</noscript>
</body>
</html>
