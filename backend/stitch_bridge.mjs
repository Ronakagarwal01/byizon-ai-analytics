import { stitch } from '@google/stitch-sdk';

let input = '';
for await (const chunk of process.stdin) input += chunk;

try {
  const spec = JSON.parse(input || '{}');
  const { projectId: existingProjectId, screenId: existingScreenId, ...designSpec } = spec;
  const prompt = `Design a polished production desktop analytics dashboard as ONE self-contained single-page HTML experience. Use a professional responsive grid, styled KPI cards, readable charts, clear visual hierarchy, consistent spacing, and a restrained multi-color palette. Include self-contained CSS wherever possible and never return an unstyled document. Never create dead links, blank routes, placeholder screens, or navigation items without working content. Omit unsupported menu items. If tabs or sidebar navigation are included, every item must switch to a populated inline section using safe JavaScript without navigating away or changing the URL. Every section must use only supplied data. ${JSON.stringify(designSpec)}. Use only the supplied KPI labels, values, aggregated chart data, and insights; do not invent metrics or numbers.`;
  let project;
  let screen;
  if (existingProjectId && existingScreenId) {
    project = stitch.project(existingProjectId);
    const current = await project.getScreen(existingScreenId);
    screen = await current.edit(prompt, 'DESKTOP');
  } else {
    const created = await stitch.callTool('create_project', { title: `Byizon ${spec.title || 'Dashboard'}` });
    const serialized = JSON.stringify(created);
    const projectId = created?.projectId || created?.id || serialized.match(/projects\/(\d+)/)?.[1] || serialized.match(/"projectId"\s*:\s*"([^"]+)"/)?.[1];
    if (!projectId) throw new Error('Stitch did not return a project ID.');
    project = stitch.project(projectId);
    screen = await project.generate(prompt, 'DESKTOP');
  }
  const htmlUrl = await screen.getHtml();
  const imageUrl = await screen.getImage();
  let html = '';
  try {
    const response = await fetch(htmlUrl);
    if (response.ok) {
      html = await response.text();
      html = html
        .replaceAll('â‚¹', '₹')
        .replaceAll('Â₹', '₹')
        .replaceAll('â€“', '-')
        .replaceAll('â€”', '-');
      const interactionRuntime = `<style>
#byizon-preview-toast{position:fixed;right:20px;bottom:20px;z-index:2147483647;max-width:340px;padding:11px 14px;color:#fff;background:#0f172a;border-radius:6px;font:600 13px/1.4 system-ui;box-shadow:0 14px 35px rgba(15,23,42,.28);opacity:0;transform:translateY(8px);pointer-events:none;transition:.2s}
#byizon-preview-toast.show{opacity:1;transform:translateY(0)}
[data-byizon-active="true"]{outline:2px solid #2563eb!important;outline-offset:2px}
</style><script>
(function(){
  var toastTimer;
  function toast(message){
    var node=document.getElementById('byizon-preview-toast');
    if(!node){node=document.createElement('div');node.id='byizon-preview-toast';document.body.appendChild(node);}
    node.textContent=message;node.classList.add('show');clearTimeout(toastTimer);
    toastTimer=setTimeout(function(){node.classList.remove('show');},2200);
  }
  function key(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
  function activate(control){
    var parent=control.closest('nav,aside,[role="navigation"]')||control.parentElement;
    if(parent) parent.querySelectorAll('[data-byizon-active]').forEach(function(item){item.removeAttribute('data-byizon-active');});
    control.setAttribute('data-byizon-active','true');
  }
  document.addEventListener('click',function(event){
    var control=event.target.closest('a,button,[role="button"]');
    if(!control)return;
    var href=(control.getAttribute('href')||'').trim();
    var external=/^https?:\\/\\//i.test(href);
    if(external)return;
    var targetId=href.charAt(0)==='#'?href.slice(1):control.getAttribute('data-target')||control.getAttribute('aria-controls')||'';
    var target=targetId?document.getElementById(targetId):null;
    if(target){event.preventDefault();activate(control);target.hidden=false;target.scrollIntoView({behavior:'smooth',block:'start'});toast((control.textContent||'Section').trim()+' opened');return;}
    var label=key(control.textContent);
    var candidate=Array.from(document.querySelectorAll('main section,main article,[data-section],[data-page]')).find(function(node){
      return key(node.id+' '+node.getAttribute('data-section')+' '+node.getAttribute('data-page')+' '+((node.querySelector('h1,h2,h3')||{}).textContent||'')).includes(label);
    });
    if(candidate&&label){event.preventDefault();activate(control);candidate.hidden=false;candidate.scrollIntoView({behavior:'smooth',block:'start'});toast((control.textContent||'Section').trim()+' opened');return;}
    if(!href||href==='#'||href==='about:blank'||href.charAt(0)==='/'||/\\.html?(?:[?#]|$)/i.test(href)){
      event.preventDefault();activate(control);toast((control.textContent||'Control').trim()+' is active in this grounded preview');
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
      html = html.includes('</body>') ? html.replace('</body>', `${interactionRuntime}</body>`) : `${html}${interactionRuntime}`;
    }
  } catch {}
  process.stdout.write(JSON.stringify({ status: 'generated', projectId: project.id, screenId: screen.id, htmlUrl, imageUrl, html }));
} catch (error) {
  process.stdout.write(JSON.stringify({ status: 'error', error: String(error?.message || error).slice(0, 500) }));
}
