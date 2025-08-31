document.addEventListener('DOMContentLoaded', function() {
    const toggleBtn = document.getElementById('toggleBtn');
    const toggleText = document.getElementById('toggleText');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const instructions = document.getElementById('instructions');
    
    let isEnabled = false;

    // Initialize popup state
    initializePopup();

    // Toggle button event listener
    toggleBtn.addEventListener('click', function() {
        toggleScanner();
    });

    async function initializePopup() {
        try {
            // Get current scanner status
            const response = await chrome.runtime.sendMessage({ action: 'get-status' });
            updateUI(response.enabled);
        } catch (error) {
            console.log('Error getting status:', error);
            updateUI(false);
        }
    }

    async function toggleScanner() {
        try {
            // Get current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                showError('Nenhuma aba ativa encontrada');
                return;
            }

            // Debug: Show tab URL
            console.log('Current tab URL:', tab.url);

            // Show loading state
            statusText.textContent = 'Conectando...';
            toggleBtn.disabled = true;

            // Send message to background script to toggle scanner
            const action = isEnabled ? 'disable-scanner' : 'enable-scanner';
            console.log('Sending action:', action);
            
            const response = await chrome.runtime.sendMessage({ action });
            console.log('Response:', response);
            
            if (response && response.error) {
                throw new Error(response.error);
            }
            
            if (!response) {
                throw new Error('Nenhuma resposta do background script');
            }
            
            updateUI(response.enabled);
            
            // Show feedback
            showFeedback(response.enabled ? 'Scanner ativado!' : 'Scanner desativado!');
            
        } catch (error) {
            console.error('Error toggling scanner:', error);
            showError('Erro: ' + error.message);
        } finally {
            toggleBtn.disabled = false;
        }
    }

    function updateUI(enabled) {
        isEnabled = enabled;
        
        // Update button
        if (enabled) {
            toggleBtn.classList.add('active');
            toggleText.textContent = 'Desativar Scanner';
            statusDot.classList.add('active');
            statusText.textContent = 'Ativo - Hover nos elementos';
            instructions.style.display = 'none';
        } else {
            toggleBtn.classList.remove('active');
            toggleText.textContent = 'Ativar Scanner';
            statusDot.classList.remove('active');
            statusText.textContent = 'Inativo';
            instructions.style.display = 'block';
        }
    }

    function showFeedback(message) {
        const originalText = statusText.textContent;
        statusText.textContent = message;
        statusText.style.color = '#28a745';
        
        setTimeout(() => {
            statusText.textContent = originalText;
            statusText.style.color = '';
        }, 2000);
    }

    function showError(message) {
        const originalText = statusText.textContent;
        statusText.textContent = message;
        statusText.style.color = '#dc3545';
        
        setTimeout(() => {
            statusText.textContent = originalText;
            statusText.style.color = '';
        }, 3000);
    }

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'scanner-status-changed') {
            updateUI(message.enabled);
        }
    });
});