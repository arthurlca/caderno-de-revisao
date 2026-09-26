// Registro do service worker, separado do app de propósito: se algum módulo do app
// tiver um erro, este script ainda roda e consegue baixar a versão corrigida.
// Sem imports para não depender de nenhum outro arquivo.

(function () {
  if (!('serviceWorker' in navigator)) return; // ex.: http:// fora do localhost

  var hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController) return; // primeira instalação, nada para atualizar
    // O app pode adiar a recarga (ex.: no meio de uma revisão)
    if (typeof window.__onAppUpdate === 'function' && window.__onAppUpdate() === 'defer') return;
    location.reload();
  });

  navigator.serviceWorker.register('./sw.js').then(function (reg) {
    // No iOS o app volta do segundo plano sem recarregar: verifica atualização ao reabrir
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') reg.update().catch(function () {});
    });
  }).catch(function (err) { console.warn('Service worker não registrado:', err); });
})();
