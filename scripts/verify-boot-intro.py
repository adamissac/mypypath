"""The homepage boot intro: capped, skippable, once per session, never forced.

The bug this guards. The cover is painted by an inline script before first
paint; the skip listeners used to be attached by motion.js, one of forty-odd
scripts on the page. Between those two moments there was a black screen with no
way out -- clicking did nothing, scrolling did nothing -- and only a 5500ms
watchdog ended it. Measured on the deployed site at ~7 seconds against a dclMs
of 208.
"""
import threading, http.server, socketserver, functools, sys
SITE="/Users/adamissac/mypypath"; PORT=8095
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
h=socketserver.TCPServer(("127.0.0.1",PORT),functools.partial(Q,directory=SITE))
threading.Thread(target=h.serve_forever,daemon=True).start()
from playwright.sync_api import sync_playwright
U=f"http://127.0.0.1:{PORT}/index.html"
fails=[]

def clear_ms(pg):
    """Milliseconds until the cover is gone, measured in the page."""
    return pg.evaluate("""() => new Promise(r=>{
        const t0=performance.now();
        if(!document.documentElement.classList.contains('pp-boot')) return r(0);
        (function chk(){
          if(!document.documentElement.classList.contains('pp-boot')) return r(performance.now()-t0);
          requestAnimationFrame(chk);
        })();
        setTimeout(()=>r(-1), 12000);})""")

with sync_playwright() as p:
    b=p.chromium.launch()

    # 1. Fresh tab, untouched: plays, then leaves on its own well inside 2s.
    ctx=b.new_context(); pg=ctx.new_page(); pg.goto(U, wait_until="commit")
    played = pg.evaluate("document.documentElement.classList.contains('pp-boot')")
    t = clear_ms(pg)
    print(f"fresh tab, untouched  : played={played}  cleared at {t:.0f}ms")
    if not played: fails.append("the intro did not play at all on a fresh open")
    if t < 0 or t > 2200: fails.append(f"cap not honoured: {t:.0f}ms")

    # 2. Reload the SAME tab. sessionStorage is per-tab, so this is the real
    #    "same session" test -- a new tab is a new session by spec.
    pg.reload(wait_until="commit")
    again = pg.evaluate("document.documentElement.classList.contains('pp-boot')")
    print(f"reload, same session  : played={again}")
    if again: fails.append("replayed on reload within the same session")
    ctx.close()

    # 3. Scroll must skip it, and must do so BEFORE motion.js has loaded.
    ctx=b.new_context(); pg=ctx.new_page(); pg.goto(U, wait_until="commit")
    pg.wait_for_timeout(60); pg.mouse.wheel(0,400)
    t3=clear_ms(pg); print(f"wheel at 60ms         : cleared at {t3:.0f}ms")
    if t3 > 500: fails.append(f"wheel did not skip promptly: {t3:.0f}ms")
    ctx.close()

    # 4. Click must skip it.
    ctx=b.new_context(); pg=ctx.new_page(); pg.goto(U, wait_until="commit")
    pg.wait_for_timeout(60); pg.mouse.click(400,300)
    t4=clear_ms(pg); print(f"click at 60ms         : cleared at {t4:.0f}ms")
    if t4 > 500: fails.append(f"click did not skip promptly: {t4:.0f}ms")
    ctx.close()

    # 5. A key must skip it.
    ctx=b.new_context(); pg=ctx.new_page(); pg.goto(U, wait_until="commit")
    pg.wait_for_timeout(60); pg.keyboard.press("Escape")
    t5=clear_ms(pg); print(f"keypress at 60ms      : cleared at {t5:.0f}ms")
    if t5 > 500: fails.append(f"keypress did not skip promptly: {t5:.0f}ms")
    ctx.close()

    # 6. Reduced motion never sees it.
    ctx=b.new_context(reduced_motion="reduce"); pg=ctx.new_page()
    pg.goto(U, wait_until="commit"); pg.wait_for_timeout(250)
    boot=pg.evaluate("document.documentElement.classList.contains('pp-boot')")
    print(f"reduced motion        : played={boot}")
    if boot: fails.append("a reduced-motion visitor got the boot animation")
    b.close()
h.shutdown()

print()
if fails:
    print("FAIL"); [print("  -",f) for f in fails]; sys.exit(1)
print("PASS: capped, skippable before motion.js loads, once per session, never on reduced motion")
