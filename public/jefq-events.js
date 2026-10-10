(function () {
  window.jefqDataLayer = window.jefqDataLayer || [];
  function push(name, data) {
    var payload = Object.assign({ event: name, path: location.pathname, at: new Date().toISOString() }, data || {});
    window.jefqDataLayer.push(payload);
    window.dispatchEvent(new CustomEvent('jefq:conversion', { detail: payload }));
    if (typeof window.va === 'function') {
      try { window.va('event', { name: name, data: data || {} }); } catch (e) {}
    }
  }
  document.addEventListener('click', function (event) {
    var target = event.target.closest('a,button');
    if (!target) return;
    var href = target.getAttribute('href') || '';
    var explicit = target.getAttribute('data-jefq-event');
    if (explicit) push(explicit, { label: (target.textContent || '').trim().slice(0,80), href: href });
    else if (href.indexOf('wa.me') >= 0) push('click_whatsapp', { location: location.pathname });
    else if (href.indexOf('tel:') === 0) push('click_telefono', { location: location.pathname });
    else if (href === '/valoracion' || href.indexOf('/valoracion') === 0) push('inicio_valoracion', { location: location.pathname });
    else if (href.indexOf('/informe-demostrativo') === 0) push('ver_informe_demostrativo', { location: location.pathname });
    else if (href.indexOf('/servicios/') === 0) push('ver_servicio', { href: href, location: location.pathname });
  });
  document.addEventListener('toggle', function (event) {
    if (event.target && event.target.tagName === 'DETAILS' && event.target.open) push('faq_expandida', { summary: event.target.querySelector('summary')?.textContent?.trim().slice(0,80) || '' });
  }, true);
  var sent = false;
  document.addEventListener('scroll', function () {
    if (sent) return;
    var max = document.documentElement.scrollHeight - innerHeight;
    if (max > 0 && scrollY / max >= 0.75) { sent = true; push('scroll_75', {}); }
  }, { passive: true });
  if (location.pathname === '/valoracion') push('vista_valoracion', {});
  if (location.pathname === '/informe-demostrativo') push('vista_informe', {});
})();