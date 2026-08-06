const PREVIEW_RUNTIME = `
<style id="byizon-preview-runtime-style">
#byizon-runtime-toast{position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:340px;padding:10px 13px;color:#fff;background:#0f172a;border-radius:6px;font:600 12px/1.4 system-ui;box-shadow:0 14px 34px rgba(15,23,42,.26);opacity:0;transform:translateY(8px);pointer-events:none;transition:.2s}
#byizon-runtime-toast.show{opacity:1;transform:translateY(0)}
[data-byizon-active="true"]{outline:2px solid #2563eb!important;outline-offset:2px}
</style>
<script id="byizon-preview-runtime">
(function(){
  if(window.__byizonPreviewReady)return;
  window.__byizonPreviewReady=true;
  var timer;
  function key(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
  function toast(message){
    var node=document.getElementById('byizon-runtime-toast');
    if(!node){node=document.createElement('div');node.id='byizon-runtime-toast';document.body.appendChild(node);}
    node.textContent=message;node.classList.add('show');clearTimeout(timer);
    timer=setTimeout(function(){node.classList.remove('show');},2200);
  }
  function activate(control){
    var group=control.closest('nav,aside,[role="navigation"]')||control.parentElement;
    if(group)group.querySelectorAll('[data-byizon-active]').forEach(function(item){item.removeAttribute('data-byizon-active');});
    control.setAttribute('data-byizon-active','true');
  }
  document.addEventListener('click',function(event){
    var control=event.target.closest('a,button,[role="button"]');
    if(!control)return;
    var href=(control.getAttribute('href')||'').trim();
    if(/^https?:\\/\\//i.test(href))return;
    var targetId=href.charAt(0)==='#'?href.slice(1):control.getAttribute('data-target')||control.getAttribute('aria-controls')||'';
    var target=targetId?document.getElementById(targetId):null;
    var label=key(control.textContent);
    if(!target&&label){
      target=Array.from(document.querySelectorAll('main section,main article,[data-section],[data-page]')).find(function(node){
        var heading=node.querySelector('h1,h2,h3');
        return key(node.id+' '+node.getAttribute('data-section')+' '+node.getAttribute('data-page')+' '+(heading?heading.textContent:'')).includes(label);
      });
    }
    if(target){
      event.preventDefault();activate(control);target.hidden=false;
      target.scrollIntoView({behavior:'smooth',block:'start'});
      toast((control.textContent||'Section').trim()+' opened');
      return;
    }
    if(!href||href==='#'||href==='about:blank'||href.charAt(0)==='/'||/\\.html?(?:[?#]|$)/i.test(href)){
      event.preventDefault();activate(control);
      toast((control.textContent||'Control').trim()+' selected. No unsupported blank page was opened.');
    }
  },true);
  document.querySelectorAll('input[type="search"],input[placeholder*="search" i]').forEach(function(input){
    input.addEventListener('input',function(){
      var term=key(input.value);
      document.querySelectorAll('main article,main [class*="card"]').forEach(function(card){
        card.style.display=!term||key(card.textContent).includes(term)?'':'none';
      });
    });
  });
})();
</script>`;

export function enhanceStitchHtml(html) {
  const source = String(html || '');
  if (!source || source.includes('id="byizon-preview-runtime"')) return source;
  return source.includes('</body>')
    ? source.replace('</body>', `${PREVIEW_RUNTIME}</body>`)
    : `${source}${PREVIEW_RUNTIME}`;
}
