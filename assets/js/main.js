// ИП Яковлев — сайт-визитка
(function () {
  "use strict";

  /* ---------- Шапка: тень при скролле ---------- */
  var header = document.querySelector(".header");
  function onScrollHeader() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  onScrollHeader();
  window.addEventListener("scroll", onScrollHeader, { passive: true });

  /* ---------- Мобильное меню ---------- */
  var burger = document.querySelector(".burger");
  var mobileMenu = document.querySelector(".mobile-menu");

  function closeMenu() {
    if (!burger || !mobileMenu) return;
    burger.classList.remove("is-open");
    mobileMenu.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  if (burger && mobileMenu) {
    burger.addEventListener("click", function () {
      var open = mobileMenu.classList.toggle("is-open");
      burger.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
    });

    mobileMenu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 860) closeMenu();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });
  }

  /* ---------- Появление блоков при скролле ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ---------- Слайдшоу в блоке «О компании» ---------- */
  var slideshows = document.querySelectorAll("[data-slideshow]");

  slideshows.forEach(function (slideshow) {
    var slides = slideshow.querySelectorAll("img");
    if (slides.length < 2) return;

    var index = 0;
    var timer = null;

    function show(nextIndex) {
      slides[index].classList.remove("is-active");
      slides[index].setAttribute("aria-hidden", "true");
      index = nextIndex;
      slides[index].classList.add("is-active");
      slides[index].removeAttribute("aria-hidden");
    }

    function start() {
      if (timer) return;
      timer = window.setInterval(function () {
        show((index + 1) % slides.length);
      }, 3000);
    }

    function stop() {
      if (!timer) return;
      window.clearInterval(timer);
      timer = null;
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
      else start();
    });

    start();
  });

  /* ---------- Фильтр портфолио ---------- */
  var filterButtons = document.querySelectorAll(".filter button");
  var galleryItems = document.querySelectorAll(".gallery__item");

  filterButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      filterButtons.forEach(function (b) { b.classList.remove("is-active"); });
      btn.classList.add("is-active");
      var filter = btn.getAttribute("data-filter");

      galleryItems.forEach(function (item) {
        var cat = item.getAttribute("data-category");
        var show = filter === "all" || cat === filter;
        item.classList.toggle("is-hidden", !show);
      });
    });
  });

  // Активируем фильтр из якоря, например projects.html#chernovaya
  if (document.querySelector(".filter") && window.location.hash) {
    var hashFilter = window.location.hash.replace("#", "");
    var target = document.querySelector(
      '.filter button[data-filter="' + hashFilter + '"]'
    );
    if (target) target.click();
  }

  /* ---------- Лайтбокс ---------- */
  var lightbox = null;

  function ensureLightbox() {
    if (lightbox) return lightbox;
    lightbox = document.createElement("div");
    lightbox.className = "lightbox";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.innerHTML =
      '<button class="lightbox__close" aria-label="Закрыть">&times;</button>' +
      '<img alt="" />' +
      '<div class="lightbox__hint">Нажмите вне изображения или Esc, чтобы закрыть</div>';
    document.body.appendChild(lightbox);

    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox || e.target.closest(".lightbox__close")) {
        closeLightbox();
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeLightbox();
    });
    return lightbox;
  }

  function openLightbox(src, alt) {
    var lb = ensureLightbox();
    var img = lb.querySelector("img");
    img.src = src;
    img.alt = alt || "";
    lb.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  galleryItems.forEach(function (item) {
    item.setAttribute("tabindex", "0");
    item.addEventListener("click", function () {
      var img = item.querySelector("img");
      openLightbox(img.getAttribute("src"), img.getAttribute("alt"));
    });
    item.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        var img = item.querySelector("img");
        openLightbox(img.getAttribute("src"), img.getAttribute("alt"));
      }
    });
  });

  /* ---------- Год в футере ---------- */
  var yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
