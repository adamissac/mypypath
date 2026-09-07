"""Does the footer sit at the bottom of the viewport on a short page?

Verified as broken on the deployed site: /quiz.html put its footer at y=476 in
a 900px viewport with 424px of blank white beneath it, and /certificate.html,
/404.html and /unit-test.html did the same by smaller amounts. A footer
floating mid-screen with nothing under it reads as a page that failed to finish
loading.

Kept as a script rather than a unit test because it is a fact about RENDERED
layout: the CSS looked correct in two files and was wrong in their combination
-- style.css set the sticky-footer flex column, and pypath-theme.css, which
loads after it, overrode the one declaration that made it work. No amount of
reading either file on its own would have shown that.

    python3 scripts/verify-page-layout.py
"""
import threading, http.server, socketserver, functools, json
SITE="/Users/adamissac/mypypath"; PORT=8093
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
h=socketserver.TCPServer(("127.0.0.1",PORT),functools.partial(Q,directory=SITE))
threading.Thread(target=h.serve_forever,daemon=True).start()
from playwright.sync_api import sync_playwright
B=f"http://127.0.0.1:{PORT}"
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1280,"height":900})

    # 35: footer floating on short pages
    print("=== footer position on short pages ===")
    for page in ["/quiz.html","/certificate.html","/settings.html","/unit-test.html","/404.html"]:
        pg=ctx.new_page(); pg.goto(B+page, wait_until="domcontentloaded"); pg.wait_for_timeout(1500)
        r=pg.evaluate("""() => {
          const f=document.querySelector('footer, .site-footer');
          if(!f) return {none:true};
          const rect=f.getBoundingClientRect();
          return {bottom: Math.round(rect.bottom), vh: window.innerHeight,
                  gapBelow: Math.round(window.innerHeight - rect.bottom),
                  docH: document.documentElement.scrollHeight};
        }""")
        print(f"  {page:22s} {r}")
        pg.close()

    # 32/33: trail label clipping + cross-fade
    print("=== homepage trail ===")
    pg=ctx.new_page(); pg.goto(B+"/index.html", wait_until="domcontentloaded"); pg.wait_for_timeout(2500)
    pg.mouse.click(400,300); pg.wait_for_timeout(600)
    r=pg.evaluate("""() => {
      const out={};
      const stops=[...document.querySelectorAll('[data-stop], .path-stop, .trail-stop')];
      out.stopCount=stops.length;
      const card=document.querySelector('.path-journey__map, .path-map, [data-path-journey]');
      if(card){const cb=card.getBoundingClientRect();
        out.clipped=stops.filter(s=>{const r=s.getBoundingClientRect();
          return r.right>cb.right+1 || r.left<cb.left-1;}).map(s=>s.textContent.trim().slice(0,20));}
      return out;
    }""")
    print("  ",r)
    pg.close()
    b.close()
h.shutdown()
