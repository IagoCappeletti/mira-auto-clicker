(() => {
	const VERSION = 8;
	if (window.top !== window || window.autoclick?.version === VERSION) return;
	const carried = window.autoclick?.status?.();
	window.autoclick?.destroy?.();

	const PICK_EVENTS = ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick", "auxclick", "contextmenu"];
	const KEY_EVENTS = ["keydown", "keypress", "keyup"];
	const TICKER_SOURCE = "let t=0;onmessage=(e)=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}";
	const PRESETS = [50, 100, 250, 500, 1000];
	const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
	const PLACE_KEY = "autoclick-panel";
	const SETUP_KEY = "autoclick-setup";
	const IN_EXTENSION = Boolean(globalThis.chrome?.runtime?.id);
	const DOUBLE_AFTER_MS = 2000;
	const MONO = "600 11px/18px ui-monospace, SFMono-Regular, Menlo, monospace";
	const PULSE = [
		{ transform: "scale(.7)", opacity: 0.95 },
		{ transform: "scale(2.2)", opacity: 0 },
	];
	const STYLE = `
		:host { all: initial; }
		[hidden] { display: none !important; }
		.layer { --green: #10b981; --blue: #3b82f6; --rose: #f43f5e; --amber: #f59e0b; --ink: #f8fafc; --muted: #94a3b8; --edge: rgba(148, 163, 184, .2); color: var(--ink); font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
		.ghost, .ghost * { pointer-events: none !important; }
		button { font: inherit; color: inherit; }
		kbd { display: inline-block; min-width: 18px; margin: 0 1px; padding: 0 5px; box-sizing: border-box; border: 1px solid rgba(148, 163, 184, .35); border-bottom-width: 2px; border-radius: 5px; background: rgba(255, 255, 255, .06); color: var(--ink); font: 600 10px/15px ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; }

		.overlay { position: fixed; inset: 0; z-index: 1; cursor: crosshair; background: rgba(2, 6, 23, .32); animation: fade .15s ease-out; }
		.banner { position: fixed; top: 18px; left: 50%; z-index: 6; display: flex; align-items: center; gap: 10px; padding: 7px 7px 7px 14px; transform: translateX(-50%); border: 1px solid rgba(59, 130, 246, .5); border-radius: 999px; background: rgba(15, 23, 42, .94); box-shadow: 0 12px 32px rgba(2, 6, 23, .5); white-space: nowrap; animation: fade .15s ease-out; }
		.banner button { padding: 5px 12px; border: 0; border-radius: 999px; background: rgba(148, 163, 184, .18); font-size: 12px; font-weight: 600; cursor: pointer; }
		.banner button:hover { background: rgba(148, 163, 184, .3); }
		.banner b { font-size: 13px; font-weight: 600; }
		.banner span { color: var(--muted); }
		.banner i { width: 8px; height: 8px; border-radius: 50%; background: var(--blue); animation: ping 1.4s infinite; }

		.guide { position: fixed; z-index: 2; background: rgba(96, 165, 250, .85); pointer-events: none; }
		.guide.h { left: 0; right: 0; height: 1px; }
		.guide.v { top: 0; bottom: 0; width: 1px; }
		.bubble { position: fixed; z-index: 2; padding: 2px 7px; border-radius: 6px; background: var(--blue); box-shadow: 0 4px 12px rgba(2, 6, 23, .35); font: ${MONO}; white-space: nowrap; pointer-events: none; }

		.target { --c: var(--rose); position: fixed; z-index: 5; width: 36px; height: 36px; margin: -18px 0 0 -18px; outline: none; cursor: grab; touch-action: none; }
		.target.running { --c: var(--green); }
		.target.dragging { cursor: grabbing; }
		.ring, .pulse { position: absolute; inset: 5px; border: 2px solid var(--c); border-radius: 50%; }
		.ring { background: color-mix(in srgb, var(--c) 16%, transparent); box-shadow: 0 0 0 1px rgba(255, 255, 255, .7), 0 4px 14px rgba(2, 6, 23, .45); transition: box-shadow .15s; }
		.pulse { opacity: 0; }
		.tick { position: absolute; background: var(--c); box-shadow: 0 0 0 1px rgba(255, 255, 255, .55); }
		.tick.n, .tick.s { left: 17px; width: 2px; height: 6px; }
		.tick.w, .tick.e { top: 17px; width: 6px; height: 2px; }
		.tick.n { top: 0; }
		.tick.s { bottom: 0; }
		.tick.w { left: 0; }
		.tick.e { right: 0; }
		.dot { position: absolute; top: 15px; left: 15px; width: 6px; height: 6px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 1.5px #fff; }
		.tag { position: absolute; top: 42px; left: 50%; padding: 2px 7px; transform: translateX(-50%); border-radius: 6px; background: rgba(15, 23, 42, .94); box-shadow: 0 4px 12px rgba(2, 6, 23, .35); font: ${MONO}; white-space: nowrap; opacity: 0; transition: opacity .15s; pointer-events: none; }
		.target:hover .tag, .target:focus .tag, .target.dragging .tag { opacity: 1; }
		.target:focus .ring { box-shadow: 0 0 0 1px rgba(255, 255, 255, .7), 0 0 0 5px color-mix(in srgb, var(--c) 35%, transparent), 0 4px 14px rgba(2, 6, 23, .45); }

		.panel { position: fixed; right: 16px; bottom: 16px; z-index: 4; width: 252px; overflow: hidden; border: 1px solid var(--edge); border-radius: 14px; background: rgba(15, 23, 42, .9); box-shadow: 0 18px 44px rgba(2, 6, 23, .5); -webkit-backdrop-filter: blur(14px) saturate(140%); backdrop-filter: blur(14px) saturate(140%); pointer-events: auto; animation: rise .2s ease-out; }
		.head { display: flex; align-items: center; gap: 8px; padding: 9px 8px 9px 12px; border-bottom: 1px solid var(--edge); cursor: grab; user-select: none; touch-action: none; }
		.panel.moving .head { cursor: grabbing; }
		.panel.mini .head { border-bottom: 0; }
		.panel.picking { opacity: .3; pointer-events: none; transition: opacity .15s; }
		.panel.mini .body { display: none; }
		.grip { color: #475569; font-size: 12px; letter-spacing: -3px; }
		.title { flex: 1; font-size: 13px; font-weight: 650; }
		.pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px 2px 8px; border-radius: 999px; background: rgba(148, 163, 184, .14); color: #cbd5e1; font-size: 11px; font-weight: 600; white-space: nowrap; }
		.pill i { width: 6px; height: 6px; border-radius: 50%; background: #64748b; }
		.pill.run { background: rgba(16, 185, 129, .15); color: #6ee7b7; }
		.pill.run i { background: var(--green); animation: ping 1.2s infinite; }
		.pill.pick { background: rgba(59, 130, 246, .18); color: #93c5fd; }
		.pill.pick i { background: var(--blue); animation: ping 1.2s infinite; }
		.pill.wait { background: rgba(245, 158, 11, .15); color: #fcd34d; }
		.pill.wait i { background: var(--amber); }
		.icon { display: grid; width: 24px; height: 24px; place-items: center; border: 0; border-radius: 7px; background: transparent; color: var(--muted); font-size: 15px; line-height: 1; cursor: pointer; }
		.icon:hover { background: rgba(148, 163, 184, .15); color: var(--ink); }

		.body { display: grid; gap: 10px; padding: 12px; }
		.stats { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; }
		.count { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -.02em; line-height: 1; }
		.label, .rate { color: var(--muted); font-size: 11px; }
		.rate { font-variant-numeric: tabular-nums; text-align: right; }
		.field { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--muted); }
		.coord { color: var(--ink); font: ${MONO}; font-size: 12px; }
		.coord.empty { color: #fcd34d; font: 600 12px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
		.ms { display: flex; align-items: center; overflow: hidden; border: 1px solid rgba(148, 163, 184, .28); border-radius: 8px; background: rgba(2, 6, 23, .35); }
		.ms:focus-within { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(59, 130, 246, .22); }
		.ms input { width: 62px; padding: 5px 4px 5px 8px; border: 0; outline: none; background: transparent; color: var(--ink); font: ${MONO}; font-size: 12px; text-align: right; -moz-appearance: textfield; }
		.ms input::-webkit-outer-spin-button, .ms input::-webkit-inner-spin-button { margin: 0; -webkit-appearance: none; }
		.ms span { padding: 0 9px 0 2px; color: var(--muted); }
		.chips { display: flex; gap: 4px; }
		.chips button { flex: 1; padding: 4px 0; border: 1px solid var(--edge); border-radius: 7px; background: transparent; color: #cbd5e1; font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; cursor: pointer; }
		.chips button:hover { background: rgba(148, 163, 184, .12); }
		.chips button.on { border-color: transparent; background: rgba(59, 130, 246, .25); color: #bfdbfe; }
		.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
		.actions button { padding: 8px 0; border: 0; border-radius: 9px; font-size: 12px; font-weight: 650; cursor: pointer; transition: filter .15s; }
		.actions button:hover { filter: brightness(1.12); }
		.actions button:active { transform: translateY(1px); }
		.pick { background: rgba(148, 163, 184, .16); }
		.toggle { background: var(--green); color: #022c22; }
		.toggle.on { background: var(--rose); color: #fff; }
		.toggle:disabled { opacity: .4; cursor: not-allowed; filter: none; transform: none; }
		.miss { padding: 7px 9px; border-radius: 8px; background: rgba(244, 63, 94, .13); color: #fda4af; }
		.miss:empty { display: none; }
		.hint { display: grid; gap: 3px; color: #64748b; font-size: 11px; }

		@keyframes ping { from { box-shadow: 0 0 0 0 rgba(255, 255, 255, .45); } to { box-shadow: 0 0 0 6px rgba(255, 255, 255, 0); } }
		@keyframes fade { from { opacity: 0; } }
		@keyframes rise { from { opacity: 0; transform: translateY(8px); } }
	`;

	const state = { point: null, interval: 500, max: 0, running: false, clicks: 0, miss: "", picking: false };
	const mouse = { x: null, y: null };
	const place = loadPlace();

	const ui = buildUi();
	const ticker = createTicker(tick);
	const tracker = setInterval(mount, 1000);
	let dragging = false;
	let lastFire = Number.NEGATIVE_INFINITY;

	window.addEventListener("mousemove", onMouseMove, { capture: true, passive: true });
	window.addEventListener("resize", onResize);
	for (const type of KEY_EVENTS) window.addEventListener(type, onKey, true);

	function h(tag, props, ...children) {
		const el = Object.assign(document.createElement(tag), props);
		el.append(...children);
		return el;
	}

	function kbd(text) {
		return h("kbd", { textContent: text });
	}

	function fmt(n, digits = 0) {
		return n.toLocaleString("pt-BR", { maximumFractionDigits: digits });
	}

	function buildUi() {
		const root = document.createElement("autoclick-ui");
		root.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
		const shadow = root.attachShadow({ mode: "open" });

		const cancel = h("button", { type: "button", textContent: "Cancelar" });
		const banner = h(
			"div",
			{ className: "banner", hidden: true },
			h("i"),
			h("b", { textContent: "Clique no ponto que deve receber os cliques" }),
			h("span", {}, "ou passe o mouse e aperte ", kbd("M"), " · ", kbd("Esc"), " cancela"),
			cancel,
		);
		const overlay = h("div", { className: "overlay", hidden: true });
		const guideH = h("div", { className: "guide h", hidden: true });
		const guideV = h("div", { className: "guide v", hidden: true });
		const bubble = h("div", { className: "bubble", hidden: true });

		const pulse = h("div", { className: "pulse" });
		const dot = h("div", { className: "dot" });
		const tag = h("div", { className: "tag" });
		const ticks = ["n", "s", "w", "e"].map((side) => h("div", { className: `tick ${side}` }));
		const target = h(
			"div",
			{ className: "target", tabIndex: 0, hidden: true, title: "Arraste para ajustar · setas movem 1 px (Shift: 10 px)" },
			pulse,
			h("div", { className: "ring" }),
			...ticks,
			dot,
			tag,
		);

		const pillText = h("span");
		const pill = h("span", { className: "pill" }, h("i"), pillText);
		const mini = h("button", { className: "icon", type: "button" });
		const close = h("button", {
			className: "icon",
			type: "button",
			title: "Fechar a Mira",
			textContent: "×",
			hidden: !IN_EXTENSION,
		});
		const head = h(
			"div",
			{ className: "head", title: "Arraste para mover o painel" },
			h("span", { className: "grip", textContent: "⋮⋮" }),
			h("span", { className: "title", textContent: "Mira" }),
			pill,
			mini,
			close,
		);
		const count = h("div", { className: "count" });
		const rate = h("div", { className: "rate" });
		const coord = h("span", { className: "coord" });
		const interval = h("input", { type: "number", min: "10", step: "10", inputMode: "numeric" });
		const chips = PRESETS.map((ms) =>
			h("button", { type: "button", textContent: ms >= 1000 ? `${ms / 1000} s` : String(ms), title: `${ms} ms` }),
		);
		const pickButton = h("button", { className: "pick", type: "button" });
		const toggle = h("button", { className: "toggle", type: "button" });
		const miss = h("div", { className: "miss" });
		const body = h(
			"div",
			{ className: "body" },
			h("div", { className: "stats" }, h("div", {}, count, h("div", { className: "label", textContent: "cliques" })), rate),
			h("div", { className: "field" }, h("span", { textContent: "Ponto" }), coord),
			h(
				"div",
				{ className: "field" },
				h("span", { textContent: "Intervalo" }),
				h("label", { className: "ms" }, interval, h("span", { textContent: "ms" })),
			),
			h("div", { className: "chips" }, ...chips),
			h("div", { className: "actions" }, pickButton, toggle),
			miss,
			h(
				"div",
				{ className: "hint" },
				h("span", {}, kbd("M"), " marca onde está o mouse"),
				h("span", {}, "Arraste a mira ou use as setas nela"),
			),
		);
		const panel = h("div", { className: "panel" }, head, body);
		const layer = h("div", { className: "layer" }, overlay, guideH, guideV, bubble, panel, target, banner);
		shadow.append(h("style", { textContent: STYLE }), layer);

		mini.onclick = () => {
			place.mini = !place.mini;
			savePlace();
			render();
			applyPlace();
		};
		close.onclick = () => destroy();
		head.addEventListener("pointerdown", onPanelDown);
		pickButton.onclick = () => (state.picking ? stopPick() : pick());
		cancel.onclick = () => stopPick();
		toggle.onclick = () => toggleRun();
		interval.onchange = () => setIntervalMs(interval.value);
		chips.forEach((chip, i) => {
			chip.onclick = () => setIntervalMs(PRESETS[i]);
		});
		target.addEventListener("pointerdown", onTargetDown);
		for (const type of KEY_EVENTS) panel.addEventListener(type, (event) => event.stopPropagation());

		return {
			root,
			shadow,
			layer,
			overlay,
			banner,
			guideH,
			guideV,
			bubble,
			target,
			pulse,
			dot,
			tag,
			panel,
			pill,
			pillText,
			mini,
			count,
			rate,
			coord,
			interval,
			chips,
			pick: pickButton,
			toggle,
			miss,
		};
	}

	function createTicker(onTick) {
		let ms = 0;
		let timer = 0;
		let worker = null;
		const useTimer = () => {
			clearInterval(timer);
			if (ms) timer = setInterval(onTick, ms);
		};
		try {
			worker = new Worker(URL.createObjectURL(new Blob([TICKER_SOURCE], { type: "text/javascript" })));
			worker.onmessage = onTick;
			worker.onerror = () => {
				worker.terminate();
				worker = null;
				useTimer();
			};
		} catch {
			worker = null;
		}
		const run = (next) => {
			ms = next;
			if (worker) worker.postMessage(ms);
			else useTimer();
		};
		return {
			start: run,
			stop: () => run(0),
			dispose: () => {
				run(0);
				worker?.terminate();
			},
		};
	}

	function loadPlace() {
		const fallback = { left: null, top: null, mini: false };
		try {
			return { ...fallback, ...JSON.parse(localStorage.getItem(PLACE_KEY) ?? "{}") };
		} catch {
			return fallback;
		}
	}

	function savePlace() {
		try {
			localStorage.setItem(PLACE_KEY, JSON.stringify(place));
		} catch {}
	}

	function loadSetup() {
		try {
			const saved = JSON.parse(localStorage.getItem(SETUP_KEY) ?? "null");
			return saved && typeof saved === "object" ? { point: saved.point, interval: saved.interval, max: saved.max } : null;
		} catch {
			return null;
		}
	}

	function saveSetup() {
		try {
			localStorage.setItem(SETUP_KEY, JSON.stringify({ point: state.point, interval: state.interval, max: state.max }));
		} catch {}
	}

	function clamp(value, min, max) {
		return Math.min(Math.max(value, min), Math.max(min, max));
	}

	function applyPlace() {
		const { panel } = ui;
		if (place.left == null || !panel.isConnected) return;
		place.left = clamp(place.left, 8, innerWidth - panel.offsetWidth - 8);
		place.top = clamp(place.top, 8, innerHeight - panel.offsetHeight - 8);
		Object.assign(panel.style, { left: `${place.left}px`, top: `${place.top}px`, right: "auto", bottom: "auto" });
	}

	function mount() {
		if (ui.root.isConnected || !document.documentElement) return;
		document.documentElement.append(ui.root);
		render();
		applyPlace();
	}

	function placeGuide(x, y) {
		const show = x != null;
		ui.guideH.hidden = ui.guideV.hidden = ui.bubble.hidden = !show;
		if (!show) return;
		ui.guideH.style.top = `${y}px`;
		ui.guideV.style.left = `${x}px`;
		ui.bubble.textContent = `${Math.round(x)}, ${Math.round(y)}`;
		const width = ui.bubble.offsetWidth;
		const left = x + 14 + width > innerWidth ? x - 14 - width : x + 14;
		const top = y + 40 > innerHeight ? y - 32 : y + 14;
		ui.bubble.style.left = `${left}px`;
		ui.bubble.style.top = `${top}px`;
	}

	function render() {
		const { point, running, picking } = state;
		const mode = running ? "run" : picking ? "pick" : point ? "idle" : "wait";
		const label = { run: "Clicando", pick: "Marcando", idle: "Pronto", wait: "Sem ponto" }[mode];
		ui.pill.className = `pill ${mode}`;
		ui.pillText.textContent = place.mini && state.clicks ? `${label} · ${fmt(state.clicks)}` : label;
		ui.panel.classList.toggle("mini", place.mini);
		ui.panel.classList.toggle("picking", picking);
		ui.mini.textContent = place.mini ? "+" : "–";
		ui.mini.title = place.mini ? "Abrir o painel" : "Recolher o painel";
		ui.count.textContent = state.max ? `${fmt(state.clicks)} / ${fmt(state.max)}` : fmt(state.clicks);
		ui.rate.textContent = `${fmt(1000 / state.interval, 1)} por segundo`;
		ui.coord.textContent = point ? `${point.x}, ${point.y}` : "não marcado";
		ui.coord.classList.toggle("empty", !point);
		if (ui.shadow.activeElement !== ui.interval) ui.interval.value = String(state.interval);
		ui.chips.forEach((chip, i) => chip.classList.toggle("on", PRESETS[i] === state.interval));
		ui.pick.textContent = picking ? "Cancelar" : point ? "Remarcar" : "Marcar ponto";
		ui.toggle.textContent = running ? "Parar" : "Iniciar";
		ui.toggle.classList.toggle("on", running);
		ui.toggle.disabled = !running && !point;
		ui.miss.textContent = state.miss;
		ui.overlay.hidden = ui.banner.hidden = !picking;
		ui.target.hidden = !point;
		ui.target.classList.toggle("running", running);
		if (point) {
			ui.target.style.left = `${point.x}px`;
			ui.target.style.top = `${point.y}px`;
			ui.tag.textContent = `${point.x}, ${point.y}`;
		}
		if (!picking) placeGuide(dragging ? point?.x : null, point?.y);
	}

	function fromUi(event) {
		const path = event.composedPath();
		return path.includes(ui.panel) || path.includes(ui.banner);
	}

	function typing(event) {
		const el = event.composedPath()[0];
		return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
	}

	function setPoint(x, y) {
		state.point = { x: Math.round(clamp(x, 0, innerWidth - 1)), y: Math.round(clamp(y, 0, innerHeight - 1)) };
		state.miss = "";
		saveSetup();
		render();
		if (!dragging) dodge();
	}

	function dodge() {
		const { point } = state;
		const rect = ui.panel.getBoundingClientRect();
		const margin = 28;
		const covered =
			point.x > rect.left - margin &&
			point.x < rect.right + margin &&
			point.y > rect.top - margin &&
			point.y < rect.bottom + margin;
		if (!covered || !ui.panel.isConnected) return;
		place.left = point.x > innerWidth / 2 ? 16 : innerWidth - rect.width - 16;
		place.top = rect.top;
		if (place.left + rect.width + margin > point.x && point.x > place.left - margin) {
			place.left = rect.left;
			place.top = point.y > innerHeight / 2 ? 16 : innerHeight - rect.height - 16;
		}
		applyPlace();
		savePlace();
	}

	function flash() {
		ui.pulse.animate(PULSE, { duration: 650, easing: "cubic-bezier(.2, .7, .3, 1)", iterations: 2 });
	}

	function markAtMouse() {
		if (mouse.x == null) return pick();
		stopPick();
		setPoint(mouse.x, mouse.y);
		flash();
	}

	function pick() {
		if (state.picking) return;
		if (state.running) stop();
		state.picking = true;
		for (const type of PICK_EVENTS) window.addEventListener(type, onPickEvent, true);
		render();
		placeGuide(mouse.x, mouse.y);
	}

	function stopPick() {
		if (!state.picking) return;
		state.picking = false;
		for (const type of PICK_EVENTS) window.removeEventListener(type, onPickEvent, true);
		render();
	}

	function onPickEvent(event) {
		if (fromUi(event)) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		if (event.type === "pointerdown" || event.type === "mousedown") setPoint(event.clientX, event.clientY);
		if (event.type !== "click") return;
		stopPick();
		setPoint(event.clientX, event.clientY);
		flash();
	}

	function onMouseMove(event) {
		mouse.x = event.clientX;
		mouse.y = event.clientY;
		if (state.picking) placeGuide(mouse.x, mouse.y);
	}

	function onKey(event) {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		const key = String(event.key ?? "");
		const arrow = ARROWS[key];
		const step = event.shiftKey ? 10 : 1;
		let action = null;
		if (key === "Escape" && state.picking) action = stopPick;
		else if (arrow && state.point && ui.shadow.activeElement === ui.target)
			action = () => setPoint(state.point.x + arrow[0] * step, state.point.y + arrow[1] * step);
		else if (key.toLowerCase() === "m" && !typing(event)) action = markAtMouse;
		if (!action) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		if (event.type === "keydown") action();
	}

	function onResize() {
		applyPlace();
		render();
	}

	function follow(event, onMove, onEnd) {
		const el = event.currentTarget;
		el.setPointerCapture(event.pointerId);
		el.addEventListener("pointermove", onMove);
		el.addEventListener(
			"lostpointercapture",
			() => {
				el.removeEventListener("pointermove", onMove);
				onEnd();
			},
			{ once: true },
		);
	}

	function onPanelDown(event) {
		if (event.button !== 0 || event.target.closest("button")) return;
		event.preventDefault();
		const rect = ui.panel.getBoundingClientRect();
		const dx = event.clientX - rect.left;
		const dy = event.clientY - rect.top;
		ui.panel.classList.add("moving");
		follow(
			event,
			(move) => {
				place.left = move.clientX - dx;
				place.top = move.clientY - dy;
				applyPlace();
			},
			() => {
				ui.panel.classList.remove("moving");
				savePlace();
			},
		);
	}

	function onTargetDown(event) {
		if (event.button !== 0 || !state.point) return;
		event.preventDefault();
		event.stopPropagation();
		ui.target.focus({ preventScroll: true });
		const dx = state.point.x - event.clientX;
		const dy = state.point.y - event.clientY;
		dragging = true;
		ui.target.classList.add("dragging");
		render();
		follow(
			event,
			(move) => setPoint(move.clientX + dx, move.clientY + dy),
			() => {
				dragging = false;
				ui.target.classList.remove("dragging");
				render();
				dodge();
			},
		);
	}

	function fire(x, y) {
		if (x >= innerWidth || y >= innerHeight) {
			state.miss = "O ponto ficou fora da janela — marque de novo";
			return false;
		}
		ui.layer.classList.add("ghost");
		const target = document.elementFromPoint(x, y) ?? document.body;
		ui.layer.classList.remove("ghost");
		const init = {
			bubbles: true,
			cancelable: true,
			view: window,
			clientX: x,
			clientY: y,
			screenX: x + window.screenX,
			screenY: y + window.screenY,
			button: 0,
			buttons: 1,
		};
		const press = (detail) => {
			for (const type of ["mousedown", "mouseup", "click"]) target.dispatchEvent(new MouseEvent(type, { ...init, detail }));
		};
		const now = performance.now();
		const double = now - lastFire >= DOUBLE_AFTER_MS;
		lastFire = now;
		press(1);
		if (double) {
			press(2);
			target.dispatchEvent(new MouseEvent("dblclick", { ...init, detail: 2 }));
		}
		ui.pulse.animate(PULSE, { duration: 420, easing: "cubic-bezier(.2, .7, .3, 1)" });
		ui.dot.animate([{ transform: "scale(.4)" }, { transform: "scale(1)" }], { duration: 160 });
		return true;
	}

	function tick() {
		if (!state.running || dragging || !state.point) return;
		if (fire(state.point.x, state.point.y)) {
			state.clicks++;
			state.miss = "";
		}
		if (state.max && state.clicks >= state.max) stop();
		else render();
	}

	function setIntervalMs(value) {
		const ms = Number(value);
		if (Number.isFinite(ms) && ms >= 10) {
			state.interval = Math.round(ms);
			if (state.running) ticker.start(state.interval);
			saveSetup();
		}
		render();
	}

	function setMax(value) {
		const n = Number(value);
		state.max = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
		saveSetup();
		render();
	}

	function start(ms) {
		if (ms != null) setIntervalMs(ms);
		if (!state.point) {
			state.miss = "Marque o ponto primeiro";
			return render();
		}
		if (state.running) return;
		stopPick();
		state.running = true;
		state.clicks = 0;
		lastFire = Number.NEGATIVE_INFINITY;
		state.miss = "";
		ticker.start(state.interval);
		tick();
	}

	function stop() {
		state.running = false;
		ticker.stop();
		render();
	}

	function toggleRun() {
		return state.running ? stop() : start();
	}

	function restore(saved) {
		state.point = saved.point ?? state.point;
		state.interval = saved.interval ?? state.interval;
		state.max = saved.max ?? state.max;
		state.clicks = saved.clicks ?? state.clicks;
		if (saved.running && state.point) {
			state.running = true;
			ticker.start(state.interval);
		}
		render();
	}

	function destroy() {
		stop();
		stopPick();
		clearInterval(tracker);
		ticker.dispose();
		window.removeEventListener("mousemove", onMouseMove, true);
		window.removeEventListener("resize", onResize);
		document.removeEventListener("DOMContentLoaded", mount);
		for (const type of KEY_EVENTS) window.removeEventListener(type, onKey, true);
		ui.root.remove();
		delete window.autoclick;
	}

	window.autoclick = {
		version: VERSION,
		pick,
		cancelPick: stopPick,
		start,
		stop,
		toggle: toggleRun,
		at: setPoint,
		interval: setIntervalMs,
		max: setMax,
		status: () => ({
			...JSON.parse(JSON.stringify(state)),
			view: { w: innerWidth, h: innerHeight },
			title: document.title,
			url: location.href,
		}),
		destroy,
		_restore: restore,
	};

	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
	else mount();
	const saved = carried ?? loadSetup();
	if (saved) restore(saved);
})();
