chrome.runtime.onInstalled.addListener(async () => {
    await chrome.storage.local.set({
        autoTransform: true,
        swapRate: 0.15,
        currentMode: "ENG_TO_THAI"
    });

    chrome.contextMenus.create({
        id: "lookup-pasa-matrix",
        title: "Look up '%s' in PasaMatrix",
        contexts: ["selection"]
    });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "lookup-pasa-matrix" && info.selectionText) {
        const textQuery = info.selectionText.trim();
        await chrome.storage.local.set({ pendingLookup: textQuery });
        await chrome.action.setBadgeText({ text: "คำ" });
        await chrome.action.setBadgeBackgroundColor({ color: "#2ec4b6" });
    }
});

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "popup") {
        chrome.action.setBadgeText({ text: "" });
    }
});

chrome.commands.onCommand.addListener((command) => {
    if (command === "transform-page") {
        chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
            if (!activeTab?.id) return;

            chrome.storage.local.get(['swapRate'], (settings) => {
                const rate = settings.swapRate !== undefined ? settings.swapRate : 0.05;

                chrome.tabs.sendMessage(activeTab.id, {
                    action: "TRANSFORM_PAGE",
                    rate: rate
                });
            });
        });
    }
});