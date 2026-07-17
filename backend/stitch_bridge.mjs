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
      const navigationGuard = `<script>
document.addEventListener('click', function (event) {
  const link = event.target.closest('a');
  if (!link) return;
  const href = (link.getAttribute('href') || '').trim();
  const unsupported = !href || href === '#' || href === 'about:blank' || href.startsWith('/') || /^[^#]+\\.html?(?:[?#]|$)/i.test(href);
  if (unsupported) event.preventDefault();
}, true);
</script>`;
      html = html.includes('</body>') ? html.replace('</body>', `${navigationGuard}</body>`) : `${html}${navigationGuard}`;
    }
  } catch {}
  process.stdout.write(JSON.stringify({ status: 'generated', projectId: project.id, screenId: screen.id, htmlUrl, imageUrl, html }));
} catch (error) {
  process.stdout.write(JSON.stringify({ status: 'error', error: String(error?.message || error).slice(0, 500) }));
}
