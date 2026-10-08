const TITLE = "Mira: abrir / fechar o painel";
const UNSUPPORTED = "A Mira não funciona nesta página";

async function warn(tabId) {
	await chrome.action.setBadgeBackgroundColor({ tabId, color: "#f43f5e" });
	await chrome.action.setBadgeText({ tabId, text: "!" });
	await chrome.action.setTitle({ tabId, title: UNSUPPORTED });
	setTimeout(() => {
		chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
		chrome.action.setTitle({ tabId, title: TITLE }).catch(() => {});
	}, 3000);
}

async function toggle(tab) {
	const target = { tabId: tab.id };
	try {
		const [{ result: closed }] = await chrome.scripting.executeScript({
			target,
			func: () => {
				if (!window.autoclick) return false;
				window.autoclick.destroy();
				return true;
			},
		});
		if (!closed) await chrome.scripting.executeScript({ target, files: ["autoclick.js"] });
	} catch {
		await warn(tab.id);
	}
}

chrome.action.onClicked.addListener(toggle);
