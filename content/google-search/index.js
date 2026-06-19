(() => {
    const ext = globalThis.GestureExtension;
    const floating = ext.shared.floatingCore;

    const UI = {
        triggerSize: 36,
        panelOffset: 8,
        defaultPosition: { top: 130, left: 160 }
    };

    const FILTERS = [
        { name: 'Hour', unit: 'h', values: [1, 2, 3, 4, 6, 12] },
        { name: 'Day', unit: 'd', values: [1, 2, 3, 4, 5, 6, 7] },
        { name: 'Week', unit: 'w', values: [1, 2, 3, 4] },
        { name: 'Month', unit: 'm', values: [1, 2, 3, 6, 9, 12] },
        { name: 'Year', unit: 'y', values: [1, 2, 3, 4, 5] },
        { name: 'File', unit: 'file', values: ['PDF', 'DOC', 'XLS', 'PPT', 'TXT'] },
        { name: 'Tools', unit: 'tool', values: ['OCR'] }
    ];

    const posStorage = floating.createPositionStorage('gesture_google_search_position_v1', UI.defaultPosition);

    const createFilterPanel = ({ onApplyTime, onApplyFile }) => {
        const panel = document.createElement('div');
        panel.className = 'grid';

        FILTERS.forEach((filter) => {
            const header = document.createElement('div');
            header.className = 'header';
            header.textContent = filter.name;
            panel.appendChild(header);

            filter.values.forEach((value) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'cell';
                if (filter.unit === 'tool' && value === 'OCR') {
                    button.textContent = 'OCR';
                } else {
                    button.textContent = filter.unit === 'file' ? value : `${value}${filter.unit.toUpperCase()}`;
                }
                button.addEventListener('click', (event) => {
                    floating.stopFloatingEvent(event);
                    if (filter.unit === 'file') onApplyFile(value);
                    else if (filter.unit === 'tool' && value === 'OCR') {
                        ext.shared.toastCore.createToast('Di chuột vào ảnh để dùng OCR', event.clientX, event.clientY, 2000);
                    }
                    else onApplyTime(filter.unit, value);
                });
                panel.appendChild(button);
            });
        });

        return panel;
    };

    const isGoogleSearchPage = () => {
        const host = window.location.hostname.toLowerCase();
        return (host === 'www.google.com' || host === 'google.com') && /^https?:$/i.test(window.location.protocol);
    };

    ext.features.googleSearch = {
        shouldRun: ({ getConfig }) => {
            const config = getConfig();
            return isGoogleSearchPage() && config?.googleSearch?.enabled !== false;
        },
        init: ({ getConfig }) => {
            const configState = getConfig();
            if (configState?.googleSearch?.enabled === false) {
                return {
                    onConfigChange() { },
                    destroy() { }
                };
            }

            let config = { left: 0, top: 0, open: false };
            
            const triggerRef = floating.createTriggerElement({
                className: 'gesture-google-search-trigger',
                textContent: '🔍',
                hidden: true
            });

            const panelRef = floating.createPanelRoot({
                className: 'gesture-google-search-panel',
                hidden: true
            });

            const applyTimeFilter = (period, amount) => {
                const url = new URL(window.location.href);
                url.searchParams.set('tbs', `qdr:${period}${amount > 1 ? amount : ''}`);
                window.location.assign(url.toString());
            };

            const applyFileFilter = (type) => {
                const input = document.querySelector('textarea[name="q"], input[name="q"]');
                const url = new URL(window.location.href);
                const currentQuery = (input?.value || url.searchParams.get('q') || '').replace(/\s*filetype:\w+/gi, '').trim();
                url.searchParams.set('q', [currentQuery, `filetype:${String(type).toLowerCase()}`].filter(Boolean).join(' '));
                window.location.assign(url.toString());
            };

            const filterGrid = createFilterPanel({ onApplyTime: applyTimeFilter, onApplyFile: applyFileFilter });
            panelRef.element.appendChild(filterGrid);

            const updateUI = () => {
                triggerRef.setPosition(config.left, config.top);
                triggerRef.element.classList.toggle('is-active', config.open);
                
                if (config.open) {
                    panelRef.show('block');
                    const rect = triggerRef.element.getBoundingClientRect();
                    const pPos = floating.clampFixedPosition({
                        left: rect.left,
                        top: rect.bottom + UI.panelOffset,
                        width: panelRef.element.offsetWidth || 220,
                        height: panelRef.element.offsetHeight || 300
                    });
                    panelRef.setPosition(pPos.left, pPos.top);
                    panelRef.element.classList.add('is-visible');
                } else {
                    panelRef.hide();
                    panelRef.element.classList.remove('is-visible');
                }
            };

            const unbindDrag = floating.bindDragBehavior({
                target: triggerRef.element,
                getInitialPosition: () => ({ left: config.left, top: config.top }),
                onMove: ({ deltaX, deltaY, origin }) => {
                    const next = floating.clampFixedPosition({
                        left: origin.left + deltaX,
                        top: origin.top + deltaY,
                        width: UI.triggerSize,
                        height: UI.triggerSize,
                        margin: 8
                    });
                    config.left = next.left;
                    config.top = next.top;
                    triggerRef.element.classList.add('is-dragging');
                    updateUI();
                },
                onDragEnd: () => {
                    triggerRef.element.classList.remove('is-dragging');
                    posStorage.save(config.left, config.top);
                },
                onClick: () => {
                    config.open = !config.open;
                    updateUI();
                }
            });

            const unbindOutside = floating.bindOutsideClickGuard({
                isOpen: () => config.open,
                containsTarget: (t) => triggerRef.element.contains(t) || panelRef.element.contains(t),
                onOutside: () => { config.open = false; updateUI(); }
            });

            posStorage.load().then((pos) => {
                const initial = floating.clampFixedPosition({
                    left: pos.left,
                    top: pos.top,
                    width: UI.triggerSize,
                    height: UI.triggerSize,
                    margin: 8
                });
                config.left = initial.left;
                config.top = initial.top;
                triggerRef.show();
                updateUI();
            });

            return {
                onConfigChange() { },
                destroy() {
                    unbindDrag();
                    unbindOutside();
                    triggerRef.destroy();
                    panelRef.destroy();
                }
            };
        }
    };
})();
