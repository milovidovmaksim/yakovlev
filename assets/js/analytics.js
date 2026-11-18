// Яндекс.Метрика — счётчик и цели.
// Чтобы включить аналитику, впишите номер счётчика ниже (например, 98765432).
// Пока номер не указан, скрипт ничего не делает и не грузит лишние запросы.
(function () {
  "use strict";

  var COUNTER_ID = 0;

  if (!COUNTER_ID) return;

  /* ---------- Загрузчик счётчика ---------- */
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (var j = 0; j < document.scripts.length; j++) {
      if (document.scripts[j].src === r) return;
    }
    k = e.createElement(t);
    a = e.getElementsByTagName(t)[0];
    k.async = 1;
    k.src = r;
    a.parentNode.insertBefore(k, a);
  })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

  window.ym(COUNTER_ID, "init", {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true
  });

  /* ---------- Цель: клик по любой ссылке в Max ---------- */
  document.addEventListener(
    "click",
    function (event) {
      var target = event.target;
      var link = target && target.closest ? target.closest('a[href*="max.ru"]') : null;
      if (!link) return;
      window.ym(COUNTER_ID, "reachGoal", "max_click");
    },
    true
  );
})();
