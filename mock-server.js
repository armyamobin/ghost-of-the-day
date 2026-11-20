/**
 * Preview-only fake backend.
 *
 * The real app talks to `/api/*` endpoints served by Devvit. This file stubs
 * `fetch` with the same payload shapes and the same rules so the *actual built
 * client bundle* can run as a plain HTML file (and be demoed offline).
 *
 * Rules are duplicated here on purpose: this file never ships to Reddit.
 */
(function () {
  var GRID = 7;
  var ROOMS = 49;
  var CANDLES = 6;

  function hash32(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function dayNumber(day) {
    var parts = day.split('-').map(Number);
    var epoch = Date.UTC(2026, 0, 1);
    var then = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    return Math.floor((then - epoch) / 86400000) + 1;
  }

  function ghostRoom(day) {
    return Math.floor(mulberry32(hash32('ghost-of-the-day:v1:' + day))() * ROOMS);
  }

  function distance(a, b) {
    return Math.abs(Math.floor(a / GRID) - Math.floor(b / GRID)) + Math.abs((a % GRID) - (b % GRID));
  }

  function band(d) {
    if (d <= 0) return 0;
    if (d <= 3) return 1;
    if (d <= 6) return 2;
    return 3;
  }

  // Sandboxed iframes (like the workspace viewer) throw on localStorage.
  var store = (function () {
    try {
      window.localStorage.setItem('__probe__', '1');
      window.localStorage.removeItem('__probe__');
      return window.localStorage;
    } catch (e) {
      var mem = {};
      return {
        getItem: function (k) {
          return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
        },
        setItem: function (k, v) {
          mem[k] = String(v);
        },
        removeItem: function (k) {
          delete mem[k];
        },
      };
    }
  })();

  function read(key, fallback) {
    try {
      var raw = store.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      store.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* quota or blocked: preview still plays */
    }
  }

  function play(day) {
    var p = read('god:play:' + day, { p: [], s: 0 });
    if (!Array.isArray(p.p)) p = { p: [], s: 0 };
    return p;
  }

  function stats() {
    return read('god:stats', { streak: 0, best: 0, last: '', wins: 0, plays: 0, total: 0 });
  }

  var HUNTERS = [
    'ghosted_again',
    'candle_hoe',
    'spooky_szn',
    'room_D4',
    'midnight_mod',
    'casper_fan',
    'vault_13',
    'snoo_ghost',
    'third_floor',
    'ouija_enjoyer',
  ];

  function fakeBoard(day) {
    var rand = mulberry32(hash32('board:' + day));
    var pool = HUNTERS.slice();
    var out = [];
    var count = 3 + Math.floor(rand() * 4);
    for (var i = 0; i < count && pool.length; i++) {
      var idx = Math.floor(rand() * pool.length);
      var name = pool.splice(idx, 1)[0];
      out.push({ name: name, candles: 2 + Math.floor(rand() * 5), isYou: false });
    }
    return out;
  }

  function fakeStreaks(day) {
    var rand = mulberry32(hash32('streaks:' + day));
    var out = [];
    for (var i = 0; i < 3 && i < HUNTERS.length; i++) {
      out.push({
        name: HUNTERS[(i * 3 + 1) % HUNTERS.length],
        streak: 2 + Math.floor(rand() * 12),
        isYou: false,
      });
    }
    return out;
  }

  function payload() {
    var day = today();
    var p = play(day);
    var st = stats();
    var ghosts = ghostRoom(day);
    var mine = read('god:board:' + day, []);
    var board = fakeBoard(day);
    var used = p.p.length;
    var status = p.s === 1 ? 'caught' : p.s === 2 ? 'fled' : 'playing';
    var you = {
      day: day,
      number: dayNumber(day),
      grid: GRID,
      candles: CANDLES,
      candlesLeft: Math.max(CANDLES - used, 0),
      probes: p.p.map(function (pair) {
        return { i: pair[0], b: pair[1] };
      }),
      status: status,
      ghost: status === 'playing' ? null : ghosts,
      streak: st.streak,
      best: st.best,
      wins: st.wins,
      plays: st.plays,
    };
    if (mine.length) {
      board.push({ name: 'you_preview', candles: mine[0], isYou: true });
    }
    board.sort(function (a, b) {
      return a.candles - b.candles;
    });
    var plays = 54 + (dayNumber(day) % 89);
    var catches = Math.round(plays * 0.74);
    return {
      player: you,
      board: board.slice(0, 5),
      streaks: fakeStreaks(day),
      stats: {
        plays: plays,
        catches: catches,
        catchRate: catches / plays,
        avgCandles: 4.3 + ((dayNumber(day) % 7) / 20),
      },
      username: 'you_preview',
    };
  }

  function finalize(day, p) {
    var st = stats();
    if (st.last === day) return;
    var used = p.p.length;
    var caught = p.s === 1;
    var yesterday = new Date(Date.UTC.apply(null, day.split('-').map(Number)) - 86400000)
      .toISOString()
      .slice(0, 10);
    var streak = 0;
    if (caught) {
      streak = st.last === yesterday ? st.streak + 1 : 1;
      st.wins += 1;
      st.total += used;
      write('god:board:' + day, [used]);
    }
    st.streak = streak;
    st.best = Math.max(st.best, streak);
    st.plays += 1;
    st.last = day;
    write('god:stats', st);
  }

  function json(body) {
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  var realFetch = window.fetch ? window.fetch.bind(window) : undefined;

  window.fetch = function (url, init) {
    var path = String(url).replace(/^\.?\//, '');
    if (path.indexOf('api/') !== 0) {
      return realFetch ? realFetch(url, init) : json({ error: 'no network', status: 500 });
    }
    var day = today();

    if (path === 'api/state') return json(payload());

    if (path === 'api/probe') {
      var body = {};
      try {
        body = JSON.parse((init && init.body) || '{}');
      } catch (e) {
        body = {};
      }
      var cell = Number(body.i);
      var p = play(day);
      var existing = p.p.find(function (pair) {
        return pair[0] === cell;
      });
      if (existing) {
        var out = payload();
        return json(Object.assign({}, out, { band: existing[1] }));
      }
      if (p.s !== 0 || p.p.length >= CANDLES || !(cell >= 0 && cell < ROOMS)) {
        return json(Object.assign({}, payload(), { band: null }));
      }
      var reading = band(distance(cell, ghostRoom(day)));
      p.p.push([cell, reading]);
      if (reading === 0) p.s = 1;
      else if (p.p.length >= CANDLES) p.s = 2;
      write('god:play:' + day, p);
      if (p.s !== 0) finalize(day, p);
      return json(Object.assign({}, payload(), { band: reading }));
    }

    if (path === 'api/share') {
      return json({
        status: 'posted',
        message: 'Preview mode — in Reddit this posts your result as a spoiler-tagged comment.',
      });
    }

    return json({ error: 'not found', status: 404 });
  };
})();
