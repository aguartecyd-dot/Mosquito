/* ==========================================================================
       Project Details & Metadata (Based on Research Paper)
       ========================================================================== */
    const PROJECT = {
      team: [
        'Jed Blake Juanga Batac (Student Researcher)',
        'Aze Rianne Jabagat Calzado (Student Researcher)',
        'Allyssa Faye Limco Gulmatico (Student Researcher)',
        'Ioan Khin Abaracoso Lucio (Student Researcher)',
        'Kei Brian Anwique Sison (Student Researcher)',
        'Gwyneth Zoe Soledad Yasay (Student Researcher)'
      ],
      adviser: 'Sir J Marie Alvin Torres',
      institution: 'Ramon Torres National High School, Brgy. Balingasag, Bago City, Negros Occidental',
      timeline: [
        ['Consultation with Sir Torres', 'July 20, 2026'],
        ['Follow-up Consultations', 'August 7–8, 2026'],
        ['Finalization of Title', 'September 4, 2026'],
        ['Drafting of Research Proposal', 'September 5–7, 2026'],
        ['Peer Review', 'September 8, 2026'],
        ['Conducting Study & Data Collection', '4th Week of Sept – Nov 2026'],
        ['Finalization of Research Paper', '1st Week of December 2026']
      ]
    };

    const $ = selector => document.querySelector(selector);

    /* ==========================================================================
       Model Configurations & Random Number Generator
       ========================================================================== */
    function rng(seed) {
      return () => {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }

    const G = 40;        // Grid dimensions (40x40)
    const K = 1500;      // Mosquito carrying capacity
    const BITE = 0.6;    // Base biting attempt rate
    const RECOVER = 7;   // Human recovery days

    const GROUPS = [
      [
        'Populations',
        [
          ['humans', 'Human agents', 10, 500, 10, 100],
          ['wild', 'Wild mosquitoes', 10, 600, 10, 150],
          ['sterile', 'Sterile males per release', 0, 1500, 10, 300]
        ]
      ],
      [
        'Rates and probabilities',
        [
          ['pInf', 'Infection probability per bite', 0, 1, 0.01, 0.35],
          ['repro', 'Offspring per successful mating', 0.5, 5, 0.1, 2],
          ['move', 'Mosquito movement probability', 0, 1, 0.05, 0.6],
          ['life', 'Mosquito lifespan (days)', 5, 40, 1, 14],
          ['mort', 'Natural daily mortality', 0, 0.15, 0.005, 0.02]
        ]
      ],
      [
        'Time and release',
        [
          ['days', 'Simulated days', 5, 120, 1, 30],
          ['interval', 'Release every N days (0 = once)', 0, 14, 1, 3],
          ['seed', 'Random seed', 1, 9999, 1, 7]
        ]
      ]
    ];

    /* ==========================================================================
       Simulation Engine Class (Agent-Based Model)
       ========================================================================== */
    class Sim {
      constructor(params, enableIntervention, seed) {
        this.P = params;
        this.on = enableIntervention;
        this.r = rng(seed);
        this.day = 0;
        this.ev = [];
        this.h = [];
        this.m = [];
        this.cum = 0;
        this.rows = [];

        const R = this.r;
        const ri = n => Math.floor(R() * n);
        this.ri = ri;

        // Initialize human agents
        const seeds = Math.max(2, Math.round(params.humans * 0.05));
        for (let i = 0; i < params.humans; i++) {
          this.h.push({
            x: ri(G),
            y: ri(G),
            s: i < seeds ? 1 : 0, // 0: susceptible, 1: infected, 2: recovered
            t: 0
          });
        }

        // Initialize wild mosquitoes
        for (let i = 0; i < params.wild; i++) {
          const f = i % 2 === 0; // 50/50 sex ratio
          this.m.push({
            x: ri(G),
            y: ri(G),
            a: ri(params.life),
            f: f,
            k: 0, // 0: wild, 1: sterile
            i: f && R() < 0.15, // initial female infection status
            c: 0  // mating cooldown
          });
        }

        if (enableIntervention) {
          this.release();
        }

        this.rec(0);
      }

      release() {
        for (let i = 0; i < this.P.sterile; i++) {
          this.m.push({
            x: this.ri(G),
            y: this.ri(G),
            a: 0,
            f: false, // male
            k: 1,     // sterile
            i: false,
            c: 0
          });
        }
      }

      mv(obj, prob) {
        if (this.r() < prob) {
          obj.x = Math.min(G - 1, Math.max(0, obj.x + this.ri(3) - 1));
          obj.y = Math.min(G - 1, Math.max(0, obj.y + this.ri(3) - 1));
        }
      }

      step() {
        const P = this.P;
        const R = this.r;
        this.day++;
        this.ev = [];
        let newInfections = 0;

        // Periodic release of sterile mosquitoes
        if (this.on && P.interval > 0 && this.day % P.interval === 0) {
          this.release();
        }

        // Daily movement phase
        this.h.forEach(h => this.mv(h, 0.3));
        this.m.forEach(m => this.mv(m, P.move));

        // Spatial hashing for spatial lookups
        const humanMap = new Map();
        this.h.forEach(h => {
          const key = h.y * G + h.x;
          (humanMap.get(key) || humanMap.set(key, []).get(key)).push(h);
        });

        const getNearby = (map, x, y) => {
          const output = [];
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue;
              const cell = map.get(ny * G + nx);
              if (cell) output.push(...cell);
            }
          }
          return output;
        };

        // Interaction phase: biting and disease transmission
        for (const m of this.m) {
          if (m.k || !m.f) continue; // Sterile males & wild males do not bite
          const neighbors = getNearby(humanMap, m.x, m.y);
          if (!neighbors.length || R() > BITE) continue;

          const h = neighbors[this.ri(neighbors.length)];
          if (m.i && h.s === 0 && R() < P.pInf) {
            h.s = 1;
            h.t = 0;
            newInfections++;
            this.ev.push({ x: h.x, y: h.y, t: 'bite' });
          } else if (!m.i && h.s === 1 && R() < P.pInf) {
            m.i = true;
          }
        }

        // Human recovery progression
        this.h.forEach(h => {
          if (h.s === 1 && ++h.t >= RECOVER) {
            h.s = 2;
          }
        });

        // Reproduction & Sterile insect disruption mechanism
        const maleMap = new Map();
        this.m.forEach(m => {
          if (!m.f && m.a >= 2) {
            const key = m.y * G + m.x;
            (maleMap.get(key) || maleMap.set(key, []).get(key)).push(m);
          }
        });

        const born = [];
        const currentTotal = this.m.length;

        for (const f of this.m) {
          if (!f.f || f.k || f.a < 2) continue;
          if (f.c > 0) {
            f.c--;
            continue;
          }

          const localMales = getNearby(maleMap, f.x, f.y);
          if (!localMales.length) continue;

          const mate = localMales[this.ri(localMales.length)];
          f.c = 3; // Cooldown after mating attempt

          if (mate.k) {
            // Mating disruption via sterile male
            this.ev.push({ x: f.x, y: f.y, t: 'dis' });
            continue;
          }

          // Successful reproduction with wild male
          const carryingFactor = Math.max(0, 1 - (currentTotal + born.length) / K);
          const offspringExpectation = P.repro * carryingFactor;
          const offspringCount = Math.floor(offspringExpectation) + (R() < (offspringExpectation % 1) ? 1 : 0);

          for (let i = 0; i < offspringCount; i++) {
            born.push({
              x: f.x,
              y: f.y,
              a: 0,
              f: R() < 0.5,
              k: 0,
              i: false,
              c: 0
            });
          }

          if (offspringCount > 0) {
            this.ev.push({ x: f.x, y: f.y, t: 'mate' });
          }
        }

        // Mortality & aging phase
        const survivors = [];
        for (const m of this.m) {
          m.a++;
          if (m.a >= P.life || R() < P.mort) {
            this.ev.push({ x: m.x, y: m.y, t: 'die' });
          } else {
            survivors.push(m);
          }
        }

        this.m = survivors.concat(born);
        this.cum += newInfections;
        this.rec(newInfections);
      }

      rec(newInfections) {
        const wildCount = this.m.filter(m => !m.k).length;
        const sterileCount = this.m.length - wildCount;

        this.rows.push({
          day: this.day,
          wild: wildCount,
          sterile: sterileCount,
          ratio: wildCount ? +(sterileCount / wildCount).toFixed(2) : 0,
          newInf: newInfections,
          cum: this.cum,
          S: this.h.filter(h => h.s === 0).length,
          I: this.h.filter(h => h.s === 1).length,
          R: this.h.filter(h => h.s === 2).length
        });
      }

      get last() {
        return this.rows[this.rows.length - 1];
      }
    }

    /* ==========================================================================
       Application State & Control Handlers
       ========================================================================== */
    let P;
    let sims;
    let view = 'exp';
    let timer = null;
    let speed = 1;
    let saved = [];

    const FIELDS = GROUPS.flatMap(g => g[1]);

    function buildControls() {
      let html = '';
      GROUPS.forEach(([title, fields]) => {
        html += `<fieldset><legend>${title}</legend>`;
        fields.forEach(([id, label, min, max, step, val]) => {
          if (id === 'seed') {
            html += `
              <div class="f">
                <label for="${id}">${label}</label>
                <input type="number" id="${id}" min="${min}" max="${max}" value="${val}">
              </div>`;
          } else {
            html += `
              <div class="f">
                <label for="${id}">${label}<output id="o_${id}">${val}</output></label>
                <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">
              </div>`;
          }
        });
        html += '</fieldset>';
      });

      $('#ctl').insertAdjacentHTML('beforeend', html);

      FIELDS.forEach(f => {
        $('#' + f[0]).addEventListener('input', () => {
          const out = $('#o_' + f[0]);
          if (out) out.textContent = $('#' + f[0]).value;
          reset();
        });
      });
    }

    function readP() {
      P = {};
      FIELDS.forEach(f => {
        P[f[0]] = +$('#' + f[0]).value || 0;
      });
    }

    function reset() {
      stop();
      readP();
      sims = {
        ctl: new Sim(P, false, P.seed),
        exp: new Sim(P, true, P.seed)
      };
      draw();
      renderAll();
    }

    function stop() {
      clearInterval(timer);
      timer = null;
      $('#play').textContent = 'Play';
    }

    function tick() {
      if (sims.exp.day >= P.days) {
        stop();
        return;
      }
      sims.ctl.step();
      sims.exp.step();
      draw();
      renderAll();
    }

    function play() {
      if (timer) {
        stop();
        return;
      }
      if (sims.exp.day >= P.days) {
        reset();
      }
      $('#play').textContent = 'Pause';
      timer = setInterval(tick, 700 / speed);
    }

    function runAll() {
      stop();
      while (sims.exp.day < P.days) {
        sims.ctl.step();
        sims.exp.step();
      }
      draw();
      renderAll();
    }

    /* ==========================================================================
       Grid Visualization & Rendering
       ========================================================================== */
    const cv = $('#cv');
    const cx = cv.getContext('2d');
    const CS = cv.width / G;
    const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

    function draw() {
      const s = sims[view];
      const c = css;

      cx.clearRect(0, 0, cv.width, cv.height);

      // Render coordinate grid
      cx.strokeStyle = c('--line');
      cx.lineWidth = 0.5;
      cx.beginPath();
      for (let i = 0; i <= G; i++) {
        cx.moveTo(i * CS, 0);
        cx.lineTo(i * CS, cv.height);
        cx.moveTo(0, i * CS);
        cx.lineTo(cv.width, i * CS);
      }
      cx.stroke();

      const cc = val => (val + 0.5) * CS;

      // Render human agents
      for (const h of s.h) {
        cx.fillStyle = [c('--hs'), c('--hi'), c('--hr')][h.s];
        cx.fillRect(h.x * CS + 3, h.y * CS + 3, CS - 6, CS - 6);
      }

      // Render mosquitoes
      for (const m of s.m) {
        const x = cc(m.x);
        const y = cc(m.y);

        if (m.k) {
          // Sterile male (diamond)
          cx.fillStyle = c('--ster');
          cx.beginPath();
          cx.moveTo(x, y - 5);
          cx.lineTo(x + 5, y);
          cx.lineTo(x, y + 5);
          cx.lineTo(x - 5, y);
          cx.fill();
        } else {
          // Wild mosquito (circle)
          cx.fillStyle = c('--wild');
          cx.beginPath();
          cx.arc(x, y, m.i ? 4.5 : 3.5, 0, 7);
          cx.fill();
        }
      }

      // Render event markers
      for (const e of s.ev) {
        const x = cc(e.x);
        const y = cc(e.y);

        if (e.t === 'bite') {
          cx.strokeStyle = c('--hi');
          cx.lineWidth = 3;
          cx.beginPath();
          cx.arc(x, y, 14, 0, 7);
          cx.stroke();
        } else if (e.t === 'mate') {
          cx.fillStyle = c('--hs');
          cx.globalAlpha = 0.45;
          cx.beginPath();
          cx.arc(x, y, 9, 0, 7);
          cx.fill();
          cx.globalAlpha = 1;
        } else if (e.t === 'dis') {
          cx.strokeStyle = c('--ster');
          cx.lineWidth = 2.5;
          cx.beginPath();
          cx.moveTo(x - 7, y - 7);
          cx.lineTo(x + 7, y + 7);
          cx.moveTo(x + 7, y - 7);
          cx.lineTo(x - 7, y + 7);
          cx.stroke();
        } else {
          cx.fillStyle = c('--mute');
          cx.fillRect(x - 1.5, y - 1.5, 3, 3);
        }
      }

      const countEv = type => s.ev.filter(e => e.t === type).length;
      $('#evsum').textContent = `Day ${s.day}: ${countEv('bite')} infections, ${countEv('mate')} successful matings, ${countEv('dis')} disrupted matings, ${countEv('die')} deaths.`;
    }

    /* ==========================================================================
       Dashboard Metrics & Assessment
       ========================================================================== */
    function renderMetrics() {
      const s = sims[view];
      const r = s.last;
      const tiles = [
        ['Day', `${r.day} / ${P.days}`],
        ['Wild mosquitoes', r.wild],
        ['Sterile males', r.sterile],
        ['Sterile : wild', r.sterile ? `${r.ratio}:1` : '0:1'],
        ['Cumulative infections', r.cum],
        ['New infections today', r.newInf]
      ];

      $('#metrics').innerHTML = tiles
        .map(t => `<div class="m"><b>${t[1]}</b><span>${t[0]}</span></div>`)
        .join('');
    }

    function metricsOut() {
      const e = sims.exp.last;
      const c = sims.ctl.last;
      const supp = Math.max(0, 1 - e.wild / Math.max(1, c.wild));
      const red = Math.max(0, 1 - e.cum / Math.max(1, c.cum));
      const att = e.cum / P.humans;

      return { e, c, supp, red, att };
    }

    function severity() {
      const el = $('#sev');
      if (sims.exp.day < 1) {
        el.innerHTML = '<h2>Run the simulation first</h2><p class="note">Play or step the model, then return here for an assessment.</p>';
        return;
      }

      const { e, c, supp, red, att } = metricsOut();
      const lv = att < 0.05 ? 0 : att < 0.15 ? 1 : att < 0.35 ? 2 : 3;

      const assessmentTiers = [
        ['Low', 'var(--hs)', 'Maintain surveillance. A small, occasional release is enough to keep wild numbers down.'],
        ['Moderate', '#C98A00', 'Keep releasing sterile males on a fixed interval and add larval-site monitoring around the infected cases.'],
        ['High', 'var(--wild)', 'Raise the sterile-to-wild ratio and shorten the release interval. Combine with source reduction and alert the local health unit.'],
        ['Severe', 'var(--hi)', 'Treat as an outbreak. Start large, frequent releases right away alongside vector control and case management. SIT alone will act too slowly.']
      ][lv];

      const warn = (supp < 0.3 && lv > 0)
        ? ' Wild suppression is weak, so increase the release size before relying on SIT.' 
        : '';

      el.style.borderLeftColor = assessmentTiers[1];
      el.innerHTML = `
        <h2>Epidemic severity: ${assessmentTiers[0]}</h2>
        <p><b>${(supp * 100).toFixed(0)}%</b> wild mosquito suppression · <b>${(red * 100).toFixed(0)}%</b> fewer infections than control · <b>${(att * 100).toFixed(1)}%</b> of humans infected in the experimental run (${e.cum} vs ${c.cum} in control).</p>
        <p><b>Recommended action:</b> ${assessmentTiers[2]}${warn}</p>
        <p class="note">Based on day ${e.day} of ${P.days}. Rating bands use the share of humans infected: under 5%, 5–15%, 15–35%, above 35%.</p>
      `;
    }

    /* ==========================================================================
       Chart Rendering Engine
       ========================================================================== */
    const CHARTS = [
      [
        'Mosquito populations',
        [
          ['Wild (control)', 'ctl', 'wild', '--wild', 1],
          ['Wild (experimental)', 'exp', 'wild', '--wild'],
          ['Sterile (experimental)', 'exp', 'sterile', '--ster']
        ]
      ],
      [
        'Cumulative human infections',
        [
          ['Control', 'ctl', 'cum', '--hi', 1],
          ['Experimental', 'exp', 'cum', '--acc']
        ]
      ],
      [
        'Daily new infections',
        [
          ['Control', 'ctl', 'newInf', '--hi', 1],
          ['Experimental', 'exp', 'newInf', '--acc']
        ]
      ],
      [
        'Sterile-to-wild ratio (experimental)',
        [
          ['Ratio', 'exp', 'ratio', '--ster']
        ]
      ]
    ];

    function chart(cvs, title, seriesDefs) {
      const W = 560;
      const H = 270;
      const d = window.devicePixelRatio || 1;

      cvs.width = W * d;
      cvs.height = H * d;
      const g = cvs.getContext('2d');
      g.scale(d, d);

      g.fillStyle = css('--panel');
      g.fillRect(0, 0, W, H);

      g.font = '600 13px sans-serif';
      g.fillStyle = css('--ink');
      g.fillText(title, 10, 18);

      const L = 44;
      const T = 48;
      const B = H - 28;
      const Rr = W - 12;

      let mx = 1;
      seriesDefs.forEach(s => {
        sims[s[1]].rows.forEach(r => {
          mx = Math.max(mx, r[s[2]]);
        });
      });

      const X = i => L + (Rr - L) * i / Math.max(1, P.days);
      const Y = v => B - (B - T) * v / mx;

      // Draw grid axes
      g.strokeStyle = css('--line');
      g.fillStyle = css('--mute');
      g.font = '11px sans-serif';
      g.lineWidth = 1;

      for (let i = 0; i <= 4; i++) {
        const y = B - (B - T) * i / 4;
        g.beginPath();
        g.moveTo(L, y);
        g.lineTo(Rr, y);
        g.stroke();
        g.fillText(+(mx * i / 4).toFixed(mx < 10 ? 1 : 0), 4, y + 4);
      }

      for (let i = 0; i <= P.days; i += Math.max(1, Math.round(P.days / 6))) {
        g.fillText(i, X(i) - 4, H - 10);
      }

      // Draw data series
      let legendX = 10;
      seriesDefs.forEach(s => {
        const col = css(s[3]);
        g.strokeStyle = col;
        g.fillStyle = col;
        g.setLineDash(s[4] ? [5, 4] : []);
        g.lineWidth = 2;

        g.beginPath();
        sims[s[1]].rows.forEach((r, i) => {
          if (i === 0) g.moveTo(X(i), Y(r[s[2]]));
          else g.lineTo(X(i), Y(r[s[2]]));
        });
        g.stroke();

        // Chart legend indicator
        g.beginPath();
        g.moveTo(legendX, 32);
        g.lineTo(legendX + 16, 32);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = css('--ink');
        g.fillText(s[0], legendX + 20, 36);
        legendX += g.measureText(s[0]).width + 36;
      });

      g.setLineDash([]);
    }

    function initCharts() {
      $('#charts').innerHTML = CHARTS
        .map((c, i) => `
          <div class="card">
            <canvas id="ch${i}"></canvas>
            <button class="btn" data-png="${i}">Export PNG</button>
          </div>
        `).join('');

      document.querySelectorAll('[data-png]').forEach(btn => {
        btn.onclick = () => {
          const idx = +btn.dataset.png;
          const url = $('#ch' + idx).toDataURL('image/png');
          dialog(CHARTS[idx][0], `<img alt="${CHARTS[idx][0]}" src="${url}"><p class="note">Right-click or long-press the image to save it.</p>`, null);
          dl(url, `chart-${idx}.png`);
        };
      });
    }

    function renderSaved() {
      if (!saved.length) {
        $('#saved').innerHTML = '<p class="note">No saved runs yet. Finish a run, then save it to compare different release settings.</p>';
        return;
      }

      $('#saved').innerHTML = `
        <table>
          <tr>
            <th>#</th>
            <th>Sterile / release</th>
            <th>Interval</th>
            <th>Wild</th>
            <th>Days</th>
            <th>Suppression</th>
            <th>Infection reduction</th>
          </tr>
          ${saved.map((s, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${s.st}</td>
              <td>${s.iv || 'once'}</td>
              <td>${s.w}</td>
              <td>${s.d}</td>
              <td>${s.sp}%</td>
              <td>${s.rd}%</td>
            </tr>
          `).join('')}
        </table>
      `;
    }

    function renderAll() {
      renderMetrics();
      if (!$('#res').hidden) {
        renderRes();
      }
    }

    function renderRes() {
      CHARTS.forEach((c, i) => chart($('#ch' + i), c[0], c[1]));
      severity();
    }

    /* ==========================================================================
       Export & Dialog Handlers
       ========================================================================== */
    function dl(href, filename) {
      try {
        const link = document.createElement('a');
        link.href = href;
        link.download = filename;
        link.click();
      } catch (err) {}
    }

    let dcopyTxt = null;

    function dialog(title, html, copyContent) {
      $('#dt').textContent = title;
      $('#db').innerHTML = html;
      dcopyTxt = copyContent;
      $('#dcopy').hidden = !copyContent;
      $('#dlg').showModal();
    }

    $('#dclose').onclick = () => $('#dlg').close();

    $('#dcopy').onclick = () => {
      const ta = $('#db textarea');
      ta.select();
      try {
        navigator.clipboard.writeText(dcopyTxt);
      } catch (e) {
        document.execCommand('copy');
      }
    };

    function generateCSV() {
      const keys = ['day', 'wild', 'sterile', 'ratio', 'newInf', 'cum', 'S', 'I', 'R'];
      let out = 'scenario,' + keys.join(',') + '\n';
      ['ctl', 'exp'].forEach(mode => {
        sims[mode].rows.forEach(r => {
          out += (mode === 'ctl' ? 'control' : 'experimental') + ',' + keys.map(k => r[k]).join(',') + '\n';
        });
      });
      return out;
    }

    $('#csvbtn').onclick = () => {
      const text = generateCSV();
      dialog('Cycle data (CSV)', `<textarea readonly>${text}</textarea><p class="note">Paste into a .csv file, or open in Excel.</p>`, text);
      dl('data:text/csv;charset=utf-8,' + encodeURIComponent(text), 'sit-simulation.csv');
    };

    $('#savebtn').onclick = () => {
      if (sims.exp.day < 1) {
        return dialog('Nothing to save', '<p>Run at least one day first.</p>', null);
      }
      const m = metricsOut();
      saved.push({
        st: P.sterile,
        iv: P.interval,
        w: P.wild,
        d: sims.exp.day,
        sp: (m.supp * 100).toFixed(0),
        rd: (m.red * 100).toFixed(0)
      });
      renderSaved();
    };

    $('#clrbtn').onclick = () => {
      saved = [];
      renderSaved();
    };

    /* ==========================================================================
       Informational Context & Walkthrough
       ========================================================================== */
    const PHASES = [
      ['Initialization', 'Humans, wild mosquitoes and (in the experimental scenario) sterile males are placed at random grid cells. A few humans start infected, and about 15% of wild females start infectious. Both scenarios share the same random seed, so the only difference between them is the sterile males.'],
      ['Movement', 'Each agent may step one cell up, down, left, right or diagonally, with a probability set by the movement slider. Agents stop at the grid edge. Humans move less often than mosquitoes.'],
      ['Interaction', 'A wild female that shares or touches a human\'s cell may bite. An infectious mosquito can infect a susceptible human at the infection probability, and a mosquito that bites an infected human becomes infectious. Infected humans recover after 7 days and become immune.'],
      ['Reproduction', 'A mature wild female next to a male may mate. A wild male gives offspring: the number depends on the reproduction rate and shrinks as the population nears the grid\'s carrying capacity. Females then wait 3 days before mating again.'],
      ['Sterile mechanism', 'If the male is sterile, the mating is disrupted and produces zero offspring, yet the female still spends her mating cooldown. New sterile males are released at the start of the experiment and then at each release interval.'],
      ['Mortality', 'Every mosquito ages by one day. It disappears when it reaches its lifespan, or earlier by chance at the natural mortality rate.'],
      ['Recording', 'The model stores wild count, sterile count, ratio, new and cumulative infections, and human states for the day. These rows feed the live dashboard, the charts, the severity rating and the CSV export.']
    ];

    let currentPhase = 0;

    function renderPhase() {
      $('#flow').innerHTML = PHASES
        .map((p, i) => `<button class="btn" data-p="${i}" ${i === currentPhase ? 'aria-current="step"' : ''}>${i + 1}. ${p[0]}</button>`)
        .join('<span aria-hidden="true">›</span>');

      $('#phase').innerHTML = `
        <h3>${PHASES[currentPhase][0]}</h3>
        <p>${PHASES[currentPhase][1]}</p>
        <p>
          <button class="btn" id="pp">Previous</button> 
          <button class="btn pri" id="pn">Next phase</button>
        </p>
        <p class="note">After Recording the loop returns to Movement for the next day, until the set number of days is reached.</p>
      `;

      document.querySelectorAll('[data-p]').forEach(b => {
        b.onclick = () => {
          currentPhase = +b.dataset.p;
          renderPhase();
        };
      });

      $('#pp').onclick = () => {
        currentPhase = (currentPhase + 6) % 7;
        renderPhase();
      };

      $('#pn').onclick = () => {
        currentPhase = (currentPhase + 1) % 7;
        renderPhase();
      };
    }

    function renderProject() {
      $('#team').innerHTML = PROJECT.team.map(t => `<li>${t}</li>`).join('');
      $('#adv').innerHTML = `<b>Research Adviser:</b> ${PROJECT.adviser}<br><b>Institution:</b> ${PROJECT.institution}`;
      $('#tl').innerHTML = `
        <tr>
          <th>Phase / Event</th>
          <th>Date / Schedule</th>
        </tr>
        ${PROJECT.timeline.map(t => `<tr><td>${t[0]}</td><td>${t[1]}</td></tr>`).join('')}
      `;
    }

    /* ==========================================================================
       Tab Routing & Event Listeners
       ========================================================================== */
    const TABS = [
      ['sim', 'Simulator'],
      ['res', 'Results and comparison'],
      ['about', 'About the research'],
      ['method', 'Methodology'],
      ['proj', 'Project']
    ];

    $('#tabs').innerHTML = TABS
      .map((t, i) => `<button class="tab" role="tab" data-t="${t[0]}" aria-selected="${i === 0}">${t[1]}</button>`)
      .join('');

    document.querySelectorAll('.tab').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', b === btn));
        TABS.forEach(t => {
          $('#' + t[0]).hidden = (t[0] !== btn.dataset.t);
        });

        if (btn.dataset.t === 'res') renderRes();
        if (btn.dataset.t === 'sim') draw();
      };
    });

    function setView(scenarioView) {
      view = scenarioView;
      $('#vctl').setAttribute('aria-pressed', scenarioView === 'ctl');
      $('#vexp').setAttribute('aria-pressed', scenarioView === 'exp');
      draw();
      renderMetrics();
    }

    $('#vctl').onclick = () => setView('ctl');
    $('#vexp').onclick = () => setView('exp');

    $('#play').onclick = play;
    $('#stepb').onclick = () => {
      stop();
      tick();
    };
    $('#runall').onclick = runAll;
    $('#resetb').onclick = reset;

    document.querySelectorAll('[data-sp]').forEach(btn => {
      btn.onclick = () => {
        speed = +btn.dataset.sp;
        document.querySelectorAll('[data-sp]').forEach(b => b.setAttribute('aria-pressed', b === btn));
        if (timer) {
          stop();
          play();
        }
      };
    });

    /* ==========================================================================
       Initialization
       ========================================================================== */
    buildControls();
    initCharts();
    renderPhase();
    renderProject();
    renderSaved();
    reset();