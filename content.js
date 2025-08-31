// CSS Scan Tool - Content Script
class CSSScanner {
    constructor() {
        this.isEnabled = false;
        this.currentElement = null;
        this.highlightOverlay = null;
        this.panel = null;
        this.lastHoveredElement = null;
        this.selectedElements = new Set(); // Track multiple selected elements
        this.multiSelectMode = false;
        
        this.init();
    }

    init() {
        this.createHighlightOverlay();
        this.setupEventListeners();
        this.listenForMessages();
    }

    createHighlightOverlay() {
        this.highlightOverlay = document.createElement('div');
        this.highlightOverlay.className = 'css-scan-highlight';
        this.highlightOverlay.style.display = 'none';
        document.body.appendChild(this.highlightOverlay);
    }

    setupEventListeners() {
        document.addEventListener('mouseover', this.handleMouseOver.bind(this));
        document.addEventListener('mouseout', this.handleMouseOut.bind(this));
        
        // Use capture phase to intercept clicks BEFORE they reach target elements
        document.addEventListener('click', this.handleClick.bind(this), true);
        
        // Also prevent other interactive events during scanning
        document.addEventListener('mousedown', this.preventInteraction.bind(this), true);
        document.addEventListener('mouseup', this.preventInteraction.bind(this), true);
        document.addEventListener('touchstart', this.preventInteraction.bind(this), true);
        document.addEventListener('touchend', this.preventInteraction.bind(this), true);
        document.addEventListener('submit', this.preventInteraction.bind(this), true);
        
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
    }

    preventInteraction(event) {
        if (!this.isEnabled) return;
        
        const target = event.target;
        if (this.isCSSScanElement(target)) return;
        
        // Prevent all interactions that might navigate or submit
        if (event.type === 'submit' || 
            target.tagName === 'A' || 
            target.closest('a') ||
            target.type === 'submit' ||
            (target.tagName === 'BUTTON' && target.type !== 'button')) {
            
            console.log('Preventing interaction:', event.type, target.tagName);
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return false;
        }
    }

    listenForMessages() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.action) {
                case 'toggle-scanner':
                    this.toggle();
                    sendResponse({ enabled: this.isEnabled });
                    break;
                    
                case 'enable-scanner':
                    if (!this.isEnabled) {
                        this.toggle();
                    }
                    sendResponse({ enabled: this.isEnabled });
                    break;
                    
                case 'disable-scanner':
                    if (this.isEnabled) {
                        this.toggle();
                    }
                    sendResponse({ enabled: this.isEnabled });
                    break;
            }
        });

        // Notify background script that content script is ready
        this.syncWithBackground();
    }

    async syncWithBackground() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'scanner-ready' });
            if (response && response.shouldEnable && !this.isEnabled) {
                this.toggle();
            }
        } catch (error) {
            console.log('Could not sync with background script:', error);
        }
    }

    toggle() {
        this.isEnabled = !this.isEnabled;
        console.log('CSS Scanner toggled. Enabled:', this.isEnabled);
        
        document.body.classList.toggle('css-scan-disabled', !this.isEnabled);
        
        if (!this.isEnabled) {
            this.hideHighlight();
            this.hidePanel();
            this.removeScannerIndicator();
            console.log('Scanner disabled, hiding UI');
        } else {
            this.showScannerIndicator();
            console.log('Scanner enabled, ready to inspect elements');
        }
    }

    showScannerIndicator() {
        // Create a small indicator that the scanner is active
        if (!this.scannerIndicator) {
            this.scannerIndicator = document.createElement('div');
            this.scannerIndicator.id = 'css-scan-indicator';
            this.scannerIndicator.innerHTML = this.getScannerIndicatorText();
            this.scannerIndicator.style.cssText = `
                position: fixed !important;
                top: 10px !important;
                left: 50% !important;
                transform: translateX(-50%) !important;
                background: rgba(0, 123, 255, 0.9) !important;
                color: white !important;
                padding: 8px 16px !important;
                border-radius: 20px !important;
                font-size: 12px !important;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
                z-index: 2147483647 !important;
                pointer-events: none !important;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3) !important;
            `;
            document.body.appendChild(this.scannerIndicator);
        }
    }

    updateScannerIndicator() {
        if (this.scannerIndicator) {
            this.scannerIndicator.innerHTML = this.getScannerIndicatorText();
            
            // Update style for multi-select mode
            if (this.multiSelectMode) {
                this.scannerIndicator.style.background = 'rgba(40, 167, 69, 0.9) !important';
            } else {
                this.scannerIndicator.style.background = 'rgba(0, 123, 255, 0.9) !important';
            }
        }
    }

    getScannerIndicatorText() {
        let text = '🔍 CSS Scan Ativo';
        if (this.multiSelectMode) {
            text += ' | 🔄 Multi-seleção ATIVA';
        }
        if (this.selectedElements.size > 0) {
            text += ` | Selecionados: ${this.selectedElements.size}`;
        }
        text += ' | ESC para sair';
        return text;
    }

    removeScannerIndicator() {
        if (this.scannerIndicator) {
            this.scannerIndicator.remove();
            this.scannerIndicator = null;
        }
    }

    handleMouseOver(event) {
        if (!this.isEnabled) return;
        
        const target = event.target;
        if (this.isCSSScanElement(target)) return;
        
        // Debug: Log hover events occasionally
        if (Math.random() < 0.1) {
            console.log('Hovering element:', target.tagName, target.className);
        }
        
        this.currentElement = target;
        this.showHighlight(target);
        this.lastHoveredElement = target;
    }

    handleMouseOut(event) {
        if (!this.isEnabled) return;
        
        const target = event.target;
        const relatedTarget = event.relatedTarget;
        
        // Don't handle mouseout for CSS Scan elements
        if (this.isCSSScanElement(target)) return;
        
        // Don't hide if moving to a CSS Scan element
        if (relatedTarget && this.isCSSScanElement(relatedTarget)) return;
        
        // Keep highlight if moving to child element or related element
        if (relatedTarget && (target.contains(relatedTarget) || relatedTarget.contains(target))) {
            return;
        }
        
        // Hide highlight when actually leaving the element
        this.hideHighlight();
    }

    handleClick(event) {
        if (!this.isEnabled) {
            console.log('CSS Scanner not enabled');
            return;
        }
        
        const target = event.target;
        console.log('Click target:', target, target.tagName, target.className);
        
        if (this.isCSSScanElement(target)) {
            console.log('Target is CSS Scan element, ignoring');
            return;
        }
        
        // CRITICAL: Prevent ALL default behaviors when CSS Scanner is active
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        // Prevent form submissions
        if (target.tagName === 'FORM' || target.closest('form')) {
            console.log('Preventing form submission');
        }
        
        // Prevent link navigation
        if (target.tagName === 'A' || target.closest('a')) {
            console.log('Preventing link navigation');
        }
        
        // Prevent button actions
        if (target.tagName === 'BUTTON' || target.type === 'button' || target.type === 'submit') {
            console.log('Preventing button action');
        }
        
        console.log('Inspecting element:', target);
        this.inspectElement(target);
        
        return false; // Additional prevention
    }

    handleKeyDown(event) {
        if (!this.isEnabled) return;
        
        if (event.key === 'Escape') {
            // If panel is open, close it first, otherwise toggle scanner
            if (this.panel) {
                this.hidePanel();
            } else {
                this.toggle();
            }
        } else if (event.key === 'Control' || event.key === 'Meta') {
            // Enable multi-select mode when Ctrl/Cmd is held
            if (!this.multiSelectMode) {
                this.multiSelectMode = true;
                this.updateScannerIndicator();
            }
        }
    }

    handleKeyUp(event) {
        if (!this.isEnabled) return;
        
        if (event.key === 'Control' || event.key === 'Meta') {
            // Disable multi-select mode when Ctrl/Cmd is released
            if (this.multiSelectMode) {
                this.multiSelectMode = false;
                this.updateScannerIndicator();
            }
        }
    }

    isCSSScanElement(element) {
        // Check if element is part of CSS Scan interface
        if (element.closest('.css-scan-panel') || 
            element.classList.contains('css-scan-highlight') ||
            element.classList.contains('css-scan-backdrop') ||
            element.id === 'css-scan-live-preview' ||
            element.id === 'css-scan-indicator') {
            return true;
        }
        
        // Check if element has CSS Scan classes
        const cssClasses = element.className || '';
        if (typeof cssClasses === 'string' && cssClasses.includes('css-scan-')) {
            return true;
        }
        
        return false;
    }

    showHighlight(element) {
        const rect = element.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        this.highlightOverlay.style.display = 'block';
        this.highlightOverlay.style.left = (rect.left + scrollLeft) + 'px';
        this.highlightOverlay.style.top = (rect.top + scrollTop) + 'px';
        this.highlightOverlay.style.width = rect.width + 'px';
        this.highlightOverlay.style.height = rect.height + 'px';
    }

    hideHighlight() {
        this.highlightOverlay.style.display = 'none';
    }

    inspectElement(element) {
        if (this.multiSelectMode) {
            // Add/remove element from selection
            if (this.selectedElements.has(element)) {
                this.selectedElements.delete(element);
                this.removeElementHighlight(element);
            } else {
                this.selectedElements.add(element);
                this.addElementHighlight(element);
            }
            this.updateScannerIndicator();
            
            // Show panel with combined CSS if elements are selected
            if (this.selectedElements.size > 0) {
                this.showMultiElementPanel();
            }
        } else {
            // Single element inspection (default behavior)
            // Keep the blue highlight visible during inspection
            this.showPanel(element);
            this.extractCSS(element);
        }
    }

    showPanel(element) {
        // Remove existing panel if any
        this.hidePanel();

        try {
            // Create panel directly without backdrop
            this.panel = this.createPanel(element);
            
            // Add panel to DOM without backdrop
            document.body.appendChild(this.panel);
            
            // Position panel in a corner to avoid covering content
            this.positionPanel();
            
            // Focus management
            this.panel.focus();
            
        } catch (error) {
            console.error('Error creating panel:', error);
            this.panel = null;
        }
    }

    positionPanel() {
        if (!this.panel) return;
        
        try {
            // Position panel in top-right corner to avoid covering content
            this.panel.style.position = 'fixed';
            this.panel.style.top = '20px';
            this.panel.style.right = '20px';
            this.panel.style.left = 'auto';
            this.panel.style.transform = 'none';
            this.panel.style.maxHeight = 'calc(100vh - 40px)';
            this.panel.style.overflow = 'auto';
            
        } catch (error) {
            console.warn('Error positioning panel:', error);
        }
    }

    hidePanel() {
        // Clean up live preview when closing panel
        this.removeLivePreview();
        
        // Remove data attributes
        if (this.currentElement && this.currentElement.getAttribute('data-css-scan-target')) {
            this.currentElement.removeAttribute('data-css-scan-target');
        }
        
        // Remove panel
        if (this.panel) {
            document.body.removeChild(this.panel);
            this.panel = null;
        }
        
        // Remove backdrop (if exists)
        if (this.backdrop) {
            document.body.removeChild(this.backdrop);
            this.backdrop = null;
        }
        
        // Restore highlight functionality (don't force show, just allow normal hover behavior)
        // The CSS rule with :has() will automatically show/hide as needed
        
        this.currentElement = null;
    }

    createPanel(element) {
        const panel = document.createElement('div');
        panel.className = 'css-scan-panel';
        
        const tagName = element.tagName.toLowerCase();
        const className = element.className ? '.' + element.className.split(' ').join('.') : '';
        const id = element.id ? '#' + element.id : '';
        
        panel.innerHTML = `
            <div class="css-scan-header">
                <h3 class="css-scan-title">CSS Inspector</h3>
                <div class="css-scan-header-controls">
                    <button class="css-scan-toggle-edit" id="toggle-edit-btn" title="Ativar edição">✏️</button>
                    <button class="css-scan-close">×</button>
                </div>
            </div>
            <div class="css-scan-element-info">
                <span class="css-scan-tag">${tagName}</span>
                <span class="css-scan-class">${id}${className}</span>
            </div>
            <div class="css-scan-mode-tabs">
                <button class="css-scan-tab active" data-tab="view">👁️ Visualizar</button>
                <button class="css-scan-tab" data-tab="edit">✏️ Editar</button>
            </div>
            <div class="css-scan-content">
                <pre class="css-scan-code" id="css-view-mode">Carregando CSS...</pre>
                <div class="css-scan-editor" id="css-edit-mode" style="display: none;">
                    <textarea class="css-scan-textarea" placeholder="Cole seu CSS aqui ou edite o CSS extraído..."></textarea>
                    <div class="css-scan-editor-controls">
                        <button class="css-scan-btn css-scan-btn-small" id="css-apply-btn">Aplicar Mudanças</button>
                        <button class="css-scan-btn css-scan-btn-small css-scan-btn-secondary" id="css-reset-btn">Reset</button>
                    </div>
                </div>
            </div>
            <div class="css-scan-actions">
                <div class="css-scan-actions-row">
                    <button class="css-scan-btn" id="css-copy-btn">📋 Copiar CSS</button>
                    <button class="css-scan-btn css-scan-btn-secondary" id="css-copy-selector">🎯 Copiar Seletor</button>
                </div>
                <div class="css-scan-actions-row">
                    <button class="css-scan-btn css-scan-btn-export" id="css-export-codepen">🚀 Abrir no CodePen</button>
                    <button class="css-scan-btn css-scan-btn-export" id="css-export-file">💾 Salvar CSS</button>
                </div>
            </div>
        `;

        // Event listeners for panel
        panel.querySelector('.css-scan-close').addEventListener('click', () => {
            this.hidePanel();
        });

        // Tab switching
        panel.querySelectorAll('.css-scan-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTab(tab.dataset.tab);
            });
        });

        // Editor controls
        panel.querySelector('#css-apply-btn').addEventListener('click', () => {
            this.applyCSS();
        });

        panel.querySelector('#css-reset-btn').addEventListener('click', () => {
            this.resetCSS();
        });

        // Copy functions
        panel.querySelector('#css-copy-btn').addEventListener('click', () => {
            this.copyCSS();
        });

        panel.querySelector('#css-copy-selector').addEventListener('click', () => {
            this.copySelector(element);
        });

        // Export functions
        panel.querySelector('#css-export-codepen').addEventListener('click', () => {
            this.exportToCodePen();
        });

        panel.querySelector('#css-export-file').addEventListener('click', () => {
            this.exportToFile();
        });

        // Real-time editing toggle
        panel.querySelector('#toggle-edit-btn').addEventListener('click', () => {
            this.toggleLiveEditing();
        });

        // Real-time editing
        const textarea = panel.querySelector('.css-scan-textarea');
        textarea.addEventListener('input', () => {
            if (this.liveEditingEnabled) {
                clearTimeout(this.liveEditTimeout);
                this.liveEditTimeout = setTimeout(() => {
                    this.applyCSS(true); // true = live preview
                }, 300);
            }
        });

        return panel;
    }

    extractCSS(element) {
        try {
            const computedStyle = window.getComputedStyle(element);
            const css = this.optimizeCSS(computedStyle, element);
            
            // Extract pseudo-class styles
            const pseudoCSS = this.extractPseudoClassStyles(element);
            const finalCSS = css + (pseudoCSS ? '\n\n' + pseudoCSS : '');
            
            // Update view mode
            const codeElement = this.panel.querySelector('.css-scan-code');
            if (codeElement) {
                codeElement.textContent = finalCSS;
            }
            
            // Update editor mode
            const textarea = this.panel.querySelector('.css-scan-textarea');
            if (textarea && !textarea.value.trim()) {
                textarea.value = finalCSS;
            }
            
            this.currentCSS = finalCSS;
            this.originalCSS = finalCSS; // Store original for reset
            this.currentElement = element;
            this.liveEditingEnabled = false; // Start with live editing disabled
            
            // Update live editing button state
            const toggleBtn = this.panel.querySelector('#toggle-edit-btn');
            if (toggleBtn) {
                toggleBtn.textContent = '✏️';
                toggleBtn.title = 'Ativar edição ao vivo';
                toggleBtn.style.background = '';
            }
            
        } catch (error) {
            console.error('Error extracting CSS:', error);
            this.showCSSError('Erro ao extrair CSS');
        }
    }

    switchTab(tabName) {
        if (!this.panel) return;

        // Update tab buttons
        this.panel.querySelectorAll('.css-scan-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update content visibility
        const viewMode = this.panel.querySelector('#css-view-mode');
        const editMode = this.panel.querySelector('#css-edit-mode');

        if (tabName === 'edit') {
            viewMode.style.display = 'none';
            editMode.style.display = 'block';
            
            // Focus on textarea when switching to edit mode
            const textarea = editMode.querySelector('.css-scan-textarea');
            setTimeout(() => textarea.focus(), 100);
            
        } else {
            viewMode.style.display = 'block';
            editMode.style.display = 'none';
        }
    }

    applyCSS(isLivePreview = false) {
        if (!this.panel || !this.currentElement) return;

        try {
            const textarea = this.panel.querySelector('.css-scan-textarea');
            const cssText = textarea.value.trim();

            if (!cssText) {
                this.showApplyFeedback('CSS vazio', true);
                return;
            }

            // Parse and apply CSS
            this.applyCSSToElement(this.currentElement, cssText, isLivePreview);
            
            if (!isLivePreview) {
                this.showApplyFeedback('CSS aplicado!');
                this.currentCSS = cssText; // Update current CSS
            }

        } catch (error) {
            console.error('Error applying CSS:', error);
            this.showApplyFeedback('Erro ao aplicar CSS', true);
        }
    }

    applyCSSToElement(element, cssText, isLivePreview = false) {
        try {
            // Remove CSS comments and extract rules
            const cleanCSS = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
            
            // Simple CSS parser - extract properties between braces
            const rulesMatch = cleanCSS.match(/\{([^}]*)\}/);
            if (!rulesMatch) {
                throw new Error('CSS inválido - não foi possível encontrar propriedades');
            }

            const properties = rulesMatch[1].split(';');
            
            // Create or update style element for live preview
            if (isLivePreview) {
                this.createLivePreviewStyle(element, cssText);
            } else {
                // Apply directly to element style for permanent changes
                properties.forEach(prop => {
                    const [property, value] = prop.split(':').map(s => s.trim());
                    if (property && value) {
                        element.style.setProperty(property, value);
                    }
                });
            }

        } catch (error) {
            console.error('Error parsing/applying CSS:', error);
            throw error;
        }
    }

    createLivePreviewStyle(element, cssText) {
        try {
            // Generate unique selector for this element
            const uniqueSelector = this.generateUniqueSelector(element);
            
            // Remove existing live preview
            this.removeLivePreview();

            // Create new style element
            this.livePreviewStyle = document.createElement('style');
            this.livePreviewStyle.id = 'css-scan-live-preview';
            
            // Replace the selector in CSS with our unique selector
            const modifiedCSS = cssText.replace(/^[^{]*\{/, `${uniqueSelector} {`);
            this.livePreviewStyle.textContent = modifiedCSS;
            
            document.head.appendChild(this.livePreviewStyle);

        } catch (error) {
            console.error('Error creating live preview:', error);
        }
    }

    generateUniqueSelector(element) {
        // Generate a very specific selector using data attribute
        const uniqueId = 'css-scan-' + Date.now();
        element.setAttribute('data-css-scan-target', uniqueId);
        return `[data-css-scan-target="${uniqueId}"]`;
    }

    removeLivePreview() {
        if (this.livePreviewStyle) {
            this.livePreviewStyle.remove();
            this.livePreviewStyle = null;
        }
    }

    resetCSS() {
        if (!this.panel || !this.currentElement) return;

        try {
            // Reset textarea to original CSS
            const textarea = this.panel.querySelector('.css-scan-textarea');
            textarea.value = this.originalCSS || '';

            // Remove inline styles and live preview
            this.removeLivePreview();
            if (this.currentElement.getAttribute('data-css-scan-target')) {
                this.currentElement.removeAttribute('data-css-scan-target');
            }

            // Reset element's inline styles (if we applied any)
            this.currentElement.removeAttribute('style');

            this.showApplyFeedback('CSS resetado!');
            
        } catch (error) {
            console.error('Error resetting CSS:', error);
            this.showApplyFeedback('Erro ao resetar CSS', true);
        }
    }

    toggleLiveEditing() {
        try {
            this.liveEditingEnabled = !this.liveEditingEnabled;
            const btn = this.panel.querySelector('#toggle-edit-btn');
            
            if (this.liveEditingEnabled) {
                btn.textContent = '🔴';
                btn.title = 'Desativar edição ao vivo';
                btn.style.background = '#dc3545';
                this.showLiveEditingFeedback('Edição ao vivo ATIVADA', false);
            } else {
                btn.textContent = '✏️';
                btn.title = 'Ativar edição ao vivo';
                btn.style.background = '';
                this.removeLivePreview();
                this.showLiveEditingFeedback('Edição ao vivo DESATIVADA', false);
            }
        } catch (error) {
            console.error('Error toggling live editing:', error);
        }
    }

    showLiveEditingFeedback(message, isError = false) {
        try {
            // Show feedback in the editor controls area
            const controls = this.panel.querySelector('.css-scan-editor-controls');
            if (!controls) return;
            
            // Remove existing feedback
            const existingFeedback = controls.querySelector('.live-editing-feedback');
            if (existingFeedback) {
                existingFeedback.remove();
            }
            
            // Create feedback element
            const feedback = document.createElement('div');
            feedback.className = 'live-editing-feedback';
            feedback.textContent = message;
            feedback.style.cssText = `
                color: ${isError ? '#dc3545' : '#28a745'} !important;
                font-size: 11px !important;
                padding: 4px 8px !important;
                background: ${isError ? 'rgba(220, 53, 69, 0.1)' : 'rgba(40, 167, 69, 0.1)'} !important;
                border-radius: 3px !important;
                margin-left: auto !important;
            `;
            
            controls.appendChild(feedback);
            
            // Remove after delay
            setTimeout(() => {
                if (feedback.parentNode) {
                    feedback.remove();
                }
            }, 3000);
            
        } catch (error) {
            console.error('Error showing live editing feedback:', error);
        }
    }

    showApplyFeedback(message, isError = false) {
        try {
            const btn = this.panel.querySelector('#css-apply-btn');
            if (!btn) return;
            
            const originalText = btn.textContent;
            const originalBg = btn.style.background || '#007bff';
            
            btn.textContent = message;
            btn.style.background = isError ? '#dc3545' : '#28a745';
            
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = originalBg;
            }, isError ? 2500 : 1500);
            
        } catch (error) {
            console.error('Error showing apply feedback:', error);
        }
    }

    exportToCodePen() {
        if (!this.currentElement || !this.currentCSS) {
            this.showExportFeedback('Nenhum CSS para exportar', true, 'codepen');
            return;
        }

        try {
            // Generate HTML mockup of the element
            const htmlMockup = this.generateHTMLMockup(this.currentElement);
            const cssCode = this.getCurrentCSS();
            
            // Create CodePen data
            const codepenData = {
                title: `CSS Scan - ${this.generateSelector(this.currentElement)}`,
                description: `CSS extraído com CSS Scan Tool do elemento: ${this.generateSelector(this.currentElement)}`,
                html: htmlMockup,
                css: cssCode,
                js: '',
                css_external: '',
                js_external: '',
                css_pre_processor: 'none',
                js_pre_processor: 'none',
                html_pre_processor: 'none',
                css_starter: 'neither',
                js_starter: 'neither',
                tags: ['css-scan', 'css', 'extracted'],
                private: false
            };

            // Create form and submit to CodePen
            this.submitToCodePen(codepenData);
            this.showExportFeedback('Abrindo no CodePen...', false, 'codepen');

        } catch (error) {
            console.error('Error exporting to CodePen:', error);
            this.showExportFeedback('Erro ao exportar', true, 'codepen');
        }
    }

    generateHTMLMockup(element) {
        try {
            const tagName = element.tagName.toLowerCase();
            const textContent = this.getElementText(element);
            const attributes = this.getRelevantAttributes(element);
            
            // Create a simplified HTML mockup
            let html = `<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>CSS Scan Extract</title>\n</head>\n<body>\n\n`;
            
            // Add element mockup
            html += `  <${tagName}${attributes}>\n`;
            html += `    ${textContent || 'Conteúdo do elemento'}\n`;
            html += `  </${tagName}>\n\n`;
            
            html += `</body>\n</html>`;
            
            return html;
            
        } catch (error) {
            console.error('Error generating HTML mockup:', error);
            return `<div class="extracted-element">Elemento extraído com CSS Scan</div>`;
        }
    }

    getElementText(element) {
        try {
            // Get meaningful text content, avoiding scripts and styles
            let text = '';
            
            if (element.tagName === 'IMG') {
                text = element.alt || 'Imagem';
            } else if (element.tagName === 'INPUT') {
                text = element.placeholder || element.value || 'Input field';
            } else if (element.tagName === 'BUTTON') {
                text = element.textContent || 'Botão';
            } else if (element.textContent && element.textContent.trim()) {
                text = element.textContent.trim().substring(0, 100);
                if (text.length === 100) text += '...';
            } else {
                text = `${element.tagName.toLowerCase()} element`;
            }
            
            return text;
            
        } catch (error) {
            return 'Elemento';
        }
    }

    getRelevantAttributes(element) {
        try {
            let attributes = '';
            
            // Add class if exists
            if (element.className && typeof element.className === 'string') {
                const cleanClasses = element.className.split(' ')
                    .filter(c => c.trim() && !c.startsWith('css-scan'))
                    .slice(0, 3) // Limit classes
                    .join(' ');
                
                if (cleanClasses) {
                    attributes += ` class="${cleanClasses}"`;
                }
            }
            
            // Add id if exists
            if (element.id && !element.id.startsWith('css-scan')) {
                attributes += ` id="${element.id}"`;
            }
            
            return attributes;
            
        } catch (error) {
            return '';
        }
    }

    getCurrentCSS() {
        // Get CSS from editor if in edit mode, otherwise use extracted CSS
        try {
            const activeTab = this.panel.querySelector('.css-scan-tab.active');
            if (activeTab && activeTab.dataset.tab === 'edit') {
                const textarea = this.panel.querySelector('.css-scan-textarea');
                return textarea.value.trim() || this.currentCSS;
            }
            return this.currentCSS;
        } catch (error) {
            return this.currentCSS || '';
        }
    }

    submitToCodePen(data) {
        try {
            // Create a form to submit to CodePen
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = 'https://codepen.io/pen/define';
            form.target = '_blank';
            form.style.display = 'none';

            // Add data as JSON
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'data';
            input.value = JSON.stringify(data);

            form.appendChild(input);
            document.body.appendChild(form);

            // Submit and remove form
            form.submit();
            document.body.removeChild(form);

        } catch (error) {
            console.error('Error submitting to CodePen:', error);
            throw error;
        }
    }

    exportToFile() {
        if (!this.currentCSS) {
            this.showExportFeedback('Nenhum CSS para exportar', true, 'file');
            return;
        }

        try {
            const cssCode = this.getCurrentCSS();
            const filename = this.generateFileName();
            
            // Create downloadable CSS file
            const cssWithComments = this.addFileHeader(cssCode);
            
            // Create blob and download
            const blob = new Blob([cssWithComments], { type: 'text/css' });
            const url = URL.createObjectURL(blob);
            
            // Create download link
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.style.display = 'none';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up URL
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            
            this.showExportFeedback('Arquivo baixado!', false, 'file');

        } catch (error) {
            console.error('Error exporting to file:', error);
            this.showExportFeedback('Erro ao baixar arquivo', true, 'file');
        }
    }

    generateFileName() {
        try {
            const selector = this.generateSelector(this.currentElement);
            const timestamp = new Date().toISOString().slice(0, 10);
            
            // Clean selector for filename
            const cleanSelector = selector
                .replace(/[#\.]/g, '')
                .replace(/[^a-zA-Z0-9_-]/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '')
                .substring(0, 30);
            
            return `css-scan-${cleanSelector || 'element'}-${timestamp}.css`;
            
        } catch (error) {
            return `css-scan-${Date.now()}.css`;
        }
    }

    addFileHeader(cssCode) {
        const selector = this.generateSelector(this.currentElement);
        const timestamp = new Date().toLocaleString();
        const url = window.location.href;
        
        return `/*
 * CSS extraído com CSS Scan Tool
 * 
 * Elemento: ${selector}
 * URL: ${url}
 * Data: ${timestamp}
 * 
 * Gerado automaticamente - ajuste conforme necessário
 */

${cssCode}`;
    }

    showExportFeedback(message, isError = false, exportType = 'general') {
        try {
            const btnId = exportType === 'codepen' ? '#css-export-codepen' : '#css-export-file';
            const btn = this.panel.querySelector(btnId);
            if (!btn) return;
            
            const originalText = btn.textContent;
            const originalBg = btn.style.background || '#007bff';
            
            btn.textContent = message;
            btn.style.background = isError ? '#dc3545' : '#28a745';
            
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = originalBg;
            }, isError ? 2500 : 2000);
            
        } catch (error) {
            console.error('Error showing export feedback:', error);
        }
    }

    showCSSError(message) {
        const codeElement = this.panel.querySelector('.css-scan-code');
        codeElement.textContent = `/* ${message} */\n\n/* Tentando extrair informações básicas... */\n\n${this.getBasicElementInfo(this.currentElement)}`;
    }

    getBasicElementInfo(element) {
        if (!element) return '/* Elemento não disponível */';
        
        try {
            const tagName = element.tagName.toLowerCase();
            const className = element.className || '';
            const id = element.id || '';
            
            let basicInfo = `${tagName}`;
            if (id) basicInfo += `#${id}`;
            if (className) basicInfo += `.${className.split(' ').join('.')}`;
            basicInfo += ' {\n';
            
            // Get basic properties that usually work
            const rect = element.getBoundingClientRect();
            basicInfo += `  /* Element dimensions */\n`;
            basicInfo += `  width: ${rect.width}px;\n`;
            basicInfo += `  height: ${rect.height}px;\n`;
            basicInfo += `  top: ${rect.top}px;\n`;
            basicInfo += `  left: ${rect.left}px;\n`;
            
            basicInfo += '}';
            return basicInfo;
            
        } catch (error) {
            return '/* Erro ao obter informações básicas do elemento */';
        }
    }

    optimizeCSS(computedStyle, element) {
        try {
            const relevantProperties = [
                // Layout
                'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
                
                // Size
                'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
                'box-sizing',
                
                // Spacing
                'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
                'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
                
                // Borders
                'border', 'border-width', 'border-style', 'border-color', 'border-radius',
                'border-top', 'border-right', 'border-bottom', 'border-left',
                
                // Background
                'background', 'background-color', 'background-image', 'background-size', 
                'background-position', 'background-repeat', 'background-attachment',
                
                // Typography
                'color', 'font-family', 'font-size', 'font-weight', 'font-style',
                'line-height', 'text-align', 'text-decoration', 'text-transform',
                'letter-spacing', 'word-spacing', 'white-space',
                
                // Visual effects
                'opacity', 'visibility', 'overflow', 'overflow-x', 'overflow-y',
                'cursor', 'transform', 'transition', 'animation',
                'box-shadow', 'text-shadow', 'filter',
                
                // Flexbox
                'flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items',
                'align-content', 'flex-grow', 'flex-shrink', 'flex-basis',
                
                // Grid
                'grid', 'grid-template-columns', 'grid-template-rows', 'grid-gap',
                'grid-column', 'grid-row', 'justify-items', 'align-items'
            ];

            const selector = this.generateSelector(element);
            let css = `${selector} {\n`;
            let hasProperties = false;
            
            // Extract properties with error handling for each
            relevantProperties.forEach(prop => {
                try {
                    const value = computedStyle.getPropertyValue(prop);
                    if (this.isValidCSSValue(prop, value)) {
                        css += `  ${prop}: ${value};\n`;
                        hasProperties = true;
                    }
                } catch (propError) {
                    console.warn(`Error getting property ${prop}:`, propError);
                }
            });

            // If no properties were found, add basic information
            if (!hasProperties) {
                css += this.getMinimalCSS(element);
            }

            css += '}';
            return css;
            
        } catch (error) {
            console.error('Error in optimizeCSS:', error);
            return this.getFallbackCSS(element);
        }
    }

    isValidCSSValue(prop, value) {
        if (!value || value === '' || value === 'initial' || value === 'inherit') {
            return false;
        }

        // Skip obvious default values
        if (this.isDefaultValue(prop, value)) {
            return false;
        }

        // Skip very common default values that don't add value
        const skipValues = ['auto', 'normal', 'none', '0px', 'static', 'visible', 'transparent'];
        if (skipValues.includes(value)) {
            return false;
        }

        return true;
    }

    getMinimalCSS(element) {
        try {
            const rect = element.getBoundingClientRect();
            let css = '';
            css += `  /* Dimensões computadas */\n`;
            css += `  width: ${Math.round(rect.width)}px;\n`;
            css += `  height: ${Math.round(rect.height)}px;\n`;
            
            // Try to get basic styles that usually work
            const computedStyle = window.getComputedStyle(element);
            const safeProperties = ['color', 'background-color', 'font-size', 'display'];
            
            safeProperties.forEach(prop => {
                try {
                    const value = computedStyle.getPropertyValue(prop);
                    if (value && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
                        css += `  ${prop}: ${value};\n`;
                    }
                } catch (e) {
                    // Skip this property if it fails
                }
            });

            return css;
        } catch (error) {
            return '  /* Erro ao obter propriedades mínimas */\n';
        }
    }

    getFallbackCSS(element) {
        try {
            const tagName = element.tagName.toLowerCase();
            const selector = this.generateSelector(element);
            
            return `${selector} {
  /* Fallback CSS - computedStyle não disponível */
  display: ${element.style.display || 'block'};
  /* Tag: ${tagName} */
  /* Classes: ${element.className || 'nenhuma'} */
  /* ID: ${element.id || 'nenhum'} */
}`;
        } catch (error) {
            return `/* Erro crítico ao extrair CSS do elemento */`;
        }
    }

    isDefaultValue(prop, value) {
        const defaults = {
            'margin': '0px',
            'padding': '0px',
            'border': 'none',
            'background': 'none',
            'opacity': '1',
            'z-index': 'auto'
        };

        return defaults[prop] === value;
    }

    extractPseudoClassStyles(element) {
        try {
            const selector = this.generateSelector(element);
            let pseudoCSS = '';
            
            // Common pseudo-classes to check
            const pseudoClasses = ['hover', 'focus', 'active', 'visited', 'disabled', 'checked'];
            
            pseudoClasses.forEach(pseudo => {
                try {
                    // Temporarily add the pseudo-class by simulating the state
                    const pseudoStyles = this.getPseudoClassStyles(element, pseudo);
                    if (pseudoStyles && pseudoStyles.trim()) {
                        pseudoCSS += `${selector}:${pseudo} {\n${pseudoStyles}\n}\n\n`;
                    }
                } catch (pseudoError) {
                    console.warn(`Error extracting ${pseudo} styles:`, pseudoError);
                }
            });
            
            return pseudoCSS.trim();
        } catch (error) {
            console.warn('Error extracting pseudo-class styles:', error);
            return '';
        }
    }

    getPseudoClassStyles(element, pseudoClass) {
        try {
            // Create a temporary element to test pseudo-class styles
            const testElement = element.cloneNode(true);
            testElement.style.cssText = '';
            
            // Apply pseudo-class simulation
            switch (pseudoClass) {
                case 'hover':
                    // Simulate hover by checking if there are hover styles in stylesheets
                    return this.getStylesFromStylesheets(element, pseudoClass);
                    
                case 'focus':
                    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'BUTTON' || element.tabIndex >= 0) {
                        return this.getStylesFromStylesheets(element, pseudoClass);
                    }
                    break;
                    
                case 'active':
                    return this.getStylesFromStylesheets(element, pseudoClass);
                    
                case 'visited':
                    if (element.tagName === 'A') {
                        return this.getStylesFromStylesheets(element, pseudoClass);
                    }
                    break;
                    
                case 'disabled':
                    if (element.disabled !== undefined) {
                        return this.getStylesFromStylesheets(element, pseudoClass);
                    }
                    break;
                    
                case 'checked':
                    if (element.type === 'checkbox' || element.type === 'radio') {
                        return this.getStylesFromStylesheets(element, pseudoClass);
                    }
                    break;
            }
            
            return '';
        } catch (error) {
            console.warn(`Error getting ${pseudoClass} styles:`, error);
            return '';
        }
    }

    getStylesFromStylesheets(element, pseudoClass) {
        try {
            const selector = this.generateSelector(element);
            let pseudoStyles = '';
            
            // Check all stylesheets for matching pseudo-class rules
            Array.from(document.styleSheets).forEach(sheet => {
                try {
                    if (sheet.cssRules) {
                        Array.from(sheet.cssRules).forEach(rule => {
                            if (rule.type === CSSRule.STYLE_RULE) {
                                const ruleSelector = rule.selectorText;
                                
                                // Check if this rule matches our element with the pseudo-class
                                if (ruleSelector && ruleSelector.includes(`:${pseudoClass}`) && 
                                    this.selectorMatchesElement(ruleSelector, element, pseudoClass)) {
                                    
                                    // Extract relevant properties from this rule
                                    const relevantProps = this.extractRelevantProperties(rule.style);
                                    if (relevantProps) {
                                        pseudoStyles += relevantProps;
                                    }
                                }
                            }
                        });
                    }
                } catch (sheetError) {
                    // Ignore CORS errors from external stylesheets
                }
            });
            
            return pseudoStyles.trim();
        } catch (error) {
            console.warn('Error getting styles from stylesheets:', error);
            return '';
        }
    }

    selectorMatchesElement(ruleSelector, element, pseudoClass) {
        try {
            // Remove the pseudo-class from the selector to test base match
            const baseSelector = ruleSelector.replace(`:${pseudoClass}`, '');
            
            // Simple matching - check if the element would match the base selector
            try {
                return element.matches(baseSelector);
            } catch (e) {
                // Fallback to basic string matching
                const elementSelector = this.generateSelector(element);
                return baseSelector.includes(elementSelector) || elementSelector.includes(baseSelector);
            }
        } catch (error) {
            return false;
        }
    }

    extractRelevantProperties(style) {
        try {
            let props = '';
            const relevantProps = [
                'color', 'background-color', 'background', 'border', 'border-color',
                'box-shadow', 'text-decoration', 'opacity', 'transform', 'transition'
            ];
            
            relevantProps.forEach(prop => {
                const value = style.getPropertyValue(prop);
                if (value && value !== 'initial' && value !== 'inherit' && value.trim()) {
                    props += `  ${prop}: ${value};\n`;
                }
            });
            
            return props;
        } catch (error) {
            return '';
        }
    }

    addElementHighlight(element) {
        try {
            // Create a permanent highlight for selected elements
            const highlight = document.createElement('div');
            highlight.className = 'css-scan-multi-highlight';
            highlight.style.cssText = `
                position: absolute !important;
                pointer-events: none !important;
                z-index: 999 !important;
                border: 2px solid #28a745 !important;
                background: rgba(40, 167, 69, 0.1) !important;
                border-radius: 3px !important;
                box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.8) !important;
            `;
            
            // Position the highlight
            const rect = element.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
            
            highlight.style.left = (rect.left + scrollLeft) + 'px';
            highlight.style.top = (rect.top + scrollTop) + 'px';
            highlight.style.width = rect.width + 'px';
            highlight.style.height = rect.height + 'px';
            
            // Store reference to remove later
            element.cssScannMultiHighlight = highlight;
            document.body.appendChild(highlight);
            
        } catch (error) {
            console.warn('Error adding element highlight:', error);
        }
    }

    removeElementHighlight(element) {
        try {
            if (element.cssScannMultiHighlight) {
                element.cssScannMultiHighlight.remove();
                delete element.cssScannMultiHighlight;
            }
        } catch (error) {
            console.warn('Error removing element highlight:', error);
        }
    }

    clearAllElementHighlights() {
        this.selectedElements.forEach(element => {
            this.removeElementHighlight(element);
        });
        this.selectedElements.clear();
        this.updateScannerIndicator();
    }

    showMultiElementPanel() {
        try {
            // Remove existing panel if any
            this.hidePanel();

            // Create panel for multiple elements without backdrop
            this.panel = this.createMultiElementPanel();
            
            document.body.appendChild(this.panel);
            
            // Position panel in corner
            this.positionPanel();
            
            // Extract and show combined CSS
            this.extractMultiElementCSS();
            
            this.panel.focus();
            
        } catch (error) {
            console.error('Error creating multi-element panel:', error);
            this.panel = null;
        }
    }

    createMultiElementPanel() {
        const panel = document.createElement('div');
        panel.className = 'css-scan-panel';
        
        panel.innerHTML = `
            <div class="css-scan-header">
                <h3 class="css-scan-title">Multi-Element CSS Inspector (${this.selectedElements.size} elementos)</h3>
                <div class="css-scan-header-controls">
                    <button class="css-scan-btn-small" id="clear-selection-btn" title="Limpar seleção">🗑️ Limpar</button>
                    <button class="css-scan-close">×</button>
                </div>
            </div>
            <div class="css-scan-element-info">
                <span class="css-scan-tag">Multi-selection</span>
                <span class="css-scan-class">${this.selectedElements.size} elementos selecionados</span>
            </div>
            <div class="css-scan-mode-tabs">
                <button class="css-scan-tab active" data-tab="view">👁️ Visualizar</button>
                <button class="css-scan-tab" data-tab="edit">✏️ Editar</button>
            </div>
            <div class="css-scan-content">
                <pre class="css-scan-code" id="css-view-mode">Carregando CSS...</pre>
                <div class="css-scan-editor" id="css-edit-mode" style="display: none;">
                    <textarea class="css-scan-textarea" placeholder="Cole seu CSS aqui ou edite o CSS extraído..."></textarea>
                    <div class="css-scan-editor-controls">
                        <button class="css-scan-btn css-scan-btn-small" id="css-apply-btn">Aplicar a Todos</button>
                        <button class="css-scan-btn css-scan-btn-small css-scan-btn-secondary" id="css-reset-btn">Reset</button>
                    </div>
                </div>
            </div>
            <div class="css-scan-actions">
                <div class="css-scan-actions-row">
                    <button class="css-scan-btn" id="css-copy-btn">📋 Copiar CSS</button>
                    <button class="css-scan-btn css-scan-btn-secondary" id="css-copy-selector">🎯 Copiar Seletores</button>
                </div>
                <div class="css-scan-actions-row">
                    <button class="css-scan-btn css-scan-btn-export" id="css-export-codepen">🚀 Abrir no CodePen</button>
                    <button class="css-scan-btn css-scan-btn-export" id="css-export-file">💾 Salvar CSS</button>
                </div>
            </div>
        `;

        // Event listeners for panel
        panel.querySelector('.css-scan-close').addEventListener('click', () => {
            this.hidePanel();
        });

        panel.querySelector('#clear-selection-btn').addEventListener('click', () => {
            this.clearAllElementHighlights();
            this.hidePanel();
        });

        // Tab switching
        panel.querySelectorAll('.css-scan-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTab(tab.dataset.tab);
            });
        });

        // Copy functions
        panel.querySelector('#css-copy-btn').addEventListener('click', () => {
            this.copyCSS();
        });

        panel.querySelector('#css-copy-selector').addEventListener('click', () => {
            this.copyMultiSelectors();
        });

        return panel;
    }

    extractMultiElementCSS() {
        try {
            let combinedCSS = '';
            let elementIndex = 1;
            
            this.selectedElements.forEach(element => {
                try {
                    const computedStyle = window.getComputedStyle(element);
                    const css = this.optimizeCSS(computedStyle, element);
                    const pseudoCSS = this.extractPseudoClassStyles(element);
                    
                    combinedCSS += `/* Elemento ${elementIndex}: ${this.generateSelector(element)} */\n`;
                    combinedCSS += css;
                    
                    if (pseudoCSS) {
                        combinedCSS += '\n\n' + pseudoCSS;
                    }
                    
                    combinedCSS += '\n\n';
                    elementIndex++;
                    
                } catch (error) {
                    console.warn(`Error extracting CSS for element ${elementIndex}:`, error);
                    combinedCSS += `/* Erro ao extrair CSS do elemento ${elementIndex} */\n\n`;
                    elementIndex++;
                }
            });
            
            // Update view mode
            const codeElement = this.panel.querySelector('.css-scan-code');
            if (codeElement) {
                codeElement.textContent = combinedCSS.trim();
            }
            
            // Update editor mode
            const textarea = this.panel.querySelector('.css-scan-textarea');
            if (textarea && !textarea.value.trim()) {
                textarea.value = combinedCSS.trim();
            }
            
            this.currentCSS = combinedCSS.trim();
            this.originalCSS = combinedCSS.trim();
            
        } catch (error) {
            console.error('Error extracting multi-element CSS:', error);
            this.showCSSError('Erro ao extrair CSS dos elementos selecionados');
        }
    }

    copyMultiSelectors() {
        try {
            const selectors = Array.from(this.selectedElements)
                .map(element => this.generateSelector(element))
                .join(',\n');
            
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(selectors).then(() => {
                    this.showCopyFeedback('Seletores copiados!');
                }).catch(() => {
                    this.fallbackCopyToClipboard(selectors, 'Seletores copiados!');
                });
            } else {
                this.fallbackCopyToClipboard(selectors, 'Seletores copiados!');
            }
        } catch (error) {
            console.error('Error copying selectors:', error);
            this.showCopyFeedback('Erro ao copiar seletores', true);
        }
    }

    generateSelector(element) {
        try {
            if (!element || !element.tagName) {
                return '.unknown-element';
            }

            let selector = element.tagName.toLowerCase();
            
            // Priority 1: ID (most specific)
            if (element.id && element.id.trim()) {
                const cleanId = element.id.trim().replace(/[^a-zA-Z0-9_-]/g, '');
                if (cleanId) {
                    return '#' + cleanId;
                }
            }
            
            // Priority 2: Class names (specific but not unique)
            if (element.className && typeof element.className === 'string') {
                const classes = element.className.split(' ')
                    .map(c => c.trim())
                    .filter(c => c && c.length > 0)
                    .filter(c => !c.startsWith('css-scan')) // Skip our own classes
                    .slice(0, 3); // Limit to first 3 classes to avoid overly long selectors
                    
                if (classes.length > 0) {
                    const cleanClasses = classes
                        .map(c => c.replace(/[^a-zA-Z0-9_-]/g, ''))
                        .filter(c => c);
                    
                    if (cleanClasses.length > 0) {
                        selector += '.' + cleanClasses.join('.');
                    }
                }
            }
            
            // Priority 3: Add nth-child if selector might not be unique enough
            if (!element.id) {
                const parent = element.parentElement;
                if (parent) {
                    const siblings = Array.from(parent.children);
                    const sameTagSiblings = siblings.filter(el => 
                        el.tagName.toLowerCase() === element.tagName.toLowerCase()
                    );
                    
                    if (sameTagSiblings.length > 1) {
                        const index = sameTagSiblings.indexOf(element) + 1;
                        selector += `:nth-of-type(${index})`;
                    }
                }
            }

            return selector || '.unknown-element';
            
        } catch (error) {
            console.warn('Error generating selector:', error);
            try {
                return element.tagName ? element.tagName.toLowerCase() : '.error-element';
            } catch (fallbackError) {
                return '.error-element';
            }
        }
    }

    copyCSS() {
        try {
            const cssToCopy = this.currentCSS || this.getFallbackCSS(this.currentElement);
            
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(cssToCopy).then(() => {
                    this.showCopyFeedback('CSS copiado!');
                }).catch((error) => {
                    console.warn('Clipboard API failed, trying fallback:', error);
                    this.fallbackCopyToClipboard(cssToCopy, 'CSS copiado!');
                });
            } else {
                this.fallbackCopyToClipboard(cssToCopy, 'CSS copiado!');
            }
        } catch (error) {
            console.error('Error copying CSS:', error);
            this.showCopyFeedback('Erro ao copiar CSS', true);
        }
    }

    copySelector(element) {
        try {
            const selector = this.generateSelector(element || this.currentElement);
            
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(selector).then(() => {
                    this.showCopyFeedback('Seletor copiado!');
                }).catch((error) => {
                    console.warn('Clipboard API failed, trying fallback:', error);
                    this.fallbackCopyToClipboard(selector, 'Seletor copiado!');
                });
            } else {
                this.fallbackCopyToClipboard(selector, 'Seletor copiado!');
            }
        } catch (error) {
            console.error('Error copying selector:', error);
            this.showCopyFeedback('Erro ao copiar seletor', true);
        }
    }

    fallbackCopyToClipboard(text, successMessage) {
        try {
            // Create a temporary textarea element
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            textarea.style.pointerEvents = 'none';
            
            document.body.appendChild(textarea);
            textarea.select();
            textarea.setSelectionRange(0, textarea.value.length);
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textarea);
            
            if (successful) {
                this.showCopyFeedback(successMessage);
            } else {
                this.showCopyFeedback('Erro ao copiar', true);
            }
        } catch (error) {
            console.error('Fallback copy failed:', error);
            this.showCopyFeedback('Erro ao copiar', true);
        }
    }

    showCopyFeedback(message, isError = false) {
        try {
            const btn = this.panel.querySelector('#css-copy-btn');
            if (!btn) return;
            
            const originalText = btn.textContent;
            const originalBg = btn.style.background || '#007bff';
            
            btn.textContent = message;
            btn.style.background = isError ? '#dc3545' : '#28a745';
            
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = originalBg;
            }, isError ? 2500 : 1500);
            
        } catch (error) {
            console.error('Error showing copy feedback:', error);
        }
    }
}

// Initialize CSS Scanner
const cssScanner = new CSSScanner();

// Expose to global scope for debugging
window.cssScanner = cssScanner;