const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.resolve(__dirname, '../docs/invitation-screenshots/rev4');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function run() {
  const targetsRes = await fetch('http://localhost:9222/json');
  const targets = await targetsRes.json();
  const pageTarget = targets.find(t => t.type === 'page' && t.url.includes('/invitation/preview')) || targets.find(t => t.type === 'page');

  if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
    throw new Error('No page target with webSocketDebuggerUrl found');
  }

  const ws = new globalThis.WebSocket(pageTarget.webSocketDebuggerUrl);

  let id = 1;
  const callbacks = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && callbacks.has(msg.id)) {
      const cb = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      if (msg.error) cb.reject(new Error(JSON.stringify(msg.error)));
      else cb.resolve(msg.result);
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      callbacks.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  // Set device emulation to 390x844 with DPR 2, mobile: true
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
    fitWindow: false,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });

  // Navigate to /invitation/preview
  await send('Page.navigate', { url: 'http://localhost:3000/invitation/preview' });
  await new Promise(r => setTimeout(r, 2000));

  async function evaluate(code) {
    const res = await send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      console.error('Eval error:', res.exceptionDetails);
    }
    return res.result ? res.result.value : null;
  }

  const templates = [
    { id: 'gala-editorial', category: 'gala', name: 'gala_editorial' },
    { id: 'gala-black-tie', category: 'gala', name: 'black_tie' },
    { id: 'wedding-romantic', category: 'wedding', name: 'wedding' },
    { id: 'birthday-bold', category: 'birthday', name: 'birthday' },
  ];

  const languages = ['en', 'fr'];
  const scenarios = [
    { key: 'full', scenarioParam: 'default', guest: 'standard', scrollTo: 'top' },
    { key: 'no_hero', scenarioParam: 'no_hero', guest: 'standard', scrollTo: 'top' },
    { key: 'vip', scenarioParam: 'default', guest: 'vip', scrollTo: 'top' },
    { key: 'pass', scenarioParam: 'default', guest: 'standard', scrollTo: 'rsvp' },
  ];

  for (const lang of languages) {
    for (const tmpl of templates) {
      for (const scn of scenarios) {
        console.log(`Capturing [${lang.toUpperCase()}] ${tmpl.name} - ${scn.key}...`);

        // Set state in preview page via DOM interaction
        await evaluate(`
          (function() {
            // Find and click language button
            const langButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim().toUpperCase() === '${lang.toUpperCase()}');
            if (langButtons.length > 0) langButtons[0].click();

            // Set Category
            const selects = Array.from(document.querySelectorAll('select'));
            for (const sel of selects) {
              const opts = Array.from(sel.options).map(o => o.value);
              if (opts.includes('${tmpl.category}')) {
                sel.value = '${tmpl.category}';
                sel.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          })()
        `);

        await new Promise(r => setTimeout(r, 300));

        await evaluate(`
          (function() {
            // Set Template, Scenario, Guest
            const selects = Array.from(document.querySelectorAll('select'));
            for (const sel of selects) {
              const opts = Array.from(sel.options).map(o => o.value);
              if (opts.includes('${tmpl.id}')) {
                sel.value = '${tmpl.id}';
                sel.dispatchEvent(new Event('change', { bubbles: true }));
              }
              if (opts.includes('${scn.scenarioParam}')) {
                sel.value = '${scn.scenarioParam}';
                sel.dispatchEvent(new Event('change', { bubbles: true }));
              }
              if (opts.includes('${scn.guest}')) {
                sel.value = '${scn.guest}';
                sel.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          })()
        `);

        // Wait for render
        await new Promise(r => setTimeout(r, 600));

        // Scroll
        if (scn.scrollTo === 'rsvp') {
          await evaluate(`
            (function() {
              const rsvp = document.getElementById('rsvp-section') || document.querySelector('section[aria-label*="RSVP"]') || document.querySelector('section[aria-label*="Pass"]');
              if (rsvp) {
                rsvp.scrollIntoView({ behavior: 'instant', block: 'start' });
              } else {
                window.scrollTo(0, document.body.scrollHeight * 0.75);
              }
            })()
          `);
        } else {
          await evaluate(`window.scrollTo(0, 0);`);
        }

        await new Promise(r => setTimeout(r, 600));

        // Capture screenshot of viewport
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        const fileName = `${tmpl.name}_${scn.key}_${lang}.png`;
        const filePath = path.join(OUTPUT_DIR, fileName);
        fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
        console.log(` Saved ${fileName}`);
      }
    }
  }

  console.log('All 32 screenshots captured successfully in docs/invitation-screenshots/rev4/');
  ws.close();
}

run().catch(err => {
  console.error('Fatal screenshot runner error:', err);
  process.exit(1);
});
