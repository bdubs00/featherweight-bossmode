import { describe, expect, it } from 'vitest';
import { renderMarkdown, safeHref, sanitize, stripFrontMatter } from './markdown';

/** dom parses rendered HTML, so a test can look for what must not be there. */
function dom(html: string): HTMLElement {
  const box = document.createElement('div');
  box.innerHTML = html;
  return box;
}

/** clean asserts that rendered HTML holds no script, no event, no style, and no image. */
function clean(html: string): void {
  const box = dom(html);
  for (const el of box.querySelectorAll('*')) {
    expect(['script', 'style', 'img', 'svg', 'math', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'link', 'meta', 'base', 'video', 'audio', 'source', 'picture', 'details', 'template', 'select']).not.toContain(el.localName);
    for (const a of el.attributes) {
      expect(a.name.startsWith('on')).toBe(false);
      expect(['style', 'src', 'srcset', 'xlink:href', 'action', 'formaction', 'background', 'poster', 'data', 'id', 'name']).not.toContain(a.name);
      // A dangerous address can show as text, never as an attribute.
      expect(a.value).not.toMatch(/javascript:|vbscript:|data:/i);
    }
    const href = el.getAttribute('href');
    if (href !== null) expect(href).toMatch(/^(https?:|mailto:|#pages\/)/);
  }
}

describe('renderMarkdown', () => {
  it('renders the Markdown that agents write', () => {
    const html = renderMarkdown('# Title\n\nSome **bold** and `code`.\n\n- one\n- two\n\n```yaml\nkey: v\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    const box = dom(html);
    expect(box.querySelector('h1')!.textContent).toBe('Title');
    expect(box.querySelector('strong')!.textContent).toBe('bold');
    expect(box.querySelectorAll('li')).toHaveLength(2);
    expect(box.querySelector('pre code')!.className).toBe('language-yaml');
    expect(box.querySelector('table td')!.textContent).toBe('1');
    clean(html);
  });

  it('shows raw HTML as text', () => {
    const html = renderMarkdown('Hello <b onclick="x()">there</b>\n\n<div style="position:fixed">overlay</div>');
    expect(dom(html).querySelector('b')).toBeNull();
    expect(dom(html).textContent).toContain('<b onclick="x()">there</b>');
    clean(html);
  });

  const hostile: [string, string][] = [
    ['a script tag', '<script>alert(1)</script>'],
    ['an image with onerror', '<img src=x onerror=alert(1)>'],
    ['a Markdown image from another origin', '![tracker](https://evil.example/pixel.png)'],
    ['a javascript link', '[click](javascript:alert(1))'],
    ['an encoded javascript link', '[click](&#106;avascript:alert(1))'],
    ['a javascript link with a tab', '[click](java\tscript:alert(1))'],
    ['a data link', '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'],
    ['a vbscript link', '[x](vbscript:msgbox(1))'],
    ['an inline SVG', '<svg onload=alert(1)><circle r=4 /></svg>'],
    ['an iframe', '<iframe src="https://evil.example"></iframe>'],
    ['a style element', '<style>body{display:none}</style>'],
    ['a form', '<form action="https://evil.example"><input name=p></form>'],
    ['a details toggle', '<details open ontoggle=alert(1)>x</details>'],
    ['a mutation of math', '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>'],
    ['a link title that breaks out', '[x](https://ok.example "a\\" onmouseover=\\"alert(1)")'],
    ['an autolink to javascript', '<javascript:alert(1)>'],
    ['a reference link to javascript', '[x][r]\n\n[r]: javascript:alert(1)'],
    ['a code span that holds a tag', '`<img src=x onerror=alert(1)>`'],
    ['a base tag', '<base href="https://evil.example/">'],
    ['a meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.example">'],
  ];

  for (const [name, text] of hostile) {
    it('keeps no attack in ' + name, () => {
      clean(renderMarkdown(text));
    });
  }

  it('keeps the text of an image as a link and loads nothing', () => {
    const box = dom(renderMarkdown('![a chart](https://evil.example/chart.png)'));
    expect(box.querySelector('img')).toBeNull();
    const a = box.querySelector('a')!;
    expect(a.textContent).toBe('Image: a chart');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(a.getAttribute('target')).toBe('_blank');
  });

  it('turns a relative link to a page into a link of the wiki in the page', () => {
    const box = dom(renderMarkdown('[learned](learned.md) and [index](../../index.md) and [api](/v1/bridges)', { base: 'agents/reviewer/notes.md' }));
    const links = [...box.querySelectorAll('a')];
    expect(links[0].getAttribute('href')).toBe('#pages/agents/reviewer/learned.md');
    expect(links[1].getAttribute('href')).toBe('#pages/index.md');
    expect(links[2].hasAttribute('href')).toBe(false);
  });

  it('marks the mentions of the roster, outside code', () => {
    const box = dom(renderMarkdown('@reviewer look, and `@reviewer` stays, @nobody too', { handles: ['reviewer'] }));
    const m = box.querySelectorAll('span.mention');
    expect(m).toHaveLength(1);
    expect(m[0].textContent).toBe('@reviewer');
    expect(box.querySelector('code')!.textContent).toBe('@reviewer');
  });

  it('keeps only the classes of the page', () => {
    const html = sanitize('<span class="mention evil">a</span><code class="language-go x">b</code><p class="overlay">c</p>');
    const box = dom(html);
    expect(box.querySelector('span')!.className).toBe('mention');
    expect(box.querySelector('code')!.className).toBe('language-go');
    expect(box.querySelector('p')!.hasAttribute('class')).toBe(false);
  });
});

describe('safeHref', () => {
  it('keeps http, https, and mailto, and drops the rest', () => {
    expect(safeHref('https://example.com/a')).toEqual({ href: 'https://example.com/a', external: true });
    expect(safeHref('mailto:a@example.com')).toEqual({ href: 'mailto:a@example.com', external: false });
    expect(safeHref('#top')).toBeNull();
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeHref(' \njavascript:alert(1)')).toBeNull();
    expect(safeHref('//evil.example/x')).toEqual({ href: 'https://evil.example/x', external: true });
    expect(safeHref('ftp://example.com')).toBeNull();
  });
});

describe('stripFrontMatter', () => {
  it('reads the title and the tags', () => {
    const r = stripFrontMatter('---\ntitle: "Cron module"\ntags: [puppet, ansible]\n---\n# Body\n');
    expect(r).toEqual({ body: '# Body\n', title: 'Cron module', tags: ['puppet', 'ansible'] });
    expect(stripFrontMatter('# No front matter').title).toBe('');
  });
});
