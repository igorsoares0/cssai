// CSS Scan Tool - Background Script

class CSSToolBackground {
    constructor() {
        this.scannerStates = new Map(); // Track per-tab scanner state
        this.init();
    }

    init() {
        // Listen for extension icon clicks
        chrome.action.onClicked.addListener((tab) => {
            this.toggleScanner(tab);
        });

        // Listen for messages from popup or content script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async response
        });

        // Clean up tab states when tabs are closed
        chrome.tabs.onRemoved.addListener((tabId) => {
            this.scannerStates.delete(tabId);
        });

        // Update icon initially
        this.updateIcon();
    }

    async toggleScanner(tab) {
        const currentState = this.scannerStates.get(tab.id) || false;
        const newState = !currentState;
        
        try {
            // Send message to content script to toggle scanner
            const response = await chrome.tabs.sendMessage(tab.id, { 
                action: 'toggle-scanner' 
            });
            
            if (response && typeof response.enabled !== 'undefined') {
                this.scannerStates.set(tab.id, response.enabled);
                this.updateIcon(response.enabled);
                this.updateBadge(response.enabled);
            }
        } catch (error) {
            console.log('Content script not available:', error);
            // Try to enable for next time page loads
            this.scannerStates.set(tab.id, newState);
        }
    }

    async handleMessage(message, sender, sendResponse) {
        const tabId = sender.tab ? sender.tab.id : null;
        
        try {
            switch (message.action) {
                case 'get-status':
                    if (!sender.tab) {
                        // Message from popup, need to get current tab
                        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        const currentTabEnabled = tab ? (this.scannerStates.get(tab.id) || false) : false;
                        sendResponse({ enabled: currentTabEnabled });
                    } else {
                        const isEnabled = this.scannerStates.get(sender.tab.id) || false;
                        sendResponse({ enabled: isEnabled });
                    }
                    break;
                    
                case 'enable-scanner':
                    if (!sender.tab) {
                        // Message from popup, need to get current tab
                        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (!tab) {
                            sendResponse({ error: 'Nenhuma aba ativa encontrada' });
                            return;
                        }
                        await this.enableScanner(tab);
                        const enabledState = this.scannerStates.get(tab.id) || false;
                        sendResponse({ enabled: enabledState });
                    } else {
                        await this.enableScanner(sender.tab);
                        const enabledState = this.scannerStates.get(sender.tab.id) || false;
                        sendResponse({ enabled: enabledState });
                    }
                    break;
                    
                case 'disable-scanner':
                    if (!sender.tab) {
                        // Message from popup, need to get current tab
                        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (!tab) {
                            sendResponse({ error: 'Nenhuma aba ativa encontrada' });
                            return;
                        }
                        await this.disableScanner(tab);
                        const disabledState = this.scannerStates.get(tab.id) || false;
                        sendResponse({ enabled: disabledState });
                    } else {
                        await this.disableScanner(sender.tab);
                        const disabledState = this.scannerStates.get(sender.tab.id) || false;
                        sendResponse({ enabled: disabledState });
                    }
                    break;
                    
                case 'scanner-ready':
                    // Content script is ready, sync state
                    const savedState = tabId ? (this.scannerStates.get(tabId) || false) : false;
                    sendResponse({ shouldEnable: savedState });
                    break;
                    
                case 'copy-to-clipboard':
                    sendResponse({ success: true });
                    break;
                    
                default:
                    sendResponse({ error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ error: error.message });
        }
    }

    async enableScanner(tab) {
        try {
            this.scannerStates.set(tab.id, true);
            this.updateIcon(true);
            this.updateBadge(true);
            
            console.log('Sending enable-scanner to tab:', tab.id);
            
            try {
                const response = await chrome.tabs.sendMessage(tab.id, { 
                    action: 'enable-scanner' 
                });
                console.log('Content script response:', response);
            } catch (messageError) {
                console.log('Content script not available, trying to inject...');
                
                // Try to inject content script manually
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js']
                    });
                    
                    await chrome.scripting.insertCSS({
                        target: { tabId: tab.id },
                        files: ['content.css']
                    });
                    
                    console.log('Content script injected successfully');
                    
                    // Try sending message again after injection
                    setTimeout(async () => {
                        try {
                            await chrome.tabs.sendMessage(tab.id, { 
                                action: 'enable-scanner' 
                            });
                        } catch (retryError) {
                            console.log('Still could not connect after injection:', retryError);
                        }
                    }, 100);
                    
                } catch (injectionError) {
                    console.log('Could not inject content script:', injectionError);
                    throw new Error('Não é possível ativar o CSS Scan nesta página');
                }
            }
            
        } catch (error) {
            console.log('Error enabling scanner:', error);
            throw error;
        }
    }

    async disableScanner(tab) {
        try {
            this.scannerStates.set(tab.id, false);
            this.updateIcon(false);
            this.updateBadge(false);
            
            console.log('Sending disable-scanner to tab:', tab.id);
            await chrome.tabs.sendMessage(tab.id, { 
                action: 'disable-scanner' 
            });
            
        } catch (error) {
            console.log('Error disabling scanner:', error);
            // Don't throw error, content script might not be ready
        }
    }

    updateIcon(isEnabled = false) {
        chrome.action.setTitle({
            title: isEnabled ? 'CSS Scan: Ativo (clique para desativar)' : 'CSS Scan: Inativo (clique para ativar)'
        });
    }

    updateBadge(isEnabled = false) {
        chrome.action.setBadgeText({
            text: isEnabled ? 'ON' : ''
        });
        
        chrome.action.setBadgeBackgroundColor({
            color: '#007bff'
        });
    }
}

// Initialize background script
const cssToolBackground = new CSSToolBackground();