let swapRate = 0.05;
let autoTransform = true;
let activeTooltip = null;

const originalTextMap = new Map();

// UNIFIED MESSAGE LISTENER
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "TRANSFORM_PAGE") {
        swapRate = request.rate !== undefined ? request.rate : swapRate;
        const dictionary = window.LEXITRON_ET || {};
        
        try {
            transformWebPage(swapRate, dictionary);
            sendResponse({ status: "Manual transformation layer applied." });
        } catch (e) {
            sendResponse({ status: "Error executing transformation layout.", error: e.message });
        }
    } 
    else if (request.action === "REVERT_PAGE") {
        restoreOriginalPage();
        sendResponse({ status: "Page reverted to original." });
    }
    return true; // Keeps the message channel open for async responses
});

// UNIFIED TRANSFORMATION LOGIC WITH CACHING
function transformWebPage(rate, dict) {
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                const parent = node.parentNode;
                if (!parent) return NodeFilter.FILTER_REJECT;
                
                const parentTag = parent.tagName.toUpperCase();
                const ignoredTags = ['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT', 'CODE', 'PRE', 'HEAD'];
                
                return ignoredTags.includes(parentTag) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let textNode;
    while ((textNode = walker.nextNode())) {
        if (!originalTextMap.has(textNode)) {
            originalTextMap.set(textNode, textNode.nodeValue);
        }

        const baseText = originalTextMap.get(textNode);
        if (!baseText || !baseText.trim()) continue;

        let transformedText = "";
        const tokens = baseText.split(/(\s+|\b)/);
        
        for (const token of tokens) {
            const cleanKey = token.toLowerCase().trim();
            const matchTranslation = dict[cleanKey]?.[0]?.t;

            if (cleanKey && matchTranslation && Math.random() < rate) {
                const leadSpace = token.match(/^\s*/)?.[0] || '';
                const trailSpace = token.match(/\s*$/)?.[0] || '';
                transformedText += leadSpace + matchTranslation + trailSpace;
            } else {
                transformedText += token;
            }
        }
        textNode.nodeValue = transformedText;
    }
}

// RESTORE PAGE FROM CACHE
function restoreOriginalPage() {
    for (const [node, originalText] of originalTextMap.entries()) {
        if (node && node.parentNode) {
            node.nodeValue = originalText;
        }
    }
    originalTextMap.clear();
}

// INITIAL STARTUP FROM STORAGE
chrome.storage.local.get(['autoTransform', 'swapRate'], (settings) => {
    autoTransform = settings.autoTransform !== false;
    swapRate = settings.swapRate !== undefined ? settings.swapRate : 0.05;

    if (autoTransform) {
        const dictionary = window.LEXITRON_ET || {};
        if (Object.keys(dictionary).length > 0) {
            transformWebPage(swapRate, dictionary);
        }
    }
});

// TOOLTIP & SELECTION SYNC LOGIC
document.addEventListener('mouseup', (event) => {
    setTimeout(() => {
        const selection = window.getSelection();
        const rawText = selection.toString();
        const selectedText = rawText.replace(/\s+/g, ' ').trim();

        if (activeTooltip?.contains(event.target)) return;

        removeTooltip();

        if (!selectedText) return;

        // Save selected text to storage so popup opens with it immediately
        chrome.storage.local.set({ pendingLookup: selectedText });

        const dict = window.LEXITRON_ET || {};
        const cleanKey = selectedText.toLowerCase();
        const matches = dict[cleanKey];

        if (matches && matches.length > 0) {
            const range = selection.getRangeAt(0);
            const selectionRect = range.getBoundingClientRect();
            createTooltip(matches, cleanKey, selectionRect);
        }
    }, 10);
});

function createTooltip(matches, word, rect) {
    activeTooltip = document.createElement('div');
    activeTooltip.id = 'pasa-hover-tooltip';
    
    Object.assign(activeTooltip.style, {
        position: 'fixed',
        zIndex: '2147483647',
        backgroundColor: '#1a2333',
        color: '#ffffff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        padding: '10px 14px',
        borderRadius: '8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        border: '1px solid #223a5e',
        maxWidth: '280px',
        pointerEvents: 'auto',
        transition: 'opacity 0.15s ease'
    });

    const entriesHtml = matches.map((match, idx) => `
        <div style="margin-bottom: ${idx < matches.length - 1 ? '6px' : '0'};">
            <span style="color: #2ec4b6; font-weight: bold;">${match.t}</span>
            <span style="color: #88a0c0; font-size: 11px;">(${match.c || 'POS'})</span>
            ${match.r ? `<div style="color: #a0aec0; font-size: 11px; font-style: italic; margin-top: 2px;">Context: ${match.r}</div>` : ''}
            ${idx < matches.length - 1 ? '<hr style="border: 0; border-top: 1px solid #2d2d2d; margin: 6px 0;">' : ''}
        </div>
    `).join('');

    activeTooltip.innerHTML = `
        <div style="font-weight: 800; text-transform: uppercase; color: #3894ff; margin-bottom: 6px; font-size: 11px; letter-spacing: 0.5px;">
            ${word} ➔
        </div>
        <div>${entriesHtml}</div>
    `;

    document.body.appendChild(activeTooltip);

    const tooltipWidth = activeTooltip.offsetWidth;
    const tooltipHeight = activeTooltip.offsetHeight;
    
    let top = rect.top - tooltipHeight - 8;
    let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);

    if (top < 10) top = rect.bottom + 8;
    if (left < 10) left = 10;
    if (left + tooltipWidth > window.innerWidth - 10) {
        left = window.innerWidth - tooltipWidth - 10;
    }

    activeTooltip.style.top = `${top}px`;
    activeTooltip.style.left = `${left}px`;
}

function removeTooltip() {
    if (activeTooltip) {
        activeTooltip.remove();
        activeTooltip = null;
    }
}

document.addEventListener('scroll', removeTooltip, { passive: true });