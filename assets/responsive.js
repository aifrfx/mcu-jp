'use strict';

(() => {
  const STYLE_ID = 'mcu-responsive-multi-device-style';
  const SWITCHER_ID = 'mcu-mobile-view-switcher';
  const BASE_PAGE_WIDTH = 793.7008;   // 210 mm at 96 dpi
  const BASE_PAGE_HEIGHT = 1122.5197; // 297 mm at 96 dpi
  let resizeTimer = 0;
  let resizeObserver = null;

  const css = String.raw`
    html{scroll-behavior:smooth;max-width:100%;overflow-x:hidden}
    body{max-width:100%;overflow-x:hidden}
    .app-shell,.form-panel,.preview-panel{min-width:0}
    .form-panel,.preview-panel{overscroll-behavior:contain}
    input,select,textarea,button{max-width:100%}
    textarea{overflow-wrap:anywhere}

    .responsive-page-shell{
      position:relative;
      flex:0 0 auto;
      margin:0 auto;
      overflow:visible;
      transition:width .16s ease,height .16s ease;
    }
    .responsive-page-shell>.page{
      margin:0!important;
      transform-origin:top left!important;
      transition:transform .16s ease,box-shadow .2s ease;
    }

    .mcu-mobile-view-switcher{
      display:none;
      position:sticky;
      top:0;
      z-index:1000;
      width:100%;
      padding:7px 10px;
      gap:7px;
      background:rgba(247,251,252,.96);
      border-bottom:1px solid #d7e2e7;
      box-shadow:0 7px 18px rgba(34,54,68,.08);
      backdrop-filter:blur(16px);
    }
    .mcu-mobile-view-switcher button{
      flex:1;
      min-height:42px;
      border:1px solid #c7d8df;
      border-radius:10px;
      background:#fff;
      color:#36505c;
      font-weight:750;
      font-size:12px;
      cursor:pointer;
    }
    .mcu-mobile-view-switcher button.active{
      color:#fff;
      border-color:#0f5f68;
      background:linear-gradient(135deg,#0f5f68,#19717a);
      box-shadow:0 6px 14px rgba(15,95,104,.2);
    }

    /* Toolbar tetap terlihat tanpa perhitungan posisi sidebar yang kaku. */
    @media screen{
      .annotation-toolbar{
        position:sticky!important;
        left:auto!important;
        top:68px!important;
        width:min(var(--page-w),100%)!important;
        z-index:140!important;
      }
      .preview-panel{padding-top:20px!important}
    }

    /* Laptop kecil dan tablet landscape */
    @media (min-width:901px) and (max-width:1279px){
      .app-shell{
        grid-template-columns:clamp(340px,36vw,410px) minmax(0,1fr)!important;
      }
      .form-panel{
        width:auto!important;
        padding-left:13px!important;
        padding-right:13px!important;
      }
      .bottom-actions{
        width:clamp(340px,36vw,410px)!important;
        padding-left:13px!important;
        padding-right:13px!important;
      }
      .preview-panel{
        min-width:0!important;
        padding-left:14px!important;
        padding-right:14px!important;
        align-items:center!important;
      }
      .preview-topbar,.annotation-toolbar,.print-note{
        width:100%!important;
        max-width:793.7008px!important;
      }
      .panel-header{padding:20px 16px 17px!important}
      .panel-header h1{font-size:19px!important}
      .grid.three{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .scan-options{grid-template-columns:1fr!important}
      .scan-options .scan-check{padding-top:0!important}
    }

    /* Tablet portrait dan ponsel */
    @media (max-width:900px){
      .mcu-mobile-view-switcher{display:flex}
      .app-shell{
        display:block!important;
        width:100%!important;
        min-height:0!important;
      }
      .form-panel{
        position:relative!important;
        top:auto!important;
        width:100%!important;
        height:auto!important;
        max-height:none!important;
        overflow:visible!important;
        border-right:0!important;
        padding:0 14px 24px!important;
      }
      .panel-header{
        margin:0 -14px 14px!important;
        padding:20px 17px 17px!important;
      }
      .brand-mark{width:42px!important;height:42px!important;flex-basis:42px!important}
      .panel-header h1{font-size:20px!important}
      .feature-chips{margin-top:12px!important}

      .bottom-actions{
        position:sticky!important;
        left:auto!important;
        bottom:0!important;
        width:calc(100% + 28px)!important;
        margin:12px -14px -24px!important;
        padding:10px 14px calc(10px + env(safe-area-inset-bottom))!important;
        z-index:800!important;
        grid-template-columns:repeat(2,minmax(0,1fr))!important;
      }
      .bottom-actions #btnExportWord{grid-column:1/-1!important}
      .bottom-actions .btn{min-height:44px!important}

      .preview-panel{
        width:100%!important;
        height:auto!important;
        max-height:none!important;
        overflow:visible!important;
        padding:12px 8px 36px!important;
        gap:14px!important;
        align-items:center!important;
      }
      .preview-topbar{
        position:sticky!important;
        top:56px!important;
        width:100%!important;
        max-width:none!important;
        z-index:150!important;
        padding:9px 10px!important;
      }
      .annotation-toolbar{
        top:118px!important;
        width:100%!important;
        max-width:none!important;
        flex-direction:column!important;
        align-items:stretch!important;
        gap:8px!important;
        padding:9px 10px!important;
      }
      .annotation-actions{
        width:100%!important;
        display:grid!important;
        grid-template-columns:repeat(3,minmax(0,1fr))!important;
        gap:6px!important;
      }
      .annotation-actions .btn{min-height:38px!important;white-space:normal!important}
      .print-note{width:100%!important;max-width:none!important;margin-top:-6px!important}

      .grid.three{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .scan-options{grid-template-columns:1fr!important}
      .scan-options .scan-check{padding-top:0!important}
      .scan-actions{grid-template-columns:minmax(0,1fr) auto!important}
      .gemini-config{grid-template-columns:1fr!important}
      .batch-results-head,.scan-summary{align-items:flex-start!important;flex-direction:column!important}
      .batch-results-head .btn,.scan-summary .btn{width:100%!important}

      #mcuForm summary{min-height:50px!important}
      select,input[type=text],input[type=number],input[type=date],input[type=file],textarea{
        min-height:42px!important;
        font-size:16px!important; /* mencegah auto zoom iOS */
      }
      textarea{min-height:72px!important}
      .btn{min-height:42px!important}
    }

    /* Ponsel */
    @media (max-width:600px){
      .form-panel{padding-left:10px!important;padding-right:10px!important}
      .panel-header{margin-left:-10px!important;margin-right:-10px!important}
      .bottom-actions{width:calc(100% + 20px)!important;margin-left:-10px!important;margin-right:-10px!important;padding-left:10px!important;padding-right:10px!important}
      .grid.two,.grid.three{grid-template-columns:1fr!important}
      .record-row{flex-wrap:wrap!important}
      .record-row>select{flex-basis:100%!important}
      .record-row.compact .btn{min-width:calc(50% - 4px)!important}
      .scan-heading{flex-direction:column!important}
      .scan-badge{align-self:flex-start!important}
      .scan-actions{grid-template-columns:1fr!important}
      .scan-actions .btn{width:100%!important}
      .preview-heading span{display:none!important}
      .preview-topbar{align-items:center!important;flex-direction:row!important;gap:8px!important}
      .page-navigation{margin-left:auto!important;min-width:126px!important}
      .annotation-toolbar>div:first-child span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .annotation-actions .btn{padding:6px 4px!important;font-size:10px!important}
      .summary-hint{display:none!important}
      .section-body{padding:10px!important}
    }

    /* Ponsel sangat kecil */
    @media (max-width:380px){
      .brand-copy p{font-size:10.5px!important}
      .feature-chips span{font-size:9px!important}
      .bottom-actions{grid-template-columns:1fr!important}
      .bottom-actions #btnExportWord{grid-column:auto!important}
      .record-row.compact .btn{min-width:100%!important}
      .page-nav-btn{min-width:34px!important}
    }

    /* Mode landscape dengan tinggi terbatas */
    @media (max-width:900px) and (orientation:landscape) and (max-height:600px){
      .mcu-mobile-view-switcher{position:relative!important}
      .preview-topbar{top:0!important}
      .annotation-toolbar{top:61px!important}
      .bottom-actions{position:relative!important}
    }

    @media print{
      .mcu-mobile-view-switcher{display:none!important}
      .responsive-page-shell{
        width:210mm!important;
        height:297mm!important;
        margin:0!important;
        overflow:visible!important;
        page-break-after:always!important;
        break-after:page!important;
      }
      .responsive-page-shell:last-child{page-break-after:auto!important;break-after:auto!important}
      .responsive-page-shell>.page{transform:none!important}
      .preview-panel{padding:0!important;gap:0!important}
    }
  `;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function createMobileSwitcher() {
    if (document.getElementById(SWITCHER_ID)) return;
    const switcher = document.createElement('nav');
    switcher.id = SWITCHER_ID;
    switcher.className = 'mcu-mobile-view-switcher';
    switcher.setAttribute('aria-label', 'Navigasi tampilan');
    switcher.innerHTML = `
      <button type="button" data-responsive-target="form" class="active">Formulir</button>
      <button type="button" data-responsive-target="preview">Pratinjau</button>
    `;
    document.body.insertBefore(switcher, document.body.firstChild);

    switcher.addEventListener('click', (event) => {
      const button = event.target.closest('[data-responsive-target]');
      if (!button) return;
      const target = button.dataset.responsiveTarget === 'preview'
        ? document.querySelector('.preview-panel')
        : document.querySelector('.form-panel');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      switcher.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
    });

    if ('IntersectionObserver' in window) {
      const sections = [document.querySelector('.form-panel'), document.querySelector('.preview-panel')].filter(Boolean);
      const observer = new IntersectionObserver((entries) => {
        if (window.innerWidth > 900) return;
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const targetName = visible.target.classList.contains('preview-panel') ? 'preview' : 'form';
        switcher.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item.dataset.responsiveTarget === targetName));
      }, { root: null, threshold: [0.08, 0.25, 0.5] });
      sections.forEach((section) => observer.observe(section));
    }
  }

  function wrapPages() {
    document.querySelectorAll('.page').forEach((page) => {
      if (page.parentElement?.classList.contains('responsive-page-shell')) return;
      const shell = document.createElement('div');
      shell.className = 'responsive-page-shell';
      shell.dataset.pageId = page.id || '';
      page.parentNode.insertBefore(shell, page);
      shell.appendChild(page);
    });
  }

  function getAvailablePageWidth() {
    const preview = document.querySelector('.preview-panel');
    if (!preview) return BASE_PAGE_WIDTH;
    const style = getComputedStyle(preview);
    const horizontalPadding = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
    return Math.max(260, preview.clientWidth - horizontalPadding - 4);
  }

  function updatePageScale() {
    const available = getAvailablePageWidth();
    const scale = Math.min(1, available / BASE_PAGE_WIDTH);
    document.documentElement.style.setProperty('--mcu-page-scale', scale.toFixed(5));

    document.querySelectorAll('.responsive-page-shell').forEach((shell) => {
      shell.style.width = `${BASE_PAGE_WIDTH * scale}px`;
      shell.style.height = `${BASE_PAGE_HEIGHT * scale}px`;
      const page = shell.querySelector(':scope > .page');
      if (page) page.style.transform = `scale(${scale})`;
    });
  }

  function setDeviceClass() {
    const width = window.innerWidth;
    document.body.classList.toggle('mcu-device-mobile', width <= 600);
    document.body.classList.toggle('mcu-device-tablet', width > 600 && width <= 1024);
    document.body.classList.toggle('mcu-device-desktop', width > 1024);
  }

  function scheduleResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      setDeviceClass();
      updatePageScale();
    }, 50);
  }

  function init() {
    injectStyle();
    createMobileSwitcher();
    wrapPages();
    setDeviceClass();
    updatePageScale();

    window.addEventListener('resize', scheduleResize, { passive: true });
    window.addEventListener('orientationchange', () => window.setTimeout(scheduleResize, 120), { passive: true });
    window.addEventListener('beforeprint', () => document.documentElement.style.setProperty('--mcu-page-scale', '1'));
    window.addEventListener('afterprint', scheduleResize);

    const preview = document.querySelector('.preview-panel');
    if (preview && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(scheduleResize);
      resizeObserver.observe(preview);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
