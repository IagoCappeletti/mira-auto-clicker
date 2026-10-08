#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { clearLine, createInterface, cursorTo } from "node:readline";
import { parseArgs } from "node:util";

const BROWSERS = {
	brave: "Brave Browser",
	chrome: "Google Chrome",
	edge: "Microsoft Edge",
	vivaldi: "Vivaldi",
	chromium: "Chromium",
};
const PAGE_SCRIPT = readFileSync(new URL("./extensao/autoclick.js", import.meta.url), "utf8");
const ABSENT = "__autoclick_ausente__";
const VERSION = Number(/const VERSION = (\d+)/.exec(PAGE_SCRIPT)[1]);

const COMMANDS = `Comandos:
  m, marcar           traz o navegador para a frente: clique no ponto onde ele deve ficar clicando
  ponto <x> <y>       põe a mira numa coordenada exata (a mesma que aparece no painel)
  Enter               inicia / para
  t, intervalo <ms>   muda o intervalo entre cliques
  x, max <n>          para sozinho depois de n cliques (0 = sem limite)
  s, status           mostra aba, ponto, intervalo e cliques
  aba                 passa a usar a aba que está na frente agora
  abas                lista as abas abertas; "aba <número>" escolhe uma delas
  ?, ajuda            esta lista
  q, sair             para, tira a mira da página e sai

Direto na página:
  M                   marca o ponto onde o mouse está (fora de campo de texto)
  arrastar a mira     ajusta o ponto; clicando nela, as setas movem 1 px (Shift: 10 px)
  arrastar o topo     muda o painel de lugar; "–" recolhe o painel`;

const HELP = `Uso: node autoclick.mjs [opções]

Controla pelo terminal um navegador que já está aberto (não abre outro).
Clica sempre no mesmo ponto da aba, com a mesma mira da extensão.

Opções:
  -n, --navegador <nome>   ${Object.keys(BROWSERS).join(", ")}
                           (sem isso, usa o que estiver aberto ou pergunta qual)
  -i, --intervalo <ms>     tempo entre cliques (padrão 500)
  -m, --max <n>            para sozinho depois de n cliques
  -h, --ajuda              mostra esta ajuda

Uma vez só, no navegador: Ver > Desenvolvedor > Permitir o JavaScript dos Eventos da Apple.

${COMMANDS}`;

let parsed;
try {
	parsed = parseArgs({
		options: {
			navegador: { type: "string", short: "n" },
			intervalo: { type: "string", short: "i" },
			max: { type: "string", short: "m" },
			ajuda: { type: "boolean", short: "h", default: false },
		},
	});
} catch (error) {
	console.error(`${error.message}\n\n${HELP}`);
	process.exit(1);
}
const opts = parsed.values;
if (opts.ajuda) {
	console.log(HELP);
	process.exit(0);
}

const session = { app: "", pid: 0, tab: null, mirror: null, list: [], error: "", startup: true };
let rl = null;
let closing = false;
let queue = Promise.resolve();

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const clip = (text, size) => (text.length > size ? `${text.slice(0, size - 1)}…` : text);
const plural = (n) => `${n} clique${n === 1 ? "" : "s"}`;
const js = (value) => JSON.stringify(value);
const where = (point) => `${point.x}, ${point.y}`;

function log(message) {
	if (!rl) return console.log(message);
	if (process.stdout.isTTY) {
		cursorTo(process.stdout, 0);
		clearLine(process.stdout, 0);
	}
	process.stdout.write(`${message}\n`);
	rl.prompt(true);
}

function fail(message) {
	console.error(message);
	process.exit(1);
}

function osa(source, ...args) {
	return new Promise((resolve, reject) => {
		execFile(
			"osascript",
			["-l", "JavaScript", "-e", source, String(session.pid), ...args.map(String)],
			{ maxBuffer: 16 * 1024 * 1024 },
			(error, stdout, stderr) => {
				if (!error) return resolve(stdout.replace(/\n$/, ""));
				const match = /execution error: (?:Error: )*([\s\S]*?) \((-?\d+)\)\s*$/.exec(stderr);
				let message = match ? match[1].trim() : stderr.trim() || error.message;
				let code = null;
				const tagged = /^([A-Z_]+)\|([\s\S]*)$/.exec(message);
				if (tagged) [, code, message] = tagged;
				else if (/can't be found|isn't running|not running/i.test(message)) code = "BROWSER_CLOSED";
				reject(Object.assign(new Error(message), { code }));
			},
		);
	});
}

function serial(task) {
	const next = queue.then(task, task);
	queue = next.catch(() => {});
	return next;
}

const SCRIPTS = {
	front: `function run(argv) {
		const app = Application(Number(argv[0]));
		if (!app.windows.length) throw new Error("TAB_CLOSED|O navegador está sem nenhuma janela aberta");
		const tab = app.windows[0].activeTab;
		return JSON.stringify({ id: tab.id(), title: tab.title(), url: tab.url() });
	}`,
	tabs: `function run(argv) {
		const app = Application(Number(argv[0]));
		const out = [];
		for (const w of app.windows()) {
			const ids = w.tabs.id();
			const titles = w.tabs.title();
			const urls = w.tabs.url();
			const active = w.activeTabIndex();
			ids.forEach((id, i) => out.push({ id, title: titles[i], url: urls[i], active: i + 1 === active }));
		}
		return JSON.stringify(out);
	}`,
	exec: `function run(argv) {
		const app = Application(Number(argv[0]));
		const wanted = Number(argv[1]);
		for (const w of app.windows()) {
			const found = w.tabs.whose({ id: wanted })();
			if (found.length) return found[0].execute({ javascript: argv[2] });
		}
		throw new Error("TAB_CLOSED|A aba escolhida foi fechada");
	}`,
	focus: `function run(argv) {
		const app = Application(Number(argv[0]));
		const wanted = Number(argv[1]);
		for (const w of app.windows()) {
			const i = w.tabs.id().indexOf(wanted);
			if (i < 0) continue;
			w.activeTabIndex = i + 1;
			w.index = 1;
			app.activate();
			return "ok";
		}
		throw new Error("TAB_CLOSED|A aba escolhida foi fechada");
	}`,
};

function pidOf(app) {
	return new Promise((resolve) =>
		execFile("pgrep", ["-x", app], (error, stdout) => resolve(error ? 0 : Number(stdout.trim().split("\n")[0]))),
	);
}

function alive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function question(prompt) {
	return new Promise((resolve) => rl.question(prompt, resolve));
}

async function chooseBrowser() {
	if (opts.navegador) {
		const wanted = opts.navegador.toLowerCase();
		const app = BROWSERS[wanted] ?? Object.values(BROWSERS).find((name) => name.toLowerCase() === wanted);
		if (!app) fail(`Navegador desconhecido: ${opts.navegador}. Use um destes: ${Object.keys(BROWSERS).join(", ")}.`);
		const pid = await pidOf(app);
		if (!pid) fail(`O ${app} não está aberto. Abra ele e rode de novo (este comando não abre navegador).`);
		return { app, pid };
	}
	const open = [];
	for (const app of Object.values(BROWSERS)) {
		const pid = await pidOf(app);
		if (pid) open.push({ app, pid });
	}
	if (open.length === 0) fail(`Nenhum navegador compatível aberto (${Object.values(BROWSERS).join(", ")}).`);
	if (open.length === 1) return open[0];
	log(`Navegadores abertos:\n${open.map(({ app }, i) => `  ${i + 1}) ${app}`).join("\n")}`);
	const answer = await question("Qual usar? [1] ");
	return open[Number(answer) - 1] ?? open[0];
}

function runInTab(source) {
	if (!session.tab) return Promise.reject(Object.assign(new Error("Nenhuma aba escolhida"), { code: "TAB_CLOSED" }));
	return serial(() => osa(SCRIPTS.exec, session.tab.id, source));
}

async function page(expression) {
	const out = await runInTab(
		`(() => { const a = window.autoclick; if (a?.version !== ${VERSION}) return ${js(ABSENT)}; ${expression}; return JSON.stringify(a.status()); })()`,
	);
	if (out === ABSENT) return null;
	if (!out.startsWith("{")) throw Object.assign(new Error("O navegador não respondeu a tempo"), { code: "BUSY" });
	return JSON.parse(out);
}

async function inject() {
	const out = await runInTab(`${PAGE_SCRIPT}\n;window.autoclick?.version === ${VERSION} ? "ok" : "falhou"`);
	if (out !== "ok") throw new Error("Não consegui colocar o autoclick nessa página");
	const saved = session.mirror;
	if (!saved) return;
	await page(`a._restore(${js(saved)})`);
	if (saved.point) log(`↻ A página recarregou; a mira voltou${saved.running ? " e segue clicando" : ""}.`);
}

async function act(expression = "") {
	let status = await page(expression);
	if (!status) {
		await inject();
		status = await page(expression);
	}
	apply(status);
	return status;
}

function apply(next) {
	if (!next) return;
	const prev = session.mirror ?? {};
	session.mirror = next;
	const samePoint = js(next.point) === js(prev.point ?? null);
	if (next.picking && !prev.picking) {
		log(`No ${session.app}: clique no ponto, ou passe o mouse em cima e aperte M (Esc cancela).`);
	}
	if (next.point && !samePoint) log(`◎ Ponto: ${where(next.point)}.`);
	if (!next.picking && prev.picking && samePoint) log("Marcação cancelada.");
	if (prev.interval != null && next.interval !== prev.interval) log(`Intervalo: ${next.interval} ms.`);
	if (prev.max != null && next.max !== prev.max) log(next.max ? `Para sozinho em ${next.max} cliques.` : "Sem limite de cliques.");
	if (next.running && !prev.running) {
		const limit = next.max ? ` até ${next.max} cliques` : "";
		log(`▶ Clicando em ${where(next.point)} a cada ${next.interval} ms${limit}. Enter para parar.`);
	}
	if (!next.running && prev.running) {
		log(`■ Parou${next.max && next.clicks >= next.max ? " (chegou no limite)" : ""}: ${plural(next.clicks)}.`);
	}
	if (next.miss !== (prev.miss ?? "")) {
		if (next.miss) log(`⚠ ${next.miss}`);
		else if (prev.miss) log("✓ Voltou a clicar.");
	}
}

function noteError(message) {
	if (message === session.error) return;
	if (message) log(`✖ ${message}`);
	else if (session.error) log("✓ Conectado.");
	session.error = message;
}

async function handle(error) {
	if (error.code === "BROWSER_CLOSED" || !alive(session.pid)) {
		log(`O ${session.app} foi fechado.`);
		return shutdown();
	}
	if (error.code === "TAB_CLOSED") {
		session.tab = null;
		session.mirror = null;
		session.error = "";
		return log(`${error.message}. Digite "aba" para usar a aba da frente ou "abas" para escolher.`);
	}
	if (error.code === "BUSY") return;
	noteError(error.message);
}

async function lockTab(tab) {
	const sameTab = session.tab?.id === tab.id;
	if (session.tab && !sameTab) {
		await runInTab("(() => { window.autoclick?.destroy(); return 'ok'; })()").catch(() => {});
	}
	const settings = session.mirror ? { interval: session.mirror.interval, max: session.mirror.max } : null;
	session.mirror = sameTab ? session.mirror : settings;
	session.tab = tab;
	session.error = "";
	if (!sameTab) log(`Aba: ${clip(tab.title || "(sem título)", 60)} — ${clip(tab.url, 80)}`);
	await act();
}

async function lockFront() {
	await lockTab(JSON.parse(await serial(() => osa(SCRIPTS.front))));
}

async function listTabs() {
	session.list = JSON.parse(await serial(() => osa(SCRIPTS.tabs)));
	const rows = session.list.map((tab, i) => {
		const mark = tab.id === session.tab?.id ? "●" : tab.active ? "›" : " ";
		return `${String(i + 1).padStart(3)} ${mark} ${clip(tab.title || "(sem título)", 50)} — ${clip(tab.url, 60)}`;
	});
	log(`${rows.join("\n")}\n● em uso   › aba da frente de cada janela`);
}

async function chooseTab(arg) {
	if (!arg) return lockFront();
	if (!session.list.length) await listTabs();
	const tab = session.list[Number(arg) - 1];
	if (!tab) return log(`Não existe a aba ${arg}. Digite "abas" para ver a lista.`);
	await lockTab(tab);
}

async function pick() {
	await lockFront();
	await act("a.pick()");
	await serial(() => osa(SCRIPTS.focus, session.tab.id)).catch(() => {});
}

async function status() {
	const s = await act();
	log(
		[
			`Navegador: ${session.app}`,
			`Aba:       ${clip(s.title || "(sem título)", 60)} — ${clip(s.url, 80)}`,
			`Ponto:     ${s.point ? where(s.point) : "nenhum"}${s.view ? ` (janela ${s.view.w}×${s.view.h})` : ""}`,
			`Intervalo: ${s.interval} ms${s.max ? ` · para em ${s.max}` : ""}`,
			`Estado:    ${s.running ? "clicando" : s.picking ? "marcando" : "parado"} · ${plural(s.clicks)}${s.miss ? ` · ${s.miss}` : ""}`,
		].join("\n"),
	);
}

async function command(line) {
	const name = line.split(/\s+/, 1)[0].toLowerCase();
	const arg = line.slice(name.length).trim();
	if (!session.tab && !["abas", "aba", "m", "marcar", "?", "ajuda", "q", "sair"].includes(name)) {
		return log('Nenhuma aba em uso. Digite "aba" para usar a da frente ou "abas" para escolher.');
	}
	switch (name) {
		case "":
			return act("a.toggle()");
		case "m":
		case "marcar":
			return pick();
		case "ponto": {
			const [x, y] = arg.split(/[\s,]+/).map(Number);
			if (!(x >= 0 && y >= 0)) return log("Use: ponto <x> <y>, por exemplo: ponto 1400 745");
			return act(`a.at(${x}, ${y})`);
		}
		case "i":
		case "iniciar":
			return act(`a.start(${arg ? js(arg) : ""})`);
		case "p":
		case "parar":
			return act("a.stop()");
		case "t":
		case "intervalo":
			if (!(Number(arg) >= 10)) return log("Intervalo inválido (mínimo 10 ms).");
			return act(`a.interval(${js(arg)})`);
		case "x":
		case "max":
			return act(`a.max(${js(arg || 0)})`);
		case "s":
		case "status":
			return status();
		case "aba":
			return chooseTab(arg);
		case "abas":
			return listTabs();
		case "?":
		case "ajuda":
			return log(COMMANDS);
		case "q":
		case "sair":
			return shutdown();
		default:
			log(`Comando desconhecido: ${name}. Digite ? para ver os comandos.`);
	}
}

async function applyStartup() {
	if (opts.intervalo) await act(`a.interval(${js(opts.intervalo)})`);
	if (opts.max) await act(`a.max(${js(opts.max)})`);
	session.startup = false;
}

async function poll() {
	while (!closing) {
		try {
			if (session.tab) {
				await act();
				noteError("");
				if (session.startup) await applyStartup();
			} else if (!alive(session.pid)) {
				log(`O ${session.app} foi fechado.`);
				return shutdown();
			}
		} catch (error) {
			await handle(error);
		}
		const s = session.mirror;
		await sleep(s?.picking ? 300 : s?.running ? 1000 : 2000);
	}
}

async function shutdown() {
	if (closing) return;
	closing = true;
	if (session.tab) {
		await runInTab("(() => { window.autoclick?.destroy(); return 'ok'; })()").catch(() => {});
	}
	rl?.close();
	process.exit(0);
}

rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "autoclick> " });
Object.assign(session, await chooseBrowser());
log(`Usando o ${session.app}.`);

rl.on("line", (line) => {
	command(line.trim()).catch((error) =>
		error.code && error.code !== "BUSY" ? handle(error) : log(`✖ ${error.message}. Tente de novo.`),
	);
});
rl.on("close", shutdown);
rl.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
	await lockFront();
	await applyStartup();
} catch (error) {
	await handle(error);
}
log('Pronto. "m" marca o ponto, Enter inicia/para, "?" mostra os comandos.');
poll();
